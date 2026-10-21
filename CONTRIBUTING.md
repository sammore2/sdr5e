# Contributing to SDR5E

SDR5E is a native LoomVTT ruleset. The system behavior lives in `scripts/`, the sheets in `templates/`, the texts in `lang/` and the distributed compendiums in `packs/`.

## Local checks

Use Node.js 22.13 or later and run, from the project root:

```bash
npm test
npm run verify
```

`npm test` runs the mechanical regression tests. `npm run verify` validates JavaScript syntax, the references declared in the manifest, the language files and the SQLite integrity of the compendiums.

## Guidelines

- Exact rules and calculations belong in code or structured data; do not rely on AI during play to resolve exact mechanics.
- Visible texts must have keys in both the `en` and `pt-BR` languages.
- Preserve existing compendium IDs and data when fixing content.
- Do not declare a mechanic as automatic just because a compendium entry exists; describe whether the support is automatic, assisted or manual.
- Validate the flows in the Loom interface before claiming that a visual or mechanical change is complete.

## Compendiums and styles

The SQLite files in `packs/` are the distributed artifacts. This repository does not yet have a versioned pipeline that regenerates them from structured sources, nor an installed LESS step. Do not bulk-edit these artifacts without first establishing and verifying a reproducible source.

<details>
<summary>Português (pt-BR)</summary>

# Contribuindo com o SDR5E

SDR5E é um ruleset nativo do LoomVTT. O comportamento do sistema fica em `scripts/`, as fichas em `templates/`, os textos em `lang/` e os compêndios distribuídos em `packs/`.

## Verificações locais

Use Node.js 22.13 ou superior e execute, na raiz do projeto:

```bash
npm test
npm run verify
```

`npm test` roda as regressões mecânicas. `npm run verify` valida sintaxe JavaScript, referências declaradas no manifesto, arquivos de idioma e integridade SQLite dos compêndios.

## Diretrizes

- Regras e cálculos determinísticos pertencem ao código ou aos dados estruturados; não dependa de IA durante o jogo para resolver mecânicas exatas.
- Textos visíveis devem ter chaves nos idiomas `en` e `pt-BR`.
- Preserve IDs e dados existentes dos compêndios ao corrigir conteúdo.
- Não declare uma mecânica como automática apenas porque existe uma entrada de compêndio; descreva se o suporte é automático, assistido ou manual.
- Valide os fluxos na interface do Loom antes de afirmar que uma mudança visual ou mecânica está concluída.

## Compêndios e estilos

Os arquivos SQLite em `packs/` são os artefatos distribuídos. Este repositório ainda não possui um pipeline versionado que os regenere de fontes estruturadas, nem uma etapa LESS instalada. Não edite esses artefatos em lote sem estabelecer e verificar primeiro uma fonte reproduzível.

</details>
