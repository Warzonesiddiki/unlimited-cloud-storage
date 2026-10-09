import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildUrl, reportId, fetchJson, isRetryable, HttpError, detectSubdomain } from '../source code/Terabox Extension/lib/api.js';

const noSleep = async () => {};

function response(status, body) {
    return { ok: status >= 200 && status < 300, status, json: async () => body, url: 'https://jp.terabox.com/x' };
}

test('buildUrl uses the subdomain or www', () => {
    assert.equal(buildUrl('', '/a'), 'https://www.terabox.com/a');
    assert.equal(buildUrl('jp', '/a'), 'https://jp.terabox.com/a');
});

test('reportId is 16 digits', () => {
    assert.match(reportId(), /^\d{16}$/);
    assert.equal(reportId(() => 0), '0000000000000000');
});

test('isRetryable: network errors, 429 and 5xx only', () => {
    assert.equal(isRetryable(new TypeError('fetch failed')), true);
    assert.equal(isRetryable(new HttpError(429, 'u')), true);
    assert.equal(isRetryable(new HttpError(503, 'u')), true);
    assert.equal(isRetryable(new HttpError(404, 'u')), false);
    assert.equal(isRetryable(new SyntaxError('bad json')), false);
});

test('fetchJson returns parsed JSON on success', async () => {
    const data = await fetchJson(async () => response(200, { errno: 0 }), 'u', { sleep: noSleep });
    assert.deepEqual(data, { errno: 0 });
});

test('fetchJson retries network errors then succeeds', async () => {
    let calls = 0;
    const fake = async () => {
        calls += 1;
        if (calls < 3) throw new TypeError('network');
        return response(200, { ok: true });
    };
    const data = await fetchJson(fake, 'u', { sleep: noSleep });
    assert.equal(calls, 3);
    assert.deepEqual(data, { ok: true });
});

test('fetchJson does not retry a 404', async () => {
    let calls = 0;
    const fake = async () => { calls += 1; return response(404, {}); };
    await assert.rejects(fetchJson(fake, 'u', { sleep: noSleep }), HttpError);
    assert.equal(calls, 1);
});

test('fetchJson gives up after the retry budget', async () => {
    let calls = 0;
    const fake = async () => { calls += 1; throw new TypeError('down'); };
    await assert.rejects(fetchJson(fake, 'u', { retries: 2, sleep: noSleep }), TypeError);
    assert.equal(calls, 3);
});

test('fetchJson uses exponential backoff between retries', async () => {
    const waits = [];
    const fake = async () => { throw new TypeError('down'); };
    await assert.rejects(fetchJson(fake, 'u', { retries: 3, baseDelayMs: 100, sleep: async (ms) => waits.push(ms) }));
    assert.deepEqual(waits, [100, 200, 400]);
});

test('detectSubdomain extracts the account subdomain from the final URL', async () => {
    assert.equal(await detectSubdomain(async () => response(200, {})), 'jp');
    const other = async () => ({ url: 'https://example.com/' });
    assert.equal(await detectSubdomain(other), '');
    const failing = async () => { throw new TypeError('offline'); };
    assert.equal(await detectSubdomain(failing), '');
});
