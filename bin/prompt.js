import readline from 'node:readline';

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[22m`,
  bold: (s) => `\x1b[1m${s}\x1b[22m`,
  cyan: (s) => `\x1b[36m${s}\x1b[39m`,
  green: (s) => `\x1b[32m${s}\x1b[39m`,
  yellow: (s) => `\x1b[33m${s}\x1b[39m`,
  red: (s) => `\x1b[31m${s}\x1b[39m`,
};
export { c as colors };

/** Lê teclas em modo raw e chama onKey(str, key) até que ele devolva um valor diferente de undefined. */
function withKeys(onKey) {
  return new Promise((resolve, reject) => {
    const { stdin } = process;
    readline.emitKeypressEvents(stdin);
    stdin.setRawMode(true);
    stdin.resume();
    process.stdout.write('\x1b[?25l'); // esconde cursor
    const done = (fn, v) => {
      stdin.off('keypress', handler);
      stdin.setRawMode(false);
      stdin.pause();
      process.stdout.write('\x1b[?25h');
      fn(v);
    };
    const handler = (str, key = {}) => {
      if (key.ctrl && key.name === 'c') return done(reject, new Error('Cancelado.'));
      const result = onKey(str, key);
      if (result !== undefined) done(resolve, result);
    };
    stdin.on('keypress', handler);
  });
}

function makeRenderer() {
  let lines = 0;
  return (text) => {
    if (lines) process.stdout.write(`\x1b[${lines}F\x1b[0J`);
    process.stdout.write(text + '\n');
    lines = text.split('\n').length;
  };
}

/**
 * Menu de múltipla escolha. options: [{ value, label, hint?, selected? }]
 * ↑/↓ navega, espaço marca, "a" marca/desmarca todos, enter confirma.
 */
export async function multiselect(message, options, { min = 1 } = {}) {
  const selected = options.map((o) => Boolean(o.selected));
  let cursor = 0;
  let error = '';
  const render = makeRenderer();
  const draw = () => {
    const rows = options.map((o, i) => {
      const box = selected[i] ? c.green('◉') : c.dim('◯');
      const ptr = i === cursor ? c.cyan('❯') : ' ';
      const label = i === cursor ? c.cyan(o.label) : o.label;
      return `${ptr} ${box} ${label}${o.hint ? ' ' + c.dim(o.hint) : ''}`;
    });
    render(
      [
        `${c.bold('?')} ${c.bold(message)} ${c.dim('(↑/↓ navegar · espaço marcar · a todos · enter confirmar)')}`,
        ...rows,
        error ? c.red(error) : '',
      ].join('\n'),
    );
  };
  draw();
  return withKeys((_, key) => {
    error = '';
    if (key.name === 'up' || key.name === 'k') cursor = (cursor - 1 + options.length) % options.length;
    else if (key.name === 'down' || key.name === 'j') cursor = (cursor + 1) % options.length;
    else if (key.name === 'space') selected[cursor] = !selected[cursor];
    else if (key.name === 'a') {
      const all = selected.every(Boolean);
      selected.fill(!all);
    } else if (key.name === 'return') {
      const values = options.filter((_, i) => selected[i]).map((o) => o.value);
      if (values.length >= min) {
        render(`${c.green('✔')} ${c.bold(message)} ${c.dim(options.filter((_, i) => selected[i]).map((o) => o.label).join(', '))}`);
        return values;
      }
      error = `Selecione pelo menos ${min} opção.`;
    }
    draw();
    return undefined;
  });
}

/** Menu de escolha única. options: [{ value, label, hint? }] */
export async function select(message, options, initial = 0) {
  let cursor = initial;
  const render = makeRenderer();
  const draw = () => {
    const rows = options.map((o, i) => {
      const ptr = i === cursor ? c.cyan('❯') : ' ';
      const label = i === cursor ? c.cyan(o.label) : o.label;
      return `${ptr} ${label}${o.hint ? ' ' + c.dim(o.hint) : ''}`;
    });
    render([`${c.bold('?')} ${c.bold(message)} ${c.dim('(↑/↓ · enter)')}`, ...rows].join('\n'));
  };
  draw();
  return withKeys((_, key) => {
    if (key.name === 'up' || key.name === 'k') cursor = (cursor - 1 + options.length) % options.length;
    else if (key.name === 'down' || key.name === 'j') cursor = (cursor + 1) % options.length;
    else if (key.name === 'return') {
      render(`${c.green('✔')} ${c.bold(message)} ${c.dim(options[cursor].label)}`);
      return options[cursor].value;
    }
    draw();
    return undefined;
  });
}

/** Pergunta sim/não. */
export async function confirm(message, initial = true) {
  process.stdout.write(`${c.bold('?')} ${c.bold(message)} ${c.dim(initial ? '(S/n)' : '(s/N)')} `);
  return withKeys((str, key) => {
    let v;
    if (key.name === 'return') v = initial;
    else if (/^[sy]$/i.test(str || '')) v = true;
    else if (/^n$/i.test(str || '')) v = false;
    if (v !== undefined) process.stdout.write((v ? c.green('sim') : c.yellow('não')) + '\n');
    return v;
  });
}
