// lib/docImport/index.ts — รวมขั้นตอน: ไฟล์ → ข้อความ → แถวเอกสารที่พร้อมให้คนตรวจ

import type { Vehicle } from "../types";
import { isImageFile, isPdfFile, looksScanned, readPdfText } from "./pdfText";
import {
  guessDocType, guessProvider, matchVehicle, parseDates, parseInsuranceClass,
  parseMoney, parsePolicyNo, pickStartExpiry, platesFromName,
} from "./parse";
import type { ParsedDoc } from "./types";

export * from "./types";
export * from "./parse";
export { isPdfFile, isImageFile, looksScanned, readPdfText };

let seq = 0;
const nextKey = () => `r${++seq}`;

/**
 * อ่านไฟล์เดียว → แถวเอกสาร
 * ชื่อไฟล์ใช้จับคู่รถ+ประเภท · เนื้อไฟล์ใช้ดึงวันที่/เบี้ย/เลขกรมธรรม์
 * รูป/สแกน: ยังอ่านเนื้อไม่ได้ (รอ OCR เฟส 6C) แต่ยังเดารถ+ประเภทจากชื่อไฟล์ให้
 */
export async function readDocFile(file: File, vehicles: Vehicle[]): Promise<ParsedDoc> {
  // webkitRelativePath มีชื่อโฟลเดอร์ด้วย (ตอนลากทั้งโฟลเดอร์เข้ามา) — ใช้ช่วยจับทะเบียน
  const path = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
  const flags: string[] = [];
  let text = "";

  if (isPdfFile(file.name)) {
    try {
      text = await readPdfText(file);
      if (looksScanned(text)) {
        text = "";
        flags.push("ไฟล์สแกน — อ่านเนื้อไม่ได้ กรอกวันที่เอง");
      }
    } catch {
      flags.push("เปิดไฟล์ PDF ไม่ได้");
    }
  } else if (isImageFile(file.name)) {
    flags.push("ไฟล์รูป — ยังไม่รองรับ OCR กรอกวันที่เอง");
  } else {
    flags.push("ชนิดไฟล์ไม่รองรับ");
  }

  const v = matchVehicle(path, vehicles);
  if (!v) flags.push("จับคู่รถไม่ได้ — เลือกรถเอง");

  const dates = parseDates(text);
  const { start, expiry, sure } = pickStartExpiry(dates);
  if (text && !expiry) flags.push("ไม่พบวันหมดอายุ — กรอกเอง");
  else if (expiry && !sure) flags.push("เดาวันหมดอายุจากวันที่ล่าสุด — ตรวจให้ดี");

  const docType = guessDocType(path, text);
  if (docType === "อื่นๆ") flags.push("เดาประเภทเอกสารไม่ได้");

  return {
    key: nextKey(),
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

/** อ่านหลายไฟล์พร้อมกัน (เรียงตามชื่อไฟล์) */
export async function readDocFiles(
  files: File[],
  vehicles: Vehicle[],
  onProgress?: (done: number, total: number, name: string) => void,
): Promise<ParsedDoc[]> {
  const out: ParsedDoc[] = [];
  for (let i = 0; i < files.length; i++) {
    onProgress?.(i, files.length, files[i].name);
    out.push(await readDocFile(files[i], vehicles));
  }
  onProgress?.(files.length, files.length, "");
  return out;
}
