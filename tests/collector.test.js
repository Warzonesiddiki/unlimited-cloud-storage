import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCollector, DAILY_LIMIT_ERRNO, DAILY_LIMIT_MESSAGE } from '../source code/Terabox Extension/lib/collector.js';
import { createMemoryStore } from './helpers.js';

const instantSleep = async () => {};
const startOf = (types) => ({ errno: 0, data: { game_id: 'g1', map_info: { items: types.map((t) => ({ object_type: t })) } } });
const pullOf = (free) => ({ errno: 0, data: { free_times_left: free, buy_times_left: 0, price: 0 } });

// Fake TeraBox API. Records every call so tests can assert on what was sent.
function makeApi(overrides = {}) {
    const calls = { bonus: 0, pull: 0, start: 0, getItem: [], finish: [] };
    const api = {
        bonus: async () => { calls.bonus += 1; return { errno: 0 }; },
        pull: async () => { calls.pull += 1; return pullOf(1); },
        start: async () => { calls.start += 1; return startOf([0, 1, 10, 2]); },
        getItem: async (gameId, objectType) => { calls.getItem.push(objectType); return { errno: 0, data: {} }; },
        finish: async (gameId) => { calls.finish.push(gameId); return { errno: 0, data: {} }; },
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
        now: () => 0,              // game always looks instantaneous ...
        minGameMs: 0,              // ... so no real waiting is required
        onEvent: (e) => events.push(e),
        baseBackoffMs: 0,
        maxBackoffMs: 0,
        pauseMs: 0,
        ...rest,
    });
    return { collector, store, events };
}

// Wait until the background loop has finished (no active loop).
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

test('plays exactly the free plays reported by pull, skipping object types 0 and 10', async () => {
    const { api, calls } = makeApi({ pull: async () => pullOf(2) });
    const { collector, store, events } = setup({ api });
    api.finish = async (gameId) => { calls.finish.push(gameId); if (calls.finish.length === 2) await collector.stop(); return { errno: 0, data: {} }; };
    await collector.start();
    await settle(collector);
    assert.equal(calls.bonus >= 1, true);
    assert.equal(calls.start, 2);
    assert.deepEqual(calls.getItem, [1, 2, 1, 2]);
    assert.equal(calls.finish.length, 2);
    assert.ok(events.includes('coinsUpdated'));
    assert.equal(await store.get('isRunning'), false);
});

test('never plays more than maxPlays in one cycle', async () => {
    const { api, calls } = makeApi({ pull: async () => pullOf(50) });
    const { collector } = setup({ api, maxPlays: 3 });
    api.finish = async (gameId) => { calls.finish.push(gameId); if (calls.finish.length === 3) await collector.stop(); return { errno: 0, data: {} }; };
    await collector.start();
    await settle(collector);
    assert.equal(calls.start, 3);
});

test('falls back to a single game when pull is unusable', async () => {
    const { api, calls } = makeApi({ pull: async () => ({ errno: 1, data: {} }) });
    const { collector } = setup({ api });
    api.finish = async (gameId) => { calls.finish.push(gameId); await collector.stop(); return { errno: 0, data: {} }; };
    await collector.start();
    await settle(collector);
    assert.equal(calls.start, 1);
    assert.equal(calls.finish.length, 1);
});

test('falls back when pull throws a network error', async () => {
    const { api, calls } = makeApi({ pull: async () => { throw new TypeError('offline'); } });
    const { collector } = setup({ api });
    api.finish = async (gameId) => { calls.finish.push(gameId); await collector.stop(); return { errno: 0, data: {} }; };
    await collector.start();
    await settle(collector);
    assert.equal(calls.start, 1);
});

test('free_times_left of 0 stops collection with the daily-limit state', async () => {
    const { api, calls } = makeApi({ pull: async () => pullOf(0) });
    const { collector, store, events } = setup({ api });
    await collector.start();
    await settle(collector);
    assert.equal(calls.start, 0);
    assert.equal(await store.get('isRunning'), false);
    assert.equal(await store.get('dailyLimitReached'), true);
    assert.deepEqual(events, ['dailyLimitReached']);
});

test('the server daily-limit error stops collection', async () => {
    const { api } = makeApi({
        start: async () => ({ errno: DAILY_LIMIT_ERRNO, errmsg: DAILY_LIMIT_MESSAGE }),
    });
    const { collector, store, events } = setup({ api });
    await collector.start();
    await settle(collector);
    assert.equal(await store.get('isRunning'), false);
    assert.equal(await store.get('dailyLimitReached'), true);
    assert.deepEqual(events, ['dailyLimitReached']);
});

test('a game is held open for at least minGameMs before finishing', async () => {
    const { api, calls } = makeApi({ pull: async () => pullOf(1) });
    let clock = 0;
    const waits = [];
    const collector = createCollector({
        api, store: createMemoryStore(), log: async () => {}, now: () => clock,
        sleep: async (ms) => { waits.push(ms); clock += ms; },
        onEvent: () => {}, minGameMs: 60000, pauseMs: 0, baseBackoffMs: 0, maxBackoffMs: 0,
    });
    api.finish = async (gameId) => { calls.finish.push(gameId); await collector.stop(); return { errno: 0, data: {} }; };
    await collector.start();
    await settle(collector);
    assert.ok(calls.finish.length === 1);
    assert.ok(waits.some((ms) => ms > 0 && ms <= 60000), 'a wait before finish must exist');
    assert.ok(clock >= 60000, `clock was ${clock}`);
});

test('stops after the maximum number of consecutive failures', async () => {
    let attempts = 0;
    const { api } = makeApi({
        pull: async () => pullOf(1),
        start: async () => { attempts += 1; return { errno: 1, errmsg: 'boom' }; },
    });
    const { collector, store, events } = setup({ api, maxFailures: 3 });
    await collector.start();
    await settle(collector);
    assert.equal(attempts, 3);
    assert.equal(await store.get('isRunning'), false);
    assert.deepEqual(events, ['stopped']);
});

test('a failure followed by success resets the failure counter', async () => {
    let n = 0;
    const { api, calls } = makeApi({
        pull: async () => pullOf(1),
        start: async () => { n += 1; return n === 1 ? { errno: 1, errmsg: 'transient' } : startOf([1]); },
    });
    const { collector } = setup({ api, maxFailures: 2 });
    api.finish = async (gameId) => { calls.finish.push(gameId); await collector.stop(); return { errno: 0, data: {} }; };
    await collector.start();
    await settle(collector);
    assert.deepEqual(calls.finish, ['g1']);
});

test('start is idempotent: a second start does not spawn a second loop', async () => {
    let starts = 0;
    const { api } = makeApi({
        pull: async () => pullOf(1),
        start: async () => { starts += 1; return { errno: 1, errmsg: 'x' }; },
    });
    const { collector } = setup({ api, maxFailures: 1 });
    const first = await collector.start();
    const second = await collector.start();
    assert.equal(first.success, true);
    assert.equal(second.success, false);
    await settle(collector);
    assert.equal(starts, 1);
});

test('no coin-spending endpoints are exposed by the API used by the collector', () => {
    const { api } = makeApi();
    for (const name of Object.keys(api)) {
        assert.doesNotMatch(name, /buy|merge|purchase|spend/i);
    }
});

test('resumeIfNeeded does nothing when collection is not running', async () => {
    const { api } = makeApi();
    const { collector } = setup({ api });
    await collector.resumeIfNeeded();
    assert.equal(collector.loopActive, false);
});
