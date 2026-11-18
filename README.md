# Edith — a Mongolian-speaking desktop AI assistant

**Edith** is a voice assistant for Windows that lives as a glowing 3D orb in the corner of the screen. You speak in Mongolian, Claude (Anthropic API) reasons and acts, and Edith answers out loud in a natural Mongolian voice. It starts with Windows and stays out of the way until you need it.

## English

**What it does**
- Voice in, voice out: speech-to-text and text-to-speech in Mongolian (Chimege API, with automatic fallback to Microsoft Azure Speech, voice "Yesui")
- Uses tools on your PC: opens apps and websites, searches the web, reads and writes files, runs PowerShell commands, sets reminders, looks at the screen and explains what it sees, and keeps long-term memory
- Every action that changes something on your computer shows an "Allow?" card first
- Streams answers, splits long replies into speakable chunks, and converts numbers, dates and units into spoken Mongolian
- A small MCP server (`voice-mcp/`) lets other apps, such as Claude Desktop, make Edith speak

**Tech stack**
- Electron (main process, tray, global hotkey Ctrl+Shift+Space, secure key storage with Windows encryption)
- React + TypeScript + Vite for the UI, React Three Fiber / Three.js for the animated orb
- Node.js, Anthropic SDK (tool use, extended thinking), Chimege and Azure Speech REST APIs
- Model Context Protocol (MCP) server in Node.js for the voice

**Run it**
```bash
npm install
npm run dev      # development
npm run dist     # Windows installer (electron-builder, NSIS)
```
API keys are entered in the Settings window and stored encrypted on the user's machine; no keys are kept in this repository.

---

# Эдит — таны компьютер дээрх Claude

Дэлгэцийн баруун доод буланд амьдардаг гэрэлтдэг 3D бөмбөлөг. Түүний тархи нь
**Claude** өөрөө: та монголоор хэлэхэд сонсож, бодож, ажлыг нь хийгээд, монгол
дуу хоолойгоор хариулна. Компьютер асахад автоматаар асна.

## Юу хийж чадах вэ

| Хэлэх жишээ | Юу хийх |
| --- | --- |
| "Spotify нээ", "VS Code-оо нээ" | Программ нээнэ |
| "YouTube-ээс lo-fi хөгжим тавь" | Хөтөч дээр нээнэ |
| "Өнөөдөр Улаанбаатарт цаг агаар ямар байна?" | Интернэтээс хайна |
| "Downloads-д юу байна?", "Энэ файлыг уншаад товчло" | Файл, хавтастай ажиллана |
| "Ширээн дээр todo файл хийгээд ... гэж бич" | Файл бичнэ (зөвшөөрөл асууна) |
| "Батерей хэд байна?", "Дууг 30 болго" | PowerShell команд (зөвшөөрөл асууна) |
| "20 минутын дараа сануул" | Мэдэгдэл гаргаж, чангаар хэлнэ |
| "Дэлгэц дээр юу байна?", "Энэ алдааг тайлбарла" | Дэлгэцээ харж хариулна |
| "Намайг Пандаман гэдэг гэдгийг санаж бай" | Удаан хадгалах санах ойд бичнэ |

Компьютер дээр өөрчлөлт хийх үйлдэл бүрийн өмнө **"Үүнийг хийх үү?"** гэсэн
карт гарч, таны зөвшөөрлийг хүлээнэ.

## Хэрэглэх

| Үйлдэл | Яах вэ |
| --- | --- |
| Ярих | Бөмбөлөг дээр дарах эсвэл **Ctrl+Shift+Space**, тэгээд ярина |
| Бичиж ярих | Хулганаа дээр нь аваачиж ⌨ дарна |
| Яриаг таслах | Ярьж байхад нь дахин дарна |
| Нуух | – товч, эсвэл taskbar-ын баруун талын дүрс |

Өнгө: **цэнхэр** хүлээж байна, **ногоон** сонсож байна, **ягаан** бодож/ажиллаж
байна, **цайвар** ярьж байна, **улаан** алдаа.

## Суулгах

[Node.js](https://nodejs.org) (LTS) хэрэгтэй.

```bash
npm install
npm run dev
```

Тохиргоо цонхонд:

1. **Claude API түлхүүр** (заавал) — console.anthropic.com
2. Дуу хоолой (аль нэг нь эсвэл хоёулаа):
   - **Chimege токен** — console.chimege.com
   - **Azure Speech түлхүүр + бүс** — portal.azure.com → "Speech service" үүсгэнэ
     (үнэгүй F0 багц хангалттай). Дуу хоолой: Yesui (эмэгтэй) эсвэл Bataa (эрэгтэй).

"Chimege, болохгүй бол Azure" горимд Chimege ажиллахгүй бол автоматаар Azure
руу шилжинэ. Түлхүүрүүд Windows-ийн шифрлэлтээр хадгалагдана.

**Загвар:** анхдагч нь хамгийн чадвартай `claude-opus-5-5`. Зардал багасгах бол
Нарийвчилсан тохиргооноос `claude-sonnet-5-5` эсвэл `claude-haiku-5-5` болгоно.

**Дуу хоолой:** Chimege-ийн 6 эмэгтэй дуу хоолойноос Тохиргоо дотроос сонгож,
"Сонсох" товчоор урьдчилж сонсоно (нэг удаа сонсох нь нэг дуудалт). Хурд, аялгууг
гулсуураар тааруулна. Chimege-ийн туршилтын эрх: эхний 100 дуудалт үнэгүй (1 сар),
дараа нь 200 тэмдэгт тутамд 8₮.

## Жинхэнэ программ болгох

```bash
npm run dist
```

`release` хавтсанд `Edith Setup.exe` гарна. Суулгасны дараа Windows асахад
Эдит өөрөө асна.

## Бүтэц

| Файл | Үүрэг |
| --- | --- |
| `electron/brain.cjs` | Claude-ийн агент давталт, ярианы түүх |
| `electron/tools.cjs` | Хэрэгслүүд: программ, вэб, файл, PowerShell, таймер, дэлгэц, санах ой |
| `electron/speech.cjs` | Chimege болон Azure: яриа ↔ текст, нөөц руу шилжих |
| `electron/main.cjs` | Тунгалаг цонх, tray, товчлол, зөвшөөрөл асуух |
| `electron/config.cjs` | Тохиргоо, түлхүүрийн шифрлэлт |
| `src/Orb.tsx` | Гэрэлтдэг бөмбөлөг (React Three Fiber + shader) |
| `src/audio.ts` | Микрофон, чимээгүй болохыг илрүүлэх, дуу тоглуулах |
| `src/App.tsx` | Төлөв, зөвшөөрлийн карт, сануулга |

## Дараагийн алхмууд

- Нэрээр дуудах ("Хөөе Эдит")
- Хариултыг урсгалаар уншиж, хүлээх хугацааг богиносгох
- Google Calendar, Gmail зэрэгтэй холбох
