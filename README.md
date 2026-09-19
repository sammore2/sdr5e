<div align="center">
  <img src="assets/ui/readme-banner.png" alt="SDR5E Banner" width="100%">
</div>

# SDR5E

A visceral, fantasy tabletop roleplaying system built on the mathematical foundation of the SRD.
Native ruleset for **LoomVTT** — originally built for Foundry VTT, currently being converted to
run natively on the Loom engine (no Foundry runtime dependency).

## 🌒 Overview

**SDR5E** is designed to provide a high-stakes, atmospheric experience. It blends classic d20 mechanics with modern design principles and a unique aesthetic.

### Key Features:

- **Resonance Mechanics**: Manage the balance between cosmic forces (Axis/Flux and Genesis/Abyss).
- **Visceral Combat**: Tactical encounters with streamlined yet lethal outcomes.
- **Grimdark Aesthetic**: Custom-built UI and identity for an immersive dark fantasy setting.
- **Modular SRD Support**: Architecture designed to adapt between SRD 3.5 and 5.1 frameworks.

## ⚙️ Installation

To install SDR5E in LoomVTT, drop this ruleset in `marketplace/rulesets/` (or symlink
it there via a junction, see `.claude`/`.agents` skills for the pattern used by other
Loom rulesets).

> The Foundry VTT install steps below applied to the pre-conversion version and are kept
> only for historical reference while the port is in progress.

<details>
<summary>Legacy Foundry VTT installation (pre-conversion)</summary>

1. Open the Foundry VTT Setup menu.
2. Go to the **Game Systems** tab.
3. Click **Install System**.
4. Use the **Manifest URL** provided in your private repository release.

</details>

## 🛠️ Development

Para desenvolvedores trabalhando no sistema:

| Comando             | Função                                                       |
| :------------------ | :------------------------------------------------------------- |
| `npm run build`   | Compila arquivos **LESS** em CSS (Design/Interface)       |
| `npm run compile` | Compila arquivos **JSON** em Packs (Banco de Dados/Itens) |
| `npm run dev`     | Executa o Gulp em modo *watch* (Auto-compilação ao salvar)  |
| `npm run eslint`  | Executa o linter para verificar erros de código               |

---

## 📜 License and attribution

SDR5E is an independent, free third-party ruleset for LoomVTT. Its original
code is licensed under **MIT**. Content derived from SRD 5.2.1 is licensed
under **CC-BY-4.0**. SDR5E is not approved, endorsed, or sponsored by Wizards
of the Coast LLC. Product Identity (name, art, lore, and the
"Resonance"/"Grimdark" narrative) remains proprietary to SDR5E. See
[`LICENSE`](LICENSE) for the complete breakdown and attribution.
