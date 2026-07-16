[English](./README.md) | Português (Brasil)

# tokenscout

[![npm version](https://img.shields.io/npm/v/tokenscout.svg)](https://www.npmjs.com/package/tokenscout)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](./packages/core/package.json)

O TokenScout ajuda pequenas agências web a transformar um site de cliente sem
documentação numa baseline de redesign baseada em evidências, para definir o
escopo e começar a reconstrução sem adivinhar o que o navegador renderiza.

Quando os arquivos de design estão ausentes, desatualizados ou incompletos, a
descoberta manual cria suposições sem apoio, requisitos perdidos e retrabalho. O
TokenScout estuda o site renderizado e grava um pacote de evidências revisável:
tokens W3C DTCG, recursos, movimento, ícones, topologia, interações, screenshots,
Design DNA e saída CSS/Tailwind.

Ele registra o que o navegador apresenta. Não afirma recuperar a intenção
original do design, substituir o julgamento profissional ou gerar um design
system completo.

Três pacotes:

- **`tokenscout`** (core), zero dependências em tempo de execução. Você fornece
  as observações de estilo de uma página (cores, tamanhos de fonte, espaçamento)
  e ele retorna um documento de tokens deduplicado e estruturado. Clusterização
  de cor, detecção de escala tipográfica e de espaçamento e exportação DTCG estão
  todas implementadas e testadas.
- **`@tokenscout/extract`**, que controla um navegador headless (Playwright) para
  coletar essas observações de uma URL no ar: estilos computados em um ou mais
  breakpoints, crawling opcional de mesma origem, recursos, movimento CSS,
  stack, ícones, topologia e o modelo principal de interação. `studySite`
  grava as evidências e um brief versionado de Design DNA no disco.
- **`@tokenscout/transform`**, que renderiza um documento DTCG como propriedades
  customizadas CSS ou configuração Tailwind sem inventar papéis semânticos.

Você pode fornecer as observações, extrair um relatório de uma página no ar ou
gravar um estudo completo para um redesign. Design e status em
[ARCHITECTURE.md](./ARCHITECTURE.md) e
[ROADMAP.md](./ROADMAP.md).

## Por que agências usam o TokenScout

- **Escopo baseado em evidências.** Comece o rebuild do cliente a partir de uma
  baseline revisável, não de uma inspeção subjetiva de um site sem documentação.
- **Computado, não origem.** O que chega à tela do usuário não é o que está na
  folha de estilos. O TokenScout reduz os valores resolvidos e pintados.
- **Clusterização por percepção.** `#3a7bd5`, `#3b7cd6` e `rgb(58,123,213)` são
  três strings, mas uma só cor. O tokenscout as clusteriza em CIELAB por ΔE76,
  então uma paleta declarada extensa colapsa para o punhado de cores que o site
  realmente usa (no exemplo abaixo: 9 declaradas para 4 reais).
- **IDs de token estáveis, com pista de nome.** Os tokens de cor são chaveados por
  um hash de conteúdo do valor canônico mais o nome de cor CSS mais próximo (ex.:
  `cornflowerblue-17rhtps`), então os IDs permanecem fixos entre execuções e um
  diff de tokens reflete mudança real de paleta, não rotatividade de lista.
- **Zero dependências em tempo de execução.** A matemática de cor tem ~120 linhas
  de TypeScript puro (sRGB→Lab, ΔE76, single-linkage union-find). Sem dependências
  nativas.

## Instalação

```bash
npm install tokenscout
```

Para extração no ar e um estudo reutilizável, instale o pacote de extração e um
navegador:

```bash
npm install @tokenscout/extract playwright
npx playwright install chromium
```

Para transformar tokens DTCG em arquivos de implementação:

```bash
npm install @tokenscout/transform
```

ESM, Node 20+. O Playwright é uma peer dependency do `@tokenscout/extract`, então
o core continua sem dependências.

As versões do relançamento estão prontas neste repositório, mas a distribuição
ainda não terminou: o npm tem `tokenscout@0.3.0`; os pacotes com escopo de
extração e transformação ainda aguardam a primeira publicação. Até concluir a
Fase 7, use o checkout do workspace para o fluxo completo de três pacotes.

## Skill para agentes

O repositório inclui um [`tokenscout` skill](./skills/tokenscout/SKILL.md)
compatível com agentes para fluxos de URL para estudo, DTCG, variáveis CSS e
Tailwind. Instale diretamente do GitHub com o CLI `skills`:

```bash
npx skills add Atroci/tokenscout
```

Depois peça ao agente, por exemplo:

```text
Use $tokenscout para estudar https://example.com e produzir uma base de redesign apoiada em evidências.
```

O skill orquestra os pacotes npm; ele não inclui Chromium nem o código dos
pacotes. A extração externa depende, portanto, da publicação dos pacotes do
relançamento no npm. O skill público é a fonte canônica; não mantenha uma
implementação separada como MCP ou comando.

## Uso

### Estudar um site no ar

```ts
import { studySite } from "@tokenscout/extract";

await studySite("https://example.com", {
  outDir: "./tokenscout-study",
  breakpoints: [1440, 768, 390],
});
```

Isso grava `site-report.json`, `design-dna.json`, `design-dna.md` e evidências
em screenshots claro/escuro. O Design DNA separa observações medidas,
inferências conservadoras, incógnitas explícitas e orientações de
manter/adaptar/melhorar/não copiar. O contrato é versionado e documentado em
[`docs/design-dna-v0.1.md`](./docs/design-dna-v0.1.md).

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

Para o pacote completo de redesign em uma única chamada, use `inspectSite`:

```ts
import { inspectSite } from "@tokenscout/extract";

const report = await inspectSite("https://example.com", {
  breakpoints: [1280, 375],
  top: 5,
  sitemap: true, // descobre páginas pelo sitemap.xml em vez de seguir links
});

report.tokens; // documento DTCG (color, fontSize, spacing e um grupo duration)
report.assets; // manifesto de imagens/recursos resolvido e deduplicado
report.animations; // durações CSS (ms), easings, nomes de @keyframes
report.stack; // frameworks detectados com nível de confiança
```

### Progresso ao vivo

Inspeções longas de várias páginas podem expor atualizações estruturadas do
ciclo de vida sem alterar o resultado final da Promise nem escrever no stdout:

```ts
const report = await inspectSite("https://example.com", {
  breakpoints: [1440, 768, 390],
  onProgress(event) {
    const position =
      event.current === undefined ? "" : ` ${event.current}/${event.total}`;
    const viewport =
      event.breakpoint === undefined ? "" : ` @ ${event.breakpoint}px`;
    process.stderr.write(
      `[tokenscout] ${event.phase}.${event.status}${viewport}${position} ${JSON.stringify(event.detail ?? {})}\n`,
    );
  },
});
```

`extractSite`, `extractTokens`, `inspectSite` e `captureSite` aceitam o mesmo
listener opcional `onProgress`. Os eventos informam fases reais, estados,
contadores de página e breakpoint, tempo decorrido e contagens compactas do
resultado. Coletores desativados emitem `skipped`; falhas emitem `failed` antes
de o erro original ser relançado. Erros do listener são ignorados para que a
apresentação do progresso não interrompa uma inspeção bem-sucedida. Os listeners
são síncronos; promises retornadas não são aguardadas, embora thenables
rejeitados sejam observados para evitar rejeições não tratadas.

`inspectSite` emite progresso da leitura de estilos renderizados, mas não tira
screenshots. Somente `captureSite` emite a fase `screenshot`.

Para copiar as imagens do site para um redesign, baixe o manifesto para o disco:

```ts
import { downloadAssets } from "@tokenscout/extract";

await downloadAssets(report.assets, "./out/assets"); // grava arquivos + manifest.json
```

### Exportar para CSS ou Tailwind

```ts
import { transform } from "@tokenscout/transform";

const css = transform(report.tokens, "css-vars");
const tailwind = transform(report.tokens, "tailwind");
```

O transform para nas famílias de tokens brutas de propósito. Ele não inventa
aliases semânticos como `background`, `primary` ou `border` que as evidências
ainda não sustentam.

Os coletores individuais (`discoverAssets`, `extractAnimations`, `profilePage`,
`discoverSitemapUrls`) também são exportados, caso você queira rodá-los sobre o
seu próprio `page`.

### Experimental: movimento dirigido por JS

Best-effort, em camada de pesquisa, e fora da saída padrão do `inspectSite`:

```ts
import { detectPageMotion, captureMotion } from "@tokenscout/extract";

const libs = await detectPageMotion(page); // GSAP / Framer / AOS / Lottie ...
// captureMotion envolve Element.animate antes da navegação, então chame numa página nova:
const motion = await captureMotion(freshPage, "https://example.com");
// { count, durations (ms), easings, properties } capturados da Web Animations API
```

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
reais e emite escalas tipográficas e de espaçamento limpas. O grupo `color`
registra esse colapso como uma **métrica de sprawl** auditável nos `$extensions`
de nível de grupo (`9 analisáveis → 4 distintas = 2.25×`), e cada token de cor
tem um ID estável com pista de nome, um `$value` estruturado no padrão DTCG e
metadados em `$extensions` (como foi declarado no CSS, com que frequência foi
usado, em quais propriedades CSS pintou e os membros brutos que se agruparam
nele):

```json
{
  "color": {
    "$extensions": {
      "com.tokenscout.analyzable": 9,
      "com.tokenscout.unanalyzable": 0,
      "com.tokenscout.distinct": 4,
      "com.tokenscout.sprawl-ratio": 2.25
    },
    "cornflowerblue-17rhtps": {
      "$value": { "colorSpace": "srgb", "components": [0.22745, 0.48235, 0.83529], "alpha": 1 },
      "$type": "color",
      "$extensions": {
        "com.tokenscout.css-authored-as": "#3a7bd5",
        "com.tokenscout.usage-count": 50,
        "com.tokenscout.css-properties": ["background-color", "border-color", "color"],
        "com.tokenscout.member-count": 4,
        "com.tokenscout.members": ["#3A7BD4", "#3a7bd5", "#3b7cd6", "rgb(58, 123, 213)"]
      }
    }
    // ... white-0z2ixva, black-0ugpfk2, crimson-09p9vbj omitidos
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
- **Dar base a um rebuild com IA.** Entregue ao agente evidências medidas,
  incógnitas explícitas e limites de transferência em vez de pedir que imite um
  screenshot de memória.
- **Normalizar estilos coletados.** Transforme dumps de estilo computado do seu
  próprio crawler em um conjunto de tokens deduplicado e estruturado.

## Limitações

Honesto quanto às bordas, porque elas afetam a saída:

- **A captura de movimento via JS é experimental.** O `@tokenscout/extract` lê
  cor/tipografia/espaçamento, um manifesto de recursos (`downloadAssets` baixa
  para o disco), tokens de animação CSS e um perfil de stack técnica. Como extras
  **experimentais**, ele também faz fingerprint de bibliotecas de animação
  (`detectPageMotion`) e captura movimento da Web Animations API (`captureMotion`,
  envolvendo `Element.animate`). Esses recursos são best-effort e ficam fora da
  saída padrão do `inspectSite`. Ainda no roadmap: amostrar movimento dirigido por
  rAF que escapa da WAAPI, baixar o JSON do Lottie e gerar vídeo de referência de
  movimento.
- **Os tokens de movimento são só durações (no grupo DTCG `duration`).** Easings
  e nomes de `@keyframes` são reportados no campo `animations` do `inspectSite`,
  mas ainda não são emitidos como tokens DTCG.
- **As funções CSS Color 4 mais comuns são parseadas.** Hex, `rgb()`/`rgba()`,
  `hsl()`/`hsla()`, cores nomeadas, `oklch()`, `oklab()`, `lab()`, `lch()` e
  `hwb()` são suportadas. A forma parametrizada `color()` ainda é descartada.
- **Comprimentos são só `px` e `rem`.** `em`, `%`, `vw` e palavras-chave são
  descartados.
- **Pinturas totalmente transparentes (alpha 0) são descartadas** dos tokens de
  cor; fora isso, o alpha não faz parte da identidade do cluster, então variantes
  opacas e semitransparentes da mesma RGB ainda se fundem.
- **A clusterização de cor é single-linkage**, então encadeia transitivamente:
  ao longo de um gradiente quase contínuo a dispersão perceptual de um cluster
  pode exceder o limite. Use um limite ΔE menor se isso importar para a sua
  entrada.
- **Sem identidade por breakpoint ou por tema.** As extrações de todos os
  breakpoints são achatadas em um único conjunto de tokens, então as diferenças
  entre mobile e desktop se dissolvem, e temas claro/escuro não são capturados
  separadamente. Ambos são o próximo foco de trabalho (ver Roadmap).

## Roadmap

Formato de três pacotes: um core sem dependências, uma camada de extração com
Playwright e uma pequena camada de transformação. Detalhe completo em
[ROADMAP.md](./ROADMAP.md); design em [ARCHITECTURE.md](./ARCHITECTURE.md).

**Core (`tokenscout`, zero deps):**
- [x] Cor: parse, sRGB→Lab, ΔE76, clusterização por percepção
- [x] Testes + CI
- [x] Redutor de escala tipográfica
- [x] Redutor de escala de espaçamento
- [x] Exportação `design-tokens.json` (W3C DTCG)

**Extract (`@tokenscout/extract`, Playwright peer):**
- [x] Crawl no ar + extração de estilo computado em breakpoints
- [x] Coleta e download de imagens / recursos
- [x] Sinais de animação CSS, stack, ícones, topologia e detecção de interação
- [x] Estudo versionado de Design DNA com evidências em screenshot
- [~] Captura de movimento JavaScript (camada de pesquisa opt-in; rAF incompleto)
- [ ] Captura responsiva / multi-tela: breakpoints configuráveis, paleta dupla
      claro/escuro e identidade de token por breakpoint (atualmente achatada)

**Transform (`@tokenscout/transform`):**
- [x] Propriedades customizadas CSS
- [x] Configuração Tailwind
- [ ] Aliases semânticos e exportação `shadcn` quando houver evidência de papéis

O próximo foco é a captura responsiva multi-tela e a captura de movimento
refinada — plano em
[docs/next-steps-responsive-and-motion.md](./docs/next-steps-responsive-and-motion.md).

**Release:**
- [x] O core está no npm; o registry atualmente está atrás do GitHub
- [x] O skill público para agentes está versionado neste repositório
- [ ] Instalar/indexar o skill no skills.sh após publicar os pacotes npm com escopo
- [ ] Publicar o conjunto unificado do relançamento: `tokenscout@0.5.1`,
      `@tokenscout/extract@0.5.1` e `@tokenscout/transform@0.5.1`

## Contribuindo

Issues e PRs são bem-vindos, especialmente em ciência da cor, parsing de valores
CSS, heurísticas de escala de tokens e transferência de design baseada em
evidências. As camadas determinísticas de estudo e transformação usam a mesma
licença MIT do restante do repositório.

Veja [CONTRIBUTING.md](./CONTRIBUTING.md) para o ciclo de desenvolvimento e a
regra de zero dependências em tempo de execução, e o
[Código de Conduta](./CODE_OF_CONDUCT.md) antes de participar. As mudanças são
registradas em [CHANGELOG.md](./CHANGELOG.md).

## Licença

[MIT](./LICENSE) © Hugo Carvalho
