# 📱 AUDITORIA DE CARGA COGNITIVA & TOUCH UX NO IPAD
**Penumbra System · Pelimotion 2026**

*Gerado em: 11/10/2026, 17:51:57*

## 1. Sumário Executivo & Diagnóstico Geral
O cockpit do Penumbra foi arquitetado primariamente com mentalidade de desktop (ponteiro de mouse, precisão de 1px e tooltips via `:hover`). Em um **iPad (1180x820 ou 1024x768)** em ambiente de sala escura/palco:
- **Alvos abaixo de 44px (Violação do Apple Human Interface Guidelines):** **14.1%** dos controles interativos visíveis possuem altura ou largura inferior a 44px. Em palco escuro, o índice de erro de toque (*mis-tap*) cresce exponencialmente.
- **Inexistência de Mouse Hover:** 100% dos títulos descritivos configurados em atributos `title=""` são invisíveis no iPad, deixando o operador sem feedback sobre a função dos micro-botões.
- **Densidade Visual Excessiva:** 5 abas de dock, 6 canais de mixer com 18 faders/sliders minúsculos, régua de compassos e inspector lateral competem por espaço simultaneamente.

## 2. Métricas Comparativas de Viewports iPad
| Viewport | Elementos Interativos | Alvos < 44px (Inadequados) | Taxa de Fricção Touch |
|---|---|---|---|
| iPad Air / Pro 11" (1180x820) | 587 | 83 | **14.1%** |
| iPad Clássico 4:3 (1024x768) | 1235 | 125 | **10.1%** |

## 3. Matriz de Classificação de Ações: AO VIVO vs SETUP
| Ação do Sistema | Categoria | Toques Atuais | Avaliação para Palco Escuro |
|---|---|---|---|
| **Trocar Take (Auto Transition)** | AO VIVO | 1 toque | 🟢 Ótimo (Botão central grande) |
| **Trocar Take (Hard Cut)** | AO VIVO | 1 toque | 🟢 Ótimo (Botão CUT visível) |
| **Macro State (IN / GRV / BLD / DRP / BRK)** | AO VIVO | 1 toque | 🟡 Atenção: Botões têm 32px de altura (< 44px) |
| **Blackout Instantâneo** | AO VIVO | 1 toque | 🟡 Atenção: Botão pequeno no topo |
| **Ativar/Desativar Layer 5** | AO VIVO | 1 toque | 🔴 Crítico: Botão `[L5]` tem apenas 28px de altura |
| **Trocar Máscara (Mixer)** | AO VIVO | 3 toques | 🔴 Inaceitável ao vivo: Scroll em mini select |
| **Trocar Máscara (Aba Mattes)** | AO VIVO | 2 toques | 🟡 Razoável, mas exige mudar a dock inteira |
| **Disparo de Macro Presets (Conductor)** | AO VIVO | 2 toques | 🔴 Exige abrir aba 5 e clicar no grid comprimido |
| **Configuração de Áudio / Relink** | SETUP | 2 a 3 toques | 🟢 Correto (Deve permanecer protegido) |
| **Mapeamento MIDI (Click-to-Map)** | SETUP | 4 toques | 🟢 Correto (Ação de ensaio/preparação) |

## 4. Top 10 Alvos Críticos Subdimensionados (< 44px)
| Elemento ID / Classe | Dimensão Real | Recomendado HIG | Risco em Performance |
|---|---|---|---|
| `.state-btn` (Macro States: IN, GRV, etc.) | ~34x30px | Min 48x48px | Toque falso no estado adjacente (ex: disparar DROP em vez de BUILD) |
| `.btn-solo` (`[L5]`, `[L0]`, etc.) | ~30x26px | Min 44x44px | Dedo erra o mute da camada no meio do som |
| `.ch-pill-rot` (`0°`, `↺-90`, `↻+90`, `WINGS`) | ~28x22px | Min 44x44px | Quase impossível clicar com precisão no iPad |
| `.dock-tab` (Tabs 1 a 6) | ~78x32px | Min 88x48px | Altura de 32px dificulta alternância rápida no escuro |
| `.trans-rate-btn` (`0.5s`, `1s`, `2s`, `SYNC`) | ~36x24px | Min 48x44px | Botões minúsculos na barra central de broadcast |
| `#btn-blackout` | ~85x28px | Min 96x48px | Botão de emergência deve ser massivo e isolado |
| `.pro-slider` (Faders de Opacidade/Speed) | Thumb ~14px | Thumb 32px | Polegar escorrega do trilho no touch |
| `.btn-browse-matte` (`[MATTES ↗]`) | ~68x24px | Min 80x44px | Dedo toca no seletor adjacente acidentalmente |
| `#btn-toggle-fx-lock` | ~30x30px | Min 44x44px | Trava de efeito difícil de acertar com pressa |
| `.btn-inv` (`[INV]` Inverter Matte) | ~34x22px | Min 44x44px | Botão de 22px de altura: pior alvo do cockpit |

## 5. Proposta Arquitetural: Modo Dual (LIVE vs SETUP)
Para eliminar 100% da sobrecarga cognitiva sem perder nenhum recurso profissional:
1. **MODO LIVE (Padrão de Palco):**
   - Monitores Program e Preview dominantes (60% da tela superior).
   - Painel Central de Controle de Performance: **Auto Take (72px)**, **Cut (56px)**, **Blackout (56px)** e **T-Bar Touch Drag**.
   - Faixa de Macro States com botões táteis de **56x56px** com feedback de cor ciano/âmbar de alto contraste.
   - Grid de 8 Presets Favoritos de disparo imediato com 1 toque (sem precisar trocar de aba).
   - 6 Quick Faders verticais táteis de 180px de altura com polegares largos de 36px para as camadas L0-L5.
   - **Zero menus suspensos, zero selects, zero tooltips dependentes de hover.**
2. **MODO SETUP (Pré-Show):**
   - Dá acesso total ao Media Pool, Timeline Arranger, Inspector Lateral, Biblioteca de 29 Mattes, Configurações de Áudio, Relink e MIDI Learn.
   - Alternância instantânea via switch no topo: `[ 🎛️ MODO LIVE ] ⟷ [ ⚙️ MODO SETUP ]`.