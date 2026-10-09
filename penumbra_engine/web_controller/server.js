const express = require('express');
const http = require('http');
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
const AUDIO_TRACK_PATH = '/Volumes/PLM_SSD_01/Musica/Tracks Autorais/01 REC-2024-04-28.mp3';

// Middleware
app.use((req, res, next) => {
  const origin = req.headers.origin;
  // SECURITY: Restrict strictly to localhost to prevent unauthorized remote control
  if (origin === 'http://localhost:3000' || origin === 'https://localhost:3000') {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/thumbnails', express.static(THUMBS_DIR));

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

// 3. Audio Streaming Endpoint (For listening to DJ feed on MacBook headphones)
app.get('/api/audio-stream', (req, res) => {
  if (!fs.existsSync(AUDIO_TRACK_PATH)) {
    return res.status(404).send('Audio track not found');
  }

  try {
    const stat = fs.statSync(AUDIO_TRACK_PATH);
    const total = stat.size;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : total - 1;
      const chunksize = end - start + 1;

      const stream = fs.createReadStream(AUDIO_TRACK_PATH, { start, end });
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
      const stream = fs.createReadStream(AUDIO_TRACK_PATH);
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

// 4. Raw Video Streaming Endpoint (HTTP 206 for active layer HTML5 video playback)
app.get('/api/raw-video/:clipId', (req, res) => {
  const clipId = req.params.clipId;
  const manifest = getManifest();
  const clip = manifest.find(c => c.id === clipId);

  if (!clip || !clip.absolute_path || !fs.existsSync(clip.absolute_path)) {
    return res.status(404).send('Video file not found');
  }

  const videoPath = clip.absolute_path;
  try {
    const stat = fs.statSync(videoPath);
    const total = stat.size;
    const range = req.headers.range;
    const ext = path.extname(videoPath).toLowerCase();
    const contentType = ext === '.mov' ? 'video/quicktime' : 'video/mp4';

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
        'Cache-Control': 'public, max-age=3600'
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
        'Cache-Control': 'public, max-age=3600'
      });
      stream.pipe(res);
    }
  } catch (err) {
    if (!res.headersSent) res.status(500).send('Error streaming video');
  }
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
