// lib/docImport/index.ts — รวมขั้นตอน: ไฟล์ → ข้อความ → แถวเอกสารที่พร้อมให้คนตรวจ

import type { Vehicle } from "../types";
import { isImageFile, isPdfFile, looksScanned, readPdfText } from "./pdfText";
import { ocrImage, ocrScannedPdf, type OcrProgress } from "./imageOcr";
import {
  guessDocType, guessProvider, matchVehicle, parseDates, parseInsuranceClass,
  parseMoney, parsePolicyNo, pickStartExpiry, platesFromName,
} from "./parse";
import type { ParsedDoc } from "./types";

export * from "./types";
export * from "./parse";
export { isPdfFile, isImageFile, looksScanned, readPdfText };
export { ocrImage, ocrScannedPdf };

let seq = 0;
const nextKey = () => `r${++seq}`;

export type ReadOptions = {
  /** เปิด OCR สำหรับรูป/ไฟล์สแกน (ช้ากว่ามาก ~5-20 วิ/ไฟล์) */
  useOcr?: boolean;
  onOcr?: OcrProgress;
};

/**
 * อ่านไฟล์เดียว → แถวเอกสาร
 * ชื่อไฟล์ใช้จับคู่รถ+ประเภท · เนื้อไฟล์ใช้ดึงวันที่/เบี้ย/เลขกรมธรรม์
 */
export async function readDocFile(
  file: File,
  vehicles: Vehicle[],
  opts: ReadOptions = {},
): Promise<ParsedDoc> {
  // webkitRelativePath มีชื่อโฟลเดอร์ด้วย (ตอนลากทั้งโฟลเดอร์เข้ามา) — ใช้ช่วยจับทะเบียน
  const path = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
  const flags: string[] = [];
  let text = "";
  let viaOcr = false;

  if (isPdfFile(file.name)) {
    try {
      text = await readPdfText(file);
      if (looksScanned(text)) {
        text = "";
        if (opts.useOcr) {
          try {
            text = await ocrScannedPdf(file, opts.onOcr);
            viaOcr = true;
          } catch {
            flags.push("OCR ไฟล์สแกนไม่สำเร็จ — กรอกวันที่เอง");
          }
        } else {
          flags.push("ไฟล์สแกน — เปิด OCR หรือกรอกวันที่เอง");
        }
      }
    } catch {
      flags.push("เปิดไฟล์ PDF ไม่ได้");
    }
  } else if (isImageFile(file.name)) {
    if (opts.useOcr) {
      try {
        text = await ocrImage(file, opts.onOcr);
        viaOcr = true;
      } catch {
        flags.push("OCR รูปไม่สำเร็จ — กรอกวันที่เอง");
      }
    } else {
      flags.push("ไฟล์รูป — เปิด OCR หรือกรอกวันที่เอง");
    }
  } else {
    flags.push("ชนิดไฟล์ไม่รองรับ");
  }

  const v = matchVehicle(path, vehicles);
  if (!v) flags.push("จับคู่รถไม่ได้ — เลือกรถเอง");

  const dates = parseDates(text);
  const { start, expiry, sure } = pickStartExpiry(dates);
  if (text && !expiry) flags.push("ไม่พบวันหมดอายุ — กรอกเอง");
  else if (expiry && !sure) flags.push("เดาวันหมดอายุจากวันที่ล่าสุด — ตรวจให้ดี");
  if (viaOcr && expiry) flags.push("ค่าจาก OCR — ตรวจให้ดี");

  const docType = guessDocType(path, text);
  if (docType === "อื่นๆ") flags.push("เดาประเภทเอกสารไม่ได้");

  return {
    key: nextKey(),
    file,
    fileName: file.name,
    vehicle_id: v?.id ?? null,
    plateGuess: platesFromName(path)[0] ?? null,
    doc_type: docType,
    provider: text ? guessProvider(text) : null,
    policy_no: text ? parsePolicyNo(text) : null,
    insurance_class: text ? parseInsuranceClass(text) : null,
    start_date: start,
    expiry_date: expiry,
    cost: text ? parseMoney(text) : null,
    note: null,
    flags,
  };
}

/** อ่านหลายไฟล์ตามลำดับ */
export async function readDocFiles(
  files: File[],
  vehicles: Vehicle[],
  opts: ReadOptions & { onFile?: (done: number, total: number, name: string) => void } = {},
): Promise<ParsedDoc[]> {
  const out: ParsedDoc[] = [];
  for (let i = 0; i < files.length; i++) {
    opts.onFile?.(i, files.length, files[i].name);
    out.push(await readDocFile(files[i], vehicles, opts));
  }
  opts.onFile?.(files.length, files.length, "");
  return out;
}
