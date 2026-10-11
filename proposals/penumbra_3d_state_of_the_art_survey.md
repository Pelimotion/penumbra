# 🌌 PENUMBRA 3D ENGINE · PESQUISA DE VANGUARDA & ARQUITETURA DE INTEGRAÇÃO (2026)
**Estado da Arte em 3D no Browser para Performance Audiovisual e VJing Profissional**
*Padrão Global: TouchDesigner · Notch · Resolume Arena 7 + Wire · Three.js r186 · WebGPU*

---

## 🏛️ Sumário Executivo

Esta pesquisa técnica estabelece o contrato arquitetural para a expansão do **Penumbra System** do atual canvas procedural 2D por CPU (`getPlexusSpineCanvas`) para uma **Engine 3D Acelerada por GPU** de nível broadcast. 

O foco é estrito na visão do operador:
> **"Não preciso controlar a câmera; o foco é: partículas por GPU, modificadores em modelos 3D, animações sincronizadas, iluminação cinematográfica (chiaroscuro) e Gaussian Splatting (3DGS), perfeitamente integrados aos canais de vídeo e shaders de penumbra."**

---

## 1. Partículas Reativas por GPU (GPGPU, WebGPU & Instancing)

### 1.1 O Salto Tecnológico: WebGL2 vs WebGPU em 2026
* **Cenário Clássico (WebGL 2.0):** Utilizava `GPUComputationRenderer` com texturas de float/half-float e técnica de **Ping-Pong Buffers** (leitura de uma textura de estado anterior e escrita na nova textura via FBO). Eficiente para até 65.536 partículas (256×256), mas limitado pelo overhead de múltiplos render passes e falta de compute shaders nativos.
* **Estado da Arte Atual (WebGPU & Three.js r186 TSL):** Com a padronização e aceleração do WebGPU no macOS Metal (Safari, Chrome, Vivaldi), a simulação de partículas migrou para **Compute Shaders** e **Three Shading Language (TSL)**:
  * As partículas existem puramente como `StorageBuffer` na GPU.
  * O Compute Pass atualiza posição, velocidade, tempo de vida e atrito em paralelo em milhares de threads de GPU.
  * O Render Pass desenha as partículas diretamente da memória de vídeo via `InstancedMesh` ou `Points` com **1 única Draw Call**.
  * **Capacidade de Carga:** 250.000 a 500.000 partículas simultâneas a 60 FPS com menos de 1.8ms de frame time.

### 1.2 Mapeamento Áudio-Reativo Científico (Penumbra DSP)
Ao contrário de visualizadores amadores que usam volume bruto, a simulação responde à matriz analítica do `PenumbraWebAudio`:
1. **Sub-Bass (< 60 Hz):** Onda de choque radial (*Expansion Burst*) que empurra as partículas para fora ao longo do vetor normal e aciona emissão de novos pontos no downbeat.
2. **Low-Mid (120 Hz - 400 Hz):** Modulação de campo de força (*Curl Noise Turbulence*), criando vórtices fluidos e orgânicos sem que as partículas se dispersem aleatoriamente no vazio.
3. **High Frequencies & Spectral Flux (Transientes de Prato/Ataque):** Tremor de alta frequência (*High-Frequency Jitter / Particle Shimmer*) e ativação de brilho emissivo temporário.
4. **Amortecimento com Lerp Damping:** Todos os parâmetros passam por interpolação não-linear (`lerp` com fator adaptativo de 0.08 a 0.15) para eliminar qualquer estalo ou jitter visual mecânico.

---

## 2. Modificadores em Modelos 3D (Deformers, Noise & Shaders)

### 2.1 Vertex Displacement & Noise Deformers
Em vez de depender de malhas estáticas, modelos 3D importados (`.glb`, `.gltf`, `.obj` — como bustos, esculturas geométricas, anatomia marinha Houdini) recebem modificadores dinâmicos executados no **Vertex Shader**:
* **Normal Extrusion com 3D Simplex Noise:**
  $$\mathbf{P}' = \mathbf{P} + \mathbf{N} \cdot \left[ \text{noise3D}(\mathbf{P} \cdot f + t) \cdot A_{\text{audio}} \right]$$
  Os vértices da malha respiram e se desmancham organicamente com a batida, preservando a silhueta da escultura.
* **Twist & Lattice Deformers:** Deformação procedural de torção no eixo Y que pode ser atrelada aos macro states (ex: no *BUILD-UP*, a malha se retorce aumentando a tensão; no *DROP*, ela explode em partículas instanciadas).

### 2.2 Wireframe Sobel 3D & Estética Penumbra
* Para manter a identidade visual do Penumbra (fundo escuro `#05070a`, traços de giz e ausência de strobes brancos):
  * **Barycentric Wireframe Shader:** Renderização de arestas estilizadas com espessura constante independente da distância da câmera.
  * **Fresnel Rim Light com Threshold Gate:** As bordas da geometria brilham suavemente em ciano neon, ultravioleta ou dourado, enquanto as faces voltadas para a câmera mergulham na penumbra profunda.

---

## 3. Animações e Sincronia Musical Estrita

### 3.1 Mixagem de Animações (Skeletal Skinning + Procedural)
* **Blend de Animações Esqueléticas:** Modelos com riggings complexos utilizam `AnimationMixer` com crossfade suave entre estados de animação (ex: repouso flutuante em *GROOVE*, contração rápida em *BUILD*, clímax dinâmico em *DROP*).
* **Quantização Musical (Musical Grid Snapping):** As alterações de modificadores e disparos de poses ocorrem alinhadas à grade temporal do engine (`1 Bar`, `2 Bars`, `4 Bars`), garantindo sincronicidade absoluta com os takes de vídeo.

---

## 4. Iluminação Cinematográfica (Chiaroscuro & PBR)

### 4.1 Filosofia de Luz em Penumbra
Em motores de concerto e VJing (como Resolume e Notch), a luz não serve para clarear o ambiente, mas para **esculpir a sombra**:
* **Luz Pontual com Atenuação Quadrática Física:** Uma única luz quente ou fria de alta intensidade com decaimento exponencial rápido (`distance: 8.0, decay: 2.0`). O que está a mais de 3 metros do centro desaparece no breu absoluto (`#000000`).
* **Directional Rim Light (Backlight Chiaroscuro):** Posicionada atrás da escultura para recortar a silhueta tridimensional contra o vídeo de fundo sem iluminar o plano frontal.
* **Materiais PBR de Alto Contraste:** Uso de `MeshPhysicalMaterial` com alta aspereza (*Roughness 0.7 - 0.9*) e toques metálicos pontuais (*Metalness 0.3 - 0.6*), garantindo que as superfícies reflitam brilhos sutis sem criar reflexos estourados em branco.

---

## 5. 3D Gaussian Splatting (3DGS) no Navegador

### 5.1 O Marco Tecnológico do Three.js r186 (Setembro de 2026)
* O ecossistema de Gaussian Splatting amadureceu: bibliotecas legadas (como `mkkellogg/GaussianSplats3D`, que ordenava splats na CPU em WebGL) foram oficialmente integradas e superadas pelo **`GaussianSplat` nativo do Three.js**.
* **Destaques do Three.js r186:**
  * Implementação nativa em **TSL (Three Shading Language)** compatível com WebGPU e WebGL2.
  * **Radix Sort acelerado por GPU:** A ordenação de profundidade dos milhões de elipsóides gaussianos ocorre diretamente no hardware gráfico, eliminando 100% dos gargalos de thread JS.
  * Suporte nativo a formatos comprimidos modernos: `.spz` (Scaniverse compressed), `.splat`, `.ply` e `.ksplat`.
* **Aplicação Cênica no Penumbra:**
  * O operador pode carregar uma varredura volumétrica fotorrealista de uma estátua, templo ou ambiente físico e aplicar deformadores de shader e modulação de opacidade de splats diretamente pelas frequências sonoras da pista.

---

## 6. Arquitetura de Integração com o Penumbra Engine

### 6.1 Diagrama de Barramento de Vídeo + 3D Híbrido

```
┌────────────────────────────────────────────────────────┐
│             PENUMBRA 3D ENGINE (THREE.JS)              │
│  - Compute Particles  - PBR Models  - Splatting       │
│  - Shaders Modifiers  - Chiaroscuro Lighting           │
└───────────────────────────┬────────────────────────────┘
                            │ (Render Offscreen Canvas: Alpha 100%)
                            ▼
               [#penumbra-3d-canvas]
                            │
       ┌────────────────────┼────────────────────┐
       ▼                    ▼                    ▼
[DECK A / PROGRAM]    [DECK B / CUE]       [OVERLAY L5]
Canal de Base         Preview Bus B        Sobreposição Direta
(L0 Master)           (L3 Cue)             (Screen / Add / Soft)
       │                    │                    │
       └────────────────────┼────────────────────┘
                            │
                            ▼
              ┌───────────────────────────┐
              │ COMPOSITOR PENUMBRA 60FPS │
              │ Program Canvas (640x360)  │
              │ Pop-out / Monitor Cinema  │
              └───────────────────────────┘
```

### 6.2 Princípios de Integração Limpa:
1. **Canvas Dedicado com Fundo Transparente:**
   ```javascript
   const renderer = new THREE.WebGLRenderer({
     canvas: document.getElementById('penumbra-3d-canvas'),
     alpha: true,
     premultipliedAlpha: true,
     powerPreference: 'high-performance'
   });
   renderer.setClearColor(0x000000, 0); // Fundo 100% transparente
   ```
2. **Roteamento Flexível:**
   O canvas 3D é registrado como um gerador nativo (análogo a um clipe do pool ou do Deck L5). O VJ pode selecionar se quer o 3D como a base cênica (L0) ou como uma camada de partículas e esculturas flutuando sobreposta aos loops cinematográficos de vídeo.
3. **Mapeamento MIDI Nativo:**
   Os encoders físicos do controlador continuam controlando parâmetros de Luz, Dispersão de Partículas, Deformação de Malha e Opacidade sem alterar o código do mixer.
