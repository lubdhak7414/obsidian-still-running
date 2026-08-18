// Load bundled main.js in a stub environment to validate core paths (without Electron runtime).
const Module = require("module");
const origLoad = Module._load;

// ── obsidian stub ──
class Plugin {
  constructor(app, manifest){ this.app=app; this.manifest=manifest; this._commands=[]; this._tabs=[]; this._data={}; }
  addCommand(c){ this._commands.push(c); return c; }
  addSettingTab(t){ this._tabs.push(t); }
  async loadData(){ return this._data; }
  async saveData(d){ this._data=d; }
}
class PluginSettingTab { constructor(app,plugin){ this.app=app; this.plugin=plugin; this.containerEl={empty(){},}; } }
let lastSettings=[];
class Setting { constructor(containerEl){ this.containerEl=containerEl; lastSettings.push(this); } setName(n){this.name=n;return this;} setDesc(d){this.desc=d;return this;} addToggle(cb){cb({setValue(){return this;},onChange(){return this;}});return this;} addText(cb){cb({setPlaceholder(){return this;},setValue(){return this;},onChange(){return this;}});return this;} }
let notices=[]; class Notice { constructor(m){ notices.push(m); } }
const moment = () => ({ format(fmt){
  if (fmt === "YYYY-MM-DD") return "2026-01-01";
  if (fmt === "HHmmss") return "000000";
  if (fmt === "YYYY-MM-DD HHmmss") return "2026-01-01 000000";
  return "2026-01-01 000000";
} });
class TFile { constructor(path){ this.path=path; } }
// Minimal fake DocumentFragment/HTMLElement supporting the subset of the real Obsidian API
// main.ts uses (appendText/createEl, nestable - real Obsidian augments HTMLElement.prototype
// with createEl so elements created via createEl can themselves createEl children), so
// setDesc() fragments built for the settings page can be inspected by tests instead of
// silently degrading to opaque strings.
function makeContainer(){
  const container = { children: [] };
  container.appendText = (t) => { container.children.push({ type:"text", text:t }); };
  container.createEl = (tag, o, callback) => {
    const el = makeContainer();
    Object.assign(el, {
      tag, text:(o&&o.text)||"", href:o&&o.href, cls:o&&o.cls,
      _listeners:{},
      addEventListener(ev,fn){ (this._listeners[ev]=this._listeners[ev]||[]).push(fn); },
      click(){ (this._listeners["click"]||[]).forEach(fn=>fn()); },
    });
    container.children.push({ type:"el", tag, text:el.text, href:el.href, cls:el.cls, el });
    if (callback) callback(el);
    return el;
  };
  return container;
}
function createFragment(cb){
  const frag = makeContainer();
  if (cb) cb(frag);
  return frag;
}
// Real Obsidian sets these to the actual host OS; mirror that off process.platform so the
// OS-specific external-toggle command test exercises whichever branch this machine would.
const Platform = {
  isWin: process.platform === "win32",
  isMacOS: process.platform === "darwin",
  isLinux: process.platform === "linux",
};
function setIcon(el, iconId){ el.icon = iconId; }
let lastClipboardText = null;
// Node has its own built-in read-only `navigator` global (Web Platform API surface) -
// plain assignment silently no-ops, so this needs defineProperty to actually override it.
Object.defineProperty(global, "navigator", {
  value: { clipboard: { writeText(t){ lastClipboardText = t; return Promise.resolve(); } } },
  configurable: true, writable: true,
});
const obsidianStub = { Plugin, PluginSettingTab, Setting, Notice, App: class {}, moment, TFile, Platform, setIcon };

// ── @electron/remote stub ──
const log = { listeners:{}, hidden:0, shown:0, focused:0, trayCreated:0, trayDestroyed:0, prevented:0, quit:0, appQuit:0 };
const fakeWin = {
  _visible:true, _min:false,
  on(ev,fn){ (log.listeners[ev]=log.listeners[ev]||[]).push(fn); },
  removeListener(ev,fn){ log.listeners[ev]=(log.listeners[ev]||[]).filter(f=>f!==fn); },
  hide(){ this._visible=false; log.hidden++; },
  show(){ this._visible=true; log.shown++; },
  focus(){ log.focused++; },
  isVisible(){ return this._visible; }, isMinimized(){ return this._min; }, restore(){ this._min=false; },
  close(){ log.quit++; }, setSkipTaskbar(){}, isDestroyed(){ return false; }, id:1,
};
class Tray { constructor(i){ this.icon=i; log.trayCreated++; } setToolTip(t){ log.tooltip=t; } setContextMenu(){} on(){} destroy(){ log.trayDestroyed++; } }
const Menu = { buildFromTemplate(t){ return {_t:t}; } };
const nativeImage = { createFromPath(){ return {isEmpty(){return true;}}; }, createFromDataURL(){ return {isEmpty(){return false;}}; }, createEmpty(){ return {}; } };
// app (main process) event registry - for validating single-instance (relaunch) paths.
const appEvents = {};
const gsLog = { registered: null, unregistered: [] };
const remoteStub = { getCurrentWindow(){ return fakeWin; }, Tray, Menu, nativeImage,
  globalShortcut: {
    register(acc, cb){ gsLog.registered = acc; log.gsRegistered = acc; return true; },
    unregister(acc){ gsLog.unregistered.push(acc); },
    unregisterAll(){ gsLog.registered = null; },
    isRegistered(acc){ return gsLog.registered === acc; },
  },
  app:{
  quit(){log.quit++; log.appQuit++;}, relaunch(){}, exit(){}, dock:{show(){}, hide(){}},
  async getFileIcon(){ return {isEmpty(){return true;}}; },
  prependListener(ev,fn){ (appEvents[ev]=appEvents[ev]||[]).unshift(fn); },
  on(ev,fn){ (appEvents[ev]=appEvents[ev]||[]).push(fn); },
  removeListener(ev,fn){ appEvents[ev]=(appEvents[ev]||[]).filter(f=>f!==fn); },
  _emit(ev,...args){ (appEvents[ev]||[]).slice().forEach(fn=>fn(...args)); },
} };

Module._load = function(req, parent, isMain){
  if (req === "obsidian") return obsidianStub;
  if (req === "@electron/remote") return remoteStub;
  if (req === "electron") return { remote: remoteStub };
  return origLoad.apply(this, arguments);
};

// ── window global stub ── Mimic renderer's window.require / beforeunload / setTimeout.
const _winListeners = {};
global.window = {
  require,
  addEventListener(ev, fn){ (_winListeners[ev]=_winListeners[ev]||[]).push(fn); },
  removeEventListener(ev, fn){ _winListeners[ev]=(_winListeners[ev]||[]).filter(f=>f!==fn); },
  setTimeout: (fn, t) => setTimeout(fn, t),
};
// Obsidian's own renderer bootstrap defines createFragment as a real global (not a module
// export) - main.ts relies on that, so the stub environment must provide it the same way.
global.createFragment = createFragment;

const PluginClass = require("./main.js").default || require("./main.js");
// ── fake vault/workspace (in-memory) for quick-note test ──
const vaultFiles = new Map();
const vaultFolders = new Set();
const openedFiles = [];
class TFolder { constructor(path){ this.path=path; } }
const fakeVault = {
  getName(){ return "TestVault"; },
  getAbstractFileByPath(p){
    if (vaultFolders.has(p)) return new TFolder(p);
    return vaultFiles.has(p) ? new TFile(p) : null;
  },
  async read(file){ return vaultFiles.get(file.path) ?? ""; },
  async create(path, data){ vaultFiles.set(path, data); return new TFile(path); },
  async createFolder(path){ vaultFolders.add(path); },
};
const fakeWorkspace = { getLeaf(){ return { async openFile(f){ openedFiles.push(f.path); } }; } };
const app = { vault: fakeVault, workspace: fakeWorkspace };
const p = new PluginClass(app, { id:"obsidian-still-running" });

// Fake secondary BrowserWindow (vault picker / popout pane / another vault's window).
// _url mirrors webContents.getURL(): "" until the fake page load completes - real windows
// are created hidden and can't become visible before their load resolves, at which point
// their URL is readable. finishLoadAndShow() mirrors Obsidian's own
// `win.loadURL(url).then(() => win.show())` sequence.
function makeSecondaryWindow(id){
  const w = { id, _visible:false, _url:"", hidden:0, closed:0, skipTaskbar:false, _ev:{},
    on(ev,fn){ (w._ev[ev]=w._ev[ev]||[]).push(fn); },
    removeListener(ev,fn){ w._ev[ev]=(w._ev[ev]||[]).filter(f=>f!==fn); },
    fire(ev){ (w._ev[ev]||[]).slice().forEach(f=>f()); },
    hide(){ w._visible=false; w.hidden++; }, show(){ w._visible=true; },
    close(){ w.closed++; },
    setSkipTaskbar(v){ w.skipTaskbar=v; },
    isDestroyed(){ return w.closed>0; }, isVisible(){ return w._visible; },
    webContents: { getURL(){ return w._url; } },
    finishLoadAndShow(url){ w._url=url; w._visible=true; w.fire("show"); },
  };
  return w;
}
const STARTER_URL = "app://obsidian.md/starter.html";

(async () => {
  let fail=0; const ok=(c,m)=>{ console.log((c?"  PASS":"  FAIL")+" - "+m); if(!c)fail++; };
  await p.onload();
  ok(log.trayCreated===1, "Tray created (1)");
  ok((log.listeners["close"]||[]).length===1, "close listener registered (1)");
  ok(p._commands.length===0, "no commands registered (single-purpose, hotkey buttons removed)");
  // Close simulation: runInBackground default ON → preventDefault + hide
  let prevented=false; const ev={preventDefault(){prevented=true;}};
  (log.listeners["close"]||[]).forEach(fn=>fn(ev));
  ok(prevented===true, "close interception: preventDefault called");
  ok(log.hidden===1, "close hides window");
  // toggle: now hidden → show+focus
  p.toggleWindow();
  ok(log.shown===1 && log.focused===1, "toggleWindow restores window");
  // ── Tray tooltip default (task 1) ──
  ok(log.tooltip==="TestVault - Still Running", "tray tooltip = '<vault> - Still Running'");
  // ── Single-instance relaunch flicker fix (task 2) ──
  //   When relaunching while hidden in the tray, Obsidian's own relaunch path (not Electron's
  //   "second-instance" - see main.ts comment) creates a vault-picker window. We gate
  //   interception on "is our window currently hidden", not on second-instance having fired
  //   first (that race is the actual bug this test now guards against), so simulate the real
  //   pre-condition: our window hidden in the tray before the picker ever appears.
  fakeWin.hide();
  ok((appEvents["second-instance"]||[]).length===1, "second-instance listener registered");
  ok((appEvents["browser-window-created"]||[]).length===1, "browser-window-created listener registered");
  const shownBefore=log.shown, quitBefore=log.quit;
  remoteStub.app._emit("second-instance");
  ok(log.shown>shownBefore, "relaunch restores existing window (show)");
  // Vault selection dialog created shortly after by Obsidian (new window, id=2) - supports show/ready-to-show events.
  const picker = makeSecondaryWindow(2);
  remoteStub.app._emit("browser-window-created", {preventDefault(){}}, picker);
  picker.fire("ready-to-show");
  picker.finishLoadAndShow(STARTER_URL);
  ok(picker.hidden>=1 && picker._visible===false, "vault selection dialog: hidden immediately when shown (prevents flicker)");
  await new Promise(r=>setTimeout(r,220));
  ok(picker.closed===0, "vault selection dialog: not closed (prevents window-all-closed exit flow)");
  ok(picker.skipTaskbar===true, "vault selection dialog: excluded from taskbar");
  const hiddenAfterSettle = picker.hidden;
  // Obsidian's own picker code shows the window asynchronously - only after its starter.html
  // load resolves - which can land after our own hide attempts have already run. hidePicker
  // must NOT have removed its listeners by then, or this later, real .show() call would sail
  // through unguarded and leave the picker fully visible (this was the actual regression).
  picker._visible = true;
  picker.fire("show");
  ok(picker.hidden>hiddenAfterSettle && picker._visible===false, "vault selection dialog: a late show() (Obsidian's own loadURL-resolution show, arriving after our hide attempts) is still caught and re-hidden");
  ok(log.quit===quitBefore, "★exit regression prevention: existing Obsidian not quit/closed (quit not called)");
  // A second, later window while our own window is visible again (e.g. a legitimate popout
  // pane the user opens right after relaunching) must NOT be caught by the picker-hiding
  // logic - the hidden-state gate rejects it before any listeners are even attached.
  const popout = makeSecondaryWindow(3);
  remoteStub.app._emit("browser-window-created", {preventDefault(){}}, popout);
  popout.finishLoadAndShow("app://obsidian.md/index.html");
  ok(popout.hidden===0 && popout.skipTaskbar===false && popout._visible===true, "single-instance: later window while we're visible again is left untouched");
  // onunload: complete cleanup (no leaks)
  p.onunload();
  ok((appEvents["second-instance"]||[]).length===0 && (appEvents["browser-window-created"]||[]).length===0, "onunload: single-instance listeners removed (no leaks)");
  ok((log.listeners["close"]||[]).length===0, "onunload: close listener removed (no leaks)");
  ok(log.trayDestroyed===1, "onunload: tray destroyed");

  // ── Single-instance: picker created WITHOUT second-instance ever firing ──
  // This is the actual reported bug: Obsidian's real relaunch path on Linux/macOS goes
  // through its own .obsidian-cli.sock protocol, not Electron's "second-instance" event -
  // so the picker window can (and does) show up with no "second-instance" signal at all.
  // Interception must not depend on that event having fired first.
  const p8 = new PluginClass(app, { id:"obsidian-still-running" });
  await p8.onload();
  fakeWin.hide();
  // Deliberately never emit "second-instance" here - only the picker window shows up,
  // mirroring the real .obsidian-cli.sock-only relaunch path.
  const picker2 = makeSecondaryWindow(2);
  remoteStub.app._emit("browser-window-created", {preventDefault(){}}, picker2);
  picker2.fire("ready-to-show");
  picker2.finishLoadAndShow(STARTER_URL);
  ok(picker2.hidden>=1 && picker2._visible===false, "picker-without-second-instance: picker still intercepted purely from our window being hidden");
  ok(picker2.skipTaskbar===true, "picker-without-second-instance: picker skip-taskbarred once its starter.html URL identifies it");
  await new Promise(r=>setTimeout(r,220));
  ok(picker2.closed===0, "picker-without-second-instance: picker not closed (avoids window-all-closed exit flow)");
  ok(fakeWin._visible===true, "picker-without-second-instance: our own window is restored to the front regardless");

  // ── Single-instance: URL veto - a non-picker window created while we're hidden is spared ──
  // The hidden-state gate alone would false-positive on e.g. another vault's window opened
  // via an obsidian:// URI while we sit in the tray. Once the new window's URL is readable
  // and is NOT starter.html, it must be left alone (and must not get skip-taskbarred).
  fakeWin.hide();
  const otherVault = makeSecondaryWindow(5);
  remoteStub.app._emit("browser-window-created", {preventDefault(){}}, otherVault);
  otherVault.finishLoadAndShow("app://obsidian.md/index.html");
  ok(otherVault._visible===true, "url veto: non-picker window created while hidden stays visible once its URL identifies it");
  await new Promise(r=>setTimeout(r,220));
  ok(otherVault._visible===true && otherVault.hidden===0 && otherVault.skipTaskbar===false, "url veto: 0ms/150ms fallback hides also spare it (never hidden, never skip-taskbarred)");
  p8.onunload();

  // ── Regression guard: single-instance failure must never take down tray/close/hide ──
  // The real-world regression this guards: a remote-proxy access throwing inside
  // registerSingleInstance() aborted onload() before createTray()/createIpcServer()/
  // addSettingTab() ever ran - the untouched core features all died with it. Simulate a
  // hostile remote proxy (property access itself throws) and assert the rest of onload
  // still completes.
  const pCrash = new PluginClass(app, { id:"obsidian-still-running" });
  const trayBefore9 = log.trayCreated;
  const origPrepend = remoteStub.app.prependListener;
  Object.defineProperty(remoteStub.app, "prependListener", {
    configurable: true,
    get(){ throw new Error("remote proxy exploded"); },
  });
  await pCrash.onload();
  Object.defineProperty(remoteStub.app, "prependListener", {
    configurable: true, writable: true, enumerable: true, value: origPrepend,
  });
  ok(log.trayCreated===trayBefore9+1, "single-instance crash containment: tray still created");
  ok((log.listeners["close"]||[]).length===1, "single-instance crash containment: close interception still registered");
  ok(pCrash._tabs.length===1, "single-instance crash containment: settings tab still added (onload ran to completion)");
  ok((appEvents["browser-window-created"]||[]).length===1, "single-instance crash containment: window-created hook still degrades gracefully (registered despite second-instance failure)");
  pCrash.onunload();
  ok((appEvents["browser-window-created"]||[]).length===0, "single-instance crash containment: degraded registration still cleaned up on unload");

  // ── beforeunload / reload-hijack guard ──
  // closeEventFired must be *consumed* by beforeunload, not just time-gated, so a reload
  // fired shortly after a hide-to-tray isn't itself hijacked into another hide.
  const p6 = new PluginClass(app, { id:"obsidian-still-running" });
  await p6.onload();
  (log.listeners["close"]||[]).forEach(fn=>fn({preventDefault(){}})); // real close → sets closeEventFired
  let bu1Prevented=false;
  (_winListeners["beforeunload"]||[]).forEach(fn=>fn({preventDefault(){bu1Prevented=true;}}));
  ok(bu1Prevented===true, "beforeunload: real close is intercepted (hide to tray)");
  let bu2Prevented=false;
  (_winListeners["beforeunload"]||[]).forEach(fn=>fn({preventDefault(){bu2Prevented=true;}}));
  ok(bu2Prevented===false, "beforeunload: flag consumed - an immediate reload after is NOT hijacked into another hide");
  p6.onunload();

  // quitCompletely: bypass reallyQuitting then quit
  const p2 = new PluginClass(app, {id:"obsidian-still-running"}); await p2.onload();
  const appQuitBefore2 = log.appQuit;
  p2.quitCompletely();
  ok(log.appQuit>appQuitBefore2, "quitCompletely: app.quit() called (not just win.close())");
  // Close interception bypass verification: in reallyQuitting state, close event → preventDefault not called
  let prevented2=false; (log.listeners["close"]||[]).forEach(fn=>fn({preventDefault(){prevented2=true;}}));
  ok(prevented2===false, "reallyQuitting bypasses close interception");
  p2.onunload();

  // quitCompletely: regression guard - a suppressed relaunch vault-picker window is kept
  // alive-but-hidden (see interceptPossiblePickerWindow), so win.close() on our own window
  // alone would leave that hidden window open and the process would never actually exit
  // (observed regression: user had to `pkill` Obsidian after "Quit completely" did nothing).
  // app.quit() must be the mechanism used, since only it tears down every window.
  const p9 = new PluginClass(app, { id:"obsidian-still-running" });
  await p9.onload();
  fakeWin.hide();
  const lingeringPicker = makeSecondaryWindow(9);
  remoteStub.app._emit("browser-window-created", {preventDefault(){}}, lingeringPicker);
  lingeringPicker.finishLoadAndShow(STARTER_URL);
  fakeWin.show();
  const appQuitBefore3 = log.appQuit;
  p9.quitCompletely();
  ok(log.appQuit>appQuitBefore3, "quitCompletely: app.quit() still used even with a lingering hidden picker window (would otherwise zombie)");
  p9.onunload();

  // quitCompletely: if BOTH quit paths fail, reallyQuitting must reset (else hide-to-tray breaks forever)
  const p7 = new PluginClass(app, { id:"obsidian-still-running" });
  await p7.onload();
  const origClose = fakeWin.close, origQuit = remoteStub.app.quit;
  fakeWin.close = () => { throw new Error("boom"); };
  remoteStub.app.quit = () => { throw new Error("boom"); };
  p7.quitCompletely();
  fakeWin.close = origClose; remoteStub.app.quit = origQuit;
  let prevented3=false;
  (log.listeners["close"]||[]).forEach(fn=>fn({preventDefault(){prevented3=true;}}));
  ok(prevented3===true, "quitCompletely: reallyQuitting resets after total quit failure");
  p7.onunload();

  // ── External toggle (local socket) ── Uses real Node net/fs (no Electron needed, pure IPC validation).
  const net = require("net");
  const fsReal = require("fs");
  const p3 = new PluginClass(app, { id:"obsidian-still-running" });
  await p3.onload();
  p3.settings.enableExternalToggle = true;
  await p3.refreshIpcServer();
  const sockPath = p3.socketPath;
  ok(!!sockPath && fsReal.existsSync(sockPath), "external toggle: socket file created");
  if (process.platform !== "win32") {
    const mode = fsReal.statSync(sockPath).mode & 0o777;
    ok(mode === 0o600, "external toggle: socket file restricted to owner (0600), not world-readable");
  }
  const shownBefore3 = log.shown, hiddenBefore3 = log.hidden;
  await new Promise((resolve, reject) => {
    const client = net.createConnection(sockPath, () => client.end());
    client.on("close", resolve);
    client.on("error", reject);
  });
  await new Promise((r) => setTimeout(r, 20));
  ok(log.shown > shownBefore3 || log.hidden > hiddenBefore3, "external toggle: socket connection triggers toggleWindow");
  p3.onunload();
  ok(!fsReal.existsSync(sockPath), "onunload: socket file cleaned (no leaks)");

  // Recreating should not fail due to stale socket remnants (prepares for abnormal exit + stale socket).
  const p4 = new PluginClass(app, { id:"obsidian-still-running" });
  await p4.onload();
  p4.settings.enableExternalToggle = true;
  await p4.refreshIpcServer();
  ok(!!p4.socketPath && fsReal.existsSync(p4.socketPath), "external toggle: recreate succeeds despite stale socket");
  p4.onunload();

  // ── Quick note ──
  const pNote = new PluginClass(app, { id:"obsidian-still-running" });
  pNote._data = { quickNoteFolder:"Inbox", quickNoteTemplatePath:"" };
  await pNote.onload();
  const filesBefore = vaultFiles.size;
  await pNote.createQuickNote();
  ok(vaultFiles.size > filesBefore, "createQuickNote: file created in vault");
  ok([...vaultFiles.keys()].some(k=>k.startsWith("Inbox/") && k.endsWith(".md")), "createQuickNote: created under configured folder");
  ok(openedFiles.length>0, "createQuickNote: opened the new file");
  // external toggle: "note" command over the socket
  pNote.settings.enableExternalToggle = true;
  await pNote.refreshIpcServer();
  const openedBefore = openedFiles.length;
  await new Promise((resolve, reject) => {
    const client = net.createConnection(pNote.socketPath, () => client.end("note"));
    client.on("close", resolve);
    client.on("error", reject);
  });
  await new Promise((r) => setTimeout(r, 20));
  ok(openedFiles.length > openedBefore, "external toggle: 'note' command creates a quick note");
  pNote.onunload();

  // template path pointing at a folder must not abort note creation (falls back to blank)
  vaultFolders.add("Templates");
  const pNote2 = new PluginClass(app, { id:"obsidian-still-running" });
  pNote2._data = { quickNoteTemplatePath: "Templates" };
  await pNote2.onload();
  const filesBefore2 = vaultFiles.size;
  await pNote2.createQuickNote();
  ok(vaultFiles.size > filesBefore2, "createQuickNote: template-path-is-a-folder falls back to blank note (no abort)");
  pNote2.onunload();

  // ".." in the configured folder must not escape the vault root
  const pNote4 = new PluginClass(app, { id:"obsidian-still-running" });
  pNote4._data = { quickNoteFolder: "../../etc" };
  await pNote4.onload();
  await pNote4.createQuickNote();
  ok(![...vaultFiles.keys()].some(k=>k.includes("..")), "createQuickNote: '..' in folder setting is stripped");
  pNote4.onunload();

  // Windows-style backslash-separated folder path must be split like "/"
  const pNote5 = new PluginClass(app, { id:"obsidian-still-running" });
  pNote5._data = { quickNoteFolder: "Inbox\\Sub" };
  await pNote5.onload();
  await pNote5.createQuickNote();
  ok([...vaultFiles.keys()].some(k=>k.startsWith("Inbox/Sub/") && k.endsWith(".md")), "createQuickNote: backslash-separated folder path is split like '/'");
  pNote5.onunload();

  // ".." segments stripped even when backslash-separated
  const pNote6 = new PluginClass(app, { id:"obsidian-still-running" });
  pNote6._data = { quickNoteFolder: "..\\..\\etc" };
  await pNote6.onload();
  await pNote6.createQuickNote();
  ok(![...vaultFiles.keys()].some(k=>k.includes("..")), "createQuickNote: '..' stripped even when backslash-separated");
  pNote6.onunload();

  // two notes created within the same second (same moment() stamp) must not collide
  const pNote3 = new PluginClass(app, { id:"obsidian-still-running" });
  await pNote3.onload();
  const filesBefore3 = vaultFiles.size;
  await pNote3.createQuickNote();
  await pNote3.createQuickNote();
  ok(vaultFiles.size === filesBefore3 + 2, "createQuickNote: same-second collision creates two distinct files");
  pNote3.onunload();

  // ── Start minimized to tray ──
  fakeWin._visible = true;
  const p5 = new PluginClass(app, { id:"obsidian-still-running" });
  p5._data = { startMinimized: true };
  await p5.onload();
  ok(fakeWin._visible===false, "startMinimized: window hidden on load");
  p5.onunload();

  // ── New note brings the window to front regardless of its current state ──
  const pNoteFront = new PluginClass(app, { id:"obsidian-still-running" });
  await pNoteFront.onload();
  fakeWin._visible = true; fakeWin._min = false;
  const shownBefore4 = log.shown, focusedBefore4 = log.focused;
  await pNoteFront.createQuickNote();
  ok(log.shown>shownBefore4 && log.focused>focusedBefore4, "createQuickNote: brings an already-visible window to front too, not just hidden ones");
  fakeWin.hide();
  const shownBefore5 = log.shown, focusedBefore5 = log.focused;
  await pNoteFront.createQuickNote();
  ok(log.shown>shownBefore5 && log.focused>focusedBefore5 && fakeWin._visible===true, "createQuickNote: also shows/focuses when the window was hidden");
  pNoteFront.onunload();

  // ── Settings page: external-toggle help must be a real hyperlink with a real line break ──
  const pSettings = new PluginClass(app, { id:"obsidian-still-running" });
  await pSettings.onload();
  lastSettings.length = 0;
  pSettings._tabs[0].display();
  const extToggleSetting = lastSettings.find(s => s.name === "Enable external toggle (advanced)");
  ok(!!extToggleSetting, "settings: external toggle setting is rendered");
  const helpFrag = extToggleSetting && extToggleSetting.desc;
  const helpLink = helpFrag && helpFrag.children.find(c => c.type==="el" && c.tag==="a");
  ok(!!helpLink, "settings: keyboard shortcut help renders as a real <a> hyperlink, not plain text");
  ok(helpLink && helpLink.href === "https://github.com/lubdhak7414/obsidian-still-running#show--hide-or-create-a-note-with-a-global-keyboard-shortcut", "settings: help link points at the correct (non-broken) README anchor");
  const helpBrCount = helpFrag ? helpFrag.children.filter(c=>c.type==="el"&&c.tag==="br").length : 0;
  ok(helpBrCount>=1, "settings: description uses real <br> line breaks, not a literal \\n (which doesn't render in HTML)");
  pSettings.onunload();

  // ── Settings page (external toggle enabled): OS-specific, individually copyable commands ──
  const pSettingsOn = new PluginClass(app, { id:"obsidian-still-running" });
  pSettingsOn._data = { enableExternalToggle: true };
  await pSettingsOn.onload();
  lastSettings.length = 0;
  pSettingsOn._tabs[0].display();
  const extToggleOn = lastSettings.find(s => s.name === "Enable external toggle (advanced)");
  const onFrag = extToggleOn && extToggleOn.desc;
  const rows = onFrag ? onFrag.children.filter(c=>c.type==="el" && c.cls==="background-tray-command-row").map(c=>c.el) : [];
  ok(rows.length===3, "settings (enabled): socket path + show/hide + new-note commands each render as their own row");
  const codeEls = rows.map(r => r.children.find(c=>c.type==="el" && (c.tag==="code"||c.tag==="pre"))).filter(Boolean);
  ok(codeEls.length===3, "settings (enabled): each row contains a code/pre command element");
  const copyButtons = rows.map(r => r.children.find(c=>c.type==="el" && c.tag==="button")).filter(Boolean);
  ok(copyButtons.length===3, "settings (enabled): each command row has its own copy button");
  if (copyButtons.length===3 && codeEls.length===3) {
    lastClipboardText = null;
    copyButtons[1].el.click();
    ok(lastClipboardText === codeEls[1].text, "settings: copy button copies the exact command shown next to it (not another line's)");
    ok(notices[notices.length-1] === "Copied to clipboard.", "settings: copying shows a confirmation Notice");
    const expectedSubstr = process.platform==="win32" ? "NamedPipeClientStream" : process.platform==="darwin" ? "nc -U" : "socat";
    ok(codeEls[1].text.includes(expectedSubstr), `settings: show/hide command matches this OS (${process.platform})`);
    ok((codeEls[1].tag==="pre") === (process.platform==="win32"), "settings: multi-line (Windows) commands render as <pre> so newlines survive, single-line ones as <code>");
  }
  pSettingsOn.onunload();

  // ── New features: minimize to tray ──
  const pMin = new PluginClass(app, { id:"obsidian-still-running" });
  pMin._data = { minimizeToTray: true };
  await pMin.onload();
  ok((log.listeners["minimize"]||[]).length===1, "minimizeToTray: minimize listener registered when enabled");
  // simulate minimize event -> should hide to tray
  fakeWin._visible = true;
  const hiddenBeforeMin = log.hidden;
  (log.listeners["minimize"]||[]).forEach(fn=>fn({preventDefault(){}}));
  ok(log.hidden > hiddenBeforeMin && fakeWin._visible===false, "minimizeToTray: minimize hides window");
  pMin.onunload();
  ok((log.listeners["minimize"]||[]).length===0, "minimizeToTray: listener removed on unload");
  // disabled case: no listener
  const pMinOff = new PluginClass(app, { id:"obsidian-still-running" });
  pMinOff._data = { minimizeToTray: false };
  await pMinOff.onload();
  ok((log.listeners["minimize"]||[]).length===0, "minimizeToTray: no listener when disabled");
  pMinOff.onunload();

  // ── New features: quick note filename template ──
  const pTpl = new PluginClass(app, { id:"obsidian-still-running" });
  pTpl._data = { quickNoteFilenameTemplate: "Note {{date}}" };
  await pTpl.onload();
  vaultFiles.clear();
  await pTpl.createQuickNote();
  ok([...vaultFiles.keys()].some(k=>k.includes("Note 2026-01-01")), "quickNote filename template: {{date}} rendered");
  vaultFiles.clear();
  pTpl.settings.quickNoteFilenameTemplate = "Bad/Name\\Test";
  await pTpl.createQuickNote();
  ok([...vaultFiles.keys()].some(k=>k.includes("Bad-Name-Test")), "quickNote filename template: slashes sanitized to '-'");
  pTpl.onunload();

  // ── New features: global shortcut ──
  const pGS = new PluginClass(app, { id:"obsidian-still-running" });
  pGS._data = { enableGlobalShortcut: true, globalShortcutAccelerator: "Alt+Shift+O" };
  await pGS.onload();
  ok(gsLog.registered === "Alt+Shift+O", "globalShortcut: registered when enabled");
  pGS.onunload();
  ok(gsLog.unregistered.includes("Alt+Shift+O"), "globalShortcut: unregistered on unload");
  const pGSOff = new PluginClass(app, { id:"obsidian-still-running" });
  pGSOff._data = { enableGlobalShortcut: false };
  await pGSOff.onload();
  gsLog.registered = null;
  ok(gsLog.registered === null, "globalShortcut: not registered when disabled");
  pGSOff.onunload();

  // ── New features: sanitizeSettings robustness ──
  const pSan = new PluginClass(app, { id:"obsidian-still-running" });
  pSan._data = { runInBackground: "notabool", trayTooltip: 123, quickNoteFilenameTemplate: "" };
  await pSan.onload();
  ok(pSan.settings.runInBackground === true, "sanitize: wrong type for runInBackground falls back to default");
  ok(pSan.settings.trayTooltip === "{{vault}} - Still Running", "sanitize: wrong type for trayTooltip falls back");
  ok(pSan.settings.quickNoteFilenameTemplate === "Untitled {{date}} {{time}}", "sanitize: empty filename template falls back");
  pSan.onunload();

  // ── New features: socket path truncation ──
  const pLong = new PluginClass(app, { id:"obsidian-still-running" });
  const longName = "A".repeat(150);
  const origGetName = fakeVault.getName;
  fakeVault.getName = () => longName;
  const sockLong = pLong.getSocketPath();
  ok(sockLong.length <= 110, "socket path truncation: long vault name stays under limit");
  // two similar long names should still be distinct due to hash
  fakeVault.getName = () => longName + "!";
  const sockLong2 = pLong.getSocketPath();
  ok(sockLong !== sockLong2, "socket path truncation: similar long names still distinct (hash)");
  fakeVault.getName = origGetName;
  pLong.onunload();

  console.log(fail===0 ? "\nALL PASS" : `\n${fail} FAIL`);
  process.exit(fail===0?0:1);
})();
