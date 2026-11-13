// Reads a customer RFQ email with plain rules. Every value keeps the exact text and position
// it came from, so the page can underline it. A value that is not in the email stays null.
import { airports } from "./sheet.js";

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, mai: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, okt: 10, nov: 11, dec: 12, dez: 12 };
export const INCOTERMS = ["EXW", "FCA", "FAS", "FOB", "CPT", "CIP", "CFR", "CIF", "DAP", "DPU", "DDP"];

/** "1.250" is 1250 kg (German thousands), "2,5" is 2.5, "1,250.5" is 1250.5. */
export function num(s) {
  let t = String(s).trim();
  if (t.includes(".") && t.includes(",")) {
    t = t.lastIndexOf(",") > t.lastIndexOf(".") ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  } else if (t.includes(",")) {
    t = /,\d{3}$/.test(t) ? t.replace(/,/g, "") : t.replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(t)) {
    t = t.replace(/\./g, "");
  }
  return Number(t);
}

const span = (m, groupText = m[0], offset = 0) => ({ text: groupText, index: m.index + offset });

function findAirports(text) {
  const hits = [];
  const taken = [];
  const free = (a, b) => !taken.some(([s, e]) => a < e && b > s);
  const names = [];
  for (const [code, a] of Object.entries(airports)) {
    for (const n of a.names) names.push({ code, n });
  }
  names.sort((x, y) => y.n.length - x.n.length);
  for (const { code, n } of names) {
    const re = new RegExp(`\\b${n}\\b`, "gi");
    for (const m of text.matchAll(re)) {
      if (!free(m.index, m.index + m[0].length)) continue;
      taken.push([m.index, m.index + m[0].length]);
      hits.push({ code, text: m[0], index: m.index });
    }
  }
  for (const m of text.matchAll(/\b[A-Z]{3}\b/g)) {
    if (!airports[m[0]] || !free(m.index, m.index + 3)) continue;
    taken.push([m.index, m.index + 3]);
    hits.push({ code: m[0], text: m[0], index: m.index });
  }
  return hits.sort((a, b) => a.index - b.index);
}

/** Origin and destination: "from"/"ex" and "to"/"nach" decide when present, else the order they appear in. */
function lane(text) {
  const hits = findAirports(text);
  const codes = [...new Set(hits.map((h) => h.code))];
  const out = { origin: null, dest: null, hits, extra: null };
  if (codes.length > 2) out.extra = codes;
  const before = (h) => text.slice(Math.max(0, h.index - 8), h.index).toLowerCase();
  let origin = hits.find((h) => /\b(from|ex|von|ab)\s*$/.test(before(h)))?.code;
  let dest = hits.find((h) => /\b(to|nach|into)\s*$/.test(before(h)) && h.code !== origin)?.code;
  if (!origin) origin = codes.find((c) => c !== dest);
  if (!dest) dest = codes.find((c) => c !== origin);
  if (origin) out.origin = { code: origin, marks: hits.filter((h) => h.code === origin) };
  if (dest) out.dest = { code: dest, marks: hits.filter((h) => h.code === dest) };
  return out;
}

const UNIT = String.raw`(?:pcs|pieces|pallets?|plts?|cartons?|ctns?|boxes|box|crates?|cases?|skids?|colli|packages?|pkgs?)`;
const N = String.raw`\d+(?:[.,]\d+)?`;
const DIMS = String.raw`(${N})\s*[x×*]\s*(${N})\s*[x×*]\s*(${N})\s*cm\b`;

function pieces(text) {
  const out = [];
  const used = [];
  const re = new RegExp(String.raw`\b(\d+)\s*(?:x\s+|×\s*|${UNIT}\b[\s,:@]*(?:of\s+|at\s+|each\s+)?)${DIMS}`, "gi");
  for (const m of text.matchAll(re)) {
    out.push({ count: Number(m[1]), l: num(m[2]), w: num(m[3]), h: num(m[4]), text: m[0], index: m.index });
    used.push([m.index, m.index + m[0].length]);
  }
  // Dimensions with no piece count in front: kept so the page can say the count is missing.
  const loose = [];
  for (const m of text.matchAll(new RegExp(DIMS, "gi"))) {
    if (used.some(([s, e]) => m.index >= s && m.index < e)) continue;
    loose.push({ text: m[0], index: m.index });
  }
  return { list: out, loose };
}

function volume(text) {
  const m = new RegExp(String.raw`(${N})\s*(?:cbm|m3|m³)\b`, "i").exec(text);
  return m ? { m3: num(m[1]), text: m[0], index: m.index } : null;
}

/** Every gross weight in the email. A range ("230-260 kg") gives two. Per-piece weights are not read. */
function weights(text) {
  const out = [];
  const taken = [];
  for (const m of text.matchAll(new RegExp(String.raw`(${N})\s*(?:-|–|to|bis)\s*(${N})\s*kgs?\b`, "gi"))) {
    out.push({ kg: num(m[1]), text: m[0], index: m.index, range: true });
    out.push({ kg: num(m[2]), text: m[0], index: m.index, range: true });
    taken.push([m.index, m.index + m[0].length]);
  }
  for (const m of text.matchAll(new RegExp(String.raw`(${N})\s*kgs?\b`, "gi"))) {
    if (taken.some(([s, e]) => m.index >= s && m.index < e)) continue;
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 14).toLowerCase();
    if (/^\s*(each|per|\/)/.test(after)) continue;
    out.push({ kg: num(m[1]), text: m[0], index: m.index });
  }
  return out;
}

function incoterm(text) {
  const found = [];
  for (const m of text.matchAll(new RegExp(`\\b(${INCOTERMS.join("|")})\\b`, "g"))) found.push({ code: m[1], text: m[0], index: m.index });
  for (const m of text.matchAll(/\bex[\s-]?works\b/gi)) found.push({ code: "EXW", text: m[0], index: m.index });
  if (!found.length) return null;
  const codes = [...new Set(found.map((f) => f.code))];
  return { code: codes[0], codes, marks: found };
}

const pad = (n) => String(n).padStart(2, "0");
export const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

function readyDate(text, emailDate) {
  const key = String.raw`\b(?:cargo ready|ready(?: date)?|rfc|available|abholbereit|ready for pick-?up)\b[^0-9\n]{0,20}?`;
  const year = Number(String(emailDate).slice(0, 4));
  let m = new RegExp(key + String.raw`(\d{4})-(\d{2})-(\d{2})`, "i").exec(text);
  if (m) return { date: iso(m[1], m[2], m[3]), text: m[0], index: m.index, yearFromEmail: false };
  m = new RegExp(key + String.raw`(\d{1,2})\.(\d{1,2})\.(\d{4})?`, "i").exec(text);
  if (m) return { date: iso(m[3] || year, m[2], m[1]), text: m[0], index: m.index, yearFromEmail: !m[3] };
  m = new RegExp(key + String.raw`(\d{1,2})(?:st|nd|rd|th)?\.?\s+([A-Za-zä]{3})[a-zä]*\.?(?:\s+(\d{4}))?`, "i").exec(text);
  if (m && MONTHS[m[2].toLowerCase()]) return { date: iso(m[3] || year, MONTHS[m[2].toLowerCase()], m[1]), text: m[0], index: m.index, yearFromEmail: !m[3] };
  return null;
}

function currency(text) {
  const m = /\b(?:quote|quotation|price|prices|offer|rates?|currency|in)\b[^\n.]{0,25}?\b(EUR|USD|GBP|CHF|CNY|HKD|SGD)\b/i.exec(text);
  return m ? { code: m[1].toUpperCase(), text: m[0], index: m.index } : null;
}

function postcodeNear(text, word) {
  const m = new RegExp(String.raw`\b(?:${word})[^\n]{0,60}?\b(\d{5})\b`, "i").exec(text);
  if (!m) return null;
  const at = m.index + m[0].length - 5;
  return { postcode: m[1], text: m[1], index: at };
}

/** subject and body are read as one text: "subject\nbody". */
export function parseRfq(rfq) {
  const text = `${rfq.subject}\n${rfq.body}`;
  const p = pieces(text);
  return {
    text,
    lane: lane(text),
    incoterm: incoterm(text),
    pieces: p.list,
    loosePieces: p.loose,
    volume: volume(text),
    weights: weights(text),
    ready: readyDate(text, rfq.date),
    currency: currency(text),
    door: postcodeNear(text, "deliver(?:y|ed)?"),
    pickup: postcodeNear(text, "pick\\s?-?up|collect(?:ion)?|abholung"),
  };
}
