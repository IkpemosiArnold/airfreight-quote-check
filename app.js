import { quoteRfq, summarize, fmt, kgFmt, CHECKS } from "./quote.js";
import { sheet as sampleSheet, colLetter } from "./sheet.js";
import { rfqs as sampleRfqs } from "./rfqs.js";

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const icon = (name) => {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", `#i-${name}`);
  svg.append(use);
  return svg;
};
const glyph = { pass: "check", fail: "cross", none: "none" };
const wide = window.matchMedia("(min-width: 960px)");
const calm = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const clone = (x) => JSON.parse(JSON.stringify(x));
let sheet = clone(sampleSheet);
let open = null;

/** Text with the values the parser read underlined in place. */
function marked(text, start, end, marks) {
  const frag = document.createDocumentFragment();
  let at = start;
  for (const m of [...marks].sort((a, b) => a.index - b.index)) {
    const ms = m.index;
    const me = m.index + m.text.length;
    if (ms < start || me > end || ms < at) continue;
    frag.append(text.slice(at, ms), el("span", `u ${m.kind || "pass"}`, text.slice(ms, me)));
    at = me;
  }
  frag.append(text.slice(at, end));
  return frag;
}

function emailMarks(q) {
  const f = q.parsed;
  const fail = (s) => ({ ...s, kind: "fail" });
  const breakHeld = q.holds.some((h) => h.check === "break");
  const laneHeld = q.holds.some((h) => h.check === "lane");
  const termHeld = q.holds.some((h) => h.check === "incoterm");
  const curHeld = q.holds.some((h) => h.check === "currency");
  return [
    ...(f.lane.origin?.marks || []).map((m) => (laneHeld ? fail(m) : m)),
    ...(f.lane.dest?.marks || []).map((m) => (laneHeld ? fail(m) : m)),
    ...(f.incoterm?.marks || []).map((m) => (termHeld ? fail(m) : m)),
    ...f.pieces,
    ...(f.volume ? [f.volume] : []),
    ...f.weights.map((w) => (breakHeld ? fail(w) : w)),
    ...(f.ready ? [q.holds.some((h) => h.check === "valid") ? fail(f.ready) : f.ready] : []),
    ...(f.currency ? [curHeld ? fail(f.currency) : f.currency] : []),
    ...(f.door ? [f.door] : []),
    ...(f.pickup ? [f.pickup] : []),
  ];
}

function cellChip(c) {
  return el("span", "chip", c.ref);
}

/** The source row of a tab, laid out like the sheet, with the used cells outlined. */
function miniGrid(cells) {
  const box = el("div", "grid-wrap");
  const byRow = new Map();
  for (const c of cells) {
    const k = `${c.tab}:${c.row}`;
    if (!byRow.has(k)) byRow.set(k, { tab: c.tab, row: c.row, cols: new Set() });
    byRow.get(k).cols.add(c.col);
  }
  for (const { tab, row, cols } of byRow.values()) {
    const rows = sheet.tabs[tab];
    const fig = el("figure", "grid-fig");
    const scroll = el("div", "grid-scroll");
    const t = el("table", "grid");
    const head = el("tr");
    head.append(el("th", "rn", ""));
    rows[0].forEach((_, i) => head.append(el("th", "cl", colLetter(i))));
    const mk = (r, cls) => {
      const tr = el("tr", cls);
      tr.append(el("th", "rn", String(r + 1)));
      rows[r].forEach((v, i) => {
        const td = el("td", cols.has(i) && r === row ? "hit" : null);
        if (cols.has(i) && r === row) td.append(el("span", "u pass", String(v) || "(empty)"));
        else td.append(String(v));
        tr.append(td);
      });
      return tr;
    };
    t.append(head, mk(0, "hdr"), mk(row));
    scroll.append(t);
    fig.append(scroll, el("figcaption", null, `${sheet.name}, tab ${tab}, row ${row + 1}`));
    box.append(fig);
  }
  return box;
}

function weightBlock(q) {
  const w = q.weight;
  const box = el("div", "calc");
  const line = (label, value, cls) => {
    const p = el("p", `cl-row ${cls || ""}`);
    p.append(el("span", "cl-l", label));
    const v = el("span", "cl-v");
    if (value instanceof Node) v.append(value);
    else v.textContent = value;
    p.append(v);
    box.append(p);
  };
  if (w.volFormula) {
    line("Volume", `${w.volFormula} = ${Math.round(w.volCm3).toLocaleString("en-US")} cm³ (${w.volM3.toLocaleString("en-US", { maximumFractionDigits: 3 })} m³)`);
    const v = el("span");
    v.append(`${Math.round(w.volCm3).toLocaleString("en-US")} ÷ ${Number(w.divisor).toLocaleString("en-US")} = ${kgFmt(w.volKg)} kg `, cellChip(w.divisorCell));
    line("Volumetric weight", v);
  } else line("Volumetric weight", "Not found: no dimensions or volume in the email", "nf");
  line("Gross weight", w.gross.length ? `${w.gross.map(kgFmt).join(" or ")} kg` : "Not found in the email", w.gross.length ? "" : "nf");
  if (w.chargeKg != null) {
    const note = w.wins === "volume" ? "volumetric is higher" : w.wins === "gross" ? "gross is higher" : "the higher of the two";
    line("Chargeable weight", `${kgFmt(w.chargeKg)} kg, ${note}, rounded up to the next 0.5 kg`, "strong");
    if (w.chargedKg) line("Charged as", `${kgFmt(w.chargedKg)} kg chargeable, the next weight break, because it costs less`, "strong");
  } else if (w.gross.length > 1) line("Chargeable weight", "Not settled: the email gives more than one weight", "nf");
  return box;
}

function quoteTable(q) {
  const wrap = el("div", "qlines");
  for (const side of ["Origin", "Freight", "Destination"]) {
    const ls = q.lines.filter((l) => l.side === side);
    if (!ls.length) continue;
    wrap.append(el("p", "q-side", side));
    for (const l of ls) {
      const item = el("div", "q-item");
      const b = el("button", "q-row");
      b.type = "button";
      b.setAttribute("aria-expanded", "false");
      const left = el("span", "q-l");
      left.append(el("span", "q-name", l.label));
      if (l.calc) left.append(el("span", "q-calc", l.calc));
      const refs = el("span", "q-refs");
      l.cells.forEach((c) => refs.append(cellChip(c)));
      if (l.cells.length) left.append(refs);
      const right = el("span", `q-r st-${l.state}`);
      right.append(icon(glyph[l.state]));
      right.append(el("span", "q-amt", l.amount != null ? `${l.currency} ${fmt(l.amount)}` : l.note || "Not found"));
      if (l.amount != null && l.note) right.append(el("span", "q-note", l.note));
      b.append(left, right);
      item.append(b);
      if (l.cells.length) {
        b.addEventListener("click", () => {
          const on = b.getAttribute("aria-expanded") === "true";
          item.querySelector(".grid-wrap")?.remove();
          b.setAttribute("aria-expanded", String(!on));
          if (!on) {
            const g = miniGrid(l.cells);
            g.classList.add("enter");
            item.append(g);
            for (const sc of g.querySelectorAll(".grid-scroll")) {
              const hit = sc.querySelector("td.hit");
              if (hit) sc.scrollLeft = Math.max(0, hit.offsetLeft - 56);
            }
            requestAnimationFrame(() => requestAnimationFrame(() => g.classList.add("drawn")));
          }
        });
      } else b.disabled = true;
      wrap.append(item);
    }
  }
  if (q.ready) {
    const tot = el("p", "q-total");
    tot.append(el("span", null, "Total"), el("span", null, `${q.currency} ${fmt(q.total)}`));
    wrap.append(tot);
  }
  return wrap;
}

function reasonsList(q) {
  const ul = el("ul", "reasons");
  for (const h of q.holds) {
    const li = el("li");
    li.append(icon("cross"));
    const s = el("span");
    s.append(h.text);
    if (h.cells.length) {
      const refs = el("span", "q-refs");
      h.cells.forEach((c) => refs.append(cellChip(c)));
      s.append(refs);
    }
    li.append(s);
    ul.append(li);
  }
  return ul;
}

function draftReply(q) {
  const r = q.rfq;
  const first = r.company ? (r.from || "").split(/[ ,]/)[0] : "";
  const lines = q.lines.map((l) => `${l.label}: ${l.currency} ${fmt(l.amount)}`);
  return `${first ? `Hi ${first}` : "Hello"},

thanks for your request. Our offer for ${q.origin} to ${q.dest}, ${q.term}, ${kgFmt(q.weight.chargedKg || q.weight.chargeKg)} kg chargeable${q.weight.chargedKg ? ` (${kgFmt(q.weight.chargeKg)} kg charged at the next weight break, which costs less)` : ""}:

${lines.join("\n")}
Total: ${q.currency} ${fmt(q.total)}

Subject to space and the carrier's rates on the day of booking.

Best regards`;
}

function detail(q) {
  const r = q.rfq;
  const box = el("div", "evidence");
  box.append(el("p", "side-h", `${r.time}, ${r.from}`));
  box.append(el("p", `side-title st-${q.ready ? "pass" : "fail"}`, q.ready ? `Ready to send, ${q.currency} ${fmt(q.total)}` : "Held back"));

  if (!q.ready) {
    box.append(el("p", "ev-h", "Why it is held back"), reasonsList(q));
  }

  box.append(el("p", "ev-h", "The email"));
  const mail = el("div", "mail");
  const marks = emailMarks(q);
  const subjEnd = r.subject.length;
  const subj = el("p", "mail-subj");
  subj.append(marked(q.parsed.text, 0, subjEnd, marks));
  mail.append(el("p", "mail-who", `${r.from}${r.company ? `, ${r.company}` : ""}`), subj);
  const body = el("p", "mail-body");
  body.append(marked(q.parsed.text, subjEnd + 1, q.parsed.text.length, marks));
  mail.append(body);
  box.append(mail);

  box.append(el("p", "ev-h", "Chargeable weight"), weightBlock(q));

  box.append(el("p", "ev-h", `Quote, ${q.currency}${q.currencyFrom === "email" ? ", as the email asks" : ""}. Tap a line for its cells.`), quoteTable(q));

  box.append(el("p", "ev-h", "Checks"));
  const ul = el("ul", "checks");
  for (const c of q.checks) {
    const li = el("li", c.pass ? "st-pass" : "st-fail");
    li.append(icon(c.pass ? "check" : "cross"), el("span", null, c.name));
    ul.append(li);
  }
  box.append(ul);

  if (q.ready) {
    const act = el("div", "actions");
    const btn = el("button", "btn primary", "Approve and draft the reply");
    btn.type = "button";
    const pre = el("p", "draft");
    pre.hidden = true;
    btn.addEventListener("click", () => {
      pre.textContent = draftReply(q);
      pre.hidden = false;
      btn.replaceWith(el("p", "ok-line st-pass", "Approved. Draft below, not sent."));
    });
    act.append(btn);
    box.append(act, pre);
  }
  return box;
}

function rowItem(key, cells, render) {
  const li = el("div", "row-item");
  const btn = el("button", "row verdict");
  btn.type = "button";
  btn.setAttribute("aria-expanded", "false");
  btn.append(...cells);
  const chev = icon("chev");
  chev.classList.add("chev");
  btn.append(chev);
  const entry = { key, li, btn, render };
  btn.addEventListener("click", () => toggle(entry));
  li.append(btn);
  li._entry = entry;
  return li;
}

function closeOpen() {
  if (!open) return;
  open.btn.setAttribute("aria-expanded", "false");
  open.li.querySelector(".evidence")?.remove();
  open = null;
  $("side").replaceChildren();
}

function show(entry, animate = true) {
  const box = entry.render();
  if (animate) box.classList.add("enter");
  entry.btn.setAttribute("aria-expanded", "true");
  if (wide.matches) $("side").replaceChildren(box);
  else entry.li.append(box);
  open = entry;
  requestAnimationFrame(() => requestAnimationFrame(() => box.classList.add("drawn")));
}

function toggle(entry) {
  const same = open && open.key === entry.key;
  closeOpen();
  if (!same) show(entry);
}

wide.addEventListener("change", () => {
  if (!open) return;
  const entry = open;
  closeOpen();
  show(entry, false);
});

function shortReason(q) {
  const h = q.holds[0];
  const name = CHECKS.find((c) => c.id === h.check)?.name;
  const short = {
    valid: () => (q.holds.filter((x) => x.check === "valid").length > 1 ? "Rate and fuel surcharge expired before the ready date." : "A rate expired before the ready date."),
    lane: () => (q.airRow == null && q.origin && q.dest ? `No ${q.origin} to ${q.dest} rate on the sheet.` : "A rate is missing from the sheet."),
    break: () => `Two weights, two weight breaks.`,
    currency: () => `Rate in ${q.lines.find((l) => l.state === "fail")?.currency}, quote in ${q.currency}.`,
    incoterm: () => {
      const m = /no (\w{3}) (origin|destination) rows?/.exec(h.text);
      if (m) return `${q.term} needs ${m[1]} ${m[2]} charges; none on the sheet.`;
      return h.text.split(". ")[0].replace(/\.$/, "") + ".";
    },
    read: () => "Something is missing from the email.",
  }[h.check];
  const others = new Set(q.holds.filter((x) => x.check !== h.check).map((x) => x.check)).size;
  const more = others ? ` And ${others} more.` : "";
  return (short ? short() : name) + more;
}

function render(list, { fresh = false, focusId = null } = {}) {
  closeOpen();
  const results = list.map((r) => quoteRfq(r, sheet));
  const { total, ready, held } = summarize(results);
  const sum = $("summary");
  if (held) {
    sum.replaceChildren(el("span", "sum-main st-fail", `${held} of ${total} held back`), el("span", "sum-side muted", `${ready} ready to send`));
  } else {
    sum.replaceChildren(el("span", "sum-main", `${ready} of ${total} ready to send`));
  }

  const rows = el("div", "rows");
  const order = list.map((_, i) => i).sort((a, b) => (results[a].ready === results[b].ready ? a - b : results[a].ready ? 1 : -1));
  rows.append(...order.map((i) => {
    const q = results[i];
    const st = el("span", `status ${q.ready ? "st-pass" : "st-fail"}`);
    st.append(icon(q.ready ? "check" : "cross"), q.ready ? "Ready" : "Held");
    const val = el("span", "val");
    const lane = q.origin && q.dest ? `${q.origin} to ${q.dest}` : "Lane not found";
    val.append(el("b", null, `${lane}${q.term ? `, ${q.term}` : ""}`), `${q.rfq.from.split(",")[0]}, ${q.rfq.time}`);
    if (q.ready) val.append(el("span", "meta", `${q.currency} ${fmt(q.total)}, ${kgFmt(q.weight.chargeKg)} kg ${q.weight.chargedKg ? `charged as ${kgFmt(q.weight.chargedKg)} kg` : "chargeable"}`));
    else val.append(el("span", "meta st-fail", shortReason(q)));
    return rowItem(`r-${q.rfq.id}-${i}`, [st, val], () => detail(q));
  }));
  if (fresh) rows.classList.add("fresh");
  const g = el("section", "group");
  g.append(el("h2", "group-h", held ? "This morning's RFQs, held back first" : "This morning's RFQs"), rows);
  $("groups").replaceChildren(g);

  let k = 0;
  if (focusId) k = Math.max(0, order.findIndex((i) => list[i].id === focusId));
  const li = rows.children[k];
  if (li && (wide.matches || focusId)) {
    show(li._entry, false);
    if (focusId) li.scrollIntoView({ block: "start", behavior: calm() ? "auto" : "smooth" });
  }
}

/** The whole sample sheet, one tab at a time. */
function renderSheet(tab = "Air") {
  const tabs = $("sheet-tabs");
  tabs.replaceChildren(...Object.keys(sheet.tabs).map((name) => {
    const b = el("button", "tab", name);
    b.type = "button";
    b.setAttribute("aria-pressed", String(name === tab));
    b.addEventListener("click", () => renderSheet(name));
    return b;
  }));
  const rows = sheet.tabs[tab];
  const t = el("table", "grid");
  const head = el("tr");
  head.append(el("th", "rn", ""));
  rows[0].forEach((_, i) => head.append(el("th", "cl", colLetter(i))));
  t.append(head);
  rows.forEach((r, ri) => {
    const tr = el("tr", ri === 0 ? "hdr" : null);
    tr.append(el("th", "rn", String(ri + 1)));
    r.forEach((v) => tr.append(el("td", null, String(v))));
    t.append(tr);
  });
  $("sheet-grid").replaceChildren(t);
}

let current = clone(sampleRfqs);
$("own-check").addEventListener("click", () => {
  const text = $("own-in").value.trim();
  const err = $("own-error");
  if (!text) {
    err.textContent = "Paste an RFQ email first. The first line is read as the subject.";
    err.hidden = false;
    return;
  }
  err.hidden = true;
  const [subject, ...rest] = text.split("\n");
  const today = new Date().toISOString().slice(0, 10);
  const mine = { id: `own-${Date.now()}`, from: "Your RFQ", company: "", date: today, time: "now", subject, body: rest.join("\n") };
  current = [mine, ...current];
  render(current, { fresh: true, focusId: mine.id });
});
$("own-sample").addEventListener("click", () => {
  $("own-in").value = `RFQ PVG-FRA\nHello, FCA Shanghai PVG to Frankfurt FRA.\n4 pallets 120x80x150 cm, gross 900 kg.\nCargo ready 26 Nov. Import customs please.`;
});
$("fix-hkg").addEventListener("click", () => {
  sheet.tabs.Air[3][11] = "01.11.2026";
  sheet.tabs.Air[3][12] = "31.12.2026";
  sheet.tabs.Surcharges[5][6] = "01.11.2026";
  sheet.tabs.Surcharges[5][7] = "30.11.2026";
  renderSheet("Air");
  render(current, { fresh: true, focusId: "hongkong" });
});
$("reset").addEventListener("click", () => {
  sheet = clone(sampleSheet);
  current = clone(sampleRfqs);
  $("own-in").value = "";
  $("own-error").hidden = true;
  renderSheet("Air");
  render(current, { fresh: true });
  $("summary").scrollIntoView({ block: "start", behavior: calm() ? "auto" : "smooth" });
});
$("why-btn").addEventListener("click", () => {
  const t = $("chain");
  t.hidden = !t.hidden;
  $("why-btn").setAttribute("aria-expanded", String(!t.hidden));
});

renderSheet("Air");
render(current);
