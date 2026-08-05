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
    flags,
  };
}

export const emptyFuel = (key: string): ParsedFuel => ({
  key, fileName: "", vehicle_id: null, plateGuess: null,
  fill_date: new Date().toISOString().slice(0, 10),
  odometer: null, liters: null, amount: null,
  fuel_type: "ดีเซล", station: null,
  flags: ["เพิ่มเอง — กรอกให้ครบก่อนบันทึก"],
});
