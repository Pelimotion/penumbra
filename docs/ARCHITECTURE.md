# 🎛️ PENUMBRA SYSTEM · ARQUITETURA TÉCNICA

> Auto-gerado por `scripts/update_docs.js` · 10/10/2026, 17:37:57 BRT

---

## Visão Geral

O **Penumbra System** é um VJ Engine audio-reativo de alta performance executado inteiramente no navegador (Zero-Server Architecture), com backend Node.js opcional para controle WebSocket via rede local.

```
┌─────────────────────────────────────────────────────────┐
│  PENUMBRA SYSTEM · STACK TÉCNICA                        │
├──────────────────┬──────────────────────────────────────┤
│  Frontend        │  Vanilla JS + WebGL + HTML5 Video   │
│  Estilo          │  Vanilla CSS (Dark Studio System)    │
│  Backend Local   │  Node.js (Express + WebSocket)       │
│  CDN / Edge      │  Bunny.net (São Paulo · gigantera)   │
│  Audio Analysis  │  Python FFT / WebAudio API           │
│  MIDI            │  WebMIDI API (midi.js)               │
│  OSC             │  UDP 7000 (TouchDesigner Bridge)     │
│  3D Plexus       │  Custom WebGL (Anatomical Vertices)  │
└──────────────────┴──────────────────────────────────────┘
```

## Arquivos Principais

| Arquivo | Descrição | Linhas |
|---|---|---|
| `public/app.js` | Motor principal VJ (render, media, autopilot, FX) | 14,235 |
| `public/styles.css` | Design System Dark Studio (DaVinci/Cavalry/Adobe) | 11,228 |
| `public/index.html` | Cockpit HTML + Studio Launcher + PIN Gate | 3,581 |
| `public/midi.js` | MIDI Controller Bridge | 2,473 |
| `server.js` | Express + WebSocket Server (modo local) | 1,367 |
| `scripts/deploy_cdn.js` | Deploy automático Bunny Edge CDN | 174 |
| `scripts/build_portable.js` | Bundler HTML portátil offline | 56 |
| `scripts/update_docs.js` | Auto-documentação (este script) | 445 |

## Media Pool

- **Total de Clipes:** 75

| Categoria | Clipes |
|---|---|
| ABSTRACT | 43 |
| MINIMAL | 19 |
| FIGURA | 9 |
| CHROMA | 3 |
| GENERATIVE | 1 |

## Fontes de Mídia (Tri-Source Architecture)

```
LOCAL DRIVE    → File System Access API (zero-latência, offline)
BUNNY CDN      → https://gigantera-penumbra.b-cdn.net (cloud, PIN: 2026)
STREAM/YOUTUBE → URL direta HLS/MP4 ou YouTube embed
```

## Pipeline de Deploy (Auto)

```
git commit  →  .git/hooks/post-commit
              ↓  (se toca public/ ou scripts/)
            scripts/deploy_cdn.js
              ↓
            1. Synca media_manifest.json → public/
            2. Compila Penumbra_Portable.html
            3. Upload 7 arquivos para br.storage.bunnycdn.com/gigantera
              ↓
            scripts/update_docs.js
              ↓
            STATE.md + CHANGELOG.md + docs/ARCHITECTURE.md atualizados
```

## Compositor Visual de 6 Canais (Layer Matrix & Overlay Deck)

O Penumbra opera com uma matriz de composição inspirada em Resolume Arena e TouchDesigner:

| Canal | Papel Arquitetural | Modo de Blend Padrão | Elemento / Buffer |
|---|---|---|---|
| **L0: Master Base** | Deck A (Program ao Vivo) | Normal / Pass-through | `<video id="player-l0">` / `busCanvasA` |
| **L1: Pulse Reflex** | Espelho volumétrico procedural (Self-Double 1.18x) | Multiply / Darken | Offscreen buffer (Zero vídeo extra) |
| **L2: Sobel Edge** | Traçado de ossatura e bordas finas (Sobel Find Edges) | Screen (15-30% opac) | Offscreen Sobel convolution buffer |
| **L3: Cue Bus B** | Deck B (Preview do próximo cue antes do ar) | Soft Light / Cut | `<video id="player-l3">` / `busCanvasB` |
| **L4: Climax Accent** | Impacto de Drop & Clímax (Difference / Exclusion) | Difference | `<video id="player-l4">` / Offscreen Accent |
| **L5: Overlay Deck** | Trilha dedicada de sobreposição foreground contínua | Screen / Add / Soft Light | `<video id="player-l5">` / `offscreenOverlay` |

## Hierarquia de Transformação Geométrica em Dois Níveis (Clipe vs Camada)

Separação comutativa estrita entre a geometria do clipe individual e o barramento global da camada:

1. **Geometria Intrínseca do Clipe (`clip.transform`):**
   - Rotação: 0°, +90° CW (converte vídeos 9:16 verticais em 16:9 horizontais sem distorção e sem barras pretas), 180° FLIP, -90° CCW.
   - Escala / Zoom: 0.2x a 3.0x.
   - Posição: Offset X e Offset Y em pixels.
   - Persistência: Gravada no perfil central (`penumbra_user_profile.json`) e LocalStorage sob `custom_clip_transforms[clipId]`.
2. **Geometria da Camada (`layer.scale`, `layer.pos_x`, `layer.pos_y`, `layer.rotation`):**
   - Modulável via Timeline Transform Inspector (`.tl-transform-inspector`), MIDI knobs ou automação.
3. **Composição Matricial no Compositor (Zero Garbage Collection a 60 FPS):**
   ```
   TotalScale = LayerScale * ClipScale
   TotalRot   = (LayerRot + ClipRot) % 360
   TotalPosX  = LayerPosX + ClipPosX
   TotalPosY  = LayerPosY + ClipPosY
   ```
4. **Workflow de Pré-Ar (Preview Audition):**
   - O operador aperta `[B]` para carregar qualquer clipe no Deck B (Preview).
   - Clica no botão `📐 CLIPE` no topo do monitor de Preview para abrir o modal de transformação.
   - Ajusta rotação, zoom e enquadramento visualizando a resposta ao vivo a 60 FPS na tela de Preview *antes* de enviar ao ar.
   - Transfere suavemente ao telão com `AUTO TAKE` ou crossfader.
   - Também ajustável diretamente no catálogo com o botão `📐 POS` nos cards do Media Pool.

## Trava de Enquadramento Master (Locked Framing Matte)

- Flag no compositor e Autopilot: `appState.master_locked_matte`.
- Quando travada com o botão `🔒 TRAVAR MÁSCARA MASTER` (Módulo 3: Mattes), o Autopilot (mesmo com `matte_orchestration` ativo) e os 16 Macro Presets ficam expressamente proibidos de substituir ou deformar a máscara master de saída.
- Garante enquadramento estrutural arquitetônico estático intacto durante toda a apresentação.

## Suíte MIDI Click-to-Map & Gêmeo Virtual Interativo (M-Vave SMC-MIXER)

- **Mapeamento CC USB-C Nativo:** Faders 1-8 em CC 20..27, Master Fader em CC 28, Encoders 1-8 em CC 30..37, Botões M/S/R/SEL em CC 40..71.
- **Navegação Modal em 4 Bancos:**
  - B1: Master Live Mixer (Faders 1-6 controlam L0..L5, Fader 7 Crossfader, Fader 8 Dimmer).
  - B2: Layer Focus (Zoom, Posição, Mascaramento Procedural e Sensibilidade de Banda).
  - B3: Conductor & Macro Presets (Disparo dos 16 Macro Presets narrativos).
  - B4: Color Lab & Grading (Gamma, Pretos, Médios, Contraste, Sobel Mix e Limiar).
- **Modo Click-to-Map Interativo:** Alternância entre `LIVE CONTROL` e `🎯 CLICK TO MAP`. Ao clicar em qualquer knob, fader ou botão físico no Hardware Twin, abre-se o modal de mapeamento visual permitindo vincular parâmetros de software com seleção de curvas (Linear, Exp, Log, S-Curve) e inversão de sentido.
- **4 Presets de Fábrica Curados:**
  1. *Master Jam 6-Decks & Crossfader*
  2. *Layer Geometry & Overlay Sculptor*
  3. *Ambient Conductor & Matte Flow*
  4. *4-Deck Battle & Hard Strobe Clímax*

## Áudio DSP Club & PenumbraWebAudio Engine

- Captura direta via Web Audio API (`getUserMedia`) com filtros de voz do navegador desligados (`echoCancellation: false`, `noiseSuppression: false`, `autoGainControl: false`).
- Filtro passa-alta Biquad em 28 Hz (rejeição de sub-rumble mecânico e DC offset) e passa-baixa em 15.5 kHz (rejeição de chiado de palco).
- Analisador FFT de 2048 pontos com seguidor dinâmico Leaky Peak Follower (ajuste automático para variações de 75 dB em breakdowns a 110 dB em drops).
- Detecção de transientes de bumbo 4/4 via Spectral Flux (Fluxo Espectral) acionando wiggles orgânicos e shaders a 60 FPS.
- Persistência e proteção de entrada: modo de áudio memorizado no backend e client-side garantindo estabilidade na seleção de Microfone ou Entrada P2 Line In.

## Nexus Agent Engine (Governed Vibe-Coding)

- **Skills Ativas:** context-audit, midi-hardware-master, penumbra-vj-guardian, skill-synthesizer
- **Invariantes:** `.agents/invariants/invariants.md`
- **Contexto Episódico:** `STATE.md` (automático) + `DECISOES.md` (ADRs)
- **Regras de Governança:** `.agents/rules/01_context_engineering.md` … `04_vibe_orchestration.md`

## FPS & Performance

| Parâmetro | Valor Padrão |
|---|---|
| FPS | **30 FPS** (economia bateria, sincronia projetor) |
| Rede NDI / Syphon | DESLIGADO por padrão |
| OSC UDP | DESLIGADO por padrão |
| Fallback 60 FPS | Ativável nas configurações |

## Segurança

- PIN de acesso ao Cloud: **2026** (codificado client-side, não em servidor)
- CORS restrito a `localhost` no servidor local
- Credenciais de Storage na `.env` (nunca commitada no git)
