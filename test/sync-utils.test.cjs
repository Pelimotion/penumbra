const assert = require('node:assert/strict');
const { mkdtempSync, rmSync, utimesSync, writeFileSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadEnvFileIfUnset, thumbnailNeedsRefresh } = require('../scripts/sync_utils');
const test = require('node:test');

test('local env file provides missing values without overriding process environment', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'penumbra-env-'));
  try {
    const envFile = path.join(dir, '.env');
    writeFileSync(envFile, 'BUNNY_STORAGE_PASSWORD=file-value\nPENUMBRA_TEST_SETTING=enabled\n');
    const env = { BUNNY_STORAGE_PASSWORD: 'from-process' };
    loadEnvFileIfUnset(envFile, env);
    assert.equal(env.BUNNY_STORAGE_PASSWORD, 'from-process');
    assert.equal(env.PENUMBRA_TEST_SETTING, 'enabled');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a missing thumbnail needs generation', () => {
  assert.equal(thumbnailNeedsRefresh('missing-source', 'missing-thumbnail'), true);
});

test('a changed source refreshes an older thumbnail', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'penumbra-sync-'));
  try {
    const source = path.join(dir, 'clip.mp4');
    const thumbnail = path.join(dir, 'clip.webp');
    writeFileSync(source, 'source');
    writeFileSync(thumbnail, 'thumb');
    utimesSync(source, 200, 200);
    utimesSync(thumbnail, 100, 100);
    assert.equal(thumbnailNeedsRefresh(source, thumbnail), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
