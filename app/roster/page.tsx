"use client";
// ตารางเวรรายวัน — ใครขับรถคันไหนวันไหน (คนขับเปลี่ยนทุกวัน)
// กรอกแบบ "ระบายสี": เลือกชื่อคนขับ 1 คน แล้วคลิกช่องวันที่รัวๆ ไม่ต้องเปิด dropdown ทีละช่อง

import { useEffect, useMemo, useState } from "react";
import FleetShell from "@/components/FleetShell";
import { CalendarDays, Eraser, Loader2, Paintbrush, Wand2 } from "lucide-react";
import {
  fillRosterMonth, listStaff, listVehicles, loadRoster, setRosterCell,
  type RosterCell, type Staff,
} from "@/lib/fleetApi";
import { isRetired, type Vehicle } from "@/lib/types";

const thisMonth = () => new Date().toISOString().slice(0, 7);
// ย่อชื่อให้พอดีช่อง: "นายธีรศักดิ์ แก้วบุตร" → "ธีรศักดิ์"
const short = (name: string) =>
  name.replace(/^(นาย|นาง|นางสาว|น\.ส\.)\s*/, "").split(/\s+/)[0];

// สีประจำตัวคนขับ (คงที่ตามชื่อ) เพื่อให้ดูตารางแล้วเห็นรูปแบบทันที
const COLORS = [
  "bg-teal-100 text-teal-900", "bg-sky-100 text-sky-900", "bg-amber-100 text-amber-900",
  "bg-violet-100 text-violet-900", "bg-rose-100 text-rose-900", "bg-emerald-100 text-emerald-900",
  "bg-orange-100 text-orange-900", "bg-blue-100 text-blue-900", "bg-lime-100 text-lime-900",
  "bg-fuchsia-100 text-fuchsia-900",
];
const colorOf = (name: string) => {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 997;
  return COLORS[h % COLORS.length];
};

export default function RosterPage() {
  const [period, setPeriod] = useState(thisMonth());
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [cells, setCells] = useState<Map<string, RosterCell>>(new Map());
  const [brush, setBrush] = useState("");       // คนขับที่กำลังถือแปรง ("" = ลบ)
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const days = useMemo(() => {
    const [y, m] = period.split("-").map(Number);
    const n = new Date(y, m, 0).getDate();
    return Array.from({ length: n }, (_, i) => i + 1);
  }, [period]);

  const key = (v: string, d: number) => `${v}|${period}-${String(d).padStart(2, "0")}`;

  const reload = async () => {
    try {
      const [v, s, r] = await Promise.all([listVehicles(), listStaff(), loadRoster(period)]);
      setVehicles(v.filter((x) => !isRetired(x)));
      setStaff(s);
      setCells(new Map(r.map((c) => [`${c.vehicle_id}|${c.work_date}`, c])));
      setErr("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally { setLoading(false); }
  };
  useEffect(() => { setLoading(true); reload(); }, [period]);  // eslint-disable-line react-hooks/exhaustive-deps

  const paint = async (v: Vehicle, d: number) => {
    const date = `${period}-${String(d).padStart(2, "0")}`;
    const k = `${v.id}|${date}`;
    const prev = cells.get(k);
    // อัปเดตหน้าจอทันที แล้วค่อยยิงเซิร์ฟ
    setCells((m) => {
      const n = new Map(m);
      if (!brush) n.delete(k);
      else n.set(k, { vehicle_id: v.id, work_date: date, driver_name: brush, source: "ออฟฟิศกรอก" });
      return n;
    });
    try {
      await setRosterCell(v.id, date, brush || null);
    } catch (e) {
      setCells((m) => { const n = new Map(m); if (prev) n.set(k, prev); else n.delete(k); return n; });
      setErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    }
  };

  const fillMonth = async (v: Vehicle) => {
    if (!brush) { setErr("เลือกชื่อคนขับก่อน (แถบด้านบน)"); return; }
    if (!confirm(`ใส่ "${brush}" เป็นคนขับ ${v.plate} ทั้งเดือน ${period}?`)) return;
    setBusy(true);
    try { await fillRosterMonth(v.id, period, brush); await reload(); setMsg(`เติม ${v.plate} ทั้งเดือนแล้ว`); }
    catch (e) { setErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setBusy(false); }
  };

  const filled = cells.size;
  const total = vehicles.length * days.length;

  return (
    <FleetShell>
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <CalendarDays className="w-5 h-5 text-teal-600" /> ตารางเวรคนขับรายวัน
        </h1>
        <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white text-sm px-3 py-2" />
      </div>

      {/* แถบเลือกแปรง */}
      <div className="rounded-2xl bg-teal-50 border border-teal-200 p-3 mb-4 text-sm text-teal-900">
        <b>วิธีหลัก: คนขับเช็คอินเองจากแอป</b> (แท็บ &quot;รถวันนี้&quot; — แตะเดียวตอนเริ่มงาน)
        ช่องที่คนขับเช็คอินเองจะมี <span className="ring-1 ring-inset ring-teal-600 px-1 rounded">ขอบเขียว</span>
        · หน้านี้ไว้ <b>ดูภาพรวมและเติมช่องที่คนขับลืมเช็คอิน</b>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 mb-4">
        <div className="flex items-center gap-2 mb-2">
          <Paintbrush className="w-4 h-4 text-teal-600" />
          <span className="font-semibold text-slate-700 text-sm">
            เติมย้อนหลัง: เลือกคนขับ แล้วคลิกช่องวันที่ได้เลย
          </span>
          <span className="text-xs text-slate-400 ml-auto">
            กรอกแล้ว {filled}/{total} ช่อง
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => setBrush("")}
            className={`px-3 py-1.5 rounded-xl text-sm border flex items-center gap-1 ${
              brush === "" ? "bg-slate-800 text-white border-slate-800" : "bg-white border-slate-200"
            }`}>
            <Eraser className="w-3.5 h-3.5" /> ลบ
          </button>
          {staff.filter((s) => s.active).map((s) => (
            <button key={s.id} onClick={() => setBrush(s.name)}
              className={`px-3 py-1.5 rounded-xl text-sm border ${
                brush === s.name
                  ? "ring-2 ring-teal-500 border-teal-500 font-semibold " + colorOf(s.name)
                  : "border-slate-200 " + colorOf(s.name)
              }`} title={`${s.name}${s.department ? ` · ${s.department}` : ""}`}>
              {short(s.name)}
            </button>
          ))}
        </div>
      </div>

      {err && <p className="text-red-600 text-sm mb-2">{err}</p>}
      {msg && <p className="text-emerald-700 text-sm mb-2">{msg}</p>}

      {loading ? (
        <p className="text-slate-400">กำลังโหลด…</p>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="text-xs border-collapse">
            <thead>
              <tr>
                <th className="sticky left-0 bg-slate-50 z-10 px-3 py-2 text-left border-b border-r border-slate-200 min-w-32">รถ</th>
                {days.map((d) => {
                  const dow = new Date(`${period}-${String(d).padStart(2, "0")}`).getDay();
                  return (
                    <th key={d} className={`px-0 py-2 border-b border-slate-200 w-11 text-center font-normal ${
                      dow === 0 ? "bg-rose-50 text-rose-600" : "text-slate-500"
                    }`}>{d}</th>
                  );
                })}
                <th className="px-2 py-2 border-b border-l border-slate-200 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {vehicles.map((v) => (
                <tr key={v.id}>
                  <td className="sticky left-0 bg-white z-10 px-3 py-1.5 border-b border-r border-slate-200 font-medium text-slate-800 whitespace-nowrap">
                    {v.plate}
                    <div className="text-[10px] text-slate-400 font-normal">{v.nickname ?? v.vtype}</div>
                  </td>
                  {days.map((d) => {
                    const c = cells.get(key(v.id, d));
                    const dow = new Date(`${period}-${String(d).padStart(2, "0")}`).getDay();
                    return (
                      <td key={d} className="border-b border-slate-100 p-0">
                        <button onClick={() => paint(v, d)}
                          title={c ? `${c.driver_name} (${c.source})` : "ว่าง"}
                          className={`w-11 h-8 text-[10px] leading-tight truncate transition-colors ${
                            c ? colorOf(c.driver_name) + " font-medium"
                              : dow === 0 ? "bg-rose-50/50 hover:bg-teal-50" : "hover:bg-teal-50"
                          } ${c?.source === "คนขับเช็คอิน" ? "ring-1 ring-inset ring-teal-500" : ""}`}>
                          {c ? short(c.driver_name).slice(0, 5) : ""}
                        </button>
                      </td>
                    );
                  })}
                  <td className="border-b border-l border-slate-200 px-1 text-center">
                    <button onClick={() => fillMonth(v)} disabled={busy} title="ใส่คนที่เลือกไว้ทั้งเดือน"
                      className="p-1 text-slate-300 hover:text-teal-600 disabled:opacity-40">
                      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-slate-400 mt-2">
        ช่องที่มี <span className="ring-1 ring-inset ring-teal-500 px-1 rounded">ขอบเขียว</span> = คนขับเช็คอินเองจากแอป ·
        ปุ่ม <Wand2 className="w-3 h-3 inline" /> ท้ายแถว = ใส่คนที่เลือกไว้ให้ทั้งเดือนรวดเดียว ·
        ตารางนี้คือคำตอบของ &quot;คนขับวันนั้น&quot; ในหน้าตามใบกำกับ
      </p>
    </FleetShell>
  );
}
