import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', 'source code', 'Terabox Extension');
const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8').replace(/^\uFEFF/, ''));

function referencedFiles(m) {
    const files = [m.action.default_popup, m.background.service_worker];
    for (const path of Object.values(m.icons)) files.push(path);
    for (const path of Object.values(m.action.default_icon)) files.push(path);
    return files;
}

test('manifest is MV3 with a module service worker', () => {
    assert.equal(manifest.manifest_version, 3);
    assert.equal(manifest.background.type, 'module');
});

test('every file referenced by the manifest exists', () => {
    for (const file of referencedFiles(manifest)) {
        assert.ok(existsSync(join(ROOT, file)), `missing ${file}`);
    }
});

test('popup.html references only scripts and styles that exist', () => {
    const html = readFileSync(join(ROOT, 'popup.html'), 'utf8');
    for (const [, src] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
        if (src.startsWith('http')) continue;
        assert.ok(existsSync(join(ROOT, src)), `missing ${src}`);
    }
});

test('no innerHTML is used with dynamic log data in the popup', () => {
    const js = readFileSync(join(ROOT, 'popup.js'), 'utf8');
    assert.doesNotMatch(js, /logContent\.innerHTML/);
});

test('the manifest does not request permissions the code does not use', () => {
    const code = ['background.js', 'lib/api.js', 'lib/collector.js', 'lib/logger.js', 'lib/stats.js', 'lib/schema.js', 'popup.js']
        .map((f) => readFileSync(join(ROOT, f), 'utf8')).join('\n');
    if (manifest.permissions.includes('alarms')) assert.match(code, /chrome\.alarms/);
    if (manifest.permissions.includes('cookies')) assert.match(code, /chrome\.cookies/);
    if (manifest.permissions.includes('notifications')) assert.match(code, /chrome\.notifications/);
});
