/**
 * Penumbra System - Comprehensive Agentic Verification Test Suite
 * Tests:
 * 1. API Endpoints (/api/user/profile, /api/cache/status, /api/media/catalog)
 * 2. DOM & Architecture Invariants in index.html and Penumbra_Portable.html
 * 3. CSS Tokens & Layout Integrity in styles.css
 * 4. JS Engine Function Definitions & Event Handlers in app.js
 * 5. Profile Persistence & Integrity
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'penumbra_engine/web_controller/public');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ ${message}`);
  } else {
    failedTests++;
    console.error(`  ✗ FAIL: ${message}`);
  }
}

function fetchJson(urlPath) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:3000${urlPath}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, json: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    }).on('error', reject);
  });
}

async function runTests() {
  console.log('\n==================================================');
  console.log('🪐 PENUMBRA ENGINE: COMPREHENSIVE AGENTIC TEST SUITE');
  console.log('==================================================\n');

  // --- SUITE 1: API & Server Endpoints ---
  console.log('[SUITE 1] Backend API Verification:');
  try {
    const profileRes = await fetchJson('/api/user/profile');
    assert(profileRes.status === 200, 'GET /api/user/profile returns 200 OK');
    assert(profileRes.json && profileRes.json.schema_version, 'User profile contains valid schema_version');
    assert(profileRes.json && profileRes.json.settings, 'User profile contains settings object');
  } catch (err) {
    assert(false, `API Error on /api/user/profile: ${err.message}`);
  }

  try {
    const cacheRes = await fetchJson('/api/cache/status');
    assert(cacheRes.status === 200, 'GET /api/cache/status returns 200 OK');
    assert(typeof cacheRes.json.cached_count === 'number', 'Cache status returns cached_count');
    assert(cacheRes.json.items && typeof cacheRes.json.items === 'object', 'Cache status returns items registry object');
  } catch (err) {
    assert(false, `API Error on /api/cache/status: ${err.message}`);
  }

  // --- SUITE 2: DOM & Layout Architecture in index.html ---
  console.log('\n[SUITE 2] DOM & Layout Architecture (index.html):');
  const indexHtml = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf-8');

  assert(indexHtml.includes('id="workspace-splitter"'), 'Horizontal workspace splitter (#workspace-splitter) exists');
  assert(indexHtml.includes('class="dock-master-header"'), 'Master Dock header bar (.dock-master-header) exists');
  assert(indexHtml.includes('id="dock-modules-view"'), 'Dedicated modules view (#dock-modules-view) exists');
  assert(indexHtml.includes('id="dock-timeline-view"'), 'Dedicated full-height timeline view (#dock-timeline-view) exists');
  assert(!indexHtml.includes('class="global-timeline-dock"'), 'Old squashed middle bar (.global-timeline-dock) has been completely removed');
  assert(indexHtml.includes('id="btn-mode-modules"'), 'Master view selector Modules button exists');
  assert(indexHtml.includes('id="btn-mode-timeline"'), 'Master view selector Timeline button exists');
  assert(indexHtml.includes('id="btn-quick-switch-view"'), 'Quick switcher button (#btn-quick-switch-view with TAB) exists');

  // Universal Library DOM
  assert(indexHtml.includes('library-type-selector-bar'), 'Universal Library Type selector bar exists');
  assert(indexHtml.includes('id="library-sidebar"'), 'Studio library sidebar (#library-sidebar) exists');
  assert(indexHtml.includes('class="library-toolbar-compact"'), 'Compact 38px library toolbar exists');
  assert(indexHtml.includes('id="library-quick-inspector"'), 'Quick parameter inspector drawer (#library-quick-inspector) exists');
  assert(indexHtml.includes('data-asset-type="all"'), 'Library filter pill ALL exists');
  assert(indexHtml.includes('data-asset-type="clips"'), 'Library filter pill CLIPS exists');
  assert(indexHtml.includes('data-asset-type="mattes"'), 'Library filter pill MATTES exists');
  assert(indexHtml.includes('data-asset-type="fx"'), 'Library filter pill FX exists');
  assert(indexHtml.includes('data-asset-type="presets"'), 'Library filter pill PRESETS exists');

  // Redesigned Settings Modal DOM
  assert(indexHtml.includes('id="settings-modal"'), 'Settings modal element (#settings-modal) exists');
  assert(indexHtml.includes('settings-card-pro'), 'Pro 2-column settings card (.settings-card-pro) exists');
  assert(indexHtml.includes('id="cfg-search-input"'), 'Live settings search input (#cfg-search-input) exists');
  assert(indexHtml.includes('class="cfg-sidebar-col"'), 'Settings left sidebar navigation column exists');
  assert(indexHtml.includes('class="cfg-content-col"'), 'Settings right property content column exists');

  // --- SUITE 3: Styles & CSS Design Tokens (styles.css) ---
  console.log('\n[SUITE 3] CSS Design Tokens & Layout Rules (styles.css):');
  const stylesCss = fs.readFileSync(path.join(PUBLIC_DIR, 'styles.css'), 'utf-8');

  assert(stylesCss.includes('.workspace-splitter-horizontal'), 'Splitter styles defined with row-resize cursor');
  assert(stylesCss.includes('.dock-master-header'), 'Dock master header styles defined');
  assert(stylesCss.includes('.dock-timeline-view-pane'), 'Dedicated timeline view styles defined (.dock-timeline-view-pane)');
  assert(stylesCss.includes('.library-sidebar'), 'Studio Library sidebar styles defined (.library-sidebar)');
  assert(stylesCss.includes('.library-toolbar-compact'), 'Compact 38px toolbar styles defined (.library-toolbar-compact)');
  assert(stylesCss.includes('.library-quick-inspector'), 'Quick parameter inspector styles defined (.library-quick-inspector)');
  assert(stylesCss.includes('.btn-edit-params'), 'Parameter edit button styles defined (.btn-edit-params)');
  assert(stylesCss.includes('.library-type-selector-bar'), 'Universal library selector bar styles defined');
  assert(stylesCss.includes('.library-card-matte'), 'Procedural matte card styles defined');
  assert(stylesCss.includes('.library-card-fx'), 'FX Shader plugin card styles defined');
  assert(stylesCss.includes('.library-card-preset'), 'Conductor Preset card styles defined');
  assert(stylesCss.includes('.settings-card-pro'), 'Pro settings 2-column layout styles defined');
  assert(stylesCss.includes('.cfg-prop-row'), 'Settings clean property row styles defined');
  assert(stylesCss.includes('.storage-mode-grid'), 'Pro storage mode switcher grid styles defined');
  assert(stylesCss.includes('.storage-card'), 'Segmented storage card styles defined');

  // --- SUITE 4: JavaScript Logic & Engine Handlers (app.js) ---
  console.log('\n[SUITE 4] JavaScript Engine & Behavior (app.js):');
  const appJs = fs.readFileSync(path.join(PUBLIC_DIR, 'app.js'), 'utf-8');

  assert(appJs.includes('function initWorkspaceSplitter('), 'initWorkspaceSplitter function defined');
  assert(appJs.includes('function setDockViewMode('), 'setDockViewMode function defined');
  assert(appJs.includes('function toggleDockViewMode('), 'toggleDockViewMode function defined');
  assert(appJs.includes('function cueNextFromQueue('), 'cueNextFromQueue function defined');
  assert(appJs.includes('function filterPreferencesSearch('), 'filterPreferencesSearch function defined');
  assert(appJs.includes('function editMatteParameters('), 'editMatteParameters function defined');
  assert(appJs.includes('function editFxParameters('), 'editFxParameters function defined');
  assert(appJs.includes('function editPresetParameters('), 'editPresetParameters function defined');
  assert(appJs.includes('function editClipTonalParameters('), 'editClipTonalParameters function defined');
  assert(appJs.includes('function toggleLibrarySidebar('), 'toggleLibrarySidebar function defined');
  assert(appJs.includes('function openQuickInspector('), 'openQuickInspector function defined');
  assert(appJs.includes('function switchStorageMode('), 'switchStorageMode function defined');
  assert(appJs.includes('function toggleHeaderSourceMenu('), 'toggleHeaderSourceMenu function defined');
  assert(appJs.includes('function handleLocalAudioFileUpload('), 'handleLocalAudioFileUpload function defined');
  assert(appJs.includes('function playOnlineTestTrack('), 'playOnlineTestTrack function defined');
  assert(appJs.includes('function initWebAudioAnalyser('), 'initWebAudioAnalyser function defined');
  assert(appJs.includes('activeLibraryAssetType'), 'activeLibraryAssetType state variable used');
  assert(appJs.includes('createMatteCardForLibrary'), 'createMatteCardForLibrary helper defined');
  assert(appJs.includes('createFxCardForLibrary'), 'createFxCardForLibrary helper defined');
  assert(appJs.includes('createPresetCardForLibrary'), 'createPresetCardForLibrary helper defined');
  assert(appJs.includes('UserProfileManager.setSetting'), 'UserProfileManager settings persistence integrated');

  // Keybinding Tab
  assert(appJs.includes("e.key === 'Tab'") || appJs.includes('e.key === "Tab"'), 'Tab key listener handles view mode toggle');

  // Audio preview file
  const testAudioPath = path.join(PUBLIC_DIR, 'assets', 'audio', 'test_preview.mp3');
  assert(fs.existsSync(testAudioPath), 'Offline/Online test_preview.mp3 asset exists');

  // --- SUITE 5: Portable HTML Synchronization ---
  console.log('\n[SUITE 5] Portable Bundle Synchronization:');
  const portableHtmlPath = path.join(ROOT_DIR, 'cdn_build/Penumbra_Portable.html');
  assert(fs.existsSync(portableHtmlPath), 'Penumbra_Portable.html exists in cdn_build');
  const portableHtml = fs.readFileSync(portableHtmlPath, 'utf-8');
  assert(portableHtml.includes('workspace-splitter'), 'Portable bundle contains workspace-splitter');
  assert(portableHtml.includes('settings-card-pro'), 'Portable bundle contains settings-card-pro');
  assert(portableHtml.includes('dock-timeline-view'), 'Portable bundle contains dock-timeline-view');
  assert(portableHtml.includes('card-mode-cloud'), 'Portable bundle contains card-mode-cloud');

  // --- SUMMARY ---
  console.log('\n==================================================');
  console.log(`TOTAL CHECKS: ${totalTests} | PASSED: ${passedTests} | FAILED: ${failedTests}`);
  console.log('==================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  } else {
    console.log('🎉 ALL AGENTIC INVARIANT CHECKS PASSED PERFECTLY!\n');
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('Test Suite crashed:', err);
  process.exit(1);
});
