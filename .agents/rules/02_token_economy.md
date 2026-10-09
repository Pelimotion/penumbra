# 💰 REGRA 02: ECONOMIA DE TOKENS E FINOPS DE IA (TOKEN ECONOMY)

O custo e a latência de agentes de IA escalam quadraticamente com o inchaço de contexto. Além disso, modelos sofrem de degradação de atenção (*needle in a haystack*) quando submetidos a prompts excessivamente volumosos.

---

## ⚡ Princípios Fundamentais de Economia de Tokens

### 1. KV-Cache Friendliness (Otimização de Cache de Prefixo)
* Os modelos modernos (Claude 3.5/3.7, Gemini 1.5/2.0/3.0, GPT-4o) utilizam **Prompt Caching** para reutilizar o estado KV dos tokens já processados.
* **Diretriz:** Mantenha os arquivos mestres de regras (`AGENTS.md`, `GEMINI.md`) estáveis e determinísticos. Modificações frequentes nas primeiras linhas do prompt invalidam o cache global, encarecendo cada turno em até 10x.
* Conteúdos altamente voláteis devem residir em arquivos de estado dedicados (`STATE.md`), consultados sob demanda.

### 2. Leitura Cirúrgica (Zero File Dumping)
* **Proibição Estrita:** Nunca execute `view_file` em arquivos com mais de 300 linhas sem especificar `StartLine` e `EndLine`.
* **Fluxo Obrigatório de Inspeção:**
  1. Use `grep_search` para localizar a linha exata da função, seletor ou constante.
  2. Use `view_file` com janela restrita (ex: `StartLine: 450, EndLine: 495`).
  3. Total de tokens poupados por operação: de 15.000 para ~400 tokens (redução de 97%).

### 3. Edição por Diffs Compactos
* Utilize sempre `replace_file_content` para trechos contíguos ou `multi_replace_file_content` para múltiplos blocos.
* **NUNCA** substitua arquivos inteiros de 1.000 linhas via `write_to_file` apenas para alterar 5 linhas de código, exceto ao criar arquivos do zero.

### 4. Silêncio em Respostas Boilerplate
* Ao responder ao usuário:
  * Não reproduza arquivos inteiros modificados em blocos de markdown.
  * Não gere resumos prolixos redundantes quando o artefato já expressa a informação.
  * Forneça explicações focadas na lógica de alto nível, trade-offs e impactos arquiteturais.

---

## 📊 Tabela Comparativa de Eficiência

| Operação | Método Ingênuo (Antigo) | Método Nexus Vibe (Vanguarda) | Economia de Tokens |
|---|---|---|---|
| Inspecionar função | `view_file` (arquivo inteiro 3.000 lins) | `grep_search` + `view_file` (40 linhas) | **~98%** |
| Adicionar novo helper | Reescrever arquivo inteiro via `write_to_file` | `replace_file_content` cirúrgico | **~90%** |
| Consultar procedimento | Injetar todos os manuais no prompt mestre | `SKILL.md` carregado on-demand | **~95%** |
| Responder usuário | Repetir código gerado na mensagem | Resumo executivo + link do arquivo | **~85%** |
