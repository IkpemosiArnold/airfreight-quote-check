# Quote Check

Customer RFQ emails come in. Plain code reads each one, prices it from a forwarder's air freight rate sheet, and links every price line to the sheet cell it came from. When a rate or charge cannot be traced, the quote is held back with the reason and the cells.

The sample has seven made-up RFQs and one made-up rate sheet (five carriers, Q4 2026). Two quotes are ready. Five are held back on purpose, one for each check.

## What it shows

- **Chargeable weight, with the formula.** Volume is length × width × height × pieces in cm³. Volumetric weight is volume ÷ 6,000, with the divisor read from the sheet (`Terms!B3`). Chargeable weight is the higher of gross and volumetric, rounded up to the next 0.5 kg.
- **The weight break, then the cheaper higher break.** The rate comes from the break the chargeable weight falls in (-45, +45, +100, +300, +500, +1000). If a higher break charged at its threshold weight costs less, that is used, and both cells are shown. Example: 285 kg at +100 (2.60) is 741.00; 300 kg at +300 (2.20) is 660.00, so the quote uses 660.00.
- **Surcharges on the basis the sheet states.** Fuel (FSC) and security (SSC) surcharges are per kg on chargeable or gross weight, as the Surcharges tab says for each carrier.
- **Incoterm charges.** The forwarder is in Germany (`Terms!B5`). When the destination is in Germany the customer is the buyer; when the origin is, the customer is the seller. The Incoterms 2020 rule then decides which origin, freight and destination charges go on the quote.
- **Every line links back.** Tap a line and the sheet row opens with the cells outlined. Anything the email does not say is "not found". Nothing is guessed, converted or borrowed from another lane.

## The checks

A quote is ready only when all of these hold:

1. **Read from the email.** Origin, destination, Incoterm, gross weight, dimensions or volume, and the cargo ready date are all in the email.
2. **Lane and rates on the sheet.** The lane has a row on the Air tab, and the carrier has fuel and security surcharges.
3. **Rates valid on the ready date.** The ready date is inside the validity of the rate and each surcharge.
4. **One weight, one weight break.** The email gives one gross weight. A range such as "approx. 230-260 kg" is held, and the reason says which break each end prices at. A range that volume settles anyway is not held.
5. **One currency.** Every line is in the quote currency (the sheet default, or what the email asks for). There is no exchange rate on the sheet, so nothing is converted.
6. **Incoterm charges on the sheet.** Every charge the Incoterm puts on the customer has a row. A sea-only rule (FAS, FOB, CFR, CIF) on an air RFQ is held. CIP needs cargo insurance and DDP needs duties and taxes; the sample sheet has neither, so both are held.

The five held back in the sample:

- HKG to FRA: the rate and Carrier C's fuel surcharge expired on 31 Oct 2026; cargo is ready on 20 Nov.
- ICN to MUC: no row for the lane.
- SIN to MUC: "approx. 230-260 kg". 230 kg prices at +100 and 260 kg at +300 (as 300 kg).
- MUC to ORD: the rate is in USD and the customer asks for EUR.
- SZX to MUC, EXW: the buyer pays for pickup, export clearance and origin handling, and the sheet has no SZX origin charges.

Press "Load November rates for HKG" and that quote goes through. Paste your own RFQ to price it against the sample sheet.

## Where a model would go

The email reader here is plain rules: airport codes and a few city names, `120x80x110 cm` with a piece count, `kg`, the eleven Incoterms, and dates written as `19 Nov`, `25.11.2026` or `2026-11-25`. Real RFQs are messier. A model would read those, and its output would pass through the same checks, so a person only sees quotes whose figures already trace back to the email and the sheet. The person still approves before the reply goes out.

## Sources for the freight rules

Checked on 13 Nov 2026.

- Volume ÷ 6,000 cm³ per kg, and the higher of volumetric and actual weight is charged: IATA Knowledge Hub, "Air Cargo Tariffs and Rules: What You Need to Know" (27 Jul 2021), https://www.iata.org/en/publications/newsletters/iata-knowledge-hub/air-cargo-tariffs-and-rules-what-you-need-to-know
- The same divisor from a German forwarder ("In der Luftfracht werden 6.000 cm³ einem Kilogramm gleichgesetzt"), and the sea freight ratio of 1 cbm = 1 t: DSV, "Volumengewicht berechnen", https://www.dsv.com/de-de/hilfe/faq/volumengewichtsrechner
- Rounding up to the next half kilogram: time:matters glossary, https://www.time-matters.com/emergency-logistics-glossary/chargeable-weight/ and MOL Logistics weight calculator, https://www.mol-logistics.com/weight-calculator/ . Both are secondary sources; the IATA TACT Rules are paid and were not checked. Some carriers round differently.
- Weight breaks (+45, +100, +300, +500, +1000) and quoting at the next break when it is cheaper: CargoLinked, "How Air Freight Pricing Works" (13 May 2026), https://cargolinked.com/guides/how-air-freight-pricing-works-chargeable-weight
- Fuel and security surcharges per kg on chargeable or gross weight, depending on the airline: FreightWaves, "How is Air Freight Priced?" (2 Jan 2020), https://www.freightwaves.com/news/how-is-air-freight-priced
- FAS, FOB, CFR and CIF are for sea and inland waterway transport: US International Trade Administration, "Know Your Incoterms", https://www.trade.gov/know-your-incoterms
- EXW puts export formalities on the buyer; FCA puts export clearance on the seller: ICC Academy, https://academy.iccwbo.org/incoterms/article/incoterms-2020-exw-or-fca/
- CIP needs insurance under Institute Cargo Clauses (A) for at least 110% of the contract value, unless agreed otherwise: ICC Academy, https://academy.iccwbo.org/incoterms/article/incoterms-2020-cpt-or-cip/

Express couriers often use 5,000 instead of 6,000. Change `Terms!B3` and the volumetric weight follows (there is a test for it).

## Run the tests

```
node --test
```

Needs Node 20 or later. No dependencies. 18 tests cover the sample results, the weight maths, the cheaper higher break, each hold, the "not found" rule, rounding, number formats (`1.250 kg` is 1,250 kg) and that every underlined value sits at its exact place in the email.

## Open the page locally

```
python3 -m http.server 8785
```

Then open http://localhost:8785. The page makes no network calls beyond its own files.

## Limits

- Air freight only, one rate sheet, one carrier per lane. A real sheet has several carriers per lane, routings and transit times; choosing between them is a pricing decision this does not make.
- Who the customer is comes from the home country on the sheet. Cross-trade (neither airport in Germany) is held.
- Pieces need a count and dimensions in cm. Inches, per-piece weights and stackability are not read.
- Local charges have no validity dates in the sample, and delivery and pickup zones are by the first two digits of a German postcode.
- Surcharges use the chargeable weight even when the freight is charged at a higher break, as the sheet says. Some carriers do it differently.
- The reply draft is plain text. Nothing is sent.

## Design

It follows the shared direction for these demos: the result first, rows split by hairlines, and an underline that draws under what the email said and under the cells a price used. Geist for the tool, Newsreader for the customer's email, a freight navy accent. The detail has the shape of the work: the email, the weight calculation, a quote by origin, freight and destination, and the rate sheet row itself.

Fonts: Geist and Newsreader (SIL Open Font License), in `fonts/`.

## Provenance

Built on 13 Nov 2026 with AI coding agents, directed by Arnold Ikpemosi Adeyemi. Made-up rates, carriers and customers. Not a real offer.

## Licence

MIT. See `LICENSE`.
