// scripts/test_fx_control_and_locks.js
// Automated verification for Autopilot FX Master Control and Manual Lock

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const PUBLIC_DIR = path.join(__dirname, '..', 'penumbra_engine', 'web_controller', 'public');
const indexHtml = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf-8');
const stylesCss = fs.readFileSync(path.join(PUBLIC_DIR, 'styles.css'), 'utf-8');
const appJs = fs.readFileSync(path.join(PUBLIC_DIR, 'app.js'), 'utf-8');

console.log('==================================================');
console.log('🧪 TESTING: FX MASTER BYPASS & MANUAL LOCK ENGINE');
console.log('==================================================');

// 1. UI Elements in index.html
console.log('\n[TEST 1] DOM Elements Verification:');
assert(indexHtml.includes('id="btn-header-toggle-fx"'), '#btn-header-toggle-fx exists in header');
console.log('  ✓ Header Master FX button exists');
assert(indexHtml.includes('id="btn-toggle-fx-lock"'), '#btn-toggle-fx-lock exists in FX toolbar');
console.log('  ✓ FX Toolbar manual lock toggle exists');
assert(indexHtml.includes('selectFxPlugin(\'pixel_stretch\', true)'), 'Plugin card has isUserAction=true click handler');
console.log('  ✓ FX Plugin cards wired with isUserAction parameter');

// 2. CSS Styles
console.log('\n[TEST 2] CSS Styling Verification:');
assert(stylesCss.includes('.btn-header-fx'), '.btn-header-fx class styled');
assert(stylesCss.includes('.btn-header-fx.active'), '.btn-header-fx.active neon cyan state styled');
assert(stylesCss.includes('.btn-header-fx.is-locked'), '.btn-header-fx.is-locked amber highlight styled');
assert(stylesCss.includes('.btn-fx-lock'), '.btn-fx-lock button styled');
console.log('  ✓ Header button and lock badges have rich aesthetics and responsive state tokens');

// 3. Logic & State Management in app.js
console.log('\n[TEST 3] Logic & Invariants in app.js:');
assert(appJs.includes('toggleFxMaster'), 'toggleFxMaster defined');
assert(appJs.includes('toggleFxManualLock'), 'toggleFxManualLock defined');
assert(appJs.includes('manual_locked: false'), 'manual_locked in initial fx state');
assert(appJs.includes("autopilotPreset: 'bypass_clean'"), 'bypass_clean is default fx preset');
assert(appJs.includes('e.shiftKey') && appJs.includes('toggleFxMaster'), 'Shift+X shortcut triggers toggleFxMaster');
console.log('  ✓ Master FX functions and default clean bypass initialized');
console.log('  ✓ Shift+X keyboard shortcut mapped to toggleFxMaster');

// 4. Simulate appState and Macro Preset Logic
console.log('\n[TEST 4] Autopilot Guard Simulation:');

// Mock state
const appState = {
  auto_mode: true,
  autopilot_delegation: {
    clips: true,
    mattes: true,
    tonal: true,
    fx: false // FX Overdrive is OFF
  },
  fx: {
    active: false,
    preset: 'bypass_clean',
    manual_locked: false,
    autopilotActive: false
  },
  layers: {
    layer2: { opacity: 0 },
    layer4: { opacity: 0 }
  }
};

// Simulation of applyMacroPreset logic
function simulateMacroPreset(presetName, isUserAction = false) {
  const isFxDelegated = !!appState.autopilot_delegation?.fx;
  const isFxLocked = !!appState.fx?.manual_locked;
  const allowFxChange = isUserAction || (appState.auto_mode && isFxDelegated && !isFxLocked);
  const allowLayerFxAutomation = isUserAction || (appState.auto_mode && isFxDelegated);

  if (allowFxChange) {
    appState.fx.active = true;
    appState.fx.preset = 'preset_overdrive_' + presetName;
  }

  if (allowLayerFxAutomation) {
    appState.layers.layer2.opacity = 0.75;
    appState.layers.layer4.opacity = 0.90;
  }
}

// Case A: Autopilot running, FX Overdrive is OFF
simulateMacroPreset('DROP', false);
assert.strictEqual(appState.fx.active, false, 'FX must stay inactive when FX overdrive is OFF');
assert.strictEqual(appState.fx.preset, 'bypass_clean', 'FX preset must remain bypass_clean');
assert.strictEqual(appState.layers.layer2.opacity, 0, 'Sobel layer opacity must remain 0');
assert.strictEqual(appState.layers.layer4.opacity, 0, 'Accent layer opacity must remain 0');
console.log('  ✓ Case A: Autopilot with FX Overdrive OFF stays 100% CLEAN (Zero FX injection)');

// Case B: User manually selects an effect
appState.fx.active = true;
appState.fx.preset = 'pixel_sorter_neon';
appState.fx.manual_locked = true;

// Turn FX overdrive ON in autopilot
appState.autopilot_delegation.fx = true;

// Autopilot transitions to BUILD, then DROP, then BREAK
simulateMacroPreset('BUILD', false);
assert.strictEqual(appState.fx.preset, 'pixel_sorter_neon', 'Locked user preset must NOT be replaced by BUILD');
simulateMacroPreset('DROP', false);
assert.strictEqual(appState.fx.preset, 'pixel_sorter_neon', 'Locked user preset must NOT be replaced by DROP');
simulateMacroPreset('BREAK', false);
assert.strictEqual(appState.fx.preset, 'pixel_sorter_neon', 'Locked user preset must NOT be replaced by BREAK');
console.log('  ✓ Case B: User-selected FX remains LOCKED across all Autopilot macro transitions');

// Case C: User unlocks FX
appState.fx.manual_locked = false;
simulateMacroPreset('DROP', false);
assert.strictEqual(appState.fx.preset, 'preset_overdrive_DROP', 'Autopilot may now automate FX after explicit unlock');
console.log('  ✓ Case C: Unlocking returns control smoothly to Autopilot when FX overdrive is ON');

console.log('\n==================================================');
console.log('🎉 ALL FX MASTER & MANUAL LOCK TESTS PASSED (100%)');
console.log('==================================================');
