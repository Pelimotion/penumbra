# PENUMBRA SYSTEM · ESTADO EM TEMPO REAL

- **Última Atualização:** 09/10/2026, 13:34:00 BRT
- **Status do Sistema:** 🟢 AO VIVO EM PRODUÇÃO (`https://gigantera.xyz/penumbra`) & CDN BUNNY (`https://gigantera-penumbra.b-cdn.net`)
- **Painel de Controle Online:** [https://gigantera.xyz/penumbra](https://gigantera.xyz/penumbra) (Redirecionamento automático para `/penumbra/`)
- **Painel Local:** [http://localhost:3000](http://localhost:3000)
- **Central de Ingestão de Mídias (Ingest Hub):** 🟢 ATIVA (Mídia Local SSD com Drag & Drop, Sincronização Bunny CDN offline e Ingestão de Streams/YouTube com preview ao vivo)
- **Motor Agêntico:** 🟢 NEXUS VIBE ENGINE ATIVO (`.agents/` com Governança L1-L4, FinOps e Skills)
- **Studio Launcher:** 🟢 DaVinci Resolve / Cavalry Aesthetics com PIN 2026 integrado

## Pipeline de Processos
- **Audio Brain (DSP & Predição):** 🟢 ATIVO (PID de background, streaming teste / P2, OSC UDP 7000, WS 7001)
- **Web Controller (Porta 3000):** 🟢 ATIVO (Servidor Express + WebSocket Cockpit)
- **TouchDesigner NDI Output:** 🟢 CONFIGURADO (`PENUMBRA_LIVE` via NDI Out TOP)
- **TouchDesigner Syphon Output:** 🟢 CONFIGURADO (`PENUMBRA_SYPHON` via Syphon Out TOP)

## 📦 Snapshot de Código (Auto-gerado)
| Arquivo | Linhas | Tamanho |
|---|---|---|
| `app.js` | 9,228 | 372.0 KB |
| `styles.css` | 7,693 | 152.0 KB |
| `index.html` | 3,024 | 195.9 KB |
| `Penumbra_Portable.html` | — | 722.5 KB |

## 🎬 Media Pool & Ingestão
- **Clipes no Manifesto:** 75 entradas base + clipes dinâmicos
- **Thumbnails Sincronizadas:** 327 arquivos no CDN
- **Central de Ingestão Unificada:** Atalho `I` no teclado ou botões `+ INGESTÃO`, `LOCAL`, `BUNNY`, `YOUTUBE` na barra do Media Pool.
- **Detecção YouTube oEmbed:** Pré-visualização instantânea de título e miniatura em tempo real ao colar a URL.
- **Drag & Drop Universal:** Arraste vídeos ou áudios para dentro do cockpit para ingestão imediata via blob.

## 🔢 Git Status
- **Branch:** `main`
- **Último Commit:** `59149e4` — build(vercel): configure buildCommand and outputDirectory for automated static deployment
- **Data:** 2026-10-09 13:33:41

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
