// lib/report.ts — เฟส 5: รวมต้นทุนรายคัน/รายเดือน + Timeline + ค่าเสื่อม
import type { Claim, FuelLog, MaintLog, Tire, Vehicle, VehicleDoc } from "./types";

/** ค่าเสื่อมต่อเดือนของรถ (เส้นตรง) — 0 ถ้าข้อมูลไม่พอ หรือหมดอายุค่าเสื่อมแล้วในเดือนนั้น */
export function monthlyDepreciation(v: Vehicle, month: string): number {
  if (!v.purchase_price || !v.purchase_date) return 0;
  const years = v.depreciation_years ?? 5;
  if (years <= 0) return 0;
  const start = new Date(v.purchase_date);
  const end = new Date(start); end.setFullYear(end.getFullYear() + years);
  const m0 = new Date(month + "-01");
  const m1 = new Date(m0); m1.setMonth(m1.getMonth() + 1);
  // เดือนที่เลือกต้องคาบเกี่ยวช่วงคิดค่าเสื่อม
  if (m1 <= start || m0 >= end) return 0;
  const salvage = v.purchase_price * ((v.salvage_pct ?? 10) / 100);
  return (v.purchase_price - salvage) / years / 12;
}

export type CostRow = {
  vehicle: Vehicle;
  fuel: number;
  maint: number;
  tire: number;
  doc: number;      // พ.ร.บ./ประกัน/ภาษี/ตรวจสภาพ (นับเดือนที่เริ่มคุ้มครอง/จ่าย)
  claim: number;    // ค่า excess จ่ายเอง (นับเดือนที่เกิดเหตุ)
  dep: number;      // ค่าเสื่อมประจำเดือน
  total: number;
};

const inMonth = (d: string | null | undefined, month: string) => !!d && d.startsWith(month);

/** รวมต้นทุนต่อคันของเดือนที่เลือก (YYYY-MM) */
export function buildCostRows(
  month: string,
  vehicles: Vehicle[],
  fuel: FuelLog[],
  maint: MaintLog[],
  tires: Tire[],
  docs: VehicleDoc[],
  claims: Claim[],
): CostRow[] {
  return vehicles.map((v) => {
    const f = fuel.filter((x) => x.vehicle_id === v.id && inMonth(x.fill_date, month))
      .reduce((s, x) => s + x.amount, 0);
    const m = maint.filter((x) => x.vehicle_id === v.id && inMonth(x.work_date, month))
      .reduce((s, x) => s + (x.labor_cost ?? 0) + (x.parts_cost ?? 0), 0);
    const t = tires.filter((x) => x.vehicle_id === v.id && inMonth(x.change_date, month))
      .reduce((s, x) => s + (x.price ?? 0), 0);
    const d = docs.filter((x) => x.vehicle_id === v.id && inMonth(x.start_date ?? x.expiry_date, month))
      .reduce((s, x) => s + (x.cost ?? 0), 0);
    const c = claims.filter((x) => x.vehicle_id === v.id && inMonth(x.incident_date, month))
      .reduce((s, x) => s + (x.excess_cost ?? 0), 0);
    const dep = monthlyDepreciation(v, month);
    return { vehicle: v, fuel: f, maint: m, tire: t, doc: d, claim: c, dep, total: f + m + t + d + c + dep };
  });
}

export type TimelineEvent = {
  date: string;
  kind: "น้ำมัน" | "ซ่อม" | "ยาง" | "เอกสาร" | "เคลม";
  title: string;
  detail: string;
  amount: number | null;
};

/** เหตุการณ์ทั้งหมดของรถหนึ่งคัน เรียงใหม่→เก่า */
export function buildTimeline(
  vehicleId: string,
  fuel: FuelLog[],
  maint: MaintLog[],
  tires: Tire[],
  docs: VehicleDoc[],
  claims: Claim[],
): TimelineEvent[] {
  const ev: TimelineEvent[] = [];
  for (const x of fuel.filter((x) => x.vehicle_id === vehicleId)) {
    ev.push({
      date: x.fill_date, kind: "น้ำมัน",
      title: x.liters != null
        ? `เติม ${x.liters.toLocaleString("th-TH", { maximumFractionDigits: 1 })} ลิตร${x.fuel_type ? ` (${x.fuel_type})` : ""}`
        : `เติมน้ำมัน${x.fuel_type ? ` (${x.fuel_type})` : ""} — ยังไม่ทราบลิตร`,
      detail: [x.station, x.odometer != null ? `${x.odometer.toLocaleString()} กม.` : null].filter(Boolean).join(" · "),
      amount: x.amount,
    });
  }
  for (const x of maint.filter((x) => x.vehicle_id === vehicleId)) {
    ev.push({
      date: x.work_date, kind: "ซ่อม", title: x.items,
      detail: [x.shop, x.odometer != null ? `${x.odometer.toLocaleString()} กม.` : null].filter(Boolean).join(" · "),
      amount: (x.labor_cost ?? 0) + (x.parts_cost ?? 0) || null,
    });
  }
  for (const x of tires.filter((x) => x.vehicle_id === vehicleId && x.change_date)) {
    ev.push({
      date: x.change_date!, kind: "ยาง",
      title: `เปลี่ยนยาง ${x.position}`,
      detail: [x.brand, x.model].filter(Boolean).join(" "),
      amount: x.price,
    });
  }
  for (const x of docs.filter((x) => x.vehicle_id === vehicleId)) {
    ev.push({
      date: x.start_date ?? x.expiry_date, kind: "เอกสาร",
      title: `${x.doc_type}${x.insurance_class ? ` ชั้น ${x.insurance_class}` : ""}`,
      detail: [x.provider, `หมดอายุ ${x.expiry_date}`].filter(Boolean).join(" · "),
      amount: x.cost,
    });
  }
  for (const x of claims.filter((x) => x.vehicle_id === vehicleId)) {
    ev.push({
      date: x.incident_date, kind: "เคลม",
      title: `เคลม${x.claim_no ? ` #${x.claim_no}` : ""} — ${x.status}`,
      detail: x.description ?? "",
      amount: x.excess_cost,
    });
  }
  return ev.sort((a, b) => b.date.localeCompare(a.date));
}

/** ดาวน์โหลดไฟล์ Excel จาก array-of-arrays (โหลด xlsx แบบ dynamic — ไม่ถ่วง bundle หน้าอื่น) */
export async function exportXlsx(filename: string, sheetName: string, rows: (string | number | null)[][]): Promise<void> {
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
}
