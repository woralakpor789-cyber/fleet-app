"use client";

// เฟส 4 — Fuel Management: บันทึกการเติม + กม./ลิตร + บาท/กม. + ธงเตือนผิดปกติ + กราฟ
import { useEffect, useMemo, useState } from "react";
import FleetShell from "@/components/FleetShell";
import { AlertTriangle, Fuel, Pencil, Plus, Trash2, Upload } from "lucide-react";
import FuelImport from "@/components/FuelImport";
import BillCapture from "@/components/BillCapture";
import { Camera } from "lucide-react";
import { listStaff } from "@/lib/fleetApi";
import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  FUEL_FLAG_LABELS, FUEL_TYPES, enrichFuelLogs, fmtBaht, fmtDate,
  type FuelLog, type FuelLogEnriched, type Vehicle,
} from "@/lib/types";
import { listFuelLogs, listSubmissions, listVehicles, saveFuelLog, softDeleteFuelLog } from "@/lib/fleetApi";
import FuelReview from "@/components/FuelReview";
import type { FuelSubmission } from "@/lib/types";

export default function FuelPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [logs, setLogs] = useState<FuelLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [fVehicle, setFVehicle] = useState("");
  const [fMonth, setFMonth] = useState("");   // "2026-08"
  const [editing, setEditing] = useState<Partial<FuelLog> | null>(null);
  const [importing, setImporting] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [staffNames, setStaffNames] = useState<string[]>([]);
  const [subs, setSubs] = useState<FuelSubmission[]>([]);
  const [tab, setTab] = useState<"logs" | "review">("logs");

  const reload = async () => {
    try {
      const [v, l, s] = await Promise.all([listVehicles(), listFuelLogs(), listSubmissions()]);
      setVehicles(v); setLogs(l); setSubs(s); setErr("");
      listStaff().then((st) => setStaffNames(st.map((x) => x.name))).catch(() => {});
    } catch (e) {
      setErr(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { reload(); }, []);

  const enriched = useMemo(() => enrichFuelLogs(logs), [logs]);
  const vById = useMemo(() => new Map(vehicles.map((v) => [v.id, v])), [vehicles]);
  const nameOf = (id: string) => {
    const v = vById.get(id);
    return v ? v.plate + (v.nickname ? ` (${v.nickname})` : "") : "?";
  };

  const filtered = useMemo(
    () => enriched.filter((l) =>
      (!fVehicle || l.vehicle_id === fVehicle) &&
      (!fMonth || l.fill_date.startsWith(fMonth))),
    [enriched, fVehicle, fMonth]
  );

  const nPending = subs.filter((s) => s.status === "รอตรวจ").length;

  // สรุปเดือนปัจจุบัน + ธงทั้งหมด
  const thisMonth = new Date().toISOString().slice(0, 7);
  const monthLogs = enriched.filter((l) => l.fill_date.startsWith(thisMonth));
  const monthAmount = monthLogs.reduce((s, l) => s + l.amount, 0);
  const monthLiters = monthLogs.reduce((s, l) => s + (l.liters ?? 0), 0);
  const noLiters = logs.filter((l) => l.liters == null).length;
  const nFlagged = enriched.filter((l) => l.flags.length).length;

  // กราฟ: รวมรายเดือน 6 เดือนล่าสุด (ตามฟิลเตอร์รถ)
  const chartMonthly = useMemo(() => {
    const src = enriched.filter((l) => !fVehicle || l.vehicle_id === fVehicle);
    const m = new Map<string, number>();
    for (const l of src) {
      const key = l.fill_date.slice(0, 7);
      m.set(key, (m.get(key) ?? 0) + l.amount);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-6)
      .map(([month, amount]) => ({ month, amount: Math.round(amount) }));
  }, [enriched, fVehicle]);

  // กราฟ กม./ลิตร รายครั้ง (เมื่อเลือกรถคันเดียว)
  const chartRate = useMemo(() => {
    if (!fVehicle) return [];
    return enriched
      .filter((l) => l.vehicle_id === fVehicle && l.kmPerL != null)
      .sort((a, b) => a.fill_date.localeCompare(b.fill_date))
      .map((l) => ({ date: fmtDate(l.fill_date), kmPerL: +l.kmPerL!.toFixed(2) }));
  }, [enriched, fVehicle]);

  return (
    <FleetShell>
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <Fuel className="w-5 h-5 text-teal-600" /> ต้นทุนน้ำมัน
        </h1>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setCapturing(true)}
            className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-4 py-2 rounded-xl">
            <Camera className="w-4 h-4" /> ถ่ายรูปบิล
          </button>
          <button onClick={() => setImporting(true)}
            className="flex items-center gap-1.5 bg-white border border-teal-600 text-teal-700 hover:bg-teal-50 text-sm font-medium px-4 py-2 rounded-xl">
            <Upload className="w-4 h-4" /> นำเข้าบิล
          </button>
          <button onClick={() => setEditing({})}
            className="flex items-center gap-1.5 bg-white border border-slate-300 text-slate-600 hover:bg-slate-50 text-sm font-medium px-4 py-2 rounded-xl">
            <Plus className="w-4 h-4" /> กรอกเอง
          </button>
        </div>
      </div>

      {/* แท็บ: รายการเติม / บิลรอตรวจจากคนขับ */}
      <div className="flex gap-2 mb-4">
        {([["logs", "รายการเติม"], ["review", `บิลรอตรวจ${nPending ? ` (${nPending})` : ""}`]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-1.5 rounded-full text-sm ${
              tab === k ? "bg-teal-600 text-white font-medium"
                : k === "review" && nPending ? "bg-amber-50 border border-amber-300 text-amber-800 font-medium"
                : "bg-white border border-slate-200 text-slate-600"
            }`}>{label}</button>
        ))}
      </div>

      {tab === "review" ? (
        <FuelReview rows={subs} vehicles={vehicles} onChanged={reload} />
      ) : (
      <>
      {/* สรุป */}
      <div className="grid grid-cols-3 gap-3 mb-4 max-w-2xl">
        <div className="rounded-2xl border border-slate-200 bg-white p-3">
          <div className="text-xs text-slate-500">ค่าน้ำมันเดือนนี้</div>
          <div className="text-xl font-bold text-slate-800 mt-1">{fmtBaht(monthAmount || null)}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-3">
          <div className="text-xs text-slate-500">ลิตรเดือนนี้</div>
          <div className="text-xl font-bold text-slate-800 mt-1">
            {monthLiters ? monthLiters.toLocaleString("th-TH", { maximumFractionDigits: 1 }) : "—"}
          </div>
        </div>
        <div className={`rounded-2xl border p-3 ${nFlagged ? "border-red-200 bg-red-50 text-red-700" : "border-slate-200 bg-white text-slate-800"}`}>
          <div className={`text-xs ${nFlagged ? "" : "text-slate-500"}`}>รายการติดธงเตือน</div>
          <div className="text-xl font-bold mt-1">{nFlagged}</div>
        </div>
        {noLiters > 0 && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 col-span-3 md:col-span-1">
            <div className="text-xs text-amber-800">ยังไม่ทราบจำนวนลิตร</div>
            <div className="text-xl font-bold text-amber-800 mt-1">{noLiters}</div>
            <div className="text-[10px] text-amber-700">มาจากใบแจ้งยอดบัตร — เติมลิตรจากใบกำกับเพื่อคำนวณ กม./ลิตร</div>
          </div>
        )}
      </div>

      {/* ฟิลเตอร์ */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <select value={fVehicle} onChange={(e) => setFVehicle(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white text-sm px-3 py-2">
          <option value="">ทุกคัน</option>
          {vehicles.map((v) => <option key={v.id} value={v.id}>{v.plate}{v.nickname ? ` (${v.nickname})` : ""}</option>)}
        </select>
        <input type="month" value={fMonth} onChange={(e) => setFMonth(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white text-sm px-3 py-2" />
        {(fVehicle || fMonth) && (
          <button onClick={() => { setFVehicle(""); setFMonth(""); }}
            className="text-sm text-slate-500 hover:text-slate-700 px-2">ล้างฟิลเตอร์</button>
        )}
      </div>

      {/* กราฟ */}
      {!loading && chartMonthly.length > 0 && (
        <div className="grid md:grid-cols-2 gap-3 mb-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
            <div className="text-sm font-medium text-slate-700 mb-2">
              ค่าน้ำมันรายเดือน{fVehicle ? ` — ${nameOf(fVehicle)}` : " (ทุกคัน)"}
            </div>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartMonthly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} width={52} />
                  <Tooltip formatter={(v) => [`${Number(v).toLocaleString()} ฿`, "ค่าน้ำมัน"]} />
                  <Bar dataKey="amount" fill="#0d9488" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          {fVehicle && chartRate.length >= 2 && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
              <div className="text-sm font-medium text-slate-700 mb-2">อัตราสิ้นเปลือง (กม./ลิตร) — {nameOf(fVehicle)}</div>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartRate}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} width={40} />
                    <Tooltip formatter={(v) => [`${v} กม./ลิตร`, "อัตราสิ้นเปลือง"]} />
                    <Line type="monotone" dataKey="kmPerL" stroke="#0d9488" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      )}

      {err && <p className="text-red-600 text-sm mb-3">{err}</p>}
      {loading ? (
        <p className="text-slate-400">กำลังโหลด…</p>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="w-full text-sm min-w-[860px]">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-100">
                <th className="px-4 py-3">วันที่</th>
                <th className="px-2 py-3">รถ</th>
                <th className="px-2 py-3 text-right">เลขไมล์</th>
                <th className="px-2 py-3 text-right">ลิตร</th>
                <th className="px-2 py-3 text-right">บาท</th>
                <th className="px-2 py-3 text-right">฿/ลิตร</th>
                <th className="px-2 py-3 text-right">กม./ลิตร</th>
                <th className="px-2 py-3 text-right">฿/กม.</th>
                <th className="px-2 py-3">ธงเตือน</th>
                <th className="px-2 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => (
                <FuelRow key={l.id} l={l} name={nameOf(l.vehicle_id)}
                  onEdit={() => setEditing(l)}
                  onDelete={async () => {
                    if (confirm("ลบรายการเติมน้ำมันนี้?")) { await softDeleteFuelLog(l.id); reload(); }
                  }} />
              ))}
              {!filtered.length && (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-slate-400">
                  ยังไม่มีรายการ — กด "บันทึกการเติม" แล้วใส่เลขไมล์ทุกครั้ง ระบบจะคำนวณ กม./ลิตร ให้อัตโนมัติ
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      </>
      )}

      {editing && (
        <FuelModal init={editing} vehicles={vehicles}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload(); }} />
      )}
      {importing && (
        <FuelImport vehicles={vehicles}
          onClose={() => setImporting(false)} onSaved={reload} />
      )}
      {capturing && (
        <BillCapture vehicles={vehicles} staffNames={staffNames}
          onClose={() => setCapturing(false)} onSaved={reload} />
      )}
    </FleetShell>
  );
}

function FuelRow({ l, name, onEdit, onDelete }: {
  l: FuelLogEnriched; name: string; onEdit: () => void; onDelete: () => void;
}) {
  return (
    <tr className={`border-b border-slate-50 hover:bg-slate-50/60 ${l.flags.length ? "bg-red-50/40" : ""}`}>
      <td className="px-4 py-2.5">{fmtDate(l.fill_date)}</td>
      <td className="px-2 py-2.5 font-medium text-slate-800">{name}</td>
      <td className="px-2 py-2.5 text-right">{l.odometer != null ? l.odometer.toLocaleString() : "—"}</td>
      <td className="px-2 py-2.5 text-right">
        {l.liters != null
          ? l.liters.toLocaleString("th-TH", { maximumFractionDigits: 1 })
          : <span className="text-amber-600 text-xs">ยังไม่ทราบ</span>}
      </td>
      <td className="px-2 py-2.5 text-right">{fmtBaht(l.amount)}</td>
      <td className="px-2 py-2.5 text-right text-slate-500">
        {(l.liters ?? 0) > 0 ? (l.amount / l.liters!).toFixed(2) : "—"}
      </td>
      <td className="px-2 py-2.5 text-right">
        {l.kmPerL != null ? l.kmPerL.toFixed(1) : "—"}
      </td>
      <td className="px-2 py-2.5 text-right">{l.bahtPerKm != null ? l.bahtPerKm.toFixed(2) : "—"}</td>
      <td className="px-2 py-2.5">
        {l.flags.length ? (
          <span className="inline-flex items-center gap-1 flex-wrap">
            {l.flags.map((f) => (
              <span key={f} className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700 border border-red-200">
                <AlertTriangle className="w-3 h-3" />{FUEL_FLAG_LABELS[f]}
              </span>
            ))}
          </span>
        ) : <span className="text-xs text-slate-300">—</span>}
      </td>
      <td className="px-2 py-2.5 whitespace-nowrap">
        <button onClick={onEdit} className="p-1.5 text-slate-400 hover:text-teal-600"><Pencil className="w-4 h-4" /></button>
        <button onClick={onDelete} className="p-1.5 text-slate-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
      </td>
    </tr>
  );
}

// ---------- ฟอร์มบันทึกการเติม ----------
function FuelModal({ init, vehicles, onClose, onSaved }: {
  init: Partial<FuelLog>; vehicles: Vehicle[]; onClose: () => void; onSaved: () => void;
}) {
  const [f, setF] = useState<Partial<FuelLog>>({
    fill_date: new Date().toISOString().slice(0, 10), fuel_type: "ดีเซล", full_tank: true, ...init,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const set = (k: keyof FuelLog, val: unknown) => setF((p) => ({ ...p, [k]: val }));
  const vehicle = vehicles.find((v) => v.id === f.vehicle_id);
  const inp = "w-full rounded-xl border border-slate-200 px-3 py-2 text-sm";
  const lbl = "text-xs text-slate-500 mb-1 block";

  const save = async () => {
    if (!f.vehicle_id) { setErr("เลือกรถ"); return; }
    if (!f.fill_date) { setErr("กรอกวันที่"); return; }
    if (!f.amount || f.amount <= 0) { setErr("กรอกยอดจ่าย (บาท)"); return; }
    setSaving(true);
    try {
      await saveFuelLog({
        id: f.id, vehicle_id: f.vehicle_id, fill_date: f.fill_date,
        odometer: f.odometer || null, liters: f.liters || null, amount: f.amount,
        fuel_type: f.fuel_type || null, station: f.station || null,
        full_tank: f.full_tank ?? true, note: f.note || null,
      }, { vehicle });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-end md:items-center justify-center p-0 md:p-6">
      <div className="bg-white w-full md:max-w-lg rounded-t-2xl md:rounded-2xl shadow-xl max-h-[92vh] overflow-y-auto p-5">
        <h2 className="font-bold text-slate-800 mb-4">{f.id ? "แก้ไขรายการเติมน้ำมัน" : "บันทึกการเติมน้ำมัน"}</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><span className={lbl}>รถ *</span>
            <select className={inp} value={f.vehicle_id ?? ""} onChange={(e) => set("vehicle_id", e.target.value)}>
              <option value="">— เลือกรถ —</option>
              {vehicles.map((v) => <option key={v.id} value={v.id}>{v.plate}{v.nickname ? ` (${v.nickname})` : ""}</option>)}
            </select>
            {vehicle?.odometer != null && (
              <p className="text-xs text-slate-400 mt-1">เลขไมล์ล่าสุดในระบบ: {vehicle.odometer.toLocaleString()} กม.</p>
            )}</div>
          <div><span className={lbl}>วันที่เติม *</span>
            <input type="date" className={inp} value={f.fill_date ?? ""} onChange={(e) => set("fill_date", e.target.value)} /></div>
          <div><span className={lbl}>เลขไมล์ (กม.) — แนะนำใส่ทุกครั้ง</span>
            <input type="number" className={inp} value={f.odometer ?? ""}
              onChange={(e) => set("odometer", e.target.value ? +e.target.value : null)} /></div>
          <div><span className={lbl}>จำนวนลิตร (เว้นได้ถ้ายังไม่ทราบ)</span>
            <input type="number" step="0.01" className={inp} value={f.liters ?? ""}
              onChange={(e) => set("liters", e.target.value ? +e.target.value : null)} /></div>
          <div><span className={lbl}>ยอดจ่าย (บาท) *</span>
            <input type="number" step="0.01" className={inp} value={f.amount ?? ""}
              onChange={(e) => set("amount", e.target.value ? +e.target.value : null)} /></div>
          <div><span className={lbl}>ประเภทน้ำมัน</span>
            <select className={inp} value={f.fuel_type ?? "ดีเซล"} onChange={(e) => set("fuel_type", e.target.value)}>
              {FUEL_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select></div>
          <div><span className={lbl}>ปั๊ม</span>
            <input className={inp} value={f.station ?? ""} onChange={(e) => set("station", e.target.value)} /></div>
          <div className="col-span-2 flex items-center gap-2">
            <input type="checkbox" id="fulltank" checked={f.full_tank ?? true}
              onChange={(e) => set("full_tank", e.target.checked)} className="w-4 h-4 accent-teal-600" />
            <label htmlFor="fulltank" className="text-sm text-slate-600">เติมเต็มถัง (คำนวณอัตราสิ้นเปลืองแม่นยำ)</label>
          </div>
          <div className="col-span-2"><span className={lbl}>หมายเหตุ</span>
            <input className={inp} value={f.note ?? ""} onChange={(e) => set("note", e.target.value)} /></div>
        </div>
        {f.liters && f.amount ? (
          <p className="text-xs text-slate-500 mt-3">ราคาต่อลิตร ≈ <b>{(f.amount / f.liters).toFixed(2)} ฿</b></p>
        ) : null}
        {err && <p className="text-red-600 text-sm mt-3">{err}</p>}
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-slate-600 hover:bg-slate-100">ยกเลิก</button>
          <button onClick={save} disabled={saving}
            className="px-5 py-2 rounded-xl text-sm font-medium bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-50">
            {saving ? "กำลังบันทึก…" : "บันทึก"}
          </button>
        </div>
      </div>
    </div>
  );
}
