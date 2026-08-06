// lib/driverApi.ts — ช่องทางของ "หน้าคนขับ" (ต้องล็อกอิน Google + อยู่ในรายชื่อคนขับที่อนุมัติ)
// สิทธิ์ตัดสินที่ฐานข้อมูล (RLS + is_fleet_driver()) ไม่ใช่ที่หน้าเว็บ
import { supabase } from "./supabaseClient";

function db() {
  if (!supabase) throw new Error("ยังไม่ได้ตั้งค่า Supabase");
  return supabase;
}

export type DriverVehicle = { id: string; plate: string; nickname: string | null };

export type MySubmission = {
  id: string;
  vehicle_id: string;
  fill_date: string;
  liters: number;
  amount: number;
  status: string;
  reject_reason: string | null;
  created_at: string;
};

/** อีเมลของผู้ที่ล็อกอินอยู่ */
export async function myEmail(): Promise<string | null> {
  const { data } = await db().auth.getSession();
  return data.session?.user.email ?? null;
}

/** เป็นคนขับที่ได้รับอนุมัติไหม (DB ตัดสิน) */
export async function amIDriver(): Promise<boolean> {
  const { data, error } = await db().rpc("is_fleet_driver");
  if (error) return false;
  return data === true;
}

/** รายชื่อรถ (เห็นแค่ทะเบียน/ชื่อเรียก) */
export async function driverVehicles(): Promise<DriverVehicle[]> {
  const { data, error } = await db().rpc("driver_vehicles");
  if (error) throw error;
  return (data ?? []) as DriverVehicle[];
}

/** อัปโหลดรูปบิล → คืน path (เขียนได้เฉพาะโฟลเดอร์ fuel-submissions/) */
export async function uploadReceipt(file: File): Promise<string | null> {
  try {
    const ext = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")).toLowerCase() : ".jpg";
    const path = `fuel-submissions/${new Date().toISOString().slice(0, 7)}/${Math.random().toString(36).slice(2, 10)}${ext}`;
    const { error } = await db().storage.from("fleet-docs").upload(path, file);
    if (error) { console.warn("upload", error); return null; }
    return path;
  } catch {
    return null;
  }
}

export type FuelSubmitInput = {
  vehicle_id: string;
  driver_name: string;
  driver_phone: string;
  driver_email: string;
  fill_date: string;
  odometer: number | null;
  liters: number;
  amount: number;
  fuel_type: string | null;
  station: string | null;
  file_path: string | null;
  tax_invoice_no: string | null;
};

/** ใบกำกับตัวจริงที่คนขับคนนี้ยังค้างส่งคืนบัญชี */
export type OutstandingInvoice = {
  id: string; plate: string; fill_date: string; amount: number;
  tax_invoice_no: string | null; invoice_status: string;
};

export async function myOutstandingInvoices(): Promise<OutstandingInvoice[]> {
  const { data, error } = await db().rpc("driver_outstanding_invoices");
  if (error) return [];
  return (data ?? []) as OutstandingInvoice[];
}

/** ส่งบิลเข้าคิวรอตรวจ (RLS บังคับสถานะ "รอตรวจ" และอีเมลต้องเป็นของตัวเอง) */
export async function submitFuel(i: FuelSubmitInput): Promise<void> {
  const { error } = await db().from("fleet_fuel_submissions").insert({
    ...i, driver_email: i.driver_email.toLowerCase(), status: "รอตรวจ",
  });
  if (error) throw error;
}

/** ประวัติที่ตัวเองส่ง (RLS กรองให้เห็นเฉพาะของตัวเอง) */
export async function mySubmissions(): Promise<MySubmission[]> {
  const { data, error } = await db()
    .from("fleet_fuel_submissions")
    .select("id, vehicle_id, fill_date, liters, amount, status, reject_reason, created_at")
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) return [];
  return (data ?? []) as MySubmission[];
}

// ---------- จัดการรายชื่อคนขับ (แอดมินเท่านั้น) ----------
export async function getDriverEmails(): Promise<string[]> {
  const { data, error } = await db().rpc("fleet_get_drivers");
  if (error || !data) return [];
  return data as string[];
}

export async function setDriverEmails(emails: string[]): Promise<string[]> {
  const clean = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  const { data, error } = await db().rpc("fleet_set_drivers", { p_emails: clean });
  if (error) throw error;
  return (data ?? []) as string[];
}

// ---------- ชื่อ/เบอร์ที่จำไว้ในเครื่อง (ไม่ใช่เรื่องสิทธิ์ แค่ไม่ต้องพิมพ์ซ้ำ) ----------
const LS = "fleet_driver_contact";
export type DriverContact = { name: string; phone: string };

export function getContact(): DriverContact | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LS);
    return raw ? (JSON.parse(raw) as DriverContact) : null;
  } catch { return null; }
}
export function saveContact(c: DriverContact) {
  try { localStorage.setItem(LS, JSON.stringify(c)); } catch { /* ignore */ }
}
