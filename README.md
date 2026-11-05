# sbx-skills

Skills SBX para agentes de IA, com instalador interativo via `npx`.

```bash
npx sbx-skills                 # menu: escolha agentes, skills e escopo (projeto/global)
npx sbx-skills -a claude,codex -g -y
npx sbx-skills list            # skills e agentes suportados
npx sbx-skills remove          # desinstala
```

Publicação: `npm publish` (o `prepack` preserva o `.gitignore` do template do scaffold, que o npm descartaria). Prefira o registry a `npx github:...`, que no npm 12 exige `--allow-git` e não executa o `prepack`.

| Agente | Projeto | Global |
|---|---|---|
| Claude Code | `.claude/skills` | `~/.claude/skills` |
| OpenAI Codex | `.agents/skills` | `~/.codex/skills` |
| Gemini CLI | `.gemini/skills` | `~/.gemini/skills` |
| Google Antigravity | `.agent/skills` | `~/.gemini/antigravity/skills` |
| GitHub Copilot | `.github/skills` | `~/.copilot/skills` |
| Cursor | `.cursor/skills` | `~/.cursor/skills` |
| OpenCode | `.opencode/skills` | `~/.config/opencode/skills` |
| Windsurf | `.windsurf/skills` | `~/.codeium/windsurf/skills` |

Para adicionar um agente, edite [bin/agents.js](bin/agents.js). Para adicionar uma skill, crie `skills/<nome>/SKILL.md` — o instalador a detecta sozinho.

Opções: `-a/--agents`, `-s/--skills`, `-g/--global`, `-p/--project`, `-y/--yes`, `--dry-run`, `-h/--help`.
