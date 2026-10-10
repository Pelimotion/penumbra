# PENUMBRA SYSTEM · ESTADO EM TEMPO REAL

- **Última Atualização:** 09/10/2026, 23:05:08 BRT
- **Status do Sistema:** 🟢 AO VIVO & DEPLOYED NA BUNNY CDN (`https://gigantera-penumbra.b-cdn.net`)
- **Painel de Controle Ativo:** [http://localhost:3000](http://localhost:3000) e [https://gigantera-penumbra.b-cdn.net](https://gigantera-penumbra.b-cdn.net)
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
| `app.js` | 9,736 | 382.4 KB |
| `styles.css` | 8,759 | 169.6 KB |
| `index.html` | 3,336 | 212.7 KB |
| `Penumbra_Portable.html` | — | 841.3 KB |

## 🎬 Media Pool
- **Clipes no Manifesto:** 75 entradas
- **Thumbnails Sincronizadas:** 327 arquivos no CDN

## 🔢 Git Status & Governança Colaborativa
- **Branch Ativa:** `feat/penumbra-collaborative-dev`
- **Protocolo:** PR-First (Desenvolvimento na branch dedicada → Push → Pull Request para `main` sem conflitos)
- **Repositório Principal:** [Pelimotion/penumbra](https://github.com/Pelimotion/penumbra)
- **Pull Request Aberto:** PR #2 (`feat/penumbra-collaborative-dev` -> `main`)

## 🤝 Handover & Recursos Ativos
1. **Branch de Trabalho:** Continuar exclusivamente na branch `feat/penumbra-collaborative-dev`.
2. **Ambiente de Testes / Preview:**
   - **Local Dev Server:** `http://localhost:3000/`
   - **Popout Clean Feed:** `http://localhost:3000/popout.html?view=program`
   - **Bunny Edge CDN Online:** `https://gigantera-penumbra.b-cdn.net/index.html`
   - **Executável Portátil CDN:** `https://gigantera-penumbra.b-cdn.net/Penumbra_Portable.html`
   - **Vercel Preview (PR #2):** `https://penumbra-git-feat-penumbra-3eb824-pelimotionart-6049s-projects.vercel.app/penumbra/`
3. **Hardware Twin & MIDI:**
   - **M-Vave SMC-MIXER Dual Preset Engine:** Detecção automática e comutação instantânea entre **Banco 1 (Seta Esquerda ◄ - Faders & Encoders 1:1)** e **Banco 2 (Seta Direita ► - Matriz de 32 Botões Mute/Solo/Rec/Select + Transporte)**.
   - **Navegação B1–B4 (4 Modos de Software):** B1 Master Live Mixer, B2 Layer Focus & Params, B3 Conductor Macros, B4 Color Lab.
   - **Métodos de Seleção B1–B4:** Botão `[CYCLE]` do hardware, botões `SEL 6`/`SEL 7`/`SEL 8`, atalhos de teclado (`B`, `[`, `]`, `F1`–`F4`, `H`), e cliques diretos nos badges interativos do Header (`B1: MIXER` e `◄ HW1: FADERS`).
   - **Soft Takeover:** Modos `pickup`, `scaling` e `direct` com indicadores visuais no twin.

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
