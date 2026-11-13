import { test } from "node:test";
import assert from "node:assert/strict";
import { quoteRfq, summarize, chargeable, fmt } from "./quote.js";
import { num, parseRfq } from "./parse.js";
import { sheet } from "./sheet.js";
import { rfqs } from "./rfqs.js";

const clone = (x) => JSON.parse(JSON.stringify(x));
const res = Object.fromEntries(rfqs.map((r) => [r.id, quoteRfq(r, sheet)]));
const checksHeld = (q) => [...new Set(q.holds.map((h) => h.check))];
const rfq = (subject, body) => ({ id: "t", from: "", date: "2026-11-13", subject, body });

test("the sample: two ready, five held back, one reason each", () => {
  assert.deepEqual(summarize(Object.values(res)), { total: 7, ready: 2, held: 5 });
  assert.deepEqual(checksHeld(res.hongkong), ["valid"]);
  assert.deepEqual(checksHeld(res.incheon), ["lane"]);
  assert.deepEqual(checksHeld(res.singapore), ["break"]);
  assert.deepEqual(checksHeld(res.chicago), ["currency"]);
  assert.deepEqual(checksHeld(res.shenzhen), ["incoterm"]);
});

test("volumetric weight: 6 x 80 x 60 x 75 cm / 6000 = 360 kg beats 312 kg gross", () => {
  const w = res.garching.weight;
  assert.equal(w.volCm3, 2160000);
  assert.equal(w.divisor, 6000);
  assert.equal(w.divisorCell.ref, "Terms!B3");
  assert.equal(w.volKg, 360);
  assert.equal(w.chargeKg, 360);
  assert.equal(w.wins, "volume");
  assert.equal(fmt(res.garching.total), "1,542.20");
});

test("every line on a ready quote points at sheet cells", () => {
  for (const id of ["garching", "aschheim"]) {
    for (const l of res[id].lines) {
      assert.equal(l.state, "pass", `${id} ${l.label}`);
      assert.ok(l.cells.length > 0, `${id} ${l.label} has cells`);
      for (const c of l.cells) assert.equal(String(sheet.tabs[c.tab][c.row][c.col]), c.value);
    }
  }
  const af = res.garching.lines.find((l) => l.code === "AF");
  assert.equal(af.cells[0].ref, "Air!I2");
  assert.equal(af.amount, 91800);
});

test("a lower charge at a higher weight break is used, and both cells are shown", () => {
  const af = res.aschheim.lines.find((l) => l.code === "AF");
  assert.equal(af.amount, 66000); // 300 kg x 2.20 beats 285 kg x 2.60 = 741.00
  assert.deepEqual(af.cells.map((c) => c.ref), ["Air!I7", "Air!H7"]);
  assert.equal(res.aschheim.weight.chargeKg, 285);
  const ohc = res.aschheim.lines.find((l) => l.code === "OHC");
  assert.equal(ohc.amount, 3500); // 285 x 0.12 = 34.20, minimum 35.00
  assert.equal(res.aschheim.weight.chargedKg, 300);
  const fsc = res.aschheim.lines.find((l) => l.code === "FSC");
  assert.equal(fsc.amount, 22500); // fuel follows the chargeable weight: 300 kg x 0.75
  assert.equal(fmt(res.aschheim.total), "1,111.00");
});

test("an expired rate and an expired fuel surcharge are both named with their cells", () => {
  const refs = res.hongkong.holds.flatMap((h) => h.cells.map((c) => c.ref));
  assert.deepEqual(refs, ["Air!L4", "Air!M4", "Surcharges!G6", "Surcharges!H6"]);
  assert.equal(res.hongkong.total, null);
});

test("renewing the rate and the surcharge lets the quote through", () => {
  const sh = clone(sheet);
  sh.tabs.Air[3][12] = "31.12.2026";
  sh.tabs.Surcharges[5][6] = "01.11.2026";
  sh.tabs.Surcharges[5][7] = "30.11.2026";
  const q = quoteRfq(rfqs.find((r) => r.id === "hongkong"), sh);
  assert.equal(q.ready, true);
});

test("a missing lane is not found, never borrowed from a nearby lane", () => {
  const af = res.incheon.lines.find((l) => l.code === "AF");
  assert.equal(af.amount, null);
  assert.equal(af.state, "none");
  assert.match(res.incheon.holds[0].text, /No row for ICN to MUC/);
});

test("a weight range that spans two breaks is held, with both prices", () => {
  assert.match(res.singapore.holds[0].text, /230 kg prices at \+100 .*260 kg prices at \+300 as 300 kg/);
  assert.equal(res.singapore.lines.find((l) => l.code === "AF").amount, null);
});

test("a range that volume settles is not held", () => {
  const q = quoteRfq(rfq("RFQ SIN-MUC", "FCA Singapore to MUC. 4 cartons 100x100x100 cm, approx. 230-260 kg. Ready 24 Nov. Import customs please."), sheet);
  assert.equal(q.weight.chargeKg, 667); // 4,000,000 cm³ / 6000 = 666.67, up to 667.0
  assert.ok(!checksHeld(q).includes("break"));
});

test("a USD rate on an EUR quote is held and never converted", () => {
  const af = res.chicago.lines.find((l) => l.code === "AF");
  assert.equal(af.currency, "USD");
  assert.equal(af.state, "fail");
  assert.equal(af.amount, 96350);
  assert.equal(res.chicago.holds[0].cells[0].ref, "Air!D8");
});

test("EXW names the origin charges the sheet lacks", () => {
  assert.match(res.shenzhen.holds[0].text, /pickup, export customs clearance and origin handling at SZX/);
  assert.equal(res.shenzhen.lines.filter((l) => l.state === "none").length, 3);
});

test("CIP asks for insurance the sheet does not have", () => {
  const q = quoteRfq(rfq("Export MUC-JFK", "CIP New York JFK, 1 pallet 120x80x110 cm, 285 kg, pickup 85609 Aschheim, ready 25.11.2026"), sheet);
  assert.deepEqual(checksHeld(q), ["incoterm"]);
  assert.match(q.holds[0].text, /Institute Cargo Clauses \(A\), 110%/);
});

test("a sea-only Incoterm on an air RFQ is held", () => {
  const q = quoteRfq(rfq("RFQ PVG-MUC", "FOB Shanghai to Munich, 2 cartons 50x50x50 cm, 60 kg, ready 20 Nov"), sheet);
  assert.match(q.holds.map((h) => h.text).join(" "), /FOB is a sea and inland waterway rule/);
});

test("anything not in the email says not found", () => {
  const q = quoteRfq(rfq("Quote please", "Shanghai to Munich, 3 cartons, 200 kg."), sheet);
  assert.match(q.holds[0].text, /Not found in the email: the Incoterm, the dimensions or volume, the cargo ready date/);
  assert.equal(q.total, null);
});

test("chargeable weight rounds up to the next half kilogram", () => {
  assert.equal(chargeable(312.2, 0), 312.5);
  assert.equal(chargeable(312.5, 0), 312.5);
  assert.equal(chargeable(100, 100.01), 100.5);
  assert.equal(chargeable(133.3, 0), 133.5);
});

test("the divisor comes from the sheet: 5000 gives a heavier volumetric weight", () => {
  const sh = clone(sheet);
  sh.tabs.Terms[2][1] = "5000";
  const q = quoteRfq(rfqs[0], sh);
  assert.equal(q.weight.volKg, 432);
});

test("German and English number formats", () => {
  assert.equal(num("1.250"), 1250);
  assert.equal(num("2,5"), 2.5);
  assert.equal(num("1,250"), 1250);
  assert.equal(num("1.250,5"), 1250.5);
  assert.equal(num("0.36"), 0.36);
});

test("every field read from the email points at its exact text", () => {
  for (const r of rfqs) {
    const f = parseRfq(r);
    const spans = [f.ready, f.currency, f.door, f.pickup, f.volume, ...f.pieces, ...f.weights, ...(f.incoterm?.marks || []), ...(f.lane.origin?.marks || []), ...(f.lane.dest?.marks || [])].filter(Boolean);
    for (const s of spans) assert.equal(f.text.slice(s.index, s.index + s.text.length), s.text, `${r.id}: ${s.text}`);
  }
});

test("FCA puts origin handling at the departure airport on the buyer", () => {
  const ohc = res.garching.lines.find((l) => l.code === "OHC");
  assert.equal(ohc.side, "Origin");
  assert.equal(ohc.amount, 3600); // 360 kg x 0.10
  assert.deepEqual(ohc.cells.map((c) => c.ref), ["Local!D5", "Local!G5"]);
});

test("the sea-only hint names the matching any-mode rule", () => {
  const q = quoteRfq(rfq("RFQ PVG-MUC", "CIF Munich, from Shanghai, 2 cartons 50x50x50 cm, 60 kg, ready 20 Nov"), sheet);
  assert.match(q.holds.map((h) => h.text).join(" "), /the matching rule is CIP\./);
});
