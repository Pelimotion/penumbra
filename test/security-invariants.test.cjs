const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');

const source = readFileSync(join(__dirname, '..', 'penumbra_engine', 'audio_engine', 'audio_brain.py'), 'utf8');

test('audio brain WebSocket listens only on loopback', () => {
  assert.equal(
    /websockets\.serve\(ws_handler,\s*["']127\.0\.0\.1["']\s*,\s*brain\.ws_port\)/.test(source),
    true,
    'audio brain must bind to loopback'
  );
});
