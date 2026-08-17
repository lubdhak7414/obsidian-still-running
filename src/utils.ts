import { Platform, setIcon } from "obsidian";
import type { ElectronRemote } from "./types";

// Load Node/Electron main process modules from the renderer.
// Use window.require instead of require() literals to avoid static import rules.
export function windowRequire(id: string): unknown {
	if (typeof window === "undefined") return null;
	const req = (window as unknown as { require?: (id: string) => unknown }).require;
	if (typeof req !== "function") return null;
	try {
		return req(id);
	} catch {
		return null;
	}
}

// Short deterministic hash (FNV-1a) so sanitized vault names that collapse to the same
// string (e.g. "My Vault" / "My!Vault") still resolve to distinct socket/pipe paths.
export function fnv1aHex(input: string): string {
	let hash = 0x811c9dc5;
	for (let i = 0; i < input.length; i++) {
		hash ^= input.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(16);
}

export function getRemote(): ElectronRemote | null {
	const remote = windowRequire("@electron/remote") as ElectronRemote | null;
	if (remote) return remote;
	// legacy: electron.remote (older Electron versions fallback)
	const legacy = windowRequire("electron") as { remote?: ElectronRemote } | null;
	return legacy?.remote ?? null;
}

// Example external-toggle commands, tailored to the OS actually running Obsidian (via
// Obsidian's own Platform flags) so the settings page never shows a command the user
// can't run as-is.
export function getExternalToggleCommands(socketPath: string): {
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

// Renders "<label> <code>command</code> [copy button]" as a single flex row (see
// .background-tray-command-row in styles.css) in a settings description fragment, so the
// copy button sits inline next to the command instead of wrapping onto its own line.
// Multi-line commands (Windows PowerShell) use <pre> so the newlines the user needs
// actually render, instead of collapsing to spaces like plain text.
export function appendCopyableCommand(frag: DocumentFragment, label: string, command: string): void {
	frag.createEl("div", { cls: "background-tray-command-row" }, (row) => {
		row.createEl("span", {
			text: label,
			cls: "background-tray-command-label",
		});
		if (command.includes("\n")) {
			row.createEl("pre", { text: command });
		} else {
			row.createEl("code", { text: command });
		}
		row.createEl(
			"button",
			{ cls: "clickable-icon", attr: { "aria-label": "Copy to clipboard" } },
			(btn) => {
				setIcon(btn, "copy");
				btn.addEventListener("click", () => {
					navigator.clipboard.writeText(command).catch((e) => {
						console.error("Still Running: clipboard write failed", e);
					});
					// @ts-ignore - Notice is global from obsidian but not imported here to avoid cycle
					const { Notice } = require("obsidian") as { Notice: new (msg: string) => unknown };
					new Notice("Copied to clipboard.");
				});
			}
		);
	});
}
