#!/usr/bin/env python3
"""
synthesize_skill.py
Scaffolds a new agent skill into .agents/skills/<name>/SKILL.md with valid YAML frontmatter.
Usage:
    python3 synthesize_skill.py --name "touchdesigner-osc" --desc "Use when configuring TouchDesigner OSC routing"
"""

import argparse
import sys
from pathlib import Path

SKILL_TEMPLATE = """---
name: {name}
description: >-
  {description}
---

# 🛠️ {title}

## 🎯 Objetivo & Casos de Uso
{description}

## 🛡️ Invariantes & Cuidados Críticos
- Não quebrar a taxa de 60 FPS ou contratos de dados existentes.
- Respeitar a estética de Penumbra (escuridão escultórica, sem strobes brancos).

## 📋 Procedimento Passo a Passo
1. **Preparação:** Inspecione os parâmetros necessários antes de executar.
2. **Execução:** Aplique as mudanças cirurgicamente via replace_file_content.
3. **Validação:** Verifique a integridade em tempo de execução.

## ✅ Critérios de Sucesso & Testes
- [ ] O runtime responde sem erros de console ou logs de exceção.
- [ ] O comportamento atende integralmente ao requisito do operador.
"""

def main():
    parser = argparse.ArgumentParser(description="Scaffold a new agent skill.")
    parser.add_argument("--name", required=True, help="Skill identifier (lowercase, hyphenated)")
    parser.add_argument("--desc", required=True, help="Third-person description for agent discovery")
    parser.add_argument("--title", help="Human-readable title (optional)")
    args = parser.parse_args()

    skill_name = args.name.strip().lower().replace(" ", "-")
    title = args.title or skill_name.replace("-", " ").title()
    desc = args.desc.strip()

    # Determine script location and workspace .agents root
    script_dir = Path(__file__).resolve().parent
    agents_dir = script_dir.parent
    skills_dir = agents_dir / "skills"
    target_dir = skills_dir / skill_name

    target_dir.mkdir(parents=True, exist_ok=True)
    skill_file = target_dir / "SKILL.md"

    if skill_file.exists():
        print(f"[!] Warning: Skill '{skill_name}' already exists at {skill_file}. Skipping overwrite.")
        sys.exit(0)

    content = SKILL_TEMPLATE.format(name=skill_name, description=desc, title=title)
    skill_file.write_text(content, encoding="utf-8")
    print(f"[✓] Created new skill '{skill_name}' at {skill_file}")

if __name__ == "__main__":
    main()
