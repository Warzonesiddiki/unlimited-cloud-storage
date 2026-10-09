// The coin-collection state machine. Pure logic: all I/O is injected
// (api, store, log, sleep), so it can be tested without Chrome or the network.

export const DAILY_LIMIT_ERRNO = 28135;
export const DAILY_LIMIT_MESSAGE = 'gold miner up to limit today';
export const MAX_CONSECUTIVE_FAILURES = 5;

export class DailyLimitError extends Error {
    constructor() {
        super('Daily limit reached');
        this.name = 'DailyLimitError';
    }
}

export function createCollector({
    api,            // { start(), getItem(gameId, objectType), finish(gameId) } -> parsed JSON
    store,          // { get(key), set(obj) }
    log,            // async (message) => void
    sleep,          // (ms) => Promise
    onEvent = () => {},   // (name) => void, e.g. 'coinsUpdated', 'dailyLimitReached'
    maxFailures = MAX_CONSECUTIVE_FAILURES,
    baseBackoffMs = 5000,
    maxBackoffMs = 300000,
    pauseMs = 200,
}) {
    let loopActive = false;

    async function isRunning() {
        return Boolean(await store.get('isRunning'));
    }

    async function runCycle() {
        await log('Starting a coin collection cycle...');
        await sleep(1000);

        const startData = await api.start();
        if (startData.errno !== 0) {
            if (startData.errno === DAILY_LIMIT_ERRNO && startData.errmsg === DAILY_LIMIT_MESSAGE) {
                throw new DailyLimitError();
            }
            throw new Error(`Failed to start the game. Error code: ${startData.errno}, Message: ${startData.errmsg || 'Unknown error'}`);
        }

        const { game_id: gameId, map_info: { items } } = startData.data;
        const objectTypes = items.map((item) => item.object_type);

        const results = await Promise.allSettled(objectTypes.map(async (objectType) => {
            const data = await api.getItem(gameId, objectType, reportId());
            await log(`Get item response for object type ${objectType}: ${JSON.stringify(data)}`);
            await sleep(pauseMs);
            return data;
        }));
        const failed = results.filter((r) => r.status === 'rejected');
        for (const r of failed) await log(`Item request failed: ${r.reason && r.reason.message}`);
        if (failed.length === objectTypes.length && objectTypes.length > 0) {
            throw new Error('All item requests failed in this cycle');
        }

        if (!(await isRunning())) return;
        await log('Waiting 2 seconds before finishing the game...');
        await sleep(2000);

        await log('Finishing game...');
        const finishData = await api.finish(gameId);
        await log(`Finish game response: ${JSON.stringify(finishData)}`);
        await log('Coin collection cycle completed');
        onEvent('coinsUpdated');
    }

    async function loop() {
        let failures = 0;
        while (await isRunning()) {
            try {
                await runCycle();
                failures = 0;
            } catch (error) {
                if (error instanceof DailyLimitError) {
                    await store.set({ isRunning: false, dailyLimitReached: true });
                    await log('Daily limit reached. Stopping collection.');
                    onEvent('dailyLimitReached');
                    return;
                }
                failures += 1;
                await log(`Error during coin collection cycle (${failures}/${maxFailures}): ${error.message}`);
                if (failures >= maxFailures) {
                    await store.set({ isRunning: false });
                    await log('Too many consecutive failures. Stopping collection.');
                    onEvent('stopped');
                    return;
                }
                await sleep(Math.min(baseBackoffMs * 2 ** (failures - 1), maxBackoffMs));
            }
        }
    }

    function ensureLoop() {
        if (loopActive) return;
        loopActive = true;
        loop().catch(() => {}).finally(() => { loopActive = false; });
    }

    return {
        async start() {
            if (await isRunning()) return { success: false, message: 'Already running' };
            if (await store.get('dailyLimitReached')) return { success: false, message: 'Daily limit reached' };
            await store.set({ isRunning: true });
            await log('Started coin collection process');
            ensureLoop();
            return { success: true };
        },
        async stop() {
            await store.set({ isRunning: false });
            await log('Stopped coin collection process');
            return { success: true };
        },
        // Called from a chrome.alarms tick: restarts the loop if the worker was
        // unloaded while collection was supposed to be running.
        async resumeIfNeeded() {
            if (await isRunning()) ensureLoop();
        },
        get loopActive() { return loopActive; },
    };
}

function reportId() {
    return Array.from({ length: 16 }, () => Math.floor(Math.random() * 10)).join('');
}
