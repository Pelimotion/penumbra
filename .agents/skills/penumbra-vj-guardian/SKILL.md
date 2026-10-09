---
name: penumbra-vj-guardian
description: >-
  Specialized domain guardian and execution guide for the Penumbra VJ Engine. Use whenever modifying, debugging, or creating canvas render pipelines, FX shaders, audio-reactive modulation, procedural mattes, or autopilot macro presets in Penumbra.
---

# 🎬 Penumbra VJ Engine Guardian

Este runbook instrui o agente sobre as diretrizes técnicas e artísticas específicas do motor VJ Penumbra (Cockpit Web, Canvas HTML5, DSP de Áudio e Presets Macrodinâmicos).

---

## 🖤 Diretrizes Estéticas Fundamentais

1. **A Escuridão como Matéria Escultórica:**
   * Jamais utilizar blend modes puramente aditivos no topo da pilha (`Add`, `Lighter Color`).
   * Jamais gerar strobes ou flashes em branco sólido (`#ffffff`).
   * A camada `Accent` (Difference/Exclusion) deve ter opacidade contida (< 40%) e ser reservada exclusivamente para o clímax/DROP por 2 a 4 compassos.

2. **Aspect Ratio Sagrado:**
   * Qualquer desenho em canvas deve respeitar `Aspect Fit` (com letterbox/pillarbox `#000000`) ou `Aspect Fill` centralizado. Nunca permitir estiramento não uniforme.

3. **Cinética de Mattes Sem Arestas:**
   * Mattes deformados dinamicamente (wiggle, rotação, zoom) devem aplicar uma margem segura (`safeMargin` calculada a partir da amplitude máxima da deformação) para garantir que as bordas do canvas fiquem 100% preenchidas.

4. **Sincronia Musical Estrita:**
   * Taxas de animação e períodos de posterize time devem ser expressos em compassos/batidas musicais (`0.5T, 1T, 2T, 4T, 8T, 16T, 32T`), vinculados ao BPM atual do DSP.

---

## ⚡ Invariantes de Performance no Canvas 60 FPS

* O loop principal em `renderLiveCanvas()` / `requestAnimationFrame` não pode alocar novos arrays ou buffers pesados em cada frame.
* O estado do sistema deve ser lido e escrito exclusivamente em `appState`. O DOM apenas exibe o estado.
* Efeitos de leitura de pixels (`getImageData`) devem ser subsamplificados ou restritos a buffers reduzidos para evitar gargalos na CPU.
