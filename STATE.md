# PENUMBRA SYSTEM · ESTADO EM TEMPO REAL

- **Última Atualização:** 09/10/2026, 20:05:00 BRT
- **Status do Sistema:** 🟢 AO VIVO & DEPLOYED NA EDGE CDN (`https://gigantera-penumbra.b-cdn.net`), VERCEL (`https://penumbra-xi.vercel.app/penumbra/`) e DOMÍNIO OFICIAL (`https://gigantera.xyz/penumbra`)
- **Painel de Controle Ativo:** [http://localhost:3000](http://localhost:3000), [https://gigantera.xyz/penumbra](https://gigantera.xyz/penumbra), [https://penumbra-xi.vercel.app/penumbra/](https://penumbra-xi.vercel.app/penumbra/) e [https://gigantera-penumbra.b-cdn.net](https://gigantera-penumbra.b-cdn.net)
- **Motor Agêntico:** 🟢 NEXUS VIBE ENGINE ATIVO (`.agents/` com Governança L1-L4, FinOps, Git Colaborativo PR-First e Skills)
- **Master Control Bridge:** 🟢 REDESENHADO (Cápsula de precisão horizontal, zero clipping, M/E broadcast grade)
- **Media Pool Bins:** 🟢 PASTAS DE PROJETO NATIVAS (`Espinhaço/1. In`, `Tetropode/1. In`, etc. Categorias arbitrárias removidas)
- **Zero-Waste Web Cache & Smart Dedup:** 🟢 ATIVO (Web Cache API + IndexedDB + Roteamento Local Instantâneo `⚡ LOCAL NATIVO`)

## Pipeline de Processos
- **Audio Brain (DSP & Predição):** 🟢 ATIVO (PID de background, streaming teste / P2, OSC UDP 7000, WS 7001)
- **Web Controller (Porta 3000):** 🟢 ATIVO (Servidor Express + WebSocket Cockpit)
- **TouchDesigner NDI Output:** 🟢 CONFIGURADO (`PENUMBRA_LIVE` via NDI Out TOP)
- **TouchDesigner Syphon Output:** 🟢 CONFIGURADO (`PENUMBRA_SYPHON` via Syphon Out TOP)

## 📦 Snapshot de Código (Auto-gerado)
| Arquivo | Linhas | Tamanho |
|---|---|---|
| `app.js` | 9,450 | 372.1 KB |
| `styles.css` | 8,600 | 164.9 KB |
| `index.html` | 3,425 | 216.3 KB |
| `midi.js` | 1,580 | 61.5 KB |
| `Penumbra_Portable.html` | — | 817.2 KB |

## 🎬 Media Pool
- **Clipes no Manifesto:** 75 entradas
- **Thumbnails Sincronizadas:** 327 arquivos no CDN

## 🔢 Git Status & Governança Colaborativa
- **Branch Ativa:** `feat/penumbra-collaborative-dev`
- **Protocolo:** PR-First (Desenvolvimento na branch dedicada → Push → Pull Request para `main` sem conflitos)
- **Repositório Principal:** [Pelimotion/penumbra](https://github.com/Pelimotion/penumbra)
- **Ambiente de Produção gigantera.xyz:** Totalmente blindado com rewrites para cleanUrls e MIME types 200 OK.

## 🤝 Handover para o Próximo Chat / Próxima Sessão
1. **Branch de Trabalho:** Continuar exclusivamente na branch `feat/penumbra-collaborative-dev`.
2. **Ambiente de Testes / Preview:** Utilizar `http://localhost:3000` ou o link de Preview gerado pela Vercel após cada push.
3. **Hardware Twin & MIDI:** Central de 4 bancos (B1 Mixer, B2 Layer Focus, B3 Conductor, B4 Color Lab) e Soft Takeover totalmente operacionais em `midi.js`.
4. **Finalização de Tarefa:** Ao concluir novas features, disparar `gh pr create` para abrir PR limpa contra a `main`.

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

## Atualizações de Vanguarda · Resolução de Telão HDMI & Splitters
- **Saída de Projeção HDMI / Popout Clean Feed (macOS Friendly):**
  - Implementado `openPopoutWindow` com resolução relativa dinâmica, eliminando o erro 404 em produção (`gigantera.xyz/penumbra`).
  - Adicionado rewrite reverso no `vercel.json` de produção para `/popout.html`.
  - Modo `🖥️ MODO PROJETOR (BORDERLESS)` em `popout.html`: Dimensiona e posiciona a janela para preencher 100% do projetor sem invocar os Spaces nativos do macOS, impedindo que a tela do MacBook fique preta!
  - Suporte à Window Management API (`getScreenDetails()`) e modal de instruções para gerenciamento de Spaces no macOS.
- **Central de Ingestão Desobstruída & Retorno Imediato:**
  - Drawer overlay flutuante com z-index elevado, evitando esmagamento do grid de cartões de vídeo.
  - Botão de alto contraste `VOLTAR AO MEDIA POOL [ESC]` e atalho `ESC` global.
  - Botão da barra de ferramentas atualiza dinamicamente entre `+ INGESTÃO` e `✕ FECHAR INGESTÃO`.
- **Redimensionamento Fluido de Módulos e Sessões:**
  - Splitter Vertical (`#workspace-splitter`): Ajustado `flex: 0 0 auto` na `.top-zone`, eliminando compressão por flexbox shrink e garantindo arraste suave com Pointer Capture.
  - Splitter Lateral de Bins (`#library-sidebar-splitter`): Novo divisor vertical permitindo redimensionar a barra de pastas/bins de 150px a 480px, com duplo-clique para redefinir e persistência em `UserProfileManager`.

