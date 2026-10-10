# 📜 PENUMBRA SYSTEM · CHANGELOG

> Auto-gerado por `scripts/update_docs.js` · Atualizado em: 10/10/2026, 17:37:57 BRT

---

## Outubro de 2026

### ✨ Novos Recursos
- `5e91eff` **(fx-engine)** implement master fx bypass toggle, clean autopilot baseline and human-in-the-loop manual fx lock
- `a21e5b7` **(timeline)** implement pro arrangement timeline with dynamic rhythm scaling and forward predictability
- `75fa793` **(inspector)** unify studio inspector for layers and mattes with per-matte engine, follow selection mode and pin toggle
- `3e8893b` **(engine)** transition flash elimination, granular autopilot pool, line-in p2 & permanent bpm hud
- `57b7e26` **(audio-vj)** live mic hardware VU meter, decoupled CUE, matte & 3d generative inspector, and bank C midi
- `61f2c91` **(ui)** redesign lower section navigation, Studio Inspector and color/light controls
- `e5452c3` **(vj-studio)** implement Studio Inspector, dual-bank M-Vave MIDI, Find Edges luminance boost, and 50 FX presets
- `8903b66` **(transform-vj)** implement dual-tier clip pre-air transforms, Layer 5 overlay deck, locked master matte, and visual MIDI click-to-map
- `f8026d4` **(media)** corrigir biblioteca de mattes e adicionar persistencia e relink de midias locais
- `d1f2258` **(midi)** suporte dual-preset M-Vave (Banco 1 Faders ◄ & Banco 2 Botões ►) e navegação B1-B4
- `6ded3cd` **(cockpit)** redesign master control bridge, folder bins media pool, web cache and smart dedup
- `53dadb8` **(midi-pro)** advanced MIDI controller hub, hierarchical modal banks, interactive hardware twin and edge deployment
- `3050f16` **(ingest)** unified broadcast Media Ingest Hub for Local SSD, Bunny CDN sync, and YouTube streams
- `2f918ff` **(audio-ui)** hybrid web audio api dsp, local audio upload, emoji-free pro broadcast ui and instant storage switcher
- `e0839ec` **(library)** studio two-column layout, sidebar bins and instant parameter edit navigation
- `d24098f` **(ui)** redesign pro preferences, resizable workspace, dedicated timeline arranger, and universal asset library
- `4859515` **(launcher)** fix startup launcher trigger, add source switcher in header and Settings tab
- `382464f` **(ui)** DaVinci/Adobe studio launcher with integrated PIN 2026 and Bunny Edge CDN deployment
- `4cae205` **(ui)** Complete Professional UI/UX Overhaul & Offline PIN Auth
- `ef2736f` Auto-Launch Portable App, Multi-Folder Imports, UX Refinements
- `67c972c` Auto-Installer OTA, Portable Executable, and Full Pipeline Scanner

### 🐛 Correções
- `d7ded29` **(autopilot-pool)** compact media pool nav bar, clear manual lock badges, and settings folder exclusion sync
- `4e2a97b` **(media-pool)** purge foreign BC Mapping videos from manifest and CDN; add clean 1-click projector mode and remove Bê nomenclature
- `fd2f575` **(media-audio)** fix cloud video playback freezing and implement PenumbraWebAudio club DSP microphone suite
- `41618bf` **(midi)** mapeamento nativo de CC para M-Vave SMC-MIXER (faders CC 20-27, knobs CC 30-37, master CC 28)
- `48047d4` **(midi)** add universal M-Vave VAVE6412 MCU/CC dual mapping, fix encoder ballistic delta and button channel layout
- `1f06ab2` **(media-nexus)** streamline localhost SSD connection and eliminate empty folder alerts
- `063f2dd` **(cockpit)** resolve popout 404, macOS projector blackout, ingest deck overlay and splitters
- `3151ef1` **(routing)** add synchronous base href detection for subpaths and /penumbra route in server.js
- `094b6a5` **(routing)** resolve root and /penumbra 404s for styles.css, app.js and assets on Vercel

### 📚 Documentação
- `1a7e7c6` update STATE.md with Studio Inspector, Color & Light suite and Bins breadcrumbs
- `1ee13ab` **(architecture)** sync technical architecture, state, graphify and knowledge base for next session
- `cbc4a1c` update DECISOES.md ADR 41 and STATE.md for cloud video and audio suite
- `a87bbba` **(state)** atualizar links de preview e handover
- `5022ddd` **(state)** registrar suporte dual-preset M-Vave e atalhos B1-B4
- `332f9d5` **(handover)** register ADR-38, update system state and establish feat/penumbra-collaborative-dev branch
- `306937c` **(governance)** implement PR-first collaborative git flow and conflict prevention rule
- `5836f2f` **(state)** update documentation with Media Ingest Hub features and live metrics
- `f8c5286` **(state)** update online production URL to gigantera.xyz/penumbra
- `f1a6951` add ADR-0013 and update changelog for source orchestration
- `19b97e7` add ADR-0012 for universal Vercel asset resolution and sync state

### 🔧 Manutenção
- `8acad70` Merge pull request #1 from Pelimotion/feat/collab-branch-pr-governance
- `5c02002` auto-deploy + auto-docs on every commit (post-commit hook + update_docs.js)
- `7095a42` Set default FPS to 30 and Network Outputs to OFF
- `397dd4b` Enhance CDN Sync with Recursive IN/OUT Structure, Model Injection, and Secure PIN Unlock
- `038e719` Implement Bunny CDN Sync Script & Animated Hover Previews (Zero-Server Architecture)
- `0862376` Fix Vercel deployments: add root vercel.json for rewrites and restore relative HTML paths
- `318204c` Fix routing: Use absolute /penumbra/ paths to prevent trailing slash 404s
- `ccbf1c6` Fix absolute path in spine points fetch for Vercel subdirectory hosting
- `cbd65d9` Fix standalone 404 errors: dummy favicon.ico and mock mattes catalog for zero-server architecture
- `2762f6a` Update favicon to geometric SVG tetrapod without background
- `484d97e` Implement Phase 2: Standalone VJ Architecture & Media Nexus Modal
- `8b58c52` Implement HARS Architecture and CORS
- `12cf409` Add tetrapod favicon
- `fbcfa9d` Initial commit of Penumbra Engine

### 🔄 Outros
- `59149e4` **(vercel)** configure buildCommand and outputDirectory for automated static deployment

### 🚀 Deploy & Infra
- `6452e14` whitelist test_preview.mp3 for production at gigantera.xyz/penumbra

