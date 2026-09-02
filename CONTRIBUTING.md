# Contributing to SDR5E (LoomVTT — converting from Foundry V13)

This repository follows a strict architectural protocol. To maintain data integrity and project stability, all contributors MUST use the built-in **Codex Utility App**.

## 🛠️ The SDR5E Utility App

Located in `devtools/`, this is a zero-dependency Node.js CLI tool designed to manage, audit, and compile the system's database.

### How to use
Run the application from the root directory:
```bash
node devtools/codex-app.mjs
```
Alternatively, you can call specific modules directly:
```bash
node devtools/codex-app.mjs <module_name>
```

---

## 🏗️ Core Modules Breakdown

### 1. `inspect` (System Audit)
Performs a deep scan of the current LevelDB database. It checks for:
- 404 image paths.
- Missing `isSpellcaster` flags in classes.
- Missing `classMapping` in spells.
- Schema compliance.
- **Output:** Detailed JSON report in `tmp/inspect_out/_report.json`.

### 2. `sync` (Manual Synchronization)
Uses `Characters_Codex.md` as the "Source of Truth" to:
- Catalog all spells and their required circles per class.
- Deduplicate JSON files in `src/packs/spells`.
- Inject `classMapping` data automatically into spell JSONs.

### 3. `finalize` (Build Preparation)
Prepares source files for compilation by:
- Generating persistent 16-bit hex `_id` and `_key` fields.
- Mapping icons to Foundry VTT Core icons (`icons/magic/...`) using standard mapping files.
- Ensuring local icons use the `systems/the-codex-modern/assets/icons/` path.
- Normalizing magic schools to the 3-letter standard (e.g., `evo`, `abj`).

### 4. `cleanup` (Universal Field Reordering)
Enforces the **Canonical Selection Order** for all JSON files. Fields are reordered (e.g., Description always at the top) to ensure repository readability and cleaner git diffs.

### 5. `pack` (Database Compiler)
Compiles everything from `src/packs/*.json` into the Foundry-compatible LevelDB format in `packs/`.
> [!IMPORTANT]
> **Foundry VTT must be CLOSED** when running this command to prevent database corruption.

### 6. `repair` & `recover`
- **repair:** Fixes common encoding issues, non-printable characters, and truncated names.
- **recover:** Attempt to restore spell data from raw text strings in case of emergency data loss.

---

## 📜 Architectural Rules (Maximum Rigor)

1. **Don't Edit `packs/` Directly:** Always edit the JSON source files in `src/packs/` and use `node devtools/codex-app.mjs pack` to update the game database.
2. **Icons First:** Use Foundry Core icons whenever possible. Only use `assets/icons/` for custom assets exclusive to SDR5E.
3. **Canonical Order:** After any bulk edit, run the `cleanup` command to restore field order.
4. **Isolate Dev Tools:** Never include `devtools/` or maintenance scripts in the `system.json` manifests or final build distributions.

---

*Thank you for maintaining the integrity of the SDR5E project.*
