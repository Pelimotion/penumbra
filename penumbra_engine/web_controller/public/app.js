/**
 * PENUMBRA SYSTEM · Professional VJ Engine Cockpit
 * State-of-the-Art Layer-Based Compositing, Intelligent Mattes & Tonal Grading Engine
 * 
 * Features:
 * 1. Hardware Video Stream Playback (Real raw footage via HTML5 video elements, zero static frames)
 * 2. Zero-Distortion Geometric Aspect Ratio Preserver (Letterbox/Pillarbox & Centered Crop)
 * 3. 5-Layer Penumbra Compositing with Authentic Architectural Mattes
 * 4. Tonal Grading Engine (Gamma Curve, Black Pedestal, Midtones, Contrast & Sobel Edge Contours)
 * 5. Intelligent Autopilot with 15-Clip Anti-Repetition FIFO Buffer
 * 6. High-Precision Queue & Phrase Timeline with Take & 1-Bar Dissolve
 * 7. Headphone Safe Auditioning & Dynamic 1.In Media Pool Router
 */

// ============================================================================
// 0. HYBRID ASSET RESOLUTION STRATEGY (HARS)
// ============================================================================
// Determines if we are running locally, remotely controlling local, or fully cloud
const HARS = {
  getMode: () => {
    if (window.location.hostname === 'localhost') return 'local';
    if (window.location.hostname.includes('gigantera.xyz') || window.location.hostname.includes('vercel.app')) return 'cloud';
    return 'lan';
  },
  getApiBase: () => {
    const mode = HARS.getMode();
    const storedIP = localStorage.getItem('penumbra_lan_ip');
    if (mode === 'local') return '';
    if (mode === 'cloud' && storedIP) return `http://${storedIP}:3000`;
    if (mode === 'cloud') return 'https://gigantera-penumbra.b-cdn.net'; // Vibe-Coding Zero-Server CDN
    return ''; // LAN mode (accessed via IP) uses relative paths
  },
  getWsUrl: () => {
    const mode = HARS.getMode();
    const storedIP = localStorage.getItem('penumbra_lan_ip');
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    if (mode === 'local') return `${protocol}//localhost:3000`;
    if (mode === 'cloud' && storedIP) return `ws://${storedIP}:3000`;
    if (mode === 'cloud') return null; // No WS in pure CDN mode
    return `${protocol}//${window.location.host}`; // LAN mode
  },
  resolveUrl: (path) => `${HARS.getApiBase()}${path}`
};

// ============================================================================
// 0.45 PENUMBRA MEDIA CACHE & PERSISTENT BLOB STORAGE (CACHE API + INDEXEDDB)
// ============================================================================
const PenumbraMediaCache = {
  CACHE_NAME: 'penumbra-media-cache-v1',
  DB_NAME: 'penumbra_media_blobs_db',
  DB_STORE: 'video_blobs',
  db: null,
  blobUrls: new Map(), // clipId -> objectUrl

  init: async () => {
    try {
      if (typeof indexedDB !== 'undefined') {
        PenumbraMediaCache.db = await new Promise((resolve) => {
          const req = indexedDB.open(PenumbraMediaCache.DB_NAME, 1);
          req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(PenumbraMediaCache.DB_STORE)) {
              db.createObjectStore(PenumbraMediaCache.DB_STORE);
            }
          };
          req.onsuccess = (e) => resolve(e.target.result);
          req.onerror = () => resolve(null);
        });
      }
    } catch (e) {
      console.warn('[Cache] IndexedDB indisponível, operando via Cache API e memória:', e);
    }
  },

  has: async (clip) => {
    if (!clip) return false;
    if (PenumbraMediaCache.blobUrls.has(clip.id)) return true;
    if (typeof UserProfileManager !== 'undefined' && UserProfileManager.isClipCached(clip)) return true;
    try {
      if (typeof caches !== 'undefined') {
        const cache = await caches.open(PenumbraMediaCache.CACHE_NAME);
        const rel = (clip.relative_path || clip.filename || '').replace(/^\//, '');
        const cdnUrl = `https://gigantera-penumbra.b-cdn.net/${rel}`;
        const match = await cache.match(cdnUrl);
        if (match) return true;
      }
    } catch (e) {}
    return false;
  },

  getBlobUrl: async (clip) => {
    if (!clip) return null;
    if (PenumbraMediaCache.blobUrls.has(clip.id)) {
      return PenumbraMediaCache.blobUrls.get(clip.id);
    }
    // 1. Check IndexedDB
    if (PenumbraMediaCache.db) {
      try {
        const blob = await new Promise((resolve) => {
          const tx = PenumbraMediaCache.db.transaction(PenumbraMediaCache.DB_STORE, 'readonly');
          const store = tx.objectStore(PenumbraMediaCache.DB_STORE);
          const req = store.get(clip.id);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(null);
        });
        if (blob instanceof Blob) {
          const url = URL.createObjectURL(blob);
          PenumbraMediaCache.blobUrls.set(clip.id, url);
          return url;
        }
      } catch (e) {}
    }
    // 2. Check Cache API
    try {
      if (typeof caches !== 'undefined') {
        const cache = await caches.open(PenumbraMediaCache.CACHE_NAME);
        const rel = (clip.relative_path || clip.filename || '').replace(/^\//, '');
        const cdnUrl = `https://gigantera-penumbra.b-cdn.net/${rel}`;
        const res = await cache.match(cdnUrl);
        if (res) {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          PenumbraMediaCache.blobUrls.set(clip.id, url);
          return url;
        }
      }
    } catch (e) {}
    return null;
  },

  cacheClip: async (clip) => {
    if (!clip) return null;
    const rel = (clip.relative_path || clip.filename || '').replace(/^\//, '');
    const cdnUrl = `https://gigantera-penumbra.b-cdn.net/${rel}`;

    try {
      const response = await fetch(cdnUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const clone = response.clone();
      const blob = await response.blob();
      const sizeMb = Math.round((blob.size / (1024 * 1024)) * 100) / 100;

      // 1. Store in Cache API
      if (typeof caches !== 'undefined') {
        try {
          const cache = await caches.open(PenumbraMediaCache.CACHE_NAME);
          await cache.put(cdnUrl, clone);
        } catch (e) {}
      }

      // 2. Store in IndexedDB
      if (PenumbraMediaCache.db) {
        try {
          await new Promise((resolve, reject) => {
            const tx = PenumbraMediaCache.db.transaction(PenumbraMediaCache.DB_STORE, 'readwrite');
            const store = tx.objectStore(PenumbraMediaCache.DB_STORE);
            const req = store.put(blob, clip.id);
            req.onsuccess = () => resolve();
            req.onerror = (e) => reject(e.target.error);
          });
        } catch (e) {}
      }

      // 3. Register memory blob URL
      const blobUrl = URL.createObjectURL(blob);
      PenumbraMediaCache.blobUrls.set(clip.id, blobUrl);

      // 4. Update profile registry
      if (typeof UserProfileManager !== 'undefined') {
        if (!UserProfileManager.profile.cached_media_registry) {
          UserProfileManager.profile.cached_media_registry = {};
        }
        UserProfileManager.profile.cached_media_registry[clip.id] = {
          filename: clip.filename,
          size_mb: sizeMb,
          cached_at: new Date().toISOString(),
          is_downloaded: true,
          cached_web: true
        };
        UserProfileManager.save(true);
        UserProfileManager.updateCacheUI();
      }

      return blobUrl;
    } catch (err) {
      console.warn(`[Cache] Erro ao baixar e armazenar ${clip.filename}:`, err);
      throw err;
    }
  },

  clearCache: async () => {
    PenumbraMediaCache.blobUrls.forEach(url => {
      try { URL.revokeObjectURL(url); } catch (e) {}
    });
    PenumbraMediaCache.blobUrls.clear();

    try {
      if (typeof caches !== 'undefined') {
        await caches.delete(PenumbraMediaCache.CACHE_NAME);
      }
    } catch (e) {}

    if (PenumbraMediaCache.db) {
      try {
        await new Promise((resolve) => {
          const tx = PenumbraMediaCache.db.transaction(PenumbraMediaCache.DB_STORE, 'readwrite');
          const store = tx.objectStore(PenumbraMediaCache.DB_STORE);
          const req = store.clear();
          req.onsuccess = () => resolve();
          req.onerror = () => resolve();
        });
      } catch (e) {}
    }

    if (typeof UserProfileManager !== 'undefined') {
      UserProfileManager.profile.cached_media_registry = {};
      UserProfileManager.save(true);
      UserProfileManager.updateCacheUI();
    }

    renderMediaCards();
    if (typeof showMacroToast === 'function') {
      showMacroToast('Cache de mídias limpo com sucesso.');
    }
  },

  getStats: async () => {
    let count = 0;
    let sizeMb = 0;
    if (typeof caches !== 'undefined') {
      try {
        const cache = await caches.open(PenumbraMediaCache.CACHE_NAME);
        const keys = await cache.keys();
        count = keys.length;
      } catch (e) {}
    }
    if (typeof UserProfileManager !== 'undefined' && UserProfileManager.profile && UserProfileManager.profile.cached_media_registry) {
      const reg = UserProfileManager.profile.cached_media_registry;
      const items = Object.values(reg).filter(v => v.is_downloaded);
      count = Math.max(count, items.length);
      sizeMb = items.reduce((acc, it) => acc + (it.size_mb || 0), 0);
    }
    let quotaMb = 0;
    let usageMb = Math.round(sizeMb * 10) / 10;
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
      try {
        const est = await navigator.storage.estimate();
        if (est.quota) quotaMb = Math.round(est.quota / (1024 * 1024));
        if (est.usage) usageMb = Math.round(est.usage / (1024 * 1024));
      } catch (e) {}
    }
    return { count, sizeMb: Math.round(sizeMb * 10) / 10, usageMb, quotaMb };
  }
};
window.PenumbraMediaCache = PenumbraMediaCache;

// ============================================================================
// 0.5 TRI-SOURCE MEDIA PROVIDER (STANDALONE VJ ARCHITECTURE)
// ============================================================================
const MediaProvider = {
  mode: 'none', // 'local', 'cdn', 'youtube'
  localDirHandle: null,
  localFilesMap: new Map(), // relative_path -> File object
  localFilesByName: new Map(), // normalized_filename -> { file, path, isServer, size_mb }

  initLocal: async (dirHandle) => {
    MediaProvider.mode = 'local';
    MediaProvider.localDirHandle = dirHandle;
    MediaProvider.localFilesMap.clear();
    MediaProvider.localFilesByName.clear();
    const clips = [];
    
    // Check if there is already a local manifest
    async function getLocalManifest(handle) {
      try {
        const fileHandle = await handle.getFileHandle('media_manifest.json');
        const file = await fileHandle.getFile();
        return JSON.parse(await file.text());
      } catch (e) {
        return null;
      }
    }

    // Recursive folder scan to populate localFilesMap
    async function scanDir(handle, currentPath = '') {
      for await (const entry of handle.values()) {
        const entryPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
        if (entry.kind === 'file') {
          const ext = entry.name.split('.').pop().toLowerCase();
          if (['mp4', 'mov', 'webm', 'json'].includes(ext)) {
            const file = await entry.getFile();
            MediaProvider.localFilesMap.set(entryPath, file);
            MediaProvider.localFilesByName.set(entry.name.toLowerCase().trim(), {
              file,
              path: entryPath,
              filename: entry.name,
              size_mb: Math.round((file.size / (1024 * 1024)) * 100) / 100,
              isServer: false
            });
            
            if (ext === 'json') {
              if (entry.name !== 'media_manifest.json') {
                clips.push({
                  id: `local_model_${entry.name}`,
                  filename: entry.name,
                  type: 'model',
                  relative_path: entryPath,
                  category: 'MODEL 3D',
                  is_local: true
                });
              }
            } else {
              clips.push({
                id: `local_${Date.now()}_${Math.random().toString(36).substr(2,9)}`,
                filename: entry.name,
                folder: currentPath || 'ROOT',
                relative_path: entryPath,
                absolute_path: entryPath,
                width: 1920, height: 1080, duration: 10.0, fps: 60.0,
                codec: ext,
                category: currentPath.split('/')[0].toUpperCase() || 'UNCATEGORIZED',
                suggested_layer: 0,
                thumbnail: '', 
                is_local: true
              });
            }
          }
        } else if (entry.kind === 'directory') {
          await scanDir(entry, entryPath);
        }
      }
    }
    
    await scanDir(dirHandle);

    // AUTO INSTALLER LOGIC (OTA)
    if (clips.length === 0) {
      if (confirm('📦 PASTA VAZIA DETECTADA!\\nDeseja instalar a Biblioteca Completa do Gigantera (Mídias, Modelos 3D e Executável Offline) direto da nuvem CDN nesta pasta?')) {
        console.log('[Media Nexus] Iniciando Instalação OTA...');
        const CDN_BASE = 'https://gigantera-penumbra.b-cdn.net';
        
        const manifestRes = await fetch(`${CDN_BASE}/media_manifest.json`);
        const manifestData = await manifestRes.json();
        
        const progressDiv = document.createElement('div');
        progressDiv.style = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#111;padding:30px;border:1px solid #00f0ff;color:#fff;z-index:99999;font-family:monospace;text-align:center;border-radius:8px;box-shadow: 0 0 40px rgba(0,240,255,0.2);';
        progressDiv.innerHTML = `<h3>📥 INSTALANDO GIGANTERA OFFLINE</h3><p id="ota-status" style="margin:20px 0;">Preparando download de ${manifestData.length} itens...</p><progress id="ota-bar" value="0" max="100" style="width:100%;height:20px;"></progress>`;
        document.body.appendChild(progressDiv);

        const downloadQueue = [
          { remote: 'media_manifest.json', local: 'media_manifest.json' },
          { remote: 'Penumbra_Portable.html', local: 'Penumbra_Offline_Executable.html' }
        ];

        for (const item of manifestData) {
          if (item.relative_path) downloadQueue.push({ remote: item.relative_path, local: item.relative_path });
          if (item.thumbnail) downloadQueue.push({ remote: item.thumbnail, local: item.thumbnail });
          if (item.preview_anim) downloadQueue.push({ remote: item.preview_anim, local: item.preview_anim });
        }

        async function ensureDirectory(baseHandle, pathStr) {
          const parts = pathStr.split('/');
          let currentHandle = baseHandle;
          for (const part of parts) {
            if (!part) continue;
            currentHandle = await currentHandle.getDirectoryHandle(part, { create: true });
          }
          return currentHandle;
        }

        let doneCount = 0;
        for (const fileItem of downloadQueue) {
          document.getElementById('ota-status').textContent = `Baixando: ${fileItem.local}`;
          try {
            const res = await fetch(`${CDN_BASE}/${fileItem.remote}`);
            if (res.ok) {
              const blob = await res.blob();
              const parts = fileItem.local.split('/');
              const fileName = parts.pop();
              const dirPath = parts.join('/');
              
              const targetDirHandle = dirPath ? await ensureDirectory(dirHandle, dirPath) : dirHandle;
              const fileHandle = await targetDirHandle.getFileHandle(fileName, { create: true });
              const writable = await fileHandle.createWritable();
              await writable.write(blob);
              await writable.close();
            }
          } catch (e) {
            console.warn(`Falha no download OTA: ${fileItem.local}`, e);
          }
          doneCount++;
          document.getElementById('ota-bar').value = (doneCount / downloadQueue.length) * 100;
        }

        progressDiv.innerHTML = `<h3>✅ INSTALAÇÃO CONCLUÍDA!</h3><p>O Penumbra Engine portátil e todas as mídias agora são nativas no seu HD.</p>`;
        setTimeout(() => progressDiv.remove(), 4000);
        
        // Re-scan dynamically created files
        MediaProvider.localFilesMap.clear();
        clips.length = 0;
        await scanDir(dirHandle);
      }
    }

    const localManifest = await getLocalManifest(dirHandle);
    
    // Auto-Launch Portable HTML if present and we aren't already running in it
    const isOfflineMode = window.location.protocol === 'blob:' || window.location.protocol === 'file:';
    if (!isOfflineMode) {
      try {
        const execHandle = await dirHandle.getFileHandle('Penumbra_Offline_Executable.html');
        const execFile = await execHandle.getFile();
        const execUrl = URL.createObjectURL(execFile);
        
        const popup = window.open(execUrl, '_blank');
        if (popup) {
          document.body.innerHTML = `
            <div style="display:flex; flex-direction:column; justify-content:center; align-items:center; height:100vh; background:#050505; color:#00f0ff; font-family:monospace; text-align:center;">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
              <h2 style="margin-top:20px; font-size:24px;">GIGANTERA OFFLINE INICIADO</h2>
              <p style="color:#aaa; max-width:400px; line-height:1.6;">O motor portátil foi aberto em uma nova aba rodando diretamente do seu SSD com latência zero.<br><br>Por favor, acesse a nova aba.</p>
            </div>
          `;
          return []; // Halt current app
        }
      } catch (e) {
        // Not found, continue normally
      }
    }

    if (localManifest && localManifest.length > 0) {
      console.log('[Media Nexus] Usando media_manifest.json local otimizado.');
      return localManifest;
    }

    return clips;
  },

  scanExtraDir: async (dirHandle) => {
    const clips = [];
    async function scan(handle, currentPath = '') {
      for await (const entry of handle.values()) {
        const entryPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
        if (entry.kind === 'file') {
          const ext = entry.name.split('.').pop().toLowerCase();
          if (['mp4', 'mov', 'webm'].includes(ext)) {
            const file = await entry.getFile();
            // Prefix to avoid collisions
            const uniquePath = `EXTRA_${Date.now()}/${entryPath}`;
            MediaProvider.localFilesMap.set(uniquePath, file);
            MediaProvider.localFilesByName.set(entry.name.toLowerCase().trim(), {
              file,
              path: uniquePath,
              filename: entry.name,
              size_mb: Math.round((file.size / (1024 * 1024)) * 100) / 100,
              isServer: false
            });
            clips.push({
              id: `local_extra_${Date.now()}_${Math.random().toString(36).substr(2,9)}`,
              filename: entry.name,
              folder: currentPath || 'LOCAL IMPORT',
              project: 'LOCAL IMPORT',
              project_folder: currentPath || 'LOCAL IMPORT',
              relative_path: uniquePath,
              absolute_path: uniquePath,
              width: 1920, height: 1080, duration: 10.0, fps: 60.0,
              codec: ext,
              category: 'IMPORTAÇÃO LOCAL',
              suggested_layer: 0,
              thumbnail: '',
              is_local: true
            });
          }
        } else if (entry.kind === 'directory') {
          await scan(entry, entryPath);
        }
      }
    }
    await scan(dirHandle);
    MediaProvider.syncSmartDeduplication();
    return clips;
  },

  initLocalFilesAutoIndex: async () => {
    // 0. Auto-index local files from server if running on localhost
    if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
      try {
        const res = await fetch('/api/local-files/index');
        if (res.ok) {
          const data = await res.json();
          if (data && Array.isArray(data.files)) {
            data.files.forEach(f => {
              const norm = (f.filename || '').toLowerCase().trim();
              if (norm) {
                MediaProvider.localFilesByName.set(norm, {
                  filename: f.filename,
                  path: f.relative_path || f.filename,
                  absolute_path: f.absolute_path,
                  size_mb: f.size_mb,
                  isServer: true
                });
              }
            });
            console.log(`[SmartDedup] Auto-indexados ${data.files.length} arquivos locais via backend.`);
          }
        }
      } catch (e) {}
    }
  },

  syncSmartDeduplication: () => {
    if (!allClips || allClips.length === 0) return;
    let matchedCount = 0;
    allClips.forEach(clip => {
      const norm = (clip.filename || '').toLowerCase().trim();
      const match = MediaProvider.localFilesByName.get(norm);
      if (match) {
        clip.has_local_match = true;
        clip.local_match_info = match;
        matchedCount++;
      } else {
        clip.has_local_match = false;
      }
    });

    const lblDedup = document.getElementById('cfg-dedup-stats-val');
    if (lblDedup) {
      lblDedup.textContent = `${matchedCount} / ${allClips.length} VINCULADOS`;
    }
  },

  initCDN: async () => {
    MediaProvider.mode = 'cdn';
    await MediaProvider.initLocalFilesAutoIndex();

    // 0. If running on localhost, prefer controller server manifest to include downloads and local edits
    if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
      try {
        const resLocal = await fetch('/api/manifest');
        if (resLocal.ok) {
          const localClips = await resLocal.json();
          if (Array.isArray(localClips) && localClips.length > 0) {
            console.log(`[MediaProvider] Loaded manifest from local controller (${localClips.length} clips)`);
            return localClips;
          }
        }
      } catch (e) {}
    }
    // 1. Try Bunny Edge CDN
    try {
      const res = await fetch('https://gigantera-penumbra.b-cdn.net/media_manifest.json');
      if (res.ok) {
        console.log('[MediaProvider] Loaded manifest from Bunny CDN');
        return await res.json();
      }
    } catch(e) {
      console.warn('[CDN] Failed to load from Edge CDN, trying local/origin manifest...', e);
    }
    // 2. Try relative /media_manifest.json (served locally or offline)
    try {
      const res2 = await fetch('/media_manifest.json');
      if (res2.ok) {
        console.log('[MediaProvider] Loaded manifest from local /media_manifest.json');
        return await res2.json();
      }
    } catch(e2) {}
    // 3. Try /api/manifest endpoint
    try {
      const res3 = await fetch('/api/manifest');
      if (res3.ok) {
        console.log('[MediaProvider] Loaded manifest from /api/manifest');
        return await res3.json();
      }
    } catch(e3) {}
    return [];
  },

  getMediaUrl: (clipOrPath) => {
    if (!clipOrPath) return '';
    const clip = typeof clipOrPath === 'object' ? clipOrPath : allClips.find(c => c.relative_path === clipOrPath || c.filename === clipOrPath || c.id === clipOrPath);
    const relPath = typeof clipOrPath === 'string' ? clipOrPath : (clip ? (clip.relative_path || clip.filename) : '');
    const normName = (clip?.filename || relPath.split('/').pop() || '').toLowerCase().trim();

    // 0. Smart Deduplication: If file exists locally on SSD or via File System Access API
    const smartDedup = typeof UserProfileManager !== 'undefined' ? UserProfileManager.getSetting('smart_dedup_enabled', true) : true;
    if (smartDedup && MediaProvider.localFilesByName.has(normName)) {
      const match = MediaProvider.localFilesByName.get(normName);
      if (match.file instanceof File) {
        return URL.createObjectURL(match.file);
      }
      if (match.isServer && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
        return `/api/raw-video?path=${encodeURIComponent(match.path || match.filename)}`;
      }
    }

    // 1. Persistent Web Cache / Memory Blob URL
    if (clip && PenumbraMediaCache.blobUrls.has(clip.id)) {
      return PenumbraMediaCache.blobUrls.get(clip.id);
    }

    // 2. Local cache registry from user profile
    if (clip && typeof UserProfileManager !== 'undefined') {
      const cacheInfo = UserProfileManager.getCacheDetails(clip);
      if (cacheInfo.isCached && cacheInfo.local_path) {
        const clean = cacheInfo.local_path.startsWith('/') ? cacheInfo.local_path : `/${cacheInfo.local_path}`;
        return clean;
      }
    }

    // 3. Direct stream url if resolved
    if (clip && clip.stream_url) {
      if ((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && !clip.stream_url.includes('/api/stream/proxy')) {
        return `/api/stream/proxy?url=${encodeURIComponent(clip.stream_url)}`;
      }
      return clip.stream_url;
    }

    // 4. Direct external HTTP URL
    if (relPath.startsWith('http://') || relPath.startsWith('https://')) {
      if (clip && clip.is_stream && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && !relPath.includes('/api/stream/proxy')) {
        return `/api/stream/proxy?url=${encodeURIComponent(relPath)}`;
      }
      return relPath;
    }

    // 5. Local downloaded files (media_pool/downloads)
    if (relPath.startsWith('downloads/') || (clip && clip.is_downloaded)) {
      const cleanDown = relPath.startsWith('/') ? relPath : `/${relPath}`;
      return cleanDown;
    }

    // 6. Standalone File System Access API
    if (MediaProvider.mode === 'local') {
      const file = MediaProvider.localFilesMap.get(relPath);
      if (file) return URL.createObjectURL(file);
      const baseName = relPath.split('/').pop();
      for (const [k, v] of MediaProvider.localFilesMap.entries()) {
        if (k.endsWith(baseName)) return URL.createObjectURL(v);
      }
    }

    // 7. Local server streaming if on localhost and server running
    if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
      if (relPath && !relPath.startsWith('http')) {
        return `/api/raw-video?path=${encodeURIComponent(relPath)}`;
      }
    }

    // 8. Bunny Edge CDN (Universal reliable streaming fallback - GUARANTEES CLIPS NEVER BLACK)
    const cleanPath = relPath.startsWith('/') ? relPath.substring(1) : relPath;
    return `https://gigantera-penumbra.b-cdn.net/${cleanPath}`;
  },

  getThumbUrl: (clip) => {
    if (!clip) return '';
    if (clip.thumbnail && (clip.thumbnail.startsWith('http://') || clip.thumbnail.startsWith('https://'))) {
      return clip.thumbnail;
    }
    const ytId = clip.youtube_id || extractYouTubeId(clip.filename) || extractYouTubeId(clip.relative_path);
    if (ytId) {
      return `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;
    }
    if (!clip.thumbnail) return '';
    if (clip.is_downloaded && !clip.thumbnail.startsWith('http')) {
      const cleanThumb = clip.thumbnail.startsWith('/') ? clip.thumbnail.substring(1) : clip.thumbnail;
      return `/thumbnails/${cleanThumb}`;
    }
    const cleanThumb = clip.thumbnail.startsWith('/') ? clip.thumbnail.substring(1) : clip.thumbnail;
    if (MediaProvider.mode === 'cdn' && !clip.is_downloaded) {
      return `https://gigantera-penumbra.b-cdn.net/${cleanThumb}`;
    }
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return `/thumbnails/${cleanThumb}`;
    }
    return `https://gigantera-penumbra.b-cdn.net/${cleanThumb}`;
  },

  getPreviewAnimUrl: (clip) => {
    if (!clip || !clip.preview_anim) return '';
    if (clip.preview_anim.startsWith('http://') || clip.preview_anim.startsWith('https://')) return clip.preview_anim;
    const cleanAnim = clip.preview_anim.startsWith('/') ? clip.preview_anim.substring(1) : clip.preview_anim;
    return `https://gigantera-penumbra.b-cdn.net/${cleanAnim}`;
  }
};

// ============================================================================
// 1. APPLICATION STATE
// ============================================================================
let appState = {
  macro_state: 'GROOVE',
  master_intensity: 1.0,
  blackout: false,
  auto_mode: true,
  fit_mode: 'fill', // 'fill' (zero black borders) by default across all layers
  buildup_score: 0.12,
  drop_likelihood: 0.05,
  bpm: 124.0,
  bpm_manual_lock: false,
  phase: 0.0,
  bar: 1,
  phrase_bar: 1,
  set_time: 1275,
  set_total_duration: 10759,
  stems: { drums: 0.65, bass: 0.70, other: 0.45, vocals: 0.30 },
  bands: { sub: 0.65, bass: 0.70, lo_mid: 0.45, hi_mid: 0.35, presence: 0.28, air: 0.20 },
  layers: {
    layer0: { active: true, opacity: 1.0, clipId: 'clip_001', name: 'Animate_silver_tail_in_sand_202608120209.mp4', blend: 'Normal', matte: 'none', matte_invert: false, rotation: 0, fit_mode: 'fill' },
    layer1: { active: true, scale: 1.12, blend: 'Multiply', opacity: 0.0, matte: 'none', matte_invert: false, rotation: 0, fit_mode: 'fill' },
    layer2: { active: true, opacity: 0.22, blend: 'Screen', edge_mix: 0.22, edge_threshold: 0.30, matte: 'none', matte_invert: false, rotation: 0, fit_mode: 'fill' },
    layer3: { active: true, opacity: 1.0, blend: 'Normal', clipId: 'clip_005', name: 'Metallic_spine_sculpture_moving_1080p_202608292000.mp4', matte: 'none', matte_invert: false, rotation: 0, fit_mode: 'fill' },
    layer4: { active: false, opacity: 0.0, blend: 'Difference', clipId: 'clip_006', name: 'Silver_fish_spine_descending_ocean_202608120051.mp4', matte: 'none', matte_invert: false, rotation: 0, fit_mode: 'fill' }
  },
  phrase: {
    length_bars: 16,
    current_bar: 1,
    current_beat: 1,
    total_bars: 1,
    auto_phrase_take: true,
    last_take_bar: 0
  },
  matte_target_layer: 'master',
  master_matte: 'none',
  tonal: {
    gamma: 0.85,
    brightness: -0.05,
    midtones: 1.00,
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
  autopilot_rules: {
    auto_cycle: true,
    auto_arm_drop: true,
    auto_drop_take: true,
    anti_blowout: true,
    auto_mattes: false
  },
  autopilot_min_bars: 16,
  macro_preset_indices: {
    INTRO: 0,
    GROOVE: 0,
    BUILD: 0,
    DROP: 0,
    BREAK: 0
  },
  manual_forced_state: null,
  manual_forced_bars: 0,
  active_macro_preset: null,
  last_take_total_bar: 0,
  vertical_mode: false,
  vertical_projection: false,
  projector_compensation: true,
  audio_gain: 1.0,
  fps_limit: 30,
  network_output_enabled: false,
  fx: {
    active: false,
    target: 'master', // 'master' (Master PGM Output), 'deck_a' (Deck A L0), 'deck_b' (Deck B L3)
    activeEffect: 'pixel_stretch',
    masterIntensity: 0.8,
    masterSpeed: 1.0,
    auto_adapt: true,
    autopilotActive: false,
    autopilotPreset: 'ambient_drift',
    lastAutopilotChangeBar: 0,
    pixel_stretch: {
      enabled: true,
      direction: 90, // degrees or 'down' (90), 'up' (270), 'right' (0), 'left' (180)
      source: 'luma',
      channels: 'rgba_split',
      intensity: 0.85,
      threshold: 0.50,
      length: 240,
      pixel_size: 2,
      curve: 'exponential',
      smoothness: 1.8,
      start_offset: 0.0
    },
    pixel_sorter: {
      enabled: true,
      mode: 'advanced',
      threshold_min: 0.30,
      threshold_max: 0.85,
      angle: 90,
      length: 200,
      stretch_mode: false,
      sorting_mode: 'luminance',
      random_noise: 0.15,
      noise_scale: 18,
      noise_speed: 1.2,
      mask: 'full'
    },
    bad_tv: {
      enabled: true,
      tv_curvature: 0.08,
      tv_warp_sync_v: 0.0,
      tv_warp_sync_h: 0,
      tv_warp_wiggle: 0.15,
      tv_scanlines_opacity: 0.40,
      tv_scanlines_density: 360,
      tv_rgb_split: 12,
      tv_tape_noise: 0.20
    },
    rxxr: {
      enabled: true,
      style: 'matrix_code',
      density: 10,
      edge_mode: true,
      edge_threshold: 0.40,
      expand_markers: 0.35,
      tint: '#00ff88'
    },
    modulation: {
      enabled: true,
      color_mode: 'cmyk_misreg',
      frequency: 45,
      phase: 0,
      amplitude: 24,
      lines_count: 64,
      line_thickness: 1.4,
      lowpass: 0.35,
      cmyk_offset: 8
    }
  }
};
window.appState = appState;

function extractYouTubeId(url) {
  if (!url || typeof url !== 'string') return null;
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/|live\/))([\w-]{11})/);
  return match ? match[1] : null;
}
function isYouTubeUrl(url) {
  return Boolean(extractYouTubeId(url));
}

let allClips = [];
let activeFolderFilter = 'ALL';
let activeCategoryFilter = 'ALL';
let activeSourceFilter = 'ALL';
let isGroupedByFolder = true;
let isGroupedByCategory = false;
let activeDownloadJobs = new Map();
let allMattes = [];
let activeMatteCategoryFilter = 'ALL';
let activeSelectedMatte = null;
let ws = null;
let imageCache = {};
let matteCache = {};
let lumaCanvasCache = {};

// Central M/E Transition State Engine (Resolume & ATEM Standard)
let selectedTransitionDuration = 1.0;
let isSyncBeatTransition = false;
let selectedTransitionMode = 'dissolve'; // 'dissolve' or 'dip'
let isAutoTransitioning = false;
let autoTransitionProgress = 0.0;
let currentTransitionDuration = 1.0;
let focusedClipId = null;

// Anti-Repetition FIFO History (Guarantees zero repeat over 15 transitions)
let playedClipsHistory = ['clip_001', 'clip_005', 'clip_006'];

// Upcoming Queue Items
let queueList = [
  { slot: 'CUE ATUAL', clipId: 'clip_005', name: 'Metallic_spine_sculpture_moving_1080p_202608292000.mp4', layer: 'L3', matte: 'none', beatsRemaining: 0, status: 'ARMADO' },
  { slot: '+8 BARS', clipId: 'clip_006', name: 'Silver_fish_spine_descending_ocean_202608120051.mp4', layer: 'L4', matte: 'none', beatsRemaining: 32, status: 'EM 32 BEATS' },
  { slot: '+16 BARS', clipId: 'clip_002', name: 'Installation_documentation_breat…_202603282136.mp4', layer: 'L0', matte: 'none', beatsRemaining: 64, status: 'EM 64 BEATS' },
  { slot: '+24 BARS', clipId: 'clip_003', name: 'Kinetic_sculpture_flexing_in_water_202609010135.mp4', layer: 'L3', matte: 'none', beatsRemaining: 96, status: 'EM 96 BEATS' }
];

// ============================================================================
// 2. DOM & HARDWARE VIDEO CACHE REFERENCES
// ============================================================================
const badgeState = document.getElementById('badge-macro-state');
const badgeBpm = document.getElementById('badge-bpm');
const badgeBar = document.getElementById('badge-bar');
const btnAuto = document.getElementById('btn-auto-toggle');
const txtAuto = document.getElementById('txt-auto-mode');
const btnBlackout = document.getElementById('btn-blackout');
const prgFitLbl = document.getElementById('prg-fit-lbl');

// Audio Radar
const valBuildup = document.getElementById('val-buildup');
const barBuildup = document.getElementById('bar-buildup');
const valDrop = document.getElementById('val-drop');
const barDrop = document.getElementById('bar-drop');
const cardDrop = document.getElementById('card-drop-radar');
const beatOrb = document.getElementById('beat-pulse-orb');
const beatDisplay = document.getElementById('beat-display');
const phaseDisplay = document.getElementById('phase-display');
const tagPreDrop = document.getElementById('tag-pre-drop');

// Meters & Stems
const meters = {
  sub: document.getElementById('meter-sub'),
  bass: document.getElementById('meter-bass'),
  lomid: document.getElementById('meter-lomid'),
  himid: document.getElementById('meter-himid'),
  pres: document.getElementById('meter-pres'),
  air: document.getElementById('meter-air')
};

const stems = {
  drums: document.getElementById('stem-drums'),
  bass: document.getElementById('stem-bass'),
  other: document.getElementById('stem-other'),
  vocals: document.getElementById('stem-vocals')
};

// Canvases
const prgCanvas = document.getElementById('program-canvas');
const prvCanvas = document.getElementById('preview-canvas');
const prgCtx = prgCanvas ? prgCanvas.getContext('2d') : null;
const prvCtx = prvCanvas ? prvCanvas.getContext('2d') : null;

// Timecodes & Playheads
const prgTimecode = document.getElementById('prg-timecode');
const prvTimecode = document.getElementById('prv-timecode');
const prgPlayhead = document.getElementById('prg-playhead-fill');
const prvPlayhead = document.getElementById('prv-playhead-fill');

// Crossfader
const crossfader = document.getElementById('crossfader');

// Headphone Cue
const btnAudioMonitor = document.getElementById('btn-audio-monitor');
const txtAudioMonitor = document.getElementById('txt-audio-monitor');
const sliderCueVol = document.getElementById('slider-cue-vol');
const audioCuePlayer = document.getElementById('html5-audio-cue');

// Rescan Button
const btnRescan = document.getElementById('btn-rescan-media');

// HTML5 Video Players (for true moving video streams)
let playerL0 = document.getElementById('player-l0');
let playerL3 = document.getElementById('player-l3');
const playerL4 = document.getElementById('player-l4');

// Active Project & Audio Source States
let activeProjectFilter = 'ALL';
let currentAudioSource = { mode: 'test', device_name: 'MP3 Interno (01 REC-2024-04-28.mp3)', devices: [] };

// Offscreen Canvases for Tonal & Edge Processing
const offscreenA = document.createElement('canvas');
const offscreenB = document.createElement('canvas');
const offCtxA = offscreenA.getContext('2d');
const offCtxB = offscreenB.getContext('2d');
offscreenA.width = 640;
offscreenA.height = 360;
offscreenB.width = 640;
offscreenB.height = 360;

// Dual Persistent Broadcast Buses (Bus A = Program Master, Bus B = Preview Cue)
const busCanvasA = document.createElement('canvas');
const busCanvasB = document.createElement('canvas');
const busCtxA = busCanvasA.getContext('2d');
const busCtxB = busCanvasB.getContext('2d');
busCanvasA.width = 640;
busCanvasA.height = 360;
busCanvasB.width = 640;
busCanvasB.height = 360;

// Handover Frame Buffer for 100% Glitch-Free Seamless Commit
const handoverCanvas = document.createElement('canvas');
const handoverCtx = handoverCanvas.getContext('2d');
handoverCanvas.width = 640;
handoverCanvas.height = 360;
let hasHandoverFrame = false;

// Theater / Expanded Modal Elements
const theaterModal = document.getElementById('theater-modal');
const theaterCanvas = document.getElementById('theater-canvas');
const theaterCtx = theaterCanvas ? theaterCanvas.getContext('2d') : null;
const theaterBadge = document.getElementById('theater-badge');
const theaterClipName = document.getElementById('theater-clip-name');
const theaterTimecode = document.getElementById('theater-timecode');
const theaterTagLayer = document.getElementById('theater-tag-layer');
const theaterTagMatte = document.getElementById('theater-tag-matte');
const btnTheaterClose = document.getElementById('btn-theater-close');
const btnTheaterPopout = document.getElementById('btn-theater-popout');
const btnTheaterTake = document.getElementById('btn-theater-take');

let activeTheaterFeed = null; // 'preview' | 'program' | null

function openTheater(feed = 'preview') {
  activeTheaterFeed = feed;
  if (!theaterModal) return;
  theaterModal.classList.add('active');
  if (theaterBadge) {
    if (feed === 'program') {
      theaterBadge.className = 'badge badge-live';
      theaterBadge.textContent = 'PROGRAM (AO VIVO NO BÊ)';
    } else {
      theaterBadge.className = 'badge badge-preview';
      theaterBadge.textContent = 'PREVIEW (EXPANDIDO)';
    }
  }
}

function closeTheater() {
  activeTheaterFeed = null;
  if (theaterModal) theaterModal.classList.remove('active');
}

window.openTheater = openTheater;
window.closeTheater = closeTheater;

// ============================================================================
// 3. WEBSOCKET CLIENT & BIDIRECTIONAL TELEMETRY
// ============================================================================
function initWebSocket() {
  const wsUrl = HARS.getWsUrl();
  if (!wsUrl) {
    console.warn('[HARS] Running in Cloud-Only mode. WebSocket disabled.');
    return;
  }
  
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log('[*] Connected to Penumbra Web Server.');
    const chip = document.getElementById('chip-ndi');
    if (chip) chip.classList.add('live');
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === 'init' || msg.type === 'state_updated') {
        const incoming = msg.state || {};
        if (appState.bpm_manual_lock && incoming.bpm !== undefined) {
          delete incoming.bpm;
        }
        if ((appState.manual_forced_state || !appState.auto_mode) && incoming.macro_state !== undefined) {
          delete incoming.macro_state;
        }
        if (incoming.layers) {
          for (const [lid, lprops] of Object.entries(incoming.layers)) {
            if (appState.layers[lid]) {
              appState.layers[lid] = {
                ...appState.layers[lid],
                ...lprops,
                rotation: lprops.rotation !== undefined ? lprops.rotation : (appState.layers[lid].rotation || 0),
                fit_mode: lprops.fit_mode !== undefined ? lprops.fit_mode : (appState.layers[lid].fit_mode || 'fit')
              };
            }
          }
          delete incoming.layers;
        }
        appState = { ...appState, ...incoming };
        window.appState = appState;
        updateUI();
        syncVideoSources();
      } else if (msg.type === 'telemetry') {
        const incomingData = { ...(msg.data || {}) };
        if (appState.bpm_manual_lock && incomingData.bpm !== undefined) {
          delete incomingData.bpm;
        }
        if ((appState.manual_forced_state || !appState.auto_mode) && incomingData.macro_state !== undefined) {
          delete incomingData.macro_state;
        }
        if (incomingData.layers) {
          for (const [lid, lprops] of Object.entries(incomingData.layers)) {
            if (appState.layers[lid]) {
              appState.layers[lid] = {
                ...appState.layers[lid],
                ...lprops,
                rotation: lprops.rotation !== undefined ? lprops.rotation : (appState.layers[lid].rotation || 0),
                fit_mode: lprops.fit_mode !== undefined ? lprops.fit_mode : (appState.layers[lid].fit_mode || 'fill')
              };
            }
          }
          delete incomingData.layers;
        }
        if (incomingData.audio_source) {
          updateAudioSourceUI(incomingData.audio_source);
        }
        appState = { ...appState, ...incomingData };
        window.appState = appState;
        updateMeters();
        runAutopilotEngine();
      } else if (msg.type === 'audio_source_status') {
        updateAudioSourceUI(msg.data);
      } else if (msg.type === 'manifest_updated') {
        allClips = msg.data;
        loadCustomClipsFromStorage();
        renderFolderPills();
        renderMediaCards();
      } else if (msg.type === 'download_progress') {
        const job = msg.job;
        if (job) {
          activeDownloadJobs.set(job.id, job);
          const pWrap = document.getElementById('nsd-progress-wrap');
          const pStatus = document.getElementById('nsd-progress-status');
          const pMetrics = document.getElementById('nsd-progress-metrics');
          const pBar = document.getElementById('nsd-progress-bar');
          if (pWrap) pWrap.style.display = 'block';
          if (pStatus) pStatus.textContent = `BAIXANDO: ${job.title || 'MÍDIA'}...`;
          if (pMetrics) pMetrics.textContent = `${job.progress}% · ${job.speed || ''} · ETA ${job.eta || ''}`;
          if (pBar) pBar.style.width = `${job.progress}%`;
        }
      } else if (msg.type === 'download_complete') {
        const job = msg.job;
        const newClip = msg.clip;
        if (job) activeDownloadJobs.delete(job.id);
        const pStatus = document.getElementById('nsd-progress-status');
        const pBar = document.getElementById('nsd-progress-bar');
        if (pStatus) pStatus.textContent = `DOWNLOAD CONCLUÍDO: ${newClip ? newClip.filename : 'OK'}`;
        if (pBar) pBar.style.width = '100%';
        setTimeout(() => {
          const pWrap = document.getElementById('nsd-progress-wrap');
          if (pWrap) pWrap.style.display = 'none';
        }, 3000);
        if (newClip && !allClips.some(c => c.id === newClip.id)) {
          allClips.unshift(newClip);
          renderFolderPills();
          renderMediaCards();
        }
      } else if (msg.type === 'download_error') {
        const pStatus = document.getElementById('nsd-progress-status');
        if (pStatus) pStatus.textContent = `ERRO NO DOWNLOAD: ${msg.job?.error || 'Falha'}`;
      } else if (msg.type === 'clip_updated') {
        const updated = msg.clip;
        if (updated) {
          const idx = allClips.findIndex(c => c.id === updated.id);
          if (idx !== -1) allClips[idx] = { ...allClips[idx], ...updated };
          renderMediaCards();
        }
      } else if (msg.type === 'user_profile_updated') {
        if (msg.profile && typeof UserProfileManager !== 'undefined') {
          UserProfileManager.profile = {
            ...UserProfileManager.profile,
            ...msg.profile,
            settings: { ...UserProfileManager.profile.settings, ...(msg.profile.settings || {}) },
            category_overrides: { ...(msg.profile.category_overrides || {}) },
            cached_media_registry: { ...(msg.profile.cached_media_registry || {}) }
          };
          UserProfileManager.updateCacheUI();
          UserProfileManager.applyCategoryOverrides();
          renderMediaCards();
        }
      } else if (msg.type === 'clip_cached') {
        if (msg.clipId) {
          const clip = allClips.find(c => c.id === msg.clipId || c.filename === msg.filename);
          if (clip) {
            clip.is_downloaded = true;
            clip.relative_path = msg.local_path;
          }
          if (typeof UserProfileManager !== 'undefined') {
            if (!UserProfileManager.profile.cached_media_registry) UserProfileManager.profile.cached_media_registry = {};
            UserProfileManager.profile.cached_media_registry[msg.clipId] = {
              filename: msg.filename,
              local_path: msg.local_path,
              size_mb: msg.size_mb,
              is_downloaded: true
            };
            UserProfileManager.updateCacheUI();
          }
          renderMediaCards();
        }
      }
    } catch (e) {
      console.warn('WS message parsing error:', e);
    }
  };

  ws.onclose = () => {
    setTimeout(initWebSocket, 2000);
  };
}

function sendAction(action, payload = {}) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ action, ...payload }));
  }
}

// ============================================================================
// 4. HARDWARE VIDEO STREAMS & MATTE ASSET LOADERS
// ============================================================================
function syncVideoSources() {
  // Layer 0 Base Video (Master Deck A)
  if (playerL0 && appState.layers.layer0.clipId) {
    if (appState.layers.layer0.clipId === 'clip_gen_plexus_spine') {
      if (!playerL0.paused) playerL0.pause();
    } else {
      const clip = allClips.find(c => c.id === appState.layers.layer0.clipId);
      const targetSrc = clip ? MediaProvider.getMediaUrl(clip) : '';
      playerL0.muted = true;
      playerL0.playsInline = true;
      playerL0.loop = true;
      if (targetSrc && (!playerL0.src.includes(targetSrc) || playerL0.dataset.activeSrc !== targetSrc)) {
        playerL0.dataset.activeSrc = targetSrc;
        playerL0.src = targetSrc;
        playerL0.load();
        playerL0.play().catch(() => {});
      } else if (playerL0.paused) {
        playerL0.play().catch(() => {});
      }
    }
  }

  // Layer 3 Secondary / Preview Video (Deck B Cue)
  if (playerL3 && appState.layers.layer3.clipId) {
    if (appState.layers.layer3.clipId === 'clip_gen_plexus_spine') {
      if (!playerL3.paused) playerL3.pause();
    } else {
      const clip = allClips.find(c => c.id === appState.layers.layer3.clipId);
      const targetSrc = clip ? MediaProvider.getMediaUrl(clip) : '';
      playerL3.muted = true;
      playerL3.playsInline = true;
      playerL3.loop = true;
      if (targetSrc && (!playerL3.src.includes(targetSrc) || playerL3.dataset.activeSrc !== targetSrc)) {
        playerL3.dataset.activeSrc = targetSrc;
        playerL3.src = targetSrc;
        playerL3.load();
        playerL3.play().catch(() => {});
      } else if (playerL3.paused) {
        playerL3.play().catch(() => {});
      }
    }
  }

  // Layer 4 Accent Video
  if (playerL4 && appState.layers.layer4.clipId) {
    if (appState.layers.layer4.clipId === 'clip_gen_plexus_spine') {
      if (!playerL4.paused) playerL4.pause();
    } else {
      const clip = allClips.find(c => c.id === appState.layers.layer4.clipId);
      const targetSrc = clip ? MediaProvider.getMediaUrl(clip) : '';
      playerL4.muted = true;
      playerL4.playsInline = true;
      playerL4.loop = true;
      if (targetSrc && (!playerL4.src.includes(targetSrc) || playerL4.dataset.activeSrc !== targetSrc)) {
        playerL4.dataset.activeSrc = targetSrc;
        playerL4.src = targetSrc;
        playerL4.load();
        playerL4.play().catch(() => {});
      } else if (playerL4.paused) {
        playerL4.play().catch(() => {});
      }
    }
  }

  // Sync Bus Labels on Central Transition Strip
  const stripA = document.getElementById('me-bus-a-title');
  if (stripA) stripA.textContent = `BASE: ${appState.layers.layer0.name || appState.layers.layer0.clipId}`;
  const stripB = document.getElementById('me-bus-b-title');
  if (stripB) stripB.textContent = `CUE: ${appState.layers.layer3.name || appState.layers.layer3.clipId}`;
}

function getMatteImage(relPath) {
  if (!relPath || relPath === 'none') return null;
  const src = `/mattes/${relPath}`;
  if (lumaCanvasCache[src]) return lumaCanvasCache[src];
  if (!matteCache[src]) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = 640;
        c.height = 360;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, 640, 360);
        const imgData = ctx.getImageData(0, 0, 640, 360);
        const d = imgData.data;
        for (let i = 0; i < d.length; i += 4) {
          const lum = Math.round(d[i] * 0.299 + d[i+1] * 0.587 + d[i+2] * 0.114);
          d[i] = 255;
          d[i+1] = 255;
          d[i+2] = 255;
          d[i+3] = lum;
        }
        ctx.putImageData(imgData, 0, 0);
        lumaCanvasCache[src] = c;
      } catch (err) {
        console.warn('Luma matte conversion error:', err);
      }
    };
    img.src = src;
    matteCache[src] = img;
  }
  return lumaCanvasCache[src] || (matteCache[src].complete && matteCache[src].naturalWidth > 0 ? matteCache[src] : null);
}

function getClipImage(clip) {
  if (!clip || !clip.thumbnail) return null;
  const src = MediaProvider.getThumbUrl(clip);
  if (!src) return null; // local mode skeleton
  if (!imageCache[src]) {
    const img = new Image();
    img.src = src;
    imageCache[src] = img;
  }
  return imageCache[src].complete && imageCache[src].naturalWidth > 0 ? imageCache[src] : null;
}

// ============================================================================
// 5. ASPECT RATIO PRESERVING FIT ENGINE (ZERO DISTORTION GUARANTEE)
// ============================================================================
function drawFittedImage(ctx, source, targetW, targetH, mode = 'fill', rotation = 0) {
  if (!source) return null;
  
  const srcW = source.videoWidth || source.naturalWidth || targetW;
  const srcH = source.videoHeight || source.naturalHeight || targetH;
  if (!srcW || !srcH) return null;

  // 1. MIRROR WINGS MODE: broadcast standard for vertical 9:16 videos on 16:9 screens
  if (mode === 'wings' && srcH > srcW && (!rotation || rotation === 0)) {
    // Background: zoomed and blurred to fill full 16:9 canvas
    ctx.save();
    ctx.filter = 'blur(18px) brightness(35%) saturate(130%)';
    const bgScale = Math.max(targetW / srcW, targetH / srcH);
    const bgW = srcW * bgScale;
    const bgH = srcH * bgScale;
    ctx.drawImage(source, (targetW - bgW) / 2, (targetH - bgH) / 2, bgW, bgH);
    ctx.restore();

    // Foreground: crisp centered 9:16 with soft drop shadow
    const fgRatio = srcW / srcH;
    const fgH = targetH;
    const fgW = targetH * fgRatio;
    const fgX = (targetW - fgW) / 2;
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
    ctx.shadowBlur = 20;
    ctx.drawImage(source, fgX, 0, fgW, fgH);
    ctx.restore();
    return { x: fgX, y: 0, w: fgW, h: fgH };
  }

  // 2. ROTATION & FIT ENGINE (-90 CCW, 0 NORMAL, +90 CW, 180 FLIP)
  ctx.save();
  ctx.translate(targetW / 2, targetH / 2);
  if (rotation && rotation !== 0) {
    ctx.rotate((rotation * Math.PI) / 180);
  }

  const isQuarterTurn = Math.abs(rotation % 180) === 90;
  const effW = isQuarterTurn ? srcH : srcW;
  const effH = isQuarterTurn ? srcW : srcH;
  const effRatio = effW / effH;
  const targetRatio = targetW / targetH;

  let drawW, drawH;
  if (mode === 'fill') {
    if (effRatio > targetRatio) {
      drawH = targetH;
      drawW = targetH * effRatio;
    } else {
      drawW = targetW;
      drawH = targetW / effRatio;
    }
  } else { // 'fit'
    if (effRatio > targetRatio) {
      drawW = targetW;
      drawH = targetW / effRatio;
    } else {
      drawH = targetH;
      drawW = targetH * effRatio;
    }
  }

  const rectW = isQuarterTurn ? drawH : drawW;
  const rectH = isQuarterTurn ? drawW : drawH;

  try {
    ctx.drawImage(source, -rectW / 2, -rectH / 2, rectW, rectH);
  } catch (err) {}

  ctx.restore();
  return { x: 0, y: 0, w: targetW, h: targetH };
}

// ============================================================================
// 5.5 TONAL GRADING & MATTE KINEMATICS ENGINE
// ============================================================================
function getTonalFilterString(t) {
  if (!t) return 'contrast(118%) brightness(95%) saturate(85%)';
  const contrastVal = (t.contrast !== undefined && !isNaN(t.contrast)) ? Number(t.contrast) : 1.18;
  const brightVal = (t.brightness !== undefined && !isNaN(t.brightness)) ? Number(t.brightness) : -0.05;
  const gammaVal = (t.gamma !== undefined && !isNaN(t.gamma)) ? Number(t.gamma) : 0.85;
  const midVal = (t.midtones !== undefined && !isNaN(t.midtones)) ? Number(t.midtones) : 1.00;

  const totalContrast = Math.round(contrastVal * midVal * 100);
  const totalBrightness = Math.round((1.0 + brightVal + (1.0 - gammaVal) * 0.15) * 100);
  const totalSaturate = Math.round(Math.max(20, Math.min(180, 85 + (gammaVal - 0.85) * 40 + (midVal - 1.0) * 30)));

  return `contrast(${totalContrast}%) brightness(${totalBrightness}%) saturate(${totalSaturate}%)`;
}

function drawDeformedMatte(ctx, matteImg, w, h, t, deform, invert = false) {
  if (!matteImg) return;
  const def = deform || { wiggle_scale: 0.04, wiggle_pos: 8, wiggle_rot: 0, speed: 4.0, sync_bpm: true };
  const bpm = appState.bpm || 120;
  const bps = bpm / 60.0;
  
  // def.speed is now "period in beats" (0.5 to 32)
  const periodBeats = def.speed || 4.0;
  const speedMult = 1.0 / periodBeats;
  
  let animTime = t;
  const pBeats = def.posterize_beats || appState.posterize_beats || 0; 
  if (pBeats > 0) {
    const currentBeatAbsolute = t * bps;
    const quantizedBeat = Math.floor(currentBeatAbsolute / pBeats) * pBeats;
    animTime = quantizedBeat / bps;
  } else if (def.posterize_rate > 0) {
    animTime = Math.floor(t * def.posterize_rate) / def.posterize_rate;
  }

  const syncMult = def.sync_bpm ? bps : 1.0;
  const wigglePos = def.wiggle_pos || 8;
  const wiggleRot = def.wiggle_rot || 0;
  
  const dx = wigglePos * Math.cos(animTime * 2.0 * speedMult * syncMult);
  const dy = wigglePos * Math.sin(animTime * 1.5 * speedMult * syncMult);
  const rotDeg = wiggleRot * Math.sin(animTime * 1.2 * speedMult * syncMult);
  const rotRad = (rotDeg * Math.PI) / 180.0;
  
  // Anti-Edges Logic: Minimum scale to never reveal bounds
  const maxWiggle = Math.abs(wigglePos);
  const maxRotDeg = Math.abs(wiggleRot);
  const safeMargin = (maxWiggle / Math.min(w, h)) * 2.5 + (maxRotDeg > 0 ? (maxRotDeg / 45) * 0.4 : 0.05);
  const baseScale = 1.0 + safeMargin;
  const scaleMod = Math.abs((def.wiggle_scale || 0.04) * Math.sin(animTime * 2.5 * speedMult * syncMult));
  const wScale = baseScale + scaleMod;

  ctx.save();
  ctx.translate(w / 2 + dx, h / 2 + dy);
  if (rotRad !== 0) ctx.rotate(rotRad);
  ctx.scale(wScale, wScale);
  ctx.translate(-w / 2, -h / 2);
  
  if (invert) {
    ctx.filter = 'invert(100%)';
  }
  drawFittedImage(ctx, matteImg, w, h, 'fill');
  
  // Procedural Animation Overlay for Mattes (Evolução superada)
  drawProceduralMatteOverlay(ctx, matteImg, w, h, animTime, bps, speedMult);

  ctx.restore();
}

function drawProceduralMatteOverlay(ctx, matteImg, w, h, animTime, bps, speedMult) {
  const src = (matteImg.src || '').toLowerCase();
  
  // Use global phraseBeatAccumulator for elegant, musical-timed animations
  const beat = phraseBeatAccumulator;
  
  // For discreet and elegant movement, we use continuous smooth slow time instead of stepping abruptly.
  const smoothBeat = beat * 0.5 * (speedMult || 1.0);
  
  if (src.includes('geo') || src.includes('grid') || src.includes('fractal')) {
    // Fill screen completely to avoid edge gaps
    const cols = 8;
    const rows = 5;
    const cw = Math.ceil(w / cols);
    const ch = Math.ceil(h / rows);
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = '#000000';
    
    for(let r = 0; r < rows; r++) {
      for(let c = 0; c < cols; c++) {
        const seed = r * 13.1 + c * 7.7;
        // Elegant continuous evolution using sine wave
        const val = Math.sin(smoothBeat * 0.3 + seed);
        if (val > 0.6) {
          ctx.fillRect(c * cw, r * ch, cw, ch);
        }
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  } else if (src.includes('noise') || src.includes('proc') || src.includes('fluid') || src.includes('organic')) {
    ctx.globalCompositeOperation = 'screen';
    const numOrbs = 3;
    for(let i=0; i<numOrbs; i++) {
      // Elegant, smooth sweeping motions
      const ox = w/2 + (w/3) * Math.cos(smoothBeat * 0.2 * (0.8 + i*0.3));
      const oy = h/2 + (h/3) * Math.sin(smoothBeat * 0.15 * (0.5 + i*0.4));
      // Radius spans entire screen height/width smoothly
      const radius = (w/1.5) * (0.8 + 0.3 * Math.sin(smoothBeat * 0.1 + i));
      
      const grad = ctx.createRadialGradient(ox, oy, 0, ox, oy, radius);
      grad.addColorStop(0, `rgba(255,255,255,${0.25 + i*0.1})`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(ox, oy, radius, 0, Math.PI*2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }
}

// ============================================================================
// 6. LIVING VISUAL ENGINE (60 FPS, SMOOTH & ELEGANT, ZERO ABRUPT SHAKES)
// ============================================================================
let simTime = 0;
let lastFrameTime = performance.now();
let dissolveProgress = 0.0;
let isDissolving = false;


// ============================================================================
// MUSICAL PHRASE ENGINE (PRO DJ/VJ DOWNTEMPO & GROOVE CLOCK)
// ============================================================================
let phraseBeatAccumulator = 0.0;
let lastBeatTriggered = -1;
let tapHistory = [];

function setManualBpm(val) {
  const bpm = Math.max(40.0, Math.min(220.0, Number(val) || 124.0));
  appState.bpm = Math.round(bpm * 10) / 10.0;
  appState.bpm_manual_lock = true;

  const inputEl = document.getElementById('input-manual-bpm');
  if (inputEl) inputEl.value = appState.bpm.toFixed(1);
  const badgeBpm = document.getElementById('badge-bpm');
  if (badgeBpm) badgeBpm.textContent = appState.bpm.toFixed(1);

  const chipBpm = document.getElementById('chip-bpm');
  if (chipBpm) chipBpm.classList.add('manual-lock');
  const lockTag = document.getElementById('bpm-lock-tag');
  if (lockTag) {
    lockTag.style.display = 'inline-block';
    lockTag.textContent = 'LOCK';
  }

  sendAction('set_bpm', { value: appState.bpm, manual: true });
}
window.setManualBpm = setManualBpm;

function nudgeBpm(delta) {
  setManualBpm((appState.bpm || 124.0) + delta);
}
window.nudgeBpm = nudgeBpm;

function multiplyBpm(factor) {
  setManualBpm((appState.bpm || 124.0) * factor);
}
window.multiplyBpm = multiplyBpm;

function toggleBpmLock() {
  appState.bpm_manual_lock = !appState.bpm_manual_lock;
  const chipBpm = document.getElementById('chip-bpm');
  const lockTag = document.getElementById('bpm-lock-tag');
  if (chipBpm) chipBpm.classList.toggle('manual-lock', appState.bpm_manual_lock);
  if (lockTag) {
    lockTag.style.display = appState.bpm_manual_lock ? 'inline-block' : 'none';
  }
}
window.toggleBpmLock = toggleBpmLock;

function handleTapTempo() {
  const now = performance.now();
  tapHistory = tapHistory.filter(t => (now - t) < 3000);
  tapHistory.push(now);

  const btns = [document.getElementById('btn-tap-tempo'), document.getElementById('btn-strip-tap')];
  btns.forEach(b => {
    if (b) {
      b.classList.remove('tap-flash');
      void b.offsetWidth;
      b.classList.add('tap-flash');
      setTimeout(() => b.classList.remove('tap-flash'), 120);
    }
  });

  if (tapHistory.length >= 2) {
    const intervals = [];
    for (let i = 1; i < tapHistory.length; i++) {
      intervals.push(tapHistory[i] - tapHistory[i - 1]);
    }
    const avgIntervalMs = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const calculatedBpm = Math.round((60000.0 / avgIntervalMs) * 10) / 10.0;
    if (calculatedBpm >= 40 && calculatedBpm <= 220) {
      setManualBpm(calculatedBpm);
    }
  }
}
window.handleTapTempo = handleTapTempo;

function resetMusicalPhrase() {
  phraseBeatAccumulator = 0.0;
  appState.phrase.current_bar = 1;
  appState.phrase.current_beat = 1;
  appState.phrase.total_bars = 1;
  lastBeatTriggered = -1;
  
  // Visual flash feedback on Reset button
  const btnReset = document.getElementById('btn-reset-phrase');
  if (btnReset) {
    btnReset.classList.remove('flash-reset');
    void btnReset.offsetWidth;
    btnReset.classList.add('flash-reset');
    setTimeout(() => btnReset.classList.remove('flash-reset'), 400);
  }

  updatePhraseUI();
  console.log('[PHRASE ENGINE] Alinhado com o Início da Música / Downbeat (Bar 1.1.1)');
}
window.resetMusicalPhrase = resetMusicalPhrase;

function setPhraseLength(bars) {
  appState.phrase.length_bars = Number(bars);
  document.querySelectorAll('.phrase-len-btn').forEach(btn => {
    btn.classList.toggle('active', Number(btn.dataset.bars) === bars);
  });
  updatePhraseUI();
}
window.setPhraseLength = setPhraseLength;

// ============================================================================
// 4.1 CURATED NARRATIVE MACRO-STATE PRESETS (MANUAL & AUTOPILOT ADAPTIVE)
// ============================================================================
const MACRO_PRESETS = {
  INTRO: [
    {
      id: 'intro_obsidian_minimal',
      name: 'Obsidian Minimalist',
      desc: 'Frame limpo, deformação ultra suave, atmosfera cinematográfica',
      energy: 0.15,
      kinematics: { wiggle_scale: 0.02, wiggle_pos: 4, wiggle_rot: 0.5, posterize_rate: 0, edge_warp: 0.02, speed: 0.4 },
      matte: { type: 'none', preferred: 'none', master_matte: 'none' },
      fx: { active: false, plugin: 'bad_tv', preset: 'subdued_vhs', intensity: 0.0 },
      layers: { l1_opacity: 0.0, l2_opacity: 0.15, l4_opacity: 0.0, blend: 'multiply' },
      transition: { mode: 'dissolve', duration: 3.0 }
    },
    {
      id: 'intro_ghost_operator',
      name: 'Ghost Operator Matrix',
      desc: 'ASCII sutil verde esmeralda com silhuetas de alta densidade',
      energy: 0.22,
      kinematics: { wiggle_scale: 0.03, wiggle_pos: 8, wiggle_rot: 1.0, posterize_rate: 0, edge_warp: 0.04, speed: 0.6 },
      matte: { type: 'procedural', preferred: 'matte_e_cellular', master_matte: 'none' },
      fx: { active: true, plugin: 'rxxr', preset: 'ghost_operator', intensity: 0.55 },
      layers: { l1_opacity: 0.0, l2_opacity: 0.25, l4_opacity: 0.0, blend: 'screen' },
      transition: { mode: 'dissolve', duration: 2.5 }
    },
    {
      id: 'intro_deep_space_tape',
      name: 'Deep Space CRT Tape',
      desc: 'Sinal analógico distante, scanlines delicadas e foco etéreo',
      energy: 0.18,
      kinematics: { wiggle_scale: 0.02, wiggle_pos: 6, wiggle_rot: -0.5, posterize_rate: 0, edge_warp: 0.03, speed: 0.5 },
      matte: { type: 'none', preferred: 'none', master_matte: 'none' },
      fx: { active: true, plugin: 'bad_tv', preset: 'subdued_vhs', intensity: 0.40 },
      layers: { l1_opacity: 0.0, l2_opacity: 0.10, l4_opacity: 0.0, blend: 'screen' },
      transition: { mode: 'dip', duration: 2.0 }
    }
  ],

  GROOVE: [
    {
      id: 'groove_pure_clean',
      name: 'Pure Clean Cinema',
      desc: '100% puro e sem distorção: vídeo original cristalino em 60 FPS',
      energy: 0.50,
      kinematics: { wiggle_scale: 0.04, wiggle_pos: 6, wiggle_rot: 1.0, posterize_rate: 0, edge_warp: 0.04, speed: 0.8 },
      matte: { type: 'none', preferred: 'none', master_matte: 'none' },
      fx: { active: false, plugin: 'pixel_stretch', preset: 'cinematic_anamorphic', intensity: 0.0 }, // TOTALMENTE LIMPO!
      layers: { l1_opacity: 0.0, l2_opacity: 0.12, l4_opacity: 0.0, blend: 'soft_light' },
      transition: { mode: 'dissolve', duration: 1.5 }
    },
    {
      id: 'groove_rhythmic_pulse',
      name: 'Rhythmic Pulse',
      desc: 'Balanço rítmico elegante: leve reflexo na batida e máscara orgânica',
      energy: 0.55,
      kinematics: { wiggle_scale: 0.06, wiggle_pos: 12, wiggle_rot: 2.0, posterize_rate: 16, edge_warp: 0.08, speed: 1.0 },
      matte: { type: 'soft', preferred: 'matte_c_fluid', master_matte: 'none' },
      fx: { active: false, plugin: 'modulation', preset: 'joy_division', intensity: 0.0 },
      layers: { l1_opacity: 0.35, l2_opacity: 0.20, l4_opacity: 0.0, blend: 'screen' },
      transition: { mode: 'dissolve', duration: 1.0 }
    },
    {
      id: 'groove_subtle_satori',
      name: 'Subtle Satori Shimmer',
      desc: 'Toque discreto de brilho anamórfico apenas nas altas luzes',
      energy: 0.58,
      kinematics: { wiggle_scale: 0.08, wiggle_pos: 14, wiggle_rot: 2.5, posterize_rate: 16, edge_warp: 0.09, speed: 1.1 },
      matte: { type: 'none', preferred: 'none', master_matte: 'none' },
      fx: { active: true, plugin: 'pixel_stretch', preset: 'cinematic_anamorphic', intensity: 0.40 },
      layers: { l1_opacity: 0.20, l2_opacity: 0.18, l4_opacity: 0.0, blend: 'screen' },
      transition: { mode: 'dissolve', duration: 1.0 }
    }
  ],

  BUILD: [
    {
      id: 'build_anamorphic_tension',
      name: 'Anamorphic Tension Pull',
      desc: 'Alongamento direcional crescente com aceleração rítmica de batidas',
      energy: 0.78,
      kinematics: { wiggle_scale: 0.18, wiggle_pos: 28, wiggle_rot: 6.0, posterize_rate: 8, edge_warp: 0.35, speed: 1.8 },
      matte: { type: 'procedural', preferred: 'matte_e_cellular', master_matte: 'none' },
      fx: { active: true, plugin: 'pixel_stretch', preset: 'hyperdrive_tunnel', intensity: 0.85 },
      layers: { l1_opacity: 0.55, l2_opacity: 0.55, l4_opacity: 0.30, blend: 'difference' },
      transition: { mode: 'dissolve', duration: 0.8 }
    },
    {
      id: 'build_rf_harmonic_swell',
      name: 'RF Harmonic Swell',
      desc: 'Síntese de osciloscópio CMYK em modulação de alta frequência',
      energy: 0.82,
      kinematics: { wiggle_scale: 0.20, wiggle_pos: 32, wiggle_rot: 7.5, posterize_rate: 8, edge_warp: 0.40, speed: 2.0 },
      matte: { type: 'geometric', preferred: 'matte_b_fractal', master_matte: 'none' },
      fx: { active: true, plugin: 'modulation', preset: 'offset_cmyk', intensity: 0.85 },
      layers: { l1_opacity: 0.60, l2_opacity: 0.65, l4_opacity: 0.40, blend: 'screen' },
      transition: { mode: 'sync', duration: 0.5 }
    },
    {
      id: 'build_cyber_edge_tracer',
      name: 'Cyber Edge Contour Tracer',
      desc: 'Sobel de alto contraste e marcadores cibernéticos se expandindo',
      energy: 0.75,
      kinematics: { wiggle_scale: 0.16, wiggle_pos: 24, wiggle_rot: 5.0, posterize_rate: 12, edge_warp: 0.30, speed: 1.7 },
      matte: { type: 'procedural', preferred: 'matte_d_organic', master_matte: 'none' },
      fx: { active: true, plugin: 'rxxr', preset: 'cyberpunk_tracer', intensity: 0.80 },
      layers: { l1_opacity: 0.45, l2_opacity: 0.75, l4_opacity: 0.25, blend: 'difference' },
      transition: { mode: 'sync', duration: 0.6 }
    }
  ],

  DROP: [
    {
      id: 'drop_bitonic_melt_impact',
      name: 'Bitonic Melt Impact',
      desc: 'Cascata algorítmica total: derretimento de pixels, flash e camada L4 clímax',
      energy: 0.98,
      kinematics: { wiggle_scale: 0.32, wiggle_pos: 48, wiggle_rot: 12.0, posterize_rate: 4, edge_warp: 0.58, speed: 2.4 },
      matte: { type: 'geometric', preferred: 'matte_b_fractal', master_matte: 'none' },
      fx: { active: true, plugin: 'pixel_sorter', preset: 'glitch_waterfall', intensity: 0.95 },
      layers: { l1_opacity: 0.85, l2_opacity: 0.60, l4_opacity: 0.90, blend: 'difference' },
      transition: { mode: 'cut', duration: 0.1 }
    },
    {
      id: 'drop_crt_shatter_vcr',
      name: 'Analog CRT VCR Shatter',
      desc: 'Colapso analógico violento com rolling contínuo, RGB split e scanlines',
      energy: 0.95,
      kinematics: { wiggle_scale: 0.30, wiggle_pos: 52, wiggle_rot: -14.0, posterize_rate: 4, edge_warp: 0.62, speed: 2.5 },
      matte: { type: 'geometric', preferred: 'matte_a_geometric', master_matte: 'none' },
      fx: { active: true, plugin: 'bad_tv', preset: 'broken_vcr', intensity: 0.95 },
      layers: { l1_opacity: 0.80, l2_opacity: 0.50, l4_opacity: 0.85, blend: 'screen' },
      transition: { mode: 'cut', duration: 0.1 }
    },
    {
      id: 'drop_center_melt_radial',
      name: 'Center Melt Supernova',
      desc: 'Supernova radial de pixel sorting no centro mantendo as bordas nítidas',
      energy: 0.96,
      kinematics: { wiggle_scale: 0.28, wiggle_pos: 44, wiggle_rot: 10.0, posterize_rate: 4, edge_warp: 0.52, speed: 2.2 },
      matte: { type: 'geometric', preferred: 'matte_b_fractal', master_matte: 'none' },
      fx: { active: true, plugin: 'pixel_sorter', preset: 'center_melt', intensity: 0.90 },
      layers: { l1_opacity: 0.90, l2_opacity: 0.70, l4_opacity: 0.80, blend: 'difference' },
      transition: { mode: 'sync', duration: 0.3 }
    },
    {
      id: 'drop_cmyk_strobe_pulse',
      name: 'CMYK Strobe Sonic Burst',
      desc: 'Explosão vetorial Joy Division / CMYK com estroboscópio e flash',
      energy: 0.94,
      kinematics: { wiggle_scale: 0.26, wiggle_pos: 40, wiggle_rot: 8.0, posterize_rate: 4, edge_warp: 0.50, speed: 2.2 },
      matte: { type: 'geometric', preferred: 'matte_a_geometric', master_matte: 'none' },
      fx: { active: true, plugin: 'modulation', preset: 'joy_division', intensity: 0.95 },
      layers: { l1_opacity: 0.85, l2_opacity: 0.80, l4_opacity: 0.85, blend: 'difference' },
      transition: { mode: 'cut', duration: 0.1 }
    }
  ],

  BREAK: [
    {
      id: 'break_ambient_dissolve',
      name: 'Atmospheric Ambient Dissolve',
      desc: 'Desaceleração suave: longa transição líquida, ar puro e espaço negativo',
      energy: 0.20,
      kinematics: { wiggle_scale: 0.03, wiggle_pos: 12, wiggle_rot: -2.0, posterize_rate: 0, edge_warp: 0.04, speed: 0.4 },
      matte: { type: 'soft', preferred: 'matte_c_fluid', master_matte: 'none' },
      fx: { active: false, plugin: 'bad_tv', preset: 'subdued_vhs', intensity: 0.0 }, // LIMPO
      layers: { l1_opacity: 0.10, l2_opacity: 0.10, l4_opacity: 0.0, blend: 'multiply' },
      transition: { mode: 'dissolve', duration: 4.0 }
    },
    {
      id: 'break_pastel_oil_drift',
      name: 'Pastel Oil Drift',
      desc: 'Pintura a óleo suave com saturação orgânica flutuando no tempo',
      energy: 0.25,
      kinematics: { wiggle_scale: 0.04, wiggle_pos: 16, wiggle_rot: 1.5, posterize_rate: 0, edge_warp: 0.05, speed: 0.5 },
      matte: { type: 'soft', preferred: 'matte_d_organic', master_matte: 'none' },
      fx: { active: true, plugin: 'pixel_sorter', preset: 'pastel_oil', intensity: 0.55 },
      layers: { l1_opacity: 0.20, l2_opacity: 0.15, l4_opacity: 0.0, blend: 'soft_light' },
      transition: { mode: 'dissolve', duration: 3.0 }
    },
    {
      id: 'break_cyan_rf_wave',
      name: 'Cyan RF Spectrum Calm',
      desc: 'Ondas monocromáticas relaxantes de sintetizador modular',
      energy: 0.22,
      kinematics: { wiggle_scale: 0.03, wiggle_pos: 10, wiggle_rot: -1.0, posterize_rate: 0, edge_warp: 0.04, speed: 0.45 },
      matte: { type: 'none', preferred: 'none', master_matte: 'none' },
      fx: { active: true, plugin: 'modulation', preset: 'cyan_spectrum', intensity: 0.50 },
      layers: { l1_opacity: 0.15, l2_opacity: 0.20, l4_opacity: 0.0, blend: 'screen' },
      transition: { mode: 'dissolve', duration: 3.5 }
    }
  ]
};
window.MACRO_PRESETS = MACRO_PRESETS;

let toastTimer = null;
function showMacroToast(text) {
  const toast = document.getElementById('hud-macro-toast');
  if (!toast) return;
  toast.textContent = text;
  toast.classList.add('active');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('active');
  }, 2200);
}
window.showMacroToast = showMacroToast;

function getActiveMacroPreset(state) {
  const list = MACRO_PRESETS[state] || MACRO_PRESETS['GROOVE'];
  const idx = (appState.macro_preset_indices && appState.macro_preset_indices[state] !== undefined)
    ? appState.macro_preset_indices[state]
    : 0;
  return list[idx % list.length];
}
window.getActiveMacroPreset = getActiveMacroPreset;

function syncKinematicsUI(def) {
  if (!def) return;
  const sliderScale = document.getElementById('slider-wiggle-scale');
  const valScale = document.getElementById('val-wiggle-scale');
  if (sliderScale) sliderScale.value = Math.round(def.wiggle_scale * 100);
  if (valScale) valScale.textContent = Math.round(def.wiggle_scale * 100) + '%';

  const sliderPos = document.getElementById('slider-wiggle-pos');
  const valPos = document.getElementById('val-wiggle-pos');
  if (sliderPos) sliderPos.value = Math.round(def.wiggle_pos);
  if (valPos) valPos.textContent = Math.round(def.wiggle_pos) + 'px';

  const sliderRot = document.getElementById('slider-wiggle-rot');
  const valRot = document.getElementById('val-wiggle-rot');
  if (sliderRot) sliderRot.value = Math.round(def.wiggle_rot);
  if (valRot) valRot.textContent = Number(def.wiggle_rot).toFixed(1) + '°';

  const sliderEdge = document.getElementById('slider-edge-warp');
  const valEdge = document.getElementById('val-edge-warp');
  if (sliderEdge) sliderEdge.value = Math.round(def.edge_warp * 100);
  if (valEdge) valEdge.textContent = Math.round(def.edge_warp * 100) + '%';

  document.querySelectorAll('#posterize-btn-group .rate-btn').forEach(btn => {
    btn.classList.toggle('active', Number(btn.dataset.rate) === Number(def.posterize_rate));
  });
}

function applyMacroPreset(state, presetIndex = null, isUserAction = false) {
  const list = MACRO_PRESETS[state] || MACRO_PRESETS['GROOVE'];
  if (!appState.macro_preset_indices) {
    appState.macro_preset_indices = { INTRO: 0, GROOVE: 0, BUILD: 0, DROP: 0, BREAK: 0 };
  }
  if (presetIndex !== null) {
    appState.macro_preset_indices[state] = presetIndex % list.length;
  }
  const preset = list[appState.macro_preset_indices[state]];
  appState.active_macro_preset = preset;
  appState.macro_state = state;

  // Atualiza a UI da Matriz de Presets para refletir o estado ativo
  if (typeof renderMacroPresetsMatrix === 'function') {
    renderMacroPresetsMatrix();
  }

  // 1. Kinematics / Matte Deformation
  if (!appState.matte) appState.matte = {};
  if (!appState.matte.deform) {
    appState.matte.deform = { wiggle_scale: 0.04, wiggle_pos: 8, wiggle_rot: 1, posterize_rate: 0, edge_warp: 0.04, speed: 1.0, sync_bpm: true };
  }
  Object.assign(appState.matte.deform, preset.kinematics);
  syncKinematicsUI(preset.kinematics);

  // 2. Matte selection (Respeita estritamente delegação ou ação explícita do usuário)
  const allowMatteChange = isUserAction || (appState.auto_mode && Boolean(appState.autopilot_delegation?.mattes));
  if (allowMatteChange) {
    if (preset.matte.type === 'none') {
      appState.master_matte = 'none';
      appState.layers.layer0.matte = 'none';
      appState.layers.layer3.matte = 'none';
    } else if (allMattes && allMattes.length > 0) {
      let picked = null;
      if (preset.matte.preferred && preset.matte.preferred !== 'none') {
        picked = allMattes.find(m => m.path.toLowerCase().includes(preset.matte.preferred.toLowerCase()) || m.name.toLowerCase().includes(preset.matte.preferred.toLowerCase()));
      }
      if (!picked) {
        const category = preset.matte.type === 'geometric' ? 'GEO' : (preset.matte.type === 'procedural' ? 'PROCEDURAL' : 'SOFT');
        const matching = allMattes.filter(m => m.category === category || (m.name && m.name.toLowerCase().includes(preset.matte.type)));
        const targetPool = matching.length > 0 ? matching : allMattes;
        const pIdx = (presetIndex !== null ? presetIndex : (appState.macro_preset_indices[state] || 0));
        picked = targetPool[pIdx % targetPool.length];
      }
      if (picked) {
        appState.layers.layer0.matte = picked.path;
        appState.layers.layer3.matte = picked.path;
        appState.master_matte = 'none';
      }
    }
  }

  // 3. FX Engine Configuration
  if (!appState.fx) appState.fx = { target: 'master' };
  if (preset.fx.active) {
    appState.fx.active = true;
    appState.fx.target = 'master'; // Targets Master Video Output directly
    appState.fx.masterIntensity = preset.fx.intensity;
    selectFxPlugin(preset.fx.plugin);
    loadPluginPreset(preset.fx.plugin, preset.fx.preset);
  } else {
    // 100% LIMPO: Master FX OFF
    appState.fx.active = false;
    appState.fx.masterIntensity = 0.0;
  }
  updateFxUI();

  // 4. Layers Opacity & Blends
  if (preset.layers) {
    if (appState.layers.layer1) {
      appState.layers.layer1.opacity = preset.layers.l1_opacity;
      if (preset.layers.blend) appState.layers.layer1.blend = preset.layers.blend;
    }
    if (appState.layers.layer2) {
      appState.layers.layer2.opacity = preset.layers.l2_opacity;
    }
    if (appState.layers.layer4) {
      appState.layers.layer4.opacity = preset.layers.l4_opacity;
      appState.layers.layer4.active = preset.layers.l4_opacity > 0.3;
    }
  }

  // 5. Visual Impact (Flash on DROP)
  if (state === 'DROP') {
    const prgBox = document.querySelector('.program-box');
    if (prgBox) {
      prgBox.classList.remove('take-flash');
      void prgBox.offsetWidth;
      prgBox.classList.add('take-flash');
      setTimeout(() => prgBox.classList.remove('take-flash'), 400);
    }
  }

  // 6. Update Badges and UI Indicators
  updateMacroStateUI(state, preset, isUserAction);
}
window.applyMacroPreset = applyMacroPreset;

function updateMacroStateUI(state, preset, isUserAction = false) {
  // Update header badges
  const badgeState = document.getElementById('badge-macro-state');
  if (badgeState) {
    badgeState.textContent = state;
    badgeState.style.color = getStateColor(state);
  }

  const badgeStrip = document.getElementById('badge-macro-state-strip');
  if (badgeStrip) {
    const isForced = Boolean(appState.auto_mode && appState.manual_forced_state);
    badgeStrip.textContent = isForced ? state + ' [FORÇADO]' : state;
    badgeStrip.style.color = getStateColor(state);
    badgeStrip.classList.toggle('state-forced-glow', isForced);
  }

  // Preset tag in strip
  const badgePreset = document.getElementById('badge-macro-preset-name');
  if (badgePreset && preset) {
    const list = MACRO_PRESETS[state] || [];
    const curIdx = (appState.macro_preset_indices[state] || 0) + 1;
    badgePreset.textContent = curIdx + '/' + list.length + ' · ' + preset.name.toUpperCase();
    badgePreset.className = 'macro-preset-tag ' + (state === 'DROP' ? 'drop' : (state === 'BUILD' ? 'build' : (state === 'GROOVE' ? 'clean' : '')));
  }

  // State buttons active class
  document.querySelectorAll('.state-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.state === state);
  });

  // Tab 5 panel status label
  const lblStatus = document.getElementById('lbl-macro-mode-status');
  if (lblStatus) {
    if (appState.auto_mode) {
      lblStatus.textContent = appState.manual_forced_state
        ? 'AUTOPILOT FORÇADO: ' + state + ' (' + preset.name + ')'
        : 'AUTOPILOT CONDUZINDO: ' + state;
      lblStatus.style.color = appState.manual_forced_state ? '#f59e0b' : '#00f0ff';
    } else {
      lblStatus.textContent = 'MODO MANUAL: ' + state + ' (' + preset.name + ')';
      lblStatus.style.color = '#38bdf8';
    }
  }

  renderMacroPresetsMatrix();
}

function renderMacroPresetsMatrix() {
  const container = document.getElementById('macro-presets-matrix');
  if (!container) return;

  const states = ['INTRO', 'GROOVE', 'BUILD', 'DROP', 'BREAK'];
  container.innerHTML = '';

  states.forEach(st => {
    const row = document.createElement('div');
    const isCurrentState = (appState.macro_state === st);
    row.className = 'macro-matrix-row ' + (isCurrentState ? 'active' : '');

    const title = document.createElement('div');
    title.className = 'macro-matrix-row-title';
    title.style.color = getStateColor(st);
    title.textContent = st;

    const chipsWrap = document.createElement('div');
    chipsWrap.className = 'macro-chips-wrap';

    const presets = MACRO_PRESETS[st] || [];
    const activeIdx = (appState.macro_preset_indices && appState.macro_preset_indices[st] !== undefined)
      ? appState.macro_preset_indices[st]
      : 0;

    presets.forEach((p, idx) => {
      const chip = document.createElement('button');
      const isPresetActive = isCurrentState && (activeIdx === idx);
      chip.className = 'macro-preset-chip ' + (isPresetActive ? 'active' : '');
      chip.title = p.desc;
      chip.innerHTML = '<span>' + (idx + 1) + '.</span> ' + p.name;
      chip.onclick = (e) => {
        e.stopPropagation();
        selectSpecificMacroPreset(st, idx);
      };
      chipsWrap.appendChild(chip);
    });

    row.appendChild(title);
    row.appendChild(chipsWrap);
    container.appendChild(row);
  });
}
window.renderMacroPresetsMatrix = renderMacroPresetsMatrix;

function selectSpecificMacroPreset(state, presetIndex) {
  if (appState.auto_mode) {
    appState.manual_forced_state = state;
    appState.manual_forced_bars = Number(appState.phrase.length_bars) || 16;
    adaptAutopilotToForcedState(state, presetIndex);
    const p = (MACRO_PRESETS[state] || [])[presetIndex];
    showMacroToast('🤖 AUTOPILOT FORÇADO: ' + state + ' · ' + (p ? p.name : ''));
  } else {
    applyMacroPreset(state, presetIndex, true);
    const p = (MACRO_PRESETS[state] || [])[presetIndex];
    showMacroToast('⚡ MANUAL: ' + state + ' · ' + (p ? p.name : ''));
  }
}
window.selectSpecificMacroPreset = selectSpecificMacroPreset;

function adaptAutopilotToForcedState(state, specificPresetIdx = null) {
  const targetIdx = specificPresetIdx !== null ? specificPresetIdx : (appState.macro_preset_indices[state] || 0);
  applyMacroPreset(state, targetIdx, true);

  const totalBars = appState.phrase?.total_bars || 1;

  if (state === 'DROP') {
    appState.drop_likelihood = 0.98;
    appState.buildup_likelihood = 0.20;

    if (appState.autopilot_rules && appState.autopilot_rules.auto_drop_take) {
      appState.last_take_total_bar = totalBars;
      if (appState.layers.layer4) {
        appState.layers.layer4.active = true;
        appState.layers.layer4.opacity = 0.90;
      }
      // Immediate impact transition
      startAutoTransition(0.3);
    }
  } else if (state === 'BUILD') {
    appState.buildup_likelihood = 0.88;
    appState.drop_likelihood = 0.15;
    advanceSmartQueue('DROP');
  } else if (state === 'BREAK') {
    appState.buildup_likelihood = 0.10;
    appState.drop_likelihood = 0.05;
    startAutoTransition(3.5);
  } else if (state === 'GROOVE') {
    appState.buildup_likelihood = 0.25;
    appState.drop_likelihood = 0.10;
    startAutoTransition(1.5);
  } else if (state === 'INTRO') {
    appState.buildup_likelihood = 0.10;
    appState.drop_likelihood = 0.05;
    startAutoTransition(2.5);
  }
}
window.adaptAutopilotToForcedState = adaptAutopilotToForcedState;

function setMacroState(state, isUserClick = false) {
  const isSameState = (appState.macro_state === state);
  appState.macro_state = state;

  if (isUserClick) {
    if (appState.auto_mode) {
      // AUTOPILOT MODE: Operator is forcing the macro musical moment!
      appState.manual_forced_state = state;
      appState.manual_forced_bars = Number(appState.phrase ? appState.phrase.length_bars : 16) || 16;

      // Cycle preset if clicking already-active state
      if (isSameState) {
        const list = MACRO_PRESETS[state] || [];
        if (list.length > 0) {
          appState.macro_preset_indices[state] = ((appState.macro_preset_indices[state] || 0) + 1) % list.length;
        }
      }

      adaptAutopilotToForcedState(state);
      const curP = getActiveMacroPreset(state);
      showMacroToast('🤖 AUTOPILOT ADAPTADO: ' + state + ' (' + (curP ? curP.name : '') + ')');
    } else {
      // MANUAL MODE:
      // Cycle preset variation if clicking already-active state
      if (isSameState) {
        const list = MACRO_PRESETS[state] || [];
        if (list.length > 0) {
          appState.macro_preset_indices[state] = ((appState.macro_preset_indices[state] || 0) + 1) % list.length;
        }
      }
      applyMacroPreset(state, appState.macro_preset_indices[state], true);
      const curP = getActiveMacroPreset(state);
      showMacroToast('⚡ MANUAL: ' + state + ' (' + (curP ? curP.name : '') + ')');
    }
  } else {
    // Normal autonomous transition
    applyMacroPreset(state, null, false);
  }

  sendAction('set_macro_state', { value: state });
}
window.setMacroState = setMacroState;
window.applyMacroStateAesthetics = (st) => applyMacroPreset(st, null, false);

function updatePhraseUI() {
  const p = appState.phrase;
  const barDisplay = document.getElementById('phrase-bar-display');
  if (barDisplay) {
    const padBar = String(p.current_bar).padStart(2, '0');
    const padLen = String(p.length_bars).padStart(2, '0');
    barDisplay.textContent = `BAR ${padBar} / ${padLen}`;
  }

  // 4-Beat visual dots
  const dots = document.querySelectorAll('.phrase-beat-dots .b-dot');
  dots.forEach((dot, idx) => {
    dot.classList.toggle('active', (idx + 1) <= p.current_beat);
  });

  // Remaining bars & beats
  const remainingBars = Math.max(0, p.length_bars - p.current_bar);
  const remainingBeats = remainingBars * 4 + (4 - p.current_beat);
  const remLbl = document.getElementById('phrase-remaining-lbl');
  if (remLbl) {
    if (remainingBars === 0 && p.current_beat === 4) {
      remLbl.textContent = '⚡ TAKE DISPARADO NO PRÓXIMO DOWNBEAT!';
      remLbl.style.color = 'var(--cyan)';
    } else {
      remLbl.textContent = `FALTAM ${remainingBars} COMPASSOS (${remainingBeats} BEATS)`;
      remLbl.style.color = 'var(--text-dim)';
    }
  }

  const progressInPhrase = p.current_bar / p.length_bars;
  const isNearEnd = p.current_bar >= (p.length_bars - 1);
  const isDownbeat = (p.current_bar === 1 && p.current_beat === 1);

  // Client-side auto-mode macro state guidance removed.
  // Macro state is now exclusively controlled by telemetry (audio_brain or server fallback)
  // to prevent rapid thrashing between DROP/GROOVE.

  // Phrase Build Tension Accumulator (Calculated in ALL modes!)
  let buildTension = 0.12;
  if (appState.macro_state === 'BUILD') {
    buildTension = 0.75 + Math.min(0.24, progressInPhrase * 0.25);
  } else if (appState.macro_state === 'DROP') {
    buildTension = 0.08;
  } else if (appState.macro_state === 'BREAK') {
    buildTension = 0.06;
  } else if (appState.macro_state === 'INTRO') {
    buildTension = 0.04;
  } else {
    // GROOVE
    if (progressInPhrase > 0.50) {
      buildTension = 0.20 + (progressInPhrase - 0.50) * 1.5;
    } else {
      buildTension = 0.10 + progressInPhrase * 0.15;
    }
  }
  appState.buildup_likelihood = Math.min(1.0, Math.max(0.02, buildTension));

  // Drop Readiness & Impact Meter (Calculated in ALL modes!)
  let dropProb = 0.04;
  if (appState.macro_state === 'DROP' || isDownbeat) {
    dropProb = 1.0; // Peak 100% Impact
  } else if (isNearEnd) {
    dropProb = 0.70 + (p.current_beat / 4.0) * 0.28; // Armed & priming
  } else if (appState.macro_state === 'BUILD') {
    dropProb = 0.35 + progressInPhrase * 0.40;
  }
  appState.drop_likelihood = Math.min(1.0, Math.max(0.0, dropProb));

  // Update UI meters
  const valBuild = document.getElementById('val-buildup');
  const barBuild = document.getElementById('bar-buildup');
  if (valBuild) valBuild.textContent = `${Math.round(appState.buildup_likelihood * 100)}%`;
  if (barBuild) barBuild.style.width = `${Math.round(appState.buildup_likelihood * 100)}%`;

  const valDrop = document.getElementById('val-drop');
  const barDrop = document.getElementById('bar-drop');
  const tagPre = document.getElementById('tag-pre-drop');
  const dropPct = Math.round(appState.drop_likelihood * 100);
  if (valDrop) valDrop.textContent = `${dropPct}%`;
  if (barDrop) barDrop.style.width = `${dropPct}%`;

  if (tagPre) {
    if (dropPct >= 95) {
      tagPre.style.display = 'inline-block';
      tagPre.textContent = 'DROP HIT';
      tagPre.style.background = 'rgba(255, 42, 85, 0.3)';
      tagPre.style.color = '#ff2a55';
    } else if (dropPct >= 68) {
      tagPre.style.display = 'inline-block';
      tagPre.textContent = 'ARMED';
      tagPre.style.background = 'rgba(255, 184, 0, 0.25)';
      tagPre.style.color = 'var(--amber)';
    } else {
      tagPre.style.display = 'none';
    }
  }

  // Update Tab 5 Timeline Phrase Blocks dynamically
  const tlProgress = document.getElementById('timeline-progress');
  if (tlProgress) {
    tlProgress.style.width = `${Math.round(progressInPhrase * 100)}%`;
  }
  const tlNode1 = document.getElementById('tl-node-1');
  const tlNode2 = document.getElementById('tl-node-2');
  const tlNode3 = document.getElementById('tl-node-3');
  const tlNode4 = document.getElementById('tl-node-4');
  if (tlNode1 && tlNode2 && tlNode3 && tlNode4) {
    const s = appState.macro_state || 'GROOVE';
    
    // The timeline represents INTRO -> GROOVE -> BUILD -> DROP
    tlNode1.className = `phrase-node ${s === 'INTRO' || s === 'BREAK' ? 'current' : 'active'}`;
    tlNode2.className = `phrase-node ${s === 'GROOVE' ? 'current' : (s === 'BUILD' || s === 'DROP' ? 'active' : '')}`;
    tlNode3.className = `phrase-node ${s === 'BUILD' ? 'current' : (s === 'DROP' ? 'active' : '')}`;
    tlNode4.className = `phrase-node ${s === 'DROP' ? 'current' : ''}`;
  }
}


// ============================================================================
// GEOMETRY, ROTATION (9:16 TO 16:9) & LAYER STRIP MANAGEMENT
// ============================================================================
let programRotDissolve = {
  active: false,
  startTime: 0,
  duration: 650, // 650ms smooth broadcast dissolve
  oldRotation: 0,
  newRotation: 0
};
const rotSnapshotCanvas = document.createElement('canvas');
rotSnapshotCanvas.width = 640;
rotSnapshotCanvas.height = 360;
const rotSnapshotCtx = rotSnapshotCanvas.getContext('2d');

function startProgramRotationDissolve(oldDeg, newDeg) {
  programRotDissolve = {
    active: true,
    startTime: performance.now(),
    duration: 650,
    oldRotation: oldDeg,
    newRotation: newDeg
  };
}

// ============================================================================
// PLAYBACK, TIME-STRETCH & PING-PONG LOOPS
// ============================================================================
function toggleLayerPlayback(layerId) {
  if (appState.layers[layerId]) {
    const isPaused = appState.layers[layerId].paused || false;
    appState.layers[layerId].paused = !isPaused;
    sendAction('set_layer_playback', { layer: layerId, paused: !isPaused });
    updateUI();
  }
}

function toggleLayerPingPong(layerId) {
  if (appState.layers[layerId]) {
    const isPingPong = appState.layers[layerId].pingPong || false;
    appState.layers[layerId].pingPong = !isPingPong;
    
    const btn = document.getElementById(layerId === 'layer0' ? 'l0-pingpong' : 'l3-pingpong');
    if (btn) btn.classList.toggle('active', !isPingPong);
    
    sendAction('set_layer_pingpong', { layer: layerId, enabled: !isPingPong });
  }
}

function setLayerSpeed(layerId, speedVal) {
  const speedNormalized = speedVal / 100.0;
  const lbl = document.getElementById(layerId === 'layer0' ? 'lbl-l0-speed' : 'lbl-l3-speed');
  if (lbl) lbl.textContent = speedNormalized.toFixed(1) + 'x';
  
  if (appState.layers[layerId]) {
    appState.layers[layerId].speed = speedNormalized;
    sendAction('set_layer_speed', { layer: layerId, speed: speedNormalized });
  }
}

function setLayerRotation(layerId, deg) {
  deg = Number(deg);
  if (appState.layers[layerId]) {
    const oldDeg = appState.layers[layerId].rotation || 0;
    if (oldDeg === deg) return;

    // If rotating PROGRAM (layer0), initiate smooth rotation dissolve on the image
    if (layerId === 'layer0' && offscreenA) {
      startProgramRotationDissolve(oldDeg, deg);
    }

    appState.layers[layerId].rotation = deg;
    updateGeometryUI();
    sendAction('set_layer_rotation', { layer: layerId, rotation: deg });
  }
}
window.setLayerRotation = setLayerRotation;

function setLayerFitMode(layerId, mode) {
  if (appState.layers[layerId]) {
    appState.layers[layerId].fit_mode = mode;
    updateGeometryUI();
    sendAction('set_layer_fit_mode', { layer: layerId, fit_mode: mode });
  }
}
window.setLayerFitMode = setLayerFitMode;

function toggleLayerFitMode(layerId) {
  if (appState.layers[layerId]) {
    const cur = appState.layers[layerId].fit_mode || 'fill';
    const next = cur === 'fill' ? 'wings' : (cur === 'wings' ? 'fit' : 'fill');
    setLayerFitMode(layerId, next);
  }
}
window.toggleLayerFitMode = toggleLayerFitMode;

function toggleLayerActive(layerId) {
  if (appState.layers[layerId]) {
    appState.layers[layerId].active = !appState.layers[layerId].active;
    const btn = document.getElementById(`btn-toggle-${layerId.replace('layer', 'l')}`);
    if (btn) btn.classList.toggle('active', appState.layers[layerId].active);
    sendAction('set_layer_active', { layer: layerId, active: appState.layers[layerId].active });
  }
}
window.toggleLayerActive = toggleLayerActive;

function onLayerMatteChange(layerId, val) {
  if (appState.layers[layerId]) {
    appState.layers[layerId].matte = val;
    sendAction('set_layer_matte', { layer: layerId, matte: val });
  }
}
window.onLayerMatteChange = onLayerMatteChange;

function toggleLayerMatteInvert(layerId) {
  if (appState.layers[layerId]) {
    appState.layers[layerId].matte_invert = !appState.layers[layerId].matte_invert;
    const btn = document.getElementById(`${layerId.replace('layer', 'l')}-matte-inv`);
    if (btn) btn.classList.toggle('active', appState.layers[layerId].matte_invert);
  }
}
window.toggleLayerMatteInvert = toggleLayerMatteInvert;

function onLayerBlendChange(layerId, val) {
  if (appState.layers[layerId]) {
    appState.layers[layerId].blend = val;
    sendAction('set_layer_blend', { layer: layerId, blend: val });
  }
}
window.onLayerBlendChange = onLayerBlendChange;

function onLayerOpacityChange(layerId, val) {
  if (appState.layers[layerId]) {
    appState.layers[layerId].opacity = Number(val) / 100.0;
    const lbl = document.getElementById(`lbl-${layerId.replace('layer', 'l')}-opacity`);
    if (lbl) lbl.textContent = `${val}%`;
    sendAction('set_layer_opacity', { layer: layerId, opacity: Number(val) / 100.0 });
  }
}
window.onLayerOpacityChange = onLayerOpacityChange;

function setMatteTargetLayer(layerId) {
  appState.matte_target_layer = layerId;
  document.querySelectorAll('.target-layer-pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.target === layerId);
  });
  updateMatteRibbonActiveStatus();
  renderMattesCards();
}
window.setMatteTargetLayer = setMatteTargetLayer;

function updateMatteRibbonActiveStatus() {
  const tgt = appState.matte_target_layer || 'layer3';
  const currentMattePath = appState.layers[tgt]?.matte;
  const titleEl = document.getElementById('target-active-matte-title');
  const btnClear = document.getElementById('btn-clear-target-matte');
  const btnInv = document.getElementById('btn-inv-target-matte');

  if (currentMattePath && currentMattePath !== 'none') {
    const foundMatte = allMattes.find(m => m.path === currentMattePath || m.filename === currentMattePath.split('/').pop());
    const name = foundMatte ? foundMatte.name : currentMattePath.split('/').pop();
    if (titleEl) {
      titleEl.textContent = `${name}`;
      titleEl.style.color = 'var(--cyan)';
    }
    if (btnClear) btnClear.style.opacity = '1';
  } else {
    if (titleEl) {
      titleEl.textContent = 'PASSTHROUGH (SEM MÁSCARA)';
      titleEl.style.color = 'var(--text-dim)';
    }
    if (btnClear) btnClear.style.opacity = '0.5';
  }

  if (btnInv) {
    btnInv.classList.toggle('active', !!appState.layers[tgt]?.matte_invert);
  }
}
window.updateMatteRibbonActiveStatus = updateMatteRibbonActiveStatus;

function clearCurrentTargetMatte() {
  const tgt = appState.matte_target_layer || 'layer3';
  if (appState.layers[tgt]) {
    appState.layers[tgt].matte = 'none';
    const selId = tgt.replace('layer', 'l') + '-matte';
    const sel = document.getElementById(selId);
    if (sel) sel.value = 'none';
    sendAction('set_layer_matte', { layer: tgt, matte: 'none' });
    updateMatteRibbonActiveStatus();
    renderMattesCards();
    updateUI();
  }
}
window.clearCurrentTargetMatte = clearCurrentTargetMatte;

function toggleCurrentTargetMatteInvert() {
  const tgt = appState.matte_target_layer || 'layer3';
  if (appState.layers[tgt]) {
    appState.layers[tgt].matte_invert = !appState.layers[tgt].matte_invert;
    const invBtnId = tgt.replace('layer', 'l') + '-matte-inv';
    const invBtn = document.getElementById(invBtnId);
    if (invBtn) invBtn.classList.toggle('active', !!appState.layers[tgt].matte_invert);
    sendAction('set_layer_param', { layer: tgt, param: 'matte_invert', value: appState.layers[tgt].matte_invert });
    updateMatteRibbonActiveStatus();
  }
}
window.toggleCurrentTargetMatteInvert = toggleCurrentTargetMatteInvert;

function openMatteLibraryForLayer(layerId) {
  switchTab('tab-mattes');
  switchMatteSub('masks');
  setMatteTargetLayer(layerId);
}
window.openMatteLibraryForLayer = openMatteLibraryForLayer;

function updateGeometryUI() {
  // Sync Program Monitor pills
  const prgRot = appState.layers.layer0?.rotation || 0;
  const prgFit = appState.layers.layer0?.fit_mode || 'fit';
  const prgRot0 = document.getElementById('btn-prg-rot-0');
  const prgRotCCW = document.getElementById('btn-prg-rot-ccw');
  const prgRotCW = document.getElementById('btn-prg-rot-cw');
  const prgWings = document.getElementById('btn-prg-fit-wings');
  const prgFitBtn = document.getElementById('btn-prg-fit-mode');
  if (prgRot0) prgRot0.classList.toggle('active', prgRot === 0);
  if (prgRotCCW) prgRotCCW.classList.toggle('active', prgRot === -90);
  if (prgRotCW) prgRotCW.classList.toggle('active', prgRot === 90);
  if (prgWings) prgWings.classList.toggle('active', prgFit === 'wings');
  if (prgFitBtn) prgFitBtn.textContent = prgFit.toUpperCase();

  // Sync Preview Monitor pills
  const prvRot = appState.layers.layer3?.rotation || 0;
  const prvFit = appState.layers.layer3?.fit_mode || 'fit';
  const prvRot0 = document.getElementById('btn-prv-rot-0');
  const prvRotCCW = document.getElementById('btn-prv-rot-ccw');
  const prvRotCW = document.getElementById('btn-prv-rot-cw');
  const prvWings = document.getElementById('btn-prv-fit-wings');
  const prvFitBtn = document.getElementById('btn-prv-fit-mode');
  if (prvRot0) prvRot0.classList.toggle('active', prvRot === 0);
  if (prvRotCCW) prvRotCCW.classList.toggle('active', prvRot === -90);
  if (prvRotCW) prvRotCW.classList.toggle('active', prvRot === 90);
  if (prvWings) prvWings.classList.toggle('active', prvFit === 'wings');
  if (prvFitBtn) prvFitBtn.textContent = prvFit.toUpperCase();

  // Sync Tab 2 channel strip rotation pills
  ['layer0', 'layer1', 'layer2', 'layer3', 'layer4'].forEach(lid => {
    const lprefix = lid.replace('layer', 'l');
    const rot = appState.layers[lid]?.rotation || 0;
    const fit = appState.layers[lid]?.fit_mode || 'fit';
    const r0 = document.getElementById(`${lprefix}-rot-0`);
    const rccw = document.getElementById(`${lprefix}-rot-ccw`);
    const rcw = document.getElementById(`${lprefix}-rot-cw`);
    const rwings = document.getElementById(`${lprefix}-fit-wings`);
    if (r0) r0.classList.toggle('active', rot === 0);
    if (rccw) rccw.classList.toggle('active', rot === -90);
    if (rcw) rcw.classList.toggle('active', rot === 90);
    if (rwings) rwings.classList.toggle('active', fit === 'wings');
    
    // Playback sync
    const btnPlay = document.getElementById(`${lprefix}-play-pause`);
    const btnPing = document.getElementById(`${lprefix}-pingpong`);
    const sldSpeed = document.getElementById(`${lprefix}-speed`);
    const lblSpeed = document.getElementById(`lbl-${lprefix}-speed`);
    
    const isPaused = appState.layers[lid]?.paused;
    const isPingPong = appState.layers[lid]?.pingPong;
    const speed = appState.layers[lid]?.speed !== undefined ? appState.layers[lid].speed : 1.0;
    
    if (btnPlay) {
      btnPlay.textContent = isPaused ? '▶' : '⏸';
      btnPlay.classList.toggle('active', !isPaused);
    }
    if (btnPing) {
      btnPing.classList.toggle('active', isPingPong);
    }
    if (sldSpeed && document.activeElement !== sldSpeed) {
      sldSpeed.value = Math.round(speed * 100);
      if (lblSpeed) lblSpeed.textContent = speed.toFixed(1) + 'x';
    }
  });
}

function drawBusToProgram(ctx, srcCanvas, pw, ph, isVert) {
  if (!srcCanvas) return;
  if (!isVert) {
    ctx.drawImage(srcCanvas, 0, 0, pw, ph);
  } else {
    // Upright portrait 9:16 aspect fill (no side rotation, straight preview!)
    const srcW = srcCanvas.width;
    const srcH = srcCanvas.height;
    const targetRatio = pw / ph; // 360/640 = 0.5625
    const srcRatio = srcW / srcH; // 1280/720 = 1.7778
    let sx = 0, sy = 0, sWidth = srcW, sHeight = srcH;
    if (srcRatio > targetRatio) {
      sWidth = srcH * targetRatio;
      sx = (srcW - sWidth) / 2;
    } else {
      sHeight = srcW / targetRatio;
      sy = (srcH - sHeight) / 2;
    }
    ctx.drawImage(srcCanvas, sx, sy, sWidth, sHeight, 0, 0, pw, ph);
  }
}

function toggleVerticalMode(forceValue = null) {
  if (forceValue !== null) {
    appState.vertical_mode = Boolean(forceValue);
  } else {
    appState.vertical_mode = !appState.vertical_mode;
  }
  appState.vertical_projection = appState.vertical_mode;
  
  updateUI();
  console.log(`[PENUMBRA ENGINE] Modo Vertical (9:16) ${appState.vertical_mode ? 'ATIVADO' : 'DESATIVADO'}`);
}
window.toggleVerticalMode = toggleVerticalMode;

function toggleProjectorCompensation(checked = null) {
  if (checked !== null) {
    appState.projector_compensation = Boolean(checked);
  } else {
    appState.projector_compensation = !appState.projector_compensation;
  }
  updateUI();
}
window.toggleProjectorCompensation = toggleProjectorCompensation;

function toggleNetworkOutput(isOn) {
  appState.network_output_enabled = isOn;
  document.querySelectorAll('#group-cfg-network .conductor-btn').forEach(btn => {
    btn.classList.toggle('active', (btn.dataset.net === 'on') === isOn);
  });
  const ndiDisplay = document.getElementById('status-ndi-display');
  if (ndiDisplay) {
    ndiDisplay.textContent = isOn ? 'NDI & MADMAPPER ON' : 'OFFLINE (HDMI ONLY)';
    ndiDisplay.style.color = isOn ? 'var(--emerald)' : 'var(--text-muted)';
  }
  console.log(`[NETWORK] Saídas de rede: ${isOn ? 'LIGADO' : 'DESLIGADO (SÓ HDMI)'}`);
}
window.toggleNetworkOutput = toggleNetworkOutput;

function renderVisuals(time) {
  const targetFps = appState.fps_limit || 60;
  const fpsInterval = 1000 / targetFps;
  const now = time || performance.now();
  
  if (!lastFrameTime) lastFrameTime = now;
  const elapsed = now - lastFrameTime;
  
  if (elapsed < fpsInterval) {
    requestAnimationFrame(renderVisuals);
    return;
  }
  
  const dt = elapsed / 1000.0;
  lastFrameTime = now - (elapsed % fpsInterval);

  simTime += dt;
  appState.set_time += dt;

  const fpsDisplay = document.getElementById('status-fps-display');
  if (fpsDisplay && Math.random() < 0.05) {
    const realFps = 1000 / elapsed;
    fpsDisplay.textContent = `${realFps.toFixed(1)} FPS`;
  }

  const isBlackout = appState.blackout;
  const sub = appState.bands?.sub || 0.5;
  const bass = appState.bands?.bass || 0.5;
  const presence = appState.bands?.presence || 0.28;
  const air = appState.bands?.air || 0.20;

  // --------------------------------------------------------------------------
  // MUSICAL PHRASE TICKER (Continuous Downbeat Sync & Real-Time Beat Counter)
  // --------------------------------------------------------------------------
  const bpm = appState.bpm || 124.0;
  const clampedDt = Math.min(0.1, Math.max(0.0001, dt));
  phraseBeatAccumulator += clampedDt * (bpm / 60.0);

  const totalPhraseBeats = Math.max(0, Math.floor(phraseBeatAccumulator));
  const currentBeatInBar = (totalPhraseBeats % 4) + 1;
  const totalBarsCounted = Math.floor(totalPhraseBeats / 4) + 1;
  const currentBarInPhrase = ((totalBarsCounted - 1) % appState.phrase.length_bars) + 1;

  appState.phrase.current_bar = currentBarInPhrase;
  appState.phrase.current_beat = currentBeatInBar;
  appState.phrase.total_bars = totalBarsCounted;

  if (totalPhraseBeats !== lastBeatTriggered) {
    lastBeatTriggered = totalPhraseBeats;
    updatePhraseUI();
    runAutopilotEngine();

    // Pulse beat orb on downbeat
    const orb = document.getElementById('beat-pulse-orb');
    if (orb && currentBeatInBar === 1) {
      orb.classList.add('pulse');
      setTimeout(() => orb.classList.remove('pulse'), 120);
    }

    // Autopilot phrasing is orchestrated cleanly inside runAutopilotEngine()
    // with strict minimum bars safety interval to eliminate 1-bar cycling.
  }

  // --------------------------------------------------------------------------
  // AUTO TRANSITION TICKER
  // --------------------------------------------------------------------------
  if (isAutoTransitioning) {
    autoTransitionProgress += dt / currentTransitionDuration;
    const pClamped = Math.min(1.0, autoTransitionProgress);

    if (crossfader) crossfader.value = Math.round(pClamped * 100);
    const readout = document.getElementById('tbar-readout');
    if (readout) readout.textContent = `B ${Math.round(pClamped * 100)}%`;
    const bar = document.getElementById('auto-take-bar');
    if (bar) bar.style.width = `${Math.round(pClamped * 100)}%`;

    if (autoTransitionProgress >= 1.0) {
      isAutoTransitioning = false;
      autoTransitionProgress = 0.0;
      if (bar) bar.style.width = '0%';
      const btnTake = document.getElementById('btn-auto-take');
      if (btnTake) btnTake.classList.remove('transitioning');
      executeTakeCommit();
    }
  } else {
    const readout = document.getElementById('tbar-readout');
    if (readout && crossfader) {
      const val = Number(crossfader.value);
      readout.textContent = val === 0 ? 'A 100%' : (val === 100 ? 'B 100%' : `MIX ${val}%`);
    }
  }

  // Ensure active video players are decoding
  if (playerL0 && playerL0.paused && playerL0.readyState >= 2) playerL0.play().catch(() => {});
  if (playerL3 && playerL3.paused && playerL3.readyState >= 2) playerL3.play().catch(() => {});

  // Smooth Timecode (HH:MM:SS.FF)
  const totalFrames = Math.floor(appState.set_time * 60);
  const hours = String(Math.floor(totalFrames / (60 * 60 * 60))).padStart(2, '0');
  const mins = String(Math.floor((totalFrames / (60 * 60)) % 60)).padStart(2, '0');
  const secs = String(Math.floor((totalFrames / 60) % 60)).padStart(2, '0');
  const frames = String(totalFrames % 60).padStart(2, '0');
  if (prgTimecode) prgTimecode.textContent = `TC ${hours}:${mins}:${secs}.${frames}`;

  const clipLoopProgress = ((simTime * 0.18) % 1.0) * 100;
  if (prgPlayhead) prgPlayhead.style.width = `${clipLoopProgress}%`;
  if (prvPlayhead) prvPlayhead.style.width = `${((clipLoopProgress + 40) % 100)}%`;

  const w = busCanvasA.width;
  const h = busCanvasA.height;

  // --------------------------------------------------------------------------
  // 1. RENDER DECK A INTO busCanvasA (MASTER BUS A)
  // --------------------------------------------------------------------------
  if (busCtxA) {
    busCtxA.fillStyle = '#050608';
    busCtxA.fillRect(0, 0, w, h);

    const baseClip = allClips.find(c => c.id === appState.layers.layer0.clipId) || allClips[0];
    const isBaseGen = baseClip && (baseClip.is_generative || baseClip.id === 'clip_gen_plexus_spine');
    const videoL0Ready = playerL0 && playerL0.readyState >= 2;
    const baseSource = isBaseGen ? getPlexusSpineCanvas(w, h, simTime) : (videoL0Ready ? playerL0 : getClipImage(baseClip));

    if (baseSource && appState.layers.layer0.active) {
      offCtxA.clearRect(0, 0, w, h);
      offCtxA.fillStyle = '#050608';
      offCtxA.fillRect(0, 0, w, h);

      // Render base with rotation & fit
      drawFittedImage(offCtxA, baseSource, w, h, appState.layers.layer0.fit_mode || 'fit', appState.layers.layer0.rotation || 0);

      // Program Rotation Dissolve: blend smoothly from old rotation so there is zero abrupt cut
      if (programRotDissolve.active) {
        const elapsed = performance.now() - programRotDissolve.startTime;
        const progress = Math.min(1.0, elapsed / programRotDissolve.duration);
        // Hermite smoothstep ease for elegant dissolve
        const ease = progress * progress * (3 - 2 * progress);

        // Draw live video frame at the old rotation into snapshot buffer
        rotSnapshotCtx.clearRect(0, 0, w, h);
        rotSnapshotCtx.fillStyle = '#050608';
        rotSnapshotCtx.fillRect(0, 0, w, h);
        drawFittedImage(rotSnapshotCtx, baseSource, w, h, appState.layers.layer0.fit_mode || 'fit', programRotDissolve.oldRotation);

        // Crossfade old rotation on top of new rotation
        offCtxA.save();
        offCtxA.globalAlpha = 1.0 - ease;
        offCtxA.drawImage(rotSnapshotCanvas, 0, 0, w, h);
        offCtxA.restore();

        if (progress >= 1.0) {
          programRotDissolve.active = false;
        }
      }

      // Apply Layer 0 Matte with invert support
      const matteL0 = getMatteImage(appState.layers.layer0.matte);
      if (matteL0 && appState.layers.layer0.matte !== 'none') {
        offCtxA.save();
        offCtxA.globalCompositeOperation = 'destination-in';
        drawDeformedMatte(offCtxA, matteL0, w, h, simTime, appState.matte?.deform, appState.layers.layer0.matte_invert);
        offCtxA.restore();
      }

      // Draw offscreenA to busCanvasA with tonal grading
      busCtxA.save();
      busCtxA.globalAlpha = (appState.layers.layer0.opacity !== undefined) ? appState.layers.layer0.opacity : 1.0;
      busCtxA.filter = getTonalFilterString(appState.tonal);
      busCtxA.drawImage(offscreenA, 0, 0, w, h);
      busCtxA.restore();

      // Organic penumbra vignette removed
    }

    // LAYER 1: SELF-DOUBLE (Multiply/Screen blend, scale + audio pulse)
    if (baseSource && appState.layers.layer1.active) {
      busCtxA.save();
      busCtxA.translate(w/2, h/2);
      const s = (appState.layers.layer1.scale || 1.12) + Math.sin(simTime * 0.3) * 0.008 + (sub * 0.02);
      busCtxA.scale(s, s);
      busCtxA.translate(-w/2, -h/2);
      const b1 = (appState.layers.layer1.blend || 'multiply').toLowerCase();
      busCtxA.globalCompositeOperation = b1 === 'screen' ? 'screen' : 'multiply';
      busCtxA.globalAlpha = appState.layers.layer1.opacity !== undefined ? appState.layers.layer1.opacity : 0.55;
      drawFittedImage(busCtxA, baseSource, w, h, appState.layers.layer1.fit_mode || 'fit', appState.layers.layer1.rotation || 0);
      busCtxA.restore();
    }

    // LAYER 2: EDGE TRACE (Sobel Contours)
    if (baseSource && appState.layers.layer2.active) {
      const edgeMix = (appState.tonal.edge_mix || 0.22) * (appState.layers.layer2.opacity || 0.22);
      busCtxA.save();
      busCtxA.globalAlpha = Math.min(1.0, edgeMix * (0.8 + air * 0.4));
      drawSobelContours(busCtxA, baseSource, w, h, simTime, appState.tonal.edge_threshold || 0.30);
      busCtxA.restore();
    }

    // LAYER FX ROUTING FOR DECK A (IF ROUTED SPECIFICALLY TO DECK A)
    if (appState.fx && appState.fx.active && appState.fx.target === 'deck_a') {
      applyFXEngine(busCtxA, busCanvasA, w, h, simTime, appState.fx);
    }
  }

  // --------------------------------------------------------------------------
  // 2. RENDER DECK B INTO busCanvasB (MASTER BUS B / CUE)
  // --------------------------------------------------------------------------
  if (busCtxB) {
    busCtxB.fillStyle = '#050608';
    busCtxB.fillRect(0, 0, w, h);

    const queuedClip = allClips.find(c => c.id === appState.layers.layer3.clipId) || allClips[1] || allClips[0];
    const isQueuedGen = queuedClip && (queuedClip.is_generative || queuedClip.id === 'clip_gen_plexus_spine');
    const videoL3Ready = playerL3 && playerL3.readyState >= 2;
    const queuedSource = isQueuedGen ? getPlexusSpineCanvas(w, h, simTime) : (videoL3Ready ? playerL3 : getClipImage(queuedClip));

    if (queuedSource && appState.layers.layer3.active) {
      offCtxB.clearRect(0, 0, w, h);
      offCtxB.fillStyle = '#050608';
      offCtxB.fillRect(0, 0, w, h);

      // Render secondary with rotation & fit
      drawFittedImage(offCtxB, queuedSource, w, h, appState.layers.layer3.fit_mode || 'fill', appState.layers.layer3.rotation || 0);

      // Apply Layer 3 Matte with invert support
      const matteL3 = getMatteImage(appState.layers.layer3.matte);
      if (matteL3 && appState.layers.layer3.matte !== 'none') {
        offCtxB.save();
        offCtxB.globalCompositeOperation = 'destination-in';
        drawDeformedMatte(offCtxB, matteL3, w, h, simTime, appState.matte?.deform, appState.layers.layer3.matte_invert);
        offCtxB.restore();
      }

      busCtxB.save();
      busCtxB.filter = getTonalFilterString(appState.tonal);
      busCtxB.globalAlpha = (appState.layers.layer3.opacity !== undefined) ? appState.layers.layer3.opacity : 1.0;
      busCtxB.drawImage(offscreenB, 0, 0, w, h);
      busCtxB.restore();

      // Organic penumbra vignette removed
      // LAYER 1 on Bus B: SELF-DOUBLE (Ensures smooth crossfade without layer pop-in)
      if (appState.layers.layer1.active) {
        busCtxB.save();
        busCtxB.translate(w/2, h/2);
        const s = (appState.layers.layer1.scale || 1.12) + Math.sin(simTime * 0.3) * 0.008 + (sub * 0.02);
        busCtxB.scale(s, s);
        busCtxB.translate(-w/2, -h/2);
        const b1 = (appState.layers.layer1.blend || 'multiply').toLowerCase();
        busCtxB.globalCompositeOperation = b1 === 'screen' ? 'screen' : 'multiply';
        busCtxB.globalAlpha = appState.layers.layer1.opacity !== undefined ? appState.layers.layer1.opacity : 0.55;
        drawFittedImage(busCtxB, queuedSource, w, h, appState.layers.layer3.fit_mode || 'fill', appState.layers.layer3.rotation || 0);
        busCtxB.restore();
      }

      // LAYER 2 on Bus B: EDGE TRACE SOBEL
      if (appState.layers.layer2.active) {
        const edgeMix = (appState.tonal.edge_mix || 0.22) * (appState.layers.layer2.opacity || 0.22);
        busCtxB.save();
        busCtxB.globalAlpha = Math.min(1.0, edgeMix * (0.8 + air * 0.4));
        drawSobelContours(busCtxB, queuedSource, w, h, simTime, appState.tonal.edge_threshold || 0.30);
        busCtxB.restore();
      }

      // LAYER FX ROUTING FOR DECK B (IF ROUTED SPECIFICALLY TO DECK B)
      if (appState.fx && appState.fx.active && appState.fx.target === 'deck_b') {
        applyFXEngine(busCtxB, busCanvasB, w, h, simTime, appState.fx);
      }
    }
  }

  // --------------------------------------------------------------------------
  // 3. RENDER PREVIEW CANVAS (Shows Bus B / Cue in real time)
  // --------------------------------------------------------------------------
  if (prvCtx && prvCanvas) {
    prvCtx.fillStyle = '#050608';
    prvCtx.fillRect(0, 0, prvCanvas.width, prvCanvas.height);
    prvCtx.drawImage(busCanvasB, 0, 0, prvCanvas.width, prvCanvas.height);

    // Architectural cyan cue border
    prvCtx.save();
    prvCtx.strokeStyle = 'rgba(0, 240, 255, 0.45)';
    prvCtx.lineWidth = 1.2;
    prvCtx.setLineDash([4, 4]);
    prvCtx.strokeRect(prvCanvas.width * 0.03, prvCanvas.height * 0.03, prvCanvas.width * 0.94, prvCanvas.height * 0.94);
    prvCtx.restore();

    if (prvTimecode) {
      const remainingBars = Math.max(0, appState.phrase.length_bars - appState.phrase.current_bar);
      prvTimecode.textContent = `CUE EM ${remainingBars} BARS (${appState.phrase.current_bar}/${appState.phrase.length_bars})`;
    }
  }

  // --------------------------------------------------------------------------
  // 4. RENDER PROGRAM CANVAS (EQUAL-POWER DISSOLVE MASTER)
  // --------------------------------------------------------------------------
  if (prgCtx && prgCanvas) {
    const isVert = Boolean(appState.vertical_mode || appState.vertical_projection);
    const targetPw = isVert ? 360 : 640;
    const targetPh = isVert ? 640 : 360;
    if (prgCanvas.width !== targetPw || prgCanvas.height !== targetPh) {
      prgCanvas.width = targetPw;
      prgCanvas.height = targetPh;
    }

    const pw = prgCanvas.width;
    const ph = prgCanvas.height;

    prgCtx.fillStyle = '#050608';
    prgCtx.fillRect(0, 0, pw, ph);

    prgCtx.save();

    if (!isBlackout) {
      let blendProgress = 0.0;
      if (isAutoTransitioning) {
        blendProgress = Math.min(1.0, autoTransitionProgress);
      } else if (crossfader) {
        blendProgress = Number(crossfader.value) / 100.0;
      }

      if (blendProgress > 0.001) {
        if (selectedTransitionMode === 'dip') {
          // DIP TO BLACK
          if (blendProgress <= 0.5) {
            const aAlpha = 1.0 - (blendProgress * 2.0);
            prgCtx.save();
            prgCtx.globalAlpha = aAlpha;
            drawBusToProgram(prgCtx, busCanvasA, pw, ph, isVert);
            prgCtx.restore();
          } else {
            const bAlpha = (blendProgress - 0.5) * 2.0;
            prgCtx.save();
            prgCtx.globalAlpha = bAlpha;
            drawBusToProgram(prgCtx, busCanvasB, pw, ph, isVert);
            prgCtx.restore();
          }
        } else {
          // TRUE EQUAL-POWER S-CURVE DISSOLVE
          const ease = 0.5 - 0.5 * Math.cos(Math.PI * blendProgress);
          const alphaA = 1.0 - ease;
          const alphaB = ease;

          prgCtx.save();
          prgCtx.globalAlpha = alphaA;
          drawBusToProgram(prgCtx, busCanvasA, pw, ph, isVert);
          prgCtx.restore();

          prgCtx.save();
          prgCtx.globalAlpha = alphaB;
          drawBusToProgram(prgCtx, busCanvasB, pw, ph, isVert);
          prgCtx.restore();
        }
      } else {
        // Steady State: Check Handover Buffer first
        if (hasHandoverFrame) {
          if (playerL0 && playerL0.readyState >= 2) {
            hasHandoverFrame = false;
            drawBusToProgram(prgCtx, busCanvasA, pw, ph, isVert);
          } else {
            drawBusToProgram(prgCtx, handoverCanvas, pw, ph, isVert);
          }
        } else {
          drawBusToProgram(prgCtx, busCanvasA, pw, ph, isVert);
        }
      }

      // LAYER 4: ACCENT VIDEO (DROP / CLIMAX DIFFERENCE)
      if ((appState.macro_state === 'DROP' || appState.drop_likelihood > 0.65) && appState.layers.layer4.active) {
        const accentClip = allClips.find(c => c.id === appState.layers.layer4.clipId) || allClips[2] || allClips[0];
        const isAccentGen = accentClip && (accentClip.is_generative || accentClip.id === 'clip_gen_plexus_spine');
        const videoL4Ready = playerL4 && playerL4.readyState >= 2;
        const accentSource = isAccentGen ? getPlexusSpineCanvas(w, h, simTime) : (videoL4Ready ? playerL4 : getClipImage(accentClip));

        if (accentSource) {
          offCtxB.clearRect(0, 0, w, h);
          drawFittedImage(offCtxB, accentSource, w, h, appState.layers.layer4.fit_mode || 'fit', appState.layers.layer4.rotation || 0);

          const matteL4 = getMatteImage(appState.layers.layer4.matte);
          if (matteL4 && appState.layers.layer4.matte !== 'none') {
            offCtxB.save();
            offCtxB.globalCompositeOperation = 'destination-in';
            drawDeformedMatte(offCtxB, matteL4, w, h, simTime, appState.matte?.deform, appState.layers.layer4.matte_invert);
            offCtxB.restore();
          }

          prgCtx.save();
          prgCtx.globalCompositeOperation = 'difference';
          prgCtx.globalAlpha = Math.min(0.35, (appState.layers.layer4.opacity || 0.25) * (0.6 + bass * 0.4));
          drawBusToProgram(prgCtx, offscreenB, pw, ph, isVert);
          prgCtx.restore();
        }
      }
    }

    // 4.5. MASTER MATTE APPLICATION
    if (!isBlackout && appState.master_matte && appState.master_matte !== 'none') {
      const masterMatteImg = getMatteImage(appState.master_matte);
      if (masterMatteImg) {
        prgCtx.save();
        prgCtx.globalCompositeOperation = 'destination-in';
        drawDeformedMatte(prgCtx, masterMatteImg, pw, ph, simTime, appState.matte?.deform, false);
        prgCtx.restore();
      }
    }

    // 4.6 MASTER PGM FX ENGINE (DIRECT ON MASTER VIDEO OUTPUT - 100% FULL FRAME ZERO-OFFSET)
    if (appState.fx && appState.fx.active && (appState.fx.target === 'master' || !appState.fx.target)) {
      applyFXEngine(prgCtx, prgCanvas, pw, ph, simTime, appState.fx);
    }

    prgCtx.restore();
  }

  // --------------------------------------------------------------------------
  // 5. THEATER / EXPANDED MODAL LIVE MIRRORING & TELEMETRY
  // --------------------------------------------------------------------------
  if (activeTheaterFeed && theaterCtx && theaterCanvas) {
    const srcCanvas = activeTheaterFeed === 'program' ? prgCanvas : prvCanvas;
    if (srcCanvas && srcCanvas.width > 0) {
      theaterCtx.fillStyle = '#050608';
      theaterCtx.fillRect(0, 0, theaterCanvas.width, theaterCanvas.height);
      drawFittedImage(theaterCtx, srcCanvas, theaterCanvas.width, theaterCanvas.height, 'fit');
    }
    if (activeTheaterFeed === 'program') {
      if (theaterClipName) theaterClipName.textContent = appState.layers.layer0.name || 'PROGRAM MASTER';
      if (theaterTimecode && prgTimecode) theaterTimecode.textContent = prgTimecode.textContent;
      if (theaterTagLayer) theaterTagLayer.textContent = 'PROGRAM MASTER · 5 LAYERS COMPOSITE';
      if (theaterTagMatte) theaterTagMatte.textContent = appState.layers.layer0.matte?.split('/').pop() || 'OBSIDIAN GRADE';
    } else {
      const queuedClip = allClips.find(c => c.id === appState.layers.layer3.clipId) || allClips[1] || allClips[0];
      if (theaterClipName) theaterClipName.textContent = queuedClip ? queuedClip.name : 'PREVIEW CUE';
      if (theaterTimecode && prvTimecode) theaterTimecode.textContent = prvTimecode.textContent;
      const blendName = appState.layers.layer3?.blend ? appState.layers.layer3.blend.toUpperCase() : 'SOFT LIGHT';
      if (theaterTagLayer) theaterTagLayer.textContent = `LAYER 3 · ${blendName}`;
      const matteName = appState.layers.layer3?.matte ? appState.layers.layer3.matte.split('/').pop() : 'NO MATTE';
      if (theaterTagMatte) theaterTagMatte.textContent = matteName;
    }
  }

  requestAnimationFrame(renderVisuals);
}

// Hardware-Accelerated Video Difference Sobel Contour Synthesizer
function drawSobelContours(ctx, baseSource, w, h, t, threshold) {
  if (!baseSource) return;
  offCtxB.clearRect(0, 0, w, h);
  offCtxB.save();
  const contrastBoost = Math.round(180 + (1.0 - threshold) * 140);
  offCtxB.filter = 'grayscale(100%) contrast(' + contrastBoost + '%)';
  drawFittedImage(offCtxB, baseSource, w, h, appState.fit_mode);
  
  // 1.8px spatial offset with difference blend mode creates the spatial gradient
  const shift = 1.8;
  offCtxB.globalCompositeOperation = 'difference';
  offCtxB.drawImage(offscreenB, shift, shift);
  offCtxB.restore();

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.drawImage(offscreenB, 0, 0, w, h);
  ctx.restore();
}

// ============================================================================
// 7. FX ENGINE (Procedural & Kinematic)
// ============================================================================
// ============================================================================
// 7. PLEXUS 3D GENERATIVE MARINE SPINE ("ESPINHAÇO") ENGINE
// ============================================================================
let plexusSpinePoints = null;
let plexusCanvas = document.createElement('canvas');
let plexusCtx = plexusCanvas.getContext('2d');
let marineSpores = [];

function generateProceduralSpine() {
  const pts = [];
  const vertebrae = 75;
  for (let i = 0; i < vertebrae; i++) {
    const u = (i / vertebrae) - 0.5; // -0.5 to 0.5 along spine length
    const taper = Math.sin((i / vertebrae) * Math.PI); // wider in middle
    
    // Centrum / Central Vertebral Canal
    pts.push([u, 0, (Math.sin(u * 7) * 0.03 + 0.14) * taper]);
    pts.push([u, 0, (Math.sin(u * 7) * 0.03 + 0.22) * taper]);
    
    // Lateral curved ribs (Pairs left & right)
    const ribsPerVert = 4;
    for (let r = 1; r <= ribsPerVert; r++) {
      const ribLen = (0.07 + taper * 0.18) * (r / ribsPerVert);
      const arcZ = Math.sin((r / ribsPerVert) * Math.PI * 0.6) * 0.14 * taper;
      pts.push([u, -ribLen, 0.12 - arcZ]);
      pts.push([u, ribLen, 0.12 - arcZ]);
    }
    
    // Dorsal spine rays / radiating needles
    pts.push([u, 0, 0.22 + taper * 0.16]);
    pts.push([u + 0.006, 0, 0.22 + taper * 0.28]);
  }
  return pts;
}

function initMarineSpores() {
  marineSpores = [];
  for (let i = 0; i < 180; i++) {
    marineSpores.push({
      x: (Math.random() - 0.5) * 1.8,
      y: (Math.random() - 0.5) * 1.3,
      z: (Math.random() - 0.5) * 1.2,
      vx: (Math.random() - 0.5) * 0.03,
      vy: (Math.random() - 0.5) * 0.03,
      vz: (Math.random() - 0.5) * 0.03,
      size: 1 + Math.random() * 2.5,
      alpha: 0.35 + Math.random() * 0.65,
      hue: 175 + Math.random() * 35 // bioluminescent marine cyan to aqua
    });
  }
}
initMarineSpores();

// Load real 3D vertex points extracted from user's Espinhaço FBX
function loadSpinePoints() {
  fetch('assets/espinhaco_spine_points.json')
    .then(r => r.json())
    .then(data => {
      if (data && data.points && data.points.length > 0) {
        plexusSpinePoints = data.points;
        console.log(`[✓] Plexus 3D Espinhaço loaded: ${plexusSpinePoints.length} anatomical vertices.`);
      } else {
        plexusSpinePoints = generateProceduralSpine();
      }
    })
    .catch(() => {
      plexusSpinePoints = generateProceduralSpine();
    });
}
loadSpinePoints();

function getPlexusSpineCanvas(w, h, simTime) {
  if (plexusCanvas.width !== w || plexusCanvas.height !== h) {
    plexusCanvas.width = w;
    plexusCanvas.height = h;
  }
  
  if (!plexusSpinePoints) {
    plexusSpinePoints = generateProceduralSpine();
  }

  const ctx = plexusCtx;
  const bass = Number(appState.bands?.bass || 0.5);
  const sub = Number(appState.bands?.sub || 0.5);
  const air = Number(appState.bands?.air || 0.3);
  const presence = Number(appState.bands?.presence || 0.3);

  // Deep oceanic abyss background
  const bgGrad = ctx.createRadialGradient(w * 0.5, h * 0.5, 50, w * 0.5, h * 0.5, Math.max(w, h) * 0.7);
  bgGrad.addColorStop(0, 'rgba(3, 18, 32, 1)');
  bgGrad.addColorStop(0.6, 'rgba(2, 8, 16, 1)');
  bgGrad.addColorStop(1, 'rgba(0, 3, 7, 1)');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, w, h);

  // 3D Camera & Turntable Orbit
  const rotY = simTime * 0.28;
  const rotX = Math.sin(simTime * 0.18) * 0.22;
  const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
  const cosX = Math.cos(rotX), sinX = Math.sin(rotX);
  const camDist = 2.3;
  const fov = 1.35;

  // Houdini Undulating Swimming Simulation (Sinusoidal wave traveling head-to-tail)
  const swimPhase = simTime * 3.2;
  const swimAmp = 0.08 + bass * 0.14;
  const ribExp = 1.0 + sub * 0.45;
  const dorsalPulse = 1.0 + air * 0.35;

  const pts = plexusSpinePoints;
  const step = Math.max(1, Math.floor(pts.length / 900)); // Sample ~900 nodes for 60 FPS
  const projected = [];

  for (let i = 0; i < pts.length; i += step) {
    const raw = pts[i];
    const px = raw[0];
    const py = (raw[1] * ribExp) + Math.sin(px * 5.2 - swimPhase) * swimAmp * (1.0 + Math.abs(px));
    const pz = (raw[2] * dorsalPulse) - 0.16;

    // 3D Rotation Matrix
    const x1 = px * cosY + pz * sinY;
    const z1 = -px * sinY + pz * cosY;
    const y2 = py * cosX - z1 * sinX;
    const z2 = py * sinX + z1 * cosX;

    const depth = camDist + z2;
    if (depth <= 0.1) continue;

    const persp = fov / depth;
    const sx = w * 0.5 + x1 * persp * w;
    const sy = h * 0.5 + y2 * persp * h;

    projected.push({ sx, sy, z: z2, depth, origIndex: i });
  }

  // Render Plexus Connecting Lines (Render Objects)
  ctx.save();
  const lineDistMax = 55 * (1.0 + bass * 0.35);
  const lineDistSq = lineDistMax * lineDistMax;
  ctx.lineWidth = 1.0 + bass * 1.4;

  const n = projected.length;
  const searchK = Math.min(14, n);
  for (let i = 0; i < n; i++) {
    const p1 = projected[i];
    for (let j = 1; j <= searchK && (i + j) < n; j++) {
      const p2 = projected[i + j];
      const dx = p1.sx - p2.sx;
      const dy = p1.sy - p2.sy;
      const d2 = dx * dx + dy * dy;
      if (d2 < lineDistSq) {
        const d = Math.sqrt(d2);
        const alpha = (1.0 - (d / lineDistMax)) * (0.28 + bass * 0.45);
        ctx.strokeStyle = `rgba(0, 240, 255, ${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(p1.sx, p1.sy);
        ctx.lineTo(p2.sx, p2.sy);
        ctx.stroke();
      }
    }
  }

  // Render Bioluminescent Nodes (Geometry Objects)
  for (let i = 0; i < n; i++) {
    const p = projected[i];
    const r = Math.max(1.2, (3.2 / p.depth) * (0.8 + bass * 0.7));
    
    // Corona glow
    if (i % 6 === 0) {
      const halo = ctx.createRadialGradient(p.sx, p.sy, 0, p.sx, p.sy, r * 4.5);
      halo.addColorStop(0, `rgba(0, 240, 255, ${0.45 + bass * 0.3})`);
      halo.addColorStop(0.5, 'rgba(0, 255, 136, 0.15)');
      halo.addColorStop(1, 'rgba(0, 240, 255, 0)');
      ctx.fillStyle = halo;
      ctx.fillRect(p.sx - r * 4.5, p.sy - r * 4.5, r * 9, r * 9);
    }

    ctx.fillStyle = (i % 8 === 0) ? '#ffffff' : '#00f0ff';
    ctx.beginPath();
    ctx.arc(p.sx, p.sy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Render Marine Floating Spores / Plankton
  ctx.globalCompositeOperation = 'screen';
  for (let i = 0; i < marineSpores.length; i++) {
    const s = marineSpores[i];
    s.x += s.vx * (1.0 + bass * 0.5);
    s.y += s.vy * (1.0 + presence * 0.5);
    s.z += s.vz;
    if (s.x < -0.9) s.x = 0.9; if (s.x > 0.9) s.x = -0.9;
    if (s.y < -0.7) s.y = 0.7; if (s.y > 0.7) s.y = -0.7;
    if (s.z < -0.6) s.z = 0.6; if (s.z > 0.6) s.z = -0.6;

    const x1 = s.x * cosY + s.z * sinY;
    const z1 = -s.x * sinY + s.z * cosY;
    const y2 = s.y * cosX - z1 * sinX;
    const z2 = s.y * sinX + z1 * cosX;
    const depth = camDist + z2;
    if (depth <= 0.1) continue;

    const persp = fov / depth;
    const sx = w * 0.5 + x1 * persp * w;
    const sy = h * 0.5 + y2 * persp * h;
    const spR = Math.max(0.8, (s.size / depth) * (0.8 + air * 0.6));

    ctx.fillStyle = `hsla(${s.hue}, 100%, 75%, ${(s.alpha * (0.6 + air * 0.4)).toFixed(2)})`;
    ctx.beginPath();
    ctx.arc(sx, sy, spR, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  return plexusCanvas;
}
window.getPlexusSpineCanvas = getPlexusSpineCanvas;

// ============================================================================
// 7.1 PROFISSIONAL AFTER EFFECTS SUITE (5 PLUGINS PARÂMETRICOS INDEPENDENTES)
// ============================================================================

// Dedicated Persistent Canvas Buffers to prevent any buffer collision or frame offset
let fxMainOffscreen = null;
let fxMainOffCtx = null;
let fxAuxOffscreen = null;
let fxAuxOffCtx = null;
let fxExpandedOffscreen = null;
let fxExpandedOffCtx = null;

function getFxBuffers(w, h) {
  if (!fxMainOffscreen) {
    fxMainOffscreen = document.createElement('canvas');
    fxMainOffCtx = fxMainOffscreen.getContext('2d', { willReadFrequently: true });
  }
  if (fxMainOffscreen.width !== w || fxMainOffscreen.height !== h) {
    fxMainOffscreen.width = w;
    fxMainOffscreen.height = h;
  }

  if (!fxAuxOffscreen) {
    fxAuxOffscreen = document.createElement('canvas');
    fxAuxOffCtx = fxAuxOffscreen.getContext('2d', { willReadFrequently: true });
  }
  if (fxAuxOffscreen.width !== w || fxAuxOffscreen.height !== h) {
    fxAuxOffscreen.width = w;
    fxAuxOffscreen.height = h;
  }

  return { mainCanvas: fxMainOffscreen, mainCtx: fxMainOffCtx, auxCanvas: fxAuxOffscreen, auxCtx: fxAuxOffCtx };
}

function getExpandedBuffer(dim) {
  if (!fxExpandedOffscreen) {
    fxExpandedOffscreen = document.createElement('canvas');
    fxExpandedOffCtx = fxExpandedOffscreen.getContext('2d', { willReadFrequently: true });
  }
  if (fxExpandedOffscreen.width !== dim || fxExpandedOffscreen.height !== dim) {
    fxExpandedOffscreen.width = dim;
    fxExpandedOffscreen.height = dim;
  }
  return { expCanvas: fxExpandedOffscreen, expCtx: fxExpandedOffCtx };
}

// ----------------------------------------------------------------------------
// ROADMAP PRESETS DATABASE (AFTER EFFECTS 1:1 REPLICATION)
// ----------------------------------------------------------------------------
const ROADMAP_PRESETS = {
  pixel_stretch: {
    cinematic_anamorphic: { direction: 0, intensity: 0.85, curve: 'exponential', smoothness: 1.8, threshold: 0.70, length: 320, channels: 'rgba_split', start_offset: 0.0, pixel_size: 2, source: 'luma' },
    data_ghosting: { direction: 90, intensity: 0.40, curve: 'scurve', smoothness: 2.5, threshold: 0.20, length: 180, channels: 'luma_all', start_offset: 0.10, pixel_size: 1, source: 'luma' },
    edge_smear: { direction: 45, intensity: 1.0, curve: 'linear', smoothness: 1.0, threshold: 0.35, length: 260, channels: 'rgba_split', start_offset: 0.65, pixel_size: 3, source: 'chroma' },
    cyberpunk_rain: { direction: 90, intensity: 0.75, curve: 'exponential', smoothness: 1.2, threshold: 0.45, length: 380, channels: 'blue_only', start_offset: 0.0, pixel_size: 2, source: 'luma' },
    hyperdrive_tunnel: { direction: 180, intensity: 0.90, curve: 'logarithmic', smoothness: 0.8, threshold: 0.30, length: 420, channels: 'rgba_split', start_offset: 0.05, pixel_size: 4, source: 'luma' },
    needle_threads: { direction: 0, intensity: 0.95, curve: 'linear', smoothness: 0.1, threshold: 0.80, length: 500, channels: 'luma_all', start_offset: 0.0, pixel_size: 1, source: 'luma' }
  },
  pixel_sorter: {
    glitch_waterfall: { angle: 90, sorting_mode: 'luminance', threshold_min: 0.30, threshold_max: 0.80, random_noise: 0.05, length: 220, stretch_mode: false, mask: 'full', noise_scale: 18 },
    pastel_oil: { angle: 0, sorting_mode: 'saturation', threshold_min: 0.10, threshold_max: 0.90, random_noise: 0.15, length: 45, stretch_mode: true, mask: 'full', noise_scale: 10 },
    corrupted_signal: { angle: 180, sorting_mode: 'hue', threshold_min: 0.50, threshold_max: 0.60, random_noise: 0.40, length: 260, stretch_mode: false, mask: 'full', noise_scale: 25 },
    center_melt: { angle: 90, sorting_mode: 'luminance', threshold_min: 0.35, threshold_max: 0.85, random_noise: 0.20, length: 240, stretch_mode: true, mask: 'center', noise_scale: 18 },
    neon_threading: { angle: 270, sorting_mode: 'luminance', threshold_min: 0.85, threshold_max: 1.0, random_noise: 0.10, length: 300, stretch_mode: false, mask: 'full', noise_scale: 12 },
    diagonal_drift: { angle: 45, sorting_mode: 'red', threshold_min: 0.20, threshold_max: 0.70, random_noise: 0.20, length: 180, stretch_mode: true, mask: 'full', noise_scale: 20 }
  },
  bad_tv: {
    subdued_vhs: { tv_rgb_split: 3, tv_scanlines_opacity: 0.20, tv_scanlines_density: 300, tv_warp_wiggle: 0.08, tv_curvature: 0.04, tv_warp_sync_v: 0.0, tv_warp_sync_h: 0, tv_tape_noise: 0.15 },
    deep_space: { tv_rgb_split: 20, tv_scanlines_opacity: 0.65, tv_scanlines_density: 240, tv_warp_wiggle: 0.40, tv_curvature: 0.28, tv_warp_sync_v: 0.18, tv_warp_sync_h: 5, tv_tape_noise: 0.50 },
    arcade_crt: { tv_rgb_split: 9, tv_scanlines_opacity: 0.75, tv_scanlines_density: 420, tv_warp_wiggle: 0.05, tv_curvature: 0.22, tv_warp_sync_v: 0.0, tv_warp_sync_h: 0, tv_tape_noise: 0.10 },
    analog_aberration: { tv_rgb_split: 24, tv_scanlines_opacity: 0.10, tv_scanlines_density: 200, tv_warp_wiggle: 0.02, tv_curvature: 0.0, tv_warp_sync_v: 0.0, tv_warp_sync_h: 0, tv_tape_noise: 0.05 },
    security_cam: { tv_rgb_split: 5, tv_scanlines_opacity: 0.55, tv_scanlines_density: 180, tv_warp_wiggle: 0.15, tv_curvature: 0.10, tv_warp_sync_v: 0.12, tv_warp_sync_h: -4, tv_tape_noise: 0.65 },
    broken_vcr: { tv_rgb_split: 28, tv_scanlines_opacity: 0.80, tv_scanlines_density: 320, tv_warp_wiggle: 0.85, tv_curvature: 0.15, tv_warp_sync_v: 0.35, tv_warp_sync_h: 18, tv_tape_noise: 0.75 }
  },
  rxxr: {
    terminal_ascii: { style: 'terminal_amber', density: 10, edge_mode: false, edge_threshold: 0.35, expand_markers: 0.10, tint: '#ffb800' },
    cyberpunk_tracer: { style: 'matrix_code', density: 8, edge_mode: true, edge_threshold: 0.45, expand_markers: 0.30, tint: '#00ff88' },
    hex_stream: { style: 'binary_hex', density: 12, edge_mode: false, edge_threshold: 0.30, expand_markers: 0.20, tint: '#00f0ff' },
    glitch_shading: { style: 'glitch_blocks', density: 14, edge_mode: false, edge_threshold: 0.30, expand_markers: 0.60, tint: '#ffffff' },
    wireframe_grid: { style: 'wireframe_grid', density: 16, edge_mode: true, edge_threshold: 0.50, expand_markers: 0.20, tint: '#c084fc' },
    ghost_operator: { style: 'matrix_code', density: 6, edge_mode: true, edge_threshold: 0.40, expand_markers: 0.40, tint: '#38bdf8' }
  },
  modulation: {
    joy_division: { color_mode: 'joy_division', lines_count: 70, amplitude: 38, frequency: 55, lowpass: 0.30, line_thickness: 1.4 },
    offset_cmyk: { color_mode: 'cmyk_misreg', lines_count: 80, cmyk_offset: 10, amplitude: 22, frequency: 45, lowpass: 0.35, line_thickness: 1.2 },
    liquid_metal: { color_mode: 'cyan_spectrum', lines_count: 36, amplitude: 48, frequency: 22, lowpass: 0.60, line_thickness: 2.2 },
    laser_topo: { color_mode: 'laser_topo', lines_count: 96, amplitude: 26, frequency: 80, lowpass: 0.20, line_thickness: 1.0 },
    concentric_holo: { color_mode: 'cmyk_misreg', lines_count: 52, cmyk_offset: 16, amplitude: 38, frequency: 65, lowpass: 0.40, line_thickness: 1.6 },
    binary_shift: { color_mode: 'amber_matrix', lines_count: 110, amplitude: 18, frequency: 120, lowpass: 0.10, line_thickness: 0.9 }
  }
};

// ----------------------------------------------------------------------------
// HIGH-PERFORMANCE VIDEO FRAME PIXEL ANALYZER (OFFSCREEN ZERO-LATENCY)
// ----------------------------------------------------------------------------
const fxAnalysisCanvas = document.createElement('canvas');
fxAnalysisCanvas.width = 320;
fxAnalysisCanvas.height = 180;
const fxAnalysisCtx = fxAnalysisCanvas.getContext('2d', { willReadFrequently: true });
let cachedFrameData = null;

function updateFrameAnalysis(sourceCanvas) {
  if (!sourceCanvas) return null;
  try {
    fxAnalysisCtx.drawImage(sourceCanvas, 0, 0, 320, 180);
    cachedFrameData = fxAnalysisCtx.getImageData(0, 0, 320, 180);
  } catch (e) {
    cachedFrameData = null;
  }
  return cachedFrameData;
}

function samplePixelAt(normX, normY) {
  if (!cachedFrameData) return { r: 128, g: 128, b: 128, a: 255, luma: 0.5 };
  const d = cachedFrameData.data;
  const px = Math.max(0, Math.min(319, Math.floor(normX * 320)));
  const py = Math.max(0, Math.min(179, Math.floor(normY * 180)));
  const idx = (py * 320 + px) * 4;
  const r = d[idx];
  const g = d[idx + 1];
  const b = d[idx + 2];
  const a = d[idx + 3];
  const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255.0;
  return { r, g, b, a, luma };
}

function sampleLumaAt(normX, normY) {
  if (!cachedFrameData) return 0.5;
  const d = cachedFrameData.data;
  const px = Math.max(0, Math.min(319, Math.floor(normX * 320)));
  const py = Math.max(0, Math.min(179, Math.floor(normY * 180)));
  const idx = (py * 320 + px) * 4;
  return (0.299 * d[idx] + 0.587 * d[idx + 1] + 0.114 * d[idx + 2]) / 255.0;
}

// ----------------------------------------------------------------------------
// 1. PIXEL STRETCH (POR SATORI) - EXACT AFTER EFFECTS REPLICATION
// ----------------------------------------------------------------------------
function applyPixelStretch(ctx, sourceCanvas, w, h, t, bands, p, masterSpeed) {
  if (!p || !p.enabled) {
    ctx.drawImage(sourceCanvas, 0, 0, w, h);
    return;
  }

  // Draw solid base image to guarantee 100% full frame coverage
  ctx.drawImage(sourceCanvas, 0, 0, w, h);

  const intensity = Math.min(1.0, Math.max(0.0, p.intensity !== undefined ? p.intensity : 0.85));
  const rawLength = p.length !== undefined ? p.length : 240;
  if (intensity <= 0.001 || rawLength <= 0) return; // Parameter zeroed: 100% clean bypass

  const length = Math.max(0, rawLength);
  const pxSize = Math.max(0, p.pixel_size !== undefined ? p.pixel_size : 2);
  const rawDir = p.direction !== undefined ? p.direction : 90;
  const angleDeg = (typeof rawDir === 'number') ? rawDir : (rawDir === 'down' ? 90 : (rawDir === 'up' ? 270 : (rawDir === 'right' ? 0 : 180)));
  const angleRad = (angleDeg * Math.PI) / 180.0;
  const dirX = Math.cos(angleRad);
  const dirY = Math.sin(angleRad);

  const curve = p.curve || 'exponential';
  const smooth = Math.max(0.1, p.smoothness !== undefined ? p.smoothness : 1.8);
  const threshold = Math.max(0.0, Math.min(1.0, p.threshold !== undefined ? p.threshold : 0.50));
  const startOffset = Math.min(0.8, Math.max(0.0, p.start_offset || 0.0));
  const channels = p.channels || 'rgba_split';
  const bass = Number(bands?.bass || 0.5);

  const numRays = 48;
  const maxStretchDist = length * intensity * (0.85 + bass * 0.40);
  const offsetDist = startOffset * 80.0;

  function evalCurveWeight(norm) {
    if (curve === 'exponential') return Math.pow(norm, 2.2);
    if (curve === 'linear') return norm;
    if (curve === 'parabolic') return 4.0 * norm * (1.0 - norm);
    if (curve === 'scurve') return norm * norm * (3.0 - 2.0 * norm);
    if (curve === 'logarithmic') return Math.log10(1.0 + 9.0 * norm);
    return Math.pow(norm, 2.0);
  }

  ctx.save();

  // Multi-ray directional sampling reading real frame brightness
  for (let r = 0; r < numRays; r++) {
    const normRay = r / numRays;
    let originX = 0.5, originY = 0.5;
    if (Math.abs(dirX) > Math.abs(dirY)) {
      originY = normRay;
      originX = dirX > 0 ? 0.15 : 0.85;
    } else {
      originX = normRay;
      originY = dirY > 0 ? 0.15 : 0.85;
    }

    const sample = samplePixelAt(originX, originY);
    let sampleVal = sample.luma;
    if (channels === 'red_only') sampleVal = sample.r / 255.0;
    else if (channels === 'blue_only') sampleVal = sample.b / 255.0;

    // Threshold gate: only bright / active areas stretch!
    if (sampleVal < threshold) continue;

    const excess = (sampleVal - threshold) / Math.max(0.05, 1.0 - threshold);
    const rayLength = maxStretchDist * evalCurveWeight(excess);
    if (rayLength < 2) continue;

    const samples = 12;
    for (let s = 1; s <= samples; s++) {
      const tNorm = s / samples;
      const dist = (rayLength * tNorm + offsetDist);
      const offX = dirX * dist;
      const offY = dirY * dist;
      const alpha = (1.0 - tNorm * 0.70) * (0.40 / samples) * intensity * excess * (2.2 / smooth);

      if (channels === 'rgba_split') {
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = Math.min(0.85, alpha * 1.5);
        ctx.drawImage(sourceCanvas, offX - dirY * 3, offY + dirX * 3, w, h);
        ctx.drawImage(sourceCanvas, offX + dirY * 3, offY - dirX * 3, w, h);
      } else {
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = Math.min(0.85, alpha * 1.4);
        ctx.drawImage(sourceCanvas, offX, offY, w, h);
      }
    }
  }

  // Quantized subpixel grain / threads
  if (pxSize > 1) {
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
    if (Math.abs(dirX) > Math.abs(dirY)) {
      for (let y = 0; y < h; y += pxSize * 2) {
        ctx.fillRect(0, y, w, pxSize);
      }
    } else {
      for (let x = 0; x < w; x += pxSize * 2) {
        ctx.fillRect(x, 0, pxSize, h);
      }
    }
  }

  ctx.restore();
}

// ----------------------------------------------------------------------------
// 2. AE PIXEL SORTER (POR GABRIEL SCHAMA) - MATHEMATICAL FULL-FRAME OVERSCAN
// ----------------------------------------------------------------------------
function applyPixelSorter(ctx, sourceCanvas, w, h, t, bands, p, masterSpeed) {
  if (!p || !p.enabled) {
    ctx.drawImage(sourceCanvas, 0, 0, w, h);
    return;
  }

  const thMin = p.threshold_min !== undefined ? p.threshold_min : 0.30;
  const thMax = p.threshold_max !== undefined ? p.threshold_max : 0.85;
  const angleDeg = p.angle !== undefined ? p.angle : 90;
  const angleRad = (angleDeg * Math.PI) / 180.0;
  const rawLength = p.length !== undefined ? p.length : 200;
  if (rawLength <= 0) {
    ctx.drawImage(sourceCanvas, 0, 0, w, h);
    return; // Zero length: clean bypass
  }
  const length = Math.max(0, rawLength);
  const isStretchMode = Boolean(p.stretch_mode);
  const sortingMode = p.sorting_mode || 'luminance';
  const maskType = p.mask || 'full';
  const bass = Number(bands?.bass || 0.5);

  // 1. Solid underlay to guarantee 100% full frame coverage on output
  ctx.drawImage(sourceCanvas, 0, 0, w, h);

  // 2. Compute diagonal bounding dimension to eliminate any black corners or clipping on rotation
  const diag = Math.ceil(Math.hypot(w, h)) + 8;
  const { expCanvas, expCtx } = getExpandedBuffer(diag);
  const halfD = Math.floor(diag * 0.5);
  const halfW = Math.floor(w * 0.5);
  const halfH = Math.floor(h * 0.5);

  expCtx.drawImage(sourceCanvas, 0, 0, diag, diag);
  expCtx.save();
  expCtx.translate(halfD, halfD);
  expCtx.rotate(angleRad);
  expCtx.drawImage(sourceCanvas, -halfW, -halfH, w, h);

  // Mirror-pad all 4 edges to full diagonal bounds so slices have full continuous pixels
  expCtx.drawImage(sourceCanvas, 0, 0, w, 2, -halfW, -halfD, w, halfD - halfH);
  expCtx.drawImage(sourceCanvas, 0, h - 2, w, 2, -halfW, halfH, w, halfD - halfH);
  expCtx.drawImage(sourceCanvas, 0, 0, 2, h, -halfD, -halfH, halfD - halfW, h);
  expCtx.drawImage(sourceCanvas, w - 2, 0, 2, h, halfW, -halfH, halfD - halfW, h);

  // 3. Algorithmic slice sorting reading ACTUAL IMAGE DATA
  const sliceH = 4;
  const totalSlices = Math.floor(diag / sliceH);

  for (let i = 0; i < totalSlices; i++) {
    const sy = -halfD + i * sliceH;
    const sampleSrcY = ((i * sliceH) % h);
    const normY = sampleSrcY / h;

    const sampleA = samplePixelAt(0.20, normY);
    const sampleB = samplePixelAt(0.50, normY);
    const sampleC = samplePixelAt(0.80, normY);

    function getMetric(s) {
      if (sortingMode === 'saturation') {
        const mx = Math.max(s.r, s.g, s.b);
        const mn = Math.min(s.r, s.g, s.b);
        return mx === 0 ? 0 : (mx - mn) / mx;
      }
      if (sortingMode === 'red') return s.r / 255.0;
      if (sortingMode === 'blue') return s.b / 255.0;
      if (sortingMode === 'hue') {
        const mx = Math.max(s.r, s.g, s.b) / 255.0;
        const mn = Math.min(s.r, s.g, s.b) / 255.0;
        const d = mx - mn;
        if (d === 0) return 0;
        let hVal = 0;
        if (mx === s.r / 255.0) hVal = ((s.g - s.b) / 255.0 / d) % 6;
        else if (mx === s.g / 255.0) hVal = (s.b - s.r) / 255.0 / d + 2;
        else hVal = (s.r - s.g) / 255.0 / d + 4;
        return (hVal / 6 + 1) % 1;
      }
      return s.luma;
    }

    const rowMetric = (getMetric(sampleA) + getMetric(sampleB) * 2 + getMetric(sampleC)) / 4.0;

    // Strict threshold gating from real image pixels
    if (rowMetric < thMin || rowMetric > thMax) continue;

    const sortDist = Math.floor(length * (rowMetric - thMin) * (0.85 + bass * 0.55));
    if (sortDist < 2) continue;

    if (isStretchMode) {
      expCtx.save();
      expCtx.globalAlpha = 0.88;
      expCtx.drawImage(sourceCanvas, 0, sampleSrcY, w, sliceH, -halfD + sortDist * 0.4, sy, diag, sliceH);
      expCtx.restore();
    } else {
      expCtx.save();
      expCtx.globalCompositeOperation = 'lighter';
      expCtx.globalAlpha = 0.82;
      expCtx.drawImage(sourceCanvas, 0, sampleSrcY, w, sliceH, -halfD + sortDist, sy, diag, sliceH);
      expCtx.restore();
    }
  }

  expCtx.restore();

  // 4. Blit back to target ctx rotated by -angle: 100% COVERAGE & ZERO OFFSET
  ctx.save();
  ctx.translate(halfW, halfH);
  ctx.rotate(-angleRad);
  ctx.drawImage(expCanvas, -halfD, -halfD, diag, diag);
  ctx.restore();

  // 5. Optional Constraint Mask (smooth radial center blend)
  if (maskType === 'center') {
    ctx.save();
    ctx.globalCompositeOperation = 'destination-in';
    const rad = ctx.createRadialGradient(halfW, halfH, 40, halfW, halfH, Math.min(w, h) * 0.48);
    rad.addColorStop(0, 'rgba(0,0,0,1)');
    rad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rad;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
}

// ----------------------------------------------------------------------------
// ----------------------------------------------------------------------------
// 3. BAD TV (ROWBYTE TV DISTORTION BUNDLE) - ANALOG CRT & TOROIDAL WRAPAROUND
// ----------------------------------------------------------------------------
function applyBadTv(ctx, sourceCanvas, w, h, t, bands, p, masterSpeed) {
  if (!p || !p.enabled) {
    ctx.drawImage(sourceCanvas, 0, 0, w, h);
    return;
  }

  const syncV = p.tv_warp_sync_v !== undefined ? p.tv_warp_sync_v : 0.0;
  const syncH = p.tv_warp_sync_h !== undefined ? p.tv_warp_sync_h : 0;
  const wiggle = p.tv_warp_wiggle !== undefined ? p.tv_warp_wiggle : 0.15;
  const curvature = p.tv_curvature !== undefined ? p.tv_curvature : 0.08;
  const scanlinesOp = p.tv_scanlines_opacity !== undefined ? p.tv_scanlines_opacity : 0.40;
  const scanlinesDens = p.tv_scanlines_density !== undefined ? p.tv_scanlines_density : 360;
  const rgbSplit = p.tv_rgb_split !== undefined ? p.tv_rgb_split : 12;
  const tapeNoise = p.tv_tape_noise !== undefined ? p.tv_tape_noise : 0.20;

  // 100% Clean Bypass when all distortion parameters are zeroed
  if (syncV === 0 && syncH === 0 && wiggle <= 0 && curvature <= 0 && scanlinesOp <= 0 && rgbSplit <= 0 && tapeNoise <= 0) {
    ctx.drawImage(sourceCanvas, 0, 0, w, h);
    return;
  }

  const bass = Number(bands?.bass || 0.5);
  const snare = Number(bands?.hi_mid || 0.4);

  // Sample actual frame luma at center for CRT sync instability modulation
  const centerLuma = sampleLumaAt(0.5, 0.5);

  // VHS Wiggle & Horizontal Slip with image-luma driven instability
  const wiggleX = wiggle > 0
    ? (Math.sin(t * masterSpeed * 45.0) * 0.5 + (Math.random() - 0.5)) * wiggle * 30.0 * (0.8 + centerLuma * 0.4) * (1.0 + snare * 0.7)
    : 0;
  const totalOffX = (wiggleX + syncH) % w;

  // Vertical CRT Rolling with seamless toroidal wraparound
  const rollSpeed = syncV * 400.0 * masterSpeed;
  const rollY = ((t * rollSpeed) % h + h) % h;

  ctx.save();

  // Full 2D Toroidal Wraparound: Draw tiles so horizontal/vertical rolling NEVER leaves black seams
  const normX = ((totalOffX % w) + w) % w;
  const normY = ((rollY % h) + h) % h;

  ctx.drawImage(sourceCanvas, normX - w, normY - h, w, h);
  ctx.drawImage(sourceCanvas, normX, normY - h, w, h);
  ctx.drawImage(sourceCanvas, normX - w, normY, w, h);
  ctx.drawImage(sourceCanvas, normX, normY, w, h);

  // Real Image Luma-Driven CRT Line Tearing
  if (wiggle > 0.08) {
    const tearSlices = Math.min(12, Math.floor(wiggle * 20));
    for (let s = 0; s < tearSlices; s++) {
      const sliceNormY = (Math.sin(t * 12.0 + s * 1.7) * 0.5 + 0.5);
      const lineLuma = sampleLumaAt(0.5, sliceNormY);
      // Bright luma transients lose horizontal deflection lock
      if (lineLuma > 0.45) {
        const tearY = Math.floor(sliceNormY * h);
        const tearH = Math.max(2, Math.floor((lineLuma - 0.45) * 14 * wiggle));
        const tearShift = (Math.sin(t * 30.0 + s * 3.3) * 20.0 + (Math.random() - 0.5) * 15.0) * wiggle;
        ctx.drawImage(sourceCanvas, 0, tearY, w, tearH, tearShift, tearY, w, tearH);
      }
    }
  }

  // RGB Split / Chromatic Aberration (Optical prism offset with screen blend)
  if (rgbSplit > 0) {
    const effSplit = rgbSplit * (1.0 + bass * 0.5);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    // Red Channel Pass (-effSplit)
    ctx.fillStyle = 'rgba(255, 20, 50, 0.40)';
    ctx.drawImage(sourceCanvas, normX - effSplit, normY, w, h);
    ctx.drawImage(sourceCanvas, normX - effSplit - w, normY, w, h);
    // Blue Channel Pass (+effSplit)
    ctx.fillStyle = 'rgba(0, 200, 255, 0.40)';
    ctx.drawImage(sourceCanvas, normX + effSplit, normY, w, h);
    ctx.drawImage(sourceCanvas, normX + effSplit - w, normY, w, h);
    ctx.restore();
  }

  // CRT Curvature Vignette
  if (curvature > 0.01) {
    ctx.save();
    const rad = ctx.createRadialGradient(w * 0.5, h * 0.5, Math.min(w, h) * 0.35, w * 0.5, h * 0.5, Math.max(w, h) * 0.72);
    rad.addColorStop(0, 'rgba(0,0,0,0)');
    rad.addColorStop(1, 'rgba(0,0,0,' + Math.min(0.85, curvature * 2.2).toFixed(2) + ')');
    ctx.fillStyle = rad;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  // CRT Scanlines
  if (scanlinesOp > 0.01 && scanlinesDens > 10) {
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, ' + scanlinesOp.toFixed(2) + ')';
    const step = Math.max(2, Math.floor(h / (scanlinesDens / 2)));
    for (let y = 0; y < h; y += step) {
      ctx.fillRect(0, y, w, 1.4);
    }
    ctx.restore();
  }

  // Tape Noise / Magnetic VHS Grain (Modulated by image dark zones)
  if (tapeNoise > 0.01) {
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, ' + (tapeNoise * 0.12).toFixed(3) + ')';
    for (let n = 0; n < 24; n++) {
      const ny = Math.floor(Math.random() * h);
      const nh = 1 + Math.floor(Math.random() * 3);
      ctx.fillRect(0, ny, w, nh);
    }
    ctx.restore();
  }

  ctx.restore();
}

// ----------------------------------------------------------------------------
// 4. RXXR TECHNO-ASCII GENERATOR - MATRIX CODE & SOBEL EDGE DETECT
// ----------------------------------------------------------------------------
function applyRxxr(ctx, sourceCanvas, w, h, t, bands, p, masterSpeed) {
  if (!p || !p.enabled) {
    ctx.drawImage(sourceCanvas, 0, 0, w, h);
    return;
  }

  const rawDensity = p.density !== undefined ? p.density : 10;
  if (rawDensity <= 0) {
    ctx.drawImage(sourceCanvas, 0, 0, w, h);
    return; // 0 density = clean bypass
  }

  const density = Math.max(4, rawDensity);
  const style = p.style || 'matrix_code';
  const edgeMode = Boolean(p.edge_mode);
  const edgeThreshold = p.edge_threshold !== undefined ? p.edge_threshold : 0.40;
  const expand = p.expand_markers !== undefined ? p.expand_markers : 0.35;
  const tint = p.tint || '#00ff88';

  // 1. Base input is inverted/removed to leave purely matrix pixels
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, w, h);

  // 2. Select Glyph Palette based on Style
  let glyphs = ['0', '1', 'ｱ', 'ｶ', 'ｻ', 'ﾀ', 'ﾅ', 'X', '9', '7', 'Z'];
  if (style === 'terminal_amber') glyphs = ['>', '_', '/', '\\', '$', '#', '@', '*', '~', '&'];
  else if (style === 'binary_hex') glyphs = ['0', '1', 'A', 'F', 'C', 'E', '4', 'B', 'D'];
  else if (style === 'glitch_blocks') glyphs = ['█', '▓', '▒', '░', '▀', '▄', '▌', '▐'];
  else if (style === 'wireframe_grid') glyphs = ['+', '┼', '─', '│', '┌', '┐', '└', '┘'];

  ctx.save();
  ctx.font = density + "px 'JetBrains Mono', monospace";

  const cols = Math.floor(w / density);
  const rows = Math.floor(h / density);
  const dx = 1.0 / 320.0;
  const dy = 1.0 / 180.0;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = c * density;
      const cy = r * density;
      const normX = Math.max(0, Math.min(1, (cx + density * 0.5) / w));
      const normY = Math.max(0, Math.min(1, (cy + density * 0.5) / h));

      // REAL IMAGE READING: Sample actual video frame pixels
      const pix = samplePixelAt(normX, normY);
      const luma = pix.luma;

      let glyphVal = 0.0;

      if (edgeMode) {
        // True spatial Sobel gradient magnitude on actual video pixels
        const lumL = sampleLumaAt(normX - dx, normY);
        const lumR = sampleLumaAt(normX + dx, normY);
        const lumT = sampleLumaAt(normX, normY - dy);
        const lumB = sampleLumaAt(normX, normY + dy);
        const edgeMag = Math.hypot(lumR - lumL, lumB - lumT) * 3.5;
        if (edgeMag < edgeThreshold) continue;
        glyphVal = edgeMag;
      } else {
        // Luminance-gated ASCII rendering
        if (luma < edgeThreshold) continue;
        glyphVal = luma;
      }

      const glyphIdx = Math.min(glyphs.length - 1, Math.floor(glyphVal * glyphs.length));
      const glyph = glyphs[glyphIdx];

      // Exact frame pixel color mapping
      ctx.fillStyle = `rgb(${pix.r}, ${pix.g}, ${pix.b})`;
      ctx.globalAlpha = Math.min(1.0, 0.40 + glyphVal * 0.60);
      ctx.fillText(glyph, cx, cy + density);

      // Cyber tactical bounding marker at high-contrast video contours
      if (expand > 0.05 && glyphVal > 0.65 && Math.random() < (0.05 * expand)) {
        ctx.strokeStyle = `rgb(${pix.r}, ${pix.g}, ${pix.b})`;
        ctx.lineWidth = 1;
        ctx.strokeRect(cx - 2, cy - 2, density * 2.4, density * 1.6);
      }
    }
  }

  ctx.restore();
}

// ----------------------------------------------------------------------------
// 5. MODULATION MATRIX (POR ZAEBECTS) - MODULAR SYNTH RF WAVES & CMYK PRINT
// ----------------------------------------------------------------------------
function applyModulationMatrix(ctx, sourceCanvas, w, h, t, bands, p, masterSpeed) {
  if (!p || !p.enabled) {
    ctx.drawImage(sourceCanvas, 0, 0, w, h);
    return;
  }

  const rawAmp = p.amplitude !== undefined ? p.amplitude : 24;
  const rawLines = p.lines_count !== undefined ? p.lines_count : 64;
  if (rawAmp <= 0 || rawLines <= 0) {
    ctx.drawImage(sourceCanvas, 0, 0, w, h);
    return; // 0 amplitude or 0 lines = clean bypass
  }

  const freq = p.frequency !== undefined ? p.frequency : 45;
  const phase = ((p.phase || 0) * Math.PI) / 180 + t * masterSpeed * 2.5;
  const amp = rawAmp;
  const lowpass = p.lowpass !== undefined ? p.lowpass : 0.35;
  const linesCount = Math.max(8, rawLines);
  const lineThickness = p.line_thickness !== undefined ? p.line_thickness : 1.4;
  const colorMode = p.color_mode || 'cmyk_misreg';
  const cmykOff = p.cmyk_offset !== undefined ? p.cmyk_offset : 8;
  const bass = Number(bands?.bass || 0.5);

  ctx.save();
  // Draw base image dimmed (0.32) to guarantee 100% solid full frame background
  ctx.drawImage(sourceCanvas, 0, 0, w, h);
  ctx.fillStyle = 'rgba(4, 5, 8, 0.65)';
  ctx.fillRect(0, 0, w, h);

  const lineStep = h / linesCount;

  function renderWaveLayer(strokeColor, offX, offY, blendMode) {
    ctx.save();
    ctx.globalCompositeOperation = blendMode;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = lineThickness;

    for (let i = 0; i < linesCount; i++) {
      const y0 = i * lineStep + offY;
      ctx.beginPath();
      let lastLuma = 0.5;

      for (let x = 0; x <= w; x += 6) {
        // REAL IMAGE READING: Sample luminance directly from actual video frame
        const normX = Math.max(0, Math.min(1, x / w));
        const normY = Math.max(0, Math.min(1, y0 / h));
        const rawLuma = sampleLumaAt(normX, normY);
        const luma = rawLuma * (1.0 - lowpass) + lastLuma * lowpass;
        lastLuma = luma;

        // RF carrier modulation driven by real video brightness
        const carrier = freq > 0 ? Math.sin(phase + normX * (freq * 0.4) * (0.3 + luma * 1.5)) : 1.0;
        const dy = carrier * amp * (luma - 0.2) * (0.8 + bass * 0.5);
        const px = x + offX;
        const py = y0 - dy;

        if (x === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  if (colorMode === 'cmyk_misreg') {
    renderWaveLayer('rgba(0, 240, 255, 0.85)', cmykOff, -cmykOff * 0.5, 'screen');     // Cyan
    renderWaveLayer('rgba(255, 0, 128, 0.85)', -cmykOff, cmykOff * 0.5, 'screen');     // Magenta
    renderWaveLayer('rgba(255, 230, 0, 0.85)', 0, cmykOff, 'screen');                  // Yellow
    renderWaveLayer('rgba(255, 255, 255, 0.70)', 0, 0, 'screen');                      // Key
  } else if (colorMode === 'joy_division') {
    renderWaveLayer('rgba(255, 255, 255, 0.95)', 0, 0, 'screen');
  } else if (colorMode === 'laser_topo') {
    renderWaveLayer('rgba(0, 255, 120, 0.95)', 0, 0, 'screen');
  } else if (colorMode === 'cyan_spectrum') {
    renderWaveLayer('rgba(0, 240, 255, 0.95)', 0, 0, 'screen');
  } else if (colorMode === 'amber_matrix') {
    renderWaveLayer('rgba(255, 184, 0, 0.95)', 0, 0, 'screen');
  } else {
    renderWaveLayer('rgba(0, 240, 255, 0.90)', 0, 0, 'screen');
  }

  ctx.restore();
}

// ----------------------------------------------------------------------------
// MASTER FX DISPATCHER PIPELINE
// ----------------------------------------------------------------------------
function applyFXEngine(ctx, sourceCanvas, w, h, t, fxState) {
  if (!fxState || !fxState.active) return;

  // Always update high-performance offscreen analysis buffer with live frame
  updateFrameAnalysis(sourceCanvas);

  let baseIntensity = fxState.masterIntensity !== undefined ? fxState.masterIntensity : 0.8;
  
  // masterSpeed is now a period in beats (0.5 to 32)
  const periodBeats = fxState.masterSpeed !== undefined ? fxState.masterSpeed : 4.0;
  const speedMult = 1.0 / periodBeats;
  let baseSpeed = speedMult * (appState.bpm / 60.0);

  if (fxState.auto_adapt) {
    if (appState.macro_state === 'BUILD') {
      baseIntensity *= (0.6 + (appState.buildup_likelihood || 0) * 0.8);
      baseSpeed *= (1.0 + (appState.buildup_likelihood || 0) * 1.5);
    } else if (appState.macro_state === 'DROP') {
      baseIntensity *= 1.25;
      baseSpeed *= 1.4;
    } else if (appState.macro_state === 'BREAK' || appState.macro_state === 'INTRO') {
      baseIntensity *= 0.45;
      baseSpeed *= 0.5;
    }
  }

  const intensity = Math.min(1.0, Math.max(0.0, baseIntensity));
  const speed = baseSpeed;
  if (intensity <= 0.001) return;

  // TEMPO-BASED POSTERIZE TIME (Elegant Quantization)
  let fxTime = t;
  const pb = appState.posterize_beats || 0;
  if (pb > 0) {
    const beatDuration = 60.0 / (appState.bpm || 124.0);
    const totalBeats = t / beatDuration;
    fxTime = Math.floor(totalBeats / pb) * pb * beatDuration;
  }

  const { auxCanvas, auxCtx } = getFxBuffers(w, h);
  auxCtx.clearRect(0, 0, w, h);

  const activeFx = fxState.activeEffect || 'pixel_stretch';
  const targetPlugin = fxState[activeFx];

  if (!targetPlugin || targetPlugin.enabled === false) return;

  if (activeFx === 'pixel_stretch') {
    applyPixelStretch(auxCtx, sourceCanvas, w, h, fxTime, appState.bands, targetPlugin, speed);
  } else if (activeFx === 'pixel_sorter') {
    applyPixelSorter(auxCtx, sourceCanvas, w, h, fxTime, appState.bands, targetPlugin, speed);
  } else if (activeFx === 'bad_tv') {
    applyBadTv(auxCtx, sourceCanvas, w, h, fxTime, appState.bands, targetPlugin, speed);
  } else if (activeFx === 'rxxr') {
    applyRxxr(auxCtx, sourceCanvas, w, h, fxTime, appState.bands, targetPlugin, speed);
  } else if (activeFx === 'modulation') {
    applyModulationMatrix(auxCtx, sourceCanvas, w, h, fxTime, appState.bands, targetPlugin, speed);
  } else {
    applyPixelStretch(auxCtx, sourceCanvas, w, h, fxTime, appState.bands, targetPlugin, speed);
  }

  // Draw Wet Output with Dry/Wet mix seamlessly covering (0, 0, w, h)
  ctx.save();
  ctx.globalAlpha = intensity;
  ctx.drawImage(auxCanvas, 0, 0, w, h);
  ctx.restore();
}
window.applyFXEngine = applyFXEngine;

// ============================================================================
// 7.2 FX UI INSPECTOR & AUTOPILOT CONTROLLERS
// ============================================================================

function selectFxPlugin(pluginId) {
  if (!appState.fx) return;
  appState.fx.activeEffect = pluginId;

  // Update card active classes
  document.querySelectorAll('.fx-plugin-card').forEach(card => {
    card.classList.toggle('active', card.id === 'card-fx-' + pluginId);
  });

  // Switch inspector subpanels (5 distinct panels)
  ['pixel_stretch', 'pixel_sorter', 'bad_tv', 'rxxr', 'modulation'].forEach(p => {
    const panel = document.getElementById('panel-fx-' + p);
    if (panel) panel.style.display = (p === pluginId) ? 'flex' : 'none';
  });
}
window.selectFxPlugin = selectFxPlugin;

function toggleFxModuleEnabled(pluginId, enabled) {
  if (!appState.fx || !appState.fx[pluginId]) return;
  appState.fx[pluginId].enabled = enabled;
  const chk = document.getElementById('chk-enable-' + pluginId);
  if (chk) chk.checked = enabled;
}
window.toggleFxModuleEnabled = toggleFxModuleEnabled;

function toggleFxMaster() {
  if (!appState.fx) return;
  appState.fx.active = !appState.fx.active;
  const btn = document.getElementById('btn-toggle-fx');
  const lbl = document.getElementById('lbl-fx-master-status');
  if (btn) btn.classList.toggle('active', appState.fx.active);
  if (lbl) lbl.textContent = appState.fx.active ? 'ON' : 'OFF';
}
window.toggleFxMaster = toggleFxMaster;

function toggleFxAutopilot(forceState = null) {
  if (!appState.fx) return;
  
  const isNowOn = forceState !== null ? forceState : !appState.fx.autopilotActive;
  appState.fx.autopilotActive = isNowOn;
  appState.autopilot_delegation.fx = isNowOn;
  
  if (isNowOn && !appState.fx.active) {
    appState.fx.active = true;
    const btnM = document.getElementById('btn-toggle-fx');
    const lblM = document.getElementById('lbl-fx-master-status');
    if (btnM) btnM.classList.add('active');
    if (lblM) lblM.textContent = 'ON';
  }
  
  const btn = document.getElementById('btn-toggle-fx-autopilot');
  const lbl = document.getElementById('lbl-fx-autopilot-status');
  if (btn) btn.classList.toggle('active', isNowOn);
  if (lbl) lbl.textContent = isNowOn ? 'ON' : 'OFF';

  const chk = document.getElementById('chk-delegate-fx');
  if (chk) chk.checked = isNowOn;
}
window.toggleFxAutopilot = toggleFxAutopilot;

function toggleMattesAutopilot(forceState = null) {
  const isNowOn = forceState !== null ? forceState : !appState.autopilot_delegation.mattes;
  appState.autopilot_delegation.mattes = isNowOn;
  
  const btn = document.getElementById('btn-toggle-mattes-autopilot');
  const lbl = document.getElementById('lbl-mattes-autopilot-status');
  if (btn) btn.classList.toggle('active', isNowOn);
  if (lbl) lbl.textContent = isNowOn ? 'ON' : 'OFF';

  const chk = document.getElementById('chk-delegate-mattes');
  if (chk) chk.checked = isNowOn;
}
window.toggleMattesAutopilot = toggleMattesAutopilot;

function loadPluginPreset(pluginId, presetName) {
  if (!appState.fx || !ROADMAP_PRESETS[pluginId] || !ROADMAP_PRESETS[pluginId][presetName]) return;
  const presetData = ROADMAP_PRESETS[pluginId][presetName];

  Object.assign(appState.fx[pluginId], presetData);

  // Sync UI controls for the active plugin
  if (pluginId === 'pixel_stretch') {
    const selDir = document.getElementById('sel-ps-direction');
    if (selDir) selDir.value = String(presetData.direction);
    updatePixelStretchParam('direction', presetData.direction);

    const selSrc = document.getElementById('sel-ps-source');
    if (selSrc) selSrc.value = presetData.source;

    const selCh = document.getElementById('sel-ps-channels');
    if (selCh) selCh.value = presetData.channels;

    const selCrv = document.getElementById('sel-ps-curve');
    if (selCrv) selCrv.value = presetData.curve;

    const rngTh = document.getElementById('rng-ps-threshold');
    if (rngTh) rngTh.value = Math.round(presetData.threshold * 100);
    updatePixelStretchParam('threshold', presetData.threshold);

    const rngInt = document.getElementById('rng-ps-intensity');
    if (rngInt) rngInt.value = Math.round(presetData.intensity * 100);
    updatePixelStretchParam('intensity', presetData.intensity);

    const rngLen = document.getElementById('rng-ps-length');
    if (rngLen) rngLen.value = presetData.length;
    updatePixelStretchParam('length', presetData.length);

    const rngPx = document.getElementById('rng-ps-pixelsize');
    if (rngPx) rngPx.value = presetData.pixel_size;
    updatePixelStretchParam('pixel_size', presetData.pixel_size);

    const rngSm = document.getElementById('rng-ps-smooth');
    if (rngSm) rngSm.value = Math.round(presetData.smoothness * 10);
    updatePixelStretchParam('smoothness', presetData.smoothness);

    const rngOff = document.getElementById('rng-ps-offset');
    if (rngOff) rngOff.value = Math.round(presetData.start_offset * 100);
    updatePixelStretchParam('start_offset', presetData.start_offset);
  } else if (pluginId === 'pixel_sorter') {
    const rngAng = document.getElementById('rng-psort-angle');
    if (rngAng) rngAng.value = presetData.angle;
    updatePixelSorterParam('angle', presetData.angle);

    const rngMin = document.getElementById('rng-psort-thresh-min');
    if (rngMin) rngMin.value = Math.round(presetData.threshold_min * 100);
    updatePixelSorterParam('threshold_min', presetData.threshold_min);

    const rngMax = document.getElementById('rng-psort-thresh-max');
    if (rngMax) rngMax.value = Math.round(presetData.threshold_max * 100);
    updatePixelSorterParam('threshold_max', presetData.threshold_max);

    const rngLen = document.getElementById('rng-psort-length');
    if (rngLen) rngLen.value = presetData.length;
    updatePixelSorterParam('length', presetData.length);

    const rngNoise = document.getElementById('rng-psort-noise');
    if (rngNoise) rngNoise.value = Math.round(presetData.random_noise * 100);
    updatePixelSorterParam('random_noise', presetData.random_noise);

    const selSort = document.getElementById('sel-psort-sortmode');
    if (selSort) selSort.value = presetData.sorting_mode;

    const selMask = document.getElementById('sel-psort-mask');
    if (selMask) selMask.value = presetData.mask;

    setPixelSorterStretchMode(presetData.stretch_mode);
  } else if (pluginId === 'bad_tv') {
    const rngCurv = document.getElementById('rng-tv-curvature');
    if (rngCurv) rngCurv.value = Math.round(presetData.tv_curvature * 100);
    updateBadTvParam('tv_curvature', presetData.tv_curvature);

    const rngSyncV = document.getElementById('rng-tv-sync-v');
    if (rngSyncV) rngSyncV.value = Math.round(presetData.tv_warp_sync_v * 100);
    updateBadTvParam('tv_warp_sync_v', presetData.tv_warp_sync_v);

    const rngSyncH = document.getElementById('rng-tv-sync-h');
    if (rngSyncH) rngSyncH.value = presetData.tv_warp_sync_h;
    updateBadTvParam('tv_warp_sync_h', presetData.tv_warp_sync_h);

    const rngWig = document.getElementById('rng-tv-wiggle');
    if (rngWig) rngWig.value = Math.round(presetData.tv_warp_wiggle * 100);
    updateBadTvParam('tv_warp_wiggle', presetData.tv_warp_wiggle);

    const rngScanOp = document.getElementById('rng-tv-scan-op');
    if (rngScanOp) rngScanOp.value = Math.round(presetData.tv_scanlines_opacity * 100);
    updateBadTvParam('tv_scanlines_opacity', presetData.tv_scanlines_opacity);

    const rngScanDens = document.getElementById('rng-tv-scan-dens');
    if (rngScanDens) rngScanDens.value = presetData.tv_scanlines_density;
    updateBadTvParam('tv_scanlines_density', presetData.tv_scanlines_density);

    const rngSplit = document.getElementById('rng-tv-split');
    if (rngSplit) rngSplit.value = presetData.tv_rgb_split;
    updateBadTvParam('tv_rgb_split', presetData.tv_rgb_split);

    const rngNoise = document.getElementById('rng-tv-noise');
    if (rngNoise) rngNoise.value = Math.round(presetData.tv_tape_noise * 100);
    updateBadTvParam('tv_tape_noise', presetData.tv_tape_noise);
  } else if (pluginId === 'rxxr') {
    const selSty = document.getElementById('sel-rxxr-style');
    if (selSty) selSty.value = presetData.style;
    updateRxxrParam('style', presetData.style);

    const rngDens = document.getElementById('rng-rxxr-density');
    if (rngDens) rngDens.value = presetData.density;
    updateRxxrParam('density', presetData.density);

    const chkEdge = document.getElementById('chk-rxxr-edge');
    if (chkEdge) chkEdge.checked = presetData.edge_mode;
    updateRxxrParam('edge_mode', presetData.edge_mode);

    const rngTh = document.getElementById('rng-rxxr-edgethresh');
    if (rngTh) rngTh.value = Math.round(presetData.edge_threshold * 100);
    updateRxxrParam('edge_threshold', presetData.edge_threshold);

    const rngExp = document.getElementById('rng-rxxr-expand');
    if (rngExp) rngExp.value = Math.round(presetData.expand_markers * 100);
    updateRxxrParam('expand_markers', presetData.expand_markers);

    const selTint = document.getElementById('sel-rxxr-tint');
    if (selTint) selTint.value = presetData.tint;
    updateRxxrParam('tint', presetData.tint);
  } else if (pluginId === 'modulation') {
    const selClr = document.getElementById('sel-mod-colormode');
    if (selClr) selClr.value = presetData.color_mode;
    updateModulationParam('color_mode', presetData.color_mode);

    const rngFreq = document.getElementById('rng-mod-freq');
    if (rngFreq) rngFreq.value = presetData.frequency;
    updateModulationParam('frequency', presetData.frequency);

    const rngAmp = document.getElementById('rng-mod-amp');
    if (rngAmp) rngAmp.value = presetData.amplitude;
    updateModulationParam('amplitude', presetData.amplitude);

    const rngLines = document.getElementById('rng-mod-lines');
    if (rngLines) rngLines.value = presetData.lines_count;
    updateModulationParam('lines_count', presetData.lines_count);

    const rngThick = document.getElementById('rng-mod-thickness');
    if (rngThick) rngThick.value = Math.round(presetData.line_thickness * 10);
    updateModulationParam('line_thickness', presetData.line_thickness);

    const rngLp = document.getElementById('rng-mod-lowpass');
    if (rngLp) rngLp.value = Math.round(presetData.lowpass * 100);
    updateModulationParam('lowpass', presetData.lowpass);
  }
}
window.loadPluginPreset = loadPluginPreset;

function selectFxAutopilotPreset(presetName) {
  if (!appState.fx) return;
  appState.fx.autopilotPreset = presetName;

  document.querySelectorAll('.fx-auto-pill').forEach(pill => {
    pill.classList.toggle('active', pill.dataset.preset === presetName);
  });

  applyFxAutopilotPreset(presetName);
}
window.selectFxAutopilotPreset = selectFxAutopilotPreset;

function applyFxAutopilotPreset(presetName) {
  if (!appState.fx) return;

  if (presetName === 'ambient_drift') {
    appState.fx.active = true;
    selectFxPlugin('bad_tv');
    loadPluginPreset('bad_tv', 'subdued_vhs');
    appState.fx.masterIntensity = 0.65;
  } else if (presetName === 'pixel_melt_drop') {
    appState.fx.active = true;
    selectFxPlugin('pixel_sorter');
    loadPluginPreset('pixel_sorter', 'glitch_waterfall');
    appState.fx.masterIntensity = 0.85;
  } else if (presetName === 'cyber_matrix') {
    appState.fx.active = true;
    selectFxPlugin('rxxr');
    loadPluginPreset('rxxr', 'cyberpunk_tracer');
    appState.fx.masterIntensity = 0.75;
  } else if (presetName === 'satori_stretch') {
    appState.fx.active = true;
    selectFxPlugin('pixel_stretch');
    loadPluginPreset('pixel_stretch', 'cinematic_anamorphic');
    appState.fx.masterIntensity = 0.80;
  } else if (presetName === 'zaebects_cmyk') {
    appState.fx.active = true;
    selectFxPlugin('modulation');
    loadPluginPreset('modulation', 'offset_cmyk');
    appState.fx.masterIntensity = 0.80;
  } else if (presetName === 'bypass_clean') {
    appState.fx.active = false;
  }

  updateFxUI();
}

function setFxMasterParam(param, val) {
  if (!appState.fx) return;
  appState.fx[param] = val;
  if (param === 'masterIntensity') {
    const lbl = document.getElementById('val-fx-intensity');
    if (lbl) lbl.textContent = Math.round(val * 100) + '%';
  } else if (param === 'masterSpeed') {
    const lbl = document.getElementById('val-fx-speed');
    if (lbl) lbl.textContent = Number(val).toFixed(1) + 'x';
  } else if (param === 'target') {
    console.log('[PENUMBRA FX] Target Routing alterado para: ' + String(val).toUpperCase());
  }
}
window.setFxMasterParam = setFxMasterParam;

function updatePixelStretchParam(param, val) {
  if (!appState.fx) return;
  appState.fx.pixel_stretch[param] = val;
  if (param === 'direction') {
    const lbl = document.getElementById('val-ps-direction');
    if (lbl) lbl.textContent = val + '°';
    const ptr = document.getElementById('ptr-ps-direction');
    if (ptr) ptr.style.transform = 'rotate(' + val + 'deg)';
  } else if (param === 'intensity') {
    const lbl = document.getElementById('val-ps-intensity');
    if (lbl) lbl.textContent = Math.round(val * 100) + '%';
  } else if (param === 'threshold') {
    const lbl = document.getElementById('val-ps-threshold');
    if (lbl) lbl.textContent = Math.round(val * 100) + '%';
  } else if (param === 'length') {
    const lbl = document.getElementById('val-ps-length');
    if (lbl) lbl.textContent = val + 'px';
  } else if (param === 'pixel_size') {
    const lbl = document.getElementById('val-ps-pixelsize');
    if (lbl) lbl.textContent = val + 'px';
  } else if (param === 'smoothness') {
    const lbl = document.getElementById('val-ps-smooth');
    if (lbl) lbl.textContent = Number(val).toFixed(1);
  } else if (param === 'start_offset') {
    const lbl = document.getElementById('val-ps-offset');
    if (lbl) lbl.textContent = Math.round(val * 100) + '%';
  } else {
    const lbl = document.getElementById('val-ps-' + param);
    if (lbl) lbl.textContent = String(val).toUpperCase();
  }
}
window.updatePixelStretchParam = updatePixelStretchParam;

function updatePixelSorterParam(param, val) {
  if (!appState.fx) return;
  appState.fx.pixel_sorter[param] = val;
  if (param === 'threshold_min') {
    const lbl = document.getElementById('val-psort-thresh-min');
    if (lbl) lbl.textContent = Math.round(val * 100) + '%';
  } else if (param === 'threshold_max') {
    const lbl = document.getElementById('val-psort-thresh-max');
    if (lbl) lbl.textContent = Math.round(val * 100) + '%';
  } else if (param === 'angle') {
    const lbl = document.getElementById('val-psort-angle');
    if (lbl) lbl.textContent = val + '°';
    const ptr = document.getElementById('ptr-psort-angle');
    if (ptr) ptr.style.transform = 'rotate(' + val + 'deg)';
  } else if (param === 'length') {
    const lbl = document.getElementById('val-psort-length');
    if (lbl) lbl.textContent = val + 'px';
  } else if (param === 'noise_scale') {
    const lbl = document.getElementById('val-psort-nscale');
    if (lbl) lbl.textContent = val;
  } else if (param === 'random_noise') {
    const lbl = document.getElementById('val-psort-noise');
    if (lbl) lbl.textContent = Math.round(val * 100) + '%';
  } else if (param === 'sorting_mode') {
    const lbl = document.getElementById('val-psort-sortmode');
    if (lbl) lbl.textContent = String(val).toUpperCase();
  } else if (param === 'mask') {
    const lbl = document.getElementById('val-psort-mask');
    if (lbl) lbl.textContent = String(val).toUpperCase();
  }
}
window.updatePixelSorterParam = updatePixelSorterParam;

function setPixelSorterMode(mode) {
  if (!appState.fx) return;
  appState.fx.pixel_sorter.mode = mode;
  document.getElementById('btn-psort-mode-simple')?.classList.toggle('active', mode === 'simple');
  document.getElementById('btn-psort-mode-adv')?.classList.toggle('active', mode === 'advanced');
  const lbl = document.getElementById('val-psort-mode');
  if (lbl) lbl.textContent = mode.toUpperCase();
}
window.setPixelSorterMode = setPixelSorterMode;

function setPixelSorterStretchMode(isStretch) {
  if (!appState.fx) return;
  appState.fx.pixel_sorter.stretch_mode = isStretch;
  document.getElementById('btn-psort-type-sort')?.classList.toggle('active', !isStretch);
  document.getElementById('btn-psort-type-stretch')?.classList.toggle('active', isStretch);
  const lbl = document.getElementById('val-psort-typemode');
  if (lbl) lbl.textContent = isStretch ? 'STRETCH ORIGINAL' : 'SORT PIXELS';
}
window.setPixelSorterStretchMode = setPixelSorterStretchMode;

function updateBadTvParam(param, val) {
  if (!appState.fx) return;
  appState.fx.bad_tv[param] = val;
  if (param === 'tv_curvature') {
    const lbl = document.getElementById('val-tv-curvature');
    if (lbl) lbl.textContent = Math.round(val * 100) + '%';
  } else if (param === 'tv_warp_sync_v') {
    const lbl = document.getElementById('val-tv-sync-v');
    if (lbl) lbl.textContent = Math.round(val * 100) + '%';
  } else if (param === 'tv_warp_sync_h') {
    const lbl = document.getElementById('val-tv-sync-h');
    if (lbl) lbl.textContent = val + 'px';
  } else if (param === 'tv_warp_wiggle') {
    const lbl = document.getElementById('val-tv-wiggle');
    if (lbl) lbl.textContent = Math.round(val * 100) + '%';
  } else if (param === 'tv_scanlines_opacity') {
    const lbl = document.getElementById('val-tv-scan-op');
    if (lbl) lbl.textContent = Math.round(val * 100) + '%';
  } else if (param === 'tv_scanlines_density') {
    const lbl = document.getElementById('val-tv-scan-dens');
    if (lbl) lbl.textContent = val;
  } else if (param === 'tv_rgb_split') {
    const lbl = document.getElementById('val-tv-split');
    if (lbl) lbl.textContent = val + 'px';
  } else if (param === 'tv_tape_noise') {
    const lbl = document.getElementById('val-tv-noise');
    if (lbl) lbl.textContent = Math.round(val * 100) + '%';
  }
}
window.updateBadTvParam = updateBadTvParam;

function updateRxxrParam(param, val) {
  if (!appState.fx) return;
  appState.fx.rxxr[param] = val;
  if (param === 'style') {
    const lbl = document.getElementById('val-rxxr-style');
    if (lbl) lbl.textContent = String(val).toUpperCase();
  } else if (param === 'density') {
    const lbl = document.getElementById('val-rxxr-density');
    if (lbl) lbl.textContent = val + 'px';
  } else if (param === 'edge_mode') {
    const lbl = document.getElementById('val-rxxr-edge');
    if (lbl) lbl.textContent = val ? 'ATIVO (ARESTAS)' : 'TOTAL';
  } else if (param === 'edge_threshold') {
    const lbl = document.getElementById('val-rxxr-edgethresh');
    if (lbl) lbl.textContent = Math.round(val * 100) + '%';
  } else if (param === 'expand_markers') {
    const lbl = document.getElementById('val-rxxr-expand');
    if (lbl) lbl.textContent = Math.round(val * 100) + '%';
  } else if (param === 'tint') {
    const lbl = document.getElementById('val-rxxr-tint');
    if (lbl) lbl.textContent = val === '#00ff88' ? 'MATRIX GREEN' : (val === '#ffb800' ? 'AMBER CRT' : (val === '#00f0ff' ? 'CYAN' : 'MONO'));
  }
}
window.updateRxxrParam = updateRxxrParam;

function updateModulationParam(param, val) {
  if (!appState.fx) return;
  appState.fx.modulation[param] = val;
  if (param === 'frequency') {
    const lbl = document.getElementById('val-mod-freq');
    if (lbl) lbl.textContent = val;
  } else if (param === 'phase') {
    const lbl = document.getElementById('val-mod-phase');
    if (lbl) lbl.textContent = val + '°';
  } else if (param === 'amplitude') {
    const lbl = document.getElementById('val-mod-amp');
    if (lbl) lbl.textContent = val + 'px';
  } else if (param === 'lowpass') {
    const lbl = document.getElementById('val-mod-lowpass');
    if (lbl) lbl.textContent = Math.round(val * 100) + '%';
  } else if (param === 'lines_count') {
    const lbl = document.getElementById('val-mod-lines');
    if (lbl) lbl.textContent = val;
  } else if (param === 'line_thickness') {
    const lbl = document.getElementById('val-mod-thickness');
    if (lbl) lbl.textContent = Number(val).toFixed(1) + 'px';
  } else if (param === 'color_mode') {
    const lbl = document.getElementById('val-mod-colormode');
    if (lbl) lbl.textContent = String(val).toUpperCase();
  } else if (param === 'cmyk_offset') {
    const lbl = document.getElementById('val-mod-cmyk-offset');
    if (lbl) lbl.textContent = val + 'px';
  }
}
window.updateModulationParam = updateModulationParam;

function updateFxUI() {
  if (!appState.fx) return;
  const fx = appState.fx;

  // Master & Autopilot buttons
  const btnM = document.getElementById('btn-toggle-fx');
  const lblM = document.getElementById('lbl-fx-master-status');
  if (btnM) btnM.classList.toggle('active', fx.active);
  if (lblM) lblM.textContent = fx.active ? 'ON' : 'OFF';

  const btnAuto = document.getElementById('btn-toggle-fx-autopilot');
  const lblAuto = document.getElementById('lbl-fx-autopilot-status');
  if (btnAuto) btnAuto.classList.toggle('active', fx.autopilotActive);
  if (lblAuto) lblAuto.textContent = fx.autopilotActive ? 'ON' : 'OFF';

  // Target Routing Select
  const selTarget = document.getElementById('sel-fx-target');
  if (selTarget) selTarget.value = fx.target || 'master';

  // Master Sliders
  const sliInt = document.getElementById('slider-fx-intensity');
  const valInt = document.getElementById('val-fx-intensity');
  if (sliInt) sliInt.value = Math.round((fx.masterIntensity || 0.8) * 100);
  if (valInt) valInt.textContent = Math.round((fx.masterIntensity || 0.8) * 100) + '%';

  const sliSpd = document.getElementById('slider-fx-speed');
  const valSpd = document.getElementById('val-fx-speed');
  if (sliSpd) sliSpd.value = Math.round((fx.masterSpeed || 1.0) * 100);
  if (valSpd) valSpd.textContent = Number(fx.masterSpeed || 1.0).toFixed(1) + 'x';

  // Autopilot Presets Pills
  document.querySelectorAll('.fx-auto-pill').forEach(pill => {
    pill.classList.toggle('active', pill.dataset.preset === fx.autopilotPreset);
  });

  // Active effect selection
  selectFxPlugin(fx.activeEffect || 'pixel_stretch');
}
window.updateFxUI = updateFxUI;

// ----------------------------------------------------------------------------
// UNIVERSAL PARAMETER RESET (DAW / NLE INDUSTRY STANDARD)
// ----------------------------------------------------------------------------
function resetFxParam(pluginId, paramName, defaultVal, sliderId) {
  if (!appState.fx) return;

  if (sliderId) {
    const sl = document.getElementById(sliderId);
    if (sl) {
      sl.value = defaultVal;
      sl.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
  }

  if (appState.fx[pluginId]) {
    appState.fx[pluginId][paramName] = defaultVal;
  }

  if (pluginId === 'pixel_stretch') updatePixelStretchParam(paramName, defaultVal);
  else if (pluginId === 'pixel_sorter') updatePixelSorterParam(paramName, defaultVal);
  else if (pluginId === 'bad_tv') updateBadTvParam(paramName, defaultVal);
  else if (pluginId === 'rxxr') updateRxxrParam(paramName, defaultVal);
  else if (pluginId === 'modulation') updateModulationParam(paramName, defaultVal);
}
window.resetFxParam = resetFxParam;

// ----------------------------------------------------------------------------
// FOCUS PROGRAM LAYOUT TOGGLE (EXPANDED STAGE MONITOR > 35% SCREEN)
// ----------------------------------------------------------------------------
function toggleProgramFocus(forceVal = null) {
  const isCurrentlyFocus = document.body.classList.contains('layout-focus-program');
  const targetVal = forceVal !== null ? Boolean(forceVal) : !isCurrentlyFocus;
  document.body.classList.toggle('layout-focus-program', targetVal);
  const btn = document.getElementById('btn-prg-focus');
  if (btn) btn.classList.toggle('active', targetVal);
  console.log(`[PENUMBRA COCKPIT] Layout Foco Program: ${targetVal ? 'ATIVADO (>35% tela)' : 'DESATIVADO (Dual Monitor 50/50)'}`);
}
window.toggleProgramFocus = toggleProgramFocus;

// Musical Autopilot Engine for FX
function runFxAutopilotEngine() {
  if (!appState.fx || !appState.fx.autopilotActive) return;

  const totalBars = appState.phrase?.total_bars || 1;
  const barsElapsed = totalBars - (appState.fx.lastAutopilotChangeBar || 0);

  // Musical Section Awareness - respects 32-64 bar structures
  if (appState.macro_state === 'DROP' && appState.fx.autopilotPreset !== 'pixel_melt_drop') {
    appState.fx.lastAutopilotChangeBar = totalBars;
    selectFxAutopilotPreset('pixel_melt_drop');
  } else if (appState.macro_state === 'BUILD' && appState.fx.autopilotPreset !== 'satori_stretch') {
    appState.fx.lastAutopilotChangeBar = totalBars;
    selectFxAutopilotPreset('satori_stretch');
  } else if ((appState.macro_state === 'BREAK' || appState.macro_state === 'INTRO') && barsElapsed >= 32) {
    appState.fx.lastAutopilotChangeBar = totalBars;
    const chillPresets = ['ambient_drift', 'cyber_matrix', 'zaebects_cmyk'];
    const nextP = chillPresets[Math.floor(Math.random() * chillPresets.length)];
    selectFxAutopilotPreset(nextP);
  }
}
window.runFxAutopilotEngine = runFxAutopilotEngine;


// ============================================================================
// 8. INTELLIGENT AUTOPILOT WITH 15-CLIP ANTI-REPETITION FIFO
// ============================================================================
let lastAutopilotBar = 0;
let lastAutopilotState = null;
let lastDropTriggered = false;

function runAutopilotEngine() {
  // Musical Autopilot for FX Engine
  runFxAutopilotEngine();

  if (!appState.auto_mode) return;

  const p = appState.phrase;
  const currentBar = p.current_bar;
  const currentBeat = p.current_beat;
  const totalBars = p.total_bars || 1;
  const del = appState.autopilot_delegation || { media: true, mattes: false, fx: false, kinetics: true };

  // Human-in-the-Loop Operator Macro-State Override
  if (appState.manual_forced_state) {
    appState.macro_state = appState.manual_forced_state;
    if (currentBeat === 1 && currentBar === 1 && totalBars !== lastAutopilotBar) {
      if (appState.manual_forced_bars > 0) {
        appState.manual_forced_bars--;
        if (appState.manual_forced_bars === 0) {
          appState.manual_forced_state = null;
          showMacroToast('🤖 AUTOPILOT: RETOMANDO CONDUÇÃO AUTÔNOMA');
        }
      }
    }
  }

  const buildup = Number(appState.buildup_likelihood) || 0;
  const drop = Number(appState.drop_likelihood) || 0;
  const stateChanged = (appState.macro_state !== lastAutopilotState);
  if (stateChanged) {
    lastAutopilotState = appState.macro_state;
  }
  const isEnteringDrop = (appState.macro_state === 'DROP' && stateChanged);

  // 1. MEDIA PROGRESSION DELEGATION
  if (del.media) {
    const minBarsInterval = Math.max(8, Number(appState.autopilot_min_bars) || 16);
    const barsSinceLastTake = totalBars - (appState.last_take_total_bar || 0);
    
    // Auto Cycle on Downbeat
    if (currentBar === 1 && currentBeat === 1 && totalBars > 1) {
      if (barsSinceLastTake >= minBarsInterval && lastAutopilotBar !== totalBars && !isAutoTransitioning) {
        lastAutopilotBar = totalBars;
        appState.last_take_total_bar = totalBars;
        
        // Evolve matte policy if enabled
        if (del.mattes && appState.autopilot_matte_policy === 'evolve') {
          evolveMatteHarmoniously();
        }
        startAutoTransition();
      }
    }

    // Auto Drop Take (Hard Cut on Climax)
    if (isEnteringDrop && currentBeat === 1 && !lastDropTriggered && !isAutoTransitioning) {
      if (barsSinceLastTake >= 8) {
        lastDropTriggered = true;
        appState.last_take_total_bar = totalBars;
        executeTakeCommit();
      }
    } else if (appState.macro_state !== 'DROP') {
      lastDropTriggered = false;
    }
  }

  // 2. MATTE ORCHESTRATION DELEGATION
  if (del.mattes) {
    if (isEnteringDrop) {
      evolveMatteHarmoniously();
    }
  }

  // 3. FX OVERDRIVE DELEGATION
  if (del.fx) {
    // Ramp FX intensity during BUILD
    if (appState.macro_state === 'BUILD') {
       if (appState.fx && appState.fx.active) {
         appState.fx.masterIntensity = Math.min(1.0, 0.4 + buildup * 0.6);
       }
    }

    // Arm Accent Layer
    if (appState.macro_state === 'DROP' || drop > 0.8) {
      if (appState.layers.layer1.opacity < 0.7) {
        appState.layers.layer1.opacity = 0.85;
        sendAction('set_layer_param', { layer: 'layer1', param: 'opacity', value: 0.85 });
      }
    } else {
      if (appState.layers.layer1.opacity > 0) {
        appState.layers.layer1.opacity = 0;
        sendAction('set_layer_param', { layer: 'layer1', param: 'opacity', value: 0 });
      }
    }
  }

  // 4. KINETICS & BLENDS DELEGATION
  if (del.kinetics) {
    if (appState.matte && appState.matte.deform && appState.kinematics_auto !== false) {
      applyMacroStateAesthetics(appState.macro_state || 'GROOVE');
    }

    // Posterize Time Quantization Narrative Rules
    if (appState.macro_state === 'DROP' && drop > 0.8) {
      appState.posterize_beats = 4; // Staccato 4 beats
    } else if (appState.macro_state === 'GROOVE') {
      appState.posterize_beats = 0; // Smooth
    }
  }
}

function evolveMatteHarmoniously() {
  if (!allMattes || allMattes.length === 0) return;
  
  const state = appState.macro_state || 'GROOVE';
  const soft = allMattes.filter(m => m.category === 'SOFT' || m.name.toLowerCase().includes('soft'));
  const geo = allMattes.filter(m => m.category === 'GEO' || m.name.toLowerCase().includes('geo'));
  const proc = allMattes.filter(m => m.category === 'PROCEDURAL' || m.name.toLowerCase().includes('proc'));

  // Escolhas estéticas dependentes da energia (Macro State)
  if (state === 'DROP' || state === 'PEAK') {
    // Clímax: Cortes geométricos agressivos. L0 e L4 casados para pulsação incisiva.
    if (geo.length > 0) {
      const picked = geo[Math.floor(Math.random() * geo.length)];
      appState.layers.layer0.matte = picked.path;
      appState.layers.layer4.matte = picked.path;
      appState.master_matte = 'none'; // Limpa global para dar destaque à geometria local
    }
  } else if (state === 'BUILD') {
    // Tensão crescente: Procedural patterns criando complexidade progressiva no preview (L3) e no drop accent (L4).
    if (proc.length > 0) {
      const picked = proc[Math.floor(Math.random() * proc.length)];
      appState.layers.layer3.matte = picked.path;
      appState.layers.layer4.matte = picked.path;
      appState.layers.layer0.matte = 'none';
      appState.master_matte = 'none';
    }
  } else {
    // GROOVE / INTRO / BREAK: Elementos orgânicos, penumbras suaves, vinhetas sutis.
    if (soft.length > 0) {
      const picked = soft[Math.floor(Math.random() * soft.length)];
      appState.layers.layer3.matte = picked.path;
      if (Math.random() > 0.5) {
        appState.layers.layer0.matte = picked.path;
        appState.master_matte = 'none';
      } else {
        appState.layers.layer0.matte = 'none';
        appState.master_matte = picked.path;
      }
    }
  }

  updateMatteRibbonActiveStatus();
  renderMattesCards();
}

function setAutopilotBars(bars) {
  const num = Math.max(8, Number(bars));
  appState.autopilot_bars = num;
  appState.autopilot_min_bars = num;
  setPhraseLength(num);
  document.querySelectorAll('#group-conductor-bars .conductor-btn, #group-cfg-min-bars .conductor-btn, .cfg-bars-btn').forEach(btn => {
    btn.classList.toggle('active', Number(btn.dataset.bars) === num);
  });
  const lblCfg = document.getElementById('lbl-cfg-min-bars');
  if (lblCfg) lblCfg.textContent = `${num} BARS (${num === 16 ? 'PADRÃO' : '~' + Math.round(num * 1.93) + 's'})`;
}
window.setAutopilotBars = setAutopilotBars;

function setAutopilotTransMode(mode) {
  selectedTransitionMode = mode;
  document.querySelectorAll('#group-conductor-mode .conductor-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });
  document.querySelectorAll('.trans-mode-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });
}
window.setAutopilotTransMode = setAutopilotTransMode;

function setAutopilotDuration(dur) {
  selectedTransitionRate = Number(dur);
  currentTransitionDuration = Number(dur);
  document.querySelectorAll('#group-conductor-dur .conductor-btn').forEach(btn => {
    btn.classList.toggle('active', Number(btn.dataset.dur) === Number(dur));
  });
  document.querySelectorAll('.trans-rate-btn').forEach(btn => {
    btn.classList.toggle('active', Number(btn.dataset.rate) === Number(dur));
  });
}
window.setAutopilotDuration = setAutopilotDuration;

function setAutopilotMattePolicy(policy) {
  appState.autopilot_matte_policy = policy;
  document.querySelectorAll('#group-conductor-matte .conductor-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.policy === policy);
  });
}
window.setAutopilotMattePolicy = setAutopilotMattePolicy;

function advanceSmartQueue(targetState = null) {
  if (!allClips || allClips.length === 0) return;

  const stateToUse = targetState || appState.macro_state || 'GROOVE';
  // Select next clip considering musical state and strict anti-repetition FIFO
  const available = allClips.filter(c => !playedClipsHistory.includes(c.id));
  const candidatePool = available.length > 0 ? available : allClips;

  // Context-aware selection based on macro state
  let filteredCandidates = candidatePool;
  if (stateToUse === 'INTRO' || stateToUse === 'BREAK') {
    filteredCandidates = candidatePool.filter(c => c.category === 'MINIMAL' || c.category === 'ABSTRACT');
  } else if (stateToUse === 'BUILD') {
    filteredCandidates = candidatePool.filter(c => c.category === 'ABSTRACT' || c.category === 'FIGURA');
  } else if (stateToUse === 'DROP') {
    filteredCandidates = candidatePool.filter(c => c.category === 'DENSE' || c.category === 'CHROMA' || c.is_generative);
  } else if (stateToUse === 'GROOVE') {
    filteredCandidates = candidatePool.filter(c => c.category !== 'DENSE');
  }
  if (!filteredCandidates || filteredCandidates.length === 0) filteredCandidates = candidatePool;

  const nextClip = filteredCandidates[Math.floor(Math.random() * filteredCandidates.length)] || allClips[0];

  // Push to FIFO history
  playedClipsHistory.push(nextClip.id);
  if (playedClipsHistory.length > 15) playedClipsHistory.shift();

  // Shift queue
  queueList.shift();
  queueList.push({
    slot: '+24 BARS',
    clipId: nextClip.id,
    name: nextClip.filename,
    layer: 'L3',
    matte: 'none',
    beatsRemaining: 96,
    status: 'EM 96 BEATS'
  });

  // Re-label slots
  queueList[0].slot = 'CUE ATUAL';
  queueList[0].status = 'ARMADO';
  if (queueList[1]) { queueList[1].slot = '+8 BARS'; queueList[1].status = 'EM 32 BEATS'; }
  if (queueList[2]) { queueList[2].slot = '+16 BARS'; queueList[2].status = 'EM 64 BEATS'; }

  // Assign cue to Layer 3 (Preview Cue)
  appState.layers.layer3.clipId = queueList[0].clipId;
  appState.layers.layer3.name = queueList[0].name;

  sendAction('cue_clip', {
    layer: 'layer3',
    clipId: queueList[0].clipId,
    name: queueList[0].name
  });

  updateUI();
  syncVideoSources();
  renderQueueCards();
  updateAntiRepeatBadge();
}

function executeTakeCommit() {
  const queuedClipId = appState.layers.layer3.clipId;
  const queuedName = appState.layers.layer3.name;
  const queuedMatte = appState.layers.layer3.matte;
  const queuedMatteInvert = appState.layers.layer3.matte_invert;
  const queuedRotation = appState.layers.layer3.rotation;
  const queuedFitMode = appState.layers.layer3.fit_mode;

  if (queuedClipId) {
    // 1. Promote Deck B to Deck A (Transfer clip, name, matte, matte_invert, rotation, fit_mode)
    appState.layers.layer0.clipId = queuedClipId;
    appState.layers.layer0.name = queuedName;
    appState.layers.layer0.matte = queuedMatte || 'none';
    appState.layers.layer0.matte_invert = queuedMatteInvert || false;
    appState.layers.layer0.rotation = queuedRotation || 0;
    appState.layers.layer0.fit_mode = queuedFitMode || 'fill';

    // 2. SEAMLESS ZERO-GLITCH PLAYER SWAP:
    // playerL3 was ALREADY decoding & playing this video smoothly at 60 FPS.
    // By swapping references, playerL0 becomes the active player with ZERO dropped frames,
    // ZERO timecode jump, and ZERO network re-fetch delay!
    const tempPlayer = playerL0;
    playerL0 = playerL3;
    playerL3 = tempPlayer;
    hasHandoverFrame = false;

    // 3. Reset Crossfader to A
    if (crossfader) crossfader.value = 0;
    const readout = document.getElementById('tbar-readout');
    if (readout) readout.textContent = 'A 100%';

    // 4. Update Central Strip Bus Labels
    const stripA = document.getElementById('me-bus-a-title');
    if (stripA) stripA.textContent = `BASE: ${queuedName || queuedClipId}`;

    // 5. Send action to server & OSC
    sendAction('trigger_take', { clipId: queuedClipId, name: queuedName });
    sendAction('cue_clip', { layer: 'layer0', clipId: queuedClipId, name: queuedName });
    sendAction('set_layer_rotation', { layer: 'layer0', rotation: queuedRotation || 0 });
    sendAction('set_layer_fit_mode', { layer: 'layer0', fit_mode: queuedFitMode || 'fill' });
    sendAction('set_crossfader', { value: 0 });
  }

  // 5.5 Record safety bar count to prevent autopilot from rapid-cycling takes
  if (appState.phrase) {
    appState.last_take_total_bar = appState.phrase.total_bars || 1;
    appState.phrase.last_take_bar = appState.phrase.total_bars || 1;
  }

  // 6. Advance smart queue to arm the NEXT clip into Preview Cue
  advanceSmartQueue();

  // Update strip bus B label
  const stripB = document.getElementById('me-bus-b-title');
  if (stripB) stripB.textContent = `CUE: ${appState.layers.layer3.name || appState.layers.layer3.clipId}`;

  // 9. Immediate render & video sync
  updateUI();
  updateGeometryUI();
  syncVideoSources();
}

function executeHardCut() {
  isAutoTransitioning = false;
  autoTransitionProgress = 0.0;
  const bar = document.getElementById('auto-take-bar');
  if (bar) bar.style.width = '0%';
  const btnTake = document.getElementById('btn-auto-take');
  if (btnTake) btnTake.classList.remove('transitioning');
  executeTakeCommit();
}

function startAutoTransition(duration = null) {
  if (isAutoTransitioning) return;
  if (isSyncBeatTransition) {
    currentTransitionDuration = (4.0 * 60.0) / (appState.bpm || 124.0); // 1 bar (4 beats)
  } else {
    currentTransitionDuration = duration || selectedTransitionDuration || 1.0;
  }
  isAutoTransitioning = true;
  autoTransitionProgress = 0.0;
  const btnTake = document.getElementById('btn-auto-take');
  if (btnTake) btnTake.classList.add('transitioning');
}

// Alias for existing triggers
const executeTakeTransition = startAutoTransition;

function updateAntiRepeatBadge() {
  const badge = document.getElementById('lbl-anti-repeat');
  if (badge) {
    badge.textContent = `Anti-Repetição FIFO: 15 clipes sem repetir (${playedClipsHistory.length}/15)`;
  }
}

function renderQueueCards() {
  const canvas = document.getElementById('timeline-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  
  // Set real canvas resolution based on display size to avoid blur
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;
  canvas.width = rect.width;
  canvas.height = rect.height;
  
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // If in Pro Timeline Arrangement View (Expanded Height >= 120px)
  if (rect.height >= 120) {
    const w = canvas.width;
    const h = canvas.height;
    const rulerH = 22;
    const tracksH = h - rulerH;
    const numTracks = 5;
    const trackH = tracksH / numTracks;

    // 1. Draw Top Time Ruler
    ctx.fillStyle = '#06090e';
    ctx.fillRect(0, 0, w, rulerH);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, rulerH);
    ctx.lineTo(w, rulerH);
    ctx.stroke();

    // Bar ticks (every 4 bars / 16 bars)
    const barWidth = w / 16;
    for (let b = 0; b <= 16; b++) {
      const bx = b * barWidth;
      ctx.strokeStyle = b % 4 === 0 ? 'rgba(0, 240, 255, 0.4)' : 'rgba(255, 255, 255, 0.1)';
      ctx.beginPath();
      ctx.moveTo(bx, rulerH - (b % 4 === 0 ? 10 : 5));
      ctx.lineTo(bx, rulerH);
      ctx.stroke();

      if (b % 4 === 0 && b < 16) {
        ctx.fillStyle = 'rgba(0, 240, 255, 0.7)';
        ctx.font = '8px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`BAR ${b+1}`, bx + 4, rulerH - 4);
      }
    }

    // 2. Track Lanes Background & Dividing Lines
    const trackColors = [
      'rgba(0, 255, 136, 0.04)',
      'rgba(255, 255, 255, 0.02)',
      'rgba(255, 255, 255, 0.02)',
      'rgba(0, 240, 255, 0.04)',
      'rgba(255, 42, 133, 0.04)'
    ];

    for (let t = 0; t < numTracks; t++) {
      const ty = rulerH + (t * trackH);
      ctx.fillStyle = trackColors[t] || '#05070a';
      ctx.fillRect(0, ty, w, trackH);

      // Grid line
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.beginPath();
      ctx.moveTo(0, ty + trackH);
      ctx.lineTo(w, ty + trackH);
      ctx.stroke();

      // Vertical measure lines across tracks
      for (let b = 1; b < 16; b++) {
        const bx = b * barWidth;
        ctx.strokeStyle = b % 4 === 0 ? 'rgba(255, 255, 255, 0.04)' : 'rgba(255, 255, 255, 0.015)';
        ctx.beginPath();
        ctx.moveTo(bx, ty);
        ctx.lineTo(bx, ty + trackH);
        ctx.stroke();
      }
    }

    // 3. Render Active Program Clip on Track 0 (L0 Master)
    const l0Clip = appState.layers?.layer0;
    const l0Y = rulerH + 2;
    const block0W = barWidth * 8;
    ctx.fillStyle = 'rgba(0, 255, 136, 0.18)';
    ctx.strokeStyle = 'rgba(0, 255, 136, 0.75)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(10, l0Y, block0W - 10, trackH - 4, 4);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#00ff88';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('▶ L0 PROGRAM: ' + ((l0Clip?.name || 'MASTER').substring(0, 24)), 18, l0Y + 12);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = '8px monospace';
    ctx.fillText('MATTE: ' + (l0Clip?.matte || 'FULL'), 18, l0Y + trackH - 8);

    // 4. Render Active Cue Clip on Track 3 (L3 Cue Bus B)
    const l3Clip = appState.layers?.layer3;
    const l3Y = rulerH + (3 * trackH) + 2;
    const block3X = 10 + (barWidth * 4);
    const block3W = barWidth * 8;
    ctx.fillStyle = 'rgba(0, 240, 255, 0.18)';
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.75)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(block3X, l3Y, block3W, trackH - 4, 4);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#00f0ff';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('◱ CUE BUS B: ' + ((l3Clip?.name || 'PREVIEW').substring(0, 22)), block3X + 8, l3Y + 12);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = '8px monospace';
    ctx.fillText('NEXT IN QUEUE', block3X + 8, l3Y + trackH - 8);

    // 5. Render Queue Future Sequence Blocks
    if (queueList && queueList.length > 0) {
      queueList.slice(0, 4).forEach((qItem, qIdx) => {
        const qX = 10 + ((qIdx + 2) * barWidth * 3);
        if (qX < w - 80) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(qX, l0Y, barWidth * 2.8, trackH - 4, 3);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
          ctx.font = '8px monospace';
          ctx.fillText(`+${qIdx+1} ` + (qItem.name || '').substring(0, 10), qX + 6, l0Y + 12);
        }
      });
    }

    // 6. Tension Waveform Indicator along bottom track
    const fxY = rulerH + (4 * trackH);
    ctx.fillStyle = 'rgba(255, 42, 133, 0.1)';
    ctx.fillRect(0, fxY, w, trackH);
    ctx.fillStyle = 'rgba(255, 42, 133, 0.8)';
    ctx.font = 'bold 8.5px monospace';
    ctx.fillText('FX ENGINE: ' + (appState.fx?.enabled ? 'ACTIVE (' + (appState.fx?.activeEffect || 'AUTO') + ')' : 'BYPASS'), 10, fxY + 13);

    return;
  }
  
  if (!queueList || queueList.length === 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('FILA VAZIA (QUEUE EMPTY)', canvas.width/2, canvas.height/2);
    return;
  }
  
  const clipW = 140;
  const clipH = 78; // aprox 16:9
  const gap = 12;
  const startX = 20;
  const startY = (canvas.height - clipH) / 2;
  
  queueList.slice(0, 6).forEach((item, idx) => {
    const x = startX + (idx * (clipW + gap));
    const y = startY;
    
    // Thumbnail Placeholder (Gradient/Color)
    ctx.fillStyle = idx === 0 ? 'rgba(0, 240, 255, 0.15)' : 'rgba(0, 0, 0, 0.6)';
    ctx.strokeStyle = idx === 0 ? 'rgba(0, 240, 255, 0.8)' : 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = idx === 0 ? 2 : 1;
    ctx.beginPath();
    ctx.roundRect(x, y, clipW, clipH, 6);
    ctx.fill();
    ctx.stroke();
    
    // Label/Slot
    ctx.fillStyle = idx === 0 ? '#00f0ff' : '#fff';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(item.slot || `CUE ${idx+1}`, x + clipW/2, y + clipH/2 - 12);
    
    // Clip Name
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '9px monospace';
    const nameStr = item.name.length > 20 ? item.name.substring(0, 18) + '...' : item.name;
    ctx.fillText(nameStr, x + clipW/2, y + clipH/2 + 2);
    
    // Matte Info
    ctx.fillStyle = 'rgba(255,42,85,0.8)';
    ctx.font = '8px monospace';
    ctx.fillText(item.matte || 'DEFAULT MATTE', x + clipW/2, y + clipH/2 + 16);
  });
}

// ============================================================================
// 9.1 MATTE CATALOG & PROCEDURAL LIBRARY BROWSER
// ============================================================================
async function loadMattesCatalog() {
  try {
    if (MediaProvider.mode === 'cdn' || MediaProvider.mode === 'lan') {
      const res = await fetch(HARS.resolveUrl('/api/mattes'));
      if (res.ok) allMattes = await res.json();
    }
    
    // Standalone fallback: if no backend, provide default procedural mattes
    if (!allMattes || allMattes.length === 0) {
      allMattes = [
        { id: 'matte_procedural_circle', filename: 'Circulo Suave', category: 'PROCEDURAL', is_procedural: true, shape: 'circle' },
        { id: 'matte_procedural_diamond', filename: 'Diamante', category: 'PROCEDURAL', is_procedural: true, shape: 'diamond' }
      ];
    }
    
    const countLbl = document.getElementById('dock-matte-count');
    if (countLbl) countLbl.textContent = allMattes.length;
    populateMatteDropdowns();
    renderMattesCards();
  } catch (e) {
    console.error('[!] Failed to load mattes catalog:', e);
  }
}

function populateMatteDropdowns() {
  const dropdownIds = ['l0-matte', 'l3-matte', 'l4-matte'];
  const categories = {};
  allMattes.forEach(m => {
    if (!categories[m.category]) categories[m.category] = [];
    categories[m.category].push(m);
  });

  dropdownIds.forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const currentVal = (id === 'l0-matte' ? appState.layers.layer0.matte :
                        id === 'l3-matte' ? appState.layers.layer3.matte :
                        appState.layers.layer4.matte) || '';

    let html = '<option value="none">Sem Máscara (Full Frame)</option>';
    for (const [cat, items] of Object.entries(categories)) {
      html += `<optgroup label="CAT ${cat}">`;
      items.forEach(item => {
        const isSel = (item.path === currentVal || item.filename === currentVal) ? 'selected' : '';
        html += `<option value="${item.path}" ${isSel}>${item.name} (${item.category})</option>`;
      });
      html += '</optgroup>';
    }
    sel.innerHTML = html;
  });
}

function renderMattesCards() {
  const container = document.getElementById('mattes-cards-container');
  if (!container) return;
  container.innerHTML = '';

  const searchVal = (document.getElementById('input-matte-search')?.value || '').toLowerCase();
  const targetL = appState.matte_target_layer || 'layer3';
  const targetMattePath = appState.layers[targetL]?.matte;
  const isPassthrough = !targetMattePath || targetMattePath === 'none';

  // Always show Passthrough card when searching or viewing ALL
  if (!searchVal || 'passthrough'.includes(searchVal) || 'sem mascara'.includes(searchVal) || 'none'.includes(searchVal) || 'full frame'.includes(searchVal)) {
    const passCard = document.createElement('div');
    passCard.className = `matte-card card-passthrough ${isPassthrough ? 'selected' : ''}`;
    passCard.innerHTML = `
      <div class="matte-thumb-wrap passthrough-thumb">
        <span class="passthrough-icon">⊘</span>
        <span class="matte-badge-cat">PASSTHROUGH</span>
      </div>
      <div class="matte-info">
        <div class="matte-name" style="color: ${isPassthrough ? 'var(--cyan)' : '#fff'};">SEM MÁSCARA (FULL FRAME)</div>
        <div class="matte-desc">Desativa qualquer recorte e exibe o vídeo original 100% livre na camada selecionada.</div>
      </div>
      <div class="matte-quick-routes">
        <button class="btn-route-clear">✕ DESATIVAR MÁSCARA (${targetL.replace('layer', 'L').toUpperCase()})</button>
      </div>
    `;
    passCard.addEventListener('click', () => {
      clearCurrentTargetMatte();
    });
    container.appendChild(passCard);
  }

  const filtered = allMattes.filter(m => {
    const matchSearch = !searchVal || m.name.toLowerCase().includes(searchVal) || m.description.toLowerCase().includes(searchVal) || (m.tags && m.tags.some(t => t.toLowerCase().includes(searchVal)));
    if (!matchSearch) return false;
    if (activeMatteCategoryFilter === 'ALL') return true;
    return m.category === activeMatteCategoryFilter;
  });

  filtered.forEach(matte => {
    const card = document.createElement('div');
    const isSelected = appState.layers[targetL]?.matte === matte.path;
    card.className = `matte-card ${isSelected ? 'selected' : ''}`;
    card.dataset.path = matte.path;

    // Check which layers currently use this matte
    const activeLayers = [];
    if (appState.layers.layer0?.matte?.includes(matte.filename)) activeLayers.push('L0');
    if (appState.layers.layer1?.matte?.includes(matte.filename)) activeLayers.push('L1');
    if (appState.layers.layer2?.matte?.includes(matte.filename)) activeLayers.push('L2');
    if (appState.layers.layer3?.matte?.includes(matte.filename)) activeLayers.push('L3');
    if (appState.layers.layer4?.matte?.includes(matte.filename)) activeLayers.push('L4');

    const pillsHtml = activeLayers.map(l => `<span class="matte-active-pill">${l}</span>`).join('');

    card.innerHTML = `
      <div class="matte-thumb-wrap">
        <img src="/mattes/${matte.path}" loading="lazy" alt="${matte.name}" class="matte-thumb-img">
        <span class="matte-badge-cat">${matte.category}</span>
        <div class="matte-active-layers">${pillsHtml}</div>
      </div>
      <div class="matte-info">
        <div class="matte-name" title="${matte.name}">${matte.name} ${isSelected ? '<span style="color:var(--cyan);font-size:8px;">[ATIVA]</span>' : ''}</div>
        <div class="matte-desc" title="${matte.description}">${matte.description}</div>
      </div>
      <div class="matte-quick-routes">
        ${isSelected ? `<button class="btn-route-clear" style="margin-bottom:3px;">✕ REMOVER DE ${targetL.replace('layer', 'L').toUpperCase()}</button>` : ''}
        ${targetL === 'master' ? 
          `<button class="btn-route assigned" data-layer="master" title="Aplicar ao Master (Global)">▶ MASTER (GLOBAL)</button>` : 
          `<button class="btn-route ${activeLayers.includes('L0') ? 'assigned' : ''}" data-layer="layer0" title="Aplicar a L0 (PGM)">L0</button>
           <button class="btn-route ${activeLayers.includes('L3') ? 'assigned' : ''}" data-layer="layer3" title="Armar em L3 (CUE)">L3</button>
           <button class="btn-route ${activeLayers.includes('L4') ? 'assigned' : ''}" data-layer="layer4" title="Armar em L4 (DROP)">L4</button>`
        }
      </div>
    `;

    // Click card: if already selected, toggle off (remove); otherwise assign to active target layer!
    card.addEventListener('click', () => {
      const tgt = appState.matte_target_layer || 'layer3';
      
      if (tgt === 'master') {
        if (appState.master_matte === matte.path) {
          appState.master_matte = 'none';
        } else {
          appState.master_matte = matte.path;
        }
      } else {
        if (appState.layers[tgt]?.matte === matte.path) {
          clearCurrentTargetMatte();
          return;
        } else {
          appState.layers[tgt].matte = matte.path;
          const selId = tgt.replace('layer', 'l') + '-matte';
          const sel = document.getElementById(selId);
          if (sel) sel.value = matte.path;
          sendAction('set_layer_matte', { layer: tgt, matte: matte.path });
        }
      }
      updateMatteRibbonActiveStatus();
      renderMattesCards();
      updateUI();
    });

    // Quick route buttons
    card.querySelectorAll('.btn-route').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const targetLayer = btn.dataset.layer;
        appState.layers[targetLayer].matte = matte.path;
        const selId = targetLayer.replace('layer', 'l') + '-matte';
        const sel = document.getElementById(selId);
        if (sel) sel.value = matte.path;
        sendAction('set_layer_matte', { layer: targetLayer, matte: matte.path });
        updateMatteRibbonActiveStatus();
        renderMattesCards();
        updateUI();
      });
    });

    // Clear button if present
    const btnClr = card.querySelector('.btn-route-clear');
    if (btnClr) {
      btnClr.addEventListener('click', (e) => {
        e.stopPropagation();
        clearCurrentTargetMatte();
      });
    }

    container.appendChild(card);
  });

  updateMatteRibbonActiveStatus();
}


// ============================================================================
// 8. TELEMETRY & UI UPDATERS
// ============================================================================
function updateUI() {
  if (badgeState) {
    badgeState.textContent = appState.macro_state;
    badgeState.style.color = getStateColor(appState.macro_state);
  }
  const badgeStrip = document.getElementById('badge-macro-state-strip');
  if (badgeStrip && appState.macro_state) {
    const isForced = Boolean(appState.auto_mode && appState.manual_forced_state);
    badgeStrip.textContent = isForced ? appState.macro_state + ' [FORÇADO]' : appState.macro_state;
    badgeStrip.style.color = getStateColor(appState.macro_state);
    badgeStrip.classList.toggle('state-forced-glow', isForced);
  }
  const badgePreset = document.getElementById('badge-macro-preset-name');
  if (badgePreset && appState.macro_state) {
    const p = appState.active_macro_preset || getActiveMacroPreset(appState.macro_state);
    if (p) {
      const list = MACRO_PRESETS[appState.macro_state] || [];
      const curIdx = (appState.macro_preset_indices && appState.macro_preset_indices[appState.macro_state] !== undefined)
        ? appState.macro_preset_indices[appState.macro_state] + 1 : 1;
      badgePreset.textContent = curIdx + '/' + list.length + ' · ' + p.name.toUpperCase();
      badgePreset.className = 'macro-preset-tag ' + (appState.macro_state === 'DROP' ? 'drop' : (appState.macro_state === 'BUILD' ? 'build' : (appState.macro_state === 'GROOVE' ? 'clean' : '')));
    }
  }
  if (badgeBpm) badgeBpm.textContent = Number(appState.bpm).toFixed(1);
  const inputBpm = document.getElementById('input-manual-bpm');
  if (inputBpm && document.activeElement !== inputBpm && appState.bpm) {
    inputBpm.value = Number(appState.bpm).toFixed(1);
  }
  if (btnBlackout) {
    btnBlackout.style.background = appState.blackout ? '#ff2a55' : 'rgba(255, 42, 85, 0.16)';
    btnBlackout.style.color = appState.blackout ? '#fff' : '#ff2a55';
  }
  if (txtAuto) {
    txtAuto.textContent = appState.auto_mode ? 'AUTOPILOT ON' : 'MANUAL';
  }

  // Active Macro State
  document.querySelectorAll('.state-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.state === appState.macro_state);
  });

  // Layer titles
  const hudClipTitle = document.getElementById('hud-clip-title');
  if (hudClipTitle && appState.layers.layer0) {
    hudClipTitle.textContent = `BASE: ${appState.layers.layer0.name || '00000000_14'}`;
  }
  const prvClipTitle = document.getElementById('preview-clip-title');
  if (prvClipTitle && appState.layers.layer3) {
    prvClipTitle.textContent = `CUE: ${appState.layers.layer3.name || 'Metallic_spine'}`;
  }

  // Tonal Values (Safe against NaN)
  if (appState.tonal) {
    const g = Number(appState.tonal.gamma || 0.85);
    const b = Number(appState.tonal.brightness !== undefined ? appState.tonal.brightness : -0.05);
    const m = Number(appState.tonal.midtones || 1.00);
    const c = Number((appState.tonal.contrast !== undefined && !isNaN(appState.tonal.contrast)) ? appState.tonal.contrast : 1.18);
    const em = Number(appState.tonal.edge_mix || 0.22);
    const et = Number(appState.tonal.edge_threshold || 0.30);

    const valG = document.getElementById('val-gamma');
    if (valG) valG.textContent = g.toFixed(2);
    const fG = document.getElementById('fader-gamma');
    if (fG && document.activeElement !== fG) fG.value = Math.round(g * 100);

    const isVert = Boolean(appState.vertical_mode || appState.vertical_projection);

    // Sync Program Monitor Box styling and badge
    const prgScreenBox = document.getElementById('program-screen-box');
    if (prgScreenBox) prgScreenBox.classList.toggle('mode-vertical', isVert);

    const badgePrg = document.getElementById('badge-prg-status');
    if (badgePrg) badgePrg.textContent = isVert ? 'PROGRAM (MODO VERTICAL 9:16)' : 'PROGRAM (AO VIVO)';

    const btnPrgVert = document.getElementById('btn-prg-toggle-vertical');
    if (btnPrgVert) btnPrgVert.classList.toggle('active', isVert);

    // Sync Settings Modal controls
    const lblCfgVert = document.getElementById('lbl-cfg-vert-status');
    if (lblCfgVert) {
      lblCfgVert.textContent = isVert ? 'MODO VERTICAL 9:16 (ATIVO)' : 'HORIZONTAL 16:9';
      lblCfgVert.className = isVert ? 'cfg-badge text-emerald' : 'cfg-badge';
    }

    const btnCfgModeHoriz = document.getElementById('btn-cfg-mode-horiz');
    const btnCfgModeVert = document.getElementById('btn-cfg-mode-vert');
    if (btnCfgModeHoriz) btnCfgModeHoriz.classList.toggle('active', !isVert);
    if (btnCfgModeVert) btnCfgModeVert.classList.toggle('active', isVert);

    const chkProjComp = document.getElementById('chk-cfg-proj-comp');
    if (chkProjComp) chkProjComp.checked = Boolean(appState.projector_compensation);

    const btnVert = document.getElementById('btn-toggle-vertical-proj');
    if (btnVert) {
      const lblVert = document.getElementById('lbl-vert-proj');
      btnVert.style.borderColor = isVert ? 'var(--cyan)' : '';
      btnVert.style.color = isVert ? 'var(--cyan)' : '';
      if (lblVert) lblVert.textContent = isVert ? 'LIGADO' : 'DESLIGADO';
    }

    const lblCfgMinBars = document.getElementById('lbl-cfg-min-bars');
    if (lblCfgMinBars) {
      const minBars = appState.autopilot_min_bars || 16;
      lblCfgMinBars.textContent = `${minBars} BARS (${minBars === 16 ? 'PADRÃO' : '~' + Math.round(minBars * 1.93) + 's'})`;
    }

    document.querySelectorAll('#group-cfg-min-bars .conductor-btn').forEach(btn => {
      btn.classList.toggle('active', Number(btn.dataset.bars) === Number(appState.autopilot_min_bars || 16));
    });

    const chkAutoCycle = document.getElementById('chk-cfg-autocycle');
    if (chkAutoCycle) chkAutoCycle.checked = Boolean(appState.autopilot_rules.auto_cycle);
    const chkDropTake = document.getElementById('chk-cfg-droptake');
    if (chkDropTake) chkDropTake.checked = Boolean(appState.autopilot_rules.auto_drop_take);
    const chkArmDrop = document.getElementById('chk-cfg-armdrop');
    if (chkArmDrop) chkArmDrop.checked = Boolean(appState.autopilot_rules.auto_arm_drop);
    const chkAntiBlowout = document.getElementById('chk-cfg-antiblowout');
    if (chkAntiBlowout) chkAntiBlowout.checked = Boolean(appState.autopilot_rules.anti_blowout);

    const valB = document.getElementById('val-brightness');
    if (valB) valB.textContent = `${Math.round(b * 100)}%`;
    const fB = document.getElementById('fader-brightness');
    if (fB && document.activeElement !== fB) fB.value = Math.round(b * 100);

    const valM = document.getElementById('val-midtones');
    if (valM) valM.textContent = m.toFixed(2);
    const fM = document.getElementById('fader-midtones');
    if (fM && document.activeElement !== fM) fM.value = Math.round(m * 100);

    const valC = document.getElementById('val-contrast');
    if (valC) valC.textContent = c.toFixed(2);
    const fC = document.getElementById('fader-contrast');
    if (fC && document.activeElement !== fC) fC.value = Math.round(c * 100);

    const valEM = document.getElementById('val-edge-mix');
    if (valEM) valEM.textContent = `${Math.round(em * 100)}%`;
    const fEM = document.getElementById('fader-edge-mix');
    if (fEM && document.activeElement !== fEM) fEM.value = Math.round(em * 100);

    const valET = document.getElementById('val-edge-thresh');
    if (valET) valET.textContent = `${Math.round(et * 100)}%`;
    const fET = document.getElementById('fader-edge-thresh');
    if (fET && document.activeElement !== fET) fET.value = Math.round(et * 100);
  }

  // Matte Kinematics Values
  if (appState.matte && appState.matte.deform) {
    const def = appState.matte.deform;
    const valWS = document.getElementById('val-wiggle-scale');
    if (valWS) valWS.textContent = `${Math.round((def.wiggle_scale || 0.04) * 100)}%`;
    const sWS = document.getElementById('slider-wiggle-scale');
    if (sWS && document.activeElement !== sWS) sWS.value = Math.round((def.wiggle_scale || 0.04) * 100);

    const valWP = document.getElementById('val-wiggle-pos');
    if (valWP) valWP.textContent = `${Math.round(def.wiggle_pos || 8)}px`;
    const sWP = document.getElementById('slider-wiggle-pos');
    if (sWP && document.activeElement !== sWP) sWP.value = Math.round(def.wiggle_pos || 8);

    const valP = document.getElementById('val-posterize');
    if (valP) valP.textContent = (def.posterize_rate > 0) ? `${def.posterize_rate} fps` : 'OFF';

    const valEW = document.getElementById('val-edge-warp');
    if (valEW) valEW.textContent = `${Math.round((def.edge_warp || 0.08) * 100)}%`;
    const sEW = document.getElementById('slider-edge-warp');
    if (sEW && document.activeElement !== sEW) sEW.value = Math.round((def.edge_warp || 0.08) * 100);

    const valAS = document.getElementById('val-anim-speed');
    if (valAS) valAS.textContent = `${(def.speed || 4.0).toFixed(1)} T`;
    const sAS = document.getElementById('slider-anim-speed');
    if (sAS && document.activeElement !== sAS) sAS.value = (def.speed || 4.0);

    const btnSync = document.getElementById('btn-sync-bpm');
    if (btnSync) btnSync.classList.toggle('btn-active', !!def.sync_bpm);

    const valMF = document.getElementById('val-matte-family');
    if (valMF && appState.matte.bank) valMF.textContent = `CAT.${appState.matte.bank.toUpperCase()}`;
  }

  // Synchronize 5 Channel Strips in Tab 2
  ['layer0', 'layer1', 'layer2', 'layer3', 'layer4'].forEach(lid => {
    const lprefix = lid.replace('layer', 'l');
    const layer = appState.layers[lid];
    if (!layer) return;

    const subText = document.getElementById(`${lprefix}-sub-text`);
    if (subText && layer.name) subText.textContent = layer.name;

    const selMatte = document.getElementById(`${lprefix}-matte`);
    if (selMatte && layer.matte) selMatte.value = layer.matte;

    const btnInv = document.getElementById(`${lprefix}-matte-inv`);
    if (btnInv) btnInv.classList.toggle('active', !!layer.matte_invert);

    const selBlend = document.getElementById(`${lprefix}-blend`);
    if (selBlend && layer.blend) selBlend.value = layer.blend;

    const sliderOp = document.getElementById(`${lprefix}-opacity`);
    const lblOp = document.getElementById(`lbl-${lprefix}-opacity`);
    if (sliderOp && layer.opacity !== undefined && document.activeElement !== sliderOp) {
      sliderOp.value = Math.round(layer.opacity * 100);
    }
    if (lblOp && layer.opacity !== undefined) {
      lblOp.textContent = `${Math.round(layer.opacity * 100)}%`;
    }

    const btnSolo = document.getElementById(`btn-toggle-${lprefix}`);
    if (btnSolo) btnSolo.classList.toggle('active', !!layer.active);
  });

  updateGeometryUI();
}

function getStateColor(state) {
  switch (state) {
    case 'INTRO': return '#00f0ff';
    case 'BUILD': return '#ffb800';
    case 'DROP': return '#ff2a55';
    case 'BREAK': return '#00e1d9';
    case 'GROOVE': return '#00ff88';
    default: return '#00f0ff';
  }
}

function updateMeters() {
  const bpmDisplayEl = document.getElementById('bpm-display');
  if (bpmDisplayEl && appState.bpm) {
    bpmDisplayEl.textContent = `${Number(appState.bpm).toFixed(1)} BPM`;
  }
  const badgeMacroState = document.getElementById('badge-macro-state');
  if (badgeMacroState && appState.macro_state) {
    badgeMacroState.textContent = appState.macro_state;
    badgeMacroState.style.color = getStateColor(appState.macro_state);
  }
  const badgeMacroStateStrip = document.getElementById('badge-macro-state-strip');
  if (badgeMacroStateStrip && appState.macro_state) {
    badgeMacroStateStrip.textContent = appState.macro_state;
    badgeMacroStateStrip.style.color = getStateColor(appState.macro_state);
  }
  document.querySelectorAll('.state-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.state === appState.macro_state);
  });

  const buildPct = Math.min(100, Math.round((appState.buildup_score || 0) * 100));
  if (valBuildup) valBuildup.textContent = `${buildPct}%`;
  if (barBuildup) barBuildup.style.width = `${buildPct}%`;

  const dropPct = Math.min(100, Math.round((appState.drop_likelihood || 0) * 100));
  if (valDrop) valDrop.textContent = `${dropPct}%`;
  if (barDrop) barDrop.style.width = `${dropPct}%`;

  if (cardDrop) {
    if (dropPct > 65) {
      cardDrop.style.borderColor = '#ff2a55';
      cardDrop.style.boxShadow = '0 0 16px rgba(255, 42, 85, 0.45)';
      if (tagPreDrop) { tagPreDrop.textContent = 'DROP IMINENTE'; tagPreDrop.style.color = '#ff2a55'; }
    } else {
      cardDrop.style.borderColor = 'rgba(255, 255, 255, 0.08)';
      cardDrop.style.boxShadow = 'none';
      if (tagPreDrop) { tagPreDrop.textContent = 'MONITORANDO'; tagPreDrop.style.color = '#718096'; }
    }
  }

  const phase = appState.phase || 0.0;
  const beatNum = Math.floor(phase * 4) + 1;
  if (beatDisplay) beatDisplay.textContent = `BEAT ${beatNum}`;
  if (phaseDisplay) phaseDisplay.textContent = `FASE: ${phase.toFixed(2)}`;
  if (badgeBar) badgeBar.textContent = `${appState.bar || 1}.${beatNum}`;

  if (beatOrb) {
    beatOrb.classList.toggle('active', phase < 0.15);
  }

  if (appState.bands) {
    for (const [key, el] of Object.entries(meters)) {
      if (el && appState.bands[key] !== undefined) {
        el.style.height = `${Math.min(100, Math.max(8, appState.bands[key] * 88))}%`;
      }
    }
  }

  if (appState.stems) {
    for (const [key, el] of Object.entries(stems)) {
      if (el && appState.stems[key] !== undefined) {
        el.style.width = `${Math.min(100, Math.max(5, appState.stems[key] * 100))}%`;
      }
    }
  }

  updateTimelineDisplay();
}

function updateTimelineDisplay() {
  const currentSec = Math.floor(appState.set_time || 1275);
  const totalSec = appState.set_total_duration || 10759;
  const pct = Math.min(100, (currentSec / totalSec) * 100);

  const statsLbl = document.getElementById('timeline-time-info');
  if (statsLbl) {
    statsLbl.textContent = `${currentSec}s / ${totalSec}s · ${pct.toFixed(1)}% Concluído`;
  }
  const progFill = document.getElementById('timeline-progress');
  if (progFill) progFill.style.width = `${pct}%`;

  const nodes = document.querySelectorAll('.phrase-node');
  const phraseIdx = (Math.floor((appState.bar || 1) / 8)) % nodes.length;
  nodes.forEach((node, i) => {
    if (i === phraseIdx) node.className = 'phrase-node current';
    else if (i < phraseIdx) node.className = 'phrase-node active';
    else node.className = 'phrase-node';
  });
}

// ============================================================================
// 9. MEDIA POOL & 1-CLICK DOCK ROUTER
// ============================================================================
async function loadMediaPool(providedClips = null) {
  try {
    if (providedClips) {
      allClips = providedClips;
    } else {
      // Fallback if loadMediaPool is called directly
      if (MediaProvider.mode === 'none') {
        allClips = await MediaProvider.initCDN();
      }
    }

    // Initialize Centralized User Profile & Cache Registry
    if (typeof UserProfileManager !== 'undefined') {
      await UserProfileManager.init();
    }
    await PenumbraMediaCache.init();
    await MediaProvider.initLocalFilesAutoIndex();
    MediaProvider.syncSmartDeduplication();
    loadCustomClipsFromStorage();

    // Dynamic 3D Model Override from CDN or Local Storage
    const customModel = allClips.find(c => c.type === 'model' && c.filename.includes('espinhaco_spine_points.json'));
    if (customModel && (MediaProvider.mode === 'cdn' || MediaProvider.mode === 'local')) {
      const modelUrl = MediaProvider.getMediaUrl(customModel.relative_path);
      fetch(modelUrl).then(r => r.json()).then(data => {
        if (data && data.points) {
          plexusSpinePoints = data.points;
          console.log(`[✓] Plexus 3D Espinhaço override from ${MediaProvider.mode}: ${plexusSpinePoints.length} vertices.`);
        }
      }).catch(e => console.warn('Failed to load custom model override', e));
    }

    // Keep only videos for the UI Grid
    allClips = allClips.filter(c => c.type !== 'model');

    // Ensure Plexus 3D Espinhaço Generative clip is prepended and available in Media Pool
    if (!allClips.some(c => c.id === 'clip_gen_plexus_spine')) {
      allClips.unshift({
        id: "clip_gen_plexus_spine",
        filename: "PLEXUS 3D ESPINHAÇO (Houdini Generative Marine Spine)",
        folder: "GENERATIVE",
        relative_path: "GENERATIVE/plexus_espinhaco_3d.gen",
        absolute_path: "GENERATIVE/plexus_espinhaco_3d",
        width: 1920,
        height: 1080,
        duration: 999.0,
        fps: 60.0,
        codec: "procedural_3d",
        size_mb: 0.07,
        category: "GENERATIVE",
        suggested_layer: 0,
        has_chroma: false,
        green_pct: 0.0,
        mean_luminance: 0.45,
        contrast: 0.85,
        thumbnail: "thumb_005_Metallic_spine_sculpture.jpg",
        notes: "Sistema generativo 3D Plexus baseado no modelo 3D Espinhaço. Partículas de bioluminescência marinha, nós conectados e deformação de vértebras áudio-reativas (Houdini style).",
        project: "Espinhaço 3D Plexus",
        project_folder: "GENERATIVE 3D",
        is_generative: true
      });
    }

    MediaProvider.syncSmartDeduplication();

    const countLbl = document.getElementById('dock-clip-count');
    if (countLbl) countLbl.textContent = allClips.length;
    const pillAll = document.getElementById('pill-all-count');
    if (pillAll) pillAll.textContent = allClips.length;
    renderFolderPills();
    renderMediaCards();
    renderQueueCards();
    syncVideoSources();
  } catch (e) {
    console.error('[!] Failed to load media pool:', e);
  }
}

function getClipFolder(c) {
  if (!c) return '1. IN';
  if (c.is_generative || c.id === 'clip_gen_plexus_spine') return 'GENERATIVE 3D';
  if (c.project_folder) return c.project_folder;
  if (c.project && c.folder) return `${c.project}/${c.folder}`;
  if (c.project) return `${c.project}/1. In`;
  if (c.folder && c.folder !== 'ROOT') return c.folder;
  if (c.is_stream || c.is_youtube) return 'STREAMS & YOUTUBE';
  if (c.is_downloaded) return 'DOWNLOADS';
  return '1. IN';
}
window.getClipFolder = getClipFolder;

function renderFolderPills() {
  const container = document.getElementById('folder-pills-container');
  if (!container || !allClips || allClips.length === 0) return;

  const folderCounts = {};
  allClips.forEach(c => {
    const f = getClipFolder(c);
    folderCounts[f] = (folderCounts[f] || 0) + 1;
  });

  const folders = Object.keys(folderCounts).sort();

  container.innerHTML = `
    <button class="lib-tree-item pill-btn ${activeFolderFilter === 'ALL' ? 'active' : ''}" data-folder="ALL">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
      <span class="tree-label">TODAS AS PASTAS</span>
      <span class="pill-badge">${allClips.length}</span>
    </button>
    ${folders.map(f => `
      <button class="lib-tree-item pill-btn ${activeFolderFilter === f ? 'active' : ''}" data-folder="${f}">
        <span class="src-dot dot-local"></span>
        <span class="tree-label">${f}</span>
        <span class="pill-badge">${folderCounts[f]}</span>
      </button>
    `).join('')}
  `;

  container.querySelectorAll('.pill-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFolderFilter = btn.dataset.folder;
      renderMediaCards();
    });
  });

  // Renderiza também a lista de pastas para o Autopilot em Settings
  const apFoldersList = document.getElementById('autopilot-folders-list');
  if (apFoldersList) {
    const activeFolders = appState.autopilot_active_folders || folders;
    apFoldersList.innerHTML = folders.map(f => `
      <label class="cfg-check-item">
        <input type="checkbox" onchange="toggleAutopilotFolder('${f}', this.checked)" ${activeFolders.includes(f) ? 'checked' : ''}>
        <span>${f}</span>
      </label>
    `).join('');
  }
}

window.toggleAutopilotFolder = function(folder, isActive) {
  let active = appState.autopilot_active_folders || [...Array.from(new Set(allClips.map(c => getClipFolder(c))))];
  if (isActive && !active.includes(folder)) active.push(folder);
  if (!isActive && active.includes(folder)) active = active.filter(f => f !== folder);
  appState.autopilot_active_folders = active;
  sendAction('set_autopilot_folders', { active_folders: active });
};

// ============================================================================
// CENTRALIZED USER PROFILE & ZERO-WASTE LOCAL CACHE MANAGER
// ============================================================================
const UserProfileManager = {
  profile: {
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
  },

  init: async () => {
    let loadedFromServer = false;
    if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
      try {
        const res = await fetch('/api/user/profile');
        if (res.ok) {
          const data = await res.json();
          if (data && typeof data === 'object') {
            UserProfileManager.profile = {
              ...UserProfileManager.profile,
              ...data,
              settings: { ...UserProfileManager.profile.settings, ...(data.settings || {}) },
              category_overrides: { ...(data.category_overrides || {}) },
              cached_media_registry: { ...(data.cached_media_registry || {}) }
            };
            if (Array.isArray(data.custom_clips)) {
              UserProfileManager.profile.custom_clips = data.custom_clips;
            }
            loadedFromServer = true;
            console.log('[UserProfileManager] Perfil centralizado carregado do servidor (penumbra_user_profile.json)');
          }
        }
      } catch (e) {}
    }

    if (!loadedFromServer) {
      try {
        const raw = localStorage.getItem('penumbra_user_profile');
        if (raw) {
          const data = JSON.parse(raw);
          if (data && typeof data === 'object') {
            UserProfileManager.profile = {
              ...UserProfileManager.profile,
              ...data,
              settings: { ...UserProfileManager.profile.settings, ...(data.settings || {}) },
              category_overrides: { ...(data.category_overrides || {}) },
              cached_media_registry: { ...(data.cached_media_registry || {}) }
            };
            if (Array.isArray(data.custom_clips)) {
              UserProfileManager.profile.custom_clips = data.custom_clips;
            }
          }
        }
      } catch (e) {}
    }

    UserProfileManager.applyCategoryOverrides();
    UserProfileManager.rehydrateCustomClips();
    UserProfileManager.updateCacheUI();
  },

  save: (syncServer = true) => {
    try {
      UserProfileManager.profile.last_saved = new Date().toISOString();
      localStorage.setItem('penumbra_user_profile', JSON.stringify(UserProfileManager.profile));
      if (syncServer && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
        fetch('/api/user/profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(UserProfileManager.profile)
        }).catch(() => {});
      }
      UserProfileManager.updateCacheUI();
    } catch (e) {}
  },

  getSetting: (key, fallback = null) => {
    return (UserProfileManager.profile.settings && UserProfileManager.profile.settings[key] !== undefined)
      ? UserProfileManager.profile.settings[key]
      : fallback;
  },

  setSetting: (key, val) => {
    if (!UserProfileManager.profile.settings) UserProfileManager.profile.settings = {};
    UserProfileManager.profile.settings[key] = val;
    UserProfileManager.save(true);
  },

  applyCategoryOverrides: () => {
    if (!UserProfileManager.profile.category_overrides) return;
    const overrides = UserProfileManager.profile.category_overrides;
    allClips.forEach(c => {
      if (overrides[c.id]) {
        c.category = overrides[c.id];
        if (c.category === 'CHROMA') c.has_chroma = true;
      }
    });
  },

  rehydrateCustomClips: () => {
    if (!Array.isArray(UserProfileManager.profile.custom_clips)) return;
    UserProfileManager.profile.custom_clips.forEach(c => {
      if (!allClips.some(existing => existing.id === c.id || existing.filename === c.filename)) {
        allClips.unshift(c);
      }
    });
  },

  isClipCached: (clip) => {
    if (!clip) return false;
    if (clip.has_local_match) return true;
    if (clip.is_local && MediaProvider.mode === 'local') return true;
    if (clip.is_downloaded) return true;
    const reg = UserProfileManager.profile.cached_media_registry || {};
    if (reg[clip.id] && reg[clip.id].is_downloaded) return true;
    if (reg[clip.filename] && reg[clip.filename].is_downloaded) return true;
    const baseName = clip.relative_path ? clip.relative_path.split('/').pop() : '';
    if (baseName && reg[baseName] && reg[baseName].is_downloaded) return true;
    return false;
  },

  getCacheDetails: (clip) => {
    if (!clip) return { isCached: false, size_mb: 0 };
    if (clip.has_local_match) {
      return { isCached: true, size_mb: clip.size_mb || 0, isLocalMatch: true, local_path: clip.local_match_rel || clip.filename };
    }
    const reg = UserProfileManager.profile.cached_media_registry || {};
    const item = reg[clip.id] || reg[clip.filename] || (clip.relative_path ? reg[clip.relative_path.split('/').pop()] : null);
    if (item && item.is_downloaded) {
      return { isCached: true, size_mb: item.size_mb || clip.size_mb || 0, local_path: item.local_path, isLocalMatch: Boolean(item.is_local_match) };
    }
    if (clip.is_downloaded) {
      return { isCached: true, size_mb: clip.size_mb || 0, local_path: clip.relative_path };
    }
    if (clip.is_local && MediaProvider.mode === 'local') {
      return { isCached: true, size_mb: clip.size_mb || 0, local_path: clip.absolute_path || clip.relative_path };
    }
    return { isCached: false, size_mb: clip.size_mb || 0 };
  },

  updateCacheUI: () => {
    const reg = UserProfileManager.profile.cached_media_registry || {};
    const cachedItems = Object.values(reg).filter(v => v.is_downloaded);
    const totalCachedMb = cachedItems.reduce((acc, it) => acc + (it.size_mb || 0), 0);
    const matchedCount = allClips.filter(c => c.has_local_match).length;
    const offlineClipsCount = allClips.filter(c => UserProfileManager.isClipCached(c)).length;
    const remoteClipsCount = Math.max(0, allClips.length - offlineClipsCount);

    const lblCacheStats = document.getElementById('lbl-cache-stats');
    if (lblCacheStats) {
      lblCacheStats.textContent = `💾 ${offlineClipsCount} DISP. LOCAL (${matchedCount} NATIVOS) · ☁️ ${remoteClipsCount} NUVEM`;
    }

    const badgeCacheSize = document.getElementById('cfg-cache-size-badge');
    if (badgeCacheSize) {
      badgeCacheSize.textContent = `${Math.round(totalCachedMb * 10) / 10} MB EM CACHE WEB`;
    }

    const dedupVal = document.getElementById('cfg-dedup-stats-val');
    if (dedupVal) {
      dedupVal.textContent = `${matchedCount} / ${allClips.length} VINCULADOS NATIVAMENTE`;
    }

    const quotaDesc = document.getElementById('cfg-cache-quota-desc');
    if (quotaDesc) {
      const localCount = MediaProvider.localFilesByName ? MediaProvider.localFilesByName.size : 0;
      quotaDesc.textContent = `Web Cache API: ${cachedItems.length} ativos · Local SSD: ${localCount} indexados · Zero consumo de dados nos arquivos locais.`;
    }

    const chkDedup = document.getElementById('chk-smart-dedup-enabled');
    if (chkDedup) {
      chkDedup.checked = UserProfileManager.getSetting('smart_dedup_enabled', true);
    }

    const chkStreamOnDemand = document.getElementById('chk-stream-on-demand');
    if (chkStreamOnDemand) {
      chkStreamOnDemand.checked = UserProfileManager.getSetting('stream_on_demand', true);
    }

    const lblLastSaved = document.getElementById('cfg-profile-last-saved');
    if (lblLastSaved && UserProfileManager.profile.last_saved) {
      const d = new Date(UserProfileManager.profile.last_saved);
      lblLastSaved.textContent = d.toLocaleString();
    }

    const lblCustomCount = document.getElementById('cfg-profile-custom-count');
    if (lblCustomCount) {
      lblCustomCount.textContent = (UserProfileManager.profile.custom_clips || []).length;
    }

    const lblCatCount = document.getElementById('cfg-profile-cat-count');
    if (lblCatCount) {
      lblCatCount.textContent = Object.keys(UserProfileManager.profile.category_overrides || {}).length;
    }
  }
};
window.UserProfileManager = UserProfileManager;

function saveCustomClipsToStorage() {
  try {
    const custom = allClips.filter(c => c.is_stream || c.is_downloaded || c.id.startsWith('stream_') || c.id.startsWith('clip_dl_'));
    UserProfileManager.profile.custom_clips = custom;
    UserProfileManager.save(true);
    localStorage.setItem('penumbra_custom_clips', JSON.stringify(custom));
  } catch (e) {}
}

function loadCustomClipsFromStorage() {
  UserProfileManager.rehydrateCustomClips();
}

function getClipSource(clip) {
  if (clip.is_generative || clip.id === 'clip_gen_plexus_spine') return 'generative';
  if (clip.is_stream || clip.id.startsWith('stream_') || (clip.relative_path && (clip.relative_path.startsWith('http://') || clip.relative_path.startsWith('https://')))) {
    return isYouTubeUrl(clip.relative_path || clip.filename) ? 'youtube' : 'stream';
  }
  if (clip.is_downloaded || (clip.relative_path && clip.relative_path.startsWith('downloads/'))) {
    return 'downloaded';
  }
  if (clip.is_local || clip.id.startsWith('local_')) return 'local';
  return 'cdn';
}

function updateCategoryAndSourceBadges() {
  const countsSrc = { ALL: allClips.length, cdn: 0, local: 0, stream: 0 };

  allClips.forEach(c => {
    const src = getClipSource(c);
    if (src === 'cdn') {
      countsSrc.cdn++;
      if (c.has_local_match) {
        countsSrc.local++;
      }
    } else if (src === 'local' || src === 'downloaded') {
      countsSrc.local++;
    } else if (src === 'youtube' || src === 'stream') {
      countsSrc.stream++;
    }
  });

  const setTxt = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
  setTxt('badge-count-src-all', countsSrc.ALL);
  setTxt('badge-count-src-cdn', countsSrc.cdn);
  setTxt('badge-count-src-local', countsSrc.local);
  setTxt('badge-count-src-stream', countsSrc.stream);
}

window.setClipCategory = function(clipId, newCat) {
  const clip = allClips.find(c => c.id === clipId);
  if (!clip) return;
  clip.category = newCat;
  if (clip.has_chroma && newCat !== 'CHROMA') clip.has_chroma = false;
  if (newCat === 'CHROMA') clip.has_chroma = true;

  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    fetch(`/api/clips/${clipId}/category`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: newCat })
    }).catch(() => {});
  }
  saveCustomClipsToStorage();
  renderMediaCards();
};

window.openCategorySelector = function(clipId, event) {
  if (event) event.stopPropagation();
  const clip = allClips.find(c => c.id === clipId);
  if (!clip) return;

  const categories = ['MINIMAL', 'ABSTRACT', 'FIGURA', 'DENSE', 'CHROMA', 'STREAMS & YOUTUBE', 'GENERATIVE'];
  const newCat = prompt(`Alterar categoria do clipe "${clip.filename}":\n\nCategorias disponíveis:\n${categories.join(' · ')}`, clip.category || 'MINIMAL');
  if (newCat && categories.includes(newCat.trim().toUpperCase())) {
    window.setClipCategory(clipId, newCat.trim().toUpperCase());
  } else if (newCat && newCat.trim()) {
    window.setClipCategory(clipId, newCat.trim().toUpperCase());
  }
};

window.downloadStreamClip = function(clipId, event) {
  if (event) event.stopPropagation();
  const clip = allClips.find(c => c.id === clipId);
  if (!clip) return;
  const targetUrl = clip.stream_url || clip.relative_path || clip.filename;
  ingestStreamMedia(targetUrl, clip.category, clip.filename, 'download');
};

async function ingestStreamMedia(rawUrl, targetCategory, customTitle, mode = 'stream') {
  const url = (rawUrl || '').trim();
  if (!url) {
    alert('Por favor, informe uma URL válida.');
    return;
  }
  const category = targetCategory || 'STREAMS & YOUTUBE';
  const title = (customTitle || '').trim();
  const progressWrap = document.getElementById('mid-yt-progress-strip') || document.getElementById('nsd-progress-wrap');
  const progressStatus = document.getElementById('mid-yt-progress-status') || document.getElementById('nsd-progress-status');
  const progressMetrics = document.getElementById('mid-yt-progress-metrics') || document.getElementById('nsd-progress-metrics');
  const progressBar = document.getElementById('mid-yt-progress-bar') || document.getElementById('nsd-progress-bar');

  if (progressWrap) progressWrap.style.display = 'block';
  if (progressStatus) progressStatus.textContent = mode === 'download' ? 'INICIANDO DOWNLOAD NO SERVIDOR...' : 'CONECTANDO FEED EXTERNO...';
  if (progressBar) progressBar.style.width = '35%';

  const isServerAvailable = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  if (mode === 'download' && isServerAvailable) {
    try {
      const res = await fetch('/api/stream/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, category, title })
      });
      const data = await res.json();
      if (data.success) {
        if (progressStatus) progressStatus.textContent = 'DOWNLOAD EM ANDAMENTO...';
        console.log('[Nexus Downloader] Job iniciado:', data.jobId);
      } else {
        throw new Error(data.error || 'Falha ao iniciar download');
      }
    } catch (err) {
      console.warn('[Nexus Downloader] Erro no servidor:', err);
      if (progressStatus) progressStatus.textContent = 'ERRO NO DOWNLOAD: ' + err.message;
    }
  } else if (mode === 'stream' && isServerAvailable) {
    try {
      const res = await fetch('/api/stream/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      const data = await res.json();
      if (data.success) {
        const streamClip = {
          id: `stream_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          filename: title || data.title || url,
          folder: "YOUTUBE & STREAMS",
          relative_path: url,
          stream_url: data.streamUrl || url,
          category: category,
          suggested_layer: 0,
          has_chroma: false,
          is_stream: true,
          thumbnail: data.thumbnail || '',
          duration: data.duration || 9999,
          fps: 30,
          width: 1920,
          height: 1080,
          notes: `Stream ativo: ${url}`,
          project: "Feeds Externos",
          project_folder: "STREAM",
          source: data.is_youtube ? 'youtube' : 'stream',
          youtube_id: data.videoId || null
        };
        allClips.unshift(streamClip);
        saveCustomClipsToStorage();
        renderMediaCards();
        if (progressWrap) progressWrap.style.display = 'none';
        console.log('[✓] Stream conectado com sucesso ao Media Pool:', streamClip);
      } else {
        throw new Error('Falha ao resolver stream');
      }
    } catch (err) {
      console.warn('[Nexus Stream] Falha ao resolver via servidor, fallback direto:', err);
      createDirectStreamClip(url, category, title);
    }
  } else {
    createDirectStreamClip(url, category, title);
  }
}

function createDirectStreamClip(url, category, customTitle) {
  const isYt = isYouTubeUrl(url);
  const ytId = extractYouTubeId(url);
  const cleanTitle = customTitle || (isYt ? `YouTube [${ytId}]` : (url.split('/').pop().split('?')[0] || 'Stream Feed'));
  const thumbUrl = isYt ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : '';

  const streamClip = {
    id: `stream_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    filename: cleanTitle,
    folder: "YOUTUBE & STREAMS",
    relative_path: url,
    stream_url: url,
    category: category || 'STREAMS & YOUTUBE',
    suggested_layer: 0,
    has_chroma: false,
    is_stream: true,
    thumbnail: thumbUrl,
    duration: 9999,
    fps: 30,
    width: 1920,
    height: 1080,
    notes: `Stream ingest: ${url}`,
    project: "Feeds Externos",
    project_folder: "STREAM",
    source: isYt ? 'youtube' : 'stream',
    youtube_id: ytId
  };

  allClips.unshift(streamClip);
  saveCustomClipsToStorage();
  renderMediaCards();
  const progressWrap = document.getElementById('nsd-progress-wrap');
  if (progressWrap) progressWrap.style.display = 'none';
}

window.cacheMediaClip = async function(clipId, event) {
  if (event) event.stopPropagation();
  const clip = allClips.find(c => c.id === clipId);
  if (!clip) return;

  const btn = event?.currentTarget;
  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳ ATIVANDO...';
  }

  // 1. If clip has local match on machine SSD, activate 100% locally with zero latency!
  if (clip.has_local_match) {
    clip.is_downloaded = true;
    if (!UserProfileManager.profile.cached_media_registry) UserProfileManager.profile.cached_media_registry = {};
    UserProfileManager.profile.cached_media_registry[clip.id] = {
      filename: clip.filename,
      local_path: clip.local_match_rel || clip.filename,
      size_mb: clip.size_mb || 0,
      is_downloaded: true,
      is_local_match: true
    };
    UserProfileManager.save(false);
    renderMediaCards();
    UserProfileManager.updateCacheUI();
    console.log(`[⚡ Dedup] Clipe "${clip.filename}" ativado instantaneamente via SSD local.`);
    return;
  }

  // 2. Node server controller endpoint download if available
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    try {
      const mediaUrl = MediaProvider.getMediaUrl(clip);
      const res = await fetch('/api/cache/download-clip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clipId: clip.id,
          url: mediaUrl,
          filename: clip.filename,
          category: clip.category
        })
      });
      const data = await res.json();
      if (data.success) {
        clip.is_downloaded = true;
        clip.relative_path = data.local_path;
        if (!UserProfileManager.profile.cached_media_registry) UserProfileManager.profile.cached_media_registry = {};
        UserProfileManager.profile.cached_media_registry[clip.id] = {
          filename: clip.filename,
          local_path: data.local_path,
          size_mb: data.size_mb,
          is_downloaded: true
        };
        UserProfileManager.save(false);
        renderMediaCards();
        UserProfileManager.updateCacheUI();
        console.log(`[✓] Clipe ${clip.filename} salvo no cache local.`);
        return;
      }
    } catch (e) {
      console.warn('[Cache] Erro no download do servidor, usando Web Cache API:', e);
    }
  }

  // 3. Persistent Web Cache Storage API + IndexedDB Fallback (Zero-Waste)
  try {
    const streamUrl = clip.stream_url || `https://gigantera-penumbra.b-cdn.net/${encodeURIComponent(clip.relative_path || clip.filename)}`;
    const cachedBlobUrl = await PenumbraMediaCache.cacheMedia(clip.id, streamUrl);
    clip.is_downloaded = true;
    if (!UserProfileManager.profile.cached_media_registry) UserProfileManager.profile.cached_media_registry = {};
    UserProfileManager.profile.cached_media_registry[clip.id] = {
      filename: clip.filename,
      local_path: cachedBlobUrl || streamUrl,
      size_mb: clip.size_mb || 25,
      is_downloaded: true,
      is_browser_cache: true
    };
    UserProfileManager.save(true);
    renderMediaCards();
    UserProfileManager.updateCacheUI();
    console.log(`[✓] Clipe ${clip.filename} salvo no Web Cache persistente.`);
  } catch (err) {
    console.warn('[Cache] Falha no Web Cache:', err);
    if (btn) {
      btn.disabled = false;
      btn.textContent = '⚡ ATIVAR';
    }
  }
};
window.activateMediaClip = window.cacheMediaClip;

window.toggleSmartDedup = function(enabled) {
  UserProfileManager.setSetting('smart_dedup_enabled', enabled);
  MediaProvider.syncSmartDeduplication();
  renderMediaCards();
  UserProfileManager.updateCacheUI();
};

window.toggleStreamOnDemand = function(enabled) {
  UserProfileManager.setSetting('stream_on_demand', enabled);
  UserProfileManager.updateCacheUI();
};

window.clearMediaCache = async function() {
  if (!confirm('Deseja realmente limpar todo o cache local de mídia? Clipes na nuvem precisarão ser transmitidos novamente.')) return;
  await PenumbraMediaCache.clearAll();
  if (UserProfileManager.profile.cached_media_registry) {
    UserProfileManager.profile.cached_media_registry = {};
  }
  allClips.forEach(c => {
    if (c.is_downloaded && !c.is_local && !c.has_local_match) {
      c.is_downloaded = false;
    }
  });
  UserProfileManager.save(true);
  MediaProvider.syncSmartDeduplication();
  renderMediaCards();
  UserProfileManager.updateCacheUI();
  alert('Cache de mídias limpo com sucesso.');
};

window.refreshCacheStatus = async function() {
  await PenumbraMediaCache.getStats();
  await MediaProvider.initLocalFilesAutoIndex();
  MediaProvider.syncSmartDeduplication();
  UserProfileManager.updateCacheUI();
  renderMediaCards();
};

window.setFolderFilter = function(folder) {
  activeFolderFilter = folder;
  renderFolderPills();
  renderMediaCards();
};

window.exportUserProfile = function() {
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    window.location.href = '/api/user/profile/export';
    return;
  }
  const jsonStr = JSON.stringify(UserProfileManager.profile, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'penumbra_user_profile.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

window.importUserProfileFromFile = function(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data || typeof data !== 'object') throw new Error('Formato inválido');

      UserProfileManager.profile = {
        ...UserProfileManager.profile,
        ...data,
        settings: { ...UserProfileManager.profile.settings, ...(data.settings || {}) },
        category_overrides: { ...(data.category_overrides || {}) },
        cached_media_registry: { ...(data.cached_media_registry || {}) }
      };
      if (Array.isArray(data.custom_clips)) {
        UserProfileManager.profile.custom_clips = data.custom_clips;
      }
      UserProfileManager.save(true);
      UserProfileManager.applyCategoryOverrides();
      UserProfileManager.rehydrateCustomClips();
      renderFolderPills();
      renderMediaCards();
      alert('✓ Perfil do usuário importado e restaurado com sucesso!');
    } catch (err) {
      alert(`Falha ao importar perfil: ${err.message}`);
    }
  };
  reader.readAsText(file);
};

window.openCacheProfileSettings = function() {
  openSettingsModal();
  setSettingsTab('profile');
};

window.refreshCacheStatus = async function() {
  await UserProfileManager.init();
  renderMediaCards();
};

window.toggleHoverPreview = function(enabled) {
  UserProfileManager.setSetting('hover_preview_enabled', Boolean(enabled));
};

window.downloadAllPendingClips = async function() {
  const unCached = allClips.filter(c => !UserProfileManager.isClipCached(c) && !c.is_generative);
  if (unCached.length === 0) {
    alert('Todos os clipes já estão baixados e cacheados localmente no seu computador!');
    return;
  }
  const confirmDl = confirm(`Deseja iniciar o download de ${unCached.length} clipes para o cache local permanente?`);
  if (!confirmDl) return;

  for (const c of unCached) {
    try {
      await window.cacheMediaClip(c.id);
    } catch (e) {}
  }
  alert('Processamento de download em lote concluído!');
};

function createMediaCardElement(clip) {
  const card = document.createElement('div');
  const isGen = Boolean(clip.is_generative || clip.id === 'clip_gen_plexus_spine');
  const clipSource = getClipSource(clip);
  card.className = `media-card ${isGen ? 'is-generative' : ''} source-${clipSource}`;
  const thumbSrc = MediaProvider.getThumbUrl(clip);
  const animSrc = MediaProvider.getPreviewAnimUrl(clip) || thumbSrc;
  const projName = clip.project || '1.In';

  let srcBadgeHtml = '';
  if (clip.has_local_match) {
    srcBadgeHtml = '<span class="media-source-badge badge-source-local-match" title="Arquivo idêntico encontrado no SSD local da máquina (0ms latência, 0 dados consumidos)">⚡ LOCAL NATIVO</span>';
  } else if (clipSource === 'cdn') {
    srcBadgeHtml = '<span class="media-source-badge badge-source-cdn">☁️ NUVEM</span>';
  } else if (clipSource === 'local') {
    srcBadgeHtml = '<span class="media-source-badge badge-source-local">📁 SSD LOCAL</span>';
  } else if (clipSource === 'downloaded') {
    srcBadgeHtml = '<span class="media-source-badge badge-source-dl">💾 BAIXADO</span>';
  } else if (clipSource === 'youtube') {
    srcBadgeHtml = '<span class="media-source-badge badge-source-yt">YOUTUBE</span>';
  } else if (clipSource === 'stream') {
    srcBadgeHtml = '<span class="media-source-badge badge-source-stream">STREAM</span>';
  }

  // Cache Status Check
  const cacheInfo = UserProfileManager.getCacheDetails(clip);
  let cacheBadgeHtml = '';
  if (clip.has_local_match) {
    cacheBadgeHtml = `<span class="badge-cache-status is-local-match" title="Disponível no SSD local em ${clip.local_match_rel || '1. In'}">LOCAL 100%</span>`;
  } else if (cacheInfo.isCached) {
    cacheBadgeHtml = `<span class="badge-cache-status is-cached" title="Salvo em disco no cache local (${cacheInfo.size_mb || '0'} MB)">CACHED</span>`;
  } else if (clipSource === 'cdn') {
    cacheBadgeHtml = `<span class="badge-cache-status not-cached" title="Disponível na Nuvem Bunny CDN (Preview inicial leve)">PREVIEW</span>`;
  } else if (clipSource === 'youtube' || clipSource === 'stream') {
    cacheBadgeHtml = `<span class="badge-cache-status is-stream" title="Disponível via Stream Remoto">LIVE</span>`;
  }

  const clipFolder = getClipFolder(clip);
  const folderBadgeHtml = isGen 
    ? `<span class="badge-generative">3D GENERATIVE</span>`
    : `<span class="media-folder-badge" onclick="event.stopPropagation(); setFolderFilter('${clipFolder}')" title="Filtrar por esta pasta: ${clipFolder}">📁 ${clipFolder}</span>`;

  let actionBtnHtml = '';
  if (clip.has_local_match) {
    actionBtnHtml = `<button class="btn-route btn-card-activate is-active-cached" title="Arquivo disponível no SSD local da sua máquina. 0 dados consumidos." onclick="event.stopPropagation();">✓ LOCAL</button>`;
  } else if (cacheInfo.isCached) {
    actionBtnHtml = `<button class="btn-route btn-card-activate is-active-cached" title="Clipe ativo em cache persistente local." onclick="event.stopPropagation();">✓ ATIVO</button>`;
  } else if (clipSource === 'cdn' || clipSource === 'youtube' || clipSource === 'stream') {
    actionBtnHtml = `<button class="btn-route btn-card-activate" onclick="window.activateMediaClip('${clip.id}', event)" title="Ativar clipe: Streaming em alta resolução & salva em cache persistente">⚡ ATIVAR</button>`;
  }

  card.innerHTML = `
    <div class="media-card-thumb">
      ${thumbSrc ? `<img src="${thumbSrc}" loading="lazy" alt="${clip.filename}" data-static="${thumbSrc}" data-anim="${animSrc}" class="dynamic-preview-img">` : '<div class="no-thumb">RAW 1.IN</div>'}
      ${srcBadgeHtml}
      ${cacheBadgeHtml}
      ${folderBadgeHtml}
    </div>
    <div class="media-card-info">
      <div class="media-card-title" title="${clip.filename}">
        <span class="media-project-badge">${projName}</span>${clip.display_title || clip.filename}
      </div>
      <div class="media-card-meta">${isGen ? '2.545 VÉRTICES · HOUDINI GENERATIVE MARINE SPINE · 60 FPS' : `${clip.project_folder || projName} · ${clip.width || '1920'}×${clip.height || '1080'} · ${clip.duration ? Math.round(clip.duration) + 's' : 'LOOP'}`}</div>
      <div class="card-actions-row">
        <button class="btn-route btn-bus-a" data-bus="A" data-tooltip-title="ENVIAR PARA PROGRAM (A)" data-tooltip-desc="Comuta para o telão/Program. Pressione [A]." data-shortcut="A">A PGM</button>
        <button class="btn-route btn-bus-b" data-bus="B" data-tooltip-title="PREPARAR NO PREVIEW (B)" data-tooltip-desc="Arma no Preview Cue para o próximo take. Pressione [B]." data-shortcut="B">B PRV</button>
        <button class="btn-route btn-edit-clip-tonal" onclick="event.stopPropagation(); editClipTonalParameters('${clip.id}')" title="Ajustar Color Grading e Look Tonal no Módulo 4">LOOK</button>
        <button class="btn-route" data-layer="layer4" data-tooltip-title="CAMADA 4 (DROP CLÍMAX)" data-tooltip-desc="Arma clipe para sobreposição na camada de impacto do drop.">L4</button>
        ${actionBtnHtml}
      </div>
    </div>
  `;

  // ON-DEMAND HOVER VIDEO PREVIEW (Netflix / Steam / YouTube Standard)
  let hoverTimeout = null;
  let hoverVideoEl = null;

  card.addEventListener('mouseenter', () => {
    focusedClipId = clip.id;
    const img = card.querySelector('.dynamic-preview-img');
    if (img && img.dataset.anim) img.src = img.dataset.anim;

    const hoverEnabled = UserProfileManager.getSetting('hover_preview_enabled', true);
    if (!hoverEnabled || isGen) return;

    const delayMs = UserProfileManager.getSetting('hover_preview_delay_ms', 280);
    hoverTimeout = setTimeout(() => {
      const videoUrl = MediaProvider.getMediaUrl(clip);
      if (!videoUrl) return;

      const thumbContainer = card.querySelector('.media-card-thumb');
      if (!thumbContainer || thumbContainer.querySelector('.card-hover-video')) return;

      hoverVideoEl = document.createElement('video');
      hoverVideoEl.className = 'card-hover-video';
      hoverVideoEl.muted = true;
      hoverVideoEl.playsInline = true;
      hoverVideoEl.loop = true;
      hoverVideoEl.preload = 'metadata';
      hoverVideoEl.src = videoUrl;

      hoverVideoEl.oncanplay = () => {
        if (hoverVideoEl) {
          hoverVideoEl.play().catch(() => {});
          hoverVideoEl.classList.add('is-active');
        }
      };

      thumbContainer.appendChild(hoverVideoEl);
    }, delayMs);
  });

  card.addEventListener('mouseleave', () => {
    const img = card.querySelector('.dynamic-preview-img');
    if (img && img.dataset.static) img.src = img.dataset.static;

    if (hoverTimeout) {
      clearTimeout(hoverTimeout);
      hoverTimeout = null;
    }
    if (hoverVideoEl) {
      hoverVideoEl.pause();
      hoverVideoEl.removeAttribute('src');
      hoverVideoEl.load();
      hoverVideoEl.remove();
      hoverVideoEl = null;
    }
    const stray = card.querySelectorAll('.card-hover-video');
    stray.forEach(v => {
      v.pause();
      v.removeAttribute('src');
      v.load();
      v.remove();
    });
  });

  const btnA = card.querySelector('.btn-bus-a');
  if (btnA) {
    btnA.addEventListener('click', (e) => {
      e.stopPropagation();
      routeClipToBus(clip.id, 'A');
    });
  }

  const btnB = card.querySelector('.btn-bus-b');
  if (btnB) {
    btnB.addEventListener('click', (e) => {
      e.stopPropagation();
      routeClipToBus(clip.id, 'B');
    });
  }

  const btnL4 = card.querySelector('[data-layer="layer4"]');
  if (btnL4) {
    btnL4.addEventListener('click', (e) => {
      e.stopPropagation();
      appState.layers.layer4.clipId = clip.id;
      appState.layers.layer4.name = clip.filename;
      sendAction('cue_clip', { layer: 'layer4', clipId: clip.id, name: clip.filename });
      updateUI();
      syncVideoSources();
    });
  }

  card.addEventListener('click', () => {
    routeClipToBus(clip.id, 'B');
  });

  return card;
}

// ============================================================================
// UNIVERSAL CREATIVE ASSET LIBRARY (VIDEOS, MATTES, FX & PRESETS)
// ============================================================================
let activeLibraryAssetType = 'all'; // 'all' | 'clips' | 'mattes' | 'fx' | 'presets'

const FX_LIBRARY_CATALOG = {
  pixel_stretch: { title: 'Pixel Stretch (Satori)', summary: 'Alongamento subpixel não-linear por luminância e canais RGBA.', icon: '🌌' },
  pixel_sorter: { title: 'Pixel Sorter 3 (Wunkolo)', summary: 'Ordenação de pixels por threshold de brilho sincronizada ao beat.', icon: '📶' },
  bad_tv: { title: 'Bad TV (Motion Boutique)', summary: 'Distorção de tubo catódico analógico, scanlines CRT e ruído VHS.', icon: '📺' },
  rxxr: { title: 'Rxxr2 (Defcon)', summary: 'Glitch cibernético avançado, deslocamento RGB e estilhaçamento de blocos.', icon: '⚡' },
  modulation: { title: 'Modulation (Zaebects)', summary: 'Distorção analógica baseada em ondas oscilatórias e offset CMYK.', icon: '〰️' }
};

const PRESETS_LIBRARY_CATALOG = {
  ambient_drift: { title: 'Ambient Drift', desc: 'Base hipnótica profunda, transições longas e saturação controlada.', icon: '🌙', bpm: '118 BPM' },
  pixel_melt_drop: { title: 'Pixel Melt Drop', desc: 'Clímax agressivo com disparo automático no drop e modulação L1.', icon: '🔥', bpm: '132 BPM' },
  cyber_matrix: { title: 'Cyber Matrix RXXR', desc: 'Estética industrial de alta frequência com glitch estocástico.', icon: '👾', bpm: '130 BPM' },
  satori_stretch: { title: 'Satori Stretch', desc: 'Distorção cósmica subpixel sincronizada com acentos rítmicos.', icon: '✨', bpm: '126 BPM' },
  zaebects_cmyk: { title: 'Zaebects CMYK', desc: 'Deslocamento cromático analógico e texturas retrô de fita.', icon: '🎞️', bpm: '124 BPM' },
  bypass_clean: { title: 'Bypass Clean', desc: 'Sinal 100% puro para exibição direta das mídias originais.', icon: '💎', bpm: 'N/A' }
};

function selectLibraryAssetType(type) {
  activeLibraryAssetType = type;
  document.querySelectorAll('.lib-type-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.assetType === type);
  });

  const sourceStrip = document.querySelector('.pool-source-strip');
  const catStrip = document.querySelector('.pool-category-strip');
  const folderStrip = document.querySelector('.pool-folder-strip');

  if (sourceStrip) sourceStrip.style.display = (type === 'all' || type === 'clips') ? 'flex' : 'none';
  if (catStrip) catStrip.style.display = (type === 'all' || type === 'clips') ? 'flex' : 'none';
  if (folderStrip) folderStrip.style.display = (type === 'all' || type === 'clips') ? 'flex' : 'none';

  if (typeof UserProfileManager !== 'undefined') {
    UserProfileManager.setSetting('library_active_asset_type', type);
  }

  renderMediaCards();
}
window.selectLibraryAssetType = selectLibraryAssetType;

function createMatteCardForLibrary(matte) {
  const card = document.createElement('div');
  card.className = 'library-card-matte';
  const targetL = appState.matte_target_layer || 'layer3';

  card.innerHTML = `
    <div class="library-card-thumb-wrap">
      <img src="/mattes/${matte.path}" loading="lazy" alt="${matte.name}">
      <span class="lib-badge-type lib-badge-matte">MATTE</span>
    </div>
    <div class="library-card-info">
      <div class="library-card-title">${matte.name}</div>
      <div class="library-card-desc">${matte.description || matte.category}</div>
    </div>
    <div class="library-card-actions">
      <button class="btn btn-outline btn-xs" onclick="event.stopPropagation(); onLayerMatteChange('layer0', '${matte.path}')" title="Aplicar no Layer 0 (Master Base)">→ L0</button>
      <button class="btn btn-outline btn-xs" onclick="event.stopPropagation(); onLayerMatteChange('layer1', '${matte.path}')" title="Aplicar no Layer 1 (Reflexo)">→ L1</button>
      <button class="btn btn-primary btn-xs" onclick="event.stopPropagation(); onLayerMatteChange('layer3', '${matte.path}')" title="Aplicar no Layer 3 (Cue Deck B)">→ L3</button>
      <button class="btn-edit-params btn-xs" onclick="event.stopPropagation(); editMatteParameters('${matte.path}', '${matte.name}')" title="Editar parâmetros e cinemática no Módulo 3">PARÂMETROS</button>
    </div>
  `;

  card.addEventListener('click', () => {
    editMatteParameters(matte.path, matte.name);
  });

  return card;
}

function createFxCardForLibrary(pluginId, pluginInfo) {
  const card = document.createElement('div');
  card.className = 'library-card-fx';
  const isAct = Boolean(appState.fx?.enabled && appState.fx?.activeEffect === pluginId);

  card.innerHTML = `
    <div class="library-card-thumb-wrap">
      <div class="library-card-fx-preview">${pluginInfo.code || pluginId.slice(0, 4).toUpperCase()}</div>
      <span class="lib-badge-type lib-badge-fx">FX SHADER</span>
    </div>
    <div class="library-card-info">
      <div class="library-card-title">${pluginInfo.title}</div>
      <div class="library-card-desc">${pluginInfo.summary}</div>
    </div>
    <div class="library-card-actions">
      <button class="btn ${isAct ? 'btn-primary' : 'btn-outline'} btn-xs" onclick="event.stopPropagation(); selectFxPlugin('${pluginId}'); if(!appState.fx.enabled) toggleFxMaster();">
        ${isAct ? 'ATIVO' : '+ ATIVAR'}
      </button>
      <button class="btn btn-outline btn-xs" onclick="event.stopPropagation(); selectFxPlugin('${pluginId}'); setFxMasterParam('target', 'master');">→ MASTER</button>
      <button class="btn-edit-params btn-xs" onclick="event.stopPropagation(); editFxParameters('${pluginId}')" title="Editar parâmetros deste efeito no Módulo 6">PARÂMETROS</button>
    </div>
  `;

  card.addEventListener('click', () => {
    editFxParameters(pluginId);
  });

  return card;
}

function createPresetCardForLibrary(presetId, presetInfo) {
  const card = document.createElement('div');
  card.className = 'library-card-preset';

  card.innerHTML = `
    <div class="library-card-thumb-wrap">
      <div class="library-card-preset-preview">
        <span style="font-family:var(--font-mono); font-size:16px; font-weight:800; color:var(--cyan);">${presetId.slice(0, 3).toUpperCase()}</span>
        <span style="font-family:var(--font-mono); font-size:9px; color:#fff; font-weight:700;">${presetInfo.bpm || 'AUTO BPM'}</span>
      </div>
      <span class="lib-badge-type lib-badge-preset">PRESET</span>
    </div>
    <div class="library-card-info">
      <div class="library-card-title">${presetInfo.title}</div>
      <div class="library-card-desc">${presetInfo.desc}</div>
    </div>
    <div class="library-card-actions">
      <button class="btn btn-studio-primary btn-xs" style="flex:1;" onclick="event.stopPropagation(); applyMacroPreset('${presetId}', 0, true);">
        CARREGAR
      </button>
      <button class="btn-edit-params btn-xs" onclick="event.stopPropagation(); editPresetParameters('${presetId}')" title="Editar parâmetros no Conductor (Módulo 5)">
        EDITAR
      </button>
    </div>
  `;

  card.addEventListener('click', () => {
    editPresetParameters(presetId);
  });

  return card;
}

// ============================================================================
// ASSET PARAMETER EDIT NAVIGATION & QUICK INSPECTOR METHODS
// ============================================================================
function editMatteParameters(mattePath, matteName) {
  if (typeof setDockViewMode === 'function') setDockViewMode('modules');
  switchTab('tab-mattes');
  
  const targetL = appState.matte_target_layer || 'layer3';
  onLayerMatteChange(targetL, mattePath);

  if (typeof switchMatteSub === 'function') switchMatteSub('kinematics');

  const kinGrid = document.querySelector('#subview-kinematics .kinematics-dock-grid');
  if (kinGrid) {
    kinGrid.classList.remove('highlight-focus-ring');
    void kinGrid.offsetWidth;
    kinGrid.classList.add('highlight-focus-ring');
  }

  showMacroToast(`[MATTE] Editando parâmetros de "${matteName}" no Módulo 3`);
  openQuickInspector('matte', { path: mattePath, name: matteName });
}
window.editMatteParameters = editMatteParameters;

function editFxParameters(pluginId) {
  if (typeof setDockViewMode === 'function') setDockViewMode('modules');
  if (!appState.fx.enabled) toggleFxMaster();
  selectFxPlugin(pluginId);
  switchTab('tab-fx');

  const activeCard = document.getElementById(`card-fx-${pluginId}`);
  if (activeCard) {
    activeCard.classList.remove('highlight-focus-ring');
    void activeCard.offsetWidth;
    activeCard.classList.add('highlight-focus-ring');
  }

  const fxInfo = FX_LIBRARY_CATALOG[pluginId] || { title: pluginId };
  showMacroToast(`[FX ENGINE] Editando parâmetros de "${fxInfo.title}" no Módulo 6`);
  openQuickInspector('fx', { pluginId, info: fxInfo });
}
window.editFxParameters = editFxParameters;

function editPresetParameters(presetId) {
  if (typeof setDockViewMode === 'function') setDockViewMode('modules');
  applyMacroPreset(presetId, 0, true);
  switchTab('tab-conductor');

  const presetGrid = document.querySelector('#tab-conductor .macro-matrix-grid');
  if (presetGrid) {
    presetGrid.classList.remove('highlight-focus-ring');
    void presetGrid.offsetWidth;
    presetGrid.classList.add('highlight-focus-ring');
  }

  const pInfo = PRESETS_LIBRARY_CATALOG[presetId] || { title: presetId };
  showMacroToast(`[CONDUCTOR] Preset "${pInfo.title}" aberto para edição no Módulo 5`);
  openQuickInspector('preset', { presetId, info: pInfo });
}
window.editPresetParameters = editPresetParameters;

function editClipTonalParameters(clipId) {
  if (typeof setDockViewMode === 'function') setDockViewMode('modules');
  routeClipToBus(clipId, 'B');
  switchTab('tab-tonal');

  const tonalGrid = document.querySelector('#tab-tonal .tonal-controls-grid') || document.querySelector('#tab-tonal');
  if (tonalGrid) {
    tonalGrid.classList.remove('highlight-focus-ring');
    void tonalGrid.offsetWidth;
    tonalGrid.classList.add('highlight-focus-ring');
  }

  const clip = allClips.find(c => c.id === clipId);
  const title = clip?.display_title || clip?.filename || 'Clipe';
  showMacroToast(`[TONAL] Grading aberto para "${title}" no Módulo 4`);
  openQuickInspector('clip', { clipId, clip });
}
window.editClipTonalParameters = editClipTonalParameters;

function toggleLibrarySidebar() {
  const sb = document.getElementById('library-sidebar');
  if (!sb) return;
  const isCol = sb.classList.toggle('is-collapsed');
  const btn = document.getElementById('btn-toggle-sidebar');
  if (btn) btn.textContent = isCol ? '▸' : '◂';
  if (typeof UserProfileManager !== 'undefined') {
    UserProfileManager.setSetting('library_sidebar_collapsed', isCol);
  }
}
window.toggleLibrarySidebar = toggleLibrarySidebar;

function toggleTreeSection(headerEl) {
  if (!headerEl) return;
  const section = headerEl.closest('.lib-tree-section');
  if (section) section.classList.toggle('is-collapsed');
}
window.toggleTreeSection = toggleTreeSection;

let libraryViewMode = 'grid'; // 'grid' | 'compact'
function setLibraryViewMode(mode) {
  libraryViewMode = mode;
  const grid = document.getElementById('media-cards-container');
  if (grid) {
    grid.classList.toggle('view-compact', mode === 'compact');
  }
  document.getElementById('btn-view-grid')?.classList.toggle('active', mode === 'grid');
  document.getElementById('btn-view-compact')?.classList.toggle('active', mode === 'compact');
  if (typeof UserProfileManager !== 'undefined') {
    UserProfileManager.setSetting('library_view_mode', mode);
  }
}
window.setLibraryViewMode = setLibraryViewMode;

function toggleLibraryCategoryGrouping() {
  isGroupedByFolder = !isGroupedByFolder;
  const btn = document.getElementById('btn-toggle-group-categories');
  if (btn) {
    btn.classList.toggle('active', isGroupedByFolder);
    btn.innerHTML = isGroupedByFolder ? '<span>📁 PASTAS (BINS)</span>' : '<span>▦ GRID CONTÍNUO</span>';
  }
  const container = document.getElementById('media-cards-container');
  if (container) container.classList.toggle('is-grouped', isGroupedByFolder);
  renderMediaCards();
}
window.toggleLibraryCategoryGrouping = toggleLibraryCategoryGrouping;
window.toggleLibraryFolderGrouping = toggleLibraryCategoryGrouping;

function clearMediaSearch() {
  const inp = document.getElementById('input-media-search');
  if (inp) {
    inp.value = '';
    renderMediaCards();
    inp.focus();
  }
}
window.clearMediaSearch = clearMediaSearch;

function toggleQuickInspector(forceState) {
  const drawer = document.getElementById('library-quick-inspector');
  if (!drawer) return;
  const show = typeof forceState === 'boolean' ? forceState : (drawer.style.display === 'none');
  drawer.style.display = show ? 'flex' : 'none';
  document.getElementById('btn-toggle-inspector')?.classList.toggle('active', show);
}
window.toggleQuickInspector = toggleQuickInspector;

function openQuickInspector(assetType, data) {
  const drawer = document.getElementById('library-quick-inspector');
  const body = document.getElementById('lqi-body-content');
  const title = document.getElementById('lqi-asset-title');
  const icon = document.getElementById('lqi-asset-icon');
  if (!drawer || !body) return;

  drawer.style.display = 'flex';
  document.getElementById('btn-toggle-inspector')?.classList.add('active');

  if (assetType === 'matte') {
    if (icon) icon.textContent = '🎭';
    if (title) title.textContent = `MATTE: ${data.name || 'MÁSCARA'}`;
    body.innerHTML = `
      <div class="lqi-asset-card">
        <div class="lqi-label"><span>CAMADA ALVO</span><strong>${(appState.matte_target_layer || 'layer3').toUpperCase()}</strong></div>
        <div class="lqi-label"><span>ARQUIVO</span><small style="color:var(--cyan);">${data.path}</small></div>
        <button class="btn btn-outline btn-xs" style="width:100%; margin-top:4px;" onclick="toggleCurrentTargetMatteInvert()">
          INVERTER PRETO/BRANCO (INV)
        </button>
      </div>
      <div class="lqi-asset-card">
        <div class="lqi-label"><span>RESPIRAÇÃO (WIGGLE)</span><strong id="lqi-val-wiggle">6%</strong></div>
        <input type="range" class="pro-slider" min="0" max="30" value="6" oninput="const s = document.getElementById('slider-wiggle-scale'); if(s) { s.value = this.value; s.dispatchEvent(new Event('input')); } document.getElementById('lqi-val-wiggle').textContent = this.value + '%';">
      </div>
      <button class="lqi-action-btn-full" onclick="switchTab('tab-mattes')">
        ABRIR MÓDULO MATTES COMPLETO (TAB 3) ↗
      </button>
    `;
  } else if (assetType === 'fx') {
    const fxInfo = data.info || {};
    if (icon) icon.textContent = '⚡';
    if (title) title.textContent = `FX: ${fxInfo.title || data.pluginId}`;
    body.innerHTML = `
      <div class="lqi-asset-card">
        <div class="lqi-label"><span>ESTADO FX MASTER</span><strong>${appState.fx.enabled ? '🟢 ATIVO' : '🔴 DESLIGADO'}</strong></div>
        <button class="btn btn-primary btn-xs" style="width:100%; margin-top:4px;" onclick="toggleFxMaster(); openQuickInspector('fx', { pluginId: '${data.pluginId}', info: FX_LIBRARY_CATALOG['${data.pluginId}'] });">
          ${appState.fx.enabled ? 'DESLIGAR FX MASTER' : 'LIGAR FX MASTER'}
        </button>
      </div>
      <div class="lqi-asset-card">
        <div class="lqi-label"><span>DRY / WET (INTENSIDADE)</span><strong id="lqi-val-drywet">80%</strong></div>
        <input type="range" class="pro-slider" min="0" max="100" value="80" oninput="setFxMasterParam('masterIntensity', this.value / 100); document.getElementById('lqi-val-drywet').textContent = this.value + '%';">
      </div>
      <button class="lqi-action-btn-full" onclick="switchTab('tab-fx')">
        ABRIR FX ENGINE COMPLETO (TAB 6) ↗
      </button>
    `;
  } else if (assetType === 'preset') {
    const pInfo = data.info || {};
    if (icon) icon.textContent = '🎛️';
    if (title) title.textContent = `PRESET: ${pInfo.title || data.presetId}`;
    body.innerHTML = `
      <div class="lqi-asset-card">
        <div class="lqi-label"><span>TEMPO SUGERIDO</span><strong>${pInfo.bpm || 'AUTO'}</strong></div>
        <div class="lqi-label"><span>NARRATIVA</span><p style="font-size:8.5px; color:#9ea5b5; margin:0;">${pInfo.desc || ''}</p></div>
        <button class="btn btn-studio-primary btn-xs" style="width:100%; margin-top:6px;" onclick="applyMacroPreset('${data.presetId}', 0, true);">
          DISPARAR PRESET NO PROGRAM
        </button>
      </div>
      <button class="lqi-action-btn-full" onclick="switchTab('tab-conductor')">
        ABRIR AUTOPILOT CONDUCTOR (TAB 5) ↗
      </button>
    `;
  } else if (assetType === 'clip') {
    const clip = data.clip || allClips.find(c => c.id === data.clipId);
    if (icon) icon.textContent = '🎬';
    if (title) title.textContent = `CLIPE: ${clip?.display_title || clip?.filename || data.clipId}`;
    body.innerHTML = `
      <div class="lqi-asset-card">
        <div class="lqi-label"><span>ROTEAMENTO RÁPIDO</span></div>
        <div style="display:flex; gap:4px; margin-top:4px;">
          <button class="btn btn-outline btn-xs" style="flex:1;" onclick="routeClipToBus('${data.clipId}', 'A')">PGM (A)</button>
          <button class="btn btn-primary btn-xs" style="flex:1;" onclick="routeClipToBus('${data.clipId}', 'B')">PRV (B)</button>
        </div>
      </div>
      <button class="lqi-action-btn-full" onclick="switchTab('tab-tonal')">
        ABRIR GRADING TONAL (TAB 4) ↗
      </button>
    `;
  }
}
window.openQuickInspector = openQuickInspector;

function renderMediaCards() {
  const container = document.getElementById('media-cards-container');
  if (!container) return;
  container.innerHTML = '';

  updateCategoryAndSourceBadges();

  const searchVal = (document.getElementById('input-media-search')?.value || '').toLowerCase();

  // Update counts on badges
  const badgeClips = document.getElementById('lib-count-clips');
  if (badgeClips) badgeClips.textContent = allClips.length;
  const badgeMattes = document.getElementById('lib-count-mattes');
  if (badgeMattes) badgeMattes.textContent = allMattes.length;
  const badgeFx = document.getElementById('lib-count-fx');
  if (badgeFx) badgeFx.textContent = Object.keys(FX_LIBRARY_CATALOG).length;
  const badgePresets = document.getElementById('lib-count-presets');
  if (badgePresets) badgePresets.textContent = Object.keys(PRESETS_LIBRARY_CATALOG).length;
  const badgeAll = document.getElementById('lib-count-all');
  if (badgeAll) badgeAll.textContent = allClips.length + allMattes.length + 5 + 6;

  // 1. MATTES VIEW
  if (activeLibraryAssetType === 'mattes') {
    const filteredMattes = allMattes.filter(m => {
      return !searchVal || m.name.toLowerCase().includes(searchVal) || m.description.toLowerCase().includes(searchVal) || m.category.toLowerCase().includes(searchVal);
    });
    const searchCountLbl = document.getElementById('lbl-search-count');
    if (searchCountLbl) searchCountLbl.textContent = `${filteredMattes.length} / ${allMattes.length} MATTES`;

    filteredMattes.forEach(m => {
      container.appendChild(createMatteCardForLibrary(m));
    });
    return;
  }

  // 2. FX PLUGINS VIEW
  if (activeLibraryAssetType === 'fx') {
    const plugins = Object.entries(FX_LIBRARY_CATALOG).filter(([id, info]) => {
      return !searchVal || id.includes(searchVal) || info.title.toLowerCase().includes(searchVal) || info.summary.toLowerCase().includes(searchVal);
    });
    const searchCountLbl = document.getElementById('lbl-search-count');
    if (searchCountLbl) searchCountLbl.textContent = `${plugins.length} / ${Object.keys(FX_LIBRARY_CATALOG).length} PLUGINS FX`;

    plugins.forEach(([id, info]) => {
      container.appendChild(createFxCardForLibrary(id, info));
    });
    return;
  }

  // 3. PRESETS VIEW
  if (activeLibraryAssetType === 'presets') {
    const presets = Object.entries(PRESETS_LIBRARY_CATALOG).filter(([id, info]) => {
      return !searchVal || id.includes(searchVal) || info.title.toLowerCase().includes(searchVal) || info.desc.toLowerCase().includes(searchVal);
    });
    const searchCountLbl = document.getElementById('lbl-search-count');
    if (searchCountLbl) searchCountLbl.textContent = `${presets.length} / ${Object.keys(PRESETS_LIBRARY_CATALOG).length} PRESETS`;

    presets.forEach(([id, info]) => {
      container.appendChild(createPresetCardForLibrary(id, info));
    });
    return;
  }

  // 4. CLIPS & ALL VIEW
  const filtered = allClips.filter(c => {
    const projText = (c.project || '').toLowerCase();
    const folderText = (c.project_folder || '').toLowerCase();
    const nameText = (c.filename || '').toLowerCase();
    const titleText = (c.display_title || '').toLowerCase();
    const matchSearch = !searchVal || nameText.includes(searchVal) || titleText.includes(searchVal) || projText.includes(searchVal) || folderText.includes(searchVal);
    if (!matchSearch) return false;

    // Filter by Project / Folder
    if (activeProjectFilter !== 'ALL' && c.project !== activeProjectFilter) return false;

    // Filter by Folder / Bin (New Folder Navigation)
    if (activeFolderFilter && activeFolderFilter !== 'ALL') {
      const clipFolder = getClipFolder(c);
      if (clipFolder !== activeFolderFilter) return false;
    }

    // Filter by Source (Nuvem / SSD Local / Streams)
    if (activeSourceFilter !== 'ALL') {
      const src = getClipSource(c);
      if (activeSourceFilter === 'cdn' && src !== 'cdn') return false;
      if (activeSourceFilter === 'local' && (src !== 'local' && src !== 'downloaded' && !c.has_local_match)) return false;
      if (activeSourceFilter === 'stream' && (src !== 'stream' && src !== 'youtube')) return false;
    }

    return true;
  });

  const searchCountLbl = document.getElementById('lbl-search-count');
  if (searchCountLbl) {
    searchCountLbl.textContent = `${filtered.length} / ${allClips.length} CLIPES`;
  }

  // Grouped by Folder View Mode (DaVinci Resolve / Ableton Bin hierarchy)
  if (isGroupedByFolder && activeFolderFilter === 'ALL') {
    container.classList.add('is-grouped');

    const grouped = {};
    filtered.forEach(clip => {
      const f = getClipFolder(clip);
      if (!grouped[f]) grouped[f] = [];
      grouped[f].push(clip);
    });

    const folderKeys = Object.keys(grouped).sort();

    folderKeys.forEach(f => {
      const list = grouped[f];
      if (list.length === 0) return;

      const section = document.createElement('div');
      section.className = 'folder-group-section';

      const folderHeader = document.createElement('div');
      folderHeader.className = 'folder-section-header';
      folderHeader.innerHTML = `
        <div class="folder-header-left">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: var(--cyan);"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
          <span class="folder-header-title">${f}</span>
          <span class="folder-header-count">${list.length} CLIPES</span>
        </div>
      `;
      section.appendChild(folderHeader);

      const subgrid = document.createElement('div');
      subgrid.className = 'folder-subgrid';
      list.forEach(clip => {
        subgrid.appendChild(createMediaCardElement(clip));
      });
      section.appendChild(subgrid);

      container.appendChild(section);
    });
  } else {
    container.classList.remove('is-grouped');
    // Flat Grid View Mode
    filtered.forEach(clip => {
      container.appendChild(createMediaCardElement(clip));
    });
  }

  // If in 'all' mode and search query matches mattes or fx, also append quick sections
  if (activeLibraryAssetType === 'all' && searchVal) {
    const matchingMattes = allMattes.filter(m => m.name.toLowerCase().includes(searchVal) || m.description.toLowerCase().includes(searchVal)).slice(0, 4);
    if (matchingMattes.length > 0) {
      const matteSec = document.createElement('div');
      matteSec.className = 'category-group-section';
      matteSec.innerHTML = `<div class="category-section-header" style="color:#ff65a5;"><span>🎭 MÁSCARAS MATTE RELACIONADAS (${matchingMattes.length})</span></div>`;
      const subgrid = document.createElement('div');
      subgrid.className = 'category-subgrid';
      matchingMattes.forEach(m => subgrid.appendChild(createMatteCardForLibrary(m)));
      matteSec.appendChild(subgrid);
      container.appendChild(matteSec);
    }
  }
}

function setAudioSource(mode, deviceId = null) {
  document.querySelectorAll('.src-pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.source === mode);
  });
  const lbl = document.getElementById('lbl-audio-device');
  if (lbl) {
    const names = { test: 'MP3 Interno', mic: 'Microfone Interno', p2: 'Entrada P2 (Mesa DJ)', usb: 'Placa USB (UMC22)' };
    lbl.textContent = names[mode] || mode.toUpperCase();
  }
  sendAction('set_audio_source', { mode, device_id: deviceId });
}
window.setAudioSource = setAudioSource;

function updateAudioSourceUI(srcInfo) {
  if (!srcInfo) return;
  currentAudioSource = { ...currentAudioSource, ...srcInfo };
  const mode = srcInfo.mode || srcInfo.current_mode;
  if (mode) {
    document.querySelectorAll('.src-pill').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.source === mode);
    });
  }
  const lbl = document.getElementById('lbl-audio-device');
  if (lbl) {
    lbl.textContent = srcInfo.device_name || (mode ? mode.toUpperCase() : 'Áudio Ativo');
  }
  const cfgLbl = document.getElementById('lbl-cfg-audio-dev');
  if (cfgLbl) {
    cfgLbl.textContent = srcInfo.device_name || (mode ? mode.toUpperCase() : 'Áudio Ativo');
  }
}
window.updateAudioSourceUI = updateAudioSourceUI;

// ============================================================================
// WEB AUDIO API REAL-TIME ANALYSER & LOCAL FILE UPLOAD
// ============================================================================
let webAudioCtx = null;
let webAudioAnalyser = null;
let webAudioSourceNode = null;
let webAudioFreqData = null;
let webAudioAnimFrameId = null;

function initWebAudioAnalyser() {
  if (webAudioCtx && webAudioAnalyser) {
    if (webAudioCtx.state === 'suspended') {
      webAudioCtx.resume().catch(() => {});
    }
    return;
  }
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass || !audioCuePlayer) return;
    
    webAudioCtx = new AudioContextClass();
    webAudioAnalyser = webAudioCtx.createAnalyser();
    webAudioAnalyser.fftSize = 256;
    webAudioAnalyser.smoothingTimeConstant = 0.75;
    webAudioFreqData = new Uint8Array(webAudioAnalyser.frequencyBinCount);
    
    webAudioSourceNode = webAudioCtx.createMediaElementSource(audioCuePlayer);
    webAudioSourceNode.connect(webAudioAnalyser);
    webAudioAnalyser.connect(webAudioCtx.destination);
    
    startWebAudioVisualizerLoop();
  } catch (err) {
    console.log('[WebAudio] Analyser init notice:', err.message);
  }
}

function startWebAudioVisualizerLoop() {
  if (webAudioAnimFrameId) return;
  
  function loop() {
    webAudioAnimFrameId = requestAnimationFrame(loop);
    if (!webAudioAnalyser || !webAudioFreqData || !audioCuePlayer || audioCuePlayer.paused) return;
    
    webAudioAnalyser.getByteFrequencyData(webAudioFreqData);
    
    const avg = (start, end) => {
      let sum = 0;
      const count = Math.max(1, end - start);
      for (let i = start; i < end && i < webAudioFreqData.length; i++) sum += webAudioFreqData[i];
      return (sum / count) / 255.0;
    };
    
    const subVal = avg(0, 2);
    const bassVal = avg(2, 5);
    const lomidVal = avg(5, 10);
    const himidVal = avg(10, 25);
    const presVal = avg(25, 55);
    const airVal = avg(55, 120);
    
    // Drive meters directly if WebSocket is offline or in test audio playback
    if (!ws || ws.readyState !== WebSocket.OPEN || currentAudioSource.mode === 'test') {
      if (meters.sub) meters.sub.style.height = `${Math.min(100, Math.round(subVal * 125))}%`;
      if (meters.bass) meters.bass.style.height = `${Math.min(100, Math.round(bassVal * 125))}%`;
      if (meters.lomid) meters.lomid.style.height = `${Math.min(100, Math.round(lomidVal * 125))}%`;
      if (meters.himid) meters.himid.style.height = `${Math.min(100, Math.round(himidVal * 125))}%`;
      if (meters.pres) meters.pres.style.height = `${Math.min(100, Math.round(presVal * 125))}%`;
      if (meters.air) meters.air.style.height = `${Math.min(100, Math.round(airVal * 125))}%`;
      
      if (beatOrb && (bassVal > 0.45 || subVal > 0.55)) {
        beatOrb.style.transform = `scale(${1 + Math.max(subVal, bassVal) * 0.45})`;
        beatOrb.style.filter = `drop-shadow(0 0 16px rgba(0,240,255,0.85))`;
      } else if (beatOrb) {
        beatOrb.style.transform = 'scale(1)';
        beatOrb.style.filter = 'none';
      }
    }
  }
  loop();
}

function handleLocalAudioFileUpload(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  try {
    const objectUrl = URL.createObjectURL(file);
    if (audioCuePlayer) {
      audioCuePlayer.src = objectUrl;
      audioCuePlayer.volume = Number(sliderCueVol?.value || 70) / 100.0;
      audioCuePlayer.play().then(() => {
        btnAudioMonitor?.classList.add('active');
        if (txtAudioMonitor) txtAudioMonitor.textContent = 'CUE ON';
        initWebAudioAnalyser();
        showMacroToast(`Áudio Carregado: ${file.name.slice(0, 24)}`);
        
        currentAudioSource.mode = 'test';
        currentAudioSource.device_name = `Arquivo: ${file.name.slice(0, 18)}`;
        updateAudioSourceUI(currentAudioSource);
      }).catch(err => {
        console.warn('[Audio] Reprodução requer interação:', err);
        showMacroToast(`Arquivo Selecionado: ${file.name.slice(0, 20)} (Clique no Fone)`);
      });
    }
  } catch (err) {
    console.error('[Audio] Erro ao carregar arquivo local:', err);
    showMacroToast('Erro ao carregar arquivo de áudio local');
  }
}
window.handleLocalAudioFileUpload = handleLocalAudioFileUpload;

function playOnlineTestTrack() {
  if (!audioCuePlayer) return;
  const isNodeServer = (window.location.hostname.includes('localhost') || window.location.hostname.includes('127.0.0.1')) && window.location.port === '3000';
  audioCuePlayer.src = isNodeServer ? '/api/audio-stream' : './assets/audio/test_preview.mp3';
  audioCuePlayer.volume = Number(sliderCueVol?.value || 70) / 100.0;
  audioCuePlayer.play().then(() => {
    btnAudioMonitor?.classList.add('active');
    if (txtAudioMonitor) txtAudioMonitor.textContent = 'CUE ON';
    initWebAudioAnalyser();
    showMacroToast('Reproduzindo Faixa Teste (2:00)');
    currentAudioSource.mode = 'test';
    currentAudioSource.device_name = 'MP3 Teste (Online)';
    updateAudioSourceUI(currentAudioSource);
  }).catch(err => {
    console.warn('[Audio] Falha ao tocar faixa teste, tentando fallback direto:', err);
    audioCuePlayer.src = './assets/audio/test_preview.mp3';
    audioCuePlayer.play().then(() => {
      btnAudioMonitor?.classList.add('active');
      if (txtAudioMonitor) txtAudioMonitor.textContent = 'CUE ON';
      initWebAudioAnalyser();
      showMacroToast('Reproduzindo Faixa Teste (Online CDN)');
    }).catch(() => {});
  });
}
window.playOnlineTestTrack = playOnlineTestTrack;

function toggleAudioMonitor() {
  if (btnAudioMonitor) btnAudioMonitor.click();
}
window.toggleAudioMonitor = toggleAudioMonitor;

function switchAudioSource(mode) {
  if (mode === 'test') {
    playOnlineTestTrack();
  } else {
    setAudioSource(mode);
  }
}
window.switchAudioSource = switchAudioSource;

// ============================================================================
// 10. EVENT LISTENERS & COCKPIT INTERACTIONS
// ============================================================================
function setupEvents() {
  // Fit Mode Toggle (Default: FILL - SEM BORDAS PRETAS)
  if (prgFitLbl) {
    prgFitLbl.addEventListener('click', () => {
      if (appState.fit_mode === 'fill') {
        appState.fit_mode = 'fit';
        prgFitLbl.textContent = 'ASPECT FIT (COM BORDAS)';
        prgFitLbl.style.color = '#718096';
      } else {
        appState.fit_mode = 'fill';
        prgFitLbl.textContent = 'ASPECT FILL (SEM BORDAS)';
        prgFitLbl.style.color = '#00f0ff';
      }
    });
  }

  // Blackout
  if (btnBlackout) {
    btnBlackout.addEventListener('click', () => { sendAction('toggle_blackout'); });
  }

  // Autopilot Toggle
  if (btnAuto) {
    btnAuto.addEventListener('click', () => { sendAction('toggle_auto_mode'); });
  }

  // Macro State Buttons
  document.querySelectorAll('.state-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      setMacroState(btn.dataset.state, true);
    });
  });

  // Dock Tabs Navigation
  document.querySelectorAll('.dock-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      switchTab(tab.dataset.tab);
    });
  });

  // Central M/E Transition Strip Controls
  const btnAutoTake = document.getElementById('btn-auto-take');
  if (btnAutoTake) btnAutoTake.addEventListener('click', () => startAutoTransition());

  const btnCutTake = document.getElementById('btn-cut-take');
  if (btnCutTake) btnCutTake.addEventListener('click', () => executeHardCut());

  document.querySelectorAll('.trans-rate-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.trans-rate-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const rate = btn.dataset.rate;
      if (rate === 'sync') {
        isSyncBeatTransition = true;
      } else {
        isSyncBeatTransition = false;
        selectedTransitionDuration = parseFloat(rate) || 1.0;
      }
    });
  });

  document.querySelectorAll('.trans-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.trans-mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedTransitionMode = btn.dataset.mode;
    });
  });

  // Matte Sub-tabs
  const btnSubMasks = document.getElementById('btn-sub-masks');
  if (btnSubMasks) btnSubMasks.addEventListener('click', () => switchMatteSub('masks'));
  const btnSubKin = document.getElementById('btn-sub-kinematics');
  if (btnSubKin) btnSubKin.addEventListener('click', () => switchMatteSub('kinematics'));

  // Vertical Projection Toggle
  const btnVertProj = document.getElementById('btn-toggle-vertical-proj');
  if (btnVertProj) {
    btnVertProj.addEventListener('click', () => {
      appState.vertical_projection = !appState.vertical_projection;
      updateUI();
    });
  }

  // Shortcuts Modal Controls
  const btnShowShortcuts = document.getElementById('btn-show-shortcuts');
  if (btnShowShortcuts) btnShowShortcuts.addEventListener('click', () => openShortcutsModal());
  const btnCloseShortcuts = document.getElementById('btn-shortcuts-close');
  if (btnCloseShortcuts) btnCloseShortcuts.addEventListener('click', () => closeShortcutsModal());
  const shortcutsModal = document.getElementById('shortcuts-modal');
  if (shortcutsModal) {
    shortcutsModal.addEventListener('click', (e) => {
      if (e.target === shortcutsModal) closeShortcutsModal();
    });
  }

  // Settings Modal Controls
  const btnShowSettings = document.getElementById('btn-show-settings');
  if (btnShowSettings) btnShowSettings.addEventListener('click', () => openSettingsModal());
  const btnCloseSettings = document.getElementById('btn-settings-close');
  if (btnCloseSettings) btnCloseSettings.addEventListener('click', () => closeSettingsModal());
  const settingsModal = document.getElementById('settings-modal');
  if (settingsModal) {
    settingsModal.addEventListener('click', (e) => {
      if (e.target === settingsModal) closeSettingsModal();
    });
  }

  // Initialize Global Keyboard Shortcuts & Rich Tooltips
  initKeyboardShortcuts();
  initRichTooltips();

  // 1. Source Filter Pills (ALL / CDN / LOCAL / STREAM)
  document.querySelectorAll('#source-pills-container .pill-btn').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('#source-pills-container .pill-btn').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      activeSourceFilter = pill.dataset.source;
      renderMediaCards();
    });
  });

  // 2. Category Filter Pills (ALL / MINIMAL / ABSTRACT / etc.)
  document.querySelectorAll('#category-pills-container .pill-btn').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('#category-pills-container .pill-btn').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      activeCategoryFilter = pill.dataset.cat;
      renderMediaCards();
    });
  });

  // 3. Toggle Grouped by Folders (Bins) View Mode
  const btnToggleGroup = document.getElementById('btn-toggle-group-categories');
  if (btnToggleGroup) {
    btnToggleGroup.addEventListener('click', () => {
      isGroupedByFolder = !isGroupedByFolder;
      btnToggleGroup.classList.toggle('active', isGroupedByFolder);
      btnToggleGroup.innerHTML = isGroupedByFolder ? '<span>📁 PASTAS (BINS)</span>' : '<span>▦ GRID CONTÍNUO</span>';
      renderMediaCards();
    });
  }

  // ============================================================================
  // UNIFIED MEDIA INGESTION & SYNCHRONIZATION HUB CONTROLLER
  // ============================================================================
  let currentIngestMode = 'stream';

  window.toggleMediaIngestDeck = function(forceState) {
    const deck = document.getElementById('media-ingest-deck');
    const mainBtn = document.getElementById('btn-open-ingest-hub');
    if (!deck) return;
    
    const isVisible = deck.style.display !== 'none';
    const newState = forceState !== undefined ? Boolean(forceState) : !isVisible;
    const sidebarBtn = document.getElementById('btn-sidebar-ingest');
    
    deck.style.display = newState ? 'block' : 'none';
    if (mainBtn) {
      mainBtn.classList.toggle('active', newState);
      mainBtn.classList.toggle('active-ingest', newState);
      const span = mainBtn.querySelector('span');
      if (span) span.textContent = newState ? '✕ FECHAR INGESTÃO' : '+ INGESTÃO';
    }
    if (sidebarBtn) {
      sidebarBtn.classList.toggle('active-ingest', newState);
      const span = sidebarBtn.querySelector('span');
      if (span) span.textContent = newState ? '✕ FECHAR' : '+ NOVA INGESTÃO';
    }
    
    if (newState) {
      window.switchIngestMode(currentIngestMode);
      updateIngestStats();
      if (currentIngestMode === 'stream') {
        const inp = document.getElementById('input-mid-yt-url');
        if (inp) setTimeout(() => inp.focus(), 60);
      }
    }
  };

  window.openMediaIngestTab = function(tabName) {
    window.toggleMediaIngestDeck(true);
    window.switchIngestMode(tabName);
  };

  window.switchIngestMode = function(mode) {
    currentIngestMode = mode;
    
    ['local', 'cloud', 'stream'].forEach(m => {
      const btn = document.getElementById(`mid-tab-btn-${m}`);
      const panel = document.getElementById(`mid-panel-${m}`);
      const pill = document.getElementById(`pill-quick-${m}`);
      
      const isActive = m === mode;
      if (btn) btn.classList.toggle('active', isActive);
      if (panel) panel.style.display = isActive ? 'block' : 'none';
      if (pill) pill.classList.toggle('active', isActive);
    });

    if (mode === 'stream') {
      const inp = document.getElementById('input-mid-yt-url');
      if (inp) {
        setTimeout(() => inp.focus(), 60);
      }
    }
    updateIngestStats();
  };

  function updateIngestStats() {
    // 1. Cloud Cached Count
    const cloudCountEl = document.getElementById('mid-cloud-cached-count');
    if (cloudCountEl) {
      const cached = allClips.filter(c => UserProfileManager.isClipCached(c)).length;
      cloudCountEl.textContent = `${cached} / ${allClips.length} CLIPES`;
    }

    // 2. Local Count
    const localCountEl = document.getElementById('mid-local-count-text');
    if (localCountEl) {
      const locals = allClips.filter(c => c.is_local).length;
      localCountEl.textContent = `${locals} clipe(s) local(is) ativo(s)`;
    }
  }

  // --- LOCAL INGESTION HANDLERS ---
  window.handleIngestPickFolder = async function() {
    try {
      if (typeof window.showDirectoryPicker !== 'function') {
        alert('Seu navegador não suporta a File System Access API para seleção de pastas. Utilize o botão SELECIONAR ARQUIVOS.');
        return;
      }
      const handle = await window.showDirectoryPicker();
      const newClips = await MediaProvider.scanExtraDir(handle);
      if (newClips.length > 0) {
        allClips.push(...newClips);
        saveCustomClipsToStorage();
        renderFolderPills();
        renderMediaCards();
        updateSourceUI('local');
        updateIngestStats();
        if (typeof showHudMacroToast === 'function') {
          showHudMacroToast(`[LOCAL SSD] +${newClips.length} clipes vinculados da pasta`);
        }
      }
    } catch(e) {
      if (e.name !== 'AbortError') {
        console.warn('[Ingest Local] Seleção de pasta cancelada ou falhou:', e);
      }
    }
  };

  window.handleIngestLocalFiles = async function(fileList) {
    if (!fileList || fileList.length === 0) return;
    const catSelect = document.getElementById('select-mid-local-cat');
    const targetCat = catSelect ? catSelect.value : 'LOCAL IMPORT';
    let addedCount = 0;

    for (const file of Array.from(fileList)) {
      const ext = file.name.split('.').pop().toLowerCase();
      const isVideo = ['mp4', 'webm', 'mov'].includes(ext);
      const isAudio = ['mp3', 'wav', 'ogg', 'm4a'].includes(ext);
      if (!isVideo && !isAudio) continue;

      const uniquePath = `LOCAL_${Date.now()}_${file.name}`;
      MediaProvider.localFilesMap.set(uniquePath, file);
      const blobUrl = URL.createObjectURL(file);

      let thumbUrl = '';
      if (isVideo) {
        thumbUrl = await generateVideoThumbnailBlob(file);
      }

      const clip = {
        id: `local_${Date.now()}_${Math.random().toString(36).substr(2, 7)}`,
        filename: file.name,
        display_title: file.name.replace(/\.[^/.]+$/, ""),
        folder: "LOCAL IMPORT",
        relative_path: uniquePath,
        absolute_path: uniquePath,
        blob_url: blobUrl,
        width: 1920,
        height: 1080,
        duration: 10.0,
        fps: 60.0,
        codec: ext,
        category: targetCat,
        suggested_layer: 0,
        thumbnail: thumbUrl,
        is_local: true,
        source: 'local'
      };
      allClips.unshift(clip);
      addedCount++;
    }

    if (addedCount > 0) {
      saveCustomClipsToStorage();
      renderFolderPills();
      renderMediaCards();
      updateSourceUI('local');
      updateIngestStats();
      if (typeof showHudMacroToast === 'function') {
        showHudMacroToast(`[LOCAL] +${addedCount} arquivo(s) importado(s) com sucesso`);
      }
    }
  };

  function generateVideoThumbnailBlob(file) {
    return new Promise((resolve) => {
      try {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.muted = true;
        video.playsInline = true;
        const url = URL.createObjectURL(file);
        video.src = url;
        video.currentTime = 0.5;
        video.onloadeddata = () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = 320;
            canvas.height = 180;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, 320, 180);
            const dataUri = canvas.toDataURL('image/jpeg', 0.7);
            URL.revokeObjectURL(url);
            resolve(dataUri);
          } catch(e) {
            URL.revokeObjectURL(url);
            resolve('');
          }
        };
        video.onerror = () => {
          URL.revokeObjectURL(url);
          resolve('');
        };
        setTimeout(() => resolve(''), 2500);
      } catch(err) {
        resolve('');
      }
    });
  }

  // File input change
  const inputMidFiles = document.getElementById('input-mid-local-files');
  if (inputMidFiles) {
    inputMidFiles.addEventListener('change', (e) => {
      handleIngestLocalFiles(e.target.files);
      e.target.value = '';
    });
  }

  // Drag & drop on dropzone
  const dropzone = document.getElementById('mid-local-dropzone');
  if (dropzone) {
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('dragover');
    });
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      if (e.dataTransfer && e.dataTransfer.files) {
        handleIngestLocalFiles(e.dataTransfer.files);
      }
    });
  }

  // Global Drag & drop on main media library
  const mediaGridTab = document.getElementById('tab-mediapool');
  if (mediaGridTab) {
    mediaGridTab.addEventListener('dragover', (e) => {
      e.preventDefault();
    });
    mediaGridTab.addEventListener('drop', (e) => {
      if (e.target.closest('#mid-local-dropzone')) return;
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        e.preventDefault();
        handleIngestLocalFiles(e.dataTransfer.files);
      }
    });
  }

  // --- YOUTUBE & WEB STREAMS HANDLERS ---
  const inputYt = document.getElementById('input-mid-yt-url');
  if (inputYt) {
    inputYt.addEventListener('input', (e) => {
      handleYtUrlInput(e.target.value);
    });
    inputYt.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        executeIngestYt('stream');
      }
    });
  }

  window.clearIngestYtInput = function() {
    if (inputYt) inputYt.value = '';
    const strip = document.getElementById('mid-yt-preview-strip');
    if (strip) strip.style.display = 'none';
    const titleInp = document.getElementById('input-mid-yt-title');
    if (titleInp) titleInp.value = '';
  };

  window.handleYtUrlInput = function(rawUrl) {
    const clean = (rawUrl || '').trim();
    const previewStrip = document.getElementById('mid-yt-preview-strip');
    const imgThumb = document.getElementById('img-mid-yt-thumb');
    const lblTitle = document.getElementById('lbl-mid-yt-title');
    const lblUrl = document.getElementById('lbl-mid-yt-url');
    const badgeType = document.getElementById('badge-mid-yt-type');
    const titleInput = document.getElementById('input-mid-yt-title');

    if (!clean) {
      if (previewStrip) previewStrip.style.display = 'none';
      return;
    }

    const isYt = isYouTubeUrl(clean);
    const ytId = extractYouTubeId(clean);

    if (isYt && ytId) {
      if (previewStrip) previewStrip.style.display = 'block';
      if (badgeType) {
        badgeType.textContent = 'YOUTUBE';
        badgeType.className = 'mid-yt-badge-type yt';
      }
      const thumb = `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;
      if (imgThumb) imgThumb.src = thumb;
      if (lblUrl) lblUrl.textContent = clean;
      if (lblTitle) lblTitle.textContent = `YouTube [${ytId}]`;

      // Live oEmbed title resolution
      fetch(`https://noembed.com/embed?url=${encodeURIComponent(clean)}`)
        .then(r => r.json())
        .then(data => {
          if (data && data.title) {
            if (lblTitle) lblTitle.textContent = data.title;
            if (titleInput && !titleInput.value) titleInput.value = data.title;
          }
        })
        .catch(() => {});
    } else if (clean.startsWith('http://') || clean.startsWith('https://')) {
      if (previewStrip) previewStrip.style.display = 'block';
      if (badgeType) {
        badgeType.textContent = clean.endsWith('.m3u8') ? 'HLS LIVE' : 'STREAM WEB';
        badgeType.className = 'mid-yt-badge-type web';
      }
      if (imgThumb) imgThumb.src = 'favicon.svg';
      const filename = clean.split('/').pop().split('?')[0] || 'Feed Externo';
      if (lblTitle) lblTitle.textContent = filename;
      if (lblUrl) lblUrl.textContent = clean;
      if (titleInput && !titleInput.value) titleInput.value = filename;
    } else {
      if (previewStrip) previewStrip.style.display = 'none';
    }
  };

  window.executeIngestYt = async function(mode = 'stream') {
    const url = (inputYt ? inputYt.value : '').trim();
    if (!url) {
      alert('Por favor, informe uma URL do YouTube ou feed de vídeo válido.');
      if (inputYt) inputYt.focus();
      return;
    }
    const cat = document.getElementById('select-mid-yt-cat')?.value || 'STREAMS & YOUTUBE';
    const title = document.getElementById('input-mid-yt-title')?.value?.trim() || '';

    const progressStrip = document.getElementById('mid-yt-progress-strip');
    const progressStatus = document.getElementById('mid-yt-progress-status');
    const progressBar = document.getElementById('mid-yt-progress-bar');
    const isOnline = !window.location.hostname.includes('localhost') && !window.location.hostname.includes('127.0.0.1');

    if (mode === 'download' && isOnline) {
      alert('MODO NUVEM ONLINE: O download direto no SSD em alta qualidade (yt-dlp) requer o Penumbra rodando no ambiente local. No navegador online, utilize a opção "PUXAR PARA O POOL (STREAM AO VIVO)" para carregar e mixar o vídeo em tempo real.');
      return;
    }

    if (progressStrip) progressStrip.style.display = 'block';
    if (progressStatus) progressStatus.textContent = mode === 'download' ? 'INICIANDO DOWNLOAD NO SERVIDOR LOCAL...' : 'CONECTANDO FEED DO YOUTUBE...';
    if (progressBar) progressBar.style.width = '35%';

    try {
      await ingestStreamMedia(url, cat, title, mode);
      if (progressBar) progressBar.style.width = '100%';
      if (progressStatus) progressStatus.textContent = 'MÍDIA INGERIDA COM SUCESSO NO POOL!';
      setTimeout(() => {
        if (progressStrip) progressStrip.style.display = 'none';
        if (progressBar) progressBar.style.width = '0%';
        clearIngestYtInput();
      }, 1400);
      if (typeof showHudMacroToast === 'function') {
        showHudMacroToast(`[INGESTÃO] Vídeo adicionado ao Media Pool (${cat})`);
      }
    } catch(err) {
      if (progressStatus) progressStatus.textContent = 'ERRO NA INGESTÃO: ' + err.message;
      setTimeout(() => {
        if (progressStrip) progressStrip.style.display = 'none';
      }, 3000);
    }
  };

  // Multi-Source Audio Input Selector Pills (TEST / MIC / P2 / USB)
  document.querySelectorAll('.src-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      const src = btn.dataset.source;
      setAudioSource(src);
    });
  });

  // Media Search
  const searchInput = document.getElementById('input-media-search');
  if (searchInput) searchInput.addEventListener('input', () => { renderMediaCards(); });

  // Rescan Media Button
  if (btnRescan) {
    btnRescan.addEventListener('click', async () => {
      btnRescan.classList.add('active');
      btnRescan.querySelector('span:last-child').textContent = 'VARRENDO...';
      try {
        const res = await fetch('/api/rescan', { method: 'POST' });
        const json = await res.json();
        btnRescan.querySelector('span:last-child').textContent = `OK (${json.count || 68})`;
        setTimeout(() => { btnRescan.querySelector('span:last-child').textContent = 'REVARREDURA'; }, 2000);
      } catch (err) {
        btnRescan.querySelector('span:last-child').textContent = 'ERRO';
      }
    });
  }

  // Headphone Audio Monitor Cue
  if (btnAudioMonitor && audioCuePlayer) {
    btnAudioMonitor.addEventListener('click', () => {
      const isAuditioning = btnAudioMonitor.classList.contains('active');
      if (isAuditioning) {
        audioCuePlayer.pause();
        btnAudioMonitor.classList.remove('active');
        if (txtAudioMonitor) txtAudioMonitor.textContent = 'CUE OFF';
        sendAction('set_audio_monitor', { enabled: false });
      } else {
        if (!audioCuePlayer.src || audioCuePlayer.src === window.location.href || audioCuePlayer.src.endsWith('/')) {
          const isNodeServer = (window.location.hostname.includes('localhost') || window.location.hostname.includes('127.0.0.1')) && window.location.port === '3000';
          audioCuePlayer.src = isNodeServer ? '/api/audio-stream' : './assets/audio/test_preview.mp3';
        }
        audioCuePlayer.volume = Number(sliderCueVol?.value || 70) / 100.0;
        audioCuePlayer.play().then(() => {
          btnAudioMonitor.classList.add('active');
          if (txtAudioMonitor) txtAudioMonitor.textContent = 'CUE ON';
          initWebAudioAnalyser();
          sendAction('set_audio_monitor', { enabled: true, volume: audioCuePlayer.volume });
        }).catch(err => {
          console.warn('[Audio] Falha ao tocar áudio inicial, tentando fallback:', err);
          if (audioCuePlayer.src.includes('/api/audio-stream')) {
            audioCuePlayer.src = './assets/audio/test_preview.mp3';
            audioCuePlayer.play().then(() => {
              btnAudioMonitor.classList.add('active');
              if (txtAudioMonitor) txtAudioMonitor.textContent = 'CUE ON';
              initWebAudioAnalyser();
            }).catch(() => {});
          }
        });
      }
    });

    audioCuePlayer.addEventListener('error', () => {
      if (audioCuePlayer.src.includes('/api/audio-stream')) {
        console.log('[Audio] /api/audio-stream indisponível, alternando para test_preview.mp3...');
        audioCuePlayer.src = './assets/audio/test_preview.mp3';
        if (btnAudioMonitor.classList.contains('active')) {
          audioCuePlayer.play().catch(() => {});
        }
      }
    });
  }

  if (sliderCueVol && audioCuePlayer) {
    sliderCueVol.addEventListener('input', (e) => {
      const vol = Number(e.target.value) / 100.0;
      audioCuePlayer.volume = vol;
      sendAction('set_audio_monitor', { volume: vol });
    });
  }

  // Take Button in Program Monitor
  const btnTake = document.getElementById('btn-cue-take');
  if (btnTake) btnTake.addEventListener('click', () => { executeTakeTransition(); });

  // Pro Crossfader A/B Real-time Slider
  if (crossfader) {
    crossfader.addEventListener('input', (e) => {
      const val = Number(e.target.value);
      sendAction('set_crossfader', { value: val });
    });
    crossfader.addEventListener('change', (e) => {
      const val = Number(e.target.value);
      if (val >= 98) {
        // Complete cut to B when fully crossfaded
        executeTakeTransition();
      }
    });
  }

  // Global Pop-out window launcher (Resolves relative URL safely in production/subpaths)
  window.openPopoutWindow = function(feed) {
    const currentUrl = window.location.href.split('?')[0].split('#')[0];
    const baseUrl = currentUrl.substring(0, currentUrl.lastIndexOf('/') + 1);
    const targetFeed = feed || 'program';
    const popoutUrl = `${baseUrl}popout.html?view=${encodeURIComponent(targetFeed)}`;
    const winName = `Penumbra${targetFeed.toUpperCase()}Popout`;
    const win = window.open(popoutUrl, winName, 'width=1280,height=760,menubar=no,toolbar=no,location=no,status=no,resizable=yes');
    if (win && !win.closed) {
      try { win.focus(); } catch (_) {}
    }
    return win;
  };

  // Expand & Pop-out Monitor Controls (Preview & Program)
  const btnPrvExpand = document.getElementById('btn-prv-expand');
  if (btnPrvExpand) btnPrvExpand.addEventListener('click', () => openTheater('preview'));

  const btnPrgExpand = document.getElementById('btn-prg-expand');
  if (btnPrgExpand) btnPrgExpand.addEventListener('click', () => openTheater('program'));

  const btnPrvPopout = document.getElementById('btn-prv-popout');
  if (btnPrvPopout) {
    btnPrvPopout.addEventListener('click', (e) => {
      e.preventDefault();
      window.openPopoutWindow('preview');
    });
  }

  const btnPrgPopout = document.getElementById('btn-prg-popout');
  if (btnPrgPopout) {
    btnPrgPopout.addEventListener('click', (e) => {
      e.preventDefault();
      window.openPopoutWindow('program');
    });
  }

  // Theater Modal Controls
  if (btnTheaterClose) btnTheaterClose.addEventListener('click', () => closeTheater());
  if (btnTheaterTake) btnTheaterTake.addEventListener('click', () => executeTakeTransition());
  if (btnTheaterPopout) {
    btnTheaterPopout.addEventListener('click', () => {
      const feed = activeTheaterFeed || 'preview';
      closeTheater();
      window.openPopoutWindow(feed);
    });
  }

  // Escape key closes Theater Modal
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && activeTheaterFeed) {
      closeTheater();
    }
  });

  // Backdrop click closes Theater Modal
  if (theaterModal) {
    theaterModal.addEventListener('click', (e) => {
      if (e.target === theaterModal) {
        closeTheater();
      }
    });
  }

  // Queue Action Toolbar
  const btnQTake = document.getElementById('btn-queue-take');
  if (btnQTake) btnQTake.addEventListener('click', () => { executeTakeTransition(); });

  const btnQDissolve = document.getElementById('btn-queue-dissolve');
  if (btnQDissolve) {
    btnQDissolve.addEventListener('click', () => {
      isDissolving = true;
      dissolveProgress = 0.0;
    });
  }

  const btnQSkip = document.getElementById('btn-queue-skip');
  if (btnQSkip) btnQSkip.addEventListener('click', () => { advanceSmartQueue(); });

  const btnQShuffle = document.getElementById('btn-queue-shuffle');
  if (btnQShuffle) btnQShuffle.addEventListener('click', () => { advanceSmartQueue(); });

  // Intelligent Matte Selectors
  ['l0-matte', 'l3-matte', 'l4-matte'].forEach(id => {
    const sel = document.getElementById(id);
    if (sel) {
      sel.addEventListener('change', (e) => {
        const layerKey = id.split('-')[0].replace('l', 'layer');
        appState.layers[layerKey].matte = e.target.value;
        sendAction('set_layer_matte', { layer: layerKey, matte: e.target.value });
      });
    }
  });

  // Solo/Mute Toggles
  ['l0', 'l1', 'l2', 'l3', 'l4'].forEach(lKey => {
    const btn = document.getElementById(`btn-toggle-${lKey}`);
    if (btn) {
      btn.addEventListener('click', () => {
        const fullKey = lKey.replace('l', 'layer');
        appState.layers[fullKey].active = !appState.layers[fullKey].active;
        btn.classList.toggle('active', appState.layers[fullKey].active);
        sendAction('set_layer_param', { layer: fullKey, param: 'active', value: appState.layers[fullKey].active });
      });
    }
  });

  // Layer Opacity Sliders
  ['l0-opacity', 'l1-opacity', 'l2-opacity', 'l3-opacity', 'l4-opacity'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', (e) => {
        const layer = id.split('-')[0].replace('l', 'layer');
        const val = Number(e.target.value) / 100.0;
        appState.layers[layer].opacity = val;
        sendAction('set_layer_param', { layer, param: 'opacity', value: val });
      });
    }
  });

  // Layer Blend Dropdowns
  ['l1-blend', 'l3-blend', 'l4-blend'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('change', (e) => {
        const layer = id.split('-')[0].replace('l', 'layer');
        appState.layers[layer].blend = e.target.value;
        sendAction('set_layer_param', { layer, param: 'blend', value: e.target.value });
      });
    }
  });

  // Tonal Grading Faders
  const fGamma = document.getElementById('fader-gamma');
  if (fGamma) {
    fGamma.addEventListener('input', (e) => {
      const val = Number(e.target.value) / 100.0;
      appState.tonal.gamma = val;
      document.getElementById('val-gamma').textContent = val.toFixed(2);
      sendAction('set_tonal_param', { param: 'gamma', value: val });
    });
  }

  const fBright = document.getElementById('fader-brightness');
  if (fBright) {
    fBright.addEventListener('input', (e) => {
      const val = Number(e.target.value) / 100.0;
      appState.tonal.brightness = val;
      document.getElementById('val-brightness').textContent = `${e.target.value}%`;
      sendAction('set_tonal_param', { param: 'brightness', value: val });
    });
  }

  const fMid = document.getElementById('fader-midtones');
  if (fMid) {
    fMid.addEventListener('input', (e) => {
      const val = Number(e.target.value) / 100.0;
      appState.tonal.midtones = val;
      document.getElementById('val-midtones').textContent = val.toFixed(2);
      sendAction('set_tonal_param', { param: 'midtones', value: val });
    });
  }

  const fContrast = document.getElementById('fader-contrast');
  if (fContrast) {
    fContrast.addEventListener('input', (e) => {
      const val = Number(e.target.value) / 100.0;
      appState.tonal.contrast = val;
      document.getElementById('val-contrast').textContent = val.toFixed(2);
      sendAction('set_tonal_param', { param: 'contrast', value: val });
    });
  }

  const fEdgeMix = document.getElementById('fader-edge-mix');
  if (fEdgeMix) {
    fEdgeMix.addEventListener('input', (e) => {
      const val = Number(e.target.value) / 100.0;
      appState.tonal.edge_mix = val;
      document.getElementById('val-edge-mix').textContent = `${e.target.value}%`;
      const lblSobel = document.getElementById('lbl-sobel-mix');
      if (lblSobel) lblSobel.textContent = `MIX ${e.target.value}%`;
      sendAction('set_tonal_param', { param: 'edge_mix', value: val });
    });
  }

  const fEdgeThresh = document.getElementById('fader-edge-thresh');
  if (fEdgeThresh) {
    fEdgeThresh.addEventListener('input', (e) => {
      const val = Number(e.target.value) / 100.0;
      appState.tonal.edge_threshold = val;
      document.getElementById('val-edge-thresh').textContent = `${e.target.value}%`;
      sendAction('set_tonal_param', { param: 'edge_threshold', value: val });
    });
  }

  // Tonal Preset Buttons
  document.getElementById('preset-obsidian')?.addEventListener('click', (e) => {
    setActivePresetBtn(e.target);
    applyTonalPreset(0.70, -0.12, 0.90, 1.30, 0.15, 0.35);
  });
  document.getElementById('preset-master')?.addEventListener('click', (e) => {
    setActivePresetBtn(e.target);
    applyTonalPreset(0.85, -0.05, 1.00, 1.18, 0.22, 0.30);
  });
  document.getElementById('preset-veludo')?.addEventListener('click', (e) => {
    setActivePresetBtn(e.target);
    applyTonalPreset(0.95, 0.00, 1.15, 1.10, 0.18, 0.25);
  });
  document.getElementById('preset-sobel')?.addEventListener('click', (e) => {
    setActivePresetBtn(e.target);
    applyTonalPreset(0.80, -0.10, 0.95, 1.25, 0.35, 0.20);
  });

  // Autopilot Central Delegation Checkboxes
  if (!appState.autopilot_delegation) {
    appState.autopilot_delegation = { media: true, mattes: false, fx: false, kinetics: false };
  }
  
  ['chk-delegate-media', 'chk-delegate-mattes', 'chk-delegate-fx', 'chk-delegate-kinetics'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      const key = id.replace('chk-delegate-', '');
      el.addEventListener('change', (e) => {
        appState.autopilot_delegation[key] = e.target.checked;
        if (key === 'fx') toggleFxAutopilot(e.target.checked);
        if (key === 'mattes') toggleMattesAutopilot(e.target.checked);
      });
      el.checked = appState.autopilot_delegation[key];
    }
  });

  document.getElementById('sel-bars-transition')?.addEventListener('change', (e) => {
    setAutopilotBars(e.target.value);
  });
  document.getElementById('sel-matte-policy')?.addEventListener('change', (e) => {
    appState.autopilot_matte_policy = e.target.value;
  });
  document.getElementById('sel-trans-mode')?.addEventListener('change', (e) => {
    setAutopilotTransMode(e.target.value);
  });

  // Matte Kinematics Sliders & Buttons
  const sWiggleScale = document.getElementById('slider-wiggle-scale');
  if (sWiggleScale) {
    sWiggleScale.addEventListener('input', (e) => {
      const val = Number(e.target.value) / 100.0;
      if (!appState.matte) appState.matte = { deform: {} };
      if (!appState.matte.deform) appState.matte.deform = {};
      appState.matte.deform.wiggle_scale = val;
      const lbl = document.getElementById('val-wiggle-scale');
      if (lbl) lbl.textContent = `${e.target.value}%`;
      sendAction('set_matte_deform', { param: 'wiggle_scale', value: val });
    });
  }

  const sWigglePos = document.getElementById('slider-wiggle-pos');
  if (sWigglePos) {
    sWigglePos.addEventListener('input', (e) => {
      const val = Number(e.target.value);
      if (!appState.matte) appState.matte = { deform: {} };
      if (!appState.matte.deform) appState.matte.deform = {};
      appState.matte.deform.wiggle_pos = val;
      const lbl = document.getElementById('val-wiggle-pos');
      if (lbl) lbl.textContent = `${val}px`;
      sendAction('set_matte_deform', { param: 'wiggle_pos', value: val });
    });
  }

  document.querySelectorAll('#posterize-btn-group .rate-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#posterize-btn-group .rate-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const rate = Number(btn.dataset.rate || 0);
      if (!appState.matte) appState.matte = { deform: {} };
      if (!appState.matte.deform) appState.matte.deform = {};
      appState.matte.deform.posterize_rate = rate;
      const lbl = document.getElementById('val-posterize');
      if (lbl) lbl.textContent = rate > 0 ? `${rate} fps` : 'OFF';
      sendAction('set_matte_deform', { param: 'posterize_rate', value: rate });
    });
  });

  const sEdgeWarp = document.getElementById('slider-edge-warp');
  if (sEdgeWarp) {
    sEdgeWarp.addEventListener('input', (e) => {
      const val = Number(e.target.value) / 100.0;
      if (!appState.matte) appState.matte = { deform: {} };
      if (!appState.matte.deform) appState.matte.deform = {};
      appState.matte.deform.edge_warp = val;
      const lbl = document.getElementById('val-edge-warp');
      if (lbl) lbl.textContent = `${e.target.value}%`;
      sendAction('set_matte_deform', { param: 'edge_warp', value: val });
    });
  }

  const sAnimSpeed = document.getElementById('slider-anim-speed');
  if (sAnimSpeed) {
    sAnimSpeed.addEventListener('input', (e) => {
      const val = Number(e.target.value);
      if (!appState.matte) appState.matte = { deform: {} };
      if (!appState.matte.deform) appState.matte.deform = {};
      appState.matte.deform.speed = val;
      const lbl = document.getElementById('val-anim-speed');
      if (lbl) lbl.textContent = `${val.toFixed(1)} T`;
      sendAction('set_matte_deform', { param: 'speed', value: val });
    });
  }

  const btnSyncBpm = document.getElementById('btn-sync-bpm');
  if (btnSyncBpm) {
    btnSyncBpm.addEventListener('click', () => {
      if (!appState.matte) appState.matte = { deform: {} };
      if (!appState.matte.deform) appState.matte.deform = {};
      appState.matte.deform.sync_bpm = !appState.matte.deform.sync_bpm;
      btnSyncBpm.classList.toggle('btn-active', appState.matte.deform.sync_bpm);
      sendAction('set_matte_deform', { param: 'sync_bpm', value: appState.matte.deform.sync_bpm });
    });
  }

  // Matte Library Search & Filter Pills
  const matteSearchInput = document.getElementById('input-matte-search');
  if (matteSearchInput) matteSearchInput.addEventListener('input', () => { renderMattesCards(); });

  document.querySelectorAll('#mattes-filter-pills .pill-btn').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('#mattes-filter-pills .pill-btn').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      activeMatteCategoryFilter = pill.dataset.mcat;
      renderMattesCards();
    });
  });

  // Kinematics Autopilot Toggle
  const btnKinAuto = document.getElementById('btn-kin-auto');
  if (btnKinAuto) {
    btnKinAuto.addEventListener('click', () => {
      appState.kinematics_auto = !(appState.kinematics_auto !== false);
      const isAuto = appState.kinematics_auto;
      btnKinAuto.classList.toggle('active', isAuto);
      const txtEl = document.getElementById('txt-kin-auto');
      if (txtEl) txtEl.textContent = isAuto ? 'AUTOPILOT KINEMATICS: ON (ADAPTAÇÃO MUSICAL)' : 'AUTOPILOT KINEMATICS: OFF (MANUAL)';
    });
  }

  // Wiggle Rotation Slider
  const sWiggleRot = document.getElementById('slider-wiggle-rot');
  if (sWiggleRot) {
    sWiggleRot.addEventListener('input', (e) => {
      const val = Number(e.target.value);
      if (!appState.matte) appState.matte = { deform: {} };
      if (!appState.matte.deform) appState.matte.deform = {};
      appState.matte.deform.wiggle_rot = val;
      const lbl = document.getElementById('val-wiggle-rot');
      if (lbl) lbl.textContent = `${val.toFixed(1)}°`;
      sendAction('set_matte_deform', { param: 'wiggle_rot', value: val });
    });
  }

  document.querySelectorAll('#matte-bank-group .rate-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#matte-bank-group .rate-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const bank = btn.dataset.bank || 'B';
      if (!appState.matte) appState.matte = {};
      appState.matte.bank = bank;
      const lbl = document.getElementById('val-matte-family');
      if (lbl) lbl.textContent = `CAT.${bank.toUpperCase()}`;
      sendAction('set_matte_bank', { bank });
    });
  });
}

function setActivePresetBtn(btn) {
  document.querySelectorAll('.tonal-presets-row button').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
}

function applyTonalPreset(g, b, m, c, em, et) {
  appState.tonal = { gamma: g, brightness: b, midtones: m, contrast: c, edge_mix: em, edge_threshold: et };
  document.getElementById('fader-gamma').value = Math.round(g * 100);
  document.getElementById('fader-brightness').value = Math.round(b * 100);
  document.getElementById('fader-midtones').value = Math.round(m * 100);
  document.getElementById('fader-contrast').value = Math.round(c * 100);
  document.getElementById('fader-edge-mix').value = Math.round(em * 100);
  document.getElementById('fader-edge-thresh').value = Math.round(et * 100);
  updateUI();
  sendAction('set_tonal_param', { param: 'gamma', value: g });
  sendAction('set_tonal_param', { param: 'brightness', value: b });
  sendAction('set_tonal_param', { param: 'midtones', value: m });
  sendAction('set_tonal_param', { param: 'contrast', value: c });
  sendAction('set_tonal_param', { param: 'edge_mix', value: em });
  sendAction('set_tonal_param', { param: 'edge_threshold', value: et });
}

// ============================================================================
// 11. STUDIO LAUNCHER & MEDIA SOURCE ORCHESTRATION
// ============================================================================
let activeMediaSource = localStorage.getItem('penumbra_media_source') || 'cdn';

function updateSourceUI(sourceName) {
  activeMediaSource = sourceName;
  const headerIcon = document.getElementById('header-src-icon');
  const headerLabel = document.getElementById('header-src-label');
  const cfgBadge = document.getElementById('cfg-active-source-badge');
  const cfgDesc = document.getElementById('cfg-active-source-desc');
  const cfgCount = document.getElementById('cfg-media-count-val');
  const chkRemember = document.getElementById('chk-cfg-remember-source');

  const cardCloud = document.getElementById('card-mode-cloud');
  const cardLocal = document.getElementById('card-mode-local');
  const stCloud = document.getElementById('status-mode-cloud');
  const stLocal = document.getElementById('status-mode-local');
  const optCloud = document.getElementById('opt-src-cloud');
  const optLocal = document.getElementById('opt-src-local');

  if (chkRemember) {
    chkRemember.checked = localStorage.getItem('penumbra_remember_source') === 'true';
  }
  if (cfgCount) {
    cfgCount.textContent = (allClips && allClips.length) ? `${allClips.length} CLIPES` : '0 CLIPES';
  }

  if (sourceName === 'local') {
    if (headerLabel) headerLabel.textContent = 'DISCO LOCAL';
    if (cfgBadge) {
      cfgBadge.className = 'cfg-badge text-emerald';
      cfgBadge.textContent = 'DISCO LOCAL (SSD)';
    }
    if (cfgDesc) {
      cfgDesc.textContent = 'Acesso direto ao sistema de arquivos local com zero-latência via File System API.';
    }
    if (cardLocal) cardLocal.classList.add('active');
    if (stLocal) stLocal.textContent = 'ATIVO';
    if (cardCloud) cardCloud.classList.remove('active');
    if (stCloud) stCloud.textContent = 'DISPONÍVEL';
    if (optLocal) optLocal.classList.add('active');
    if (optCloud) optCloud.classList.remove('active');
  } else if (sourceName === 'stream') {
    if (headerLabel) headerLabel.textContent = 'STREAM URL';
    if (cfgBadge) {
      cfgBadge.className = 'cfg-badge text-purple';
      cfgBadge.textContent = 'STREAM EXTERNO / YOUTUBE';
    }
    if (cfgDesc) {
      cfgDesc.textContent = 'Ingestão de feeds externos em tempo real via HLS ou YouTube stream.';
    }
  } else {
    // cdn
    if (headerLabel) headerLabel.textContent = 'NUVEM CDN';
    if (cfgBadge) {
      cfgBadge.className = 'cfg-badge text-cyan';
      cfgBadge.textContent = 'NUVEM CDN';
    }
    if (cfgDesc) {
      cfgDesc.textContent = 'Streaming direto via Edge CDN de alta performance (São Paulo) com miniaturas e cache local.';
    }
    if (cardCloud) cardCloud.classList.add('active');
    if (stCloud) stCloud.textContent = 'ATIVO';
    if (cardLocal) cardLocal.classList.remove('active');
    if (stLocal) stLocal.textContent = 'DISPONÍVEL';
    if (optCloud) optCloud.classList.add('active');
    if (optLocal) optLocal.classList.remove('active');
  }
}
window.updateSourceUI = updateSourceUI;

async function switchStorageMode(mode) {
  const dd = document.getElementById('source-quick-dropdown');
  if (dd) dd.style.display = 'none';

  if (mode === 'cloud') {
    try {
      showMacroToast('Conectando à Nuvem Edge CDN...');
      await reconnectCloudSource();
      updateSourceUI('cdn');
      showMacroToast('Armazenamento alternado para Nuvem (Edge CDN)');
    } catch (err) {
      console.error('[Storage] Erro ao alternar para nuvem:', err);
    }
  } else if (mode === 'local') {
    try {
      if (MediaProvider.activeSource === 'local' && allClips && allClips.length > 0) {
        updateSourceUI('local');
        showMacroToast('Armazenamento ativo: Disco Local (SSD)');
      } else {
        await selectLocalDirectorySource();
      }
    } catch (err) {
      console.error('[Storage] Erro ao alternar para local:', err);
    }
  }
}
window.switchStorageMode = switchStorageMode;

function toggleHeaderSourceMenu(e) {
  if (e) {
    e.stopPropagation();
    e.preventDefault();
  }
  const dd = document.getElementById('source-quick-dropdown');
  if (!dd) return;
  const isShown = dd.style.display === 'flex';
  dd.style.display = isShown ? 'none' : 'flex';
}
window.toggleHeaderSourceMenu = toggleHeaderSourceMenu;

// Fechar menu de fonte ao clicar fora
document.addEventListener('click', (e) => {
  const ctrl = document.getElementById('header-source-control');
  const dd = document.getElementById('source-quick-dropdown');
  if (ctrl && dd && !ctrl.contains(e.target)) {
    dd.style.display = 'none';
  }
});

function openStudioLauncher() {
  const nexusModal = document.getElementById('media-nexus-modal');
  if (!nexusModal) return;

  const stepSource = document.getElementById('nexus-step-source');
  const stepPin = document.getElementById('nexus-step-pin');
  const stepLoading = document.getElementById('nexus-step-loading');
  const btnCloseX = document.getElementById('btn-nexus-close-x');
  const chkRemember = document.getElementById('chk-nexus-remember-source');

  if (chkRemember) {
    chkRemember.checked = localStorage.getItem('penumbra_remember_source') === 'true';
  }

  if (stepSource) stepSource.style.display = 'block';
  if (stepPin) stepPin.style.display = 'none';
  if (stepLoading) stepLoading.style.display = 'none';

  if (btnCloseX) {
    btnCloseX.style.display = (allClips && allClips.length > 0) ? 'block' : 'none';
  }

  try {
    if (!nexusModal.open) nexusModal.showModal();
  } catch (e) {
    nexusModal.setAttribute('open', '');
  }
}
window.openStudioLauncher = openStudioLauncher;

function closeStudioLauncher() {
  const nexusModal = document.getElementById('media-nexus-modal');
  if (!nexusModal) return;
  nexusModal.classList.add('dialog-closing');
  setTimeout(() => {
    try { nexusModal.close(); } catch (e) { nexusModal.removeAttribute('open'); }
    nexusModal.classList.remove('dialog-closing');
  }, 240);
}
window.closeStudioLauncher = closeStudioLauncher;

function toggleRememberSource(checked) {
  localStorage.setItem('penumbra_remember_source', checked ? 'true' : 'false');
  const chkModal = document.getElementById('chk-nexus-remember-source');
  const chkCfg = document.getElementById('chk-cfg-remember-source');
  if (chkModal) chkModal.checked = checked;
  if (chkCfg) chkCfg.checked = checked;
}
window.toggleRememberSource = toggleRememberSource;

function resetSourcePreference() {
  localStorage.removeItem('penumbra_media_source');
  localStorage.removeItem('penumbra_remember_source');
  localStorage.removeItem('penumbra_cdn_pin');
  const chkModal = document.getElementById('chk-nexus-remember-source');
  const chkCfg = document.getElementById('chk-cfg-remember-source');
  if (chkModal) chkModal.checked = false;
  if (chkCfg) chkCfg.checked = false;
  alert('Preferência de inicialização removida. O seletor de fonte (Studio Launcher) será exibido sempre ao abrir o Penumbra.');
}
window.resetSourcePreference = resetSourcePreference;

async function reconnectCloudSource() {
  try {
    const clips = await MediaProvider.initCDN();
    await loadMediaPool(clips);
    await loadMattesCatalog();
    updateSourceUI('cdn');
    localStorage.setItem('penumbra_media_source', 'cdn');
    console.log('[Media Nexus] Nuvem Edge reconectada com sucesso.');
  } catch (err) {
    console.error('[CDN] Falha ao reconectar nuvem:', err);
    openStudioLauncher();
  }
}
window.reconnectCloudSource = reconnectCloudSource;

async function selectLocalDirectorySource() {
  try {
    const dirHandle = await window.showDirectoryPicker({ mode: 'read', startIn: 'videos' });
    closeStudioLauncher();
    const clips = await MediaProvider.initLocal(dirHandle);
    await loadMediaPool(clips);
    await loadMattesCatalog();
    updateSourceUI('local');
    localStorage.setItem('penumbra_media_source', 'local');
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.warn('[Media Nexus] Seleção de diretório falhou:', err);
    }
  }
}
window.selectLocalDirectorySource = selectLocalDirectorySource;

// ============================================================================
// BOOTSTRAP INITIALIZATION
// ============================================================================
function bootstrapApp() {
  initWebSocket();

  const nexusModal = document.getElementById('media-nexus-modal');
  if (nexusModal) {
    const stepSource = document.getElementById('nexus-step-source');
    const stepPin = document.getElementById('nexus-step-pin');
    const stepLoading = document.getElementById('nexus-step-loading');

    const pinInput = document.getElementById('pin-hidden-input');
    const pinSlots = document.querySelectorAll('.pin-cell');
    const pinFeedback = document.getElementById('pin-feedback-msg');
    const pinSlotsWrap = document.getElementById('pin-slots');
    const btnPinBack = document.getElementById('btn-pin-back');
    const btnPinSubmit = document.getElementById('btn-pin-submit');

    // Update PIN display slots
    const updatePinSlots = (val) => {
      pinSlots.forEach((slot, idx) => {
        if (idx < val.length) {
          slot.classList.add('filled');
        } else {
          slot.classList.remove('filled');
        }
        slot.classList.remove('pin-error', 'pin-success');
      });
    };

    // PIN Verification Logic
    const verifyPin = async () => {
      const pin = (pinInput ? pinInput.value : '').trim();
      if (pin.length !== 4) return;

      if (pin === '2026') {
        pinSlots.forEach(s => s.classList.add('pin-success'));
        if (pinFeedback) {
          pinFeedback.className = 'pin-feedback-line text-emerald';
          pinFeedback.textContent = 'ACESSO AUTORIZADO // CONECTANDO EDGE CDN...';
        }

        setTimeout(async () => {
          if (stepPin) stepPin.style.display = 'none';
          if (stepLoading) stepLoading.style.display = 'flex';

          try {
            console.log('[Media Nexus] CDN Mode Activated (PIN 2026 Verified)');
            const clips = await MediaProvider.initCDN();
            await loadMediaPool(clips);
            await loadMattesCatalog();
            updateSourceUI('cdn');
            localStorage.setItem('penumbra_media_source', 'cdn');
            localStorage.setItem('penumbra_cdn_pin', '2026');
            closeStudioLauncher();
          } catch (err) {
            console.error('[CDN] Ingestion error:', err);
            if (stepLoading) stepLoading.style.display = 'none';
            if (stepSource) stepSource.style.display = 'block';
          }
        }, 350);
      } else {
        pinSlots.forEach(s => s.classList.add('pin-error'));
        if (pinFeedback) {
          pinFeedback.className = 'pin-feedback-line text-crimson';
          pinFeedback.textContent = 'PIN INCORRETO. TENTE NOVAMENTE (2026).';
        }
        if (pinSlotsWrap) {
          pinSlotsWrap.classList.add('shake-anim');
          setTimeout(() => {
            pinSlotsWrap.classList.remove('shake-anim');
            if (pinInput) {
              pinInput.value = '';
              updatePinSlots('');
              pinInput.focus();
            }
          }, 450);
        }
      }
    };

    // 1. LOCAL DRIVE BUTTON
    const btnLocal = document.getElementById('btn-nexus-local');
    if (btnLocal) {
      btnLocal.addEventListener('click', async () => {
        await selectLocalDirectorySource();
      });
    }

    // 2. NUVEM GIGANTERA (CDN) BUTTON
    const btnCDN = document.getElementById('btn-nexus-cdn');
    if (btnCDN) {
      btnCDN.addEventListener('click', () => {
        if (stepSource) stepSource.style.display = 'none';
        if (stepPin) stepPin.style.display = 'block';
        if (pinInput) {
          pinInput.value = '';
          updatePinSlots('');
          pinInput.focus();
        }
        if (pinFeedback) {
          pinFeedback.className = 'pin-feedback-line';
          pinFeedback.textContent = 'DIGITE O PIN (TECLADO OU BOTÕES ABAIXO)';
        }
      });
    }

    // 3. PIN INPUT & KEYPAD LISTENERS
    if (pinInput) {
      pinInput.addEventListener('input', () => {
        pinInput.value = pinInput.value.replace(/\D/g, '').slice(0, 4);
        updatePinSlots(pinInput.value);
        if (pinInput.value.length === 4) {
          verifyPin();
        }
      });

      pinInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') verifyPin();
        if (e.key === 'Escape' && btnPinBack) btnPinBack.click();
      });
    }

    // On-screen keypad buttons
    document.querySelectorAll('.pin-key').forEach(keyBtn => {
      keyBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (!pinInput) return;
        const action = keyBtn.getAttribute('data-key');
        if (action === 'clear') {
          pinInput.value = '';
        } else if (action === 'backspace') {
          pinInput.value = pinInput.value.slice(0, -1);
        } else if (pinInput.value.length < 4) {
          pinInput.value += action;
        }
        updatePinSlots(pinInput.value);
        if (pinInput.value.length === 4) {
          verifyPin();
        } else {
          pinInput.focus();
        }
      });
    });

    if (btnPinSubmit) {
      btnPinSubmit.addEventListener('click', (e) => {
        e.preventDefault();
        verifyPin();
      });
    }

    if (btnPinBack) {
      btnPinBack.addEventListener('click', (e) => {
        e.preventDefault();
        if (stepPin) stepPin.style.display = 'none';
        if (stepSource) stepSource.style.display = 'block';
        if (pinInput) {
          pinInput.value = '';
          updatePinSlots('');
        }
      });
    }

    // 4. YOUTUBE / STREAM INGESTION & DOWNLOADER IN STUDIO LAUNCHER
    const btnYTStream = document.getElementById('btn-nexus-yt-connect');
    const btnYTDl = document.getElementById('btn-nexus-yt-download');
    const inputYT = document.getElementById('input-nexus-yt');
    const selectYTCat = document.getElementById('select-nexus-yt-cat');

    const handleLauncherStream = (mode) => {
      const url = (inputYT ? inputYT.value : '').trim();
      if (!url) return;
      const cat = selectYTCat ? selectYTCat.value : 'STREAMS & YOUTUBE';
      console.log(`[Studio Launcher] YouTube/Stream Ingest (${mode}):`, url);
      ingestStreamMedia(url, cat, '', mode);
      updateSourceUI('stream');
      closeStudioLauncher();
    };

    if (btnYTStream) btnYTStream.addEventListener('click', () => handleLauncherStream('stream'));
    if (btnYTDl) btnYTDl.addEventListener('click', () => handleLauncherStream('download'));
    if (inputYT) {
      inputYT.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleLauncherStream('stream');
      });
    }

    // Check saved preference on startup
    const savedSource = localStorage.getItem('penumbra_media_source');
    const rememberSource = localStorage.getItem('penumbra_remember_source') === 'true';
    const savedPin = localStorage.getItem('penumbra_cdn_pin');

    if (rememberSource && savedSource === 'cdn' && savedPin === '2026') {
      console.log('[Media Nexus] Autoconectando à Nuvem Edge (preferência salva)...');
      MediaProvider.initCDN().then(clips => {
        loadMediaPool(clips);
        loadMattesCatalog();
        updateSourceUI('cdn');
      }).catch(err => {
        console.warn('[Media Nexus] Falha ao autoconectar, abrindo Studio Launcher:', err);
        openStudioLauncher();
      });
    } else {
      // Pergunta sempre se quer Nuvem ou Local se preferência não estiver salva
      openStudioLauncher();
    }
  } else {
    loadMediaPool();
    loadMattesCatalog();
  }

  // Add Extra Local Folder logic
  const btnAddLocal = document.getElementById('btn-add-local-folder');
  if (btnAddLocal) {
    btnAddLocal.addEventListener('click', async () => {
      try {
        const handle = await window.showDirectoryPicker();
        const newClips = await MediaProvider.scanExtraDir(handle);
        if (newClips.length > 0) {
          allClips.push(...newClips);
          renderFolderPills();
          renderMediaCards();
          updateSourceUI('local');
          console.log(`[Media Nexus] Adicionado ${newClips.length} novos clipes locais.`);
        }
      } catch (e) {
        if (e.name !== 'AbortError') {
          console.warn('[Media Nexus] Seleção extra de pasta cancelada ou falha:', e);
        }
      }
    });
  }

  setupEvents();
  setupProFaders();
  if (typeof initWorkspaceSplitter === 'function') initWorkspaceSplitter();
  if (typeof initLibrarySidebarSplitter === 'function') initLibrarySidebarSplitter();
  if (typeof initDockViewModes === 'function') initDockViewModes();
  if (typeof initKeyboardShortcuts === 'function') initKeyboardShortcuts();
  applyMacroPreset(appState.macro_state || 'GROOVE', 0, false);
  renderMacroPresetsMatrix();
  updateMatteRibbonActiveStatus();
  updateFxUI();
  renderVisuals();
  updateUI();
  updateSourceUI(activeMediaSource);

  window.addEventListener('resize', () => {
    if (typeof renderQueueCards === 'function') renderQueueCards();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrapApp);
} else {
  bootstrapApp();
}

// ============================================================================
// PRO-APP UX: FADERS & KNOBS (DOUBLE CLICK RESET & SHIFT FINE-TUNING)
// ============================================================================
function setupProFaders() {
  const sliders = document.querySelectorAll('input[type="range"]');
  
  sliders.forEach(slider => {
    // 1. Double Click Reset to Default
    slider.addEventListener('dblclick', (e) => {
      const def = slider.getAttribute('value'); // The initial HTML value acts as default
      if (def !== null) {
        slider.value = def;
        slider.dispatchEvent(new Event('input'));
        slider.dispatchEvent(new Event('change'));
      }
    });

    // 2. Shift Modifiers for Fine Tuning
    let isDragging = false;
    let startX = 0;
    let startVal = 0;

    slider.addEventListener('mousedown', (e) => {
      if (e.shiftKey || e.metaKey || e.ctrlKey) {
        e.preventDefault(); // Stop native fast-drag
        isDragging = true;
        startX = e.clientX;
        startVal = parseFloat(slider.value);
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (isDragging) {
        const deltaX = e.clientX - startX;
        const range = parseFloat(slider.max || 100) - parseFloat(slider.min || 0);
        // If metaKey/ctrlKey, move faster. If shiftKey, move 10x slower
        const modifier = e.shiftKey ? 10 : (e.metaKey || e.ctrlKey ? 0.2 : 1);
        const rect = slider.getBoundingClientRect();
        const physicalWidth = rect.width || 150;
        
        // Default: moving the physical width changes the full range.
        const unitsPerPixel = range / (physicalWidth * modifier);
        
        let newVal = startVal + (deltaX * unitsPerPixel);
        newVal = Math.max(parseFloat(slider.min || 0), Math.min(parseFloat(slider.max || 100), newVal));
        
        slider.value = newVal;
        slider.dispatchEvent(new Event('input'));
      }
    });

    window.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        slider.dispatchEvent(new Event('change'));
      }
    });
  });
}

// ============================================================================
// DOCK MODULES, BUS ROUTING & SHORTCUTS HELPERS
// ============================================================================
function switchTab(tabId) {
  document.querySelectorAll('.dock-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tabId);
  });
  document.querySelectorAll('.tab-content').forEach(c => {
    c.classList.toggle('active', c.id === tabId);
  });
}

function switchMatteSub(subId) {
  const btnMasks = document.getElementById('btn-sub-masks');
  const btnKin = document.getElementById('btn-sub-kinematics');
  const subMasks = document.getElementById('subview-masks');
  const subKin = document.getElementById('subview-kinematics');

  if (btnMasks && btnKin && subMasks && subKin) {
    if (subId === 'masks') {
      btnMasks.classList.add('active');
      btnKin.classList.remove('active');
      subMasks.style.display = 'flex';
      subKin.style.display = 'none';
    } else {
      btnKin.classList.add('active');
      btnMasks.classList.remove('active');
      subMasks.style.display = 'none';
      subKin.style.display = 'flex';
    }
  }
}
window.switchMatteSub = switchMatteSub;

// Kinematics Presets Logic
function applyKinPreset(type) {
  // Update active button
  document.querySelectorAll('.kin-preset-btn').forEach(btn => btn.classList.remove('active'));
  const btn = Array.from(document.querySelectorAll('.kin-preset-btn')).find(b => 
    b.dataset.preset === type || b.getAttribute('onclick')?.includes(`'${type}'`)
  );
  if (btn) btn.classList.add('active');

  const wScale = document.getElementById('slider-wiggle-scale');
  const wPos = document.getElementById('slider-wiggle-pos');
  const wRot = document.getElementById('slider-wiggle-rot');
  const wEdge = document.getElementById('slider-edge-warp');

  const setSlider = (el, val, dispatch = true) => {
    if(el) {
      el.value = val;
      if(dispatch) el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  };

  const setRate = (rate) => {
    document.querySelectorAll('#posterize-btn-group .rate-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.rate === String(rate));
    });
  };

  const setSync = (sync) => {
    document.querySelectorAll('#sync-btn-group .rate-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.div === String(sync));
    });
  };

  switch (type) {
    case 'ORGANIC':
      setSlider(wScale, 6);
      setSlider(wPos, 12);
      setSlider(wRot, 2);
      setSlider(wEdge, 5);
      setRate(0); // smooth
      setSync(8); // 1/8 sync
      break;
    case 'STROBE':
      setSlider(wScale, 20);
      setSlider(wPos, 50);
      setSlider(wRot, 0);
      setSlider(wEdge, 0);
      setRate(4); // choppy
      setSync(2); // 1/2 sync
      break;
    case 'DRIFT':
      setSlider(wScale, 2);
      setSlider(wPos, 30);
      setSlider(wRot, 15);
      setSlider(wEdge, 10);
      setRate(12);
      setSync(4);
      break;
    case 'TEMPO':
      setSlider(wScale, 10);
      setSlider(wPos, 0);
      setSlider(wRot, 0);
      setSlider(wEdge, 25);
      setRate(8);
      setSync(1); // 1/1 bar
      break;
    case 'CHAOS':
      setSlider(wScale, 30);
      setSlider(wPos, 60);
      setSlider(wRot, -15);
      setSlider(wEdge, 80);
      setRate(6);
      setSync(4);
      break;
  }
}
window.applyKinPreset = applyKinPreset;

function routeClipToBus(clipId, bus) {
  const clip = allClips.find(c => c.id === clipId);
  if (!clip) return;
  if (bus === 'A') {
    appState.layers.layer0.clipId = clip.id;
    appState.layers.layer0.name = clip.filename;
    appState.layers.layer0.fit_mode = 'fill';
    appState.layers.layer0.matte = 'none';
    updateUI();
    syncVideoSources();
    sendAction('cue_clip', { layer: 'layer0', clipId: clip.id, name: clip.filename });
    sendAction('set_layer_fit_mode', { layer: 'layer0', fit_mode: 'fill' });
  } else {
    appState.layers.layer3.clipId = clip.id;
    appState.layers.layer3.name = clip.filename;
    appState.layers.layer3.fit_mode = 'fill';
    appState.layers.layer3.matte = 'none';
    updateUI();
    syncVideoSources();
    sendAction('cue_clip', { layer: 'layer3', clipId: clip.id, name: clip.filename });
    sendAction('set_layer_fit_mode', { layer: 'layer3', fit_mode: 'fill' });
  }
}

function swapBuses() {
  const tempId = appState.layers.layer0.clipId;
  const tempName = appState.layers.layer0.name;
  appState.layers.layer0.clipId = appState.layers.layer3.clipId;
  appState.layers.layer0.name = appState.layers.layer3.name;
  appState.layers.layer3.clipId = tempId;
  appState.layers.layer3.name = tempName;
  updateUI();
  syncVideoSources();
}

function openShortcutsModal() {
  const modal = document.getElementById('shortcuts-modal');
  if (modal) modal.classList.add('active');
}

function closeShortcutsModal() {
  const modal = document.getElementById('shortcuts-modal');
  if (modal) modal.classList.remove('active');
}

function toggleShortcutsModal() {
  const modal = document.getElementById('shortcuts-modal');
  if (modal) modal.classList.toggle('active');
}
window.openShortcutsModal = openShortcutsModal;
window.closeShortcutsModal = closeShortcutsModal;

function openSettingsModal() {
  const modal = document.getElementById('settings-modal');
  if (modal) modal.classList.add('active');
}

function closeSettingsModal() {
  const modal = document.getElementById('settings-modal');
  if (modal) modal.classList.remove('active');
}

window.openSettingsModal = openSettingsModal;
window.closeSettingsModal = closeSettingsModal;

function setSettingsTab(tabId) {
  document.querySelectorAll('.settings-tab-btn, .cfg-nav-item').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tabId);
  });
  document.querySelectorAll('.settings-tab-panel').forEach(p => {
    p.classList.toggle('active', p.id === `settings-panel-${tabId}`);
  });
  if (tabId === 'midi' && window.penumbraHwTwin) {
    window.penumbraHwTwin.updateView();
  }
}
window.setSettingsTab = setSettingsTab;

function setAudioInputGain(val) {
  const num = Number(val) / 100.0;
  appState.audio_gain = num;
  const lbl = document.getElementById('lbl-cfg-gain');
  if (lbl) {
    const db = Math.round(20 * Math.log10(Math.max(0.01, num)));
    lbl.textContent = `${db >= 0 ? '+' : ''}${db} dB (${val}%)`;
  }
}
window.setAudioInputGain = setAudioInputGain;

function setFpsLimit(fps) {
  appState.fps_limit = Number(fps);
  document.querySelectorAll('#group-cfg-fps .conductor-btn').forEach(btn => {
    btn.classList.toggle('active', Number(btn.dataset.fps) === Number(fps));
  });
  console.log(`[PERFORMANCE] Limite de FPS: ${fps}`);
}
window.setFpsLimit = setFpsLimit;

function toggleAutopilotRule(ruleName, enabled) {
  if (appState.autopilot_rules) {
    appState.autopilot_rules[ruleName] = Boolean(enabled);
    console.log(`[AUTOPILOT] Regra ${ruleName}: ${enabled ? 'HABILITADA' : 'DESABILITADA'}`);
  }
}
window.toggleAutopilotRule = toggleAutopilotRule;

function rescanMediaWithFeedback() {
  const btnRescan = document.getElementById('btn-rescan-media');
  if (btnRescan) btnRescan.click();
  const feedback = document.getElementById('lbl-cfg-rescan-feedback');
  if (feedback) {
    feedback.style.display = 'block';
    setTimeout(() => { feedback.style.display = 'none'; }, 2500);
  }
}
window.rescanMediaWithFeedback = rescanMediaWithFeedback;

function initKeyboardShortcuts() {
  window.addEventListener('keydown', (e) => {
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT')) {
      if (e.key === 'Escape') {
        activeEl.blur();
        if (typeof window.toggleMediaIngestDeck === 'function') {
          window.toggleMediaIngestDeck(false);
        }
      }
      return;
    }

    const key = e.key;

    // SPACE: Auto Take (Smooth Transition)
    if (e.code === 'Space') {
      e.preventDefault();
      startAutoTransition();
      return;
    }

    // R: Reset Musical Phrase / Downbeat 1.1.1 (Início da Música)
    if (key === 'r' || key === 'R') {
      e.preventDefault();
      resetMusicalPhrase();
      return;
    }

    // ENTER: Hard Cut
    if (key === 'Enter') {
      e.preventDefault();
      executeHardCut();
      return;
    }

    // TAB: Alternar entre Módulos de Trabalho e Timeline Pro
    if (e.key === 'Tab') {
      e.preventDefault();
      toggleDockViewMode();
      return;
    }

    // Number keys 1-6: Switch Dock Modules
    if (key === '1') { e.preventDefault(); setDockViewMode('modules'); switchTab('tab-mediapool'); return; }
    if (key === '2') { e.preventDefault(); setDockViewMode('modules'); switchTab('tab-layers'); return; }
    if (key === '3') { e.preventDefault(); setDockViewMode('modules'); switchTab('tab-mattes'); return; }
    if (key === '4') { e.preventDefault(); setDockViewMode('modules'); switchTab('tab-tonal'); return; }
    if (key === '5') { e.preventDefault(); setDockViewMode('modules'); switchTab('tab-queue'); return; }
    if (key === '6') { e.preventDefault(); setDockViewMode('modules'); switchTab('tab-fx'); return; }

    // Route focused or selected clip: A for Program, B for Preview
    if (key === 'a' || key === 'A') {
      e.preventDefault();
      if (focusedClipId) {
        routeClipToBus(focusedClipId, 'A');
      } else if (appState.layers.layer3.clipId) {
        startAutoTransition();
      }
      return;
    }
    if (key === 'b' || key === 'B') {
      e.preventDefault();
      if (focusedClipId) {
        routeClipToBus(focusedClipId, 'B');
      }
      return;
    }

    // Left / Right Arrow: Nudge Crossfader manual
    if (key === 'ArrowLeft') {
      e.preventDefault();
      if (crossfader) {
        crossfader.value = Math.max(0, Number(crossfader.value) - 5);
        crossfader.dispatchEvent(new Event('input'));
      }
      return;
    }
    if (key === 'ArrowRight') {
      e.preventDefault();
      if (crossfader) {
        crossfader.value = Math.min(100, Number(crossfader.value) + 5);
        crossfader.dispatchEvent(new Event('input'));
      }
      return;
    }

    // X: Swap Buses (Swap A and B)
    if (key === 'x' || key === 'X') {
      e.preventDefault();
      swapBuses();
      return;
    }

    // M: Master Blackout (Mute)
    if (key === 'm' || key === 'M') {
      e.preventDefault();
      const btnBlackout = document.getElementById('btn-blackout');
      if (btnBlackout) btnBlackout.click();
      return;
    }

    // P: Autopilot toggle
    if (key === 'p' || key === 'P') {
      e.preventDefault();
      const btnAutoToggle = document.getElementById('btn-auto-toggle');
      if (btnAutoToggle) btnAutoToggle.click();
      return;
    }

    // S: Skip to next clip in smart queue
    if (key === 's' || key === 'S') {
      e.preventDefault();
      advanceSmartQueue();
      return;
    }

    // T: Tap Tempo
    if (key === 't' || key === 'T') {
      e.preventDefault();
      handleTapTempo();
      return;
    }

    // F: Fullscreen / Theater Mode Toggle
    if (key === 'f' || key === 'F') {
      e.preventDefault();
      const modal = document.getElementById('theater-modal');
      if (modal && modal.classList.contains('active')) {
        closeTheater();
      } else {
        openTheater('program');
      }
      return;
    }

    // ? or H: Toggle Shortcuts Modal
    if (key === '?' || key === '/' || key === 'h' || key === 'H') {
      e.preventDefault();
      toggleShortcutsModal();
      return;
    }

    // I: Toggle Media Ingest Deck (Local / Bunny / YouTube)
    if (key === 'i' || key === 'I') {
      e.preventDefault();
      switchTab('tab-mediapool');
      if (typeof window.toggleMediaIngestDeck === 'function') {
        window.toggleMediaIngestDeck();
      }
      return;
    }

    // Escape: Close modals
    if (key === 'Escape') {
      closeShortcutsModal();
      closeTheater();
      if (typeof window.toggleMediaIngestDeck === 'function') {
        window.toggleMediaIngestDeck(false);
      }
      return;
    }
  });
}

function initRichTooltips() {
  const tooltip = document.getElementById('pro-tooltip');
  const titleEl = document.getElementById('tooltip-title');
  const kbdEl = document.getElementById('tooltip-kbd');
  const descEl = document.getElementById('tooltip-desc');
  if (!tooltip || !titleEl || !descEl) return;

  let activeEl = null;

  document.addEventListener('mouseover', (e) => {
    const target = e.target.closest('[data-tooltip-title], [data-tooltip-desc], [data-shortcut]');
    if (!target) {
      if (activeEl) {
        tooltip.style.display = 'none';
        activeEl = null;
      }
      return;
    }

    activeEl = target;
    const title = target.getAttribute('data-tooltip-title') || target.getAttribute('title') || '';
    const desc = target.getAttribute('data-tooltip-desc') || '';
    const shortcut = target.getAttribute('data-shortcut') || '';

    titleEl.textContent = title;
    descEl.textContent = desc || 'Clique para ativar ou ajustar';
    
    if (shortcut && kbdEl) {
      kbdEl.textContent = shortcut;
      kbdEl.style.display = 'inline-block';
    } else if (kbdEl) {
      kbdEl.style.display = 'none';
    }

    tooltip.style.display = 'block';
    positionTooltip(e);
  });

  document.addEventListener('mousemove', (e) => {
    if (activeEl && tooltip.style.display === 'block') {
      positionTooltip(e);
    }
  });

  document.addEventListener('mouseout', (e) => {
    if (!activeEl) return;
    const related = e.relatedTarget;
    // Se o mouse foi para fora da janela, ou para um elemento que não é o activeEl nem filho dele
    if (!related || (related !== activeEl && !activeEl.contains(related))) {
      tooltip.style.display = 'none';
      activeEl = null;
    }
  });

  // Oculta tooltip ao clicar, evitando travamentos após interações
  document.addEventListener('mousedown', () => {
    if (tooltip.style.display === 'block') {
      tooltip.style.display = 'none';
      activeEl = null;
    }
  });

  function positionTooltip(e) {
    const tipW = tooltip.offsetWidth || 240;
    const tipH = tooltip.offsetHeight || 60;
    let x = e.clientX + 14;
    let y = e.clientY + 14;

    if (x + tipW > window.innerWidth - 12) {
      x = e.clientX - tipW - 14;
    }
    if (y + tipH > window.innerHeight - 12) {
      y = e.clientY - tipH - 14;
    }

    tooltip.style.left = `${Math.max(8, x)}px`;
    tooltip.style.top = `${Math.max(8, y)}px`;
  }
}

// ============================================================================
// DOCK MAXIMIZE AND ADVANCED FX (MODULE 6)
// ============================================================================
function toggleDockMaximize() {
  const dock = document.querySelector('.dock-zone');
  const btn = document.getElementById('btn-maximize-dock');
  if (dock) {
    dock.classList.toggle('maximized');
    if (dock.classList.contains('maximized')) {
      btn.innerHTML = '<span class="icon">◱</span> RESTORE';
      btn.style.color = 'var(--cyan)';
    } else {
      btn.innerHTML = '<span class="icon">⛶</span> MAXIMIZE';
      btn.style.color = 'var(--text-dim)';
    }
  }
}
window.toggleDockMaximize = toggleDockMaximize;

function applyAdvFxPreset(presetName) {
  // Update buttons
  document.querySelectorAll('#tab-fx .kin-preset-btn').forEach(btn => btn.classList.remove('active'));
  const btn = Array.from(document.querySelectorAll('#tab-fx .kin-preset-btn')).find(b => b.getAttribute('onclick') === `applyAdvFxPreset('${presetName}')`);
  if (btn) btn.classList.add('active');

  const setSlider = (id, val) => {
    const el = document.getElementById(id);
    if(el) {
      el.value = val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  };
  const setToggle = (id, state) => {
    const el = document.getElementById(id);
    if(el) {
      el.checked = state;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  // Smart settings based on curation
  switch(presetName) {
    case 'DISPLACER':
      setToggle('chk-fx-displacer', true);
      setSlider('slider-fx-disp-scale', 45);
      setSlider('slider-fx-disp-offset', 90);
      setToggle('chk-fx-pixel', false);
      setToggle('chk-fx-scan', false);
      setToggle('chk-fx-mod', false);
      break;
    case 'PIXEL_SORT':
      setToggle('chk-fx-pixel', true);
      setSlider('slider-fx-px-thresh', 75);
      setSlider('slider-fx-px-length', 120);
      setToggle('chk-fx-displacer', false);
      setToggle('chk-fx-scan', false);
      setToggle('chk-fx-mod', false);
      break;
    case 'CRT_SCAN':
      setToggle('chk-fx-scan', true);
      setSlider('slider-fx-scan-freq', 24);
      setSlider('slider-fx-scan-amp', 30);
      setToggle('chk-fx-displacer', false);
      setToggle('chk-fx-pixel', false);
      setToggle('chk-fx-mod', false);
      break;
    case 'MODULATION':
      setToggle('chk-fx-mod', true);
      setSlider('slider-fx-mod-fb', 92);
      setSlider('slider-fx-mod-phase', 45);
      setToggle('chk-fx-displacer', false);
      setToggle('chk-fx-pixel', false);
      setToggle('chk-fx-scan', false);
      break;
    case 'BYPASS':
      setToggle('chk-fx-displacer', false);
      setToggle('chk-fx-pixel', false);
      setToggle('chk-fx-scan', false);
      setToggle('chk-fx-mod', false);
      break;
  }
}
window.applyAdvFxPreset = applyAdvFxPreset;

// Bind FX Slider/Toggle events to send WebSocket/OSC messages
setTimeout(() => {
  const fxBindings = [
    { id: 'chk-fx-displacer', type: 'toggle', path: '/fx/displacer/enable' },
    { id: 'slider-fx-disp-scale', type: 'slider', path: '/fx/displacer/scale' },
    { id: 'slider-fx-disp-offset', type: 'slider', path: '/fx/displacer/offset' },
    { id: 'chk-fx-pixel', type: 'toggle', path: '/fx/pixel/enable' },
    { id: 'slider-fx-px-thresh', type: 'slider', path: '/fx/pixel/thresh' },
    { id: 'slider-fx-px-length', type: 'slider', path: '/fx/pixel/length' },
    { id: 'chk-fx-scan', type: 'toggle', path: '/fx/scan/enable' },
    { id: 'slider-fx-scan-freq', type: 'slider', path: '/fx/scan/freq' },
    { id: 'slider-fx-scan-amp', type: 'slider', path: '/fx/scan/amp' },
    { id: 'chk-fx-mod', type: 'toggle', path: '/fx/mod/enable' },
    { id: 'slider-fx-mod-fb', type: 'slider', path: '/fx/mod/fb' },
    { id: 'slider-fx-mod-phase', type: 'slider', path: '/fx/mod/phase' }
  ];

  fxBindings.forEach(binding => {
    const el = document.getElementById(binding.id);
    if (!el) return;

    if (binding.type === 'toggle') {
      el.addEventListener('change', (e) => {
        if(ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'control', path: binding.path, value: e.target.checked ? 1 : 0 }));
        }
      });
    } else if (binding.type === 'slider') {
      el.addEventListener('input', (e) => {
        // Update label
        const lbl = document.getElementById(`val-${binding.id.replace('slider-', '')}`);
        if(lbl) lbl.innerText = e.target.value;
        
        if(ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'control', path: binding.path, value: parseFloat(e.target.value) }));
        }
      });
    }
  });
}, 500);

// ============================================================================
// WORKSPACE RESIZE SPLITTER (DUAL MONITORS vs PRO DOCK)
// ============================================================================
function initWorkspaceSplitter() {
  const splitter = document.getElementById('workspace-splitter');
  const topZone = document.querySelector('.top-zone');
  if (!splitter || !topZone) return;

  // Restore saved height from UserProfileManager
  if (typeof UserProfileManager !== 'undefined') {
    const savedH = UserProfileManager.getSetting('workspace_top_height', null);
    if (savedH && typeof savedH === 'number' && savedH >= 140 && savedH <= window.innerHeight * 0.72) {
      topZone.style.height = `${savedH}px`;
      topZone.style.flexBasis = `${savedH}px`;
    }
  }

  let isDragging = false;
  let startY = 0;
  let startHeight = 0;

  const onPointerDown = (e) => {
    isDragging = true;
    startY = e.clientY;
    startHeight = topZone.getBoundingClientRect().height;
    splitter.classList.add('is-dragging');
    document.body.classList.add('resizing-workspace-active');
    try { splitter.setPointerCapture(e.pointerId); } catch (_) {}
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    e.preventDefault();
  };

  const onPointerMove = (e) => {
    if (!isDragging) return;
    const deltaY = e.clientY - startY;
    const minH = 140;
    const maxH = Math.max(minH, window.innerHeight - 200);
    const newHeight = Math.min(Math.max(startHeight + deltaY, minH), maxH);
    topZone.style.height = `${newHeight}px`;
    topZone.style.flexBasis = `${newHeight}px`;
    if (typeof renderQueueCards === 'function') {
      renderQueueCards();
    }
  };

  const onPointerUp = (e) => {
    if (!isDragging) return;
    isDragging = false;
    splitter.classList.remove('is-dragging');
    document.body.classList.remove('resizing-workspace-active');
    try { if (e && e.pointerId) splitter.releasePointerCapture(e.pointerId); } catch (_) {}
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);

    const finalH = Math.round(topZone.getBoundingClientRect().height);
    if (typeof UserProfileManager !== 'undefined') {
      UserProfileManager.setSetting('workspace_top_height', finalH);
    }
    if (typeof renderQueueCards === 'function') {
      renderQueueCards();
    }
  };

  splitter.addEventListener('pointerdown', onPointerDown);

  // Double-click resets default 32% viewport height
  splitter.addEventListener('dblclick', () => {
    const defH = Math.round(window.innerHeight * 0.32);
    topZone.style.height = `${defH}px`;
    topZone.style.flexBasis = `${defH}px`;
    if (typeof UserProfileManager !== 'undefined') {
      UserProfileManager.setSetting('workspace_top_height', defH);
    }
    if (typeof renderQueueCards === 'function') {
      renderQueueCards();
    }
  });
}
window.initWorkspaceSplitter = initWorkspaceSplitter;

// ============================================================================
// LIBRARY BINS SIDEBAR RESIZE SPLITTER
// ============================================================================
function initLibrarySidebarSplitter() {
  const splitter = document.getElementById('library-sidebar-splitter');
  const sidebar = document.getElementById('library-sidebar');
  if (!splitter || !sidebar) return;

  // Restore saved width from UserProfileManager
  if (typeof UserProfileManager !== 'undefined') {
    const savedW = UserProfileManager.getSetting('library_sidebar_width', null);
    if (savedW && typeof savedW === 'number' && savedW >= 150 && savedW <= 480) {
      sidebar.style.width = `${savedW}px`;
      sidebar.style.flexBasis = `${savedW}px`;
    }
  }

  let isDragging = false;
  let startX = 0;
  let startWidth = 0;

  const onPointerDown = (e) => {
    if (sidebar.classList.contains('is-collapsed')) return;
    isDragging = true;
    startX = e.clientX;
    startWidth = sidebar.getBoundingClientRect().width;
    splitter.classList.add('is-dragging');
    document.body.style.cursor = 'col-resize';
    try { splitter.setPointerCapture(e.pointerId); } catch (_) {}
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    e.preventDefault();
  };

  const onPointerMove = (e) => {
    if (!isDragging) return;
    const deltaX = e.clientX - startX;
    const minW = 150;
    const maxW = 460;
    const newWidth = Math.min(Math.max(startWidth + deltaX, minW), maxW);
    sidebar.style.width = `${newWidth}px`;
    sidebar.style.flexBasis = `${newWidth}px`;
  };

  const onPointerUp = (e) => {
    if (!isDragging) return;
    isDragging = false;
    splitter.classList.remove('is-dragging');
    document.body.style.cursor = '';
    try { if (e && e.pointerId) splitter.releasePointerCapture(e.pointerId); } catch (_) {}
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);

    const finalW = Math.round(sidebar.getBoundingClientRect().width);
    if (typeof UserProfileManager !== 'undefined') {
      UserProfileManager.setSetting('library_sidebar_width', finalW);
    }
  };

  splitter.addEventListener('pointerdown', onPointerDown);

  // Double-click resets default 220px width
  splitter.addEventListener('dblclick', () => {
    sidebar.style.width = '220px';
    sidebar.style.flexBasis = '220px';
    if (typeof UserProfileManager !== 'undefined') {
      UserProfileManager.setSetting('library_sidebar_width', 220);
    }
  });
}
window.initLibrarySidebarSplitter = initLibrarySidebarSplitter;

// ============================================================================
// DOCK VIEW MODES: MÓDULOS & ASSETS vs PRO TIMELINE (ZERO SPACE COMPETITION)
// ============================================================================
let currentDockViewMode = 'modules'; // 'modules' | 'timeline'

function setDockViewMode(mode) {
  currentDockViewMode = mode;
  const btnModules = document.getElementById('btn-mode-modules');
  const btnTimeline = document.getElementById('btn-mode-timeline');
  const viewModules = document.getElementById('dock-modules-view');
  const viewTimeline = document.getElementById('dock-timeline-view');
  const tabsBar = document.getElementById('dock-tabs-bar');
  const lblQuick = document.getElementById('lbl-quick-switch-text');

  if (mode === 'timeline') {
    if (btnModules) btnModules.classList.remove('active');
    if (btnTimeline) btnTimeline.classList.add('active');
    if (viewModules) viewModules.style.display = 'none';
    if (viewTimeline) viewTimeline.style.display = 'flex';
    if (tabsBar) tabsBar.style.display = 'none';
    if (lblQuick) lblQuick.textContent = '▤ VER MÓDULOS';

    // Trigger canvas render to match full expanded height
    requestAnimationFrame(() => {
      if (typeof renderQueueCards === 'function') renderQueueCards();
    });
  } else {
    if (btnModules) btnModules.classList.add('active');
    if (btnTimeline) btnTimeline.classList.remove('active');
    if (viewModules) viewModules.style.display = 'flex';
    if (viewTimeline) viewTimeline.style.display = 'none';
    if (tabsBar) tabsBar.style.display = 'flex';
    if (lblQuick) lblQuick.textContent = '⏱️ TIMELINE PRO';
  }

  if (typeof UserProfileManager !== 'undefined') {
    UserProfileManager.setSetting('dock_view_mode', mode);
  }
}
window.setDockViewMode = setDockViewMode;

function toggleDockViewMode() {
  setDockViewMode(currentDockViewMode === 'timeline' ? 'modules' : 'timeline');
}
window.toggleDockViewMode = toggleDockViewMode;

function initDockViewModes() {
  if (typeof UserProfileManager !== 'undefined') {
    const savedMode = UserProfileManager.getSetting('dock_view_mode', 'modules');
    if (savedMode === 'timeline') {
      setDockViewMode('timeline');
    }
    const savedAssetType = UserProfileManager.getSetting('library_active_asset_type', 'all');
    if (savedAssetType && typeof selectLibraryAssetType === 'function') {
      selectLibraryAssetType(savedAssetType);
    }
  }
}
window.initDockViewModes = initDockViewModes;

function cueNextFromQueue() {
  if (queueList && queueList.length > 0) {
    const nextItem = queueList[0];
    if (nextItem && nextItem.id) {
      routeClipToBus(nextItem.id, 'B');
    }
  }
}
window.cueNextFromQueue = cueNextFromQueue;

// ============================================================================
// PRO PREFERENCES SEARCH & FILTERING ENGINE
// ============================================================================
function filterPreferencesSearch(query) {
  const q = (query || '').toLowerCase().trim();
  const rows = document.querySelectorAll('.cfg-prop-row');
  let firstMatchTab = null;

  rows.forEach(row => {
    const text = row.textContent.toLowerCase();
    const match = !q || text.includes(q);
    row.style.display = match ? 'flex' : 'none';

    if (match && !firstMatchTab && q) {
      const panel = row.closest('.settings-tab-panel');
      if (panel) {
        firstMatchTab = panel.id.replace('settings-panel-', '');
      }
    }
  });

  // If search term entered, automatically navigate to first tab with matches if active has 0
  if (q && firstMatchTab) {
    const activePanel = document.querySelector('.settings-tab-panel.active');
    const visibleCount = activePanel ? Array.from(activePanel.querySelectorAll('.cfg-prop-row')).filter(r => r.style.display !== 'none').length : 0;
    if (visibleCount === 0) {
      setSettingsTab(firstMatchTab);
    }
  }
}
window.filterPreferencesSearch = filterPreferencesSearch;

function clearPreferencesSearch() {
  const input = document.getElementById('cfg-search-input');
  if (input) input.value = '';
  filterPreferencesSearch('');
}
window.clearPreferencesSearch = clearPreferencesSearch;

