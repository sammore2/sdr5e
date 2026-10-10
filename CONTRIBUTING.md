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
