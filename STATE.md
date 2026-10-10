# PENUMBRA SYSTEM · ESTADO EM TEMPO REAL

- **Última Atualização:** 10/10/2026, 04:05:00 BRT
- **Status do Sistema:** 🟢 AO VIVO & DEPLOYED NA BUNNY CDN (`https://gigantera-penumbra.b-cdn.net`)
- **Painel de Controle Ativo:** [http://localhost:3000](http://localhost:3000) e [https://gigantera-penumbra.b-cdn.net](https://gigantera-penumbra.b-cdn.net)
- **Motor Agêntico:** 🟢 NEXUS VIBE ENGINE ATIVO (`.agents/` com Governança L1-L4, FinOps e Skills)
- **Studio Inspector de Vanguarda:** 🟢 ATIVO (Drawer lateral padrão DaVinci Resolve com seletor de alvo 🎯 Clipe / 📑 Camada / 🌐 Master & FX e sub-abas 📐 Transformação / 🎨 Cor & Luz / ⚡ FX & Mattes)
- **Suíte de Correção Básica de Cor & Luz:** 🟢 ATIVO (Exposição/Ganho, Black Pedestal para pretos profundos de projetor, Contraste, Gamma, Saturação, Balanço Kelvin -50 a +50, Matiz e 6 Looks Rápidos de 1-Clique)
- **Navegação de Bins & Breadcrumbs:** 🟢 ATIVO (Barra de breadcrumbs persistente `.library-breadcrumb-nav` com retorno `[◂ VER TODAS AS PASTAS [✕]]`, banner de pasta ativa e resolução do corte da busca)
- **Dual-Bank MIDI M-Vave (SMC-MIXER):** 🟢 ATIVO (Banco A: Live Mix, Takes & Levels / Banco B: FX Engine, Mattes & Sculpt, Safe Solo Toggle, atalhos `[` e `]`, `H` para alternar)
- **Find Edges (Layer 2) com Alta Luminância:** 🟢 ATIVO (Camada 2 acima de L0/L1, Sobel com boost 2.8x e renderização nítida de contornos giz/neon sobre `#000000` em Solo)
- **Expansão de FX Presets (50 Curados) & Macros:** 🟢 ATIVO (10 presets por plugin AE, nomes ergonômicos e ágeis no Autopilot)
- **Transformação de Clipes Pré-Ar:** 🟢 ATIVO (Integrado no Studio Inspector com Rotação, Flips H/V, Enquadramento Fit/Fill/Wings, Escala e Micro-Nudge Pad com centralizador `[0,0]`)
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
| `app.js` | 11,456 | 468.0 KB |
| `styles.css` | 9,656 | 187.0 KB |
| `index.html` | 3,492 | 226.0 KB |
| `midi.js` | 2,336 | 98.4 KB |
| `Penumbra_Portable.html` | — | 975.0 KB |

## 🎬 Media Pool
- **Clipes no Manifesto:** 81 entradas
- **Thumbnails Sincronizadas:** 327 arquivos no CDN

## 🔢 Git Status
- **Branch:** `feat/vj-inspector-midi-findedges-redesign`
- **Último Commit:** Em preparação para PR
- **Data:** 2026-10-10 03:15:00
- **Total de Commits:** 46

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
- **Saída de Vídeo:** MacBook Felipe → NDI (Gigabit Ethernet / Wi-Fi) → MacBook Bê (MadMapper)
- **Painel de Controle:** `http://localhost:3000` (MacBook / iPad)
- **Decodificação de Vídeo:** HTML5 Hardware Accelerated MP4/MOV Streaming (30 FPS padrão)
- **Grading Tonal & Sobel:** Ativo (Gamma 0.85, Pretos -5%, Médios 1.0, Sobel Mix 22%)
