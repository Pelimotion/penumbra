# 🌿 REGRA 05: GOVERNANÇA DE GIT COLABORATIVO & PULL REQUESTS (PR-FIRST)

## 🎯 Objetivo
Garantir o isolamento total de desenvolvimento concorrente entre o Agente de IA, o Desenvolvedor Humano e Colaboradores externos, eliminando qualquer risco de conflitos destrutivos na branch `main`.

---

## 📜 Regras Mandatórias de Operação

1. **Proibição Estrita de Commits Diretos na `main`:**
   - O Agente NUNCA deve realizar commits ou push diretamente para a branch `main`.
   - Toda alteração de código, refatoração, correção ou adição de recurso DEVE ser feita em uma branch dedicada.

2. **Convenção de Nomes de Branches:**
   - Recursos e Funcionalidades: `feat/<descricao-curta-kebab-case>`
   - Correções de Bugs: `fix/<descricao-curta-kebab-case>`
   - Refatoração / Performance: `refactor/<descricao-curta-kebab-case>`
   - Documentação / Governança: `docs/<descricao-curta-kebab-case>`
   - Sincronização entre Repositórios: `sync/<descricao-curta-kebab-case>`

3. **Ciclo de Vida do Trabalho (Branch → Push → PR):**
   - **Passo 1 (Criação & Tracking):** `git checkout -b <branch_name>` seguido imediatamente por `git push -u origin <branch_name>`.
   - **Passo 2 (Desenvolvimento Atômico):** Fazer commits semânticos e concisos.
   - **Passo 3 (Validação & Pré-Voo):** Executar checks locais para garantir zero erros de runtime ou build.
   - **Passo 4 (Abertura de PR):** Abrir Pull Request oficial via GitHub CLI (`gh pr create --base main --head <branch_name> --title "..." --body "..."`).

4. **Conteúdo Obrigatório do Pull Request:**
   - **Título Claro:** Prefixo Conventional Commits (`feat(...)`, `fix(...)`, etc.).
   - **Resumo Executivo:** O que foi alterado e por quê.
   - **Decisões de Design & Invariantes:** Destaque se houve impacto em 60 FPS, aspect ratio, MIDI ou Shaders.
   - **Checklist de Validação:** Testes executados para que o revisor aprove com total confiança.

5. **Aprovação e Merge:**
   - O desenvolvedor humano é o responsável soberano por revisar e realizar o merge para a branch `main`.
   - O agente nunca deve forçar merge sem revisão a menos que expressamente ordenado pelo usuário.
