const fs = require('fs');
const path = require('path');

const appPath = path.resolve(__dirname, '../public/app.js');
let appContent = fs.readFileSync(appPath, 'utf8');

const startMarker = '// Dedicated Persistent Canvas Buffers to prevent any buffer collision or frame offset';
const endMarker = '// ============================================================================\n// 7.2 FX UI INSPECTOR & AUTOPILOT CONTROLLERS';

const startIndex = appContent.indexOf(startMarker);
const endIndex = appContent.indexOf(endMarker);

if (startIndex === -1 || endIndex === -1) {
  console.error("Could not find markers!");
  console.log("startIndex:", startIndex, "endIndex:", endIndex);
  process.exit(1);
}

const newFXBlock = `// Dedicated Persistent Canvas Buffers to prevent any buffer collision or frame offset
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
// 1. PIXEL STRETCH (POR SATORI) - EXACT AFTER EFFECTS REPLICATION
// ----------------------------------------------------------------------------
function applyPixelStretch(ctx, sourceCanvas, w, h, t, bands, p, masterSpeed) {
  if (!p || !p.enabled) {
    ctx.drawImage(sourceCanvas, 0, 0, w, h);
    return;
  }

  const intensity = Math.min(1.0, Math.max(0.0, p.intensity !== undefined ? p.intensity : 0.85));
  const length = Math.max(10, p.length || 240);
  const pxSize = Math.max(1, p.pixel_size || 2);
  const rawDir = p.direction !== undefined ? p.direction : 90;
  const angleDeg = (typeof rawDir === 'number') ? rawDir : (rawDir === 'down' ? 90 : (rawDir === 'up' ? 270 : (rawDir === 'right' ? 0 : 180)));
  const angleRad = (angleDeg * Math.PI) / 180.0;
  const dirX = Math.cos(angleRad);
  const dirY = Math.sin(angleRad);

  const curve = p.curve || 'exponential';
  const smooth = Math.max(0.2, p.smoothness !== undefined ? p.smoothness : 1.8);
  const threshold = p.threshold !== undefined ? p.threshold : 0.50;
  const startOffset = Math.min(0.8, Math.max(0.0, p.start_offset || 0.0));
  const channels = p.channels || 'rgba_split';
  const bass = Number(bands?.bass || 0.5);

  // 1. Solid underlay to guarantee 100% full frame coverage with zero transparent margins
  ctx.drawImage(sourceCanvas, 0, 0, w, h);

  // 2. High-speed multi-pass sample accumulation along vector (1:1 with WGSL shader logic)
  const samples = 14;
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
  for (let s = 1; s <= samples; s++) {
    const tNorm = s / samples;
    const factor = evalCurveWeight(tNorm);
    const dist = (maxStretchDist * tNorm + offsetDist);
    const offX = dirX * dist;
    const offY = dirY * dist;
    const alpha = (1.0 - tNorm * 0.70) * (0.35 / samples) * intensity * (2.2 / smooth);

    if (channels === 'rgba_split') {
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = Math.min(0.8, alpha * 1.3);
      // Optical dispersion
      ctx.drawImage(sourceCanvas, offX - dirY * 3, offY + dirX * 3, w, h);
      ctx.drawImage(sourceCanvas, offX + dirY * 3, offY - dirX * 3, w, h);
    } else if (channels === 'red_only') {
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = Math.min(0.8, alpha * 1.4);
      ctx.drawImage(sourceCanvas, offX, offY, w, h);
    } else if (channels === 'blue_only') {
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = Math.min(0.8, alpha * 1.4);
      ctx.drawImage(sourceCanvas, offX, offY, w, h);
    } else {
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = Math.min(0.75, alpha * 1.2);
      ctx.drawImage(sourceCanvas, offX, offY, w, h);
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
  const length = Math.max(10, p.length || 200);
  const isStretchMode = Boolean(p.stretch_mode);
  const noiseScale = Math.max(1, p.noise_scale || 18);
  const noiseSpeed = Math.max(0.1, p.noise_speed || 1.2);
  const randomNoise = p.random_noise !== undefined ? p.random_noise : 0.15;
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

  // Fill entire expanded buffer with video texture so rotated corners are NEVER empty or transparent
  expCtx.drawImage(sourceCanvas, 0, 0, diag, diag);

  expCtx.save();
  expCtx.translate(halfD, halfD);
  expCtx.rotate(angleRad);

  // Draw main source centered in rotated space
  expCtx.drawImage(sourceCanvas, -halfW, -halfH, w, h);

  // Mirror-pad all 4 edges to full diagonal bounds so slices have full continuous pixels
  expCtx.drawImage(sourceCanvas, 0, 0, w, 2, -halfW, -halfD, w, halfD - halfH);
  expCtx.drawImage(sourceCanvas, 0, h - 2, w, 2, -halfW, halfH, w, halfD - halfH);
  expCtx.drawImage(sourceCanvas, 0, 0, 2, h, -halfD, -halfH, halfD - halfW, h);
  expCtx.drawImage(sourceCanvas, w - 2, 0, 2, h, halfW, -halfH, halfD - halfW, h);

  // 3. Algorithmic slice sorting spanning full diagonal width
  const sliceH = 4;
  const totalSlices = Math.floor(diag / sliceH);

  for (let i = 0; i < totalSlices; i++) {
    const sy = -halfD + i * sliceH;
    const turb = Math.sin(t * noiseSpeed * 3.2 + (i / noiseScale) * 2.8) * randomNoise;
    const rowEnergy = 0.5 + 0.5 * Math.sin(t * masterSpeed * 2.2 + i * 0.28) + turb;

    if (rowEnergy < thMin || rowEnergy > thMax) continue;

    const sortDist = Math.floor(length * (rowEnergy - thMin) * (0.85 + bass * 0.55));
    if (sortDist < 4) continue;

    const sampleSrcY = ((i * sliceH) % h);
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
  const scanlinesDens = Math.max(80, p.tv_scanlines_density || 360);
  const rgbSplit = p.tv_rgb_split !== undefined ? p.tv_rgb_split : 12;
  const tapeNoise = p.tv_tape_noise !== undefined ? p.tv_tape_noise : 0.20;

  const bass = Number(bands?.bass || 0.5);
  const snare = Number(bands?.hi_mid || 0.4);

  // VHS Wiggle & Horizontal Slip with seamless toroidal wraparound
  const wiggleX = (Math.sin(t * masterSpeed * 45.0) * 0.5 + (Math.random() - 0.5)) * wiggle * 30.0 * (1.0 + snare * 0.7);
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

  // RGB Split / Chromatic Aberration (Optical prism offset with screen blend)
  if (rgbSplit > 1) {
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
  if (curvature > 0.02) {
    ctx.save();
    const rad = ctx.createRadialGradient(w * 0.5, h * 0.5, Math.min(w, h) * 0.35, w * 0.5, h * 0.5, Math.max(w, h) * 0.72);
    rad.addColorStop(0, 'rgba(0,0,0,0)');
    rad.addColorStop(1, 'rgba(0,0,0,' + Math.min(0.85, curvature * 2.2).toFixed(2) + ')');
    ctx.fillStyle = rad;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  // CRT Scanlines
  if (scanlinesOp > 0.05) {
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, ' + scanlinesOp.toFixed(2) + ')';
    const step = Math.max(2, Math.floor(h / (scanlinesDens / 2)));
    for (let y = 0; y < h; y += step) {
      ctx.fillRect(0, y, w, 1.4);
    }
    ctx.restore();
  }

  // Tape Noise / Magnetic VHS Grain
  if (tapeNoise > 0.05) {
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

  const style = p.style || 'matrix_code';
  const density = Math.max(4, p.density || 10);
  const edgeMode = Boolean(p.edge_mode);
  const edgeThreshold = p.edge_threshold !== undefined ? p.edge_threshold : 0.40;
  const expand = p.expand_markers !== undefined ? p.expand_markers : 0.35;
  const tint = p.tint || '#00ff88';

  // 1. Draw base image (dimmed for terminal contrast, 100% full frame coverage)
  ctx.drawImage(sourceCanvas, 0, 0, w, h);
  ctx.fillStyle = 'rgba(5, 7, 12, 0.50)';
  ctx.fillRect(0, 0, w, h);

  // 2. Select Glyph Palette based on Style
  let glyphs = ['0', '1', 'ｱ', 'ｶ', 'ｻ', 'ﾀ', 'ﾅ', 'X', '9', '7', 'Z'];
  if (style === 'terminal_amber') glyphs = ['>', '_', '/', '\\\\', '$', '#', '@', '*', '~', '&'];
  else if (style === 'binary_hex') glyphs = ['0', '1', 'A', 'F', 'C', 'E', '4', 'B', 'D'];
  else if (style === 'glitch_blocks') glyphs = ['█', '▓', '▒', '░', '▀', '▄', '▌', '▐'];
  else if (style === 'wireframe_grid') glyphs = ['+', '┼', '─', '│', '┌', '┐', '└', '┘'];

  ctx.save();
  ctx.font = density + "px 'JetBrains Mono', monospace";
  ctx.fillStyle = tint;

  const cols = Math.floor(w / density);
  const rows = Math.floor(h / density);

  for (let r = 0; r < rows; r += 2) {
    for (let c = 0; c < cols; c += 2) {
      const cx = c * density;
      const cy = r * density;
      const gradVal = 0.5 + 0.5 * Math.sin(cx * 0.05 + cy * 0.05 + t * 4.5);

      if (edgeMode) {
        if (gradVal < edgeThreshold) continue;
      } else {
        if (gradVal < 0.25) continue;
      }

      const glyphIdx = Math.floor(Math.abs(gradVal * 100)) % glyphs.length;
      const glyph = glyphs[glyphIdx];

      ctx.globalAlpha = 0.70 + 0.30 * Math.sin(t * 8.0 + c * 0.5);
      ctx.fillText(glyph, cx, cy + density);

      if (expand > 0.1 && Math.random() < 0.03 * expand) {
        ctx.strokeStyle = tint;
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

  const freq = p.frequency || 45;
  const phase = ((p.phase || 0) * Math.PI) / 180 + t * masterSpeed * 2.5;
  const amp = Math.max(2, p.amplitude || 24);
  const lowpass = p.lowpass !== undefined ? p.lowpass : 0.35;
  const linesCount = Math.max(16, p.lines_count || 64);
  const lineThickness = p.line_thickness || 1.4;
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

      for (let x = 0; x <= w; x += 8) {
        const sampleLuma = 0.5 + 0.5 * Math.sin((x / w) * 8.0 + (i / linesCount) * 6.0 + t * 2.0);
        const luma = sampleLuma * (1.0 - lowpass) + lastLuma * lowpass;
        lastLuma = luma;

        const carrier = Math.sin(phase + (x / 45.0) * (freq * 0.1) * (0.2 + luma * 1.8));
        const dy = carrier * amp * luma * (0.8 + bass * 0.5);
        const px = x + offX;
        const py = y0 + dy;

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

  let baseIntensity = fxState.masterIntensity !== undefined ? fxState.masterIntensity : 0.8;
  let baseSpeed = (fxState.masterSpeed !== undefined ? fxState.masterSpeed : 1.0) * (appState.bpm / 60.0);

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
  if (intensity <= 0.01) return;

  const { auxCanvas, auxCtx } = getFxBuffers(w, h);
  auxCtx.clearRect(0, 0, w, h);

  const activeFx = fxState.activeEffect || 'pixel_stretch';
  const targetPlugin = fxState[activeFx];

  if (!targetPlugin || targetPlugin.enabled === false) return;

  if (activeFx === 'pixel_stretch') {
    applyPixelStretch(auxCtx, sourceCanvas, w, h, t, appState.bands, targetPlugin, speed);
  } else if (activeFx === 'pixel_sorter') {
    applyPixelSorter(auxCtx, sourceCanvas, w, h, t, appState.bands, targetPlugin, speed);
  } else if (activeFx === 'bad_tv') {
    applyBadTv(auxCtx, sourceCanvas, w, h, t, appState.bands, targetPlugin, speed);
  } else if (activeFx === 'rxxr') {
    applyRxxr(auxCtx, sourceCanvas, w, h, t, appState.bands, targetPlugin, speed);
  } else if (activeFx === 'modulation') {
    applyModulationMatrix(auxCtx, sourceCanvas, w, h, t, appState.bands, targetPlugin, speed);
  } else {
    applyPixelStretch(auxCtx, sourceCanvas, w, h, t, appState.bands, targetPlugin, speed);
  }

  // Draw Wet Output with Dry/Wet mix seamlessly covering (0, 0, w, h)
  ctx.save();
  ctx.globalAlpha = intensity;
  ctx.drawImage(auxCanvas, 0, 0, w, h);
  ctx.restore();
}
window.applyFXEngine = applyFXEngine;

`;

appContent = appContent.substring(0, startIndex) + newFXBlock + appContent.substring(endIndex);
fs.writeFileSync(appPath, appContent, 'utf8');
console.log("Successfully updated FX engine in public/app.js!");
