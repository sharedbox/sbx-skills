import os from 'node:os';
import path from 'node:path';

const home = os.homedir();
const xdgConfig = process.env.XDG_CONFIG_HOME || path.join(home, '.config');
const codexHome = process.env.CODEX_HOME || path.join(home, '.codex');

/**
 * Agentes suportados e onde cada um procura skills (formato Agent Skills: <dir>/<skill>/SKILL.md).
 *  - project: relativo ao diretório atual (instalação por projeto)
 *  - global:  absoluto (instalação para o usuário)
 *  - detect:  caminhos cuja existência indica que o agente está instalado (pré-seleção no menu)
 * Para suportar um novo agente, basta adicionar uma entrada aqui.
 */
export const AGENTS = [
  {
    id: 'claude',
    name: 'Claude Code',
    project: '.claude/skills',
    global: path.join(home, '.claude', 'skills'),
    detect: [path.join(home, '.claude')],
  },
  {
    id: 'codex',
    name: 'OpenAI Codex',
    project: '.agents/skills',
    global: path.join(codexHome, 'skills'),
    detect: [codexHome],
  },
  {
    id: 'gemini',
    name: 'Gemini CLI',
    project: '.gemini/skills',
    global: path.join(home, '.gemini', 'skills'),
    detect: [path.join(home, '.gemini')],
  },
  {
    id: 'antigravity',
    name: 'Google Antigravity',
    project: '.agent/skills',
    global: path.join(home, '.gemini', 'antigravity', 'skills'),
    detect: [path.join(home, '.gemini', 'antigravity')],
  },
  {
    id: 'copilot',
    name: 'GitHub Copilot',
    project: '.github/skills',
    global: path.join(home, '.copilot', 'skills'),
    detect: [path.join(home, '.copilot')],
  },
  {
    id: 'cursor',
    name: 'Cursor',
    project: '.cursor/skills',
    global: path.join(home, '.cursor', 'skills'),
    detect: [path.join(home, '.cursor')],
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    project: '.opencode/skills',
    global: path.join(xdgConfig, 'opencode', 'skills'),
    detect: [path.join(xdgConfig, 'opencode')],
  },
  {
    id: 'windsurf',
    name: 'Windsurf',
    project: '.windsurf/skills',
    global: path.join(home, '.codeium', 'windsurf', 'skills'),
    detect: [path.join(home, '.codeium', 'windsurf')],
  },
];
