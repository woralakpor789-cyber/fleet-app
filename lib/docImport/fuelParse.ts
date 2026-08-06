// lib/docImport/fuelParse.ts — อ่านบิลน้ำมัน (เฟส 6E)
// บิลปั๊มไทยส่วนใหญ่เป็นรูปถ่าย → ใช้ OCR แล้วดึงตัวเลข (ตัวเลข OCR อ่านได้ดีกว่าตัวอักษรไทยมาก)

import { parseDates } from "./parse";

export type ParsedFuel = {
  key: string;
  file?: File;
  fileName: string;
  vehicle_id: string | null;
  plateGuess: string | null;
  fill_date: string | null;
  odometer: number | null;
  liters: number | null;
  amount: number | null;
  fuel_type: string | null;
  station: string | null;
  tax_invoice_no: string | null;
  vat_amount: number | null;
  flags: string[];
};

const num = (s: string) => +s.replace(/,/g, "");

/** ปั๊มที่พบบ่อย (จับจากคำอังกฤษ/ไทยที่ OCR มักอ่านได้) */
function guessStation(text: string): string | null {
  const t = text.toUpperCase();
  if (/\bPTT\b|ปตท/.test(t)) return "ปตท.";
  if (/BANGCHAK|บางจาก/.test(t)) return "บางจาก";
  if (/SHELL|เชลล์/.test(t)) return "เชลล์";
  if (/ESSO|เอสโซ่/.test(t)) return "เอสโซ่";
  if (/CALTEX|คาลเท็กซ์/.test(t)) return "คาลเท็กซ์";
  if (/SUSCO|ซัสโก้/.test(t)) return "ซัสโก้";
  if (/PT\b|พีที/.test(t)) return "พีที";
  return null;
}

/** ชนิดน้ำมันจากคำในบิล */
function guessFuelType(text: string): string | null {
  const t = text.toUpperCase();
  if (/DIESEL|ดีเซล|B7|B20/.test(t)) return "ดีเซล";
  if (/GASOHOL|แก๊สโซฮอล|E20|E85|95|91/.test(t)) return "แก๊สโซฮอล์";
  if (/BENZIN|เบนซิน/.test(t)) return "เบนซิน";
  if (/LPG|NGV/.test(t)) return "LPG";
  return null;
}

/**
 * ดึงลิตร/ยอดเงิน/ราคาต่อลิตร จากบิล
 * กติกา: หา 3 ตัวเลขที่สอดคล้องกัน (ลิตร × ราคา/ลิตร ≈ ยอดเงิน) — ทนต่อ OCR อ่านเลขผิดได้ดีกว่าจับคำ
 */
export function parseFuelAmounts(text: string): { liters: number | null; amount: number | null } {
  const nums = [...text.matchAll(/\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?/g)]
    .map((m) => num(m[0]))
    .filter((n) => n > 0);

  const litersCand = nums.filter((n) => n >= 5 && n <= 300);        // ลิตรต่อครั้ง
  const priceCand = nums.filter((n) => n >= 15 && n <= 60);         // ราคา/ลิตร
  const amountCand = nums.filter((n) => n >= 200 && n <= 30000);    // ยอดจ่าย

  let best: { liters: number; amount: number; err: number } | null = null;
  for (const L of litersCand) {
    for (const P of priceCand) {
      for (const A of amountCand) {
        const err = Math.abs(L * P - A) / A;
        if (err <= 0.02 && (!best || err < best.err)) best = { liters: L, amount: A, err };
      }
    }
  }
  if (best) return { liters: best.liters, amount: best.amount };
  // ไม่พบชุดที่สอดคล้อง → เดาแบบหลวมๆ
  return {
    liters: litersCand.length ? Math.max(...litersCand) : null,
    amount: amountCand.length ? Math.max(...amountCand) : null,
  };
}

/** สร้างแถวบิลน้ำมันจากข้อความที่อ่านได้ */
export function buildFuelRow(
  key: string,
  fileName: string,
  text: string,
  vehicleId: string | null,
  plateGuess: string | null,
  file?: File,
): ParsedFuel {
  const flags: string[] = [];
  const dates = parseDates(text);
  const fill = dates.length ? dates[dates.length - 1] : null;
  const { liters, amount } = parseFuelAmounts(text);

  if (!vehicleId) flags.push("จับคู่รถไม่ได้ — เลือกรถเอง");
  if (!fill) flags.push("ไม่พบวันที่ — กรอกเอง");
  if (!liters || !amount) flags.push("อ่านลิตร/ยอดเงินไม่ครบ — กรอกเอง");
  else flags.push("ค่าจาก OCR — ตรวจให้ดี");

  return {
    key, file, fileName,
    vehicle_id: vehicleId,
    plateGuess,
    fill_date: fill,
    odometer: null,
    liters, amount,
    fuel_type: guessFuelType(text),
    station: guessStation(text),
    tax_invoice_no: null,
    vat_amount: null,
    flags,
  };
}

/**
 * อ่านใบเสร็จ/ใบกำกับภาษีของปั๊ม PTT (ฟอร์มมาตรฐาน — บิลของบริษัทเป็นแบบนี้ทั้งหมด)
 * จุดยึดที่ทนต่อ OCR: ใช้รูปแบบตัวเลขที่เป็นเอกลักษณ์ ไม่พึ่งตัวอักษรไทย (OCR ไทยเพี้ยนบ่อย)
 *  · เลขที่ใบกำกับภาษี = เลขยาว 15-20 หลักติดกัน
 *  · ปริมาณน้ำมัน     = ตัวเลขทศนิยม 3 ตำแหน่ง (เช่น 24.438) — ฟอร์มนี้ใช้ 3 ตำแหน่งเสมอ
 *  · เลขไมล์          = จำนวนเต็ม 4-8 หลัก ที่อยู่ก่อนคำว่า "กิโลเมตร"/กม.
 *  · เลขบัตร 4 ตัวท้าย = ...xxxx6708 ท้ายคำว่า Card
 *  · วันที่           = dd/mm/yyyy (พ.ศ. → ค.ศ.)
 */
export type PttReceipt = {
  invoiceNo: string | null;
  cardLast4: string | null;
  plate: string | null;
  date: string | null;
  odometer: number | null;
  liters: number | null;
  pricePerLiter: number | null;
  amount: number | null;
  vat: number | null;
  fuelType: string | null;
  station: string | null;
};

export function parsePttReceipt(text: string): PttReceipt {
  const flat = text.replace(/\s+/g, " ");

  // เลขที่ใบกำกับภาษี — เลขยาวติดกัน (ตัดพวกเลขผู้เสียภาษี 13 หลักออกด้วยการเอา ≥15)
  const inv = flat.match(/\b(\d{15,22})\b/);

  // เลขบัตร 4 ตัวท้าย — OCR อ่านแถว x ได้หลายแบบ (x X × * ×) จึงจับแบบหลวม
  const card =
    flat.match(/[Cc]ard\s*[\\/|]*\s*[xX×*·.]{4,}\s*(\d{4})/) ??
    flat.match(/[xX×*·]{6,}\s*(\d{4})/) ??
    flat.match(/[Cc]ard\D{0,30}?(\d{4})\s*[:：]/);

  // วันที่ (เอาตัวแรกที่เป็น dd/mm/yyyy)
  let date: string | null = null;
  const dm = flat.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (dm) {
    let y = +dm[3];
    if (y > 2400) y -= 543;
    date = `${y}-${String(+dm[2]).padStart(2, "0")}-${String(+dm[1]).padStart(2, "0")}`;
  }

  // ยอดเงิน — บนบิลปรากฏซ้ำ 2-3 ที่ (จำนวนเงิน · รวมเป็นเงิน · Energy Card: X)
  // เลือก "ค่าที่ปรากฏบ่อยที่สุด" → ทนต่อ OCR อ่านผิดบางจุด
  const moneyAll = [...flat.matchAll(/\b(\d{1,3}(?:,\d{3})+\.\d{2}|\d{2,5}\.\d{2})\b/g)]
    .map((m) => +m[1].replace(/,/g, "")).filter((n) => n >= 100 && n <= 60000);
  let amountBest: number | null = null;
  if (moneyAll.length) {
    const cnt = new Map<number, number>();
    for (const n of moneyAll) cnt.set(n, (cnt.get(n) ?? 0) + 1);
    const top = [...cnt.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
    amountBest = top[0][1] >= 2 ? top[0][0] : Math.max(...moneyAll);
  }

  // ปริมาณ (ลิตร) — ทศนิยม 3 ตำแหน่งเป็นเอกลักษณ์ของฟอร์มนี้
  const litCand = [...flat.matchAll(/\b(\d{1,3}\.\d{3})\b/g)]
    .map((m) => +m[1]).filter((n) => n >= 1 && n <= 400);

  // เลขไมล์ — เลขจำนวนเต็มก่อนคำว่ากิโลเมตร (ทนต่อ OCR ไทยด้วยการรับหลายรูป)
  let odo: number | null = null;
  const odoM = flat.match(/(\d{4,8})\s*(?:ก[ิี]?โลเมตร|กม\.?|km|KM)/);
  if (odoM) odo = +odoM[1];

  // ราคา/ลิตร (15-60 บาท)
  const priceM = flat.match(/\b([1-5]\d\.\d{2})\b/);
  const price = priceM ? +priceM[1] : null;

  /**
   * ลิตร: เชื่อความสัมพันธ์ ลิตร × ราคา/ลิตร = ยอดเงิน มากกว่าการอ่านตัวเลขตรงๆ
   * 1) ถ้ามีตัวเลข 3 ทศนิยมที่คูณราคาแล้วใกล้ยอดเงิน → ใช้ตัวนั้น (ตรงกับบิลเป๊ะ)
   * 2) ถ้าไม่มี แต่รู้ราคาและยอดเงิน → คำนวณเอา (ยอด ÷ ราคา)
   */
  let liters: number | null = null;
  if (price && amountBest) {
    const fit = litCand.find((l) => Math.abs(l * price - amountBest!) / amountBest! < 0.02);
    liters = fit ?? Math.round((amountBest / price) * 1000) / 1000;
  } else if (litCand.length) {
    liters = litCand[0];
  }
  const amount = amountBest;

  // VAT 7%
  const vatM = flat.match(/VAT\s*7\s*%\s*\)?\s*([\d,]+\.\d{2})/i);

  // ชนิดน้ำมัน
  let fuel: string | null = null;
  if (/DIESEL|ดีเซล/i.test(flat)) fuel = "ดีเซล";
  else if (/GASOHOL|E20|E85|91|95/i.test(flat)) fuel = "แก๊สโซฮอล์";
  else if (/LPG|NGV/i.test(flat)) fuel = "LPG";

  // ทะเบียนรถบนบิล
  const plateM = flat.match(/\d{0,2}[ก-ฮ]{1,2}\s?\d{1,4}/);

  return {
    invoiceNo: inv ? inv[1] : null,
    cardLast4: card ? card[1] : null,
    plate: plateM ? plateM[0].replace(/\s/g, "") : null,
    date,
    odometer: odo,
    liters,
    pricePerLiter: price,
    amount,
    vat: vatM ? +vatM[1].replace(/,/g, "") : null,
    fuelType: fuel,
    station: guessStation(flat),
  };
}

export const emptyFuel = (key: string): ParsedFuel => ({
  key, fileName: "", vehicle_id: null, plateGuess: null,
  fill_date: new Date().toISOString().slice(0, 10),
  odometer: null, liters: null, amount: null,
  fuel_type: "ดีเซล", station: null, tax_invoice_no: null, vat_amount: null,
  flags: ["เพิ่มเอง — กรอกให้ครบก่อนบันทึก"],
});

/**
 * สร้างแถวจากใบกำกับภาษี PTT — จับคู่รถด้วย "เลขบัตร 4 ตัวท้าย" เป็นหลัก (แม่นกว่าอ่านทะเบียนไทย)
 * cards: [{ last4, vehicle_id }] จากทะเบียนบัตรในระบบ
 */
export function buildRowFromReceipt(
  key: string,
  fileName: string,
  text: string,
  cards: { last4: string; vehicle_id: string | null; account: string }[],
  matchByPlate: (plate: string) => string | null,
  file?: File,
): ParsedFuel {
  const r = parsePttReceipt(text);
  const flags: string[] = [];

  let vehicleId: string | null = null;
  if (r.cardLast4) {
    const c = cards.find((x) => x.last4 === r.cardLast4);
    if (c?.vehicle_id) vehicleId = c.vehicle_id;
  }
  if (!vehicleId && r.plate) vehicleId = matchByPlate(r.plate);
  if (!vehicleId) flags.push("จับคู่รถไม่ได้ — เลือกรถเอง");

  if (!r.date) flags.push("ไม่พบวันที่");
  if (!r.amount) flags.push("อ่านยอดเงินไม่ได้");
  if (!r.liters) flags.push("อ่านจำนวนลิตรไม่ได้");
  if (!r.odometer) flags.push("ไม่พบเลขไมล์บนบิล");
  // ตรวจความสมเหตุสมผล: ลิตร × ราคา/ลิตร ควรใกล้ยอดรวม
  if (r.liters && r.pricePerLiter && r.amount) {
    const err = Math.abs(r.liters * r.pricePerLiter - r.amount) / r.amount;
    if (err > 0.03) flags.push("ตัวเลขไม่สอดคล้องกัน — ตรวจให้ดี");
  }
  if (!flags.length) flags.push("อ่านครบทุกช่อง");

  return {
    key, file, fileName,
    vehicle_id: vehicleId,
    plateGuess: r.plate,
    fill_date: r.date,
    odometer: r.odometer,
    liters: r.liters,
    amount: r.amount,
    fuel_type: r.fuelType ?? "ดีเซล",
    station: r.station,
    tax_invoice_no: r.invoiceNo,
    vat_amount: r.vat,
    flags,
  };
}
