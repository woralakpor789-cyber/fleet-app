// ตัวเชื่อม Supabase สำหรับตาราง fleet_* — ทุกฟังก์ชัน throw ถ้าไม่มี Supabase env
import { supabase } from "./supabaseClient";
import type { Claim, FuelLog, MaintLog, MaintPlan, Tire, Vehicle, VehicleDoc } from "./types";

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
