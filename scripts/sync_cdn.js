/**
 * Penumbra CDN Media Sync (Senior Edge-Orchestrator)
 * This script processes local raw video files, generates optimized WebP thumbnails and animated hover previews,
 * and seamlessly synchronizes them to the Bunny.net Edge Storage.
 * It strictly implements zero-server architecture principles by producing a static `media_manifest.json` for the client.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const crypto = require('crypto');
const https = require('https');

// Secure environment loading from the external DEV vault
const ENV_PATH = '/Volumes/PLM_SSD_01/Dev/.env';
if (fs.existsSync(ENV_PATH)) {
  const envContent = fs.readFileSync(ENV_PATH, 'utf-8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] = match[2].trim();
  });
}

const STORAGE_ZONE = process.env.BUNNY_STORAGE_ZONE || 'gigantera';
const STORAGE_PASS = process.env.BUNNY_STORAGE_PASSWORD;
const PULL_ZONE = process.env.BUNNY_PULL_ZONE_URL || 'https://gigantera-penumbra.b-cdn.net';
const REGION = 'storage.bunnycdn.com'; // Change to br.storage.bunnycdn.com if needed

// Local directory where you place new videos to be synced to the CDN
const SOURCE_MEDIA_DIR = path.join(__dirname, '../cdn_staging');
const OUTPUT_DIR = path.join(__dirname, '../cdn_build');

if (!STORAGE_PASS) {
  console.error('[!] BUNNY_STORAGE_PASSWORD not found in .env vault.');
  process.exit(1);
}

// Ensure staging directories exist
if (!fs.existsSync(SOURCE_MEDIA_DIR)) fs.mkdirSync(SOURCE_MEDIA_DIR, { recursive: true });
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// HTTP PUT Helper for Bunny Storage API
function uploadToBunny(localFilePath, remotePath) {
  return new Promise((resolve, reject) => {
    const fileStat = fs.statSync(localFilePath);
    const fileStream = fs.createReadStream(localFilePath);
    
    console.log(`[CDN] ⬆️ Uploading: ${remotePath} (${(fileStat.size / 1024 / 1024).toFixed(2)} MB)...`);

    const options = {
      hostname: REGION,
      path: `/${STORAGE_ZONE}/${remotePath}`,
      method: 'PUT',
      headers: {
        'AccessKey': STORAGE_PASS,
        'Content-Length': fileStat.size,
        'Content-Type': 'application/octet-stream'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 201) {
          console.log(`[CDN] ✅ Successfully uploaded: ${remotePath}`);
          resolve(true);
        } else {
          console.error(`[CDN] ❌ Upload failed for ${remotePath}: ${res.statusCode} - ${data}`);
          reject(new Error(`Status ${res.statusCode}`));
        }
      });
    });

    req.on('error', (e) => reject(e));
    fileStream.pipe(req);
  });
}

async function processMedia() {
  console.log('[*] Penumbra CDN Sync Orchestrator Initialized');
  
  const manifest = [];
  
  function scanDirRecursive(dir, baseDir) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
      
      if (entry.isDirectory()) {
        scanDirRecursive(fullPath, baseDir);
      } else {
        const ext = path.extname(entry.name).toLowerCase();
        
        // Handle JSON models/metadata
        if (ext === '.json' && entry.name !== 'media_manifest.json') {
          const outPath = path.join(OUTPUT_DIR, relativePath);
          fs.mkdirSync(path.dirname(outPath), { recursive: true });
          fs.copyFileSync(fullPath, outPath);
          uploadQueue.push({ local: outPath, remote: relativePath });
          manifest.push({
            id: `model_${crypto.createHash('md5').update(relativePath).digest('hex').substring(0, 10)}`,
            filename: entry.name,
            type: 'model',
            category: 'MODEL 3D',
            relative_path: relativePath
          });
        }
        
        // Handle Videos
        if (ext === '.mp4' || ext === '.mov') {
          const id = crypto.createHash('md5').update(relativePath).digest('hex').substring(0, 10);
          const baseName = path.parse(entry.name).name;
          const relativeDir = path.dirname(relativePath);
          
          const staticThumbName = `${baseName}_static.webp`;
          const animThumbName = `${baseName}_anim.webp`;
          
          const outDir = path.join(OUTPUT_DIR, relativeDir);
          fs.mkdirSync(outDir, { recursive: true });
          
          const videoOutPath = path.join(outDir, entry.name);
          const staticThumbPath = path.join(outDir, staticThumbName);
          const animThumbPath = path.join(outDir, animThumbName);
          
          console.log(`\n[FFMPEG] 🎞️ Processing ${relativePath}...`);
          fs.copyFileSync(fullPath, videoOutPath);
          
          if (!fs.existsSync(staticThumbPath)) {
            execSync(`ffmpeg -y -i "${fullPath}" -ss 00:00:01.000 -vframes 1 -vf "scale=320:-1" -c:v libwebp -quality 80 "${staticThumbPath}"`, { stdio: 'ignore' });
          }
          if (!fs.existsSync(animThumbPath)) {
            execSync(`ffmpeg -y -i "${fullPath}" -t 3 -vf "fps=10,scale=320:-1:flags=lanczos" -vcodec libwebp -lossless 0 -compression_level 4 -q:v 50 -loop 0 -preset default -an -vsync 0 "${animThumbPath}"`, { stdio: 'ignore' });
          }
          
          uploadQueue.push({ local: videoOutPath, remote: relativePath });
          uploadQueue.push({ local: staticThumbPath, remote: `${relativeDir}/${staticThumbName}` });
          uploadQueue.push({ local: animThumbPath, remote: `${relativeDir}/${animThumbName}` });
          
          // Determine project from folder structure (e.g. IN/ProjectName/1.in/)
          const pathParts = relativePath.split('/');
          const projName = pathParts.length > 2 ? pathParts[1] : 'GIGANTERA';
          const cat = pathParts[0] === 'OUT' ? 'SAÍDA (OUT)' : 'BRUTO (IN)';
          
          manifest.push({
            id: `clip_${id}`,
            filename: entry.name,
            project: projName,
            category: cat,
            type: 'video',
            relative_path: relativePath,
            thumbnail: `${relativeDir}/${staticThumbName}`,
            preview_anim: `${relativeDir}/${animThumbName}`
          });
        }
      }
    }
  }

  const uploadQueue = [];
  
  // Create IN and OUT folders if they don't exist
  const inDir = path.join(SOURCE_MEDIA_DIR, 'IN');
  const outDir = path.join(SOURCE_MEDIA_DIR, 'OUT');
  if (!fs.existsSync(inDir)) fs.mkdirSync(inDir, { recursive: true });
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  
  scanDirRecursive(SOURCE_MEDIA_DIR, SOURCE_MEDIA_DIR);

  // Upload everything sequentially
  for (const item of uploadQueue) {
    await uploadToBunny(item.local, item.remote);
  }

  // Generate and Upload Manifest
  const manifestPath = path.join(OUTPUT_DIR, 'media_manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log('\n[CDN] 📝 Manifest generated successfully.');
  
  await uploadToBunny(manifestPath, 'media_manifest.json');
  
  console.log(`\n[🏁] Synchronization Complete. Media is available at ${PULL_ZONE}/media_manifest.json`);
}

processMedia().catch(console.error);
