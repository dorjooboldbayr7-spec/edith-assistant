// Chimege TTS зөвхөн кирилл бичвэр хүлээн авдаг тул илгээхийн өмнө бичвэрийг цэвэрлэнэ:
// тоог монгол үгээр, латин үсгийг кириллээр бичиж, уншигдахгүй тэмдэгтийг арилгана.

const ONES = ["", "нэг", "хоёр", "гурав", "дөрөв", "тав", "зургаа", "долоо", "найм", "ес"];
// Дараа нь үг залгагдах үеийн хэлбэр ("гурван зуу", "таван мянга").
const ONES_ATTR = ["", "нэгэн", "хоёр", "гурван", "дөрвөн", "таван", "зургаан", "долоон", "найман", "есөн"];
const TENS = ["", "арав", "хорь", "гуч", "дөч", "тавь", "жар", "дал", "ная", "ер"];
const TENS_ATTR = ["", "арван", "хорин", "гучин", "дөчин", "тавин", "жаран", "далан", "наян", "ерэн"];

/** 0..999 тоог үгээр. attr=true бол ард нь өөр үг залгагдах хэлбэр. */
function below1000(n, attr) {
  const h = Math.floor(n / 100);
  const t = Math.floor((n % 100) / 10);
  const o = n % 10;
  const parts = [];
  if (h) {
    const hundredWord = t || o || attr ? "зуун" : "зуу";
    parts.push(h === 1 ? hundredWord : `${ONES_ATTR[h]} ${hundredWord}`);
  }
  if (t) parts.push(o || attr ? TENS_ATTR[t] : TENS[t]);
  if (o) parts.push(attr ? ONES_ATTR[o] : ONES[o]);
  return parts.join(" ");
}

function numberToWords(n, attr = false) {
  if (!Number.isFinite(n)) return "";
  if (n === 0) return "тэг";
  if (n < 0) return "хасах " + numberToWords(-n, attr);
  const units = [
    [1e9, "тэрбум", "тэрбум"],
    [1e6, "сая", "сая"],
    [1e3, "мянга", "мянган"],
  ];
  const parts = [];
  let rest = Math.floor(n);
  for (const [size, word, wordAttr] of units) {
    const q = Math.floor(rest / size);
    if (!q) continue;
    rest %= size;
    const unit = rest || attr ? wordAttr : word;
    parts.push(q === 1 ? unit : `${below1000(q, true)} ${unit}`);
  }
  if (rest) parts.push(below1000(rest, attr));
  return parts.join(" ");
}

// Түгээмэл нэрс: галиглахаас илүү зөв дуудагдана.
const WORDS = {
  claude: "Клод",
  anthropic: "Антропик",
  edith: "Эдит",
  google: "Гүүгл",
  youtube: "Ютүүб",
  spotify: "Спотифай",
  chrome: "Хром",
  windows: "Виндоус",
  upwork: "Апворк",
  ok: "окей",
  ai: "эй ай",
  api: "эй пи ай",
  wifi: "вайфай",
};

const LATIN = {
  a: "а", b: "б", c: "к", d: "д", e: "э", f: "ф", g: "г", h: "х", i: "и", j: "ж",
  k: "к", l: "л", m: "м", n: "н", o: "о", p: "п", q: "к", r: "р", s: "с", t: "т",
  u: "у", v: "в", w: "в", x: "кс", y: "й", z: "з",
};
const DIGRAPHS = { sh: "ш", ch: "ч", th: "т", ph: "ф", oo: "үү", ee: "ий", ts: "ц", ya: "я", yu: "ю", kh: "х" };

function transliterate(word) {
  const lower = word.toLowerCase();
  if (WORDS[lower]) return WORDS[lower];
  let out = "";
  for (let i = 0; i < lower.length; i++) {
    const two = lower.slice(i, i + 2);
    if (DIGRAPHS[two]) {
      out += DIGRAPHS[two];
      i++;
    } else {
      out += LATIN[lower[i]] ?? "";
    }
  }
  return word[0] === word[0].toUpperCase() ? out.charAt(0).toUpperCase() + out.slice(1) : out;
}

function toSpeakable(text) {
  return String(text)
    .replace(/https?:\/\/\S+/g, "")
    .replace(/(\d+)\s*%/g, (_, n) => `${numberToWords(Number(n), true)} хувь`)
    .replace(/(\d+)[.,](\d+)/g, (_, a, b) => `${numberToWords(Number(a))} аравтын ${numberToWords(Number(b))}`)
    .replace(/\d+/g, (n) => numberToWords(Number(n)))
    .replace(/[A-Za-z]+/g, transliterate)
    .replace(/[«»"“”„]/g, "")
    .replace(/[—–]/g, ", ")
    .replace(/[^А-Яа-яЁёӨөҮү\s.,!?:;'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

module.exports = { toSpeakable, numberToWords, transliterate };
