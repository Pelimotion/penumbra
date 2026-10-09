const fs = require('fs');
const path = require('path');

const appPath = path.resolve(__dirname, '../public/app.js');
let appContent = fs.readFileSync(appPath, 'utf8');

// 1. Add appState properties if not already present
if (!appContent.includes('macro_preset_indices:')) {
  appContent = appContent.replace(
    'autopilot_min_bars: 16,',
    `autopilot_min_bars: 16,
  macro_preset_indices: {
    INTRO: 0,
    GROOVE: 0,
    BUILD: 0,
    DROP: 0,
    BREAK: 0
  },
  manual_forced_state: null,
  manual_forced_bars: 0,
  active_macro_preset: null,`
  );
}

// 2. Locate and replace applyMacroStateAesthetics and setMacroState
const startMarker = 'function applyMacroStateAesthetics(state) {';
const endMarker = 'function updatePhraseUI() {';

const startIndex = appContent.indexOf(startMarker);
const endIndex = appContent.indexOf(endMarker);

if (startIndex === -1 || endIndex === -1) {
  console.error("Could not find macro state markers!", startIndex, endIndex);
  process.exit(1);
}

const macroEngineBlock = `// ============================================================================
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

  // 1. Kinematics / Matte Deformation
  if (!appState.matte) appState.matte = {};
  if (!appState.matte.deform) {
    appState.matte.deform = { wiggle_scale: 0.04, wiggle_pos: 8, wiggle_rot: 1, posterize_rate: 0, edge_warp: 0.04, speed: 1.0, sync_bpm: true };
  }
  Object.assign(appState.matte.deform, preset.kinematics);
  syncKinematicsUI(preset.kinematics);

  // 2. Matte selection
  if (preset.matte.type === 'none') {
    appState.master_matte = 'none';
    appState.layers.layer0.matte = 'none';
    appState.layers.layer3.matte = 'none';
  } else if (allMattes && allMattes.length > 0) {
    const category = preset.matte.type === 'geometric' ? 'GEO' : (preset.matte.type === 'procedural' ? 'PROCEDURAL' : 'SOFT');
    const matching = allMattes.filter(m => m.category === category || (m.name && m.name.toLowerCase().includes(preset.matte.type)));
    const targetPool = matching.length > 0 ? matching : allMattes;
    const picked = targetPool[Math.floor(Math.random() * targetPool.length)];
    if (picked) {
      appState.layers.layer0.matte = picked.path;
      appState.layers.layer3.matte = picked.path;
      appState.master_matte = 'none';
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
  if (isUserClick) {
    if (appState.auto_mode) {
      // AUTOPILOT MODE: Operator is forcing the macro musical moment!
      appState.manual_forced_state = state;
      appState.manual_forced_bars = Number(appState.phrase.length_bars) || 16;

      // Cycle preset if clicking already-active state
      if (appState.macro_state === state) {
        const list = MACRO_PRESETS[state] || [];
        appState.macro_preset_indices[state] = ((appState.macro_preset_indices[state] || 0) + 1) % list.length;
      }

      adaptAutopilotToForcedState(state);
      const curP = getActiveMacroPreset(state);
      showMacroToast('🤖 AUTOPILOT ADAPTADO: ' + state + ' (' + (curP ? curP.name : '') + ')');
    } else {
      // MANUAL MODE:
      // Cycle preset variation if clicking already-active state
      if (appState.macro_state === state) {
        const list = MACRO_PRESETS[state] || [];
        appState.macro_preset_indices[state] = ((appState.macro_preset_indices[state] || 0) + 1) % list.length;
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

`;

appContent = appContent.substring(0, startIndex) + macroEngineBlock + appContent.substring(endIndex);
fs.writeFileSync(appPath, appContent, 'utf8');
console.log("Successfully integrated MACRO_PRESETS engine into public/app.js!");
