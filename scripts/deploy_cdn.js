#!/usr/bin/env node
/**
 * Penumbra Autonomous CDN & Edge Deployment Orchestrator
 * Automatically builds the portable bundle and deploys all core frontend assets
 * directly to Bunny.net Edge Storage (São Paulo region: br.storage.bunnycdn.com).
 * 
 * Usage:
 *   node scripts/deploy_cdn.js
 *   node scripts/deploy_cdn.js --fast
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const bundlePortable = require('./build_portable');

// Load local project .env first with strict override
const LOCAL_ENV = path.join(__dirname, '../.env');
if (fs.existsSync(LOCAL_ENV)) {
  const content = fs.readFileSync(LOCAL_ENV, 'utf-8');
  content.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      process.env[match[1].trim()] = match[2].trim();
    }
  });
}

const STORAGE_ZONE = process.env.BUNNY_STORAGE_ZONE || 'gigantera';
const STORAGE_PASS = process.env.BUNNY_STORAGE_PASSWORD || '9b382c1a-23ac-4fa6-b93ce53458c7-e946-40b8';
const PULL_ZONE = process.env.BUNNY_PULL_ZONE_URL || 'https://gigantera-penumbra.b-cdn.net';
const REGION = 'br.storage.bunnycdn.com';

const ROOT_DIR = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'penumbra_engine/web_controller/public');
const MEDIA_POOL_DIR = path.join(ROOT_DIR, 'penumbra_engine/media_pool');

function uploadFile(localPath, remotePath, contentType) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(localPath)) {
      return reject(new Error(`Local file not found: ${localPath}`));
    }
    const stat = fs.statSync(localPath);
    const stream = fs.createReadStream(localPath);
    const encodedPath = '/' + STORAGE_ZONE + '/' + remotePath.split('/').map(encodeURIComponent).join('/');

    const req = https.request({
      hostname: REGION,
      path: encodedPath,
      method: 'PUT',
      headers: {
        'AccessKey': STORAGE_PASS,
        'Content-Length': stat.size,
        'Content-Type': contentType || 'application/octet-stream'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200 || res.statusCode === 201) {
          resolve({ status: res.statusCode, remote: remotePath, size: stat.size });
        } else {
          reject(new Error(`Deploy failed for ${remotePath}: HTTP ${res.statusCode} - ${data}`));
        }
      });
    });

    req.on('error', reject);
    stream.pipe(req);
  });
}

async function runDeploy() {
  const startTime = Date.now();
  console.log('🚀 [PENUMBRA AUTO-DEPLOY] Sincronização Automática Edge CDN Iniciada');
  console.log(`📡 Destino: Bunny Edge CDN (${PULL_ZONE})`);
  console.log(`🌐 Storage Endpoint: ${REGION} / ${STORAGE_ZONE}`);

  // 1. Sync media_manifest.json to public directory
  const manifestSource = path.join(MEDIA_POOL_DIR, 'media_manifest.json');
  const manifestPublic = path.join(PUBLIC_DIR, 'media_manifest.json');
  if (fs.existsSync(manifestSource)) {
    fs.copyFileSync(manifestSource, manifestPublic);
    console.log('📋 [Manifest] media_manifest.json sincronizado para public/');
  }

  // 1.1 Sync mattes_manifest.json and mattes files to public directory
  const mattesManifestSource = path.join(MEDIA_POOL_DIR, 'mattes_manifest.json');
  const mattesManifestPublic = path.join(PUBLIC_DIR, 'mattes_manifest.json');
  if (fs.existsSync(mattesManifestSource)) {
    fs.copyFileSync(mattesManifestSource, mattesManifestPublic);
    console.log('🎭 [Mattes] mattes_manifest.json sincronizado para public/');
  }

  const mattesDirSource = path.join(MEDIA_POOL_DIR, 'mattes');
  const mattesDirPublic = path.join(PUBLIC_DIR, 'mattes');
  if (fs.existsSync(mattesDirSource)) {
    fs.cpSync(mattesDirSource, mattesDirPublic, { recursive: true });
    console.log('🎭 [Mattes] Pasta /mattes sincronizada para public/');
  }

  // 2. Build Penumbra_Portable.html
  console.log('📦 [Bundler] Compilando executável offline Penumbra_Portable.html...');
  const portablePath = bundlePortable();
  
  // Replicate to workspace roots for local offline convenience
  try {
    fs.copyFileSync(portablePath, path.join(ROOT_DIR, 'Penumbra_Portable.html'));
    const outerDir = path.resolve(ROOT_DIR, '..');
    fs.copyFileSync(portablePath, path.join(outerDir, 'Penumbra_Portable.html'));
  } catch (err) {
    // Non-fatal if outer directory is not writable
  }

  // 3. Core Files Deployment Queue
  const coreQueue = [
    { local: path.join(PUBLIC_DIR, 'index.html'), remote: 'index.html', type: 'text/html' },
    { local: path.join(PUBLIC_DIR, 'styles.css'), remote: 'styles.css', type: 'text/css' },
    { local: path.join(PUBLIC_DIR, 'app.js'), remote: 'app.js', type: 'application/javascript' },
    { local: path.join(PUBLIC_DIR, 'midi.js'), remote: 'midi.js', type: 'application/javascript' },
    { local: path.join(PUBLIC_DIR, 'favicon.svg'), remote: 'favicon.svg', type: 'image/svg+xml' },
    { local: manifestPublic, remote: 'media_manifest.json', type: 'application/json' },
    { local: mattesManifestPublic, remote: 'mattes_manifest.json', type: 'application/json' },
    { local: portablePath, remote: 'Penumbra_Portable.html', type: 'text/html' },
    { local: path.join(PUBLIC_DIR, 'assets', 'audio', 'test_preview.mp3'), remote: 'assets/audio/test_preview.mp3', type: 'audio/mpeg' }
  ];

  // Also collect all matte image files
  if (fs.existsSync(mattesDirPublic)) {
    const scanMattes = (dir, prefix = '') => {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const fullP = path.join(dir, item);
        const relP = prefix ? `${prefix}/${item}` : item;
        if (fs.statSync(fullP).isDirectory()) {
          scanMattes(fullP, relP);
        } else if (item.endsWith('.png') || item.endsWith('.jpg') || item.endsWith('.svg')) {
          coreQueue.push({
            local: fullP,
            remote: `mattes/${relP}`,
            type: item.endsWith('.svg') ? 'image/svg+xml' : 'image/png'
          });
        }
      }
    };
    scanMattes(mattesDirPublic);
  }

  console.log(`\n⬆️ [Upload] Enviando ${coreQueue.length} arquivos essenciais para a CDN...`);
  for (const item of coreQueue) {
    try {
      const res = await uploadFile(item.local, item.remote, item.type);
      const kb = (res.size / 1024).toFixed(1);
      console.log(`  ✓ ${item.remote.padEnd(26)} [${kb} KB] -> HTTP ${res.status}`);
    } catch (e) {
      console.error(`  ✗ Falha ao enviar ${item.remote}:`, e.message);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\n🏁 [DEPLOY CONCLUÍDO] Duração: ${elapsed}s`);
  console.log(`✨ Cockpit Web Online: ${PULL_ZONE}/index.html`);
  console.log(`📱 Executável Portátil: ${PULL_ZONE}/Penumbra_Portable.html\n`);
}

if (require.main === module) {
  runDeploy().catch(err => {
    console.error('💥 [DEPLOY ERRO CRÍTICO]:', err);
    process.exit(1);
  });
}

module.exports = runDeploy;
