[English](./README.md) | Português (Brasil)

# tokenscout

[![npm version](https://img.shields.io/npm/v/tokenscout.svg)](https://www.npmjs.com/package/tokenscout)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](./package.json)

Extraia **design tokens de um site renderizado e no ar** — não de um arquivo
CSS, não de uma exportação do Figma, mas de uma página real, do jeito que o
navegador de fato a pinta.

A maioria das ferramentas de design token parte do CSS de origem ou de um
arquivo de design. O tokenscout parte do resultado renderizado: ele lê os
estilos computados das páginas no ar e os reduz a um conjunto limpo de tokens —
uma paleta de cores deduplicada por percepção, uma escala tipográfica e uma
escala de espaçamento.

**O épico:** aponte o tokenscout para uma URL no ar e receba de volta um
conjunto de design tokens fiel e reutilizável — paleta, escala tipográfica,
escala de espaçamento **e movimento** — além dos recursos de imagem do site,
prontos para iniciar um redesign. Independente de origem: ele lê o que o
navegador realmente pinta, então funciona em qualquer stack, framework ou sem
framework nenhum.

> Status: **v0.1.0 — open core.** Já entregue: a camada de **cor** sem
> dependências (parse · sRGB→Lab · ΔE76 · clusterização por percepção),
> totalmente testada. A seguir: a camada de **extração** de sites no ar
> (estilos computados, coleta de recursos, captura de animação) e os redutores
> de tipo/espaçamento. Veja [ROADMAP.md](./ROADMAP.md) e
> [ARCHITECTURE.md](./ARCHITECTURE.md).

## Por quê

- **No ar, não na origem.** O que chega à tela do usuário ≠ o que está na
  folha de estilos (cascatas, sobrescritas, widgets de terceiros, temas em
  tempo de execução).
- **Por percepção, não por sintaxe.** `#3a7bd5`, `#3b7cd6` e
  `rgb(58,123,213)` são três strings, mas uma só cor. O tokenscout as
  clusteriza em **CIELAB** por **ΔE76**, então "47 cores declaradas → 9 cores
  reais" cai no colo de graça.
- **Zero dependências em tempo de execução.** A matemática de cor tem ~120
  linhas de TypeScript puro (sRGB→Lab, ΔE76, single-linkage union-find). Sem
  dependências nativas.

## Instalação

```bash
npm install tokenscout   # após publicação no npm
```

## Uso

```ts
import { parseColor, clusterColors } from "tokenscout/color";

const declared = [
  { value: "#3a7bd5", count: 40 },
  { value: "#3b7cd6", count: 5 },
  { value: "rgb(58, 123, 213)", count: 2 },
  { value: "#e23744", count: 12 },
];

const colors = declared
  .map((c) => {
    const p = parseColor(c.value);
    return p ? { value: c.value, rgb: p.rgb, count: c.count } : null;
  })
  .filter((c) => c !== null);

const clusters = clusterColors(colors); // ΔE76 ≤ 2.5 por padrão
// → 2 clusters: um azul (3 membros, canônico "#3a7bd5"), um vermelho.
```

Os blocos de construção de nível mais baixo (`rgbToLab`, `deltaE76`) também são
exportados.

## Roadmap

Formato de dois pacotes — um **core** sem dependências (matemática pura de
tokens) e um pacote **extract** que controla um navegador headless. Detalhe
completo em [ROADMAP.md](./ROADMAP.md); design em
[ARCHITECTURE.md](./ARCHITECTURE.md).

**Core (`tokenscout`, zero deps):**
- [x] Cor — parse, sRGB→Lab, ΔE76, clusterização por percepção
- [x] Testes + CI
- [x] Redutor de escala tipográfica
- [x] Redutor de escala de espaçamento
- [x] Exportação `design-tokens.json` (W3C DTCG)

**Extract (`@tokenscout/extract`, Playwright peer):**
- [ ] Crawl no ar + extração de estilo computado em breakpoints
- [ ] Coleta de imagem / recursos (manifesto + arquivos, para migração de
      redesign)
- [ ] Captura de animação — tokens de `@keyframes`/transition CSS + download de
      Lottie + detecção de biblioteca + vídeo de referência de movimento, até
      instrumentação WAAPI/rAF em tempo de execução de movimento dirigido por
      JS (camada de pesquisa)

**Release:**
- [ ] Publicar o core no npm (`0.1.x`)

## Contribuindo

Issues e PRs são bem-vindos — especialmente em torno de ciência da cor, parsing
de valores CSS e heurísticas de escala de tokens. Este é um projeto open-core;
as camadas de síntese e relatório sobre ele são separadas.

Veja [CONTRIBUTING.md](./CONTRIBUTING.md) para o ciclo de desenvolvimento e a
regra de zero dependências em tempo de execução, e o
[Código de Conduta](./CODE_OF_CONDUCT.md) antes de participar. As mudanças são
registradas em [CHANGELOG.md](./CHANGELOG.md).

## Licença

[MIT](./LICENSE) © Hugo Carvalho
