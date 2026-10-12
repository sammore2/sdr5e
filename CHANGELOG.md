# Changelog

All notable changes to this project are documented here.
Each release tag `vX.Y.Z` publishes the section headed `## [X.Y.Z]` as its release notes.

## [Unreleased]

## [0.2.0] - 2026-10-12

### Added
- Combat initiative hook: the system answers `combatInitiative` with the sheet's initiative bonus, and reports Advantage or Disadvantage by condition and health to the host.
- Wizard Scholar fallback help when the character lacks proficiency in the academic skills, plus a localized message when a spell category choice limit is reached (en and pt-BR).
- Build scripts for the stylesheets (`npm run css`, `npm run css:watch`) using Less and Gulp, with new modular Less sources under `styles/less/`.
- Helper modules for active effects, side tabs, and tooltips, and a CSS comparison script.

### Changed
- Character, NPC, group, and vehicle sheets reworked; the level-up wizard and class-feature grant flow updated; rest, roll engine, and prepare-data adjusted to match.
- Stylesheets (`srd5e.css`, `dark-tactical-sheets.css`) and the matching templates (character, NPC, group, level-up wizard) restructured.
- SRD compendium packs (races, magic items, monsters, vehicles) rebuilt from their versioned sources; contents unchanged.
- `.gitignore` now ignores `node_modules`.

### Fixed
- Pack verification now passes: compiled SQLite compendiums match their versioned sources.
- Progression and prepare-data migration tests extended to cover the updated flows.
