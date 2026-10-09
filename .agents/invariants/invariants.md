# 🛡️ INVARIANTES ARQUITETURAIS E ARTÍSTICOS DO PROJETO

As regras abaixo são **inegociáveis**. Nenhuma alteração de código ou funcionalidade pode violar estas invariantes sem autorização e justificativa explícita registrada em [`DECISOES.md`](file:///Volumes/PLM_SSD_01/Pipeline%20SSD%2001/Gigantera/Pipeline%20Gigantera/Video%20Art%20Drinkzinho/DECISOES.md).

---

## 🖤 1. Invariantes Artísticas e Estéticas (Aesthetic Invariants)

1. **A Escuridão como Matéria Escultórica:**
   * **PROIBIDO:** Modos de blend puramente aditivos no topo da stack de vídeo (`Add`, `Lighter Color`).
   * **PROIBIDO:** Strobes e flashes em branco sólido (`#ffffff`) que explodam o contraste e ceguem a projeção.
   * **PERMITIDO & ENCORAJADO:** Blends subtrativos e texturais: `Multiply`, `Darken`, `Soft Light` e `Difference` pontual (restrito a momentos de DROP/Climax com opacidade contida < 40%).

2. **Elegância Cinematográfica e Musical:**
   * **PROIBIDO:** Tremulações procedurais caóticas (*frantic wiggles*) ou strobes de alta frequência contínuos.
   * **REGRA DE OURO DO MOVIMENTO:** Os vídeos brutos das filmagens em `1. In` já possuem riqueza cinematográfica natural. Efeitos e cinéticas devem acompanhar a respiração do áudio de forma elegante.
   * **POSTERIZE TIME MUSICAL:** Toda quantização temporal de animação deve ser medida em **compassos/batidas musicais** (0.5T, 1T, 2T, 4T, 8T, 16T, 32T), jamais em números arbitrários desvinculados do tempo.

3. **Integridade das Máscaras e Mattes:**
   * Máscaras de linhas, grades, ruídos e padrões devem cobrir o enquadramento sem exibir arestas vazias ou bordas cortadas nas laterais ao sofrer rotação ou deslocamento (exigência de `safeMargin` dinâmico).

---

## ⚡ 2. Invariantes de Performance e Runtime (Runtime Invariants)

1. **Taxa de Quadros Cristalina a 60 FPS:**
   * O loop de renderização do Living Canvas (`requestAnimationFrame`) não pode conter operações síncronas pesadas (como leituras de canvas síncronas bloqueantes repetidas, alocações de grandes buffers dentro do loop de frame, ou parsing de JSON).
   * Efeitos de manipulação direta de pixels (como Sobel, Pixel Sorter, RXXR) devem usar loops otimizados e subsampling quando apropriado para manter latência < 16ms por quadro.

2. **Fonte Única de Verdade do Estado (`appState`):**
   * O estado operacional da engine vive unicamente no objeto reativo `appState`.
   * A interface de usuário (DOM) é uma projeção visual do estado. Nenhuma regra de negócio deve ser computada lendo propriedades de elementos do DOM.

3. **Preservação Geométrica (Aspect Ratio):**
   * Nenhum vídeo ou textura pode ser achatado ou esticado de forma não uniforme (`stretch`).
   * Enquadramento estrito via `Aspect Fit` (com letterbox/pillarbox preto puro `#000000`) ou `Aspect Fill` centralizado.

---

## 🌐 3. Invariantes de Cloud e Tri-Source Media (Standalone Browser VJ)

1. **Segurança Máxima (Zero Remote Control):**
   * O servidor Node.js local (quando rodado) deve ser estritamente bloqueado para acesso externo. CORS configurado exclusivamente para `localhost`. Nenhuma máquina na rede ou internet pode controlar a máquina física.
2. **Independência de Backend (Standalone Mode):**
   * A aplicação Web hospedada na Vercel deve atuar como um VJ Engine Autônomo. Ela não requer o Node.js para rodar.
3. **Múltiplas Fontes de Mídia (Tri-Source Resolution):**
   * **Local via File System Access API:** A aplicação na Vercel deve permitir ao usuário, através das configurações, selecionar a pasta local de mídias no próprio navegador (sem precisar do Node), injetando os vídeos direto no Canvas.
   * **CDN (Bunny.net):** Fallback padrão. A aplicação puxa os vídeos cacheados da nuvem para operação em qualquer computador.
   * **YouTube Iframe/MSE Ingestion:** Suporte para injetar streams do YouTube Premium sem anúncios nas layers da Penumbra, com suporte a cache local via IndexedDB e Service Workers para vídeos em loop.
