// lib/docImport/parse.ts — กติกาการอ่านเอกสารรถ (พ.ร.บ./กรมธรรม์/ภาษี)
//
// ⚠️ ข้อเท็จจริงจากการทดสอบไฟล์จริง 5 ส.ค. 2569:
// ข้อความไทยที่ดึงจาก PDF มัก "เพี้ยน" — สระ/วรรณยุกต์กลายเป็น % 8 : (ปัญหา encoding ของฟอนต์)
// → จับทะเบียนรถจากเนื้อไฟล์ไม่ได้ แต่ "ชื่อไฟล์/โฟลเดอร์" มีทะเบียนครบทุกไฟล์
// → กติกาคือ: ทะเบียน+ประเภท ดูจากชื่อไฟล์ · วันที่/เบี้ย/เลขกรมธรรม์ ดูจากเนื้อไฟล์ (ตัวเลขไม่เพี้ยน)

import type { Vehicle } from "../types";

/** ตัดสระ/วรรณยุกต์/อักขระอื่นออก เหลือแต่พยัญชนะไทย — ใช้จับคำแม้ข้อความจะเพี้ยน */
const skel = (s: string) => s.replace(/[^ก-ฮ]/g, "");

/** ตัดเว้นวรรค ขีด จุด เพื่อเทียบทะเบียน */
export const normalizePlate = (s: string) =>
  s.replace(/[\s\-–—._]/g, "").trim().toLowerCase();

// รูปแบบทะเบียนไทยที่พบในชื่อไฟล์ของบริษัท
const PLATE_PATTERNS = [
  /\d{1,2}[ก-ฮ]{1,2}[\s\-]?\d{1,4}/g,   // 3ฒว-9513 · 1กพ 2906 · 6กข8677
  /[ก-ฮ]{2}[\s\-]?\d{1,4}/g,            // ฒค-2860 · ฆฉ 7200 · ผอ2722
  /\d{2}[\s\-]\d{4}/g,                            // 73-2187 · 74-5829 (รถบรรทุก)
];

/** ดึงทะเบียนที่เป็นไปได้จากชื่อไฟล์ + ชื่อโฟลเดอร์ */
export function platesFromName(path: string): string[] {
  const out: string[] = [];
  for (const re of PLATE_PATTERNS) {
    for (const m of path.matchAll(re)) out.push(m[0]);
  }
  return [...new Set(out)];
}

/**
 * จับคู่รถจากชื่อไฟล์ — คืน vehicle ที่ตรง หรือ null
 * 1) เทียบทะเบียนที่ดึงได้แบบตรงตัว  2) เผื่อชื่อไฟล์มีจังหวัดต่อท้าย ใช้วิธี "ชื่อไฟล์มีทะเบียนนี้อยู่"
 */
export function matchVehicle(path: string, vehicles: Vehicle[]): Vehicle | null {
  const cands = platesFromName(path).map(normalizePlate);
  for (const v of vehicles) {
    const p = normalizePlate(v.plate);
    if (p && cands.includes(p)) return v;
  }
  const whole = normalizePlate(path);
  // เรียงทะเบียนยาวก่อน กันกรณีทะเบียนสั้นไปตรงกับส่วนหนึ่งของทะเบียนยาว
  const sorted = [...vehicles].sort((a, b) => b.plate.length - a.plate.length);
  for (const v of sorted) {
    const p = normalizePlate(v.plate);
    if (p.length >= 5 && whole.includes(p)) return v;
  }
  return null;
}

/** เดาประเภทเอกสารจากชื่อไฟล์ (หลัก) แล้วเสริมด้วยเนื้อไฟล์ */
export function guessDocType(fileName: string, text = ""): string {
  const n = skel(fileName);
  const t = skel(text.slice(0, 4000));
  const has = (s: string) => n.includes(skel(s)) || /พรบ|พ\.ร\.บ/i.test(fileName);
  if (n.includes(skel("พรบ")) || n.includes(skel("พ.ร.บ."))) return "พ.ร.บ.";
  if (n.includes(skel("ภาษี"))) return "ภาษีประจำปี";
  if (n.includes(skel("ตรวจสภาพ")) || /ตรอ/.test(fileName)) return "ตรวจสภาพ";
  if (n.includes(skel("กรมธรรม์")) || n.includes(skel("ประกัน")) || /(^|[\s.\-])กธ[.\s]/.test(fileName))
    return "ประกันภัย";
  // เนื้อไฟล์
  if (t.includes(skel("คุ้มครองผู้ประสบภัยจากรถ"))) return "พ.ร.บ.";
  if (t.includes(skel("กรมธรรม์ประกันภัยรถยนต์"))) return "ประกันภัย";
  if (t.includes(skel("เสียภาษีประจำปี"))) return "ภาษีประจำปี";
  void has;
  return "อื่นๆ";
}

// บริษัทประกันที่พบบ่อย (เทียบด้วยโครงพยัญชนะ + รหัส/ชื่ออังกฤษ)
const INSURERS: { name: string; keys: string[] }[] = [
  { name: "ไทยวิวัฒน์", keys: ["ไทยวิวัฒน์", "TVI"] },
  { name: "วิริยะประกันภัย", keys: ["วิริยะ", "Viriyah"] },
  { name: "ทิพยประกันภัย", keys: ["ทิพยประกันภัย", "Dhipaya"] },
  { name: "กรุงเทพประกันภัย", keys: ["กรุงเทพประกันภัย", "Bangkok Insurance"] },
  { name: "สินมั่นคงประกันภัย", keys: ["สินมั่นคง", "Syn Mun Kong"] },
  { name: "เมืองไทยประกันภัย", keys: ["เมืองไทยประกันภัย", "Muang Thai"] },
  { name: "อาคเนย์ประกันภัย", keys: ["อาคเนย์", "Southeast"] },
  { name: "แอลเอ็มจี ประกันภัย", keys: ["LMG"] },
  { name: "ธนชาตประกันภัย", keys: ["ธนชาต", "Thanachart"] },
  { name: "เอ็ม เอส ไอ จี", keys: ["MSIG"] },
  { name: "กรุงไทยพานิชประกันภัย", keys: ["กรุงไทยพานิช", "KPI"] },
  { name: "นวกิจประกันภัย", keys: ["นวกิจ", "Navakij"] },
  { name: "ไทยศรีประกันภัย", keys: ["ไทยศรี", "Thaisri"] },
  { name: "มิตรแท้ประกันภัย", keys: ["มิตรแท้"] },
  { name: "ชับบ์สามัคคีประกันภัย", keys: ["ชับบ์", "Chubb"] },
  { name: "อลิอันซ์ อยุธยา", keys: ["อลิอันซ์", "Allianz"] },
  { name: "คุ้มภัยโตเกียวมารีน", keys: ["โตเกียวมารีน", "Tokio Marine"] },
];

/** เดาบริษัทประกันจากเนื้อไฟล์ */
export function guessProvider(text: string): string | null {
  const s = skel(text);
  const upper = text.toUpperCase();
  for (const ins of INSURERS) {
    for (const k of ins.keys) {
      if (/^[A-Za-z ]+$/.test(k)) {
        if (upper.includes(k.toUpperCase())) return ins.name;
      } else if (s.includes(skel(k))) {
        return ins.name;
      }
    }
  }
  return null;
}

const THAI_MONTHS = [
  ["ม.ค.", "มกราคม"], ["ก.พ.", "กุมภาพันธ์"], ["มี.ค.", "มีนาคม"], ["เม.ย.", "เมษายน"],
  ["พ.ค.", "พฤษภาคม"], ["มิ.ย.", "มิถุนายน"], ["ก.ค.", "กรกฎาคม"], ["ส.ค.", "สิงหาคม"],
  ["ก.ย.", "กันยายน"], ["ต.ค.", "ตุลาคม"], ["พ.ย.", "พฤศจิกายน"], ["ธ.ค.", "ธันวาคม"],
];

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** ปี พ.ศ. → ค.ศ. (รองรับทั้ง 2568 และ 68) */
function toCE(y: number): number {
  if (y > 2400) return y - 543;      // 2568 → 2025
  if (y < 100) return y + 2000 > 2100 ? y + 1957 : y + 2000;
  return y;
}

/** ดึงวันที่ทุกตัวในเอกสาร → คืนเป็น YYYY-MM-DD เรียงจากน้อยไปมาก (ไม่ซ้ำ) */
export function parseDates(text: string): string[] {
  const found = new Set<string>();
  // 26/10/2025 · 26-10-2568 · 26.10.2025
  for (const m of text.matchAll(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/g)) {
    const d = +m[1], mo = +m[2], y = toCE(+m[3]);
    if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12 && y >= 2000 && y <= 2100) found.add(iso(y, mo, d));
  }
  // 31 ธ.ค. 2568 · 31 ธันวาคม 2568 (ใช้กับ OCR ป้ายภาษี)
  for (let i = 0; i < 12; i++) {
    for (const label of THAI_MONTHS[i]) {
      const re = new RegExp(`(\\d{1,2})\\s*${label.replace(/\./g, "\\.?")}\\s*(\\d{2,4})`, "g");
      for (const m of text.matchAll(re)) {
        const d = +m[1], y = toCE(+m[2]);
        if (d >= 1 && d <= 31 && y >= 2000 && y <= 2100) found.add(iso(y, i + 1, d));
      }
    }
  }
  return [...found].sort();
}

const dayDiff = (a: string, b: string) =>
  Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);

/**
 * เลือกวันเริ่ม/วันหมดอายุจากชุดวันที่
 * หลัก: คู่ที่ห่างกัน ~1 ปี (300–430 วัน) = วันคุ้มครองเริ่ม-สิ้นสุด · เลือกคู่ที่หมดอายุช้าสุด
 * สำรอง: ไม่เจอคู่ → ใช้วันที่ล่าสุดเป็นวันหมดอายุ (ติดธงให้ตรวจ)
 */
export function pickStartExpiry(dates: string[]): { start: string | null; expiry: string | null; sure: boolean } {
  let best: { start: string; expiry: string } | null = null;
  for (let i = 0; i < dates.length; i++) {
    for (let j = i + 1; j < dates.length; j++) {
      const diff = dayDiff(dates[i], dates[j]);
      if (diff >= 300 && diff <= 430) {
        if (!best || dates[j] > best.expiry) best = { start: dates[i], expiry: dates[j] };
      }
    }
  }
  if (best) return { start: best.start, expiry: best.expiry, sure: true };
  if (dates.length) return { start: null, expiry: dates[dates.length - 1], sure: false };
  return { start: null, expiry: null, sure: false };
}

/**
 * เบี้ยประกัน/ค่าใช้จ่ายในเอกสาร
 * ⚠️ ห้ามใช้ "ตัวเลขมากสุด" เพราะกรมธรรม์มี **วงเงินคุ้มครอง** (100,000 / 200,000 / 500,000)
 *    ซึ่งใหญ่กว่าเบี้ยเสมอ — เคยทดสอบแล้วได้ค่าผิด
 * กติกา: เบี้ยจริงมักมีทศนิยมสตางค์ (5,492.02 · 5,900.00) และไม่เกินหลักหมื่นต้นๆ
 */
export function parseMoney(text: string): number | null {
  const all = [...text.matchAll(/([\d]{1,3}(?:,\d{3})+(?:\.\d{2})?|\d+\.\d{2})/g)]
    .map((m) => ({ raw: m[1], n: +m[1].replace(/,/g, "") }));
  const inRange = (n: number) => n >= 100 && n <= 60000;
  const withSatang = all.filter((x) => /\.\d{2}$/.test(x.raw) && inRange(x.n)).map((x) => x.n);
  if (withSatang.length) return Math.max(...withSatang);
  const plain = all.filter((x) => inRange(x.n)).map((x) => x.n);
  return plain.length ? Math.max(...plain) : null;
}

/** เลขกรมธรรม์ เช่น 001010/6710/46108-6 */
export function parsePolicyNo(text: string): string | null {
  const m1 = text.match(/\d{4,8}\/\d{3,6}\/[\d\-]{4,10}/);
  if (m1) return m1[0];
  const m2 = text.match(/\*(\d{10,})\*/);          // บาร์โค้ดหัวเอกสาร
  if (m2) return m2[1];
  return null;
}

/** ชั้นประกัน (1 / 2+ / 3+) */
export function parseInsuranceClass(text: string): string | null {
  const m = text.match(/(?:ชั้น|ประเภท)\s*([123])\s*(\+|พลัส)?/);
  if (m) return m[1] + (m[2] ? "+" : "");
  return null;
}
