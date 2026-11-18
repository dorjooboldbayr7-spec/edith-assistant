// Эдитийн "гар хөл": Claude-ийн дуудаж болох хэрэгслүүд ба тэдгээрийг гүйцэтгэх код.
//
// Аюулгүй байдал: компьютер дээр өөрчлөлт хийх үйлдэл (команд ажиллуулах, файл бичих)
// бүрийн өмнө хэрэглэгчээс зөвшөөрөл асууна. Унших, нээх үйлдлүүд шууд хийгдэнэ.

const { app, clipboard, desktopCapturer, Notification, screen, shell } = require("electron");
const { execFile } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const MAX_OUTPUT = 6000;
const clip = (s, n = MAX_OUTPUT) => (s.length > n ? s.slice(0, n) + `\n…(${s.length - n} тэмдэгт таслав)` : s);

// ---------- Урт хугацааны санах ой ----------

const factsFile = () => path.join(app.getPath("userData"), "facts.json");

function loadFacts() {
  try {
    const f = JSON.parse(fs.readFileSync(factsFile(), "utf8"));
    return Array.isArray(f) ? f : [];
  } catch {
    return [];
  }
}

function saveFacts(facts) {
  fs.mkdirSync(path.dirname(factsFile()), { recursive: true });
  fs.writeFileSync(factsFile(), JSON.stringify(facts.slice(-200), null, 2));
}

// ---------- Туслах функцууд ----------

function expandPath(p) {
  let out = String(p || "").trim().replace(/^["']|["']$/g, "");
  const home = os.homedir();
  const known = {
    "~": home,
    desktop: path.join(home, "Desktop"),
    documents: path.join(home, "Documents"),
    downloads: path.join(home, "Downloads"),
    music: path.join(home, "Music"),
    pictures: path.join(home, "Pictures"),
    videos: path.join(home, "Videos"),
  };
  const first = out.split(/[\\/]/)[0].toLowerCase();
  if (known[first]) out = path.join(known[first], out.slice(first.length));
  return path.resolve(out);
}

function powershell(script, env = {}, timeout = 60000) {
  return new Promise((resolve) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command",
        // Монгол үсэг зөв гарахын тулд UTF-8.
        "[Console]::OutputEncoding=[Text.Encoding]::UTF8; " + script],
      { env: { ...process.env, ...env }, timeout, windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout, stderr) => {
        const out = [stdout, stderr].filter(Boolean).join("\n").trim();
        if (err && !out) return resolve(`Алдаа: ${err.message}`);
        resolve(clip(out || "(хоосон гаралт)"));
      },
    );
  });
}

// ---------- Хэрэгслүүдийн тодорхойлолт (Claude-д харагдана) ----------

const TOOL_DEFS = [
  {
    name: "open_app",
    description:
      "Компьютер дээрх программыг нэрээр нь нээнэ (жишээ нь Spotify, Chrome, Word, Notepad, Calculator, VS Code, Telegram). Start цэсээс хайж олно.",
    input_schema: {
      type: "object",
      properties: { name: { type: "string", description: "Программын нэр, англиар" } },
      required: ["name"],
    },
  },
  {
    name: "open_url",
    description: "Вэб хуудсыг хэрэглэгчийн үндсэн хөтөч дээр нээнэ. YouTube хайлт гэх мэтэд хайлтын URL ашиглаж болно.",
    input_schema: {
      type: "object",
      properties: { url: { type: "string", description: "http(s):// эхэлсэн бүтэн хаяг" } },
      required: ["url"],
    },
  },
  {
    name: "open_path",
    description:
      "Файл эсвэл хавтсыг Windows-ийн үндсэн программаар нээнэ. 'downloads', 'desktop', 'documents' гэх мэт товчлол болон бүтэн зам ойлгоно.",
    input_schema: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
    },
  },
  {
    name: "list_files",
    description: "Хавтас доторх файл, хавтсуудыг жагсаана (хэмжээ, огноотой).",
    input_schema: {
      type: "object",
      properties: { path: { type: "string", description: "Хавтасны зам эсвэл 'downloads' гэх мэт" } },
      required: ["path"],
    },
  },
  {
    name: "read_file",
    description: "Текст файлын агуулгыг уншина (эхний ~20000 тэмдэгт).",
    input_schema: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description:
      "Текст файл үүсгэх эсвэл дарж бичих. Хэрэглэгчээс зөвшөөрөл асууна. Тэмдэглэл, жагсаалт, код хадгалахад ашиглана.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string" },
        content: { type: "string" },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "run_powershell",
    description:
      "Windows PowerShell команд ажиллуулна. Дууны хэмжээ, батерей, системийн мэдээлэл, файл зөөх, процесс шалгах зэрэг бусад хэрэгслээр болохгүй ажилд ашиглана. Хэрэглэгчээс заавал зөвшөөрөл асууна. Устгах, системийн тохиргоо өөрчлөх командыг аль болох бүү ашигла.",
    input_schema: {
      type: "object",
      properties: {
        command: { type: "string", description: "PowerShell скрипт" },
        explanation: { type: "string", description: "Энэ команд юу хийхийг монголоор товч тайлбарла (хэрэглэгчид харагдана)" },
      },
      required: ["command", "explanation"],
    },
  },
  {
    name: "set_timer",
    description: "Тодорхой хугацааны дараа хэрэглэгчид сануулна (мэдэгдэл гаргаж, чангаар хэлнэ).",
    input_schema: {
      type: "object",
      properties: {
        minutes: { type: "number", description: "Хэдэн минутын дараа (бутархай байж болно)" },
        message: { type: "string", description: "Сануулах үг, монголоор" },
      },
      required: ["minutes", "message"],
    },
  },
  {
    name: "clipboard",
    description: "Clipboard-оос текст унших (action=read) эсвэл текст хуулах (action=write).",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["read", "write"] },
        text: { type: "string" },
      },
      required: ["action"],
    },
  },
  {
    name: "look_at_screen",
    description:
      "Хэрэглэгчийн дэлгэцийн зургийг авч харна. 'Энэ юу вэ', 'дэлгэц дээр юу байна', 'энэ алдааг тайлбарла' гэх мэт үед ашиглана.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "remember",
    description:
      "Хэрэглэгчийн тухай чухал, удаан хадгалах мэдээллийг санах ойд бичнэ (нэр, дуртай зүйл, төсөл, хуваарь гэх мэт). Хэрэглэгч 'санаж бай' гэвэл заавал ашигла.",
    input_schema: {
      type: "object",
      properties: { fact: { type: "string" } },
      required: ["fact"],
    },
  },
  {
    name: "forget",
    description: "Санах ойноос тухайн үг агуулсан мэдээллийг устгана.",
    input_schema: {
      type: "object",
      properties: { contains: { type: "string" } },
      required: ["contains"],
    },
  },
];

// Anthropic-ийн серверт ажилладаг вэб хайлт.
const SERVER_TOOLS = [{ type: "web_search_20250305", name: "web_search", max_uses: 4 }];

// Явцын мэдээлэлд харуулах текст.
function describe(name, input) {
  switch (name) {
    case "open_app": return `${input.name} нээж байна…`;
    case "open_url": return "Хөтөч нээж байна…";
    case "open_path": return "Нээж байна…";
    case "list_files": return "Файлуудыг харж байна…";
    case "read_file": return "Файл уншиж байна…";
    case "write_file": return "Файл бичиж байна…";
    case "run_powershell": return input.explanation || "Команд ажиллуулж байна…";
    case "set_timer": return "Сануулга тохируулж байна…";
    case "clipboard": return "Clipboard ашиглаж байна…";
    case "look_at_screen": return "Дэлгэцийг харж байна…";
    case "remember": return "Санаж авлаа…";
    case "web_search": return "Интернэтээс хайж байна…";
    default: return "Ажиллаж байна…";
  }
}

// ---------- Гүйцэтгэгч ----------

/**
 * @param {string} name
 * @param {any} input
 * @param {{ confirm: (text: string) => Promise<boolean>, announce: (text: string) => void }} ctx
 * @returns {Promise<string | Array<object>>} tool_result-ийн content
 */
async function runTool(name, input, ctx) {
  switch (name) {
    case "open_app": {
      // Нэрийг env-ээр дамжуулж, командын injection-оос сэргийлнэ.
      const script = `
        $n = $env:EDITH_APP
        $a = Get-StartApps | Where-Object { $_.Name -like "*$n*" } | Select-Object -First 1
        if ($a) { Start-Process ("shell:AppsFolder\\" + $a.AppID); "Нээлээ: " + $a.Name }
        else { try { Start-Process $n -ErrorAction Stop; "Нээлээ: " + $n } catch { "Олдсонгүй: " + $n } }`;
      return powershell(script, { EDITH_APP: String(input.name) }, 20000);
    }

    case "open_url": {
      const url = String(input.url);
      if (!/^https?:\/\//i.test(url)) return "Зөвхөн http(s) хаяг нээх боломжтой.";
      await shell.openExternal(url);
      return "Нээлээ.";
    }

    case "open_path": {
      const p = expandPath(input.path);
      if (!fs.existsSync(p)) return `Олдсонгүй: ${p}`;
      const err = await shell.openPath(p);
      return err ? `Алдаа: ${err}` : `Нээлээ: ${p}`;
    }

    case "list_files": {
      const p = expandPath(input.path);
      try {
        const entries = fs.readdirSync(p, { withFileTypes: true }).slice(0, 300);
        const lines = entries.map((e) => {
          try {
            const st = fs.statSync(path.join(p, e.name));
            const when = st.mtime.toISOString().slice(0, 10);
            return e.isDirectory() ? `[хавтас] ${e.name}  ${when}` : `${e.name}  ${(st.size / 1024).toFixed(0)} KB  ${when}`;
          } catch {
            return e.name;
          }
        });
        return clip(`${p}\n` + (lines.join("\n") || "(хоосон)"));
      } catch (e) {
        return `Алдаа: ${e.message}`;
      }
    }

    case "read_file": {
      const p = expandPath(input.path);
      try {
        return clip(fs.readFileSync(p, "utf8"), 20000);
      } catch (e) {
        return `Алдаа: ${e.message}`;
      }
    }

    case "write_file": {
      const p = expandPath(input.path);
      const exists = fs.existsSync(p);
      const ok = await ctx.confirm(`${exists ? "Дарж бичих" : "Шинэ файл үүсгэх"}: ${p}`);
      if (!ok) return "Хэрэглэгч зөвшөөрсөнгүй.";
      try {
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, String(input.content), "utf8");
        return `Хадгаллаа: ${p}`;
      } catch (e) {
        return `Алдаа: ${e.message}`;
      }
    }

    case "run_powershell": {
      const ok = await ctx.confirm(`${input.explanation}\n\n${input.command}`);
      if (!ok) return "Хэрэглэгч зөвшөөрсөнгүй.";
      return powershell(String(input.command));
    }

    case "set_timer": {
      const minutes = Math.max(0.05, Math.min(24 * 60, Number(input.minutes) || 1));
      const message = String(input.message);
      setTimeout(() => {
        if (Notification.isSupported()) new Notification({ title: "Сануулга", body: message }).show();
        ctx.announce(message);
      }, minutes * 60 * 1000);
      const at = new Date(Date.now() + minutes * 60000).toLocaleTimeString("mn-MN", { hour: "2-digit", minute: "2-digit" });
      return `${at}-д сануулна.`;
    }

    case "clipboard": {
      if (input.action === "write") {
        clipboard.writeText(String(input.text ?? ""));
        return "Хууллаа.";
      }
      return clip(clipboard.readText() || "(clipboard хоосон)");
    }

    case "look_at_screen": {
      const { width, height } = screen.getPrimaryDisplay().size;
      const scale = Math.min(1, 1568 / Math.max(width, height));
      const sources = await desktopCapturer.getSources({
        types: ["screen"],
        thumbnailSize: { width: Math.round(width * scale), height: Math.round(height * scale) },
      });
      if (!sources.length) return "Дэлгэцийн зураг авч чадсангүй.";
      const png = sources[0].thumbnail.toJPEG(80).toString("base64");
      return [
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: png } },
        { type: "text", text: "Хэрэглэгчийн одоогийн дэлгэц." },
      ];
    }

    case "remember": {
      const facts = loadFacts();
      facts.push(String(input.fact));
      saveFacts(facts);
      return "Санаж авлаа.";
    }

    case "forget": {
      const needle = String(input.contains).toLowerCase();
      const facts = loadFacts();
      const kept = facts.filter((f) => !f.toLowerCase().includes(needle));
      saveFacts(kept);
      return `${facts.length - kept.length} зүйл мартлаа.`;
    }

    default:
      return `Ийм хэрэгсэл алга: ${name}`;
  }
}

module.exports = { TOOL_DEFS, SERVER_TOOLS, runTool, describe, loadFacts, saveFacts, expandPath };
