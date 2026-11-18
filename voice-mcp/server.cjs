// Edith-ийн дуу хоолой: Claude апп-аас ирсэн бичвэрийг Chimege-ээр монгол яриа болгож, чанга яригчаар тоглуулна.
// Токен: CHIMEGE_TOKEN орчны хувьсагч (claude_desktop_config.json дотор "env" хэсэгт өөрөө бичнэ).
const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { z } = require("zod");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { synthesize } = require("../electron/speech.cjs");

const cfg = {
  chimegeToken: process.env.CHIMEGE_TOKEN || "",
  chimegeTtsUrl: process.env.CHIMEGE_TTS_URL || "https://api.chimege.com/v1.2/synthesize",
  chimegeTokenHeader: "Token",
  chimegeVoice: process.env.CHIMEGE_VOICE || "FEMALE3v2",
  chimegeSpeed: 0.95,
  chimegePitch: 1.05,
  // Microsoft Azure Speech (Yesui эмэгтэй хоолой). Chimege ажиллахгүй үед автоматаар үүнийг ашиглана.
  azureKey: process.env.AZURE_SPEECH_KEY || "",
  azureRegion: process.env.AZURE_SPEECH_REGION || "",
  azureVoice: "mn-MN-YesuiNeural",
  voiceRate: "-6%",
  voicePitch: "+3%",
  speechProvider: "auto",
};

let player = null;   // одоо тоглож буй PowerShell
let seq = 0;         // шинэ яриа ирэхэд хуучныг таслана

function playWav(file) {
  return new Promise((resolve) => {
    const ps = `(New-Object System.Media.SoundPlayer '${file.replace(/'/g, "''")}').PlaySync()`;
    player = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", ps], { windowsHide: true });
    player.on("exit", () => { player = null; resolve(); });
    player.on("error", () => { player = null; resolve(); });
  });
}

async function speak(text) {
  const my = ++seq;
  if (player) { try { player.kill(); } catch {} }
  const parts = await synthesize(cfg, text);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "edith-voice-"));
  try {
    for (let i = 0; i < parts.length; i++) {
      if (my !== seq) break;
      const f = path.join(dir, `p${i}.wav`);
      fs.writeFileSync(f, Buffer.from(parts[i]));
      await playWav(f);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const server = new McpServer({ name: "edith-voice", version: "0.1.0" });

server.registerTool(
  "speak",
  {
    title: "Edith ярих",
    description: "Монгол бичвэрийг Edith-ийн эмэгтэй хоолойгоор (Chimege TTS) компьютерийн чанга яригчаар уншина. Шинэ яриа ирвэл өмнөхийг тасална.",
    inputSchema: { text: z.string().min(1).max(2000) },
    annotations: { readOnlyHint: true },
  },
  async ({ text }) => {
    if (!cfg.chimegeToken && !(cfg.azureKey && cfg.azureRegion)) {
      return { isError: true, content: [{ type: "text", text: "CHIMEGE_TOKEN эсвэл AZURE_SPEECH_KEY + AZURE_SPEECH_REGION тохируулаагүй байна." }] };
    }
    try {
      await speak(text);
      return { content: [{ type: "text", text: "ok" }] };
    } catch (e) {
      return { isError: true, content: [{ type: "text", text: String(e && e.message || e).slice(0, 300) }] };
    }
  }
);

server.connect(new StdioServerTransport());
