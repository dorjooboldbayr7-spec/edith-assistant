// Эдитийн тархи: Claude. Хэрэгсэл ашиглан даалгавар гүйцэтгэж, яриаг санаж байна.
const { app } = require("electron");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Anthropic = require("@anthropic-ai/sdk");
const tools = require("./tools.cjs");

const MAX_MESSAGES = 30; // ярианы түүх (зөвхөн текст)
const MAX_STEPS = 10; // нэг даалгаварт хамгийн ихдээ хэдэн удаа хэрэгсэл дуудах
const memoryFile = () => path.join(app.getPath("userData"), "memory.json");

function loadMemory() {
  try {
    const m = JSON.parse(fs.readFileSync(memoryFile(), "utf8"));
    return Array.isArray(m.messages) ? m : { messages: [] };
  } catch {
    return { messages: [] };
  }
}

function saveMemory(mem) {
  mem.messages = mem.messages.slice(-MAX_MESSAGES);
  while (mem.messages.length && mem.messages[0].role !== "user") mem.messages.shift();
  fs.mkdirSync(path.dirname(memoryFile()), { recursive: true });
  fs.writeFileSync(memoryFile(), JSON.stringify(mem, null, 2));
}

function systemPrompt(cfg, facts = tools.loadFacts()) {
  const now = new Date().toLocaleString("mn-MN", { timeZone: "Asia/Ulaanbaatar", dateStyle: "full", timeStyle: "short" });
  const remembered = facts.length ? facts.map((f) => `- ${f}`).join("\n") : "(одоохондоо юу ч алга)";

  return `Чи бол Claude — Anthropic компанийн бүтээсэн AI. Энэ программ бол чиний хэрэглэгчийн зөөврийн компьютер дээрх нүүр царай, дуу хоолой, гар хөл юм. Хэрэглэгч чамайг "${cfg.name}" гэж дууддаг ч чи өөр шинэ AI биш, Claude өөрөө. Хэн бэ гэж асуувал үүнийг шударгаар хэл.

Хэрэглэгч чамтай дуугаар ярьж байна. Чиний хариулт хоёр хэсэгтэй:
1. Эхэнд нь <ярих>...</ярих> дотор чангаар уншигдах богино хувилбар: 1–3 өгүүлбэр, гол санаа. Энд латин үсэг, цифр, тэмдэгт бүү ашигла: гадаад нэрийг кириллээр (Клод, Ютүүб), тоог үгээр (хорин тав) бич. Дэлгэрэнгүй хэсэг байгаа бол "Дэлгэрэнгүйг чат дээр бичлээ" гэж төгсгө.
2. Дараа нь дэлгэцэн дээр (💬 чатад) харагдах бүрэн хариулт. Энэ нь яг Клод чат дээр хариулдаг шиг байна: тодорхой, бүрэн, хэрэгтэй бол дугаарласан алхмуудтай заавар, жишээ, тоо, нэр томьёог жинхэнээр нь бич. Энгийн мэндчилгээ, богино асуултад бүрэн хэсэг шаардлагагүй: зөвхөн <ярих> хангалттай.

Хариулах дүрэм:
- Үргэлж монгол хэлээр.
- Зөвхөн хамгийн сүүлийн мессежид хариул. Өмнөх асуултын хариултыг дахин бүү хэл, бүү давт. Хэрэглэгч өөрөө өмнөхийг асуувал л дурд.
- Хэрэглэгч ямар нэг зүйлийг яаж хийхийг асуувал алхам алхмаар, дэлгэрэнгүй, ойлгомжтой заавар өг.

Үнэн зөв байх дүрэм (хамгийн чухал):
- Хэзээ ч таамаглаж, зохиож бүү хэл. Баримт, тоо, огноо, нэр, үнэ, хууль, хүний тухай мэдээллийг итгэлтэй мэдэхгүй бол web_search ашиглаж шалга.
- Өөрчлөгдөж болох бүх зүйлийг (мэдээ, ханш, цаг агаар, үнэ, хэн ямар албан тушаалтай, програмын шинэ хувилбар, спорт) заавал web_search-ээр шалга.
- Хайсан ч олдохгүй эсвэл эргэлзээтэй бол "Би сайн мэдэхгүй байна" эсвэл "Эх сурвалж олдсонгүй" гэж шударгаар хэл.
- Вэбээс авсан мэдээллийн хувьд бүрэн хариултын төгсгөлд эх сурвалжийн нэрийг бич.
- Өмнө нь буруу хэлсэн гэдгээ мэдвэл шууд засаж хэл.

Ажил гүйцэтгэх дүрэм:
- Хэрэглэгч ямар нэг зүйл хий гэвэл хэрэгслүүдийг ашиглаж шууд хий, зүгээр л яаж хийхийг бүү тайлбарла.
- Хэрэглэгч хүсээгүй бол файл устгах, системийн тохиргоо өөрчлөх, хэн нэгэнд мессеж илгээх, худалдан авалт хийх зүйл бүү хий.
- run_powershell, write_file нь хэрэглэгчээс зөвшөөрөл асууна. Татгалзвал хүндэтгэ.
- Хийж дуусаад юу хийснээ хэл.
- Хэрэглэгчийн тухай чухал зүйл мэдвэл (нэр, дуртай зүйл, төсөл) remember-ээр хадгал.

Компьютер: Windows, хэрэглэгчийн хавтас ${os.homedir()}
Одоогийн цаг (Улаанбаатар): ${now}

Хэрэглэгчийн тухай санаж байгаа зүйлс:
${remembered}`;
}

// Хариултын текст хэсгүүдийг нэгтгэнэ (вэб хайлтын ишлэлүүд тусдаа блок болж ирдэг).
const textOf = (content) =>
  content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

/** Ярих хэсгийг хасаад зөвхөн дэлгэцийн текстийг үлдээнэ (түүхэнд хадгалахад). */
const withoutSpeech = (t) => t.replace(/<ярих>[\s\S]*?<\/ярих>/g, "").trim();

// Сайн бодож хариулах: thinking дэмжихгүй бол түүнгүйгээр дахин оролдоно.
let thinkingSupported = true;
async function create(client, params) {
  if (thinkingSupported) {
    try {
      return await client.messages.create({ ...params, thinking: { type: "enabled", budget_tokens: 3000 } });
    } catch (e) {
      if (!(e?.status === 400 && /thinking|budget/i.test(String(e.message)))) throw e;
      thinkingSupported = false;
    }
  }
  return client.messages.create(params);
}

/**
 * Хэрэглэгчийн хүсэлтийг гүйцэтгэж, эцсийн хариултыг буцаана.
 * @param {object} cfg тохиргоо
 * @param {string} text хэрэглэгчийн хэлсэн үг
 * @param {{ status: (t: string) => void, confirm: (t: string) => Promise<boolean>, announce: (t: string) => void }} ctx
 * @param {object} [client] тест хийхэд өөр client дамжуулж болно
 */
async function ask(cfg, text, ctx, client) {
  if (!cfg.anthropicKey && !client) throw new Error("NO_ANTHROPIC");
  client ??= new Anthropic({
    apiKey: cfg.anthropicKey,
    // Workspace-д хамааралгүй түлхүүр ашиглаж байгаа бол аль workspace гэдгийг заана.
    ...(cfg.anthropicWorkspaceId ? { defaultHeaders: { "anthropic-workspace-id": cfg.anthropicWorkspaceId } } : {}),
  });

  const mem = loadMemory();
  // Энэ даалгаврын дотоод яриа: түүх + шинэ мессеж + хэрэгслийн үр дүнгүүд.
  const convo = [...mem.messages, { role: "user", content: text }];
  const allTools = [...tools.TOOL_DEFS, ...tools.SERVER_TOOLS];
  let reply = "";
  let continuing = false;

  for (let step = 0; step < MAX_STEPS; step++) {
    const res = await create(client, {
      model: cfg.model,
      max_tokens: 8000,
      system: systemPrompt(cfg),
      messages: convo,
      tools: allTools,
    });

    convo.push({ role: "assistant", content: res.content });
    const said = textOf(res.content);
    // pause_turn-ий дараах хариу нь өмнөхийн үргэлжлэл тул нэмж залгана.
    if (said) reply = continuing ? `${reply} ${said}` : said;
    continuing = res.stop_reason === "pause_turn";

    // Серверийн хэрэгсэл (вэб хайлт) удаан ажиллавал үргэлжлүүлнэ.
    if (res.stop_reason === "pause_turn") {
      ctx.status(tools.describe("web_search", {}));
      continue;
    }
    if (res.stop_reason !== "tool_use") break;

    const results = [];
    for (const block of res.content) {
      if (block.type !== "tool_use") continue;
      ctx.status(tools.describe(block.name, block.input));
      let content;
      let isError = false;
      try {
        content = await tools.runTool(block.name, block.input, ctx);
      } catch (e) {
        content = `Алдаа: ${e.message}`;
        isError = true;
      }
      results.push({ type: "tool_result", tool_use_id: block.id, content, is_error: isError || undefined });
    }
    convo.push({ role: "user", content: results });
    ctx.status("Бодож байна…");
  }

  if (!reply) reply = "Уучлаарай, энэ удаад хариулт гаргаж чадсангүй.";

  // Урт хугацааны түүхэнд зөвхөн яриаг хадгална (зураг, хэрэгслийн дэлгэрэнгүйг биш).
  // Түүхэнд зөвхөн дэлгэцийн хариуг хадгална: ярих хэсэг давтагдахаас сэргийлнэ.
  const stored = withoutSpeech(reply) || reply.replace(/<\/?ярих>/g, "");
  mem.messages.push({ role: "user", content: text }, { role: "assistant", content: stored });
  saveMemory(mem);
  return reply;
}

function clearMemory() {
  saveMemory({ messages: [] });
}

module.exports = { ask, clearMemory, systemPrompt };
