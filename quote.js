// Prices a parsed RFQ from the rate sheet. Every line keeps the cells it came from.
// Plain checks hold the quote back; nothing is converted, assumed or filled in.
import { cellAt, airports } from "./sheet.js";
import { parseRfq, iso } from "./parse.js";

export const CHECKS = [
  { id: "read", name: "Read from the email" },
  { id: "lane", name: "Lane and rates on the sheet" },
  { id: "valid", name: "Rates valid on the ready date" },
  { id: "break", name: "One weight, one weight break" },
  { id: "currency", name: "One currency" },
  { id: "incoterm", name: "Incoterm charges on the sheet" },
];

const BREAKS = [
  { col: 5, label: "-45", from: 0 },
  { col: 6, label: "+45", from: 45 },
  { col: 7, label: "+100", from: 100 },
  { col: 8, label: "+300", from: 300 },
  { col: 9, label: "+500", from: 500 },
  { col: 10, label: "+1000", from: 1000 },
];
const SEA_ONLY = ["FAS", "FOB", "CFR", "CIF"];

/** What the customer pays for under each Incoterms 2020 rule, as the forwarder's customer sees it. */
const NEEDS = {
  buyer: {
    EXW: ["O:PUP", "O:ECC", "O:OHC", "FRT", "D:DHC", "D:ICC"],
    FCA: ["O:OHC", "FRT", "D:DHC", "D:ICC"],
    CPT: ["D:DHC", "D:ICC"],
    CIP: ["D:DHC", "D:ICC"],
    DAP: ["D:ICC"],
    DPU: ["D:ICC"],
    DDP: [],
  },
  seller: {
    EXW: [],
    FCA: ["O:PUP", "O:ECC"],
    CPT: ["O:PUP", "O:ECC", "O:OHC", "FRT"],
    CIP: ["O:PUP", "O:ECC", "O:OHC", "FRT", "INS"],
    DAP: ["O:PUP", "O:ECC", "O:OHC", "FRT", "D:DHC", "D:DEL"],
    DPU: ["O:PUP", "O:ECC", "O:OHC", "FRT", "D:DHC", "D:DEL", "D:UNL"],
    DDP: ["O:PUP", "O:ECC", "O:OHC", "FRT", "D:DHC", "D:DEL", "D:ICC", "D:DUT"],
  },
};
const NAMES = {
  PUP: "Pickup", ECC: "Export customs clearance", OHC: "Origin handling", DHC: "Destination handling",
  ICC: "Import customs clearance", DEL: "Delivery", INS: "Cargo insurance, Institute Cargo Clauses (A), 110% of the contract price",
  UNL: "Unloading at destination", DUT: "Import duties and taxes",
};

export const cents = (s) => Math.round(Number(String(s).replace(/,/g, "")) * 100);
export const fmt = (c) => (c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const kgFmt = (kg) => kg.toLocaleString("en-US", { maximumFractionDigits: 1 });
const nfmt = (n) => n.toLocaleString("en-US", { maximumFractionDigits: 3 });
export const sheetDate = (s) => {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(String(s).trim());
  return m ? iso(m[3], m[2], m[1]) : null;
};
export const showDate = (isoDate) => {
  const [y, m, d] = isoDate.split("-").map(Number);
  return `${d} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]} ${y}`;
};

/** Chargeable weight for one gross weight: the higher of gross and volumetric, rounded up to the next 0.5 kg. */
export function chargeable(grossKg, volKg) {
  const higher = Math.max(grossKg, volKg ?? 0);
  return Math.ceil(higher * 2 - 1e-9) / 2;
}

/** The weight break for a chargeable weight, then the cheaper of that and any higher break charged at its threshold. */
export function priceFreight(sh, row, kg, perKg = 0) {
  const air = sh.tabs.Air;
  const rate = (b) => cents(air[row][b.col]);
  let at = BREAKS[0];
  for (const b of BREAKS) if (kg >= b.from) at = b;
  const base = { brk: at, kg, rate: rate(at), amount: Math.round(rate(at) * kg) };
  let best = base;
  // A higher break raises the chargeable weight, so surcharges charged on chargeable weight (perKg) rise with it.
  const allIn = (x) => x.amount + Math.round(perKg * x.kg);
  for (const b of BREAKS) {
    if (b.from <= at.from) continue;
    const next = { brk: b, kg: b.from, rate: rate(b), amount: Math.round(rate(b) * b.from) };
    if (allIn(next) < allIn(best)) best = next;
  }
  const min = cents(air[row][4]);
  return { base, best, min, usesMin: best.amount < min, amount: Math.max(best.amount, min) };
}

/** The carrier's per-kg surcharges that are charged on chargeable weight, in cents. */
export function followsKg(sh, carrier) {
  return sh.tabs.Surcharges.reduce((sum, x, i) => (i > 0 && x[0] === carrier && x[5] !== "Gross" ? sum + cents(x[4]) : sum), 0);
}

function localRow(sh, station, side, code, postcode) {
  const rows = sh.tabs.Local;
  const found = [];
  for (let r = 1; r < rows.length; r++) {
    const [st, sd, cd] = rows[r];
    if ((st === station || st === "ALL") && sd === side && cd === code) found.push(r);
  }
  if (!found.length) return { row: null, why: "none" };
  const zoned = found.filter((r) => rows[r][8]);
  if (!zoned.length) return { row: found[0] };
  if (!postcode) return { row: null, why: "postcode", rows: zoned };
  const hit = zoned.find((r) => rows[r][8].split(/,\s*/).includes(postcode.slice(0, 2)));
  return hit != null ? { row: hit } : { row: null, why: "zone", rows: zoned };
}

function localLine(sh, r, side, chargeKg) {
  const row = sh.tabs.Local[r];
  const c = (col) => cellAt(sh, "Local", r, col);
  const fixed = row[5] ? cents(row[5]) : 0;
  const perKg = row[6] ? cents(row[6]) : 0;
  const min = row[7] ? cents(row[7]) : 0;
  const cells = [c(3)];
  let calc = "";
  let amount = fixed;
  if (perKg) {
    const byKg = Math.round(perKg * chargeKg);
    const kgPart = Math.max(byKg, min);
    amount += kgPart;
    cells.push(c(6));
    calc = `${kgFmt(chargeKg)} kg × ${row[6]}`;
    if (min && byKg < min) { calc += ` = ${fmt(byKg)}, minimum ${row[7]} applies`; cells.push(c(7)); }
    if (fixed) { calc = `${row[5]} + ${calc}`; cells.push(c(5)); }
  } else {
    cells.push(c(5));
    calc = "Per shipment";
  }
  return { side, code: row[2], label: row[3], calc, amount, currency: row[4], cells, curCell: c(4), state: "pass" };
}

export function quoteRfq(rfq, sh) {
  const f = parseRfq(rfq);
  const holds = [];
  const hold = (check, text, cells = []) => holds.push({ check, text, cells });
  const terms = sh.tabs.Terms;
  const termCell = (label) => {
    const r = terms.findIndex((x) => x[0] === label);
    return r > 0 ? cellAt(sh, "Terms", r, 1) : null;
  };
  const divisorCell = termCell("Volume divisor (cm³ per kg)");
  const quoteCurCell = termCell("Quote currency");
  const homeCell = termCell("Home country");
  const divisor = Number(divisorCell?.value) || null;

  // 1. Read from the email. Anything missing is named, never filled in.
  const missing = [];
  if (!f.lane.origin) missing.push("the origin airport");
  if (!f.lane.dest) missing.push("the destination airport");
  if (!f.incoterm) missing.push("the Incoterm");
  if (!f.weights.length) missing.push("the gross weight");
  if (!f.pieces.length && !f.volume) missing.push(f.loosePieces.length ? "how many pieces have those dimensions" : "the dimensions or volume");
  if (!f.ready) missing.push("the cargo ready date");
  if (missing.length) hold("read", `Not found in the email: ${missing.join(", ")}.`);
  if (f.lane.extra) hold("read", `The email names ${f.lane.extra.length} airports (${f.lane.extra.join(", ")}). Which two is the lane?`);

  // Volume and the weights.
  let volCm3 = null;
  let volM3 = null;
  let volFormula = null;
  if (f.pieces.length) {
    volCm3 = f.pieces.reduce((s, p) => s + p.count * p.l * p.w * p.h, 0);
    volM3 = volCm3 / 1e6;
    volFormula = f.pieces.map((p) => `${p.count} × ${nfmt(p.l)} × ${nfmt(p.w)} × ${nfmt(p.h)} cm`).join(" + ");
  } else if (f.volume) {
    volM3 = f.volume.m3;
    volCm3 = volM3 * 1e6;
    volFormula = `${nfmt(volM3)} m³ × 1,000,000`;
  }
  const volKg = volCm3 != null && divisor ? volCm3 / divisor : null;
  const grossList = [...new Set(f.weights.map((w) => w.kg))];
  const options = grossList.map((g) => ({ gross: g, chargeKg: chargeable(g, volKg) }));
  const chargeKgs = [...new Set(options.map((o) => o.chargeKg))];
  const weight = {
    pieces: f.pieces, volFormula, volCm3, volM3, divisor, divisorCell, volKg, gross: grossList,
    chargeKg: chargeKgs.length === 1 ? chargeKgs[0] : null,
    wins: chargeKgs.length === 1 && volKg != null ? (volKg > Math.max(...grossList) ? "volume" : "gross") : null,
  };

  // The lane.
  const origin = f.lane.origin?.code;
  const dest = f.lane.dest?.code;
  const air = sh.tabs.Air;
  let airRow = null;
  if (origin && dest) {
    for (let r = 1; r < air.length; r++) if (air[r][0] === origin && air[r][1] === dest) { airRow = r; break; }
  }

  // The customer's side: the forwarder's home country decides whether the customer buys or sells.
  const home = homeCell?.value;
  const oc = airports[origin]?.country;
  const dc = airports[dest]?.country;
  const role = dc === home && oc !== home ? "buyer" : oc === home && dc !== home ? "seller" : null;
  const term = f.incoterm?.code;
  if (f.incoterm && f.incoterm.codes.length > 1) hold("incoterm", `The email names ${f.incoterm.codes.join(" and ")}. Which one applies?`);

  let needs = [];
  if (term && SEA_ONLY.includes(term)) {
    hold("incoterm", `${term} is a sea and inland waterway rule in Incoterms 2020. For air freight the matching rule is ${{ FAS: "FCA", FOB: "FCA", CFR: "CPT", CIF: "CIP" }[term]}. Ask which one is meant.`);
  } else if (term && origin && dest && !role) {
    hold("incoterm", `Neither or both airports are in ${home} (Terms!B5), so the sheet cannot tell whether the customer is the buyer or the seller.`, homeCell ? [homeCell] : []);
  } else if (term && role) {
    needs = [...NEEDS[role][term]];
    if (role === "buyer" && f.door && !needs.includes("D:DEL")) needs.push("D:DEL");
    if (!needs.length) hold("incoterm", role === "seller" ? `Under ${term} the buyer arranges the carriage, so there is nothing to quote to the seller.` : `Under ${term} the seller pays to the door, so there is nothing to quote to the buyer.`);
  }

  const lines = [];
  const kg = weight.chargeKg;
  const weightBlocked = chargeKgs.length > 1;

  // Freight: base rate at the right break, fuel and security surcharges, the air waybill fee.
  if (needs.includes("FRT")) {
    if (!origin || !dest) {
      // already named under "read"
    } else if (airRow == null) {
      hold("lane", `No row for ${origin} to ${dest} on the Air tab.`);
      lines.push({ side: "Freight", code: "AF", label: `Air freight ${origin} to ${dest}`, calc: "", amount: null, state: "none", note: "Not on the sheet", cells: [] });
    } else {
      const row = air[airRow];
      const carrier = row[2];
      const c = (col) => cellAt(sh, "Air", airRow, col);
      let chargedKg = kg;
      if (kg != null) {
        const p = priceFreight(sh, airRow, kg, followsKg(sh, carrier));
        chargedKg = p.best.kg;
        if (chargedKg !== kg) weight.chargedKg = chargedKg;
        const cells = [c(p.best.brk.col)];
        let calc = `${kgFmt(kg)} kg × ${fmt(p.best.rate)} (${p.best.brk.label})`;
        if (p.best !== p.base) {
          calc = `${kgFmt(p.best.kg)} kg × ${fmt(p.best.rate)} (${p.best.brk.label}). Cheaper than ${kgFmt(kg)} kg × ${fmt(p.base.rate)} (${p.base.brk.label}) = ${fmt(p.base.amount)}`;
          cells.push(c(p.base.brk.col));
        }
        if (p.usesMin) { calc = `Minimum charge (${calc} = ${fmt(p.best.amount)})`; cells.unshift(c(4)); }
        lines.push({ side: "Freight", code: "AF", label: `Air freight, ${carrier}`, calc, amount: p.amount, currency: row[3], cells, curCell: c(3), state: "pass", freight: p });
      } else {
        lines.push({ side: "Freight", code: "AF", label: `Air freight, ${carrier}`, calc: "", amount: null, currency: row[3], cells: [], curCell: c(3), state: "none", note: "Waits for one weight" });
      }
      const from = sheetDate(row[11]);
      const to = sheetDate(row[12]);
      if (f.ready && to && (f.ready.date > to || (from && f.ready.date < from))) {
        hold("valid", `The ${origin} to ${dest} rate is valid ${showDate(from)} to ${showDate(to)}. Cargo is ready ${showDate(f.ready.date)}.`, [c(11), c(12)]);
        lines[lines.length - 1].state = "fail";
        lines[lines.length - 1].note = `Expired ${showDate(to)}`;
      }

      // Surcharges for this carrier.
      const sur = sh.tabs.Surcharges;
      for (const code of ["FSC", "SSC"]) {
        const r = sur.findIndex((x, i) => i > 0 && x[0] === carrier && x[1] === code);
        const label = code === "FSC" ? "Fuel surcharge" : "Security surcharge";
        if (r < 0) {
          hold("lane", `No ${label.toLowerCase()} (${code}) for ${carrier} on the Surcharges tab.`);
          lines.push({ side: "Freight", code, label, calc: "", amount: null, state: "none", note: "Not on the sheet", cells: [] });
          continue;
        }
        const s = sur[r];
        const sc = (col) => cellAt(sh, "Surcharges", r, col);
        const onGross = s[5] === "Gross";
        const baseKg = onGross ? (grossList.length === 1 ? grossList[0] : null) : chargedKg;
        const line = { side: "Freight", code, label: `${s[2]} (${code})`, currency: s[3], curCell: sc(3), cells: [sc(4), sc(5)], state: "pass" };
        if (baseKg == null) Object.assign(line, { calc: "", amount: null, state: "none", note: "Waits for one weight" });
        else Object.assign(line, { calc: `${kgFmt(baseKg)} kg ${onGross ? "gross" : "chargeable"} × ${s[4]}`, amount: Math.round(cents(s[4]) * baseKg) });
        const sFrom = sheetDate(s[6]);
        const sTo = sheetDate(s[7]);
        if (f.ready && sTo && (f.ready.date > sTo || (sFrom && f.ready.date < sFrom))) {
          hold("valid", `${carrier}'s ${label.toLowerCase()} is valid ${showDate(sFrom)} to ${showDate(sTo)}. Cargo is ready ${showDate(f.ready.date)}.`, [sc(6), sc(7)]);
          line.state = "fail";
          line.note = `Expired ${showDate(sTo)}`;
        }
        lines.push(line);
      }
      const awb = localRow(sh, origin, "Freight", "AWB");
      if (awb.row != null) lines.push(localLine(sh, awb.row, "Freight", kg ?? 0));
    }
  }

  // Origin and destination charges the Incoterm puts on this customer.
  const absent = new Map();
  for (const need of needs) {
    if (need === "FRT") continue;
    const [sideKey, code] = need.includes(":") ? need.split(":") : [null, need];
    const side = sideKey === "O" ? "Origin" : sideKey === "D" ? "Destination" : "Freight";
    const station = sideKey === "O" ? origin : dest;
    if (!station) continue;
    const postcode = code === "PUP" ? f.pickup?.postcode : code === "DEL" ? f.door?.postcode : null;
    const found = side === "Freight" ? { row: null, why: "none" } : localRow(sh, station, side, code, postcode);
    if (found.row != null) {
      const perKg = sh.tabs.Local[found.row][6];
      if (perKg && kg == null) {
        lines.push({ side, code, label: sh.tabs.Local[found.row][3], calc: "", amount: null, state: "none", note: "Waits for one weight", cells: [cellAt(sh, "Local", found.row, 3)] });
      } else lines.push(localLine(sh, found.row, side, kg ?? 0));
      continue;
    }
    const name = NAMES[code] || code;
    let why;
    if (found.why === "postcode") why = `${name} at ${station} is priced by postcode zone, and the email gives no ${code === "PUP" ? "pickup" : "delivery"} postcode.`;
    else if (found.why === "zone") why = `${name} at ${station}: no zone on the sheet covers postcode ${postcode}.`;
    else if (code === "INS") why = `${term} needs the seller to insure the cargo (Institute Cargo Clauses (A), 110% of the contract price). The sheet has no insurance rate.`;
    else if (code === "DUT") why = `${term} puts import duties and taxes on the seller. They depend on the goods and are not on the sheet.`;
    else {
      // Missing rows at one station are named together in one reason.
      const key = `${station} ${side.toLowerCase()}`;
      const prev = absent.get(key);
      if (prev) prev.names.push(name.toLowerCase());
      else {
        const entry = { names: [name.toLowerCase()], station, side, holdIndex: holds.length };
        absent.set(key, entry);
        hold("incoterm", "");
      }
    }
    if (why) hold("incoterm", why, found.rows ? found.rows.map((r) => cellAt(sh, "Local", r, 8)) : []);
    lines.push({ side, code, label: side === "Freight" ? name : `${name}, ${station}`, calc: "", amount: null, state: "none", note: found.why === "none" ? "Not on the sheet" : "No zone", cells: [] });
  }

  const list = (xs) => (xs.length < 2 ? xs[0] : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
  for (const a of absent.values()) {
    holds[a.holdIndex].text = `${term} puts ${list(a.names)} at ${a.station} on your customer. The Local tab has no ${a.station} ${a.side.toLowerCase()} ${a.names.length > 1 ? "rows" : "row"} for ${a.names.length > 1 ? "them" : "it"}.`;
  }

  // One weight, one break.
  if (weightBlocked && needs.includes("FRT") && airRow != null) {
    const parts = options.map((o) => {
      const p = priceFreight(sh, airRow, o.chargeKg, followsKg(sh, air[airRow][2]));
      return { o, p };
    });
    const brks = [...new Set(parts.map((x) => x.p.best.brk.label))];
    const says = parts.map(({ o, p }) => `${kgFmt(o.gross)} kg prices at ${p.best.brk.label}${p.best.kg !== o.chargeKg ? ` as ${kgFmt(p.best.kg)} kg` : ""} (${fmt(p.best.rate)}/kg, ${fmt(p.amount)})`).join("; ");
    hold("break", brks.length > 1
      ? `The email gives ${options.map((o) => `${kgFmt(o.gross)}`).join(" and ")} kg, and they fall in different weight breaks: ${says}. Ask for the final weight.`
      : `The email gives ${options.map((o) => `${kgFmt(o.gross)}`).join(" and ")} kg. Both price at ${brks[0]}, but the totals differ: ${says}. Ask for the final weight.`,
    parts.map(({ p }) => cellAt(sh, "Air", airRow, p.best.brk.col)));
  } else if (weightBlocked) {
    hold("break", `The email gives more than one gross weight (${grossList.map(kgFmt).join(" and ")} kg). Ask for the final weight.`);
  }

  // One currency: every line in the quote currency, or held. No exchange rate is guessed.
  const quoteCur = f.currency?.code || quoteCurCell?.value || null;
  for (const l of lines) {
    if (!l.currency || l.currency === quoteCur) continue;
    hold("currency", `${l.label} is in ${l.currency} (${l.curCell.ref}) and the quote is in ${quoteCur}${f.currency ? ", as the email asks" : ` (${quoteCurCell.ref})`}. The sheet has no exchange rate, so nothing was converted.`, [l.curCell]);
    l.state = "fail";
    l.note = `In ${l.currency}`;
  }

  const priced = lines.filter((l) => l.amount != null && l.state === "pass");
  const ready = holds.length === 0 && lines.length > 0;
  const total = ready ? priced.reduce((s, l) => s + l.amount, 0) : null;
  const checks = CHECKS.map((c) => ({ ...c, pass: !holds.some((h) => h.check === c.id), holds: holds.filter((h) => h.check === c.id) }));
  return { rfq, parsed: f, origin, dest, term, role, weight, lines, holds, checks, ready, total, currency: quoteCur, currencyFrom: f.currency ? "email" : quoteCurCell, airRow };
}

export function summarize(results) {
  const ready = results.filter((r) => r.ready).length;
  return { total: results.length, ready, held: results.length - ready };
}
