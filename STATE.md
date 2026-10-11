# PENUMBRA SYSTEM · ESTADO EM TEMPO REAL

- **Última Atualização:** 11/10/2026, 20:20:00 BRT
- **Status do Sistema:** 🟢 AO VIVO & DEPLOYED NA BUNNY CDN (`https://gigantera-penumbra.b-cdn.net`)
- **Painel de Controle Ativo:** [http://localhost:3000](http://localhost:3000) e [https://gigantera-penumbra.b-cdn.net](https://gigantera-penumbra.b-cdn.net)
- **Rede de Segurança P0 (Broadcast Preflight):** 🟢 100% APROVADO (`npm run preflight` em 13.9s: Smoke E2E 7/7 passos verdes + Regressão Visual em 4 Viewports e 5 Macro States)
- **Leveza & Performance (30 FPS Default):** 🟢 ATIVO (Padrão de fábrica a 30 FPS para manter o computador e a GPU ultra-frios e leves, preservando 100% das funções)
- **3D Vanguarda & Categoria Oficial no Media Pool:** 🟢 ENTREGUE (9 Cenas procedurais 3D de vanguarda artística/marketing/videoarte: Mercury Blob Liquid Chrome, Brutalist Monolith 13, Nebula Stardust, Cyber Wireframe Lattice, Quantum Torus Flux, Plexus Marine Spine, Ocean Sun, Star 13 e Hybrid Cosmos; com isolamento de buffers offscreen por deck/layer, categoria oficial '3D' e botão de coleção dedicado na biblioteca)
- **Execução Híbrida Local (SSD) vs Nuvem (CDN):** 🟢 100% RESILIENTE (74 vídeos no Bunny Edge CDN com reprodução instantânea na nuvem e reconexão silenciosa em 1 clique da pasta do SSD local via File System Access API + IndexedDB)
- **Pisca/Rebote em Deck A (Telemetry Race Condition):** 🟢 RESOLVIDO (Implementada Guarda de Autoridade Temporal de 1500ms `_assignedAt` rejeitando rollbacks de telemetria obsoleta do servidor)
- **Ergonomia iPad & Carga Cognitiva P1:** 🟢 AUDITADO & PROPOSTA DUAL-MODE ENTREGUE (Audit em 168 targets tácteis, proposta `proposals/ipad_dual_mode_cockpit.html` com Modo LIVE >= 48px e zero-hover)
- **Medição Científica de Output Visual P3:** 🟢 AUDITADO (ITU-R BT.709 Luma Spectrum nos 5 estados, 0.00% estouro de branco, benchmark térmico comprovando 1280x720 a 2.2ms por frame na GPU)
- **Motor Agêntico:** 🟢 NEXUS VIBE ENGINE ATIVO (`.agents/` com Governança L1-L4, FinOps e Skills)
- **Integridade do Autopilot (Anti-Double-Take):** 🟢 RESOLVIDO (Eliminado duplo disparo com cooldown musical determinístico, desacoplamento de telemetria WebSocket e guarda atômica `lastAutopilotTakeTimestamp`)
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
- **Studio Launcher:** 🟢 DaVinci Resolve / Cavalry Aesthetics com portão de acesso autenticado

## Pipeline de Processos
- **Audio Brain (DSP & Predição):** 🟢 ATIVO (PID de background, streaming teste / P2, OSC UDP 7000, WS 7001)
- **Web Controller (Porta 3000):** 🟢 ATIVO (Servidor Express + WebSocket Cockpit)
- **TouchDesigner NDI Output:** 🟢 CONFIGURADO (`PENUMBRA_LIVE` via NDI Out TOP)
- **TouchDesigner Syphon Output:** 🟢 CONFIGURADO (`PENUMBRA_SYPHON` via Syphon Out TOP)

## 📦 Snapshot de Código (Auto-gerado)
| Arquivo | Linhas | Tamanho |
|---|---|---|
| `app.js` | 14,831 | 627.5 KB |
| `styles.css` | 11,453 | 225.8 KB |
| `index.html` | 3,596 | 235.7 KB |
| `Penumbra_Portable.html` | — | 1.2 MB |

## 🎬 Media Pool
- **Clipes no Manifesto:** 75 entradas
- **Thumbnails Sincronizadas:** 327 arquivos no CDN

## 🔢 Git Status
- **Branch:** `feat/vj-engine-p0-quickwins-resilience`
- **Último Commit:** `d646643` — docs(governance): update STATE.md with commit 8b1eb78
- **Data:** 2026-10-11 09:18:17
- **Total de Commits:** 68

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
- **FPS Padrão:** 30 FPS (estabilidade térmica em palco) com seletor opcional para 60 FPS · **Rede/OSC:** DESLIGADO por padrão
- **Autenticação de Acesso:** PIN dinâmico / Variável de ambiente (protegido contra vazamento público)

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
