import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLogger } from '../source code/Terabox Extension/lib/logger.js';
import { createMemoryStore } from './helpers.js';

test('appends timestamped lines and keeps only the newest entries', async () => {
    const store = createMemoryStore();
    const { log } = createLogger(store, { limit: 3, now: () => new Date('2026-01-01T00:00:00Z') });
    for (let i = 1; i <= 5; i++) await log(`msg ${i}`);
    const logs = await store.get('logs');
    assert.equal(logs.length, 3);
    assert.equal(logs[0], '[2026-01-01T00:00:00.000Z] msg 3');
    assert.equal(logs[2], '[2026-01-01T00:00:00.000Z] msg 5');
});

test('concurrent writes are not lost', async () => {
    const store = createMemoryStore();
    const { log } = createLogger(store, { limit: 100 });
    await Promise.all(Array.from({ length: 20 }, (_, i) => log(`m${i}`)));
    assert.equal((await store.get('logs')).length, 20);
});
