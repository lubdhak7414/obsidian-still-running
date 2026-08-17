export interface BackgroundTraySettings {
	runInBackground: boolean;
	createTrayIcon: boolean;
	focusOnRelaunch: boolean;
	trayIconPath: string;
	trayTooltip: string;
	enableExternalToggle: boolean;
	startMinimized: boolean;
	quickNoteFolder: string;
	quickNoteTemplatePath: string;
	minimizeToTray: boolean;
	hideDockIcon: boolean;
	quickNoteFilenameTemplate: string;
	enableGlobalShortcut: boolean;
	globalShortcutAccelerator: string;
}

export const DEFAULT_SETTINGS: BackgroundTraySettings = {
	runInBackground: true,
	createTrayIcon: true,
	focusOnRelaunch: true,
	trayIconPath: "",
	trayTooltip: "{{vault}} - Still Running",
	enableExternalToggle: false,
	startMinimized: false,
	quickNoteFolder: "",
	quickNoteTemplatePath: "",
	minimizeToTray: false,
	hideDockIcon: false,
	quickNoteFilenameTemplate: "Untitled {{date}} {{time}}",
	enableGlobalShortcut: false,
	globalShortcutAccelerator: "Alt+Shift+O",
};

// Validate and sanitize persisted settings - corrupt data.json (e.g. manual edit) must not
// crash the plugin. Unknown fields are dropped, wrong types fall back to defaults.
export function sanitizeSettings(raw: unknown): BackgroundTraySettings {
	const out = { ...DEFAULT_SETTINGS };
	if (!raw || typeof raw !== "object") return out;
	const r = raw as Record<string, unknown>;
	const asBool = (k: keyof BackgroundTraySettings, fallback: boolean) =>
		typeof r[k] === "boolean" ? (r[k] as boolean) : fallback;
	const asString = (k: keyof BackgroundTraySettings, fallback: string) =>
		typeof r[k] === "string" ? (r[k] as string) : fallback;
	out.runInBackground = asBool("runInBackground", DEFAULT_SETTINGS.runInBackground);
	out.createTrayIcon = asBool("createTrayIcon", DEFAULT_SETTINGS.createTrayIcon);
	out.focusOnRelaunch = asBool("focusOnRelaunch", DEFAULT_SETTINGS.focusOnRelaunch);
	out.trayIconPath = asString("trayIconPath", DEFAULT_SETTINGS.trayIconPath);
	out.trayTooltip = asString("trayTooltip", DEFAULT_SETTINGS.trayTooltip);
	out.enableExternalToggle = asBool("enableExternalToggle", DEFAULT_SETTINGS.enableExternalToggle);
	out.startMinimized = asBool("startMinimized", DEFAULT_SETTINGS.startMinimized);
	out.quickNoteFolder = asString("quickNoteFolder", DEFAULT_SETTINGS.quickNoteFolder);
	out.quickNoteTemplatePath = asString("quickNoteTemplatePath", DEFAULT_SETTINGS.quickNoteTemplatePath);
	out.minimizeToTray = asBool("minimizeToTray", DEFAULT_SETTINGS.minimizeToTray);
	out.hideDockIcon = asBool("hideDockIcon", DEFAULT_SETTINGS.hideDockIcon);
	out.quickNoteFilenameTemplate = asString("quickNoteFilenameTemplate", DEFAULT_SETTINGS.quickNoteFilenameTemplate);
	out.enableGlobalShortcut = asBool("enableGlobalShortcut", DEFAULT_SETTINGS.enableGlobalShortcut);
	out.globalShortcutAccelerator = asString("globalShortcutAccelerator", DEFAULT_SETTINGS.globalShortcutAccelerator);
	// Clamp accelerator to something plausible (non-empty, no absurd length)
	if (!out.globalShortcutAccelerator.trim() || out.globalShortcutAccelerator.length > 60) {
		out.globalShortcutAccelerator = DEFAULT_SETTINGS.globalShortcutAccelerator;
	}
	if (!out.quickNoteFilenameTemplate.trim()) {
		out.quickNoteFilenameTemplate = DEFAULT_SETTINGS.quickNoteFilenameTemplate;
	}
	return out;
}

export function renderQuickNoteFilename(template: string, m: { format(s: string): string }): string {
	const date = m.format("YYYY-MM-DD");
	const time = m.format("HHmmss");
	const datetime = m.format("YYYY-MM-DD HHmmss");
	// Support {{date}}, {{time}}, {{datetime}}, {{timestamp}} (unix ms)
	let name = template;
	name = name.replace(/\{\{date\}\}/gi, date);
	name = name.replace(/\{\{time\}\}/gi, time);
	name = name.replace(/\{\{datetime\}\}/gi, datetime);
	name = name.replace(/\{\{timestamp\}\}/gi, String(Date.now()));
	// Strip path separators the user may have pasted into the template
	name = name.replace(/[/\\]/g, "-").trim();
	if (!name) name = `Untitled ${datetime}`;
	// Ensure .md extension handling is done by caller; we just return base name without .md
	return name;
}
