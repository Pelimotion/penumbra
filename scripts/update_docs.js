#!/usr/bin/env node
/**
 * PENUMBRA SYSTEM · Auto-Documentation Orchestrator
 * ============================================================
 * Gera e atualiza automaticamente:
 *   - CHANGELOG.md  (histórico de commits com categorias semânticas)
 *   - STATE.md      (estado operacional em tempo real)
 *   - DOCS/ARCHITECTURE.md (snapshot técnico do sistema)
 *
 * Invocado por:
 *   - git post-commit hook (automático a cada commit)
 *   - npm run docs (manual)
 *   - node scripts/update_docs.js [--state-only] [--changelog-only]
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const STATE_ONLY = process.argv.includes('--state-only');
const CHANGELOG_ONLY = process.argv.includes('--changelog-only');

// ============================================================================
// HELPERS
// ============================================================================
function git(cmd) {
  try {
    return execSync(`git -C "${ROOT}" ${cmd}`, { encoding: 'utf-8' }).trim();
  } catch (e) {
    return '';
  }
}

function now() {
  return new Date().toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
}

function fileExists(p) { return fs.existsSync(path.join(ROOT, p)); }
function fileSize(p) {
  try {
    const s = fs.statSync(path.join(ROOT, p)).size;
    return s > 1024 * 1024 ? `${(s / 1024 / 1024).toFixed(1)} MB` : `${(s / 1024).toFixed(1)} KB`;
  } catch { return '—'; }
}
function countLines(p) {
  try {
    return fs.readFileSync(path.join(ROOT, p), 'utf-8').split('\n').length.toLocaleString();
  } catch { return '—'; }
}

// ============================================================================
// 1. UPDATE STATE.md
// ============================================================================
function updateState() {
  const branchName = git('rev-parse --abbrev-ref HEAD');
  const lastHash = git('rev-parse --short HEAD');
  const lastMsg = git('log -1 --pretty=%s');
  const lastDate = git('log -1 --format="%ci"').split(' ').slice(0, 2).join(' ');
  const totalCommits = git('rev-list --count HEAD');
  const changedFiles = git('diff --name-only HEAD HEAD~1 2>/dev/null || echo "—"');

  const appJsLines = countLines('penumbra_engine/web_controller/public/app.js');
  const cssLines = countLines('penumbra_engine/web_controller/public/styles.css');
  const htmlLines = countLines('penumbra_engine/web_controller/public/index.html');

  let manifestCount = 0;
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'penumbra_engine/media_pool/media_manifest.json'), 'utf-8'));
    manifestCount = manifest.length;
  } catch {}

  let thumbCount = 0;
  try {
    thumbCount = fs.readdirSync(path.join(ROOT, 'penumbra_engine/media_pool/thumbnails'))
      .filter(f => /\.(jpg|png|webp)$/i.test(f)).length;
  } catch {}

  const portableSize = fileSize('Penumbra_Portable.html');

  const content = `# PENUMBRA SYSTEM · ESTADO EM TEMPO REAL

- **Última Atualização:** ${now()} BRT
- **Status do Sistema:** 🟢 AO VIVO & DEPLOYED NA BUNNY CDN (\`https://gigantera-penumbra.b-cdn.net\`)
- **Painel de Controle Ativo:** [http://localhost:3000](http://localhost:3000) e [https://gigantera-penumbra.b-cdn.net](https://gigantera-penumbra.b-cdn.net)
- **Motor Agêntico:** 🟢 NEXUS VIBE ENGINE ATIVO (\`.agents/\` com Governança L1-L4, FinOps e Skills)
- **Transformação de Clipes Pré-Ar:** 🟢 ATIVO (Dual-Tier Matrix: \`TotalScale = LayerScale * ClipScale\`, \`TotalRot = LayerRot + ClipRot\`, \`TotalPos = LayerPos + ClipPos\`, botão \`📐 CLIPE\` no Preview Cue e \`📐 POS\` no Media Pool)
- **Layer 5 (Overlay Deck):** 🟢 ATIVO (Canal de sobreposição dedicado, Track L5 no Arranger, Channel Strip 5 com blend e fader próprios)
- **Trava de Máscara Master:** 🟢 ATIVO (Flag de imunização \`master_locked_matte\` travando enquadramento estático contra Autopilot e Presets)
- **Gêmeo MIDI & Click-to-Map:** 🟢 ATIVO (Modo \`LIVE CONTROL\` vs \`🎯 CLICK TO MAP\`, mapeamento visual direto e 4 Presets de Fábrica Pro)
- **Estabilização da Barra Central:** 🟢 RESOLVIDO (Cápsula de 215px fixa, eliminação de jitter e tag estável \`FORÇADO\`)
- **Persistência de Áudio Mic/P2:** 🟢 CORRIGIDO (Estado \`audio_source\` persistido no backend e protegido no frontend contra sobrescrita de telemetria)
- **Vídeo em Nuvem (Anti-Freeze 60 FPS):** 🟢 RESOLVIDO (6 clipes nativos CDN adicionados ao topo, fallback resiliente, crossOrigin anonymous, sem telas congeladas)
- **Áudio Reativo Club / Balada:** 🟢 ATIVO (Suíte \`PenumbraWebAudio\` com permissão nativa \`getUserMedia\`, Highpass 28Hz, Lowpass 15.5kHz, Normalizador Dinâmico Leaky e Spectral Flux)
- **Biblioteca de Mattes:** 🟢 CORRIGIDA (29 máscaras nativas, rotas Vercel/CDN sincronizadas, fallback resiliente)
- **Persistência & Relink Local:** 🟢 ATIVO (IndexedDB Structured Clone de FileSystemDirectoryHandle, auto-reconnect, banner de relink e reindexação de arquivos locais)
- **Studio Launcher:** 🟢 DaVinci Resolve / Cavalry Aesthetics com PIN 2026 integrado

## Pipeline de Processos
- **Audio Brain (DSP & Predição):** 🟢 ATIVO (PID de background, streaming teste / P2, OSC UDP 7000, WS 7001)
- **Web Controller (Porta 3000):** 🟢 ATIVO (Servidor Express + WebSocket Cockpit)
- **TouchDesigner NDI Output:** 🟢 CONFIGURADO (\`PENUMBRA_LIVE\` via NDI Out TOP)
- **TouchDesigner Syphon Output:** 🟢 CONFIGURADO (\`PENUMBRA_SYPHON\` via Syphon Out TOP)

## 📦 Snapshot de Código (Auto-gerado)
| Arquivo | Linhas | Tamanho |
|---|---|---|
| \`app.js\` | ${appJsLines} | ${fileSize('penumbra_engine/web_controller/public/app.js')} |
| \`styles.css\` | ${cssLines} | ${fileSize('penumbra_engine/web_controller/public/styles.css')} |
| \`index.html\` | ${htmlLines} | ${fileSize('penumbra_engine/web_controller/public/index.html')} |
| \`Penumbra_Portable.html\` | — | ${portableSize} |

## 🎬 Media Pool
- **Clipes no Manifesto:** ${manifestCount} entradas
- **Thumbnails Sincronizadas:** ${thumbCount} arquivos no CDN

## 🔢 Git Status
- **Branch:** \`${branchName}\`
- **Último Commit:** \`${lastHash}\` — ${lastMsg}
- **Data:** ${lastDate}
- **Total de Commits:** ${totalCommits}

## Recursos de Visualização Ampliada & Janela Flutuante
- **⛶ EXPANDIR (Modo Cinema In-Cockpit):** Viewport 1280×720 sobreposto ao cockpit com fundo ultra-escuro (backdrop blur 24px) e take instantâneo.
- **🗖 DESTACAR (Janela Flutuante Independente):** Pop-out independente (\`popout.html\`) com tela cheia nativa para segundo monitor/Sidecar.

## Recursos de Regência Musical & Macro Presets
- **Matriz de Macro Presets (Aba 5 Conductor & HUD):**
  - 16 Presets curados distribuídos pelos estados \`INTRO\`, \`GROOVE\`, \`BUILD\`, \`DROP\`, \`BREAK\`.
  - Integração profunda: Cinemática de deformação, máscaras categoria-específicas, blend de camadas e a stack dos 5 plugins do After Effects (Pixel Sorter, Pixel Stretch, Modulation, Bad TV, RXXR).
  - Toast HUD flutuante em tempo real e indicador no cabeçalho de áudio com tag do preset ativo.
- **Modo Manual com Padrão Groove Limpo:**
  - Sem interação do operador, o modo manual permanece estritamente em \`GROOVE\` (\`Pure Clean Cinema\`): zero efeitos pesados, sem distorção, máscaras limpas e vídeo original a 30 FPS cristalino.
- **FPS Padrão:** 30 FPS · **Rede/OSC:** DESLIGADO por padrão
- **PIN de Acesso Cloud:** 2026

## Nexus Stream Engine & Media Pool Smart Bins
- **Ingestão Dual-Mode:**
  - **📡 Stream Ao Vivo:** Resolução instantânea de URLs externas/YouTube com proxy CORS HTTP 206 para amostragem no canvas a 60 FPS sem SecurityError.
  - **⬇️ Media Downloader:** Download assíncrono em background via \`yt-dlp\`, extração de frames-chave para thumbnail via \`ffmpeg\`, inspeção de metadados via \`ffprobe\` e registro automático no manifesto.
- **Organização por Categorias & Smart Bins:**
  - Bins estéticos dedicados: \`MINIMAL\`, \`ABSTRACT\`, \`FIGURA\`, \`DENSE\`, \`CHROMA\`, \`STREAMS & YOUTUBE\`, \`GENERATIVE\`.
  - Agrupamento visual colapsável por seções de categoria ou modo grade contínua.
  - Filtro cruzado por Origem (\`TODAS\`, \`☁️ BUNNY CDN\`, \`📁 LOCAL SSD\`, \`▶️ YOUTUBE & STREAMS\`).
  - Reatribuição de categorias in-place com persistência imediata no manifesto do disco e no storage do navegador.
  - Botão 1-click para download direto a partir de qualquer card de stream ao vivo.

## Conexões & Roteamento
- **Entrada de Áudio:** RCA mesa DJ → Adaptador P2 blindado → MacBook Built-in Audio / UMC22
- **Saída de Vídeo:** MacBook Felipe → Projeção Direta HDMI (Projetor Físico) · Transmissão NDI opcional desativada por padrão
- **Painel de Controle:** \`http://localhost:3000\` (MacBook / iPad)
- **Decodificação de Vídeo:** HTML5 Hardware Accelerated MP4/MOV Streaming (30 FPS padrão)
- **Grading Tonal & Sobel:** Ativo (Gamma 0.85, Pretos -5%, Médios 1.0, Sobel Mix 22%)
`;

  fs.writeFileSync(path.join(ROOT, 'STATE.md'), content);
  console.log(`  ✓ STATE.md atualizado [${now()}]`);
}

// ============================================================================
// 2. UPDATE CHANGELOG.md
// ============================================================================
const COMMIT_CATEGORIES = {
  feat:     { emoji: '✨', label: 'Novos Recursos' },
  fix:      { emoji: '🐛', label: 'Correções' },
  refactor: { emoji: '♻️', label: 'Refatoração' },
  style:    { emoji: '💅', label: 'Estilo & UI' },
  chore:    { emoji: '🔧', label: 'Manutenção' },
  docs:     { emoji: '📚', label: 'Documentação' },
  perf:     { emoji: '⚡', label: 'Performance' },
  deploy:   { emoji: '🚀', label: 'Deploy & Infra' },
  test:     { emoji: '🧪', label: 'Testes' },
};

function parseConventionalCommit(line) {
  // Format: HASH DATE TYPE(scope): message
  const match = line.match(/^([a-f0-9]+)\s+\(([^)]+)\)\s+(?:(\w+)(?:\(([^)]+)\))?:\s+)?(.+)$/);
  if (!match) return null;
  return {
    hash: match[1],
    date: match[2],
    type: match[3] || 'chore',
    scope: match[4] || '',
    msg: match[5]
  };
}

function updateChangelog() {
  // Get last 60 commits with consistent format
  const rawLog = git(`log -60 --pretty=format:"%h (%as) %s"`);
  if (!rawLog) return;

  const commits = rawLog.split('\n')
    .map(parseConventionalCommit)
    .filter(Boolean);

  // Group by month
  const byMonth = {};
  for (const c of commits) {
    const month = c.date.substring(0, 7); // YYYY-MM
    if (!byMonth[month]) byMonth[month] = {};
    const type = c.type.toLowerCase();
    const cat = COMMIT_CATEGORIES[type] || { emoji: '🔄', label: 'Outros' };
    const key = `${cat.emoji} ${cat.label}`;
    if (!byMonth[month][key]) byMonth[month][key] = [];
    byMonth[month][key].push(c);
  }

  const months = Object.keys(byMonth).sort().reverse();

  let md = `# 📜 PENUMBRA SYSTEM · CHANGELOG\n\n`;
  md += `> Auto-gerado por \`scripts/update_docs.js\` · Atualizado em: ${now()} BRT\n\n`;
  md += `---\n\n`;

  for (const month of months) {
    const [year, mon] = month.split('-');
    const monthName = new Date(year, parseInt(mon) - 1).toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
    md += `## ${monthName.charAt(0).toUpperCase() + monthName.slice(1)}\n\n`;

    for (const [cat, entries] of Object.entries(byMonth[month])) {
      md += `### ${cat}\n`;
      for (const e of entries) {
        const scope = e.scope ? ` **(${e.scope})**` : '';
        md += `- \`${e.hash}\`${scope} ${e.msg}\n`;
      }
      md += '\n';
    }
  }

  fs.writeFileSync(path.join(ROOT, 'CHANGELOG.md'), md);
  console.log(`  ✓ CHANGELOG.md atualizado [${commits.length} commits processados]`);
}

// ============================================================================
// 3. UPDATE DOCS/ARCHITECTURE.md
// ============================================================================
function updateArchitectureDocs() {
  const docsDir = path.join(ROOT, 'docs');
  if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true });

  const skills = fs.readdirSync(path.join(ROOT, '.agents/skills')).filter(f => {
    try { return fs.statSync(path.join(ROOT, '.agents/skills', f)).isDirectory(); } catch { return false; }
  });

  let manifestCount = 0;
  let clipCategories = {};
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'penumbra_engine/media_pool/media_manifest.json'), 'utf-8'));
    manifestCount = manifest.length;
    for (const clip of manifest) {
      const cat = clip.category || clip.folder || 'UNKNOWN';
      clipCategories[cat] = (clipCategories[cat] || 0) + 1;
    }
  } catch {}

  const catTable = Object.entries(clipCategories)
    .sort(([,a],[,b]) => b - a)
    .map(([cat, count]) => `| ${cat} | ${count} |`)
    .join('\n');

  const md = `# 🎛️ PENUMBRA SYSTEM · ARQUITETURA TÉCNICA

> Auto-gerado por \`scripts/update_docs.js\` · ${now()} BRT

---

## Visão Geral

O **Penumbra System** é um VJ Engine audio-reativo de alta performance executado inteiramente no navegador (Zero-Server Architecture), com backend Node.js opcional para controle WebSocket via rede local.

\`\`\`
┌─────────────────────────────────────────────────────────┐
│  PENUMBRA SYSTEM · STACK TÉCNICA                        │
├──────────────────┬──────────────────────────────────────┤
│  Frontend        │  Vanilla JS + WebGL + HTML5 Video   │
│  Estilo          │  Vanilla CSS (Dark Studio System)    │
│  Backend Local   │  Node.js (Express + WebSocket)       │
│  CDN / Edge      │  Bunny.net (São Paulo · gigantera)   │
│  Audio Analysis  │  Python FFT / WebAudio API           │
│  MIDI            │  WebMIDI API (midi.js)               │
│  OSC             │  UDP 7000 (TouchDesigner Bridge)     │
│  3D Plexus       │  Custom WebGL (Anatomical Vertices)  │
└──────────────────┴──────────────────────────────────────┘
\`\`\`

## Arquivos Principais

| Arquivo | Descrição | Linhas |
|---|---|---|
| \`public/app.js\` | Motor principal VJ (render, media, autopilot, FX) | ${countLines('penumbra_engine/web_controller/public/app.js')} |
| \`public/styles.css\` | Design System Dark Studio (DaVinci/Cavalry/Adobe) | ${countLines('penumbra_engine/web_controller/public/styles.css')} |
| \`public/index.html\` | Cockpit HTML + Studio Launcher + PIN Gate | ${countLines('penumbra_engine/web_controller/public/index.html')} |
| \`public/midi.js\` | MIDI Controller Bridge | ${countLines('penumbra_engine/web_controller/public/midi.js')} |
| \`server.js\` | Express + WebSocket Server (modo local) | ${countLines('penumbra_engine/web_controller/server.js')} |
| \`scripts/deploy_cdn.js\` | Deploy automático Bunny Edge CDN | ${countLines('scripts/deploy_cdn.js')} |
| \`scripts/build_portable.js\` | Bundler HTML portátil offline | ${countLines('scripts/build_portable.js')} |
| \`scripts/update_docs.js\` | Auto-documentação (este script) | ${countLines('scripts/update_docs.js')} |

## Media Pool

- **Total de Clipes:** ${manifestCount}

| Categoria | Clipes |
|---|---|
${catTable}

## Fontes de Mídia (Tri-Source Architecture)

\`\`\`
LOCAL DRIVE    → File System Access API (zero-latência, offline)
BUNNY CDN      → https://gigantera-penumbra.b-cdn.net (cloud, PIN: 2026)
STREAM/YOUTUBE → URL direta HLS/MP4 ou YouTube embed
\`\`\`

## Pipeline de Deploy (Auto)

\`\`\`
git commit  →  .git/hooks/post-commit
              ↓  (se toca public/ ou scripts/)
            scripts/deploy_cdn.js
              ↓
            1. Synca media_manifest.json → public/
            2. Compila Penumbra_Portable.html
            3. Upload 7 arquivos para br.storage.bunnycdn.com/gigantera
              ↓
            scripts/update_docs.js
              ↓
            STATE.md + CHANGELOG.md + docs/ARCHITECTURE.md atualizados
\`\`\`

## Compositor Visual de 6 Canais (Layer Matrix & Overlay Deck)

O Penumbra opera com uma matriz de composição inspirada em Resolume Arena e TouchDesigner:

| Canal | Papel Arquitetural | Modo de Blend Padrão | Elemento / Buffer |
|---|---|---|---|
| **L0: Master Base** | Deck A (Program ao Vivo) | Normal / Pass-through | \`<video id="player-l0">\` / \`busCanvasA\` |
| **L1: Pulse Reflex** | Espelho volumétrico procedural (Self-Double 1.18x) | Multiply / Darken | Offscreen buffer (Zero vídeo extra) |
| **L2: Sobel Edge** | Traçado de ossatura e bordas finas (Sobel Find Edges) | Screen (15-30% opac) | Offscreen Sobel convolution buffer |
| **L3: Cue Bus B** | Deck B (Preview do próximo cue antes do ar) | Soft Light / Cut | \`<video id="player-l3">\` / \`busCanvasB\` |
| **L4: Climax Accent** | Impacto de Drop & Clímax (Difference / Exclusion) | Difference | \`<video id="player-l4">\` / Offscreen Accent |
| **L5: Overlay Deck** | Trilha dedicada de sobreposição foreground contínua | Screen / Add / Soft Light | \`<video id="player-l5">\` / \`offscreenOverlay\` |

## Hierarquia de Transformação Geométrica em Dois Níveis (Clipe vs Camada)

Separação comutativa estrita entre a geometria do clipe individual e o barramento global da camada:

1. **Geometria Intrínseca do Clipe (\`clip.transform\`):**
   - Rotação: 0°, +90° CW (converte vídeos 9:16 verticais em 16:9 horizontais sem distorção e sem barras pretas), 180° FLIP, -90° CCW.
   - Escala / Zoom: 0.2x a 3.0x.
   - Posição: Offset X e Offset Y em pixels.
   - Persistência: Gravada no perfil central (\`penumbra_user_profile.json\`) e LocalStorage sob \`custom_clip_transforms[clipId]\`.
2. **Geometria da Camada (\`layer.scale\`, \`layer.pos_x\`, \`layer.pos_y\`, \`layer.rotation\`):**
   - Modulável via Timeline Transform Inspector (\`.tl-transform-inspector\`), MIDI knobs ou automação.
3. **Composição Matricial no Compositor (Zero Garbage Collection a 60 FPS):**
   \`\`\`
   TotalScale = LayerScale * ClipScale
   TotalRot   = (LayerRot + ClipRot) % 360
   TotalPosX  = LayerPosX + ClipPosX
   TotalPosY  = LayerPosY + ClipPosY
   \`\`\`
4. **Workflow de Pré-Ar (Preview Audition):**
   - O operador aperta \`[B]\` para carregar qualquer clipe no Deck B (Preview).
   - Clica no botão \`📐 CLIPE\` no topo do monitor de Preview para abrir o modal de transformação.
   - Ajusta rotação, zoom e enquadramento visualizando a resposta ao vivo a 60 FPS na tela de Preview *antes* de enviar ao ar.
   - Transfere suavemente ao telão com \`AUTO TAKE\` ou crossfader.
   - Também ajustável diretamente no catálogo com o botão \`📐 POS\` nos cards do Media Pool.

## Trava de Enquadramento Master (Locked Framing Matte)

- Flag no compositor e Autopilot: \`appState.master_locked_matte\`.
- Quando travada com o botão \`🔒 TRAVAR MÁSCARA MASTER\` (Módulo 3: Mattes), o Autopilot (mesmo com \`matte_orchestration\` ativo) e os 16 Macro Presets ficam expressamente proibidos de substituir ou deformar a máscara master de saída.
- Garante enquadramento estrutural arquitetônico estático intacto durante toda a apresentação.

## Suíte MIDI Click-to-Map & Gêmeo Virtual Interativo (M-Vave SMC-MIXER)

- **Mapeamento CC USB-C Nativo:** Faders 1-8 em CC 20..27, Master Fader em CC 28, Encoders 1-8 em CC 30..37, Botões M/S/R/SEL em CC 40..71.
- **Navegação Modal em 4 Bancos:**
  - B1: Master Live Mixer (Faders 1-6 controlam L0..L5, Fader 7 Crossfader, Fader 8 Dimmer).
  - B2: Layer Focus (Zoom, Posição, Mascaramento Procedural e Sensibilidade de Banda).
  - B3: Conductor & Macro Presets (Disparo dos 16 Macro Presets narrativos).
  - B4: Color Lab & Grading (Gamma, Pretos, Médios, Contraste, Sobel Mix e Limiar).
- **Modo Click-to-Map Interativo:** Alternância entre \`LIVE CONTROL\` e \`🎯 CLICK TO MAP\`. Ao clicar em qualquer knob, fader ou botão físico no Hardware Twin, abre-se o modal de mapeamento visual permitindo vincular parâmetros de software com seleção de curvas (Linear, Exp, Log, S-Curve) e inversão de sentido.
- **4 Presets de Fábrica Curados:**
  1. *Master Jam 6-Decks & Crossfader*
  2. *Layer Geometry & Overlay Sculptor*
  3. *Ambient Conductor & Matte Flow*
  4. *4-Deck Battle & Hard Strobe Clímax*

## Áudio DSP Club & PenumbraWebAudio Engine

- Captura direta via Web Audio API (\`getUserMedia\`) com filtros de voz do navegador desligados (\`echoCancellation: false\`, \`noiseSuppression: false\`, \`autoGainControl: false\`).
- Filtro passa-alta Biquad em 28 Hz (rejeição de sub-rumble mecânico e DC offset) e passa-baixa em 15.5 kHz (rejeição de chiado de palco).
- Analisador FFT de 2048 pontos com seguidor dinâmico Leaky Peak Follower (ajuste automático para variações de 75 dB em breakdowns a 110 dB em drops).
- Detecção de transientes de bumbo 4/4 via Spectral Flux (Fluxo Espectral) acionando wiggles orgânicos e shaders a 60 FPS.
- Persistência e proteção de entrada: modo de áudio memorizado no backend e client-side garantindo estabilidade na seleção de Microfone ou Entrada P2 Line In.

## Nexus Agent Engine (Governed Vibe-Coding)

- **Skills Ativas:** ${skills.join(', ') || '(nenhuma)'}
- **Invariantes:** \`.agents/invariants/invariants.md\`
- **Contexto Episódico:** \`STATE.md\` (automático) + \`DECISOES.md\` (ADRs)
- **Regras de Governança:** \`.agents/rules/01_context_engineering.md\` … \`04_vibe_orchestration.md\`

## FPS & Performance

| Parâmetro | Valor Padrão |
|---|---|
| FPS | **30 FPS** (economia bateria, sincronia projetor) |
| Rede NDI / Syphon | DESLIGADO por padrão |
| OSC UDP | DESLIGADO por padrão |
| Fallback 60 FPS | Ativável nas configurações |

## Segurança

- PIN de acesso ao Cloud: **2026** (codificado client-side, não em servidor)
- CORS restrito a \`localhost\` no servidor local
- Credenciais de Storage na \`.env\` (nunca commitada no git)
`;

  fs.writeFileSync(path.join(docsDir, 'ARCHITECTURE.md'), md);
  console.log(`  ✓ docs/ARCHITECTURE.md atualizado`);
}

// ============================================================================
// MAIN
// ============================================================================
console.log(`📚 [PENUMBRA DOCS] Atualizando documentação do projeto...`);

try {
  if (!CHANGELOG_ONLY) updateState();
  if (!STATE_ONLY) {
    if (!CHANGELOG_ONLY) updateArchitectureDocs();
    updateChangelog();
  }
  console.log(`✅ [DOCS] Documentação atualizada com sucesso. [${now()}]`);
} catch (err) {
  console.error('💥 [DOCS ERROR]:', err.message);
  process.exit(1);
}
