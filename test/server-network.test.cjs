const assert = require('node:assert/strict');
const http = require('node:http');
const { rmSync } = require('node:fs');
const { spawn } = require('node:child_process');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const WebSocket = require('../penumbra_engine/web_controller/node_modules/ws');
const test = require('node:test');

const serverPath = path.join(__dirname, '..', 'penumbra_engine', 'web_controller', 'server.js');
const privateIpv4 = Object.values(os.networkInterfaces())
  .flatMap((addresses) => addresses || [])
  .find((address) => address.family === 'IPv4' && !address.internal)?.address;

function getText(port, requestPath) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: requestPath }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, body }));
    }).once('error', reject);
  });
}

function wsConnect(port, origin) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`, { origin });
    const finish = (connected) => { ws.terminate(); resolve(connected); };
    ws.once('open', () => finish(true));
    ws.once('unexpected-response', () => finish(false));
    ws.once('error', () => finish(false));
  });
}

function reservePort() {
  return new Promise((resolve, reject) => {
    const socket = net.createServer();
    socket.once('error', reject);
    socket.listen(0, '127.0.0.1', () => {
      const { port } = socket.address();
      socket.close(() => resolve(port));
    });
  });
}

function canConnect(host, port, timeout = 500) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const finish = (result) => { socket.destroy(); resolve(result); };
    socket.setTimeout(timeout, () => finish(false));
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
  });
}

test('local controller enforces loopback, WebSocket origin, and scanner error handling', async (t) => {
  const port = await reservePort();
  const youtubeCacheDir = path.join(os.tmpdir(), `penumbra-youtube-server-test-${process.pid}-${port}`);
  const child = spawn(process.execPath, [serverPath], {
    cwd: path.dirname(serverPath),
    env: {
      ...process.env,
      PATH: '',
      PORT: String(port),
      PENUMBRA_YOUTUBE_CACHE_DIR: youtubeCacheDir,
      PENUMBRA_YTDLP_BIN: path.join(os.tmpdir(), `missing-yt-dlp-${process.pid}-${port}.exe`)
    },
    stdio: 'ignore'
  });
  t.after(() => { child.kill(); rmSync(youtubeCacheDir, { recursive: true, force: true }); });

  let ready = false;
  for (let attempt = 0; attempt < 50 && !ready; attempt++) {
    ready = await canConnect('127.0.0.1', port, 100);
    if (!ready) await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(ready, 'controller failed to start on loopback');
  const localResponse = await fetch(`http://localhost:${port}`, { signal: AbortSignal.timeout(1000) });
  assert.equal(localResponse.status, 200, 'controller is not reachable through the localhost URL used by the UI');
  if (privateIpv4) {
    assert.equal(await canConnect(privateIpv4, port), false, `controller accepted a connection on ${privateIpv4}`);
  }
  assert.equal(await wsConnect(port, 'https://attacker.example'), false, 'controller accepted a cross-site WebSocket');
  assert.equal(await wsConnect(port, `http://localhost:${port}`), true, 'controller rejected its local UI origin');
  const traversal = await getText(port, '/mattes/../../web_controller/server.js');
  assert.notEqual(traversal.status, 200, 'matte resolver served a file outside its static directory');
  const response = await fetch(`http://127.0.0.1:${port}/api/rescan`, {
    method: 'POST',
    signal: AbortSignal.timeout(1500)
  });
  assert.equal(response.status, 500, 'scanner spawn failure did not produce an HTTP error');

  const crossSiteDownload = await fetch(`http://127.0.0.1:${port}/api/youtube-downloads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://attacker.example' },
    body: JSON.stringify({ url: 'https://www.youtube.com/watch?v=abc' })
  });
  assert.equal(crossSiteDownload.status, 403, 'YouTube download endpoint accepted a cross-site mutation');

  const crossSiteMedia = await fetch(`http://127.0.0.1:${port}/api/youtube-downloads/not-a-job/media`, {
    headers: { Origin: 'https://attacker.example', 'Sec-Fetch-Site': 'cross-site' }
  });
  assert.equal(crossSiteMedia.status, 403, 'temporary media endpoint accepted a cross-site request');
  const crossSiteMediaWithoutOrigin = await fetch(`http://127.0.0.1:${port}/api/youtube-downloads/not-a-job/media`, {
    headers: { 'Sec-Fetch-Site': 'cross-site' }
  });
  assert.equal(crossSiteMediaWithoutOrigin.status, 403, 'temporary media endpoint ignored cross-site Fetch Metadata');

  const invalidUrl = await fetch(`http://127.0.0.1:${port}/api/youtube-downloads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'https://youtube.com.evil.example/watch?v=abc' })
  });
  assert.equal(invalidUrl.status, 400, 'YouTube endpoint accepted a lookalike hostname');

  const unavailable = await fetch(`http://127.0.0.1:${port}/api/youtube-downloads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: `http://localhost:${port}` },
    body: JSON.stringify({ url: 'https://www.youtube.com/watch?v=abc' })
  });
  assert.equal(unavailable.status, 202);
  const started = await unavailable.json();
  let downloadStatus;
  for (let attempt = 0; attempt < 20; attempt++) {
    const statusResponse = await fetch(`http://127.0.0.1:${port}/api/youtube-downloads/${started.id}`);
    downloadStatus = await statusResponse.json();
    if (downloadStatus.status === 'failed') break;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  assert.equal(downloadStatus.status, 'failed');
  assert.match(downloadStatus.error, /yt-dlp não encontrado/i);
});
