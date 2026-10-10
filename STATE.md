# PENUMBRA SYSTEM · ESTADO EM TEMPO REAL

- **Última Atualização:** 10/10/2026, 04:04:48 BRT
- **Status do Sistema:** 🟢 AO VIVO & DEPLOYED NA BUNNY CDN (`https://gigantera-penumbra.b-cdn.net`)
- **Painel de Controle Ativo:** [http://localhost:3000](http://localhost:3000) e [https://gigantera-penumbra.b-cdn.net](https://gigantera-penumbra.b-cdn.net)
- **Motor Agêntico:** 🟢 NEXUS VIBE ENGINE ATIVO (`.agents/` com Governança L1-L4, FinOps e Skills)
- **Transformação de Clipes Pré-Ar:** 🟢 ATIVO (Dual-Tier Matrix: `TotalScale = LayerScale * ClipScale`, `TotalRot = LayerRot + ClipRot`, `TotalPos = LayerPos + ClipPos`, botão `📐 CLIPE` no Preview Cue e `📐 POS` no Media Pool)
- **Layer 5 (Overlay Deck):** 🟢 ATIVO (Canal de sobreposição dedicado, Track L5 no Arranger, Channel Strip 5 com blend e fader próprios)
- **Trava de Máscara Master:** 🟢 ATIVO (Flag de imunização `master_locked_matte` travando enquadramento estático contra Autopilot e Presets)
- **Gêmeo MIDI & Click-to-Map:** 🟢 ATIVO (Modo `LIVE CONTROL` vs `🎯 CLICK TO MAP`, mapeamento visual direto e 4 Presets de Fábrica Pro)
- **Estabilização da Barra Central:** 🟢 RESOLVIDO (Cápsula de 215px fixa, eliminação de jitter e tag estável `FORÇADO`)
- **Microfone & Line-In Ao Vivo:** 🟢 ATIVO (Captura resiliente via `getUserMedia`, Preamp Gain slider 0.5x-4.0x, VU meter hardware-grade RMS/Peak dB com indicador de clip, spectral flux BPM counter, e CUE seguro 100% isolado do MP3)
- **Painel Studio Inspector (🎭 MATTE):** 🟢 ATIVO (Controle paramétrico de máscaras: Geometria X/Y, escala anamórfica, rotação, vinheta procedural com roundness 0%-100%, feathering suave, auras concêntricas e dinâmica áudio-reativa, acionável via botão `⚙ INSP` nos cards)
- **Matriz 3D Generativa & Estrela 13 Desacoplada (🌌 3D GEN):** 🟢 ATIVO (4 cenas: `ESPINHAÇO`, `OCEAN SUN`, `ESTRELA 13`, `HYBRID COSMOS`; 5 paletas de luxo; reatividade desacoplada com rotação da estrela no treble/air e kick explosivo no Z-depth do numeral 13 no sub/bass)
- **Página MIDI Dedicada Banco 3 (BANK C · 3D MATRIX):** 🟢 ATIVO (Ciclo de 3 bancos A/B/C no hardware twin, 8 faders e 8 knobs mapeados para morph 3D, câmeras, kick Z, amplitude de onda, vinheta e preamp gain)

## Pipeline de Processos
- **Audio Brain (DSP & Predição):** 🟢 ATIVO (PID de background, streaming teste / P2, OSC UDP 7000, WS 7001)
- **Web Controller (Porta 3000):** 🟢 ATIVO (Servidor Express + WebSocket Cockpit)
- **TouchDesigner NDI Output:** 🟢 CONFIGURADO (`PENUMBRA_LIVE` via NDI Out TOP)
- **TouchDesigner Syphon Output:** 🟢 CONFIGURADO (`PENUMBRA_SYPHON` via Syphon Out TOP)

## 📦 Snapshot de Código (Auto-gerado)
| Arquivo | Linhas | Tamanho |
|---|---|---|
| `app.js` | 11,938 | 491.7 KB |
| `styles.css` | 9,994 | 193.8 KB |
| `index.html` | 3,517 | 227.3 KB |
| `Penumbra_Portable.html` | — | 1006.9 KB |

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
