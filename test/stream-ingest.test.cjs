const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const { join } = require('node:path');
const test = require('node:test');

const source = readFileSync(join(__dirname, '..', 'penumbra_engine', 'web_controller', 'public', 'app.js'), 'utf8');

function makeIngestHarness({ url, fetch = async () => { throw new Error('unexpected fetch'); } }) {
  const calls = [];
  const elements = new Map();
  const makeElement = (id, props = {}) => {
    const element = {
      value: '', style: {}, hidden: true, disabled: false, listeners: {},
      addEventListener(name, callback) { this.listeners[name] = callback; },
      ...props
    };
    elements.set(id, element);
    return element;
  };
  const button = makeElement('btn-nexus-yt-temporary');
  const cancelButton = makeElement('btn-nexus-yt-cancel');
  const input = makeElement('input-nexus-yt', { value: url });
  const feedback = makeElement('nexus-ingest-feedback', { textContent: '', dataset: {} });
  const message = makeElement('nexus-ingest-message', { textContent: '' });
  const percent = makeElement('nexus-ingest-percent', { textContent: '' });
  const progress = makeElement('nexus-ingest-progress', {
    value: 0,
    history: [],
    removeAttribute(name) { if (name === 'value') this.value = null; }
  });
  Object.defineProperty(progress, 'value', {
    configurable: true,
    get() { return this._value; },
    set(value) { this._value = value; this.history.push(value); }
  });
  const detail = makeElement('nexus-ingest-detail', { textContent: '' });
  const context = {
    document: { getElementById: id => elements.get(id) || null },
    allClips: [],
    MediaProvider: { mode: 'none' },
    safeCDNMediaUrl: value => value.startsWith('https://gigantera-penumbra.b-cdn.net/') ? value : '',
    renderMediaCards: () => calls.push('render'),
    updateSourceUI: sourceName => calls.push(`source:${sourceName}`),
    closeStudioLauncher: () => calls.push('close'),
    console: { log() {} }, fetch, URL,
    setTimeout: fn => { fn(); return 0; }, encodeURIComponent
  };
  const block = source.match(/\/\/ 4\. YOUTUBE \/ STREAM INGESTION\r?\n([\s\S]*?)\r?\n    \/\/ Check saved preference on startup/);
  assert.ok(block, 'bootstrap must define the stream-ingest controls');
  const handle = vm.runInNewContext(`(() => { ${block[1]}; return handleYTIngest; })()`, context);
  return { calls, context, handle, button, cancelButton, feedback, message, percent, progress, detail };
}

test('ingesting a direct Bunny stream URL adds a card and opens the stream source', async () => {
  const url = 'https://gigantera-penumbra.b-cdn.net/test/sample.mp4';
  const h = makeIngestHarness({ url });
  await assert.doesNotReject(h.handle());
  assert.equal(h.context.allClips.length, 1);
  assert.equal(h.context.allClips[0].relative_path, url);
  assert.deepEqual(h.calls.slice(0, 3), ['render', 'source:stream', 'close']);
});

test('YouTube ingest displays live progress and adds its temporary media URL when complete', async () => {
  const url = 'https://www.youtube.com/watch?v=WDU1UXiUZhs&list=RDWDU1UXiUZhs&start_radio=1';
  const requests = [];
  const statuses = [
    { id: 'abc-123', status: 'downloading', title: 'Test video', percent: 25, downloadedBytes: 1024, totalBytes: 4096, lastProgressAt: Date.now() },
    { id: 'abc-123', status: 'complete', title: 'Test video', duration: 60, percent: 100 }
  ];
  const h = makeIngestHarness({
    url,
    fetch: async (route, options) => {
      requests.push({ route, options });
      return {
        ok: true,
        json: async () => route === '/api/youtube-downloads'
          ? { id: 'abc-123', status: 'downloading', title: 'Preparando link…', percent: null }
          : statuses.shift()
      };
    }
  });
  await assert.doesNotReject(h.handle());
  assert.equal(requests[0].route, '/api/youtube-downloads');
  assert.equal(JSON.parse(requests[0].options.body).url, url);
  assert.equal(h.context.allClips.length, 1);
  assert.equal(h.context.allClips[0].filename, 'Test video');
  assert.equal(h.context.allClips[0].relative_path, '/api/youtube-downloads/abc-123/media');
  assert.equal(h.context.allClips[0].is_temporary, true);
  assert.equal(h.context.MediaProvider.mode, 'youtube');
  assert.equal(h.feedback.dataset.state, 'success');
  assert.equal(h.progress.hidden, false);
  assert.ok(h.progress.history.includes(25), 'the determinate progress was rendered during transfer');
  assert.equal(h.progress.value, 100);
  assert.equal(h.percent.textContent, '100%');
  assert.deepEqual(h.calls.slice(0, 3), ['render', 'source:stream', 'close']);
  assert.equal(h.button.disabled, false);
});

test('a polling failure keeps a retryable cancel action until the server confirms cancellation', async () => {
  let failDelete = true;
  const requests = [];
  const h = makeIngestHarness({
    url: 'https://www.youtube.com/watch?v=abc',
    fetch: async (route, options = {}) => {
      requests.push({ route, options });
      if (route === '/api/youtube-downloads') {
        return { ok: true, json: async () => ({ id: 'retry-cancel-id', status: 'downloading', percent: null }) };
      }
      if (options.method === 'DELETE') {
        if (failDelete) throw new Error('connection unavailable');
        return { ok: false, status: 409 };
      }
      throw new Error('poll connection failed');
    }
  });

  await h.handle();
  assert.equal(requests.some(request => request.options.method === 'DELETE'), true, 'polling failure should attempt cancellation');
  assert.equal(h.cancelButton.hidden, false, 'the cancel control should remain available while cancellation is unconfirmed');
  assert.match(h.message.textContent, /cancelamento/i);

  failDelete = false;
  await h.cancelButton.listeners.click();
  assert.equal(requests.at(-1).options.method, 'DELETE');
  assert.equal(h.cancelButton.hidden, true, 'the cancel control should hide after server confirmation');
  assert.equal(h.feedback.dataset.state, 'success');
});

test('unsupported hosts show feedback without starting a request', async () => {
  const h = makeIngestHarness({ url: 'https://youtube.com.evil.example/watch?v=abc' });
  await h.handle();
  assert.equal(h.context.allClips.length, 0);
  assert.match(h.message.textContent, /MP4\/WebM/);
  assert.equal(h.feedback.dataset.state, 'error');
  assert.deepEqual(h.calls, []);
});
