import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStats, dayKey } from '../source code/Terabox Extension/lib/stats.js';
import { createMemoryStore } from './helpers.js';

test('dayKey uses the local calendar date', () => {
    assert.equal(dayKey(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
});

test('counts plays, cycles, successes and errors for the day', async () => {
    const stats = createStats(createMemoryStore(), { now: () => new Date(2026, 0, 5, 10) });
    await stats.cycle();
    await stats.play();
    await stats.play();
    await stats.error('boom');
    await stats.success();
    const s = await stats.get();
    assert.equal(s.plays, 2);
    assert.equal(s.cycles, 1);
    assert.equal(s.errors, 1);
    assert.equal(s.lastError, 'boom');
    assert.ok(s.lastSuccessAt);
});

test('counters reset on a new day but last success is kept', async () => {
    const store = createMemoryStore();
    let today = new Date(2026, 0, 5, 10);
    const stats = createStats(store, { now: () => today });
    await stats.play();
    await stats.success();
    const before = await stats.get();
    today = new Date(2026, 0, 6, 9);
    const after = await stats.get();
    assert.equal(after.plays, 0);
    assert.equal(after.day, '2026-01-06');
    assert.equal(after.lastSuccessAt, before.lastSuccessAt);
});
