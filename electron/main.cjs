const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  globalShortcut,
  ipcMain,
  nativeImage,
  screen,
  session,
} = require("electron");
const path = require("node:path");
const config = require("./config.cjs");
const brain = require("./brain.cjs");
const speech = require("./speech.cjs");

const HOTKEY = "CommandOrControl+Shift+Space";
const WIDTH = 320;
const HEIGHT = 520;

let win = null;
let tray = null;

// Товчлуураар (хулганы товшилтгүй) эхлүүлсэн үед ч микрофон, дуу шууд ажиллахын тулд.
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

// Нэг л удаа ажиллана: дахин нээвэл байгаа цонхыг харуулна.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => showWindow());
}

/** Хадгалсан байрлал одоо байгаа дэлгэцүүдийн аль нэг дээр байвал түүнийг, үгүй бол баруун доод булан. */
function startPosition() {
  const { windowX, windowY } = config.load();
  if (Number.isFinite(windowX) && Number.isFinite(windowY)) {
    const visible = screen.getAllDisplays().some(({ workArea: a }) =>
      windowX + WIDTH / 2 >= a.x && windowX + WIDTH / 2 <= a.x + a.width &&
      windowY + HEIGHT / 2 >= a.y && windowY + HEIGHT / 2 <= a.y + a.height);
    if (visible) return { x: windowX, y: windowY };
  }
  const { workArea } = screen.getPrimaryDisplay();
  return {
    x: workArea.x + workArea.width - WIDTH - 16,
    y: workArea.y + workArea.height - HEIGHT - 8,
  };
}

function createWindow() {
  const pos = startPosition();
  win = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    x: pos.x,
    y: pos.y,
    transparent: true,
    frame: false,
    resizable: false,
    hasShadow: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      // Тунгалаг, үргэлж дээр байх цонхыг Windows "далд" гэж үзээд хөдөлгөөн,
      // аудиог удаашруулахаас сэргийлнэ.
      backgroundThrottling: false,
    },
  });
  win.setAlwaysOnTop(true, "floating");

  if (process.env.VITE_DEV) {
    win.loadURL("http://localhost:5173");
  } else {
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

function showWindow() {
  if (!win) return;
  win.showInactive();
  win.show();
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, "tray.png"));
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.setToolTip(config.load().name);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Харуулах", click: showWindow },
      { label: "Нуух", click: () => win?.hide() },
      { label: "Ярианы түүхийг арилгах", click: () => brain.clearMemory() },
      { type: "separator" },
      { label: "Гарах", click: () => app.quit() },
    ]),
  );
  tray.on("click", () => (win?.isVisible() ? win.hide() : showWindow()));
}

function applyAutoStart(enabled) {
  // Зөвхөн суулгасан (installer) хувилбарт Windows асахад автоматаар асна.
  if (!app.isPackaged) return;
  app.setLoginItemSettings({ openAtLogin: Boolean(enabled) });
}

// ---------- Renderer-тэй харилцах ----------

ipcMain.handle("config:get", () => config.publicView(config.load()));

ipcMain.handle("config:set", (_e, partial) => {
  // Хоосон талбар ирвэл хуучин түлхүүрийг хэвээр үлдээнэ.
  const clean = { ...partial };
  for (const k of ["anthropicKey", "chimegeToken", "chimegeSttToken", "azureKey"]) if (!clean[k]) delete clean[k];
  const next = config.save(clean);
  applyAutoStart(next.autoStart);
  tray?.setToolTip(next.name);
  return config.publicView(next);
});

// Зөвшөөрөл асуух: renderer дээр карт гаргаж, хэрэглэгчийн хариуг хүлээнэ.
let confirmSeq = 0;
const pendingConfirms = new Map();

function confirm(text) {
  if (!win) return Promise.resolve(false);
  showWindow();
  const id = ++confirmSeq;
  return new Promise((resolve) => {
    pendingConfirms.set(id, resolve);
    win.webContents.send("confirm:request", { id, text });
    // 2 минут хариу өгөхгүй бол татгалзсанд тооцно.
    setTimeout(() => {
      if (pendingConfirms.delete(id)) resolve(false);
    }, 120000);
  });
}

ipcMain.on("confirm:response", (_e, { id, ok }) => {
  const resolve = pendingConfirms.get(id);
  pendingConfirms.delete(id);
  resolve?.(Boolean(ok));
});

const agentContext = {
  status: (text) => win?.webContents.send("status", text),
  confirm,
  announce: (text) => {
    showWindow();
    win?.webContents.send("announce", text);
  },
};

ipcMain.handle("ask", (_e, text) => brain.ask(config.load(), String(text), agentContext));
ipcMain.handle("stt", (_e, wav) => speech.transcribe(config.load(), wav));
ipcMain.handle("tts", (_e, text, voice) => {
  const cfg = config.load();
  // Тохиргоонд дуу хоолой сонгохдоо хадгалахаас өмнө урьдчилж сонсох боломж.
  if (voice && typeof voice === "object") {
    for (const k of ["chimegeVoice", "chimegeSpeed", "chimegePitch", "azureVoice", "speechProvider"]) {
      if (voice[k] !== undefined) cfg[k] = voice[k];
    }
    for (const k of ["chimegeToken", "azureKey", "azureRegion"]) if (voice[k]) cfg[k] = voice[k];
  }
  return speech.synthesize(cfg, String(text));
});
ipcMain.handle("memory:clear", () => brain.clearMemory());
ipcMain.on("window:hide", () => win?.hide());

// Бөмбөлгийг чирэх: renderer курсорын шилжилтийг илгээж, цонхыг зөөнө.
ipcMain.handle("window:get-pos", () => win?.getPosition() ?? [0, 0]);
ipcMain.on("window:set-pos", (_e, x, y) => {
  // setPosition нь бүхэл тоо шаарддаг; хэмжээ өөрчлөгдөхөөс сэргийлж setBounds ашиглана.
  win?.setBounds({ x: Math.round(x), y: Math.round(y), width: WIDTH, height: HEIGHT });
});
ipcMain.on("window:save-pos", () => {
  if (!win) return;
  const [x, y] = win.getPosition();
  config.save({ windowX: x, windowY: y });
});

// ---------- Эхлүүлэх ----------

app.whenReady().then(() => {
  // Микрофон ашиглахыг зөвшөөрнө (зөвхөн манай цонхонд).
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => {
    cb(permission === "media");
  });

  createWindow();
  createTray();
  applyAutoStart(config.load().autoStart);

  globalShortcut.register(HOTKEY, () => {
    showWindow();
    win?.webContents.send("hotkey");
  });
});

app.on("will-quit", () => globalShortcut.unregisterAll());
app.on("window-all-closed", (e) => e.preventDefault());
