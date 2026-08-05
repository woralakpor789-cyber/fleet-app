// lib/docImport/types.ts — ไทป์ของตัวนำเข้าเอกสารรถ (เฟส 6)

/** หนึ่งแถวในตารางตรวจก่อนบันทึก — ผู้ใช้แก้ได้ทุกช่อง */
export type ParsedDoc = {
  key: string;                 // key ของแถว (ไม่เกี่ยวกับ DB)
  fileName: string;            // ไฟล์ต้นทาง ("" = เพิ่มแถวเอง)
  vehicle_id: string | null;   // จับคู่รถได้แล้ว
  plateGuess: string | null;   // ทะเบียนที่เดาจากชื่อไฟล์ (ไว้โชว์ตอนจับคู่ไม่ได้)
  doc_type: string;
  provider: string | null;
  policy_no: string | null;
  insurance_class: string | null;
  start_date: string | null;   // YYYY-MM-DD
  expiry_date: string | null;
  cost: number | null;
  note: string | null;
  flags: string[];             // คำเตือนให้คนตรวจ
};

export const emptyDoc = (key: string): ParsedDoc => ({
  key,
  fileName: "",
  vehicle_id: null,
  plateGuess: null,
  doc_type: "พ.ร.บ.",
  provider: null,
  policy_no: null,
  insurance_class: null,
  start_date: null,
  expiry_date: null,
  cost: null,
  note: null,
  flags: ["เพิ่มเอง — กรอกให้ครบก่อนบันทึก"],
});
