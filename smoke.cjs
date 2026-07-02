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
class Setting { constructor(){} setName(){return this;} setDesc(){return this;} addToggle(cb){cb({setValue(){return this;},onChange(){return this;}});return this;} addText(cb){cb({setPlaceholder(){return this;},setValue(){return this;},onChange(){return this;}});return this;} }
let notices=[]; class Notice { constructor(m){ notices.push(m); } }
const moment = () => ({ format(){ return "2026-01-01 000000"; } });
const obsidianStub = { Plugin, PluginSettingTab, Setting, Notice, App: class {}, moment };

// ── @electron/remote stub ──
const log = { listeners:{}, hidden:0, shown:0, focused:0, trayCreated:0, trayDestroyed:0, prevented:0, quit:0 };
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
// app (main process) event registry — for validating single-instance (relaunch) paths.
const appEvents = {};
const remoteStub = { getCurrentWindow(){ return fakeWin; }, Tray, Menu, nativeImage, app:{
  quit(){log.quit++;}, relaunch(){}, exit(){}, dock:{show(){}},
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

const PluginClass = require("./main.js").default || require("./main.js");
// ── fake vault/workspace (in-memory) for quick-note test ──
const vaultFiles = new Map();
const openedFiles = [];
const fakeVault = {
  getName(){ return "TestVault"; },
  getAbstractFileByPath(p){ return vaultFiles.has(p) ? { path:p } : null; },
  async read(file){ return vaultFiles.get(file.path) ?? ""; },
  async create(path, data){ vaultFiles.set(path, data); return { path }; },
  async createFolder(path){ vaultFiles.set(path+"/.folder", ""); },
};
const fakeWorkspace = { getLeaf(){ return { async openFile(f){ openedFiles.push(f.path); } }; } };
const app = { vault: fakeVault, workspace: fakeWorkspace };
const p = new PluginClass(app, { id:"obsidian-still-running" });

(async () => {
  let fail=0; const ok=(c,m)=>{ console.log((c?"  PASS":"  FAIL")+" — "+m); if(!c)fail++; };
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
  //   When relaunching from taskbar, second-instance → restore existing window + hide vault selection dialog immediately.
  ok((appEvents["second-instance"]||[]).length===1, "second-instance listener registered");
  ok((appEvents["browser-window-created"]||[]).length===1, "browser-window-created listener registered");
  const shownBefore=log.shown, quitBefore=log.quit;
  remoteStub.app._emit("second-instance");
  ok(log.shown>shownBefore, "relaunch restores existing window (show)");
  // Vault selection dialog created shortly after by Obsidian (new window, id=2) — supports show/ready-to-show events.
  const picker={ id:2, _visible:true, hidden:0, closed:0, skipTaskbar:false, _ev:{},
    on(ev,fn){ (this._ev[ev]=this._ev[ev]||[]).push(fn); },
    fire(ev){ (this._ev[ev]||[]).forEach(f=>f()); },
    hide(){ this._visible=false; this.hidden++; }, close(){ this.closed++; },
    setSkipTaskbar(v){ this.skipTaskbar=v; },
    isDestroyed(){ return this.closed>0; }, isVisible(){ return this._visible; } };
  remoteStub.app._emit("browser-window-created", {preventDefault(){}}, picker);
  picker.fire("ready-to-show");
  picker.fire("show");
  ok(picker.hidden>=1 && picker._visible===false, "vault selection dialog: hidden immediately when shown (prevents flicker)");
  await new Promise(r=>setTimeout(r,220));
  ok(picker.closed===0, "vault selection dialog: not closed (prevents window-all-closed exit flow)");
  ok(picker.skipTaskbar===true, "vault selection dialog: excluded from taskbar");
  ok(log.quit===quitBefore, "★exit regression prevention: existing Obsidian not quit/closed (quit not called)");
  // onunload: complete cleanup (no leaks)
  p.onunload();
  ok((appEvents["second-instance"]||[]).length===0 && (appEvents["browser-window-created"]||[]).length===0, "onunload: single-instance listeners removed (no leaks)");
  ok((log.listeners["close"]||[]).length===0, "onunload: close listener removed (no leaks)");
  ok(log.trayDestroyed===1, "onunload: tray destroyed");
  // quitCompletely: bypass reallyQuitting then close
  const p2 = new PluginClass(app, {id:"obsidian-still-running"}); await p2.onload();
  p2.quitCompletely();
  ok(log.quit>=1, "quitCompletely: real quit path called");
  // Close interception bypass verification: in reallyQuitting state, close event → preventDefault not called
  let prevented2=false; (log.listeners["close"]||[]).forEach(fn=>fn({preventDefault(){prevented2=true;}}));
  ok(prevented2===false, "reallyQuitting bypasses close interception");
  p2.onunload();

  // ── External toggle (local socket) ── Uses real Node net/fs (no Electron needed, pure IPC validation).
  const net = require("net");
  const fsReal = require("fs");
  const p3 = new PluginClass(app, { id:"obsidian-still-running" });
  await p3.onload();
  p3.settings.enableExternalToggle = true;
  await p3.refreshIpcServer();
  const sockPath = p3.socketPath;
  ok(!!sockPath && fsReal.existsSync(sockPath), "external toggle: socket file created");
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

  // ── Start minimized to tray ──
  fakeWin._visible = true;
  const p5 = new PluginClass(app, { id:"obsidian-still-running" });
  p5._data = { startMinimized: true };
  await p5.onload();
  ok(fakeWin._visible===false, "startMinimized: window hidden on load");
  p5.onunload();

  console.log(fail===0 ? "\nALL PASS" : `\n${fail} FAIL`);
  process.exit(fail===0?0:1);
})();
