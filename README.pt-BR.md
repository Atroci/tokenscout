[English](./README.md) | Português (Brasil)

# tokenscout

[![npm version](https://img.shields.io/npm/v/tokenscout.svg)](https://www.npmjs.com/package/tokenscout)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](./package.json)

Reduz os estilos reais e renderizados de um site a um conjunto limpo de design
tokens: uma paleta de cores deduplicada por percepção, uma escala tipográfica e
uma escala de espaçamento, exportadas como um `design-tokens.json` no padrão W3C
DTCG.

A maioria das ferramentas de design token parte do CSS de origem ou de um
arquivo de design. O tokenscout trabalha sobre os estilos computados, os valores
que o navegador de fato pinta, então cascatas, sobrescritas, widgets de
terceiros e temas em tempo de execução já estão todos resolvidos.

Dois pacotes:

- **`tokenscout`** (core), zero dependências em tempo de execução. Você fornece
  as observações de estilo de uma página (cores, tamanhos de fonte, espaçamento)
  e ele retorna um documento de tokens deduplicado e estruturado. Clusterização
  de cor, detecção de escala tipográfica e de espaçamento e exportação DTCG estão
  todas implementadas e testadas.
- **`@tokenscout/extract`**, que controla um navegador headless (Playwright) para
  coletar essas observações de uma URL no ar: estilos computados em um ou mais
  breakpoints, com crawling opcional de mesma origem. Coleta de imagens e captura
  de animação ainda estão no roadmap.

Ou seja, você pode fornecer as observações por conta própria (seu próprio
crawler, ou na mão) ou deixar o `@tokenscout/extract` lê-las de uma página no
ar. Design e status em [ARCHITECTURE.md](./ARCHITECTURE.md) e
[ROADMAP.md](./ROADMAP.md).

## Por quê

- **Computado, não origem.** O que chega à tela do usuário não é o que está na
  folha de estilos. O tokenscout reduz os valores resolvidos e pintados.
- **Clusterização por percepção.** `#3a7bd5`, `#3b7cd6` e `rgb(58,123,213)` são
  três strings, mas uma só cor. O tokenscout as clusteriza em CIELAB por ΔE76,
  então uma paleta declarada extensa colapsa para o punhado de cores que o site
  realmente usa (no exemplo abaixo: 9 declaradas para 4 reais).
- **Zero dependências em tempo de execução.** A matemática de cor tem ~120 linhas
  de TypeScript puro (sRGB→Lab, ΔE76, single-linkage union-find). Sem dependências
  nativas.

## Instalação

```bash
npm install tokenscout
```

Para extração no ar, instale também o pacote de extração e um navegador:

```bash
npm install @tokenscout/extract playwright
npx playwright install chromium
```

ESM, Node 20+. O Playwright é uma peer dependency do `@tokenscout/extract`, então
o core continua sem dependências.

## Uso

### A partir de uma URL no ar

```ts
import { extractTokens } from "@tokenscout/extract";

// Faz o crawl + lê os estilos computados e reduz a um documento DTCG.
const tokens = await extractTokens("https://example.com", {
  breakpoints: [1280, 375],
  top: 1, // páginas de mesma origem a percorrer a partir da URL inicial
});
```

`extractSite(url, opts)` também é exportado, caso você queira o `PageExtract[]`
bruto antes da redução.

### A partir de observações que você já tem

Forneça as observações da página e receba de volta um documento de tokens DTCG:

```ts
import { assembleTokens } from "tokenscout/tokens";
import type { PageExtract } from "tokenscout/schema";

const pages: PageExtract[] = [
  {
    url: "https://example.com/",
    breakpoint: 1280,
    colors: [
      { value: "#3a7bd5", role: "background-color", count: 40 },
      { value: "#3b7cd6", role: "color", count: 5 },
      { value: "rgb(58, 123, 213)", role: "border-color", count: 2 },
      { value: "#e23744", role: "color", count: 12 },
    ],
    type: { sizes: ["16px", "20px", "25px", "31.25px"] },
    spacing: { values: ["8px", "16px", "24px", "32px"] },
  },
];

const tokens = assembleTokens(pages); // { color, fontSize, spacing }, no formato DTCG
```

A versão completa e executável está em
[`packages/core/examples/quickstart.ts`](./packages/core/examples/quickstart.ts)
(`npx tsx packages/core/examples/quickstart.ts`), e a saída está versionada em
[`packages/core/examples/design-tokens.json`](./packages/core/examples/design-tokens.json).

Só precisa da matemática de cor? Importe direto:

```ts
import { parseColor, clusterColors } from "tokenscout/color";

const colors = ["#3a7bd5", "#3b7cd6", "rgb(58, 123, 213)", "#e23744"]
  .map((value) => {
    const p = parseColor(value);
    return p ? { value, rgb: p.rgb } : null;
  })
  .filter((c) => c !== null);

const clusters = clusterColors(colors); // ΔE76 ≤ 2.5 por padrão
// 2 clusters: um azul (3 membros, canônico "#3a7bd5"), um vermelho.
```

Os blocos de construção de nível mais baixo (`rgbToLab`, `deltaE76`) também são
exportados.

## Resultados

O exemplo acima, passado por `assembleTokens`, colapsa 9 cores declaradas em 4
reais e emite escalas tipográficas e de espaçamento limpas:

```json
{
  "color": {
    "color-1": { "$value": "#ffffff", "$type": "color" },
    "color-2": { "$value": "#111827", "$type": "color" },
    "color-3": { "$value": "#3a7bd5", "$type": "color" },
    "color-4": { "$value": "#e23744", "$type": "color" }
  },
  "fontSize": {
    "font-size-1": { "$value": { "value": 16, "unit": "px" }, "$type": "dimension" },
    "font-size-2": { "$value": { "value": 20, "unit": "px" }, "$type": "dimension" }
  }
}
```

Documento completo: [`packages/core/examples/design-tokens.json`](./packages/core/examples/design-tokens.json).

## Casos de uso

- **Redesign a partir da verdade.** Capture a paleta e as escalas reais de um
  site existente para que a reconstrução parta do que os usuários realmente veem,
  não de um chute.
- **Auditar o drift de um design system.** Mostre quantas cores quase duplicadas
  e quantos valores de espaçamento fora da grade um site no ar acumulou em
  relação à escala pretendida.
- **Semear um `design-tokens.json`.** Tenha um ponto de partida W3C DTCG para o
  Style Dictionary ou qualquer ferramenta que entenda DTCG.
- **Normalizar estilos coletados.** Transforme dumps de estilo computado do seu
  próprio crawler em um conjunto de tokens deduplicado e estruturado.

## Limitações

Honesto quanto às bordas, porque elas afetam a saída:

- **A extração é só de estilos computados, por enquanto.** O `@tokenscout/extract`
  lê cor, tipografia e espaçamento em breakpoints com crawling opcional de mesma
  origem. Coleta de imagens e captura de animação ainda estão no roadmap.
- **A entrada de cor é hex e `rgb()`/`rgba()`.** `hsl()`, `oklch()`, cores
  nomeadas e `color()` ainda não são parseadas e são descartadas.
- **Comprimentos são só `px` e `rem`.** `em`, `%`, `vw` e palavras-chave são
  descartados.
- **Pinturas totalmente transparentes (alpha 0) são descartadas** dos tokens de
  cor; fora isso, o alpha não faz parte da identidade do cluster, então variantes
  opacas e semitransparentes da mesma RGB ainda se fundem.
- **A clusterização de cor é single-linkage**, então encadeia transitivamente:
  ao longo de um gradiente quase contínuo a dispersão perceptual de um cluster
  pode exceder o limite. Use um limite ΔE menor se isso importar para a sua
  entrada.

## Roadmap

Formato de dois pacotes: um core sem dependências (matemática pura de tokens) e
um pacote de extração que controla um navegador headless. Detalhe completo em
[ROADMAP.md](./ROADMAP.md); design em [ARCHITECTURE.md](./ARCHITECTURE.md).

**Core (`tokenscout`, zero deps):**
- [x] Cor: parse, sRGB→Lab, ΔE76, clusterização por percepção
- [x] Testes + CI
- [x] Redutor de escala tipográfica
- [x] Redutor de escala de espaçamento
- [x] Exportação `design-tokens.json` (W3C DTCG)

**Extract (`@tokenscout/extract`, Playwright peer):**
- [x] Crawl no ar + extração de estilo computado em breakpoints
- [ ] Coleta de imagem / recursos (manifesto + arquivos, para migração de redesign)
- [ ] Captura de animação: tokens de `@keyframes`/transition CSS + download de
      Lottie + detecção de biblioteca + vídeo de referência de movimento, até
      instrumentação WAAPI/rAF em tempo de execução de movimento dirigido por JS
      (camada de pesquisa)

**Release:**
- [ ] Publicar o core no npm (`0.1.x`)

## Contribuindo

Issues e PRs são bem-vindos, especialmente em torno de ciência da cor, parsing de
valores CSS e heurísticas de escala de tokens. Este é um projeto open-core; as
camadas de síntese e relatório sobre ele são separadas.

Veja [CONTRIBUTING.md](./CONTRIBUTING.md) para o ciclo de desenvolvimento e a
regra de zero dependências em tempo de execução, e o
[Código de Conduta](./CODE_OF_CONDUCT.md) antes de participar. As mudanças são
registradas em [CHANGELOG.md](./CHANGELOG.md).

## Licença

[MIT](./LICENSE) © Hugo Carvalho
