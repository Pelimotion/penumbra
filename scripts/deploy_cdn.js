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
const { loadEnvFileIfUnset } = require('./sync_utils');

// Load local project .env without replacing credentials provided by the caller.
loadEnvFileIfUnset(path.join(__dirname, '../.env'));

const STORAGE_ZONE = process.env.BUNNY_STORAGE_ZONE || 'gigantera';
const STORAGE_PASS = process.env.BUNNY_STORAGE_PASSWORD;
const PULL_ZONE = process.env.BUNNY_PULL_ZONE_URL || 'https://gigantera-penumbra.b-cdn.net';
const REGION = 'br.storage.bunnycdn.com';

function validateDeploymentConfig(password = STORAGE_PASS) {
  if (!password) throw new Error('BUNNY_STORAGE_PASSWORD is required');
  return password;
}

function assertUploadsSucceeded(failedUploads) {
  if (failedUploads.length) {
    throw new Error(`${failedUploads.length} required upload(s) failed`);
  }
}

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
  validateDeploymentConfig();
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
  const mattesManifest = path.join(MEDIA_POOL_DIR, 'mattes_manifest.json');
  const coreQueue = [
    { local: path.join(PUBLIC_DIR, 'index.html'), remote: 'penumbra-app/index.html', type: 'text/html' },
    { local: path.join(PUBLIC_DIR, 'styles.css'), remote: 'penumbra-app/styles.css', type: 'text/css' },
    { local: path.join(PUBLIC_DIR, 'app.js'), remote: 'penumbra-app/app.js', type: 'application/javascript' },
    { local: path.join(PUBLIC_DIR, 'midi.js'), remote: 'penumbra-app/midi.js', type: 'application/javascript' },
    { local: path.join(PUBLIC_DIR, 'favicon.svg'), remote: 'penumbra-app/favicon.svg', type: 'image/svg+xml' },
    { local: manifestPublic, remote: 'penumbra-app/media_manifest.json', type: 'application/json' },
    { local: mattesManifest, remote: 'penumbra-app/mattes_manifest.json', type: 'application/json' },
    { local: portablePath, remote: 'penumbra-app/Penumbra_Portable.html', type: 'text/html' }
  ];

  const uploadFailures = [];
  console.log(`\n⬆️ [Upload] Enviando ${coreQueue.length} arquivos essenciais para a CDN em penumbra-app/...`);
  for (const item of coreQueue) {
    try {
      const res = await uploadFile(item.local, item.remote, item.type);
      const kb = (res.size / 1024).toFixed(1);
      console.log(`  ✓ ${item.remote.padEnd(38)} [${kb} KB] -> HTTP ${res.status}`);
    } catch (e) {
      uploadFailures.push(item.remote);
      console.error(`  ✗ Falha ao enviar ${item.remote}:`, e.message);
    }
  }
  assertUploadsSucceeded(uploadFailures);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\n🏁 [DEPLOY CONCLUÍDO] Duração: ${elapsed}s`);
  console.log(`✨ Cockpit Web Online: ${PULL_ZONE}/penumbra-app/index.html`);
  console.log(`📱 Executável Portátil: ${PULL_ZONE}/penumbra-app/Penumbra_Portable.html\n`);
}

if (require.main === module) {
  runDeploy().catch(err => {
    console.error('💥 [DEPLOY ERRO CRÍTICO]:', err);
    process.exit(1);
  });
}

module.exports = { runDeploy, validateDeploymentConfig, assertUploadsSucceeded };
