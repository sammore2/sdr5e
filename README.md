<div align="center">
  <img src="assets/ui/readme-banner.png" alt="SDR5E Banner" width="100%">
</div>

# SDR5E

A visceral, fantasy tabletop roleplaying system built on the mathematical foundation of the SRD.
Native ruleset for **LoomVTT** (no VTT legado runtime dependency).

## 🌒 Overview

**SDR5E** is designed to provide a high-stakes, atmospheric experience. It blends classic d20 mechanics with modern design principles and a unique aesthetic.

### Key Features:

- **SRD 5.2.1 content foundation**: Rules content is being aligned with the stated SRD version; see the coverage and limitations below before treating the ruleset as complete.

## ⚙️ Installation

To install SDR5E in LoomVTT, drop this ruleset in `marketplace/rulesets/` (or symlink
it there via a junction, see `.claude`/`.agents` skills for the pattern used by other
Loom rulesets).

> The VTT legado VTT install steps below applied to the pre-conversion version and are kept
> only for historical reference while the port is in progress.

<details>
<summary>Legacy VTT legado VTT installation (pre-conversion)</summary>

1. Open the VTT legado VTT Setup menu.
2. Go to the **Game Systems** tab.
3. Click **Install System**.
4. Use the **Manifest URL** provided in your private repository release.

</details>

## 🛠️ Development

Para desenvolvedores trabalhando no sistema:

| Comando             | Função                                                       |
| :------------------ | :------------------------------------------------------------- |
| `npm test` | Executa as regressões determinísticas do ruleset. |
| `npm run verify` | Verifica sintaxe JS, referências do manifesto, idiomas e integridade dos compêndios SQLite. |

O repositório não contém atualmente uma fonte versionada de packs em JSON nem um pipeline de compilação LESS/SQLite. Por isso, estes comandos validam os artefatos presentes; não recompilam nem publicam pacotes.

### Cobertura e limitações

SDR5E ainda está em implementação. A progressão, parte dos recursos e os descansos possuem cobertura automatizada, mas criação em nível alto, várias features, atividades, magias, permissões e fluxos completos de encontro ainda exigem implementação e validação no Loom. Presença de uma entrada no compêndio não significa que seu efeito seja automatizado.

---

## 📜 License and attribution

SDR5E is an independent, free third-party ruleset for LoomVTT. Its original
code is licensed under **MIT**. Content derived from SRD 5.2.1 is licensed
under **CC-BY-4.0**. SDR5E is not approved, endorsed, or sponsored by Wizards
of the Coast LLC. Product Identity (name, art, lore, and the
"Resonance"/"Grimdark" narrative) remains proprietary to SDR5E. See
[`LICENSE`](LICENSE) for the complete breakdown and attribution.
