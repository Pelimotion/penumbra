# 🪐 PENUMBRA ENGINE · RELATÓRIO PREFLIGHT & SAFETY NET

- **Data de Execução:** 13/10/2026, 16:17:31
- **Duração Total:** 21.58s
- **Status Geral:** 🟢 APROVADO (Zero Regressões)

## 1. Playwright Smoke E2E (Fluxo ao Vivo)
**Status:** 🟢 PASSOU

| Passo de Fluxo | Resultado | Detalhes |
|---|---|---|
| 1. Abrir Cockpit & Inicializar Canvases | 🟢 PASS | Title: "PENUMBRA SYSTEM · Professional VJ Engine Cockpit" |
| 2. Trocar Take (Auto Transition) | 🟢 PASS | Clip Base: clip_005 | Crossfader: 0 |
| 3. Mudar Macro State (5 Estados) | 🟢 PASS | 5/5 estados comutados perfeitamente |
| 4. Ativar/Alternar Layer 5 (Overlay Deck) | 🟢 PASS | Estado L5 alternado: true -> false |
| 5. Click-to-Map MIDI Twin | 🟢 PASS | Modo de mapeamento acionado |
| 6. Expandir Monitor Cinema | 🟢 PASS | Overlay Cinema ativo |
| 7. Destacar Pop-out Window (popout.html) | 🟢 PASS | Pop-out canvas 100% ativo |

## 2. Regressão Visual de Viewports & Output
**Status:** 🟢 PASSOU

### Viewports Auditados (Cockpit UI):
| Viewport | Dimensões | Status | Variação | Baseline |
|---|---|---|---|---|
| desktop_1920x1080 | 1920x1080 | PASS | 4.10% | `cockpit_desktop_1920x1080.png` |
| macbook_1280x800 | 1280x800 | PASS | 5.69% | `cockpit_macbook_1280x800.png` |
| ipad_1180x820 | 1180x820 | PASS | 5.91% | `cockpit_ipad_1180x820.png` |
| ipad_1024x768 | 1024x768 | PASS | 4.72% | `cockpit_ipad_1024x768.png` |

### Output Visual por Macro State (Program Canvas):
| Estado Musical | Status | Arquivo Baseline |
|---|---|---|
| **INTRO** | PASS | `output_INTRO.png` |
| **GROOVE** | PASS | `output_GROOVE.png` |
| **BUILD** | PASS | `output_BUILD.png` |
| **DROP** | PASS | `output_DROP.png` |
| **BREAK** | PASS | `output_BREAK.png` |

## 3. Diretriz do Workflow de UI
> Toda e qualquer edição futura em `app.js`, `styles.css` ou `index.html` deve rodar obrigatoriamente `npm run preflight`. Se falhar, o deploy e merge são bloqueados.
