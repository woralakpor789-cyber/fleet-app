# CLAUDE.md — FleetOS (fleet-app)

> ระบบบริหารจัดการยานพาหนะของ Good & Rich — แอปแยกจาก SalesOS
> **ภาษา:** UI + คอมเมนต์โค้ด = ภาษาไทย · ตอบผู้ใช้ = ภาษาไทย

## ⛔ กติกาเหล็ก (ผู้ใช้ยืนยัน 1 ส.ค. 2569)
**FleetOS ไม่เกี่ยวกับโฟล์คลิฟท์เด็ดขาด** — โฟล์คลิฟท์ทุกคัน (ขาย/เช่า) อยู่ระบบ SalesOS เท่านั้น
ห้าม join/อ้างอิงตาราง `forklifts` ห้ามเพิ่มประเภทรถโฟล์คลิฟท์ สองระบบแยกขาดจากกัน

## แอปคืออะไร
ดูแลรถของบริษัท (เก๋ง/กระบะ/บรรทุก/เทรลเลอร์ ~20 คัน): ทะเบียนทรัพย์สิน+ค่าเสื่อม ·
เอกสาร พ.ร.บ./ประกัน/ภาษี (เตือนหมดอายุ 60/30/7 วัน) + เคลม · รอบซ่อมบำรุง+ยาง ·
น้ำมัน (กม./ลิตร + ธงกันทุจริต) · รายงานต้นทุน+Export Excel
ผู้ใช้ = backoffice เท่านั้น (สิทธิ์: แอดมิน หรือ role `stock` — เช็คผ่าน RPC `my_access` ของ SalesOS)

## Tech Stack (เหมือน sales-os-app)
Next.js 16.2.7 App Router · `output: "export"` (static, ห้ามโค้ด server) · React 19 ·
Tailwind v4 · lucide-react · recharts · xlsx (dynamic import) · Supabase (โปรเจคเดียวกับ SalesOS)

## โครงสร้าง
```
app/            page.tsx = login Google · home/ vehicles/ documents/ maintenance/ fuel/ reports/
components/     FleetShell.tsx (เมนู+guard) · GoogleLoginButton.tsx · ComingSoon.tsx
lib/            types.ts (โดเมนไทป์+คำนวณ due/ค่าเสื่อม/ธงน้ำมัน) · fleetApi.ts (CRUD)
                report.ts (รวมต้นทุน/Timeline/exportXlsx) · supabaseClient.ts · auth.ts
```

## ตาราง Supabase (prefix `fleet_` · ทุกตาราง soft delete ด้วย deleted_at)
`fleet_vehicles` · `fleet_documents` · `fleet_claims` · `fleet_maintenance_plans` ·
`fleet_maintenance_logs` · `fleet_tires` · `fleet_fuel_logs`
RLS ทุกตาราง: `is_admin() or user_role() = 'stock'` (ทั้งอ่าน/เขียน — backoffice เท่านั้น)

## กติกาที่โค้ดพึ่งพา
- ค่าโดเมนภาษาไทยใน `lib/types.ts` (VTYPES, DOC_TYPES, CLAIM_STATUSES ฯลฯ) — ใช้ให้ตรง
- บันทึกซ่อม/เติมน้ำมัน จะดัน `vehicles.odometer` ให้อัตโนมัติถ้าค่าใหม่มากกว่าเดิม
- บันทึกซ่อมที่ผูก plan_id จะรีเซ็ต last_date/last_odometer ของแผนให้
- เตือนรอบซ่อม: กม. หรือเดือน แล้วแต่ถึงก่อน (near = ≤1,000 กม. / ≤30 วัน) · ยาง near = ≤3,000 กม. / ≤60 วัน
- ธงน้ำมัน (enrichFuelLogs): เลขไมล์ย้อน / กินน้ำมันแย่กว่า avg ตัวเอง >25% (≥3 ครั้ง) / เติมซ้ำวันเดียว
- ค่าเสื่อม: เส้นตรง ตั้งอายุ(ปี)+ซาก(%) รายคัน — `bookValue()` และ `monthlyDepreciation()`

## ENV (.env.local — ห้าม commit)
`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` (โปรเจคเดียวกับ SalesOS) ·
`NEXT_PUBLIC_BASE_PATH` (ว่างตอน dev)

## คำสั่ง
`npm run dev` (launch config: `fleet-dev`) · `npm run build` · lint ผ่าน eslint

## ⚠️ ระวัง
- โฟลเดอร์นี้มี**เอกสารจริงของรถ** (pdf/jpg/xlsx สแกน พ.ร.บ./ประกัน/สินเชื่อ) — `.gitignore`
  กันไว้แล้ว แต่**ห้ามหลุดขึ้น repo public เด็ดขาด** ตรวจก่อน push เสมอ
- แผนงานเต็ม: `FLEET-PLAN.md` (สำเนา sync จาก `D:\ai-agent\FLEET-PLAN.md`)
- งานค้าง: deploy GitHub Pages (รอชื่อ repo) · อัปโหลดไฟล์แนบ · แจ้งเตือน LINE ·
  คีย์ราคาซื้อ/วันหมดอายุเอกสารจริง
