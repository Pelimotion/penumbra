# 🎛️ PENUMBRA SYSTEM · ARQUITETURA TÉCNICA

> Auto-gerado por `scripts/update_docs.js` · 09/10/2026, 04:19:18 BRT

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
| `public/app.js` | Motor principal VJ (render, media, autopilot, FX) | 6,821 |
| `public/styles.css` | Design System Dark Studio (DaVinci/Cavalry/Adobe) | 5,148 |
| `public/index.html` | Cockpit HTML + Studio Launcher + PIN Gate | 2,235 |
| `public/midi.js` | MIDI Controller Bridge | 139 |
| `server.js` | Express + WebSocket Server (modo local) | 570 |
| `scripts/deploy_cdn.js` | Deploy automático Bunny Edge CDN | 136 |
| `scripts/build_portable.js` | Bundler HTML portátil offline | 49 |
| `scripts/update_docs.js` | Auto-documentação (este script) | 357 |

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

## Nexus Agent Engine (Governed Vibe-Coding)

- **Skills Ativas:** context-audit, penumbra-vj-guardian, skill-synthesizer
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
