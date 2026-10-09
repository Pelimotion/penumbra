---
name: skill-synthesizer
description: >-
  Synthesizes new skills, runbooks, and procedures from completed tasks, debugged challenges, or newly mastered techniques into reusable .agents/skills/ packages. Trigger whenever the user asks to persist a skill, record a workflow, or when an agent masters a new pipeline capability.
---

# 🧠 Skill Synthesizer: Aprendizado Contínuo de Habilidades

Este procedimento guia o agente a transformar conhecimentos recém-adquiridos, padrões de código validados ou fluxos de trabalho em habilidades permanentes reutilizáveis no diretório `.agents/skills/`.

---

## 📋 Quando Disparar a Síntese de uma Skill
* O usuário solicita expressamente: "grave isso como skill", "aprenda esse fluxo", ou "crie uma skill para X".
* Uma solução complexa e não-trivial foi resolvida com sucesso (ex: integração de protocolo de áudio, truque de canvas shader, workflow do After Effects).
* Um erro repetido foi corrigido e requer um checklist preventivo permanente.

---

## 🛠️ Procedimento Passo a Passo

### 1. Definir o Nome e o Gatilho (Trigger Description)
* O nome da skill deve ser em letras minúsculas com hífens (ex: `touchdesigner-ndi-sync`, `webgl-sobel-shader`).
* A descrição no cabeçalho YAML (`description`) é o ponto mais crítico: ela determina quando o agente carregará a skill via Progressive Disclosure. Escreva em terceira pessoa deixando explícito **o que** ela faz e **quando** deve ser ativada.

### 2. Estrutura Padrão da Nova Skill
Crie o diretório `.agents/skills/<nome-da-skill>/` contendo:
* `SKILL.md`: O arquivo de instruções mestre.
* `references/` (Opcional): Documentações detalhadas, especificações de APIs ou tabelas pesadas (economiza tokens mantendo o `SKILL.md` enxuto).
* `scripts/` (Opcional): Scripts bash ou python que automatizam o processo.

### 3. Modelo do Arquivo `SKILL.md`
```markdown
---
name: <nome-da-skill>
description: >-
  <Descrição em terceira pessoa indicando o que a skill faz e quando deve ser ativada.>
---

# <Título da Habilidade>

## 🎯 Objetivo & Casos de Uso
<Explicação concisa do propósito.>

## 🛡️ Invariantes & Cuidados Críticos
<O que NÃO fazer para evitar regressões ou quebra de pipeline.>

## 📋 Passo a Passo de Execução
1. <Passo 1>
2. <Passo 2>

## ✅ Verificação & Validação
<Como comprovar que o procedimento funcionou com sucesso.>
```

### 4. Execução Assistida via Script CLI
Você também pode utilizar o script de scaffolding:
```bash
python3 .agents/scripts/synthesize_skill.py --name "minha-skill" --desc "Descrição do que a skill faz"
```
