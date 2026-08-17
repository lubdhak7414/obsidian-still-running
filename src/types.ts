export interface ElectronEvent {
	preventDefault(): void;
	returnValue?: boolean;
}

export type ElectronListener = (...args: never[]) => void;

export interface NativeImageLike {
	isEmpty(): boolean;
}

export interface ElectronWebContents {
	getURL(): string;
}

export interface ElectronWindow {
	id: number;
	webContents?: ElectronWebContents;
	hide(): void;
	show(): void;
	focus(): void;
	restore(): void;
	minimize(): void;
	close(): void;
	isVisible(): boolean;
	isMinimized(): boolean;
	isDestroyed(): boolean;
	setSkipTaskbar(skip: boolean): void;
	on(event: "close", listener: (e: ElectronEvent) => void): void;
	on(event: "minimize", listener: (e: ElectronEvent) => void): void;
	on(event: "ready-to-show" | "show", listener: () => void): void;
	removeListener(event: "close", listener: ElectronListener): void;
	removeListener(event: "minimize", listener: ElectronListener): void;
	removeListener(event: "ready-to-show" | "show", listener: () => void): void;
}

export interface ElectronTray {
	setToolTip(tooltip: string): void;
	setContextMenu(menu: unknown): void;
	on(event: "click", listener: () => void): void;
	destroy(): void;
}

export interface MenuItemTemplate {
	label?: string;
	type?: string;
	click?: () => void;
}

export interface ElectronApp {
	prependListener(event: "second-instance", listener: () => void): void;
	on(event: "browser-window-created", listener: (e: ElectronEvent, w: ElectronWindow) => void): void;
	removeListener(event: string, listener: ElectronListener): void;
	quit(): void;
	relaunch(): void;
	exit(code: number): void;
	getFileIcon(path: string, options: { size: string }): Promise<NativeImageLike>;
	dock?: { show?: () => void; hide?: () => void };
}

export interface ElectronRemote {
	app: ElectronApp;
	getCurrentWindow(): ElectronWindow;
	Tray: new (icon: NativeImageLike) => ElectronTray;
	Menu: { buildFromTemplate(template: MenuItemTemplate[]): unknown };
	nativeImage: {
		createFromPath(path: string): NativeImageLike;
		createFromDataURL(dataUrl: string): NativeImageLike;
	};
	globalShortcut?: {
		register(accelerator: string, callback: () => void): boolean;
		unregister(accelerator: string): void;
		unregisterAll(): void;
		isRegistered(accelerator: string): boolean;
	};
}

export interface NetSocket {
	end(): void;
	destroy(): void;
	on(event: "data", listener: (chunk: Buffer) => void): void;
	on(event: "end", listener: () => void): void;
	on(event: "error", listener: (err: Error) => void): void;
}

export interface NetServer {
	listen(path: string): void;
	close(callback?: () => void): void;
	on(event: "error", listener: (err: Error) => void): void;
}

export interface NetModule {
	createServer(handler: (socket: NetSocket) => void): NetServer;
}

export interface FsModule {
	existsSync(path: string): boolean;
	unlinkSync(path: string): void;
	chmodSync(path: string, mode: number): void;
}

export interface OsModule {
	tmpdir(): string;
}

export interface PathModule {
	join(...parts: string[]): string;
}
