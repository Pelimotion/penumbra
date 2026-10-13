const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { existsSync, linkSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync, utimesSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  createDownloadManager,
  parseProgressLine,
  validateYouTubeUrl
} = require('../penumbra_engine/web_controller/youtube-downloader');

function fakeChild() {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = () => { child.killed = true; };
  return child;
}

const tick = () => new Promise(resolve => setImmediate(resolve));

test('validates only HTTPS URLs on official YouTube hostnames', () => {
  assert.equal(validateYouTubeUrl('https://www.youtube.com/watch?v=abc&list=RDabc').href, 'https://www.youtube.com/watch?v=abc');
  assert.equal(validateYouTubeUrl('https://youtu.be/abc?si=playlist').href, 'https://www.youtube.com/watch?v=abc');
  for (const url of [
    'http://youtube.com/watch?v=abc',
    'https://youtube.com.evil.test/watch?v=abc',
    'https://youtube.com@evil.test/watch?v=abc',
    'https://example.com/watch?v=abc',
    'not a URL'
  ]) assert.throws(() => validateYouTubeUrl(url));
});

test('parses yt-dlp byte progress and ignores unknown totals', () => {
  assert.deepEqual(parseProgressLine('1536|4096|NA'), {
    downloadedBytes: 1536,
    totalBytes: 4096,
    percent: 37.5
  });
  assert.deepEqual(parseProgressLine('1536|NA|NA'), {
    downloadedBytes: 1536,
    totalBytes: null,
    percent: null
  });
  assert.equal(parseProgressLine('not progress'), null);
});

test('downloads the best source, remuxes/transcodes locally, and exposes temporary job status', async t => {
  const cacheDir = mkdtempSync(path.join(os.tmpdir(), 'penumbra-youtube-test-'));
  t.after(() => rmSync(cacheDir, { recursive: true, force: true }));
  const children = [];
  const commands = [];
  const manager = createDownloadManager({
    cacheDir,
    ttlMs: 60_000,
    ytdlpCommand: 'yt-dlp-test',
    ffmpegCommand: 'ffmpeg-test',
    jsRuntimePath: 'node-test',
    spawnProcess(command, args) {
      commands.push({ command, args });
      const child = fakeChild();
      children.push(child);
      return child;
    }
  });
  t.after(() => manager.dispose());

  const job = manager.start('https://www.youtube.com/watch?v=abc&list=RDabc');
  assert.equal(job.status, 'downloading');
  assert.equal(commands[0].command, 'yt-dlp-test');
  assert.ok(commands[0].args.includes('--no-playlist'));
  assert.ok(commands[0].args.includes('https://www.youtube.com/watch?v=abc'));

  const sourceFile = path.join(cacheDir, job.id, 'source.mkv');
  mkdirSync(path.dirname(sourceFile), { recursive: true });
  writeFileSync(sourceFile, 'source');
  children[0].stdout.end(`__PENUMBRA_TITLE__Test Clip\n__PENUMBRA_DURATION__120\n1536|4096|NA\n__PENUMBRA_FILE__${sourceFile}\n`);
  await tick();
  assert.equal(manager.get(job.id).downloadedBytes, 1536);
  assert.equal(manager.get(job.id).totalBytes, 4096);
  assert.equal(manager.get(job.id).percent, 30, 'download occupies the first 80% of overall progress');
  children[0].emit('close', 0);
  await tick();

  assert.equal(children.length, 2, 'ffmpeg should be started after yt-dlp completes');
  assert.equal(manager.get(job.id).percent, 80, 'conversion starts after the download phase');
  assert.ok(commands[1].args.includes('-crf'));
  assert.ok(commands[1].args.includes('18'));
  assert.ok(commands[1].args.includes('-progress'));
  children[1].stdout.write('out_time=00:01:00.000000\n');
  await tick();
  assert.equal(manager.get(job.id).percent, 89.5, 'transcoding progress should advance from the download phase');
  const outputFile = commands[1].args.at(-1);
  writeFileSync(outputFile, 'final mp4');
  children[1].emit('close', 0);
  await tick();

  const finished = manager.get(job.id);
  assert.equal(finished.status, 'complete');
  assert.equal(finished.title, 'Test Clip');
  assert.equal(finished.duration, 120);
  assert.equal(finished.percent, 100);
  assert.equal(manager.getMediaPath(job.id), outputFile);
  const outsideOutput = path.join(cacheDir, 'outside.mp4');
  writeFileSync(outsideOutput, 'external media');
  rmSync(outputFile);
  linkSync(outsideOutput, outputFile);
  assert.equal(manager.getMediaPath(job.id), null, 'media serving must reject a hard link outside the job directory');
});

test('limits one active download and cancellation terminates its process', t => {
  const cacheDir = mkdtempSync(path.join(os.tmpdir(), 'penumbra-youtube-test-'));
  t.after(() => rmSync(cacheDir, { recursive: true, force: true }));
  const children = [];
  const manager = createDownloadManager({
    cacheDir,
    ytdlpCommand: 'yt-dlp-test',
    spawnProcess() { const child = fakeChild(); children.push(child); return child; }
  });
  t.after(() => manager.dispose());

  const job = manager.start('https://youtu.be/abc');
  assert.throws(() => manager.start('https://youtu.be/another'), /download ativo/i);
  assert.equal(manager.cancel(job.id), true);
  assert.equal(children[0].killed, true);
  assert.throws(() => manager.start('https://youtu.be/after-cancel'), /download ativo/i);
  children[0].emit('close', null);
  assert.equal(manager.get(job.id).status, 'cancelled');
  assert.equal(existsSync(path.join(cacheDir, job.id)), false, 'cancelled job files should be removed');

  const errorJob = manager.start('https://youtu.be/cancel-error');
  const errorDirectory = path.join(cacheDir, errorJob.id);
  writeFileSync(path.join(errorDirectory, 'partial.tmp'), 'partial');
  assert.equal(manager.cancel(errorJob.id), true);
  children[1].emit('error', Object.assign(new Error('terminated during cancellation'), { code: 'ECANCELED' }));
  assert.equal(manager.get(errorJob.id).status, 'cancelled', 'an error event after cancellation must not turn it into a failed job');
  assert.equal(existsSync(errorDirectory), false, 'files should be removed when cancellation settles through an error event');

  const disposeJob = manager.start('https://youtu.be/dispose');
  const disposeDirectory = path.join(cacheDir, disposeJob.id);
  writeFileSync(path.join(disposeDirectory, 'partial.tmp'), 'partial');
  manager.dispose();
  assert.equal(children[2].killed, true);
  assert.equal(existsSync(disposeDirectory), false, 'dispose should remove active job files');
});

test('rejects source paths that are symlinks or hard links outside the job directory', t => {
  const cacheDir = mkdtempSync(path.join(os.tmpdir(), 'penumbra-youtube-test-'));
  const outsideDir = mkdtempSync(path.join(os.tmpdir(), 'penumbra-youtube-outside-'));
  t.after(() => rmSync(cacheDir, { recursive: true, force: true }));
  t.after(() => rmSync(outsideDir, { recursive: true, force: true }));
  const outsideFile = path.join(outsideDir, 'private.mkv');
  writeFileSync(outsideFile, 'private data');
  const children = [];
  const manager = createDownloadManager({
    cacheDir,
    ytdlpCommand: 'yt-dlp-test',
    ffmpegCommand: 'ffmpeg-test',
    spawnProcess() { const child = fakeChild(); children.push(child); return child; }
  });
  t.after(() => manager.dispose());

  const symlinkJob = manager.start('https://youtu.be/symlink');
  const symlinkPath = path.join(cacheDir, symlinkJob.id, 'source.mkv');
  let symlinkAvailable = true;
  try {
    symlinkSync(outsideFile, symlinkPath, 'file');
  } catch (error) {
    if (!['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) throw error;
    symlinkAvailable = false;
    t.diagnostic(`file symlink coverage unavailable (${error.code}); hard-link escape is still tested`);
  }
  if (symlinkAvailable) {
    children[0].stdout.end(`__PENUMBRA_FILE__${symlinkPath}\n`);
    children[0].emit('close', 0);
    assert.equal(manager.get(symlinkJob.id).status, 'failed');
    assert.equal(children.length, 1, 'FFmpeg must not receive a symlinked source');
    assert.equal(readFileSync(outsideFile, 'utf8'), 'private data');
  } else {
    manager.cancel(symlinkJob.id);
    children[0].emit('close', null);
  }

  const hardlinkJob = manager.start('https://youtu.be/hardlink');
  const hardlinkPath = path.join(cacheDir, hardlinkJob.id, 'source.mkv');
  linkSync(outsideFile, hardlinkPath);
  const hardlinkChild = children.at(-1);
  hardlinkChild.stdout.end(`__PENUMBRA_FILE__${hardlinkPath}\n`);
  hardlinkChild.emit('close', 0);
  assert.equal(manager.get(hardlinkJob.id).status, 'failed');
  assert.equal(children.length, 2, 'FFmpeg must not receive a hard-linked source');
  assert.equal(readFileSync(outsideFile, 'utf8'), 'private data');
});

test('removes expired orphan cache folders when the manager starts', t => {
  const cacheDir = mkdtempSync(path.join(os.tmpdir(), 'penumbra-youtube-test-'));
  t.after(() => rmSync(cacheDir, { recursive: true, force: true }));
  const staleDir = path.join(cacheDir, '123e4567-e89b-12d3-a456-426614174000');
  mkdirSync(staleDir);
  writeFileSync(path.join(staleDir, 'old.mp4'), 'expired');
  const oldTime = new Date(Date.now() - 10_000);
  utimesSync(staleDir, oldTime, oldTime);
  const manager = createDownloadManager({ cacheDir, ttlMs: 1_000, ytdlpCommand: 'yt-dlp-test' });
  t.after(() => manager.dispose());
  assert.equal(existsSync(staleDir), false);
});
