# 🧠 REGRA 01: ENGENHARIA DE CONTEXTO HIERÁRQUICO (L1 A L4)

Esta regra estabelece o protocolo de gestão de contexto para o agente. Contexto em excesso gera *context rot* (apodrecimento de contexto), alucinações e perda de atenção. Contexto insuficiente causa regressões.

---

## 🏗️ Os 4 Níveis de Memória do Sistema

### 1. L1: Memória Efêmera de Trabalho (Working Context)
* **Escopo:** A janela de conversa ativa atual.
* **Princípio:** Mantenha o contexto ativo magro.
* **Ações:**
  * Não despeje saídas brutas de logs gigantes na conversa.
  * Nunca copie blocos de 500 linhas de código na resposta para o usuário.
  * Use ferramentas de edição com chunks cirúrgicos (`replace_file_content` / `multi_replace_file_content`).

### 2. L2: Memória Episódica do Projeto (Project State & ADRs)
* **Arquivos Chave:**
  * [`STATE.md`](file:///Volumes/PLM_SSD_01/Pipeline%20SSD%2001/Gigantera/Pipeline%20Gigantera/Video%20Art%20Drinkzinho/STATE.md): O pulso em tempo real dos serviços, portas, processos e status de sprint.
  * [`DECISOES.md`](file:///Volumes/PLM_SSD_01/Pipeline%20SSD%2001/Gigantera/Pipeline%20Gigantera/Video%20Art%20Drinkzinho/DECISOES.md): Registro de Decisões Arquiteturais (ADRs), registrando o motivo técnico/artístico e alternativas descartadas.
* **Regra de Atualização:**
  * Toda decisão estrutural (nova porta, novo protocolo, novo blend mode proibido) DEVE ser registrada em `DECISOES.md`.
  * Toda alteração de estado dos servidores ou pipelines DEVE ser refletida em `STATE.md`.

### 3. L3: Memória Procedural (Skill Library & Progressive Disclosure)
* **Escopo:** Pasta [`.agents/skills/`](file:///Volumes/PLM_SSD_01/Pipeline%20SSD%2001/Gigantera/Pipeline%20Gigantera/Video%20Art%20Drinkzinho/.agents/skills/).
* **Princípio da Divulgação Progressiva:**
  * O agente visualiza inicialmente apenas o cabeçalho YAML (`name` e `description`) das skills no prompt do sistema.
  * O conteúdo integral de um `SKILL.md` só é lido via `view_file` quando a tarefa específica exigir aquela habilidade.
  * Isso reduz em até 95% os tokens consumidos por procedimentos não utilizados na sessão.

### 4. L4: Conhecimento Semântico & Invariantes
* **Escopo:** [`invariants.md`](file:///Volumes/PLM_SSD_01/Pipeline%20SSD%2001/Gigantera/Pipeline%20Gigantera/Video%20Art%20Drinkzinho/.agents/invariants/invariants.md) e [`graphify-out/`](file:///Volumes/PLM_SSD_01/Pipeline%20SSD%2001/Gigantera/Pipeline%20Gigantera/Video%20Art%20Drinkzinho/graphify-out/).
* **Regra de Ouro:** Invariantes arquiteturais nunca podem ser violadas silenciosamente por sugestões rápidas do modelo.

---

## 🛡️ Protocolo Anti-Poluição de Contexto (Context Hygiene)
1. **Reset Limpo entre Épicos:** Ao concluir uma grande feature ou transicionar de domínio (ex: de After Effects DSP para frontend WebGL), sintetize os aprendizados em `STATE.md` e descarregue variáveis de memória efêmera.
2. **Uso de Subagentes para Exploração Pesada:** Ao realizar buscas profundas, varreduras de arquivos ou investigações de logs, delegue para subagentes ou scripts dedicados que retornem apenas o resultado refinado.
