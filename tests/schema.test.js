import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateStart, validatePull } from '../source code/Terabox Extension/lib/schema.js';

test('validateStart accepts a well-formed start response', () => {
    assert.deepEqual(validateStart({ errno: 0, data: { game_id: 'g', map_info: { items: [] } } }), { ok: true });
});

test('validateStart names the missing field', () => {
    assert.match(validateStart({ errno: 0 }).reason, /data/);
    assert.match(validateStart({ errno: 0, data: {} }).reason, /game_id/);
    assert.match(validateStart({ errno: 0, data: { game_id: 1 } }).reason, /map_info\.items/);
    assert.match(validateStart(null).reason, /empty/);
});

test('validatePull requires a numeric free_times_left', () => {
    assert.equal(validatePull({ errno: 0, data: { free_times_left: 0 } }).ok, true);
    assert.equal(validatePull({ errno: 0, data: { free_times_left: '3' } }).ok, false);
    assert.match(validatePull({ errno: 0, data: {} }).reason, /free_times_left/);
});
