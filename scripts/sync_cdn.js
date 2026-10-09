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
  
  const files = fs.readdirSync(SOURCE_MEDIA_DIR).filter(f => f.endsWith('.mp4') || f.endsWith('.mov'));
  const manifest = [];

  for (const file of files) {
    const filePath = path.join(SOURCE_MEDIA_DIR, file);
    const id = crypto.createHash('md5').update(file).digest('hex').substring(0, 10);
    const baseName = path.parse(file).name;
    
    const staticThumbName = `${baseName}_static.webp`;
    const staticThumbPath = path.join(OUTPUT_DIR, staticThumbName);
    const animThumbName = `${baseName}_anim.webp`;
    const animThumbPath = path.join(OUTPUT_DIR, animThumbName);
    const videoOutPath = path.join(OUTPUT_DIR, file);

    console.log(`\n[FFMPEG] 🎞️ Processing ${file}...`);
    
    // Copy video to build folder
    fs.copyFileSync(filePath, videoOutPath);
    
    // Generate Static Thumbnail (WebP for extreme efficiency)
    if (!fs.existsSync(staticThumbPath)) {
      execSync(`ffmpeg -y -i "${filePath}" -ss 00:00:01.000 -vframes 1 -vf "scale=320:-1" -c:v libwebp -quality 80 "${staticThumbPath}"`, { stdio: 'ignore' });
    }
    
    // Generate Animated Hover Preview (WebP, 10fps, 3 seconds max, ultra-low bitrate)
    if (!fs.existsSync(animThumbPath)) {
      execSync(`ffmpeg -y -i "${filePath}" -t 3 -vf "fps=10,scale=320:-1:flags=lanczos" -vcodec libwebp -lossless 0 -compression_level 4 -q:v 50 -loop 0 -preset default -an -vsync 0 "${animThumbPath}"`, { stdio: 'ignore' });
    }

    manifest.push({
      id: `clip_${id}`,
      filename: file,
      category: 'GIGANTERA',
      relative_path: `clips/${file}`,
      thumbnail: `clips/${staticThumbName}`,
      preview_anim: `clips/${animThumbName}`
    });

    // Upload Video, Static Thumb, and Anim Thumb
    await uploadToBunny(videoOutPath, `clips/${file}`);
    await uploadToBunny(staticThumbPath, `clips/${staticThumbName}`);
    await uploadToBunny(animThumbPath, `clips/${animThumbName}`);
  }

  // Generate and Upload Manifest
  const manifestPath = path.join(OUTPUT_DIR, 'media_manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log('\n[CDN] 📝 Manifest generated successfully.');
  
  await uploadToBunny(manifestPath, 'media_manifest.json');
  
  console.log(`\n[🏁] Synchronization Complete. Media is available at ${PULL_ZONE}/media_manifest.json`);
}

processMedia().catch(console.error);
