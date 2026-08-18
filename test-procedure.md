# Test Procedure — Still Running

Two layers: an automated layer that runs in seconds and must be green before
touching Obsidian at all, and a manual layer that exercises real Electron/OS
behavior the automated harness can't simulate (actual tray icons, actual
window close events, actual sockets across process boundaries).

Run the automated layer after every change. Run the full manual layer before
tagging a release; run the "quick manual smoke" subset after smaller changes.

## 0. Automated (required before any manual testing)

```bash
npm install
npm run build     # tsc typecheck + esbuild production build — exit 0 required
node smoke.cjs    # Electron-free regression harness — must print "ALL PASS"
```

If either fails, stop — fix it before doing manual testing. The manual steps
below assume the build is already known-good.

## 1. Manual setup

You need a real Obsidian install and a disposable test vault (don't use your
main vault for the first pass on a new build).

```bash
mkdir -p /path/to/test-vault/.obsidian/plugins/obsidian-still-running
cp main.js manifest.json styles.css \
  /path/to/test-vault/.obsidian/plugins/obsidian-still-running/
```

Open the test vault in Obsidian → Settings → Community plugins → enable
**Still Running**. Keep Obsidian's devtools open (Ctrl+Shift+I) during
testing and watch for any uncaught errors or `Still Running: ...` console
lines you didn't expect.

## 2. Quick manual smoke (run after any change touching main.ts)

- [ ] Plugin enables with no console errors.
- [ ] Tray icon appears.
- [ ] Close the window (X) → Obsidian hides instead of quitting; tray icon
      remains.
- [ ] Left-click tray icon → window reappears.
- [ ] Right-click tray icon → Quit completely → process actually exits
      (check `ps aux | grep -i obsidian` / Task Manager / Activity Monitor —
      no leftover process).
- [ ] Disable the plugin → tray icon disappears, closing the window now quits
      Obsidian normally (default behavior restored).

## 3. Full manual pass (before release)

### Core close-to-tray behavior
- [ ] With **Run in background** enabled (default): closing the window hides
      to tray, Obsidian process stays alive.
- [ ] With **Run in background** disabled in settings: closing the window
      quits Obsidian normally, no tray icon left behind.
- [ ] Close the window twice in a row (hide, show, hide again) — no stuck
      state, no duplicate tray icons.
- [ ] Reload Obsidian (Ctrl+R / Cmd+R) while **Run in background** is
      enabled — reload must proceed normally and must *not* be mistaken for
      a close-to-tray (window should reload, not hide).

### Tray menu
- [ ] **Show/Hide** toggles correctly from both states.
- [ ] **New note** creates a note and brings the window to front.
  - [ ] With **New note folder** set to a real folder → note lands there.
  - [ ] With **New note folder** left blank → note lands at vault root.
  - [ ] With **New note folder** set to something containing `..` or `.`
        segments (e.g. `../../etc` or `Inbox/../../x`) → those segments are
        stripped, note stays inside the vault.
  - [ ] With **New note folder** using backslashes (e.g. `Inbox\Sub`) →
        treated the same as `Inbox/Sub`.
  - [ ] With **New note template** set to a valid template file → new note
        is seeded from it.
  - [ ] With **New note template** pointing at a folder or missing file →
        falls back to a blank note instead of erroring.
  - [ ] With **New note filename** template using `{{date}}`/`{{time}}` → filename renders correctly.
  - [ ] With **New note filename** containing `/` or `\` → slashes are sanitized to `-`.
  - [ ] Trigger **New note** twice within the same second → two distinct
        files are created (no silent overwrite).
- [ ] **Relaunch** restarts Obsidian and reopens the same vault directly
      (no vault-picker window flashes on screen).
- [ ] **Quit completely** fully exits the process (no leftover process, no
      leftover tray icon).

### New features (since 0.9.0)
- [ ] **Minimize to tray**: enable in settings, click minimize button → window hides to tray (not taskbar). Disable → minimize goes to taskbar normally.
- [ ] **Hide dock icon (macOS)**: with window hidden and setting enabled, dock icon disappears; showing window restores it. No effect on Linux/Windows.
- [ ] **Global shortcut**: enable, set accelerator `Alt+Shift+O`, press shortcut → toggles show/hide without external tool. Try conflicting accelerator → error Notice shown.
- [ ] **Custom tray icon validation**: set non-existent path → Notice shown, fallback icon used. Clear path → live Obsidian icon returns.
- [ ] **Socket path truncation**: vault with 100+ char name still creates socket (check `getSocketPath` length < 107); two similar long names still get distinct sockets.

### Single-instance / relaunch edge cases
- [ ] With the window hidden in the tray, try to open Obsidian again from
      your OS launcher/desktop icon — the existing hidden window is restored
      instead of a second instance or vault-picker window appearing.
- [ ] Open two *different* vaults, both with the plugin enabled and both
      hidden to tray at once — each has its own independent tray icon and
      toggling one does not affect the other (checks the vault-specific
      socket-path/pipe-name fix).

### Custom tray icon / tooltip
- [ ] Set a custom tray icon path in settings → icon updates.
- [ ] Clear the custom icon path → falls back to the live-extracted Obsidian
      app icon (or embedded fallback if extraction fails).
- [ ] Tooltip shows the vault name where `{{vault}}` is used in the
      template.

### External toggle (local socket)
Enable **Enable external toggle** in settings and copy the shown socket
path.

- **Linux:**
  ```bash
  echo x | socat - UNIX-CONNECT:/path/to/the/socket      # show/hide
  echo note | socat - UNIX-CONNECT:/path/to/the/socket   # new note
  ```
- **macOS:**
  ```bash
  echo x | nc -U /path/to/the/socket
  echo note | nc -U /path/to/the/socket
  ```
- **Windows (PowerShell):** use the snippet from the README's Windows
  section.

Checks:
- [ ] Bare connect/disconnect toggles show/hide.
- [ ] Sending `note` creates a quick note and shows the window.
- [ ] On Linux/macOS, confirm the socket file is owner-only:
      `stat -c '%a' /path/to/the/socket` → `600`.
- [ ] Open a connection and just sit on it without sending data or closing —
      confirm the plugin force-closes it after a few seconds instead of
      hanging (`Still Running: external toggle connection error` should
      *not* appear; the connection should just be dropped cleanly).
- [ ] Disable **Enable external toggle**, then re-enable it — socket is
      recreated cleanly (no "address already in use" failure from a stale
      socket file).
- [ ] Disable the plugin (or quit Obsidian) while external toggle is
      enabled → socket file is removed from disk (`ls /path/to/the/socket`
      → gone).

### Settings persistence
- [ ] Change every setting (run in background, minimize to tray, hide dock, single-instance, custom
      icon, tooltip template, external toggle, global shortcut, new-note folder/template/filename),
      restart Obsidian, confirm all values persisted. Corrupt `data.json` (e.g. set a boolean to a string) → plugin still loads with defaults (sanitize).

### Cleanup discipline (leak check)
- [ ] Disable the plugin, then check for leftovers:
  - No tray icon remains.
  - No socket/pipe file remains on disk.
  - Closing the window now behaves like stock Obsidian (quits normally).
- [ ] Re-enable the plugin after disabling — behaves as a fresh install,
      no doubled listeners (e.g. tray icon doesn't need two clicks to
      toggle, close isn't intercepted twice).

### Platform matrix
Run at minimum the "Quick manual smoke" (§2) plus the External toggle
section (§3) on each platform you can access before a release:

| Platform | Quick smoke | Full pass |
|----------|:-----------:|:---------:|
| Linux (your primary DE) | required | required |
| Windows | required | recommended |
| macOS | required | recommended |

Linux tray behavior is best-effort per-desktop-environment (per README) —
if you can only test one DE, note which one in the release notes.

## 4. Release readiness checklist

- [ ] §0 automated layer green.
- [ ] §2 quick manual smoke green on at least the primary dev platform.
- [ ] §3 full manual pass green at least once since the last version bump.
- [ ] `manifest.json` / `package.json` / `versions.json` versions match and
      `minAppVersion` reflects the actual Obsidian version tested against.
- [ ] README's Install / manual-install file list (`main.js`,
      `manifest.json`, `styles.css`) matches what the release workflow
      actually attaches (see `.github/workflows/*.yml`).
- [ ] No stray `console.log`/debug output left in `main.ts` (errors via
      `console.error` are fine and expected).
