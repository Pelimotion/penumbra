const express = require('express');
const http = require('http');
const https = require('https');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const dgram = require('dgram');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;
const OSC_PORT = 7000;
const AUDIO_BRAIN_WS_PORT = 7001;

const ROOT_DIR = path.resolve(__dirname, '..');
const WORKSPACE_DIR = path.resolve(ROOT_DIR, '..');
const MANIFEST_PATH = path.join(ROOT_DIR, 'media_pool', 'media_manifest.json');
const THUMBS_DIR = path.join(ROOT_DIR, 'media_pool', 'thumbnails');
const MATTES_DIR = path.join(ROOT_DIR, 'media_pool', 'mattes');
const DOWNLOADS_DIR = path.join(ROOT_DIR, 'media_pool', 'downloads');
if (!fs.existsSync(DOWNLOADS_DIR)) fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });

const USER_PROFILE_PATH = path.join(WORKSPACE_DIR, 'penumbra_user_profile.json');
const USER_PROFILE_PUBLIC_PATH = path.join(__dirname, 'public', 'penumbra_user_profile.json');

const AUDIO_TRACK_PATH = '/Volumes/PLM_SSD_01/Musica/Tracks Autorais/01 REC-2024-04-28.mp3';

// System PATH & Binaries for media downloading and transcoding
const SYSTEM_PATH = process.env.PATH || '';
const ENHANCED_PATH = `/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${SYSTEM_PATH}`;
const YTDLP_BIN = fs.existsSync('/opt/homebrew/bin/yt-dlp') ? '/opt/homebrew/bin/yt-dlp' : 'yt-dlp';
const FFMPEG_BIN = fs.existsSync('/opt/homebrew/bin/ffmpeg') ? '/opt/homebrew/bin/ffmpeg' : 'ffmpeg';
const FFPROBE_BIN = fs.existsSync('/opt/homebrew/bin/ffprobe') ? '/opt/homebrew/bin/ffprobe' : 'ffprobe';

const activeJobs = new Map();

// Middleware
app.use((req, res, next) => {
  const origin = req.headers.origin;
  // SECURITY: Restrict strictly to localhost to prevent unauthorized remote control
  if (origin === 'http://localhost:3000' || origin === 'https://localhost:3000') {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type,Range');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/penumbra', express.static(path.join(__dirname, 'public')));
app.use('/thumbnails', express.static(THUMBS_DIR));
app.use('/downloads', express.static(DOWNLOADS_DIR));

// Smart Matte Static Resolver (finds mattes with direct or category-prefixed paths)
app.use('/mattes', (req, res, next) => {
  const directPath = path.join(MATTES_DIR, req.path);
  if (fs.existsSync(directPath) && fs.statSync(directPath).isFile()) {
    return res.sendFile(directPath);
  }
  const baseName = path.basename(req.path);
  const categories = ['cat_a_solids', 'cat_b_soft', 'cat_c_tempo', 'cat_d_procedural', 'cat_e_structural'];
  for (const cat of categories) {
    const subPath = path.join(MATTES_DIR, cat, baseName);
    if (fs.existsSync(subPath)) {
      return res.sendFile(subPath);
    }
  }
  next();
});
app.use('/mattes', express.static(MATTES_DIR));

const MATTES_MANIFEST_PATH = path.join(ROOT_DIR, 'media_pool', 'mattes_manifest.json');

// In-memory Manifest Cache
let cachedManifest = null;
function getManifest() {
  if (cachedManifest) return cachedManifest;
  if (fs.existsSync(MANIFEST_PATH)) {
    try {
      cachedManifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
      return cachedManifest;
    } catch (e) {
      console.warn('Error reading manifest file:', e);
    }
  }
  return [];
}

function saveManifest(manifestData) {
  cachedManifest = manifestData;
  try {
    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifestData, null, 2), 'utf-8');
    const publicManifest = path.join(__dirname, 'public', 'media_manifest.json');
    if (fs.existsSync(path.dirname(publicManifest))) {
      fs.writeFileSync(publicManifest, JSON.stringify(manifestData, null, 2), 'utf-8');
    }
    return true;
  } catch (e) {
    console.error('Error saving manifest:', e);
    return false;
  }
}

// ============================================================================
// CENTRALIZED USER PROFILE & LOCAL CACHE MANAGEMENT
// ============================================================================
function getUserProfile() {
  let profile = null;
  if (fs.existsSync(USER_PROFILE_PATH)) {
    try {
      profile = JSON.parse(fs.readFileSync(USER_PROFILE_PATH, 'utf-8'));
    } catch (e) {
      console.warn('Erro ao ler penumbra_user_profile.json:', e);
    }
  } else if (fs.existsSync(USER_PROFILE_PUBLIC_PATH)) {
    try {
      profile = JSON.parse(fs.readFileSync(USER_PROFILE_PUBLIC_PATH, 'utf-8'));
    } catch (e) {}
  }

  if (!profile) {
    profile = {
      schema_version: "1.2.0",
      app: "Penumbra System VJ Engine",
      last_saved: new Date().toISOString(),
      settings: {
        media_source: "cdn",
        remember_source: true,
        cdn_pin: "2026",
        target_fps: 30,
        osc_enabled: false,
        lan_ip: "localhost",
        active_macro_state: "GROOVE",
        active_macro_preset: "Pure Clean Cinema",
        grading: { gamma: 0.85, black_pedestal: -0.05, mid_density: 1.0, sobel_mix: 0.22, contrast: 1.0 },
        audio: { input: "line_in", headphone_monitor: false, headphone_volume: 0.8 },
        ui: { group_by_category: true, active_source_filter: "ALL", active_category_filter: "ALL", hover_preview_enabled: true, hover_preview_delay_ms: 280 }
      },
      custom_clips: [],
      category_overrides: {},
      cached_media_registry: {}
    };
  }

  // Auto-scan downloads/ to synchronize cached_media_registry in real time
  if (!profile.cached_media_registry) profile.cached_media_registry = {};
  if (fs.existsSync(DOWNLOADS_DIR)) {
    try {
      const files = fs.readdirSync(DOWNLOADS_DIR).filter(f => !f.startsWith('.'));
      files.forEach(f => {
        const fullPath = path.join(DOWNLOADS_DIR, f);
        try {
          const stat = fs.statSync(fullPath);
          if (stat.isFile()) {
            profile.cached_media_registry[f] = {
              filename: f,
              local_path: `downloads/${f}`,
              size_mb: Math.round((stat.size / (1024 * 1024)) * 100) / 100,
              cached_at: stat.mtime.toISOString(),
              is_downloaded: true
            };
          }
        } catch (e) {}
      });
    } catch (e) {}
  }

  if (!fs.existsSync(USER_PROFILE_PATH)) {
    saveUserProfile(profile);
  }

  return profile;
}

function saveUserProfile(profileData) {
  try {
    profileData.last_saved = new Date().toISOString();
    const jsonStr = JSON.stringify(profileData, null, 2);
    fs.writeFileSync(USER_PROFILE_PATH, jsonStr, 'utf-8');
    if (fs.existsSync(path.dirname(USER_PROFILE_PUBLIC_PATH))) {
      fs.writeFileSync(USER_PROFILE_PUBLIC_PATH, jsonStr, 'utf-8');
    }
    return true;
  } catch (e) {
    console.error('Erro ao salvar penumbra_user_profile.json:', e);
    return false;
  }
}

// 0. User Profile REST API Endpoints
app.get('/api/user/profile', (req, res) => {
  res.json(getUserProfile());
});

app.post('/api/user/profile', (req, res) => {
  const incoming = req.body;
  if (!incoming || typeof incoming !== 'object') {
    return res.status(400).json({ error: 'Invalid profile data' });
  }
  const current = getUserProfile();
  const merged = {
    ...current,
    ...incoming,
    settings: { ...current.settings, ...(incoming.settings || {}) },
    category_overrides: { ...current.category_overrides, ...(incoming.category_overrides || {}) },
    cached_media_registry: { ...current.cached_media_registry, ...(incoming.cached_media_registry || {}) }
  };
  if (Array.isArray(incoming.custom_clips)) {
    merged.custom_clips = incoming.custom_clips;
  }
  saveUserProfile(merged);
  broadcast({ type: 'user_profile_updated', profile: merged });
  res.json({ success: true, profile: merged });
});

app.get('/api/user/profile/export', (req, res) => {
  const profile = getUserProfile();
  res.setHeader('Content-Disposition', 'attachment; filename="penumbra_user_profile.json"');
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(profile, null, 2));
});

app.post('/api/user/profile/import', (req, res) => {
  const profileData = req.body;
  if (!profileData || typeof profileData !== 'object') {
    return res.status(400).json({ error: 'Invalid profile format' });
  }
  saveUserProfile(profileData);
  broadcast({ type: 'user_profile_updated', profile: profileData });
  res.json({ success: true, message: 'Perfil restaurado com sucesso!' });
});

// Cache status endpoint
app.get('/api/cache/status', (req, res) => {
  const profile = getUserProfile();
  const reg = profile.cached_media_registry || {};
  const items = Object.values(reg);
  const totalMb = items.reduce((acc, it) => acc + (it.size_mb || 0), 0);
  res.json({
    cached_count: items.length,
    total_size_mb: Math.round(totalMb * 100) / 100,
    items: reg
  });
});

// Cache Download Endpoint (Bunny CDN, direct URL or YouTube)
app.post('/api/cache/download-clip', async (req, res) => {
  const { clipId, url, filename, category } = req.body;
  if (!clipId && !url) return res.status(400).json({ error: 'clipId or url required' });

  const manifest = getManifest();
  const clip = manifest.find(c => c.id === clipId || c.filename === clipId || c.relative_path === url);
  const targetUrl = url || (clip ? (clip.relative_path.startsWith('http') ? clip.relative_path : `https://gigantera-penumbra.b-cdn.net/${clip.relative_path.replace(/^\//, '')}`) : null);
  const targetFilename = filename || (clip ? clip.filename : `clip_${Date.now()}.mp4`);
  const safeFilename = path.basename(targetFilename);
  const localDest = path.join(DOWNLOADS_DIR, safeFilename);

  // If already on disk, zero-waste: immediate response!
  if (fs.existsSync(localDest)) {
    const stat = fs.statSync(localDest);
    const sizeMb = Math.round((stat.size / (1024 * 1024)) * 100) / 100;
    const profile = getUserProfile();
    profile.cached_media_registry[safeFilename] = {
      filename: safeFilename,
      local_path: `downloads/${safeFilename}`,
      size_mb: sizeMb,
      cached_at: stat.mtime.toISOString(),
      is_downloaded: true
    };
    if (clipId) profile.cached_media_registry[clipId] = profile.cached_media_registry[safeFilename];
    saveUserProfile(profile);
    return res.json({
      success: true,
      already_cached: true,
      local_path: `downloads/${safeFilename}`,
      size_mb: sizeMb,
      clipId
    });
  }

  // Perform stream download
  try {
    const fileStream = fs.createWriteStream(localDest);
    const client = targetUrl.startsWith('https') ? https : http;

    client.get(targetUrl, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        const redirectUrl = response.headers.location;
        const redClient = redirectUrl.startsWith('https') ? https : http;
        redClient.get(redirectUrl, (redResp) => {
          redResp.pipe(fileStream);
          fileStream.on('finish', () => finalizeDownload());
        }).on('error', (err) => {
          try { fs.unlinkSync(localDest); } catch(e){}
          if (!res.headersSent) res.status(500).json({ error: err.message });
        });
        return;
      }

      if (response.statusCode !== 200) {
        try { fs.unlinkSync(localDest); } catch(e){}
        if (!res.headersSent) return res.status(response.statusCode).json({ error: `CDN status ${response.statusCode}` });
        return;
      }

      response.pipe(fileStream);
      fileStream.on('finish', () => finalizeDownload());
    }).on('error', (err) => {
      try { fs.unlinkSync(localDest); } catch(e){}
      if (!res.headersSent) res.status(500).json({ error: err.message });
    });

    async function finalizeDownload() {
      fileStream.close();
      const stat = fs.statSync(localDest);
      const sizeMb = Math.round((stat.size / (1024 * 1024)) * 100) / 100;

      // Extract thumbnail with ffmpeg if needed
      const thumbName = `thumb_${path.basename(safeFilename, path.extname(safeFilename))}.jpg`;
      const thumbDest = path.join(THUMBS_DIR, thumbName);
      if (!fs.existsSync(thumbDest)) {
        try {
          spawn(FFMPEG_BIN, ['-y', '-ss', '00:00:02', '-i', localDest, '-vframes', '1', '-q:v', '2', thumbDest], {
            env: { ...process.env, PATH: ENHANCED_PATH }
          });
        } catch (e) {}
      }

      const profile = getUserProfile();
      profile.cached_media_registry[safeFilename] = {
        filename: safeFilename,
        local_path: `downloads/${safeFilename}`,
        size_mb: sizeMb,
        cached_at: new Date().toISOString(),
        is_downloaded: true
      };
      if (clipId) {
        profile.cached_media_registry[clipId] = profile.cached_media_registry[safeFilename];
      }
      saveUserProfile(profile);

      broadcast({
        type: 'clip_cached',
        clipId: clipId || safeFilename,
        filename: safeFilename,
        local_path: `downloads/${safeFilename}`,
        size_mb: sizeMb
      });

      console.log(`[✓] Clipe guardado no cache local permanente: ${safeFilename} (${sizeMb} MB)`);
      if (!res.headersSent) {
        res.json({
          success: true,
          cached: true,
          local_path: `downloads/${safeFilename}`,
          size_mb: sizeMb,
          clipId
        });
      }
    }
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

// 1. Manifest Endpoint
app.get('/api/manifest', (req, res) => {
  res.json(getManifest());
});

// 1.1 Mattes Catalog Endpoint
app.get('/api/mattes', (req, res) => {
  if (fs.existsSync(MATTES_MANIFEST_PATH)) {
    try {
      const data = JSON.parse(fs.readFileSync(MATTES_MANIFEST_PATH, 'utf-8'));
      return res.json(data);
    } catch (e) {}
  }
  return res.json([]);
});

// 2. Dynamic Rescan Endpoint (Auto-discovers new files added to 1. In)
app.post('/api/rescan', (req, res) => {
  console.log('[*] Rescan requested by client...');
  const scannerScript = path.join(ROOT_DIR, 'media_pool', 'scanner.py');
  const pyProc = spawn('python3', [scannerScript], { cwd: WORKSPACE_DIR });

  pyProc.on('close', (code) => {
    console.log(`[✓] Rescan completed with code ${code}`);
    cachedManifest = null; // Bust cache
    const data = getManifest();
    broadcast({ type: 'manifest_updated', data });
    res.json({ success: code === 0, count: data.length });
  });
});

// ============================================================================
// 2.5 NEXUS STREAM ENGINE & DOWNLOADER ENDPOINTS
// ============================================================================

// A. Resolve Stream Metadata & Direct URLs in Real Time
app.post('/api/stream/resolve', (req, res) => {
  const { url } = req.body;
  if (!url || typeof url !== 'string') return res.status(400).json({ error: 'URL required' });

  const isYt = /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/|live\/))([\w-]{11})/.test(url);

  if (isYt) {
    const metaProc = spawn(YTDLP_BIN, [
      '--print', '%(title)s###%(duration)s###%(thumbnail)s###%(id)s',
      '--no-warnings',
      url
    ], { env: { ...process.env, PATH: ENHANCED_PATH } });

    let stdout = '';
    metaProc.stdout.on('data', d => { stdout += d.toString(); });
    metaProc.on('close', (code) => {
      const parts = stdout.trim().split('###');
      const title = parts[0] || 'YouTube Video';
      const duration = parseFloat(parts[1]) || 120.0;
      const thumbnail = parts[2] || '';
      const videoId = parts[3] || '';

      const streamProc = spawn(YTDLP_BIN, [
        '-g',
        '-f', 'best[ext=mp4][height<=1080]/best[height<=1080]/best',
        '--no-warnings',
        url
      ], { env: { ...process.env, PATH: ENHANCED_PATH } });

      let streamUrl = '';
      streamProc.stdout.on('data', d => { streamUrl += d.toString(); });
      streamProc.on('close', (sCode) => {
        streamUrl = streamUrl.trim().split('\n')[0];
        res.json({
          success: true,
          is_youtube: true,
          videoId,
          title,
          duration,
          thumbnail: thumbnail || (videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : ''),
          streamUrl,
          proxyUrl: streamUrl ? `/api/stream/proxy?url=${encodeURIComponent(streamUrl)}` : ''
        });
      });
    });
  } else {
    const base = path.basename(url.split('?')[0]) || 'Stream Feed';
    res.json({
      success: true,
      is_youtube: false,
      title: base,
      duration: 9999.0,
      thumbnail: '',
      streamUrl: url,
      proxyUrl: `/api/stream/proxy?url=${encodeURIComponent(url)}`
    });
  }
});

// B. Streaming Proxy with Wide CORS for Canvas Render Loop
app.get('/api/stream/proxy', (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send('URL missing');

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);

  try {
    const client = targetUrl.startsWith('https') ? https : http;
    const reqHeaders = {};
    if (req.headers.range) reqHeaders.range = req.headers.range;

    const proxyReq = client.get(targetUrl, { headers: reqHeaders }, (proxyRes) => {
      const resHeaders = { ...proxyRes.headers };
      resHeaders['access-control-allow-origin'] = '*';
      res.writeHead(proxyRes.statusCode, resHeaders);
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
      console.warn('[Proxy] Stream request error:', err.message);
      if (!res.headersSent) res.status(502).send('Proxy error');
    });

    req.on('close', () => {
      proxyReq.destroy();
    });
  } catch (err) {
    if (!res.headersSent) res.status(500).send('Proxy error');
  }
});

// C. Asynchronous Media Downloader (Transcoding, Metadata & Manifest Integration)
app.post('/api/stream/download', (req, res) => {
  const { url, category, title, project } = req.body;
  if (!url) return res.status(400).json({ error: 'URL required' });

  const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const jobState = {
    id: jobId,
    url,
    category: category || 'STREAMS & YOUTUBE',
    title: title || '',
    project: project || 'Streams & Downloads',
    status: 'iniciando',
    progress: 0,
    speed: '',
    eta: '',
    error: null,
    createdAt: Date.now()
  };
  activeJobs.set(jobId, jobState);

  res.json({ success: true, jobId, message: 'Download iniciado' });
  broadcast({ type: 'download_job_started', job: jobState });

  (async () => {
    try {
      const isYt = /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/|live\/))([\w-]{11})/.test(url);
      const outputTemplate = path.join(DOWNLOADS_DIR, '%(id)s_%(title).60s.%(ext)s');

      let downloadArgs;
      if (isYt) {
        downloadArgs = [
          '-f', 'bestvideo[ext=mp4][height<=1080]+bestaudio[ext=m4a]/best[ext=mp4]/best',
          '--merge-output-format', 'mp4',
          '-o', outputTemplate,
          '--write-thumbnail',
          '--convert-thumbnails', 'jpg',
          '--newline',
          '--no-warnings',
          url
        ];
      } else {
        downloadArgs = [
          '-o', outputTemplate,
          '--newline',
          '--no-warnings',
          url
        ];
      }

      jobState.status = 'baixando';
      const dlProc = spawn(YTDLP_BIN, downloadArgs, { env: { ...process.env, PATH: ENHANCED_PATH } });

      let lastReport = 0;
      let finalFilePath = null;

      dlProc.stdout.on('data', (data) => {
        const text = data.toString();
        const match = text.match(/\[download\]\s+([\d\.]+)%\s+of\s+([^\s]+)\s+at\s+([^\s]+)\s+ETA\s+([^\s]+)/);
        if (match) {
          jobState.progress = parseFloat(match[1]);
          jobState.speed = match[3];
          jobState.eta = match[4];
          const now = Date.now();
          if (now - lastReport > 250) {
            lastReport = now;
            broadcast({ type: 'download_progress', job: jobState });
          }
        }
        const fileMatch = text.match(/\[(?:download|Merger|ffmpeg)\]\s+(?:Destination:\s+|Merging formats into\s+)"?([^"\n]+)"?/);
        if (fileMatch) {
          finalFilePath = fileMatch[1].trim();
        }
      });

      dlProc.on('close', async (code) => {
        if (code !== 0) {
          jobState.status = 'erro';
          jobState.error = `yt-dlp finalizou com código ${code}`;
          broadcast({ type: 'download_error', job: jobState });
          return;
        }

        jobState.status = 'processando_metadados';
        jobState.progress = 95;
        broadcast({ type: 'download_progress', job: jobState });

        if (!finalFilePath || !fs.existsSync(finalFilePath)) {
          const files = fs.readdirSync(DOWNLOADS_DIR)
            .filter(f => /\.(mp4|mov|webm|mkv)$/i.test(f))
            .map(f => ({ name: f, time: fs.statSync(path.join(DOWNLOADS_DIR, f)).mtimeMs }))
            .sort((a, b) => b.time - a.time);
          if (files.length > 0) finalFilePath = path.join(DOWNLOADS_DIR, files[0].name);
        }

        if (!finalFilePath || !fs.existsSync(finalFilePath)) {
          jobState.status = 'erro';
          jobState.error = 'Arquivo de vídeo não encontrado após download';
          broadcast({ type: 'download_error', job: jobState });
          return;
        }

        const fileName = path.basename(finalFilePath);
        const fileExt = path.extname(fileName).toLowerCase().replace('.', '');
        const fileStat = fs.statSync(finalFilePath);
        const clipId = `clip_dl_${Date.now()}`;

        let thumbFileName = '';
        const possibleThumb = finalFilePath.replace(/\.[^.]+$/, '.jpg');
        if (fs.existsSync(possibleThumb)) {
          const destThumbName = `thumb_${clipId}.jpg`;
          fs.copyFileSync(possibleThumb, path.join(THUMBS_DIR, destThumbName));
          thumbFileName = destThumbName;
        } else {
          const destThumbName = `thumb_${clipId}.jpg`;
          const thumbPath = path.join(THUMBS_DIR, destThumbName);
          try {
            await new Promise((resolve) => {
              const ff = spawn(FFMPEG_BIN, [
                '-y', '-ss', '00:00:02', '-i', finalFilePath,
                '-vframes', '1', '-q:v', '2', thumbPath
              ], { env: { ...process.env, PATH: ENHANCED_PATH } });
              ff.on('close', () => {
                if (fs.existsSync(thumbPath)) thumbFileName = destThumbName;
                resolve();
              });
            });
          } catch (e) {}
        }

        let meta = { width: 1920, height: 1080, duration: 10.0, fps: 30.0, codec: fileExt };
        try {
          await new Promise((resolve) => {
            const fp = spawn(FFPROBE_BIN, [
              '-v', 'error', '-select_streams', 'v:0',
              '-show_entries', 'stream=width,height,r_frame_rate,duration,codec_name',
              '-show_entries', 'format=duration',
              '-of', 'json', finalFilePath
            ], { env: { ...process.env, PATH: ENHANCED_PATH } });

            let fpOut = '';
            fp.stdout.on('data', d => { fpOut += d.toString(); });
            fp.on('close', () => {
              try {
                const j = JSON.parse(fpOut);
                const st = (j.streams && j.streams[0]) || {};
                const fmt = j.format || {};
                if (st.width) meta.width = parseInt(st.width);
                if (st.height) meta.height = parseInt(st.height);
                if (st.codec_name) meta.codec = st.codec_name;
                const dur = parseFloat(st.duration || fmt.duration || '0');
                if (dur > 0) meta.duration = Math.round(dur * 10) / 10;
                if (st.r_frame_rate && st.r_frame_rate.includes('/')) {
                  const [n, d] = st.r_frame_rate.split('/');
                  meta.fps = Math.round((parseInt(n) / parseInt(d)) * 10) / 10;
                }
              } catch (e) {}
              resolve();
            });
          });
        } catch (e) {}

        const cleanTitle = title || fileName.replace(/\.[^.]+$/, '').replace(/^[a-zA-Z0-9_-]{11}_/, '');

        const newClip = {
          id: clipId,
          filename: fileName,
          folder: "DOWNLOADS",
          relative_path: `downloads/${fileName}`,
          absolute_path: finalFilePath,
          width: meta.width,
          height: meta.height,
          duration: meta.duration,
          fps: meta.fps,
          codec: meta.codec,
          size_mb: Math.round((fileStat.size / (1024 * 1024)) * 100) / 100,
          category: category || 'STREAMS & YOUTUBE',
          suggested_layer: 0,
          has_chroma: false,
          thumbnail: thumbFileName,
          notes: `Baixado via Nexus Downloader de: ${url}`,
          project: project || 'Streams & Downloads',
          project_folder: 'DOWNLOADS',
          source: isYt ? 'youtube' : 'stream',
          is_downloaded: true,
          is_local: true,
          display_title: cleanTitle
        };

        const manifest = getManifest();
        manifest.unshift(newClip);
        saveManifest(manifest);

        try {
          const profile = getUserProfile();
          if (!profile.custom_clips) profile.custom_clips = [];
          if (!profile.custom_clips.some(c => c.id === newClip.id)) {
            profile.custom_clips.unshift(newClip);
          }
          if (!profile.cached_media_registry) profile.cached_media_registry = {};
          profile.cached_media_registry[newClip.filename] = {
            filename: newClip.filename,
            local_path: newClip.relative_path,
            size_mb: newClip.size_mb,
            cached_at: new Date().toISOString(),
            is_downloaded: true
          };
          profile.cached_media_registry[newClip.id] = profile.cached_media_registry[newClip.filename];
          saveUserProfile(profile);
        } catch (e) {}

        jobState.status = 'concluido';
        jobState.progress = 100;
        jobState.clip = newClip;

        broadcast({ type: 'download_complete', job: jobState, clip: newClip });
        broadcast({ type: 'manifest_updated', data: manifest });
        console.log(`[✓] Download completo e clipe registrado no Media Pool: ${newClip.filename} (${newClip.category})`);
      });
    } catch (err) {
      jobState.status = 'erro';
      jobState.error = err.message;
      broadcast({ type: 'download_error', job: jobState });
    }
  })();
});

// D. Download Jobs List
app.get('/api/stream/jobs', (req, res) => {
  res.json(Array.from(activeJobs.values()).slice(-20));
});

// E. In-Place Clip Category Reassignment
app.post('/api/clips/:id/category', (req, res) => {
  const { id } = req.params;
  const { category } = req.body;
  if (!category) return res.status(400).json({ error: 'Category required' });

  const manifest = getManifest();
  const clip = manifest.find(c => c.id === id);
  if (!clip) return res.status(404).json({ error: 'Clip not found' });

  clip.category = category;
  saveManifest(manifest);

  try {
    const profile = getUserProfile();
    if (!profile.category_overrides) profile.category_overrides = {};
    profile.category_overrides[id] = category;
    saveUserProfile(profile);
  } catch (e) {}

  broadcast({ type: 'clip_updated', clip, data: manifest });
  broadcast({ type: 'manifest_updated', data: manifest });
  res.json({ success: true, clip });
});

// 3. Audio Streaming Endpoint (For listening to DJ feed on MacBook headphones)
app.get('/api/audio-stream', (req, res) => {
  let targetAudio = AUDIO_TRACK_PATH;
  if (!fs.existsSync(targetAudio)) {
    const localFallback = path.join(__dirname, 'public', 'assets', 'audio', 'test_preview.mp3');
    if (fs.existsSync(localFallback)) {
      targetAudio = localFallback;
    } else {
      return res.status(404).send('Audio track not found');
    }
  }

  try {
    const stat = fs.statSync(targetAudio);
    const total = stat.size;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : total - 1;
      const chunksize = end - start + 1;

      const stream = fs.createReadStream(targetAudio, { start, end });
      stream.on('error', (err) => {
        if (!res.headersSent) res.status(500).end();
        stream.destroy();
      });
      req.on('close', () => { stream.destroy(); });

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${total}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'audio/mpeg'
      });
      stream.pipe(res);
    } else {
      const stream = fs.createReadStream(targetAudio);
      stream.on('error', (err) => {
        if (!res.headersSent) res.status(500).end();
        stream.destroy();
      });
      req.on('close', () => { stream.destroy(); });

      res.writeHead(200, {
        'Content-Length': total,
        'Content-Type': 'audio/mpeg'
      });
      stream.pipe(res);
    }
  } catch (err) {
    if (!res.headersSent) res.status(500).send('Error streaming audio');
  }
});

// Helper for HTTP 206 Partial Content Video Streaming
function streamVideoFile(videoPath, req, res) {
  if (!videoPath || !fs.existsSync(videoPath)) {
    return res.status(404).send('Video file not found');
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range');
  if (req.method === 'OPTIONS') return res.sendStatus(200);

  try {
    const stat = fs.statSync(videoPath);
    const total = stat.size;
    const range = req.headers.range;
    const ext = path.extname(videoPath).toLowerCase();
    const contentType = ext === '.mov' ? 'video/quicktime' : (ext === '.webm' ? 'video/webm' : 'video/mp4');

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : total - 1;
      const chunksize = end - start + 1;

      const stream = fs.createReadStream(videoPath, { start, end });
      stream.on('error', (err) => {
        if (!res.headersSent) res.status(500).end();
        stream.destroy();
      });
      req.on('close', () => { stream.destroy(); });

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${total}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400'
      });
      stream.pipe(res);
    } else {
      const stream = fs.createReadStream(videoPath);
      stream.on('error', (err) => {
        if (!res.headersSent) res.status(500).end();
        stream.destroy();
      });
      req.on('close', () => { stream.destroy(); });

      res.writeHead(200, {
        'Content-Length': total,
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=86400'
      });
      stream.pipe(res);
    }
  } catch (err) {
    if (!res.headersSent) res.status(500).send('Error streaming video');
  }
}

function resolveLocalVideoPath(targetIdentifier) {
  if (!targetIdentifier) return null;
  const decoded = decodeURIComponent(targetIdentifier);
  const base = path.basename(decoded);
  const manifest = getManifest();
  const clip = manifest.find(c => c.id === decoded || c.filename === decoded || c.relative_path === decoded || c.filename === base);

  const candidatePaths = [];
  if (clip && clip.absolute_path) candidatePaths.push(clip.absolute_path);
  if (clip && clip.relative_path) {
    candidatePaths.push(path.join(WORKSPACE_DIR, clip.relative_path));
    candidatePaths.push(path.join(ROOT_DIR, 'media_pool', clip.relative_path));
    const parentPipeline = path.resolve(WORKSPACE_DIR, '..');
    candidatePaths.push(path.join(parentPipeline, clip.relative_path));
  }
  candidatePaths.push(path.join(WORKSPACE_DIR, decoded));
  candidatePaths.push(path.join(WORKSPACE_DIR, '1. In', decoded));
  candidatePaths.push(path.join(WORKSPACE_DIR, '1. In', base));
  candidatePaths.push(path.join(DOWNLOADS_DIR, decoded));
  candidatePaths.push(path.join(DOWNLOADS_DIR, base));
  candidatePaths.push(path.join(ROOT_DIR, 'media_pool', decoded));

  for (const p of candidatePaths) {
    if (p && fs.existsSync(p) && fs.statSync(p).isFile()) {
      return p;
    }
  }

  // Deep scan in 1. In
  const inDir = path.join(WORKSPACE_DIR, '1. In');
  if (fs.existsSync(inDir)) {
    try {
      const files = fs.readdirSync(inDir);
      for (const f of files) {
        if (f.toLowerCase() === base.toLowerCase()) {
          return path.join(inDir, f);
        }
      }
    } catch (e) {}
  }

  return null;
}

// 4. Raw Video Streaming Endpoints (Supports ?path=... and /:clipId)
app.get('/api/raw-video', (req, res) => {
  const target = req.query.path || req.query.clipId || req.query.id;
  const videoPath = resolveLocalVideoPath(target);
  streamVideoFile(videoPath, req, res);
});

app.get('/api/raw-video/:clipId', (req, res) => {
  const clipId = req.params.clipId;
  const videoPath = resolveLocalVideoPath(clipId);
  streamVideoFile(videoPath, req, res);
});

// 5. Local Files Index Endpoint (Discovers local machine files for automatic deduplication)
app.get('/api/local-files/index', (req, res) => {
  const indexedFiles = [];
  const scannedPaths = [
    path.join(WORKSPACE_DIR, '1. In'),
    DOWNLOADS_DIR
  ];

  // Also check sibling pipeline directories if on external drive
  const parentPipeline = path.resolve(WORKSPACE_DIR, '..');
  if (fs.existsSync(parentPipeline) && parentPipeline.includes('Pipeline Gigantera')) {
    try {
      const siblings = fs.readdirSync(parentPipeline);
      siblings.forEach(s => {
        const inSub = path.join(parentPipeline, s, '1. In');
        if (fs.existsSync(inSub) && !scannedPaths.includes(inSub)) {
          scannedPaths.push(inSub);
        }
      });
    } catch (e) {}
  }

  scannedPaths.forEach(dir => {
    if (fs.existsSync(dir)) {
      try {
        const entries = fs.readdirSync(dir);
        entries.forEach(f => {
          if (f.startsWith('.')) return;
          const ext = path.extname(f).toLowerCase().replace('.', '');
          if (['mp4', 'mov', 'webm'].includes(ext)) {
            const fullP = path.join(dir, f);
            try {
              const stat = fs.statSync(fullP);
              indexedFiles.push({
                filename: f,
                folder: path.basename(dir),
                absolute_path: fullP,
                relative_path: path.relative(WORKSPACE_DIR, fullP),
                size_mb: Math.round((stat.size / (1024 * 1024)) * 100) / 100,
                mtime: stat.mtime.toISOString()
              });
            } catch (e) {}
          }
        });
      } catch (e) {}
    }
  });

  res.json({
    success: true,
    count: indexedFiles.length,
    files: indexedFiles
  });
});

// Audio Devices Endpoint
app.get('/api/audio-devices', (req, res) => {
  res.json({
    current_source: currentState.audio_source || { mode: 'test', device_name: 'MP3 Interno' },
    devices: (currentState.audio_source && currentState.audio_source.devices) || []
  });
});

// OSC UDP client for TouchDesigner
const udpClient = dgram.createSocket('udp4');
function sendOsc(address, value) {
  try {
    const pad = (s) => {
      let b = Buffer.from(s + '\0');
      let rem = b.length % 4;
      if (rem > 0) b = Buffer.concat([b, Buffer.alloc(4 - rem)]);
      return b;
    };
    const addrBuf = pad(address);
    const typeBuf = pad(',f');
    const valBuf = Buffer.alloc(4);
    valBuf.writeFloatBE(Number(value) || 0.0, 0);
    const msg = Buffer.concat([addrBuf, typeBuf, valBuf]);
    udpClient.send(msg, 0, msg.length, OSC_PORT, '127.0.0.1');
  } catch (err) {}
}

// Runtime State
let currentState = {
  macro_state: 'GROOVE',
  master_intensity: 1.0,
  blackout: false,
  auto_mode: true,
  buildup_score: 0.12,
  drop_likelihood: 0.05,
  bpm: 124.0,
  phase: 0.0,
  bar: 1,
  phrase_bar: 1,
  stems: { drums: 0.65, bass: 0.70, other: 0.45, vocals: 0.30 },
  bands: { sub: 0.8, bass: 0.75, lo_mid: 0.5, hi_mid: 0.4, presence: 0.3, air: 0.2 },
  bpm_manual_lock: false,
  audio_source: {
    mode: 'test',
    device_name: 'MP3 Interno (01 REC-2024-04-28.mp3)',
    devices: []
  },
  layers: {
    layer0: { active: true, opacity: 1.0, clipId: 'clip_001', name: 'Animate_silver_tail', blend: 'Normal', matte: 'none', rotation: 0, fit_mode: 'fill' },
    layer1: { active: true, scale: 1.12, blend: 'Multiply', opacity: 0.55, rotation: 0, fit_mode: 'fill' },
    layer2: { active: true, opacity: 0.22, blend: 'Screen', edge_mix: 0.22, edge_threshold: 0.30, rotation: 0, fit_mode: 'fill' },
    layer3: { active: true, opacity: 1.0, blend: 'Normal', clipId: 'clip_005', name: 'Metallic_spine', matte: 'none', rotation: 0, fit_mode: 'fill' },
    layer4: { active: false, opacity: 0.0, blend: 'Difference', clipId: 'clip_006', name: 'STIPPLES_SIMULACAO', matte: 'none', rotation: 0, fit_mode: 'fill' }
  },
  tonal: {
    gamma: 0.85,
    brightness: -0.05,
    midtones: 1.0,
    contrast: 1.18,
    edge_mix: 0.22,
    edge_threshold: 0.30
  },
  matte: {
    bank: 'B',
    name: 'matte_b_penumbra_vignette.png',
    deform: {
      wiggle_scale: 0.04,
      wiggle_pos: 8,
      posterize_rate: 8,
      edge_warp: 0.08,
      speed: 1.0,
      sync_bpm: true
    }
  },
  audio_monitor: {
    enabled: false,
    volume: 0.70
  },
  playlist: {
    auto_cycle: true,
    cycle_phrase_bars: 16
  },
  crossfader: 0
};


// WebSocket connection to Audio Brain (Python)
let audioBrainSocket = null;
function connectToAudioBrain() {
  audioBrainSocket = new WebSocket(`ws://127.0.0.1:${AUDIO_BRAIN_WS_PORT}`);
  
  audioBrainSocket.on('open', () => {
    console.log('[*] Connected to Penumbra Audio Brain WebSocket.');
  });

  audioBrainSocket.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      if (msg.type === 'audio_features') {
        const f = msg.data;
        currentState.buildup_score = f.buildup_score;
        currentState.drop_likelihood = f.drop_likelihood;
        currentState.bpm = f.bpm;
        currentState.phase = f.beat_phase;
        currentState.bar = f.bar || f.bar_counter;
        currentState.phrase_bar = f.phrase_bar || f.phrase_counter;
        currentState.bands = f.bands;
        currentState.stems = f.stems;
        if (f.audio_source) {
          currentState.audio_source = { ...(currentState.audio_source || {}), ...f.audio_source };
        }
        if (currentState.auto_mode) {
          currentState.macro_state = f.macro_state;
        }

        // Broadcast to all browser clients
        broadcast({ type: 'telemetry', data: currentState });
      } else if (msg.type === 'audio_source_status' || msg.type === 'audio_source_changed') {
        currentState.audio_source = {
          mode: msg.current_mode,
          device_name: msg.device_name,
          device_id: msg.device_id,
          devices: msg.devices || []
        };
        broadcast({ type: 'audio_source_status', data: currentState.audio_source });
      }
    } catch (e) {}
  });

  audioBrainSocket.on('error', () => {});
  audioBrainSocket.on('close', () => {
    setTimeout(connectToAudioBrain, 3000);
  });
}
connectToAudioBrain();

// Internal fallback ticker if audio brain is not running
// Internal fallback ticker if audio brain is not running
let fallbackBeatCount = 0;
let lastFallbackSec = Date.now() / 1000;
let manualMacroOverride = null;
let manualMacroOverrideBars = 0;

setInterval(() => {
  if (!audioBrainSocket || audioBrainSocket.readyState !== WebSocket.OPEN) {
    const now = Date.now() / 1000;
    const dt = now - lastFallbackSec;
    lastFallbackSec = now;

    const bps = (currentState.bpm || 124.0) / 60.0;
    currentState.phase = (now * bps) % 1.0;
    
    // Track beat increments
    const currentTotalBeats = Math.floor(now * bps);
    if (currentTotalBeats !== fallbackBeatCount) {
      fallbackBeatCount = currentTotalBeats;
      currentState.bar = (Math.floor(fallbackBeatCount / 4) % 64) + 1;
      currentState.phrase_bar = ((currentState.bar - 1) % 8) + 1;

      // Check if human operator manually forced/set macro state
      if (manualMacroOverride) {
        currentState.macro_state = manualMacroOverride;
        // Count down forced bars only in auto mode
        if (currentState.auto_mode && currentState.phrase_bar === 1 && currentTotalBeats % 4 === 0) {
          if (manualMacroOverrideBars > 0) {
            manualMacroOverrideBars--;
            if (manualMacroOverrideBars === 0) {
              manualMacroOverride = null;
            }
          }
        }
      } else if (currentState.auto_mode) {
        // Realistic mock macro state progression if brain offline and in auto mode
        const cyclePos = currentState.bar % 32;
        if (cyclePos <= 4) currentState.macro_state = 'INTRO';
        else if (cyclePos <= 18) currentState.macro_state = 'GROOVE';
        else if (cyclePos <= 24) currentState.macro_state = 'BUILD';
        else if (cyclePos <= 30) currentState.macro_state = 'DROP';
        else currentState.macro_state = 'BREAK';
      }

      if (currentState.macro_state === 'BUILD') {
        currentState.buildup_score = 0.88;
        currentState.drop_likelihood = 0.20;
      } else if (currentState.macro_state === 'DROP') {
        currentState.buildup_score = 0.10;
        currentState.drop_likelihood = 0.95;
      } else if (currentState.macro_state === 'BREAK') {
        currentState.buildup_score = 0.08;
        currentState.drop_likelihood = 0.04;
      } else if (currentState.macro_state === 'INTRO') {
        currentState.buildup_score = 0.10;
        currentState.drop_likelihood = 0.05;
      } else { // GROOVE
        currentState.buildup_score = 0.25;
        currentState.drop_likelihood = 0.10;
      }
    }

    const t = now;
    currentState.bands.sub = 0.4 + 0.3 * Math.sin(t * 3.5);
    currentState.bands.bass = 0.5 + 0.4 * Math.cos(t * 4.2);
    currentState.bands.lo_mid = 0.35 + 0.25 * Math.sin(t * 2.1);
    currentState.bands.hi_mid = 0.3 + 0.2 * Math.cos(t * 5.0);
    currentState.bands.presence = 0.2 + 0.15 * Math.sin(t * 6.5);
    currentState.bands.air = 0.15 + 0.1 * Math.cos(t * 8.0);
    broadcast({ type: 'telemetry', data: currentState });
  }
}, 40);

// Client Broadcast
function broadcast(msg) {
  const payload = JSON.stringify(msg);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

// WebSocket connection from browsers
wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'init', state: currentState }));

  ws.on('message', (msgStr) => {
    try {
      const msg = JSON.parse(msgStr);
      if (msg.action === 'set_macro_state') {
        currentState.macro_state = msg.value;
        manualMacroOverride = msg.value;
        manualMacroOverrideBars = 16;
        sendOsc('/penumbra/macro_state', msg.value);
        broadcast({ type: 'state_updated', state: { macro_state: msg.value } });
      } else if (msg.action === 'clear_macro_override') {
        manualMacroOverride = null;
        manualMacroOverrideBars = 0;
      } else if (msg.action === 'set_master_intensity') {
        currentState.master_intensity = Number(msg.value);
        sendOsc('/penumbra/master_intensity', msg.value);
      } else if (msg.action === 'toggle_blackout') {
        currentState.blackout = !currentState.blackout;
        sendOsc('/penumbra/blackout', currentState.blackout ? 1 : 0);
      } else if (msg.action === 'toggle_auto_mode') {
        currentState.auto_mode = !currentState.auto_mode;
        if (!currentState.auto_mode) {
          if (!manualMacroOverride) {
            manualMacroOverride = currentState.macro_state || 'GROOVE';
          }
        }
        broadcast({ type: 'state_updated', state: { auto_mode: currentState.auto_mode } });
      } else if (msg.action === 'set_layer_param') {
        const { layer, param, value } = msg;
        if (currentState.layers[layer]) {
          currentState.layers[layer][param] = value;
          sendOsc(`/penumbra/${layer}/${param}`, typeof value === 'number' ? value : 1);
        }
      } else if (msg.action === 'cue_clip') {
        const { layer, clipId, name } = msg;
        if (currentState.layers[layer]) {
          currentState.layers[layer].clipId = clipId;
          currentState.layers[layer].name = name;
        }
      } else if (msg.action === 'set_audio_monitor') {
        const { enabled, volume } = msg;
        if (enabled !== undefined) currentState.audio_monitor.enabled = enabled;
        if (volume !== undefined) {
          currentState.audio_monitor.volume = volume;
          sendOsc('/penumbra/audio_monitor/volume', volume);
        }
        sendOsc('/penumbra/audio_monitor/enable', currentState.audio_monitor.enabled ? 1 : 0);
      } else if (msg.action === 'set_tonal_param') {
        const { param, value } = msg;
        if (!currentState.tonal) currentState.tonal = {};
        currentState.tonal[param] = value;
        sendOsc(`/penumbra/tonal/${param}`, value);
      } else if (msg.action === 'set_matte_deform') {
        const { param, value } = msg;
        if (!currentState.matte) currentState.matte = { deform: {} };
        if (!currentState.matte.deform) currentState.matte.deform = {};
        currentState.matte.deform[param] = value;
        sendOsc(`/penumbra/matte/${param}`, value);
      } else if (msg.action === 'set_matte_bank') {
        const { bank } = msg;
        if (!currentState.matte) currentState.matte = {};
        currentState.matte.bank = bank;
        sendOsc('/penumbra/matte/bank', bank);
      } else if (msg.action === 'set_layer_matte') {
        const { layer, matte } = msg;
        if (currentState.layers[layer]) {
          currentState.layers[layer].matte = matte;
          sendOsc(`/penumbra/${layer}/matte`, matte);
        }
      } else if (msg.action === 'trigger_take') {
        // Swap Preview cue (L3) to Program Base (L0)
        const targetClipId = msg.clipId || currentState.layers.layer3.clipId;
        const targetName = msg.name || currentState.layers.layer3.name;
        if (targetClipId) {
          currentState.layers.layer0.clipId = targetClipId;
          currentState.layers.layer0.name = targetName;
          sendOsc('/penumbra/layer0/clipId', targetClipId);
          sendOsc('/penumbra/take', 1.0);
        }
      } else if (msg.action === 'set_crossfader') {
        const val = Number(msg.value) || 0;
        currentState.crossfader = val;
        sendOsc('/penumbra/crossfader', val / 100.0);
      } else if (msg.action === 'set_layer_rotation') {
        const { layer, rotation } = msg;
        if (currentState.layers[layer]) {
          currentState.layers[layer].rotation = Number(rotation);
          sendOsc(`/penumbra/${layer}/rotation`, Number(rotation));
        }
      } else if (msg.action === 'set_layer_fit_mode') {
        const { layer, fit_mode } = msg;
        if (currentState.layers[layer]) {
          currentState.layers[layer].fit_mode = fit_mode;
          sendOsc(`/penumbra/${layer}/fit_mode`, fit_mode);
        }
      } else if (msg.action === 'set_bpm') {
        const val = Number(msg.value);
        if (!isNaN(val) && val >= 40 && val <= 220) {
          currentState.bpm = Math.round(val * 10) / 10;
          if (msg.manual !== undefined) currentState.bpm_manual_lock = Boolean(msg.manual);
          sendOsc('/penumbra/bpm', currentState.bpm);
        }
      } else if (msg.action === 'set_audio_source') {
        if (audioBrainSocket && audioBrainSocket.readyState === WebSocket.OPEN) {
          audioBrainSocket.send(JSON.stringify(msg));
        }
      } else if (msg.action === 'get_audio_devices') {
        if (audioBrainSocket && audioBrainSocket.readyState === WebSocket.OPEN) {
          audioBrainSocket.send(JSON.stringify(msg));
        }
      } else if (msg.type === 'control') {
        sendOsc(msg.path, msg.value);
      }
      broadcast({ type: 'state_updated', state: currentState });

    } catch (e) {
      console.error('[!] WS parse error:', e);
    }
  });
});

process.on('uncaughtException', (err) => {
  console.warn('[!] Caught unhandled exception:', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.warn('[!] Caught unhandled rejection:', reason);
});

server.listen(PORT, () => {
  console.log(`[✓] Penumbra Controller Server live on http://localhost:${PORT}`);
});
