import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCollector, DAILY_LIMIT_ERRNO, DAILY_LIMIT_MESSAGE } from '../source code/Terabox Extension/lib/collector.js';
import { createMemoryStore } from './helpers.js';

const instantSleep = async () => {};
const okStart = { errno: 0, data: { game_id: 'g1', map_info: { items: [{ object_type: 1 }, { object_type: 2 }] } } };

function makeApi(overrides = {}) {
    const calls = { start: 0, getItem: [], finish: [] };
    const api = {
        start: async () => { calls.start += 1; return okStart; },
        getItem: async (gameId, objectType) => { calls.getItem.push([gameId, objectType]); return { errno: 0 }; },
        finish: async (gameId) => { calls.finish.push(gameId); return { errno: 0 }; },
        ...overrides,
    };
    return { api, calls };
}

function setup({ api, store = createMemoryStore(), ...rest }) {
    const events = [];
    const collector = createCollector({
        api,
        store,
        log: async () => {},
        sleep: instantSleep,
        onEvent: (e) => events.push(e),
        baseBackoffMs: 0,
        maxBackoffMs: 0,
        pauseMs: 0,
        ...rest,
    });
    return { collector, store, events };
}

// Wait until the background loop has settled (no active loop, store idle).
async function settle(collector) {
    for (let i = 0; i < 500 && collector.loopActive; i++) await new Promise((r) => setImmediate(r));
}

test('start refuses when already running', async () => {
    const { api } = makeApi();
    const { collector, store } = setup({ api, store: createMemoryStore({ isRunning: true }) });
    assert.deepEqual(await collector.start(), { success: false, message: 'Already running' });
    assert.equal(await store.get('isRunning'), true);
});

test('start refuses after the daily limit was reached', async () => {
    const { api } = makeApi();
    const { collector } = setup({ api, store: createMemoryStore({ dailyLimitReached: true }) });
    assert.deepEqual(await collector.start(), { success: false, message: 'Daily limit reached' });
});

test('a successful cycle collects every item and finishes the game, then stops', async () => {
    const { api, calls } = makeApi();
    const { collector, store, events } = setup({ api });
    api.finish = async (gameId) => {
        calls.finish.push(gameId);
        await collector.stop(); // one cycle only
        return { errno: 0 };
    };
    await collector.start();
    await settle(collector);
    assert.deepEqual(calls.getItem, [['g1', 1], ['g1', 2]]);
    assert.deepEqual(calls.finish, ['g1']);
    assert.ok(events.includes('coinsUpdated'));
    assert.equal(await store.get('isRunning'), false);
});

test('daily limit stops collection and records the limit', async () => {
    const { api } = makeApi({
        start: async () => ({ errno: DAILY_LIMIT_ERRNO, errmsg: DAILY_LIMIT_MESSAGE }),
    });
    const { collector, store, events } = setup({ api, store: createMemoryStore({ isRunning: true }) });
    await collector.resumeIfNeeded();
    await settle(collector);
    assert.equal(await store.get('isRunning'), false);
    assert.equal(await store.get('dailyLimitReached'), true);
    assert.deepEqual(events, ['dailyLimitReached']);
});

test('stops after the maximum number of consecutive failures', async () => {
    let attempts = 0;
    const { api } = makeApi({ start: async () => { attempts += 1; return { errno: 1, errmsg: 'boom' }; } });
    const { collector, store, events } = setup({ api, store: createMemoryStore({ isRunning: true }), maxFailures: 3 });
    await collector.resumeIfNeeded();
    await settle(collector);
    assert.equal(attempts, 3);
    assert.equal(await store.get('isRunning'), false);
    assert.deepEqual(events, ['stopped']);
});

test('a failure followed by success resets the failure counter', async () => {
    let n = 0;
    const { api, calls } = makeApi({
        start: async () => {
            n += 1;
            if (n === 1) return { errno: 1, errmsg: 'transient' };
            return okStart;
        },
        finish: async (gameId) => { calls.finish.push(gameId); await collectorRef.stop(); return { errno: 0 }; },
    });
    let collectorRef;
    const ctx = setup({ api, store: createMemoryStore({ isRunning: true }), maxFailures: 2 });
    collectorRef = ctx.collector;
    await collectorRef.resumeIfNeeded();
    await settle(collectorRef);
    assert.deepEqual(calls.finish, ['g1']);
});

test('start is idempotent: a second start does not spawn a second loop', async () => {
    let starts = 0;
    const { api } = makeApi({ start: async () => { starts += 1; return { errno: 1, errmsg: 'x' }; } });
    const { collector } = setup({ api, maxFailures: 1 });
    const first = await collector.start();
    const second = await collector.start();
    assert.equal(first.success, true);
    assert.equal(second.success, false);
    await settle(collector);
    assert.equal(starts, 1);
});

test('resumeIfNeeded restarts the loop only when the store says running', async () => {
    const { api } = makeApi();
    const { collector } = setup({ api });
    await collector.resumeIfNeeded();
    assert.equal(collector.loopActive, false);
});
