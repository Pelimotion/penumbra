# PENUMBRA SYSTEM · ESTADO EM TEMPO REAL

- **Última Atualização:** 11/10/2026, 20:37:26 BRT
- **Status do Sistema:** 🟢 AO VIVO & DEPLOYED NA BUNNY CDN (`https://gigantera-penumbra.b-cdn.net`)
- **Painel de Controle Ativo:** [http://localhost:3000](http://localhost:3000) e [https://gigantera-penumbra.b-cdn.net](https://gigantera-penumbra.b-cdn.net)
- **Motor Agêntico:** 🟢 NEXUS VIBE ENGINE ATIVO (`.agents/` com Governança L1-L4, FinOps e Skills)
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
| `app.js` | 15,470 | 651.4 KB |
| `styles.css` | 11,454 | 225.8 KB |
| `index.html` | 3,605 | 236.6 KB |
| `Penumbra_Portable.html` | — | 1.2 MB |

## 🎬 Media Pool & Generative 3D
- **Clipes no Manifesto:** 86 entradas (incluindo 12 cenários generativos 3D autônomos)
- **Thumbnails Sincronizadas:** 327 arquivos no CDN
- **Cenários 3D Disponíveis:** 12 cenas (Estrela 13 PT Oficial, Espinhaço Abyss, Singularidade, Biomorphic Flora, Sol Vermelho Horizonte, Mercúrio Líquido, Monólito Brutalista, Nebula Particles, Wireframe Lattice, Quantum Torus, Ocean Sun, Hybrid Cosmos)

## 🔢 Git Status
- **Branch:** `feat/3d-scenes-inspector-pro-vj-controls`
- **Último Commit:** `feat: 3d decoupled staging, official pt star 13, new generative scenes and studio inspector overhaul`
- **Data:** 2026-10-11
- **Status:** Testes de preflight e smoke E2E 100% aprovados

## 🌌 Sistema 3D Generativo & Studio Inspector Pro
- **Identidade Estrela 13 Oficial do PT:**
  - Modelagem vetorial de 5 pontas com geometria áurea regular (relação de raio interno ~0.382) e 10 facetas escultóricas bi-piramidais em iluminação Chiaroscuro de palco.
  - Numeral "13" com tipografia oficial de campanha (coluna sólida chanfrada e arcos simétricos) desacoplado do giro da estrela, respondendo com kick vigoroso aos impulsos de subgrave.
  - Paleta oficial `pt_rubi` (Rubi `#dc2626` e Ouro `#ffb703`) e `noir_gold` (Obsidiana e Ouro).
- **Novos Cenários 3D de Vanguarda:**
  - `black_hole_singularity`: Lente gravitacional relativística, anel de fótons e disco de acreção com efeito Doppler de radiação relativística.
  - `biomorphic_flora`: Morfogênese fractal de micélio e tentáculos bioluminescentes com pulsos nos médios e agudos.
  - `sol_vermelho_horizonte`: Sol monumental com difração e grade topográfica vetorial em perspectiva com reflexos.
- **Desacoplamento Completo PGM A vs. CUE B vs. L5:**
  - Deck A (Live ao vivo) e Deck B (Preview Cue / Staging pré-ar) possuem estados 3D independentes (`deckA_3d`, `deckB_3d`, `layer5_3d`).
  - Studio Inspector 3D com seletor de alvo `[ 🔴 PGM A ] [ 🟢 CUE B ] [ 🟡 L5 ]`: VJ pode pré-configurar e esculpir o 3D no CUE B sem vazar alterações para o sinal ao vivo.
  - Handover automático de 3D no Take (`executeTakeCommit`) e no swap de buses (`swapBuses`), promovendo os ajustes pré-configurados do CUE diretamente para o PGM ao vivo.
- **Redesign dos Cards de Clipes & Roteamento L5:**
  - Botões compactos de broadcast sem estouro de texto: `PGM`, `CUE`, `L5` e `INSP` com microbordas e halos luminosos de tally (`is-on-air-pgm`, `is-in-cue-prv`, `is-in-l5`).
  - Suporte de primeira classe para armar clipes e geradores 3D na Camada de Apoio (L5 / Overlay).
- **Correção do Atalho 'I' e Foco de Sliders:**
  - Detecção de entrada de texto refinada para ignorar sliders de alcance (`<input type="range">`), liberando o atalho `I` para abrir/fechar o Studio Inspector mesmo com faders em foco.
  - Suporte ao código de tecla `KeyI` para compatibilidade com layouts internacionais.

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
