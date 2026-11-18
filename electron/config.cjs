// Тохиргоог хадгалах. API түлхүүрүүдийг Windows-ийн safeStorage (DPAPI)-аар шифрлэнэ.
const { app, safeStorage } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const SECRET_KEYS = ["anthropicKey", "chimegeToken", "chimegeSttToken", "azureKey"];

const DEFAULTS = {
  name: "Эдит",
  anthropicKey: "",
  // Хамгийн чадвартай загвар. Хямд болгох бол claude-sonnet-5-5 эсвэл claude-haiku-5-5.
  model: "claude-opus-5-5",
  // Түлхүүр workspace-д хамааралгүй үед л хэрэгтэй (console.anthropic.com → Workspaces).
  anthropicWorkspaceId: "",
  // "auto": Chimege → бүтэлгүйтвэл Azure. "chimege" эсвэл "azure" гэж тогтоож болно.
  speechProvider: "auto",
  azureKey: "",
  azureRegion: "",
  azureVoice: "mn-MN-YesuiNeural", // эмэгтэй дуу хоолой
  voiceRate: "-6%", // ярих хурд (сөрөг = удаан)
  voicePitch: "+3%", // аялгууны өндөр
  chimegeToken: "", // TTS (ярих)
  chimegeSttToken: "", // STT (сонсох); хоосон бол chimegeToken-ыг ашиглана
  // Chimege-ийн API баримт бичиг console.chimege.com дотор байдаг.
  // Хаяг өөр байвал Тохиргоо → Нарийвчилсан хэсгээс солино.
  chimegeSttUrl: "https://api.chimege.com/v1.2/transcribe",
  chimegeTtsUrl: "https://api.chimege.com/v1.2/synthesize",
  chimegeTokenHeader: "Token",
  // Эмэгтэй дуу хоолой: FEMALE1, FEMALE1v2 … FEMALE5v2
  chimegeVoice: "FEMALE3v2",
  chimegeSpeed: 0.95, // 1 = хэвийн, бага = удаан
  chimegePitch: 1.05, // 1 = хэвийн, их = өндөр аялгуу
  micDeviceId: "", // хоосон = Windows-ийн анхдагч микрофон
  speak: true,
  autoStart: true,
  showText: false, // ярианы текстийг дэлгэцэнд харуулах эсэх (нууцлал)
  windowX: null, // чирж тавьсан байрлал
  windowY: null,
};

const file = () => path.join(app.getPath("userData"), "config.json");

function encrypt(value) {
  if (!value) return "";
  if (!safeStorage.isEncryptionAvailable()) return "plain:" + value;
  return "enc:" + safeStorage.encryptString(value).toString("base64");
}

function decrypt(value) {
  if (!value) return "";
  if (value.startsWith("plain:")) return value.slice(6);
  if (value.startsWith("enc:")) {
    try {
      return safeStorage.decryptString(Buffer.from(value.slice(4), "base64"));
    } catch {
      return "";
    }
  }
  return value;
}

function load() {
  let raw = {};
  try {
    raw = JSON.parse(fs.readFileSync(file(), "utf8"));
  } catch {
    /* анх удаа ажиллаж байна */
  }
  const cfg = { ...DEFAULTS, ...raw };
  for (const k of SECRET_KEYS) cfg[k] = decrypt(cfg[k]);
  return cfg;
}

function save(partial) {
  const next = { ...load(), ...partial };
  const stored = { ...next };
  for (const k of SECRET_KEYS) stored[k] = encrypt(next[k]);
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(stored, null, 2));
  return next;
}

/** Renderer-т түлхүүрийг өөрийг нь биш, зөвхөн байгаа эсэхийг илгээнэ. */
function publicView(cfg) {
  const view = { ...cfg };
  for (const k of SECRET_KEYS) {
    view[k] = "";
    view[k + "Set"] = Boolean(cfg[k]);
  }
  const azure = cfg.speechProvider !== "chimege" && cfg.azureKey && cfg.azureRegion;
  const chimege = cfg.speechProvider !== "azure";
  view.canSpeak = Boolean((chimege && cfg.chimegeToken) || azure);
  view.canListen = Boolean((chimege && (cfg.chimegeSttToken || cfg.chimegeToken)) || azure);
  return view;
}

module.exports = { load, save, publicView, DEFAULTS };
