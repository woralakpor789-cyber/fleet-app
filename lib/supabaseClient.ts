import { createClient } from "@supabase/supabase-js";

// อ่านค่าจาก env (Supabase โปรเจคเดียวกับ sales-os-app — ตาราง fleet_* แยกชุด)
const url  = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? "";
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const supabaseEnabled = url.length > 0 && anon.length > 0;

// ถ้ายังไม่ตั้งค่า → null (โหมด local dev — หน้าเปิดได้แต่ไม่มีข้อมูลจริง)
// persistSession: true — จำ session ข้ามรีเฟรช (จำเป็นเมื่อเปิด RLS)
export const supabase = supabaseEnabled
  ? createClient(url, anon, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;
