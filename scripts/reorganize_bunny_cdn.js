#!/usr/bin/env node
/**
 * Penumbra & Gigantera Bunny.net Storage Reorganizer
 * 
 * Reorganizes the 'gigantera' Bunny Storage Zone so that:
 * - 'gigantera-portfolio/' remains dedicated to the root website/portfolio.
 * - 'penumbra-app/' contains all assets of the Penumbra VJ Engine (HTML, CSS, JS, Portable, mattes, thumbnails, manifests).
 * - Loose root clutter (thumb_*.jpg, old root index.html/app.js/styles.css) is cleaned up.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const bundlePortable = require('./build_portable');
const { loadEnvFileIfUnset } = require('./sync_utils');

loadEnvFileIfUnset(path.join(__dirname, '../.env'));

const STORAGE_ZONE = process.env.BUNNY_STORAGE_ZONE || 'gigantera';
const STORAGE_PASS = process.env.BUNNY_STORAGE_PASSWORD;
const PULL_ZONE = process.env.BUNNY_PULL_ZONE_URL || 'https://gigantera-penumbra.b-cdn.net';
const REGION = 'br.storage.bunnycdn.com';

if (!STORAGE_PASS) {
  console.error('[!] BUNNY_STORAGE_PASSWORD is required in .env');
  process.exit(1);
}

const ROOT_DIR = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'penumbra_engine/web_controller/public');
const MEDIA_POOL_DIR = path.join(ROOT_DIR, 'penumbra_engine/media_pool');

// Helpers for Bunny Storage REST API
function bunnyRequest(method, remotePath, headers = {}, bodyStream = null, bodyLength = 0) {
  return new Promise((resolve, reject) => {
    const encodedPath = '/' + STORAGE_ZONE + '/' + remotePath.split('/').map(encodeURIComponent).join('/');
    const reqHeaders = {
      'AccessKey': STORAGE_PASS,
      ...headers
    };
    if (bodyLength > 0) reqHeaders['Content-Length'] = bodyLength;

    const req = https.request({
      hostname: REGION,
      path: encodedPath,
      method,
      headers: reqHeaders
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });

    req.on('error', reject);

    if (bodyStream) {
      bodyStream.pipe(req);
    } else {
      req.end();
    }
  });
}

function listRemoteDir(dirPath = '') {
  return new Promise((resolve, reject) => {
    const cleanDir = dirPath ? (dirPath.endsWith('/') ? dirPath : `${dirPath}/`) : '';
    const encodedPath = '/' + STORAGE_ZONE + '/' + cleanDir.split('/').filter(Boolean).map(encodeURIComponent).join('/') + (cleanDir ? '/' : '');
    const req = https.request({
      hostname: REGION,
      path: encodedPath,
      method: 'GET',
      headers: {
        'AccessKey': STORAGE_PASS,
        'Accept': 'application/json'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve([]);
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function uploadFile(localPath, remotePath, contentType) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(localPath)) return reject(new Error(`File not found: ${localPath}`));
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
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode === 200 || res.statusCode === 201) {
          resolve({ status: res.statusCode, size: stat.size });
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    stream.pipe(req);
  });
}

function deleteRemoteFile(remotePath) {
  return bunnyRequest('DELETE', remotePath);
}

// Concurrency pool helper
async function runWithConcurrency(items, limit, workerFn) {
  const results = [];
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const i = index++;
      try {
        const res = await workerFn(items[i], i);
        results[i] = { success: true, res };
      } catch (err) {
        results[i] = { success: false, err };
      }
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

async function runReorganization() {
  console.log('🪐 ========================================================');
  console.log('📦 BUNNY.NET STORAGE REORGANIZATION: GIGANTERA / PENUMBRA');
  console.log('🪐 ========================================================\n');
  console.log(`🌐 Storage Endpoint: ${REGION} / ${STORAGE_ZONE}`);
  console.log(`📡 Pull Zone: ${PULL_ZONE}\n`);

  // 1. Build portable bundle
  console.log('[1/4] 🔨 Compilando Penumbra_Portable.html atualizado...');
  const portablePath = bundlePortable();
  try {
    fs.copyFileSync(portablePath, path.join(ROOT_DIR, 'Penumbra_Portable.html'));
  } catch (e) {}

  // 2. Build upload list for penumbra-app/
  console.log('\n[2/4] 📋 Mapeando todos os arquivos do Penumbra para "penumbra-app/"...');
  const uploadQueue = [];

  // Core files
  const manifestPublic = path.join(PUBLIC_DIR, 'media_manifest.json');
  if (fs.existsSync(path.join(MEDIA_POOL_DIR, 'media_manifest.json'))) {
    fs.copyFileSync(path.join(MEDIA_POOL_DIR, 'media_manifest.json'), manifestPublic);
  }
  const mattesManifest = path.join(MEDIA_POOL_DIR, 'mattes_manifest.json');

  uploadQueue.push({ local: path.join(PUBLIC_DIR, 'index.html'), remote: 'penumbra-app/index.html', type: 'text/html' });
  uploadQueue.push({ local: path.join(PUBLIC_DIR, 'styles.css'), remote: 'penumbra-app/styles.css', type: 'text/css' });
  uploadQueue.push({ local: path.join(PUBLIC_DIR, 'app.js'), remote: 'penumbra-app/app.js', type: 'application/javascript' });
  uploadQueue.push({ local: path.join(PUBLIC_DIR, 'midi.js'), remote: 'penumbra-app/midi.js', type: 'application/javascript' });
  uploadQueue.push({ local: path.join(PUBLIC_DIR, 'favicon.svg'), remote: 'penumbra-app/favicon.svg', type: 'image/svg+xml' });
  uploadQueue.push({ local: manifestPublic, remote: 'penumbra-app/media_manifest.json', type: 'application/json' });
  uploadQueue.push({ local: mattesManifest, remote: 'penumbra-app/mattes_manifest.json', type: 'application/json' });
  uploadQueue.push({ local: portablePath, remote: 'penumbra-app/Penumbra_Portable.html', type: 'text/html' });

  // Mattes
  const mattesDir = path.join(MEDIA_POOL_DIR, 'mattes');
  function scanMattes(dir, sub = '') {
    if (!fs.existsSync(dir)) return;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ent.name.startsWith('.')) continue;
      const rel = sub ? `${sub}/${ent.name}` : ent.name;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        scanMattes(full, rel);
      } else if (ent.isFile() && ent.name.endsWith('.png')) {
        uploadQueue.push({ local: full, remote: `penumbra-app/mattes/${rel}`, type: 'image/png' });
      }
    }
  }
  scanMattes(mattesDir);

  // Thumbnails
  const thumbsDir = path.join(MEDIA_POOL_DIR, 'thumbnails');
  if (fs.existsSync(thumbsDir)) {
    for (const f of fs.readdirSync(thumbsDir)) {
      if (f.endsWith('.jpg') || f.endsWith('.png') || f.endsWith('.webp')) {
        uploadQueue.push({ local: path.join(thumbsDir, f), remote: `penumbra-app/thumbnails/${f}`, type: 'image/jpeg' });
      }
    }
  }

  console.log(`  ✓ Total mapeado: ${uploadQueue.length} arquivos para upload em "penumbra-app/".`);

  // 3. Upload with concurrency 8
  console.log('\n[3/4] ⬆️ Enviando arquivos para "penumbra-app/" (concorrência: 8)...');
  let uploadedCount = 0;
  let uploadErrors = 0;
  await runWithConcurrency(uploadQueue, 8, async (item, idx) => {
    try {
      await uploadFile(item.local, item.remote, item.type);
      uploadedCount++;
      if (uploadedCount % 40 === 0 || uploadedCount === uploadQueue.length) {
        process.stdout.write(`  Progresso: ${uploadedCount}/${uploadQueue.length} (${Math.round((uploadedCount / uploadQueue.length) * 100)}%)\r`);
      }
    } catch (err) {
      uploadErrors++;
      console.error(`\n  ✗ Falha em ${item.remote}:`, err.message);
    }
  });

  console.log(`\n  ✓ Concluído: ${uploadedCount} arquivos enviados (${uploadErrors} erros).`);

  // 4. Clean up root loose files
  console.log('\n[4/4] 🧹 Limpando arquivos soltos na raiz de "gigantera/"...');
  const rootItems = await listRemoteDir('');
  const looseFilesToDelete = [];

  for (const item of rootItems) {
    if (item.IsDirectory) continue;
    // Don't touch files if they are not Penumbra files
    const name = item.ObjectName;
    if (
      name.startsWith('thumb_') ||
      name === 'Penumbra_Portable.html' ||
      name === 'app.js' ||
      name === 'index.html' ||
      name === 'styles.css' ||
      name === 'midi.js' ||
      name === 'favicon.svg' ||
      name === 'media_manifest.json' ||
      name === 'mattes_manifest.json'
    ) {
      looseFilesToDelete.push(name);
    }
  }

  console.log(`  Encontrados ${looseFilesToDelete.length} arquivos soltos do Penumbra na raiz para remoção.`);
  let deletedCount = 0;
  await runWithConcurrency(looseFilesToDelete, 8, async (filename) => {
    try {
      await deleteRemoteFile(filename);
      deletedCount++;
      if (deletedCount % 40 === 0 || deletedCount === looseFilesToDelete.length) {
        process.stdout.write(`  Removidos: ${deletedCount}/${looseFilesToDelete.length}\r`);
      }
    } catch (e) {
      console.warn(`\n  Falha ao deletar ${filename}:`, e.message);
    }
  });

  console.log(`\n  ✓ Limpeza da raiz concluída: ${deletedCount} arquivos soltos removidos.`);

  // 5. Final Audit
  console.log('\n📊 [AUDITORIA FINAL DA STORAGE ZONE]:');
  const finalRoot = await listRemoteDir('');
  console.log(`Total de diretórios na raiz:`);
  finalRoot.filter(i => i.IsDirectory).forEach(d => console.log(`  📁 /${d.ObjectName}/`));
  const remainingFiles = finalRoot.filter(i => !i.IsDirectory);
  console.log(`Arquivos restantes na raiz: ${remainingFiles.length}`);
  remainingFiles.forEach(f => console.log(`  📄 ${f.ObjectName}`));

  const penumbraAppItems = await listRemoteDir('penumbra-app');
  console.log(`\nItens em "penumbra-app/": ${penumbraAppItems.length}`);
  penumbraAppItems.forEach(i => console.log(`  ${i.IsDirectory ? '📁' : '📄'} ${i.ObjectName}`));

  console.log('\n🎉 ORGANIZAÇÃO NO BUNNY.NET CONCLUÍDA COM SUCESSO!');
  console.log(`🔗 Penumbra App URL: ${PULL_ZONE}/penumbra-app/index.html`);
  console.log(`🔗 Penumbra Portable: ${PULL_ZONE}/penumbra-app/Penumbra_Portable.html`);
}

if (require.main === module) {
  runReorganization().catch(err => {
    console.error('💥 Erro:', err);
    process.exit(1);
  });
}

module.exports = { runReorganization };
