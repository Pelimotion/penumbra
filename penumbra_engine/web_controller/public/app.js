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

function safeCDNMediaUrl(value) {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'gigantera-penumbra.b-cdn.net' || parsed.port || parsed.username || parsed.password) return '';
    return parsed.href;
  } catch {
    return '';
  }
}

function safeManifestPath(value) {
  if (typeof value !== 'string' || !value || value.includes('\\') || value.includes('%') || value.startsWith('/') || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)) return null;
  const segments = value.split('/');
  if (segments.some(segment => !segment || segment === '.' || segment === '..')) return null;
  return segments.join('/');
}

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function cdnAssetUrl(value) {
  const safePath = safeManifestPath(value);
  return safePath ? `https://gigantera-penumbra.b-cdn.net/${safePath.split('/').map(encodeURIComponent).join('/')}` : '';
}

// ============================================================================
// 0. HYBRID ASSET RESOLUTION STRATEGY (HARS)
// ============================================================================
// Determines if we are running locally, remotely controlling local, or fully cloud
const HARS = {
  getMode: () => {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') return 'local';
    if (window.location.hostname.includes('gigantera.xyz') || window.location.hostname.includes('vercel.app')) return 'cloud';
    return 'lan';
  },
  getApiBase: () => {
    const mode = HARS.getMode();
    const storedIP = localStorage.getItem('penumbra_lan_ip');
    if (mode === 'local') return '';
    if (mode === 'cloud' && storedIP) return `http://${storedIP}:3000`;
    // No cloud host (ex: gigantera.xyz ou vercel.app), manifestos e rotas estáticas residem na mesma origem
    if (mode === 'cloud') return ''; 
    return ''; // LAN mode usa caminhos relativos
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
  resolveUrl: (path) => {
    const base = HARS.getApiBase();
    if (base) {
      const cleanPath = String(path || '').startsWith('/') ? path : `/${path}`;
      return `${base.replace(/\/+$/, '')}${cleanPath}`;
    }
    const clean = String(path || '').replace(/^\/+/, '');
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/penumbra')) {
      return `/penumbra/${clean}`;
    }
    return `/${clean}`;
  }
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
// 0.45 INDEXEDDB DIRECTORY HANDLE PERSISTENCE ENGINE (CHROMIUM STRUCTURED CLONE)
// ============================================================================
const PenumbraIDB = {
  DB_NAME: 'penumbra_local_storage_db',
  STORE_HANDLES: 'folder_handles',
  db: null,

  init: async () => {
    if (typeof indexedDB === 'undefined') return null;
    if (PenumbraIDB.db) return PenumbraIDB.db;
    return new Promise((resolve) => {
      const req = indexedDB.open(PenumbraIDB.DB_NAME, 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(PenumbraIDB.STORE_HANDLES)) {
          db.createObjectStore(PenumbraIDB.STORE_HANDLES);
        }
      };
      req.onsuccess = (e) => {
        PenumbraIDB.db = e.target.result;
        resolve(PenumbraIDB.db);
      };
      req.onerror = () => resolve(null);
    });
  },

  setHandle: async (key, handle) => {
    try {
      const db = await PenumbraIDB.init();
      if (!db) return false;
      return new Promise((resolve) => {
        const tx = db.transaction(PenumbraIDB.STORE_HANDLES, 'readwrite');
        tx.objectStore(PenumbraIDB.STORE_HANDLES).put(handle, key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      });
    } catch (e) {
      console.warn('[PenumbraIDB] Falha ao salvar DirectoryHandle:', e);
      return false;
    }
  },

  getHandle: async (key) => {
    try {
      const db = await PenumbraIDB.init();
      if (!db) return null;
      return new Promise((resolve) => {
        const tx = db.transaction(PenumbraIDB.STORE_HANDLES, 'readonly');
        const req = tx.objectStore(PenumbraIDB.STORE_HANDLES).get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
    } catch (e) {
      return null;
    }
  },

  clearHandle: async (key) => {
    try {
      const db = await PenumbraIDB.init();
      if (!db) return false;
      return new Promise((resolve) => {
        const tx = db.transaction(PenumbraIDB.STORE_HANDLES, 'readwrite');
        tx.objectStore(PenumbraIDB.STORE_HANDLES).delete(key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      });
    } catch (e) {
      return false;
    }
  }
};
window.PenumbraIDB = PenumbraIDB;

// ============================================================================
// 0.5 TRI-SOURCE MEDIA PROVIDER (STANDALONE VJ ARCHITECTURE)
// ============================================================================
function normalizeMediaFilename(name) {
  if (!name) return '';
  return String(name)
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

const MediaProvider = {
  mode: 'none', // 'local', 'cdn', 'youtube'
  localDirHandle: null,
  localFilesMap: new Map(), // relative_path -> File object
  localFilesByName: new Map(), // normalized_filename -> { file, path, isServer, size_mb }

  isLocalFileConnected: (clip) => {
    if (!clip) return false;
    if (clip.is_stream || clip.is_generative) return true;
    if (clip.has_local_match) return true;
    if (clip.relative_path && MediaProvider.localFilesMap.has(clip.relative_path)) return true;
    const norm = (clip.filename || '').toLowerCase().trim();
    const normClean = normalizeMediaFilename(clip.filename);
    if (norm && MediaProvider.localFilesByName.has(norm)) return true;
    if (normClean && MediaProvider.localFilesByName.has(normClean)) return true;
    if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
      if (clip.is_downloaded || (clip.relative_path && !clip.relative_path.startsWith('LOCAL_') && !clip.relative_path.startsWith('EXTRA_'))) return true;
    }
    return false;
  },

  initLocal: async (dirHandle) => {
    MediaProvider.mode = 'local';
    MediaProvider.localDirHandle = dirHandle;
    MediaProvider.localFilesMap.clear();
    MediaProvider.localFilesByName.clear();
    const clips = [];

    // Persiste handle de diretório no IndexedDB para sessões futuras
    if (dirHandle && typeof PenumbraIDB !== 'undefined') {
      PenumbraIDB.setHandle('last_directory_handle', dirHandle);
      if (typeof UserProfileManager !== 'undefined' && UserProfileManager.profile) {
        UserProfileManager.profile.last_local_folder_name = dirHandle.name;
        UserProfileManager.save(false);
      }
    }

    // Auto-index local backend files if running on localhost
    await MediaProvider.initLocalFilesAutoIndex();

    // 1. If no dirHandle is passed (e.g. localhost direct server connection)
    if (!dirHandle) {
      if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
        try {
          const res = await fetch('/api/manifest');
          if (res.ok) {
            const serverClips = await res.json();
            if (Array.isArray(serverClips) && serverClips.length > 0) {
              console.log(`[Media Nexus] Conectado diretamente ao acervo do servidor local (${serverClips.length} clipes).`);
              return serverClips;
            }
          }
        } catch (e) {
          console.warn('[Media Nexus] Falha ao consultar /api/manifest:', e);
        }
      }
      return [];
    }

    // 2. Check if there is already a local manifest in the directory
    async function getLocalManifest(handle) {
      try {
        const fileHandle = await handle.getFileHandle('media_manifest.json');
        const file = await fileHandle.getFile();
        return JSON.parse(await file.text());
      } catch (e) {
        return null;
      }
    }

    const localManifest = await getLocalManifest(dirHandle);

    // 3. Robust recursive folder scan ignoring hidden/system files
    const IGNORED_NAMES = new Set(['.git', '.ds_store', 'node_modules', 'cdn_build', '.agents', 'dist', 'build']);
    const VALID_EXTS = new Set(['mp4', 'mov', 'webm', 'm4v', 'mkv', 'avi', 'mp3', 'wav', 'json']);

    async function scanDir(handle, currentPath = '') {
      try {
        for await (const entry of handle.values()) {
          const lowerName = (entry.name || '').toLowerCase().trim();
          if (!lowerName || IGNORED_NAMES.has(lowerName) || lowerName.startsWith('.')) continue;

          const entryPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
          if (entry.kind === 'file') {
            const ext = lowerName.split('.').pop();
            if (VALID_EXTS.has(ext)) {
              try {
                const file = await entry.getFile();
                MediaProvider.localFilesMap.set(entryPath, file);
                const fileEntryData = {
                  file,
                  path: entryPath,
                  filename: entry.name,
                  size_mb: Math.round((file.size / (1024 * 1024)) * 100) / 100,
                  isServer: false
                };
                MediaProvider.localFilesByName.set(lowerName, fileEntryData);
                MediaProvider.localFilesByName.set(normalizeMediaFilename(entry.name), fileEntryData);

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
                    id: `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    filename: entry.name,
                    folder: currentPath || 'ROOT',
                    relative_path: entryPath,
                    absolute_path: entryPath,
                    width: 1920, height: 1080, duration: 10.0, fps: 60.0,
                    codec: ext,
                    category: currentPath.split('/')[0].toUpperCase() || 'LOCAL POOL',
                    suggested_layer: 0,
                    thumbnail: '',
                    is_local: true
                  });
                }
              } catch (fileErr) {
                console.warn(`[Media Nexus] Falha ao ler arquivo ${entry.name}:`, fileErr);
              }
            }
          } else if (entry.kind === 'directory') {
            await scanDir(entry, entryPath);
          }
        }
      } catch (dirErr) {
        console.warn(`[Media Nexus] Falha ao iterar pasta ${currentPath}:`, dirErr);
      }
    }

    await scanDir(dirHandle);

    if (localManifest && Array.isArray(localManifest) && localManifest.length > 0) {
      console.log(`[Media Nexus] Usando media_manifest.json local otimizado (${localManifest.length} clipes).`);
      return localManifest;
    }

    // 4. If 0 clips found via folder picker, fall back to localhost manifest if available
    if (clips.length === 0) {
      if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
        try {
          const res = await fetch('/api/manifest');
          if (res.ok) {
            const serverClips = await res.json();
            if (Array.isArray(serverClips) && serverClips.length > 0) {
              console.log(`[Media Nexus] Pasta selecionada vazia; recuperados ${serverClips.length} clipes da biblioteca local do servidor.`);
              return serverClips;
            }
          }
        } catch (e) {}
      }
      console.warn('[Media Nexus] Nenhum arquivo compatível encontrado na pasta selecionada.');
    }

    return clips;
  },

  scanExtraDir: async (dirHandle) => {
    if (dirHandle && typeof PenumbraIDB !== 'undefined') {
      PenumbraIDB.setHandle('last_directory_handle', dirHandle);
      if (typeof UserProfileManager !== 'undefined' && UserProfileManager.profile) {
        UserProfileManager.profile.last_local_folder_name = dirHandle.name;
        UserProfileManager.save(false);
      }
    }
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
      const normClean = normalizeMediaFilename(clip.filename);
      const baseName = clip.relative_path ? clip.relative_path.split('/').pop().toLowerCase().trim() : '';
      const baseClean = normalizeMediaFilename(baseName);
      const match = MediaProvider.localFilesByName.get(norm) ||
                    MediaProvider.localFilesByName.get(normClean) ||
                    (baseName ? MediaProvider.localFilesByName.get(baseName) : null) ||
                    (baseClean ? MediaProvider.localFilesByName.get(baseClean) : null);
      if (match) {
        clip.has_local_match = true;
        clip.local_match_info = match;
        clip.is_disconnected = false;
        clip.needs_relink = false;
        if (match.path) clip.relative_path = match.path;
        if (match.file instanceof File) {
          MediaProvider.localFilesMap.set(clip.relative_path, match.file);
        }
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
    // 1. Try host origin manifest first (same-origin, zero CORS overhead)
    try {
      const originPath = typeof HARS !== 'undefined' ? HARS.resolveUrl('media_manifest.json') : '/media_manifest.json';
      const resHost = await fetch(originPath);
      if (resHost.ok) {
        console.log('[MediaProvider] Loaded manifest from host origin');
        return await resHost.json();
      }
    } catch(eHost) {}
    // 2. Try Bunny Edge CDN
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
    const normClean = normalizeMediaFilename(clip?.filename || relPath.split('/').pop() || '');

    // 0. Smart Deduplication: If file exists locally on SSD or via File System Access API
    const smartDedup = typeof UserProfileManager !== 'undefined' ? UserProfileManager.getSetting('smart_dedup_enabled', true) : true;
    if (smartDedup) {
      const match = MediaProvider.localFilesByName.get(normName) || MediaProvider.localFilesByName.get(normClean);
      if (match) {
        if (match.file instanceof File) {
          return URL.createObjectURL(match.file);
        }
        if (match.isServer && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
          return `/api/raw-video?path=${encodeURIComponent(match.path || match.filename)}`;
        }
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

    // 3.5. Local server streaming if on localhost and server running
    if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
      if (relPath && !relPath.startsWith('http') && !relPath.startsWith('LOCAL_') && !relPath.startsWith('EXTRA_')) {
        return `/api/raw-video?path=${encodeURIComponent(relPath)}`;
      }
    }

    // 4. Standalone File System Access API & Local Ingested Files (Available in any mode)
    if (MediaProvider.localFilesMap.has(relPath)) {
      const f = MediaProvider.localFilesMap.get(relPath);
      if (f instanceof File) return URL.createObjectURL(f);
    }
    const baseName = relPath.split('/').pop();
    for (const [k, v] of MediaProvider.localFilesMap.entries()) {
      if (k.endsWith(baseName) && (v instanceof File)) return URL.createObjectURL(v);
    }

    // 5. Direct external HTTP URL
    if (relPath.startsWith('http://') || relPath.startsWith('https://')) {
      if (relPath.includes('gigantera-penumbra.b-cdn.net')) return safeCDNMediaUrl(relPath);
      if (clip && clip.is_stream && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && !relPath.includes('/api/stream/proxy')) {
        return `/api/stream/proxy?url=${encodeURIComponent(relPath)}`;
      }
      return relPath;
    }

    // 6. Local downloaded files (media_pool/downloads)
    if (relPath.startsWith('downloads/') || (clip && clip.is_downloaded)) {
      const cleanDown = relPath.startsWith('/') ? relPath : `/${relPath}`;
      return cleanDown;
    }

    // 7. Se for arquivo explicitamente local do usuário que está desconectado, tenta reconexão inteligente
    if (clip && (clip.is_local || clip.id.startsWith('local_') || relPath.startsWith('LOCAL_') || relPath.startsWith('EXTRA_'))) {
      if (MediaProvider.localFilesByName.has(normName)) {
        const item = MediaProvider.localFilesByName.get(normName);
        if (item && item.file instanceof File) return URL.createObjectURL(item.file);
      }
      clip.is_disconnected = true;
      clip.needs_relink = true;
      return '';
    }

    // 8. Se estiver em nuvem/remoto, busca o arquivo Gigantera legítimo no storage da CDN
    if (relPath && !relPath.startsWith('LOCAL_') && !relPath.startsWith('EXTRA_')) {
      return cdnAssetUrl(relPath);
    }

    return '';
  },

  getThumbUrl: (clip) => {
    if (!clip) return '';
    if (clip.thumbnail && (clip.thumbnail.startsWith('http://') || clip.thumbnail.startsWith('https://'))) {
      if (clip.thumbnail.startsWith('https://img.youtube.com/vi/')) return clip.thumbnail;
      return safeCDNMediaUrl(clip.thumbnail);
    }
    const ytId = clip.youtube_id || extractYouTubeId(clip.filename) || extractYouTubeId(clip.relative_path);
    if (ytId) {
      return `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;
    }
    if (!clip.thumbnail) return '';
    const cleanThumb = safeManifestPath(clip.thumbnail.startsWith('/') ? clip.thumbnail.substring(1) : clip.thumbnail);
    if (!cleanThumb) return '';
    const encodedThumb = cleanThumb.split('/').map(encodeURIComponent).join('/');
    if (clip.is_downloaded && !clip.thumbnail.startsWith('http')) return `/thumbnails/${encodedThumb}`;
    if (MediaProvider.mode === 'cdn' && !clip.is_downloaded) return cdnAssetUrl(cleanThumb);
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') return `/thumbnails/${encodedThumb}`;
    return cdnAssetUrl(cleanThumb);
  },

  getPreviewAnimUrl: (clip) => {
    if (!clip || !clip.preview_anim) return '';
    if (clip.preview_anim.startsWith('http://') || clip.preview_anim.startsWith('https://')) {
      if (clip.preview_anim.includes('gigantera-penumbra.b-cdn.net')) return safeCDNMediaUrl(clip.preview_anim);
      return '';
    }
    return cdnAssetUrl(clip.preview_anim);
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
    layer0: { active: true, opacity: 1.0, clipId: 'clip_001', name: 'Animate_silver_tail_in_sand_202608120209.mp4', blend: 'Normal', matte: 'none', matte_invert: false, rotation: 0, scale: 1.0, pos_x: 0, pos_y: 0, fit_mode: 'fill' },
    layer1: { active: true, scale: 1.12, blend: 'Multiply', opacity: 0.0, matte: 'none', matte_invert: false, rotation: 0, pos_x: 0, pos_y: 0, fit_mode: 'fill' },
    layer2: { active: true, opacity: 0.85, blend: 'Screen', edge_mix: 0.85, edge_threshold: 0.28, luminance: 2.8, edge_width: 2.2, matte: 'none', matte_invert: false, rotation: 0, scale: 1.0, pos_x: 0, pos_y: 0, fit_mode: 'fill' },
    layer3: { active: true, opacity: 1.0, blend: 'Normal', clipId: 'clip_005', name: 'Metallic_spine_sculpture_moving_1080p_202608292000.mp4', matte: 'none', matte_invert: false, rotation: 0, scale: 1.0, pos_x: 0, pos_y: 0, fit_mode: 'fill' },
    layer4: { active: false, opacity: 0.0, blend: 'Difference', clipId: 'clip_006', name: 'Silver_fish_spine_descending_ocean_202608120051.mp4', matte: 'none', matte_invert: false, rotation: 0, scale: 1.0, pos_x: 0, pos_y: 0, fit_mode: 'fill' },
    layer5: { active: true, opacity: 0.0, blend: 'Screen', clipId: 'clip_002', name: 'Installation_documentation_breat…_202603282136.mp4', matte: 'none', matte_invert: false, rotation: 0, scale: 1.0, pos_x: 0, pos_y: 0, fit_mode: 'fill' }
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
  master_locked_matte: 'none',
  master_locked_matte_active: false,
  master_locked_matte_invert: false,
  tonal: {
    gamma: 0.85,
    brightness: -0.05,
    midtones: 1.00,
    contrast: 1.18,
    edge_mix: 0.85,
    edge_threshold: 0.28,
    edge_luminance: 2.8,
    edge_width: 2.2
  },
  matte: {
    bank: 'B',
    name: 'matte_b_penumbra_vignette.png',
    active_path: 'matte_b_penumbra_vignette.png',
    invert: false,
    opacity: 1.0,
    transform: {
      pos_x: 0,
      pos_y: 0,
      scale: 1.0,
      scale_x: 1.0,
      scale_y: 1.0,
      rotation: 0
    },
    vignette: {
      enabled: false,
      roundness: 0.65,    // 0 = sharp rect, 0.65 = rounded, 1.0 = full oval/circle
      feather: 0.38,      // softness falloff (0.05 to 1.0)
      inner_radius: 0.42,
      outer_radius: 0.95,
      aspect_ratio: '16:9',
      aspect_ovality: 1.0,
      audio_pulse: 0.15,
      audio_band: 'bass'
    },
    deform: {
      wiggle_scale: 0.04,
      wiggle_pos: 8,
      posterize_rate: 8,
      edge_warp: 0.08,
      speed: 1.0,
      sync_bpm: true
    }
  },
  gen3d: {
    active_scene: 'star_13', // 'star_13', 'spine', 'black_hole_singularity', 'biomorphic_flora', 'sol_vermelho_horizonte', etc.
    palette: 'pt_rubi',      // 'pt_rubi', 'cyan_neon', 'solar_gold', 'matrix_emerald', 'deep_violet', 'monochrome_ice', 'noir_gold'
    camera: {
      orbit_speed: 1.0,
      tilt: 0.22,
      fov: 1.35,
      distance: 2.3,
      roll: 0.0,
      auto_orbit: true
    },
    particles: {
      count_mult: 1.0,
      point_size: 1.0,
      line_connect_dist: 55,
      wireframe: true,
      glow_intensity: 1.0
    },
    audio_reactivity: {
      spine_swimming: 1.0,    // knob compartilhado: ondulação da coluna em 'spine' E pulso de brilho em 'biomorphic_flora' (cenas tratadas como continuação uma da outra)
      ocean_wave_amp: 1.0,
      star_treble_spin: 1.2,
      num13_sub_kick: 1.8,    // decoupled bass kick on the numeral 13!
      air_sparkle: 1.0
    }
  },
  deckA_3d: null,  // 3D parameters actively driving Program A (Live on air)
  deckB_3d: null,  // 3D parameters driving Cue B (Preview / pre-air staging)
  layer5_3d: null, // 3D parameters driving Layer 5 (Support / Overlay)
  inspector_3d_target: 'deckA', // 'deckA' | 'deckB' | 'layer5'
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
  autopilot_delegation: { media: true, mattes: false, fx: false, kinetics: false },
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
  aspectRatio: '16:9',
  aspect_fit_mode: 'fit',
  vertical_mode: false,
  vertical_projection: false,
  projector_compensation: false,
  audio_gain: 1.0,
  fps_limit: 30,
  network_output_enabled: false,
  fx: {
    active: false,
    manual_locked: false,
    target: 'master', // 'master' (Master PGM Output), 'deck_a' (Deck A L0), 'deck_b' (Deck B L3)
    activeEffect: 'pixel_stretch',
    masterIntensity: 0.8,
    masterSpeed: 1.0,
    auto_adapt: true,
    autopilotActive: false,
    autopilotPreset: 'bypass_clean',
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
const DEFAULT_MATTES_CATALOG = [
  { id: "matte_a_half_left", filename: "matte_a_half_left.png", category: "SOLIDS", category_folder: "cat_a_solids", path: "cat_a_solids/matte_a_half_left.png", name: "Metade Esquerda", description: "Split vertical 50% esquerdo", tags: ["split", "minimal"] },
  { id: "matte_a_half_right", filename: "matte_a_half_right.png", category: "SOLIDS", category_folder: "cat_a_solids", path: "cat_a_solids/matte_a_half_right.png", name: "Metade Direita", description: "Split vertical 50% direito", tags: ["split", "minimal"] },
  { id: "matte_a_half_top", filename: "matte_a_half_top.png", category: "SOLIDS", category_folder: "cat_a_solids", path: "cat_a_solids/matte_a_half_top.png", name: "Metade Superior", description: "Split horizontal 50% superior", tags: ["split", "horizontal"] },
  { id: "matte_a_half_bottom", filename: "matte_a_half_bottom.png", category: "SOLIDS", category_folder: "cat_a_solids", path: "cat_a_solids/matte_a_half_bottom.png", name: "Metade Inferior", description: "Split horizontal 50% inferior", tags: ["split", "horizontal"] },
  { id: "matte_a_third_center", filename: "matte_a_third_center.png", category: "SOLIDS", category_folder: "cat_a_solids", path: "cat_a_solids/matte_a_third_center.png", name: "Pilar Central (1/3)", description: "Coluna vertical centralizada de um terço", tags: ["pillar", "cinematic"] },
  { id: "matte_a_golden_pillar", filename: "matte_a_golden_pillar.png", category: "SOLIDS", category_folder: "cat_a_solids", path: "cat_a_solids/matte_a_golden_pillar.png", name: "Monólito Áureo", description: "Proporção áurea vertical phi (0.382)", tags: ["sacred", "golden"] },
  { id: "matte_a_center_circle", filename: "matte_a_center_circle.png", category: "SOLIDS", category_folder: "cat_a_solids", path: "cat_a_solids/matte_a_center_circle.png", name: "Abertura Circular", description: "Círculo concêntrico de foco central", tags: ["circle", "focus"] },
  { id: "matte_a_anamorphic_slit", filename: "matte_a_anamorphic_slit.png", category: "SOLIDS", category_folder: "cat_a_solids", path: "cat_a_solids/matte_a_anamorphic_slit.png", name: "Fenda Anamórfica 2.39:1", description: "Letterbox cinemascope panorâmico", tags: ["anamorphic", "letterbox"] },
  { id: "matte_a_dual_monolith", filename: "matte_a_dual_monolith.png", category: "SOLIDS", category_folder: "cat_a_solids", path: "cat_a_solids/matte_a_dual_monolith.png", name: "Monólitos Gêmeos", description: "Colunas laterais revelando centro negativo", tags: ["architectural", "brutalist"] },
  { id: "matte_a_diagonal_slash", filename: "matte_a_diagonal_slash.png", category: "SOLIDS", category_folder: "cat_a_solids", path: "cat_a_solids/matte_a_diagonal_slash.png", name: "Corte Diagonal 45°", description: "Corte angular arquitetônico diagonal", tags: ["diagonal", "angular"] },
  { id: "matte_b_penumbra_vignette", filename: "matte_b_penumbra_vignette.png", category: "SOFT", category_folder: "cat_b_soft", path: "cat_b_soft/matte_b_penumbra_vignette.png", name: "Penumbra Vignette Clássica", description: "Degradê suave protegendo o teto de escuridão", tags: ["vignette", "obsidian"] },
  { id: "matte_b_feather_core", filename: "matte_b_feather_core.png", category: "SOFT", category_folder: "cat_b_soft", path: "cat_b_soft/matte_b_feather_core.png", name: "Núcleo Esfumado Oval", description: "Destaque orgânico central sem arestas duras", tags: ["feather", "core"] },
  { id: "matte_b_soft_horizon", filename: "matte_b_soft_horizon.png", category: "SOFT", category_folder: "cat_b_soft", path: "cat_b_soft/matte_b_soft_horizon.png", name: "Horizonte Suave", description: "Degradê horizontal imitando neblina atmosférica", tags: ["horizon", "atmosphere"] },
  { id: "matte_b_diagonal_wash", filename: "matte_b_diagonal_wash.png", category: "SOFT", category_folder: "cat_b_soft", path: "cat_b_soft/matte_b_diagonal_wash.png", name: "Lavagem Diagonal", description: "Luz oblíqua suave cinematográfica", tags: ["wash", "oblique"] },
  { id: "matte_b_inverse_spotlight", filename: "matte_b_inverse_spotlight.png", category: "SOFT", category_folder: "cat_b_soft", path: "cat_b_soft/matte_b_inverse_spotlight.png", name: "Spotlight Invertido", description: "Núcleo ocluso em penumbra com periferia revelada", tags: ["inverse", "negative"] },
  { id: "matte_b_smoke_density", filename: "matte_b_smoke_density.png", category: "SOFT", category_folder: "cat_b_soft", path: "cat_b_soft/matte_b_smoke_density.png", name: "Densidade de Névoa", description: "Micro-textura esfumada em suspensão", tags: ["smoke", "texture"] },
  { id: "matte_c_staccato_blinds", filename: "matte_c_staccato_blinds.png", category: "TEMPO", category_folder: "cat_c_tempo", path: "cat_c_tempo/matte_c_staccato_blinds.png", name: "Persianas Verticais (16)", description: "Ripas arquitetônicas para sincronia rítmica", tags: ["staccato", "rhythm"] },
  { id: "matte_c_horizontal_slits", filename: "matte_c_horizontal_slits.png", category: "TEMPO", category_folder: "cat_c_tempo", path: "cat_c_tempo/matte_c_horizontal_slits.png", name: "Fendas Horizontais (12)", description: "Ripas horizontais tipo persiana veneziana", tags: ["staccato", "raster"] },
  { id: "matte_c_stepped_rings", filename: "matte_c_stepped_rings.png", category: "TEMPO", category_folder: "cat_c_tempo", path: "cat_c_tempo/matte_c_stepped_rings.png", name: "Anéis Concêntricos", description: "Ondas circulares quantizadas em tempo", tags: ["rings", "ripple"] },
  { id: "matte_c_raster_checker", filename: "matte_c_raster_checker.png", category: "TEMPO", category_folder: "cat_c_tempo", path: "cat_c_tempo/matte_c_raster_checker.png", name: "Xadrez Raster Eletrônico", description: "Malha brutalista Berlin club", tags: ["raster", "checker"] },
  { id: "matte_c_barcode_slits", filename: "matte_c_barcode_slits.png", category: "TEMPO", category_folder: "cat_c_tempo", path: "cat_c_tempo/matte_c_barcode_slits.png", name: "Código de Barras Modular", description: "Intervalos assíncronos inspirados em partituras gráficas", tags: ["barcode", "serial"] },
  { id: "matte_d_organic_fluid", filename: "matte_d_organic_fluid.png", category: "PROCEDURAL", category_folder: "cat_d_procedural", path: "cat_d_procedural/matte_d_organic_fluid.png", name: "Fluido Mármore Líquido", description: "Morfologia orgânica de densidade líquida", tags: ["fluid", "organic"] },
  { id: "matte_d_dark_nebula", filename: "matte_d_dark_nebula.png", category: "PROCEDURAL", category_folder: "cat_d_procedural", path: "cat_d_procedural/matte_d_dark_nebula.png", name: "Nebulosa Cavernosa", description: "Gradiente procedural escuro de alta granulação", tags: ["nebula", "dark"] },
  { id: "matte_d_lissajous_aperture", filename: "matte_d_lissajous_aperture.png", category: "PROCEDURAL", category_folder: "cat_d_procedural", path: "cat_d_procedural/matte_d_lissajous_aperture.png", name: "Abertura Lissajous", description: "Harmônicos matemáticos com roll-off suave", tags: ["lissajous", "harmonic"] },
  { id: "matte_d_cloud_caverns", filename: "matte_d_cloud_caverns.png", category: "PROCEDURAL", category_folder: "cat_d_procedural", path: "cat_d_procedural/matte_d_cloud_caverns.png", name: "Caverna de Nuvens", description: "Bolsões de escuridão profunda com fendas de luz", tags: ["clouds", "cavern"] },
  { id: "matte_e_diamond_lattice", filename: "matte_e_diamond_lattice.png", category: "STRUCTURAL", category_folder: "cat_e_structural", path: "cat_e_structural/matte_e_diamond_lattice.png", name: "Treliça de Losangos", description: "Geometria estrutural em arame de diamante", tags: ["wireframe", "lattice"] },
  { id: "matte_e_architectural_portal", filename: "matte_e_architectural_portal.png", category: "STRUCTURAL", category_folder: "cat_e_structural", path: "cat_e_structural/matte_e_architectural_portal.png", name: "Portal de Arco", description: "Arco monumental de galeria de arte contemporânea", tags: ["portal", "arch"] },
  { id: "matte_e_blueprint_reticle", filename: "matte_e_blueprint_reticle.png", category: "STRUCTURAL", category_folder: "cat_e_structural", path: "cat_e_structural/matte_e_blueprint_reticle.png", name: "Retículo de Blueprint", description: "Marcadores de enquadramento técnico industrial", tags: ["blueprint", "viewfinder"] },
  { id: "matte_e_concentric_hexagons", filename: "matte_e_concentric_hexagons.png", category: "STRUCTURAL", category_folder: "cat_e_structural", path: "cat_e_structural/matte_e_concentric_hexagons.png", name: "Hexágonos Concêntricos", description: "Estrutura isométrica com ritmo de expansão", tags: ["hexagon", "isometric"] }
];
let allMattes = [...DEFAULT_MATTES_CATALOG];
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
let playerL5 = document.getElementById('player-l5');

// Active Project & Audio Source States
let activeProjectFilter = 'ALL';
let currentAudioSource = { mode: 'test', device_name: 'MP3 Interno (01 REC-2024-04-28.mp3)', devices: [] };

// Offscreen Canvases for Tonal, Edge & Overlay Processing
const offscreenA = document.createElement('canvas');
const offscreenB = document.createElement('canvas');
const offscreenOverlay = document.createElement('canvas');
const sobelCanvas = document.createElement('canvas');
const offCtxA = offscreenA.getContext('2d');
const offCtxB = offscreenB.getContext('2d');
const offCtxOverlay = offscreenOverlay.getContext('2d');
const sobelCtx = sobelCanvas.getContext('2d');
offscreenA.width = 640;
offscreenA.height = 360;
offscreenB.width = 640;
offscreenB.height = 360;
offscreenOverlay.width = 640;
offscreenOverlay.height = 360;
sobelCanvas.width = 640;
sobelCanvas.height = 360;

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

// ----------------------------------------------------------------------------
// CANVAS CONTEXT LOSS RESILIENCE (BROADCAST HDMI & GPU CRASH PROTECTION)
// ----------------------------------------------------------------------------
let pendingContextRestoreRaf = false;
[prgCanvas, prvCanvas, busCanvasA, busCanvasB, offscreenA, offscreenB, handoverCanvas].forEach(cv => {
  if (!cv) return;
  cv.addEventListener('contextlost', (e) => {
    e.preventDefault();
    console.warn('[PENUMBRA ENGINE] Canvas Context Lost detectado! Prevenindo encerramento e aguardando restauração...');
  });
  cv.addEventListener('contextrestored', () => {
    console.log('[PENUMBRA ENGINE] Canvas Context Restaurado com sucesso.');
    lastFrameTime = 0;
    // A GPU reset tende a disparar 'contextrestored' em vários canvases quase ao
    // mesmo tempo; renderVisuals já se reagenda sozinho (requestAnimationFrame no
    // fim do próprio loop), então só a primeira restauração do lote deve iniciar
    // uma nova cadeia de RAF — sem essa guarda, cada canvas abriria seu próprio
    // loop paralelo e duplicaria o render indefinidamente.
    if (pendingContextRestoreRaf) return;
    pendingContextRestoreRaf = true;
    requestAnimationFrame((time) => {
      pendingContextRestoreRaf = false;
      renderVisuals(time);
    });
  });
});

// ----------------------------------------------------------------------------
// LIVE SET SESSION PERSISTENCE & AUTO-RECOVERY (ANTI-CRASH STAGE RESILIENCE)
// ----------------------------------------------------------------------------
function saveLiveSetSession() {
  try {
    if (!appState || !appState.layers) return;
    const sessionSnapshot = {
      timestamp: Date.now(),
      macro_state: appState.macro_state,
      bpm: appState.bpm,
      crossfader: crossfader ? Number(crossfader.value) : 0,
      aspectRatio: appState.aspectRatio,
      vertical_mode: Boolean(appState.vertical_mode),
      blackout: Boolean(appState.blackout),
      layers: {
        layer0: { ...appState.layers.layer0 },
        layer1: { ...appState.layers.layer1 },
        layer2: { ...appState.layers.layer2 },
        layer3: { ...appState.layers.layer3 },
        layer4: { ...appState.layers.layer4 },
        layer5: { ...appState.layers.layer5 }
      }
    };
    sessionStorage.setItem('penumbra_live_set_session', JSON.stringify(sessionSnapshot));
  } catch (err) {}
}

function restoreLiveSetSession() {
  try {
    const raw = sessionStorage.getItem('penumbra_live_set_session');
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!data || !data.layers) return false;
    if (Date.now() - (data.timestamp || 0) > 12 * 3600 * 1000) return false;

    if (data.macro_state) appState.macro_state = data.macro_state;
    if (data.bpm) appState.bpm = data.bpm;
    if (data.aspectRatio) appState.aspectRatio = data.aspectRatio;
    if (data.vertical_mode !== undefined) appState.vertical_mode = data.vertical_mode;
    if (data.blackout !== undefined) appState.blackout = data.blackout;

    for (const [lid, ldata] of Object.entries(data.layers)) {
      if (appState.layers[lid]) {
        appState.layers[lid] = { ...appState.layers[lid], ...ldata };
      }
    }

    if (crossfader && data.crossfader !== undefined) {
      crossfader.value = data.crossfader;
    }
    console.log('[PENUMBRA ENGINE] Set operacional restaurado com sucesso a partir de sessionStorage.');
    return true;
  } catch (err) {
    console.warn('[PENUMBRA ENGINE] Falha ao restaurar sessão de set:', err);
    return false;
  }
}
window.saveLiveSetSession = saveLiveSetSession;
window.restoreLiveSetSession = restoreLiveSetSession;


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
      theaterBadge.textContent = 'PROGRAM (AO VIVO)';
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
    if (typeof updateNetworkOutputUI === 'function') updateNetworkOutputUI();
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
              const isRecentAssignment = (Date.now() - (appState.layers[lid]._assignedAt || 0)) < 1500;
              const safeLprops = { ...lprops };
              if (isRecentAssignment && lprops.clipId && lprops.clipId !== appState.layers[lid].clipId) {
                delete safeLprops.clipId;
                delete safeLprops.name;
              }
              appState.layers[lid] = {
                ...appState.layers[lid],
                ...safeLprops,
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
        // Protect live browser microphone / line-in DSP from being clobbered by backend telemetry
        const isLiveBrowserAudio = (window.PenumbraWebAudio && window.PenumbraWebAudio.isActive) || 
                                   (currentAudioSource && currentAudioSource.mode !== 'test') ||
                                   (appState.audio_source === 'mic' || appState.audio_source === 'p2');
        if (isLiveBrowserAudio) {
          delete incomingData.bands;
          delete incomingData.stems;
          delete incomingData.energy;
          if (!appState.bpm_manual_lock && window.PenumbraWebAudio && window.PenumbraWebAudio.detectedBpm) {
            delete incomingData.bpm;
          }
        }
        if (appState.bpm_manual_lock && incomingData.bpm !== undefined) {
          delete incomingData.bpm;
        }
        if ((appState.manual_forced_state || !appState.auto_mode) && incomingData.macro_state !== undefined) {
          delete incomingData.macro_state;
        }
        if (incomingData.layers) {
          for (const [lid, lprops] of Object.entries(incomingData.layers)) {
            if (appState.layers[lid]) {
              const isRecentAssignment = (Date.now() - (appState.layers[lid]._assignedAt || 0)) < 1500;
              const safeLprops = { ...lprops };
              if (isRecentAssignment && lprops.clipId && lprops.clipId !== appState.layers[lid].clipId) {
                delete safeLprops.clipId;
                delete safeLprops.name;
              }
              appState.layers[lid] = {
                ...appState.layers[lid],
                ...safeLprops,
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
        const preservedLastTakeBar = appState.last_take_total_bar;
        const preservedPhrase = appState.phrase;
        appState = { ...appState, ...incomingData };
        if (preservedLastTakeBar !== undefined) appState.last_take_total_bar = preservedLastTakeBar;
        if (preservedPhrase) appState.phrase = { ...preservedPhrase, ...(incomingData.phrase || {}) };
        window.appState = appState;
        updateMeters();
        // Governance: runAutopilotEngine() runs deterministically inside 60 FPS render loop beat tick,
        // avoiding asynchronous race conditions from 40ms telemetry updates.
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
let lastVideoErrorToastTime = 0;
function attachPlayerErrorHandler(player, label) {
  if (player && !player._hasErrHandler) {
    player._hasErrHandler = true;
    player.addEventListener('error', () => {
      console.warn(`[Player ${label}] Falha ao decodificar sinal de vídeo (${player.src}).`);
      const now = Date.now();
      if (now - lastVideoErrorToastTime > 8000) {
        lastVideoErrorToastTime = now;
        if (MediaProvider.localFilesByName.size === 0) {
          if (typeof showHudMacroToast === 'function') {
            showHudMacroToast('💾 Vídeos brutos no SSD. Clique em "CONECTAR PASTA SSD" para tocar direto do disco!', 6000);
          } else if (typeof showMacroToast === 'function') {
            showMacroToast('💾 Conecte a pasta do SSD para reproduzir do seu disco local');
          }
        }
      }
    });
  }
}

function syncVideoSources() {
  // Layer 0 Base Video (Master Deck A)
  if (playerL0 && appState.layers.layer0.clipId) {
    attachPlayerErrorHandler(playerL0, 'L0');
    playerL0.crossOrigin = 'anonymous';
    playerL0.muted = true;
    playerL0.playsInline = true;
    playerL0.loop = true;
    if (appState.layers.layer0.clipId === 'clip_gen_plexus_spine') {
      if (!playerL0.paused) playerL0.pause();
    } else {
      const clip = allClips.find(c => c.id === appState.layers.layer0.clipId);
      const targetSrc = clip ? MediaProvider.getMediaUrl(clip) : '';
      if (targetSrc && (!playerL0.src.includes(targetSrc) || playerL0.dataset.activeSrc !== targetSrc)) {
        playerL0.dataset.activeSrc = targetSrc;
        playerL0.src = targetSrc;
        playerL0.load();
        playerL0.play().catch(() => {});
      } else if (playerL0.paused && playerL0.readyState >= 2) {
        playerL0.play().catch(() => {});
      }
    }
  }

  // Layer 3 Secondary / Preview Video (Deck B Cue)
  if (playerL3 && appState.layers.layer3.clipId) {
    attachPlayerErrorHandler(playerL3, 'L3');
    playerL3.crossOrigin = 'anonymous';
    playerL3.muted = true;
    playerL3.playsInline = true;
    playerL3.loop = true;
    if (appState.layers.layer3.clipId === 'clip_gen_plexus_spine') {
      if (!playerL3.paused) playerL3.pause();
    } else {
      const clip = allClips.find(c => c.id === appState.layers.layer3.clipId);
      const targetSrc = clip ? MediaProvider.getMediaUrl(clip) : '';
      if (targetSrc && (!playerL3.src.includes(targetSrc) || playerL3.dataset.activeSrc !== targetSrc)) {
        playerL3.dataset.activeSrc = targetSrc;
        playerL3.src = targetSrc;
        playerL3.load();
        playerL3.play().catch(() => {});
      } else if (playerL3.paused && playerL3.readyState >= 2) {
        playerL3.play().catch(() => {});
      }
    }
  }

  // Layer 4 Accent Video
  if (playerL4 && appState.layers.layer4.clipId) {
    attachPlayerErrorHandler(playerL4, 'L4');
    playerL4.crossOrigin = 'anonymous';
    playerL4.muted = true;
    playerL4.playsInline = true;
    playerL4.loop = true;
    if (appState.layers.layer4.clipId === 'clip_gen_plexus_spine') {
      if (!playerL4.paused) playerL4.pause();
    } else {
      const clip = allClips.find(c => c.id === appState.layers.layer4.clipId);
      const targetSrc = clip ? MediaProvider.getMediaUrl(clip) : '';
      if (targetSrc && (!playerL4.src.includes(targetSrc) || playerL4.dataset.activeSrc !== targetSrc)) {
        playerL4.dataset.activeSrc = targetSrc;
        playerL4.src = targetSrc;
        playerL4.load();
        playerL4.play().catch(() => {});
      } else if (playerL4.paused && playerL4.readyState >= 2) {
        playerL4.play().catch(() => {});
      }
    }
  }

  // Layer 5 Dedicated Overlay Video (Loop / Foreground Channel)
  if (!playerL5) playerL5 = document.getElementById('player-l5');
  if (playerL5 && appState.layers.layer5 && appState.layers.layer5.clipId) {
    attachPlayerErrorHandler(playerL5, 'L5');
    playerL5.crossOrigin = 'anonymous';
    playerL5.muted = true;
    playerL5.playsInline = true;
    playerL5.loop = true;
    if (appState.layers.layer5.clipId === 'clip_gen_plexus_spine') {
      if (!playerL5.paused) playerL5.pause();
    } else {
      const clip = allClips.find(c => c.id === appState.layers.layer5.clipId);
      const targetSrc = clip ? MediaProvider.getMediaUrl(clip) : '';
      if (targetSrc && (!playerL5.src.includes(targetSrc) || playerL5.dataset.activeSrc !== targetSrc)) {
        playerL5.dataset.activeSrc = targetSrc;
        playerL5.src = targetSrc;
        playerL5.load();
        playerL5.play().catch(() => {});
      } else if (playerL5.paused && playerL5.readyState >= 2) {
        playerL5.play().catch(() => {});
      }
    }
  }

  // Sync Bus Labels on Central Transition Strip
  const stripA = document.getElementById('me-bus-a-title');
  if (stripA) stripA.textContent = `BASE: ${appState.layers.layer0.name || appState.layers.layer0.clipId}`;
  const stripB = document.getElementById('me-bus-b-title');
  if (stripB) stripB.textContent = `CUE: ${appState.layers.layer3.name || appState.layers.layer3.clipId}`;
}

function getMatteImage(relPath, invert = false) {
  if (!relPath || relPath === 'none') return null;
  const baseSrc = `/mattes/${relPath}`;
  const cacheKey = invert ? `${baseSrc}_inv` : baseSrc;
  if (lumaCanvasCache[cacheKey]) return lumaCanvasCache[cacheKey];
  if (!matteCache[baseSrc]) {
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

        const cInv = document.createElement('canvas');
        cInv.width = 640;
        cInv.height = 360;
        const ctxInv = cInv.getContext('2d', { willReadFrequently: true });
        const imgDataInv = ctxInv.createImageData(640, 360);
        const dInv = imgDataInv.data;

        for (let i = 0; i < d.length; i += 4) {
          const lum = Math.round(d[i] * 0.299 + d[i+1] * 0.587 + d[i+2] * 0.114);
          d[i] = 255;
          d[i+1] = 255;
          d[i+2] = 255;
          d[i+3] = lum;

          dInv[i] = 255;
          dInv[i+1] = 255;
          dInv[i+2] = 255;
          dInv[i+3] = 255 - lum;
        }
        ctx.putImageData(imgData, 0, 0);
        ctxInv.putImageData(imgDataInv, 0, 0);
        lumaCanvasCache[baseSrc] = c;
        lumaCanvasCache[`${baseSrc}_inv`] = cInv;
      } catch (err) {
        console.warn('Luma matte conversion error:', err);
      }
    };
    img.src = baseSrc;
    matteCache[baseSrc] = img;
  }
  return lumaCanvasCache[cacheKey] || (matteCache[baseSrc].complete && matteCache[baseSrc].naturalWidth > 0 ? (lumaCanvasCache[cacheKey] || matteCache[baseSrc]) : null);
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
function drawFittedImage(ctx, source, targetW, targetH, mode = 'fill', rotation = 0, scale = 1.0, posX = 0, posY = 0, flipH = false, flipV = false) {
  if (!source) return null;
  
  const srcW = source.videoWidth || source.naturalWidth || targetW;
  const srcH = source.videoHeight || source.naturalHeight || targetH;
  if (!srcW || !srcH) return null;

  // 1. MIRROR WINGS MODE: broadcast standard for mismatched aspect ratios (vertical on horizontal & vice-versa)
  const isRatioMismatch = Math.abs((srcW / srcH) - (targetW / targetH)) > 0.05;
  if (mode === 'wings' && isRatioMismatch && (!rotation || rotation === 0)) {
    // Background: zoomed and blurred to fill full target canvas
    ctx.save();
    ctx.filter = 'blur(20px) brightness(35%) saturate(130%)';
    const bgScale = Math.max(targetW / srcW, targetH / srcH);
    const bgW = srcW * bgScale;
    const bgH = srcH * bgScale;
    ctx.drawImage(source, (targetW - bgW) / 2, (targetH - bgH) / 2, bgW, bgH);
    ctx.restore();

    // Foreground: crisp centered aspect-fit with soft drop shadow & transform (ZERO CROP)
    const fgRatio = srcW / srcH;
    let fgW, fgH;
    if (fgRatio > targetW / targetH) {
      fgW = targetW;
      fgH = targetW / fgRatio;
    } else {
      fgH = targetH;
      fgW = targetH * fgRatio;
    }
    const fgX = (targetW - fgW) / 2;
    const fgY = (targetH - fgH) / 2;
    ctx.save();
    ctx.translate(targetW / 2 + (posX || 0), targetH / 2 + (posY || 0));
    if (scale && scale !== 1.0) ctx.scale(scale, scale);
    if (flipH) ctx.scale(-1, 1);
    if (flipV) ctx.scale(1, -1);
    ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
    ctx.shadowBlur = 20;
    ctx.drawImage(source, -fgW / 2, -fgH / 2, fgW, fgH);
    ctx.restore();
    return { x: fgX, y: fgY, w: fgW, h: fgH };
  }

  // 2. ROTATION, SCALE, TRANSLATION & FIT ENGINE (-90 CCW, 0 NORMAL, +90 CW, 180 FLIP)
  ctx.save();
  ctx.translate((targetW / 2) + (posX || 0), (targetH / 2) + (posY || 0));
  if (rotation && rotation !== 0) {
    ctx.rotate((rotation * Math.PI) / 180);
  }
  if (scale && scale !== 1.0) {
    ctx.scale(scale, scale);
  }
  if (flipH) ctx.scale(-1, 1);
  if (flipV) ctx.scale(1, -1);

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
// 5.1 COMPOSITING BLEND OPS & DUAL-TIER TRANSFORM HIERARCHY (CLIP & LAYER)
// ============================================================================
function getCanvasCompositeOp(blendName) {
  const b = String(blendName || '').toLowerCase().trim();
  switch (b) {
    case 'screen': return 'screen';
    case 'multiply': return 'multiply';
    case 'add':
    case 'lighter': return 'lighter';
    case 'soft light':
    case 'soft-light':
    case 'softlight': return 'soft-light';
    case 'difference': return 'difference';
    case 'exclusion': return 'exclusion';
    case 'overlay': return 'overlay';
    case 'normal':
    default: return 'source-over';
  }
}
window.getCanvasCompositeOp = getCanvasCompositeOp;

function getClipTransform(clipId) {
  if (!clipId) return { rotation: 0, scale: 1.0, pos_x: 0, pos_y: 0 };
  const clip = (typeof allClips !== 'undefined' ? allClips : []).find(c => c.id === clipId);
  if (clip && clip.transform) return clip.transform;
  const saved = (typeof UserProfileManager !== 'undefined' && UserProfileManager.profile?.custom_clip_transforms)
    ? UserProfileManager.profile.custom_clip_transforms[clipId] : null;
  const tf = saved ? { ...saved } : { rotation: 0, scale: 1.0, pos_x: 0, pos_y: 0 };
  if (clip) clip.transform = tf;
  return tf;
}
window.getClipTransform = getClipTransform;

function setClipTransform(clipId, partial) {
  if (!clipId) return;
  const clip = (typeof allClips !== 'undefined' ? allClips : []).find(c => c.id === clipId);
  const cur = getClipTransform(clipId);
  const updated = { ...cur, ...partial };
  if (clip) clip.transform = updated;
  if (typeof UserProfileManager !== 'undefined') {
    if (!UserProfileManager.profile.custom_clip_transforms) {
      UserProfileManager.profile.custom_clip_transforms = {};
    }
    UserProfileManager.profile.custom_clip_transforms[clipId] = updated;
    UserProfileManager.saveProfile();
  }
}
window.setClipTransform = setClipTransform;

function resetClipTransform(clipId) {
  setClipTransform(clipId, { rotation: 0, scale: 1.0, pos_x: 0, pos_y: 0, flip_h: false, flip_v: false });
}
window.resetClipTransform = resetClipTransform;

function getClipTonal(clipId) {
  if (!clipId) return { brightness: 0, contrast: 1.0, gamma: 1.0, saturation: 1.0, hue: 0, exposure: 1.0, temperature: 0 };
  const clip = (typeof allClips !== 'undefined' ? allClips : []).find(c => c.id === clipId);
  if (clip && clip.tonal) return clip.tonal;
  const saved = (typeof UserProfileManager !== 'undefined' && UserProfileManager.profile?.custom_clip_tonals)
    ? UserProfileManager.profile.custom_clip_tonals[clipId] : null;
  const tn = saved ? { ...saved } : { brightness: 0, contrast: 1.0, gamma: 1.0, saturation: 1.0, hue: 0, exposure: 1.0, temperature: 0 };
  if (clip) clip.tonal = tn;
  return tn;
}
window.getClipTonal = getClipTonal;

function setClipTonal(clipId, partial) {
  if (!clipId) return;
  const clip = (typeof allClips !== 'undefined' ? allClips : []).find(c => c.id === clipId);
  const cur = getClipTonal(clipId);
  const updated = { ...cur, ...partial };
  if (clip) clip.tonal = updated;
  if (typeof UserProfileManager !== 'undefined') {
    if (!UserProfileManager.profile.custom_clip_tonals) {
      UserProfileManager.profile.custom_clip_tonals = {};
    }
    UserProfileManager.profile.custom_clip_tonals[clipId] = updated;
    UserProfileManager.saveProfile();
  }
}
window.setClipTonal = setClipTonal;

function resetClipTonal(clipId) {
  setClipTonal(clipId, { brightness: 0, contrast: 1.0, gamma: 1.0, saturation: 1.0, hue: 0, exposure: 1.0, temperature: 0 });
}
window.resetClipTonal = resetClipTonal;

function getClipTonalFilterString(t) {
  if (!t) return 'none';
  const b = Math.round((1.0 + (t.brightness || 0)) * (t.exposure !== undefined ? t.exposure : 1.0) * 100);
  const c = Math.round((t.contrast !== undefined ? t.contrast : 1.0) * 100);
  const s = Math.round((t.saturation !== undefined ? t.saturation : 1.0) * 100);
  const h = Math.round(t.hue || 0);
  let str = `brightness(${b}%) contrast(${c}%) saturate(${s}%)`;
  if (h !== 0) str += ` hue-rotate(${h}deg)`;
  if (t.temperature) {
    if (t.temperature > 0) {
      const sep = Math.min(50, Math.round(t.temperature * 1.0));
      str += ` sepia(${sep}%)`;
    } else if (t.temperature < 0) {
      const coolDeg = Math.round(t.temperature * 1.2);
      str += ` hue-rotate(${coolDeg}deg)`;
    }
  }
  return str;
}
window.getClipTonalFilterString = getClipTonalFilterString;

function setLayerScale(layerId, scale) {
  if (!appState.layers[layerId]) return;
  appState.layers[layerId].scale = Math.max(0.1, Math.min(4.0, Number(scale) || 1.0));
  updateTimelineTransformInspector();
}
window.setLayerScale = setLayerScale;

function setLayerPosition(layerId, posX, posY) {
  if (!appState.layers[layerId]) return;
  if (posX !== undefined) appState.layers[layerId].pos_x = Math.round(Number(posX) || 0);
  if (posY !== undefined) appState.layers[layerId].pos_y = Math.round(Number(posY) || 0);
  updateTimelineTransformInspector();
}
window.setLayerPosition = setLayerPosition;

function setLayerRotation(layerId, rot) {
  if (!appState.layers[layerId]) return;
  appState.layers[layerId].rotation = Number(rot) || 0;
  updateTimelineTransformInspector();
}
window.setLayerRotation = setLayerRotation;

function resetLayerTransform(layerId) {
  if (!appState.layers[layerId]) return;
  appState.layers[layerId].scale = 1.0;
  appState.layers[layerId].pos_x = 0;
  appState.layers[layerId].pos_y = 0;
  appState.layers[layerId].rotation = 0;
  updateTimelineTransformInspector();
  showMacroToast(`Resetado Transform: ${layerId.toUpperCase()}`);
}
window.resetLayerTransform = resetLayerTransform;

// Master Output Locked Matte
function setMasterLockedMatte(mattePath) {
  appState.master_locked_matte = mattePath || 'none';
  appState.master_locked_matte_active = (mattePath && mattePath !== 'none');
  updateMasterLockedMatteUI();
  showMacroToast(appState.master_locked_matte_active ? `🔒 Master Matte Travado: ${(mattePath || '').split('/').pop()}` : '🔓 Master Matte Destravado');
}
window.setMasterLockedMatte = setMasterLockedMatte;

function toggleMasterLockedMatte(forceState) {
  if (forceState !== undefined) {
    appState.master_locked_matte_active = Boolean(forceState);
  } else {
    appState.master_locked_matte_active = !appState.master_locked_matte_active;
  }
  updateMasterLockedMatteUI();
  showMacroToast(appState.master_locked_matte_active ? '🔒 Master Matte Travado' : '🔓 Master Matte Destravado');
}
window.toggleMasterLockedMatte = toggleMasterLockedMatte;

function updateMasterLockedMatteUI() {
  const btnLock = document.getElementById('btn-lock-master-matte');
  const badge = document.getElementById('badge-master-locked-status');
  const isLocked = Boolean(appState.master_locked_matte_active && appState.master_locked_matte && appState.master_locked_matte !== 'none');
  if (btnLock) {
    btnLock.classList.toggle('locked', isLocked);
    btnLock.innerHTML = isLocked ? '🔒 TRAVADO NO MASTER' : '🔓 DESTRAVADO (LIVRE)';
  }
  if (badge) {
    badge.style.display = isLocked ? 'inline-block' : 'none';
    badge.textContent = `🔒 MASTER LOCKED: ${(appState.master_locked_matte || '').split('/').pop()}`;
  }
}
window.updateMasterLockedMatteUI = updateMasterLockedMatteUI;

// Unificação de Rótulos do Macro State (Evita Oscilação e Flicker)
function refreshMacroStateBadges() {
  const isForced = Boolean(appState.auto_mode && appState.manual_forced_state);
  const st = appState.manual_forced_state || appState.macro_state || 'GROOVE';

  const badgeState = document.getElementById('badge-macro-state');
  if (badgeState) {
    badgeState.textContent = st;
    badgeState.style.color = getStateColor(st);
  }

  const badgeStrip = document.getElementById('badge-macro-state-strip');
  if (badgeStrip) {
    badgeStrip.textContent = st;
    badgeStrip.style.color = getStateColor(st);
    badgeStrip.classList.toggle('state-forced-glow', isForced);
  }

  const forcedTag = document.getElementById('badge-macro-forced-tag');
  if (forcedTag) {
    forcedTag.style.display = isForced ? 'inline-block' : 'none';
  }

  document.querySelectorAll('.state-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.state === st);
  });
}
window.refreshMacroStateBadges = refreshMacroStateBadges;

// Active selected layer in Timeline Transform Inspector ('layer0'..'layer5')
let activeTimelineSelectedLayer = 'layer0';

function selectTimelineLayer(layerId) {
  const normId = (typeof layerId === 'number' || !String(layerId).startsWith('layer')) ? `layer${layerId}` : String(layerId);
  activeTimelineSelectedLayer = normId;
  const lIdx = Number(normId.replace('layer', ''));
  openStudioInspector('layer', lIdx, null, false);
  updateTimelineTransformInspector();
}
window.selectTimelineLayer = selectTimelineLayer;

function updateTimelineTransformInspector() {
  const normId = String(activeTimelineSelectedLayer || 'layer0');
  const lIdx = normId.replace('layer', '');
  const layerNames = ['L0 MASTER', 'L1 PULSE', 'L2 EDGES', 'L3 CUE', 'L4 ACCENT', 'L5 OVERLAY'];
  const tag = document.getElementById('tl-insp-active-tag');
  if (tag) tag.textContent = layerNames[Number(lIdx)] || `L${lIdx}`;
  
  document.querySelectorAll('.tl-insp-pill').forEach(pill => {
    pill.classList.toggle('active', pill.dataset.layer === lIdx);
  });
  
  // Highlight active track on timeline sidebar
  document.querySelectorAll('.tl-track-header').forEach(th => {
    th.classList.remove('is-selected-track');
  });
  const trackMap = {
    '0': '.track-master',
    '1': '.track-l1',
    '2': '.track-l2',
    '3': '.track-cue',
    '5': '.track-l5'
  };
  if (trackMap[lIdx]) {
    const el = document.querySelector(trackMap[lIdx]);
    if (el) el.classList.add('is-selected-track');
  }
}
window.updateTimelineTransformInspector = updateTimelineTransformInspector;

function nudgeLayerPosition(layerId, dx, dy) {
  if (!appState.layers[layerId]) return;
  const curX = appState.layers[layerId].pos_x || 0;
  const curY = appState.layers[layerId].pos_y || 0;
  appState.layers[layerId].pos_x = Math.round(curX + dx);
  appState.layers[layerId].pos_y = Math.round(curY + dy);
  renderStudioInspector();
  updateTimelineTransformInspector();
}
window.nudgeLayerPosition = nudgeLayerPosition;

function centerLayerPosition(layerId) {
  if (!appState.layers[layerId]) return;
  appState.layers[layerId].pos_x = 0;
  appState.layers[layerId].pos_y = 0;
  renderStudioInspector();
  updateTimelineTransformInspector();
}
window.centerLayerPosition = centerLayerPosition;

function resetLayerTransform(layerId) {
  if (!appState.layers[layerId]) return;
  appState.layers[layerId].pos_x = 0;
  appState.layers[layerId].pos_y = 0;
  appState.layers[layerId].scale = 1.0;
  appState.layers[layerId].rotation = 0;
  appState.layers[layerId].fit_mode = 'fill';
  renderStudioInspector();
  updateTimelineTransformInspector();
  if (typeof showMacroToast === 'function') {
    showMacroToast(`[LAYER] Geometria da camada ${layerId.replace('layer', 'L').toUpperCase()} resetada`);
  }
}
window.resetLayerTransform = resetLayerTransform;

// Transformação Geométrica Individual do Clipe via Studio Inspector (Padrão DaVinci Resolve)
function openClipTransformModal(clipId) {
  openStudioInspector('clip', clipId, 'transform');
}
window.openClipTransformModal = openClipTransformModal;

function openPreviewClipTransform() {
  const cueClipId = appState.preview_clip || (appState.layers?.layer3?.clipId) || (appState.layers?.layer3?.clip?.id) || (appState.layers?.layer0?.clipId);
  if (!cueClipId) {
    if (typeof showMacroToast === 'function') showMacroToast('Nenhum clipe carregado no Preview (Deck B)', 'warn');
    return;
  }
  openStudioInspector('clip', cueClipId, 'transform');
}
window.openPreviewClipTransform = openPreviewClipTransform;

window.updateClipRot = function(clipId, rot) {
  setClipTransform(clipId, { rotation: rot });
  ['0', '90', '180', '270'].forEach(r => {
    const b = document.getElementById(`btn-clip-rot-${r}`);
    if (b) b.classList.toggle('active', Number(r) === rot);
  });
};

window.onClipScaleInput = function(clipId, val) {
  const sc = Number(val) / 100.0;
  setClipTransform(clipId, { scale: sc });
  const lbl = document.getElementById('lbl-clip-scale');
  if (lbl) lbl.textContent = `${val}%`;
};

window.onClipPosInput = function(clipId) {
  const px = Number(document.getElementById('inp-clip-posx')?.value) || 0;
  const py = Number(document.getElementById('inp-clip-posy')?.value) || 0;
  setClipTransform(clipId, { pos_x: px, pos_y: py });
};

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

function drawProceduralVignette(ctx, w, h, vig, audioPulse = 0, invert = false) {
  const roundness = vig.roundness !== undefined ? Number(vig.roundness) : 0.65;
  const feather = Math.max(0.02, Number(vig.feather || 0.38));
  const innerR = Math.max(0.05, Number(vig.inner_radius || 0.42));
  const outerR = Math.max(innerR + 0.05, Number(vig.outer_radius || 0.95));
  const pulse = Number(vig.audio_pulse || 0.15) * audioPulse;
  
  const cx = w * 0.5;
  const cy = h * 0.5;
  const maxDim = Math.max(w, h) * 0.5;
  const minDim = Math.min(w, h) * 0.5;

  ctx.save();
  if (roundness >= 0.95) {
    const rStart = maxDim * innerR * (1.0 - pulse);
    const rEnd = maxDim * outerR;
    const grad = ctx.createRadialGradient(cx, cy, Math.max(0, rStart), cx, cy, rEnd);
    if (invert) {
      grad.addColorStop(0, 'rgba(0, 0, 0, 1)');
      grad.addColorStop(Math.min(0.99, Math.max(0.01, feather)), 'rgba(0, 0, 0, 0.45)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    } else {
      grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
      grad.addColorStop(Math.min(0.99, Math.max(0.01, 1.0 - feather)), 'rgba(0, 0, 0, 0.45)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 1)');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  } else {
    const cornerR = minDim * roundness;
    const boxW = Math.max(40, (w * innerR * 1.8) * (1.0 + pulse));
    const boxH = Math.max(40, (h * innerR * 1.8) * (1.0 + pulse));
    const featherPx = Math.max(4, Math.round(minDim * feather * 0.65));

    ctx.filter = `blur(${featherPx}px)`;
    ctx.fillStyle = '#000000';
    if (invert) {
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(cx - boxW * 0.5, cy - boxH * 0.5, boxW, boxH, cornerR);
      } else {
        ctx.rect(cx - boxW * 0.5, cy - boxH * 0.5, boxW, boxH);
      }
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.rect(-featherPx * 2, -featherPx * 2, w + featherPx * 4, h + featherPx * 4);
      if (ctx.roundRect) {
        ctx.roundRect(cx - boxW * 0.5, cy - boxH * 0.5, boxW, boxH, cornerR);
      } else {
        ctx.rect(cx - boxW * 0.5, cy - boxH * 0.5, boxW, boxH);
      }
      ctx.fill('evenodd');
    }
  }
  ctx.restore();
}

function drawDeformedMatte(ctx, matteImg, w, h, t, deform, invert = false, matteKey = null) {
  if (!matteImg) return;
  const mKey = matteKey || (matteImg.dataset && matteImg.dataset.src) || (matteImg.src ? matteImg.src.split('/').pop() : '') || '';
  const cfg = (typeof getMatteConfig === 'function' && mKey) ? getMatteConfig(mKey) : (appState.matte || {});
  const def = deform || cfg.deform || (appState.matte && appState.matte.deform) || { wiggle_scale: 0.04, wiggle_pos: 8, wiggle_rot: 0, speed: 4.0, sync_bpm: true };
  const mt = cfg.transform || (appState.matte && appState.matte.transform) || { pos_x: 0, pos_y: 0, scale: 1.0, scale_x: 1.0, scale_y: 1.0, rotation: 0 };
  const vig = cfg.vignette || (appState.matte && appState.matte.vignette) || {};
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
  
  const dx = wigglePos * Math.cos(animTime * 2.0 * speedMult * syncMult) + (w * (mt.pos_x || 0) / 100);
  const dy = wigglePos * Math.sin(animTime * 1.5 * speedMult * syncMult) + (h * (mt.pos_y || 0) / 100);
  const rotDeg = wiggleRot * Math.sin(animTime * 1.2 * speedMult * syncMult) + (mt.rotation || 0);
  const rotRad = (rotDeg * Math.PI) / 180.0;
  
  // Anti-Edges Logic: Minimum scale to never reveal bounds
  const maxWiggle = Math.abs(wigglePos);
  const maxRotDeg = Math.abs(rotDeg);
  const safeMargin = (maxWiggle / Math.min(w, h)) * 2.5 + (maxRotDeg > 0 ? (maxRotDeg / 45) * 0.4 : 0.05);
  const baseScale = 1.0 + safeMargin;
  const scaleMod = Math.abs((def.wiggle_scale || 0.04) * Math.sin(animTime * 2.5 * speedMult * syncMult));
  const wScaleX = (baseScale + scaleMod) * (mt.scale !== undefined ? mt.scale : 1.0) * (mt.scale_x || 1.0);
  const wScaleY = (baseScale + scaleMod) * (mt.scale !== undefined ? mt.scale : 1.0) * (mt.scale_y || 1.0);

  ctx.save();
  ctx.translate(w / 2 + dx, h / 2 + dy);
  if (rotRad !== 0) ctx.rotate(rotRad);
  ctx.scale(wScaleX, wScaleY);
  ctx.translate(-w / 2, -h / 2);
  
  const isInv = invert || Boolean(cfg.invert) || Boolean(appState.matte?.invert);
  
  const isVigMatte = (matteImg.src && (matteImg.src.includes('vignette') || matteImg.src.includes('vinheta'))) || vig.enabled;
  if (isVigMatte && vig.enabled) {
    const pulseBand = vig.audio_band === 'sub' ? (appState.bands?.sub || 0) : (appState.bands?.bass || 0);
    drawProceduralVignette(ctx, w, h, vig, pulseBand, isInv);
  } else {
    drawFittedImage(ctx, matteImg, w, h, 'fill');
  }
  
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

let tapCount = 0;
let tapResetTimer = null;

function updateAllBpmDisplays(val) {
  const bpmNum = Number(val) || (appState && appState.bpm) || 124.0;
  const formatted = bpmNum.toFixed(1);

  const ids = [
    'permanent-bpm-val',
    'strip-bpm-val',
    'tl-current-bpm',
    'badge-bpm',
    'input-manual-bpm'
  ];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.tagName === 'INPUT') {
      if (document.activeElement !== el) el.value = formatted;
    } else {
      el.textContent = formatted;
    }
  });

  const chipBpm = document.getElementById('chip-bpm');
  if (chipBpm) chipBpm.textContent = `${formatted} BPM`;
  const bpmDisplayEl = document.getElementById('bpm-display');
  if (bpmDisplayEl) bpmDisplayEl.textContent = `${formatted} BPM`;
}
window.updateAllBpmDisplays = updateAllBpmDisplays;

function setManualBpm(val) {
  const bpm = Math.max(40.0, Math.min(220.0, Number(val) || 124.0));
  appState.bpm = Math.round(bpm * 10) / 10.0;
  appState.bpm_manual_lock = true;

  updateAllBpmDisplays(appState.bpm);

  const chipBpm = document.getElementById('chip-bpm');
  if (chipBpm) chipBpm.classList.add('manual-lock');
  const lockTag = document.getElementById('bpm-lock-tag');
  if (lockTag) {
    lockTag.style.display = 'inline-block';
    lockTag.textContent = 'LOCK';
  }
  const hdrLockTag = document.getElementById('hdr-bpm-lock-tag');
  if (hdrLockTag) hdrLockTag.style.display = 'inline-block';

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
  const hdrLockTag = document.getElementById('hdr-bpm-lock-tag');
  if (chipBpm) chipBpm.classList.toggle('manual-lock', appState.bpm_manual_lock);
  if (lockTag) {
    lockTag.style.display = appState.bpm_manual_lock ? 'inline-block' : 'none';
  }
  if (hdrLockTag) {
    hdrLockTag.style.display = appState.bpm_manual_lock ? 'inline-block' : 'none';
  }
  showMacroToast(appState.bpm_manual_lock ? '🔒 BPM Travado Manualmente' : '🔓 BPM em Detecção Automática');
}
window.toggleBpmLock = toggleBpmLock;

function handleTapTempo() {
  const now = performance.now();
  if (tapHistory.length > 0 && (now - tapHistory[tapHistory.length - 1]) > 2200) {
    tapHistory = [];
    tapCount = 0;
  }
  tapHistory.push(now);
  tapCount++;

  const btnTap = document.getElementById('btn-strip-tap');
  const hdrBpm = document.getElementById('header-permanent-bpm');
  const stripPill = document.getElementById('strip-bpm-display-pill');
  const tapBtns = [document.getElementById('btn-tap-tempo'), btnTap, hdrBpm, stripPill];

  tapBtns.forEach(b => {
    if (b) {
      b.classList.remove('tap-flash');
      void b.offsetWidth;
      b.classList.add('tap-flash');
      setTimeout(() => b.classList.remove('tap-flash'), 150);
    }
  });

  if (tapHistory.length >= 2) {
    const intervals = [];
    for (let i = 1; i < tapHistory.length; i++) {
      intervals.push(tapHistory[i] - tapHistory[i - 1]);
    }

    // Weighted moving average giving more importance to latest intervals
    let avgIntervalMs = 0;
    if (intervals.length <= 2) {
      avgIntervalMs = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    } else {
      const weights = intervals.map((_, idx) => 1.0 + (idx / intervals.length) * 0.5);
      const totalWeight = weights.reduce((a, b) => a + b, 0);
      avgIntervalMs = intervals.reduce((sum, intv, idx) => sum + intv * weights[idx], 0) / totalWeight;
    }

    const calculatedBpm = Math.round((60000.0 / avgIntervalMs) * 10) / 10.0;
    if (calculatedBpm >= 40 && calculatedBpm <= 220) {
      setManualBpm(calculatedBpm);
      if (btnTap) btnTap.textContent = `TAP · ${calculatedBpm.toFixed(1)}`;
      showMacroToast(`⏱ TAP TEMPO: ${calculatedBpm.toFixed(1)} BPM (Tap ${tapCount})`);
    }
  } else {
    if (btnTap) btnTap.textContent = `TAP [${tapCount}]`;
    showMacroToast(`⏱ TAP TEMPO: Tap ${tapCount}...`);
  }

  clearTimeout(tapResetTimer);
  tapResetTimer = setTimeout(() => {
    tapHistory = [];
    tapCount = 0;
    if (btnTap) btnTap.textContent = 'TAP';
  }, 2200);
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

// ----------------------------------------------------------------------------
// 4.1 CURATED NARRATIVE MACRO-STATE PRESETS (FAST ERGONOMIC SELECTORS)
// ----------------------------------------------------------------------------
const MACRO_PRESETS = {
  INTRO: [
    {
      id: 'intro_obsidian_minimal',
      name: 'Void',
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
      name: 'Fog',
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
      name: 'Dawn',
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
      name: 'Clean',
      desc: '100% puro e sem distorção: vídeo original cristalino em 60 FPS',
      energy: 0.50,
      kinematics: { wiggle_scale: 0.04, wiggle_pos: 6, wiggle_rot: 1.0, posterize_rate: 0, edge_warp: 0.04, speed: 0.8 },
      matte: { type: 'none', preferred: 'none', master_matte: 'none' },
      fx: { active: false, plugin: 'pixel_stretch', preset: 'cinematic_anamorphic', intensity: 0.0 },
      layers: { l1_opacity: 0.0, l2_opacity: 0.12, l4_opacity: 0.0, blend: 'soft_light' },
      transition: { mode: 'dissolve', duration: 1.5 }
    },
    {
      id: 'groove_rhythmic_pulse',
      name: 'Pulse',
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
      name: 'Satori',
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
      name: 'Tension',
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
      name: 'RF Swell',
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
      name: 'Tracer',
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
      name: 'Melt',
      desc: 'Cascata algorítmica total: derretimento de pixels e clímax',
      energy: 0.98,
      kinematics: { wiggle_scale: 0.32, wiggle_pos: 48, wiggle_rot: 12.0, posterize_rate: 4, edge_warp: 0.58, speed: 2.4 },
      matte: { type: 'geometric', preferred: 'matte_b_fractal', master_matte: 'none' },
      fx: { active: true, plugin: 'pixel_sorter', preset: 'glitch_waterfall', intensity: 0.95 },
      layers: { l1_opacity: 0.85, l2_opacity: 0.60, l4_opacity: 0.90, blend: 'difference' },
      transition: { mode: 'cut', duration: 0.1 }
    },
    {
      id: 'drop_crt_shatter_vcr',
      name: 'CRT Glitch',
      desc: 'Colapso analógico com rolling contínuo, RGB split e scanlines',
      energy: 0.95,
      kinematics: { wiggle_scale: 0.30, wiggle_pos: 52, wiggle_rot: -14.0, posterize_rate: 4, edge_warp: 0.62, speed: 2.5 },
      matte: { type: 'geometric', preferred: 'matte_a_geometric', master_matte: 'none' },
      fx: { active: true, plugin: 'bad_tv', preset: 'broken_vcr', intensity: 0.95 },
      layers: { l1_opacity: 0.80, l2_opacity: 0.50, l4_opacity: 0.85, blend: 'screen' },
      transition: { mode: 'cut', duration: 0.1 }
    },
    {
      id: 'drop_center_melt_radial',
      name: 'Supernova',
      desc: 'Supernova radial de pixel sorting no centro',
      energy: 0.96,
      kinematics: { wiggle_scale: 0.28, wiggle_pos: 44, wiggle_rot: 10.0, posterize_rate: 4, edge_warp: 0.52, speed: 2.2 },
      matte: { type: 'geometric', preferred: 'matte_b_fractal', master_matte: 'none' },
      fx: { active: true, plugin: 'pixel_sorter', preset: 'center_melt', intensity: 0.90 },
      layers: { l1_opacity: 0.90, l2_opacity: 0.70, l4_opacity: 0.80, blend: 'difference' },
      transition: { mode: 'sync', duration: 0.3 }
    },
    {
      id: 'drop_cmyk_strobe_pulse',
      name: 'Torrent',
      desc: 'Explosão vetorial Joy Division / CMYK com flash sutil',
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
      name: 'Ambient',
      desc: 'Desaceleração suave: longa transição líquida e espaço negativo',
      energy: 0.20,
      kinematics: { wiggle_scale: 0.03, wiggle_pos: 12, wiggle_rot: -2.0, posterize_rate: 0, edge_warp: 0.04, speed: 0.4 },
      matte: { type: 'soft', preferred: 'matte_c_fluid', master_matte: 'none' },
      fx: { active: false, plugin: 'bad_tv', preset: 'subdued_vhs', intensity: 0.0 },
      layers: { l1_opacity: 0.10, l2_opacity: 0.10, l4_opacity: 0.0, blend: 'multiply' },
      transition: { mode: 'dissolve', duration: 4.0 }
    },
    {
      id: 'break_pastel_oil_drift',
      name: 'Oil Drift',
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
      name: 'Cyan Wave',
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

  // 3. FX Engine Configuration (Respeita rigorosamente a delegação do Autopilot e a trava manual do operador)
  const isFxDelegated = Boolean(appState.autopilot_delegation?.fx);
  const isFxLocked = Boolean(appState.fx?.manual_locked);
  const allowFxChange = isUserAction || (appState.auto_mode && isFxDelegated && !isFxLocked);

  if (!appState.fx) appState.fx = { target: 'master', active: false, manual_locked: false };

  if (allowFxChange) {
    if (preset.fx.active) {
      appState.fx.active = true;
      appState.fx.target = 'master'; // Targets Master Video Output directly
      appState.fx.masterIntensity = preset.fx.intensity;
      selectFxPlugin(preset.fx.plugin, false);
      loadPluginPreset(preset.fx.plugin, preset.fx.preset, false);
    } else {
      // 100% LIMPO: Master FX OFF
      appState.fx.active = false;
      appState.fx.masterIntensity = 0.0;
    }
    updateFxUI();
  }

  // 4. Layers Opacity & Blends (Respeita delegação e travas manuais)
  if (preset.layers) {
    const allowLayerFxAutomation = isUserAction || (appState.auto_mode && isFxDelegated);
    if (allowLayerFxAutomation) {
      if (appState.layers.layer1 && !appState.layers.layer1.locked) {
        appState.layers.layer1.opacity = preset.layers.l1_opacity;
        if (preset.layers.blend) appState.layers.layer1.blend = preset.layers.blend;
      }
      if (appState.layers.layer2 && !appState.layers.layer2.locked) {
        appState.layers.layer2.opacity = preset.layers.l2_opacity;
      }
      if (appState.layers.layer4 && !appState.layers.layer4.locked) {
        appState.layers.layer4.opacity = preset.layers.l4_opacity;
        appState.layers.layer4.active = preset.layers.l4_opacity > 0.3;
      }
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
  refreshMacroStateBadges();

  // Preset tag in strip
  const badgePreset = document.getElementById('badge-macro-preset-name');
  if (badgePreset && preset) {
    const list = MACRO_PRESETS[state] || [];
    const curIdx = (appState.macro_preset_indices[state] || 0) + 1;
    badgePreset.textContent = curIdx + '/' + list.length + ' · ' + preset.name.toUpperCase();
    badgePreset.className = 'macro-preset-tag ' + (state === 'DROP' ? 'drop' : (state === 'BUILD' ? 'build' : (state === 'GROOVE' ? 'clean' : '')));
  }

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
  // Aplica estritamente a estética, cinemática, máscaras e FX do macro preset sobre o vídeo atual em reprodução
  applyMacroPreset(state, targetIdx, true);

  if (state === 'DROP') {
    appState.drop_likelihood = 0.98;
    appState.buildup_likelihood = 0.20;

    // No DROP: Ativa Accent Climax (Layer 4 Difference) para impacto visual imediato sobre a textura do vídeo atual
    if (appState.layers.layer4 && !appState.layers.layer4.locked) {
      appState.layers.layer4.active = true;
      appState.layers.layer4.opacity = 0.85;
    }
    // Efeito de impacto cênico no Program Monitor sem cortar o vídeo
    const prgBox = document.querySelector('.program-box') || document.getElementById('program-screen-box');
    if (prgBox) {
      prgBox.classList.remove('take-flash');
      void prgBox.offsetWidth;
      prgBox.classList.add('take-flash');
      setTimeout(() => prgBox.classList.remove('take-flash'), 400);
    }
  } else if (state === 'BUILD') {
    appState.buildup_likelihood = 0.88;
    appState.drop_likelihood = 0.15;
    // Prepara e arma o próximo candidato adequado no Deck B (Preview Cue), sem cortar o vídeo atual de L0
    advanceSmartQueue('DROP');
  } else if (state === 'BREAK') {
    appState.buildup_likelihood = 0.10;
    appState.drop_likelihood = 0.05;
  } else if (state === 'GROOVE') {
    appState.buildup_likelihood = 0.25;
    appState.drop_likelihood = 0.10;
  } else if (state === 'INTRO') {
    appState.buildup_likelihood = 0.10;
    appState.drop_likelihood = 0.05;
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

  // Update Pro Timeline Toolbar Metrics & Real-Time Countdown Tag
  const tlPhraseStep = document.getElementById('tl-phrase-step');
  if (tlPhraseStep) tlPhraseStep.textContent = `${p.current_bar} / ${p.length_bars}`;
  const tlTensionPct = document.getElementById('tl-tension-pct');
  if (tlTensionPct) tlTensionPct.textContent = `${Math.round(appState.buildup_likelihood * 100)}%`;
  const tlBpm = document.getElementById('tl-current-bpm');
  if (tlBpm) tlBpm.textContent = (appState.bpm || 124.0).toFixed(1);

  const curBpm = appState.bpm || 124.0;
  const remSecs = (remainingBeats * (60.0 / curBpm)).toFixed(1);
  const tlCdVal = document.getElementById('tl-countdown-val');
  if (tlCdVal) {
    if (remainingBars === 0 && p.current_beat === 4) {
      tlCdVal.textContent = '⚡ TAKE DISPARANDO!';
      tlCdVal.style.color = '#00f0ff';
    } else {
      tlCdVal.textContent = `${remainingBars} BARS (~${remSecs}s)`;
      tlCdVal.style.color = '';
    }
  }

  // Update Take Duration Active Pill
  document.querySelectorAll('.tl-dur-pill').forEach(btn => {
    btn.classList.toggle('active', Number(btn.dataset.bars) === p.length_bars);
  });

  // Update Pro Timeline Sidebar Track Status Labels
  const lblL0 = document.getElementById('lbl-tl-track-l0');
  if (lblL0) lblL0.textContent = `${Math.round((appState.layers?.layer0?.opacity ?? 1.0) * 100)}%`;
  const lblL1 = document.getElementById('lbl-tl-track-l1');
  if (lblL1) lblL1.textContent = `${Math.round((appState.layers?.layer1?.opacity ?? 0.8) * 100)}%`;
  const lblL2 = document.getElementById('lbl-tl-track-l2');
  if (lblL2) lblL2.textContent = `${Math.round((appState.layers?.layer2?.opacity ?? 0.6) * 100)}%`;
  const lblL3 = document.getElementById('lbl-tl-track-l3');
  if (lblL3) lblL3.textContent = `${Math.round((appState.layers?.layer3?.opacity ?? 1.0) * 100)}%`;
  const lblL4 = document.getElementById('lbl-tl-track-l4');
  if (lblL4) lblL4.textContent = `${Math.round((appState.layers?.layer4?.opacity ?? 0.0) * 100)}%`;
  const lblL5 = document.getElementById('lbl-tl-track-l5');
  if (lblL5) lblL5.textContent = `${Math.round((appState.layers?.layer5?.opacity ?? 1.0) * 100)}%`;
  const lblFx = document.getElementById('lbl-tl-track-fx');
  if (lblFx) lblFx.textContent = appState.fx?.enabled ? 'ACT' : 'BYP';
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
// PLAYBACK, TIME-STRETCH & PING-PONG LOOPS (WORLD-CLASS SEAMLESS BOUNCE)
// ============================================================================
const layerPingPongStates = {
  layer0: { direction: 1 },
  layer3: { direction: 1 },
  layer5: { direction: 1 }
};

function processLayerPingPong(player, layerId, dt) {
  if (!player || !player.duration || isNaN(player.duration) || player.duration <= 0.2) return;
  const layer = appState.layers[layerId];
  if (!layer) return;

  const isPingPong = Boolean(layer.pingPong);
  const isPaused = Boolean(layer.paused);
  const speed = Math.max(0.1, Number(layer.speed || 1.0));

  if (isPaused) {
    if (!player.paused) player.pause();
    return;
  }

  if (isPingPong) {
    // Modo Ping-Pong: desativa loop padrão para impedir o corte brusco para o frame 0
    if (player.loop) player.loop = false;

    let pp = layerPingPongStates[layerId];
    if (!pp) {
      pp = { direction: 1 };
      layerPingPongStates[layerId] = pp;
    }

    const duration = player.duration;
    const curTime = player.currentTime;

    if (pp.direction === 1) {
      // 1. Fase Ida: toca para frente na velocidade configurada
      if (Math.abs(player.playbackRate - speed) > 0.01) {
        try { player.playbackRate = speed; } catch (e) {}
      }
      if (player.paused && !player.ended && player.readyState >= 2) {
        player.play().catch(() => {});
      }

      // Ao alcançar o final do vídeo (ou disparar evento ended): inverte para rebobinar suavemente
      if (curTime >= duration - 0.10 || player.ended) {
        pp.direction = -1;
        player.pause();
      }
    } else {
      // 2. Fase Volta: rebobina suavemente a 60 FPS decrementando currentTime
      if (!player.paused) player.pause();
      const step = Math.max(0.005, dt * speed);
      const newTime = Math.max(0, curTime - step);
      player.currentTime = newTime;

      // Ao alcançar o início do clipe: inverte de volta para frente sem corte brusco
      if (newTime <= 0.08) {
        pp.direction = 1;
        player.currentTime = 0.05;
        player.play().catch(() => {});
      }
    }
  } else {
    // Loop Contínuo Normal (Forward 360°)
    if (!player.loop) player.loop = true;
    if (Math.abs(player.playbackRate - speed) > 0.01) {
      try { player.playbackRate = speed; } catch (e) {}
    }
    if (player.paused && player.readyState >= 2) {
      player.play().catch(() => {});
    }
    if (layerPingPongStates[layerId]) {
      layerPingPongStates[layerId].direction = 1;
    }
  }
}
window.processLayerPingPong = processLayerPingPong;

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
    
    const lprefix = layerId.replace('layer', 'l');
    const btn = document.getElementById(`${lprefix}-pingpong`);
    if (btn) btn.classList.toggle('active', !isPingPong);
    
    showMacroToast(appState.layers[layerId].pingPong ? `⮂ Ping-Pong Ativo em ${layerId.toUpperCase()} (Ida e Volta Suave)` : `🔁 Loop Contínuo em ${layerId.toUpperCase()}`);
    
    sendAction('set_layer_pingpong', { layer: layerId, enabled: !isPingPong });
    updateUI();
  }
}
window.toggleLayerPingPong = toggleLayerPingPong;

function updateMixerMattesUI() {
  ['layer0', 'layer1', 'layer2', 'layer3', 'layer4', 'layer5'].forEach(lKey => {
    const lprefix = lKey.replace('layer', 'l');
    const layer = appState.layers[lKey];
    if (!layer) return;

    const lbl = document.getElementById(`lbl-${lprefix}-matte-name`);
    const capsule = document.getElementById(`ch-matte-slot-${lKey}`);
    const btnInv = document.getElementById(`${lprefix}-matte-inv`);
    const isInv = Boolean(layer.matte_invert);

    if (btnInv) btnInv.classList.toggle('active', isInv);

    const mattePath = layer.matte;
    if (mattePath && mattePath !== 'none') {
      const foundMatte = (allMattes || []).find(m => m.path === mattePath || m.filename === mattePath.split('/').pop());
      const name = foundMatte ? foundMatte.name : mattePath.split('/').pop().replace('.png', '').replace(/_/g, ' ');
      if (lbl) lbl.textContent = (isInv ? '⚡ ' : '🔒 ') + name.toUpperCase();
      if (capsule) capsule.classList.add('has-matte');
    } else {
      if (lbl) lbl.textContent = 'PASSTHROUGH (FULL FRAME)';
      if (capsule) capsule.classList.remove('has-matte');
    }
  });
}
window.updateMixerMattesUI = updateMixerMattesUI;

function setLayerSpeed(layerId, speedVal) {
  const speedNormalized = speedVal / 100.0;
  const lbl = document.getElementById(layerId === 'layer0' ? 'lbl-l0-speed' : (layerId === 'layer5' ? 'lbl-l5-speed' : 'lbl-l3-speed'));
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
  if (layerId === 'master') {
    appState.master_matte = val;
    sendAction('set_master_matte', { matte: val });
    updateMatteRibbonActiveStatus();
    renderMattesCards();
  } else if (appState.layers[layerId]) {
    appState.layers[layerId].matte = val;
    sendAction('set_layer_matte', { layer: layerId, matte: val });
    if (appState.matte_target_layer === layerId) {
      updateMatteRibbonActiveStatus();
    }
  }
}
window.onLayerMatteChange = onLayerMatteChange;

function toggleLayerMatteInvert(layerId) {
  if (layerId === 'master') {
    appState.master_matte_invert = !appState.master_matte_invert;
    sendAction('set_master_matte_invert', { value: appState.master_matte_invert });
    if (appState.matte_target_layer === 'master') {
      updateMatteRibbonActiveStatus();
    }
  } else if (appState.layers[layerId]) {
    appState.layers[layerId].matte_invert = !appState.layers[layerId].matte_invert;
    const btn = document.getElementById(`${layerId.replace('layer', 'l')}-matte-inv`);
    if (btn) btn.classList.toggle('active', !!appState.layers[layerId].matte_invert);
    sendAction('set_layer_param', { layer: layerId, param: 'matte_invert', value: appState.layers[layerId].matte_invert });
    if (appState.matte_target_layer === layerId) {
      updateMatteRibbonActiveStatus();
    }
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
  const currentMattePath = (tgt === 'master') ? appState.master_matte : appState.layers[tgt]?.matte;
  const isInv = (tgt === 'master') ? !!appState.master_matte_invert : !!appState.layers[tgt]?.matte_invert;
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
    btnInv.classList.toggle('active', isInv);
  }
}
window.updateMatteRibbonActiveStatus = updateMatteRibbonActiveStatus;

function clearCurrentTargetMatte() {
  const tgt = appState.matte_target_layer || 'layer3';
  if (tgt === 'master') {
    appState.master_matte = 'none';
    sendAction('set_master_matte', { matte: 'none' });
    updateMatteRibbonActiveStatus();
    renderMattesCards();
    updateUI();
  } else if (appState.layers[tgt]) {
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
  if (tgt === 'master') {
    appState.master_matte_invert = !appState.master_matte_invert;
    const btnInv = document.getElementById('btn-inv-target-matte');
    if (btnInv) btnInv.classList.toggle('active', !!appState.master_matte_invert);
    sendAction('set_master_matte_invert', { value: appState.master_matte_invert });
    updateMatteRibbonActiveStatus();
  } else if (appState.layers[tgt]) {
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
  const lName = (layerId === 'master') ? 'MASTER (GLOBAL)' : layerId.toUpperCase();
  showMacroToast(`🎭 Foco em ${lName}: Escolha uma das 29 máscaras do catálogo abaixo`);
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

function getAspectRatioDimensions(ratioStr) {
  switch (ratioStr) {
    case '9:16':
      return { w: 360, h: 640, isVertical: true, ratio: 9 / 16, label: '9:16 VERTICAL' };
    case '1:1':
      return { w: 480, h: 480, isVertical: false, ratio: 1 / 1, label: '1:1 QUADRADO' };
    case '4:5':
      return { w: 384, h: 480, isVertical: true, ratio: 4 / 5, label: '4:5 SOCIAL' };
    case '4:3':
      return { w: 480, h: 360, isVertical: false, ratio: 4 / 3, label: '4:3 RETRÔ' };
    case '21:9':
      return { w: 640, h: 274, isVertical: false, ratio: 21 / 9, label: '21:9 ULTRAWIDE' };
    case '16:9':
    default:
      return { w: 640, h: 360, isVertical: false, ratio: 16 / 9, label: '16:9 HORIZONTAL' };
  }
}
window.getAspectRatioDimensions = getAspectRatioDimensions;

function setAspectRatio(ratio) {
  const cfg = getAspectRatioDimensions(ratio);
  appState.aspectRatio = ratio;
  appState.vertical_mode = cfg.isVertical;
  appState.vertical_projection = cfg.isVertical;

  const canvases = [busCanvasA, busCanvasB, offscreenA, offscreenB, sobelCanvas, handoverCanvas, rotSnapshotCanvas];
  canvases.forEach(c => {
    if (c) {
      c.width = cfg.w;
      c.height = cfg.h;
    }
  });

  if (prgCanvas) {
    prgCanvas.width = cfg.w;
    prgCanvas.height = cfg.h;
  }
  if (prvCanvas) {
    prvCanvas.width = cfg.w;
    prvCanvas.height = cfg.h;
  }

  updateUI();
  if (typeof renderStudioInspector === 'function') renderStudioInspector();
  console.log(`[PENUMBRA ENGINE] Aspect Ratio Master alterado para: ${cfg.label} (${cfg.w}×${cfg.h})`);
}
window.setAspectRatio = setAspectRatio;

function setDefaultFitMode(mode) {
  appState.aspect_fit_mode = mode;
  appState.fit_mode = mode;
  ['layer0', 'layer1', 'layer2', 'layer3', 'layer4', 'layer5'].forEach(lid => {
    if (appState.layers && appState.layers[lid]) appState.layers[lid].fit_mode = mode;
  });
  updateUI();
  console.log(`[PENUMBRA ENGINE] Modo de Enquadramento Padrão definido para: ${mode.toUpperCase()}`);
}
window.setDefaultFitMode = setDefaultFitMode;

function drawBusToProgram(ctx, srcCanvas, pw, ph, isVert) {
  if (!srcCanvas || !ctx) return;
  // Transferência direta 1:1 já que os barramentos operam nativamente na geometria do Program
  ctx.drawImage(srcCanvas, 0, 0, pw, ph);
}

function toggleVerticalMode(forceValue = null) {
  let targetVal;
  if (forceValue !== null) {
    targetVal = Boolean(forceValue);
  } else {
    targetVal = !(appState.aspectRatio === '9:16' || appState.vertical_mode);
  }
  setAspectRatio(targetVal ? '9:16' : '16:9');
}
window.toggleVerticalMode = toggleVerticalMode;

function toggleProjectorCompensation(checked = null) {
  if (checked !== null) {
    appState.projector_compensation = Boolean(checked);
  } else {
    appState.projector_compensation = !appState.projector_compensation;
  }
  updateUI();
  console.log(`[PENUMBRA ENGINE] Compensação de Saída de Projetor 90°: ${appState.projector_compensation ? 'LIGADO (ROTACIONADO 90°)' : 'DESLIGADO (NATIVO RETO NO CENTRO)'}`);
}
window.toggleProjectorCompensation = toggleProjectorCompensation;

function updateNetworkOutputUI() {
  const isNetOn = !!appState.network_output_enabled;
  const chip = document.getElementById('chip-ndi');
  if (chip) {
    chip.classList.toggle('live', isNetOn);
    const dot = chip.querySelector('.dot');
    const label = chip.querySelector('.label');
    if (dot) dot.classList.toggle('live', isNetOn);
    if (label) label.textContent = isNetOn ? 'NDI: PENUMBRA_LIVE' : 'TRANSMISSÃO: STANDBY (HDMI)';
  }
  const ndiDisplay = document.getElementById('status-ndi-display');
  if (ndiDisplay) {
    ndiDisplay.textContent = isNetOn ? 'NDI & TRANSMISSÃO ATIVA' : 'DESATIVADO (SÓ HDMI LOCAL)';
    ndiDisplay.style.color = isNetOn ? 'var(--emerald)' : 'var(--text-muted)';
  }
  document.querySelectorAll('#group-cfg-network .conductor-btn').forEach(btn => {
    btn.classList.toggle('active', (btn.dataset.net === 'on') === isNetOn);
  });
}
window.updateNetworkOutputUI = updateNetworkOutputUI;

function toggleNetworkOutput(isOn) {
  appState.network_output_enabled = isOn;
  updateNetworkOutputUI();
  if (ws && ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify({
        type: 'set_config',
        key: 'network_output_enabled',
        value: isOn
      }));
    } catch (e) {
      console.warn('[NETWORK] Erro ao sincronizar estado NDI via WebSocket:', e);
    }
  }
  console.log(`[NETWORK] Transmissão de sinal em rede: ${isOn ? 'ATIVADA' : 'DESATIVADA (SÓ HDMI LOCAL)'}`);
}
window.toggleNetworkOutput = toggleNetworkOutput;

let lastEngineTick = performance.now();
let keepAliveWorkerInstance = null;

function initBackgroundKeepAlive() {
  if (keepAliveWorkerInstance) return;
  try {
    const workerScript = `
      var timer = null;
      self.onmessage = function(e) {
        if (e.data === 'start') {
          if (timer) clearInterval(timer);
          timer = setInterval(function() {
            self.postMessage('tick');
          }, 1000 / 60);
        } else if (e.data === 'stop') {
          if (timer) clearInterval(timer);
          timer = null;
        }
      };
    `;
    const blob = new Blob([workerScript], { type: 'application/javascript' });
    keepAliveWorkerInstance = new Worker(URL.createObjectURL(blob));
    keepAliveWorkerInstance.onmessage = function() {
      const now = performance.now();
      // Se a aba do navegador perdeu o foco, ficou oculta ou o RAF foi suspenso pelo macOS:
      if (document.hidden || !document.hasFocus() || (now - lastEngineTick > 25)) {
        renderVisuals(now);
      }
    };
    keepAliveWorkerInstance.postMessage('start');
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'playing';
    }
    console.log('[PENUMBRA ENGINE] Background Anti-Freeze Worker ativo (60 FPS contínuo no Mac).');
  } catch (err) {
    console.warn('[PENUMBRA ENGINE] Falha ao inicializar keep-alive worker:', err);
  }
}
window.initBackgroundKeepAlive = initBackgroundKeepAlive;

function renderVisuals(time) {
  const targetFps = appState.fps_limit || 30;
  const fpsInterval = 1000 / targetFps;
  const now = time || performance.now();
  lastEngineTick = now;
  
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

  // Dynamic Bus Sizing according to Master Aspect Ratio
  const aspectConfig = getAspectRatioDimensions(appState.aspectRatio || (appState.vertical_mode ? '9:16' : '16:9'));
  const targetBusW = aspectConfig.w;
  const targetBusH = aspectConfig.h;
  const isVert = Boolean(aspectConfig.isVertical || appState.vertical_mode || appState.vertical_projection);

  if (busCanvasA.width !== targetBusW || busCanvasA.height !== targetBusH) {
    busCanvasA.width = targetBusW;
    busCanvasA.height = targetBusH;
    busCanvasB.width = targetBusW;
    busCanvasB.height = targetBusH;
    offscreenA.width = targetBusW;
    offscreenA.height = targetBusH;
    offscreenB.width = targetBusW;
    offscreenB.height = targetBusH;
    sobelCanvas.width = targetBusW;
    sobelCanvas.height = targetBusH;
    handoverCanvas.width = targetBusW;
    handoverCanvas.height = targetBusH;
    rotSnapshotCanvas.width = targetBusW;
    rotSnapshotCanvas.height = targetBusH;
  }

  const w = busCanvasA.width;
  const h = busCanvasA.height;

  // Process Real-Time Playback Dynamics & Ping-Pong Loops (Smooth 60 FPS Bounce)
  if (playerL0) processLayerPingPong(playerL0, 'layer0', dt);
  if (playerL3) processLayerPingPong(playerL3, 'layer3', dt);
  if (playerL5) processLayerPingPong(playerL5, 'layer5', dt);

  // --------------------------------------------------------------------------
  // 1. RENDER DECK A INTO busCanvasA (MASTER BUS A)
  // --------------------------------------------------------------------------
  if (busCtxA) {
    busCtxA.fillStyle = '#050608';
    busCtxA.fillRect(0, 0, w, h);

    const baseClip = allClips.find(c => c.id === appState.layers.layer0.clipId) || allClips[0];
    const isBaseGen = baseClip && (baseClip.is_generative || baseClip.id === 'clip_gen_plexus_spine' || baseClip.category === '3D');
    const videoL0Ready = playerL0 && playerL0.readyState >= 2;
    const baseSource = isBaseGen ? getPlexusSpineCanvas(w, h, simTime, baseClip?.gen_scene, 'deckA') : (videoL0Ready ? playerL0 : getClipImage(baseClip));

    // Clip & Layer Transforms for Deck A (acessíveis globalmente para Layer 0 e Layer 2 Sobel)
    const clipTf0 = getClipTransform(appState.layers.layer0.clipId);
    const clipTn0 = getClipTonal(appState.layers.layer0.clipId);
    const l0 = appState.layers.layer0;
    const totalRot0 = (l0.rotation || 0) + (clipTf0.rotation || 0);
    const totalScale0 = (l0.scale || 1.0) * (clipTf0.scale || 1.0);
    const totalPosX0 = (l0.pos_x || 0) + (clipTf0.pos_x || 0);
    const totalPosY0 = (l0.pos_y || 0) + (clipTf0.pos_y || 0);

    if (baseSource && appState.layers.layer0.active) {
      offCtxA.clearRect(0, 0, w, h);
      offCtxA.fillStyle = '#050608';
      offCtxA.fillRect(0, 0, w, h);

      // Render base with rotation, scale, position & fit (combines Layer 0 + Base Clip transform)
      const tnFilter0 = getClipTonalFilterString(clipTn0);
      offCtxA.save();
      if (tnFilter0 !== 'none') offCtxA.filter = tnFilter0;
      drawFittedImage(offCtxA, baseSource, w, h, l0.fit_mode || 'fit', totalRot0, totalScale0, totalPosX0, totalPosY0, clipTf0.flip_h, clipTf0.flip_v);
      offCtxA.restore();

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
      const matteL0 = getMatteImage(appState.layers.layer0.matte, appState.layers.layer0.matte_invert);
      if (matteL0 && appState.layers.layer0.matte !== 'none') {
        offCtxA.save();
        offCtxA.globalCompositeOperation = 'destination-in';
        drawDeformedMatte(offCtxA, matteL0, w, h, simTime, appState.matte?.deform, appState.layers.layer0.matte_invert, appState.layers.layer0.matte);
        offCtxA.restore();
      }

      // Draw offscreenA to busCanvasA with tonal grading (bypassed if opacity is zero)
      const baseAOpacity = (appState.layers.layer0.opacity !== undefined) ? appState.layers.layer0.opacity : 1.0;
      if (baseAOpacity > 0.005) {
        busCtxA.save();
        busCtxA.globalAlpha = baseAOpacity;
        busCtxA.filter = getTonalFilterString(appState.tonal);
        busCtxA.drawImage(offscreenA, 0, 0, w, h);
        busCtxA.restore();
      }

      // Organic penumbra vignette removed
    }

    // LAYER 1: SELF-DOUBLE (Multiply/Screen blend, scale + audio pulse)
    const l1AOpacity = (appState.layers.layer1.opacity !== undefined) ? appState.layers.layer1.opacity : 0.55;
    if (baseSource && appState.layers.layer1.active && l1AOpacity > 0.005) {
      busCtxA.save();
      busCtxA.translate(w/2, h/2);
      const s = (appState.layers.layer1.scale || 1.12) + Math.sin(simTime * 0.3) * 0.008 + (sub * 0.02);
      busCtxA.scale(s, s);
      busCtxA.translate(-w/2, -h/2);
      const b1 = (appState.layers.layer1.blend || 'multiply').toLowerCase();
      busCtxA.globalCompositeOperation = b1 === 'screen' ? 'screen' : 'multiply';
      busCtxA.globalAlpha = l1AOpacity;
      drawFittedImage(busCtxA, baseSource, w, h, appState.layers.layer1.fit_mode || 'fit', appState.layers.layer1.rotation || 0);
      busCtxA.restore();
    }

    // LAYER 2: EDGE TRACE (Sobel Contours / Find Edges) - Desaparece no zero e blend profissional
    const l2 = appState.layers.layer2;
    const l2Opacity = (l2 && l2.opacity !== undefined) ? l2.opacity : 0.85;
    if (baseSource && l2 && l2.active && l2Opacity > 0.005) {
      const isL2SoloA = (!appState.layers.layer0.active || (appState.layers.layer0.opacity !== undefined && appState.layers.layer0.opacity <= 0.01)) &&
                        (!appState.layers.layer1.active || l1AOpacity <= 0.01);
      const edgeMix = (l2.edge_mix !== undefined ? l2.edge_mix : 0.85);
      const finalL2Alpha = isL2SoloA ? l2Opacity : Math.min(1.0, l2Opacity * edgeMix * (0.85 + air * 0.3));

      const tf0 = {
        rotation: totalRot0,
        scale: totalScale0,
        pos_x: totalPosX0,
        pos_y: totalPosY0,
        flip_h: clipTf0.flip_h,
        flip_v: clipTf0.flip_v
      };

      busCtxA.save();
      drawSobelContours(busCtxA, baseSource, w, h, simTime, l2.edge_threshold || 0.28, isL2SoloA, finalL2Alpha, tf0, l2.blend || 'Screen', l2.matte, l2.matte_invert);
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
    const isQueuedGen = queuedClip && (queuedClip.is_generative || queuedClip.id === 'clip_gen_plexus_spine' || queuedClip.category === '3D');
    const videoL3Ready = playerL3 && playerL3.readyState >= 2;
    const queuedSource = isQueuedGen ? getPlexusSpineCanvas(w, h, simTime, queuedClip?.gen_scene, 'deckB') : (videoL3Ready ? playerL3 : getClipImage(queuedClip));

    if (queuedSource) {
      // Deck B representa a mídia que está sendo pré-visualizada (CUE) e pronta para transição.
      // No monitor Preview/CUE, o operador deve sempre ver o vídeo base com nitidez.
      const l3RawOpac = (appState.layers.layer3 && appState.layers.layer3.opacity !== undefined) ? appState.layers.layer3.opacity : 1.0;
      const deckBOpacity = l3RawOpac > 0.05 ? l3RawOpac : 1.0;

      // Clip & Layer Transforms for Deck B (acessíveis globalmente para Layer 3 e Layer 2 Sobel no Bus B)
      const clipTf3 = getClipTransform(appState.layers.layer3.clipId);
      const clipTn3 = getClipTonal(appState.layers.layer3.clipId);
      const l3 = appState.layers.layer3;
      const totalRot3 = (l3.rotation || 0) + (clipTf3.rotation || 0);
      const totalScale3 = (l3.scale || 1.0) * (clipTf3.scale || 1.0);
      const totalPosX3 = (l3.pos_x || 0) + (clipTf3.pos_x || 0);
      const totalPosY3 = (l3.pos_y || 0) + (clipTf3.pos_y || 0);

      if (appState.layers.layer3.active) {
        offCtxB.clearRect(0, 0, w, h);
        offCtxB.fillStyle = '#050608';
        offCtxB.fillRect(0, 0, w, h);

        // Render secondary with rotation, scale, position & fit (combines Layer 3 + Queued Clip transform)
        const tnFilter3 = getClipTonalFilterString(clipTn3);
        offCtxB.save();
        if (tnFilter3 !== 'none') offCtxB.filter = tnFilter3;
        drawFittedImage(offCtxB, queuedSource, w, h, l3.fit_mode || 'fill', totalRot3, totalScale3, totalPosX3, totalPosY3, clipTf3.flip_h, clipTf3.flip_v);
        offCtxB.restore();

        // Apply Layer 3 Matte with invert support
        const matteL3 = getMatteImage(appState.layers.layer3.matte, appState.layers.layer3.matte_invert);
        if (matteL3 && appState.layers.layer3.matte !== 'none') {
          offCtxB.save();
          offCtxB.globalCompositeOperation = 'destination-in';
          drawDeformedMatte(offCtxB, matteL3, w, h, simTime, appState.matte?.deform, appState.layers.layer3.matte_invert, appState.layers.layer3.matte);
          offCtxB.restore();
        }

        // Always draw base video to Bus B
        busCtxB.save();
        busCtxB.filter = getTonalFilterString(appState.tonal);
        busCtxB.globalAlpha = deckBOpacity;
        busCtxB.drawImage(offscreenB, 0, 0, w, h);
        busCtxB.restore();

        // LAYER 1 on Bus B: SELF-DOUBLE (Ensures smooth crossfade without layer pop-in)
        const l1BOpacity = (appState.layers.layer1 && appState.layers.layer1.opacity !== undefined) ? appState.layers.layer1.opacity : 0.0;
        if (appState.layers.layer1.active && l1BOpacity > 0.005) {
          busCtxB.save();
          busCtxB.translate(w/2, h/2);
          const s = (appState.layers.layer1.scale || 1.12) + Math.sin(simTime * 0.3) * 0.008 + (sub * 0.02);
          busCtxB.scale(s, s);
          busCtxB.translate(-w/2, -h/2);
          const b1 = (appState.layers.layer1.blend || 'multiply').toLowerCase();
          busCtxB.globalCompositeOperation = b1 === 'screen' ? 'screen' : 'multiply';
          busCtxB.globalAlpha = l1BOpacity;
          drawFittedImage(busCtxB, queuedSource, w, h, appState.layers.layer3.fit_mode || 'fill', appState.layers.layer3.rotation || 0);
          busCtxB.restore();
        }
      }

      // LAYER 2 on Bus B: EDGE TRACE SOBEL
      const l2 = appState.layers.layer2;
      const l2BOpacity = (l2 && l2.opacity !== undefined) ? l2.opacity : 0.0;
      if (queuedSource && l2 && l2.active && l2BOpacity > 0.005) {
        const l1BOpacity = (appState.layers.layer1 && appState.layers.layer1.opacity !== undefined) ? appState.layers.layer1.opacity : 0.0;
        const isL2SoloB = (!appState.layers.layer3.active || deckBOpacity <= 0.01) &&
                          (!appState.layers.layer1.active || l1BOpacity <= 0.01);
        const edgeMix = (l2.edge_mix !== undefined ? l2.edge_mix : 0.85);
        const finalL2AlphaB = isL2SoloB ? l2BOpacity : Math.min(1.0, l2BOpacity * edgeMix * (0.85 + air * 0.3));

        const tf3 = {
          rotation: totalRot3,
          scale: totalScale3,
          pos_x: totalPosX3,
          pos_y: totalPosY3,
          flip_h: clipTf3.flip_h,
          flip_v: clipTf3.flip_v
        };

        busCtxB.save();
        drawSobelContours(busCtxB, queuedSource, w, h, simTime, l2.edge_threshold || 0.28, isL2SoloB, finalL2AlphaB, tf3, l2.blend || 'Screen', l2.matte, l2.matte_invert);
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
    if (prvCanvas.width !== targetBusW || prvCanvas.height !== targetBusH) {
      prvCanvas.width = targetBusW;
      prvCanvas.height = targetBusH;
    }
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
    if (prgCanvas.width !== targetBusW || prgCanvas.height !== targetBusH) {
      prgCanvas.width = targetBusW;
      prgCanvas.height = targetBusH;
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
      const l4Opacity = (appState.layers.layer4 && appState.layers.layer4.opacity !== undefined) ? appState.layers.layer4.opacity : 0.25;
      if (l4Opacity > 0.005 && (appState.macro_state === 'DROP' || appState.drop_likelihood > 0.65) && appState.layers.layer4.active) {
        const accentClip = allClips.find(c => c.id === appState.layers.layer4.clipId) || allClips[2] || allClips[0];
        const isAccentGen = accentClip && (accentClip.is_generative || accentClip.id === 'clip_gen_plexus_spine' || accentClip.category === '3D');
        const videoL4Ready = playerL4 && playerL4.readyState >= 2;
        const accentSource = isAccentGen ? getPlexusSpineCanvas(w, h, simTime, accentClip?.gen_scene, 'layer4') : (videoL4Ready ? playerL4 : getClipImage(accentClip));

        if (accentSource) {
          offCtxB.clearRect(0, 0, w, h);
          const clipTf4 = getClipTransform(appState.layers.layer4.clipId);
          const l4 = appState.layers.layer4;
          const totalRot4 = (l4.rotation || 0) + (clipTf4.rotation || 0);
          const totalScale4 = (l4.scale || 1.0) * (clipTf4.scale || 1.0);
          const totalPosX4 = (l4.pos_x || 0) + (clipTf4.pos_x || 0);
          const totalPosY4 = (l4.pos_y || 0) + (clipTf4.pos_y || 0);
          drawFittedImage(offCtxB, accentSource, w, h, l4.fit_mode || 'fit', totalRot4, totalScale4, totalPosX4, totalPosY4);

          const matteL4 = getMatteImage(appState.layers.layer4.matte, appState.layers.layer4.matte_invert);
          if (matteL4 && appState.layers.layer4.matte !== 'none') {
            offCtxB.save();
            offCtxB.globalCompositeOperation = 'destination-in';
            drawDeformedMatte(offCtxB, matteL4, w, h, simTime, appState.matte?.deform, appState.layers.layer4.matte_invert, appState.layers.layer4.matte);
            offCtxB.restore();
          }

          prgCtx.save();
          prgCtx.globalCompositeOperation = 'difference';
          prgCtx.globalAlpha = Math.min(0.35, l4Opacity * (0.6 + bass * 0.4));
          drawBusToProgram(prgCtx, offscreenB, pw, ph, isVert);
          prgCtx.restore();
        }
      }

      // 4.4. LAYER 5: DEDICATED OVERLAY DECK (PRIMARY FOREGROUND & INDEPENDENT LOOP COMPOSITING)
      if (appState.layers.layer5 && appState.layers.layer5.active && (appState.layers.layer5.opacity || 0) > 0.005) {
        const overlayClip = allClips.find(c => c.id === appState.layers.layer5.clipId) || allClips[1] || allClips[0];
        const isOverlayGen = overlayClip && (overlayClip.is_generative || overlayClip.id === 'clip_gen_plexus_spine' || overlayClip.category === '3D');
        const videoL5Ready = playerL5 && playerL5.readyState >= 2;
        const overlaySource = isOverlayGen ? getPlexusSpineCanvas(w, h, simTime, overlayClip?.gen_scene, 'layer5') : (videoL5Ready ? playerL5 : getClipImage(overlayClip));

        if (overlaySource) {
          offCtxOverlay.clearRect(0, 0, w, h);
          const clipTf5 = getClipTransform(appState.layers.layer5.clipId);
          const clipTn5 = getClipTonal(appState.layers.layer5.clipId);
          const l5 = appState.layers.layer5;
          const totalRot5 = (l5.rotation || 0) + (clipTf5.rotation || 0);
          const totalScale5 = (l5.scale || 1.0) * (clipTf5.scale || 1.0);
          const totalPosX5 = (l5.pos_x || 0) + (clipTf5.pos_x || 0);
          const totalPosY5 = (l5.pos_y || 0) + (clipTf5.pos_y || 0);
          const tnFilter5 = getClipTonalFilterString(clipTn5);
          offCtxOverlay.save();
          if (tnFilter5 !== 'none') offCtxOverlay.filter = tnFilter5;
          drawFittedImage(offCtxOverlay, overlaySource, w, h, l5.fit_mode || 'fill', totalRot5, totalScale5, totalPosX5, totalPosY5, clipTf5.flip_h, clipTf5.flip_v);
          offCtxOverlay.restore();

          const matteL5 = getMatteImage(l5.matte, l5.matte_invert);
          if (matteL5 && l5.matte !== 'none') {
            offCtxOverlay.save();
            offCtxOverlay.globalCompositeOperation = 'destination-in';
            drawDeformedMatte(offCtxOverlay, matteL5, w, h, simTime, appState.matte?.deform, l5.matte_invert, l5.matte);
            offCtxOverlay.restore();
          }

          prgCtx.save();
          prgCtx.globalAlpha = Math.min(1.0, Math.max(0.0, l5.opacity || 0));
          prgCtx.globalCompositeOperation = getCanvasCompositeOp(l5.blend || 'Screen');
          drawBusToProgram(prgCtx, offscreenOverlay, pw, ph, isVert);
          prgCtx.restore();
        }
      }
    }

    // 4.5. MASTER LOCKED MATTE (STATIC FRAMING OVERLAY) vs DYNAMIC MASTER MATTE
    if (!isBlackout && appState.master_locked_matte_active && appState.master_locked_matte && appState.master_locked_matte !== 'none') {
      const lockedMatteImg = getMatteImage(appState.master_locked_matte, appState.master_locked_matte_invert);
      if (lockedMatteImg) {
        prgCtx.save();
        prgCtx.globalCompositeOperation = 'destination-in';
        // Renderizado 100% estático sem deformações procedurais ou oscilação
        prgCtx.drawImage(lockedMatteImg, 0, 0, pw, ph);
        prgCtx.restore();
      }
    } else if (!isBlackout && appState.master_matte && appState.master_matte !== 'none') {
      const masterMatteImg = getMatteImage(appState.master_matte, appState.master_matte_invert);
      if (masterMatteImg) {
        prgCtx.save();
        prgCtx.globalCompositeOperation = 'destination-in';
        drawDeformedMatte(prgCtx, masterMatteImg, pw, ph, simTime, appState.matte?.deform, Boolean(appState.master_matte_invert), appState.master_matte);
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

  // 60 FPS Pro Timeline Arranger Render Pass (when Pro Timeline view is active)
  if (currentDockViewMode === 'timeline' && typeof renderProTimeline === 'function') {
    renderProTimeline();
  }

  requestAnimationFrame(renderVisuals);
}

// Hardware-Accelerated High-Definition Edge Trace (Find Edges / Sobel Contours)
function drawSobelContours(ctx, source, w, h, t, threshold, isSolo, alpha = 1.0, transform = null, blend = 'Screen', matteId = null, matteInv = false) {
  if (!source || alpha <= 0.005) return;
  if (sobelCanvas.width !== w || sobelCanvas.height !== h) {
    sobelCanvas.width = w;
    sobelCanvas.height = h;
  }
  
  const l2 = (appState.layers && appState.layers.layer2) || {};
  const edgeWidth = l2.edge_width || appState.tonal?.edge_width || 2.2;
  const lumBoost = Math.max(1.0, l2.luminance || appState.tonal?.edge_luminance || 2.5);
  const thresh = threshold !== undefined ? threshold : (l2.edge_threshold || 0.28);
  
  // Extrai parâmetros de transformação para alinhar perfeitamente com a cena em movimento
  const rot = transform ? (transform.rotation || 0) : (l2.rotation || 0);
  const scale = transform ? (transform.scale || 1.0) : (l2.scale || 1.0);
  const posX = transform ? (transform.pos_x || 0) : (l2.pos_x || 0);
  const posY = transform ? (transform.pos_y || 0) : (l2.pos_y || 0);
  const flipH = transform ? Boolean(transform.flip_h) : false;
  const flipV = transform ? Boolean(transform.flip_v) : false;
  const fitMode = l2.fit_mode || appState.aspect_fit_mode || 'fit';

  // 1. Renderiza a fonte em grayscale de alto contraste no sobelCanvas
  sobelCtx.clearRect(0, 0, w, h);
  sobelCtx.save();
  const contrastBoost = Math.round(180 + (1.0 - thresh) * 200);
  sobelCtx.filter = `grayscale(100%) contrast(${contrastBoost}%)`;
  drawFittedImage(sobelCtx, source, w, h, fitMode, rot, scale, posX, posY, flipH, flipV);

  // 2. Extração espacial de diferença (bordas nítidas)
  sobelCtx.globalCompositeOperation = 'difference';
  sobelCtx.drawImage(sobelCanvas, edgeWidth, edgeWidth);
  sobelCtx.restore();

  // 3. Gate de Ruído / Corte de Nível Preto Puro:
  // Garante que o fundo seja estritamente #000000 e NUNCA gere névoa leitosa sobre outras camadas!
  sobelCtx.save();
  sobelCtx.globalCompositeOperation = 'color-dodge';
  sobelCtx.filter = `contrast(${200 + Math.round(thresh * 100)}%) brightness(${Math.round(lumBoost * 110)}%)`;
  sobelCtx.drawImage(sobelCanvas, 0, 0);
  sobelCtx.restore();

  // 4. Aplicação de Máscara Matte (se configurada para L2)
  if (matteId && matteId !== 'none') {
    const matteImg = getMatteImage(matteId, matteInv);
    if (matteImg) {
      sobelCtx.save();
      sobelCtx.globalCompositeOperation = 'destination-in';
      drawDeformedMatte(sobelCtx, matteImg, w, h, t, appState.matte?.deform, matteInv, matteId);
      sobelCtx.restore();
    }
  }

  // 5. Composição no barramento de destino
  ctx.save();
  const clampedAlpha = Math.max(0.0, Math.min(1.0, alpha));
  ctx.globalAlpha = clampedAlpha;
  
  if (isSolo) {
    // MODO SOLO: Fundo negro puro, contornos brancos destacados e chalk neon suave
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(sobelCanvas, 0, 0, w, h);
    // Realce luminoso orgânico proporcional ao fader (desaparece no zero!)
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = clampedAlpha * 0.45;
    ctx.drawImage(sobelCanvas, 0, 0, w, h);
  } else {
    // MODO COMPOSTO: Mistura profissional sem lavar os tons escuros da camada base
    const b = (blend || l2.blend || 'Screen').toLowerCase();
    if (b === 'lighten') {
      ctx.globalCompositeOperation = 'lighten';
    } else if (b === 'overlay') {
      ctx.globalCompositeOperation = 'overlay';
    } else if (b === 'difference') {
      ctx.globalCompositeOperation = 'difference';
    } else if (b === 'source-over' || b === 'cutout') {
      ctx.globalCompositeOperation = 'source-over';
    } else {
      ctx.globalCompositeOperation = 'screen';
    }
    ctx.drawImage(sobelCanvas, 0, 0, w, h);
  }
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
const plexusCanvasBuffers = new Map();
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

function getPlexusPaletteColors(paletteKey) {
  switch (paletteKey) {
    case 'solar_gold':
      return {
        bgStart: 'rgba(38, 22, 2, 1)',
        bgEnd: 'rgba(12, 5, 0, 1)',
        primary: 'rgb(255, 175, 20)',
        primaryRgba: (a) => `rgba(255, 175, 20, ${a})`,
        accentRgba: (a) => `rgba(255, 80, 30, ${a})`,
        nodeBase: '#ffb703',
        nodeHot: '#ffffff'
      };
    case 'matrix_emerald':
      return {
        bgStart: 'rgba(2, 28, 14, 1)',
        bgEnd: 'rgba(0, 8, 3, 1)',
        primary: 'rgb(0, 255, 136)',
        primaryRgba: (a) => `rgba(0, 255, 136, ${a})`,
        accentRgba: (a) => `rgba(30, 220, 90, ${a})`,
        nodeBase: '#00ff88',
        nodeHot: '#ffffff'
      };
    case 'deep_violet':
      return {
        bgStart: 'rgba(26, 3, 38, 1)',
        bgEnd: 'rgba(7, 0, 14, 1)',
        primary: 'rgb(200, 50, 255)',
        primaryRgba: (a) => `rgba(200, 50, 255, ${a})`,
        accentRgba: (a) => `rgba(255, 40, 150, ${a})`,
        nodeBase: '#d946ef',
        nodeHot: '#ffffff'
      };
    case 'monochrome_ice':
      return {
        bgStart: 'rgba(18, 24, 32, 1)',
        bgEnd: 'rgba(2, 4, 8, 1)',
        primary: 'rgb(215, 235, 255)',
        primaryRgba: (a) => `rgba(215, 235, 255, ${a})`,
        accentRgba: (a) => `rgba(160, 200, 240, ${a})`,
        nodeBase: '#e2e8f0',
        nodeHot: '#ffffff'
      };
    case 'pt_rubi':
      return {
        bgStart: 'rgba(32, 3, 6, 1)',
        bgEnd: 'rgba(5, 0, 2, 1)',
        primary: 'rgb(220, 38, 38)',
        primaryRgba: (a) => `rgba(220, 38, 38, ${a})`,
        accentRgba: (a) => `rgba(255, 183, 3, ${a})`,
        nodeBase: '#dc2626',
        nodeHot: '#ffffff',
        label: 'PT RUBI & OURO'
      };
    case 'noir_gold':
      return {
        bgStart: 'rgba(28, 20, 4, 1)',
        bgEnd: 'rgba(5, 4, 1, 1)',
        primary: 'rgb(255, 183, 3)',
        primaryRgba: (a) => `rgba(255, 183, 3, ${a})`,
        accentRgba: (a) => `rgba(250, 204, 21, ${a})`,
        nodeBase: '#ffb703',
        nodeHot: '#fffbeb',
        label: 'NOIR & OURO'
      };
    case 'cyan_neon':
    default:
      return {
        bgStart: 'rgba(3, 18, 32, 1)',
        bgEnd: 'rgba(0, 3, 7, 1)',
        primary: 'rgb(0, 240, 255)',
        primaryRgba: (a) => `rgba(0, 240, 255, ${a})`,
        accentRgba: (a) => `rgba(0, 255, 136, ${a})`,
        nodeBase: '#00f0ff',
        nodeHot: '#ffffff',
        label: 'CIANO NEON'
      };
  }
}

function createDefault3DConfig(scene = 'star_13', palette = 'pt_rubi') {
  return {
    active_scene: scene,
    palette: palette,
    camera: {
      orbit_speed: 1.0,
      tilt: 0.22,
      fov: 1.35,
      distance: 2.3,
      roll: 0.0,
      auto_orbit: true
    },
    particles: {
      count_mult: 1.0,
      point_size: 1.0,
      line_connect_dist: 55,
      wireframe: true,
      glow_intensity: 1.0
    },
    audio_reactivity: {
      spine_swimming: 1.0,    // knob compartilhado: ondulação da coluna em 'spine' E pulso de brilho em 'biomorphic_flora' (cenas tratadas como continuação uma da outra)
      ocean_wave_amp: 1.0,
      star_treble_spin: 1.2,
      num13_sub_kick: 1.8,    // decoupled bass kick on the numeral 13!
      air_sparkle: 1.0
    }
  };
}
window.createDefault3DConfig = createDefault3DConfig;

function getActive3DConfig(target = null) {
  const tgt = target || appState.inspector_3d_target || 'deckA';
  if (tgt === 'deckA') {
    if (!appState.deckA_3d) appState.deckA_3d = createDefault3DConfig('star_13', 'pt_rubi');
    return appState.deckA_3d;
  }
  if (tgt === 'deckB') {
    if (!appState.deckB_3d) appState.deckB_3d = createDefault3DConfig('spine', 'cyan_neon');
    return appState.deckB_3d;
  }
  if (tgt === 'layer5') {
    if (!appState.layer5_3d) appState.layer5_3d = createDefault3DConfig('nebula_particles', 'deep_violet');
    return appState.layer5_3d;
  }
  return appState.gen3d || (appState.gen3d = createDefault3DConfig());
}
window.getActive3DConfig = getActive3DConfig;

function getPlexusSpineCanvas(w, h, simTime, explicitScene = null, bufferId = 'main') {
  let buf = plexusCanvasBuffers.get(bufferId);
  if (!buf) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    buf = { canvas: c, ctx: c.getContext('2d') };
    plexusCanvasBuffers.set(bufferId, buf);
  } else if (buf.canvas.width !== w || buf.canvas.height !== h) {
    buf.canvas.width = w;
    buf.canvas.height = h;
  }
  
  if (!plexusSpinePoints) {
    plexusSpinePoints = generateProceduralSpine();
  }

  const canvas = buf.canvas;
  const ctx = buf.ctx;

  // Resolve decoupled 3D configuration per deck/layer
  let cfg3d;
  if (bufferId === 'deckA') {
    if (!appState.deckA_3d) appState.deckA_3d = createDefault3DConfig('star_13', 'pt_rubi');
    cfg3d = appState.deckA_3d;
  } else if (bufferId === 'deckB') {
    if (!appState.deckB_3d) appState.deckB_3d = createDefault3DConfig('spine', 'cyan_neon');
    cfg3d = appState.deckB_3d;
  } else if (bufferId === 'layer5') {
    if (!appState.layer5_3d) appState.layer5_3d = createDefault3DConfig('nebula_particles', 'deep_violet');
    cfg3d = appState.layer5_3d;
  } else {
    cfg3d = appState.gen3d || {};
  }

  const activeScene = explicitScene || cfg3d.active_scene || 'star_13';
  const palette = getPlexusPaletteColors(cfg3d.palette || 'pt_rubi');

  const bass = Number(appState.bands?.bass || 0.45);
  const sub = Number(appState.bands?.sub || 0.45);
  const air = Number(appState.bands?.air || 0.35);
  const presence = Number(appState.bands?.presence || 0.35);

  const camCfg = cfg3d.camera || {};
  const orbitSpeed = camCfg.orbit_speed !== undefined ? camCfg.orbit_speed : 1.0;
  const camTilt = camCfg.tilt !== undefined ? camCfg.tilt : 0.22;
  const camRoll = camCfg.roll !== undefined ? camCfg.roll : 0.0;
  const camDist = Math.max(1.2, camCfg.distance !== undefined ? camCfg.distance : 2.3);
  const fov = camCfg.fov !== undefined ? camCfg.fov : 1.35;
  const autoOrbit = camCfg.auto_orbit !== false;

  // Background radial gradient
  const bgGrad = ctx.createRadialGradient(w * 0.5, h * 0.5, 40, w * 0.5, h * 0.5, Math.max(w, h) * 0.72);
  bgGrad.addColorStop(0, palette.bgStart);
  bgGrad.addColorStop(0.65, palette.bgEnd);
  bgGrad.addColorStop(1, '#000205');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, w, h);

  // 3D Camera Angles
  let rotY = autoOrbit ? (simTime * 0.28 * orbitSpeed) : (orbitSpeed * Math.PI * 0.5);
  let rotX = camTilt + Math.sin(simTime * 0.18) * 0.12;

  const renderParams = { bass, sub, presence, air, camDist, fov, palette, cfg3d, rotY, rotX, camRoll };

  // Branch rendering per scene
  if (activeScene === 'mercury_blob') {
    renderSceneMercuryBlob(ctx, w, h, simTime, renderParams);
  } else if (activeScene === 'monolith_13') {
    renderSceneMonolith13(ctx, w, h, simTime, renderParams);
  } else if (activeScene === 'nebula_particles') {
    renderSceneNebulaParticles(ctx, w, h, simTime, renderParams);
  } else if (activeScene === 'cyber_wireframe') {
    renderSceneCyberWireframe(ctx, w, h, simTime, renderParams);
  } else if (activeScene === 'hyper_torus') {
    renderSceneHyperTorus(ctx, w, h, simTime, renderParams);
  } else if (activeScene === 'black_hole_singularity') {
    renderSceneBlackHole(ctx, w, h, simTime, renderParams);
  } else if (activeScene === 'biomorphic_flora') {
    renderSceneBiomorphicFlora(ctx, w, h, simTime, renderParams);
  } else if (activeScene === 'sol_vermelho_horizonte') {
    renderSceneSolVermelho(ctx, w, h, simTime, renderParams);
  } else if (activeScene === 'ocean_sun') {
    renderSceneOceanSun(ctx, w, h, simTime, renderParams);
  } else if (activeScene === 'star_13') {
    renderSceneStar13(ctx, w, h, simTime, renderParams);
  } else if (activeScene === 'hybrid') {
    renderSceneOceanSun(ctx, w, h, simTime, { ...renderParams, isSubMesh: true });
    renderSceneStar13(ctx, w, h, simTime, { ...renderParams, isOverlayStar: true });
  } else {
    // Default: 'spine' (Houdini Biomorphic Marine Spine)
    renderSceneMarineSpine(ctx, w, h, simTime, renderParams);
  }

  return canvas;
}
window.getPlexusSpineCanvas = getPlexusSpineCanvas;

function renderSceneMarineSpine(ctx, w, h, simTime, p) {
  const cosY = Math.cos(p.rotY), sinY = Math.sin(p.rotY);
  const cosX = Math.cos(p.rotX), sinX = Math.sin(p.rotX);

  const swimPhase = simTime * 3.2;
  const swimAmp = (0.08 + p.bass * 0.14) * (p.cfg3d.audio_reactivity?.spine_swimming || 1.0);
  const ribExp = 1.0 + p.sub * 0.45;
  const dorsalPulse = 1.0 + p.air * 0.35;

  const pts = plexusSpinePoints;
  const step = Math.max(1, Math.floor(pts.length / 900));
  const projected = [];

  for (let i = 0; i < pts.length; i += step) {
    const raw = pts[i];
    const px = raw[0];
    const py = (raw[1] * ribExp) + Math.sin(px * 5.2 - swimPhase) * swimAmp * (1.0 + Math.abs(px));
    const pz = (raw[2] * dorsalPulse) - 0.16;

    const x1 = px * cosY + pz * sinY;
    const z1 = -px * sinY + pz * cosY;
    const y2 = py * cosX - z1 * sinX;
    const z2 = py * sinX + z1 * cosX;

    const depth = p.camDist + z2;
    if (depth <= 0.1) continue;

    const persp = p.fov / depth;
    const sx = w * 0.5 + x1 * persp * w;
    const sy = h * 0.5 + y2 * persp * h;

    projected.push({ sx, sy, z: z2, depth, origIndex: i });
  }

  // Connect lines
  ctx.save();
  const lineDistMax = 55 * (1.0 + p.bass * 0.35);
  const lineDistSq = lineDistMax * lineDistMax;
  ctx.lineWidth = 1.0 + p.bass * 1.4;

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
        const alpha = (1.0 - (d / lineDistMax)) * (0.28 + p.bass * 0.45);
        ctx.strokeStyle = p.palette.primaryRgba(alpha.toFixed(3));
        ctx.beginPath();
        ctx.moveTo(p1.sx, p1.sy);
        ctx.lineTo(p2.sx, p2.sy);
        ctx.stroke();
      }
    }
  }

  // Nodes & Corona Glow
  for (let i = 0; i < n; i++) {
    const pt = projected[i];
    const r = Math.max(1.2, (3.2 / pt.depth) * (0.8 + p.bass * 0.7));

    if (i % 6 === 0) {
      const halo = ctx.createRadialGradient(pt.sx, pt.sy, 0, pt.sx, pt.sy, r * 4.5);
      halo.addColorStop(0, p.palette.primaryRgba(0.45 + p.bass * 0.3));
      halo.addColorStop(0.5, p.palette.accentRgba(0.15));
      halo.addColorStop(1, p.palette.primaryRgba(0));
      ctx.fillStyle = halo;
      ctx.fillRect(pt.sx - r * 4.5, pt.sy - r * 4.5, r * 9, r * 9);
    }

    ctx.fillStyle = (i % 8 === 0) ? p.palette.nodeHot : p.palette.nodeBase;
    ctx.beginPath();
    ctx.arc(pt.sx, pt.sy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Floating marine spores
  ctx.globalCompositeOperation = 'screen';
  for (let i = 0; i < marineSpores.length; i++) {
    const s = marineSpores[i];
    s.x += s.vx * (1.0 + p.bass * 0.5);
    s.y += s.vy * (1.0 + p.presence * 0.5);
    s.z += s.vz;
    if (s.x < -0.9) s.x = 0.9; if (s.x > 0.9) s.x = -0.9;
    if (s.y < -0.7) s.y = 0.7; if (s.y > 0.7) s.y = -0.7;
    if (s.z < -0.6) s.z = 0.6; if (s.z > 0.6) s.z = -0.6;

    const x1 = s.x * cosY + s.z * sinY;
    const z1 = -s.x * sinY + s.z * cosY;
    const y2 = s.y * cosX - z1 * sinX;
    const z2 = s.y * sinX + z1 * cosX;
    const depth = p.camDist + z2;
    if (depth <= 0.1) continue;

    const persp = p.fov / depth;
    const sx = w * 0.5 + x1 * persp * w;
    const sy = h * 0.5 + y2 * persp * h;
    const sparkleMult = p.cfg3d.audio_reactivity?.air_sparkle || 1.0;
    const spR = Math.max(0.8, (s.size / depth) * (0.8 + p.air * 0.6 * sparkleMult));

    ctx.fillStyle = p.palette.accentRgba((s.alpha * (0.6 + p.air * 0.4 * sparkleMult)).toFixed(2));
    ctx.beginPath();
    ctx.arc(sx, sy, spR, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function renderSceneOceanSun(ctx, w, h, simTime, p) {
  const rotX = 0.48;
  const cosX = Math.cos(rotX), sinX = Math.sin(rotX);
  const waveAmp = (0.05 + p.bass * 0.08) * (p.cfg3d.audio_reactivity?.ocean_wave_amp || 1.0);

  // 1. Horizon Celestial Particle Orb (Sun / Moon)
  if (!p.isSubMesh) {
    const sunCx = w * 0.5;
    const sunCy = h * 0.32;
    const sunRadius = Math.min(w, h) * (0.13 + p.air * 0.04);

    const sunGrad = ctx.createRadialGradient(sunCx, sunCy, 0, sunCx, sunCy, sunRadius * 2.2);
    sunGrad.addColorStop(0, p.palette.nodeHot);
    sunGrad.addColorStop(0.35, p.palette.primaryRgba(0.85));
    sunGrad.addColorStop(0.7, p.palette.accentRgba(0.35));
    sunGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = sunGrad;
    ctx.fillRect(sunCx - sunRadius * 2.2, sunCy - sunRadius * 2.2, sunRadius * 4.4, sunRadius * 4.4);

    // Corona flare ring particles
    const ringCount = 48;
    for (let i = 0; i < ringCount; i++) {
      const angle = (i / ringCount) * Math.PI * 2 + simTime * 0.4;
      const flareR = sunRadius * (1.05 + Math.sin(angle * 7 + simTime * 3) * 0.18 * (1.0 + p.air * 0.5));
      const px = sunCx + Math.cos(angle) * flareR;
      const py = sunCy + Math.sin(angle) * flareR;
      ctx.fillStyle = p.palette.primaryRgba(0.7);
      ctx.beginPath();
      ctx.arc(px, py, 2.0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 2. 3D Ocean Undulating Grid Mesh (24 x 24 nodes)
  const cols = 24;
  const rows = 24;
  const gridPts = [];

  for (let r = 0; r < rows; r++) {
    const pz = (r / (rows - 1)) * 2.2 + 0.35;
    for (let c = 0; c < cols; c++) {
      const px = ((c / (cols - 1)) - 0.5) * 2.6;
      const py = 0.28 + Math.sin(px * 4.2 + simTime * 2.5) * waveAmp + Math.cos(pz * 3.8 + simTime * 1.8) * (waveAmp * 0.8);

      const y2 = py * cosX - pz * sinX;
      const z2 = py * sinX + pz * cosX;
      const depth = p.camDist + z2;

      if (depth > 0.1) {
        const persp = p.fov / depth;
        const sx = w * 0.5 + px * persp * w;
        const sy = h * 0.5 + y2 * persp * h;
        gridPts.push({ sx, sy, depth, r, c });
      } else {
        gridPts.push(null);
      }
    }
  }

  // Draw mesh lines
  ctx.save();
  ctx.lineWidth = 1.0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      const p1 = gridPts[idx];
      if (!p1) continue;

      // Horizontal line
      if (c + 1 < cols) {
        const p2 = gridPts[idx + 1];
        if (p2) {
          const alpha = Math.min(0.85, (1.2 / p1.depth) * (0.25 + p.bass * 0.45));
          ctx.strokeStyle = p.palette.primaryRgba(alpha.toFixed(2));
          ctx.beginPath();
          ctx.moveTo(p1.sx, p1.sy);
          ctx.lineTo(p2.sx, p2.sy);
          ctx.stroke();
        }
      }
      // Longitudinal depth line
      if (r + 1 < rows) {
        const p3 = gridPts[idx + cols];
        if (p3) {
          const alpha = Math.min(0.75, (1.0 / p1.depth) * (0.2 + p.sub * 0.4));
          ctx.strokeStyle = p.palette.accentRgba(alpha.toFixed(2));
          ctx.beginPath();
          ctx.moveTo(p1.sx, p1.sy);
          ctx.lineTo(p3.sx, p3.sy);
          ctx.stroke();
        }
      }
    }
  }
  ctx.restore();
}

function renderSceneStar13(ctx, w, h, simTime, p) {
  // ============================================================================
  // ESTRELA 13 PT · IDENTIDADE OFICIAL DO PARTIDO DOS TRABALHADORES (5 PONTAS 3D)
  // Geometria Áurea Regular (Cinco Pontas), Facetamento Bi-piramidal Chiaroscuro
  // e Tipografia Grotesca Oficial de Campanha com Kick de Subgrave Desacoplado
  // ============================================================================
  const trebleSpin = (p.cfg3d.audio_reactivity?.star_treble_spin || 1.2);
  const rotY = p.rotY !== undefined ? p.rotY : (simTime * (0.32 + (p.air + p.presence) * 0.5) * trebleSpin);
  const rotX = p.rotX !== undefined ? p.rotX : (0.16 + Math.sin(simTime * 0.22) * 0.16);
  const rotZ = Math.cos(simTime * 0.18) * 0.08 + (p.camRoll || 0);

  const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
  const cosX = Math.cos(rotX), sinX = Math.sin(rotX);
  const cosZ = Math.cos(rotZ), sinZ = Math.sin(rotZ);

  // Projeção 3D com rotação Yaw/Pitch/Roll
  const project3D = (px, py, pz) => {
    // Rot Z (Roll)
    const x0 = px * cosZ - py * sinZ;
    const y0 = px * sinZ + py * cosZ;
    const z0 = pz;
    // Rot Y (Yaw)
    const x1 = x0 * cosY + z0 * sinY;
    const z1 = -x0 * sinY + z0 * cosY;
    // Rot X (Pitch)
    const y2 = y0 * cosX - z1 * sinX;
    const z2 = y0 * sinX + z1 * cosX;

    const depth = p.camDist + z2;
    if (depth > 0.08) {
      const persp = p.fov / depth;
      const sx = w * 0.5 + x1 * persp * w;
      const sy = h * (p.isOverlayStar ? 0.42 : 0.5) + y2 * persp * h;
      return { sx, sy, depth, x1, y2, z2 };
    }
    return null;
  };

  // 1. A ESTRELA OFICIAL DE 5 PONTAS (REGULAR PENTAGRAM EM PROPORÇÃO ÁUREA)
  // Raio interno oficial de pentagrama regular: rInner = rOuter * sin(18°) / sin(54°) ≈ rOuter * 0.381966
  const rOuter = (p.isOverlayStar ? 0.36 : 0.50) * (1.0 + (p.presence || 0) * 0.12);
  const rInner = rOuter * 0.381966;
  const zApex = 0.14; // Relevo escultural central 3D

  const outerVerts3D = [];
  const innerVerts3D = [];

  for (let k = 0; k < 5; k++) {
    // Ponta superior (k=0) perfeitamente alinhada para cima a -90° (-PI/2)
    const angleOuter = -Math.PI * 0.5 + k * (Math.PI * 2 / 5);
    const angleInner = -Math.PI * 0.5 + (k + 0.5) * (Math.PI * 2 / 5);

    outerVerts3D.push({
      x: Math.cos(angleOuter) * rOuter,
      y: Math.sin(angleOuter) * rOuter,
      z: 0.0
    });

    innerVerts3D.push({
      x: Math.cos(angleInner) * rInner,
      y: Math.sin(angleInner) * rInner,
      z: -0.03
    });
  }

  // Projetar ápice frontal, ápice traseiro e os 10 vértices perimetrais
  const pApexFront = project3D(0, 0, zApex);
  const pOuter = outerVerts3D.map(v => project3D(v.x, v.y, v.z));
  const pInner = innerVerts3D.map(v => project3D(v.x, v.y, v.z));

  ctx.save();

  // Desenhar as 10 Facetas Esculturais Frontais com Iluminação Chiaroscuro
  if (pApexFront) {
    const lightDir = { x: 0.55, y: -0.65, z: 0.52 }; // Luz direcional de estúdio de palco

    for (let k = 0; k < 5; k++) {
      const nextK = (k + 1) % 5;
      const tip = pOuter[k];
      const val = pInner[k];
      const nextTip = pOuter[nextK];

      // Faceta A: Ápice Central -> Ponta[k] -> Vale[k]
      if (tip && val) {
        const nx = (outerVerts3D[k].x + innerVerts3D[k].x) * 0.5;
        const ny = (outerVerts3D[k].y + innerVerts3D[k].y) * 0.5;
        const dot = Math.max(0.18, Math.min(1.0, (nx * lightDir.x + ny * lightDir.y) * 0.5 + 0.58));

        ctx.fillStyle = (p.palette.primary === 'rgb(220, 38, 38)' || p.palette.label === 'PT RUBI & OURO')
          ? `rgba(${Math.round(225 * dot)}, ${Math.round(29 * dot)}, ${Math.round(72 * dot)}, 0.95)`
          : p.palette.primaryRgba(dot.toFixed(2));

        ctx.beginPath();
        ctx.moveTo(pApexFront.sx, pApexFront.sy);
        ctx.lineTo(tip.sx, tip.sy);
        ctx.lineTo(val.sx, val.sy);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = p.palette.accentRgba(0.35);
        ctx.lineWidth = 1.0;
        ctx.stroke();
      }

      // Faceta B: Ápice Central -> Vale[k] -> Ponta Seguinte[nextK]
      if (val && nextTip) {
        const nx2 = (innerVerts3D[k].x + outerVerts3D[nextK].x) * 0.5;
        const ny2 = (innerVerts3D[k].y + outerVerts3D[nextK].y) * 0.5;
        const dot2 = Math.max(0.12, Math.min(1.0, (nx2 * -lightDir.x + ny2 * -lightDir.y) * 0.5 + 0.42));

        ctx.fillStyle = (p.palette.primary === 'rgb(220, 38, 38)' || p.palette.label === 'PT RUBI & OURO')
          ? `rgba(${Math.round(165 * dot2)}, ${Math.round(18 * dot2)}, ${Math.round(48 * dot2)}, 0.95)`
          : p.palette.primaryRgba((dot2 * 0.85).toFixed(2));

        ctx.beginPath();
        ctx.moveTo(pApexFront.sx, pApexFront.sy);
        ctx.lineTo(val.sx, val.sy);
        ctx.lineTo(nextTip.sx, nextTip.sy);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = p.palette.primaryRgba(0.4);
        ctx.lineWidth = 1.0;
        ctx.stroke();
      }
    }
  }

  // Contorno Externo Áureo & Halo Dourado nas 5 Pontas
  ctx.strokeStyle = p.palette.accentRgba(0.9);
  ctx.lineWidth = 2.0 + (p.presence || 0) * 1.5;
  ctx.beginPath();
  for (let k = 0; k < 5; k++) {
    const tip = pOuter[k];
    const val = pInner[k];
    if (tip && val) {
      if (k === 0) ctx.moveTo(tip.sx, tip.sy);
      else ctx.lineTo(tip.sx, tip.sy);
      ctx.lineTo(val.sx, val.sy);
    }
  }
  ctx.closePath();
  ctx.stroke();

  // Halos de Luz Estelar nas 5 Pontas
  for (let k = 0; k < 5; k++) {
    const tip = pOuter[k];
    if (tip) {
      const halo = ctx.createRadialGradient(tip.sx, tip.sy, 0, tip.sx, tip.sy, 16);
      halo.addColorStop(0, p.palette.nodeHot);
      halo.addColorStop(0.5, p.palette.accentRgba(0.5));
      halo.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = halo;
      ctx.fillRect(tip.sx - 16, tip.sy - 16, 32, 32);
    }
  }
  ctx.restore();

  // ============================================================================
  // 2. O NUMERAL OFICIAL DE CAMPANHA "13" DESACOPLADO
  // Responde com VIGOR & KICK aos impulsos de subgrave sem herdar o giro da estrela!
  // Tipografia fiel: "1" sólido com aba a 45° e base robusta; "3" com curvas
  // simétricas e corte horizontal central.
  // ============================================================================
  const kickMult = (p.cfg3d.audio_reactivity?.num13_sub_kick || 1.8);
  const kickEnergy = ((p.sub || 0.4) * 0.85 + (p.bass || 0.4) * 0.6) * kickMult;
  const kickZDisplace = -0.35 * Math.min(1.5, kickEnergy);
  const kickScale = 1.0 + Math.min(1.2, kickEnergy * 0.65);

  const numDepth = Math.max(0.6, p.camDist + kickZDisplace);
  const numPersp = p.fov / numDepth;
  const numCx = w * 0.5;
  const numCy = h * (p.isOverlayStar ? 0.42 : 0.5);

  ctx.save();
  ctx.translate(numCx, numCy);
  ctx.scale(kickScale, kickScale);

  const glyphH = Math.min(w, h) * (p.isOverlayStar ? 0.14 : 0.185);
  const glyphW = glyphH * 0.72;

  const isHotKick = kickEnergy > 0.85;
  if (isHotKick) {
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 28 * kickEnergy;
  } else {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 4;
  }

  const colFill = isHotKick ? '#ffffff' : '#f8fafc';
  ctx.fillStyle = colFill;

  // Numeral "1" Oficial
  const x1_center = -glyphW * 0.38;
  const stemW = glyphW * 0.24;
  const flagW = glyphW * 0.28;
  const flagH = glyphH * 0.26;
  const baseY = glyphH * 0.48;
  const topY = -glyphH * 0.48;

  ctx.beginPath();
  // Coluna vertical sólida
  ctx.rect(x1_center - stemW * 0.5, topY, stemW, glyphH * 0.96);
  // Bico/bandeira angular chanfrada a 45°
  ctx.moveTo(x1_center - stemW * 0.5, topY);
  ctx.lineTo(x1_center - stemW * 0.5 - flagW, topY + flagH);
  ctx.lineTo(x1_center - stemW * 0.5, topY + flagH * 0.65);
  ctx.closePath();
  // Sapata/base horizontal de sustentação
  ctx.rect(x1_center - stemW * 1.1, baseY - glyphH * 0.09, stemW * 2.2, glyphH * 0.09);
  ctx.fill();

  // Numeral "3" Oficial
  const x3_center = glyphW * 0.36;
  const arcR = glyphH * 0.25;
  const barThick = glyphW * 0.23;

  ctx.beginPath();
  // Barra horizontal superior
  ctx.rect(x3_center - arcR * 0.8, topY, arcR * 1.5, barThick);
  // Arco superior
  ctx.arc(x3_center, topY + arcR, arcR, -Math.PI * 0.45, Math.PI * 0.25, false);
  // Arco inferior
  ctx.arc(x3_center, baseY - arcR, arcR, -Math.PI * 0.25, Math.PI * 0.65, false);
  // Junção horizontal central
  ctx.rect(x3_center - arcR * 0.4, topY + arcR * 1.05 - barThick * 0.5, arcR * 1.0, barThick * 0.85);
  ctx.lineWidth = barThick;
  ctx.strokeStyle = colFill;
  ctx.lineCap = 'square';
  ctx.stroke();

  // Realce sutil de borda dourada
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = p.palette.accentRgba(0.65);
  ctx.stroke();

  ctx.restore();
}

function renderSceneMercuryBlob(ctx, w, h, simTime, p) {
  // Escultura Orgânica Contemporânea de Cromo Líquido / Mercúrio Metálico (Deformador Simplex Chiaroscuro)
  const rotY = simTime * 0.35;
  const rotX = 0.25 + Math.sin(simTime * 0.22) * 0.15;
  const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
  const cosX = Math.cos(rotX), sinX = Math.sin(rotX);

  const baseRadius = 0.44;
  const latRings = 24;
  const lonSegments = 32;
  const projectedRings = [];

  const viscosityPulse = 1.0 + p.bass * 0.45;
  const morphSpeed = simTime * 1.6;

  for (let lat = 0; lat <= latRings; lat++) {
    const theta = (lat / latRings) * Math.PI;
    const sinTheta = Math.sin(theta);
    const cosTheta = Math.cos(theta);
    const ringPts = [];

    for (let lon = 0; lon <= lonSegments; lon++) {
      const phi = (lon / lonSegments) * Math.PI * 2;
      const cosPhi = Math.cos(phi);
      const sinPhi = Math.sin(phi);

      const deform = (
        Math.sin(theta * 3.0 + phi * 2.0 + morphSpeed) * 0.07 +
        Math.cos(theta * 5.0 - morphSpeed * 1.3) * 0.04 * (1.0 + p.sub * 0.8) +
        Math.sin(phi * 4.0 + morphSpeed * 0.9) * 0.05 * (1.0 + p.bass * 0.6)
      ) * viscosityPulse;

      const r = baseRadius + deform;

      const px = r * sinTheta * cosPhi;
      const py = r * cosTheta;
      const pz = r * sinTheta * sinPhi;

      const nx = sinTheta * cosPhi;
      const ny = cosTheta;
      const nz = sinTheta * sinPhi;

      const x1 = px * cosY + pz * sinY;
      const z1 = -px * sinY + pz * cosY;
      const y2 = py * cosX - z1 * sinX;
      const z2 = py * sinX + z1 * cosX;

      const nx1 = nx * cosY + nz * sinY;
      const nz1 = -nx * sinY + nz * cosY;
      const ny2 = ny * cosX - nz1 * sinX;
      const nz2 = ny * sinX + nz1 * cosX;

      const depth = p.camDist + z2;
      if (depth > 0.1) {
        const persp = p.fov / depth;
        const sx = w * 0.5 + x1 * persp * w;
        const sy = h * 0.5 + y2 * persp * h;

        const dotLight = nx1 * 0.55 - ny2 * 0.65 + nz2 * 0.52;
        const specular = Math.pow(Math.max(0, dotLight), 7.0);
        const rim = Math.pow(1.0 - Math.max(0, nz2), 2.2);

        ringPts.push({ sx, sy, depth, dotLight, specular, rim });
      } else {
        ringPts.push(null);
      }
    }
    projectedRings.push(ringPts);
  }

  ctx.save();
  for (let lat = 0; lat < latRings; lat++) {
    const r1 = projectedRings[lat];
    const r2 = projectedRings[lat + 1];

    for (let lon = 0; lon < lonSegments; lon++) {
      const p1 = r1[lon];
      const p2 = r1[lon + 1];
      const p3 = r2[lon + 1];
      const p4 = r2[lon];

      if (!p1 || !p2 || !p3 || !p4) continue;

      const avgDot = (p1.dotLight + p2.dotLight + p3.dotLight + p4.dotLight) * 0.25;
      const avgSpec = (p1.specular + p2.specular + p3.specular + p4.specular) * 0.25;
      const avgRim = (p1.rim + p2.rim + p3.rim + p4.rim) * 0.25;

      const baseAlpha = Math.max(0.12, Math.min(0.95, (avgDot * 0.5 + 0.5) * 0.75 + avgSpec * 0.85));
      ctx.fillStyle = avgSpec > 0.45 ? p.palette.nodeHot : p.palette.primaryRgba(baseAlpha.toFixed(2));

      ctx.beginPath();
      ctx.moveTo(p1.sx, p1.sy);
      ctx.lineTo(p2.sx, p2.sy);
      ctx.lineTo(p3.sx, p3.sy);
      ctx.lineTo(p4.sx, p4.sy);
      ctx.closePath();
      ctx.fill();

      if (avgRim > 0.55) {
        ctx.strokeStyle = p.palette.accentRgba((avgRim * 0.65).toFixed(2));
        ctx.lineWidth = 1.0;
        ctx.stroke();
      }
    }
  }

  const dropletCount = 28;
  for (let i = 0; i < dropletCount; i++) {
    const angle = (i / dropletCount) * Math.PI * 2 + simTime * 0.7 * (i % 2 === 0 ? 1 : -1);
    const dropDist = baseRadius * (1.35 + Math.sin(angle * 3 + simTime) * 0.2 * (1.0 + p.presence * 0.4));
    const dX = Math.cos(angle) * dropDist;
    const dY = Math.sin(angle * 2) * 0.12 + Math.cos(angle) * 0.08;
    const dZ = Math.sin(angle) * dropDist;

    const x1 = dX * cosY + dZ * sinY;
    const z1 = -dX * sinY + dZ * cosY;
    const y2 = dY * cosX - z1 * sinX;
    const z2 = dY * sinX + z1 * cosX;

    const depth = p.camDist + z2;
    if (depth > 0.1) {
      const persp = p.fov / depth;
      const sx = w * 0.5 + x1 * persp * w;
      const sy = h * 0.5 + y2 * persp * h;
      const radius = Math.max(1.5, 3.5 * persp * (1.0 + p.air * 0.8));

      const dropGrad = ctx.createRadialGradient(sx - radius * 0.3, sy - radius * 0.3, 0, sx, sy, radius * 1.8);
      dropGrad.addColorStop(0, p.palette.nodeHot);
      dropGrad.addColorStop(0.5, p.palette.primaryRgba(0.85));
      dropGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = dropGrad;
      ctx.beginPath();
      ctx.arc(sx, sy, radius * 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function renderSceneMonolith13(ctx, w, h, simTime, p) {
  // Instalação Arquitetônica Brutalista: Monólito Sagrado 13 com Fendas de Luz Volumétricas
  const rotY = simTime * 0.18;
  const rotX = 0.22 + Math.sin(simTime * 0.14) * 0.08;
  const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
  const cosX = Math.cos(rotX), sinX = Math.sin(rotX);

  const hw = 0.28;
  const hh = 0.72;
  const hd = 0.12;

  const rawVertices = [
    [-hw, -hh, -hd], [hw, -hh, -hd], [hw, hh, -hd], [-hw, hh, -hd],
    [-hw, -hh,  hd], [hw, -hh,  hd], [hw, hh,  hd], [-hw, hh,  hd]
  ];

  const proj = [];
  for (let i = 0; i < rawVertices.length; i++) {
    const [px, py, pz] = rawVertices[i];
    const x1 = px * cosY + pz * sinY;
    const z1 = -px * sinY + pz * cosY;
    const y2 = py * cosX - z1 * sinX;
    const z2 = py * sinX + z1 * cosX;

    const depth = p.camDist + z2;
    if (depth > 0.1) {
      const persp = p.fov / depth;
      proj.push({
        sx: w * 0.5 + x1 * persp * w,
        sy: h * 0.5 + y2 * persp * h,
        z: z2,
        depth
      });
    } else {
      proj.push(null);
    }
  }

  const faces = [
    { idx: [0, 1, 2, 3], name: 'front' },
    { idx: [5, 4, 7, 6], name: 'back' },
    { idx: [4, 0, 3, 7], name: 'left' },
    { idx: [1, 5, 6, 2], name: 'right' },
    { idx: [4, 5, 1, 0], name: 'top' },
    { idx: [3, 2, 6, 7], name: 'bottom' }
  ];

  ctx.save();
  faces.forEach(f => {
    const pts = f.idx.map(i => proj[i]);
    if (pts.some(p => !p)) return;

    const vax = pts[1].sx - pts[0].sx, vay = pts[1].sy - pts[0].sy;
    const vbx = pts[2].sx - pts[0].sx, vby = pts[2].sy - pts[0].sy;
    const cross2D = vax * vby - vay * vbx;
    if (cross2D <= 0) return;

    const isFront = f.name === 'front';
    const isTop = f.name === 'top';
    const faceLight = isTop ? 0.42 : (isFront ? 0.32 : 0.18);
    const colVal = Math.floor(faceLight * 255);
    ctx.fillStyle = `rgb(${Math.floor(colVal * 0.85)}, ${Math.floor(colVal * 0.95)}, ${Math.floor(colVal * 1.1)})`;

    ctx.beginPath();
    ctx.moveTo(pts[0].sx, pts[0].sy);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].sx, pts[i].sy);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = p.palette.accentRgba(0.35);
    ctx.lineWidth = 1.2;
    ctx.stroke();

    if (isFront) {
      const slats = 5;
      const kickLight = 0.4 + p.sub * 0.6;
      for (let s = 1; s <= slats; s++) {
        const t = s / (slats + 1);
        const topX = pts[0].sx + (pts[1].sx - pts[0].sx) * t;
        const topY = pts[0].sy + (pts[1].sy - pts[0].sy) * t;
        const botX = pts[3].sx + (pts[2].sx - pts[3].sx) * t;
        const botY = pts[3].sy + (pts[2].sy - pts[3].sy) * t;

        ctx.strokeStyle = p.palette.primaryRgba(kickLight.toFixed(2));
        ctx.lineWidth = 2.0;
        ctx.beginPath();
        ctx.moveTo(topX, topY + 15);
        ctx.lineTo(botX, botY - 15);
        ctx.stroke();
      }

      const midX = (pts[0].sx + pts[1].sx + pts[2].sx + pts[3].sx) * 0.25;
      const midY = (pts[0].sy + pts[1].sy + pts[2].sy + pts[3].sy) * 0.25;
      const glyphScale = 1.0 + p.bass * 0.3;

      ctx.save();
      ctx.translate(midX, midY);
      ctx.scale(glyphScale, glyphScale);
      ctx.font = 'bold 36px "SF Pro Display", "Inter", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = p.palette.nodeHot;
      ctx.shadowColor = p.palette.primary;
      ctx.shadowBlur = 18 * (1.0 + p.bass * 0.8);
      ctx.fillText('13', 0, 0);
      ctx.restore();
    }
  });

  const dustCount = 45;
  for (let i = 0; i < dustCount; i++) {
    const t = (simTime * 0.25 + i / dustCount) % 1.0;
    const dY = (0.5 - t) * 1.8;
    const angle = (i * 137.5 * Math.PI) / 180;
    const dist = 0.45 + Math.sin(i * 1.3) * 0.2;
    const dX = Math.cos(angle) * dist;
    const dZ = Math.sin(angle) * dist;

    const x1 = dX * cosY + dZ * sinY;
    const z1 = -dX * sinY + dZ * cosY;
    const y2 = dY * cosX - z1 * sinX;
    const z2 = dY * sinX + z1 * cosX;

    const depth = p.camDist + z2;
    if (depth > 0.1) {
      const persp = p.fov / depth;
      const sx = w * 0.5 + x1 * persp * w;
      const sy = h * 0.5 + y2 * persp * h;
      const alpha = Math.sin(t * Math.PI) * (0.3 + p.air * 0.5);

      ctx.fillStyle = p.palette.primaryRgba(alpha.toFixed(2));
      ctx.beginPath();
      ctx.arc(sx, sy, 1.8 * persp * 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function renderSceneNebulaParticles(ctx, w, h, simTime, p) {
  // Enxame Quântico de Partículas & Atrator Estranho de Lorenz (Volumetric Stardust)
  const rotY = simTime * 0.24;
  const rotX = 0.35 + Math.sin(simTime * 0.16) * 0.12;
  const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
  const cosX = Math.cos(rotX), sinX = Math.sin(rotX);

  const count = 320;
  const projected = [];
  const expand = 1.0 + p.presence * 0.35;

  for (let i = 0; i < count; i++) {
    const t = i * 0.08 + simTime * 0.4;
    const px = (Math.sin(t * 1.1) * Math.cos(t * 0.7) * 0.75 + Math.sin(t * 2.3) * 0.2) * expand;
    const py = (Math.cos(t * 1.3) * 0.65 + Math.sin(t * 3.1) * 0.15) * expand;
    const pz = (Math.sin(t * 0.9) * 0.75 + Math.cos(t * 1.7) * 0.25) * expand;

    const x1 = px * cosY + pz * sinY;
    const z1 = -px * sinY + pz * cosY;
    const y2 = py * cosX - z1 * sinX;
    const z2 = py * sinX + z1 * cosX;

    const depth = p.camDist + z2;
    if (depth > 0.1) {
      const persp = p.fov / depth;
      const sx = w * 0.5 + x1 * persp * w;
      const sy = h * 0.5 + y2 * persp * h;
      projected.push({ sx, sy, depth, z2, i });
    }
  }

  ctx.save();
  const connThreshold = 48 * (1.0 + p.bass * 0.4);
  const connThresholdSq = connThreshold * connThreshold;
  ctx.lineWidth = 1.0;

  for (let i = 0; i < projected.length; i += 2) {
    const p1 = projected[i];
    for (let j = i + 1; j < Math.min(i + 12, projected.length); j++) {
      const p2 = projected[j];
      const dx = p1.sx - p2.sx;
      const dy = p1.sy - p2.sy;
      const distSq = dx * dx + dy * dy;

      if (distSq < connThresholdSq) {
        const d = Math.sqrt(distSq);
        const alpha = (1.0 - d / connThreshold) * (0.25 + p.air * 0.45);
        ctx.strokeStyle = p.palette.accentRgba(alpha.toFixed(2));
        ctx.beginPath();
        ctx.moveTo(p1.sx, p1.sy);
        ctx.lineTo(p2.sx, p2.sy);
        ctx.stroke();
      }
    }
  }

  for (let i = 0; i < projected.length; i++) {
    const pt = projected[i];
    const size = Math.max(1.2, (2.6 / pt.depth) * (1.0 + p.presence * 0.5));
    const alpha = Math.min(0.95, (1.2 / pt.depth) * (0.45 + p.air * 0.55));

    ctx.fillStyle = (i % 7 === 0) ? p.palette.nodeHot : p.palette.primaryRgba(alpha.toFixed(2));
    ctx.beginPath();
    ctx.arc(pt.sx, pt.sy, size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function renderSceneCyberWireframe(ctx, w, h, simTime, p) {
  // Matriz Tridimensional de Tensores Brutalistas & Tesseract Laser Wireframe
  const rotY = simTime * 0.42;
  const rotX = simTime * 0.28;
  const rotZ = Math.sin(simTime * 0.18) * 0.2;

  const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
  const cosX = Math.cos(rotX), sinX = Math.sin(rotX);
  const cosZ = Math.cos(rotZ), sinZ = Math.sin(rotZ);

  const sizes = [0.32, 0.58 * (1.0 + p.sub * 0.3)];
  const projectedSets = [];

  sizes.forEach(s => {
    const cubeVerts = [
      [-s, -s, -s], [s, -s, -s], [s, s, -s], [-s, s, -s],
      [-s, -s,  s], [s, -s,  s], [s, s,  s], [-s, s,  s]
    ];
    const proj = [];
    cubeVerts.forEach(([px, py, pz]) => {
      let x1 = px * cosY + pz * sinY;
      let z1 = -px * sinY + pz * cosY;
      let y2 = py * cosX - z1 * sinX;
      let z2 = py * sinX + z1 * cosX;
      let x3 = x1 * cosZ - y2 * sinZ;
      let y3 = x1 * sinZ + y2 * cosZ;

      const depth = p.camDist + z2;
      if (depth > 0.1) {
        const persp = p.fov / depth;
        proj.push({
          sx: w * 0.5 + x3 * persp * w,
          sy: h * 0.5 + y3 * persp * h,
          depth
        });
      } else {
        proj.push(null);
      }
    });
    projectedSets.push(proj);
  });

  const edges = [
    [0,1], [1,2], [2,3], [3,0],
    [4,5], [5,6], [6,7], [7,4],
    [0,4], [1,5], [2,6], [3,7]
  ];

  ctx.save();
  const kickEnergy = p.bass * 0.8 + p.sub * 0.4;
  ctx.lineWidth = 1.5 + kickEnergy * 1.5;

  projectedSets.forEach((proj, setIdx) => {
    const isInner = setIdx === 0;
    ctx.strokeStyle = isInner ? p.palette.nodeHot : p.palette.primaryRgba((0.65 + kickEnergy * 0.35).toFixed(2));

    edges.forEach(([i1, i2]) => {
      const p1 = proj[i1];
      const p2 = proj[i2];
      if (!p1 || !p2) return;

      ctx.beginPath();
      ctx.moveTo(p1.sx, p1.sy);
      ctx.lineTo(p2.sx, p2.sy);
      ctx.stroke();
    });
  });

  if (projectedSets[0] && projectedSets[1]) {
    ctx.strokeStyle = p.palette.accentRgba((0.4 + p.air * 0.4).toFixed(2));
    ctx.lineWidth = 1.0;
    for (let i = 0; i < 8; i++) {
      const p1 = projectedSets[0][i];
      const p2 = projectedSets[1][i];
      if (p1 && p2) {
        ctx.beginPath();
        ctx.moveTo(p1.sx, p1.sy);
        ctx.lineTo(p2.sx, p2.sy);
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

function renderSceneHyperTorus(ctx, w, h, simTime, p) {
  // Nó Toroidal Topológico & Vórtice de Fluxo Harmônico
  const rotY = simTime * 0.32;
  const rotX = 0.38 + Math.sin(simTime * 0.2) * 0.14;
  const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
  const cosX = Math.cos(rotX), sinX = Math.sin(rotX);

  const R = 0.42;
  const rBase = 0.16 * (1.0 + p.bass * 0.35);
  const rings = 20;
  const tubeSteps = 24;
  const grid = [];

  for (let i = 0; i < rings; i++) {
    const u = (i / rings) * Math.PI * 2;
    const ringPts = [];
    for (let j = 0; j < tubeSteps; j++) {
      const v = (j / tubeSteps) * Math.PI * 2 + simTime * 1.5;
      const px = (R + rBase * Math.cos(v)) * Math.cos(u);
      const py = (R + rBase * Math.cos(v)) * Math.sin(u);
      const pz = rBase * Math.sin(v) + Math.sin(u * 3 + simTime * 2) * 0.05 * (1.0 + p.sub * 0.5);

      const x1 = px * cosY + pz * sinY;
      const z1 = -px * sinY + pz * cosY;
      const y2 = py * cosX - z1 * sinX;
      const z2 = py * sinX + z1 * cosX;

      const depth = p.camDist + z2;
      if (depth > 0.1) {
        const persp = p.fov / depth;
        ringPts.push({
          sx: w * 0.5 + x1 * persp * w,
          sy: h * 0.5 + y2 * persp * h,
          depth
        });
      } else {
        ringPts.push(null);
      }
    }
    grid.push(ringPts);
  }

  ctx.save();
  ctx.lineWidth = 1.0;
  for (let i = 0; i < rings; i++) {
    const nextI = (i + 1) % rings;
    for (let j = 0; j < tubeSteps; j++) {
      const nextJ = (j + 1) % tubeSteps;
      const p1 = grid[i][j];
      const p2 = grid[i][nextJ];
      const p3 = grid[nextI][j];

      if (!p1) continue;

      if (p2) {
        const alpha = Math.min(0.8, (1.2 / p1.depth) * (0.3 + p.presence * 0.5));
        ctx.strokeStyle = p.palette.primaryRgba(alpha.toFixed(2));
        ctx.beginPath();
        ctx.moveTo(p1.sx, p1.sy);
        ctx.lineTo(p2.sx, p2.sy);
        ctx.stroke();
      }
      if (p3) {
        const alpha2 = Math.min(0.7, (1.0 / p1.depth) * (0.25 + p.air * 0.45));
        ctx.strokeStyle = p.palette.accentRgba(alpha2.toFixed(2));
        ctx.beginPath();
        ctx.moveTo(p1.sx, p1.sy);
        ctx.lineTo(p3.sx, p3.sy);
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

function renderSceneBlackHole(ctx, w, h, simTime, p) {
  // Singularidade Gravitacional, Lente Relativística & Disco de Acreção Doppler
  const cx = w * 0.5;
  const cy = h * (p.isOverlayStar ? 0.42 : 0.5);
  const minDim = Math.min(w, h);
  const kickEnergy = ((p.sub || 0.4) * 0.9 + (p.bass || 0.4) * 0.5);
  const tilt = 0.42;

  // 1. Accretion Disk (Background Half - behind black hole)
  const diskRInner = minDim * 0.16;
  const diskROuter = minDim * 0.44 * (1.0 + kickEnergy * 0.15);

  ctx.save();
  ctx.translate(cx, cy);

  const ringCount = 12;
  for (let r = ringCount; r >= 1; r--) {
    const frac = r / ringCount;
    const radX = diskRInner + (diskROuter - diskRInner) * frac;
    const radY = radX * Math.sin(tilt);

    // Relativistic Doppler beaming: Left side approaching (brighter), Right side receding (dimmer)
    const diskGrad = ctx.createLinearGradient(-radX, 0, radX, 0);
    diskGrad.addColorStop(0, p.palette.primaryRgba(0.85));
    diskGrad.addColorStop(0.35, p.palette.accentRgba(0.6));
    diskGrad.addColorStop(0.75, p.palette.primaryRgba(0.2));
    diskGrad.addColorStop(1, 'rgba(15, 2, 5, 0.05)');

    ctx.strokeStyle = diskGrad;
    ctx.lineWidth = 2.0 + (1.0 - frac) * 3.5 * (1.0 + (p.bass || 0.4) * 0.5);
    ctx.beginPath();
    ctx.ellipse(0, 0, radX, radY, 0, Math.PI, 0, false);
    ctx.stroke();
  }

  // 2. Gravitational Lensing Halo (Relativistic Photon Ring)
  const shadowRadius = minDim * 0.14;
  const photonRadius = shadowRadius * 1.15;

  const lensingGrad = ctx.createRadialGradient(0, 0, shadowRadius * 0.8, 0, 0, photonRadius * 1.6);
  lensingGrad.addColorStop(0, '#000000');
  lensingGrad.addColorStop(0.48, 'rgba(0,0,0,0.95)');
  lensingGrad.addColorStop(0.68, p.palette.nodeHot);
  lensingGrad.addColorStop(0.82, p.palette.primaryRgba(0.75));
  lensingGrad.addColorStop(1, 'rgba(0,0,0,0)');

  ctx.fillStyle = lensingGrad;
  ctx.beginPath();
  ctx.arc(0, 0, photonRadius * 1.6, 0, Math.PI * 2);
  ctx.fill();

  // 3. The Pitch-Black Event Horizon (Singularity Sphere)
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  ctx.arc(0, 0, shadowRadius, 0, Math.PI * 2);
  ctx.fill();

  // Razor-sharp photon ring border
  ctx.strokeStyle = p.palette.primaryRgba(0.95);
  ctx.lineWidth = 1.8 + kickEnergy * 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, photonRadius, 0, Math.PI * 2);
  ctx.stroke();

  // 4. Accretion Disk (Foreground Half - in front of black hole)
  for (let r = 1; r <= ringCount; r++) {
    const frac = r / ringCount;
    const radX = diskRInner + (diskROuter - diskRInner) * frac;
    const radY = radX * Math.sin(tilt);

    const diskGrad = ctx.createLinearGradient(-radX, 0, radX, 0);
    diskGrad.addColorStop(0, p.palette.nodeHot);
    diskGrad.addColorStop(0.25, p.palette.primaryRgba(0.9));
    diskGrad.addColorStop(0.6, p.palette.accentRgba(0.5));
    diskGrad.addColorStop(1, p.palette.primaryRgba(0.15));

    ctx.strokeStyle = diskGrad;
    ctx.lineWidth = 2.0 + (1.0 - frac) * 3.5 * (1.0 + (p.bass || 0.4) * 0.5);
    ctx.beginPath();
    ctx.ellipse(0, 0, radX, radY, 0, 0, Math.PI, false);
    ctx.stroke();
  }

  // 5. Relativistic Infalling Matter Particles
  const partCount = 30;
  for (let i = 0; i < partCount; i++) {
    const angle = (i / partCount) * Math.PI * 2 + simTime * 1.4 * (1.0 + (i % 3) * 0.2);
    const pFrac = ((i * 0.17 + simTime * 0.25) % 1.0);
    const radX = shadowRadius * (1.1 + pFrac * 2.2);
    const radY = radX * Math.sin(tilt) + (i % 2 === 0 ? 1 : -1) * Math.sin(angle * 2) * 10;
    const px = Math.cos(angle) * radX;
    const py = Math.sin(angle) * radY;

    const isApproaching = Math.sin(angle) > 0;
    const alpha = (isApproaching ? 0.9 : 0.3) * (1.0 - pFrac);
    ctx.fillStyle = pFrac < 0.2 ? p.palette.nodeHot : p.palette.accentRgba(alpha.toFixed(2));
    ctx.beginPath();
    ctx.arc(px, py, 1.5 + (1.0 - pFrac) * 2.0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function renderSceneBiomorphicFlora(ctx, w, h, simTime, p) {
  // Flora Neural Biomórfica & Micélio 3D (Continuidade Poética Espinhaço)
  const cx = w * 0.5;
  const cy = h * (p.isOverlayStar ? 0.42 : 0.5);
  const minDim = Math.min(w, h);
  const rotY = p.rotY !== undefined ? p.rotY : (simTime * 0.22);
  const cosY = Math.cos(rotY), sinY = Math.sin(rotY);

  const branches = 10;
  const segments = 14;
  const pulseVocal = ((p.presence || 0.3) * 0.7 + (p.air || 0.3) * 0.5) * (p.cfg3d.audio_reactivity?.spine_swimming || 1.0);

  ctx.save();
  ctx.translate(cx, cy);

  for (let b = 0; b < branches; b++) {
    const baseAngle = (b / branches) * Math.PI * 2;
    let prevX = 0, prevY = 0;

    for (let s = 1; s <= segments; s++) {
      const frac = s / segments;
      const angle = baseAngle + Math.sin(simTime * 0.8 + frac * 3.0) * 0.35 + frac * 0.8;
      const r = minDim * (0.05 + frac * 0.42) * (1.0 + Math.sin(simTime * 1.2 + b) * 0.08);
      const z = Math.sin(frac * Math.PI * 2 + simTime + b) * minDim * 0.18;
      const y = -minDim * 0.35 * Math.cos(frac * Math.PI * 0.5) + Math.sin(angle * 2 + simTime) * 15;

      const curX = Math.cos(angle) * r;
      const curZ = z;
      const curY = y;

      const rx = curX * cosY + curZ * sinY;
      const rz = -curX * sinY + curZ * cosY;
      const depth = p.camDist + rz / minDim;

      if (depth > 0.1) {
        const persp = p.fov / depth;
        const sx = rx * persp;
        const sy = curY * persp;

        if (s > 1) {
          ctx.strokeStyle = (s % 3 === 0) ? p.palette.accentRgba(0.8) : p.palette.primaryRgba((0.2 + frac * 0.6).toFixed(2));
          ctx.lineWidth = Math.max(1.0, (1.0 - frac) * 3.5 * persp);
          ctx.beginPath();
          ctx.moveTo(prevX, prevY);
          ctx.lineTo(sx, sy);
          ctx.stroke();

          if (s % 2 === 0) {
            const nodeGlow = 2.0 + Math.sin(simTime * 3.0 + s + b) * 1.5 * (1.0 + pulseVocal);
            ctx.fillStyle = (s === segments) ? p.palette.nodeHot : p.palette.primaryRgba(0.9);
            ctx.beginPath();
            ctx.arc(sx, sy, Math.max(1.5, nodeGlow * persp), 0, Math.PI * 2);
            ctx.fill();
          }
        }
        prevX = sx;
        prevY = sy;
      }
    }
  }

  const coreR = minDim * 0.04 * (1.0 + (p.sub || 0.4) * 0.6);
  const coreGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, coreR * 2);
  coreGrad.addColorStop(0, p.palette.nodeHot);
  coreGrad.addColorStop(0.5, p.palette.primaryRgba(0.7));
  coreGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = coreGrad;
  ctx.beginPath();
  ctx.arc(0, 0, coreR * 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function renderSceneSolVermelho(ctx, w, h, simTime, p) {
  // Sol Monumental Vermelho, Chiaroscuro & Grade Topográfica 3D em Perspectiva
  const cx = w * 0.5;
  const cy = h * (p.isOverlayStar ? 0.42 : 0.52);
  const minDim = Math.min(w, h);
  const bass = p.bass || 0.4;
  const sub = p.sub || 0.4;

  ctx.save();

  // 1. Sol Monumental no Horizonte
  const sunRadius = minDim * 0.28 * (1.0 + sub * 0.12);
  const sunY = cy - minDim * 0.05;

  const sunGrad = ctx.createRadialGradient(cx, sunY, sunRadius * 0.2, cx, sunY, sunRadius * 1.8);
  sunGrad.addColorStop(0, '#ffffff');
  sunGrad.addColorStop(0.35, '#dc2626');
  sunGrad.addColorStop(0.7, 'rgba(185, 28, 28, 0.4)');
  sunGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sunGrad;
  ctx.beginPath();
  ctx.arc(cx, sunY, sunRadius * 1.8, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#dc2626';
  ctx.beginPath();
  ctx.arc(cx, sunY, sunRadius, 0, Math.PI * 2);
  ctx.fill();

  // Fendas Horizontais Chiaroscuro
  const bandCount = 10;
  for (let i = 0; i < bandCount; i++) {
    const bandY = sunY + sunRadius * (0.15 + (i / bandCount) * 0.85);
    const bandH = 2.0 + i * 1.2;
    ctx.fillStyle = '#050002';
    ctx.fillRect(cx - sunRadius, bandY, sunRadius * 2, bandH);
  }

  // 2. Grade Topográfica 3D em Perspectiva
  const gridRows = 22;
  const gridCols = 32;
  const gridW = w * 1.4;
  const horizY = cy + minDim * 0.02;

  ctx.lineWidth = 1.0;
  for (let c = 0; c <= gridCols; c++) {
    const xFrac = (c / gridCols) - 0.5;
    const topX = cx + xFrac * w * 0.15;
    const botX = cx + xFrac * gridW;

    ctx.strokeStyle = p.palette.primaryRgba(0.25);
    ctx.beginPath();
    ctx.moveTo(topX, horizY);
    ctx.lineTo(botX, h);
    ctx.stroke();
  }

  for (let r = 1; r <= gridRows; r++) {
    const zFrac = r / gridRows;
    const yPersp = horizY + (h - horizY) * Math.pow(zFrac, 2.2);
    const spanW = w * 0.15 + (gridW - w * 0.15) * zFrac;

    const alpha = Math.min(0.9, zFrac * (0.3 + bass * 0.5));
    ctx.strokeStyle = p.palette.primaryRgba(alpha.toFixed(2));
    ctx.beginPath();

    const wavePoints = 28;
    for (let wp = 0; wp <= wavePoints; wp++) {
      const wFrac = wp / wavePoints;
      const wx = (cx - spanW * 0.5) + spanW * wFrac;
      const waveMod = Math.sin(wFrac * Math.PI * 6.0 + simTime * 2.0 + r * 0.4) * (14.0 * zFrac) * (1.0 + sub * 0.8);
      const wy = yPersp + waveMod;

      if (wp === 0) ctx.moveTo(wx, wy);
      else ctx.lineTo(wx, wy);
    }
    ctx.stroke();
  }

  ctx.restore();
}

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
// ROADMAP PRESETS DATABASE (50 CURATED CONTEMPORARY VISUAL ART PRESETS)
// ----------------------------------------------------------------------------
const ROADMAP_PRESETS = {
  pixel_stretch: {
    cinematic_anamorphic: { direction: 0, intensity: 0.85, curve: 'exponential', smoothness: 1.8, threshold: 0.70, length: 320, channels: 'rgba_split', start_offset: 0.0, pixel_size: 2, source: 'luma' },
    data_ghosting: { direction: 90, intensity: 0.40, curve: 'scurve', smoothness: 2.5, threshold: 0.20, length: 180, channels: 'luma_all', start_offset: 0.10, pixel_size: 1, source: 'luma' },
    edge_smear: { direction: 45, intensity: 1.0, curve: 'linear', smoothness: 1.0, threshold: 0.35, length: 260, channels: 'rgba_split', start_offset: 0.65, pixel_size: 3, source: 'chroma' },
    cyberpunk_rain: { direction: 90, intensity: 0.75, curve: 'exponential', smoothness: 1.2, threshold: 0.45, length: 380, channels: 'blue_only', start_offset: 0.0, pixel_size: 2, source: 'luma' },
    hyperdrive_tunnel: { direction: 180, intensity: 0.90, curve: 'logarithmic', smoothness: 0.8, threshold: 0.30, length: 420, channels: 'rgba_split', start_offset: 0.05, pixel_size: 4, source: 'luma' },
    needle_threads: { direction: 0, intensity: 0.95, curve: 'linear', smoothness: 0.1, threshold: 0.80, length: 500, channels: 'luma_all', start_offset: 0.0, pixel_size: 1, source: 'luma' },
    subtle_mist: { direction: 0, intensity: 0.35, curve: 'scurve', smoothness: 2.8, threshold: 0.15, length: 140, channels: 'luma_all', start_offset: 0.20, pixel_size: 1, source: 'luma' },
    vertical_spire: { direction: 270, intensity: 0.80, curve: 'exponential', smoothness: 1.5, threshold: 0.50, length: 440, channels: 'rgba_split', start_offset: 0.0, pixel_size: 2, source: 'luma' },
    chroma_echo: { direction: 135, intensity: 0.65, curve: 'exponential', smoothness: 2.0, threshold: 0.30, length: 220, channels: 'rgba_split', start_offset: 0.15, pixel_size: 3, source: 'chroma' },
    solar_flare: { direction: 0, intensity: 0.90, curve: 'logarithmic', smoothness: 1.2, threshold: 0.75, length: 480, channels: 'rgba_split', start_offset: 0.0, pixel_size: 2, source: 'luma' }
  },
  pixel_sorter: {
    glitch_waterfall: { angle: 90, sorting_mode: 'luminance', threshold_min: 0.30, threshold_max: 0.80, random_noise: 0.05, length: 220, stretch_mode: false, mask: 'full', noise_scale: 18 },
    pastel_oil: { angle: 0, sorting_mode: 'saturation', threshold_min: 0.10, threshold_max: 0.90, random_noise: 0.15, length: 45, stretch_mode: true, mask: 'full', noise_scale: 10 },
    corrupted_signal: { angle: 180, sorting_mode: 'hue', threshold_min: 0.50, threshold_max: 0.60, random_noise: 0.40, length: 260, stretch_mode: false, mask: 'full', noise_scale: 25 },
    center_melt: { angle: 90, sorting_mode: 'luminance', threshold_min: 0.35, threshold_max: 0.85, random_noise: 0.20, length: 240, stretch_mode: true, mask: 'center', noise_scale: 18 },
    neon_threading: { angle: 270, sorting_mode: 'luminance', threshold_min: 0.85, threshold_max: 1.0, random_noise: 0.10, length: 300, stretch_mode: false, mask: 'full', noise_scale: 12 },
    diagonal_drift: { angle: 45, sorting_mode: 'red', threshold_min: 0.20, threshold_max: 0.70, random_noise: 0.20, length: 180, stretch_mode: true, mask: 'full', noise_scale: 20 },
    penumbra_shadows: { angle: 90, sorting_mode: 'luminance', threshold_min: 0.05, threshold_max: 0.35, random_noise: 0.08, length: 150, stretch_mode: false, mask: 'full', noise_scale: 15 },
    zen_minimal: { angle: 0, sorting_mode: 'luminance', threshold_min: 0.40, threshold_max: 0.70, random_noise: 0.02, length: 30, stretch_mode: true, mask: 'full', noise_scale: 8 },
    raster_scan: { angle: 180, sorting_mode: 'blue', threshold_min: 0.25, threshold_max: 0.65, random_noise: 0.12, length: 190, stretch_mode: false, mask: 'edges', noise_scale: 16 },
    torrent_climax: { angle: 90, sorting_mode: 'luminance', threshold_min: 0.20, threshold_max: 0.95, random_noise: 0.35, length: 380, stretch_mode: true, mask: 'full', noise_scale: 28 }
  },
  bad_tv: {
    subdued_vhs: { tv_rgb_split: 3, tv_scanlines_opacity: 0.20, tv_scanlines_density: 300, tv_warp_wiggle: 0.08, tv_curvature: 0.04, tv_warp_sync_v: 0.0, tv_warp_sync_h: 0, tv_tape_noise: 0.15 },
    deep_space: { tv_rgb_split: 20, tv_scanlines_opacity: 0.65, tv_scanlines_density: 240, tv_warp_wiggle: 0.40, tv_curvature: 0.28, tv_warp_sync_v: 0.18, tv_warp_sync_h: 5, tv_tape_noise: 0.50 },
    arcade_crt: { tv_rgb_split: 9, tv_scanlines_opacity: 0.75, tv_scanlines_density: 420, tv_warp_wiggle: 0.05, tv_curvature: 0.22, tv_warp_sync_v: 0.0, tv_warp_sync_h: 0, tv_tape_noise: 0.10 },
    analog_aberration: { tv_rgb_split: 24, tv_scanlines_opacity: 0.10, tv_scanlines_density: 200, tv_warp_wiggle: 0.02, tv_curvature: 0.0, tv_warp_sync_v: 0.0, tv_warp_sync_h: 0, tv_tape_noise: 0.05 },
    security_cam: { tv_rgb_split: 5, tv_scanlines_opacity: 0.55, tv_scanlines_density: 180, tv_warp_wiggle: 0.15, tv_curvature: 0.10, tv_warp_sync_v: 0.12, tv_warp_sync_h: -4, tv_tape_noise: 0.65 },
    broken_vcr: { tv_rgb_split: 28, tv_scanlines_opacity: 0.80, tv_scanlines_density: 320, tv_warp_wiggle: 0.85, tv_curvature: 0.15, tv_warp_sync_v: 0.35, tv_warp_sync_h: 18, tv_tape_noise: 0.75 },
    oscilloscope_tube: { tv_rgb_split: 6, tv_scanlines_opacity: 0.45, tv_scanlines_density: 380, tv_warp_wiggle: 0.04, tv_curvature: 0.30, tv_warp_sync_v: 0.0, tv_warp_sync_h: 0, tv_tape_noise: 0.08 },
    magnetic_drift: { tv_rgb_split: 14, tv_scanlines_opacity: 0.30, tv_scanlines_density: 260, tv_warp_wiggle: 0.25, tv_curvature: 0.08, tv_warp_sync_v: 0.08, tv_warp_sync_h: 7, tv_tape_noise: 0.30 },
    subliminal_flicker: { tv_rgb_split: 12, tv_scanlines_opacity: 0.50, tv_scanlines_density: 340, tv_warp_wiggle: 0.50, tv_curvature: 0.05, tv_warp_sync_v: 0.22, tv_warp_sync_h: -8, tv_tape_noise: 0.40 },
    ghost_signal: { tv_rgb_split: 18, tv_scanlines_opacity: 0.25, tv_scanlines_density: 280, tv_warp_wiggle: 0.12, tv_curvature: 0.06, tv_warp_sync_v: 0.04, tv_warp_sync_h: 2, tv_tape_noise: 0.20 }
  },
  rxxr: {
    terminal_ascii: { style: 'terminal_amber', density: 10, edge_mode: false, edge_threshold: 0.35, expand_markers: 0.10, tint: '#ffb800' },
    cyberpunk_tracer: { style: 'matrix_code', density: 8, edge_mode: true, edge_threshold: 0.45, expand_markers: 0.30, tint: '#00ff88' },
    hex_stream: { style: 'binary_hex', density: 12, edge_mode: false, edge_threshold: 0.30, expand_markers: 0.20, tint: '#00f0ff' },
    glitch_shading: { style: 'glitch_blocks', density: 14, edge_mode: false, edge_threshold: 0.30, expand_markers: 0.60, tint: '#ffffff' },
    wireframe_grid: { style: 'wireframe_grid', density: 16, edge_mode: true, edge_threshold: 0.50, expand_markers: 0.20, tint: '#c084fc' },
    ghost_operator: { style: 'matrix_code', density: 6, edge_mode: true, edge_threshold: 0.40, expand_markers: 0.40, tint: '#38bdf8' },
    ikeda_binary: { style: 'binary_hex', density: 18, edge_mode: false, edge_threshold: 0.50, expand_markers: 0.05, tint: '#ffffff' },
    runic_sigils: { style: 'terminal_amber', density: 12, edge_mode: true, edge_threshold: 0.30, expand_markers: 0.45, tint: '#f43f5e' },
    vector_crosshairs: { style: 'wireframe_grid', density: 8, edge_mode: true, edge_threshold: 0.55, expand_markers: 0.35, tint: '#22d3ee' },
    sub_density: { style: 'matrix_code', density: 4, edge_mode: false, edge_threshold: 0.25, expand_markers: 0.15, tint: '#a78bfa' }
  },
  modulation: {
    joy_division: { color_mode: 'joy_division', lines_count: 70, amplitude: 38, frequency: 55, lowpass: 0.30, line_thickness: 1.4 },
    offset_cmyk: { color_mode: 'cmyk_misreg', lines_count: 80, cmyk_offset: 10, amplitude: 22, frequency: 45, lowpass: 0.35, line_thickness: 1.2 },
    liquid_metal: { color_mode: 'cyan_spectrum', lines_count: 36, amplitude: 48, frequency: 22, lowpass: 0.60, line_thickness: 2.2 },
    laser_topo: { color_mode: 'laser_topo', lines_count: 96, amplitude: 26, frequency: 80, lowpass: 0.20, line_thickness: 1.0 },
    concentric_holo: { color_mode: 'cmyk_misreg', lines_count: 52, cmyk_offset: 16, amplitude: 38, frequency: 65, lowpass: 0.40, line_thickness: 1.6 },
    binary_shift: { color_mode: 'amber_matrix', lines_count: 110, amplitude: 18, frequency: 120, lowpass: 0.10, line_thickness: 0.9 },
    nonotak_lattices: { color_mode: 'joy_division', lines_count: 85, amplitude: 15, frequency: 95, lowpass: 0.15, line_thickness: 0.8 },
    micro_topography: { color_mode: 'laser_topo', lines_count: 120, amplitude: 12, frequency: 130, lowpass: 0.12, line_thickness: 0.7 },
    seismic_pulse: { color_mode: 'cyan_spectrum', lines_count: 44, amplitude: 55, frequency: 30, lowpass: 0.50, line_thickness: 1.8 },
    aurora_dispersion: { color_mode: 'cmyk_misreg', lines_count: 60, cmyk_offset: 20, amplitude: 42, frequency: 40, lowpass: 0.45, line_thickness: 1.5 }
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

function selectFxPlugin(pluginId, isUserAction = false) {
  if (!appState.fx) return;
  appState.fx.activeEffect = pluginId;

  if (isUserAction) {
    appState.fx.manual_locked = true;
    appState.fx.active = true;
    const pluginNames = {
      pixel_stretch: 'Pixel Stretch',
      pixel_sorter: 'Pixel Sorter',
      bad_tv: 'Bad TV',
      rxxr: 'RXXR Techno-ASCII',
      modulation: 'Modulation Matrix'
    };
    showMacroToast('🔒 EFEITO FIXADO: ' + (pluginNames[pluginId] || pluginId.toUpperCase()) + ' (Autopilot não altera)');
    updateFxUI();
  }

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
  appState.fx.manual_locked = true;
  updateFxUI();
  const chk = document.getElementById('chk-enable-' + pluginId);
  if (chk) chk.checked = enabled;
}
window.toggleFxModuleEnabled = toggleFxModuleEnabled;

function toggleFxMaster(forceVal = null) {
  if (!appState.fx) return;
  const isNowActive = forceVal !== null ? Boolean(forceVal) : !appState.fx.active;
  appState.fx.active = isNowActive;
  appState.fx.manual_locked = true; // Manual choice overrides Autopilot
  updateFxUI();

  if (typeof UserProfileManager !== 'undefined') {
    UserProfileManager.setSetting('fx_active', isNowActive);
    UserProfileManager.setSetting('fx_manual_locked', true);
  }

  if (isNowActive) {
    const plg = appState.fx.activeEffect || 'pixel_stretch';
    showMacroToast('✨ FX MASTER ATIVADO (' + plg.toUpperCase() + ') · 🔒 FIXADO EM MANUAL');
  } else {
    showMacroToast('🚫 FX MASTER BYPASS (100% VÍDEO LIMPO)');
  }
}
window.toggleFxMaster = toggleFxMaster;

function toggleFxManualLock(forceVal = null) {
  if (!appState.fx) return;
  const targetVal = forceVal !== null ? Boolean(forceVal) : !appState.fx.manual_locked;
  appState.fx.manual_locked = targetVal;
  updateFxUI();

  if (typeof UserProfileManager !== 'undefined') {
    UserProfileManager.setSetting('fx_manual_locked', targetVal);
  }

  if (targetVal) {
    showMacroToast('🔒 FX TRAVADO EM MODO MANUAL (O Autopilot não irá alterar seu efeito)');
  } else {
    showMacroToast('⚡ FX EM MODO DINÂMICO (Seguindo Autopilot se ativado)');
  }
}
window.toggleFxManualLock = toggleFxManualLock;

function toggleFxAutopilot(forceState = null) {
  if (!appState.fx) return;
  
  const isNowOn = forceState !== null ? Boolean(forceState) : !appState.fx.autopilotActive;
  appState.fx.autopilotActive = isNowOn;
  if (!appState.autopilot_delegation) appState.autopilot_delegation = {};
  appState.autopilot_delegation.fx = isNowOn;

  if (isNowOn) {
    appState.fx.manual_locked = false; // releases lock so autopilot has control
    showMacroToast('🤖 AUTOPILOT FX ATIVADO (Sincronizado com Builds e Drops)');
  } else {
    showMacroToast('🔒 AUTOPILOT FX DESATIVADO (Modo Manual 100% no seu controle)');
  }

  if (typeof UserProfileManager !== 'undefined') {
    UserProfileManager.setSetting('autopilot_delegation_fx', isNowOn);
    UserProfileManager.setSetting('fx_manual_locked', appState.fx.manual_locked);
  }

  updateFxUI();
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

function loadPluginPreset(pluginId, presetName, isUserAction = true) {
  if (!appState.fx || !ROADMAP_PRESETS[pluginId] || !ROADMAP_PRESETS[pluginId][presetName]) return;
  const presetData = ROADMAP_PRESETS[pluginId][presetName];

  Object.assign(appState.fx[pluginId], presetData);

  if (isUserAction) {
    appState.fx.manual_locked = true;
    appState.fx.active = true;
    updateFxUI();
    showMacroToast('🔒 PRESET FIXADO: ' + presetName.toUpperCase().replace(/_/g, ' ') + ' (Autopilot não altera)');
  }

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

function setFxMasterParam(param, val, isUserAction = true) {
  if (!appState.fx) return;
  appState.fx[param] = val;
  if (isUserAction && param === 'masterIntensity') {
    appState.fx.manual_locked = true;
    updateFxUI();
  }
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

  // Master & Autopilot buttons (Tab 6 Toolbar)
  const btnM = document.getElementById('btn-toggle-fx');
  const lblM = document.getElementById('lbl-fx-master-status');
  if (btnM) btnM.classList.toggle('active', fx.active);
  if (lblM) lblM.textContent = fx.active ? 'ON' : 'OFF';

  // Header quick toggle button (Always accessible)
  const btnHdr = document.getElementById('btn-header-toggle-fx');
  const txtHdr = document.getElementById('txt-header-fx');
  if (btnHdr) {
    btnHdr.classList.toggle('active', fx.active);
    btnHdr.classList.toggle('is-locked', Boolean(fx.manual_locked && fx.active));
  }
  if (txtHdr) {
    const lockIcon = (fx.manual_locked && fx.active) ? '🔒 ' : '';
    txtHdr.textContent = fx.active ? `${lockIcon}FX: ON` : 'FX: BYPASS';
  }

  // FX Lock button in toolbar
  const btnLock = document.getElementById('btn-toggle-fx-lock');
  const lblLock = document.getElementById('lbl-fx-lock-status');
  const iconLock = document.getElementById('icon-fx-lock');
  const isLocked = Boolean(fx.manual_locked);
  if (btnLock) {
    btnLock.classList.toggle('active', isLocked);
    btnLock.title = isLocked
      ? 'Efeito travado manualmente: o Autopilot NÃO irá alterar este efeito. Clique para liberar.'
      : 'Efeito dinâmico: segue o Autopilot se ativado. Clique para travar manualmente.';
  }
  if (lblLock) lblLock.textContent = isLocked ? 'MANUAL FIXADO' : 'SEGUIR AUTO';
  if (iconLock) iconLock.textContent = isLocked ? '🔒' : '⚡';

  // Autopilot button in toolbar
  const btnAuto = document.getElementById('btn-toggle-fx-autopilot');
  const lblAuto = document.getElementById('lbl-fx-autopilot-status');
  if (btnAuto) btnAuto.classList.toggle('active', fx.autopilotActive);
  if (lblAuto) lblAuto.textContent = fx.autopilotActive ? 'ON' : 'OFF';

  // Tab 5 delegation checkbox
  const chkDel = document.getElementById('chk-delegate-fx');
  if (chkDel) chkDel.checked = Boolean(appState.autopilot_delegation?.fx);

  // Target Routing Select
  const selTarget = document.getElementById('sel-fx-target');
  if (selTarget) selTarget.value = fx.target || 'master';

  // Master Sliders
  const sliInt = document.getElementById('slider-fx-intensity');
  const valInt = document.getElementById('val-fx-intensity');
  if (sliInt) sliInt.value = Math.round((fx.masterIntensity !== undefined ? fx.masterIntensity : 0.8) * 100);
  if (valInt) valInt.textContent = Math.round((fx.masterIntensity !== undefined ? fx.masterIntensity : 0.8) * 100) + '%';

  const sliSpd = document.getElementById('slider-fx-speed');
  const valSpd = document.getElementById('val-fx-speed');
  if (sliSpd) sliSpd.value = Math.round((fx.masterSpeed || 1.0) * 100);
  if (valSpd) valSpd.textContent = Number(fx.masterSpeed || 1.0).toFixed(1) + 'x';

  // Autopilot Presets Pills
  document.querySelectorAll('.fx-auto-pill').forEach(pill => {
    pill.classList.toggle('active', pill.dataset.preset === fx.autopilotPreset);
  });

  // Active effect selection (internal sync without manual lock trigger)
  selectFxPlugin(fx.activeEffect || 'pixel_stretch', false);
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
  if (!appState.fx || !appState.fx.autopilotActive || appState.fx.manual_locked) return;

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
let lastAutopilotTakeTimestamp = 0;

function runAutopilotEngine() {
  // Musical Autopilot for FX Engine
  runFxAutopilotEngine();

  if (!appState.auto_mode) return;

  const p = appState.phrase;
  if (!p) return;
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
    const nowMs = performance.now();
    const bpmVal = Number(appState.bpm) || 124.0;
    // Strict musical cooldown in milliseconds (at least 70% of phrase length)
    const minTakeCooldownMs = Math.max(6000, (minBarsInterval * (240.0 / bpmVal) * 1000.0 * 0.70));
    const timeSinceLastTake = nowMs - lastAutopilotTakeTimestamp;
    
    // Auto Cycle on Downbeat (Frase completa)
    if (currentBar === 1 && currentBeat === 1 && totalBars > 1) {
      if (barsSinceLastTake >= minBarsInterval && timeSinceLastTake >= minTakeCooldownMs && lastAutopilotBar !== totalBars && !isAutoTransitioning) {
        lastAutopilotBar = totalBars;
        appState.last_take_total_bar = totalBars;
        lastAutopilotTakeTimestamp = nowMs;
        
        // Evolve matte policy if enabled
        if (del.mattes && appState.autopilot_matte_policy === 'evolve') {
          evolveMatteHarmoniously();
        }
        startAutoTransition();
      }
    }

    // Auto Drop Take (Hard Cut on Climax) - Strict guard to never cut if a take just occurred
    if (isEnteringDrop && currentBeat === 1 && !lastDropTriggered && !isAutoTransitioning) {
      if (barsSinceLastTake >= Math.max(8, Math.floor(minBarsInterval / 2)) && timeSinceLastTake >= minTakeCooldownMs) {
        lastDropTriggered = true;
        lastAutopilotBar = totalBars;
        appState.last_take_total_bar = totalBars;
        lastAutopilotTakeTimestamp = nowMs;
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

  // 3. FX OVERDRIVE DELEGATION (Respeita trava manual do operador)
  if (del.fx && !appState.fx?.manual_locked) {
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
    if (stateChanged && appState.matte && appState.matte.deform && appState.kinematics_auto !== false) {
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
  const num = Math.max(4, Number(bars));
  appState.autopilot_bars = num;
  appState.autopilot_min_bars = num;
  setPhraseLength(num);
  document.querySelectorAll('#group-conductor-bars .conductor-btn, #group-cfg-min-bars .conductor-btn, .cfg-bars-btn').forEach(btn => {
    btn.classList.toggle('active', Number(btn.dataset.bars) === num);
  });
  document.querySelectorAll('.tl-dur-pill').forEach(btn => {
    btn.classList.toggle('active', Number(btn.dataset.bars) === num);
  });
  const lblCfg = document.getElementById('lbl-cfg-min-bars');
  if (lblCfg) lblCfg.textContent = `${num} BARS (${num === 16 ? 'PADRÃO' : '~' + Math.round(num * 1.93) + 's'})`;
  const selBars = document.getElementById('sel-bars-transition');
  if (selBars) selBars.value = String(num);

  // Dynamically update future queue slots based on take bars
  if (queueList && queueList.length > 0) {
    if (queueList[1]) { queueList[1].slot = `+${num} BARS`; queueList[1].status = `EM ${num * 4} BEATS`; }
    if (queueList[2]) { queueList[2].slot = `+${num * 2} BARS`; queueList[2].status = `EM ${num * 8} BEATS`; }
    if (queueList[3]) { queueList[3].slot = `+${num * 3} BARS`; queueList[3].status = `EM ${num * 12} BEATS`; }
  }

  // Trigger Pro Timeline re-render immediately
  if (typeof renderProTimeline === 'function') {
    renderProTimeline();
  }
}
window.setAutopilotBars = setAutopilotBars;

function setTimelineTakeBars(bars) {
  setAutopilotBars(bars);
}
window.setTimelineTakeBars = setTimelineTakeBars;

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

// ============================================================================
// AUTOPILOT POOL ARCHITECTURE (Granular Folders & Takes Gating Engine)
// Industry benchmark: Resolume Arena 7, Ableton Live 12 follow actions, disguise
// ============================================================================
// AUTOPILOT POOL ARCHITECTURE (Granular Folders & Takes Gating Engine)
// Industry benchmark: Resolume Arena 7, Ableton Live 12 follow actions, disguise
// ============================================================================
if (!appState.autopilot_pool) {
  let storedAp = null;
  try {
    const raw = localStorage.getItem('penumbra_autopilot_pool');
    if (raw) storedAp = JSON.parse(raw);
  } catch (e) {}

  let initExcludedFolders = [];
  if (storedAp && Array.isArray(storedAp.excluded_folders)) {
    initExcludedFolders = storedAp.excluded_folders;
  }
  let initExcludedClips = [];
  if (storedAp && Array.isArray(storedAp.excluded_clips)) {
    initExcludedClips = storedAp.excluded_clips;
  }

  appState.autopilot_pool = {
    excluded_folders: initExcludedFolders,
    excluded_clips: initExcludedClips,
    active_folders: (storedAp && Array.isArray(storedAp.active_folders)) ? storedAp.active_folders : [],
    view_filter: (storedAp && storedAp.view_filter) || 'ALL',
    toolbar_expanded: false
  };
}

function getAllAvailableFolders() {
  const set = new Set();
  (allClips || []).forEach(c => set.add(getClipFolder(c)));
  return Array.from(set).sort();
}
window.getAllAvailableFolders = getAllAvailableFolders;

function saveAutopilotPoolState() {
  try {
    localStorage.setItem('penumbra_autopilot_pool', JSON.stringify({
      excluded_folders: appState.autopilot_pool.excluded_folders || [],
      excluded_clips: appState.autopilot_pool.excluded_clips || [],
      active_folders: appState.autopilot_pool.active_folders || [],
      view_filter: appState.autopilot_pool.view_filter || 'ALL'
    }));
    if (typeof UserProfileManager !== 'undefined' && UserProfileManager.profile) {
      UserProfileManager.profile.autopilot_pool = appState.autopilot_pool;
      UserProfileManager.saveDebounced();
    }
  } catch (e) {}
}

function isClipEligibleForAutopilot(clip) {
  if (!clip || !clip.id) return false;
  const pool = appState.autopilot_pool || { excluded_folders: [], excluded_clips: [] };
  const folder = getClipFolder(clip);

  // 1. Folder-level exclusion check
  if (Array.isArray(pool.excluded_folders) && pool.excluded_folders.includes(folder)) {
    return false;
  }

  // 2. Backward compatibility with active_folders if present and excluded_folders is empty
  if (Array.isArray(pool.active_folders) && pool.active_folders.length > 0 && (!pool.excluded_folders || pool.excluded_folders.length === 0)) {
    if (!pool.active_folders.includes(folder)) {
      return false;
    }
  }

  // 3. Excluded individual clip takes check
  if (Array.isArray(pool.excluded_clips) && pool.excluded_clips.includes(clip.id)) {
    return false;
  }

  return true;
}
window.isClipEligibleForAutopilot = isClipEligibleForAutopilot;

function toggleClipAutopilot(clipId, event) {
  if (event) event.stopPropagation();
  if (!clipId) return;
  const pool = appState.autopilot_pool;
  if (!Array.isArray(pool.excluded_clips)) pool.excluded_clips = [];
  const isExcluded = pool.excluded_clips.includes(clipId);
  if (isExcluded) {
    pool.excluded_clips = pool.excluded_clips.filter(id => id !== clipId);
  } else {
    pool.excluded_clips.push(clipId);
  }
  saveAutopilotPoolState();
  updateAutopilotPoolUI();

  // Re-render the specific card or all cards
  const card = document.querySelector(`.media-card[data-clip-id="${clipId}"]`);
  const clip = (allClips || []).find(c => c.id === clipId);
  if (card && clip) {
    const isNowAuto = isClipEligibleForAutopilot(clip);
    const apBtn = card.querySelector('.btn-action-ap');
    if (apBtn) {
      apBtn.className = `btn-card-action btn-action-ap ${isNowAuto ? 'is-auto-active' : 'is-auto-excluded'}`;
      apBtn.innerHTML = isNowAuto 
        ? `<svg width="7" height="7" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"></path></svg> <span>NO AUTO</span>`
        : `<svg width="7" height="7" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg> <span>MANUAL</span>`;
      apBtn.title = isNowAuto ? 'Take ATIVO no Autopilot · Clique para travar em apenas MANUAL seu' : 'Take TRAVADO em manual (só você dispara) · Clique para incluir no Autopilot';
    }
    const thumbContainer = card.querySelector('.media-card-thumb');
    if (thumbContainer) {
      const existingManual = thumbContainer.querySelector('.thumb-manual-indicator');
      const existingAuto = thumbContainer.querySelector('.thumb-auto-indicator');
      if (existingManual) existingManual.remove();
      if (existingAuto) existingAuto.remove();
      const badge = document.createElement('span');
      badge.className = isNowAuto ? 'thumb-auto-indicator' : 'thumb-manual-indicator';
      badge.textContent = isNowAuto ? '⚡ AUTO' : '🔒 MANUAL';
      badge.title = isNowAuto ? 'Take ATIVO no Autopilot · Clique para travar em MANUAL' : 'Take TRAVADO em manual · Clique para incluir no Autopilot';
      badge.onclick = (e) => toggleClipAutopilot(clipId, e);
      thumbContainer.appendChild(badge);
    }
    card.classList.toggle('is-autopilot-excluded', !isNowAuto);
  } else {
    if (typeof renderMediaCards === 'function') renderMediaCards();
  }

  const clipObj = (allClips || []).find(c => c.id === clipId);
  const title = clipObj ? (clipObj.display_title || clipObj.filename) : clipId;
  const statusMsg = isExcluded ? `⚡ Take incluído no Autopilot: "${title}"` : `🔒 Take travado para disparo manual: "${title}"`;
  showMacroToast(statusMsg);
}
window.toggleClipAutopilot = toggleClipAutopilot;

function toggleAutopilotFolder(folderName, isChecked) {
  const pool = appState.autopilot_pool;
  if (!Array.isArray(pool.excluded_folders)) pool.excluded_folders = [];

  if (isChecked) {
    // Include folder in Autopilot -> remove from excluded_folders
    pool.excluded_folders = pool.excluded_folders.filter(f => f !== folderName);
  } else {
    // Exclude folder from Autopilot -> add to excluded_folders
    if (!pool.excluded_folders.includes(folderName)) {
      pool.excluded_folders.push(folderName);
    }
  }

  // Update active_folders for backward compatibility
  const allFolderNames = getAllAvailableFolders();
  pool.active_folders = allFolderNames.filter(f => !pool.excluded_folders.includes(f));

  saveAutopilotPoolState();
  updateAutopilotPoolUI();
  if (typeof renderMediaCards === 'function') renderMediaCards();
  if (typeof renderLibraryBreadcrumbs === 'function') renderLibraryBreadcrumbs();

  showMacroToast(isChecked ? `📁 Pasta "${folderName}" incluída no Autopilot` : `📁 Pasta "${folderName}" excluída do Autopilot (só manual)`);
}
window.toggleAutopilotFolder = toggleAutopilotFolder;

function setAllFoldersAutopilot(enableAll) {
  const pool = appState.autopilot_pool;
  const allFolderNames = getAllAvailableFolders();
  if (enableAll) {
    pool.excluded_folders = [];
    pool.active_folders = [...allFolderNames];
    showMacroToast('✓ Todas as pastas incluídas no Autopilot');
  } else {
    pool.excluded_folders = [...allFolderNames];
    pool.active_folders = [];
    showMacroToast('✕ Todas as pastas excluídas do Autopilot');
  }
  saveAutopilotPoolState();
  updateAutopilotPoolUI();
  if (typeof renderMediaCards === 'function') renderMediaCards();
  if (typeof renderLibraryBreadcrumbs === 'function') renderLibraryBreadcrumbs();
}
window.setAllFoldersAutopilot = setAllFoldersAutopilot;

function renderAutopilotFoldersSettings() {
  const apFoldersList = document.getElementById('autopilot-folders-list');
  if (!apFoldersList || !allClips || allClips.length === 0) return;

  const pool = appState.autopilot_pool;
  if (!Array.isArray(pool.excluded_folders)) pool.excluded_folders = [];
  const folderCounts = {};
  allClips.forEach(c => {
    const f = getClipFolder(c);
    folderCounts[f] = (folderCounts[f] || 0) + 1;
  });
  const folders = Object.keys(folderCounts).sort();
  const activeCount = folders.filter(f => !pool.excluded_folders.includes(f)).length;

  apFoldersList.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; padding-bottom:6px; border-bottom:1px solid rgba(255,255,255,0.08); width:100%;">
      <span style="font-size:10px; color:#00f0ff; font-family:var(--font-mono); font-weight:700;">
        ${activeCount} de ${folders.length} PASTAS NO AUTOPILOT
      </span>
      <div style="display:flex; gap:4px;">
        <button type="button" class="btn-xs-clean" onclick="setAllFoldersAutopilot(true)" style="background:rgba(0,240,255,0.12); border:1px solid rgba(0,240,255,0.3); color:#00f0ff; font-size:9px; padding:2px 8px; border-radius:3px; cursor:pointer; font-weight:600;">✓ MARCAR TODAS</button>
        <button type="button" class="btn-xs-clean" onclick="setAllFoldersAutopilot(false)" style="background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.15); color:#94a3b8; font-size:9px; padding:2px 8px; border-radius:3px; cursor:pointer;">✕ DESMARCAR TODAS</button>
      </div>
    </div>
    <div style="display:flex; flex-direction:column; gap:3px; width:100%;">
      ${folders.map(f => {
        const isFolderActive = !pool.excluded_folders.includes(f);
        return `
          <label class="cfg-check-item" style="display:flex; align-items:center; justify-content:space-between; padding:5px 8px; border-radius:4px; background:${isFolderActive ? 'rgba(0,240,255,0.05)' : 'rgba(255,255,255,0.02)'}; border:1px solid ${isFolderActive ? 'rgba(0,240,255,0.2)' : 'rgba(255,255,255,0.05)'}; cursor:pointer; transition:all 0.15s ease;">
            <div style="display:flex; align-items:center; gap:8px;">
              <input type="checkbox" class="ap-folder-chk" data-folder="${f}" onchange="toggleAutopilotFolder('${f}', this.checked)" ${isFolderActive ? 'checked' : ''} style="cursor:pointer; accent-color:#00f0ff;">
              <span style="color:${isFolderActive ? '#f8fafc' : '#64748b'}; font-size:11px; font-weight:${isFolderActive ? '600' : '400'};">${f}</span>
            </div>
            <span style="font-size:10px; color:${isFolderActive ? '#00f0ff' : '#475569'}; font-family:var(--font-mono);">${folderCounts[f]} takes</span>
          </label>
        `;
      }).join('')}
    </div>
  `;
}
window.renderAutopilotFoldersSettings = renderAutopilotFoldersSettings;

function setAllClipsAutopilot(mode) {
  const pool = appState.autopilot_pool;
  if (!Array.isArray(pool.excluded_clips)) pool.excluded_clips = [];
  if (!Array.isArray(pool.excluded_folders)) pool.excluded_folders = [];

  if (mode === 'all') {
    pool.excluded_clips = [];
    pool.excluded_folders = [];
    pool.active_folders = getAllAvailableFolders();
    showMacroToast('✓ Todos os takes e pastas incluídos no Autopilot');
  } else if (mode === 'none') {
    pool.excluded_clips = (allClips || []).map(c => c.id);
    showMacroToast('🔒 Todos os takes travados em manual (Autopilot zerado)');
  } else if (mode === 'invert') {
    const allIds = (allClips || []).map(c => c.id);
    const newExcluded = allIds.filter(id => !pool.excluded_clips.includes(id));
    pool.excluded_clips = newExcluded;
    showMacroToast('🔄 Seleção do Autopilot invertida');
  } else if (mode === 'current_folder') {
    if (activeFolderFilter && activeFolderFilter !== 'ALL') {
      const allFolderNames = getAllAvailableFolders();
      pool.excluded_folders = allFolderNames.filter(f => f !== activeFolderFilter);
      pool.active_folders = [activeFolderFilter];
      const folderClips = (allClips || []).filter(c => getClipFolder(c) === activeFolderFilter).map(c => c.id);
      pool.excluded_clips = pool.excluded_clips.filter(id => !folderClips.includes(id));
      showMacroToast(`📁 Apenas a pasta "${activeFolderFilter}" ativa no Autopilot`);
    }
  }
  saveAutopilotPoolState();
  updateAutopilotPoolUI();
  if (typeof renderMediaCards === 'function') renderMediaCards();
  if (typeof renderLibraryBreadcrumbs === 'function') renderLibraryBreadcrumbs();
}
window.setAllClipsAutopilot = setAllClipsAutopilot;

function setAutopilotPoolViewFilter(mode) {
  appState.autopilot_pool.view_filter = mode;
  document.querySelectorAll('.ap-pool-filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === mode);
  });
  if (typeof renderMediaCards === 'function') renderMediaCards();
}
window.setAutopilotPoolViewFilter = setAutopilotPoolViewFilter;

function toggleAutopilotToolbarDrawer() {
  appState.autopilot_pool.toolbar_expanded = !appState.autopilot_pool.toolbar_expanded;
  renderLibraryBreadcrumbs();
}
window.toggleAutopilotToolbarDrawer = toggleAutopilotToolbarDrawer;

function updateAutopilotPoolUI() {
  const pool = appState.autopilot_pool || { excluded_folders: [], excluded_clips: [] };
  const total = (allClips || []).length;
  let eligibleCount = 0;
  (allClips || []).forEach(c => {
    if (isClipEligibleForAutopilot(c)) eligibleCount++;
  });

  const countEl = document.getElementById('ap-pool-count');
  const totalEl = document.getElementById('ap-total-count');
  const badgeApCount = document.getElementById('badge-autopilot-pool-summary');
  const apCardCount = document.getElementById('conductor-pool-summary-text');
  if (countEl) countEl.textContent = eligibleCount;
  if (totalEl) totalEl.textContent = total;
  if (badgeApCount) badgeApCount.textContent = `${eligibleCount}/${total} TAKES NO AUTOPILOT`;
  if (apCardCount) {
    const excludedFCount = (pool.excluded_folders || []).length;
    apCardCount.textContent = `${eligibleCount} de ${total} takes elegíveis (${excludedFCount ? excludedFCount + ' pastas excluídas' : 'todas as pastas'})`;
  }

  // Update folder checkboxes in Settings
  renderAutopilotFoldersSettings();
}
window.updateAutopilotPoolUI = updateAutopilotPoolUI;


function advanceSmartQueue(targetState = null) {
  if (!allClips || allClips.length === 0) return;

  const stateToUse = targetState || appState.macro_state || 'GROOVE';
  // Filter clips strictly according to Autopilot Pool (Folders & Takes)
  const eligibleClips = allClips.filter(c => isClipEligibleForAutopilot(c));
  const poolToUse = eligibleClips.length > 0 ? eligibleClips : allClips;

  // Select next clip considering musical state and strict anti-repetition FIFO
  const available = poolToUse.filter(c => !playedClipsHistory.includes(c.id));
  const candidatePool = available.length > 0 ? available : poolToUse;

  // Context-aware selection based on macro state
  let filteredCandidates = candidatePool;
  if (stateToUse === 'INTRO' || stateToUse === 'BREAK') {
    filteredCandidates = candidatePool.filter(c => c.category === 'MINIMAL' || c.category === 'ABSTRACT' || c.is_generative);
  } else if (stateToUse === 'BUILD') {
    filteredCandidates = candidatePool.filter(c => c.category === 'ABSTRACT' || c.category === 'FIGURA' || c.is_generative);
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

  const takeBars = appState.phrase?.length_bars || appState.autopilot_bars || 16;

  // Shift queue
  queueList.shift();
  queueList.push({
    slot: `+${takeBars * 3} BARS`,
    clipId: nextClip.id,
    name: nextClip.filename,
    layer: 'L3',
    matte: 'none',
    beatsRemaining: takeBars * 12,
    status: `EM ${takeBars * 12} BEATS`
  });

  // Re-label slots dynamically based on active take duration
  queueList[0].slot = 'CUE ATUAL';
  queueList[0].status = 'ARMADO';
  if (queueList[1]) { queueList[1].slot = `+${takeBars} BARS`; queueList[1].status = `EM ${takeBars * 4} BEATS`; }
  if (queueList[2]) { queueList[2].slot = `+${takeBars * 2} BARS`; queueList[2].status = `EM ${takeBars * 8} BEATS`; }

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

    // Transfer/Handover staged 3D scene parameters from Cue B to Program A live
    if (appState.deckB_3d && appState.deckA_3d) {
      Object.assign(appState.deckA_3d, JSON.parse(JSON.stringify(appState.deckB_3d)));
    }

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
    sendAction('trigger_take', { 
      clipId: queuedClipId, 
      name: queuedName,
      nextCueClipId: queueList[0]?.clipId,
      nextCueName: queueList[0]?.name
    });
    sendAction('cue_clip', { layer: 'layer0', clipId: queuedClipId, name: queuedName });
    sendAction('set_layer_rotation', { layer: 'layer0', rotation: queuedRotation || 0 });
    sendAction('set_layer_fit_mode', { layer: 'layer0', fit_mode: queuedFitMode || 'fill' });
    sendAction('set_crossfader', { value: 0 });
  }

  // 5.5 Record safety bar count & timestamp to prevent autopilot from rapid-cycling takes
  lastAutopilotTakeTimestamp = performance.now();
  if (appState.phrase) {
    appState.last_take_total_bar = appState.phrase.total_bars || 1;
    appState.phrase.last_take_bar = appState.phrase.total_bars || 1;
    lastAutopilotBar = appState.phrase.total_bars || 1;
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
  if (typeof saveLiveSetSession === 'function') saveLiveSetSession();
}

let lastHardCutTimestamp = 0;
function executeHardCut(isUserAction = false) {
  const nowCut = performance.now();
  // Debounce de clique/tecla duplo literal (ex.: dois cliques rápidos no botão
  // físico de corte, ou Enter seguido do clique): isso não depende de
  // isUserAction e vale para qualquer origem, numa janela curta o bastante
  // para nunca atrapalhar dois cortes manuais de verdade em sequência.
  if (nowCut - lastHardCutTimestamp < 400) {
    return;
  }
  lastHardCutTimestamp = nowCut;
  // Mesma proteção anti-disparo-duplo de startAutoTransition: um hard cut
  // disparado por automação dentro de 3s de outro take é ignorado; um hard cut
  // explícito do operador (botão ou Enter) sempre executa essa checagem.
  if (!isUserAction && (nowCut - lastAutopilotTakeTimestamp < 3000)) {
    return;
  }
  lastAutopilotTakeTimestamp = nowCut;
  isAutoTransitioning = false;
  autoTransitionProgress = 0.0;
  const bar = document.getElementById('auto-take-bar');
  if (bar) bar.style.width = '0%';
  const btnTake = document.getElementById('btn-auto-take');
  if (btnTake) btnTake.classList.remove('transitioning');
  executeTakeCommit();
}

function startAutoTransition(duration = null, isUserAction = false) {
  if (isAutoTransitioning) return;
  const nowStart = performance.now();
  // Se for automação e acabamos de comitar um take há menos de 3s, ignora disparo duplo
  if (!isUserAction && (nowStart - lastAutopilotTakeTimestamp < 3000)) {
    return;
  }
  lastAutopilotTakeTimestamp = nowStart;
  if (appState.phrase) {
    lastAutopilotBar = appState.phrase.total_bars || 1;
    appState.last_take_total_bar = appState.phrase.total_bars || 1;
  }
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

// ============================================================================
// PRO TIMELINE ARRANGER ENGINE (World-Class Broadcast VJ Multi-Layer Sequencer)
// Industry benchmark: Resolume Arena 7, DaVinci Resolve Studio 19, TouchDesigner, Disguise d3
// ============================================================================
let timelineHitTargets = [];
window.timelineHitTargets = timelineHitTargets;

function renderQueueCards() {
  renderProTimeline();
}

let cachedTimelineRect = null;
let lastTimelineRenderTick = 0;
window.addEventListener('resize', () => { cachedTimelineRect = null; });
window.invalidateTimelineRect = () => { cachedTimelineRect = null; };

function renderProTimeline() {
  const canvas = document.getElementById('timeline-canvas');
  if (!canvas) return;

  const now = performance.now();
  // Throttle timeline arranger to ~30 FPS so master video compositing has full 60 FPS priority
  if (now - lastTimelineRenderTick < 32) return;
  lastTimelineRenderTick = now;

  const ctx = canvas.getContext('2d');
  
  // Use cached bounding rect to eliminate synchronous getBoundingClientRect layout thrashing at 60 FPS
  if (!cachedTimelineRect || cachedTimelineRect.width <= 0) {
    cachedTimelineRect = canvas.getBoundingClientRect();
  }
  const rect = cachedTimelineRect;
  if (!rect || rect.width <= 0 || rect.height <= 0) return;

  const dpr = window.devicePixelRatio || 1;
  const targetW = Math.floor(rect.width * dpr);
  const targetH = Math.floor(rect.height * dpr);
  if (canvas.width !== targetW || canvas.height !== targetH) {
    canvas.width = targetW;
    canvas.height = targetH;
  }
  
  ctx.save();
  ctx.scale(dpr, dpr);
  const w = rect.width;
  const h = rect.height;
  ctx.clearRect(0, 0, w, h);
  timelineHitTargets = [];
  window.timelineHitTargets = timelineHitTargets;

  // Timing & Rhythm Math
  const bpm = appState.bpm || 124.0;
  const phraseBars = appState.phrase?.length_bars || appState.autopilot_bars || 16;
  const currentBar = appState.phrase?.current_bar || 1;
  const currentBeat = appState.phrase?.current_beat || 1;
  const beatFraction = (phraseBeatAccumulator % 1.0);
  const exactBeatsElapsed = (currentBar - 1) * 4 + (currentBeat - 1) + beatFraction;
  const currentBarPos = exactBeatsElapsed / 4.0; // float bar position (e.g. 5.25)

  const remainingBars = Math.max(0, phraseBars - currentBar);
  const remainingBeats = remainingBars * 4 + (4 - currentBeat);
  const secsPerBeat = 60.0 / bpm;
  const remainingSecs = Math.max(0, (remainingBeats * secsPerBeat)).toFixed(1);

  // Visible arrangement horizon: exactly 2 Take cycles horizontally (Active Take + Future Scheduled Horizon)
  const totalVisibleBars = phraseBars * 2;
  const rulerH = 26;
  const tracksH = h - rulerH;
  const numTracks = 7;
  const trackH = tracksH / numTracks;
  const pxPerBar = w / totalVisibleBars;
  const activeTakeW = phraseBars * pxPerBar;
  const futureTakeW = phraseBars * pxPerBar;

  // 1. TOP TIME RULER & NARRATIVE STATE BANNERS
  ctx.fillStyle = '#06090e';
  ctx.fillRect(0, 0, w, rulerH);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, rulerH);
  ctx.lineTo(w, rulerH);
  ctx.stroke();

  // Narrative State Segments on Ruler (INTRO -> GROOVE -> BUILD -> DROP)
  const segIntroW = activeTakeW * 0.25;
  const segGrooveW = activeTakeW * 0.25;
  const segBuildW = activeTakeW * 0.375;
  const segDropW = activeTakeW * 0.125;

  // Intro Zone
  ctx.fillStyle = 'rgba(56, 189, 248, 0.08)';
  ctx.fillRect(0, 0, segIntroW, rulerH - 1);
  ctx.fillStyle = 'rgba(56, 189, 248, 0.6)';
  ctx.font = 'bold 8px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('INTRO', 6, 10);

  // Groove Zone
  ctx.fillStyle = 'rgba(0, 240, 255, 0.10)';
  ctx.fillRect(segIntroW, 0, segGrooveW, rulerH - 1);
  ctx.fillStyle = 'rgba(0, 240, 255, 0.7)';
  ctx.fillText('GROOVE', segIntroW + 6, 10);

  // Build Zone
  const buildX = segIntroW + segGrooveW;
  ctx.fillStyle = 'rgba(255, 184, 0, 0.12)';
  ctx.fillRect(buildX, 0, segBuildW, rulerH - 1);
  ctx.fillStyle = 'rgba(255, 184, 0, 0.8)';
  ctx.fillText('BUILD-UP', buildX + 6, 10);

  // Drop Impact Zone
  const dropX = buildX + segBuildW;
  ctx.fillStyle = 'rgba(255, 42, 133, 0.16)';
  ctx.fillRect(dropX, 0, segDropW, rulerH - 1);
  ctx.fillStyle = 'rgba(255, 42, 133, 0.9)';
  ctx.fillText('DROP CLIMAX', dropX + 4, 10);

  // Future Horizon Banner on Ruler
  ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
  ctx.fillRect(activeTakeW, 0, futureTakeW, rulerH - 1);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.fillText(`+1 TAKE HORIZON (PRÓXIMO CICLO · +${phraseBars} BARS)`, activeTakeW + 10, 10);

  // Transition Dissolve Window Marker (Last 2 bars before activeTakeW)
  const transWinW = Math.min(activeTakeW * 0.25, 2 * pxPerBar);
  const transWinX = activeTakeW - transWinW;
  ctx.fillStyle = 'rgba(0, 240, 255, 0.12)';
  ctx.fillRect(transWinX, 0, transWinW, rulerH - 1);
  ctx.strokeStyle = 'rgba(0, 240, 255, 0.4)';
  ctx.strokeRect(transWinX, 0, transWinW, rulerH - 1);
  ctx.fillStyle = '#00f0ff';
  ctx.font = 'bold 7.5px monospace';
  ctx.fillText('DISSOLVE', transWinX + 4, rulerH - 4);

  // Bar ticks and measure numbers
  const barStep = phraseBars <= 8 ? 2 : (phraseBars <= 16 ? 4 : 8);
  for (let b = 0; b <= totalVisibleBars; b++) {
    const bx = b * pxPerBar;
    const isMajor = b % barStep === 0;
    ctx.strokeStyle = isMajor ? 'rgba(0, 240, 255, 0.4)' : 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = isMajor ? 1.5 : 1;
    ctx.beginPath();
    ctx.moveTo(bx, rulerH - (isMajor ? 10 : 5));
    ctx.lineTo(bx, rulerH);
    ctx.stroke();

    if (isMajor && b < totalVisibleBars) {
      ctx.fillStyle = b < phraseBars ? 'rgba(0, 240, 255, 0.85)' : 'rgba(255, 255, 255, 0.6)';
      ctx.font = '8px monospace';
      ctx.textAlign = 'left';
      const bLabel = b < phraseBars ? `BAR ${b + 1}` : `+${b - phraseBars}B`;
      ctx.fillText(bLabel, bx + 3, rulerH - 3);
      
      // Secondary time label
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.font = '7px monospace';
      ctx.fillText(`${Math.round(b * 4 * secsPerBeat)}s`, bx + 3, 10);
    }
  }

  // 2. TRACK LANES BACKGROUND & DIVIDERS
  const trackBgColors = [
    'rgba(0, 255, 136, 0.03)',  // L0 Master PGM
    'rgba(0, 240, 255, 0.02)',  // L1 Pulse Reflex
    'rgba(168, 85, 247, 0.03)', // L2 Sobel Edge
    'rgba(0, 240, 255, 0.04)',  // L3 Cue Bus B
    'rgba(255, 42, 133, 0.03)', // L4 Accent Climax
    'rgba(192, 132, 252, 0.03)',// L5 Overlay Deck
    'rgba(255, 184, 0, 0.02)'   // FX After Effects
  ];

  for (let t = 0; t < numTracks; t++) {
    const ty = rulerH + (t * trackH);
    ctx.fillStyle = trackBgColors[t] || '#040609';
    ctx.fillRect(0, ty, w, trackH);

    // Track divider line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, ty + trackH);
    ctx.lineTo(w, ty + trackH);
    ctx.stroke();

    // Vertical bar lines down tracks
    for (let b = 1; b < totalVisibleBars; b++) {
      const bx = b * pxPerBar;
      ctx.strokeStyle = b % barStep === 0 ? 'rgba(255, 255, 255, 0.03)' : 'rgba(255, 255, 255, 0.012)';
      ctx.beginPath();
      ctx.moveTo(bx, ty);
      ctx.lineTo(bx, ty + trackH);
      ctx.stroke();
    }
  }

  // 3. TRACK 0: L0 PROGRAM MASTER DECK A (ACTIVE ON AIR TAKE)
  const l0Clip = appState.layers?.layer0;
  const baseClip = (typeof allClips !== 'undefined' ? allClips : []).find(c => c.id === l0Clip?.clipId) || ((typeof allClips !== 'undefined' && allClips[0]) ? allClips[0] : null);
  const l0Y = rulerH + 2;
  const l0W = activeTakeW - 4;
  const isL0Selected = activeTimelineSelectedLayer === 'layer0';

  // L0 Main Block
  ctx.fillStyle = isL0Selected ? 'rgba(0, 255, 136, 0.22)' : 'rgba(0, 255, 136, 0.13)';
  ctx.strokeStyle = isL0Selected ? '#00ff88' : 'rgba(0, 255, 136, 0.7)';
  ctx.lineWidth = isL0Selected ? 2 : 1.5;
  ctx.beginPath();
  ctx.roundRect(2, l0Y, l0W, trackH - 4, 4);
  ctx.fill();
  ctx.stroke();
  timelineHitTargets.push({ x: 2, y: l0Y, w: l0W, h: trackH - 4, type: 'layer', id: 0, action: 'inspect' });

  // L0 Video Thumbnail Preview
  const thumbW = Math.min(84, Math.max(46, l0W * 0.22));
  const thumbH = trackH - 6;
  const thumbX = 4;
  const thumbY = l0Y + 1;
  const thumbImg = getClipImage(baseClip);

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(thumbX, thumbY, thumbW, thumbH, 3);
  ctx.clip();
  if (thumbImg) {
    ctx.drawImage(thumbImg, thumbX, thumbY, thumbW, thumbH);
  } else {
    // Elegant high-tech fallback gradient
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(thumbX, thumbY, thumbW, thumbH);
    ctx.fillStyle = '#00ff88';
    ctx.font = '7px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('VIDEO STREAM', thumbX + thumbW/2, thumbY + thumbH/2 + 2);
  }
  // PGM Badge on thumbnail
  ctx.fillStyle = 'rgba(0, 255, 136, 0.9)';
  ctx.fillRect(thumbX, thumbY, 26, 10);
  ctx.fillStyle = '#000';
  ctx.font = 'bold 7px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('PGM', thumbX + 3, thumbY + 8);
  ctx.restore();
  timelineHitTargets.push({ x: thumbX, y: thumbY, w: thumbW, h: thumbH, type: 'clip', id: baseClip?.id, action: 'inspect' });

  // L0 Matte Silhouette Badge
  const matteName0 = getMatteName(l0Clip?.matte);
  const matteBadgeX = thumbX + thumbW + 6;
  const matteBadgeW = Math.min(100, Math.max(60, l0W * 0.28));
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.strokeStyle = 'rgba(0, 240, 255, 0.4)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(matteBadgeX, l0Y + 2, matteBadgeW, 13, 3);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#00f0ff';
  ctx.font = 'bold 7.5px monospace';
  ctx.fillText('◫ ' + (matteName0.length > 14 ? matteName0.substring(0, 12) + '..' : matteName0), matteBadgeX + 4, l0Y + 11);
  timelineHitTargets.push({ x: matteBadgeX, y: l0Y + 2, w: matteBadgeW, h: 13, type: 'matte', id: l0Clip?.matte, action: 'inspect' });

  // L0 Clip Title & Status
  ctx.fillStyle = '#00ff88';
  ctx.font = 'bold 8.5px monospace';
  const l0TitleStr = '▶ L0: ' + ((l0Clip?.name || baseClip?.filename || 'MASTER').substring(0, 24));
  ctx.fillText(l0TitleStr, matteBadgeX + matteBadgeW + 8, l0Y + 11);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.font = '7.5px monospace';
  ctx.fillText(`100% · ${l0Clip?.blend || 'NORMAL'} · ${l0Clip?.rotation || 0}° · ZOOM ${Math.round((l0Clip?.scale || 1.0) * 100)}%`, matteBadgeX, l0Y + trackH - 7);

  // Video Loop Progress Bar at bottom of L0 block
  const vidProg0 = (typeof playerL0 !== 'undefined' && playerL0 && playerL0.duration) ? (playerL0.currentTime / playerL0.duration) : ((simTime * 0.15) % 1.0);
  ctx.fillStyle = 'rgba(0, 255, 136, 0.8)';
  ctx.fillRect(thumbX + thumbW + 6, l0Y + trackH - 6, (l0W - thumbW - 12) * Math.min(1, Math.max(0, vidProg0)), 2);

  // 4. TRACK 1: L1 PULSE REFLEX (AUDIO-REACTIVE ECHO)
  const l1Clip = appState.layers?.layer1;
  const l1Y = rulerH + trackH + 2;
  const l1Opacity = l1Clip?.opacity ?? 0.8;
  const isL1Selected = activeTimelineSelectedLayer === 'layer1';
  ctx.fillStyle = isL1Selected ? 'rgba(0, 240, 255, 0.18)' : 'rgba(0, 240, 255, 0.08)';
  ctx.strokeStyle = isL1Selected ? '#00f0ff' : 'rgba(0, 240, 255, 0.5)';
  ctx.lineWidth = isL1Selected ? 2 : 1;
  ctx.beginPath();
  ctx.roundRect(2, l1Y, l0W, trackH - 4, 4);
  ctx.fill();
  ctx.stroke();
  timelineHitTargets.push({ x: 2, y: l1Y, w: l0W, h: trackH - 4, type: 'layer', id: 1, action: 'inspect' });

  // Audio reactive wave indicator
  ctx.strokeStyle = 'rgba(0, 240, 255, 0.6)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  const rmsAmp = (appState.audio?.rms || 0.4) * (trackH * 0.25);
  for (let wx = 10; wx < l0W - 10; wx += 8) {
    const wy = l1Y + (trackH/2) + Math.sin(wx * 0.08 + simTime * 4) * rmsAmp;
    if (wx === 10) ctx.moveTo(wx, wy); else ctx.lineTo(wx, wy);
  }
  ctx.stroke();

  ctx.fillStyle = '#00f0ff';
  ctx.font = 'bold 8.5px monospace';
  ctx.fillText(`◈ L1 PULSE REFLEX: ${Math.round(l1Opacity * 100)}% · AUDIO SYNC DOWNSCALE`, 12, l1Y + 11);

  // 5. TRACK 2: L2 SOBEL CONTOURS (FIND EDGES FILTER)
  const l2Clip = appState.layers?.layer2;
  const l2Y = rulerH + (2 * trackH) + 2;
  const l2Opacity = l2Clip?.opacity ?? 0.6;
  const isL2Selected = activeTimelineSelectedLayer === 'layer2';
  ctx.fillStyle = isL2Selected ? 'rgba(168, 85, 247, 0.2)' : 'rgba(168, 85, 247, 0.08)';
  ctx.strokeStyle = isL2Selected ? '#c084fc' : 'rgba(168, 85, 247, 0.5)';
  ctx.lineWidth = isL2Selected ? 2 : 1;
  ctx.beginPath();
  ctx.roundRect(2, l2Y, l0W, trackH - 4, 4);
  ctx.fill();
  ctx.stroke();
  timelineHitTargets.push({ x: 2, y: l2Y, w: l0W, h: trackH - 4, type: 'layer', id: 2, action: 'inspect' });

  ctx.fillStyle = '#c084fc';
  ctx.font = 'bold 8.5px monospace';
  ctx.fillText(`◪ L2 SOBEL CONTOURS: ${Math.round(l2Opacity * 100)}% · THRESHOLD ${appState.sobel?.threshold || 32}`, 12, l2Y + 11);

  // 6. TRACK 3: L3 CUE BUS B (NEXT ARMED TAKE & PREDICTABILITY HUB)
  const l3Clip = appState.layers?.layer3;
  const cueClip = (typeof allClips !== 'undefined' ? allClips : []).find(c => c.id === l3Clip?.clipId) || ((typeof allClips !== 'undefined' && allClips[1]) ? allClips[1] : null);
  const l3Y = rulerH + (3 * trackH) + 2;
  const isL3Selected = activeTimelineSelectedLayer === 'layer3';

  // Overlap Dissolve Crossfade Ramp starts before activeTakeW and extends into upcoming cycle
  const l3StartX = Math.max(2, transWinX);
  const l3W = (activeTakeW - l3StartX) + futureTakeW;

  ctx.fillStyle = isL3Selected ? 'rgba(0, 240, 255, 0.22)' : 'rgba(0, 240, 255, 0.14)';
  ctx.strokeStyle = isL3Selected ? '#00f0ff' : 'rgba(0, 240, 255, 0.75)';
  ctx.lineWidth = isL3Selected ? 2 : 1.5;
  ctx.beginPath();
  ctx.roundRect(l3StartX, l3Y, l3W - 4, trackH - 4, 4);
  ctx.fill();
  ctx.stroke();
  timelineHitTargets.push({ x: l3StartX, y: l3Y, w: l3W - 4, h: trackH - 4, type: 'layer', id: 3, action: 'inspect' });

  // Crossfade Visual Ramp Gradient in transition window
  const rampGrad = ctx.createLinearGradient(l3StartX, l3Y, activeTakeW, l3Y);
  rampGrad.addColorStop(0, 'rgba(0, 240, 255, 0.0)');
  rampGrad.addColorStop(1, 'rgba(0, 240, 255, 0.35)');
  ctx.fillStyle = rampGrad;
  ctx.fillRect(l3StartX, l3Y, transWinW, trackH - 4);

  // Cue Video Thumbnail
  const thumbX3 = l3StartX + 4;
  const thumbY3 = l3Y + 1;
  const thumbImg3 = getClipImage(cueClip);

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(thumbX3, thumbY3, thumbW, thumbH, 3);
  ctx.clip();
  if (thumbImg3) {
    ctx.drawImage(thumbImg3, thumbX3, thumbY3, thumbW, thumbH);
  } else {
    ctx.fillStyle = '#082f49';
    ctx.fillRect(thumbX3, thumbY3, thumbW, thumbH);
    ctx.fillStyle = '#00f0ff';
    ctx.font = '7px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('CUE STREAM', thumbX3 + thumbW/2, thumbY3 + thumbH/2 + 2);
  }
  // CUE B Badge on thumbnail
  ctx.fillStyle = 'rgba(0, 240, 255, 0.9)';
  ctx.fillRect(thumbX3, thumbY3, 30, 10);
  ctx.fillStyle = '#000';
  ctx.font = 'bold 7px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('CUE B', thumbX3 + 3, thumbY3 + 8);
  ctx.restore();
  timelineHitTargets.push({ x: thumbX3, y: thumbY3, w: thumbW, h: thumbH, type: 'clip', id: cueClip?.id, action: 'inspect' });

  // Cue Matte Badge
  const matteName3 = getMatteName(l3Clip?.matte);
  const matteBadgeX3 = thumbX3 + thumbW + 6;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.strokeStyle = 'rgba(0, 240, 255, 0.4)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(matteBadgeX3, l3Y + 2, matteBadgeW, 13, 3);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#00f0ff';
  ctx.font = 'bold 7.5px monospace';
  ctx.fillText('◫ ' + (matteName3.length > 14 ? matteName3.substring(0, 12) + '..' : matteName3), matteBadgeX3 + 4, l3Y + 11);
  timelineHitTargets.push({ x: matteBadgeX3, y: l3Y + 2, w: matteBadgeW, h: 13, type: 'matte', id: l3Clip?.matte, action: 'inspect' });

  // Cue Title & Countdown Status
  ctx.fillStyle = '#00f0ff';
  ctx.font = 'bold 8.5px monospace';
  const l3TitleStr = '◱ CUE BUS B: ' + ((l3Clip?.name || cueClip?.filename || 'NEXT TAKE').substring(0, 24));
  ctx.fillText(l3TitleStr, matteBadgeX3 + matteBadgeW + 8, l3Y + 11);

  ctx.fillStyle = isAutoTransitioning ? '#ffb800' : 'rgba(255, 255, 255, 0.7)';
  ctx.font = '7.5px monospace';
  const l3StatusStr = isAutoTransitioning 
    ? `⚡ DISSOLVE EM PROGRESSO (${Math.round(autoTransitionProgress * 100)}%)` 
    : `DISPARO EM ${remainingBars} BARS (${remainingSecs}s) · CUE ARMADO NO DECK B`;
  ctx.fillText(l3StatusStr, matteBadgeX3, l3Y + trackH - 7);

  // 7. TRACK 4: L4 DIFFERENCE ACCENT (DROP & BUILD CLIMAX BURSTS)
  const l4Clip = appState.layers?.layer4;
  const l4Y = rulerH + (4 * trackH) + 2;
  const l4Opacity = l4Clip?.opacity ?? 0.0;
  const isL4Selected = activeTimelineSelectedLayer === 'layer4';

  ctx.fillStyle = isL4Selected ? 'rgba(255, 42, 133, 0.22)' : 'rgba(255, 42, 133, 0.08)';
  ctx.strokeStyle = isL4Selected ? '#ff2a85' : 'rgba(255, 42, 133, 0.5)';
  ctx.lineWidth = isL4Selected ? 2 : 1;
  ctx.beginPath();
  ctx.roundRect(2, l4Y, l0W, trackH - 4, 4);
  ctx.fill();
  ctx.stroke();
  timelineHitTargets.push({ x: 2, y: l4Y, w: l0W, h: trackH - 4, type: 'layer', id: 4, action: 'inspect' });

  ctx.fillStyle = '#ff2a85';
  ctx.font = 'bold 8.5px monospace';
  ctx.fillText(`⚡ L4 ACCENT CLIMAX: ${Math.round(l4Opacity * 100)}% · ARMED FOR DROP & BUILD (DIFFERENCE / EXCLUSION)`, 12, l4Y + 11);

  // 8. TRACK 5: L5 OVERLAY DECK
  const l5Clip = appState.layers?.layer5;
  const l5Y = rulerH + (5 * trackH) + 2;
  const l5Opacity = l5Clip?.opacity ?? 1.0;
  const isL5Selected = activeTimelineSelectedLayer === 'layer5';

  ctx.fillStyle = isL5Selected ? 'rgba(192, 132, 252, 0.22)' : 'rgba(192, 132, 252, 0.1)';
  ctx.strokeStyle = isL5Selected ? '#c084fc' : 'rgba(192, 132, 252, 0.6)';
  ctx.lineWidth = isL5Selected ? 2 : 1;
  ctx.beginPath();
  ctx.roundRect(2, l5Y, l0W, trackH - 4, 4);
  ctx.fill();
  ctx.stroke();
  timelineHitTargets.push({ x: 2, y: l5Y, w: l0W, h: trackH - 4, type: 'layer', id: 5, action: 'inspect' });

  ctx.fillStyle = '#c084fc';
  ctx.font = 'bold 8.5px monospace';
  ctx.fillText(`◪ L5 OVERLAY: ${(l5Clip?.name || 'OVERLAY DECK').substring(0, 22)} · ${Math.round(l5Opacity * 100)}% (${l5Clip?.blend || 'Screen'})`, 12, l5Y + 11);

  // 9. TRACK 6: FX MASTER & AFTER EFFECTS PIPELINE
  const fxY = rulerH + (6 * trackH) + 2;
  ctx.fillStyle = 'rgba(255, 184, 0, 0.06)';
  ctx.fillRect(0, fxY, w, trackH - 2);
  ctx.fillStyle = '#ffb800';
  ctx.font = 'bold 8.5px monospace';
  const fxStatusStr = `∿ FX ENGINE: ${appState.fx?.enabled ? 'ACTIVE (' + (appState.fx?.activeEffect || 'AUTO') + ')' : 'BYPASS'} · AUTOMATION ENVELOPE`;
  ctx.fillText(fxStatusStr, 12, fxY + 11);
  timelineHitTargets.push({ x: 0, y: fxY, w, h: trackH - 2, type: 'master', id: null, subtab: 'advanced', action: 'inspect' });

  // 10. FUTURE SCHEDULED TAKES HORIZON (FORWARD PREDICTABILITY QUEUE)
  if (queueList && queueList.length > 1) {
    const nextQ1 = queueList[1];
    const nextClip1 = (typeof allClips !== 'undefined' ? allClips : []).find(c => c.id === nextQ1.clipId) || null;
    const fX1 = activeTakeW + 4;
    const fW1 = futureTakeW - 8;
    const fY1 = l0Y;

    // Scheduled Take 2 Block on Track 0
    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.35)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.roundRect(fX1, fY1, fW1, trackH - 4, 4);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
    timelineHitTargets.push({ x: fX1, y: fY1, w: fW1, h: trackH - 4, type: 'clip', id: nextQ1.clipId, action: 'inspect' });

    // Thumbnail for scheduled take
    const fThumbW = Math.min(68, fW1 * 0.25);
    const fThumbImg = getClipImage(nextClip1);
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(fX1 + 4, fY1 + 1, fThumbW, thumbH, 3);
    ctx.clip();
    if (fThumbImg) {
      ctx.drawImage(fThumbImg, fX1 + 4, fY1 + 1, fThumbW, thumbH);
    } else {
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(fX1 + 4, fY1 + 1, fThumbW, thumbH);
    }
    ctx.restore();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.font = 'bold 8px monospace';
    ctx.fillText(`+1 TAKE (+${phraseBars} BARS) · ` + ((nextQ1.name || '').substring(0, 16)), fX1 + fThumbW + 10, fY1 + 11);

    // Quick Cue Button
    const btnCueW = 60;
    const btnCueX = fX1 + fW1 - btnCueW - 6;
    ctx.fillStyle = 'rgba(0, 240, 255, 0.15)';
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.5)';
    ctx.beginPath();
    ctx.roundRect(btnCueX, fY1 + 3, btnCueW, trackH - 10, 3);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#00f0ff';
    ctx.font = 'bold 7.5px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('ARMAR CUE', btnCueX + btnCueW/2, fY1 + (trackH/2) + 1);
    ctx.textAlign = 'left';
    timelineHitTargets.push({ x: btnCueX, y: fY1 + 3, w: btnCueW, h: trackH - 10, action: 'cue', idx: 1 });
  }

  // 11. REAL-TIME 60 FPS SUB-PIXEL PLAYHEAD (NOW INDICATOR)
  const playheadX = currentBarPos * pxPerBar;
  
  // Vertical neon glowing playhead line
  ctx.save();
  ctx.shadowColor = '#00f0ff';
  ctx.shadowBlur = 8;
  ctx.strokeStyle = '#00f0ff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(playheadX, 0);
  ctx.lineTo(playheadX, h);
  ctx.stroke();
  ctx.restore();

  // Downbeat Strobe Flare Pulse on Bar 1.1
  const isDownbeat = currentBeat === 1 && beatFraction < 0.25;
  if (isDownbeat) {
    ctx.fillStyle = 'rgba(0, 255, 136, 0.2)';
    ctx.fillRect(playheadX - 12, 0, 24, h);
  }

  // Top Playhead Badge on Time Ruler
  const badgeW = 64;
  const badgeH = 19;
  const badgeX = Math.max(2, Math.min(w - badgeW - 2, playheadX - (badgeW / 2)));
  
  ctx.fillStyle = isDownbeat ? '#00ff88' : '#00f0ff';
  ctx.beginPath();
  ctx.roundRect(badgeX, 3, badgeW, badgeH, 4);
  ctx.fill();

  ctx.fillStyle = '#000';
  ctx.font = 'bold 8.5px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`BAR ${currentBar}.${currentBeat}`, badgeX + badgeW/2, 15);

  // Floating countdown tag beneath the badge
  ctx.fillStyle = '#00f0ff';
  ctx.font = 'bold 7.5px monospace';
  ctx.fillText(`-${remainingSecs}s`, badgeX + badgeW/2, rulerH + 12);
  ctx.textAlign = 'left';

  ctx.restore();
}
window.renderProTimeline = renderProTimeline;

function cueQueuedClipByIndex(idx) {
  if (!queueList || !queueList[idx]) return;
  const item = queueList[idx];
  const clipId = item.clipId || item.id;
  if (clipId) {
    routeClipToBus(clipId, 'B');
    if (item.matte && item.matte !== 'none') {
      appState.layers.layer3.matte = item.matte;
    }
    updateUI();
    syncVideoSources();
    renderProTimeline();
  }
}
window.cueQueuedClipByIndex = cueQueuedClipByIndex;

function initTimelineCanvasInteraction() {
  const canvas = document.getElementById('timeline-canvas');
  if (!canvas || canvas.dataset.hasInspectorClick) return;
  canvas.dataset.hasInspectorClick = 'true';

  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    // Check hit targets in reverse order (topmost first)
    if (timelineHitTargets && timelineHitTargets.length > 0) {
      for (let i = timelineHitTargets.length - 1; i >= 0; i--) {
        const t = timelineHitTargets[i];
        if (clickX >= t.x && clickX <= t.x + t.w && clickY >= t.y && clickY <= t.y + t.h) {
          if (t.action === 'cue') {
            cueQueuedClipByIndex(t.idx);
            return;
          } else if (t.action === 'inspect') {
            openStudioInspector(t.type, t.id, t.subtab || 'transform');
            return;
          }
        }
      }
    }

    // Fallback: Pro Arrangement View 7 tracks
    const rulerH = 26;
    if (clickY < rulerH) return;
    const tracksH = rect.height - rulerH;
    const trackH = tracksH / 7;
    const trackIdx = Math.floor((clickY - rulerH) / trackH);

    const trackMap = [
      { type: 'layer', id: 0 },
      { type: 'layer', id: 1 },
      { type: 'layer', id: 2 },
      { type: 'layer', id: 3 },
      { type: 'layer', id: 4 },
      { type: 'layer', id: 5 },
      { type: 'master', id: null, subtab: 'advanced' }
    ];

    const tgt = trackMap[trackIdx];
    if (tgt) {
      openStudioInspector(tgt.type, tgt.id, tgt.subtab || 'transform');
    }
  });
}
window.initTimelineCanvasInteraction = initTimelineCanvasInteraction;

// ============================================================================
// 9.1 MATTE CATALOG & PROCEDURAL LIBRARY BROWSER
// ============================================================================
const MATTE_SVG_FALLBACK = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='68' viewBox='0 0 120 68'><rect width='120' height='68' fill='%2310131a'/><rect x='28' y='12' width='64' height='44' rx='4' fill='%2300f0ff' fill-opacity='0.18' stroke='%2300f0ff' stroke-width='1.5'/><text x='60' y='38' fill='%2300f0ff' font-size='9' font-weight='bold' font-family='sans-serif' text-anchor='middle'>ALPHA MATTE</text></svg>";

function getMatteName(mattePath) {
  if (!mattePath || mattePath === 'none') return 'SEM MÁSCARA (FULL FRAME)';
  const found = (typeof allMattes !== 'undefined' ? allMattes : []).find(m => m.path === mattePath || m.filename === mattePath);
  if (found && (found.name || found.filename)) return found.name || found.filename.replace('.png', '').replace(/_/g, ' ');
  return mattePath.split('/').pop().replace('.png', '').replace(/_/g, ' ');
}
window.getMatteName = getMatteName;

function getMatteConfig(mattePath) {
  if (!mattePath || mattePath === 'none') return null;
  if (!appState.mattes_config) appState.mattes_config = {};
  if (!appState.mattes_config[mattePath]) {
    const isVig = mattePath.toLowerCase().includes('vignette') || mattePath.toLowerCase().includes('vinheta');
    appState.mattes_config[mattePath] = {
      path: mattePath,
      name: getMatteName(mattePath),
      transform: {
        pos_x: 0,
        pos_y: 0,
        scale: 1.0,
        scale_x: 1.0,
        scale_y: 1.0,
        rotation: 0
      },
      vignette: {
        enabled: isVig,
        roundness: 0.65,
        feather: 0.38,
        inner_radius: 0.42,
        outer_radius: 0.95,
        aspect_ratio: '16:9',
        audio_pulse: 0.15,
        audio_band: 'bass'
      },
      deform: {
        speed: 4.0,
        wiggle_pos: 8,
        wiggle_scale: 0.04,
        wiggle_rot: 0,
        sync_bpm: true
      },
      invert: false
    };
  }
  return appState.mattes_config[mattePath];
}
window.getMatteConfig = getMatteConfig;

function setMatteConfig(mattePath, updates) {
  const cfg = getMatteConfig(mattePath);
  if (!cfg) return;
  if (updates.transform) Object.assign(cfg.transform, updates.transform);
  if (updates.vignette) Object.assign(cfg.vignette, updates.vignette);
  if (updates.deform) Object.assign(cfg.deform, updates.deform);
  if (updates.invert !== undefined) cfg.invert = updates.invert;
  syncActiveMatteToAppState(mattePath);
  if (typeof saveUserProfileDebounced === 'function') saveUserProfileDebounced();
}
window.setMatteConfig = setMatteConfig;

function syncActiveMatteToAppState(mattePath) {
  const cfg = getMatteConfig(mattePath);
  if (!cfg) return;
  const tgt = appState.matte_target_layer || 'layer3';
  const isUsedByTarget = (appState.layers[tgt]?.matte === mattePath) || (tgt === 'master' && appState.master_matte === mattePath);
  if (isUsedByTarget || !appState.matte || !appState.matte.transform) {
    if (!appState.matte) appState.matte = {};
    appState.matte.active_path = mattePath;
    appState.matte.transform = Object.assign({}, cfg.transform);
    appState.matte.vignette = Object.assign({}, cfg.vignette);
    appState.matte.deform = Object.assign({}, cfg.deform);
    appState.matte.invert = Boolean(cfg.invert);
  }
}
window.syncActiveMatteToAppState = syncActiveMatteToAppState;

function assignMatteToLayer(mattePath, layerId) {
  if (!layerId) layerId = appState.matte_target_layer || 'layer3';
  if (layerId === 'master') {
    appState.master_matte = (appState.master_matte === mattePath) ? 'none' : mattePath;
    sendAction('set_master_matte', { matte: appState.master_matte });
  } else if (appState.layers[layerId]) {
    appState.layers[layerId].matte = (appState.layers[layerId].matte === mattePath) ? 'none' : mattePath;
    const selId = layerId.replace('layer', 'l') + '-matte';
    const sel = document.getElementById(selId);
    if (sel) sel.value = appState.layers[layerId].matte;
    sendAction('set_layer_matte', { layer: layerId, matte: appState.layers[layerId].matte });
  }
  syncActiveMatteToAppState(mattePath);
  updateMatteRibbonActiveStatus();
  renderMattesCards();
  renderStudioInspector();
  updateUI();
  if (typeof updateMixerMattesUI === 'function') updateMixerMattesUI();
  if (typeof showMacroToast === 'function') {
    const lName = layerId === 'master' ? 'MASTER' : (layerId ? layerId.replace('layer', 'L').toUpperCase() : 'CAMADA');
    showMacroToast(`[MATTE] "${getMatteName(mattePath)}" vinculada a ${lName}`);
  }
}
window.assignMatteToLayer = assignMatteToLayer;

function nudgeMattePosition(mattePath, dx, dy) {
  const cfg = getMatteConfig(mattePath);
  if (!cfg) return;
  cfg.transform.pos_x = Math.max(-100, Math.min(100, Math.round((cfg.transform.pos_x || 0) + dx)));
  cfg.transform.pos_y = Math.max(-100, Math.min(100, Math.round((cfg.transform.pos_y || 0) + dy)));
  syncActiveMatteToAppState(mattePath);
  renderStudioInspector();
}
window.nudgeMattePosition = nudgeMattePosition;

function centerMattePosition(mattePath) {
  const cfg = getMatteConfig(mattePath);
  if (!cfg) return;
  cfg.transform.pos_x = 0;
  cfg.transform.pos_y = 0;
  syncActiveMatteToAppState(mattePath);
  renderStudioInspector();
}
window.centerMattePosition = centerMattePosition;

function resetMatteTransform(mattePath) {
  const cfg = getMatteConfig(mattePath);
  if (!cfg) return;
  cfg.transform = { pos_x: 0, pos_y: 0, scale: 1.0, scale_x: 1.0, scale_y: 1.0, rotation: 0 };
  syncActiveMatteToAppState(mattePath);
  renderStudioInspector();
  if (typeof showMacroToast === 'function') showMacroToast(`Geometria Resetada: ${getMatteName(mattePath)}`);
}
window.resetMatteTransform = resetMatteTransform;

function getMatteThumbUrl(matte) {
  if (!matte) return '';
  const mPath = safeManifestPath(matte.path || (matte.category_folder ? `${matte.category_folder}/${matte.filename}` : matte.filename) || '') || '';
  if (!mPath) return '';
  const encodedPath = mPath.split('/').map(encodeURIComponent).join('/');
  if (MediaProvider.mode === 'cdn' || window.location.hostname.includes('b-cdn.net') || window.location.hostname.includes('vercel.app')) {
    return `https://gigantera-penumbra.b-cdn.net/mattes/${encodedPath}`;
  }
  return `./mattes/${encodedPath}`;
}

async function loadMattesCatalog() {
  try {
    let loaded = false;
    // 1. Tenta API do servidor local se estiver no localhost
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      try {
        const res = await fetch(HARS.resolveUrl('/api/mattes'));
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            allMattes = data;
            loaded = true;
          }
        }
      } catch (e) {}
    }
    
    // 2. Tenta carregar mattes_manifest.json estático (Vercel ou servidor estático)
    if (!loaded) {
      try {
        const resM = await fetch(HARS.resolveUrl('mattes_manifest.json'));
        if (resM.ok) {
          const data = await resM.json();
          if (Array.isArray(data) && data.length > 0) {
            allMattes = data;
            loaded = true;
          }
        }
      } catch (e) {}
    }

    // 3. Tenta carregar do CDN Bunny Edge
    if (!loaded) {
      try {
        const resCdn = await fetch('https://gigantera-penumbra.b-cdn.net/mattes_manifest.json');
        if (resCdn.ok) {
          const data = await resCdn.json();
          if (Array.isArray(data) && data.length > 0) {
            allMattes = data;
            loaded = true;
          }
        }
      } catch (e) {}
    }

    // 4. Se tudo falhar, utiliza catálogo embutido completo (29 mattes nativos)
    if (!allMattes || allMattes.length === 0) {
      allMattes = [...DEFAULT_MATTES_CATALOG];
    }
    
    const countLbl = document.getElementById('dock-matte-count');
    if (countLbl) countLbl.textContent = allMattes.length;
    populateMatteDropdowns();
    renderMattesCards();
  } catch (e) {
    console.warn('[!] Usando catálogo de mattes embutido nativo:', e);
    allMattes = [...DEFAULT_MATTES_CATALOG];
    populateMatteDropdowns();
    renderMattesCards();
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
  const targetMattePath = (targetL === 'master') ? appState.master_matte : appState.layers[targetL]?.matte;
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
    const mName = m.name || m.filename || '';
    const mDesc = m.description || m.category || '';
    const matchSearch = !searchVal || mName.toLowerCase().includes(searchVal) || mDesc.toLowerCase().includes(searchVal) || (m.tags && m.tags.some(t => t.toLowerCase().includes(searchVal)));
    if (!matchSearch) return false;
    if (activeMatteCategoryFilter === 'ALL') return true;
    return m.category === activeMatteCategoryFilter;
  });

  filtered.forEach(matte => {
    const card = document.createElement('div');
    const isSelected = (targetL === 'master') ? (appState.master_matte === matte.path) : (appState.layers[targetL]?.matte === matte.path);
    const isInspecting = (studioInspectorState && studioInspectorState.targetType === 'matte' && studioInspectorState.targetMattePath === matte.path);
    card.className = `matte-card ${isSelected ? 'selected' : ''} ${isInspecting ? 'is-inspect-selected' : ''}`;
    card.dataset.path = matte.path;

    // Check which layers currently use this matte
    const activeLayers = [];
    if (appState.layers.layer0?.matte?.includes(matte.filename)) activeLayers.push('L0');
    if (appState.layers.layer1?.matte?.includes(matte.filename)) activeLayers.push('L1');
    if (appState.layers.layer2?.matte?.includes(matte.filename)) activeLayers.push('L2');
    if (appState.layers.layer3?.matte?.includes(matte.filename)) activeLayers.push('L3');
    if (appState.layers.layer4?.matte?.includes(matte.filename)) activeLayers.push('L4');
    if (appState.layers.layer5?.matte?.includes(matte.filename)) activeLayers.push('L5');
    if (appState.master_matte?.includes(matte.filename)) activeLayers.push('MASTER');

    const pillsHtml = activeLayers.map(l => `<span class="matte-active-pill">${l}</span>`).join('');
    const mName = matte.name || matte.filename?.replace('.png', '').replace(/_/g, ' ') || 'Máscara Recorte';
    const mDesc = matte.description || matte.category || 'Recorte alpha de camada';
    const thumbUrl = getMatteThumbUrl(matte);

    card.innerHTML = `
      <div class="matte-thumb-wrap">
        <img src="${thumbUrl}" loading="lazy" alt="${mName}" onerror="this.onerror=null; this.src='${MATTE_SVG_FALLBACK}';" class="matte-thumb-img">
        <span class="matte-badge-cat">${matte.category || 'MATTE'}</span>
        <div class="matte-active-layers">${pillsHtml}</div>
      </div>
      <div class="matte-info">
        <div class="matte-name" title="${mName}">${mName} ${isSelected ? '<span style="color:var(--cyan);font-size:8px;">[ATIVA]</span>' : ''}</div>
        <div class="matte-desc" title="${mDesc}">${mDesc}</div>
      </div>
      <div class="matte-quick-routes">
        ${isSelected ? `<button class="btn-route-clear" style="margin-bottom:3px;">✕ REMOVER DE ${targetL.replace('layer', 'L').toUpperCase()}</button>` : ''}
        ${targetL === 'master' ? 
          `<button class="btn-route assigned" data-layer="master" title="Aplicar ao Master (Global)">▶ MASTER (GLOBAL)</button>` : 
          `<button class="btn-route ${activeLayers.includes('L0') ? 'assigned' : ''}" data-layer="layer0" title="Aplicar a L0 (PGM)">L0</button>
           <button class="btn-route ${activeLayers.includes('L3') ? 'assigned' : ''}" data-layer="layer3" title="Armar em L3 (CUE)">L3</button>
           <button class="btn-route ${activeLayers.includes('L4') ? 'assigned' : ''}" data-layer="layer4" title="Armar em L4 (DROP)">L4</button>`
        }
        <button class="btn-route btn-route-insp" onclick="event.stopPropagation(); openStudioInspector('matte', '${matte.path}');" title="Editar Geometria, Vinheta e Animação no Studio Inspector">⚙ INSP</button>
      </div>
    `;

    // Click card: selects and inspects this specific matte in the Studio Inspector!
    card.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      document.querySelectorAll('.matte-card').forEach(c => c.classList.remove('is-inspect-selected'));
      card.classList.add('is-inspect-selected');
      openStudioInspector('matte', matte.path);
    });

    // Double click card: assign/toggle on current target layer
    card.addEventListener('dblclick', (e) => {
      if (e.target.closest('button')) return;
      const tgt = appState.matte_target_layer || 'layer3';
      assignMatteToLayer(matte.path, tgt);
    });

    // Quick route buttons
    card.querySelectorAll('.btn-route').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const targetLayer = btn.dataset.layer || appState.matte_target_layer || 'layer3';
        assignMatteToLayer(matte.path, targetLayer);
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
  refreshMacroStateBadges();
  updateMasterLockedMatteUI();
  updateTimelineTransformInspector();
  updateMixerMattesUI();

  // Sync ping-pong loop button states
  ['layer0', 'layer3', 'layer5'].forEach(lKey => {
    const pfx = lKey.replace('layer', 'l');
    const btn = document.getElementById(`${pfx}-pingpong`);
    if (btn) btn.classList.toggle('active', Boolean(appState.layers[lKey]?.pingPong));
  });

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

    const currentAspect = appState.aspectRatio || (appState.vertical_mode ? '9:16' : '16:9');
    const isVert = (currentAspect === '9:16' || currentAspect === '4:5' || Boolean(appState.vertical_mode || appState.vertical_projection));

    // Sync Program Monitor Box styling, aspect ratio attribute and badge
    const prgScreenBox = document.getElementById('program-screen-box');
    if (prgScreenBox) {
      prgScreenBox.setAttribute('data-aspect-ratio', currentAspect);
      prgScreenBox.classList.toggle('mode-vertical', isVert);
    }
    const prvScreenBox = document.getElementById('preview-screen-box');
    if (prvScreenBox) {
      prvScreenBox.setAttribute('data-aspect-ratio', currentAspect);
      prvScreenBox.classList.toggle('mode-vertical', isVert);
    }

    const badgePrg = document.getElementById('badge-prg-status');
    if (badgePrg) {
      badgePrg.textContent = isVert ? `PROGRAM (MODO VERTICAL ${currentAspect})` : `PROGRAM (${currentAspect} AO VIVO)`;
    }

    const btnPrgVert = document.getElementById('btn-prg-toggle-vertical');
    if (btnPrgVert) btnPrgVert.classList.toggle('active', isVert);

    // Sync Master Aspect Ratio buttons in Settings
    const aspectKeys = ['16:9', '9:16', '1:1', '4:5', '4:3', '21:9'];
    aspectKeys.forEach(arKey => {
      const btnId = 'btn-cfg-aspect-' + arKey.replace(':', '-');
      const btn = document.getElementById(btnId);
      if (btn) btn.classList.toggle('active', currentAspect === arKey);
    });

    const lblCfgMasterAspect = document.getElementById('lbl-cfg-master-aspect-badge');
    if (lblCfgMasterAspect) {
      lblCfgMasterAspect.textContent = `${currentAspect} ${currentAspect === '9:16' ? '(VERTICAL)' : (currentAspect === '16:9' ? '(HORIZONTAL)' : '')}`;
      lblCfgMasterAspect.className = isVert ? 'cfg-badge text-emerald' : 'cfg-badge text-cyan';
    }

    // Sync Default Fit Mode buttons
    const curFit = appState.aspect_fit_mode || 'fit';
    ['fit', 'fill', 'wings'].forEach(m => {
      const b = document.getElementById('btn-cfg-fit-mode-' + m);
      if (b) b.classList.toggle('active', curFit === m);
    });

    // Sync Projector Routing / Compensation buttons & badge
    const isProjComp = Boolean(appState.projector_compensation);
    const btnStraight = document.getElementById('btn-cfg-proj-straight');
    const btnRotated = document.getElementById('btn-cfg-proj-rotated');
    if (btnStraight) btnStraight.classList.toggle('active', !isProjComp);
    if (btnRotated) btnRotated.classList.toggle('active', isProjComp);

    const lblProjBadge = document.getElementById('lbl-cfg-proj-comp-badge');
    if (lblProjBadge) {
      lblProjBadge.textContent = isProjComp ? 'COMPENSAÇÃO 90° CCW (PROJETOR FÍSICO)' : 'NATIVO HORIZONTAL (CENTRO)';
      lblProjBadge.className = isProjComp ? 'cfg-badge text-amber' : 'cfg-badge text-cyan';
    }

    // Legacy fallback bindings
    const lblCfgVert = document.getElementById('lbl-cfg-vert-status');
    if (lblCfgVert) {
      lblCfgVert.textContent = isVert ? `MODO VERTICAL ${currentAspect} (ATIVO)` : 'HORIZONTAL 16:9';
      lblCfgVert.className = isVert ? 'cfg-badge text-emerald' : 'cfg-badge';
    }

    const btnCfgModeHoriz = document.getElementById('btn-cfg-mode-horiz');
    const btnCfgModeVert = document.getElementById('btn-cfg-mode-vert');
    if (btnCfgModeHoriz) btnCfgModeHoriz.classList.toggle('active', !isVert);
    if (btnCfgModeVert) btnCfgModeVert.classList.toggle('active', isVert);

    const chkProjComp = document.getElementById('chk-cfg-proj-comp');
    if (chkProjComp) chkProjComp.checked = isProjComp;

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
  refreshMacroStateBadges();

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

    // Ensure all 9 Generative 3D clips are prepended and available in Media Pool under category 3D
    const genClipsDefs = [
      {
        id: "clip_gen_plexus_spine",
        filename: "PLEXUS 3D ESPINHAÇO (Houdini Generative Marine Spine)",
        folder: "GENERATIVE 3D",
        relative_path: "GENERATIVE/plexus_espinhaco_3d.gen",
        absolute_path: "GENERATIVE/plexus_espinhaco_3d",
        width: 1920, height: 1080, duration: 999.0, fps: 30.0,
        codec: "procedural_3d", size_mb: 0.07, category: "3D",
        suggested_layer: 0, has_chroma: false, green_pct: 0.0,
        mean_luminance: 0.45, contrast: 0.85,
        thumbnail: "thumb_005_Metallic_spine_sculpture.jpg",
        notes: "Sistema generativo 3D Plexus baseado no modelo Espinhaço com nós biológicos áudio-reativos.",
        project: "Espinhaço 3D Plexus", project_folder: "GENERATIVE 3D", is_generative: true, gen_scene: 'spine'
      },
      {
        id: "clip_gen_mercury_blob",
        filename: "LIQUID CHROME MERCURY (Escultura Orgânica & Cromo Líquido)",
        folder: "GENERATIVE 3D",
        relative_path: "GENERATIVE/mercury_blob_3d.gen",
        absolute_path: "GENERATIVE/mercury_blob_3d",
        width: 1920, height: 1080, duration: 999.0, fps: 30.0,
        codec: "procedural_3d", size_mb: 0.08, category: "3D",
        suggested_layer: 0, has_chroma: false, green_pct: 0.0,
        mean_luminance: 0.58, contrast: 1.15,
        thumbnail: "thumb_002_Fluid_chrome_sculpture.jpg",
        notes: "Deformador de mercúrio líquido cromado com reflexos Chiaroscuro e pulsos de viscosidade áudio-reativos.",
        project: "Mercury Liquid 3D", project_folder: "GENERATIVE 3D", is_generative: true, gen_scene: 'mercury_blob'
      },
      {
        id: "clip_gen_monolith_13",
        filename: "BRUTALIST MONOLITH 13 (Monólito Sagrado & Luz Volumétrica)",
        folder: "GENERATIVE 3D",
        relative_path: "GENERATIVE/monolith_13_3d.gen",
        absolute_path: "GENERATIVE/monolith_13_3d",
        width: 1920, height: 1080, duration: 999.0, fps: 30.0,
        codec: "procedural_3d", size_mb: 0.08, category: "3D",
        suggested_layer: 0, has_chroma: false, green_pct: 0.0,
        mean_luminance: 0.42, contrast: 1.20,
        thumbnail: "thumb_004_Geometric_prism_refraction.jpg",
        notes: "Instalação arquitetônica brutalista de prisma monolítico com fendas de laser e runa 13 luminosa.",
        project: "Brutalist Monolith 3D", project_folder: "GENERATIVE 3D", is_generative: true, gen_scene: 'monolith_13'
      },
      {
        id: "clip_gen_nebula_particles",
        filename: "NEBULA STARDUST 3D (Atrator Estranho & Enxame Quântico)",
        folder: "GENERATIVE 3D",
        relative_path: "GENERATIVE/nebula_particles_3d.gen",
        absolute_path: "GENERATIVE/nebula_particles_3d",
        width: 1920, height: 1080, duration: 999.0, fps: 30.0,
        codec: "procedural_3d", size_mb: 0.09, category: "3D",
        suggested_layer: 0, has_chroma: false, green_pct: 0.0,
        mean_luminance: 0.50, contrast: 0.95,
        thumbnail: "thumb_006_Abstract_iridescent_crystal.jpg",
        notes: "Enxame tridimensional de partículas cósmicas orbitando em atrator de Lorenz com micro-filamentos de luz.",
        project: "Nebula Quantum 3D", project_folder: "GENERATIVE 3D", is_generative: true, gen_scene: 'nebula_particles'
      },
      {
        id: "clip_gen_cyber_wireframe",
        filename: "ARCHITECTURAL WIREFRAME (Hipercubo Tesseract Brutalista)",
        folder: "GENERATIVE 3D",
        relative_path: "GENERATIVE/cyber_wireframe_3d.gen",
        absolute_path: "GENERATIVE/cyber_wireframe_3d",
        width: 1920, height: 1080, duration: 999.0, fps: 30.0,
        codec: "procedural_3d", size_mb: 0.07, category: "3D",
        suggested_layer: 0, has_chroma: false, green_pct: 0.0,
        mean_luminance: 0.48, contrast: 1.10,
        thumbnail: "thumb_004_Geometric_prism_refraction.jpg",
        notes: "Matriz tridimensional de tensores ortogonais e cubos aninhados com feixes de corte laser nos kicks.",
        project: "Wireframe Lattice 3D", project_folder: "GENERATIVE 3D", is_generative: true, gen_scene: 'cyber_wireframe'
      },
      {
        id: "clip_gen_hyper_torus",
        filename: "QUANTUM TORUS FLUX (Nó Toroidal Topológico & Vórtice)",
        folder: "GENERATIVE 3D",
        relative_path: "GENERATIVE/hyper_torus_3d.gen",
        absolute_path: "GENERATIVE/hyper_torus_3d",
        width: 1920, height: 1080, duration: 999.0, fps: 30.0,
        codec: "procedural_3d", size_mb: 0.08, category: "3D",
        suggested_layer: 0, has_chroma: false, green_pct: 0.0,
        mean_luminance: 0.55, contrast: 1.05,
        thumbnail: "thumb_003_Holographic_chrome_face.jpg",
        notes: "Estrutura toroidal helicoidal animada em rotação contínua com linhas de fluxo de campo quântico.",
        project: "Quantum Torus 3D", project_folder: "GENERATIVE 3D", is_generative: true, gen_scene: 'hyper_torus'
      },
      {
        id: "clip_gen_ocean_sun",
        filename: "OCEAN SUN 3D (Mar Ondulante + Sol Celestial de Partículas)",
        folder: "GENERATIVE 3D",
        relative_path: "GENERATIVE/ocean_sun_3d.gen",
        absolute_path: "GENERATIVE/ocean_sun_3d",
        width: 1920, height: 1080, duration: 999.0, fps: 30.0,
        codec: "procedural_3d", size_mb: 0.08, category: "3D",
        suggested_layer: 0, has_chroma: false, green_pct: 0.0,
        mean_luminance: 0.52, contrast: 0.90,
        thumbnail: "thumb_001_Animate_silver_tail.jpg",
        notes: "Grade 3D de oceano com ondas fluidas áudio-reativas e orbe solar de partículas no horizonte.",
        project: "Ocean Sun 3D", project_folder: "GENERATIVE 3D", is_generative: true, gen_scene: 'ocean_sun'
      },
      {
        id: "clip_gen_star_13",
        filename: "STAR 13 (Estrela Oficial PT + Numeral 13 Tridimensional Chiaroscuro)",
        folder: "GENERATIVE 3D",
        relative_path: "GENERATIVE/star_13_3d.gen",
        absolute_path: "GENERATIVE/star_13_3d",
        width: 1920, height: 1080, duration: 999.0, fps: 30.0,
        codec: "procedural_3d", size_mb: 0.09, category: "3D",
        suggested_layer: 0, has_chroma: false, green_pct: 0.0,
        mean_luminance: 0.60, contrast: 1.05,
        thumbnail: "thumb_002_Fluid_chrome_sculpture.jpg",
        notes: "Estrela regular de 5 pontas do Partido dos Trabalhadores em relevo áureo e numeral 13 oficial com subgrave desacoplado.",
        project: "Star 13 Sacred", project_folder: "GENERATIVE 3D", is_generative: true, gen_scene: 'star_13'
      },
      {
        id: "clip_gen_hybrid",
        filename: "HYBRID COSMOS (Mar + Estrela 13 + Horizonte Solar)",
        folder: "GENERATIVE 3D",
        relative_path: "GENERATIVE/hybrid_cosmos_3d.gen",
        absolute_path: "GENERATIVE/hybrid_cosmos_3d",
        width: 1920, height: 1080, duration: 999.0, fps: 30.0,
        codec: "procedural_3d", size_mb: 0.10, category: "3D",
        suggested_layer: 0, has_chroma: false, green_pct: 0.0,
        mean_luminance: 0.58, contrast: 0.95,
        thumbnail: "thumb_003_Holographic_chrome_face.jpg",
        notes: "Composição harmônica do oceano ondulante, estrela sagrada 13 e orbe celestial.",
        project: "Hybrid Cosmos", project_folder: "GENERATIVE 3D", is_generative: true, gen_scene: 'hybrid'
      },
      {
        id: "clip_gen_black_hole",
        filename: "SINGULARITY 3D (Vórtice Espaço-Tempo & Horizonte de Eventos)",
        folder: "GENERATIVE 3D",
        relative_path: "GENERATIVE/black_hole_3d.gen",
        absolute_path: "GENERATIVE/black_hole_3d",
        width: 1920, height: 1080, duration: 999.0, fps: 30.0,
        codec: "procedural_3d", size_mb: 0.08, category: "3D",
        suggested_layer: 0, has_chroma: false, green_pct: 0.0,
        mean_luminance: 0.38, contrast: 1.35,
        thumbnail: "thumb_004_Geometric_prism_refraction.jpg",
        notes: "Singularidade com lente gravitacional relativística, anel de fótons e disco de acreção com Doppler.",
        project: "Black Hole Singularity 3D", project_folder: "GENERATIVE 3D", is_generative: true, gen_scene: 'black_hole_singularity'
      },
      {
        id: "clip_gen_biomorphic_flora",
        filename: "BIOMORPHIC FLORA (Morfogênese Botânica & Tentáculos Neurais)",
        folder: "GENERATIVE 3D",
        relative_path: "GENERATIVE/biomorphic_flora_3d.gen",
        absolute_path: "GENERATIVE/biomorphic_flora_3d",
        width: 1920, height: 1080, duration: 999.0, fps: 30.0,
        codec: "procedural_3d", size_mb: 0.08, category: "3D",
        suggested_layer: 0, has_chroma: false, green_pct: 0.0,
        mean_luminance: 0.46, contrast: 1.05,
        thumbnail: "thumb_005_Metallic_spine_sculpture.jpg",
        notes: "Morfogênese fractal de micélio e tentáculos bioluminescentes com pulsos de frequências médias e agudas.",
        project: "Biomorphic Flora 3D", project_folder: "GENERATIVE 3D", is_generative: true, gen_scene: 'biomorphic_flora'
      },
      {
        id: "clip_gen_sol_vermelho",
        filename: "SOL VERMELHO HORIZONTE (Vaporwave Penumbra & Grade Vetorial Retrô)",
        folder: "GENERATIVE 3D",
        relative_path: "GENERATIVE/sol_vermelho_3d.gen",
        absolute_path: "GENERATIVE/sol_vermelho_3d",
        width: 1920, height: 1080, duration: 999.0, fps: 30.0,
        codec: "procedural_3d", size_mb: 0.09, category: "3D",
        suggested_layer: 0, has_chroma: false, green_pct: 0.0,
        mean_luminance: 0.54, contrast: 1.15,
        thumbnail: "thumb_001_Animate_silver_tail.jpg",
        notes: "Sol monumental com faixas horizontais de difração, grade topográfica 3D em perspectiva e reflexos.",
        project: "Sol Vermelho 3D", project_folder: "GENERATIVE 3D", is_generative: true, gen_scene: 'sol_vermelho_horizonte'
      }
    ];

    genClipsDefs.forEach(gc => {
      const idx = allClips.findIndex(c => c.id === gc.id);
      if (idx !== -1) {
        allClips[idx] = Object.assign({}, allClips[idx], gc);
      } else {
        allClips.unshift(gc);
      }
    });

    MediaProvider.syncSmartDeduplication();

    const countLbl = document.getElementById('dock-clip-count');
    if (countLbl) countLbl.textContent = allClips.length;
    const pillAll = document.getElementById('pill-all-count');
    if (pillAll) pillAll.textContent = allClips.length;
    renderFolderPills();
    renderMediaCards();
    renderQueueCards();
    syncVideoSources();
    if (typeof checkSavedDirectoryHandle === 'function') {
      checkSavedDirectoryHandle().catch(() => {});
    }
  } catch (e) {
    console.error('[!] Failed to load media pool:', e);
  }
}

function getClipFolder(c) {
  if (!c) return '1. IN';
  if (c.is_generative || c.id === 'clip_gen_plexus_spine' || c.category === '3D' || c.category === 'GENERATIVE' || c.folder === 'GENERATIVE' || c.folder === 'GENERATIVE 3D' || c.project_folder === 'GENERATIVE 3D') return 'GENERATIVE 3D';
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
      setFolderFilter(btn.dataset.folder);
    });
  });

  // Renderiza também a lista de pastas para o Autopilot em Settings
  renderAutopilotFoldersSettings();
}
window.renderFolderPills = renderFolderPills;

function renderLibraryBreadcrumbs() {
  const nav = document.getElementById('library-breadcrumb-nav');
  if (!nav) return;

  const isFiltered = activeFolderFilter && activeFolderFilter !== 'ALL';
  const folderCounts = {};
  (allClips || []).forEach(c => {
    const f = getClipFolder(c);
    folderCounts[f] = (folderCounts[f] || 0) + 1;
  });
  const folders = Object.keys(folderCounts).sort();

  const pool = appState.autopilot_pool || { excluded_folders: [], excluded_clips: [], view_filter: 'ALL' };
  const totalClips = (allClips || []).length;
  let eligibleCount = 0;
  (allClips || []).forEach(c => {
    if (isClipEligibleForAutopilot(c)) eligibleCount++;
  });
  const excludedCount = totalClips - eligibleCount;
  const curFilter = pool.view_filter || 'ALL';
  const isExpanded = !!pool.toolbar_expanded;

  let leftNavHtml = '';
  if (!isFiltered) {
    leftNavHtml = `
      <div style="display:flex; align-items:center; gap:6px; min-width:0; overflow:hidden;">
        <button class="breadcrumb-root-btn active" onclick="setFolderFilter('ALL')" title="Exibindo todas as pastas">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
          <span>TODAS AS PASTAS</span>
          <span class="breadcrumb-bin-count">(${totalClips})</span>
        </button>
        <div class="lib-breadcrumb-pills" style="display:inline-flex; gap:3px; overflow-x:auto; max-width:420px;">
          ${folders.slice(0, 7).map(f => `
            <button class="bin-quick-pill" onclick="setFolderFilter('${f}')" title="Filtrar por esta pasta: ${f}">
              <span>${f}</span>
              <span class="bin-pill-num">${folderCounts[f]}</span>
            </button>
          `).join('')}
        </div>
      </div>
    `;
  } else {
    const curCount = folderCounts[activeFolderFilter] || 0;
    leftNavHtml = `
      <div style="display:flex; align-items:center; gap:6px; min-width:0; overflow:hidden;">
        <button class="breadcrumb-root-btn" onclick="setFolderFilter('ALL')" title="Voltar a todas as pastas">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
          <span>TODAS</span>
        </button>
        <span class="breadcrumb-sep">/</span>
        <span class="breadcrumb-current-bin" style="font-size:8.5px; padding:1px 6px;">
          <span>${activeFolderFilter}</span>
          <span class="breadcrumb-bin-count">(${curCount})</span>
        </span>
        <button class="btn-bin-return-all" onclick="setFolderFilter('ALL')" title="Sair desta pasta e exibir todo o acervo" style="padding:1px 6px; font-size:8px;">
          <span>✕ VER TODAS</span>
        </button>
      </div>
    `;
  }

  nav.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; width:100%; gap:8px;">
      ${leftNavHtml}

      <!-- ULTRA-COMPACT AUTOPILOT POOL CAPSULE (24px, zero extra rows!) -->
      <div class="ap-pool-capsule">
        <div class="ap-pool-counter-badge" title="${eligibleCount} takes ativos na rotação automática do Autopilot. Clique no botão [⚡ NO AUTO / 🔒 MANUAL] de qualquer card para incluir/excluir.">
          <span class="ap-icon">⚡</span>
          <span>POOL:</span>
          <strong id="ap-pool-count">${eligibleCount}</strong>/<span id="ap-total-count">${totalClips}</span>
        </div>
        <div class="ap-pool-filter-group">
          <button class="ap-pool-filter-btn ${curFilter === 'ALL' ? 'active' : ''}" data-filter="ALL" onclick="setAutopilotPoolViewFilter('ALL')" title="Exibir todo o catálogo">TODOS</button>
          <button class="ap-pool-filter-btn ${curFilter === 'AUTO_ONLY' ? 'active' : ''}" data-filter="AUTO_ONLY" onclick="setAutopilotPoolViewFilter('AUTO_ONLY')" title="Exibir apenas takes ativos no Autopilot">⚡ NO AUTO (${eligibleCount})</button>
          <button class="ap-pool-filter-btn ${curFilter === 'MANUAL_ONLY' ? 'active' : ''}" data-filter="MANUAL_ONLY" onclick="setAutopilotPoolViewFilter('MANUAL_ONLY')" title="Exibir apenas takes restritos a disparo manual">🔒 SÓ MANUAL (${excludedCount})</button>
        </div>
        <button class="btn-toggle-ap-drawer ${isExpanded ? 'is-active' : ''}" onclick="toggleAutopilotToolbarDrawer()" title="Abrir ações em lote e instruções do Pool">
          <span>⚡ AÇÕES</span>
          <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"></polyline></svg>
        </button>
      </div>
    </div>

    <!-- COLLAPSIBLE BULK ACTIONS STRIP (Hidden by default to save 100% vertical space!) -->
    <div class="ap-pool-collapsible-strip ${isExpanded ? 'is-open' : ''}" id="ap-pool-bulk-strip">
      <div class="ap-pool-bulk-actions">
        <button class="btn-ap-bulk" onclick="setAllClipsAutopilot('all')" title="Incluir todos os takes e pastas no Autopilot">✓ ATIVAR TODOS</button>
        <button class="btn-ap-bulk" onclick="setAllClipsAutopilot('none')" title="Travar todos os takes em manual (Autopilot zerado)">🔒 ZERAR (SÓ MANUAL)</button>
        <button class="btn-ap-bulk" onclick="setAllClipsAutopilot('invert')" title="Inverter takes selecionados para o Autopilot">🔄 INVERTER</button>
        ${isFiltered ? `<button class="btn-ap-bulk btn-ap-bulk-folder" onclick="setAllClipsAutopilot('current_folder')" title="Ativar apenas takes da pasta atual no Autopilot">📁 SÓ "${activeFolderFilter}"</button>` : ''}
      </div>
      <div class="ap-pool-help-tip">
        💡 <strong>Como operar:</strong> Takes em <strong>🔒 MANUAL</strong> nunca tocam sozinhos no Autopilot (só você dispara). Clique no botão <strong>[⚡ NO AUTO / 🔒 MANUAL]</strong> no card do vídeo para alternar.
      </div>
    </div>
  `;
}
window.renderLibraryBreadcrumbs = renderLibraryBreadcrumbs;


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
    last_local_folder_name: "",
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
        if (c.is_local || c.id.startsWith('local_')) {
          const isConnected = MediaProvider.isLocalFileConnected(c);
          c.is_disconnected = !isConnected;
          c.needs_relink = !isConnected;
        }
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
    const custom = allClips.filter(c => 
      c.is_stream || 
      c.is_downloaded || 
      c.is_local ||
      c.id.startsWith('stream_') || 
      c.id.startsWith('clip_dl_') ||
      c.id.startsWith('local_')
    ).map(c => {
      const clone = { ...c };
      if (clone.blob_url && clone.blob_url.startsWith('blob:')) delete clone.blob_url;
      return clone;
    });
    UserProfileManager.profile.custom_clips = custom;
    UserProfileManager.save(true);
    localStorage.setItem('penumbra_custom_clips', JSON.stringify(custom));
  } catch (e) {
    console.warn('[CustomClips] Erro ao persistir clipes:', e);
  }
}

function loadCustomClipsFromStorage() {
  UserProfileManager.rehydrateCustomClips();
}

// ============================================================================
// 0.46 SMART MEDIA RELINK & RESTORATION ENGINE (BEST-PRACTICES FOR LOCAL ASSETS)
// ============================================================================
async function relinkWithDirectoryHandle(dirHandle, options = {}) {
  if (!dirHandle) return 0;
  const { silent = false } = options;
  try {
    if (typeof PenumbraIDB !== 'undefined') {
      await PenumbraIDB.setHandle('last_directory_handle', dirHandle);
    }
    if (typeof UserProfileManager !== 'undefined' && UserProfileManager.profile) {
      UserProfileManager.profile.last_local_folder_name = dirHandle.name;
      UserProfileManager.save(false);
    }

    const VALID_EXTS = new Set(['mp4', 'mov', 'webm', 'm4v', 'mkv', 'avi', 'mp3', 'wav']);
    const IGNORED = new Set(['.git', '.ds_store', 'node_modules', 'dist', 'build', '.agents']);

    async function scan(handle, currentPath = '') {
      for await (const entry of handle.values()) {
        const lower = (entry.name || '').toLowerCase().trim();
        if (!lower || IGNORED.has(lower) || lower.startsWith('.')) continue;
        const entryPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
        if (entry.kind === 'file') {
          const ext = lower.split('.').pop();
          if (VALID_EXTS.has(ext)) {
            try {
              const file = await entry.getFile();
              MediaProvider.localFilesMap.set(entryPath, file);
              const fileObj = {
                file,
                path: entryPath,
                filename: entry.name,
                size_mb: Math.round((file.size / (1024 * 1024)) * 100) / 100,
                isServer: false
              };
              MediaProvider.localFilesByName.set(lower, fileObj);
              MediaProvider.localFilesByName.set(normalizeMediaFilename(entry.name), fileObj);
            } catch (fe) {}
          }
        } else if (entry.kind === 'directory') {
          await scan(entry, entryPath);
        }
      }
    }

    await scan(dirHandle);

    let relinkedCount = 0;
    allClips.forEach(clip => {
      const norm = (clip.filename || '').toLowerCase().trim();
      const normClean = normalizeMediaFilename(clip.filename);
      const baseName = clip.relative_path ? clip.relative_path.split('/').pop().toLowerCase().trim() : '';
      const baseClean = normalizeMediaFilename(baseName);
      const match = MediaProvider.localFilesByName.get(norm) ||
                    MediaProvider.localFilesByName.get(normClean) ||
                    (baseName ? MediaProvider.localFilesByName.get(baseName) : null) ||
                    (baseClean ? MediaProvider.localFilesByName.get(baseClean) : null);
      if (match && match.file instanceof File) {
        clip.has_local_match = true;
        clip.is_disconnected = false;
        clip.needs_relink = false;
        clip.local_match_info = match;
        if (match.path) clip.relative_path = match.path;
        MediaProvider.localFilesMap.set(clip.relative_path, match.file);
        relinkedCount++;
      }
    });

    MediaProvider.syncSmartDeduplication();
    saveCustomClipsToStorage();
    if (typeof renderFolderPills === 'function') renderFolderPills();
    renderMediaCards();
    updateCategoryAndSourceBadges();
    if (typeof updateIngestStats === 'function') updateIngestStats();

    if (!silent && typeof showHudMacroToast === 'function') {
      showHudMacroToast(`[RELINK] ✓ ${relinkedCount} clipe(s) reconectado(s) em "${dirHandle.name}"`);
    }
    return relinkedCount;
  } catch (err) {
    console.warn('[Relink] Erro ao reconectar pasta:', err);
    return 0;
  }
}
window.relinkWithDirectoryHandle = relinkWithDirectoryHandle;

window.relinkWithFiles = async function(fileList) {
  if (!fileList || fileList.length === 0) return 0;
  let relinkedCount = 0;
  for (const file of Array.from(fileList)) {
    const norm = file.name.toLowerCase().trim();
    const normClean = normalizeMediaFilename(file.name);
    const relPath = file.webkitRelativePath || file.name;
    MediaProvider.localFilesMap.set(relPath, file);
    const fileObj = {
      file,
      path: relPath,
      filename: file.name,
      size_mb: Math.round((file.size / (1024 * 1024)) * 100) / 100,
      isServer: false
    };
    MediaProvider.localFilesByName.set(norm, fileObj);
    MediaProvider.localFilesByName.set(normClean, fileObj);
  }

  allClips.forEach(clip => {
    const norm = (clip.filename || '').toLowerCase().trim();
    const normClean = normalizeMediaFilename(clip.filename);
    const baseName = clip.relative_path ? clip.relative_path.split('/').pop().toLowerCase().trim() : '';
    const baseClean = normalizeMediaFilename(baseName);
    const match = MediaProvider.localFilesByName.get(norm) ||
                  MediaProvider.localFilesByName.get(normClean) ||
                  (baseName ? MediaProvider.localFilesByName.get(baseName) : null) ||
                  (baseClean ? MediaProvider.localFilesByName.get(baseClean) : null);
    if (match && match.file instanceof File) {
      clip.has_local_match = true;
      clip.is_disconnected = false;
      clip.needs_relink = false;
      clip.local_match_info = match;
      if (match.path) clip.relative_path = match.path;
      MediaProvider.localFilesMap.set(clip.relative_path, match.file);
      relinkedCount++;
    }
  });

  MediaProvider.syncSmartDeduplication();
  saveCustomClipsToStorage();
  if (typeof renderFolderPills === 'function') renderFolderPills();
  renderMediaCards();
  updateCategoryAndSourceBadges();
  if (typeof updateIngestStats === 'function') updateIngestStats();

  if (typeof showHudMacroToast === 'function') {
    showHudMacroToast(`[RELINK] ✓ ${relinkedCount} clipe(s) reconectado(s) com sucesso`);
  }
  return relinkedCount;
};

window.relinkLocalMediaFolder = async function() {
  try {
    const savedHandle = typeof PenumbraIDB !== 'undefined' ? await PenumbraIDB.getHandle('last_directory_handle') : null;
    if (savedHandle) {
      try {
        let perm = await savedHandle.queryPermission({ mode: 'read' });
        if (perm === 'prompt') {
          perm = await savedHandle.requestPermission({ mode: 'read' });
        }
        if (perm === 'granted') {
          const count = await relinkWithDirectoryHandle(savedHandle);
          if (count > 0) return;
        }
      } catch (e) {}
    }

    if (typeof window.showDirectoryPicker === 'function') {
      const handle = await window.showDirectoryPicker({ mode: 'read' });
      await relinkWithDirectoryHandle(handle);
      return;
    }

    window.relinkWithFileInput();
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.warn('[Relink] Falha ao selecionar pasta:', err);
    }
  }
};

window.relinkWithFileInput = function() {
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.webkitdirectory = true;
  input.style.display = 'none';
  document.body.appendChild(input);
  input.onchange = async () => {
    if (input.files && input.files.length > 0) {
      await window.relinkWithFiles(input.files);
    }
    input.remove();
  };
  input.click();
};

window.relinkSpecificClip = function(clipId, event) {
  if (event) event.stopPropagation();
  const clip = allClips.find(c => c.id === clipId);
  if (!clip) return;
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'video/*,audio/*';
  input.style.display = 'none';
  document.body.appendChild(input);
  input.onchange = async () => {
    if (input.files && input.files[0]) {
      const file = input.files[0];
      const norm = clip.filename.toLowerCase().trim();
      MediaProvider.localFilesMap.set(clip.relative_path, file);
      MediaProvider.localFilesByName.set(norm, {
        file,
        path: clip.relative_path,
        filename: file.name,
        size_mb: Math.round((file.size / (1024 * 1024)) * 100) / 100,
        isServer: false
      });
      clip.is_disconnected = false;
      clip.needs_relink = false;
      saveCustomClipsToStorage();
      renderMediaCards();
      if (typeof showHudMacroToast === 'function') {
        showHudMacroToast(`[RELINK] ✓ Clipe "${clip.filename}" reconectado!`);
      }
    }
    input.remove();
  };
  input.click();
};

async function checkSavedDirectoryHandle() {
  try {
    if (typeof PenumbraIDB === 'undefined') return false;
    const handle = await PenumbraIDB.getHandle('last_directory_handle');
    if (!handle) return false;
    const perm = await handle.queryPermission({ mode: 'read' });
    if (perm === 'granted') {
      console.log(`[Relink Auto] Permissão concedida para pasta "${handle.name}", reconectando silenciosamente...`);
      await relinkWithDirectoryHandle(handle, { silent: true });
      return true;
    } else {
      console.log(`[Relink Auto] Pasta anterior "${handle.name}" salva, aguardando clique de reconexão do usuário.`);
    }
  } catch (e) {
    console.warn('[Relink Auto] Falha ao verificar handle salvo:', e);
  }
  return false;
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

  const categories = ['MINIMAL', 'ABSTRACT', 'FIGURA', 'DENSE', 'CHROMA', '3D', 'STREAMS & YOUTUBE', 'GENERATIVE'];
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
  renderLibraryBreadcrumbs();
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
  const isUnlinked = Boolean((clip.is_local || clip.id.startsWith('local_')) && (clip.is_disconnected || !MediaProvider.isLocalFileConnected(clip)));
  const isOnAir = (appState.layers?.layer0?.clipId === clip.id);
  const isInCue = (appState.layers?.layer3?.clipId === clip.id);
  const isInL5 = (appState.layers?.layer5?.clipId === clip.id);
  const isSelected = (studioInspectorState && studioInspectorState.targetClipId === clip.id);
  
  const isAutoEligible = isClipEligibleForAutopilot(clip);
  card.dataset.clipId = clip.id;
  card.className = `media-card ${isGen ? 'is-generative' : ''} ${isUnlinked ? 'is-unlinked' : ''} ${isOnAir ? 'is-on-air-pgm' : ''} ${isInCue ? 'is-in-cue-prv' : ''} ${isInL5 ? 'is-in-l5' : ''} ${isSelected ? 'is-selected' : ''} ${isAutoEligible ? '' : 'is-autopilot-excluded'} source-${escapeHTML(clipSource)}`;
  const thumbSrc = MediaProvider.getThumbUrl(clip);
  const animSrc = MediaProvider.getPreviewAnimUrl(clip) || thumbSrc;
  const projName = clip.project || '1.In';

  let srcBadgeHtml = '';
  if (isUnlinked) {
    srcBadgeHtml = '<span class="media-source-badge badge-source-unlinked" title="Arquivo local desconectado">⚠️ DESVINCULADO</span>';
  } else if (clip.has_local_match) {
    srcBadgeHtml = '<span class="media-source-badge badge-source-local-match" title="Arquivo idêntico no SSD local">⚡ LOCAL</span>';
  } else if (clipSource === 'cdn') {
    srcBadgeHtml = '<span class="media-source-badge badge-source-cdn">☁️ NUVEM</span>';
  } else if (clipSource === 'local') {
    srcBadgeHtml = '<span class="media-source-badge badge-source-local">📁 SSD</span>';
  } else if (clipSource === 'youtube') {
    srcBadgeHtml = '<span class="media-source-badge badge-source-yt">YOUTUBE</span>';
  } else if (clipSource === 'stream') {
    srcBadgeHtml = '<span class="media-source-badge badge-source-stream">STREAM</span>';
  }

  // Cache Status Check
  const cacheInfo = UserProfileManager.getCacheDetails(clip);
  let cacheBadgeHtml = '';
  if (isUnlinked) {
    cacheBadgeHtml = `<span class="badge-cache-status is-unlinked">DESCONECTADO</span>`;
  } else if (clip.has_local_match) {
    cacheBadgeHtml = `<span class="badge-cache-status is-local-match">LOCAL 100%</span>`;
  } else if (cacheInfo.isCached) {
    cacheBadgeHtml = `<span class="badge-cache-status is-cached">CACHED</span>`;
  } else if (clipSource === 'cdn') {
    cacheBadgeHtml = `<span class="badge-cache-status not-cached">PREVIEW</span>`;
  }

  const clipFolder = getClipFolder(clip);
  const clipIdArg = escapeHTML(JSON.stringify(String(clip.id)));
  const clipFolderArg = escapeHTML(JSON.stringify(String(clipFolder)));

  let actionBtnHtml = '';
  if (isUnlinked) {
    actionBtnHtml = `<button class="btn-card-action btn-action-relink" onclick="window.relinkSpecificClip(${clipIdArg}, event)" title="Localizar este clipe"><svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg> RELINK</button>`;
  } else if (clip.has_local_match || cacheInfo.isCached) {
    actionBtnHtml = `<button class="btn-card-action is-active-cached" title="Arquivo pronto no SSD local" onclick="event.stopPropagation();">✓ LOCAL</button>`;
  } else if (clipSource === 'cdn' || clipSource === 'youtube' || clipSource === 'stream') {
    actionBtnHtml = `<button class="btn-card-action btn-card-activate" onclick="window.activateMediaClip(${clipIdArg}, event)" title="Ativar clipe com streaming em alta">⚡ ATIVAR</button>`;
  }

  card.innerHTML = `
    <div class="media-card-thumb">
      ${thumbSrc ? `<img src="${escapeHTML(thumbSrc)}" loading="lazy" alt="${escapeHTML(clip.filename)}" data-static="${escapeHTML(thumbSrc)}" data-anim="${escapeHTML(animSrc)}" class="dynamic-preview-img">` : '<div class="no-thumb">RAW 1.IN</div>'}
      ${srcBadgeHtml}
      ${isOnAir ? '<span class="thumb-air-indicator">● PGM</span>' : ''}
      ${isInCue ? '<span class="thumb-cue-indicator">● CUE</span>' : ''}
      ${isInL5 ? '<span class="thumb-l5-indicator">● L5</span>' : ''}
      ${isAutoEligible ? `<span class="thumb-auto-indicator" onclick="event.stopPropagation(); toggleClipAutopilot(${clipIdArg}, event);" title="Take ATIVO no Autopilot · Clique para travar em apenas MANUAL">⚡ AUTO</span>` : `<span class="thumb-manual-indicator" onclick="event.stopPropagation(); toggleClipAutopilot(${clipIdArg}, event);" title="Take TRAVADO em manual (só você dispara) · Clique para incluir no Autopilot">🔒 MANUAL</span>`}
      <span class="thumb-duration-badge">${escapeHTML(clip.duration ? `${Math.round(clip.duration)}s` : 'LOOP')}</span>
      <span class="thumb-resolution-badge">${escapeHTML(clip.width || '1920')}×${escapeHTML(clip.height || '1080')}</span>
    </div>
    <div class="media-card-info">
      <div class="media-card-title-row">
        <span class="media-card-title" title="${escapeHTML(clip.filename)}">${clip.display_title ? escapeHTML(clip.display_title) : escapeHTML(clip.filename)}</span>
        ${cacheBadgeHtml}
      </div>
      <div class="media-card-folder-tag" onclick="event.stopPropagation(); setFolderFilter(${clipFolderArg});" title="Filtrar por esta pasta: ${escapeHTML(clipFolder)}">
        <svg class="folder-icon-svg" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
        <span>${escapeHTML(clipFolder)}</span>
      </div>
      <div class="card-actions-grid">
        <button class="btn-card-action btn-action-pgm btn-bus-a ${isOnAir ? 'is-active-on-air' : ''}" data-bus="A" title="Enviar para Program Master [A]">
          <svg width="7" height="7" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
          <span>PGM</span>
        </button>
        <button class="btn-card-action btn-action-cue btn-bus-b ${isInCue ? 'is-active-cue' : ''}" data-bus="B" title="Preparar no Preview Cue [B]">
          <svg width="7" height="7" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="8"></circle></svg>
          <span>CUE</span>
        </button>
        <button class="btn-card-action btn-action-l5 ${isInL5 ? 'is-active-l5' : ''}" data-layer="layer5" title="Enviar para Camada de Apoio / Overlay [L5]">
          <svg width="7" height="7" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="18" height="18" rx="2"></rect></svg>
          <span>L5</span>
        </button>
        <button class="btn-card-action btn-action-insp" onclick="event.stopPropagation(); openStudioInspector('clip', ${clipIdArg})" title="Inspecionar no Studio Inspector [I]">
          <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
          <span>INSP</span>
        </button>
      </div>
    </div>
  `;

  // Click on card selects clip and opens Studio Inspector
  card.addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    document.querySelectorAll('.media-card').forEach(c => c.classList.remove('is-selected'));
    card.classList.add('is-selected');
    openStudioInspector('clip', clip.id);
  });

  // Double-click routes to Bus B (Preview Cue)
  card.addEventListener('dblclick', (e) => {
    if (e.target.closest('button')) return;
    routeClipToBus(clip.id, 'B');
    if (typeof showMacroToast === 'function') {
      showMacroToast(`[CUE] "${clip.display_title || clip.filename}" preparado no Preview`);
    }
  });

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
      appState.layers.layer4._assignedAt = Date.now();
      sendAction('cue_clip', { layer: 'layer4', clipId: clip.id, name: clip.filename });
      updateUI();
      syncVideoSources();
    });
  }

  const btnL5 = card.querySelector('[data-layer="layer5"]');
  if (btnL5) {
    btnL5.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof window.routeClipToLayer === 'function') {
        window.routeClipToLayer(clip.id, 'layer5');
      } else {
        appState.layers.layer5.clipId = clip.id;
        appState.layers.layer5.name = clip.filename;
        appState.layers.layer5._assignedAt = Date.now();
        sendAction('cue_clip', { layer: 'layer5', clipId: clip.id, name: clip.filename });
        updateUI();
        syncVideoSources();
        showMacroToast(`Armado em L5 (OVERLAY): ${clip.filename.slice(0, 20)}`);
      }
    });
  }

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

  if (sourceStrip) sourceStrip.style.display = (type === 'all' || type === 'clips' || type === '3d') ? 'flex' : 'none';
  if (catStrip) catStrip.style.display = (type === 'all' || type === 'clips' || type === '3d') ? 'flex' : 'none';
  if (folderStrip) folderStrip.style.display = (type === 'all' || type === 'clips' || type === '3d') ? 'flex' : 'none';

  if (typeof UserProfileManager !== 'undefined') {
    UserProfileManager.setSetting('library_active_asset_type', type);
  }

  renderMediaCards();
}
window.selectLibraryAssetType = selectLibraryAssetType;

function createMatteCardForLibrary(matte) {
  const card = document.createElement('div');
  const mPath = safeManifestPath(matte.path || (matte.category_folder ? `${matte.category_folder}/${matte.filename}` : matte.filename) || '') || '';
  const mPathArg = escapeHTML(JSON.stringify(mPath));
  const isInspecting = (studioInspectorState && studioInspectorState.targetType === 'matte' && studioInspectorState.targetMattePath === mPath);
  card.className = `library-card-matte ${isInspecting ? 'is-inspect-selected' : ''}`;
  const targetL = appState.matte_target_layer || 'layer3';

  const mName = matte.name || matte.filename?.replace('.png', '').replace(/_/g, ' ') || 'Máscara Recorte';
  const mDesc = matte.description || matte.category || 'Recorte alpha de camada';
  const mCat = matte.category || 'MATTE';
  const thumbUrl = getMatteThumbUrl(matte);

  card.innerHTML = `
    <div class="library-card-thumb-wrap">
      <img src="${escapeHTML(thumbUrl)}" loading="lazy" alt="${escapeHTML(mName)}" onerror="this.onerror=null; this.src='${MATTE_SVG_FALLBACK}';">
      <span class="lib-badge-type lib-badge-matte">${escapeHTML(mCat)}</span>
    </div>
    <div class="library-card-info">
      <div class="library-card-title" title="${escapeHTML(mName)}">${escapeHTML(mName)}</div>
      <div class="library-card-desc" title="${escapeHTML(mDesc)}">${escapeHTML(mDesc)}</div>
    </div>
    <div class="library-card-actions">
      <button class="btn btn-outline btn-xs" onclick="event.stopPropagation(); assignMatteToLayer(${mPathArg}, 'layer0')" title="Aplicar no Layer 0 (Master Base)">→ L0</button>
      <button class="btn btn-outline btn-xs" onclick="event.stopPropagation(); assignMatteToLayer(${mPathArg}, 'layer1')" title="Aplicar no Layer 1 (Reflexo)">→ L1</button>
      <button class="btn btn-primary btn-xs" onclick="event.stopPropagation(); assignMatteToLayer(${mPathArg}, 'layer3')" title="Aplicar no Layer 3 (Cue Deck B)">→ L3</button>
      <button class="btn-edit-params btn-xs" onclick="event.stopPropagation(); openStudioInspector('matte', ${mPathArg});" title="Editar parâmetros no Studio Inspector">⚙ INSP</button>
    </div>
  `;

  card.addEventListener('click', () => {
    document.querySelectorAll('.library-card-matte').forEach(c => c.classList.remove('is-inspect-selected'));
    card.classList.add('is-inspect-selected');
    openStudioInspector('matte', mPath);
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
  openStudioInspector('matte', mattePath);
  if (typeof showMacroToast === 'function') {
    showMacroToast(`[MATTE] Inspecionando "${matteName || getMatteName(mattePath)}" no Studio Inspector`);
  }
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
  openStudioInspector('clip', clipId, 'color');
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

  renderLibraryBreadcrumbs();
  updateCategoryAndSourceBadges();

  const searchVal = (document.getElementById('input-media-search')?.value || '').toLowerCase();

  // Update counts on badges
  const badgeClips = document.getElementById('lib-count-clips');
  if (badgeClips) badgeClips.textContent = allClips.filter(c => !c.is_generative && c.codec !== 'procedural_3d').length;
  const badge3d = document.getElementById('lib-count-3d');
  const count3d = allClips.filter(c => c.is_generative || c.category === '3D' || c.codec === 'procedural_3d' || c.folder === 'GENERATIVE 3D').length;
  if (badge3d) badge3d.textContent = count3d;
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
  const isCloudHost = typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
  const hasLocalConnected = MediaProvider.localFilesByName.size > 0;
  const isVideoOrAllTab = activeLibraryAssetType !== 'mattes' && activeLibraryAssetType !== 'fx' && activeLibraryAssetType !== 'presets';

  if (isCloudHost && !hasLocalConnected && isVideoOrAllTab) {
    const cloudSsdBanner = document.createElement('div');
    cloudSsdBanner.className = 'media-relink-banner';
    cloudSsdBanner.style.background = 'linear-gradient(90deg, rgba(230, 126, 34, 0.18), rgba(211, 84, 0, 0.28))';
    cloudSsdBanner.style.border = '1px solid rgba(230, 126, 34, 0.55)';
    cloudSsdBanner.style.marginBottom = '12px';
    cloudSsdBanner.innerHTML = `
      <div class="relink-banner-info">
        <span class="relink-icon">💾⚡</span>
        <div>
          <strong style="color: #f39c12; letter-spacing: 0.5px;">MODO WEB · VINCULE SUA PASTA DO SSD LOCAL</strong>
          <div style="font-size:10px; opacity:0.9; color: #ecf0f1;">Os 74 vídeos brutos (20 GB) rodam direto do seu disco com 0ms de latência. Aponte a pasta uma vez e o navegador lembrará nas próximas sessões.</div>
        </div>
      </div>
      <div class="relink-banner-actions">
        <button class="btn btn-primary btn-xs" style="background:#e67e22; border-color:#d35400; font-weight:bold; cursor:pointer;" onclick="window.relinkLocalMediaFolder()" title="Vincular pasta do SSD local">⚡ CONECTAR PASTA SSD</button>
      </div>
    `;
    container.appendChild(cloudSsdBanner);
  } else {
    const unlinkedClips = allClips.filter(c => (c.is_local || c.id.startsWith('local_')) && (c.is_disconnected || !MediaProvider.isLocalFileConnected(c)));
    if (unlinkedClips.length > 0 && isVideoOrAllTab && activeSourceFilter !== 'cdn') {
      const lastFolderName = (UserProfileManager.profile && UserProfileManager.profile.last_local_folder_name) ? UserProfileManager.profile.last_local_folder_name : 'Sua pasta de mídias';
      const relinkBanner = document.createElement('div');
      relinkBanner.className = 'media-relink-banner';
      relinkBanner.innerHTML = `
        <div class="relink-banner-info">
          <span class="relink-icon">📁⚠️</span>
          <div>
            <strong>${unlinkedClips.length} CLIPE(S) LOCAL(IS) DESVINCULADO(S)</strong>
            <div style="font-size:9.5px; opacity:0.8;">Pasta de origem: <em>${lastFolderName}</em>. Reconecte a pasta para restaurar a reprodução instantânea.</div>
          </div>
        </div>
        <div class="relink-banner-actions">
          <button class="btn btn-primary btn-xs" onclick="window.relinkLocalMediaFolder()" title="Reconectar pasta de mídias local via File System Access">⚡ RECONECTAR PASTA</button>
          <button class="btn btn-outline btn-xs" onclick="window.relinkWithFileInput()" title="Selecionar arquivos ou pasta manualmente">📂 LOCALIZAR ARQUIVOS</button>
        </div>
      `;
      container.appendChild(relinkBanner);
    }
  }

  updateAutopilotPoolUI();

  const filtered = allClips.filter(c => {
    const projText = (c.project || '').toLowerCase();
    const folderText = (c.project_folder || '').toLowerCase();
    const nameText = (c.filename || '').toLowerCase();
    const titleText = (c.display_title || '').toLowerCase();
    const matchSearch = !searchVal || nameText.includes(searchVal) || titleText.includes(searchVal) || projText.includes(searchVal) || folderText.includes(searchVal);
    if (!matchSearch) return false;

    // Filter by Asset Type (Coleções Globais: 3D ou VÍDEOS)
    if (activeLibraryAssetType === '3d') {
      const is3d = c.is_generative || c.category === '3D' || c.codec === 'procedural_3d' || c.folder === 'GENERATIVE 3D';
      if (!is3d) return false;
    } else if (activeLibraryAssetType === 'clips') {
      const is3d = c.is_generative || c.category === '3D' || c.codec === 'procedural_3d' || c.folder === 'GENERATIVE 3D';
      if (is3d) return false;
    }

    // Filter by Category
    if (activeCategoryFilter && activeCategoryFilter !== 'ALL') {
      if (activeCategoryFilter === '3D') {
        const is3d = c.is_generative || c.category === '3D' || c.codec === 'procedural_3d' || c.folder === 'GENERATIVE 3D';
        if (!is3d) return false;
      } else if (c.category !== activeCategoryFilter) {
        return false;
      }
    }

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

    // Filter by Autopilot Pool View Filter ('ALL' | 'AUTO_ONLY' | 'MANUAL_ONLY')
    if (appState.autopilot_pool && appState.autopilot_pool.view_filter && appState.autopilot_pool.view_filter !== 'ALL') {
      const isAuto = isClipEligibleForAutopilot(c);
      if (appState.autopilot_pool.view_filter === 'AUTO_ONLY' && !isAuto) return false;
      if (appState.autopilot_pool.view_filter === 'MANUAL_ONLY' && isAuto) return false;
    }

    return true;
  });

  const searchCountLbl = document.getElementById('lbl-search-count');
  if (searchCountLbl) {
    const typeLabel = activeLibraryAssetType === '3d' ? 'CENAS 3D' : (activeLibraryAssetType === 'clips' ? 'VÍDEOS' : 'CLIPES');
    searchCountLbl.textContent = `${filtered.length} / ${allClips.length} ${typeLabel}`;
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

    // Prominent Folder Banner if inside a specific bin/folder
    if (activeFolderFilter && activeFolderFilter !== 'ALL') {
      const folderBanner = document.createElement('div');
      folderBanner.className = 'folder-active-banner';
      folderBanner.innerHTML = `
        <div class="folder-active-info">
          <span class="folder-active-badge">PASTA ATIVA</span>
          <h3 class="folder-active-title">${activeFolderFilter}</h3>
          <span class="folder-active-meta">${filtered.length} clipe(s) disponíveis</span>
        </div>
        <button class="folder-active-return-btn" onclick="setFolderFilter('ALL')" title="Voltar para todas as pastas">
          ◂ VOLTAR A TODAS AS PASTAS [✕]
        </button>
      `;
      container.appendChild(folderBanner);
    }

    if (filtered.length === 0) {
      const emptyNotice = document.createElement('div');
      emptyNotice.className = 'folder-active-banner';
      emptyNotice.style.gridColumn = '1 / -1';
      emptyNotice.style.display = 'flex';
      emptyNotice.style.flexDirection = 'column';
      emptyNotice.style.alignItems = 'center';
      emptyNotice.style.justifyContent = 'center';
      emptyNotice.style.padding = '36px 16px';
      emptyNotice.style.gap = '10px';
      emptyNotice.style.textAlign = 'center';
      emptyNotice.innerHTML = `
        <div style="font-size:28px;">📂</div>
        <div style="font-weight:700; color:#fff; font-size:11px;">NENHUM CLIPE NESTA PASTA</div>
        <div style="color:#798094; font-size:9.5px; max-width:320px;">Não foram encontrados arquivos de vídeo com os filtros atuais na pasta "${activeFolderFilter}".</div>
        <button class="folder-active-return-btn" style="margin-top:6px;" onclick="setFolderFilter('ALL')">◂ VOLTAR A TODAS AS PASTAS</button>
      `;
      container.appendChild(emptyNotice);
    } else {
      // Flat Grid View Mode
      filtered.forEach(clip => {
        container.appendChild(createMediaCardElement(clip));
      });
    }
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

// ============================================================================
// VANGUARD PENUMBRA WEB AUDIO SUITE (REAL-TIME MIC / LINE / USB CLUB DSP)
// ============================================================================
const PenumbraWebAudio = {
  ctx: null,
  stream: null,
  sourceNode: null,
  highpass: null,
  lowpass: null,
  gainNode: null,
  monitorGain: null,
  isMonitoring: false,
  analyser: null,
  freqData: null,
  timeData: null,
  isActive: false,
  activeMode: 'test',
  selectedDeviceId: null,
  availableDevices: [],
  animFrameId: null,

  // Adaptive Leaky Peak & Noise Floor Trackers (Club Acoustic Normalization)
  peakEnv: 0.15,
  floorEnv: 0.005,
  prevKickMag: 0.0,
  kickThreshold: 0.08,
  lastBeatTime: 0,
  beatIntervals: [],
  detectedBpm: null,

  initContext() {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return null;
      this.ctx = new AudioContextClass();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  },

  setMonitor(enabled, vol = null) {
    this.isMonitoring = Boolean(enabled);
    if (this.monitorGain && this.ctx) {
      const sliderVal = document.getElementById('slider-cue-vol')?.value || 70;
      const v = this.isMonitoring ? (vol !== null ? vol : (Number(sliderVal) / 100.0)) : 0.0;
      this.monitorGain.gain.setValueAtTime(v, this.ctx.currentTime);
    }
  },

  async enumerateDevices() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return [];
    try {
      const allDevs = await navigator.mediaDevices.enumerateDevices();
      this.availableDevices = allDevs.filter(d => d.kind === 'audioinput');
      const sel = document.getElementById('sel-audio-input-device');
      const wrap = document.getElementById('audio-input-device-wrap');
      if (sel) {
        sel.innerHTML = '<option value="">Dispositivo Padrão do Sistema</option>';
        this.availableDevices.forEach((dev, idx) => {
          const opt = document.createElement('option');
          opt.value = dev.deviceId;
          opt.textContent = dev.label || `Entrada de Áudio #${idx + 1}`;
          if (dev.deviceId === this.selectedDeviceId) opt.selected = true;
          sel.appendChild(opt);
        });
      }
      if (wrap) {
        wrap.style.display = (this.activeMode !== 'test' && this.availableDevices.length > 0) ? 'block' : 'none';
      }
      return this.availableDevices;
    } catch (e) {
      console.warn('[WebAudio] Falha ao enumerar dispositivos:', e);
      return [];
    }
  },

  async startMicrophone(mode = 'mic', deviceId = null) {
    this.activeMode = mode;
    if (deviceId) this.selectedDeviceId = deviceId;
    this.initContext();
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') {
      try { await this.ctx.resume(); } catch (e) {}
    }

    // Se estiver tocando áudio de teste de arquivo, pausa e silencia imediatamente
    if (audioCuePlayer) {
      audioCuePlayer.pause();
      audioCuePlayer.currentTime = 0;
    }
    if (btnAudioMonitor) btnAudioMonitor.classList.remove('active');
    if (txtAudioMonitor) txtAudioMonitor.textContent = 'CUE OFF';

    this.stopMicrophone();

    try {
      showMacroToast(mode === 'p2' ? 'Conectando entrada de Linha (P2)...' : 'Solicitando microfone...');

      // Auto-detecção inteligente de dispositivo para P2 (Line In) ou Microfone
      if (!this.selectedDeviceId && navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
        try {
          const devs = await navigator.mediaDevices.enumerateDevices();
          const inputs = devs.filter(d => d.kind === 'audioinput');
          if (mode === 'p2') {
            const p2Dev = inputs.find(d => {
              const lbl = (d.label || '').toLowerCase();
              return lbl.includes('line') || lbl.includes('external') || lbl.includes('entrada') || lbl.includes('p2') || lbl.includes('built-in input');
            });
            if (p2Dev) this.selectedDeviceId = p2Dev.deviceId;
          } else if (mode === 'mic') {
            const micDev = inputs.find(d => {
              const lbl = (d.label || '').toLowerCase();
              return lbl.includes('microphone') || lbl.includes('microfone') || lbl.includes('built-in mic');
            });
            if (micDev) this.selectedDeviceId = micDev.deviceId;
          }
        } catch (e) {}
      }

      let stream = null;
      // Cascade de compatibilidade resiliente de captura
      try {
        const c = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
        if (this.selectedDeviceId) c.deviceId = { exact: this.selectedDeviceId };
        stream = await navigator.mediaDevices.getUserMedia({ audio: c });
      } catch (err1) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
          });
        } catch (err2) {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        }
      }

      this.stream = stream;
      this.isActive = true;

      // Monta cadeia de processamento de áudio DSP
      this.sourceNode = this.ctx.createMediaStreamSource(this.stream);

      // 1. Filtro Passa-Alta 24 Hz: corta DC offset e rumble mecânico
      this.highpass = this.ctx.createBiquadFilter();
      this.highpass.type = 'highpass';
      this.highpass.frequency.setValueAtTime(24, this.ctx.currentTime);
      this.highpass.Q.setValueAtTime(0.707, this.ctx.currentTime);

      // 2. Filtro Passa-Baixa 16 kHz: corta chiado do ambiente
      this.lowpass = this.ctx.createBiquadFilter();
      this.lowpass.type = 'lowpass';
      this.lowpass.frequency.setValueAtTime(16000, this.ctx.currentTime);
      this.lowpass.Q.setValueAtTime(0.707, this.ctx.currentTime);

      // 3. Ganho Pré-amplificador ajustável (padrão 2.2x para sensibilidade de microfone)
      this.gainNode = this.ctx.createGain();
      const initialGain = appState.audio_gain || 2.2;
      this.gainNode.gain.setValueAtTime(initialGain, this.ctx.currentTime);
      const stripGainSlider = document.getElementById('strip-audio-gain');
      if (stripGainSlider) stripGainSlider.value = Math.round(initialGain * 100);

      // 4. Analisador FFT de 2048 pontos
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.55;
      this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
      this.timeData = new Uint8Array(this.analyser.frequencyBinCount);

      // 5. Headphone Audition (CUE Monitor) Gain Node (silenciado por padrão para evitar microfonia)
      this.monitorGain = this.ctx.createGain();
      this.monitorGain.gain.setValueAtTime(0.0, this.ctx.currentTime);

      // Conexões:
      // Source -> Highpass -> Lowpass -> Gain -> Analyser
      // Gain -> MonitorGain -> Destination (para escuta controlada via CUE)
      this.sourceNode.connect(this.highpass);
      this.highpass.connect(this.lowpass);
      this.lowpass.connect(this.gainNode);
      this.gainNode.connect(this.analyser);
      this.gainNode.connect(this.monitorGain);
      this.monitorGain.connect(this.ctx.destination);

      // Atualiza lista de dispositivos
      await this.enumerateDevices();

      // Inicia loop de análise e VU metering em tempo real
      this.startProcessingLoop();

      const devTrack = this.stream.getAudioTracks()[0];
      const devLabel = devTrack ? devTrack.label : (mode === 'p2' ? 'Line In (P2)' : (mode === 'usb' ? 'USB Interface' : 'Microfone'));
      currentAudioSource.mode = mode;
      currentAudioSource.device_name = devLabel;
      updateAudioSourceUI(currentAudioSource);

      showMacroToast(`Áudio Conectado: ${devLabel.slice(0, 22)}`);
      console.log(`[PenumbraWebAudio] DSP Ativo: ${devLabel} (Preamp ${initialGain.toFixed(1)}x, Highpass 24Hz, FFT 2048)`);
    } catch (err) {
      console.error('[PenumbraWebAudio] Erro ao obter microfone:', err);
      this.isActive = false;
      showMacroToast('Permissão de áudio não concedida');
      currentAudioSource.mode = 'test';
      currentAudioSource.device_name = 'MP3 Interno (Fallback)';
      updateAudioSourceUI(currentAudioSource);
    }
  },

  stopMicrophone() {
    this.isActive = false;
    this.setMonitor(false);
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
    if (this.sourceNode) {
      try { this.sourceNode.disconnect(); } catch (e) {}
      this.sourceNode = null;
    }
    if (this.monitorGain) {
      try { this.monitorGain.disconnect(); } catch (e) {}
      this.monitorGain = null;
    }
    const wrap = document.getElementById('audio-input-device-wrap');
    if (wrap && this.activeMode === 'test') wrap.style.display = 'none';
  },

  selectDevice(deviceId) {
    if (!deviceId) return;
    this.selectedDeviceId = deviceId;
    this.startMicrophone(this.activeMode, deviceId);
  },

  startProcessingLoop() {
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);

    const loop = () => {
      if (!this.isActive || !this.analyser) return;
      this.animFrameId = requestAnimationFrame(loop);

      this.analyser.getByteFrequencyData(this.freqData);
      this.analyser.getByteTimeDomainData(this.timeData);

      // Cálculo de RMS e Peak dB do sinal de entrada (Hardware-grade VU Meter)
      let sumSq = 0;
      let peakSample = 0;
      const tLen = this.timeData.length;
      for (let i = 0; i < tLen; i++) {
        const val = (this.timeData[i] - 128) / 128.0;
        const absVal = Math.abs(val);
        if (absVal > peakSample) peakSample = absVal;
        sumSq += val * val;
      }
      const rmsVal = Math.sqrt(sumSq / tLen);
      const peakDb = peakSample > 0.0001 ? 20 * Math.log10(peakSample) : -60;
      const clampedDb = Math.max(-60, Math.min(0, peakDb));
      const vuPct = Math.max(0, Math.min(100, ((clampedDb + 60) / 60) * 100));

      // 1. Atualiza VU Meter do Cabeçalho
      const hdrFill = document.getElementById('hdr-vu-fill');
      const hdrPeak = document.getElementById('hdr-vu-peak');
      const hdrVal = document.getElementById('hdr-vu-val');
      const hdrClip = document.getElementById('hdr-vu-clip');
      if (hdrFill) hdrFill.style.width = `${vuPct.toFixed(1)}%`;
      if (hdrPeak) hdrPeak.style.left = `${vuPct.toFixed(1)}%`;
      if (hdrVal) hdrVal.textContent = peakDb <= -58 ? '-∞ dB' : `${clampedDb.toFixed(1)} dB`;
      if (hdrClip) hdrClip.classList.toggle('clipped', peakSample >= 0.96);

      // 2. Atualiza VU Meter da Inline Strip
      const stripFill = document.getElementById('strip-vu-fill');
      const stripPeak = document.getElementById('strip-vu-peak');
      const stripDb = document.getElementById('strip-vu-db');
      if (stripFill) stripFill.style.width = `${vuPct.toFixed(1)}%`;
      if (stripPeak) stripPeak.style.left = `${vuPct.toFixed(1)}%`;
      if (stripDb) stripDb.textContent = peakDb <= -58 ? '-∞ dB' : `${clampedDb.toFixed(1)} dB`;

      // Faixas de frequências (com FFT 2048 a 48kHz, 1 bin ≈ 23.4Hz):
      const avgBand = (start, end) => {
        let sum = 0;
        const count = Math.max(1, end - start);
        for (let i = start; i < end && i < this.freqData.length; i++) {
          sum += this.freqData[i];
        }
        return (sum / count) / 255.0;
      };

      const rawSub = avgBand(1, 4);
      const rawBass = avgBand(4, 12);
      const rawLoMid = avgBand(12, 44);
      const rawHiMid = avgBand(44, 172);
      const rawPres = avgBand(172, 342);
      const rawAir = avgBand(342, 684);
      const rawEnergy = (rawSub * 0.3 + rawBass * 0.35 + rawLoMid * 0.15 + rawHiMid * 0.1 + rawPres * 0.05 + rawAir * 0.05);

      // Seguidor adaptativo suave sem piso artificial elevado
      if (rawEnergy > this.peakEnv) {
        this.peakEnv = Math.max(0.04, rawEnergy);
      } else {
        this.peakEnv = Math.max(0.04, this.peakEnv * 0.995);
      }

      if (rawEnergy < this.floorEnv) {
        this.floorEnv = Math.max(0.001, rawEnergy);
      } else {
        this.floorEnv = Math.min(this.peakEnv * 0.35, this.floorEnv * 1.001);
      }

      const dynRange = Math.max(0.04, this.peakEnv - this.floorEnv);
      const norm = (v) => Math.min(1.0, Math.max(0.0, (v - this.floorEnv) / dynRange));

      const normSub = norm(rawSub);
      const normBass = norm(rawBass);
      const normLoMid = norm(rawLoMid);
      const normHiMid = norm(rawHiMid);
      const normPres = norm(rawPres);
      const normAir = norm(rawAir);
      const normEnergy = norm(rawEnergy);

      // Detecção de Transientes de Bumbo (Spectral Flux) e Contador de BPM Realtime
      const kickFlux = Math.max(0, normBass - this.prevKickMag);
      this.prevKickMag = normBass * 0.75 + this.prevKickMag * 0.25;

      const now = performance.now();
      const isBeat = (kickFlux > this.kickThreshold || (normSub > 0.65 && kickFlux > 0.05)) && (now - this.lastBeatTime > 270);
      if (isBeat) {
        const deltaMs = now - this.lastBeatTime;
        this.lastBeatTime = now;

        if (deltaMs >= 270 && deltaMs <= 1100) {
          this.beatIntervals.push(deltaMs);
          if (this.beatIntervals.length > 8) this.beatIntervals.shift();

          if (this.beatIntervals.length >= 3) {
            const sorted = [...this.beatIntervals].sort((a, b) => a - b);
            const medDelta = sorted[Math.floor(sorted.length / 2)];
            let rawBpm = 60000 / medDelta;
            while (rawBpm < 70) rawBpm *= 2;
            while (rawBpm > 175) rawBpm /= 2;

            this.detectedBpm = this.detectedBpm ? (this.detectedBpm * 0.65 + rawBpm * 0.35) : rawBpm;
            if (!appState.bpm_manual_lock) {
              appState.bpm = Math.round(this.detectedBpm * 10) / 10.0;
              updateAllBpmDisplays(appState.bpm);
            }
          }
        }

        const clockDot = document.getElementById('bpm-clock-dot');
        if (clockDot) {
          clockDot.classList.add('flash');
          setTimeout(() => clockDot.classList.remove('flash'), 100);
        }

        if (beatOrb) {
          beatOrb.style.transform = `scale(1.45)`;
          beatOrb.style.filter = `drop-shadow(0 0 20px rgba(0, 240, 255, 0.95))`;
          setTimeout(() => {
            if (beatOrb) {
              beatOrb.style.transform = 'scale(1)';
              beatOrb.style.filter = 'none';
            }
          }, 120);
        }
      }

      // Sincroniza appState com as bandas extraídas do microfone
      appState.bands = {
        sub: normSub,
        bass: normBass,
        lomid: normLoMid,
        himid: normHiMid,
        pres: normPres,
        air: normAir,
        presence: normPres
      };
      appState.stems = {
        drums: Math.min(1.0, normBass * 1.15),
        bass: normSub,
        other: normLoMid,
        vocals: normHiMid
      };
      appState.energy = normEnergy;

      // Atualiza VU meters de espectro no cockpit em tempo real
      if (meters.sub) meters.sub.style.height = `${Math.min(100, Math.round(normSub * 95) + 5)}%`;
      if (meters.bass) meters.bass.style.height = `${Math.min(100, Math.round(normBass * 95) + 5)}%`;
      if (meters.lomid) meters.lomid.style.height = `${Math.min(100, Math.round(normLoMid * 95) + 5)}%`;
      if (meters.himid) meters.himid.style.height = `${Math.min(100, Math.round(normHiMid * 95) + 5)}%`;
      if (meters.pres) meters.pres.style.height = `${Math.min(100, Math.round(normPres * 95) + 5)}%`;
      if (meters.air) meters.air.style.height = `${Math.min(100, Math.round(normAir * 95) + 5)}%`;
    };

    loop();
  }
};
window.PenumbraWebAudio = PenumbraWebAudio;

window.setAudioPreampGain = function(gainVal) {
  const val = Math.max(0.5, Math.min(6.0, Number(gainVal) || 2.2));
  appState.audio_gain = val;
  if (PenumbraWebAudio.gainNode && PenumbraWebAudio.ctx) {
    PenumbraWebAudio.gainNode.gain.setValueAtTime(val, PenumbraWebAudio.ctx.currentTime);
  }
  const slider = document.getElementById('strip-audio-gain');
  if (slider) slider.value = Math.round(val * 100);
  console.log(`[Audio Preamp] Ganho ajustado para: ${val.toFixed(2)}x`);
};

function setAudioSource(mode, deviceId = null) {
  document.querySelectorAll('.src-pill, .hdr-src-pill').forEach(btn => {
    const s = btn.dataset.source || (btn.id ? btn.id.replace('hdr-src-', '').replace('src-', '') : '');
    btn.classList.toggle('active', s === mode);
  });
  const names = { test: 'MP3 Interno', mic: 'Microfone Interno', p2: 'Entrada P2 (Mesa DJ)', usb: 'Placa USB (UMC22)' };
  const lbl = document.getElementById('lbl-audio-device');
  if (lbl) {
    lbl.textContent = names[mode] || mode.toUpperCase();
  }
  const cfgLbl = document.getElementById('lbl-cfg-audio-dev');
  if (cfgLbl) {
    cfgLbl.textContent = names[mode] || mode.toUpperCase();
  }

  currentAudioSource.mode = mode;
  if (deviceId) currentAudioSource.device_id = deviceId;
  appState.audio_source = mode;
  window.appState = appState;

  if (mode === 'test') {
    PenumbraWebAudio.stopMicrophone();
    playOnlineTestTrack();
  } else {
    // Para e silencia o MP3 interno imediatamente
    if (audioCuePlayer) {
      audioCuePlayer.pause();
      audioCuePlayer.currentTime = 0;
    }
    PenumbraWebAudio.startMicrophone(mode, deviceId);
  }

  sendAction('set_audio_source', { mode, device_id: deviceId, device_name: names[mode] || mode });
}
window.setAudioSource = setAudioSource;

function updateAudioSourceUI(srcInfo) {
  if (!srcInfo) return;
  // Se o WebAudio estiver ativo no microfone ou linha, NÃO deixe telemetria 'test' sobrescrever a preferência do usuário!
  if (PenumbraWebAudio.isActive && srcInfo.mode === 'test') {
    return;
  }
  currentAudioSource = { ...currentAudioSource, ...srcInfo };
  const mode = srcInfo.mode || srcInfo.current_mode;
  if (mode) {
    document.querySelectorAll('.src-pill, .hdr-src-pill').forEach(btn => {
      const s = btn.dataset.source || (btn.id ? btn.id.replace('hdr-src-', '').replace('src-', '') : '');
      btn.classList.toggle('active', s === mode);
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

      // Update VU meter in test playback
      const testEng = Math.min(1.0, subVal * 0.35 + bassVal * 0.4 + lomidVal * 0.25);
      const testDb = testEng > 0.001 ? 20 * Math.log10(testEng) : -60;
      const clampDb = Math.max(-60, Math.min(0, testDb));
      const testPct = Math.max(0, Math.min(100, ((clampDb + 60) / 60) * 100));

      const hFill = document.getElementById('hdr-vu-fill');
      const hPeak = document.getElementById('hdr-vu-peak');
      const hVal = document.getElementById('hdr-vu-val');
      const sFill = document.getElementById('strip-vu-fill');
      const sPeak = document.getElementById('strip-vu-peak');
      const sDb = document.getElementById('strip-vu-db');
      if (hFill) hFill.style.width = `${testPct.toFixed(1)}%`;
      if (hPeak) hPeak.style.left = `${testPct.toFixed(1)}%`;
      if (hVal) hVal.textContent = clampDb <= -58 ? '-∞ dB' : `${clampDb.toFixed(1)} dB`;
      if (sFill) sFill.style.width = `${testPct.toFixed(1)}%`;
      if (sPeak) sPeak.style.left = `${testPct.toFixed(1)}%`;
      if (sDb) sDb.textContent = clampDb <= -58 ? '-∞ dB' : `${clampDb.toFixed(1)} dB`;

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
      PenumbraWebAudio.stopMicrophone();
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
  setAudioSource(mode);
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
  if (btnAutoTake) btnAutoTake.addEventListener('click', () => startAutoTransition(null, true));

  const btnCutTake = document.getElementById('btn-cut-take');
  if (btnCutTake) btnCutTake.addEventListener('click', () => executeHardCut(true));

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
      const isMicMode = (currentAudioSource.mode !== 'test');

      if (isAuditioning) {
        if (isMicMode) {
          PenumbraWebAudio.setMonitor(false);
        } else {
          audioCuePlayer.pause();
        }
        btnAudioMonitor.classList.remove('active');
        if (txtAudioMonitor) txtAudioMonitor.textContent = 'CUE OFF';
        sendAction('set_audio_monitor', { enabled: false });
      } else {
        if (isMicMode) {
          // No modo microfone/linha, silencia o MP3 e monitora o sinal do microfone
          audioCuePlayer.pause();
          const cueVol = Number(sliderCueVol?.value || 70) / 100.0;
          PenumbraWebAudio.setMonitor(true, cueVol);
          btnAudioMonitor.classList.add('active');
          if (txtAudioMonitor) txtAudioMonitor.textContent = 'CUE MIC';
          sendAction('set_audio_monitor', { enabled: true, mode: 'mic', volume: cueVol });
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
      }
    });

    audioCuePlayer.addEventListener('error', () => {
      if (audioCuePlayer.src.includes('/api/audio-stream')) {
        console.log('[Audio] /api/audio-stream indisponível, alternando para test_preview.mp3...');
        audioCuePlayer.src = './assets/audio/test_preview.mp3';
        if (btnAudioMonitor.classList.contains('active') && currentAudioSource.mode === 'test') {
          audioCuePlayer.play().catch(() => {});
        }
      }
    });
  }

  if (sliderCueVol) {
    sliderCueVol.addEventListener('input', (e) => {
      const vol = Number(e.target.value) / 100.0;
      if (audioCuePlayer) audioCuePlayer.volume = vol;
      if (PenumbraWebAudio.isMonitoring) {
        PenumbraWebAudio.setMonitor(true, vol);
      }
      sendAction('set_audio_monitor', { volume: vol });
    });
  }

  // Take Button in Program Monitor
  const btnTake = document.getElementById('btn-cue-take');
  if (btnTake) btnTake.addEventListener('click', () => { executeTakeTransition(null, true); });

  // Pro Crossfader A/B Real-time Slider
  if (crossfader) {
    crossfader.addEventListener('input', (e) => {
      const val = Number(e.target.value);
      sendAction('set_crossfader', { value: val });
    });
    crossfader.addEventListener('change', (e) => {
      if (!e.isTrusted || isAutoTransitioning) return;
      const val = Number(e.target.value);
      if (val >= 98) {
        // Complete cut to B when fully crossfaded
        executeTakeTransition(null, true);
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
  ['l0-opacity', 'l1-opacity', 'l2-opacity', 'l3-opacity', 'l4-opacity', 'l5-opacity'].forEach(id => {
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
  ['l1-blend', 'l3-blend', 'l4-blend', 'l5-blend'].forEach(id => {
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
  if (document.activeElement && nexusModal.contains(document.activeElement)) {
    document.activeElement.blur();
  }
  nexusModal.classList.add('dialog-closing');
  setTimeout(() => {
    try { nexusModal.close(); } catch (e) { nexusModal.removeAttribute('open'); }
    nexusModal.classList.remove('dialog-closing');
    if (document.activeElement && nexusModal.contains(document.activeElement)) {
      document.activeElement.blur();
    }
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

async function selectLocalDirectorySource(forcePicker = false) {
  try {
    const isLocalhost = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    let dirHandle = null;

    if (forcePicker || (!isLocalhost && typeof window.showDirectoryPicker === 'function')) {
      if (typeof window.showDirectoryPicker === 'function') {
        dirHandle = await window.showDirectoryPicker({ mode: 'read', startIn: 'videos' });
      }
    }

    closeStudioLauncher();
    const clips = await MediaProvider.initLocal(dirHandle);
    await loadMediaPool(clips);
    await loadMattesCatalog();
    updateSourceUI('local');
    localStorage.setItem('penumbra_media_source', 'local');
    const chkRemember = document.getElementById('chk-nexus-remember-source');
    if (chkRemember && chkRemember.checked) {
      localStorage.setItem('penumbra_remember_source', 'true');
    }
    if (typeof showMacroToast === 'function') {
      showMacroToast(`Unidade Local Ativa · ${clips ? clips.length : 0} clipes carregados`);
    }
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
  if (typeof updateNetworkOutputUI === 'function') updateNetworkOutputUI();

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

    // 4. YOUTUBE / STREAM INGESTION
    const btnYTTemp = document.getElementById('btn-nexus-yt-temporary');
    const btnYTCancel = document.getElementById('btn-nexus-yt-cancel');
    const inputYT = document.getElementById('input-nexus-yt');
    const ingestFeedback = document.getElementById('nexus-ingest-feedback');
    const ingestMessage = document.getElementById('nexus-ingest-message');
    const ingestPercent = document.getElementById('nexus-ingest-percent');
    const ingestProgress = document.getElementById('nexus-ingest-progress');
    const ingestDetail = document.getElementById('nexus-ingest-detail');
    const selectYTCat = document.getElementById('select-nexus-yt-cat');
    let activeYoutubeJobId = null;
    let pendingCancelJobId = null;
    const showIngestFeedback = (message, state = 'error') => {
      if (!ingestFeedback) return;
      ingestFeedback.dataset.state = state;
      ingestFeedback.hidden = false;
      if (ingestMessage) ingestMessage.textContent = message;
      if (ingestProgress) ingestProgress.hidden = true;
      if (ingestPercent) ingestPercent.hidden = true;
      if (ingestDetail) ingestDetail.hidden = true;
    };
    const formatBytes = bytes => {
      if (!Number.isFinite(Number(bytes)) || Number(bytes) < 0) return '';
      const value = Number(bytes);
      if (value < 1024) return `${Math.round(value)} B`;
      const units = ['KB', 'MB', 'GB', 'TB'];
      let size = value / 1024;
      let unit = units[0];
      for (let index = 1; size >= 1024 && index < units.length; index += 1) {
        size /= 1024;
        unit = units[index];
      }
      return `${size.toFixed(size < 10 ? 1 : 0)} ${unit}`;
    };
    const showYoutubeProgress = job => {
      const percent = job.percent == null ? null : Number(job.percent);
      const hasPercent = Number.isFinite(percent) && percent >= 0;
      const converting = job.status === 'converting';
      const cancelling = job.status === 'cancelling';
      showIngestFeedback(cancelling ? 'Cancelamento solicitado…' : converting ? 'Convertendo para reprodução local…' : 'Baixando para o cache temporário local…', 'working');
      if (ingestProgress) {
        ingestProgress.hidden = false;
        if (hasPercent && !cancelling) ingestProgress.value = Math.min(100, percent);
        else if (ingestProgress.removeAttribute) ingestProgress.removeAttribute('value');
      }
      if (ingestPercent) {
        ingestPercent.hidden = !hasPercent || cancelling;
        if (hasPercent) ingestPercent.textContent = `${Math.round(percent)}%`;
      }
      if (ingestDetail) {
        const received = formatBytes(job.downloadedBytes || 0);
        const total = formatBytes(job.totalBytes || 0);
        ingestDetail.hidden = false;
        ingestDetail.textContent = converting ? 'Etapa final: preparando o vídeo para reprodução.' : total ? `${received} de ${total} recebidos` : `${received} recebidos · tamanho total desconhecido`;
      }
    };
    const addTemporaryYoutubeClip = (url, job) => {
      const category = selectYTCat ? selectYTCat.value : 'STREAMS & YOUTUBE';
      allClips.unshift({
        id: `youtube_${job.id}`,
        filename: job.title || 'Vídeo do YouTube',
        project: 'YOUTUBE TEMP',
        category,
        source: 'youtube',
        relative_path: `/api/youtube-downloads/${encodeURIComponent(job.id)}/media`,
        is_stream: true,
        is_temporary: true,
        thumbnail: '',
        duration: job.duration || 9999
      });
      MediaProvider.mode = 'youtube';
      renderMediaCards();
      updateSourceUI('stream');
      closeStudioLauncher();
    };
    const waitForYoutubeDownload = async url => {
      const qualitySelect = document.getElementById('select-nexus-yt-quality');
      const quality = qualitySelect ? qualitySelect.value : '720';
      const startResponse = await fetch('/api/youtube-downloads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, quality })
      });
      const startJob = await startResponse.json().catch(() => ({}));
      if (!startResponse.ok || !startJob.id) throw new Error(startJob.error || 'Não foi possível iniciar o download.');
      activeYoutubeJobId = startJob.id;
      if (btnYTCancel) btnYTCancel.hidden = false;
      let job = startJob;
      while (activeYoutubeJobId) {
        if (job.status === 'complete') {
          activeYoutubeJobId = null;
          if (btnYTCancel) btnYTCancel.hidden = true;
          showIngestFeedback('Vídeo pronto e adicionado à biblioteca local.', 'success');
          if (ingestProgress) { ingestProgress.hidden = false; ingestProgress.value = 100; }
          if (ingestPercent) { ingestPercent.hidden = false; ingestPercent.textContent = '100%'; }
          addTemporaryYoutubeClip(url, job);
          return;
        }
        if (job.status === 'failed' || job.status === 'cancelled') {
          activeYoutubeJobId = null;
          if (btnYTCancel) btnYTCancel.hidden = true;
          throw new Error(job.error || 'Download temporário falhou.');
        }
        showYoutubeProgress(job);
        await new Promise(resolve => setTimeout(resolve, 700));
        const response = await fetch(`/api/youtube-downloads/${encodeURIComponent(startJob.id)}`);
        const nextJob = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(nextJob.error || 'O download temporário não foi encontrado.');
        job = nextJob;
      }
    };
    const handleYTIngest = async () => {
      const rawUrl = (inputYT ? inputYT.value : '').trim();
      if (pendingCancelJobId) {
        showIngestFeedback('Confirme o cancelamento anterior antes de iniciar outro download.', 'error');
        return;
      }
      let parsedUrl;
      try { parsedUrl = new URL(rawUrl); } catch {
        showIngestFeedback('URL inválida. Use um link HTTPS do YouTube ou um MP4/WebM direto da Bunny CDN.', 'error');
        return;
      }
      const host = parsedUrl.hostname.toLowerCase();
      const isYoutube = host === 'youtu.be' || host === 'youtube.com' || host === 'www.youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com';
      if (isYoutube && parsedUrl.protocol === 'https:') {
        if (btnYTTemp) btnYTTemp.disabled = true;
        showIngestFeedback('Conectando ao YouTube e iniciando a transferência…', 'working');
        try {
          await waitForYoutubeDownload(parsedUrl.href);
        } catch (error) {
          const jobId = activeYoutubeJobId;
          let confirmed = !jobId;
          if (jobId) {
            try {
              const cancelResponse = await fetch(`/api/youtube-downloads/${encodeURIComponent(jobId)}`, { method: 'DELETE' });
              confirmed = cancelResponse.status === 409;
              if (cancelResponse.ok) pendingCancelJobId = jobId;
            } catch {}
            if (!confirmed) pendingCancelJobId = jobId;
          }
          const message = error.message || 'Download do YouTube falhou.';
          showIngestFeedback(confirmed ? message : `${message} Cancelamento ainda não confirmado.`, 'error');
        } finally {
          activeYoutubeJobId = null;
          if (btnYTTemp) btnYTTemp.disabled = false;
          if (btnYTCancel) btnYTCancel.hidden = !pendingCancelJobId;
        }
        return;
      }
      if (!safeCDNMediaUrl(rawUrl) || !/\.(mp4|webm)$/i.test(parsedUrl.pathname)) {
        showIngestFeedback('Use uma URL HTTPS direta de MP4/WebM da Bunny CDN ou um link do YouTube.', 'error');
        return;
      }
      allClips.unshift({ id: `stream_${Date.now()}`, filename: rawUrl, category: selectYTCat ? selectYTCat.value : 'STREAMS & YOUTUBE', relative_path: rawUrl, is_stream: true, thumbnail: '', duration: 9999 });
      renderMediaCards();
      updateSourceUI('stream');
      closeStudioLauncher();
    };
    if (btnYTTemp) btnYTTemp.addEventListener('click', handleYTIngest);
    if (btnYTCancel) btnYTCancel.addEventListener('click', async () => {
      const jobId = activeYoutubeJobId || pendingCancelJobId;
      if (!jobId) return;
      showIngestFeedback('Cancelando download…', 'working');
      try {
        const response = await fetch(`/api/youtube-downloads/${encodeURIComponent(jobId)}`, { method: 'DELETE' });
        if (response.status === 409) {
          if (pendingCancelJobId === jobId) pendingCancelJobId = null;
          if (!activeYoutubeJobId && !pendingCancelJobId) btnYTCancel.hidden = true;
          showIngestFeedback('Não há transferência ativa para cancelar.', 'success');
        } else if (response.ok) {
          if (!activeYoutubeJobId) pendingCancelJobId = jobId;
          showIngestFeedback('Cancelamento solicitado; aguardando encerramento.', 'working');
        } else showIngestFeedback('O servidor não confirmou o cancelamento. Tente novamente.', 'error');
      } catch {
        showIngestFeedback('Não foi possível enviar o cancelamento; tente novamente quando a conexão voltar.', 'error');
      }
    });
    const btnYTStream = document.getElementById('btn-nexus-yt-connect');
    const btnYTDl = document.getElementById('btn-nexus-yt-download');
    const inputYTLauncher = document.getElementById('input-nexus-yt');

    const handleLauncherStream = (mode) => {
      const url = (inputYTLauncher ? inputYTLauncher.value : '').trim();
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
        console.warn('[Media Nexus] Falha ao autoconectar CDN, abrindo Studio Launcher:', err);
        openStudioLauncher();
      });
    } else if (rememberSource && savedSource === 'local') {
      console.log('[Media Nexus] Autoconectando ao Disco Local (preferência salva)...');
      selectLocalDirectorySource(false).catch(err => {
        console.warn('[Media Nexus] Falha ao autoconectar local, abrindo Studio Launcher:', err);
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
          saveCustomClipsToStorage();
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
  // Restaurar preferências de FX Master do Perfil do Usuário
  if (typeof UserProfileManager !== 'undefined') {
    const savedFxActive = UserProfileManager.getSetting('fx_active', false);
    const savedFxLocked = UserProfileManager.getSetting('fx_manual_locked', false);
    if (appState.fx) {
      appState.fx.active = !!savedFxActive;
      appState.fx.manual_locked = !!savedFxLocked;
    }
  }

  const hasRestoredLiveSet = typeof restoreLiveSetSession === 'function' ? restoreLiveSetSession() : false;
  if (!hasRestoredLiveSet) {
    applyMacroPreset(appState.macro_state || 'GROOVE', 0, false);
  }
  renderMacroPresetsMatrix();
  updateMatteRibbonActiveStatus();
  updateFxUI();
  initBackgroundKeepAlive();
  renderVisuals();
  updateUI();
  updateSourceUI(activeMediaSource);

  // Periodically persist live set state for anti-crash resilience
  setInterval(() => {
    if (typeof saveLiveSetSession === 'function') saveLiveSetSession();
  }, 3500);

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
  const clip = (typeof allClips !== 'undefined' ? allClips : []).find(c => c.id === clipId) ||
               (typeof allMediaPoolClips !== 'undefined' ? allMediaPoolClips : []).find(c => c.id === clipId) ||
               { id: clipId, filename: clipId };
  if (!clip) return;
  const clipName = clip.filename || clip.name || clip.id;
  if (bus === 'A') {
    appState.layers.layer0.clipId = clip.id;
    appState.layers.layer0.name = clipName;
    appState.layers.layer0._assignedAt = Date.now();
    appState.layers.layer0.fit_mode = 'fill';
    appState.layers.layer0.matte = 'none';
    updateUI();
    syncVideoSources();
    sendAction('cue_clip', { layer: 'layer0', clipId: clip.id, name: clipName });
    sendAction('set_layer_fit_mode', { layer: 'layer0', fit_mode: 'fill' });
  } else {
    appState.layers.layer3.clipId = clip.id;
    appState.layers.layer3.name = clipName;
    appState.layers.layer3._assignedAt = Date.now();
    appState.layers.layer3.fit_mode = 'fill';
    appState.layers.layer3.matte = 'none';
    updateUI();
    syncVideoSources();
    sendAction('cue_clip', { layer: 'layer3', clipId: clip.id, name: clipName });
    sendAction('set_layer_fit_mode', { layer: 'layer3', fit_mode: 'fill' });
  }
}
window.routeClipToBus = routeClipToBus;

function routeClipToLayer(clipId, layerKey = 'layer5') {
  const clip = (typeof allClips !== 'undefined' ? allClips : []).find(c => c.id === clipId) ||
               (typeof allMediaPoolClips !== 'undefined' ? allMediaPoolClips : []).find(c => c.id === clipId) ||
               { id: clipId, filename: clipId };
  if (!clip || !appState.layers || !appState.layers[layerKey]) return;
  const clipName = clip.filename || clip.name || clip.id;
  appState.layers[layerKey].clipId = clip.id;
  appState.layers[layerKey].name = clipName;
  appState.layers[layerKey]._assignedAt = Date.now();
  if (appState.layers[layerKey].opacity === undefined || appState.layers[layerKey].opacity <= 0.05) {
    appState.layers[layerKey].opacity = 0.85;
  }
  updateUI();
  syncVideoSources();
  sendAction('cue_clip', { layer: layerKey, clipId: clip.id, name: clipName });
  if (typeof showMacroToast === 'function') {
    showMacroToast(`[${layerKey.toUpperCase()}] Armado: "${clip.display_title || clipName.slice(0, 24)}"`);
  }
}
window.routeClipToLayer = routeClipToLayer;

function swapBuses() {
  const tempId = appState.layers.layer0.clipId;
  const tempName = appState.layers.layer0.name;
  appState.layers.layer0.clipId = appState.layers.layer3.clipId;
  appState.layers.layer0.name = appState.layers.layer3.name;
  appState.layers.layer3.clipId = tempId;
  appState.layers.layer3.name = tempName;

  // Swap decoupled 3D configurations between Deck A and Deck B
  if (appState.deckA_3d && appState.deckB_3d) {
    const temp3d = JSON.parse(JSON.stringify(appState.deckA_3d));
    Object.assign(appState.deckA_3d, appState.deckB_3d);
    Object.assign(appState.deckB_3d, temp3d);
  }

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
  if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA' || document.activeElement.tagName === 'SELECT')) {
    document.activeElement.blur();
  }
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
  if (window.PenumbraWebAudio && window.PenumbraWebAudio.gainNode && window.PenumbraWebAudio.ctx) {
    try {
      window.PenumbraWebAudio.gainNode.gain.setValueAtTime(num, window.PenumbraWebAudio.ctx.currentTime);
    } catch (e) {}
  }
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

let isKeyboardShortcutsInitialized = false;

function initKeyboardShortcuts() {
  if (isKeyboardShortcutsInitialized) return;
  isKeyboardShortcutsInitialized = true;
  window.addEventListener('keydown', (e) => {
    const activeEl = document.activeElement;
    const isTextInput = activeEl && (
      (activeEl.tagName === 'INPUT' && ['text', 'password', 'search', 'email', 'url', 'number', 'tel'].includes(activeEl.type)) ||
      activeEl.tagName === 'TEXTAREA' ||
      activeEl.isContentEditable
    );

    // Se o elemento ativo for órfão ou estiver em diálogo/container invisível, desfoca para liberar os atalhos
    if (isTextInput && activeEl.offsetParent === null && activeEl !== document.body) {
      activeEl.blur();
    } else if (isTextInput) {
      if (e.key === 'Escape') {
        activeEl.blur();
        closeSettingsModal();
        closeShortcutsModal();
        closeTheater();
        if (typeof window.toggleMediaIngestDeck === 'function') {
          window.toggleMediaIngestDeck(false);
        }
        return;
      }
      return;
    }

    const key = e.key;

    // SPACE: Auto Take (Smooth Transition)
    if (e.code === 'Space') {
      e.preventDefault();
      startAutoTransition(null, true);
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
      executeHardCut(true);
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
        startAutoTransition(null, true);
      }
      return;
    }
    if (key === 'b' || key === 'B') {
      e.preventDefault();
      if (focusedClipId && !e.shiftKey) {
        routeClipToBus(focusedClipId, 'B');
      } else {
        const btnBlackout = document.getElementById('btn-blackout');
        if (btnBlackout) btnBlackout.click();
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

    // SHIFT+X: Toggle Master FX (Engage / Bypass com Lock Manual)
    if ((key === 'x' || key === 'X') && e.shiftKey) {
      e.preventDefault();
      if (typeof toggleFxMaster === 'function') toggleFxMaster();
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

    // , (Comma): Toggle Preferences & System Settings Modal
    if (key === ',' || e.code === 'Comma') {
      e.preventDefault();
      const modal = document.getElementById('settings-modal');
      if (modal && modal.classList.contains('active')) {
        closeSettingsModal();
      } else {
        openSettingsModal();
      }
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

    // I: Toggle Studio Inspector (DaVinci / After Effects Style)
    if (key === 'i' || key === 'I' || e.code === 'KeyI') {
      e.preventDefault();
      toggleStudioInspector();
      return;
    }

    // Escape: Close modals and Studio Inspector drawer
    if (key === 'Escape') {
      if (typeof studioInspectorState !== 'undefined' && studioInspectorState.isOpen) {
        toggleStudioInspector();
        return;
      }
      closeSettingsModal();
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
    if (typeof window.invalidateTimelineRect === 'function') window.invalidateTimelineRect();
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
    const nextId = nextItem.clipId || nextItem.id;
    if (nextId) {
      routeClipToBus(nextId, 'B');
      if (nextItem.matte && nextItem.matte !== 'none') {
        appState.layers.layer3.matte = nextItem.matte;
      }
      updateUI();
      syncVideoSources();
      if (typeof renderProTimeline === 'function') renderProTimeline();
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

// ============================================================================
// STUDIO INSPECTOR MODULE (DAVINCI RESOLVE / AFTER EFFECTS PROPERTIES)
// ============================================================================
const studioInspectorState = {
  isOpen: false,
  isPinned: false, // Modo Seguir Seleção vs Modo Fixado
  targetType: 'clip', // 'clip', 'layer', 'matte', '3d', 'master'
  activeSubtab: 'transform', // 'transform', 'color', 'advanced'
  targetLayer: 0,     // 0, 1, 2, 3, 4, 5
  targetClipId: null,
  targetMattePath: null
};
window.studioInspectorState = studioInspectorState;

function toggleInspectorPin() {
  studioInspectorState.isPinned = !studioInspectorState.isPinned;
  const btn = document.getElementById('insp-pin-btn');
  const icon = document.getElementById('insp-pin-icon');
  if (btn) btn.classList.toggle('pinned', studioInspectorState.isPinned);
  if (icon) icon.textContent = studioInspectorState.isPinned ? '📌 FIXADO' : '⚡ SEGUIR';
  if (typeof showMacroToast === 'function') {
    showMacroToast(studioInspectorState.isPinned ? '📌 Inspector FIXADO no item atual' : '⚡ Inspector SEGUINDO seleção do workspace');
  }
}
window.toggleInspectorPin = toggleInspectorPin;

function toggleStudioInspector() {
  const drawer = document.getElementById('studio-inspector-drawer');
  if (!drawer) return;
  studioInspectorState.isOpen = !studioInspectorState.isOpen;
  drawer.classList.toggle('open', studioInspectorState.isOpen);
  drawer.classList.toggle('hidden', !studioInspectorState.isOpen);

  const btn = document.getElementById('btn-toggle-inspector');
  if (btn) btn.classList.toggle('active', studioInspectorState.isOpen);
  const btn2 = document.getElementById('btn-toggle-studio-inspector');
  if (btn2) btn2.classList.toggle('active', studioInspectorState.isOpen);

  if (studioInspectorState.isOpen) {
    renderStudioInspector();
  }
}
window.toggleStudioInspector = toggleStudioInspector;

function openStudioInspector(context = 'clip', id = null, subtab = null, forceOpen = true) {
  const drawer = document.getElementById('studio-inspector-drawer');
  if (!drawer) return;

  if (studioInspectorState.isPinned && !forceOpen && context !== studioInspectorState.targetType) {
    // Se o inspetor estiver fixado e a chamada for seleção de fundo, não desvia
    return;
  }

  if (context === 'layer') {
    studioInspectorState.targetType = 'layer';
    let lIdx = 0;
    if (typeof id === 'string' && id.startsWith('layer')) {
      lIdx = Number(id.replace('layer', ''));
    } else if (id !== null && id !== undefined) {
      lIdx = Number(id);
    }
    studioInspectorState.targetLayer = isNaN(lIdx) ? 0 : lIdx;
    activeTimelineSelectedLayer = `layer${studioInspectorState.targetLayer}`;
    if (subtab) studioInspectorState.activeSubtab = subtab;
  } else if (context === 'clip') {
    studioInspectorState.targetType = 'clip';
    if (id) {
      studioInspectorState.targetClipId = id;
    } else if (!studioInspectorState.targetClipId) {
      studioInspectorState.targetClipId = appState.layers?.layer3?.clipId || appState.layers?.layer0?.clipId || (typeof allClips !== 'undefined' && allClips[0]?.id);
    }
    if (subtab) studioInspectorState.activeSubtab = subtab;
  } else if (context === 'master' || context === 'fx') {
    studioInspectorState.targetType = 'master';
    if (subtab) {
      studioInspectorState.activeSubtab = subtab;
    } else if (context === 'fx') {
      studioInspectorState.activeSubtab = 'advanced';
    } else {
      studioInspectorState.activeSubtab = 'color';
    }
  } else if (context === 'matte') {
    studioInspectorState.targetType = 'matte';
    if (id) {
      studioInspectorState.targetMattePath = id;
    } else if (!studioInspectorState.targetMattePath) {
      studioInspectorState.targetMattePath = appState.layers?.layer3?.matte || appState.master_matte || (allMattes && allMattes[0]?.path) || 'mattes/01_Organic_Portal.png';
    }
    if (subtab) studioInspectorState.activeSubtab = subtab;
  } else if (context === '3d' || context === 'gen3d') {
    studioInspectorState.targetType = '3d';
    if (subtab) studioInspectorState.activeSubtab = subtab;
  }

  studioInspectorState.isOpen = true;
  drawer.classList.add('open');
  drawer.classList.remove('hidden');

  const btn = document.getElementById('btn-toggle-inspector');
  if (btn) btn.classList.add('active');
  const btn2 = document.getElementById('btn-toggle-studio-inspector');
  if (btn2) btn2.classList.add('active');

  renderStudioInspector();
  if (typeof updateTimelineTransformInspector === 'function') updateTimelineTransformInspector();
}
window.openStudioInspector = openStudioInspector;

function switchInspectorTarget(type) {
  studioInspectorState.targetType = type;
  if (type === 'master' && studioInspectorState.activeSubtab === 'transform') {
    studioInspectorState.activeSubtab = 'color';
  } else if (type === 'matte' && !studioInspectorState.targetMattePath) {
    studioInspectorState.targetMattePath = appState.layers?.layer3?.matte || appState.master_matte || (typeof allMattes !== 'undefined' && allMattes[0]?.path) || 'cat_b_soft/matte_b_penumbra_vignette.png';
  }
  renderStudioInspector();
}
window.switchInspectorTarget = switchInspectorTarget;

function switchInspectorSubtab(subtab) {
  studioInspectorState.activeSubtab = subtab;
  renderStudioInspector();
}
window.switchInspectorSubtab = switchInspectorSubtab;

function switchInspectorTab(tab) {
  if (tab === 'layer' || tab === 'clip') {
    studioInspectorState.targetType = tab;
  } else if (tab === 'fx') {
    studioInspectorState.targetType = 'master';
    studioInspectorState.activeSubtab = 'advanced';
  }
  renderStudioInspector();
}
window.switchInspectorTab = switchInspectorTab;

function setInspectorLayer(layerIdx) {
  studioInspectorState.targetType = 'layer';
  studioInspectorState.targetLayer = Number(layerIdx);
  renderStudioInspector();
}
window.setInspectorLayer = setInspectorLayer;

function setInspectorClip(clipId) {
  studioInspectorState.targetType = 'clip';
  studioInspectorState.targetClipId = clipId;
  renderStudioInspector();
}
window.setInspectorClip = setInspectorClip;

function nudgeClipPosition(clipId, dx, dy) {
  if (!clipId) return;
  const cur = getClipTransform(clipId);
  const nx = (cur.pos_x || 0) + dx;
  const ny = (cur.pos_y || 0) + dy;
  setClipTransform(clipId, { pos_x: nx, pos_y: ny });
  const inpX = document.getElementById('inp-clip-posx');
  const inpY = document.getElementById('inp-clip-posy');
  const rngX = document.getElementById('rng-clip-posx');
  const rngY = document.getElementById('rng-clip-posy');
  const dispX = document.getElementById('disp-clip-posx');
  const dispY = document.getElementById('disp-clip-posy');
  if (inpX) inpX.value = nx;
  if (inpY) inpY.value = ny;
  if (rngX) rngX.value = nx;
  if (rngY) rngY.value = ny;
  if (dispX) dispX.textContent = `${nx} px`;
  if (dispY) dispY.textContent = `${ny} px`;
}
window.nudgeClipPosition = nudgeClipPosition;

function centerClipPosition(clipId) {
  if (!clipId) return;
  setClipTransform(clipId, { pos_x: 0, pos_y: 0 });
  renderStudioInspector();
}
window.centerClipPosition = centerClipPosition;

function setClipLookPreset(clipId, presetName) {
  if (!clipId) return;
  switch (presetName) {
    case 'neutral':
      setClipTonal(clipId, { brightness: 0, contrast: 1.0, gamma: 1.0, saturation: 1.0, hue: 0, exposure: 1.0, temperature: 0 });
      break;
    case 'penumbra_dark':
      setClipTonal(clipId, { brightness: -0.12, contrast: 1.35, gamma: 0.9, saturation: 0.75, hue: 0, exposure: 0.95, temperature: -8 });
      break;
    case 'bw_contrast':
      setClipTonal(clipId, { brightness: -0.05, contrast: 1.6, gamma: 1.0, saturation: 0.0, hue: 0, exposure: 1.05, temperature: 0 });
      break;
    case 'cyber_cold':
      setClipTonal(clipId, { brightness: 0.02, contrast: 1.2, gamma: 0.95, saturation: 1.15, hue: 15, exposure: 1.0, temperature: -35 });
      break;
    case 'amber_dusk':
      setClipTonal(clipId, { brightness: -0.02, contrast: 1.15, gamma: 1.05, saturation: 1.1, hue: -5, exposure: 0.98, temperature: 38 });
      break;
    case 'bleach_bypass':
      setClipTonal(clipId, { brightness: 0.05, contrast: 1.5, gamma: 0.85, saturation: 0.4, hue: 0, exposure: 1.1, temperature: -5 });
      break;
  }
  renderStudioInspector();
  if (typeof showMacroToast === 'function') {
    showMacroToast(`[LOOK] Look "${presetName.replace(/_/g, ' ').toUpperCase()}" aplicado ao clipe`);
  }
}
window.setClipLookPreset = setClipLookPreset;

function renderStudioInspector() {
  const drawer = document.getElementById('studio-inspector-drawer');
  const container = document.getElementById('inspector-body-content');
  const badge = document.getElementById('inspector-target-badge');
  if (!drawer || !container) return;

  const targetType = studioInspectorState.targetType || 'clip';
  const subtab = studioInspectorState.activeSubtab || 'transform';

  // Synchronize target buttons
  const btnClip = document.getElementById('insp-target-clip');
  const btnLayer = document.getElementById('insp-target-layer');
  const btnMatte = document.getElementById('insp-target-matte');
  const btn3d = document.getElementById('insp-target-3d');
  const btnMaster = document.getElementById('insp-target-master');
  if (btnClip) btnClip.classList.toggle('active', targetType === 'clip');
  if (btnLayer) btnLayer.classList.toggle('active', targetType === 'layer');
  if (btnMatte) btnMatte.classList.toggle('active', targetType === 'matte');
  if (btn3d) btn3d.classList.toggle('active', targetType === '3d');
  if (btnMaster) btnMaster.classList.toggle('active', targetType === 'master');

  // Synchronize pin toggle button
  const pinBtn = document.getElementById('insp-pin-btn');
  const pinIcon = document.getElementById('insp-pin-icon');
  if (pinBtn) pinBtn.classList.toggle('pinned', Boolean(studioInspectorState.isPinned));
  if (pinIcon) pinIcon.textContent = studioInspectorState.isPinned ? '📌 FIXADO' : '⚡ SEGUIR';

  // Synchronize subtab buttons
  const btnSubTrans = document.getElementById('insp-subtab-transform');
  const btnSubColor = document.getElementById('insp-subtab-color');
  const btnSubAdv = document.getElementById('insp-subtab-advanced');
  if (btnSubTrans) {
    btnSubTrans.classList.toggle('active', subtab === 'transform');
    btnSubTrans.textContent = targetType === '3d' ? 'CENAS 3D' : 'GEOMETRIA';
  }
  if (btnSubColor) {
    btnSubColor.classList.toggle('active', subtab === 'color');
    btnSubColor.textContent = targetType === 'matte' ? 'VINHETA' : (targetType === '3d' ? 'PALETAS' : 'COR & LUZ');
  }
  if (btnSubAdv) {
    btnSubAdv.classList.toggle('active', subtab === 'advanced');
    btnSubAdv.textContent = targetType === 'matte' ? 'DINÂMICA' : (targetType === '3d' ? 'CÂMERA & KICK' : 'AVANÇADO');
  }

  let html = '';

  if (targetType === 'clip') {
    const baseClipId = appState.layers?.layer0?.clipId || 'clip_001';
    const cueClipId = appState.layers?.layer3?.clipId || 'clip_005';
    const targetClipId = studioInspectorState.targetClipId || cueClipId;
    const clip = (typeof allClips !== 'undefined' ? allClips : []).find(c => c.id === targetClipId) || { id: targetClipId, name: targetClipId };
    const tf = getClipTransform(targetClipId);
    const tn = getClipTonal(targetClipId);
    const clipTitle = clip.display_title || clip.filename || clip.name || targetClipId;

    // Common header for Clip
    const isSelectedFromPool = (targetClipId !== baseClipId && targetClipId !== cueClipId);
    html += `
      <div class="insp-section">
        <div class="insp-sec-title">CLIPE EM FOCO</div>
        <div class="insp-pills-row">
          ${isSelectedFromPool ? `
            <button class="insp-layer-pill active" title="Clipe selecionado no Media Pool">
              🎬 SELECIONADO (${clipTitle.slice(0, 10)})
            </button>
          ` : ''}
          <button class="insp-layer-pill ${targetClipId === baseClipId ? 'active' : ''}" onclick="setInspectorClip('${baseClipId}')">
            PGM A (AO VIVO)
          </button>
          <button class="insp-layer-pill ${targetClipId === cueClipId ? 'active' : ''}" onclick="setInspectorClip('${cueClipId}')">
            CUE B (PRÓXIMO)
          </button>
        </div>
        <div class="insp-clip-name-box" title="${clipTitle}">
          <strong>${clipTitle}</strong>
          ${(targetClipId === baseClipId) ? '<span class="text-cyan">[NO AR · PGM A]</span>' : (targetClipId === cueClipId) ? '<span class="text-emerald">[EM CUE · BUS B]</span>' : '<span style="color:#f59e0b;">[MEDIA POOL]</span>'}
        </div>
        <div class="insp-routes-strip" style="margin-top:6px;">
          <button class="btn-insp-route ${targetClipId === baseClipId ? 'assigned' : ''}" onclick="routeClipToBus('${targetClipId}', 'A'); renderStudioInspector();" title="Disparar no Program Master A">
            ▶ DISPARAR NO PGM A
          </button>
          <button class="btn-insp-route ${targetClipId === cueClipId ? 'assigned' : ''}" onclick="routeClipToBus('${targetClipId}', 'B'); renderStudioInspector();" title="Armar no Preview Cue B">
            ● ARMAR NO CUE B
          </button>
          <button class="btn-insp-route" onclick="if(window.routeClipToLayer){ routeClipToLayer('${targetClipId}', 'layer5'); } else if(appState.layers.layer5){ appState.layers.layer5.clipId = '${targetClipId}'; } renderStudioInspector();" title="Enviar para Overlay L5">
            ▲ ENVIAR PARA L5
          </button>
        </div>
      </div>
    `;

    if (subtab === 'transform') {
      const rot = tf.rotation || 0;
      const fit = tf.fit_mode || 'fill';
      const sc = tf.scale !== undefined ? tf.scale : 1.0;
      const px = tf.pos_x || 0;
      const py = tf.pos_y || 0;
      const op = tf.opacity !== undefined ? tf.opacity : 1.0;

      html += `
        <!-- GEOMETRIA E ENQUADRAMENTO -->
        <div class="insp-section">
          <div class="insp-sec-title">ROTAÇÃO & ESPELHAMENTO</div>
          <div class="insp-control-row">
            <span class="insp-label">ROTAÇÃO (ÂNGULO)</span>
            <div class="insp-pills-row">
              <button class="insp-btn-pill ${rot === 0 ? 'active' : ''}" onclick="setClipTransform('${targetClipId}', { rotation: 0 }); renderStudioInspector();">0°</button>
              <button class="insp-btn-pill ${rot === -90 ? 'active' : ''}" onclick="setClipTransform('${targetClipId}', { rotation: -90 }); renderStudioInspector();">↺ -90°</button>
              <button class="insp-btn-pill ${rot === 90 ? 'active' : ''}" onclick="setClipTransform('${targetClipId}', { rotation: 90 }); renderStudioInspector();">↻ +90°</button>
              <button class="insp-btn-pill ${rot === 180 ? 'active' : ''}" onclick="setClipTransform('${targetClipId}', { rotation: 180 }); renderStudioInspector();">180°</button>
            </div>
          </div>

          <div class="insp-control-row">
            <span class="insp-label">ESPELHAMENTO (FLIP)</span>
            <div class="insp-pills-row">
              <button class="insp-btn-pill ${tf.flip_h ? 'active' : ''}" onclick="setClipTransform('${targetClipId}', { flip_h: !${Boolean(tf.flip_h)} }); renderStudioInspector();">
                ⇄ FLIP H ${tf.flip_h ? '✓' : ''}
              </button>
              <button class="insp-btn-pill ${tf.flip_v ? 'active' : ''}" onclick="setClipTransform('${targetClipId}', { flip_v: !${Boolean(tf.flip_v)} }); renderStudioInspector();">
                ⇅ FLIP V ${tf.flip_v ? '✓' : ''}
              </button>
            </div>
          </div>

          <div class="insp-control-row">
            <span class="insp-label">ENQUADRAMENTO (FIT MODE)</span>
            <div class="insp-pills-row">
              <button class="insp-btn-pill ${fit === 'fill' ? 'active' : ''}" onclick="setClipTransform('${targetClipId}', { fit_mode: 'fill' }); renderStudioInspector();">FILL</button>
              <button class="insp-btn-pill ${fit === 'fit' ? 'active' : ''}" onclick="setClipTransform('${targetClipId}', { fit_mode: 'fit' }); renderStudioInspector();">FIT</button>
              <button class="insp-btn-pill ${fit === 'wings' ? 'active' : ''}" onclick="setClipTransform('${targetClipId}', { fit_mode: 'wings' }); renderStudioInspector();">WINGS</button>
              <button class="insp-btn-pill ${fit === 'stretch' ? 'active' : ''}" onclick="setClipTransform('${targetClipId}', { fit_mode: 'stretch' }); renderStudioInspector();">STRETCH</button>
            </div>
          </div>
        </div>

        <div class="insp-section">
          <div class="insp-sec-title">ESCALA & ZOOM INTRÍNSECO</div>
          <div class="insp-control-row">
            <div class="insp-label-val">
              <span>ESCALA</span>
              <span class="insp-val-disp" id="disp-clip-scale">${Math.round(sc * 100)}% (${sc.toFixed(2)}x)</span>
            </div>
            <input type="range" min="20" max="300" value="${Math.round(sc * 100)}" class="insp-range" oninput="const v = this.value / 100.0; setClipTransform('${targetClipId}', { scale: v }); document.getElementById('disp-clip-scale').textContent = Math.round(v * 100) + '% (' + v.toFixed(2) + 'x)';">
          </div>
          <div class="insp-pills-row" style="margin-top: 4px;">
            ${[0.5, 0.75, 1.0, 1.5, 2.0].map(sVal => `
              <button class="insp-btn-pill ${Math.abs(sc - sVal) < 0.04 ? 'active' : ''}" onclick="setClipTransform('${targetClipId}', { scale: ${sVal} }); renderStudioInspector();">
                ${Math.round(sVal * 100)}%
              </button>
            `).join('')}
          </div>
        </div>

        <div class="insp-section">
          <div class="insp-sec-title">POSICIONAMENTO (OFFSET X / Y)</div>
          <div class="insp-desc">Ajuste individual de posição por deslocamento e botões de micro-nudge.</div>

          <div class="insp-control-row">
            <div class="insp-label-val">
              <span>POSIÇÃO X (HORIZONTAL)</span>
              <span class="insp-val-disp" id="disp-clip-posx">${px} px</span>
            </div>
            <div class="insp-flex-input-row">
              <input type="range" min="-500" max="500" value="${px}" class="insp-range" id="rng-clip-posx" oninput="const v = Number(this.value); setClipTransform('${targetClipId}', { pos_x: v }); document.getElementById('disp-clip-posx').textContent = v + ' px'; document.getElementById('inp-clip-posx').value = v;">
              <input type="number" value="${px}" step="5" class="insp-num-input" id="inp-clip-posx" onchange="const v = Number(this.value); setClipTransform('${targetClipId}', { pos_x: v }); document.getElementById('disp-clip-posx').textContent = v + ' px'; document.getElementById('rng-clip-posx').value = v;">
            </div>
          </div>

          <div class="insp-control-row">
            <div class="insp-label-val">
              <span>POSIÇÃO Y (VERTICAL)</span>
              <span class="insp-val-disp" id="disp-clip-posy">${py} px</span>
            </div>
            <div class="insp-flex-input-row">
              <input type="range" min="-500" max="500" value="${py}" class="insp-range" id="rng-clip-posy" oninput="const v = Number(this.value); setClipTransform('${targetClipId}', { pos_y: v }); document.getElementById('disp-clip-posy').textContent = v + ' px'; document.getElementById('inp-clip-posy').value = v;">
              <input type="number" value="${py}" step="5" class="insp-num-input" id="inp-clip-posy" onchange="const v = Number(this.value); setClipTransform('${targetClipId}', { pos_y: v }); document.getElementById('disp-clip-posy').textContent = v + ' px'; document.getElementById('rng-clip-posy').value = v;">
            </div>
          </div>

          <!-- NUDGE PAD -->
          <div class="insp-nudge-pad" style="margin-top: 6px;">
            <button class="insp-btn-nudge" onclick="nudgeClipPosition('${targetClipId}', -10, 0)" title="Mover 10px para esquerda">◄ -10px X</button>
            <button class="insp-btn-nudge" onclick="nudgeClipPosition('${targetClipId}', 0, -10)" title="Mover 10px para cima">▲ -10px Y</button>
            <button class="insp-btn-nudge" onclick="centerClipPosition('${targetClipId}')" title="Resetar centro para (0, 0)">[0, 0] CENTRO</button>
            <button class="insp-btn-nudge" onclick="nudgeClipPosition('${targetClipId}', 0, 10)" title="Mover 10px para baixo">▼ +10px Y</button>
            <button class="insp-btn-nudge" onclick="nudgeClipPosition('${targetClipId}', 10, 0)" title="Mover 10px para direita">► +10px X</button>
          </div>
        </div>

        <div class="insp-section">
          <div class="insp-control-row">
            <div class="insp-label-val">
              <span>OPACIDADE DO CLIPE</span>
              <span class="insp-val-disp" id="disp-clip-opac">${Math.round(op * 100)}%</span>
            </div>
            <input type="range" min="0" max="100" value="${Math.round(op * 100)}" class="insp-range" oninput="const v = this.value / 100.0; setClipTransform('${targetClipId}', { opacity: v }); document.getElementById('disp-clip-opac').textContent = Math.round(v * 100) + '%';">
          </div>

          <div style="margin-top: 10px;">
            <button class="insp-btn-danger-outline" onclick="resetClipTransform('${targetClipId}'); renderStudioInspector();">
              ↺ RESETAR GEOMETRIA DO CLIPE
            </button>
          </div>
        </div>
      `;
    } else if (subtab === 'color') {
      const exp = tn.exposure !== undefined ? tn.exposure : 1.0;
      const br = tn.brightness || 0;
      const co = tn.contrast !== undefined ? tn.contrast : 1.0;
      const ga = tn.gamma !== undefined ? tn.gamma : 1.0;
      const sa = tn.saturation !== undefined ? tn.saturation : 1.0;
      const tp = tn.temperature || 0;
      const hu = tn.hue || 0;

      html += `
        <!-- PRESETS DE LOOK DE 1-CLIQUE -->
        <div class="insp-section">
          <div class="insp-sec-title">LOOKS RÁPIDOS (FILM & VJ GRADES)</div>
          <div class="insp-looks-grid">
            <button class="insp-btn-look" onclick="setClipLookPreset('${targetClipId}', 'neutral')">NEUTRO</button>
            <button class="insp-btn-look" onclick="setClipLookPreset('${targetClipId}', 'penumbra_dark')">PENUMBRA DARK</button>
            <button class="insp-btn-look" onclick="setClipLookPreset('${targetClipId}', 'bw_contrast')">HIGH B&W</button>
            <button class="insp-btn-look" onclick="setClipLookPreset('${targetClipId}', 'cyber_cold')">CYBER COLD</button>
            <button class="insp-btn-look" onclick="setClipLookPreset('${targetClipId}', 'amber_dusk')">AMBER DUSK</button>
            <button class="insp-btn-look" onclick="setClipLookPreset('${targetClipId}', 'bleach_bypass')">BLEACH BYPASS</button>
          </div>
        </div>

        <!-- CONTROLES ESSENCIAIS DE COR E LUZ -->
        <div class="insp-section">
          <div class="insp-sec-title">LUMINÂNCIA & CURVA TONAL</div>

          <div class="insp-control-row">
            <div class="insp-label-val">
              <span>EXPOSIÇÃO / GANHO GERAL</span>
              <span class="insp-val-disp text-cyan" id="disp-tn-exp">${exp.toFixed(2)}x</span>
            </div>
            <input type="range" min="20" max="250" value="${Math.round(exp * 100)}" class="insp-range" oninput="const v = this.value / 100.0; setClipTonal('${targetClipId}', { exposure: v }); document.getElementById('disp-tn-exp').textContent = v.toFixed(2) + 'x';">
          </div>

          <div class="insp-control-row">
            <div class="insp-label-val">
              <span>BLACK PEDESTAL / LIFT (PRETOS)</span>
              <span class="insp-val-disp" id="disp-tn-lift">${br.toFixed(2)}</span>
            </div>
            <input type="range" min="-40" max="40" value="${Math.round(br * 100)}" class="insp-range" oninput="const v = this.value / 100.0; setClipTonal('${targetClipId}', { brightness: v }); document.getElementById('disp-tn-lift').textContent = v.toFixed(2);">
          </div>

          <div class="insp-control-row">
            <div class="insp-label-val">
              <span>CONTRASTE</span>
              <span class="insp-val-disp" id="disp-tn-cont">${co.toFixed(2)}x</span>
            </div>
            <input type="range" min="50" max="250" value="${Math.round(co * 100)}" class="insp-range" oninput="const v = this.value / 100.0; setClipTonal('${targetClipId}', { contrast: v }); document.getElementById('disp-tn-cont').textContent = v.toFixed(2) + 'x';">
          </div>

          <div class="insp-control-row">
            <div class="insp-label-val">
              <span>GAMMA (TONS MÉDIOS)</span>
              <span class="insp-val-disp" id="disp-tn-gamma">${ga.toFixed(2)}</span>
            </div>
            <input type="range" min="50" max="200" value="${Math.round(ga * 100)}" class="insp-range" oninput="const v = this.value / 100.0; setClipTonal('${targetClipId}', { gamma: v }); document.getElementById('disp-tn-gamma').textContent = v.toFixed(2);">
          </div>
        </div>

        <div class="insp-section">
          <div class="insp-sec-title">CROMINÂNCIA & BALANÇO DE BRANCO</div>

          <div class="insp-control-row">
            <div class="insp-label-val">
              <span>SATURAÇÃO</span>
              <span class="insp-val-disp" id="disp-tn-sat">${Math.round(sa * 100)}%</span>
            </div>
            <input type="range" min="0" max="200" value="${Math.round(sa * 100)}" class="insp-range" oninput="const v = this.value / 100.0; setClipTonal('${targetClipId}', { saturation: v }); document.getElementById('disp-tn-sat').textContent = Math.round(v * 100) + '%';">
          </div>

          <div class="insp-control-row">
            <div class="insp-label-val">
              <span>TEMPERATURA KELVIN</span>
              <span class="insp-val-disp" id="disp-tn-temp">${tp > 0 ? '+' + tp + ' (QUENTE)' : tp < 0 ? tp + ' (FRIO)' : '0 (NEUTRO)'}</span>
            </div>
            <input type="range" min="-50" max="50" value="${tp}" class="insp-range" oninput="const v = Number(this.value); setClipTonal('${targetClipId}', { temperature: v }); document.getElementById('disp-tn-temp').textContent = (v > 0 ? '+' + v + ' (QUENTE)' : v < 0 ? v + ' (FRIO)' : '0 (NEUTRO)');">
          </div>

          <div class="insp-control-row">
            <div class="insp-label-val">
              <span>MATIZ / HUE ROTATION</span>
              <span class="insp-val-disp" id="disp-tn-hue">${hu}°</span>
            </div>
            <input type="range" min="-180" max="180" value="${hu}" class="insp-range" oninput="const v = Number(this.value); setClipTonal('${targetClipId}', { hue: v }); document.getElementById('disp-tn-hue').textContent = v + '°';">
          </div>

          <div style="margin-top: 10px;">
            <button class="insp-btn-danger-outline" onclick="resetClipTonal('${targetClipId}'); renderStudioInspector();">
              ↺ RESETAR COR & LUZ (PADRÃO NEUTRO)
            </button>
          </div>
        </div>
      `;
    } else if (subtab === 'advanced') {
      html += `
        <!-- CLIP MATTE SELECTION -->
        <div class="insp-section">
          <div class="insp-sec-title">MÁSCARA MATTE DO CLIPE</div>
          <div class="insp-control-row">
            <div class="insp-label-val">
              <span>SELETOR DE MÁSCARA</span>
              <button class="insp-btn-ghost-sm ${tf.matte_invert ? 'active' : ''}" onclick="setClipTransform('${targetClipId}', { matte_invert: !${Boolean(tf.matte_invert)} }); renderStudioInspector();">
                ${tf.matte_invert ? 'INVERTIDO: SIM' : 'INVERTER: NÃO'}
              </button>
            </div>
            <select class="insp-select" onchange="setClipTransform('${targetClipId}', { matte: this.value }); renderStudioInspector();">
              <option value="none" ${(!tf.matte || tf.matte === 'none') ? 'selected' : ''}>PASSTHROUGH (SEM MÁSCARA)</option>
              ${(allMattes || []).map(m => `
                <option value="${m.path || m.filename}" ${(tf.matte === m.path || tf.matte === m.filename) ? 'selected' : ''}>${m.name || m.filename}</option>
              `).join('')}
            </select>
          </div>
        </div>

        <!-- FX TARGET ROUTING -->
        <div class="insp-section">
          <div class="insp-sec-title">ROTEAMENTO DE FX</div>
          <div class="insp-control-row">
            <span class="insp-label">BARRAMENTO DE DESTINO</span>
            <div class="insp-pills-row">
              ${['master', 'deck_a', 'deck_b'].map(tgt => `
                <button class="insp-btn-pill ${(appState.fx?.target || 'master') === tgt ? 'active' : ''}" onclick="if(appState.fx) appState.fx.target = '${tgt}'; renderStudioInspector();">
                  ${tgt.toUpperCase()}
                </button>
              `).join('')}
            </div>
          </div>
        </div>
      `;
    }

    container.innerHTML = html;
  } else if (targetType === 'layer') {
    const lIdx = studioInspectorState.targetLayer !== undefined ? studioInspectorState.targetLayer : 2;
    const lKey = `layer${lIdx}`;
    const layer = (appState.layers && appState.layers[lKey]) || {};
    const layerNames = ['L0 BASE', 'L1 DOUBLE', 'L2 FIND EDGES', 'L3 CUE QUEUE', 'L4 DIFFERENCE', 'L5 OVERLAY'];
    if (badge) badge.textContent = `CAMADA: ${layerNames[lIdx] || `L${lIdx}`}`;

    html += `
      <!-- LAYER PICKER STRIP -->
      <div class="insp-section">
        <div class="insp-sec-title">CAMADA EM FOCO</div>
        <div class="insp-pills-row">
          ${[0, 1, 2, 3, 4, 5].map(idx => `
            <button class="insp-layer-pill ${idx === lIdx ? 'active' : ''}" onclick="setInspectorLayer(${idx})">
              L${idx}${idx === 2 ? ' EDGES' : ''}
            </button>
          `).join('')}
        </div>
      </div>

      <!-- MAIN LAYER STATE -->
      <div class="insp-section">
        <div class="insp-row-between">
          <span class="insp-label">ESTADO DA CAMADA</span>
          <div class="insp-btn-group">
            <button class="insp-btn-toggle ${layer.active ? 'active-green' : ''}" onclick="toggleLayerActive('${lKey}'); renderStudioInspector();">
              ${layer.active ? 'ATIVO' : 'MUTADO'}
            </button>
            <button class="insp-btn-solo" onclick="if(window.penumbraMidi){ window.penumbraMidi.soloLayer(${lIdx}); } else { toggleLayerActive('${lKey}'); } renderStudioInspector();" title="Isolar esta camada em Solo">
              SOLO
            </button>
            <button class="insp-btn-ghost" onclick="if(window.penumbraMidi){ window.penumbraMidi.unsoloAll(); } renderStudioInspector();" title="Restaurar todas as camadas">
              UNSOLO ALL
            </button>
          </div>
        </div>

        <div class="insp-control-row">
          <div class="insp-label-val">
            <span>OPACIDADE DA CAMADA</span>
            <span class="insp-val-disp" id="insp-disp-opac">${Math.round((layer.opacity !== undefined ? layer.opacity : 1.0) * 100)}%</span>
          </div>
          <input type="range" min="0" max="100" value="${Math.round((layer.opacity !== undefined ? layer.opacity : 1.0) * 100)}" class="insp-range" oninput="onLayerOpacityChange('${lKey}', this.value); document.getElementById('insp-disp-opac').textContent = this.value + '%';">
        </div>

        <div class="insp-control-row">
          <div class="insp-label-val">
            <span>MODO DE BLEND</span>
            <span class="insp-val-disp">${layer.blend || 'Normal'}</span>
          </div>
          <select class="insp-select" onchange="onLayerBlendChange('${lKey}', this.value); renderStudioInspector();">
            ${['Normal', 'Screen', 'Lighten', 'Multiply', 'Difference', 'Soft_Light', 'Overlay'].map(b => `
              <option value="${b}" ${(layer.blend || 'Normal').toLowerCase() === b.toLowerCase() ? 'selected' : ''}>${b}</option>
            `).join('')}
          </select>
        </div>
      </div>
    `;

    if (subtab === 'transform') {
      const rot = layer.rotation || 0;
      const fit = layer.fit_mode || 'fill';
      const sc = layer.scale !== undefined ? layer.scale : 1.0;
      const px = layer.pos_x || 0;
      const py = layer.pos_y || 0;

      html += `
        <div class="insp-section">
          <div class="insp-sec-title">GEOMETRIA & ENQUADRAMENTO DA CAMADA</div>
          <div class="insp-control-row">
            <span class="insp-label">ORIENTAÇÃO / ROTAÇÃO</span>
            <div class="insp-pills-row">
              <button class="insp-btn-pill ${rot === 0 ? 'active' : ''}" onclick="setLayerRotation('${lKey}', 0); renderStudioInspector();">0°</button>
              <button class="insp-btn-pill ${rot === -90 ? 'active' : ''}" onclick="setLayerRotation('${lKey}', -90); renderStudioInspector();">↺ -90°</button>
              <button class="insp-btn-pill ${rot === 90 ? 'active' : ''}" onclick="setLayerRotation('${lKey}', 90); renderStudioInspector();">↻ +90°</button>
              <button class="insp-btn-pill ${rot === 180 ? 'active' : ''}" onclick="setLayerRotation('${lKey}', 180); renderStudioInspector();">180°</button>
            </div>
          </div>

          <div class="insp-control-row">
            <span class="insp-label">MODO DE FIT</span>
            <div class="insp-pills-row">
              <button class="insp-btn-pill ${fit === 'fill' ? 'active' : ''}" onclick="setLayerFitMode('${lKey}', 'fill'); renderStudioInspector();">FILL</button>
              <button class="insp-btn-pill ${fit === 'fit' ? 'active' : ''}" onclick="setLayerFitMode('${lKey}', 'fit'); renderStudioInspector();">FIT</button>
              <button class="insp-btn-pill ${fit === 'wings' ? 'active' : ''}" onclick="setLayerFitMode('${lKey}', 'wings'); renderStudioInspector();">WINGS</button>
            </div>
          </div>

          <div class="insp-control-row">
            <div class="insp-label-val">
              <span>ESCALA DA CAMADA</span>
              <span class="insp-val-disp" id="disp-layer-sc">${sc.toFixed(2)}x</span>
            </div>
            <input type="range" min="50" max="250" value="${Math.round(sc * 100)}" class="insp-range" oninput="const v = this.value / 100.0; setLayerScale('${lKey}', v); document.getElementById('disp-layer-sc').textContent = v.toFixed(2) + 'x';">
          </div>

          <div class="insp-control-row">
            <div class="insp-label-val">
              <span>POSIÇÃO X (HORIZONTAL)</span>
              <span class="insp-val-disp" id="disp-layer-posx">${px} px</span>
            </div>
            <div class="insp-flex-input-row">
              <input type="range" min="-600" max="600" value="${px}" class="insp-range" id="rng-layer-posx" oninput="const v = Number(this.value); appState.layers['${lKey}'].pos_x = v; document.getElementById('disp-layer-posx').textContent = v + ' px'; document.getElementById('inp-layer-posx').value = v; updateTimelineTransformInspector();">
              <input type="number" value="${px}" step="5" class="insp-num-input" id="inp-layer-posx" onchange="const v = Number(this.value); appState.layers['${lKey}'].pos_x = v; document.getElementById('disp-layer-posx').textContent = v + ' px'; document.getElementById('rng-layer-posx').value = v; updateTimelineTransformInspector();">
            </div>
          </div>

          <div class="insp-control-row">
            <div class="insp-label-val">
              <span>POSIÇÃO Y (VERTICAL)</span>
              <span class="insp-val-disp" id="disp-layer-posy">${py} px</span>
            </div>
            <div class="insp-flex-input-row">
              <input type="range" min="-600" max="600" value="${py}" class="insp-range" id="rng-layer-posy" oninput="const v = Number(this.value); appState.layers['${lKey}'].pos_y = v; document.getElementById('disp-layer-posy').textContent = v + ' px'; document.getElementById('inp-layer-posy').value = v; updateTimelineTransformInspector();">
              <input type="number" value="${py}" step="5" class="insp-num-input" id="inp-layer-posy" onchange="const v = Number(this.value); appState.layers['${lKey}'].pos_y = v; document.getElementById('disp-layer-posy').textContent = v + ' px'; document.getElementById('rng-layer-posy').value = v; updateTimelineTransformInspector();">
            </div>
          </div>

          <!-- NUDGE PAD -->
          <div class="insp-nudge-pad" style="margin-top: 6px;">
            <button class="insp-btn-nudge" onclick="nudgeLayerPosition('${lKey}', -10, 0)" title="Mover 10px para esquerda">◄ -10px X</button>
            <button class="insp-btn-nudge" onclick="nudgeLayerPosition('${lKey}', 0, -10)" title="Mover 10px para cima">▲ -10px Y</button>
            <button class="insp-btn-nudge" onclick="centerLayerPosition('${lKey}')" title="Resetar centro para (0, 0)">[0, 0] CENTRO</button>
            <button class="insp-btn-nudge" onclick="nudgeLayerPosition('${lKey}', 0, 10)" title="Mover 10px para baixo">▼ +10px Y</button>
            <button class="insp-btn-nudge" onclick="nudgeLayerPosition('${lKey}', 10, 0)" title="Mover 10px para direita">► +10px X</button>
          </div>

          <div style="margin-top: 10px;">
            <button class="insp-btn-danger-outline" onclick="resetLayerTransform('${lKey}');">
              ↺ RESETAR GEOMETRIA DA CAMADA
            </button>
          </div>
        </div>
      `;
    } else if (subtab === 'color') {
      if (lIdx === 2) {
        const lumBoost = (layer.luminance !== undefined ? layer.luminance : (appState.tonal?.edge_luminance || 2.8));
        const edgeWidth = (layer.edge_width !== undefined ? layer.edge_width : (appState.tonal?.edge_width || 2.2));
        const edgeThresh = (layer.edge_threshold !== undefined ? layer.edge_threshold : (appState.tonal?.edge_threshold || 0.28));
        const edgeMix = (layer.edge_mix !== undefined ? layer.edge_mix : (appState.tonal?.edge_mix || 0.85));

        html += `
          <div class="insp-section insp-highlight-card">
            <div class="insp-sec-title insp-cyan-title">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M2 12h20"></path></svg>
              FIND EDGES · CONTORNO & LUMINÂNCIA (L2)
            </div>
            <div class="insp-desc">Contornos Sobel acima da imagem principal. Luminância elevada garante brancos puros e destacados no projetor.</div>

            <div class="insp-control-row">
              <div class="insp-label-val">
                <span>LUMINÂNCIA DOS BRANCOS (WHITE GAIN)</span>
                <span class="insp-val-disp text-cyan" id="disp-l2-lum">${lumBoost.toFixed(1)}x</span>
              </div>
              <input type="range" min="10" max="50" value="${Math.round(lumBoost * 10)}" class="insp-range" oninput="const v = this.value / 10.0; layer2_setLuminance(v); document.getElementById('disp-l2-lum').textContent = v.toFixed(1) + 'x';">
            </div>

            <div class="insp-control-row">
              <div class="insp-label-val">
                <span>LIMIAR DE BORDA (THRESHOLD)</span>
                <span class="insp-val-disp" id="disp-l2-thresh">${Math.round(edgeThresh * 100)}%</span>
              </div>
              <input type="range" min="5" max="85" value="${Math.round(edgeThresh * 100)}" class="insp-range" oninput="const v = this.value / 100.0; layer2_setThreshold(v); document.getElementById('disp-l2-thresh').textContent = Math.round(v * 100) + '%';">
            </div>

            <div class="insp-control-row">
              <div class="insp-label-val">
                <span>ESPESSURA DO TRAÇADO (EDGE WIDTH)</span>
                <span class="insp-val-disp" id="disp-l2-width">${edgeWidth.toFixed(1)} px</span>
              </div>
              <input type="range" min="10" max="45" value="${Math.round(edgeWidth * 10)}" class="insp-range" oninput="const v = this.value / 10.0; layer2_setWidth(v); document.getElementById('disp-l2-width').textContent = v.toFixed(1) + ' px';">
            </div>

            <div class="insp-control-row">
              <div class="insp-label-val">
                <span>MIX DIRETO DO FIND EDGES</span>
                <span class="insp-val-disp" id="disp-l2-mix">${Math.round(edgeMix * 100)}%</span>
              </div>
              <input type="range" min="0" max="100" value="${Math.round(edgeMix * 100)}" class="insp-range" oninput="const v = this.value / 100.0; layer2_setMix(v); document.getElementById('disp-l2-mix').textContent = Math.round(v * 100) + '%';">
            </div>
          </div>
        `;
      } else {
        html += `
          <div class="insp-section">
            <div class="insp-sec-title">AJUSTE TONAL DA CAMADA L${lIdx}</div>
            <div class="insp-desc">Ajuste de transparência e composição com os demais barramentos.</div>
            <div class="insp-control-row">
              <div class="insp-label-val">
                <span>OPACIDADE</span>
                <span class="insp-val-disp">${Math.round((layer.opacity !== undefined ? layer.opacity : 1.0) * 100)}%</span>
              </div>
              <input type="range" min="0" max="100" value="${Math.round((layer.opacity !== undefined ? layer.opacity : 1.0) * 100)}" class="insp-range" oninput="onLayerOpacityChange('${lKey}', this.value);">
            </div>
          </div>
        `;
      }
    } else if (subtab === 'advanced') {
      html += `
        <div class="insp-section">
          <div class="insp-sec-title">MÁSCARA DA CAMADA</div>
          <div class="insp-control-row">
            <div class="insp-label-val">
              <span>SELETOR DE MÁSCARA</span>
              <button class="insp-btn-ghost-sm ${layer.matte_invert ? 'active' : ''}" onclick="toggleLayerMatteInvert('${lKey}'); renderStudioInspector();">
                ${layer.matte_invert ? 'INVERTIDO: SIM' : 'INVERTER: NÃO'}
              </button>
            </div>
            <select class="insp-select" onchange="onLayerMatteChange('${lKey}', this.value); renderStudioInspector();">
              <option value="none" ${(!layer.matte || layer.matte === 'none') ? 'selected' : ''}>PASSTHROUGH (SEM MÁSCARA)</option>
              ${(allMattes || []).map(m => `
                <option value="${m.path || m.filename}" ${(layer.matte === m.path || layer.matte === m.filename) ? 'selected' : ''}>${m.name || m.filename}</option>
              `).join('')}
            </select>
          </div>

          ${(layer.matte && layer.matte !== 'none') ? `
            <div style="margin-top: 8px;">
              <button class="insp-btn-pill active" onclick="openStudioInspector('matte', '${layer.matte}')" style="width:100%; justify-content:center; padding:5px 8px;">
                🔍 INSPECIONAR PARÂMETROS DESTA MÁSCARA [MATTE INSP]
              </button>
            </div>
          ` : ''}
        </div>
      `;
    }

    container.innerHTML = html;
  } else if (targetType === 'master') {
    if (badge) badge.textContent = '🌐 MASTER & FX ENGINE';
    const tonal = appState.tonal || {};

    if (subtab === 'transform') {
      const curAspect = appState.aspectRatio || '16:9';
      const curFit = appState.aspect_fit_mode || 'fit';
      const isProjComp = Boolean(appState.projector_compensation);

      html += `
        <div class="insp-section">
          <div class="insp-sec-title">ENQUADRAMENTO MASTER (SAÍDA NDI / HDMI / POP-OUT)</div>
          <div class="insp-control-row">
            <span class="insp-label">PROPORÇÃO DA IMAGEM MASTER</span>
            <div class="insp-pills-row" style="flex-wrap: wrap;">
              <button class="insp-btn-pill ${curAspect === '16:9' ? 'active' : ''}" onclick="setAspectRatio('16:9'); renderStudioInspector();">16:9 HORIZ</button>
              <button class="insp-btn-pill ${curAspect === '9:16' ? 'active' : ''}" onclick="setAspectRatio('9:16'); renderStudioInspector();">9:16 VERT</button>
              <button class="insp-btn-pill ${curAspect === '1:1' ? 'active' : ''}" onclick="setAspectRatio('1:1'); renderStudioInspector();">1:1 SQUARE</button>
              <button class="insp-btn-pill ${curAspect === '4:5' ? 'active' : ''}" onclick="setAspectRatio('4:5'); renderStudioInspector();">4:5 SOCIAL</button>
              <button class="insp-btn-pill ${curAspect === '4:3' ? 'active' : ''}" onclick="setAspectRatio('4:3'); renderStudioInspector();">4:3 RETRÔ</button>
              <button class="insp-btn-pill ${curAspect === '21:9' ? 'active' : ''}" onclick="setAspectRatio('21:9'); renderStudioInspector();">21:9 ULTRA</button>
            </div>
          </div>

          <div class="insp-control-row">
            <span class="insp-label">ENQUADRAMENTO DE VÍDEOS DE PROPORÇÃO DIFERENTE</span>
            <div class="insp-pills-row">
              <button class="insp-btn-pill ${curFit === 'fit' ? 'active' : ''}" onclick="setDefaultFitMode('fit'); renderStudioInspector();" title="Preserva 100% da imagem com bordas pretas puras #000000">FIT (ZERO CROP)</button>
              <button class="insp-btn-pill ${curFit === 'fill' ? 'active' : ''}" onclick="setDefaultFitMode('fill'); renderStudioInspector();" title="Preenche a tela toda sem bordas pretas">FILL (CROP)</button>
              <button class="insp-btn-pill ${curFit === 'wings' ? 'active' : ''}" onclick="setDefaultFitMode('wings'); renderStudioInspector();" title="Preenchimento broadcast com asas espelhadas e desfoque suave">WINGS (BROADCAST)</button>
            </div>
          </div>

          <div class="insp-control-row">
            <span class="insp-label">ROTEAMENTO DE PROJETOR / TELÃO HDMI</span>
            <div class="insp-pills-row">
              <button class="insp-btn-pill ${!isProjComp ? 'active' : ''}" onclick="toggleProjectorCompensation(false); renderStudioInspector();" title="Telão comum na horizontal: vídeo vertical fica centralizado">⬍ NATIVO HORIZ</button>
              <button class="insp-btn-pill ${isProjComp ? 'active' : ''}" onclick="toggleProjectorCompensation(true); renderStudioInspector();" title="Projetor ou tela montada fisicamente em pé: gira saída 90° CCW">⤾ GIRAR 90° PROJETOR</button>
            </div>
          </div>
        </div>
      `;
    } else if (subtab === 'color') {
      html += `
        <div class="insp-section">
          <div class="insp-sec-title">COLOR & LEVELS (MASTER DECK)</div>

          <div class="insp-control-row">
            <div class="insp-label-val">
              <span>BLACK PEDESTAL (PRETOS)</span>
              <span class="insp-val-disp" id="disp-insp-bright">${(tonal.brightness || -0.05).toFixed(2)}</span>
            </div>
            <input type="range" min="-40" max="20" value="${Math.round((tonal.brightness || -0.05) * 100)}" class="insp-range" oninput="const v = this.value / 100.0; appState.tonal.brightness = v; document.getElementById('disp-insp-bright').textContent = v.toFixed(2);">
          </div>

          <div class="insp-control-row">
            <div class="insp-label-val">
              <span>CONTRAST (CONTRASTE)</span>
              <span class="insp-val-disp" id="disp-insp-contrast">${(tonal.contrast || 1.18).toFixed(2)}x</span>
            </div>
            <input type="range" min="80" max="220" value="${Math.round((tonal.contrast || 1.18) * 100)}" class="insp-range" oninput="const v = this.value / 100.0; appState.tonal.contrast = v; document.getElementById('disp-insp-contrast').textContent = v.toFixed(2) + 'x';">
          </div>

          <div class="insp-control-row">
            <div class="insp-label-val">
              <span>GAMMA (CURVA TONAL)</span>
              <span class="insp-val-disp" id="disp-insp-gamma">${(tonal.gamma || 0.85).toFixed(2)}</span>
            </div>
            <input type="range" min="50" max="180" value="${Math.round((tonal.gamma || 0.85) * 100)}" class="insp-range" oninput="const v = this.value / 100.0; appState.tonal.gamma = v; document.getElementById('disp-insp-gamma').textContent = v.toFixed(2);">
          </div>
        </div>

        <div class="insp-section">
          <div class="insp-sec-title">DIMMER MASTER & BLACKOUT DE EMERGÊNCIA</div>
          <div class="insp-control-row">
            <div class="insp-label-val">
              <span>DIMMER GERAL DA SAÍDA</span>
              <span class="insp-val-disp" id="disp-master-dimmer">${Math.round((appState.masterDimmer !== undefined ? appState.masterDimmer : 1.0) * 100)}%</span>
            </div>
            <input type="range" min="0" max="100" value="${Math.round((appState.masterDimmer !== undefined ? appState.masterDimmer : 1.0) * 100)}" class="insp-range" oninput="appState.masterDimmer = this.value / 100.0; document.getElementById('disp-master-dimmer').textContent = this.value + '%';">
          </div>
        </div>
      `;
    } else if (subtab === 'advanced') {
      html += `
        <div class="insp-section">
          <div class="insp-sec-title">ROTEAMENTO DE FX</div>
          <div class="insp-control-row">
            <span class="insp-label">DESTINO DOS EFEITOS</span>
            <div class="insp-pills-row">
              ${['master', 'deck_a', 'deck_b'].map(tgt => `
                <button class="insp-btn-pill ${(appState.fx?.target || 'master') === tgt ? 'active' : ''}" onclick="if(appState.fx) appState.fx.target = '${tgt}'; renderStudioInspector();">
                  ${tgt.toUpperCase()}
                </button>
              `).join('')}
            </div>
          </div>
        </div>

        <div class="insp-section">
          <div class="insp-sec-title">PLUGINS DE EFEITO (50 PRESETS EXPANDIDOS)</div>
          <div class="insp-desc">Selecione e ative presets estilizados de Pixel Sorter, Stretch, Modulation, Bad TV e RXXR.</div>
          <div class="insp-fx-quick-grid">
            ${[
              { id: 'pixel_stretch', name: 'PIXEL STRETCH' },
              { id: 'pixel_sorter', name: 'PIXEL SORTER' },
              { id: 'modulation', name: 'MODULATION' },
              { id: 'bad_tv', name: 'BAD TV' },
              { id: 'rxxr', name: 'RXXR ASCII' }
            ].map(p => {
              const presets = Object.keys(ROADMAP_PRESETS[p.id] || {});
              const isPlgActive = appState.fx && appState.fx[p.id] && appState.fx[p.id].enabled;
              return `
                <div class="insp-fx-card">
                  <div class="insp-fx-card-hdr">
                    <span style="font-weight:700; color:#fff;">${p.name}</span>
                    <button class="insp-btn-toggle-sm ${isPlgActive ? 'active' : ''}" onclick="toggleFxPluginEnabled('${p.id}'); renderStudioInspector();">
                      ${isPlgActive ? 'ON' : 'OFF'}
                    </button>
                  </div>
                  <div class="insp-presets-chips-flow">
                    ${presets.map(pr => `
                      <button class="insp-chip-pill" onclick="loadPluginPreset('${p.id}', '${pr}'); renderStudioInspector();" title="${pr}">
                        ${pr.replace(/_/g, ' ')}
                      </button>
                    `).join('')}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }

    container.innerHTML = html;
  } else if (targetType === 'matte') {
    const targetMattePath = studioInspectorState.targetMattePath || appState.layers?.layer3?.matte || appState.master_matte || (allMattes && allMattes[0]?.path) || 'cat_b_soft/matte_b_penumbra_vignette.png';
    const mConfig = getMatteConfig(targetMattePath) || (appState.matte || {});
    const tf = mConfig.transform || { pos_x: 0, pos_y: 0, scale: 1.0, scale_x: 1.0, scale_y: 1.0, rotation: 0 };
    const vig = mConfig.vignette || { enabled: false, roundness: 0.65, feather: 0.38, inner_radius: 0.42, outer_radius: 0.95, aspect_ratio: '16:9', audio_pulse: 0.15, audio_band: 'bass' };
    const def = mConfig.deform || { speed: 4.0, wiggle_pos: 8, wiggle_scale: 0.04, wiggle_rot: 0, sync_bpm: true };
    const activeMatteName = mConfig.name || getMatteName(targetMattePath);
    const thumbUrl = getMatteThumbUrl({ path: targetMattePath });
    if (badge) badge.textContent = `🎭 MATTE: ${activeMatteName.slice(0, 16)}`;

    // Layers currently using this matte
    const activeLayers = [];
    if (appState.layers?.layer0?.matte === targetMattePath) activeLayers.push('L0');
    if (appState.layers?.layer1?.matte === targetMattePath) activeLayers.push('L1');
    if (appState.layers?.layer2?.matte === targetMattePath) activeLayers.push('L2');
    if (appState.layers?.layer3?.matte === targetMattePath) activeLayers.push('L3');
    if (appState.layers?.layer4?.matte === targetMattePath) activeLayers.push('L4');
    if (appState.layers?.layer5?.matte === targetMattePath) activeLayers.push('L5');
    if (appState.master_matte === targetMattePath) activeLayers.push('MASTER');

    html += `
      <!-- MATTE SELECTION & DESTINATION LAYER -->
      <div class="insp-section insp-highlight-card">
        <div class="insp-matte-header-card">
          <div class="insp-matte-thumb" style="width:58px; height:38px; border-radius:4px; overflow:hidden; border:1px solid rgba(0,240,255,0.3); background:#000; flex-shrink:0;">
            <img src="${thumbUrl}" alt="${activeMatteName}" style="width:100%; height:100%; object-fit:contain;" onerror="this.src='${MATTE_SVG_FALLBACK}';">
          </div>
          <div style="flex:1; min-width:0;">
            <div style="font-size:10.5px; font-weight:700; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${activeMatteName}">${activeMatteName}</div>
            <div style="font-size:8.5px; color:rgba(255,255,255,0.6); display:flex; gap:4px; align-items:center; margin-top:2px;">
              <span>EM USO:</span>
              ${activeLayers.length > 0 ? activeLayers.map(l => `<span class="matte-active-pill" style="font-size:8px;">${l}</span>`).join('') : '<span style="color:var(--text-muted); font-size:8px;">STANDBY (NENHUMA)</span>'}
            </div>
          </div>
        </div>

        <div class="insp-control-row">
          <div class="insp-label-val">
            <span>TROCAR MÁSCARA EM FOCO</span>
            <span class="insp-val-disp text-cyan">${targetMattePath.split('/').pop().replace('.png', '').slice(0, 16)}</span>
          </div>
          <select class="insp-select" onchange="openStudioInspector('matte', this.value); renderStudioInspector();">
            ${(typeof allMattes !== 'undefined' ? allMattes : []).map(m => `
              <option value="${m.path || m.filename}" ${(targetMattePath === (m.path || m.filename)) ? 'selected' : ''}>
                ${m.name || m.filename}
              </option>
            `).join('')}
          </select>
        </div>

        <div class="insp-control-row" style="margin-top:6px;">
          <span class="insp-label">ATRIBUIR / VINCULAR À CAMADA</span>
          <div class="insp-pills-row">
            <button class="insp-btn-pill ${activeLayers.includes('L0') ? 'active' : ''}" onclick="assignMatteToLayer('${targetMattePath}', 'layer0')" title="Vincular a L0 (PGM)">+ L0</button>
            <button class="insp-btn-pill ${activeLayers.includes('L1') ? 'active' : ''}" onclick="assignMatteToLayer('${targetMattePath}', 'layer1')" title="Vincular a L1">+ L1</button>
            <button class="insp-btn-pill ${activeLayers.includes('L2') ? 'active' : ''}" onclick="assignMatteToLayer('${targetMattePath}', 'layer2')" title="Vincular a L2">+ L2</button>
            <button class="insp-btn-pill ${activeLayers.includes('L3') ? 'active' : ''}" onclick="assignMatteToLayer('${targetMattePath}', 'layer3')" title="Vincular a L3 (CUE)">+ L3</button>
            <button class="insp-btn-pill ${activeLayers.includes('L4') ? 'active' : ''}" onclick="assignMatteToLayer('${targetMattePath}', 'layer4')" title="Vincular a L4">+ L4</button>
            <button class="insp-btn-pill ${activeLayers.includes('L5') ? 'active' : ''}" onclick="assignMatteToLayer('${targetMattePath}', 'layer5')" title="Vincular a L5 (OVERLAY)">+ L5</button>
            <button class="insp-btn-pill ${activeLayers.includes('MASTER') ? 'active' : ''}" onclick="assignMatteToLayer('${targetMattePath}', 'master')" title="Vincular ao Master">+ MASTER</button>
          </div>
        </div>

        <div class="insp-row-between" style="margin-top: 8px;">
          <span class="insp-label">INVERTER RECORTE (ALPHA INVERT)</span>
          <button class="insp-btn-toggle ${mConfig.invert ? 'active' : ''}" onclick="setMatteConfig('${targetMattePath}', { invert: !${Boolean(mConfig.invert)} }); renderStudioInspector();">
            ${mConfig.invert ? 'INVERTIDO: SIM' : 'INVERTER: NÃO'}
          </button>
        </div>
      </div>
    `;

    if (subtab === 'transform') {
      const px = tf.pos_x || 0;
      const py = tf.pos_y || 0;
      const sc = tf.scale !== undefined ? tf.scale : 1.0;
      const scX = tf.scale_x !== undefined ? tf.scale_x : 1.0;
      const scY = tf.scale_y !== undefined ? tf.scale_y : 1.0;
      const rot = tf.rotation || 0;

      html += `
        <div class="insp-section">
          <div class="insp-sec-title">GEOMETRIA & POSICIONAMENTO DA MÁSCARA</div>
          
          <div class="insp-control-row">
            <div class="insp-label-val">
              <span>POSIÇÃO X</span>
              <span class="insp-val-disp" id="disp-matte-posx">${px} %</span>
            </div>
            <div class="insp-flex-input-row">
              <input type="range" min="-100" max="100" value="${px}" class="insp-range" id="rng-matte-posx" oninput="const v = Number(this.value); setMatteConfig('${targetMattePath}', { transform: { pos_x: v } }); document.getElementById('disp-matte-posx').textContent = v + ' %'; document.getElementById('inp-matte-posx').value = v;">
              <input type="number" value="${px}" step="2" class="insp-num-input" id="inp-matte-posx" onchange="const v = Number(this.value); setMatteConfig('${targetMattePath}', { transform: { pos_x: v } }); document.getElementById('disp-matte-posx').textContent = v + ' %'; document.getElementById('rng-matte-posx').value = v;">
            </div>
          </div>

          <div class="insp-control-row">
            <div class="insp-label-val">
              <span>POSIÇÃO Y</span>
              <span class="insp-val-disp" id="disp-matte-posy">${py} %</span>
            </div>
            <div class="insp-flex-input-row">
              <input type="range" min="-100" max="100" value="${py}" class="insp-range" id="rng-matte-posy" oninput="const v = Number(this.value); setMatteConfig('${targetMattePath}', { transform: { pos_y: v } }); document.getElementById('disp-matte-posy').textContent = v + ' %'; document.getElementById('inp-matte-posy').value = v;">
              <input type="number" value="${py}" step="2" class="insp-num-input" id="inp-matte-posy" onchange="const v = Number(this.value); setMatteConfig('${targetMattePath}', { transform: { pos_y: v } }); document.getElementById('disp-matte-posy').textContent = v + ' %'; document.getElementById('rng-matte-posy').value = v;">
            </div>
          </div>

          <!-- NUDGE PAD -->
          <div class="insp-nudge-pad" style="margin-top: 6px;">
            <button class="insp-btn-nudge" onclick="nudgeMattePosition('${targetMattePath}', -5, 0)" title="Mover 5% para esquerda">◄ -5% X</button>
            <button class="insp-btn-nudge" onclick="nudgeMattePosition('${targetMattePath}', 0, -5)" title="Mover 5% para cima">▲ -5% Y</button>
            <button class="insp-btn-nudge" onclick="centerMattePosition('${targetMattePath}')" title="Resetar centro para (0, 0)">[0, 0] CENTRO</button>
            <button class="insp-btn-nudge" onclick="nudgeMattePosition('${targetMattePath}', 0, 5)" title="Mover 5% para baixo">▼ +5% Y</button>
            <button class="insp-btn-nudge" onclick="nudgeMattePosition('${targetMattePath}', 5, 0)" title="Mover 5% para direita">► +5% X</button>
          </div>

          <div class="insp-control-row" style="margin-top: 8px;">
            <div class="insp-label-val">
              <span>ESCALA UNIFORME</span>
              <span class="insp-val-disp" id="disp-matte-sc">${sc.toFixed(2)}x</span>
            </div>
            <input type="range" min="20" max="300" value="${Math.round(sc * 100)}" class="insp-range" oninput="const v = this.value / 100.0; setMatteConfig('${targetMattePath}', { transform: { scale: v } }); document.getElementById('disp-matte-sc').textContent = v.toFixed(2) + 'x';">
          </div>

          <div class="insp-control-row">
            <div class="insp-label-val">
              <span>ALONGAMENTO ANAMÓRFICO (SCALE X / Y)</span>
              <span class="insp-val-disp">${scX.toFixed(2)}x / ${scY.toFixed(2)}x</span>
            </div>
            <div class="insp-pills-row">
              <button class="insp-btn-pill ${scX === 1.0 && scY === 1.0 ? 'active' : ''}" onclick="setMatteConfig('${targetMattePath}', { transform: { scale_x: 1.0, scale_y: 1.0 } }); renderStudioInspector();">1:1</button>
              <button class="insp-btn-pill ${scX === 1.33 ? 'active' : ''}" onclick="setMatteConfig('${targetMattePath}', { transform: { scale_x: 1.33, scale_y: 1.0 } }); renderStudioInspector();">WIDE X (1.33x)</button>
              <button class="insp-btn-pill ${scY === 1.33 ? 'active' : ''}" onclick="setMatteConfig('${targetMattePath}', { transform: { scale_x: 1.0, scale_y: 1.33 } }); renderStudioInspector();">TALL Y (1.33x)</button>
            </div>
          </div>

          <div class="insp-control-row">
            <div class="insp-label-val">
              <span>ROTAÇÃO</span>
              <span class="insp-val-disp" id="disp-matte-rot">${rot}°</span>
            </div>
            <div class="insp-flex-input-row">
              <input type="range" min="-180" max="180" value="${rot}" class="insp-range" oninput="const v = Number(this.value); setMatteConfig('${targetMattePath}', { transform: { rotation: v } }); document.getElementById('disp-matte-rot').textContent = v + '°';">
              <button class="insp-btn-pill" onclick="setMatteConfig('${targetMattePath}', { transform: { rotation: 0 } }); renderStudioInspector();">0°</button>
              <button class="insp-btn-pill" onclick="setMatteConfig('${targetMattePath}', { transform: { rotation: 90 } }); renderStudioInspector();">90°</button>
              <button class="insp-btn-pill" onclick="setMatteConfig('${targetMattePath}', { transform: { rotation: 180 } }); renderStudioInspector();">180°</button>
            </div>
          </div>

          <div style="margin-top: 10px;">
            <button class="insp-btn-danger-outline" onclick="resetMatteTransform('${targetMattePath}');">
              ↺ RESETAR GEOMETRIA DA MÁSCARA
            </button>
          </div>
        </div>
      `;
    } else if (subtab === 'color') {
      const isVigOn = Boolean(vig.enabled);
      const roundPct = Math.round((vig.roundness !== undefined ? vig.roundness : 0.65) * 100);
      const featherPct = Math.round((vig.feather !== undefined ? vig.feather : 0.38) * 100);
      const inRadPct = Math.round((vig.inner_radius !== undefined ? vig.inner_radius : 0.42) * 100);
      const outRadPct = Math.round((vig.outer_radius !== undefined ? vig.outer_radius : 0.95) * 100);
      const pulsePct = Math.round((vig.audio_pulse !== undefined ? vig.audio_pulse : 0.15) * 100);

      html += `
        <div class="insp-section insp-highlight-card">
          <div class="insp-row-between">
            <div class="insp-sec-title insp-cyan-title">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M12 2a10 10 0 0 0 0 20"></path></svg>
              VINHETA PROCEDURAL DINÂMICA
            </div>
            <button class="insp-btn-toggle ${isVigOn ? 'active' : ''}" onclick="setMatteConfig('${targetMattePath}', { vignette: { enabled: !${Boolean(vig.enabled)} } }); renderStudioInspector();">
              ${isVigOn ? 'ATIVO' : 'DESATIVADO'}
            </button>
          </div>
          <div class="insp-desc">Controle de geometria suave com bordas arredondadas e falloff cinematográfico.</div>

          <div class="insp-control-row">
            <div class="insp-label-val">
              <span>ARREDONDAMENTO DAS BORDAS (ROUNDNESS)</span>
              <span class="insp-val-disp text-cyan" id="disp-vig-round">${roundPct}%</span>
            </div>
            <input type="range" min="0" max="100" value="${roundPct}" class="insp-range" oninput="setMatteConfig('${targetMattePath}', { vignette: { roundness: this.value / 100.0 } }); document.getElementById('disp-vig-round').textContent = this.value + '%';">
            <div class="insp-pills-row" style="margin-top:4px;">
              <button class="insp-btn-pill ${roundPct === 0 ? 'active' : ''}" onclick="setMatteConfig('${targetMattePath}', { vignette: { roundness: 0 } }); renderStudioInspector();">0% (RETÂNGULO PURO)</button>
              <button class="insp-btn-pill ${roundPct === 65 ? 'active' : ''}" onclick="setMatteConfig('${targetMattePath}', { vignette: { roundness: 0.65 } }); renderStudioInspector();">65% (ARREDONDADO)</button>
              <button class="insp-btn-pill ${roundPct === 100 ? 'active' : ''}" onclick="setMatteConfig('${targetMattePath}', { vignette: { roundness: 1.0 } }); renderStudioInspector();">100% (ELIPSE / CÍRCULO)</button>
            </div>
          </div>

          <div class="insp-control-row">
            <div class="insp-label-val">
              <span>SUAVIDADE DE BORDA (FEATHER / FALLOFF)</span>
              <span class="insp-val-disp text-cyan" id="disp-vig-feather">${featherPct}%</span>
            </div>
            <input type="range" min="5" max="95" value="${featherPct}" class="insp-range" oninput="setMatteConfig('${targetMattePath}', { vignette: { feather: this.value / 100.0 } }); document.getElementById('disp-vig-feather').textContent = this.value + '%';">
          </div>

          <div class="insp-control-row">
            <div class="insp-label-val">
              <span>RAIO INTERNO (AURA CENTRAL LIVRE)</span>
              <span class="insp-val-disp" id="disp-vig-inrad">${inRadPct}%</span>
            </div>
            <input type="range" min="10" max="85" value="${inRadPct}" class="insp-range" oninput="setMatteConfig('${targetMattePath}', { vignette: { inner_radius: this.value / 100.0 } }); document.getElementById('disp-vig-inrad').textContent = this.value + '%';">
          </div>

          <div class="insp-control-row">
            <div class="insp-label-val">
              <span>RAIO EXTERNO (ALCANCE DA PENUMBRA)</span>
              <span class="insp-val-disp" id="disp-vig-outrad">${outRadPct}%</span>
            </div>
            <input type="range" min="50" max="150" value="${outRadPct}" class="insp-range" oninput="setMatteConfig('${targetMattePath}', { vignette: { outer_radius: this.value / 100.0 } }); document.getElementById('disp-vig-outrad').textContent = this.value + '%';">
          </div>

          <div class="insp-control-row">
            <div class="insp-label-val">
              <span>RESPIRAÇÃO ÁUDIO-REATIVA (PULSE BEAT)</span>
              <span class="insp-val-disp text-cyan" id="disp-vig-pulse">${pulsePct}%</span>
            </div>
            <input type="range" min="0" max="50" value="${pulsePct}" class="insp-range" oninput="setMatteConfig('${targetMattePath}', { vignette: { audio_pulse: this.value / 100.0 } }); document.getElementById('disp-vig-pulse').textContent = this.value + '%';">
          </div>
        </div>
      `;
    } else if (subtab === 'advanced') {
      html += `
        <div class="insp-section">
          <div class="insp-sec-title">CINEMÁTICA E OSCILAÇÃO (WIGGLE ENGINE)</div>
          
          <div class="insp-control-row">
            <div class="insp-label-val">
              <span>AMPLITUDE DE WIGGLE (POSIÇÃO)</span>
              <span class="insp-val-disp">${def.wiggle_pos || 8} px</span>
            </div>
            <input type="range" min="0" max="40" value="${def.wiggle_pos || 8}" class="insp-range" oninput="setMatteConfig('${targetMattePath}', { deform: { wiggle_pos: Number(this.value) } });">
          </div>

          <div class="insp-control-row">
            <div class="insp-label-val">
              <span>VELOCIDADE (PERÍODO EM BEATS)</span>
              <span class="insp-val-disp">${def.speed || 4} Beats</span>
            </div>
            <input type="range" min="1" max="16" value="${def.speed || 4}" class="insp-range" oninput="setMatteConfig('${targetMattePath}', { deform: { speed: Number(this.value) } });">
          </div>

          <div class="insp-row-between" style="margin-top: 10px;">
            <span class="insp-label">SINCRONIZAR COM O BPM MASTER</span>
            <button class="insp-btn-toggle ${def.sync_bpm ? 'active' : ''}" onclick="setMatteConfig('${targetMattePath}', { deform: { sync_bpm: !${Boolean(def.sync_bpm)} } }); renderStudioInspector();">
              ${def.sync_bpm ? 'SYNC ON' : 'LIVRE'}
            </button>
          </div>
        </div>
      `;
    }

    container.innerHTML = html;
  } else if (targetType === '3d') {
    const currentTarget = appState.inspector_3d_target || 'deckA';
    if (badge) {
      badge.textContent = currentTarget === 'deckA' ? '🔴 3D PGM A (AO VIVO)' : (currentTarget === 'deckB' ? '🟢 3D CUE B (PRÉ-AR)' : '🟡 3D L5 (APOIO)');
    }

    const cfg3d = getActive3DConfig(currentTarget);
    const curScene = cfg3d.active_scene || 'star_13';
    const curPal = cfg3d.palette || 'pt_rubi';
    const react = cfg3d.audio_reactivity || {};
    const cam = cfg3d.camera || {};
    const parts = cfg3d.particles || {};

    const all3DScenes = [
      { id: 'star_13', name: 'ESTRELA 13 PT', desc: 'Estrela 5 pontas áurea PT + Numeral 13 oficial', icon: '⭐' },
      { id: 'spine', name: 'ESPINHAÇO HOUDINI', desc: 'Vértebras marinhas biomórficas abyss', icon: '🦴' },
      { id: 'black_hole_singularity', name: 'SINGULARIDADE', desc: 'Vórtice espaço-tempo & anel de fótons Doppler', icon: '🕳️' },
      { id: 'biomorphic_flora', name: 'BIOMORPHIC FLORA', desc: 'Micélio fractal & tentáculos bioluminescentes', icon: '🌿' },
      { id: 'sol_vermelho_horizonte', name: 'SOL VERMELHO', desc: 'Sol monumental & grade vetorial em perspectiva', icon: '🌅' },
      { id: 'mercury_blob', name: 'MERCÚRIO LÍQUIDO', desc: 'Escultura fluida cromada Chiaroscuro', icon: '💧' },
      { id: 'monolith_13', name: 'MONÓLITO BRUTALISTA', desc: 'Prisma sagrado brutalista & fendas laser', icon: '🏛️' },
      { id: 'nebula_particles', name: 'NEBULA PARTICLES', desc: 'Enxame quântico em atrator de Lorenz', icon: '✨' },
      { id: 'cyber_wireframe', name: 'WIREFRAME LATTICE', desc: 'Hipercubo Tesseract brutalista laser', icon: '🕸️' },
      { id: 'hyper_torus', name: 'QUANTUM TORUS', desc: 'Nó toroidal topológico & fluxo quântico', icon: '🌀' },
      { id: 'ocean_sun', name: 'OCEAN SUN', desc: 'Mar ondulante 3D + orbe solar celestial', icon: '🌊' },
      { id: 'hybrid', name: 'HYBRID COSMOS', desc: 'Mar + Estrela 13 + Sol no horizonte', icon: '🪐' }
    ];

    const luxuryPalettes = [
      { id: 'pt_rubi', label: 'PT RUBI & OURO', color: '#dc2626' },
      { id: 'noir_gold', label: 'NOIR OBSIDIANA', color: '#ffd700' },
      { id: 'cyan_neon', label: 'CIANO NEON', color: '#00f0ff' },
      { id: 'solar_gold', label: 'SOLAR DOURADO', color: '#ffb703' },
      { id: 'matrix_emerald', label: 'MATRIX VERDE', color: '#00ff88' },
      { id: 'deep_violet', label: 'ULTRAVIOLETA', color: '#d946ef' },
      { id: 'monochrome_ice', label: 'GELO MONO', color: '#e2e8f0' }
    ];

    html += `
      <!-- DECK TARGET STAGING SELECTOR -->
      <div class="insp-section insp-highlight-card" style="border-left: 3px solid ${currentTarget === 'deckA' ? '#ef4444' : (currentTarget === 'deckB' ? '#10b981' : '#f59e0b')};">
        <div class="insp-sec-title">ALVO DE STAGING 3D (DESACOPLAMENTO)</div>
        <div class="insp-pills-row" style="margin-bottom: 8px;">
          <button class="insp-layer-pill ${currentTarget === 'deckA' ? 'active' : ''}" style="${currentTarget === 'deckA' ? 'background:#ef4444;color:#fff;' : ''}" onclick="window.setInspector3DTarget('deckA')">
            🔴 PGM A (AO VIVO)
          </button>
          <button class="insp-layer-pill ${currentTarget === 'deckB' ? 'active' : ''}" style="${currentTarget === 'deckB' ? 'background:#10b981;color:#fff;' : ''}" onclick="window.setInspector3DTarget('deckB')">
            🟢 CUE B (PRÉ-AR)
          </button>
          <button class="insp-layer-pill ${currentTarget === 'layer5' ? 'active' : ''}" style="${currentTarget === 'layer5' ? 'background:#f59e0b;color:#000;' : ''}" onclick="window.setInspector3DTarget('layer5')">
            🟡 L5 (APOIO)
          </button>
        </div>
        <div class="insp-desc" style="font-size:0.75rem;">
          ${currentTarget === 'deckA' ? '⚠️ Modificando parâmetros 3D AO VIVO no Program Master A.' : (currentTarget === 'deckB' ? '🛡️ Staging seguro: Edite no CUE B sem vazar alterações para o sinal ao vivo!' : '✨ Modificando parâmetros 3D da Camada de Apoio L5.')}
        </div>
        <div class="insp-routes-strip" style="margin-top:6px;">
          <button class="btn-insp-route" onclick="window.triggerCurrent3DLive('${curScene}')" title="Disparar este cenário 3D no PGM A">
            ▶ DISPARAR NO PGM A
          </button>
          <button class="btn-insp-route" onclick="window.armCurrent3DCue('${curScene}')" title="Armar este cenário 3D no CUE B">
            ● ARMAR NO CUE B
          </button>
          <button class="btn-insp-route" onclick="window.copy3DConfig('${currentTarget === 'deckB' ? 'deckB' : 'deckA'}', '${currentTarget === 'deckB' ? 'deckA' : 'deckB'}')" title="Copiar parâmetros 3D">
            📋 ${currentTarget === 'deckB' ? 'PASSAR CUE ➔ PGM' : 'PASSAR PGM ➔ CUE'}
          </button>
        </div>
      </div>
    `;

    if (subtab === 'transform') {
      // 1. SCENE PICKER (CENAS 3D)
      html += `
        <div class="insp-section">
          <div class="insp-sec-title">SELEÇÃO DE CENÁRIO 3D (${all3DScenes.length} CENAS DISPONÍVEIS)</div>
          <div class="insp-scene-grid">
            ${all3DScenes.map(sc => `
              <div class="insp-scene-card ${curScene === sc.id ? 'active' : ''}" onclick="window.set3DScene('${sc.id}')">
                <div class="insp-scene-card-name">${sc.icon} ${sc.name}</div>
                <div class="insp-scene-card-desc">${sc.desc}</div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    } else if (subtab === 'color') {
      // 2. PALETTES & LIGHTING (PALETAS DE COR)
      html += `
        <div class="insp-section">
          <div class="insp-sec-title">PALETA DE COR & LUZ (LUXURY THEMES)</div>
          <div class="insp-pills-row">
            ${luxuryPalettes.map(pal => `
              <button class="insp-palette-pill ${curPal === pal.id ? 'active' : ''}" onclick="window.set3DPalette('${pal.id}')">
                <span class="pal-dot" style="background:${pal.color};"></span>
                <span>${pal.label}</span>
              </button>
            `).join('')}
          </div>
        </div>

        <div class="insp-section">
          <div class="insp-sec-title">MODO DE RENDER & PONTOS</div>
          <div class="insp-control-row">
            <div class="insp-label-val">
              <span>ESTRUTURA ARAMADA (WIREFRAME)</span>
              <span class="insp-val-disp">${parts.wireframe !== false ? 'LIGADO' : 'DESLIGADO'}</span>
            </div>
            <button class="insp-btn-toggle ${parts.wireframe !== false ? 'active' : ''}" onclick="window.toggle3DWireframe()">
              ${parts.wireframe !== false ? '✓ MALHA ARAMADA ATIVA' : 'MALHA DESATIVADA'}
            </button>
          </div>

          <div class="insp-control-row">
            <div class="insp-label-val">
              <span>ESPESSURA DO TRAÇO / TAMANHO DE PONTO</span>
              <span class="insp-val-disp">${(parts.point_size || 1.0).toFixed(1)}x</span>
            </div>
            <input type="range" min="5" max="30" value="${Math.round((parts.point_size || 1.0) * 10)}" class="insp-range" oninput="window.set3DParam('particles.point_size', this.value / 10.0)">
          </div>

          <div class="insp-control-row">
            <div class="insp-label-val">
              <span>INTENSIDADE DE BRILHO (GLOW)</span>
              <span class="insp-val-disp">${(parts.glow_intensity || 1.0).toFixed(1)}x</span>
            </div>
            <input type="range" min="2" max="25" value="${Math.round((parts.glow_intensity || 1.0) * 10)}" class="insp-range" oninput="window.set3DParam('particles.glow_intensity', this.value / 10.0)">
          </div>
        </div>
      `;
    } else if (subtab === 'advanced') {
      // 3. CAMERA & REACTION (CÂMERA & KICK)
      const orbSpd = cam.orbit_speed !== undefined ? cam.orbit_speed : 1.0;
      const tilt = cam.tilt !== undefined ? cam.tilt : 0.22;
      const roll = cam.roll !== undefined ? cam.roll : 0.0;
      const dist = cam.distance !== undefined ? cam.distance : 2.3;
      const autoOrb = cam.auto_orbit !== false;

      html += `
        <div class="insp-section">
          <div class="insp-sec-title">CÂMERA 3D, ÓRBITA & PERSPECTIVA</div>
          <div class="insp-control-row">
            <div class="insp-label-val">
              <span>ÓRBITA AUTOMÁTICA CONTÍNUA</span>
              <span class="insp-val-disp">${autoOrb ? 'AUTO' : 'MANUAL'}</span>
            </div>
            <button class="insp-btn-toggle ${autoOrb ? 'active' : ''}" onclick="window.toggle3DAutoOrbit()">
              ${autoOrb ? '✓ ÓRBITA DINÂMICA ATIVA' : 'ÓRBITA TRAVADA'}
            </button>
          </div>

          <div class="insp-control-row">
            <div class="insp-label-val">
              <span>VELOCIDADE DE ÓRBITA</span>
              <span class="insp-val-disp">${orbSpd.toFixed(1)}x</span>
            </div>
            <input type="range" min="-30" max="30" value="${Math.round(orbSpd * 10)}" class="insp-range" oninput="window.set3DParam('camera.orbit_speed', this.value / 10.0)">
          </div>

          <div class="insp-control-row">
            <div class="insp-label-val">
              <span>INCLINAÇÃO VERTICAL (TILT / PITCH)</span>
              <span class="insp-val-disp">${(tilt * 180 / Math.PI).toFixed(1)}°</span>
            </div>
            <input type="range" min="-60" max="60" value="${Math.round(tilt * 100)}" class="insp-range" oninput="window.set3DParam('camera.tilt', this.value / 100.0)">
          </div>

          <div class="insp-control-row">
            <div class="insp-label-val">
              <span>ROTAÇÃO DE HORIZONTE (DUTCH ANGLE / ROLL)</span>
              <span class="insp-val-disp">${(roll * 180 / Math.PI).toFixed(1)}°</span>
            </div>
            <input type="range" min="-45" max="45" value="${Math.round(roll * 100)}" class="insp-range" oninput="window.set3DParam('camera.roll', this.value / 100.0)">
          </div>

          <div class="insp-control-row">
            <div class="insp-label-val">
              <span>DISTÂNCIA / ZOOM (CAMERA DISTANCE)</span>
              <span class="insp-val-disp">${dist.toFixed(2)}</span>
            </div>
            <input type="range" min="12" max="45" value="${Math.round(dist * 10)}" class="insp-range" oninput="window.set3DParam('camera.distance', this.value / 10.0)">
          </div>
        </div>

        <div class="insp-section insp-highlight-card">
          <div class="insp-sec-title insp-cyan-title">REATIVIDADE DESACOPLADA · ÁUDIO & KICK</div>
          <div class="insp-desc">Reatividade com controle independente de graves (Sub/Bass) e frequências altas (Treble/Air).</div>

          <div class="insp-control-row">
            <div class="insp-label-val">
              <span>KICK DO NUMERAL 13 (SUB & BASS)</span>
              <span class="insp-val-disp text-cyan">${(react.num13_sub_kick || 1.8).toFixed(1)}x</span>
            </div>
            <input type="range" min="5" max="40" value="${Math.round((react.num13_sub_kick || 1.8) * 10)}" class="insp-range" oninput="window.set3DParam('audio_reactivity.num13_sub_kick', this.value / 10.0)">
          </div>

          <div class="insp-control-row">
            <div class="insp-label-val">
              <span>GIRO DA ESTRELA SAGRADA (TREBLE & AIR)</span>
              <span class="insp-val-disp text-cyan">${(react.star_treble_spin || 1.2).toFixed(1)}x</span>
            </div>
            <input type="range" min="2" max="30" value="${Math.round((react.star_treble_spin || 1.2) * 10)}" class="insp-range" oninput="window.set3DParam('audio_reactivity.star_treble_spin', this.value / 10.0)">
          </div>

          <div class="insp-control-row">
            <div class="insp-label-val">
              <span>ONDULAÇÃO DO OCEANO / SOL (WAVE AMPLITUDE)</span>
              <span class="insp-val-disp">${(react.ocean_wave_amp || 1.0).toFixed(1)}x</span>
            </div>
            <input type="range" min="2" max="25" value="${Math.round((react.ocean_wave_amp || 1.0) * 10)}" class="insp-range" oninput="window.set3DParam('audio_reactivity.ocean_wave_amp', this.value / 10.0)">
          </div>

          <div class="insp-control-row">
            <div class="insp-label-val">
              <span>PULSO BIOMÓRFICO & MICÉLIO (ORGANIC PULSE)</span>
              <span class="insp-val-disp">${(react.spine_swimming || 1.0).toFixed(1)}x</span>
            </div>
            <input type="range" min="2" max="25" value="${Math.round((react.spine_swimming || 1.0) * 10)}" class="insp-range" oninput="window.set3DParam('audio_reactivity.spine_swimming', this.value / 10.0)">
          </div>

          <div class="insp-control-row">
            <div class="insp-label-val">
              <span>CINTILAÇÃO DE ESPOROS (AIR / HI-HAT SPARKLE)</span>
              <span class="insp-val-disp">${(react.air_sparkle || 1.0).toFixed(1)}x</span>
            </div>
            <input type="range" min="2" max="25" value="${Math.round((react.air_sparkle || 1.0) * 10)}" class="insp-range" oninput="window.set3DParam('audio_reactivity.air_sparkle', this.value / 10.0)">
          </div>

          <button class="insp-btn-toggle" style="margin-top: 10px; border-color: rgba(239,68,68,0.4);" onclick="window.reset3DConfig('${currentTarget}')">
            ⟲ RESETAR PARÂMETROS DESTE ALVO
          </button>
        </div>
      `;
    }

    container.innerHTML = html;
  }
}
window.renderStudioInspector = renderStudioInspector;

window.setInspector3DTarget = function(tgt) {
  appState.inspector_3d_target = tgt;
  renderStudioInspector();
};

window.set3DScene = function(sceneId) {
  const tgt = appState.inspector_3d_target || 'deckA';
  const cfg = getActive3DConfig(tgt);
  cfg.active_scene = sceneId;
  if (tgt === 'deckA') {
    appState.gen3d = cfg;
  }
  renderStudioInspector();
  if (typeof showMacroToast === 'function') {
    showMacroToast(`[3D ${tgt.toUpperCase()}] Cenário: ${sceneId.toUpperCase()}`);
  }
};

window.set3DPalette = function(palId) {
  const tgt = appState.inspector_3d_target || 'deckA';
  const cfg = getActive3DConfig(tgt);
  cfg.palette = palId;
  if (tgt === 'deckA') appState.gen3d = cfg;
  renderStudioInspector();
};

window.toggle3DWireframe = function() {
  const tgt = appState.inspector_3d_target || 'deckA';
  const cfg = getActive3DConfig(tgt);
  if (!cfg.particles) cfg.particles = {};
  cfg.particles.wireframe = !cfg.particles.wireframe;
  if (tgt === 'deckA') appState.gen3d = cfg;
  renderStudioInspector();
};

window.toggle3DAutoOrbit = function() {
  const tgt = appState.inspector_3d_target || 'deckA';
  const cfg = getActive3DConfig(tgt);
  if (!cfg.camera) cfg.camera = {};
  cfg.camera.auto_orbit = !cfg.camera.auto_orbit;
  if (tgt === 'deckA') appState.gen3d = cfg;
  renderStudioInspector();
};

window.set3DParam = function(path, val) {
  const tgt = appState.inspector_3d_target || 'deckA';
  const cfg = getActive3DConfig(tgt);
  const parts = path.split('.');
  if (parts.length === 2) {
    if (!cfg[parts[0]]) cfg[parts[0]] = {};
    cfg[parts[0]][parts[1]] = Number(val);
  } else {
    cfg[path] = Number(val);
  }
  if (tgt === 'deckA') appState.gen3d = cfg;
};

window.copy3DConfig = function(fromTgt, toTgt) {
  const src = getActive3DConfig(fromTgt);
  const dest = getActive3DConfig(toTgt);
  Object.assign(dest, JSON.parse(JSON.stringify(src)));
  if (toTgt === 'deckA') appState.gen3d = dest;
  renderStudioInspector();
  if (typeof showMacroToast === 'function') {
    showMacroToast(`[3D] Configuração copiada de ${fromTgt.toUpperCase()} para ${toTgt.toUpperCase()}`);
  }
};

window.reset3DConfig = function(tgt) {
  const defaults = createDefault3DConfig(tgt === 'deckA' ? 'star_13' : 'spine', tgt === 'deckA' ? 'pt_rubi' : 'cyan_neon');
  if (tgt === 'deckA') {
    appState.deckA_3d = defaults;
    appState.gen3d = defaults;
  } else if (tgt === 'deckB') {
    appState.deckB_3d = defaults;
  } else if (tgt === 'layer5') {
    appState.layer5_3d = defaults;
  }
  renderStudioInspector();
  if (typeof showMacroToast === 'function') {
    showMacroToast(`[3D] Padrões restaurados para ${tgt.toUpperCase()}`);
  }
};

window.triggerCurrent3DLive = function(sceneId) {
  const clipId = 'clip_gen_' + (sceneId === 'star_13' ? 'star_13' : sceneId === 'spine' ? 'plexus_spine' : sceneId);
  const clip = (typeof allClips !== 'undefined' ? allClips : []).find(c => c.gen_scene === sceneId || c.id === clipId) || { id: 'clip_gen_plexus_spine', filename: 'GENERATIVE 3D' };
  routeClipToBus(clip.id, 'A');
  const cfgLive = getActive3DConfig('deckA');
  cfgLive.active_scene = sceneId;
  appState.gen3d = cfgLive;
  renderStudioInspector();
};

window.armCurrent3DCue = function(sceneId) {
  const clipId = 'clip_gen_' + (sceneId === 'star_13' ? 'star_13' : sceneId === 'spine' ? 'plexus_spine' : sceneId);
  const clip = (typeof allClips !== 'undefined' ? allClips : []).find(c => c.gen_scene === sceneId || c.id === clipId) || { id: 'clip_gen_plexus_spine', filename: 'GENERATIVE 3D' };
  routeClipToBus(clip.id, 'B');
  const cfgCue = getActive3DConfig('deckB');
  cfgCue.active_scene = sceneId;
  renderStudioInspector();
};

function setGlobalMatteAsset(assetPath) {
  if (!appState.matte) appState.matte = {};
  appState.matte.active_path = assetPath;
  appState.matte.name = assetPath;
  const tgt = appState.matte_target_layer || 'layer3';
  if (tgt === 'master') {
    appState.master_matte = assetPath;
  } else if (appState.layers && appState.layers[tgt]) {
    appState.layers[tgt].matte = assetPath;
  }
  showMacroToast(`Máscara definida: ${assetPath.replace('.png', '').slice(0, 18)}`);
}
window.setGlobalMatteAsset = setGlobalMatteAsset;

function layer2_setLuminance(val) {
  if (!appState.layers.layer2) return;
  appState.layers.layer2.luminance = val;
  if (appState.tonal) appState.tonal.edge_luminance = val;
}
window.layer2_setLuminance = layer2_setLuminance;

function layer2_setThreshold(val) {
  if (!appState.layers.layer2) return;
  appState.layers.layer2.edge_threshold = val;
  if (appState.tonal) appState.tonal.edge_threshold = val;
}
window.layer2_setThreshold = layer2_setThreshold;

function layer2_setWidth(val) {
  if (!appState.layers.layer2) return;
  appState.layers.layer2.edge_width = val;
  if (appState.tonal) appState.tonal.edge_width = val;
}
window.layer2_setWidth = layer2_setWidth;

function layer2_setMix(val) {
  if (!appState.layers.layer2) return;
  appState.layers.layer2.edge_mix = val;
  if (appState.tonal) appState.tonal.edge_mix = val;
}
window.layer2_setMix = layer2_setMix;

function toggleFxPluginEnabled(pluginId) {
  if (appState.fx && appState.fx[pluginId]) {
    appState.fx[pluginId].enabled = !appState.fx[pluginId].enabled;
  }
}
window.toggleFxPluginEnabled = toggleFxPluginEnabled;


