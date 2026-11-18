// Микрофоноос бичих, дуу тоглуулах. Дууны хүчийг (level) бөмбөлөгт дамжуулна.

/** 0..1 хооронд, бөмбөлгийн долгион энэ утгаас хамаарна. Re-render хийхгүйн тулд энгийн обьект. */
export const audioLevel = { value: 0 };

const SAMPLE_RATE = 16000;

function encodeWav(samples: Float32Array, rate: number): ArrayBuffer {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + samples.length * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buf;
}

export type Recording = {
  /** Бичлэг дуусахад WAV буцаана. Юу ч яриагүй бол null. */
  done: Promise<ArrayBuffer | null>;
  stop: () => void;
};

function openMic(deviceId?: string) {
  return navigator.mediaDevices.getUserMedia({
    audio: {
      ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      channelCount: 1,
      // Зарим ноутбукийн микрофон (Intel Smart Sound гэх мэт) өөрийн боловсруулалттай тул
      // Chromium-ийн нэмэлт боловсруулалт асаалттай үед дууг бүр мөсөн тасалж болно.
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: true,
    },
  });
}

export type Mic = { id: string; label: string };

/** Компьютерт холбогдсон микрофонуудын жагсаалт. */
export async function listMics(): Promise<Mic[]> {
  // Нэрийг нь харахын тулд нэг удаа микрофон нээх шаардлагатай.
  try {
    const s = await openMic();
    s.getTracks().forEach((t) => t.stop());
  } catch {
    /* зөвшөөрөлгүй бол нэргүй жагсаалт гарна */
  }
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((d) => d.kind === "audioinput" && d.deviceId !== "communications")
    .map((d, i) => ({ id: d.deviceId === "default" ? "" : d.deviceId, label: d.label || `Микрофон ${i + 1}` }));
}

/**
 * Сонгосон микрофоны дууны түвшинг тасралтгүй хэмжинэ (0..1). Тохиргооны тестэд хэрэглэнэ.
 * Буцаасан функцийг дуудахад зогсоно.
 */
export async function meterMic(deviceId: string | undefined, onLevel: (v: number) => void) {
  const stream = await openMic(deviceId);
  const ctx = new AudioContext();
  await ctx.resume().catch(() => {});
  const src = ctx.createMediaStreamSource(stream);
  const an = ctx.createAnalyser();
  an.fftSize = 1024;
  src.connect(an);
  const buf = new Float32Array(an.fftSize);
  let raf = 0;
  const tick = () => {
    an.getFloatTimeDomainData(buf);
    let sum = 0;
    for (const x of buf) sum += x * x;
    onLevel(Math.min(1, Math.sqrt(sum / buf.length) * 25));
    raf = requestAnimationFrame(tick);
  };
  tick();
  return () => {
    cancelAnimationFrame(raf);
    stream.getTracks().forEach((t) => t.stop());
    ctx.close();
  };
}

/** Сүүлийн бичлэгийн мэдээлэл: юу ч сонсогдоогүй үед шалтгааныг тайлбарлахад хэрэглэнэ. */
export const lastRecording = { frames: 0, peak: 0 };

/**
 * Бичлэг эхлүүлнэ. Ярьж эхлээд 1.2 секунд чимээгүй болоход эсвэл 14 секундэд
 * (Chimege-ийн хязгаар) автоматаар зогсоно. 7 секунд юу ч яриагүй бол цуцална.
 */
export async function startRecording(deviceId?: string): Promise<Recording> {
  const stream = await openMic(deviceId);
  const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
  const src = ctx.createMediaStreamSource(stream);
  const proc = ctx.createScriptProcessor(2048, 1, 1);
  const chunks: Float32Array[] = [];

  let resolve!: (v: ArrayBuffer | null) => void;
  const done = new Promise<ArrayBuffer | null>((r) => (resolve = r));

  const started = performance.now();
  // Орчны чимээг тасралтгүй, зөвхөн чимээгүй үед нь хэмжинэ. Ингэвэл товч дармагц
  // ярьж эхэлсэн ч таны дууг "чимээ" гэж андуурахгүй.
  let noiseFloor = 0.003;
  let peak = 0;
  let spoke = false;
  let lastVoice = started;
  let finished = false;
  lastRecording.frames = 0;
  lastRecording.peak = 0;

  const finish = (keep: boolean) => {
    if (finished) return;
    finished = true;
    proc.disconnect();
    src.disconnect();
    stream.getTracks().forEach((t) => t.stop());
    ctx.close();
    audioLevel.value = 0;
    lastRecording.frames = chunks.length;
    lastRecording.peak = peak;
    // Ярианы босгыг давж чадаагүй ч ямар нэг дуу бичигдсэн бол Chimege-д илгээж үзнэ.
    const heardSomething = spoke || peak > 0.008;
    if (!keep || !heardSomething) return resolve(null);
    const total = chunks.reduce((n, c) => n + c.length, 0);
    const all = new Float32Array(total);
    let o = 0;
    for (const c of chunks) {
      all.set(c, o);
      o += c.length;
    }
    resolve(encodeWav(all, SAMPLE_RATE));
  };

  proc.onaudioprocess = (e) => {
    const input = e.inputBuffer.getChannelData(0);
    chunks.push(new Float32Array(input));
    let sum = 0;
    for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
    const rms = Math.sqrt(sum / input.length);
    peak = Math.max(peak, rms);
    // Бөмбөлөг таны дуунд хариу үйлдэл үзүүлнэ: чимээгүй үед ч бага зэрэг хөдөлнө.
    audioLevel.value = Math.min(1, rms * 25);

    const threshold = Math.min(0.02, Math.max(0.005, noiseFloor * 3));
    const now = performance.now();
    if (rms > threshold) {
      spoke = true;
      lastVoice = now;
    } else {
      noiseFloor = noiseFloor * 0.95 + rms * 0.05;
    }
    if (spoke && now - lastVoice > 1200) finish(true);
    else if (!spoke && now - started > 7000) finish(true);
    // Chimege-ийн богино STT 15 секунд хүртэлх аудио хүлээн авна.
    else if (now - started > 14000) finish(true);
  };

  src.connect(proc);
  proc.connect(ctx.destination);
  // Хулганы товшилтгүй эхэлсэн үед AudioContext "suspended" төлөвтэй байж болно.
  await ctx.resume().catch(() => {});

  // Аудио боловсруулалт ямар нэг шалтгаанаар эхлээгүй ч гацахгүйн тулд.
  setTimeout(() => finish(true), 15000);

  return { done, stop: () => finish(true) };
}

let playCtx: AudioContext | null = null;
let currentSource: AudioBufferSourceNode | null = null;
let cancelled = false;

/** Аудио хэсгүүдийг дарааллаар нь тоглуулж, дууны хүчийг бөмбөлөгт дамжуулна. */
export async function playClips(clips: ArrayBuffer[]): Promise<void> {
  playCtx ??= new AudioContext();
  const ctx = playCtx;
  await ctx.resume();
  cancelled = false;
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  analyser.connect(ctx.destination);
  const data = new Uint8Array(analyser.fftSize);

  let raf = 0;
  const tick = () => {
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (const x of data) sum += ((x - 128) / 128) ** 2;
    audioLevel.value = Math.min(1, Math.sqrt(sum / data.length) * 5);
    raf = requestAnimationFrame(tick);
  };
  tick();

  try {
    for (const clip of clips) {
      if (cancelled) break;
      const buf = await ctx.decodeAudioData(clip.slice(0));
      await new Promise<void>((res) => {
        const s = ctx.createBufferSource();
        s.buffer = buf;
        s.connect(analyser);
        s.onended = () => res();
        currentSource = s;
        s.start();
      });
    }
  } finally {
    cancelAnimationFrame(raf);
    analyser.disconnect();
    currentSource = null;
    audioLevel.value = 0;
  }
}

export function stopPlayback() {
  cancelled = true;
  try {
    currentSource?.stop();
  } catch {
    /* аль хэдийн зогссон */
  }
}
