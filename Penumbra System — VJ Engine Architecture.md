# Penumbra System — Web VJ Engine Architecture

SISTEMA ATIVO · HTML5 CANVAS + WEBSOCKETS · PELIMOTION 2026

## 1. Visão Geral
A arquitetura do Penumbra VJ Engine evoluiu de uma stack baseada em TouchDesigner para um sistema 100% nativo da web, garantindo leveza, independência de plataforma e altíssima performance. O núcleo renderizador agora roda inteiramente no navegador (`app.js` + HTML5 Canvas), enquanto o servidor Node.js (`server.js`) atua como orquestrador e hub de telemetria via WebSockets.

O objetivo estético continua inegociável: alto contraste, penumbra dominante e evitar ao máximo blends aditivos. O render loop é construído para manter 60 FPS com manipulações de imagem baseadas em GPU via Offscreen Canvases e Luma Mattes.

## 2. O `appState` (Fonte da Verdade)
A interface e o motor visual são reativos a um único objeto global: `appState`. Ele define:
- `macro_state`: Estado narrativo (INTRO, BUILD, DROP, GROOVE).
- `bands` & `stems`: Reatividade de áudio, com valores de 0 a 1 que modulam parâmetros visuais em tempo real (ex: tamanho do matte, opacidade).
- `layers`: Configuração independente para os 5 canais de vídeo (0 a 4).
- `tonal`: Grading master com gamma, contrast, midtones e Sobel edge mix.
- `phrase`: Engine de fraseamento musical (compassos, beats, pre-drops).

*Regra de Ouro do Vibecoding:* Qualquer manipulação visual ou lógica de UI deve ler e escrever diretamente em propriedades específicas do `appState`. O loop de renderização lê o estado a 60 FPS e desenha adequadamente. Nunca manipular o DOM para mudar estado; o DOM reage ao estado.

## 3. Stack de Composição (5 Camadas)
O render loop em `app.js` varre do Layer 0 ao 4 utilizando Canvas 2D (`globalCompositeOperation`).

- **Layer 0 (Base):** O vídeo fundacional. Sempre visível. Blend `source-over`.
- **Layer 1 (Self-Double):** Vídeo L0 com zoom (~1.18x) sobreposto. Usa blends como `multiply` ou `darken` para gerar profundidade sem luzes estouradas.
- **Layer 2 (Edge Trace / Sobel):** Realiza processamento de convolução (Filtro Sobel) em tempo real sobre o offscreen canvas para revelar linhas finas. Aplicado via `screen`.
- **Layer 3 (Secondary / Cue):** O vídeo na agulha. Usado para transições ou elementos secundários via `soft-light`.
- **Layer 4 (Accent):** Disparado em momentos climáticos. Frequentemente usa `difference` ou `exclusion` para aberturas visuais de grande impacto sem corromper a penumbra geral.

## 4. Sistema Kinemático e Luma Mattes
Ao invés de processar canal alfa de imagens `.mov` pesadas, o sistema converte imagens estáticas P&B em "Luma Mattes" instantâneos, utilizando seus valores de luminosidade como Alpha (0 a 255).
Estes mattes são submetidos a deformações em tempo real (Wiggle pos/scale/rot) moduladas pelo tempo de simulação e pelos atributos do áudio/compasso (`sync_bpm`, `posterize_rate`).

## 5. Phrase Engine & Handover Glitch-Free
O `Phrase Engine` é um relógio musical baseado em BPM e barras (ex: loop de 16 compassos). Ele conta os beats e prevê o Drop, inflando as probabilidades de Build e preparando o Autopilot.
Quando uma transição A/B (`TAKE`) ocorre, para evitar *flicker* enquanto o buffer do `<video>` processa o novo *src*, um *Handover Canvas* salva o frame exato do momento anterior ao corte e faz um *fade out* perfeitamente liso enquanto o novo clip carrega.

## 6. Frontend / Cockpit
A UI é renderizada no DOM via atualizações orientadas ao `appState`. 
- Dual-monitor: Preview e Program operam de forma isolada, permitindo audição visual.
- Abas inferiores dividem controles em categorias sem scroll infinito (Media Pool, Mixer, Mattes, Tonal, Autopilot, FX Engine).
- Janela flutuante permite destacar monitores.
- O header com o Status da Track exibe a Frase e Medidores de Tensão que reagem ao `appState.buildup_likelihood`. As alterações de estado de música são exclusivas do backend/telemetria para evitar conflitos locais no motor.

## 7. Motor Procedural e Kinetico de FX (FX Engine)
Adicionado como o 6º Módulo, o sistema conta com um motor procedural (FX Engine) que processa e deforma o Master Bus A (Program) em tempo real:
- Tiled Fragments: Quebra a imagem em blocos com "wiggle" caótico e posterização.
- Pixel Stretch: Deformação "slit-scan" horizontal pelo centro da imagem.
- Scan Deformation: Linhas de varredura CRT/ondas distorcidas com base no tempo de simulação.
- Modulation Matrix: Escala e rotação em Blend de `Difference` para abstração extrema.
Os parâmetros secos (Intensity e Speed) podem ser guiados automaticamente (Auto-Adaptation) pelo estado Macro, aumentando de agressividade e velocidade conforme o drop se aproxima.

## 8. Diretrizes de Desenvolvimento (Next Agents)
- **Não bloqueie a thread:** A lógica pesada não deve parar o `requestAnimationFrame` que desenha os canvases. 
- **Compositing Seguro:** Se precisar adicionar um novo canal ou blend, altere `renderVisuals()`. Utilize os Canvas Offscreen (`offscreenA`, `offscreenB`) para operações de composição prévias (como Sobel ou Luma mattes) antes de jogar no master.
- **Não use setTimeout para animação:** Use a variável de `simTime` e as funções kinemáticas do matte para sincronizar efeitos. 