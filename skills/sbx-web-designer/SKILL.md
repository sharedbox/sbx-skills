---
name: sbx-web-designer
description: Designer gráfico de UI que cria componentes em HTML/CSS, React Native ou Next.js e documenta cada um em um arquivo .md no padrão Docusaurus, com preview visual (imagem PNG e preview interativo) gerado a partir do código real. Use sempre que o usuário pedir para criar, desenhar, redesenhar ou documentar um componente, elemento de interface, tela, design system ou biblioteca de UI — botão, card, input, modal, navbar, badge, etc. — mesmo que ele não fale "Docusaurus" ou "documentação".
---

# Designer gráfico — componentes + documentação Docusaurus

Você atua como designer de interface que também entrega código. Cada pedido gera **três coisas**:

1. **O componente** na plataforma pedida (HTML/CSS, React Native ou Next.js).
2. **Um preview visual** renderizado a partir desse código: um PNG para a doc e um HTML interativo.
3. **Um arquivo `.md` no padrão Docusaurus** documentando o componente, com o preview embutido.

O preview existe porque quem lê a documentação precisa *ver* o componente antes de ler props. Por isso ele é gerado do código de verdade — nunca desenhe uma imagem "parecida" à mão, porque ela sai de sincronia com o componente.

## 1. Entender o pedido

Antes de desenhar, descubra (pelo pedido, pelo projeto aberto ou perguntando uma única vez se for realmente ambíguo):

- **Plataforma**: `html`, `react-native` ou `nextjs`. Se o usuário estiver dentro de um projeto, olhe o `package.json` (`next`, `react-native`/`expo`) e siga o que já existe.
- **Design system existente**: procure tokens (cores, fontes, espaçamentos) em `tailwind.config.*`, `theme.ts`, `tokens.*`, variáveis CSS (`:root { --... }`). Reutilize-os — um componente novo que ignora os tokens do projeto parece de outro produto.
- **Onde fica a doc**: se existir uma pasta `docs/` de Docusaurus (há `docusaurus.config.*`), escreva nela, normalmente em `docs/componentes/`. Senão, crie `docs/componentes/` na raiz do trabalho.

Se nada disso existir, defaults sensatos: projeto novo, tokens próprios declarados no topo do componente, doc em `docs/componentes/`.

## 2. Desenhar o componente

Pense como designer antes de codar: hierarquia visual, contraste, espaçamento consistente (escala de 4/8px), estados e acessibilidade.

Todo componente cobre, quando fizer sentido:
- **Variantes** (ex.: primary/secondary/ghost; sm/md/lg).
- **Estados**: padrão, hover/pressed, focus visível, disabled, loading, erro.
- **Acessibilidade**: contraste AA (4.5:1 para texto), alvo de toque ≥ 44px no mobile, `aria-*`/`accessibilityRole` e `accessibilityLabel`, foco por teclado na web.
- **Tema escuro** se o projeto tiver.

Convenções por plataforma:

| Plataforma | Arquivo | Estilo | Observações |
|---|---|---|---|
| HTML | `Nome.html` (+ `nome.css` se grande) | CSS com variáveis em `:root` | Semântica correta (`<button>`, `<label>`); sem dependências externas |
| React Native | `Nome.tsx` | `StyleSheet.create` | Use só primitivas do `react-native` (`View`, `Text`, `Pressable`, `Image`, `TextInput`); `Pressable` com `style={({pressed}) => ...}` para estado pressionado |
| Next.js | `Nome.tsx` | CSS Modules, Tailwind (se o projeto usar) ou estilo inline | `"use client"` só se tiver estado/eventos; `next/link` e `next/image` quando cabível |

Exporte o componente nomeado (`export function Botao`) e tipe as props com TypeScript. Comentários curtos explicando decisões de design não óbvias ajudam quem mantém.

## 3. Gerar o preview visual

### 3.1 Arquivo de vitrine

Crie um arquivo de vitrine que mostra as variantes e estados lado a lado — é ele que vira a imagem:

- **React Native / Next.js**: `Nome.preview.tsx` que importa o componente e faz `export default function Preview()` renderizando as variantes (ex.: uma linha de botões primary/secondary/disabled, com rótulos pequenos acima de cada grupo se ajudar).
- **HTML**: o próprio `Nome.html` serve. Envolva a área a fotografar em um elemento com o atributo `data-preview` para o recorte ficar justo.

Mantenha a vitrine compacta (até ~900px de largura). Se houver muitas variantes, gere mais de uma imagem (ex.: `botao-variantes.png`, `botao-tamanhos.png`).

### 3.2 Renderizar

Use o script abaixo. Ele empacota a vitrine com esbuild (React Native vira web via `react-native-web`; `next/link`, `next/image` e `next/font/google` recebem stubs leves), abre no Chromium e salva:
- `<saida>.png` — imagem 2x recortada no conteúdo, para a doc;
- `<saida>.html` — página autocontida, para o preview interativo.

**Preparar uma vez** em uma pasta de ferramentas fora do projeto do usuário (ex.: `/tmp/preview-tools` ou o scratchpad), para não poluir o `package.json` dele:

```bash
mkdir -p /tmp/preview-tools && cd /tmp/preview-tools
npm init -y >/dev/null
npm i esbuild react@18.3.1 react-dom@18.3.1 react-native-web@0.19.13
# Playwright: reutilize o já instalado se houver (NODE_PATH=$(npm root -g) ou o caminho dele);
# só instale se não existir: npm i playwright && npx playwright install chromium
```

Salve o script como `/tmp/preview-tools/render-preview.mjs`:

```js
// render-preview.mjs — gera preview HTML + PNG de um componente
// Uso: node render-preview.mjs <entrada> <saida-sem-extensao> [--width 900] [--dark]
// <entrada>: .html (screenshot direto) ou .jsx/.tsx com `export default` de uma vitrine.
import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const [, , input, out, ...rest] = process.argv;
if (!input || !out) { console.error("uso: node render-preview.mjs <entrada> <saida> [--width N] [--dark]"); process.exit(1); }
const width = Number(rest[rest.indexOf("--width") + 1]) || 900;
const dark = rest.includes("--dark");
const require = createRequire(import.meta.url);
const { chromium } = require("playwright"); // require respeita NODE_PATH (Playwright global)
fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });

let html;
if (input.endsWith(".html")) {
  html = fs.readFileSync(input, "utf8");
} else {
  const stubDir = fs.mkdtempSync(path.join(path.dirname(path.resolve(out)), ".stubs-"));
  fs.writeFileSync(path.join(stubDir, "link.jsx"), `export default function Link({href,children,...p}){return <a href={typeof href==="string"?href:"#"} {...p}>{children}</a>}`);
  fs.writeFileSync(path.join(stubDir, "image.jsx"), `export default function Image({src,alt,width,height,fill,priority,...p}){return <img src={typeof src==="string"?src:src?.src} alt={alt} width={width} height={height} style={fill?{width:"100%",height:"100%",objectFit:"cover"}:undefined} {...p}/>}`);
  fs.writeFileSync(path.join(stubDir, "font.js"), `const f=()=>({className:"",style:{fontFamily:"inherit"},variable:""});export const Inter=f,Roboto=f,Poppins=f;export default f;`);
  const entry = path.join(stubDir, "entry.jsx");
  fs.writeFileSync(entry, `import React from "react";import {createRoot} from "react-dom/client";import Preview from ${JSON.stringify(path.resolve(input))};createRoot(document.getElementById("root")).render(<Preview/>);`);
  const res = await build({
    entryPoints: [entry], bundle: true, write: false, format: "iife", jsx: "automatic",
    loader: { ".js": "jsx", ".png": "dataurl", ".jpg": "dataurl", ".svg": "dataurl" },
    define: { "process.env.NODE_ENV": '"production"', __DEV__: "false" },
    resolveExtensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".jsx", ".js"],
    alias: {
      "react-native": require.resolve("react-native-web"),
      "next/link": path.join(stubDir, "link.jsx"),
      "next/image": path.join(stubDir, "image.jsx"),
      "next/font/google": path.join(stubDir, "font.js"),
    },
    nodePaths: [path.join(path.dirname(require.resolve("react/package.json")), "..")],
    logLevel: "error",
  });
  fs.rmSync(stubDir, { recursive: true, force: true });
  const cssFile = input.replace(/\.(t|j)sx?$/, ".css");
  const css = fs.existsSync(cssFile) ? fs.readFileSync(cssFile, "utf8") : "";
  html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;padding:24px;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:${dark ? "#1b1b1d" : "#fff"};color:${dark ? "#e3e3e3" : "#1c1e21"}}#root{display:inline-block}${css}</style>
</head><body><div id="root"></div><script>${res.outputFiles[0].text}</script></body></html>`;
}

fs.writeFileSync(out + ".html", html);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width, height: 200 }, deviceScaleFactor: 2, colorScheme: dark ? "dark" : "light" });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.setContent(html, { waitUntil: "networkidle" });
await page.waitForTimeout(300);
const el = (await page.$("[data-preview]")) || (await page.$("#root")) || (await page.$("body"));
const b = await el.boundingBox();
const pad = 24;
await page.screenshot({ path: out + ".png", fullPage: true,
  clip: { x: Math.max(0, b.x - pad), y: Math.max(0, b.y - pad), width: b.width + pad * 2, height: b.height + pad * 2 } });
await browser.close();
if (errors.length) { console.error("Erros no preview:\n" + errors.join("\n")); process.exit(2); }
console.log(`ok: ${out}.png e ${out}.html`);
```

Rodar (a partir da pasta de ferramentas, para achar as dependências):

```bash
cd /tmp/preview-tools
node render-preview.mjs /caminho/Botao.preview.tsx /caminho/docs/componentes/img/botao
node render-preview.mjs /caminho/Botao.preview.tsx /caminho/docs/componentes/img/botao-dark --dark   # se houver tema escuro
node render-preview.mjs /caminho/Badge.html /caminho/docs/componentes/img/badge --width 600
```

Se o componente depende de pacotes do projeto do usuário (ícones, libs de UI), instale-os também na pasta de ferramentas ou aponte o `NODE_PATH` para o `node_modules` do projeto.

### 3.3 Conferir

**Abra o PNG gerado e olhe** (Read na imagem) antes de escrever a doc. Confira: nada cortado, texto legível, variantes visíveis, cores certas, sem tela branca. Se o script sair com código 2, há erro de runtime no componente — corrija o componente, não o preview. Se algo ficou feio, ajuste o design e renderize de novo; esse é o momento de agir como designer.

Copie o `<saida>.html` para `static/previews/` do Docusaurus (se existir) para o preview interativo.

## 4. Escrever a documentação Docusaurus

Um arquivo por componente: `docs/componentes/<nome-em-kebab>.md`, com as imagens em `docs/componentes/img/`.

No Docusaurus v3 os arquivos `.md` são compilados como MDX por padrão, então `import` e componentes como `<Tabs>` funcionam. Se o `docusaurus.config` usar `markdown: { format: 'detect' }`, use extensão `.mdx` para manter os imports funcionando.

Siga esta estrutura (adapte seções que não se aplicam — um ícone não precisa de "Estados"):

````md
---
id: botao
title: Botão
sidebar_label: Botão
sidebar_position: 1
description: Botão de ação com variantes primary, secondary e ghost.
tags: [componentes, formulários, react-native]
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Botão

Uma ou duas frases: o que é e quando usar.

## Preview

![Botão — variantes primary, secondary e disabled](./img/botao.png)

<details>
  <summary>Preview interativo</summary>
  <iframe src="/previews/botao.html" title="Preview interativo do Botão" style={{width: '100%', height: 160, border: '1px solid var(--ifm-color-emphasis-300)', borderRadius: 8}} />
</details>

:::info Plataforma
React Native · `src/components/Botao.tsx`
:::

## Uso

```tsx title="Exemplo"
import { Botao } from '@/components/Botao';

<Botao label="Salvar" variant="primary" onPress={salvar} />
```

## Props

| Prop | Tipo | Padrão | Descrição |
|---|---|---|---|
| `label` | `string` | — | Texto do botão (obrigatório) |
| `variant` | `'primary' \| 'secondary' \| 'ghost'` | `'primary'` | Estilo visual |
| `disabled` | `boolean` | `false` | Desativa interação e reduz opacidade |

## Variantes

Uma linha por variante explicando **quando** usar cada uma (não só como ela é).

## Estados

Padrão, pressionado/hover, foco, desabilitado, carregando — com o comportamento de cada um.

## Tokens de design

| Token | Valor | Uso |
|---|---|---|
| `color.primary` | `#2563EB` | Fundo do primary |
| `radius.md` | `10px` | Cantos |
| `space.3` / `space.5` | `12px` / `20px` | Padding vertical / horizontal |

## Acessibilidade

- Contraste do texto: 4.8:1 (AA).
- `accessibilityRole="button"` e `accessibilityState={{ disabled }}`.
- Área de toque ≥ 44×44.

## Boas práticas

:::tip Faça
Use um único botão primary por tela.
:::

:::danger Evite
Rótulos genéricos como "Clique aqui".
:::

## Código-fonte

<Tabs>
  <TabItem value="componente" label="Botao.tsx" default>

```tsx
// código completo do componente
```

  </TabItem>
  <TabItem value="preview" label="Botao.preview.tsx">

```tsx
// vitrine usada no preview
```

  </TabItem>
</Tabs>
````

Detalhes que importam:
- **A imagem do preview vem logo após a introdução** — é a primeira coisa que o leitor quer ver. O texto alternativo descreve o que aparece na imagem.
- O `iframe` aponta para `static/previews/<nome>.html`. Se o `baseUrl` do site não for `/`, prefixe o caminho com ele. Se não houver pasta `static/`, omita o bloco `<details>` e mantenha só o PNG.
- Com tema escuro, mostre as duas imagens lado a lado ou use `![](./img/botao.png#gh-light-mode-only)` só se o site tiver esse suporte; na dúvida, duas imagens com legenda.
- A tabela de props deve bater exatamente com a interface TypeScript do componente — copie dela, não invente.
- No MDX, `style` em JSX é objeto (`style={{...}}`) e `|` dentro de tabelas precisa ser escapado (`\|`).
- Se for o primeiro componente da pasta, crie também `docs/componentes/_category_.json`:
  ```json
  { "label": "Componentes", "position": 2, "link": { "type": "generated-index", "description": "Biblioteca de componentes do design system." } }
  ```

## 5. Entrega

Arquivos resultantes (exemplo para um botão):

```
src/components/Botao.tsx              ← componente
src/components/Botao.preview.tsx      ← vitrine
docs/componentes/botao.md             ← documentação Docusaurus
docs/componentes/img/botao.png        ← preview estático
static/previews/botao.html            ← preview interativo (se houver static/)
```

Ao terminar, mostre ao usuário a imagem do preview (envie o PNG) e o `.md`, e diga em uma linha onde cada arquivo ficou. Se ele pedir vários componentes, repita o fluxo para cada um e, no final, ofereça uma página `docs/componentes/visao-geral.md` com uma grade de todas as imagens linkando para cada doc.
