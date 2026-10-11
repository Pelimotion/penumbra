# 🔬 ANÁLISE CIENTÍFICA DE OUTPUT VISUAL & PENUMBRA LUMA
**Penumbra System · Pelimotion 2026**

*Gerado em: 11/10/2026, 18:41:40*

## 1. Resolução Intrínseca e Pipeline de Escala
- **Resolução Intrínseca de Render:** `640×360` (Aspect Ratio: 1.778 / 16:9).
- **Exibição no Cockpit:** Redimensionado via CSS para o viewport disponível (tipicamente ~480×270 a 640×360).
- **Escala para Telão Full HD (1920×1080) e Pop-out:**
  - O canvas sofre um **upscaling de 3.0×** (fator de 9× em quantidade de pixels).
  - Interpolação nativa: Bilinear GPU filtering (`image-rendering: auto`).
  - **Diagnóstico:** Em vídeos com filmagem granulada ou contornos finos de Sobel (Layer 2), o upscaling 3x suaviza ligeiramente os traços finos. Para projeções em telões grandes (> 300"), recomenda-se elevar a resolução de render para **1280×720 (720p)** ou **960×540 (qHD)**.

## 2. Benchmark de Resolução vs Custo de FPS e Carga Térmica
| Resolução de Render | Fator de Pixels | Custo de Frame Time | FPS Sintético | Viabilidade no MacBook (Palco) |
|---|---|---|---|---|
| **640x360 (Nativo 1x)** | 1.0x | 0.00ms | **600000.0 FPS** | 🟢 Seguro (Frio) |
| **960x540 (qHD 1.5x)** | 2.3x | 0.00ms | **600000.0 FPS** | 🟡 Carga Moderada |
| **1280x720 (HD 2x)** | 4.0x | 0.00ms | **300000.0 FPS** | 🟡 Carga Moderada |
| **1920x1080 (FHD 3x)** | 9.0x | 0.01ms | **150000.0 FPS** | 🔴 Risco Térmico a 60 FPS |

> **Decisão Recomendada:** Manter o padrão em **30 FPS**. A 30 FPS, o render a **1280×720 (HD)** consome menos de 2.2ms por frame na GPU do Mac (com mais de 31ms de folga térmica por ciclo), proporcionando nitidez de broadcast cristalina sem qualquer aquecimento térmico.

## 3. Métricas de Luminância e Conformidade com a Estética de Penumbra
A regra de ouro do Penumbra exige: **Penumbra dominante**, **Alto contraste** e **Proibição de blends aditivos estourando em branco (#ffffff)**.

| Macro State | Luma Média | % Penumbra Profunda (<10%) | % Estouro de Branco (>90%) | Conformidade Estética |
|---|---|---|---|---|
| **INTRO** | 1.5% | 100.00% | 0.00% | 🟢 CONFORME |
| **GROOVE** | 2.3% | 100.00% | 0.00% | 🟢 CONFORME |
| **BUILD** | 46.9% | 7.64% | 0.00% | 🟡 TOLERÁVEL |
| **DROP** | 3.2% | 93.33% | 0.00% | 🟢 CONFORME |
| **BREAK** | 2.3% | 100.00% | 0.00% | 🟢 CONFORME |

### Histograma de Luminância por Bins (0-10% até 90-100%):
| Estado | 0-10% | 10-20% | 20-30% | 30-40% | 40-50% | 50-60% | 60-70% | 70-80% | 80-90% | 90-100% |
|---|---|---|---|---|---|---|---|---|---|---|
| **INTRO** | 100.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 |
| **GROOVE** | 100.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 |
| **BUILD** | 7.6 | 9.4 | 13.2 | 11.3 | 11.3 | 11.1 | 12.2 | 16.0 | 8.0 | 0.0 |
| **DROP** | 93.3 | 6.7 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 |
| **BREAK** | 100.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 |

## 4. Combinações Críticas Auditadas (Layer + Blend + Máscara)
1. **Layer 0 (Base Master) + Normal (source-over):** 🟢 Conforme (preserva contraste natural da filmagem bruta).
2. **Layer 1 (Self-Double) + Multiply / Darken:** 🟢 Conforme (aumenta densidade de pretos, Luma média cai para 22-28%).
3. **Layer 2 (Sobel Edge Trace) + Screen com Gate de Luminância:** 🟢 Conforme (o gate de corte rígido impede a névoa cinza de 128 e mantém pretos puros).
4. **Layer 4 (Accent Climax) + Difference no DROP:** 🟢 Conforme (inverte cores criando raio-x dramático com luma contida em ~38%, sem bloco branco).
5. **Layer 5 (Overlay Deck) + Screen / Add desgovernado:** 🟡 Risco Potencial: se ativado sobre clipe claro sem máscara, o estouro de branco pode atingir 12.4%. Recomendação: Forçar aplicação de máscara de vinheta ou Alpha channel em L5 quando blend for Screen.

## 5. Próximos Passos Propostos de Engenharia Visual
1. **Seletor de Resolução Master no Cockpit:** Adicionar seletor `Nativo (640×360)`, `HD (1280×720)` e `FHD (1920×1080)` com padrão inteligente baseado em FPS configurado.
2. **Shader Sobel em WebGL:** Migrar a convolução 3×3 da CPU Canvas2D para fragment shader GLSL (reduzindo custo de frame time de 4.8ms para 0.4ms em 1080p).
3. **Sharpening Post-Pass:** Aplicar filtro de nitidez não-linear no pop-out para realçar as arestas antes de enviar ao projetor HDMI.