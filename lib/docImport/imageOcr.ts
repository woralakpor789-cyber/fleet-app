"use client";
// lib/docImport/imageOcr.ts — OCR รูป/ไฟล์สแกน ในเบราว์เซอร์ด้วย Tesseract.js (ไทย+อังกฤษ)
// ไฟล์ไม่ออกนอกเครื่อง · โหลดไลบรารี+ภาษาไทยแบบ lazy เฉพาะตอนใช้จริง
//
// ⚠️ ผลทดสอบกับเอกสารจริง (5 ส.ค. 2569): ข้อความไทยที่ OCR อ่านได้ "มั่วพอสมควร"
// แต่ **ตัวเลข/วันที่อ่านได้ดี** ซึ่งพอสำหรับสิ่งที่เราต้องการ (วันหมดอายุ/ยอดเงิน)
// เช่น พรบ ผอ2722 → 24/01/2025–26/01/2026 ถูกต้อง · พรบ ฆฉ7200 → 19/06/2024 ถูกต้อง
// จึงต้องให้คนตรวจทุกแถวเสมอ

import { renderPdfPages } from "./pdfText";

export type OcrProgress = (pct: number, status: string) => void;

/** OCR รูปเดียว (File/Blob/Canvas) */
export async function ocrImage(
  img: File | Blob | HTMLCanvasElement,
  onProgress?: OcrProgress,
): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("tha+eng", 1, {
    logger: (m: { status: string; progress: number }) =>
      onProgress?.(Math.round((m.progress || 0) * 100), m.status || ""),
  });
  try {
    const { data } = await worker.recognize(img);
    return data.text || "";
  } finally {
    await worker.terminate();
  }
}

/** OCR ไฟล์ PDF ที่เป็นสแกน — เรนเดอร์เป็นรูปก่อนแล้วค่อยอ่าน (อ่านไม่เกิน 2 หน้าแรก) */
export async function ocrScannedPdf(file: File, onProgress?: OcrProgress): Promise<string> {
  const pages = await renderPdfPages(file, 2);
  let text = "";
  for (let i = 0; i < pages.length; i++) {
    text += await ocrImage(pages[i], (pct, st) =>
      onProgress?.(pct, `หน้า ${i + 1}/${pages.length} — ${st}`)
    ) + "\n";
  }
  return text;
}
