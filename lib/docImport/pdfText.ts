"use client";
// lib/docImport/pdfText.ts — อ่าน text layer ของ PDF ในเบราว์เซอร์ (pdfjs-dist)
// ทำงานฝั่ง client 100% ไฟล์ไม่ออกนอกเครื่อง (แนวเดียวกับ QuoteImport ของ SalesOS)

// lazy-load เฉพาะตอนใช้ — ก้อนใหญ่ ไม่อยากติด bundle หน้าอื่น
let _lib: typeof import("pdfjs-dist") | null = null;
async function getPdfjs() {
  if (_lib) return _lib;
  const lib = await import("pdfjs-dist");
  lib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();
  _lib = lib;
  return lib;
}

export const isPdfFile = (name: string) => /\.pdf$/i.test(name);
export const isImageFile = (name: string) => /\.(jpe?g|png|webp|bmp)$/i.test(name);

/** อ่านข้อความทั้งหมดจาก PDF — คืน "" ถ้าเป็นสแกนที่ไม่มี text layer */
export async function readPdfText(file: File): Promise<string> {
  const lib = await getPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await lib.getDocument({ data }).promise;
  let text = "";
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    text += tc.items.map((i) => ("str" in i ? i.str : "")).join(" ") + "\n";
  }
  return text;
}

/** ข้อความสั้นผิดปกติ = เป็นไฟล์สแกน ต้องใช้ OCR (เฟส 6C) */
export const looksScanned = (text: string) => text.replace(/\s/g, "").length < 40;
