const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ALLOWED_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be'
]);
const DEFAULT_TTL_MS = 4 * 60 * 60 * 1000;
const ACTIVE_STATUSES = new Set(['downloading', 'converting', 'cancelling']);

class YouTubeDownloadError extends Error {
  constructor(message, code = 'INVALID_REQUEST', status = 400) {
    super(message);
    this.name = 'YouTubeDownloadError';
    this.code = code;
    this.status = status;
  }
}

function validateYouTubeUrl(value) {
  let url;
  try {
    url = new URL(String(value || '').trim());
  } catch {
    throw new YouTubeDownloadError('URL inválida. Cole um link de vídeo do YouTube.');
  }
  const hostname = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || !ALLOWED_HOSTS.has(hostname) || url.username || url.password || url.port) {
    throw new YouTubeDownloadError('Use uma URL HTTPS de vídeo do youtube.com ou youtu.be.');
  }

  let videoId = url.searchParams.get('v');
  if (hostname === 'youtu.be') videoId = url.pathname.split('/').filter(Boolean)[0];
  if (!videoId && /^\/(?:shorts|embed|live)\/[^/]+/.test(url.pathname)) {
    videoId = url.pathname.split('/')[2];
  }
  if (!videoId) {
    throw new YouTubeDownloadError('Cole o link de um vídeo individual; links de playlist sem vídeo não são aceitos nesta fase.');
  }
  const canonicalUrl = new URL('https://www.youtube.com/watch');
  canonicalUrl.searchParams.set('v', videoId);
  return canonicalUrl;
}

function parseProgressLine(line) {
  const parts = String(line || '').trim().split('|');
  if (parts.length !== 3) return null;
  const downloaded = Number(parts[0]);
  const reportedTotal = Number(parts[1]) || Number(parts[2]);
  if (!Number.isFinite(downloaded) || downloaded < 0) return null;
  const totalBytes = Number.isFinite(reportedTotal) && reportedTotal > 0 ? reportedTotal : null;
  const percent = totalBytes === null ? null : Math.max(0, Math.min(99, Math.round((downloaded / totalBytes) * 1000) / 10));
  return { downloadedBytes: downloaded, totalBytes, percent };
}

function parseTimestampSeconds(value) {
  const match = String(value || '').match(/^(\d+):(\d{2}):(\d{2}(?:\.\d+)?)$/);
  if (!match) return null;
  return (Number(match[1]) * 3600) + (Number(match[2]) * 60) + Number(match[3]);
}

function safeText(value, limit = 300) {
  return String(value || '').replace(/[\u0000-\u001f\u007f\u001b]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function safeJobFilePath(cacheDir, jobDirectory, candidate, { allowMissing = false } = {}) {
  const cachePath = path.resolve(cacheDir);
  const directoryPath = path.resolve(jobDirectory);
  const candidatePath = path.resolve(candidate);
  if (directoryPath === cachePath || !isInside(cachePath, directoryPath) || !isInside(directoryPath, candidatePath)) return null;

  let cacheRealPath;
  let directoryInfo;
  let directoryRealPath;
  let parentRealPath;
  try {
    cacheRealPath = fs.realpathSync(cachePath);
    directoryInfo = fs.lstatSync(directoryPath);
    if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink()) return null;
    directoryRealPath = fs.realpathSync(directoryPath);
    parentRealPath = fs.realpathSync(path.dirname(candidatePath));
  } catch {
    return null;
  }
  if (!isInside(cacheRealPath, directoryRealPath) || !isInside(directoryRealPath, parentRealPath)) return null;

  let candidateInfo;
  try {
    candidateInfo = fs.lstatSync(candidatePath);
  } catch (error) {
    if (allowMissing && error.code === 'ENOENT') return path.join(parentRealPath, path.basename(candidatePath));
    return null;
  }
  if (candidateInfo.isSymbolicLink() || !candidateInfo.isFile() || candidateInfo.nlink > 1) return null;

  try {
    const candidateRealPath = fs.realpathSync(candidatePath);
    return isInside(directoryRealPath, candidateRealPath) ? candidateRealPath : null;
  } catch {
    return null;
  }
}

function removeJobDirectory(cacheDir, jobDirectory) {
  const cachePath = path.resolve(cacheDir);
  const directoryPath = path.resolve(jobDirectory);
  if (directoryPath === cachePath || !isInside(cachePath, directoryPath)) return false;
  try {
    const info = fs.lstatSync(directoryPath);
    if (info.isSymbolicLink()) {
      fs.unlinkSync(directoryPath);
      return true;
    }
    if (!info.isDirectory()) return false;
    const cacheRealPath = fs.realpathSync(cachePath);
    const directoryRealPath = fs.realpathSync(directoryPath);
    if (!isInside(cacheRealPath, directoryRealPath) || cacheRealPath === directoryRealPath) return false;
    fs.rmSync(directoryRealPath, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

function createDownloadManager(options = {}) {
  const cacheDir = path.resolve(options.cacheDir || process.env.PENUMBRA_YOUTUBE_CACHE_DIR || path.join(os.homedir(), '.penumbra', 'cache', 'youtube'));
  const uvYtDlp = path.join(os.homedir(), '.local', 'bin', process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
  const defaultYtDlp = fs.existsSync(uvYtDlp) ? uvYtDlp : (process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
  const ytdlpCommand = options.ytdlpCommand || process.env.PENUMBRA_YTDLP_BIN || defaultYtDlp;
  const ffmpegCommand = options.ffmpegCommand || process.env.PENUMBRA_FFMPEG_BIN || 'ffmpeg';
  const jsRuntimePath = options.jsRuntimePath || process.execPath;
  const spawnProcess = options.spawnProcess || spawn;
  const ttlMs = options.ttlMs || DEFAULT_TTL_MS;
  const jobs = new Map();

  fs.mkdirSync(cacheDir, { recursive: true });
  for (const entry of fs.readdirSync(cacheDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^[0-9a-f-]{36}$/i.test(entry.name)) continue;
    const orphanPath = path.join(cacheDir, entry.name);
    try {
      if (Date.now() - fs.statSync(orphanPath).mtimeMs > ttlMs) {
        fs.rmSync(orphanPath, { recursive: true, force: true });
      }
    } catch {}
  }

  function publicJob(job) {
    return {
      id: job.id,
      status: job.status,
      title: job.title,
      duration: job.duration,
      percent: job.percent,
      downloadedBytes: job.downloadedBytes,
      totalBytes: job.totalBytes,
      createdAt: job.createdAt,
      lastProgressAt: job.lastProgressAt,
      error: job.error
    };
  }

  function parseYtDlpLine(job, line) {
    if (line.startsWith('__PENUMBRA_TITLE__')) {
      job.title = safeText(line.slice('__PENUMBRA_TITLE__'.length), 200) || 'Vídeo do YouTube';
      return;
    }
    if (line.startsWith('__PENUMBRA_DURATION__')) {
      const duration = Number(line.slice('__PENUMBRA_DURATION__'.length));
      if (Number.isFinite(duration) && duration > 0) job.duration = duration;
      return;
    }
    if (line.startsWith('__PENUMBRA_FILE__')) {
      job.sourceFile = path.resolve(line.slice('__PENUMBRA_FILE__'.length).trim());
      return;
    }
    const progress = parseProgressLine(line);
    if (progress !== null) {
      job.downloadedBytes = progress.downloadedBytes;
      job.totalBytes = progress.totalBytes;
      job.percent = progress.percent === null ? null : Math.round(progress.percent * 0.8 * 10) / 10;
      job.lastProgressAt = Date.now();
    }
  }

  function parseFfmpegLine(job, line) {
    if (!line.startsWith('out_time=') || !Number.isFinite(job.duration) || job.duration <= 0) return;
    const seconds = parseTimestampSeconds(line.slice('out_time='.length));
    if (seconds === null) return;
    job.percent = Math.min(99, Math.max(80, Math.round((80 + (Math.min(seconds, job.duration) / job.duration) * 19) * 10) / 10));
    job.lastProgressAt = Date.now();
  }

  function drainLines(job, chunk, target) {
    target.buffer += chunk.toString('utf8');
    const lines = target.buffer.split(/\r?\n/);
    target.buffer = lines.pop() || '';
    for (const line of lines) {
      if (target.kind === 'stdout') parseYtDlpLine(job, line.trim());
      else if (target.kind === 'ffmpeg') parseFfmpegLine(job, line.trim());
      else if (line.trim()) job.lastError = safeText(line, 500);
    }
  }

  function fail(job, message) {
    const wasCancelling = job.status === 'cancelling';
    job.status = wasCancelling ? 'cancelled' : 'failed';
    job.error = wasCancelling ? null : safeText(message || 'O download falhou. Verifique yt-dlp, FFmpeg e a conexão.');
    job.process = null;
    job.updatedAt = Date.now();
    if (wasCancelling) removeJobDirectory(cacheDir, job.directory);
  }

  function startConversion(job) {
    const safeSourceFile = job.sourceFile && safeJobFilePath(cacheDir, job.directory, job.sourceFile);
    if (!safeSourceFile) {
      fail(job, 'yt-dlp não encontrou o arquivo de vídeo final.');
      return;
    }
    job.sourceFile = safeSourceFile;
    job.status = 'converting';
    job.percent = 80;
    job.updatedAt = Date.now();
    const requestedOutputFile = path.join(job.directory, 'playback.mp4');
    job.outputFile = safeJobFilePath(cacheDir, job.directory, requestedOutputFile, { allowMissing: true });
    if (!job.outputFile) {
      fail(job, 'O caminho de saída do vídeo temporário não é seguro.');
      return;
    }
    const args = [
      '-nostdin', '-hide_banner', '-loglevel', 'error', '-progress', 'pipe:1', '-nostats', '-y',
      '-i', job.sourceFile,
      '-map', '0:v:0', '-map', '0:a:0?', '-sn', '-dn',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18',
      '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart',
      job.outputFile
    ];
    let child;
    try {
      child = spawnProcess(ffmpegCommand, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) {
      fail(job, `Não foi possível iniciar FFmpeg: ${safeText(error.message)}`);
      return;
    }
    job.process = child;
    const stderr = { buffer: '', kind: 'stderr' };
    const progress = { buffer: '', kind: 'ffmpeg' };
    if (child.stdout) child.stdout.on('data', chunk => drainLines(job, chunk, progress));
    if (child.stderr) child.stderr.on('data', chunk => drainLines(job, chunk, stderr));
    let settled = false;
    child.once('error', error => {
      if (settled) return;
      settled = true;
      fail(job, error.code === 'ENOENT' ? 'FFmpeg não encontrado. Instale o FFmpeg e reinicie o Penumbra.' : `Falha no FFmpeg: ${safeText(error.message)}`);
    });
    child.once('close', code => {
      if (settled) return;
      settled = true;
      if (job.status === 'cancelling') {
        job.status = 'cancelled';
        job.process = null;
        job.updatedAt = Date.now();
        removeJobDirectory(cacheDir, job.directory);
        return;
      }
      const safeOutputFile = safeJobFilePath(cacheDir, job.directory, job.outputFile);
      let outputSize = 0;
      if (safeOutputFile) {
        try { outputSize = fs.statSync(safeOutputFile).size; } catch {}
      }
      if (code !== 0 || !safeOutputFile || outputSize === 0) {
        fail(job, stderr.buffer || job.lastError || 'FFmpeg não conseguiu preparar o vídeo para reprodução.');
        return;
      }
      const safeSourceFile = safeJobFilePath(cacheDir, job.directory, job.sourceFile);
      if (!safeSourceFile) {
        fail(job, 'O arquivo temporário de origem deixou de ser seguro.');
        return;
      }
      try {
        fs.rmSync(safeSourceFile, { force: true });
      } catch (error) {
        fail(job, `Não foi possível limpar o vídeo temporário de origem: ${safeText(error.message)}`);
        return;
      }
      job.outputFile = safeOutputFile;
      job.status = 'complete';
      job.percent = 100;
      job.process = null;
      job.updatedAt = Date.now();
    });
  }

  function start(value) {
    const url = validateYouTubeUrl(value);
    if ([...jobs.values()].some(job => ACTIVE_STATUSES.has(job.status))) {
      throw new YouTubeDownloadError('Já existe um download ativo. Aguarde ou cancele antes de iniciar outro.', 'DOWNLOAD_ACTIVE', 429);
    }
    const id = crypto.randomUUID();
    const directory = path.join(cacheDir, id);
    fs.mkdirSync(directory, { recursive: true });
    const job = {
      id, url: url.href, directory, title: 'Preparando link…', duration: null,
      status: 'downloading', percent: null, downloadedBytes: 0, totalBytes: null,
      process: null, sourceFile: null,
      outputFile: null, error: null, lastError: '', createdAt: Date.now(), lastProgressAt: null, updatedAt: Date.now()
    };
    jobs.set(id, job);

    const args = [
      '--ignore-config', '--no-playlist', '--no-warnings', '--newline',
      '--js-runtimes', `node:${jsRuntimePath}`,
      '--format', 'bv*+ba/b', '--merge-output-format', 'mkv',
      '--progress-template', 'download:%(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.total_bytes_estimate)s',
      '--print', 'before_dl:__PENUMBRA_TITLE__%(title)s',
      '--print', 'before_dl:__PENUMBRA_DURATION__%(duration)s',
      '--print', 'after_move:__PENUMBRA_FILE__%(filepath)s',
      '--output', path.join(directory, 'source.%(ext)s'), url.href
    ];
    if (path.isAbsolute(ffmpegCommand)) args.unshift('--ffmpeg-location', path.dirname(ffmpegCommand));

    let child;
    try {
      child = spawnProcess(ytdlpCommand, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) {
      fail(job, error.code === 'ENOENT' ? 'yt-dlp não encontrado. Instale yt-dlp[default] e reinicie o Penumbra.' : `Falha ao iniciar yt-dlp: ${safeText(error.message)}`);
      return publicJob(job);
    }
    job.process = child;
    const stdout = { buffer: '', kind: 'stdout' };
    const stderr = { buffer: '', kind: 'stderr' };
    if (child.stdout) child.stdout.on('data', chunk => drainLines(job, chunk, stdout));
    if (child.stderr) child.stderr.on('data', chunk => drainLines(job, chunk, stderr));
    let settled = false;
    child.once('error', error => {
      if (settled) return;
      settled = true;
      fail(job, error.code === 'ENOENT' ? 'yt-dlp não encontrado. Instale yt-dlp[default] e reinicie o Penumbra.' : `Falha ao iniciar yt-dlp: ${safeText(error.message)}`);
    });
    child.once('close', code => {
      if (settled) return;
      settled = true;
      if (job.status === 'cancelling') {
        job.status = 'cancelled';
        job.process = null;
        job.updatedAt = Date.now();
        removeJobDirectory(cacheDir, job.directory);
        return;
      }
      if (code !== 0) {
        fail(job, job.lastError || 'yt-dlp falhou ao obter o vídeo.');
        return;
      }
      startConversion(job);
    });
    return publicJob(job);
  }

  function get(id) {
    const job = jobs.get(id);
    if (!job) return null;
    if (!ACTIVE_STATUSES.has(job.status) && Date.now() - job.updatedAt > ttlMs) {
      jobs.delete(id);
      removeJobDirectory(cacheDir, job.directory);
      return null;
    }
    return publicJob(job);
  }

  function getMediaPath(id) {
    const job = jobs.get(id);
    if (!job || job.status !== 'complete' || !job.outputFile) return null;
    return safeJobFilePath(cacheDir, job.directory, job.outputFile);
  }

  function cancel(id) {
    const job = jobs.get(id);
    if (!job || !['downloading', 'converting'].includes(job.status)) return false;
    const previousStatus = job.status;
    job.status = 'cancelling';
    job.updatedAt = Date.now();
    try {
      if (job.process && typeof job.process.kill === 'function') job.process.kill('SIGTERM');
    } catch {
      job.status = previousStatus;
      job.updatedAt = Date.now();
      return false;
    }
    return true;
  }

  function prune() {
    const now = Date.now();
    for (const [id, job] of jobs) {
      if (!ACTIVE_STATUSES.has(job.status) && job.status !== 'cancelling' && now - job.updatedAt > ttlMs) {
        jobs.delete(id);
        removeJobDirectory(cacheDir, job.directory);
      }
    }
  }
  const pruneTimer = setInterval(prune, Math.min(ttlMs, 60_000));
  if (typeof pruneTimer.unref === 'function') pruneTimer.unref();

  return {
    start,
    get,
    getMediaPath,
    cancel,
    dispose() {
      clearInterval(pruneTimer);
      for (const job of jobs.values()) {
        if (ACTIVE_STATUSES.has(job.status)) {
          job.status = 'cancelling';
          try {
            if (job.process && typeof job.process.kill === 'function') job.process.kill('SIGTERM');
          } catch {}
          removeJobDirectory(cacheDir, job.directory);
        }
      }
    }
  };
}

module.exports = {
  YouTubeDownloadError,
  createDownloadManager,
  parseProgressLine,
  validateYouTubeUrl
};
