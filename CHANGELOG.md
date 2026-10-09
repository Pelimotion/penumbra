# 📜 PENUMBRA SYSTEM · CHANGELOG

> Auto-gerado por `scripts/update_docs.js` · Atualizado em: 09/10/2026, 12:23:25 BRT

---

## Outubro de 2026

### ✨ Novos Recursos
- `d24098f` **(ui)** redesign pro preferences, resizable workspace, dedicated timeline arranger, and universal asset library
- `4859515` **(launcher)** fix startup launcher trigger, add source switcher in header and Settings tab
- `382464f` **(ui)** DaVinci/Adobe studio launcher with integrated PIN 2026 and Bunny Edge CDN deployment
- `4cae205` **(ui)** Complete Professional UI/UX Overhaul & Offline PIN Auth
- `ef2736f` Auto-Launch Portable App, Multi-Folder Imports, UX Refinements
- `67c972c` Auto-Installer OTA, Portable Executable, and Full Pipeline Scanner

### 📚 Documentação
- `f1a6951` add ADR-0013 and update changelog for source orchestration
- `19b97e7` add ADR-0012 for universal Vercel asset resolution and sync state

### 🐛 Correções
- `094b6a5` **(routing)** resolve root and /penumbra 404s for styles.css, app.js and assets on Vercel

### 🔧 Manutenção
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

