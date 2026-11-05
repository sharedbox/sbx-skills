#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { AGENTS } from './agents.js';
import { colors as c, multiselect, select, confirm } from './prompt.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKILLS_DIR = path.join(ROOT, 'skills');
const PKG = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

// O npm descarta arquivos ".gitignore" ao empacotar; o prepack os renomeia e aqui revertemos.
const PACKED_RENAMES = { '.gitignore.sbx-pack': '.gitignore' };
const SKIP = new Set(['.DS_Store', 'node_modules', '__pycache__']);

const HELP = `
${c.bold('sbx-skills')} v${PKG.version} — instala as skills SBX nos agentes de IA escolhidos.

${c.bold('Uso')}
  npx sbx-skills [install] [opções]   instala (interativo se nenhuma opção for passada)
  npx sbx-skills remove [opções]      remove as skills instaladas
  npx sbx-skills list                 lista skills e agentes suportados

${c.bold('Opções')}
  -a, --agents <ids>   agentes separados por vírgula (ou "all")
  -s, --skills <ids>   skills separadas por vírgula (padrão: todas)
  -g, --global         instala no diretório do usuário (~)
  -p, --project        instala no projeto atual (padrão)
  -y, --yes            não pergunta nada; usa padrões para o que faltar
      --dry-run        mostra o que seria feito sem gravar nada
  -h, --help           ajuda
  -v, --version        versão

${c.bold('Exemplos')}
  npx sbx-skills
  npx sbx-skills -a claude,codex -g
  npx sbx-skills -a all -s sbx-nestjs-clean-arch -y
  npx sbx-skills remove -a cursor -p
`;

function readSkills() {
  return fs
    .readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(SKILLS_DIR, d.name, 'SKILL.md')))
    .map((d) => {
      const md = fs.readFileSync(path.join(SKILLS_DIR, d.name, 'SKILL.md'), 'utf8');
      const fm = md.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? '';
      const description = fm.match(/^description:\s*(.*)$/m)?.[1]?.trim() ?? '';
      return { id: d.name, description };
    });
}

function short(text, n = 70) {
  return text.length > n ? text.slice(0, n - 1) + '…' : text;
}

function parseList(value, valid, kind) {
  if (!value) return undefined;
  const ids = value.split(',').map((s) => s.trim()).filter(Boolean);
  if (ids.includes('all')) return valid;
  const unknown = ids.filter((id) => !valid.includes(id));
  if (unknown.length) {
    throw new Error(`${kind} desconhecido(s): ${unknown.join(', ')}. Válidos: ${valid.join(', ')}`);
  }
  return [...new Set(ids)];
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const from = path.join(src, entry.name);
    const to = path.join(dest, PACKED_RENAMES[entry.name] ?? entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else if (entry.isFile()) fs.copyFileSync(from, to);
  }
}

/** Resolve os diretórios de destino, deduplicando agentes que compartilham o mesmo caminho. */
function targets(agentIds, scope) {
  const byDir = new Map();
  for (const id of agentIds) {
    const agent = AGENTS.find((a) => a.id === id);
    const dir = scope === 'global' ? agent.global : path.resolve(process.cwd(), agent.project);
    if (!byDir.has(dir)) byDir.set(dir, []);
    byDir.get(dir).push(agent.name);
  }
  return [...byDir].map(([dir, names]) => ({ dir, names }));
}

function display(p) {
  const home = process.env.HOME;
  const rel = path.relative(process.cwd(), p);
  if (!rel.startsWith('..') && !path.isAbsolute(rel)) return rel || '.';
  return home && p.startsWith(home) ? '~' + p.slice(home.length) : p;
}

async function main() {
  const { values: opts, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      agents: { type: 'string', short: 'a' },
      skills: { type: 'string', short: 's' },
      global: { type: 'boolean', short: 'g' },
      project: { type: 'boolean', short: 'p' },
      yes: { type: 'boolean', short: 'y' },
      'dry-run': { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
    },
  });

  if (opts.help) return console.log(HELP);
  if (opts.version) return console.log(PKG.version);

  const command = positionals[0] ?? 'install';
  if (!['install', 'add', 'remove', 'uninstall', 'list'].includes(command)) {
    throw new Error(`Comando desconhecido: ${command}. Use --help.`);
  }
  const removing = command === 'remove' || command === 'uninstall';

  const skills = readSkills();
  const skillIds = skills.map((s) => s.id);
  const agentIds = AGENTS.map((a) => a.id);

  if (command === 'list') {
    console.log(`\n${c.bold('Skills')}`);
    for (const s of skills) console.log(`  ${c.cyan(s.id)}  ${c.dim(short(s.description, 90))}`);
    console.log(`\n${c.bold('Agentes')}`);
    for (const a of AGENTS) {
      console.log(`  ${c.cyan(a.id.padEnd(12))} ${a.name.padEnd(20)} ${c.dim(`${a.project}  |  ${display(a.global)}`)}`);
    }
    return console.log();
  }

  const interactive = process.stdin.isTTY && process.stdout.isTTY && !opts.yes;
  if (!interactive && !opts.agents) {
    throw new Error('Sem terminal interativo: informe os agentes com --agents (ex.: --agents claude,codex).');
  }

  console.log(`\n${c.bold('sbx-skills')} ${c.dim('v' + PKG.version)}\n`);

  // 1. Agentes
  let chosenAgents = parseList(opts.agents, agentIds, 'Agente');
  if (!chosenAgents) {
    chosenAgents = await multiselect(
      removing ? 'De quais agentes remover?' : 'Para quais agentes instalar?',
      AGENTS.map((a) => {
        const detected = a.detect.some((p) => fs.existsSync(p));
        return { value: a.id, label: a.name, hint: detected ? '(detectado)' : '', selected: detected };
      }),
    );
  }

  // 2. Skills
  let chosenSkills = parseList(opts.skills, skillIds, 'Skill');
  if (!chosenSkills) {
    chosenSkills = interactive
      ? await multiselect(
          removing ? 'Quais skills remover?' : 'Quais skills instalar?',
          skills.map((s) => ({ value: s.id, label: s.id, hint: short(s.description, 60), selected: true })),
        )
      : skillIds;
  }

  // 3. Escopo
  let scope = opts.global ? 'global' : opts.project ? 'project' : undefined;
  if (!scope) {
    scope = interactive
      ? await select('Onde?', [
          { value: 'project', label: 'Neste projeto', hint: display(process.cwd()) },
          { value: 'global', label: 'Global (usuário)', hint: 'disponível em todos os projetos' },
        ])
      : 'project';
  }

  // 4. Plano
  const plan = targets(chosenAgents, scope);
  console.log(`\n${c.bold(removing ? 'Será removido:' : 'Será instalado:')}`);
  for (const { dir, names } of plan) {
    console.log(`  ${c.cyan(display(dir))} ${c.dim(`(${names.join(', ')})`)}`);
    for (const id of chosenSkills) {
      const exists = fs.existsSync(path.join(dir, id));
      const tag = removing ? (exists ? '' : c.dim(' (não instalada)')) : exists ? c.yellow(' (será atualizada)') : '';
      console.log(`    • ${id}${tag}`);
    }
  }
  console.log();

  if (opts['dry-run']) return console.log(c.dim('--dry-run: nada foi alterado.'));
  if (interactive && !(await confirm('Continuar?'))) return console.log(c.dim('Cancelado.'));

  // 5. Execução
  let count = 0;
  for (const { dir } of plan) {
    for (const id of chosenSkills) {
      const dest = path.join(dir, id);
      if (removing) {
        if (!fs.existsSync(dest)) continue;
        fs.rmSync(dest, { recursive: true, force: true });
      } else {
        // Substitui por completo para não deixar arquivos obsoletos de versões anteriores.
        fs.rmSync(dest, { recursive: true, force: true });
        copyDir(path.join(SKILLS_DIR, id), dest);
      }
      count++;
      console.log(`${c.green('✔')} ${removing ? 'removida' : 'instalada'} ${c.dim(display(dest))}`);
    }
  }
  console.log(`\n${c.green(c.bold('Pronto!'))} ${count} operação(ões) concluída(s).`);
  if (!removing && count) console.log(c.dim('Reinicie o agente (ou abra uma nova sessão) para carregar as skills.\n'));
}

main().catch((err) => {
  process.stdout.write('\x1b[?25h');
  console.error(`\n${c.red('✖')} ${err.message}`);
  process.exit(1);
});
