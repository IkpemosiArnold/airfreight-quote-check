// A sample forwarder rate sheet for air freight, Q4 2026. Made-up rates and carriers.
// Each tab is a grid: row 1 is the header, cells are addressed like a spreadsheet (Air!I2).
// Dates are written the German way (dd.mm.yyyy), amounts with a decimal point.

export const sheet = {
  name: "Air rates Q4 2026 (sample).xlsx",
  tabs: {
    Terms: [
      ["Setting", "Value"],
      ["Quote currency", "EUR"],
      ["Volume divisor (cm³ per kg)", "6000"],
      ["Chargeable weight rounding", "Up to the next 0.5 kg"],
      ["Home country", "DE"],
    ],
    Air: [
      ["Origin", "Dest", "Carrier", "Curr", "Min", "-45", "+45", "+100", "+300", "+500", "+1000", "Valid from", "Valid to"],
      ["PVG", "MUC", "Carrier A", "EUR", "85.00", "6.20", "4.10", "3.05", "2.55", "2.30", "2.10", "01.10.2026", "31.12.2026"],
      ["PVG", "FRA", "Carrier B", "EUR", "80.00", "5.90", "3.95", "2.90", "2.45", "2.20", "2.00", "01.10.2026", "31.12.2026"],
      ["HKG", "FRA", "Carrier C", "EUR", "90.00", "6.40", "4.30", "3.20", "2.70", "2.45", "2.25", "01.08.2026", "31.10.2026"],
      ["SZX", "MUC", "Carrier A", "EUR", "85.00", "6.30", "4.20", "3.15", "2.65", "2.40", "2.20", "01.10.2026", "31.12.2026"],
      ["SIN", "MUC", "Carrier E", "EUR", "85.00", "6.00", "4.00", "3.00", "2.50", "2.25", "2.05", "01.10.2026", "31.12.2026"],
      ["MUC", "JFK", "Carrier D", "EUR", "75.00", "4.80", "3.30", "2.60", "2.20", "1.95", "1.80", "01.10.2026", "31.12.2026"],
      ["MUC", "ORD", "Carrier D", "USD", "80.00", "5.10", "3.55", "2.80", "2.35", "2.10", "1.95", "01.10.2026", "31.12.2026"],
    ],
    Surcharges: [
      ["Carrier", "Code", "Charge", "Curr", "Per kg", "Basis", "Valid from", "Valid to"],
      ["Carrier A", "FSC", "Fuel surcharge", "EUR", "0.85", "Chargeable", "01.11.2026", "30.11.2026"],
      ["Carrier A", "SSC", "Security surcharge", "EUR", "0.15", "Chargeable", "01.10.2026", "31.12.2026"],
      ["Carrier B", "FSC", "Fuel surcharge", "EUR", "0.80", "Chargeable", "01.11.2026", "30.11.2026"],
      ["Carrier B", "SSC", "Security surcharge", "EUR", "0.15", "Chargeable", "01.10.2026", "31.12.2026"],
      ["Carrier C", "FSC", "Fuel surcharge", "EUR", "0.90", "Chargeable", "01.08.2026", "31.10.2026"],
      ["Carrier C", "SSC", "Security surcharge", "EUR", "0.15", "Gross", "01.08.2026", "31.12.2026"],
      ["Carrier D", "FSC", "Fuel surcharge", "EUR", "0.75", "Chargeable", "01.11.2026", "30.11.2026"],
      ["Carrier D", "SSC", "Security surcharge", "EUR", "0.12", "Chargeable", "01.10.2026", "31.12.2026"],
      ["Carrier E", "FSC", "Fuel surcharge", "EUR", "0.80", "Gross", "01.11.2026", "30.11.2026"],
      ["Carrier E", "SSC", "Security surcharge", "EUR", "0.15", "Gross", "01.10.2026", "31.12.2026"],
    ],
    Local: [
      ["Station", "Side", "Code", "Charge", "Curr", "Per shipment", "Per kg", "Min", "PLZ"],
      ["ALL", "Freight", "AWB", "Air waybill fee", "EUR", "25.00", "", "", ""],
      ["PVG", "Origin", "PUP", "Pickup, Shanghai", "EUR", "60.00", "0.08", "", ""],
      ["PVG", "Origin", "ECC", "Export customs clearance", "EUR", "35.00", "", "", ""],
      ["PVG", "Origin", "OHC", "Origin handling", "EUR", "", "0.10", "30.00", ""],
      ["MUC", "Origin", "PUP", "Pickup, zone 1", "EUR", "85.00", "", "", "80, 81, 85"],
      ["MUC", "Origin", "ECC", "Export declaration (ATLAS)", "EUR", "45.00", "", "", ""],
      ["MUC", "Origin", "OHC", "Origin handling", "EUR", "", "0.12", "35.00", ""],
      ["MUC", "Destination", "DHC", "Destination handling", "EUR", "", "0.12", "35.00", ""],
      ["MUC", "Destination", "ICC", "Import customs clearance", "EUR", "65.00", "", "", ""],
      ["MUC", "Destination", "DEL", "Delivery, zone 1", "EUR", "95.00", "", "", "80, 81, 85"],
      ["FRA", "Destination", "DHC", "Destination handling", "EUR", "", "0.11", "35.00", ""],
      ["FRA", "Destination", "ICC", "Import customs clearance", "EUR", "65.00", "", "", ""],
      ["HKG", "Origin", "OHC", "Origin handling", "EUR", "", "0.10", "30.00", ""],
      ["SIN", "Origin", "OHC", "Origin handling", "EUR", "", "0.10", "30.00", ""],
      ["ICN", "Origin", "OHC", "Origin handling", "EUR", "", "0.10", "30.00", ""],
    ],
  },
};

/** Airports the sample knows, with the words a customer might use for them. */
export const airports = {
  PVG: { country: "CN", names: ["Shanghai Pudong", "Pudong", "Shanghai"] },
  SZX: { country: "CN", names: ["Shenzhen"] },
  HKG: { country: "HK", names: ["Hong Kong"] },
  ICN: { country: "KR", names: ["Incheon", "Seoul"] },
  SIN: { country: "SG", names: ["Singapore", "Changi"] },
  MUC: { country: "DE", names: ["Munich", "München", "Muenchen"] },
  FRA: { country: "DE", names: ["Frankfurt"] },
  JFK: { country: "US", names: ["New York"] },
  ORD: { country: "US", names: ["Chicago"] },
};

const COLS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
export const colLetter = (i) => COLS[i];
export const ref = (tab, row, col) => `${tab}!${COLS[col]}${row + 1}`;

/** A cell with its address, so every figure can point back at where it came from. */
export function cellAt(sh, tab, row, col) {
  const value = sh.tabs[tab]?.[row]?.[col] ?? "";
  return { tab, row, col, ref: ref(tab, row, col), value: String(value) };
}
