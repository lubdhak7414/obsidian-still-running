# Contributing to Still Running

## Quick start

```bash
npm install
npm run build   # must exit 0
node smoke.cjs  # must print ALL PASS
```

Do not open a PR if either fails.

## Architecture

All Electron code in `main.ts` (now modularized via `src/`). See `CLAUDE.md` for:
- close interception two-layer design
- single-instance picker suppression (don't close picker, hide+skipTaskbar)
- tray creation with `trayEpoch` guard
- socket per-vault with hash

New modules:
- `src/settings.ts` - settings interface, defaults, sanitize, filename template
- `src/types.ts` - Electron/Node minimal types
- `src/utils.ts` - windowRequire, fnv1aHex, tray commands

## Adding a setting

1. Add field to `BackgroundTraySettings` + `DEFAULT_SETTINGS` in `src/settings.ts`
2. Update `sanitizeSettings()` to validate type
3. Add `Setting` in `BackgroundTraySettingTab.display()` in `main.ts`
4. Handle migration: old `data.json` missing the field should fall back to default (covered by sanitize)
5. Add manual test to `test-procedure.md` and smoke coverage if possible

## Style

- Wrap every Electron/Node call in try/catch, log `console.error("Still Running: ...", e)` and `new Notice` for user-visible failures.
- `onunload()` must reverse every listener/tray/socket - no leaks.
- esbuild externals must include node builtins + electron + @electron/remote.
- Use deterministic, non-racy primitives (epoch guards, timeouts, hash suffix for vault names).

## Testing

See `test-procedure.md` - run quick smoke after any change, full pass before release.

## Commit messages

Plain messages, no `Co-Authored-By` trailers.
