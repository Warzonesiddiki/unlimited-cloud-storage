// Coin-collection state machine. Pure logic: all I/O is injected (api, store,
// log, sleep), so it can be tested without Chrome or the network.
//
// Free plays only. The collector never spends coins: paid plays and the
// GemMerge game are intentionally not implemented.

import { validateStart, validatePull, SchemaError } from './schema.js';

const noopStats = { play() {}, cycle() {}, success() {}, error() {} };

export const DAILY_LIMIT_ERRNO = 28135;
export const DAILY_LIMIT_MESSAGE = 'gold miner up to limit today';
export const MAX_CONSECUTIVE_FAILURES = 5;
export const GAME_MIN_DURATION_MS = 60000; // the fork waits 60 s before finishing a game
export const MAX_PLAYS_PER_CYCLE = 10;     // safety cap per cycle
const SKIPPED_OBJECT_TYPES = new Set([0, 10]); // object types the fork never requests

export class DailyLimitError extends Error {
    constructor() {
        super('Daily limit reached');
        this.name = 'DailyLimitError';
    }
}

export function createCollector({
    api,            // see background.js: bonus(), pull(), start(), getItem(), finish()
    store,          // { get(key), set(obj) }
    log,            // async (message) => void
    sleep,          // (ms) => Promise
    now = Date.now,
    stats = noopStats,    // { play(), cycle(), success(), error(message) }
    onEvent = () => {},   // (name) => void: 'coinsUpdated' | 'dailyLimitReached' | 'stopped'
    maxFailures = MAX_CONSECUTIVE_FAILURES,
    baseBackoffMs = 5000,
    maxBackoffMs = 300000,
    pauseMs = 200,
    minGameMs = GAME_MIN_DURATION_MS,
    maxPlays = MAX_PLAYS_PER_CYCLE,
}) {
    let loopActive = false;

    async function isRunning() {
        return Boolean(await store.get('isRunning'));
    }

    function startError(data) {
        if (data.errno === DAILY_LIMIT_ERRNO && data.errmsg === DAILY_LIMIT_MESSAGE) {
            return new DailyLimitError();
        }
        return new Error(`Failed to start the game. Error code: ${data.errno}, Message: ${data.errmsg || 'Unknown error'}`);
    }

    // One complete free game: start, collect items, wait, finish.
    async function playGame() {
        const startedAt = now();
        const startData = await api.start();
        if (startData.errno !== 0) throw startError(startData);
        const check = validateStart(startData);
        if (!check.ok) throw new SchemaError('miner/start', check.reason);

        const { game_id: gameId, map_info: { items } } = startData.data;
        const objectTypes = items.map((item) => item.object_type).filter((t) => !SKIPPED_OBJECT_TYPES.has(t));

        const results = await Promise.allSettled(objectTypes.map(async (objectType) => {
            const data = await api.getItem(gameId, objectType, reportId());
            await log(`Item ${objectType}: ${JSON.stringify(data)}`);
            await sleep(pauseMs);
            return data;
        }));
        const failed = results.filter((r) => r.status === 'rejected');
        for (const r of failed) await log(`Item request failed: ${r.reason && r.reason.message}`);
        if (objectTypes.length > 0 && failed.length === objectTypes.length) {
            throw new Error('All item requests failed in this game');
        }

        const remaining = minGameMs - (now() - startedAt);
        if (remaining > 0) await sleep(remaining);
        if (!(await isRunning())) return;

        const finishData = await api.finish(gameId);
        await log(`Finish game ${gameId}: ${JSON.stringify(finishData)}`);
        if (finishData.errno === 0) await stats.play();
    }

    // Preferred path: read the free plays from miner/pull and play only those.
    // Returns the number of plays made, or null if pull is unusable and the
    // caller should fall back to the single-game path.
    async function runFreePlays() {
        const pulled = await api.pull().catch((error) => ({ errno: -1, error }));
        const check = validatePull(pulled);
        if (pulled.errno !== 0 || !check.ok) {
            await log(`miner/pull unusable (${pulled.errno}${check.ok ? '' : `: ${check.reason}`}); using single-game fallback`);
            return null;
        }

        const freeLeft = pulled.data.free_times_left;
        await log(`Free plays left today: ${freeLeft}`);
        if (freeLeft <= 0) throw new DailyLimitError();

        const plays = Math.min(freeLeft, maxPlays);
        for (let i = 0; i < plays; i++) {
            if (!(await isRunning())) break;
            await log(`Free play ${i + 1}/${plays}`);
            await playGame();
            await sleep(pauseMs);
        }
        return plays;
    }

    async function runCycle() {
        await log('Starting a coin collection cycle...');
        await stats.cycle();

        // Free bonus coins; failure here is not fatal.
        try {
            const bonus = await api.bonus();
            await log(bonus.errno === 0 ? 'Bonus coins requested' : `Bonus request returned ${bonus.errno}`);
        } catch (error) {
            await log(`Bonus request failed: ${error.message}`);
        }
        await sleep(1000);

        const played = await runFreePlays();
        if (played === null) {
            await playGame(); // single-game fallback (original flow)
        }
        await log('Coin collection cycle completed');
        await stats.success();
        onEvent('coinsUpdated');
    }

    async function loop() {
        let failures = 0;
        while (await isRunning()) {
            try {
                await runCycle();
                failures = 0;
                await sleep(5000 + Math.random() * 5000);
            } catch (error) {
                if (error instanceof DailyLimitError) {
                    await store.set({ isRunning: false, dailyLimitReached: true });
                    await log('Daily limit reached. Stopping collection.');
                    onEvent('dailyLimitReached');
                    return;
                }
                failures += 1;
                await stats.error(error.message);
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
        async resumeIfNeeded() {
            if (await isRunning()) ensureLoop();
        },
        get loopActive() { return loopActive; },
    };
}

function reportId() {
    return Array.from({ length: 16 }, () => Math.floor(Math.random() * 10)).join('');
}
