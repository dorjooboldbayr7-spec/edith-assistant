import { useCallback, useEffect, useRef, useState } from "react";
import { api, explainError, type Config, type ConfirmRequest } from "./api";
import { lastRecording, playClips, startRecording, stopPlayback, type Recording } from "./audio";
import { Orb, type Mode } from "./Orb";
import { Settings } from "./Settings";

const STATUS: Record<Mode, string> = {
  idle: "Ярих бол над дээр дар (Ctrl+Shift+Space)",
  listening: "Сонсож байна…",
  thinking: "Бодож байна…",
  speaking: "Ярьж байна…",
  error: "",
};

/**
 * Claude-ийн хариуг ярих ба дэлгэцийн хэсэгт хуваана.
 * <ярих> таг байхгүй бол эхний хоёр өгүүлбэрийг уншина.
 */
export function splitReply(raw: string): { speech: string; text: string } {
  const m = raw.match(/<ярих>([\s\S]*?)<\/ярих>/);
  const text = raw.replace(/<ярих>[\s\S]*?<\/ярих>/g, "").replace(/<\/?ярих>/g, "").trim();
  if (m) return { speech: m[1].trim(), text: text || m[1].trim() };
  const plain = text.replace(/[*#`_>|]/g, "").replace(/\s+/g, " ").trim();
  const sentences = plain.match(/[^.!?]+[.!?]*/g) ?? [plain];
  const short = sentences.slice(0, 2).join(" ").trim();
  return { speech: short.length < plain.length ? `${short} Дэлгэрэнгүйг чат дээр бичлээ.` : plain, text };
}

/** Энгийн markdown-ийг (гарчиг, тод, жагсаалт) цэвэр харагдуулна. */
function Formatted({ text }: { text: string }) {
  return (
    <>
      {text.split(/\n/).map((line, i) => {
        const clean = line.replace(/^#+\s*/, "").replace(/\*\*(.+?)\*\*/g, "$1").replace(/`([^`]+)`/g, "$1");
        const heading = /^#+\s/.test(line);
        return clean.trim() ? (
          <p key={i} className={heading ? "reply-h" : "reply-line"}>
            {clean.replace(/^\s*[-*]\s+/, "• ")}
          </p>
        ) : (
          <br key={i} />
        );
      })}
    </>
  );
}

export default function App() {
  const [config, setConfig] = useState<Config | null>(null);
  const [mode, setMode] = useState<Mode>("idle");
  const [heard, setHeard] = useState("");
  const [reply, setReply] = useState("");
  const [error, setError] = useState("");
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [work, setWork] = useState("");
  const [pending, setPending] = useState<ConfirmRequest | null>(null);

  const recording = useRef<Recording | null>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  useEffect(() => {
    api.getConfig().then((c) => {
      setConfig(c);
      if (!c.anthropicKeySet) setShowSettings(true);
    });
  }, []);

  const fail = (e: unknown) => {
    setError(explainError(e));
    setMode("error");
  };

  /** Текстийг чангаар уншина. Дуу хоолой тохируулаагүй бол чимээгүй өнгөрнө. */
  const say = useCallback(
    async (answer: string) => {
      if (!config?.speak || !config.canSpeak) return;
      setMode("speaking");
      const clips = await api.synthesize(answer);
      await playClips(clips.map((c) => c.slice().buffer as ArrayBuffer));
    },
    [config],
  );

  /** Хүсэлтийг Claude-д дамжуулж, хариуг харуулж уншина. */
  const respond = useCallback(
    async (input: string) => {
      stopPlayback();
      setHeard(input);
      setReply("");
      setError("");
      setWork("");
      setMode("thinking");
      try {
        const { speech, text } = splitReply(await api.ask(input));
        setWork("");
        setReply(text);
        await say(speech);
        setMode("idle");
      } catch (e) {
        setWork("");
        fail(e);
      }
    },
    [say],
  );

  // Main процессоос ирэх мэдээ: явц, зөвшөөрөл, сануулга.
  useEffect(() => api.onStatus(setWork), []);
  useEffect(() => api.onConfirm(setPending), []);
  useEffect(
    () =>
      api.onAnnounce(async (text) => {
        setHeard("Сануулга");
        setReply(text);
        try {
          await say(text);
        } catch {
          /* уншиж чадаагүй ч текст харагдаж байгаа */
        }
        setMode("idle");
      }),
    [say],
  );

  // Чирэлт эхлэхэд цонхны байрлалыг авч, курсорын шилжилтийг нэмж зөөнө.
  const dragStart = useRef<[number, number] | null>(null);
  function dragWindow(dx: number, dy: number, phase: "start" | "move") {
    if (phase === "start") {
      dragStart.current = null;
      api.getWindowPos().then((p) => (dragStart.current = p));
      return;
    }
    const s = dragStart.current;
    if (s) api.setWindowPos(s[0] + dx, s[1] + dy);
  }

  // Нууцлал: яриаг анхдагчаар нууна, 💬 дарвал харуулна. Сонголтыг хадгална.
  const showText = config?.showText ?? false;
  function toggleText() {
    if (!config) return;
    const next = { ...config, showText: !showText };
    setConfig(next);
    api.setConfig({ showText: next.showText });
  }

  function answer(ok: boolean) {
    if (!pending) return;
    api.answerConfirm(pending.id, ok);
    setPending(null);
  }

  const listen = useCallback(async () => {
    const current = modeRef.current;
    if (current === "listening") return recording.current?.stop();
    if (current === "speaking") {
      stopPlayback();
      return;
    }
    if (current === "thinking") return;
    if (!config?.canListen) {
      // Токенгүй бол бичиж ярих горим руу шилжинэ.
      setTyping(true);
      setError(explainError(new Error("NO_SPEECH")));
      setMode("error");
      return;
    }
    setError("");
    try {
      setMode("listening");
      recording.current = await startRecording(config.micDeviceId || undefined);
      const wav = await recording.current.done;
      recording.current = null;
      if (!wav) {
        // Шалтгааныг ялгаж хэлнэ: микрофоноос дуу огт ирээгүй үү, эсвэл хэт сул байв уу.
        setError(
          lastRecording.frames === 0 || lastRecording.peak < 0.0005
            ? "Микрофоноос дуу ирэхгүй байна. Windows-ийн микрофоны зөвшөөрөл болон сонгосон микрофоноо шалгана уу."
            : "Дуу хэт сул сонсогдлоо. Микрофон руу ойртож, арай чанга ярина уу.",
        );
        return setMode("error");
      }
      setMode("thinking");
      const said = await api.transcribe(wav);
      if (!said) {
        setError("Сайн сонсогдсонгүй, дахин хэлнэ үү.");
        return setMode("error");
      }
      await respond(said);
    } catch (e) {
      fail(e);
    }
  }, [config, respond]);

  useEffect(() => api.onHotkey(listen), [listen]);

  function submitText(e: React.FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t || mode === "thinking") return;
    setText("");
    respond(t);
  }

  if (showSettings && config) {
    return (
      <Settings
        config={config}
        onClose={() => setShowSettings(false)}
        onSaved={(c) => {
          setConfig(c);
          setShowSettings(false);
        }}
      />
    );
  }

  const status = mode === "error" ? error : mode === "thinking" && work ? work : STATUS[mode];

  return (
    <main className="shell">
      <div className="topbar drag">
        <span className="name">{config?.name ?? "Эдит"}</span>
        <div className="no-drag actions">
          <button
            className="icon-btn"
            onClick={toggleText}
            aria-label={showText ? "Яриаг нуух" : "Яриаг харуулах"}
            aria-pressed={showText}
            title={showText ? "Яриаг нуух" : "Яриаг харуулах"}
          >
            💬
          </button>
          <button className="icon-btn" onClick={() => setTyping((t) => !t)} aria-label="Бичиж ярих" aria-pressed={typing}>
            ⌨
          </button>
          <button className="icon-btn" onClick={() => setShowSettings(true)} aria-label="Тохиргоо">
            ⚙
          </button>
          <button className="icon-btn" onClick={() => api.hide()} aria-label="Нуух">
            –
          </button>
        </div>
      </div>

      {showText && !pending && (heard || reply) && (
        <section className="bubble" aria-live="polite">
          {heard && <p className="heard">{heard}</p>}
          {reply && (
            <div className="reply">
              <Formatted text={reply} />
            </div>
          )}
        </section>
      )}

      {pending && (
        <section className="confirm" role="alertdialog" aria-label="Зөвшөөрөл">
          <p className="confirm-title">Үүнийг хийх үү?</p>
          <pre className="confirm-text">{pending.text}</pre>
          <div className="confirm-actions">
            <button className="ghost" onClick={() => answer(false)}>Үгүй</button>
            <button className="primary" onClick={() => answer(true)}>Тийм, хий</button>
          </div>
        </section>
      )}

      <div className="orb-wrap">
        <Orb mode={mode} onClick={listen} onDrag={dragWindow} onDragEnd={() => api.saveWindowPos()} />
      </div>

      <p className={`status ${mode === "error" ? "status--error" : ""}`}>{status}</p>

      {typing && (
        <form className="composer" onSubmit={submitText}>
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Энд бичээд Enter дарна уу"
            aria-label="Мессеж"
          />
        </form>
      )}
    </main>
  );
}
