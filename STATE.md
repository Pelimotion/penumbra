# PENUMBRA SYSTEM · ESTADO EM TEMPO REAL

- **Última Atualização:** 11/10/2026, 08:55:00 BRT
- **Status do Sistema:** 🟢 AO VIVO & RESILIENTE (P0s Concluídos: GPU Context Loss Handlers, Set Recovery, ESC Fix & 59.02 FPS Sustentados)
- **Painel de Controle Ativo:** [http://localhost:3000](http://localhost:3000) e [https://gigantera-penumbra.b-cdn.net](https://gigantera-penumbra.b-cdn.net)
- **Motor Agêntico:** 🟢 NEXUS VIBE ENGINE ATIVO (`.agents/` com Governança L1-L4, FinOps e Skills)
- **Resiliência GPU & Canvas:** 🟢 ATIVO (Handlers `contextlost` + `contextrestored` para os 7 buffers de canvas contra falhas de cabo HDMI/GPU)
- **Auto-Recovery de Live Set:** 🟢 ATIVO (`sessionStorage` serializando camadas A/B/L5, opacidades, blends e crossfader com restauração em bootstrap)
- **Idempotência & Atalhos de Teclado:** 🟢 RESOLVIDO (Guarda contra duplo registro, Escape universal com desfoque de inputs/diálogos órfãos, vírgula `,` para configurações e `B`/`Shift+B` para Blackout imediato)
- **Arranger Timeline Throttled (Zero Thrashing):** 🟢 RESOLVIDO (Cache de bounding rect + taxa de 30 FPS no arranger secundário, eliminando layout thrashing e cravando 59.02 FPS médios, p95=16.80ms)
- **Acessibilidade & WCAG:** 🟢 APROVADO (Zero violações axe-core; contraste de botão de fechamento > 5.2:1)
- **Web MIDI Resiliente:** 🟢 ATIVO (Captura suave de permissão Web MIDI com suporte plug-and-play ao controlador M-Vave SMC-MIXER)
- **Transformação de Clipes Pré-Ar:** 🟢 ATIVO (Dual-Tier Matrix: `TotalScale = LayerScale * ClipScale`, `TotalRot = LayerRot + ClipRot`, `TotalPos = LayerPos + ClipPos`, botão `📐 CLIPE` no Preview Cue e `📐 POS` no Media Pool)
- **Layer 5 (Overlay Deck):** 🟢 ATIVO (Canal de sobreposição dedicado, Track L5 no Arranger, Channel Strip 5 com blend e fader próprios)
- **Trava de Máscara Master:** 🟢 ATIVO (Flag de imunização `master_locked_matte` travando enquadramento estático contra Autopilot e Presets)
- **Gêmeo MIDI & Click-to-Map:** 🟢 ATIVO (Modo `LIVE CONTROL` vs `🎯 CLICK TO MAP`, mapeamento visual direto e 4 Presets de Fábrica Pro)
- **Estabilização da Barra Central:** 🟢 RESOLVIDO (Cápsula de 215px fixa, eliminação de jitter e tag estável `FORÇADO`)
- **Persistência de Áudio Mic/P2:** 🟢 CORRIGIDO (Estado `audio_source` persistido no backend e protegido no frontend contra sobrescrita de telemetria)
- **Vídeo em Nuvem (Anti-Freeze 60 FPS):** 🟢 RESOLVIDO (6 clipes nativos CDN adicionados ao topo, fallback resiliente, crossOrigin anonymous, sem telas congeladas)
- **Áudio Reativo Club / Balada:** 🟢 ATIVO (Suíte `PenumbraWebAudio` com permissão nativa `getUserMedia`, Highpass 28Hz, Lowpass 15.5kHz, Normalizador Dinâmico Leaky e Spectral Flux)
- **Biblioteca de Mattes:** 🟢 CORRIGIDA (29 máscaras nativas, rotas Vercel/CDN sincronizadas, fallback resiliente)
- **Persistência & Relink Local:** 🟢 ATIVO (IndexedDB Structured Clone de FileSystemDirectoryHandle, auto-reconnect, banner de relink e reindexação de arquivos locais)
- **Studio Launcher:** 🟢 DaVinci Resolve / Cavalry Aesthetics com PIN 2026 integrado

## Pipeline de Processos
- **Audio Brain (DSP & Predição):** 🟢 ATIVO (PID de background, streaming teste / P2, OSC UDP 7000, WS 7001)
- **Web Controller (Porta 3000):** 🟢 ATIVO (Servidor Express + WebSocket Cockpit)
- **TouchDesigner NDI Output:** 🟢 CONFIGURADO (`PENUMBRA_LIVE` via NDI Out TOP)
- **TouchDesigner Syphon Output:** 🟢 CONFIGURADO (`PENUMBRA_SYPHON` via Syphon Out TOP)

## 📦 Snapshot de Código (Auto-gerado)
| Arquivo | Linhas | Tamanho |
|---|---|---|
| `app.js` | 14,795 | 640.8 KB |
| `styles.css` | 11,445 | 225.5 KB |
| `index.html` | 3,597 | 241.4 KB |
| `Penumbra_Portable.html` | — | 1.1 MB |

## 🎬 Media Pool
- **Clipes no Manifesto:** 75 entradas
- **Thumbnails Sincronizadas:** 327 arquivos no CDN

## 🔢 Git Status
- **Branch:** `feat/vj-engine-p0-quickwins-resilience`
- **Último Commit:** `d7e66e6` — fix(resilience): implement p0 critical fixes, canvas context loss protection, live set recovery, and 60fps layout stabilization
- **Data:** 2026-10-11 08:57:58
- **Total de Commits:** 64

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
