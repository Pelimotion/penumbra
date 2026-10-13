#!/usr/bin/env node
/**
 * Penumbra Video Assets CDN Sync
 * Uploads all 74 manifest video files (1.73 GB total) to Bunny Edge Storage
 * under 'penumbra-app/Espinhaco/1. In/' with resumable HEAD check & concurrency.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { loadEnvFileIfUnset } = require('./sync_utils');

loadEnvFileIfUnset(path.join(__dirname, '../.env'));

const STORAGE_ZONE = process.env.BUNNY_STORAGE_ZONE || 'gigantera';
const STORAGE_PASS = process.env.BUNNY_STORAGE_PASSWORD;
const PULL_ZONE = process.env.BUNNY_PULL_ZONE_URL || 'https://gigantera-penumbra.b-cdn.net';
const REGION = 'br.storage.bunnycdn.com';

if (!STORAGE_PASS) {
  console.error('[!] BUNNY_STORAGE_PASSWORD not found in .env');
  process.exit(1);
}

const manifestPath = path.join(__dirname, '../penumbra_engine/web_controller/public/media_manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const videoClips = manifest.filter(c => c.filename && (c.filename.endsWith('.mp4') || c.filename.endsWith('.mov')));

console.log(`[CDN SYNC] Encontrados ${videoClips.length} clipes de vídeo no manifesto.`);

function checkRemoteExists(remoteRelativePath) {
  return new Promise((resolve) => {
    const encoded = remoteRelativePath.split('/').map(encodeURIComponent).join('/');
    const url = `${PULL_ZONE}/penumbra-app/${encoded}`;
    const req = https.request(url, { method: 'HEAD' }, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(4000, () => { req.abort(); resolve(false); });
    req.end();
  });
}

function uploadVideo(localPath, remoteRelativePath) {
  return new Promise((resolve, reject) => {
    const stat = fs.statSync(localPath);
    const stream = fs.createReadStream(localPath);
    const fullRemote = 'penumbra-app/' + remoteRelativePath;
    const encodedPath = '/' + STORAGE_ZONE + '/' + fullRemote.split('/').map(encodeURIComponent).join('/');

    const req = https.request({
      hostname: REGION,
      path: encodedPath,
      method: 'PUT',
      headers: {
        'AccessKey': STORAGE_PASS,
        'Content-Length': stat.size,
        'Content-Type': 'video/mp4'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
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

async function runUpload() {
  const totalMb = videoClips.reduce((acc, c) => acc + (c.size_mb || 0), 0);
  console.log(`[CDN SYNC] Tamanho total: ${totalMb.toFixed(1)} MB (${(totalMb/1024).toFixed(2)} GB)`);
  console.log(`[CDN SYNC] Verificando e enviando para Bunny CDN...`);

  let completed = 0;
  let uploaded = 0;
  let skipped = 0;
  let totalUploadedBytes = 0;
  const startTime = Date.now();

  const CONCURRENCY = 4;
  let index = 0;

  async function worker(workerId) {
    while (index < videoClips.length) {
      const clip = videoClips[index++];
      const localPath = clip.absolute_path;

      if (!fs.existsSync(localPath)) {
        console.warn(`  [!] Arquivo local não encontrado: ${localPath}`);
        continue;
      }

      const exists = await checkRemoteExists(clip.relative_path);
      if (exists) {
        skipped++;
        completed++;
        process.stdout.write(`  [${completed}/${videoClips.length}] ⏭️ Pulando (já na CDN): ${clip.filename}\n`);
        continue;
      }

      const mb = clip.size_mb ? `${clip.size_mb.toFixed(1)} MB` : '';
      console.log(`  [${completed + 1}/${videoClips.length}] ⬆️ Enviando (${mb}): ${clip.filename}...`);
      try {
        const res = await uploadVideo(localPath, clip.relative_path);
        uploaded++;
        completed++;
        totalUploadedBytes += res.size;
        console.log(`  [${completed}/${videoClips.length}] ✓ Enviado: ${clip.filename}`);
      } catch (err) {
        console.error(`  [!] Erro ao enviar ${clip.filename}:`, err.message);
      }
    }
  }

  const workers = Array.from({ length: CONCURRENCY }, (_, i) => worker(i));
  await Promise.all(workers);

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n🎉 [CONCLUÍDO] Total de clipes: ${completed}/${videoClips.length}`);
  console.log(`   - Novos enviados: ${uploaded} (${(totalUploadedBytes / 1024 / 1024).toFixed(1)} MB)`);
  console.log(`   - Já existentes: ${skipped}`);
  console.log(`   - Tempo total: ${duration}s`);
}

if (require.main === module) {
  runUpload().catch(console.error);
}

module.exports = { runUpload };
