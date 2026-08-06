// ตัวเชื่อม Supabase สำหรับตาราง fleet_* — ทุกฟังก์ชัน throw ถ้าไม่มี Supabase env
import { supabase } from "./supabaseClient";
import type {
  CardStatement, Claim, FuelCard, FuelLog, FuelSubmission, MaintLog, MaintPlan,
  StatementLine, Tire, Vehicle, VehicleDoc,
} from "./types";

function db() {
  if (!supabase) throw new Error("ยังไม่ได้ตั้งค่า Supabase (.env.local)");
  return supabase;
}

// ---------- รถ ----------
export async function listVehicles(): Promise<Vehicle[]> {
  const { data, error } = await db()
    .from("fleet_vehicles").select("*").is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Vehicle[];
}

export async function upsertVehicle(v: Partial<Vehicle> & { id?: string }): Promise<Vehicle> {
  const payload = { ...v, updated_at: new Date().toISOString() };
  const q = v.id
    ? db().from("fleet_vehicles").update(payload).eq("id", v.id).select().single()
    : db().from("fleet_vehicles").insert(payload).select().single();
  const { data, error } = await q;
  if (error) throw error;
  return data as Vehicle;
}

export async function softDeleteVehicle(id: string): Promise<void> {
  const { error } = await db().from("fleet_vehicles")
    .update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

// ---------- เอกสาร ----------
export async function listDocs(): Promise<VehicleDoc[]> {
  const { data, error } = await db()
    .from("fleet_documents").select("*").is("deleted_at", null)
    .order("expiry_date", { ascending: true });
  if (error) throw error;
  return (data ?? []) as VehicleDoc[];
}

export async function upsertDoc(d: Partial<VehicleDoc> & { id?: string }): Promise<VehicleDoc> {
  const q = d.id
    ? db().from("fleet_documents").update(d).eq("id", d.id).select().single()
    : db().from("fleet_documents").insert(d).select().single();
  const { data, error } = await q;
  if (error) throw error;
  return data as VehicleDoc;
}

// ---------- ไฟล์แนบ (Supabase Storage — bucket ปิด) ----------
const BUCKET = "fleet-docs";

/** ทำชื่อไฟล์ให้ปลอดภัยสำหรับ Storage (ชื่อไทยใช้เป็น key ไม่ได้) */
function safeName(name: string): string {
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")).toLowerCase() : "";
  return `${Math.random().toString(36).slice(2, 10)}${ext}`;
}

/** อัปโหลดไฟล์แนบ → คืน path ที่เก็บ (null ถ้าไม่สำเร็จ) */
export async function uploadDocFile(file: File, folder = "documents"): Promise<string | null> {
  try {
    const path = `${folder}/${new Date().toISOString().slice(0, 7)}/${safeName(file.name)}`;
    const { error } = await db().storage.from(BUCKET).upload(path, file, { upsert: false });
    if (error) { console.warn("upload", error); return null; }
    return path;
  } catch {
    return null;
  }
}

/** ลิงก์เปิดไฟล์แนบชั่วคราว (หมดอายุใน 1 ชม.) */
export async function signedDocUrl(path: string): Promise<string | null> {
  const { data, error } = await db().storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error || !data) return null;
  return data.signedUrl;
}

/** บันทึกเอกสารหลายรายการพร้อมกัน (ตัวนำเข้าเอกสาร) — คืนรายการที่บันทึกจริง */
export async function insertDocsBulk(rows: Partial<VehicleDoc>[]): Promise<VehicleDoc[]> {
  if (!rows.length) return [];
  const { data, error } = await db().from("fleet_documents").insert(rows).select();
  if (error) throw error;
  return (data ?? []) as VehicleDoc[];
}

export async function softDeleteDoc(id: string): Promise<void> {
  const { error } = await db().from("fleet_documents")
    .update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

// ---------- แผนรอบบำรุงรักษา ----------
export async function listPlans(): Promise<MaintPlan[]> {
  const { data, error } = await db()
    .from("fleet_maintenance_plans").select("*").is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as MaintPlan[];
}

export async function upsertPlan(p: Partial<MaintPlan> & { id?: string }): Promise<MaintPlan> {
  const q = p.id
    ? db().from("fleet_maintenance_plans").update(p).eq("id", p.id).select().single()
    : db().from("fleet_maintenance_plans").insert(p).select().single();
  const { data, error } = await q;
  if (error) throw error;
  return data as MaintPlan;
}

export async function softDeletePlan(id: string): Promise<void> {
  const { error } = await db().from("fleet_maintenance_plans")
    .update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

// ---------- ประวัติซ่อม ----------
export async function listMaintLogs(): Promise<MaintLog[]> {
  const { data, error } = await db()
    .from("fleet_maintenance_logs").select("*").is("deleted_at", null)
    .order("work_date", { ascending: false });
  if (error) throw error;
  return (data ?? []) as MaintLog[];
}

/**
 * บันทึกงานซ่อม — ถ้าผูกกับแผน จะอัปเดต last_* ของแผนให้ และดันเลขไมล์ล่าสุดของรถถ้ามากกว่าเดิม
 */
export async function saveMaintLog(
  l: Partial<MaintLog> & { id?: string },
  opts?: { vehicle?: Vehicle },
): Promise<MaintLog> {
  const q = l.id
    ? db().from("fleet_maintenance_logs").update(l).eq("id", l.id).select().single()
    : db().from("fleet_maintenance_logs").insert(l).select().single();
  const { data, error } = await q;
  if (error) throw error;
  const saved = data as MaintLog;

  // อัปเดตรอบของแผนที่ผูกไว้
  if (saved.plan_id) {
    await db().from("fleet_maintenance_plans").update({
      last_date: saved.work_date,
      last_odometer: saved.odometer,
    }).eq("id", saved.plan_id);
  }
  // ดันเลขไมล์ล่าสุดของรถ (เฉพาะกรณีมากกว่าค่าเดิม — กันคีย์ย้อน)
  const v = opts?.vehicle;
  if (v && saved.odometer != null && saved.odometer > (v.odometer ?? -1)) {
    await db().from("fleet_vehicles").update({ odometer: saved.odometer }).eq("id", v.id);
  }
  return saved;
}

export async function softDeleteMaintLog(id: string): Promise<void> {
  const { error } = await db().from("fleet_maintenance_logs")
    .update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

// ---------- ยาง ----------
export async function listTires(): Promise<Tire[]> {
  const { data, error } = await db()
    .from("fleet_tires").select("*").is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Tire[];
}

export async function upsertTire(t: Partial<Tire> & { id?: string }): Promise<Tire> {
  const q = t.id
    ? db().from("fleet_tires").update(t).eq("id", t.id).select().single()
    : db().from("fleet_tires").insert(t).select().single();
  const { data, error } = await q;
  if (error) throw error;
  return data as Tire;
}

export async function softDeleteTire(id: string): Promise<void> {
  const { error } = await db().from("fleet_tires")
    .update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

/** อัปเดตเลขไมล์ปัจจุบันของรถ (ปุ่มด่วนหน้า maintenance) */
export async function updateMeter(vehicleId: string, odometer: number): Promise<void> {
  const { error } = await db().from("fleet_vehicles").update({ odometer }).eq("id", vehicleId);
  if (error) throw error;
}

// ---------- น้ำมัน ----------
export async function listFuelLogs(): Promise<FuelLog[]> {
  const { data, error } = await db()
    .from("fleet_fuel_logs").select("*").is("deleted_at", null)
    .order("fill_date", { ascending: false });
  if (error) throw error;
  return (data ?? []) as FuelLog[];
}

/** บันทึกการเติมน้ำมัน — ดันเลขไมล์รถให้ถ้ามากกว่าค่าเดิม */
export async function saveFuelLog(
  l: Partial<FuelLog> & { id?: string },
  opts?: { vehicle?: Vehicle },
): Promise<FuelLog> {
  const q = l.id
    ? db().from("fleet_fuel_logs").update(l).eq("id", l.id).select().single()
    : db().from("fleet_fuel_logs").insert(l).select().single();
  const { data, error } = await q;
  if (error) throw error;
  const saved = data as FuelLog;
  const v = opts?.vehicle;
  if (v && saved.odometer != null && saved.odometer > (v.odometer ?? -1)) {
    await db().from("fleet_vehicles").update({ odometer: saved.odometer }).eq("id", v.id);
  }
  return saved;
}

// ---------- ฟลีทการ์ด + ใบแจ้งยอดรายเดือน (เฟส 8) ----------

export async function listCards(): Promise<FuelCard[]> {
  const { data, error } = await db().from("fleet_fuel_cards").select("*").order("account_name");
  if (error) throw error;
  return (data ?? []) as FuelCard[];
}

export async function upsertCard(c: Partial<FuelCard> & { id?: string }): Promise<FuelCard> {
  const q = c.id
    ? db().from("fleet_fuel_cards").update(c).eq("id", c.id).select().single()
    : db().from("fleet_fuel_cards").insert(c).select().single();
  const { data, error } = await q;
  if (error) throw error;
  return data as FuelCard;
}

export async function deleteCard(id: string): Promise<void> {
  const { error } = await db().from("fleet_fuel_cards").delete().eq("id", id);
  if (error) throw error;
}

export async function listStatements(): Promise<CardStatement[]> {
  const { data, error } = await db()
    .from("fleet_card_statements").select("*").order("period", { ascending: false });
  if (error) throw error;
  return (data ?? []) as CardStatement[];
}

export async function listStatementLines(statementId: string): Promise<StatementLine[]> {
  const { data, error } = await db()
    .from("fleet_card_statement_lines").select("*").eq("statement_id", statementId);
  if (error) throw error;
  return (data ?? []) as StatementLine[];
}

/** บันทึกใบแจ้งยอด 1 รอบ พร้อมยอดรายบัตร (เขียนทับรอบเดิมถ้ามี) */
export async function saveStatement(
  head: Partial<CardStatement>,
  lines: { card_id: string; vehicle_id: string | null; account_name: string | null; amount: number; txn_count: number | null }[],
): Promise<CardStatement> {
  const { data, error } = await db().from("fleet_card_statements")
    .upsert({ ...head, provider: head.provider ?? "KBANK Fleet Card" }, { onConflict: "period,provider" })
    .select().single();
  if (error) throw error;
  const st = data as CardStatement;
  await db().from("fleet_card_statement_lines").delete().eq("statement_id", st.id);
  if (lines.length) {
    const { error: e2 } = await db().from("fleet_card_statement_lines")
      .insert(lines.map((l) => ({ ...l, statement_id: st.id })));
    if (e2) throw e2;
  }
  return st;
}

// ---------- ทะเบียนพนักงาน (คนขับ) ----------
export type Staff = {
  id: string; name: string; position: string | null; department: string | null;
  phone: string | null; email: string | null; active: boolean; note: string | null;
};

export async function listStaff(): Promise<Staff[]> {
  const { data, error } = await db().from("fleet_staff").select("*")
    .order("department").order("name");
  if (error) throw error;
  return (data ?? []) as Staff[];
}

export async function upsertStaff(s: Partial<Staff> & { id?: string }): Promise<Staff> {
  const q = s.id
    ? db().from("fleet_staff").update(s).eq("id", s.id).select().single()
    : db().from("fleet_staff").insert(s).select().single();
  const { data, error } = await q;
  if (error) throw error;
  return data as Staff;
}

// ---------- ตารางเวรรายวัน (คนขับเปลี่ยนทุกวัน) ----------
export type RosterCell = { vehicle_id: string; work_date: string; driver_name: string; source: string };

export async function loadRoster(period: string): Promise<RosterCell[]> {
  const { data, error } = await db().rpc("roster_for_month", { p_period: period });
  if (error) throw error;
  return (data ?? []) as RosterCell[];
}

/** ตั้ง/ลบคนขับของช่องวันนั้น (ส่ง null = ลบ) */
export async function setRosterCell(
  vehicleId: string, workDate: string, driver: string | null,
): Promise<void> {
  if (!driver) {
    const { error } = await db().from("fleet_daily_assignments").delete()
      .eq("vehicle_id", vehicleId).eq("work_date", workDate);
    if (error) throw error;
    return;
  }
  const { error } = await db().from("fleet_daily_assignments")
    .upsert({ vehicle_id: vehicleId, work_date: workDate, driver_name: driver, source: "ออฟฟิศกรอก" },
            { onConflict: "vehicle_id,work_date" });
  if (error) throw error;
}

/** เติมทั้งเดือนให้รถคันเดียว (ใช้ตอนคนเดิมขับทั้งเดือน) */
export async function fillRosterMonth(
  vehicleId: string, period: string, driver: string,
): Promise<number> {
  const [y, m] = period.split("-").map(Number);
  const days = new Date(y, m, 0).getDate();
  const rows = Array.from({ length: days }, (_, i) => ({
    vehicle_id: vehicleId,
    work_date: `${period}-${String(i + 1).padStart(2, "0")}`,
    driver_name: driver, source: "ออฟฟิศกรอก",
  }));
  const { error } = await db().from("fleet_daily_assignments")
    .upsert(rows, { onConflict: "vehicle_id,work_date" });
  if (error) throw error;
  return rows.length;
}

// ---------- มอบหมายรถให้คนขับตามช่วงเวลา ----------
export type Assignment = {
  id: string; vehicle_id: string; driver_name: string; driver_phone: string | null;
  from_date: string; to_date: string | null; note: string | null;
};

export async function listAssignments(): Promise<Assignment[]> {
  const { data, error } = await db().from("fleet_vehicle_assignments").select("*")
    .order("from_date", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Assignment[];
}

export async function addAssignment(a: Partial<Assignment>): Promise<void> {
  const { error } = await db().from("fleet_vehicle_assignments").insert(a);
  if (error) throw error;
}

export async function deleteAssignment(id: string): Promise<void> {
  const { error } = await db().from("fleet_vehicle_assignments").delete().eq("id", id);
  if (error) throw error;
}

// ---------- รายการรูดบัตรทีละครั้ง + ตามใบกำกับ (เฟส 8B) ----------

export type CardTxn = {
  id: string;
  trans_date: string;
  plate: string | null;
  vehicle_id: string | null;
  station: string | null;
  province: string | null;
  amount: number;
  driver: string | null;
  invoice_status: string;
  chase_note: string | null;
  matched_log_id: string | null;
  matched_invoice_no: string | null;
  historical: boolean;   // ยกยอดก่อนใช้ระบบ — ไม่ต้องตาม
};

export const TXN_INVOICE_STATUSES = ["ยังไม่ได้ใบ", "ได้ใบแล้ว", "ส่งบัญชีแล้ว", "หาย", "ไม่มีใบกำกับ"];

export async function listCardTxns(period: string): Promise<CardTxn[]> {
  const { data, error } = await db().rpc("card_txns_for_period", { p_period: period });
  if (error) throw error;
  return (data ?? []) as CardTxn[];
}

/** จับคู่รายการรูดกับใบกำกับที่บันทึกไว้อัตโนมัติ — คืนจำนวนที่จับคู่ได้ */
export async function matchCardTxns(period: string): Promise<number> {
  const { data, error } = await db().rpc("match_card_txns", { p_period: period });
  if (error) throw error;
  return (data as number) ?? 0;
}

export async function updateCardTxns(
  ids: string[],
  patch: { invoice_status?: string; chase_note?: string | null },
): Promise<void> {
  if (!ids.length) return;
  const { error } = await db().from("fleet_card_transactions")
    .update({ ...patch, updated_at: new Date().toISOString() }).in("id", ids);
  if (error) throw error;
}

// ---------- ใบกำกับภาษี (เฟส 7) ----------

/** อัปเดตสถานะใบกำกับของหลายรายการพร้อมกัน (เช่น รับคืนจากคนขับทีเดียวหลายใบ) */
export async function updateInvoiceStatus(
  ids: string[],
  patch: {
    invoice_status?: string;
    invoice_holder?: string | null;
    invoice_returned_at?: string | null;
    invoice_returned_to?: string | null;
    invoice_note?: string | null;
  },
): Promise<void> {
  if (!ids.length) return;
  const { error } = await db().from("fleet_fuel_logs").update(patch).in("id", ids);
  if (error) throw error;
}

/** บันทึกว่าบัญชีรับใบตัวจริงคืนแล้ว */
export async function markInvoicesReturned(ids: string[], receiver: string): Promise<void> {
  await updateInvoiceStatus(ids, {
    invoice_status: "ส่งบัญชีแล้ว",
    invoice_returned_at: new Date().toISOString().slice(0, 10),
    invoice_returned_to: receiver,
  });
}

// ---------- บิลที่คนขับส่งเข้ามา (รอตรวจ) ----------
export async function listSubmissions(): Promise<FuelSubmission[]> {
  const { data, error } = await db()
    .from("fleet_fuel_submissions").select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as FuelSubmission[];
}

/** อนุมัติ → สร้าง fuel log จริง แล้วผูกกลับไปที่ใบที่ส่งมา */
export async function approveSubmission(
  s: FuelSubmission,
  patch: Partial<FuelSubmission>,
  reviewer: string,
  vehicle?: Vehicle,
): Promise<void> {
  const m = { ...s, ...patch };
  // ถ้ามีรายการจากใบแจ้งยอดบัตรที่ตรงกันอยู่แล้ว → เติมข้อมูลใส่รายการเดิม ไม่สร้างซ้ำ (กันต้นทุนเบิ้ล)
  const dFrom = new Date(m.fill_date); dFrom.setDate(dFrom.getDate() - 2);
  const dTo = new Date(m.fill_date); dTo.setDate(dTo.getDate() + 2);
  const { data: dup } = await db().from("fleet_fuel_logs").select("id")
    .eq("vehicle_id", m.vehicle_id).eq("amount", m.amount)
    .is("deleted_at", null).is("liters", null)
    .gte("fill_date", dFrom.toISOString().slice(0, 10))
    .lte("fill_date", dTo.toISOString().slice(0, 10))
    .limit(1);
  if (dup && dup.length) {
    const id = (dup[0] as { id: string }).id;
    const { error } = await db().from("fleet_fuel_logs").update({
      liters: m.liters, odometer: m.odometer ?? null, station: m.station,
      fuel_type: m.fuel_type, file_path: m.file_path,
      tax_invoice_no: m.tax_invoice_no ?? null,
      invoice_status: "คนขับถือไว้", invoice_holder: m.driver_name,
      source: "คนขับส่ง",
      note: `คนขับส่ง: ${m.driver_name} · จับคู่กับรายการรูดบัตร`,
    }).eq("id", id);
    if (error) throw error;
    const { error: e2 } = await db().from("fleet_fuel_submissions").update({
      ...patch, status: "อนุมัติ", fuel_log_id: id,
      reviewed_at: new Date().toISOString(), reviewed_by: reviewer,
    }).eq("id", s.id);
    if (e2) throw e2;
    return;
  }
  const log = await saveFuelLog({
    vehicle_id: m.vehicle_id, fill_date: m.fill_date, odometer: m.odometer ?? null,
    liters: m.liters, amount: m.amount, fuel_type: m.fuel_type, station: m.station,
    full_tank: true, file_path: m.file_path,
    note: `คนขับส่ง: ${m.driver_name}${m.driver_phone ? ` (${m.driver_phone})` : ""}`,
    // ใบกำกับตัวจริงยังอยู่กับคนขับ — ถ่ายรูปมาแล้วแต่ยังไม่ส่งบัญชี
    tax_invoice_no: m.tax_invoice_no ?? null,
    vat_amount: m.amount ? Math.round((m.amount * 7 / 107) * 100) / 100 : null,
    invoice_status: "คนขับถือไว้",
    invoice_holder: m.driver_name,
  }, { vehicle });
  const { error } = await db().from("fleet_fuel_submissions").update({
    ...patch, status: "อนุมัติ", fuel_log_id: log.id,
    reviewed_at: new Date().toISOString(), reviewed_by: reviewer,
  }).eq("id", s.id);
  if (error) throw error;
}

export async function rejectSubmission(id: string, reason: string, reviewer: string): Promise<void> {
  const { error } = await db().from("fleet_fuel_submissions").update({
    status: "ปฏิเสธ", reject_reason: reason,
    reviewed_at: new Date().toISOString(), reviewed_by: reviewer,
  }).eq("id", id);
  if (error) throw error;
}

export async function softDeleteFuelLog(id: string): Promise<void> {
  const { error } = await db().from("fleet_fuel_logs")
    .update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

// ---------- เคลม ----------
export async function listClaims(): Promise<Claim[]> {
  const { data, error } = await db()
    .from("fleet_claims").select("*").is("deleted_at", null)
    .order("incident_date", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Claim[];
}

export async function upsertClaim(c: Partial<Claim> & { id?: string }): Promise<Claim> {
  const q = c.id
    ? db().from("fleet_claims").update(c).eq("id", c.id).select().single()
    : db().from("fleet_claims").insert(c).select().single();
  const { data, error } = await q;
  if (error) throw error;
  return data as Claim;
}

export async function softDeleteClaim(id: string): Promise<void> {
  const { error } = await db().from("fleet_claims")
    .update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}
