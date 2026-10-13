# Penumbra System — Web VJ Engine Architecture

SISTEMA ATIVO · HTML5 CANVAS + WEBSOCKETS · PELIMOTION 2026

## 1. Visão Geral
A arquitetura do Penumbra VJ Engine evoluiu de uma stack baseada em TouchDesigner para um sistema 100% nativo da web, garantindo leveza, independência de plataforma e altíssima performance. O núcleo renderizador agora roda inteiramente no navegador (`app.js` + HTML5 Canvas), enquanto o servidor Node.js (`server.js`) atua como orquestrador e hub de telemetria via WebSockets.

O objetivo estético continua inegociável: alto contraste, penumbra dominante e evitar ao máximo blends aditivos. O render loop é construído para manter 60 FPS com manipulações de imagem baseadas em GPU via Offscreen Canvases e Luma Mattes.

## 2. O `appState` (Fonte da Verdade)
A interface e o motor visual são reativos a um único objeto global: `appState`. Ele define:
- `macro_state`: Estado narrativo (INTRO, GROOVE, BUILD, DROP, BREAK).
- `bands` & `stems`: Reatividade de áudio, com valores de 0 a 1 que modulam parâmetros visuais em tempo real (ex: tamanho do matte, opacidade).
- `layers`: Configuração independente para os 6 canais de vídeo (Layer 0 a Layer 5).
- `tonal`: Grading master com gamma, contrast, midtones e Sobel edge mix.
- `phrase`: Engine de fraseamento musical (compassos, beats, pre-drops).
- `fps`: Cadência do render loop (Padrão: 30 FPS para estabilidade térmica no palco, com alternador no cockpit para 60 FPS quando o hardware permitir).

*Regra de Ouro do Vibecoding:* Qualquer manipulação visual ou lógica de UI deve ler e escrever diretamente em propriedades específicas do `appState`. O loop de renderização lê o estado (a 30 FPS por padrão ou 60 FPS se configurado) e desenha adequadamente. Nunca manipular o DOM para mudar estado; o DOM reage ao estado.

## 3. Stack de Composição (6 Camadas Profissionais)
O render loop em `app.js` varre do Layer 0 ao Layer 5 utilizando Canvas 2D acelerado por hardware (`globalCompositeOperation`).

- **Layer 0 (Base Master):** O vídeo fundacional. Sempre visível. Blend `source-over`.
- **Layer 1 (Self-Double):** Vídeo L0 com zoom (~1.12x a 1.18x) sobreposto. Usa blends como `multiply` ou `darken` para gerar profundidade e pulso rítmico sem luzes estouradas.
- **Layer 2 (Edge Trace / Sobel):** Realiza processamento de convolução em tempo real (`sobelCanvas`) com gate de luminância contra névoa leitosa, suporte a blend modes (`Lighten`, `Screen`, `Overlay`) e alinhamento matricial da camada.
- **Layer 3 (Deck B / Cue Bus):** O vídeo na agulha pronto para transição (Preview Cue B). Sempre com pré-visualização nítida (100% no monitor CUE) e suporte a crossfades equal-power S-curve para o Program.
- **Layer 4 (Accent Climax):** Disparado em momentos climáticos (Drops e Buildups). Frequentemente usa `difference` ou `exclusion` para aberturas visuais de grande impacto sem corromper a penumbra geral.
- **Layer 5 (Overlay Deck):** Camada de sobreposição contínua dedicada com player acelerado independente (`playerL5`), blend modes cinematográficos e composição autônoma.

## 4. Multi-Formato & Roteamento de Saída (Zero-Crop)
O motor suporta 6 aspect ratios em tempo real:
- `16:9` Horizontal Clássico (640×360)
- `9:16` Vertical Nativo (360×640)
- `1:1` Quadrado (480×480)
- `4:5` Social (384×480)
- `4:3` Retrô Broadcast (480×360)
- `21:9` Ultrawide Cinemático (640×274)
Todos os barramentos adaptam-se dinamicamente sem corte forçado (Aspect Fit com bordas pretas puras `#000000`, Fill ou Wings). Inclui roteamento de projetor para telas verticais com compensação de rotação física a 90° CCW.

## 5. Desacoplamento de Macro Status vs Troca de Take
A transição entre estados musicais (`INTRO`, `GROOVE`, `BUILD`, `DROP`, `BREAK`) atua estritamente na roupagem cênica (estilo, máscaras, cinematics, shaders FX e accent drops) **sem cortar ou alterar o clipe de base** em reprodução. A troca de take é mantida sob autoridade exclusiva da cadência da frase musical (16, 32 ou 64 bars) ou do comando manual deliberado `TAKE`.

## 6. Engine de Ping-Pong / Seamless Bounce a 60 FPS
Os elementos de vídeo (L0, L3, L5) contam com controle bidirecional contínuo no loop de animação: avanço suave na ida e decréscimo temporal em velocidade real no retorno (`currentTime -= dt * speed`) com bounce suave nos extremos (0.08s e dur - 0.10s), eliminando qualquer salto seco ou corte brusco no final dos arquivos.

## 7. Pro Timeline Arranger & Cockpit Unificado
- **Pro Timeline Arranger:** Régua musical com escalonamento dinâmico de 4B a 64B, horizonte preditivo do próximo take com botão `[ARMAR CUE]`, playhead em sub-pixel a 60 FPS e alinhamento vertical pixel-perfect de 26px emparelhado com a régua do canvas.
- **Cápsulas de Máscara no Mixer:** Identificação visual legível da máscara ativa, deep-link direto `[MATTES ↗]` para o ribbon da Tab 3 e botões táticos `[INV]` e `[✕]`.
- **Studio Inspector Lateral:** Gaveta unificada para edição cirúrgica de Posição X/Y, Rotação, Escala, Nudge e Reset para Clipes, Camadas, Máscaras e Master.
- **Background Multi-Display Keep-Alive:** Web Worker heartbeat timer contínuo a 60 FPS e MediaSession API prevenindo suspensão ou congelamento na janela destacada (pop-out) ao trocar de app ou Spaces no macOS.

## 8. Diretrizes de Desenvolvimento (Next Agents)
- **Não bloqueie a thread:** A lógica pesada não deve parar o `requestAnimationFrame` que desenha os canvases. 
- **Compositing Seguro:** Se precisar adicionar um novo canal ou blend, altere `renderVisuals()`. Utilize os Canvas Offscreen (`offscreenA`, `offscreenB`, `offscreenOverlay`) para operações de composição prévias (como Sobel ou Luma mattes) antes de jogar no master.
- **Não use setTimeout para animação:** Use a variável de `simTime` e as funções kinemáticas do matte para sincronizar efeitos a 60 FPS contínuos. 