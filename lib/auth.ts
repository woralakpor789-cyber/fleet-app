// lib/auth.ts — สิทธิ์เข้าใช้ Fleet: เฉพาะแอดมิน + ฝ่ายสต็อก (backoffice)
// ใช้ระบบผู้ใช้เดียวกับ SalesOS (RPC my_access บน Supabase โปรเจคเดิม)
import { supabase } from "./supabaseClient";

export type FleetUser = { email: string; name: string; picture?: string };

const LS_KEY = "fleet_user";

/** อ่านผู้ใช้ที่ล็อกอินค้างไว้จาก localStorage */
export function getStoredUser(): FleetUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as FleetUser) : null;
  } catch {
    return null;
  }
}

export function storeUser(u: FleetUser): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify(u)); } catch { /* ignore */ }
}

export async function signOut(): Promise<void> {
  try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ }
  try { await supabase?.auth.signOut(); } catch { /* ไม่ critical */ }
}

/**
 * เช็คสิทธิ์เข้า Fleet ผ่าน RPC my_access ของ SalesOS (DB ตัดสินเอง ใช้ได้ใต้ RLS)
 * ผ่านเมื่อ: เป็นแอดมิน · role = stock (backoffice) · หรืออีเมลอยู่ใน fleetEmails
 * fleetEmails = รายชื่อเฉพาะ FleetOS เก็บใน app_config — ให้สิทธิ์คนนอก stock ได้
 * โดยไม่ต้องเปลี่ยน role ใน SalesOS (เช่น เซลล์ที่ต้องดูข้อมูลรถ)
 * โหมด local (ไม่มี Supabase env) → ให้ผ่านเพื่อ dev ได้
 */
export async function checkFleetAccess(): Promise<{ ok: boolean; reason: string }> {
  if (!supabase) return { ok: true, reason: "local" };
  try {
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) return { ok: false, reason: "no_session" };
    const { data, error } = await supabase.rpc("my_access");
    if (error || !data) return { ok: false, reason: "rpc_error" };
    const d = data as { user: { role?: string; status?: string } | null; is_admin: boolean };
    if (d.is_admin) return { ok: true, reason: "admin" };
    const u = d.user;
    const approved = !!u && (u.status ?? "approved") === "approved";
    if (approved && u!.role === "stock") return { ok: true, reason: "stock" };
    // รายชื่อเฉพาะ FleetOS (อ่าน app_config ได้เมื่อเป็นผู้ใช้ที่อนุมัติแล้ว)
    if (approved && (await inFleetList(sess.session.user.email))) {
      return { ok: true, reason: "fleet_list" };
    }
    return { ok: false, reason: "forbidden" };
  } catch {
    return { ok: false, reason: "error" };
  }
}

/** อีเมลนี้อยู่ในรายชื่อ fleetEmails ของ app_config หรือไม่ */
async function inFleetList(email: string | undefined): Promise<boolean> {
  if (!email || !supabase) return false;
  try {
    const { data, error } = await supabase
      .from("app_config").select("data").eq("id", 1).maybeSingle();
    if (error || !data) return false;
    const list = (data as { data?: { fleetEmails?: string[] } }).data?.fleetEmails ?? [];
    return list.map((e) => e.trim().toLowerCase()).includes(email.trim().toLowerCase());
  } catch {
    return false;
  }
}
