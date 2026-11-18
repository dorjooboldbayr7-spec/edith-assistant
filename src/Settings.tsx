import { useEffect, useState } from "react";
import { api, explainError, type Config } from "./api";
import { listMics, meterMic, playClips, type Mic } from "./audio";

const VOICES = [
  { id: "FEMALE1v2", label: "Эмэгтэй 1" },
  { id: "FEMALE2v2", label: "Эмэгтэй 2" },
  { id: "FEMALE3v2", label: "Эмэгтэй 3" },
  { id: "FEMALE4v2", label: "Эмэгтэй 4" },
  { id: "FEMALE5v2", label: "Эмэгтэй 5" },
  { id: "FEMALE1", label: "Эмэгтэй 6 (хуучин)" },
];

const SAMPLE = "Сайн байна уу! Би таны туслах. Өнөөдөр юугаар туслах вэ?";

export function Settings({ config, onClose, onSaved }: { config: Config; onClose: () => void; onSaved: (c: Config) => void }) {
  const [draft, setDraft] = useState<Config>(config);
  const [advanced, setAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof Config>(k: K, v: Config[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState("");

  // Нэг удаа сонсох нь Chimege-ийн нэг дуудалт зарцуулна.
  async function preview() {
    setPreviewing(true);
    setPreviewError("");
    try {
      const clips = await api.synthesize(SAMPLE, {
        speechProvider: "chimege",
        chimegeVoice: draft.chimegeVoice,
        chimegeSpeed: draft.chimegeSpeed,
        chimegePitch: draft.chimegePitch,
        chimegeToken: draft.chimegeToken,
      });
      await playClips(clips.map((c) => c.slice().buffer as ArrayBuffer));
    } catch (e) {
      setPreviewError(explainError(e));
    } finally {
      setPreviewing(false);
    }
  }

  // Микрофоны жагсаалт ба түвшний тест: ярихад зураас хөдөлж байвал тэр микрофон ажиллаж байна.
  const [mics, setMics] = useState<Mic[]>([]);
  const [level, setLevel] = useState(0);
  const [micError, setMicError] = useState("");

  useEffect(() => {
    listMics().then(setMics).catch(() => setMics([]));
  }, []);

  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;
    setMicError("");
    meterMic(draft.micDeviceId || undefined, setLevel)
      .then((s) => (cancelled ? s() : (stop = s)))
      .catch((e) => setMicError(explainError(e)));
    return () => {
      cancelled = true;
      stop?.();
      setLevel(0);
    };
  }, [draft.micDeviceId]);

  async function save() {
    setSaving(true);
    const next = await api.setConfig(draft);
    setSaving(false);
    onSaved(next);
  }

  return (
    <div className="settings">
      <div className="settings-head drag">
        <h2>Тохиргоо</h2>
        <button className="icon-btn no-drag" onClick={onClose} aria-label="Хаах">✕</button>
      </div>

      <div className="settings-body">
        <label>
          Нэр
          <input value={draft.name} onChange={(e) => set("name", e.target.value)} />
        </label>

        <label>
          Микрофон
          <select value={draft.micDeviceId} onChange={(e) => set("micDeviceId", e.target.value)}>
            {mics.length === 0 && <option value="">Windows-ийн анхдагч</option>}
            {mics.map((m) => (
              <option key={m.id || "default"} value={m.id}>
                {m.id ? m.label : `Анхдагч: ${m.label.replace(/^Default - /, "")}`}
              </option>
            ))}
          </select>
          <span className="meter" aria-label="Микрофоны түвшин">
            <span style={{ width: `${Math.round(level * 100)}%` }} />
          </span>
          <span className="hint-small">
            {micError || "Ярихад зураас хөдлөхгүй бол өөр микрофон сонгоно уу."}
          </span>
        </label>

        <label>
          Claude API түлхүүр
          <input
            type="password"
            value={draft.anthropicKey}
            placeholder={config.anthropicKeySet ? "Хадгалагдсан ••••" : "sk-ant-..."}
            onChange={(e) => set("anthropicKey", e.target.value)}
          />
        </label>

        <label>
          Claude workspace ID (шаардлагатай бол)
          <input
            value={draft.anthropicWorkspaceId}
            placeholder="wrkspc_..."
            onChange={(e) => set("anthropicWorkspaceId", e.target.value.trim())}
          />
        </label>

        <label>
          Chimege STT токен (сонсох)
          <input
            type="password"
            value={draft.chimegeSttToken}
            placeholder={config.chimegeSttTokenSet ? "Хадгалагдсан ••••" : "Монгол STT-ийн токен"}
            onChange={(e) => set("chimegeSttToken", e.target.value)}
          />
        </label>

        <label>
          Chimege TTS токен (ярих)
          <input
            type="password"
            value={draft.chimegeToken}
            placeholder={config.chimegeTokenSet ? "Хадгалагдсан ••••" : "Монгол TTS-ийн токен"}
            onChange={(e) => set("chimegeToken", e.target.value)}
          />
        </label>

        <label>
          Дуу хоолой
          <div className="row">
            <select value={draft.chimegeVoice} onChange={(e) => set("chimegeVoice", e.target.value)}>
              {VOICES.map((v) => (
                <option key={v.id} value={v.id}>{v.label}</option>
              ))}
            </select>
            <button type="button" className="ghost small" onClick={preview} disabled={previewing}>
              {previewing ? "…" : "Сонсох"}
            </button>
          </div>
          {previewError && <span className="field-error">{previewError}</span>}
        </label>

        <label>
          Ярих хурд: {draft.chimegeSpeed.toFixed(2)}
          <input
            type="range"
            min={0.7}
            max={1.3}
            step={0.05}
            value={draft.chimegeSpeed}
            onChange={(e) => set("chimegeSpeed", Number(e.target.value))}
          />
        </label>

        <label>
          Аялгуу: {draft.chimegePitch.toFixed(2)}
          <input
            type="range"
            min={0.8}
            max={1.3}
            step={0.05}
            value={draft.chimegePitch}
            onChange={(e) => set("chimegePitch", Number(e.target.value))}
          />
        </label>

        <label className="check">
          <input type="checkbox" checked={draft.speak} onChange={(e) => set("speak", e.target.checked)} />
          Хариултыг чангаар унших
        </label>
        <label className="check">
          <input type="checkbox" checked={draft.autoStart} onChange={(e) => set("autoStart", e.target.checked)} />
          Компьютер асахад автоматаар асах
        </label>

        <button className="link" onClick={() => setAdvanced((a) => !a)}>
          {advanced ? "Нарийвчилсан тохиргоог нуух" : "Нарийвчилсан тохиргоо"}
        </button>

        {advanced && (
          <>
            <label>
              Дуу хоолойн үйлчилгээ
              <select
                value={draft.speechProvider}
                onChange={(e) => set("speechProvider", e.target.value as Config["speechProvider"])}
              >
                <option value="auto">Chimege, болохгүй бол Azure</option>
                <option value="chimege">Зөвхөн Chimege</option>
                <option value="azure">Зөвхөн Azure (Yesui)</option>
              </select>
            </label>

            <label>
              Azure Speech түлхүүр
              <input
                type="password"
                value={draft.azureKey}
                placeholder={config.azureKeySet ? "Хадгалагдсан ••••" : "portal.azure.com → Speech"}
                onChange={(e) => set("azureKey", e.target.value)}
              />
            </label>

            <label>
              Azure бүс (region)
              <input
                value={draft.azureRegion}
                placeholder="жишээ нь eastasia"
                onChange={(e) => set("azureRegion", e.target.value.trim())}
              />
            </label>

            <label>
              Claude загвар
              <input value={draft.model} onChange={(e) => set("model", e.target.value)} />
            </label>
            <label>
              Azure дуу хоолой
              <select value={draft.azureVoice} onChange={(e) => set("azureVoice", e.target.value)}>
                <option value="mn-MN-YesuiNeural">Yesui (эмэгтэй)</option>
                <option value="mn-MN-BataaNeural">Bataa (эрэгтэй)</option>
              </select>
            </label>
            <label>
              Chimege STT хаяг
              <input value={draft.chimegeSttUrl} onChange={(e) => set("chimegeSttUrl", e.target.value)} />
            </label>
            <label>
              Chimege TTS хаяг
              <input value={draft.chimegeTtsUrl} onChange={(e) => set("chimegeTtsUrl", e.target.value)} />
            </label>
            <label>
              Токены header нэр
              <input value={draft.chimegeTokenHeader} onChange={(e) => set("chimegeTokenHeader", e.target.value)} />
            </label>
            <button className="link danger" onClick={() => api.clearMemory()}>
              Ярианы түүхийг арилгах
            </button>
          </>
        )}
      </div>

      <div className="settings-foot">
        <button className="primary" onClick={save} disabled={saving}>
          {saving ? "Хадгалж байна…" : "Хадгалах"}
        </button>
      </div>
    </div>
  );
}
