import {
	App,
	moment,
	Notice,
	Platform,
	Plugin,
	PluginSettingTab,
	setIcon,
	Setting,
	TFile,
} from "obsidian";

/*
 * Still Running — keep Obsidian running in the system tray instead of quitting.
 */

// Last-resort fallback icon (64x64 PNG). Normally use app.getFileIcon to get the actual Obsidian icon;
// this only shows up if that extraction fails.
const DEFAULT_TRAY_ICON =
	"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAABmJLR0QA/wD/AP+gvaeTAAADwklEQVR4nO3aXWhTZxgH8P/zJI1zqxVtZ8Nm2I3FrUpXZUXoyEpHB8OLyYSIhbmxqyEiuFJqkZVGRdjGBBWGd8KGwqhsnSi70EpcWzrRTtfGdFQLReP6kbqsncuC5vQ8I7CLrasrJzkfac/7g1wl75tz/jxPPngfQFEURVEURbFfrC+xLvuAg8iJN41FEsWaV5pBaAXAEDmpa8vaN9Wvml7SAYgID/Ym3gHhUwDlc55OQuRQUiv/vL6etCUXwGDPZIMQjgKoWuClwyLSXB30X1gSAQz0Tq0H6YchCBlc2kUsTVW1/igWYwCxvvjqjPhaSPAhAF+O22hCOEWQtpdf9SewGALo75ciXzrxvhCOACgzadtpEvp4+cOZYxVbKx6hUAMY7JlsAOG4AJWwgAAjLHSgKrjmbEEFcKN7vNLDnP2AexM2INAVndFUXbvmZv575aE/MlZW5OU2EO0B4IG9dBDOZGZ5/yuvPTtuawCxWMynJUt3E9EhAUrgrBQEn6U8jz+prQ2kjS5mowtOtFxdmxwp6QbRsQK4+axnQGhP3c9E9m7/bq3RxV6jC6ZGM+WX7o5WPV9R/H3NG89t8XjoKThIy+jpzi+GrsV+nNoi4Oyvy/uWBvC35b/c+aNufOR2fPPr/okXKlfWwAE3fxi/fv70sF/XpS7XPbz5XIAuCPRfngjErj24HtwW8K9Y5QvABr9OpuJfnhiYmEk+yjt4rxkXlH6o1Vw8PZq2ui3+We4ATAnbC/NY2hZmlLvVAVjSFmaWuy0BmNUWVpS7rQHk0xZWlbsTARhqC6vL3bEAFmoLu8rd8QDma4vkzJ+wq9wLJYB/tUV0aAxOYrgcw+UYLsdwOYbLMVyO4XIMl2O4HMPl2OgC3aNnDynvocAIcE9kNmF5AEe+qouzXloByD4Av8NhBKSI5GBRMb947lZjPIf1uQs3Rspkltskj6OxPP4M6UI4w5nM/m9+3mXv0dhc4VB35SzhKJHxw9EcA7jCLE1fDzQ6ezg6V3hHT4NOchwGjseNBEDAiAAHOqM7zxbkt0C4I9g1sfLpaiH6AMADE7eeBqQ1nS7ZaObNWzoiEw71rdYp0wKi/x2RWaACNAJOCT1u6xx8d3GMyMz1Uah3PbN+GJh/SOpJAQjQJeCmc9Edi3NI6gmfD/8Zk5sngGEImjtv7bywpH4JhjuCXfxScJOA3gNkcp6XJIWw77fS8o123bxjo7LhUKRY93AzhFqjQ2MMopPCvvZvf3rb9lFZR4VDkXVvbehwdFhaURRFURQFbvUXGt/Tnv5lS68AAAAASUVORK5CYII=";

// ── Electron (main process API accessed from renderer) minimal types ──────────
// Declare only used members narrowly, not any, to avoid unsafe-access warnings.
interface ElectronEvent {
	preventDefault(): void;
	returnValue?: boolean;
}

type ElectronListener = (...args: never[]) => void;

interface NativeImageLike {
	isEmpty(): boolean;
}

interface ElectronWindow {
	id: number;
	hide(): void;
	show(): void;
	focus(): void;
	restore(): void;
	close(): void;
	isVisible(): boolean;
	isMinimized(): boolean;
	isDestroyed(): boolean;
	setSkipTaskbar(skip: boolean): void;
	on(event: "close", listener: (e: ElectronEvent) => void): void;
	on(event: "ready-to-show" | "show", listener: () => void): void;
	removeListener(event: "close", listener: ElectronListener): void;
	removeListener(event: "ready-to-show" | "show", listener: () => void): void;
}

interface ElectronTray {
	setToolTip(tooltip: string): void;
	setContextMenu(menu: unknown): void;
	on(event: "click", listener: () => void): void;
	destroy(): void;
}

interface MenuItemTemplate {
	label?: string;
	type?: string;
	click?: () => void;
}

interface ElectronApp {
	prependListener(event: "second-instance", listener: () => void): void;
	on(
		event: "browser-window-created",
		listener: (e: ElectronEvent, w: ElectronWindow) => void
	): void;
	removeListener(event: string, listener: ElectronListener): void;
	quit(): void;
	relaunch(): void;
	exit(code: number): void;
	getFileIcon(
		path: string,
		options: { size: string }
	): Promise<NativeImageLike>;
	dock?: { show?: () => void };
}

interface ElectronRemote {
	app: ElectronApp;
	getCurrentWindow(): ElectronWindow;
	Tray: new (icon: NativeImageLike) => ElectronTray;
	Menu: { buildFromTemplate(template: MenuItemTemplate[]): unknown };
	nativeImage: {
		createFromPath(path: string): NativeImageLike;
		createFromDataURL(dataUrl: string): NativeImageLike;
	};
}

// ── Node built-in modules (local socket for external toggle) minimal types ──────────────────
interface NetSocket {
	end(): void;
	destroy(): void;
	on(event: "data", listener: (chunk: Buffer) => void): void;
	on(event: "end", listener: () => void): void;
	on(event: "error", listener: (err: Error) => void): void;
}

interface NetServer {
	listen(path: string): void;
	close(): void;
	on(event: "error", listener: (err: Error) => void): void;
}

interface NetModule {
	createServer(handler: (socket: NetSocket) => void): NetServer;
}

interface FsModule {
	existsSync(path: string): boolean;
	unlinkSync(path: string): void;
	chmodSync(path: string, mode: number): void;
}

interface OsModule {
	tmpdir(): string;
}

interface PathModule {
	join(...parts: string[]): string;
}

interface BackgroundTraySettings {
	runInBackground: boolean;
	createTrayIcon: boolean;
	focusOnRelaunch: boolean;
	trayIconPath: string;
	trayTooltip: string;
	enableExternalToggle: boolean;
	startMinimized: boolean;
	quickNoteFolder: string;
	quickNoteTemplatePath: string;
}

const DEFAULT_SETTINGS: BackgroundTraySettings = {
	runInBackground: true,
	createTrayIcon: true,
	focusOnRelaunch: true,
	trayIconPath: "",
	trayTooltip: "{{vault}} - Still Running",
	enableExternalToggle: false,
	startMinimized: false,
	quickNoteFolder: "",
	quickNoteTemplatePath: "",
};

// Load Node/Electron main process modules from the renderer.
// Use window.require instead of require() literals to avoid static import rules.
function windowRequire(id: string): unknown {
	if (typeof window === "undefined") return null;
	const req = (window as unknown as { require?: (id: string) => unknown })
		.require;
	if (typeof req !== "function") return null;
	try {
		return req(id);
	} catch {
		return null;
	}
}

// Short deterministic hash (FNV-1a) so sanitized vault names that collapse to the same
// string (e.g. "My Vault" / "My!Vault") still resolve to distinct socket/pipe paths.
function fnv1aHex(input: string): string {
	let hash = 0x811c9dc5;
	for (let i = 0; i < input.length; i++) {
		hash ^= input.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(16);
}

function getRemote(): ElectronRemote | null {
	const remote = windowRequire("@electron/remote") as ElectronRemote | null;
	if (remote) return remote;
	// legacy: electron.remote (older Electron versions fallback)
	const legacy = windowRequire("electron") as {
		remote?: ElectronRemote;
	} | null;
	return legacy?.remote ?? null;
}

// Example external-toggle commands, tailored to the OS actually running Obsidian (via
// Obsidian's own Platform flags) so the settings page never shows a command the user
// can't run as-is.
function getExternalToggleCommands(socketPath: string): {
	label: string;
	show: string;
	note: string;
} {
	if (Platform.isWin) {
		// getSocketPath() returns the full \\.\pipe\NAME path; NamedPipeClientStream wants
		// just NAME.
		const pipeName = socketPath.split("\\").pop() ?? socketPath;
		const connect = `$pipe = New-Object System.IO.Pipes.NamedPipeClientStream(".", "${pipeName}", [System.IO.Pipes.PipeDirection]::Out)\n$pipe.Connect(1000)`;
		return {
			label: "Windows / PowerShell",
			show: `${connect}\n$pipe.Dispose()`,
			note: `${connect}\n$bytes = [System.Text.Encoding]::UTF8.GetBytes("note")\n$pipe.Write($bytes, 0, $bytes.Length)\n$pipe.Dispose()`,
		};
	}
	if (Platform.isMacOS) {
		return {
			label: "macOS",
			show: `echo x | nc -U ${socketPath}`,
			note: `echo note | nc -U ${socketPath}`,
		};
	}
	return {
		label: "Linux",
		show: `echo x | socat - UNIX-CONNECT:${socketPath}`,
		note: `echo note | socat - UNIX-CONNECT:${socketPath}`,
	};
}

// Renders "<label> <code>command</code> [copy button]" as its own line in a settings
// description fragment. Multi-line commands (Windows PowerShell) use <pre> so the
// newlines the user needs actually render, instead of collapsing to spaces like plain text.
function appendCopyableCommand(
	frag: DocumentFragment,
	label: string,
	command: string
): void {
	frag.createEl("br");
	frag.appendText(label + " ");
	if (command.includes("\n")) {
		frag.createEl("pre", { text: command });
	} else {
		frag.createEl("code", { text: command });
	}
	frag.createEl(
		"button",
		{ cls: "clickable-icon", attr: { "aria-label": "Copy to clipboard" } },
		(btn) => {
			setIcon(btn, "copy");
			btn.addEventListener("click", () => {
				navigator.clipboard.writeText(command).catch((e) => {
					console.error("Still Running: clipboard write failed", e);
				});
				new Notice("Copied to clipboard.");
			});
		}
	);
}

export default class BackgroundTrayPlugin extends Plugin {
	settings!: BackgroundTraySettings;

	private remote: ElectronRemote | null = null;
	private win: ElectronWindow | null = null;
	private tray: ElectronTray | null = null;
	private closeHandler: ((e: ElectronEvent) => void) | null = null;
	private beforeUnloadHandler: ((e: BeforeUnloadEvent) => void) | null = null;
	private secondInstanceHandler: (() => void) | null = null;
	private windowCreatedHandler:
		| ((event: ElectronEvent, w: ElectronWindow) => void)
		| null = null;
	private reallyQuitting = false;
	private trayEpoch = 0;
	// Set by the "close" event, which Electron always fires before "beforeunload" for a
	// real window close (and never fires for webContents.reload()). Gates beforeunload so
	// "Reload app without saving" / plugin-update reloads aren't hijacked into a hide-to-tray.
	private closeEventFired = false;
	private closeEventResetTimer: ReturnType<typeof setTimeout> | null = null;
	private awaitingPickerWindow = false;
	private awaitingPickerTimer: ReturnType<typeof setTimeout> | null = null;
	private ipcServer: NetServer | null = null;
	private socketPath: string | null = null;

	async onload() {
		await this.loadSettings();

		this.remote = getRemote();
		if (!this.remote) {
			new Notice(
				"Still Running: Cannot access Electron — tray features are unavailable in this build."
			);
			// App must never crash. Show only settings tab and disable features.
			this.addSettingTab(new BackgroundTraySettingTab(this.app, this));
			return;
		}

		try {
			this.win = this.remote.getCurrentWindow();
		} catch (e) {
			console.error("Still Running: getCurrentWindow failed", e);
			this.win = null;
		}

		// ★ Close interception uses two layers:
		//   (1) beforeunload (renderer-only event) — primary defense, reliably vetoed in Electron 39.
		//   (2) window.on("close") (remote) — fallback for some environments. In Electron 39 @electron/remote,
		//       preventDefault is observed to be ignored (see 01. Spec §3.1·§3.3) → beforeunload is the actual mechanism.
		this.registerBeforeUnload();
		this.registerCloseInterception();
		// Restore existing window on relaunch when hidden in tray (+ suppress vault selection dialog).
		this.registerSingleInstance();

		if (this.settings.createTrayIcon) await this.createTray();
		if (this.settings.enableExternalToggle) await this.createIpcServer();

		if (this.settings.startMinimized) {
			try {
				this.win?.hide();
			} catch (e) {
				console.error("Still Running: startMinimized hide failed", e);
			}
		}

		// Maintain single purpose: do not register command palette / hotkey shortcuts.
		// (All actions are provided via tray icon and right-click menu — Show/Hide, Relaunch, Quit.)
		this.addSettingTab(new BackgroundTraySettingTab(this.app, this));
	}

	onunload() {
		// 01. Spec §3.4 cleanup checklist — when disabled, behavior 100% reverts.
		this.removeBeforeUnload();
		this.removeCloseInterception();
		this.removeSingleInstance();
		this.destroyTray();
		this.destroyIpcServer();
		try {
			this.win?.setSkipTaskbar(false);
		} catch {
			/* window access unavailable */
		}
		try {
			// (mac) restore dock
			this.remote?.app?.dock?.show?.();
		} catch {
			/* dock not available */
		}
		this.win = null;
		this.remote = null;
	}

	// ── Close interception ① beforeunload (primary, actual mechanism) ───────────────────
	// Renderer-only event; can synchronously cancel close without remote round-trip.
	private registerBeforeUnload() {
		if (typeof window === "undefined") return;
		this.removeBeforeUnload(); // duplicate registration guard
		this.beforeUnloadHandler = (e: BeforeUnloadEvent) => {
			if (
				this.settings.runInBackground &&
				!this.reallyQuitting &&
				this.closeEventFired
			) {
				// Consume the flag now — a reload's beforeunload arriving shortly after
				// (within the 1000ms reset window) must not also be hijacked as a close.
				this.closeEventFired = false;
				if (this.closeEventResetTimer) {
					clearTimeout(this.closeEventResetTimer);
					this.closeEventResetTimer = null;
				}
				e.preventDefault();
				// Electron: cancel close (returnValue is deprecated type — workaround via cast)
				(e as { returnValue: boolean }).returnValue = false;
				try {
					this.win?.hide(); // hide to tray
				} catch {
					/* ignore hide failure */
				}
			}
		};
		window.addEventListener("beforeunload", this.beforeUnloadHandler);
	}

	private removeBeforeUnload() {
		if (typeof window !== "undefined" && this.beforeUnloadHandler) {
			window.removeEventListener(
				"beforeunload",
				this.beforeUnloadHandler
			);
		}
		this.beforeUnloadHandler = null;
		if (this.closeEventResetTimer) {
			clearTimeout(this.closeEventResetTimer);
			this.closeEventResetTimer = null;
		}
		this.closeEventFired = false;
	}

	// ── Close interception ② window.on("close") (fallback) ─────────────────
	private registerCloseInterception() {
		const win = this.win;
		if (!win) return;
		this.removeCloseInterception(); // duplicate registration guard
		this.closeHandler = (e: ElectronEvent) => {
			if (this.settings.runInBackground && !this.reallyQuitting) {
				// Mark that a real window close is in flight so the beforeunload handler
				// (which also fires on reload/plugin-update, where "close" never fires)
				// knows this occurrence is a genuine close. Auto-clears as a safety net
				// in case beforeunload doesn't follow within the same close sequence.
				this.closeEventFired = true;
				if (this.closeEventResetTimer)
					clearTimeout(this.closeEventResetTimer);
				this.closeEventResetTimer = setTimeout(() => {
					this.closeEventFired = false;
				}, 1000);
				e.preventDefault();
				try {
					win.hide();
				} catch {
					/* ignore hide failure */
				}
			}
		};
		try {
			win.on("close", this.closeHandler);
		} catch (e) {
			console.error("Still Running: failed to register close listener", e);
			this.closeHandler = null;
		}
	}

	private removeCloseInterception() {
		if (this.win && this.closeHandler) {
			try {
				this.win.removeListener("close", this.closeHandler);
			} catch {
				/* already removed */
			}
		}
		this.closeHandler = null;
	}

	// ── Single-instance window focus ───────────────────────────────────────────
	// When Obsidian is relaunched while hidden in the tray, Obsidian shows a vault selection
	// dialog in second-instance (observed). → We restore the existing window, then close the
	// newly created dialog to appear as "return to existing window". (Spec §4.6)
	private registerSingleInstance() {
		const remote = this.remote;
		const win = this.win;
		if (!remote || !win) return;
		const app = remote.app;
		if (typeof app.prependListener !== "function") return;
		this.removeSingleInstance(); // duplicate registration guard

		let myId = -1;
		try {
			myId = win.id;
		} catch {
			/* id access unavailable */
		}

		this.secondInstanceHandler = () => {
			if (!this.settings.focusOnRelaunch) return;
			// Only the *next* new window is treated as the vault picker — not every window
			// created within the next 4s, which could otherwise catch a legitimate popout
			// pane the user opens shortly after relaunching. Safety timeout in case no
			// picker window ever arrives (e.g. Obsidian reuses the vault without a dialog).
			this.awaitingPickerWindow = true;
			if (this.awaitingPickerTimer) clearTimeout(this.awaitingPickerTimer);
			this.awaitingPickerTimer = setTimeout(() => {
				this.awaitingPickerWindow = false;
			}, 4000);
			this.showWindow();
		};
		this.windowCreatedHandler = (
			_event: ElectronEvent,
			w: ElectronWindow
		) => {
			if (!this.settings.focusOnRelaunch) return;
			let id = -1;
			try {
				id = w.id;
			} catch {
				/* id access unavailable */
			}
			if (id === myId) return; // never touch our window
			// Only the first window created after second-instance = vault selection dialog.
			if (this.awaitingPickerWindow) {
				this.awaitingPickerWindow = false;
				if (this.awaitingPickerTimer) {
					clearTimeout(this.awaitingPickerTimer);
					this.awaitingPickerTimer = null;
				}
				// ★ Prevent flicker/exit regression:
				//   - Hide the dialog immediately when it tries to show (ready-to-show/show) to avoid screen flicker.
				//   - Don't close the new dialog. In Obsidian 1.12/Electron 39, even with a hidden main window,
				//     closing the picker can enter the window-all-closed exit flow.
				//   - Instead, exclude it from taskbar and restore only the existing window to foreground.
				const hidePicker = () => {
					try {
						if (!w.isDestroyed()) w.hide();
					} catch {
						/* ignore hide failure */
					}
					try {
						if (!w.isDestroyed()) w.setSkipTaskbar(true);
					} catch {
						/* unsupported on some platforms/windows */
					}
					// One-shot: don't keep listeners (and their closure over w/this) attached
					// to the picker window indefinitely — it only ever needs to fire once.
					try {
						w.removeListener("ready-to-show", hidePicker);
					} catch {
						/* already removed */
					}
					try {
						w.removeListener("show", hidePicker);
					} catch {
						/* already removed */
					}
				};
				try {
					w.on("ready-to-show", hidePicker);
				} catch {
					/* event not supported */
				}
				try {
					w.on("show", hidePicker);
				} catch {
					/* event not supported */
				}
				window.setTimeout(hidePicker, 0);
				window.setTimeout(() => {
					try {
						const win = this.win;
						if (!this.remote || !win || win.isDestroyed()) return;
						hidePicker();
						this.showWindow();
					} catch {
						/* ignore window restore failure */
					}
				}, 150);
			}
		};
		try {
			// Prepend to restore existing window first.
			app.prependListener("second-instance", this.secondInstanceHandler);
			app.on("browser-window-created", this.windowCreatedHandler);
		} catch (e) {
			console.error("Still Running: failed to register single-instance", e);
		}
	}

	private removeSingleInstance() {
		const app = this.remote?.app;
		if (app) {
			try {
				if (this.secondInstanceHandler)
					app.removeListener(
						"second-instance",
						this.secondInstanceHandler
					);
			} catch {
				/* already removed */
			}
			try {
				if (this.windowCreatedHandler)
					app.removeListener(
						"browser-window-created",
						this.windowCreatedHandler
					);
			} catch {
				/* already removed */
			}
		}
		this.secondInstanceHandler = null;
		this.windowCreatedHandler = null;
		if (this.awaitingPickerTimer) {
			clearTimeout(this.awaitingPickerTimer);
			this.awaitingPickerTimer = null;
		}
		this.awaitingPickerWindow = false;
	}

	// ── Tray ───────────────────────────────────────────────────────
	private async createTray() {
		const remote = this.remote;
		if (!remote) return;
		this.destroyTray(); // duplicate guard
		const epoch = this.trayEpoch;
		try {
			const { Tray, Menu } = remote;
			const icon = await this.resolveTrayIcon(remote);

			// Stale-call guard: destroyTray/refreshTray/onunload ran (or the setting
			// was turned off) during the await above — creating now would leak a tray.
			if (
				epoch !== this.trayEpoch ||
				!this.remote ||
				!this.settings.createTrayIcon
			)
				return;

			const tray = new Tray(icon);
			this.tray = tray;
			tray.setToolTip(this.renderTooltip());

			const menu = Menu.buildFromTemplate([
				{ label: "Show / Hide", click: () => this.toggleWindow() },
				{ label: "New note", click: () => this.createQuickNote() },
				{ type: "separator" },
				{ label: "Relaunch Obsidian", click: () => this.relaunch() },
				{
					label: "Quit completely",
					click: () => this.quitCompletely(),
				},
			]);
			tray.setContextMenu(menu);
			tray.on("click", () => this.toggleWindow());
		} catch (e) {
			console.error("Still Running: failed to create tray", e);
			new Notice("Still Running: Failed to create tray icon.");
			// setToolTip/setContextMenu may have thrown after the Tray was created —
			// destroy the partially created tray instead of just dropping the reference.
			this.destroyTray();
		}
	}

	// Resolve tray icon: custom path → actual Obsidian app icon → fallback.
	private async resolveTrayIcon(
		remote: ElectronRemote
	): Promise<NativeImageLike> {
		const { nativeImage, app } = remote;
		// 1) User-specified path
		if (this.settings.trayIconPath) {
			try {
				const c = nativeImage.createFromPath(
					this.settings.trayIconPath
				);
				if (!c.isEmpty()) return c;
			} catch {
				/* invalid path → try next candidate */
			}
		}
		// 2) Extract icon from actual Obsidian executable at runtime (no bundling needed)
		try {
			const img = await app.getFileIcon(process.execPath, {
				size: "normal",
			});
			if (!img.isEmpty()) return img;
		} catch {
			/* icon extraction failed → fallback */
		}
		// 3) Last-resort fallback
		return nativeImage.createFromDataURL(DEFAULT_TRAY_ICON);
	}

	private destroyTray() {
		this.trayEpoch++; // invalidate any in-flight createTray()
		if (this.tray) {
			try {
				this.tray.destroy();
			} catch {
				/* already destroyed */
			}
		}
		this.tray = null;
	}

	private renderTooltip(): string {
		const vault = this.app.vault.getName();
		return (
			this.settings.trayTooltip || "{{vault}} - Still Running"
		).replace(/\{\{vault\}\}/g, vault);
	}

	// ── External toggle (local socket, optional) ─────────────────────────────────────
	// Allow Show/Hide to be triggered from outside the OS (e.g., global hotkeys like KDE)
	// by opening a local socket (Unix domain socket / Windows named pipe) at a vault-specific fixed path.
	// On connection, only call toggleWindow() — message parsing not needed.
	getSocketPath(): string {
		// In degraded mode (no Electron/Node access — see onload()), `process` itself may be
		// unavailable; the settings tab still renders and calls this unconditionally.
		if (typeof process === "undefined") return "";
		const rawVault = this.app.vault.getName();
		// Sanitizing collapses distinct vault names (e.g. "My Vault" and "My!Vault") to the
		// same string — append a short hash of the raw name so they still get distinct paths.
		const vault =
			rawVault.replace(/[^a-zA-Z0-9_-]/g, "_") + "-" + fnv1aHex(rawVault);
		if (process.platform === "win32") {
			return `\\\\.\\pipe\\obsidian-still-running-${vault}`;
		}
		const os = windowRequire("os") as OsModule | null;
		const path = windowRequire("path") as PathModule | null;
		if (!os || !path) return "";
		// Prefer a per-user, non-world-readable runtime dir over the shared os.tmpdir()
		// (predictable path there is squattable by another local user on multi-user Linux).
		const runtimeDir = process.env?.XDG_RUNTIME_DIR;
		const dir = runtimeDir && runtimeDir.length > 0 ? runtimeDir : os.tmpdir();
		return path.join(dir, `obsidian-still-running-${vault}.sock`);
	}

	private async createIpcServer() {
		if (!this.win) return;
		this.destroyIpcServer(); // duplicate guard
		try {
			const net = windowRequire("net") as NetModule | null;
			const fs = windowRequire("fs") as FsModule | null;
			if (!net || !fs) throw new Error("net/fs module access unavailable");
			const socketPath = this.getSocketPath();
			if (!socketPath) throw new Error("socket path calculation failed");
			// Socket file may remain from previous abnormal exit (Windows named pipe is OS-managed, so N/A).
			if (process.platform !== "win32" && fs.existsSync(socketPath)) {
				try {
					fs.unlinkSync(socketPath);
				} catch {
					/* cleanup failure → will show up as listen() error */
				}
			}
			const server = net.createServer((socket) => {
				let data = "";
				// A client that connects but never sends "end" (buggy/crashed script) would
				// otherwise hold the connection open indefinitely — force-close it.
				const idleTimeout = setTimeout(() => {
					try {
						socket.destroy();
					} catch {
						/* ignore */
					}
				}, 5000);
				socket.on("error", (err) => {
					// e.g. client aborted mid-write (ECONNRESET) — must not throw uncaught in the renderer.
					clearTimeout(idleTimeout);
					console.error("Still Running: external toggle connection error", err);
				});
				socket.on("data", (chunk) => {
					// Commands are a few bytes ("note"); cap buffering so a client that
					// holds the connection open streaming data can't grow memory unbounded.
					if (data.length < 256) data += chunk.toString();
				});
				socket.on("end", () => {
					clearTimeout(idleTimeout);
					try {
						const cmd = data.trim().toLowerCase();
						if (cmd === "note" || cmd === "new-note") {
							void this.createQuickNote();
						} else {
							this.toggleWindow();
						}
					} finally {
						try {
							socket.end();
						} catch {
							/* ignore */
						}
					}
				});
			});
			server.on("error", (err) => {
				console.error("Still Running: external toggle socket error", err);
				// e.g. EADDRINUSE (another vault/instance owns the path). Tear down so a
				// stale this.socketPath never unlinks a socket file owned by another
				// live instance in destroyIpcServer().
				try {
					server.close();
				} catch {
					/* already closed */
				}
				if (this.ipcServer === server) {
					this.ipcServer = null;
					this.socketPath = null;
					new Notice(
						"Still Running: External toggle socket failed (path in use?)."
					);
				}
			});
			server.listen(socketPath);
			// XDG_RUNTIME_DIR is already per-user (0700), but the os.tmpdir() fallback
			// (e.g. no systemd, SSH sessions) is world-readable — restrict to the owner so
			// another local user on a shared machine can't toggle the window / create notes.
			if (process.platform !== "win32") {
				try {
					fs.chmodSync(socketPath, 0o600);
				} catch {
					/* best-effort */
				}
			}
			this.ipcServer = server;
			this.socketPath = socketPath;
		} catch (e) {
			console.error("Still Running: failed to create external toggle socket", e);
			new Notice("Still Running: Failed to create external toggle socket.");
			this.ipcServer = null;
			this.socketPath = null;
		}
	}

	private destroyIpcServer() {
		if (this.ipcServer) {
			try {
				this.ipcServer.close();
			} catch {
				/* already closed */
			}
		}
		this.ipcServer = null;
		if (this.socketPath && process.platform !== "win32") {
			try {
				const fs = windowRequire("fs") as FsModule | null;
				if (fs?.existsSync(this.socketPath)) fs.unlinkSync(this.socketPath);
			} catch {
				/* ignore cleanup failure */
			}
		}
		this.socketPath = null;
	}

	// Re-open socket on settings change for immediate effect
	async refreshIpcServer() {
		this.destroyIpcServer();
		if (this.remote && this.win && this.settings.enableExternalToggle) {
			await this.createIpcServer();
		}
	}

	// ── Window behavior ──────────────────────────────────────────────────────
	toggleWindow() {
		const win = this.win;
		if (!win) return;
		try {
			if (win.isVisible() && !win.isMinimized()) {
				win.hide();
			} else {
				this.showWindow();
			}
		} catch (e) {
			console.error("Still Running: toggleWindow failed", e);
		}
	}

	showWindow() {
		const win = this.win;
		if (!win) return;
		try {
			if (win.isMinimized()) win.restore();
			win.show();
			win.focus();
		} catch {
			/* ignore window restore failure */
		}
	}

	// ── Quick note ────────────────────────────────────────────────────────────
	// Creates a new note (optionally from a template) in the configured folder, opens it,
	// and shows the window. Reachable from the tray menu and the external toggle socket
	// (send "note" instead of an empty payload), so it can be bound to a global hotkey.
	async createQuickNote() {
		try {
			let content = "";
			const templatePath = this.settings.quickNoteTemplatePath.trim();
			if (templatePath) {
				const templateFile =
					this.app.vault.getAbstractFileByPath(templatePath);
				if (templateFile instanceof TFile) {
					content = await this.app.vault.read(templateFile);
				} else {
					console.error(
						"Still Running: quick note template not found (or not a file):",
						templatePath
					);
				}
			}

			// Reject ".."/"." segments so the setting can't escape the vault root. Split on
			// both separators in case the setting was pasted in as a Windows-style path.
			const folder = this.settings.quickNoteFolder
				.split(/[/\\]/)
				.map((s) => s.trim())
				.filter((s) => s.length > 0 && s !== "." && s !== "..")
				.join("/");
			if (folder && !this.app.vault.getAbstractFileByPath(folder)) {
				try {
					await this.app.vault.createFolder(folder);
				} catch {
					/* folder already exists or was created concurrently */
				}
			}

			const stamp = moment().format("YYYY-MM-DD HHmmss");
			let file = null;
			// Two notes triggered within the same second would otherwise collide on the
			// exact same filename; fall back to a numeric suffix like Obsidian itself does.
			for (let suffix = 0; suffix < 100; suffix++) {
				const filename = `Untitled ${stamp}${suffix ? ` (${suffix})` : ""}.md`;
				const path = folder ? `${folder}/${filename}` : filename;
				if (this.app.vault.getAbstractFileByPath(path)) continue;
				try {
					file = await this.app.vault.create(path, content);
					break;
				} catch {
					continue; // lost the race to another concurrent create — try the next suffix
				}
			}
			if (!file) throw new Error("could not find an available filename");
			this.showWindow();
			try {
				await this.app.workspace.getLeaf(false).openFile(file);
			} catch {
				/* file was created; opening it in a leaf is best-effort */
			}
		} catch (e) {
			console.error("Still Running: failed to create quick note", e);
			new Notice("Still Running: Failed to create quick note.");
		}
	}

	quitCompletely() {
		this.reallyQuitting = true;
		try {
			if (this.win) this.win.close();
			else this.remote?.app?.quit();
		} catch (e) {
			console.error("Still Running: quit failed", e);
			try {
				this.remote?.app?.quit();
			} catch {
				// Neither path could quit — reset so future closes still hide to tray
				// instead of leaving reallyQuitting stuck true forever.
				this.reallyQuitting = false;
			}
		}
	}

	relaunch() {
		const app = this.remote?.app;
		if (!app) return;
		this.reallyQuitting = true;
		try {
			app.relaunch();
			// app.quit() (not exit()) so Obsidian gets its normal graceful-shutdown path
			// (autosave/will-quit flush). Our own close/beforeunload interception no-ops
			// while reallyQuitting is true, so it won't veto this.
			app.quit();
		} catch (e) {
			console.error("Still Running: relaunch failed", e);
			// Relaunch did not happen — reset so the next window close still
			// hides to tray instead of quitting the app.
			this.reallyQuitting = false;
		}
	}

	async loadSettings() {
		const data = (await this.loadData()) as
			| Partial<BackgroundTraySettings>
			| null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data ?? {});
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	// Recreate tray on settings change for immediate effect
	async refreshTray() {
		this.destroyTray();
		if (this.remote && this.settings.createTrayIcon)
			await this.createTray();
	}
}

class BackgroundTraySettingTab extends PluginSettingTab {
	plugin: BackgroundTrayPlugin;

	constructor(app: App, plugin: BackgroundTrayPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Run in background")
			.setDesc("Close window to tray instead of quitting the app.")
			.addToggle((t) =>
				t
					.setValue(this.plugin.settings.runInBackground)
					.onChange(async (v) => {
						this.plugin.settings.runInBackground = v;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Start minimized to tray")
			.setDesc("Launch Obsidian already hidden in the tray instead of showing the window on startup.")
			.addToggle((t) =>
				t
					.setValue(this.plugin.settings.startMinimized)
					.onChange(async (v) => {
						this.plugin.settings.startMinimized = v;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Create tray icon")
			.setDesc("Create an icon in the system tray. (Left-click: toggle show/hide)")
			.addToggle((t) =>
				t
					.setValue(this.plugin.settings.createTrayIcon)
					.onChange(async (v) => {
						this.plugin.settings.createTrayIcon = v;
						await this.plugin.saveSettings();
						await this.plugin.refreshTray();
					})
			);

		new Setting(containerEl)
			.setName("Focus existing window on relaunch")
			.setDesc(
				"When relaunching Obsidian while hidden in tray, restore the existing window instead of showing a new vault selection dialog."
			)
			.addToggle((t) =>
				t
					.setValue(this.plugin.settings.focusOnRelaunch)
					.onChange(async (v) => {
						this.plugin.settings.focusOnRelaunch = v;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Tray icon image")
			.setDesc(
				"Absolute path to a custom tray icon (leave empty for default Obsidian icon; 16x16 recommended)."
			)
			.addText((txt) =>
				txt
					.setPlaceholder("/path/to/icon.png")
					.setValue(this.plugin.settings.trayIconPath)
					.onChange(async (v) => {
						this.plugin.settings.trayIconPath = v.trim();
						await this.plugin.saveSettings();
						await this.plugin.refreshTray();
					})
			);

		new Setting(containerEl)
			.setName("Tray tooltip")
			.setDesc("{{vault}} → replaced with the vault name.")
			.addText((txt) =>
				txt
					.setValue(this.plugin.settings.trayTooltip)
					.onChange(async (v) => {
						this.plugin.settings.trayTooltip = v;
						await this.plugin.saveSettings();
						await this.plugin.refreshTray();
					})
			);

		new Setting(containerEl)
			.setName("New note folder")
			.setDesc(
				"Folder for notes created via the tray menu's 'New note' / external toggle 'note' command. Leave empty for vault root."
			)
			.addText((txt) =>
				txt
					.setPlaceholder("(vault root)")
					.setValue(this.plugin.settings.quickNoteFolder)
					.onChange(async (v) => {
						this.plugin.settings.quickNoteFolder = v;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("New note template")
			.setDesc(
				"Vault path to a template file whose content is used for new notes. Leave empty for a blank note."
			)
			.addText((txt) =>
				txt
					.setPlaceholder("Templates/Daily.md")
					.setValue(this.plugin.settings.quickNoteTemplatePath)
					.onChange(async (v) => {
						this.plugin.settings.quickNoteTemplatePath = v;
						await this.plugin.saveSettings();
					})
			);

		const socketPath = this.plugin.getSocketPath();
		new Setting(containerEl)
			.setName("Enable external toggle (advanced)")
			.setDesc(
				createFragment((frag) => {
					if (this.plugin.settings.enableExternalToggle && socketPath) {
						frag.appendText(
							'Enabled — connect to the socket below to toggle Show/Hide, or send "note" to create a new note (for OS-level global hotkey integration). Click the copy icon to copy any line.'
						);
						appendCopyableCommand(frag, "Socket path:", socketPath);
						const cmds = getExternalToggleCommands(socketPath);
						appendCopyableCommand(
							frag,
							`Show/Hide (${cmds.label}):`,
							cmds.show
						);
						appendCopyableCommand(
							frag,
							`New note (${cmds.label}):`,
							cmds.note
						);
					} else {
						frag.appendText(
							"Expose Show/Hide toggle (and new-note creation) via a local socket (Unix domain socket / Windows named pipe) to allow triggering from outside (e.g., OS global hotkeys)."
						);
					}
					frag.createEl("br");
					frag.appendText("Keyboard shortcut setup help: ");
					frag.createEl("a", {
						text: "README",
						href: "https://github.com/lubdhak7414/obsidian-still-running#show--hide-or-create-a-note-with-a-global-keyboard-shortcut",
					});
				})
			)
			.addToggle((t) =>
				t
					.setValue(this.plugin.settings.enableExternalToggle)
					.onChange(async (v) => {
						this.plugin.settings.enableExternalToggle = v;
						await this.plugin.saveSettings();
						await this.plugin.refreshIpcServer();
						this.display(); // refresh socket path display
					})
			);
	}
}
