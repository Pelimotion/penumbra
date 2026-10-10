# PENUMBRA SYSTEM · ESTADO EM TEMPO REAL

- **Última Atualização:** 10/10/2026, 16:15:00 BRT
- **Status do Sistema:** 🟢 AO VIVO & DEPLOYED NA BUNNY CDN (`https://gigantera-penumbra.b-cdn.net`)
- **Painel de Controle Ativo:** [http://localhost:3000](http://localhost:3000) e [https://gigantera-penumbra.b-cdn.net](https://gigantera-penumbra.b-cdn.net)
- **Motor Agêntico:** 🟢 NEXUS VIBE ENGINE ATIVO (`.agents/` com Governança L1-L4, FinOps e Skills)
- **Barra Compacta do Media Pool & Recuperação de Espaço Vertical (28px):** 🟢 RESOLVIDO (Barra unificada de 28px de altura, breadcrumbs integrados com cápsula do Autopilot Pool `⚡ POOL: X/Y`, filtros rápidos e gaveta retrátil de ações `[⚡ AÇÕES ▾]`, recuperando mais de 100px verticais para os cards de vídeo)
- **Operação Intuitiva de Takes do Autopilot & Trava Manual:** 🟢 RESOLVIDO (Badges explícitas e botões `⚡ NO AUTO` vs `🔒 MANUAL` com ícone de cadeado âmbar, com alternância instantânea por clique no botão ou na miniatura)
- **Sincronização de Pastas do Autopilot nas Configurações:** 🟢 RESOLVIDO (Arquitetura determinística `excluded_folders: string[]` eliminando o bug de pastas que persistiam marcadas, com botões em lote `[✓ MARCAR TODAS]` e `[✕ DESMARCAR TODAS]`)
- **Pro Timeline Arranger (Padrão Resolume Arena 7 / DaVinci Resolve 19):** 🟢 ATIVO (Escalonamento rítmico dinâmico 4B-64B, horizonte preditivo de fila com thumbnails reais, playhead sub-pixel 60 FPS com badge `BAR X.Y`, 7 tracks sincronizados, régua SMPTE com estados narrativos e integração bidirecional com Studio Inspector)
- **Studio Inspector Unificado (Padrão DaVinci/Resolume):** 🟢 ATIVO (Eliminação da barra comprimida da timeline, nova `.tl-inspector-bridge`, controles de Pos X/Y, Nudge Pad, Escala e Reset integrados no drawer lateral)
- **Motor Per-Matte & Inspeção Desacoplada:** 🟢 ATIVO (Inspeção imediata ao clicar em qualquer máscara ou clipe na biblioteca/Media Pool sem alterar camadas ao vivo, motor isolado `mattes_config`, modo Pin `[⚡ SEGUIR]`/`[📌 FIXADO]`)
- **Eliminação de Flash em Transições & Sobel Find Edges Redesign:** 🟢 RESOLVIDO (Bypass de Deck B em opacidade 0, Sobel Solo puro sem composite vazando, e buffer isolado `sobelCanvas`)
- **Entrada de Linha (P2) & Microfone:** 🟢 ATIVO (Smart auto-detection de dispositivos P2/Line-in, filtros Biquad HPF 24Hz e LPF 16kHz, VU meter hardware-grade RMS/Peak dB e spectral flux BPM)
- **BPM Permanente & Tap Tempo HUD:** 🟢 ATIVO (Capsule no cabeçalho com LED downbeat, pill no Master Control Bridge, Tap Tempo com média móvel ponderada, contador de toques e animação neon)
- **Transformação de Clipes Pré-Ar:** 🟢 ATIVO (Dual-Tier Matrix: `TotalScale = LayerScale * ClipScale`, `TotalRot = LayerRot + ClipRot`, `TotalPos = LayerPos + ClipPos`)
- **Layer 5 (Overlay Deck):** 🟢 ATIVO (Canal de sobreposição dedicado, Track L5 no Arranger, Channel Strip 5 com blend e fader próprios)
- **Trava de Máscara Master:** 🟢 ATIVO (Flag de imunização `master_locked_matte` travando enquadramento estático contra Autopilot e Presets)
- **Gêmeo MIDI & Click-to-Map:** 🟢 ATIVO (Modo `LIVE CONTROL` vs `🎯 CLICK TO MAP`, mapeamento visual direto e 4 Presets de Fábrica Pro)

## Pipeline de Processos
- **Audio Brain (DSP & Predição):** 🟢 ATIVO (PID de background, streaming teste / P2, OSC UDP 7000, WS 7001)
- **Web Controller (Porta 3000):** 🟢 ATIVO (Servidor Express + WebSocket Cockpit)
- **TouchDesigner NDI Output:** 🟢 CONFIGURADO (`PENUMBRA_LIVE` via NDI Out TOP)
- **TouchDesigner Syphon Output:** 🟢 CONFIGURADO (`PENUMBRA_SYPHON` via Syphon Out TOP)

## 📦 Snapshot de Código (Auto-gerado)
| Arquivo | Linhas | Tamanho |
|---|---|---|
| `app.js` | 14,020 | 606.3 KB |
| `styles.css` | 11,085 | 223.1 KB |
| `index.html` | 3,569 | 237.5 KB |
| `Penumbra_Portable.html` | — | 1,142.0 KB |

## 🎬 Media Pool
- **Clipes no Manifesto:** 81 entradas
- **Thumbnails Sincronizadas:** 327 arquivos no CDN

## 🔢 Git Status
- **Branch:** `feat/vj-inspector-midi-findedges-redesign`
- **Último Commit:** `1a7e7c6` — docs: update STATE.md with Studio Inspector, Color & Light suite and Bins breadcrumbs
- **Data:** 2026-10-10 04:04:47
- **Total de Commits:** 50

## Recursos de Visualização Ampliada & Janela Flutuante
- **⛶ EXPANDIR (Modo Cinema In-Cockpit):** Viewport 1280×720 sobreposto ao cockpit com fundo ultra-escuro (backdrop blur 24px) e take instantâneo.
- **🗖 DESTACAR (Janela Flutuante Independente):** Pop-out independente (`popout.html`) com tela cheia nativa para segundo monitor/Sidecar.

## Recursos de Regência Musical & Macro Presets
- **Matriz de Macro Presets (Aba 5 Conductor & HUD):**
  - 16 Presets curados distribuídos pelos estados `INTRO`, `GROOVE`, `BUILD`, `DROP`, `BREAK`.
  - Integração profunda: Cinemática de deformação, máscaras categoria-específicas, blend de camadas e a stack dos 5 plugins do After Effects (Pixel Sorter, Pixel Stretch, Modulation, Bad TV, RXXR).
  - Toast HUD flutuante em tempo real e indicador no cabeçalho de áudio com tag do preset ativo.
- **Modo Manual com Padrão Groove Limpo:**
  - Sem interação do operador, o modo manual permanece estritamente em `GROOVE` (`Pure Clean Cinema`): zero efeitos pesados, sem distorção, máscaras limpas e vídeo original a 30 FPS cristalino.
- **FPS Padrão:** 30 FPS · **Rede/OSC:** DESLIGADO por padrão
- **PIN de Acesso Cloud:** 2026

## Nexus Stream Engine & Media Pool Smart Bins
- **Ingestão Dual-Mode:**
  - **📡 Stream Ao Vivo:** Resolução instantânea de URLs externas/YouTube com proxy CORS HTTP 206 para amostragem no canvas a 60 FPS sem SecurityError.
  - **⬇️ Media Downloader:** Download assíncrono em background via `yt-dlp`, extração de frames-chave para thumbnail via `ffmpeg`, inspeção de metadados via `ffprobe` e registro automático no manifesto.
- **Organização por Categorias & Smart Bins:**
  - Bins estéticos dedicados: `MINIMAL`, `ABSTRACT`, `FIGURA`, `DENSE`, `CHROMA`, `STREAMS & YOUTUBE`, `GENERATIVE`.
  - Agrupamento visual colapsável por seções de categoria ou modo grade contínua.
  - Filtro cruzado por Origem (`TODAS`, `☁️ BUNNY CDN`, `📁 LOCAL SSD`, `▶️ YOUTUBE & STREAMS`).
  - Reatribuição de categorias in-place com persistência imediata no manifesto do disco e no storage do navegador.
  - Botão 1-click para download direto a partir de qualquer card de stream ao vivo.

## Conexões & Roteamento
- **Entrada de Áudio:** RCA mesa DJ → Adaptador P2 blindado → MacBook Built-in Audio / UMC22
- **Saída de Vídeo:** MacBook Felipe → Projeção Direta HDMI (Projetor Físico) · Transmissão NDI opcional desativada por padrão
- **Painel de Controle:** `http://localhost:3000` (MacBook / iPad)
- **Decodificação de Vídeo:** HTML5 Hardware Accelerated MP4/MOV Streaming (30 FPS padrão)
- **Grading Tonal & Sobel:** Ativo (Gamma 0.85, Pretos -5%, Médios 1.0, Sobel Mix 22%)
