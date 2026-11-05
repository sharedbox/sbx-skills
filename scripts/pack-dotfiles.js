#!/usr/bin/env node
// O npm nunca inclui arquivos ".gitignore" no pacote publicado (e os usa como regra de exclusão).
// "prepack" renomeia para ".gitignore.sbx-pack"; "postpack" restaura. O instalador reverte na cópia.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILLS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'skills');
const [FROM, TO] = process.argv[2] === 'restore'
  ? ['.gitignore.sbx-pack', '.gitignore']
  : ['.gitignore', '.gitignore.sbx-pack'];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (entry.name === FROM) fs.renameSync(p, path.join(dir, TO));
  }
}
walk(SKILLS);
