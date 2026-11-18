const { toSpeakable } = require("./mntext.cjs");
// Монгол яриа ↔ текст. Chimege болон Microsoft Azure (Yesui дуу хоолой) дэмжинэ.
// "auto" горимд эхлээд Chimege-г оролдож, бүтэлгүйтвэл Azure руу шилжинэ.

async function readError(provider, res) {
  const body = await res.text().catch(() => "");
  return `${provider} ${res.status}: ${body.slice(0, 200) || res.statusText}`;
}

/** Урт текстийг өгүүлбэрээр нь `max` тэмдэгтийн хэсгүүдэд хуваана. */
function chunk(text, max = 200) {
  const sentences = text.replace(/\s+/g, " ").match(/[^.!?…]+[.!?…]*/g) || [text];
  const pieces = [];
  for (const s of sentences) {
    if (s.length <= max) {
      pieces.push(s);
      continue;
    }
    let part = "";
    for (const w of s.split(/(?<=,)\s*|\s+/)) {
      if ((part + " " + w).length > max && part) {
        pieces.push(part);
        part = "";
      }
      part = part ? part + " " + w : w;
    }
    if (part) pieces.push(part);
  }
  const out = [];
  let cur = "";
  for (const s of pieces) {
    if ((cur + s).length > max && cur) {
      out.push(cur.trim());
      cur = "";
    }
    cur += s;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

// ---------- Chimege ----------

// STT, TTS нь console дээр тусдаа токентой. STT токен хоосон бол TTS токеныг ашиглана.
const sttToken = (cfg) => cfg.chimegeSttToken || cfg.chimegeToken;

const chimege = {
  ready: (cfg, op) => Boolean(op === "stt" ? sttToken(cfg) : cfg.chimegeToken),

  async transcribe(cfg, wav) {
    const res = await fetch(cfg.chimegeSttUrl, {
      method: "POST",
      headers: {
        [cfg.chimegeTokenHeader]: sttToken(cfg),
        "Content-Type": "application/octet-stream",
        // Цэг, таслалтай буцаана: Claude илүү сайн ойлгоно.
        Punctuate: "true",
      },
      body: Buffer.from(wav),
    });
    if (!res.ok) throw new Error(await readError("Chimege STT", res));
    const type = res.headers.get("content-type") || "";
    if (type.includes("json")) {
      const j = await res.json();
      return String(j.text ?? j.transcription ?? j.result ?? j.data ?? "").trim();
    }
    return (await res.text()).trim();
  },

  // Нэг дуудалт 200 тэмдэгт тул хариултыг 200-аар хуваана.
  async synthesize(cfg, text) {
    const parts = [];
    for (const piece of chunk(toSpeakable(text), 200)) {
      if (!piece) continue;
      const res = await fetch(cfg.chimegeTtsUrl, {
        method: "POST",
        headers: {
          [cfg.chimegeTokenHeader]: cfg.chimegeToken,
          "Content-Type": "text/plain; charset=utf-8",
          "voice-id": cfg.chimegeVoice || "FEMALE3v2",
          speed: String(cfg.chimegeSpeed ?? 0.95),
          pitch: String(cfg.chimegePitch ?? 1.05),
          "sample-rate": "22050",
        },
        body: piece,
      });
      if (!res.ok) throw new Error(await readError("Chimege TTS", res));
      parts.push(new Uint8Array(await res.arrayBuffer()));
    }
    return parts;
  },
};

// ---------- Microsoft Azure ----------

const escapeXml = (s) =>
  s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]);

const azure = {
  ready: (cfg) => Boolean(cfg.azureKey && cfg.azureRegion),

  async transcribe(cfg, wav) {
    const url =
      `https://${cfg.azureRegion}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1` +
      `?language=mn-MN&format=simple`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": cfg.azureKey,
        "Content-Type": "audio/wav; codecs=audio/pcm; samplerate=16000",
        Accept: "application/json",
      },
      body: Buffer.from(wav),
    });
    if (!res.ok) throw new Error(await readError("Azure", res));
    const j = await res.json();
    if (j.RecognitionStatus && j.RecognitionStatus !== "Success") return "";
    return String(j.DisplayText ?? "").trim();
  },

  async synthesize(cfg, text) {
    const voice = cfg.azureVoice || "mn-MN-YesuiNeural";
    const parts = [];
    for (const piece of chunk(text, 800)) {
      // Арай удаан, бага зэрэг өндөр аялгуу: зөөлөн, уянгалаг сонсогдоно.
      const ssml =
        `<speak version="1.0" xml:lang="mn-MN"><voice name="${escapeXml(voice)}">` +
        `<prosody rate="${cfg.voiceRate ?? "-6%"}" pitch="${cfg.voicePitch ?? "+3%"}">` +
        `${escapeXml(piece)}</prosody></voice></speak>`;
      const res = await fetch(`https://${cfg.azureRegion}.tts.speech.microsoft.com/cognitiveservices/v1`, {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": cfg.azureKey,
          "Content-Type": "application/ssml+xml",
          "X-Microsoft-OutputFormat": "riff-24khz-16bit-mono-pcm",
          "User-Agent": "edith-desktop",
        },
        body: ssml,
      });
      if (!res.ok) throw new Error(await readError("Azure", res));
      parts.push(new Uint8Array(await res.arrayBuffer()));
    }
    return parts;
  },
};

// ---------- Сонгох ----------

/** Тохиргооноос хамааран оролдох үйлчилгээнүүдийн дараалал. */
function providers(cfg) {
  const mode = cfg.speechProvider || "auto";
  if (mode === "chimege") return [chimege];
  if (mode === "azure") return [azure];
  return [chimege, azure];
}

async function withFallback(cfg, op, fn) {
  const ready = providers(cfg).filter((p) => p.ready(cfg, op));
  if (!ready.length) throw new Error("NO_SPEECH");
  let lastError;
  for (const p of ready) {
    try {
      return await fn(p);
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}

const transcribe = (cfg, wav) => withFallback(cfg, "stt", (p) => p.transcribe(cfg, wav));
const synthesize = (cfg, text) => withFallback(cfg, "tts", (p) => p.synthesize(cfg, text));

module.exports = { transcribe, synthesize, chunk, chimege, azure };
