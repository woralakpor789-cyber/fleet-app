// lib/statementImport.ts — อ่านใบแจ้งยอดฟลีทการ์ดจากไฟล์ (PDF / JPG / PNG)
//
// กลยุทธ์: เรารู้ "ชื่อบัญชีบัตร" ทุกใบอยู่แล้ว (ISUZU 72-5949, TOYOTA 2860 …)
// จึงใช้ชื่อเหล่านั้นเป็นจุดยึดค้นในข้อความ แล้วดึงตัวเลขที่อยู่ใกล้ๆ
// แม่นกว่าการพยายามอ่านโครงตารางทั้งใบ (ซึ่งพังง่ายเมื่อสแกนเอียง/กลับหัว)
//
// ⚠️ ใบแจ้งยอดที่ลูกค้าสแกนมามัก **กลับหัว 180°** → ลอง OCR ทั้ง 2 ทิศแล้วเลือกอันที่เจอชื่อบัตรมากกว่า

import { isImageFile, isPdfFile, looksScanned, readPdfText, renderPdfPages } from "./docImport/pdfText";
import { ocrImage } from "./docImport/imageOcr";

export type StatementScan = {
  statementDate: string | null;   // YYYY-MM-DD
  dueDate: string | null;
  total: number | null;
  lines: { account: string; amount: number }[];
  rawLength: number;
  usedOcr: boolean;
  rotated: boolean;
};

const money = (s: string) => +s.replace(/,/g, "");

/** ทำภาพให้กลับหัว 180° (คืน canvas ใหม่) */
async function rotate180(src: File | Blob | HTMLCanvasElement): Promise<HTMLCanvasElement> {
  const bmp = src instanceof HTMLCanvasElement
    ? src
    : await createImageBitmap(src as Blob);
  const w = "width" in bmp ? bmp.width : 0;
  const h = "height" in bmp ? bmp.height : 0;
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.translate(w, h);
  ctx.rotate(Math.PI);
  ctx.drawImage(bmp as CanvasImageSource, 0, 0);
  return c;
}

/** นับว่าข้อความนี้เจอชื่อบัญชีบัตรกี่ใบ — ใช้ตัดสินว่าทิศไหนอ่านถูก */
function hits(text: string, accounts: string[]): number {
  return accounts.filter((a) => findAccount(text, a) >= 0).length;
}

/** ค้นชื่อบัญชีแบบยืดหยุ่น: "ISUZU 72-5949" → ISUZU\s*72\s*-?\s*5949 */
function accountRegex(account: string): RegExp {
  const parts = account.trim().split(/\s+/);
  const brand = parts[0] ?? "";
  const num = (parts[1] ?? "").replace(/\D/g, "");
  const numPat = num.split("").join("\\s*-?\\s*");
  return new RegExp(`${brand}\\s*[-\\s]*${numPat}`, "i");
}

function findAccount(text: string, account: string): number {
  const m = accountRegex(account).exec(text);
  return m ? m.index : -1;
}

/**
 * ดึงยอดของบัตรใบหนึ่งจากข้อความ
 * แถวในใบแจ้งยอด: เลขบัตร | ชื่อบัญชี | วงเงิน | ยอดคงค้าง | ยอดชำระขั้นต่ำ | ...
 * เคล็ด: **ยอดคงค้าง = ยอดชำระขั้นต่ำ เสมอ** (บัตรนิติบุคคลจ่ายเต็ม) → ตัวเลขที่ซ้ำกันคือยอดที่ต้องการ
 */
function amountNear(text: string, at: number): number | null {
  const win = text.slice(Math.max(0, at - 160), at + 200);
  const nums = [...win.matchAll(/\d{1,3}(?:,\d{3})+(?:\.\d{2})?|\d+\.\d{2}/g)].map((m) => money(m[0]));
  if (!nums.length) return null;
  // ตัวเลขที่ปรากฏซ้ำ = ยอดคงค้าง (ตรงกับยอดชำระขั้นต่ำ)
  const count = new Map<number, number>();
  for (const n of nums) count.set(n, (count.get(n) ?? 0) + 1);
  const dup = [...count.entries()].filter(([, c]) => c >= 2).map(([n]) => n);
  if (dup.length) return Math.max(...dup);
  // สำรอง: ตัดวงเงิน (มักเป็นเลขกลมหลักหมื่น/แสน) แล้วเอาตัวที่เหลือมากสุด
  const notRound = nums.filter((n) => n % 10000 !== 0);
  if (notRound.length) return Math.max(...notRound);
  return Math.min(...nums);
}

function parseDate(text: string, labels: RegExp): string | null {
  const m = labels.exec(text);
  if (!m) return null;
  const d = /(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/.exec(text.slice(m.index, m.index + 80));
  if (!d) return null;
  let y = +d[3];
  if (y > 2400) y -= 543;
  return `${y}-${String(+d[2]).padStart(2, "0")}-${String(+d[1]).padStart(2, "0")}`;
}

/** อ่านไฟล์ 1 ไฟล์ → ข้อความ (ลองทั้งทิศปกติและกลับหัว เลือกอันที่เจอชื่อบัตรมากกว่า) */
async function fileToText(
  file: File,
  accounts: string[],
  onProgress?: (msg: string) => void,
): Promise<{ text: string; usedOcr: boolean; rotated: boolean }> {
  if (isPdfFile(file.name)) {
    onProgress?.("อ่าน PDF…");
    const t = await readPdfText(file);
    if (!looksScanned(t) && hits(t, accounts) > 0) return { text: t, usedOcr: false, rotated: false };
    // PDF สแกน → เรนเดอร์เป็นรูปแล้ว OCR
    onProgress?.("เป็นไฟล์สแกน — กำลังแปลงเป็นรูป");
    const pages = await renderPdfPages(file, 3);
    let all = "", rotated = false;
    for (let i = 0; i < pages.length; i++) {
      onProgress?.(`OCR หน้า ${i + 1}/${pages.length}…`);
      const a = await ocrImage(pages[i], (p) => onProgress?.(`OCR หน้า ${i + 1} — ${p}%`));
      const b = await ocrImage(await rotate180(pages[i]), (p) => onProgress?.(`OCR หน้า ${i + 1} (กลับหัว) — ${p}%`));
      if (hits(b, accounts) > hits(a, accounts)) { all += b + "\n"; rotated = true; }
      else all += a + "\n";
    }
    return { text: all, usedOcr: true, rotated };
  }
  if (isImageFile(file.name)) {
    onProgress?.("OCR รูป…");
    const a = await ocrImage(file, (p) => onProgress?.(`OCR — ${p}%`));
    if (hits(a, accounts) >= Math.max(3, accounts.length / 3)) return { text: a, usedOcr: true, rotated: false };
    onProgress?.("ลองกลับหัว 180°…");
    const b = await ocrImage(await rotate180(file), (p) => onProgress?.(`OCR (กลับหัว) — ${p}%`));
    return hits(b, accounts) > hits(a, accounts)
      ? { text: b, usedOcr: true, rotated: true }
      : { text: a, usedOcr: true, rotated: false };
  }
  throw new Error("รองรับเฉพาะ PDF, JPG, PNG");
}

/** อ่านใบแจ้งยอดจากหลายไฟล์ → ยอดรายบัตร + วันที่ + ยอดรวม */
export async function scanStatement(
  files: File[],
  accounts: string[],
  onProgress?: (msg: string) => void,
): Promise<StatementScan> {
  let text = "", usedOcr = false, rotated = false;
  for (let i = 0; i < files.length; i++) {
    onProgress?.(`ไฟล์ ${i + 1}/${files.length} — ${files[i].name}`);
    const r = await fileToText(files[i], accounts, onProgress);
    text += r.text + "\n";
    usedOcr = usedOcr || r.usedOcr;
    rotated = rotated || r.rotated;
  }
  const flat = text.replace(/\s+/g, " ");

  const lines: { account: string; amount: number }[] = [];
  for (const a of accounts) {
    const at = findAccount(flat, a);
    if (at < 0) continue;
    const amt = amountNear(flat, at);
    if (amt != null && amt >= 0) lines.push({ account: a, amount: amt });
  }

  // ยอดรวม: ตัวเลขถัดจากคำว่า TOTAL
  let total: number | null = null;
  const tm = /TOTAL\D{0,20}(\d{1,3}(?:,\d{3})+(?:\.\d{2})?)/i.exec(flat);
  if (tm) total = money(tm[1]);

  return {
    statementDate: parseDate(flat, /STATEMENT\s*DATE|วันที่ในใบแจ้งยอด/i),
    dueDate: parseDate(flat, /DUE\s*DATE|วันครบกำหนด/i),
    total,
    lines,
    rawLength: flat.length,
    usedOcr,
    rotated,
  };
}
