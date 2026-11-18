// Electron preload-оос ирэх API. Браузерт нээвэл (хөгжүүлэлтийн үед) хуурамч хувилбар ашиглана.

export type Config = {
  name: string;
  model: string;
  anthropicWorkspaceId: string;
  anthropicKey: string;
  anthropicKeySet: boolean;
  chimegeToken: string;
  chimegeTokenSet: boolean;
  chimegeSttToken: string;
  chimegeSttTokenSet: boolean;
  canListen: boolean;
  chimegeSttUrl: string;
  chimegeTtsUrl: string;
  chimegeTokenHeader: string;
  speechProvider: "auto" | "chimege" | "azure";
  azureKey: string;
  azureKeySet: boolean;
  azureRegion: string;
  azureVoice: string;
  chimegeVoice: string;
  chimegeSpeed: number;
  chimegePitch: number;
  micDeviceId: string;
  canSpeak: boolean;
  speak: boolean;
  autoStart: boolean;
  showText: boolean;
};

export type ConfirmRequest = { id: number; text: string };

export type EdithApi = {
  getConfig: () => Promise<Config>;
  setConfig: (partial: Partial<Config>) => Promise<Config>;
  ask: (text: string) => Promise<string>;
  transcribe: (wav: ArrayBuffer) => Promise<string>;
  synthesize: (text: string, voice?: Partial<Config>) => Promise<Uint8Array[]>;
  clearMemory: () => Promise<void>;
  hide: () => void;
  getWindowPos: () => Promise<[number, number]>;
  setWindowPos: (x: number, y: number) => void;
  saveWindowPos: () => void;
  onHotkey: (cb: () => void) => () => void;
  onStatus: (cb: (text: string) => void) => () => void;
  onAnnounce: (cb: (text: string) => void) => () => void;
  onConfirm: (cb: (req: ConfirmRequest) => void) => () => void;
  answerConfirm: (id: number, ok: boolean) => void;
};

declare global {
  interface Window {
    edith?: EdithApi;
  }
}

// ---------- Браузерт туршихад зориулсан хуурамч API ----------

type Listener<T> = (v: T) => void;
const mockListeners = {
  status: new Set<Listener<string>>(),
  confirm: new Set<Listener<ConfirmRequest>>(),
};
const mockConfirms = new Map<number, (ok: boolean) => void>();
const on = <T,>(set: Set<Listener<T>>, cb: Listener<T>) => {
  set.add(cb);
  return () => void set.delete(cb);
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let mockConfig: Config = {
  name: "Эдит",
  model: "claude-opus-5-5",
  anthropicWorkspaceId: "",
  speechProvider: "auto",
  azureKey: "",
  azureKeySet: false,
  azureRegion: "",
  azureVoice: "mn-MN-YesuiNeural",
  chimegeVoice: "FEMALE3v2",
  chimegeSpeed: 0.95,
  chimegePitch: 1.05,
  micDeviceId: "",
  canSpeak: false,
  anthropicKey: "",
  anthropicKeySet: true,
  chimegeToken: "",
  chimegeTokenSet: false,
  chimegeSttToken: "",
  chimegeSttTokenSet: false,
  canListen: false,
  chimegeSttUrl: "https://api.chimege.com/v1.2/transcribe",
  chimegeTtsUrl: "https://api.chimege.com/v1.2/synthesize",
  chimegeTokenHeader: "Token",
  speak: true,
  autoStart: true,
  showText: false,
};

const mock: EdithApi = {
  getConfig: async () => mockConfig,
  setConfig: async (p) => (mockConfig = { ...mockConfig, ...p }),
  ask: async (t) => {
    await sleep(600);
    if (/хадгал|бич/.test(t)) {
      mockListeners.status.forEach((cb) => cb("Файл бичиж байна…"));
      const ok = await new Promise<boolean>((resolve) => {
        mockConfirms.set(1, resolve);
        mockListeners.confirm.forEach((cb) => cb({ id: 1, text: "Шинэ файл үүсгэх: C:\\Users\\User\\Desktop\\todo.txt" }));
      });
      return ok ? "Ширээний компьютер дээр todo.txt файлд хадгаллаа." : "За, хадгалсангүй.";
    }
    mockListeners.status.forEach((cb) => cb("Интернэтээс хайж байна…"));
    await sleep(700);
    return `Та "${t}" гэж асуулаа. Энэ бол браузер дээрх туршилтын хариулт.`;
  },
  transcribe: async () => "Сайн уу, өнөөдөр цаг агаар ямар байна?",
  synthesize: async () => {
    throw new Error("NO_CHIMEGE");
  },
  clearMemory: async () => {},
  hide: () => {},
  getWindowPos: async () => [0, 0],
  setWindowPos: () => {},
  saveWindowPos: () => {},
  onHotkey: () => () => {},
  onStatus: (cb) => on(mockListeners.status, cb),
  onAnnounce: () => () => {},
  onConfirm: (cb) => on(mockListeners.confirm, cb),
  answerConfirm: (id, ok) => {
    mockConfirms.get(id)?.(ok);
    mockConfirms.delete(id);
  },
};

export const api: EdithApi = window.edith ?? mock;

/** Алдааг хэрэглэгчид ойлгомжтой монгол текст болгоно. */
export function explainError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("NO_ANTHROPIC")) return "Claude-ийн API түлхүүр оруулаагүй байна. Тохиргоо руу орж нэмнэ үү.";
  if (msg.includes("NO_SPEECH") || msg.includes("NO_CHIMEGE"))
    return "Дуугаар ярихын тулд Chimege токен эсвэл Azure түлхүүр хэрэгтэй. Одоохондоо бичиж ярилцаж болно.";
  const speech = msg.match(/(Chimege(?: STT| TTS)?|Azure) (\d{3}):?\s*(.*)/);
  if (speech) {
    const what = speech[1].endsWith("STT") ? "сонсох" : speech[1].endsWith("TTS") ? "ярих" : "дуу";
    return `${speech[1]} (${what}) алдаа өглөө (${speech[2]}). ${speech[3].slice(0, 80)}`.trim();
  }
  if (msg.includes("anthropic-workspace-id") || msg.includes("scoped to a workspace"))
    return "Claude түлхүүр workspace-д хамаарахгүй байна. Workspace доторх шинэ түлхүүр үүсгэх эсвэл Тохиргоонд workspace ID оруулна уу.";
  if (msg.includes("401") || msg.includes("authentication")) return "API түлхүүр буруу байна. Тохиргоонд шалгана уу.";
  if (msg.includes("Permission") || msg.includes("NotAllowed")) return "Микрофон ашиглах зөвшөөрөл алга.";
  if (msg.includes("fetch") || msg.includes("network") || msg.includes("ENOTFOUND")) return "Интернэт холболт алга бололтой.";
  return msg.replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
}
