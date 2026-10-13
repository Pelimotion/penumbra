---
name: ponytail
description: >-
  Senior developer minimalism and ruthless code compression (YAGNI). Use to eliminate unnecessary abstractions, boilerplate, premature optimization, and dependency bloat. Replaces complex code with simple native platform/standard library idioms.
---

# 🥋 Ponytail Skill (Senior Dev Minimalist & YAGNI)

Inspirado na mentalidade do sênior minimalista: se você propõe 50 linhas de abstração e novas bibliotecas, ele substitui por 2 linhas nativas que usam o que a plataforma já oferece.

---

## 🎯 Princípios de Arquitetura

1. **YAGNI Implacável (You Aren't Gonna Need It):**
   * Pare na primeira solução simples que resolve o problema de ponta a ponta com estabilidade.
   * Proibido criar classes abstratas, factories ou camadas de indireção para "futuras extensibilidades" hipotéticas.

2. **Nativos da Plataforma & Stdlib Primeiro:**
   * Priorize recursos da biblioteca padrão e Web APIs nativas do navegador (`URL`, `fetch`, `IndexedDB`, `Canvas 2D`, `Web Audio`, `crypto`, `Intl`).
   * Não adicione dependências de terceiros ou wrappers complexos quando a linguagem padrão já resolve.

3. **Simplicidade na Solução, Rigor Máximo na Corretude:**
   * Preguiçoso com complexidade de código, mas **implacável com integridade**: tratamento de erro, race conditions, memory leaks e concorrência nunca são ignorados.
   * Menos código = menor superfície de bugs.

4. **Diffs Cirúrgicos:**
   * Mantenha alterações restritas ao escopo estrito da tarefa. Sem refactors cosméticos não solicitados.
