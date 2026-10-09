# 🪐 NEXUS AGENT ENGINE · GOVERNANÇA DE VIBECODING INTELIGENTE

Bem-vindo ao workspace do **Penumbra System / Video Art Drinkzinho**. Este projeto opera sob o modelo de **Governed Vibe-Coding** (Vibecoding de Vanguarda com Governança e Economia de Tokens).

---

## 🏛️ Princípios de Operação do Agente

1. **Contexto Hierárquico L1-L4:**
   - **L1 (Efêmero):** Mantenha respostas e histórico enxutos. Nunca despeje arquivos inteiros.
   - **L2 (Episódico):** Consulte e atualize [`STATE.md`](file:///Volumes/PLM_SSD_01/Pipeline%20SSD%2001/Gigantera/Pipeline%20Gigantera/Video%20Art%20Drinkzinho/STATE.md) para estado operacional e [`DECISOES.md`](file:///Volumes/PLM_SSD_01/Pipeline%20SSD%2001/Gigantera/Pipeline%20Gigantera/Video%20Art%20Drinkzinho/DECISOES.md) para decisões arquiteturais (ADRs).
   - **L3 (Procedural):** Utilize a biblioteca de habilidades em [`.agents/skills/`](file:///Volumes/PLM_SSD_01/Pipeline%20SSD%2001/Gigantera/Pipeline%20Gigantera/Video%20Art%20Drinkzinho/.agents/skills/) sob demanda (Progressive Disclosure).
   - **L4 (Semântico):** Respeite rigorosamente as invariantes em [`.agents/invariants/invariants.md`](file:///Volumes/PLM_SSD_01/Pipeline%20SSD%2001/Gigantera/Pipeline%20Gigantera/Video%20Art%20Drinkzinho/.agents/invariants/invariants.md).

2. **FinOps de IA & Economia de Tokens:**
   - Use `grep_search` para localizar trechos antes de ler código.
   - Use `view_file` estritamente com fatias (`StartLine` e `EndLine`).
   - Use `replace_file_content` para diffs cirúrgicos. Nunca regrave arquivos inteiros sem necessidade.

3. **Portão de Decisão Crítica (System 2 Pre-Flight Gate):**
   - Antes de qualquer mudança destrutiva ou de alto impacto, verifique se a solução quebra o loop de 60 FPS, se introduz strobes brancos (`#ffffff`) ou se deforma o aspect ratio.
   - Auto-questione-se: *"Quais são os 2 cenários mais prováveis onde este código falhará em tempo de execução?"*

4. **Aprendizado Contínuo de Skills:**
   - Quando dominar um novo procedimento ou resolver um bug complexo, registre uma nova habilidade executando o `skill-synthesizer`.

5. **Fluxo Colaborativo de Git (Branch & PR Obrigatório):**
   - Nunca commitar e dar push diretamente na branch `main`.
   - Sempre criar uma feature/fix branch (ex: `feat/...`, `fix/...`), publicar com `git push -u origin <branch>` e trabalhar nela.
   - Ao concluir a tarefa ou marco, abrir um Pull Request (PR) no GitHub (`gh pr create`) apontando para `main`. O revisor humano avalia e dá merge sem conflitos concorrentes.

---

## 📚 Documentação e Regras Detalhadas
- Regras de Contexto: [`.agents/rules/01_context_engineering.md`](file:///Volumes/PLM_SSD_01/Pipeline%20SSD%2001/Gigantera/Pipeline%20Gigantera/Video%20Art%20Drinkzinho/.agents/rules/01_context_engineering.md)
- Regras de Tokens: [`.agents/rules/02_token_economy.md`](file:///Volumes/PLM_SSD_01/Pipeline%20SSD%2001/Gigantera/Pipeline%20Gigantera/Video%20Art%20Drinkzinho/.agents/rules/02_token_economy.md)
- Regras de Decisão: [`.agents/rules/03_critical_decision.md`](file:///Volumes/PLM_SSD_01/Pipeline%20SSD%2001/Gigantera/Pipeline%20Gigantera/Video%20Art%20Drinkzinho/.agents/rules/03_critical_decision.md)
- Orquestração Multi-Agente: [`.agents/rules/04_vibe_orchestration.md`](file:///Volumes/PLM_SSD_01/Pipeline%20SSD%2001/Gigantera/Pipeline%20Gigantera/Video%20Art%20Drinkzinho/.agents/rules/04_vibe_orchestration.md)
- Governança de Git & PR: [`.agents/rules/05_git_collaboration.md`](file:///Volumes/PLM_SSD_01/Pipeline%20SSD%2001/Gigantera/Pipeline%20Gigantera/Video%20Art%20Drinkzinho/.agents/rules/05_git_collaboration.md)
