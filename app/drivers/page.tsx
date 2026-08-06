"use client";
// จัดการคนขับ + พิมพ์ QR ติดในรถ (backoffice เท่านั้น)
// - รายชื่ออีเมลคนขับที่อนุญาตให้ส่งบิล (แอดมินแก้ได้ · DB ตรวจสิทธิ์ซ้ำอีกชั้น)
// - QR ต่อคัน: สแกนแล้วเปิดหน้าคนขับพร้อมเลือกรถให้เลย

import { useEffect, useState } from "react";
import FleetShell from "@/components/FleetShell";
import { Plus, Printer, QrCode, Trash2, UserCheck } from "lucide-react";
import { listVehicles } from "@/lib/fleetApi";
import { getDriverEmails, setDriverEmails } from "@/lib/driverApi";
import type { Vehicle } from "@/lib/types";

export default function DriversPage() {
  const [emails, setEmails] = useState<string[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [newEmail, setNewEmail] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [qr, setQr] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      try {
        const [e, v] = await Promise.all([getDriverEmails(), listVehicles()]);
        setEmails(e); setVehicles(v);
      } catch { setErr("โหลดข้อมูลไม่สำเร็จ"); }
      setLoading(false);
    })();
  }, []);

  // สร้าง QR ทุกคัน (ทำฝั่ง client ตอนกดเท่านั้น — ไลบรารีโหลดแบบ lazy)
  const makeQr = async () => {
    setMsg("กำลังสร้าง QR…");
    const QRCode = (await import("qrcode")).default;
    const base = `${window.location.origin}${window.location.pathname.replace(/\/drivers\/?$/, "")}/driver/`;
    const out: Record<string, string> = {};
    for (const v of vehicles) {
      out[v.id] = await QRCode.toDataURL(`${base}?v=${v.id}`, { width: 320, margin: 1 });
    }
    setQr(out);
    setMsg(`สร้าง QR ครบ ${vehicles.length} คัน — กดปุ่มพิมพ์ได้เลย`);
  };

  const add = async () => {
    const e = newEmail.trim().toLowerCase();
    if (!e || !e.includes("@")) { setErr("กรอกอีเมลให้ถูกต้อง"); return; }
    setErr("");
    try {
      const next = await setDriverEmails([...emails, e]);
      setEmails(next); setNewEmail(""); setMsg(`เพิ่ม ${e} แล้ว`);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "บันทึกไม่สำเร็จ (ต้องเป็นแอดมิน)");
    }
  };

  const remove = async (e: string) => {
    if (!confirm(`ถอดสิทธิ์ ${e} ออกจากรายชื่อคนขับ?`)) return;
    try {
      const next = await setDriverEmails(emails.filter((x) => x !== e));
      setEmails(next); setMsg(`ถอด ${e} ออกแล้ว`);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "บันทึกไม่สำเร็จ (ต้องเป็นแอดมิน)");
    }
  };

  return (
    <FleetShell>
      <h1 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
        <UserCheck className="w-5 h-5 text-teal-600" /> คนขับ &amp; QR ประจำรถ
      </h1>

      {err && <p className="text-red-600 text-sm mb-3">{err}</p>}
      {msg && <p className="text-emerald-700 text-sm mb-3">{msg}</p>}

      {/* รายชื่อคนขับ */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 mb-5 max-w-2xl print:hidden">
        <h2 className="font-semibold text-slate-700 mb-1">คนขับที่ส่งบิลได้</h2>
        <p className="text-xs text-slate-500 mb-3">
          ใส่อีเมล Gmail ของคนขับ — เขาจะล็อกอินเข้าหน้าส่งบิลได้ แต่**เห็นได้แค่ทะเบียนรถกับรายการที่ตัวเองส่ง**
          ไม่เห็นต้นทุน ไม่เห็นรายงาน และทุกใบยังต้องให้ออฟฟิศอนุมัติก่อน
        </p>
        <div className="flex gap-2 mb-3">
          <input value={newEmail} onChange={(e) => setNewEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="somchai@gmail.com"
            className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          <button onClick={add}
            className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-4 py-2 rounded-xl">
            <Plus className="w-4 h-4" /> เพิ่ม
          </button>
        </div>
        {loading ? <p className="text-slate-400 text-sm">กำลังโหลด…</p> : emails.length ? (
          <ul className="divide-y divide-slate-50">
            {emails.map((e) => (
              <li key={e} className="flex items-center justify-between py-2">
                <span className="text-sm text-slate-700 break-all">{e}</span>
                <button onClick={() => remove(e)} className="p-1.5 text-slate-300 hover:text-red-600">
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-400">ยังไม่มีคนขับในรายชื่อ</p>
        )}
      </div>

      {/* QR ประจำรถ */}
      <div className="flex items-center justify-between gap-2 mb-3 print:hidden">
        <h2 className="font-semibold text-slate-700 flex items-center gap-2">
          <QrCode className="w-4 h-4 text-teal-600" /> QR ติดในรถ ({vehicles.length} คัน)
        </h2>
        <div className="flex gap-2">
          <button onClick={makeQr}
            className="text-sm px-4 py-2 rounded-xl border border-teal-600 text-teal-700 hover:bg-teal-50">
            สร้าง QR
          </button>
          {Object.keys(qr).length > 0 && (
            <button onClick={() => window.print()}
              className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-4 py-2 rounded-xl">
              <Printer className="w-4 h-4" /> พิมพ์
            </button>
          )}
        </div>
      </div>

      {Object.keys(qr).length === 0 ? (
        <p className="text-sm text-slate-400 print:hidden">
          กด &quot;สร้าง QR&quot; แล้วสั่งพิมพ์ → ตัดแปะไว้หน้าคอนโซลรถแต่ละคัน
          คนขับสแกนแล้วเปิดหน้าส่งบิลพร้อมเลือกรถคันนั้นให้อัตโนมัติ
        </p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {vehicles.map((v) => (
            <div key={v.id} className="bg-white border border-slate-300 rounded-xl p-3 text-center break-inside-avoid">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr[v.id]} alt={`QR ${v.plate}`} className="w-full max-w-[150px] mx-auto" />
              <div className="font-bold text-slate-800 mt-1">{v.plate}</div>
              <div className="text-[10px] text-slate-500 leading-tight">
                {v.nickname ?? v.vtype} · สแกนเพื่อแจ้งเติมน้ำมัน
              </div>
            </div>
          ))}
        </div>
      )}
    </FleetShell>
  );
}
