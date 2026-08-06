// โดเมนไทป์ของ FleetOS — ค่าโดเมนเป็นภาษาไทย (ตรงกับข้อมูลใน DB)

export type Vehicle = {
  id: string;
  plate: string;
  plate_province: string | null;
  vtype: string;                 // เก๋ง/กระบะ/บรรทุก/เทรลเลอร์/อื่นๆ
  nickname: string | null;
  brand: string | null;
  model: string | null;
  year: number | null;
  vin: string | null;
  engine_no: string | null;
  color: string | null;
  branch: string | null;
  driver_name: string | null;
  purchase_date: string | null;
  purchase_price: number | null;
  depreciation_years: number | null;
  salvage_pct: number | null;
  status: string;                // ใช้งาน/ซ่อม/ขายแล้ว/ปลดประจำการ
  finance_status: string | null; // ปลอดภาระ/มีเล่มแล้ว · ไฟแนนซ์ (คนละเรื่องกับ status)
  odometer: number | null;
  note: string | null;
  // ---- ปลดประจำการ ----
  in_service_from: string | null;
  disposal_date: string | null;   // มีค่า = ปลดแล้ว
  disposal_type: string | null;
  disposal_price: number | null;
  disposal_to: string | null;
  disposal_note: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type VehicleDoc = {
  id: string;
  vehicle_id: string;
  doc_type: string;              // พ.ร.บ./ประกันภัย/ภาษีประจำปี/ตรวจสภาพ/อื่นๆ
  provider: string | null;
  policy_no: string | null;
  insurance_class: string | null;
  start_date: string | null;
  expiry_date: string;
  cost: number | null;
  note: string | null;
  file_path: string | null;      // ไฟล์แนบใน Storage (bucket fleet-docs)
  created_at: string;
  deleted_at: string | null;
};

export type Claim = {
  id: string;
  vehicle_id: string;
  incident_date: string;
  description: string | null;
  claim_no: string | null;
  status: string;                // แจ้งเคลม/รอประเมิน/กำลังซ่อม/จบเคลม
  damage_cost: number | null;
  excess_cost: number | null;
  repair_shop: string | null;
  note: string | null;
  created_at: string;
  deleted_at: string | null;
};

// กติกา: FleetOS ดูแลเฉพาะยานพาหนะบริษัท — ไม่มีโฟล์คลิฟท์ (โฟล์คลิฟท์อยู่ระบบ SalesOS แยกขาดจากกัน)
export const VTYPES = ["เก๋ง", "กระบะ", "บรรทุก", "เทรลเลอร์", "อื่นๆ"];
export const VEHICLE_STATUSES = ["ใช้งาน", "ซ่อม", "ขายแล้ว", "ปลดประจำการ"];
export const DISPOSAL_TYPES = ["ขาย", "เทิร์นซื้อคันใหม่", "ตัดจำหน่าย", "คืนไฟแนนซ์", "อุบัติเหตุเสียหาย", "อื่นๆ"];

/** ปลดประจำการแล้วหรือยัง */
export const isRetired = (v: Vehicle) =>
  !!v.disposal_date || v.status === "ขายแล้ว" || v.status === "ปลดประจำการ";

/** กำไร/ขาดทุนจากการปลดประจำการ = ราคาที่ได้ − มูลค่าตามบัญชี ณ วันปลด */
export function disposalGain(v: Vehicle): number | null {
  if (!v.disposal_date || v.disposal_price == null) return null;
  const bv = bookValue(v, new Date(v.disposal_date));
  if (bv == null) return null;
  return v.disposal_price - bv;
}
export const FINANCE_STATUSES = ["ปลอดภาระ/มีเล่มแล้ว", "ไฟแนนซ์"];
export const BRANCHES = ["สมุทรปราการ", "ชลบุรี", "ขอนแก่น"];
export const DOC_TYPES = ["พ.ร.บ.", "ประกันภัย", "ภาษีประจำปี", "ตรวจสภาพ", "อื่นๆ"];
export const CLAIM_STATUSES = ["แจ้งเคลม", "รอประเมิน", "กำลังซ่อม", "จบเคลม"];

/** มูลค่าตามบัญชีปัจจุบัน (ค่าเสื่อมเส้นตรง) — null ถ้าข้อมูลไม่พอ */
export function bookValue(v: Vehicle, today = new Date()): number | null {
  if (!v.purchase_price || !v.purchase_date) return null;
  const years = v.depreciation_years ?? 5;
  const salvage = v.purchase_price * ((v.salvage_pct ?? 10) / 100);
  const elapsedYears =
    (today.getTime() - new Date(v.purchase_date).getTime()) / (365.25 * 24 * 3600 * 1000);
  const used = Math.min(Math.max(elapsedYears, 0), years);
  return v.purchase_price - ((v.purchase_price - salvage) * used) / years;
}

/** จำนวนวันจนหมดอายุ (ติดลบ = หมดแล้ว) */
export function daysToExpiry(expiry: string, today = new Date()): number {
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const t1 = new Date(expiry).getTime();
  return Math.round((t1 - t0) / (24 * 3600 * 1000));
}

/** ระดับเตือนของเอกสาร: expired / d7 / d30 / d60 / ok */
export function expiryLevel(days: number): "expired" | "d7" | "d30" | "d60" | "ok" {
  if (days < 0) return "expired";
  if (days <= 7) return "d7";
  if (days <= 30) return "d30";
  if (days <= 60) return "d60";
  return "ok";
}

// ---------- เฟส 3: ซ่อมบำรุง ----------

export type MaintPlan = {
  id: string;
  vehicle_id: string;
  task: string;
  interval_km: number | null;
  interval_months: number | null;
  last_date: string | null;
  last_odometer: number | null;
  note: string | null;
  created_at: string;
  deleted_at: string | null;
};

export type MaintLog = {
  id: string;
  vehicle_id: string;
  plan_id: string | null;
  work_date: string;
  odometer: number | null;
  items: string;
  shop: string | null;
  labor_cost: number | null;
  parts_cost: number | null;
  note: string | null;
  created_at: string;
  deleted_at: string | null;
};

export type Tire = {
  id: string;
  vehicle_id: string;
  position: string;
  brand: string | null;
  model: string | null;
  change_date: string | null;
  change_odometer: number | null;
  price: number | null;
  lifespan_km: number | null;
  lifespan_years: number | null;
  note: string | null;
  created_at: string;
  deleted_at: string | null;
};

export const MAINT_TASKS = [
  "เปลี่ยนถ่ายน้ำมันเครื่อง", "เช็คระยะ", "น้ำมันเกียร์", "เบรก", "แบตเตอรี่",
  "ไส้กรองอากาศ", "สายพาน", "อื่นๆ",
];
export const TIRE_POSITIONS = [
  "หน้าซ้าย", "หน้าขวา", "หลังซ้ายใน", "หลังซ้ายนอก", "หลังขวาใน", "หลังขวานอก", "ทั้งชุด", "อื่นๆ",
];

export type DueLevel = "due" | "near" | "ok" | "no_baseline";
export type DueInfo = {
  level: DueLevel;
  kmLeft: number | null;     // เหลืออีกกี่ กม. (ติดลบ = เกินรอบแล้ว)
  daysLeft: number | null;   // เหลืออีกกี่วัน (ตามเวลา)
};

/** คำนวณสถานะรอบบำรุงรักษา — เทียบเลขไมล์ปัจจุบันของรถ + เวลา (อะไรถึงก่อน) */
export function planDue(p: MaintPlan, v: Vehicle | undefined, today = new Date()): DueInfo {
  const kmLeft =
    p.interval_km != null && p.last_odometer != null && v?.odometer != null
      ? p.last_odometer + p.interval_km - v.odometer : null;
  let daysLeft: number | null = null;
  if (p.interval_months != null && p.last_date) {
    const next = new Date(p.last_date);
    next.setMonth(next.getMonth() + p.interval_months);
    daysLeft = Math.round((next.getTime() - today.getTime()) / (24 * 3600 * 1000));
  }
  if (kmLeft == null && daysLeft == null)
    return { level: "no_baseline", kmLeft, daysLeft };
  if ((kmLeft ?? 1) <= 0 || (daysLeft ?? 1) <= 0)
    return { level: "due", kmLeft, daysLeft };
  if ((kmLeft ?? Infinity) <= 1000 || (daysLeft ?? Infinity) <= 30)
    return { level: "near", kmLeft, daysLeft };
  return { level: "ok", kmLeft, daysLeft };
}

/** สถานะยาง — ตามระยะ (กม.) หรืออายุ (ปี) แล้วแต่ถึงก่อน */
export function tireDue(t: Tire, v: Vehicle | undefined, today = new Date()): DueInfo {
  const kmLeft =
    t.lifespan_km != null && t.change_odometer != null && v?.odometer != null
      ? t.change_odometer + t.lifespan_km - v.odometer : null;
  let daysLeft: number | null = null;
  if (t.lifespan_years != null && t.change_date) {
    const next = new Date(t.change_date);
    next.setMonth(next.getMonth() + Math.round(t.lifespan_years * 12));
    daysLeft = Math.round((next.getTime() - today.getTime()) / (24 * 3600 * 1000));
  }
  if (kmLeft == null && daysLeft == null) return { level: "no_baseline", kmLeft, daysLeft };
  if ((kmLeft ?? 1) <= 0 || (daysLeft ?? 1) <= 0) return { level: "due", kmLeft, daysLeft };
  if ((kmLeft ?? Infinity) <= 3000 || (daysLeft ?? Infinity) <= 60)
    return { level: "near", kmLeft, daysLeft };
  return { level: "ok", kmLeft, daysLeft };
}

// ---------- เฟส 4: น้ำมัน ----------

export type FuelLog = {
  id: string;
  vehicle_id: string;
  fill_date: string;
  odometer: number | null;
  liters: number | null;      // null = มาจากใบแจ้งยอดบัตร ยังไม่รู้ลิตร (เติมทีหลังจากใบกำกับ)
  amount: number;
  source: string | null;      // บัตรน้ำมัน / คนขับส่ง / กรอกเอง
  fuel_type: string | null;
  station: string | null;
  full_tank: boolean;
  note: string | null;
  file_path: string | null;      // รูปบิลใน Storage
  // ---- ติดตามใบกำกับภาษี (เฟส 7) ----
  tax_invoice_no: string | null;
  vat_amount: number | null;
  invoice_status: string;        // รอคนขับส่ง/คนขับถือไว้/ส่งบัญชีแล้ว/หาย/ไม่มีใบกำกับ
  invoice_holder: string | null; // คนขับที่ถือใบตัวจริง
  invoice_returned_at: string | null;
  invoice_returned_to: string | null;
  invoice_note: string | null;
  historical: boolean;           // true = ข้อมูลก่อนเริ่มใช้ระบบ (ยกยอด — ไม่นับในยอดค้าง)
  created_at: string;
  deleted_at: string | null;
};

export const FUEL_TYPES = ["ดีเซล", "เบนซิน", "แก๊สโซฮอล์", "LPG", "อื่นๆ"];

// ---------- เฟส 8: ฟลีทการ์ด + ใบแจ้งยอดรายเดือน ----------

export type FuelCard = {
  id: string;
  card_no: string;
  account_name: string | null;
  vehicle_id: string | null;
  provider: string | null;
  credit_limit: number | null;
  active: boolean;
  note: string | null;
  created_at: string;
};

export type CardStatement = {
  id: string;
  period: string;            // YYYY-MM
  statement_date: string | null;
  due_date: string | null;
  provider: string | null;
  total_amount: number | null;
  file_path: string | null;
  note: string | null;
  created_at: string;
};

export type StatementLine = {
  id: string;
  statement_id: string;
  card_id: string | null;
  vehicle_id: string | null;
  account_name: string | null;
  amount: number;
  txn_count: number | null;
  note: string | null;
};

/** สถานะใบกำกับภาษี — เรียงตามลำดับที่เกิดจริง */
export const INVOICE_STATUSES = [
  "รอคนขับส่ง",      // รู้ว่ามีการเติม แต่ยังไม่เห็นใบเลย
  "คนขับถือไว้",     // คนขับถ่ายรูปส่งมาแล้ว ตัวจริงยังอยู่กับเขา
  "ส่งบัญชีแล้ว",    // บัญชีรับตัวจริงแล้ว — เคลมภาษีซื้อได้
  "หาย",             // ทำหาย ต้องขอใบแทนหรือตัดออก
  "ไม่มีใบกำกับ",    // ปั๊มไม่ออกให้ / ไม่ได้ขอ
  "ยกยอด (ก่อนใช้ระบบ)", // ข้อมูลย้อนหลัง — เก็บไว้ดูได้แต่ไม่ต้องตาม
];

/** VAT 7% ที่รวมอยู่ในราคาน้ำมันแล้ว (ราคาน้ำมันไทยเป็นราคารวม VAT) */
export const vatFromGross = (gross: number) => Math.round((gross * 7 / 107) * 100) / 100;

/** บิลที่คนขับส่งเข้ามา รอ backoffice ตรวจ (เฟส 6F) */
export type FuelSubmission = {
  id: string;
  vehicle_id: string;
  driver_name: string;
  driver_phone: string | null;
  fill_date: string;
  odometer: number | null;
  liters: number;
  amount: number;
  fuel_type: string | null;
  station: string | null;
  file_path: string | null;
  note: string | null;
  tax_invoice_no: string | null;  // เลขที่ใบกำกับภาษี (คนขับกรอกได้)
  status: string;                 // รอตรวจ/อนุมัติ/ปฏิเสธ
  reject_reason: string | null;
  fuel_log_id: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  created_at: string;
};

export type FuelFlag = "odo_backward" | "high_consumption" | "frequent";
export const FUEL_FLAG_LABELS: Record<FuelFlag, string> = {
  odo_backward: "เลขไมล์ย้อนหลัง",
  high_consumption: "กินน้ำมันผิดปกติ",
  frequent: "เติมถี่ผิดปกติ",
};

export type FuelLogEnriched = FuelLog & {
  distance: number | null;   // กม. ที่วิ่งจากการเติมครั้งก่อน
  kmPerL: number | null;
  bahtPerKm: number | null;
  flags: FuelFlag[];
};

/**
 * คำนวณอัตราสิ้นเปลืองต่อรายการ + ธงเตือนผิดปกติ (ป้องกันทุจริต)
 * - ระยะทาง = เลขไมล์ครั้งนี้ − ครั้งก่อน (ต่อคัน เรียงตามวันที่)
 * - กินน้ำมันผิดปกติ = กม./ลิตร แย่กว่าค่าเฉลี่ยของคันนั้นเกิน 25% (ต้องมีข้อมูล ≥ 3 ครั้ง)
 * - เติมถี่ผิดปกติ = เติมมากกว่า 1 ครั้งในวันเดียวกัน
 */
export function enrichFuelLogs(logs: FuelLog[]): FuelLogEnriched[] {
  const byVehicle = new Map<string, FuelLog[]>();
  for (const l of logs) {
    const arr = byVehicle.get(l.vehicle_id) ?? [];
    arr.push(l);
    byVehicle.set(l.vehicle_id, arr);
  }
  const out = new Map<string, FuelLogEnriched>();
  for (const arr of byVehicle.values()) {
    const sorted = [...arr].sort((a, b) =>
      a.fill_date === b.fill_date
        ? (a.odometer ?? 0) - (b.odometer ?? 0)
        : a.fill_date.localeCompare(b.fill_date));
    const dateCount = new Map<string, number>();
    for (const l of sorted) dateCount.set(l.fill_date, (dateCount.get(l.fill_date) ?? 0) + 1);

    const enriched: FuelLogEnriched[] = [];
    let prevOdo: number | null = null;
    for (const l of sorted) {
      let distance: number | null = null;
      const flags: FuelFlag[] = [];
      if (l.odometer != null && prevOdo != null) {
        distance = l.odometer - prevOdo;
        if (distance <= 0) { flags.push("odo_backward"); distance = null; }
      }
      const kmPerL = distance != null && (l.liters ?? 0) > 0 ? distance / l.liters! : null;
      const bahtPerKm = distance != null && distance > 0 ? l.amount / distance : null;
      if ((dateCount.get(l.fill_date) ?? 0) > 1) flags.push("frequent");
      if (l.odometer != null) prevOdo = l.odometer;
      enriched.push({ ...l, distance, kmPerL, bahtPerKm, flags });
    }
    // ธง "กินน้ำมันผิดปกติ" เทียบค่าเฉลี่ยของคันตัวเอง
    const rates = enriched.map((e) => e.kmPerL).filter((x): x is number => x != null);
    if (rates.length >= 3) {
      const avg = rates.reduce((s, x) => s + x, 0) / rates.length;
      for (const e of enriched) {
        if (e.kmPerL != null && e.kmPerL < avg * 0.75) e.flags.push("high_consumption");
      }
    }
    for (const e of enriched) out.set(e.id, e);
  }
  // คงลำดับเดิมของ input (หน้า list เรียงวันที่ล่าสุดก่อน)
  return logs.map((l) => out.get(l.id)!);
}

export const fmtBaht = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("th-TH", { maximumFractionDigits: 0 }) + " ฿";

export const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" }) : "—";
