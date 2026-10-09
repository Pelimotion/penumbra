---
name: context-audit
description: >-
  Audits workspace token footprint, context hygiene, file bloat, and rule compliance. Trigger when diagnosing agent slowness, high token usage, context rot, or preparing before a large coding phase.
---

# 🔍 Context Audit & Token FinOps Guide

Este runbook instrui o agente sobre como auditar a saúde do contexto do projeto, identificar inchaços de tokens (*bloat*) e manter o repositório em conformidade com as diretrizes de FinOps de IA.

---

## 🛠️ Procedimento de Auditoria

### 1. Auditoria de Arquivos Pesados
Execute o script de diagnóstico de tokens:
```bash
python3 .agents/scripts/audit_tokens.py
```
Isso identifica:
* Arquivos de texto ou código com mais de 500 linhas que podem inadvertidamente estourar limites de contexto.
* Arquivos de log que devem ser ignorados ou truncados.
* Linhas totais de arquivos chave (`STATE.md`, `DECISOES.md`, `app.js`).

### 2. Verificação de Regras Ativas
* Verifique se `AGENTS.md` e `GEMINI.md` no root permanecem enxutos (< 150 linhas) para preservar o cache de prefixo do modelo.
* Verifique se as skills em `.agents/skills/` possuem cabeçalhos YAML válidos (`name`, `description`).
