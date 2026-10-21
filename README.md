<div align="center">
  <img src="assets/ui/readme-banner.png" alt="SDR5E Banner" width="100%">
</div>

# SDR5E

[![Loom VTT](https://img.shields.io/badge/Loom%20VTT-2.0.5--alpha-blueviolet)](https://loomvtt.com)
[![Version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fsammore2%2Fsdr5e%2Fmain%2Fruleset.json&query=%24.version&label=version&color=c99738)](https://github.com/sammore2/sdr5e/releases)
[![License](https://img.shields.io/badge/license-MIT%20AND%20CC--BY--4.0-blue)](LICENSE)
[![Downloads](https://img.shields.io/github/downloads/sammore2/sdr5e/latest/srd5e.zip?label=downloads)](https://github.com/sammore2/sdr5e/releases/latest)

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

For developers working on the system:

| Command            | Purpose                                                                                       |
| :----------------- | :-------------------------------------------------------------------------------------------- |
| `npm test`         | Runs the ruleset's deterministic regression tests.                                            |
| `npm run verify`   | Checks JS syntax, manifest references, languages and the integrity of the SQLite compendiums. |

The repository does not currently contain a versioned JSON source for the packs or a LESS/SQLite build pipeline. For that reason, these commands validate the artifacts that are present; they do not rebuild or publish packages.

### Coverage and limitations

SDR5E is still being implemented. Progression, part of the class features and rests have automated coverage, but high-level character creation, several features, activities, spells, permissions and complete encounter flows still need implementation and validation in Loom. The presence of an entry in the compendium does not mean its effect is automated.
---

## 📜 License and attribution

SDR5E is an independent, free third-party ruleset for LoomVTT. Its original
code is licensed under **MIT**. Content derived from SRD 5.2.1 is licensed
under **CC-BY-4.0**. SDR5E is not approved, endorsed, or sponsored by Wizards
of the Coast LLC. Product Identity (name, art, lore, and the
"Resonance"/"Grimdark" narrative) remains proprietary to SDR5E. See
[`LICENSE`](LICENSE) for the complete breakdown and attribution.
