"use client";

// เฟส 1 — ทะเบียนรถ & ทรัพย์สิน: รายการรถ + ค้นหา/กรอง + เพิ่ม/แก้ไข/ลบ + ค่าเสื่อมราคา
import { useEffect, useMemo, useState } from "react";
import FleetShell from "@/components/FleetShell";
import { Car, Pencil, Plus, Search, Trash2 } from "lucide-react";
import {
  BRANCHES, DISPOSAL_TYPES, FINANCE_STATUSES, VEHICLE_STATUSES, VTYPES,
  bookValue, disposalGain, fmtBaht, fmtDate, isRetired, type Vehicle,
} from "@/lib/types";
import { listStaff, listVehicles, softDeleteVehicle, upsertVehicle, type Staff } from "@/lib/fleetApi";

const EMPTY: Partial<Vehicle> = { vtype: "กระบะ", status: "ใช้งาน", depreciation_years: 5, salvage_pct: 10 };

export default function VehiclesPage() {
  const [rows, setRows] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [fType, setFType] = useState("");
  const [fBranch, setFBranch] = useState("");
  const [showRetired, setShowRetired] = useState(false);
  const [editing, setEditing] = useState<Partial<Vehicle> | null>(null);
  const [staff, setStaff] = useState<Staff[]>([]);

  const reload = async () => {
    try {
      setRows(await listVehicles());
      listStaff().then(setStaff).catch(() => {});
      setErr("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { reload(); }, []);

  const filtered = useMemo(
    () =>
      rows.filter((v) => {
        if (!showRetired && isRetired(v)) return false;
        if (fType && v.vtype !== fType) return false;
        if (fBranch && v.branch !== fBranch) return false;
        const s = q.trim().toLowerCase();
        if (!s) return true;
        return [v.plate, v.nickname, v.brand, v.model, v.driver_name]
          .some((x) => x?.toLowerCase().includes(s));
      }),
    [rows, q, fType, fBranch, showRetired]
  );
  const nRetired = rows.filter(isRetired).length;

  const handleDelete = async (v: Vehicle) => {
    if (!confirm(`ลบรถทะเบียน ${v.plate} ออกจากระบบ? (กู้คืนได้โดยแอดมิน)`)) return;
    await softDeleteVehicle(v.id);
    reload();
  };

  return (
    <FleetShell>
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <Car className="w-5 h-5 text-teal-600" /> ทะเบียนรถ ({filtered.length})
        </h1>
        <button
          onClick={() => setEditing({ ...EMPTY })}
          className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-4 py-2 rounded-xl"
        >
          <Plus className="w-4 h-4" /> เพิ่มรถ
        </button>
      </div>

      {/* ค้นหา + กรอง */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นหา ทะเบียน / ชื่อเรียก / ยี่ห้อ / คนขับ"
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-white text-sm"
          />
        </div>
        <select value={fType} onChange={(e) => setFType(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white text-sm px-3 py-2">
          <option value="">ทุกประเภท</option>
          {VTYPES.map((t) => <option key={t}>{t}</option>)}
        </select>
        <select value={fBranch} onChange={(e) => setFBranch(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white text-sm px-3 py-2">
          <option value="">ทุกสาขา</option>
          {BRANCHES.map((b) => <option key={b}>{b}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-600 px-2 cursor-pointer">
          <input type="checkbox" checked={showRetired} onChange={(e) => setShowRetired(e.target.checked)}
            className="w-4 h-4 accent-teal-600" />
          รวมรถที่ปลดประจำการ{nRetired > 0 ? ` (${nRetired})` : ""}
        </label>
      </div>

      {err && <p className="text-red-600 text-sm mb-3">{err}</p>}
      {loading ? (
        <p className="text-slate-400">กำลังโหลด…</p>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-100">
                <th className="px-4 py-3">ทะเบียน</th>
                <th className="px-2 py-3">ประเภท</th>
                <th className="px-2 py-3">ยี่ห้อ/รุ่น</th>
                <th className="px-2 py-3">สาขา</th>
                <th className="px-2 py-3">คนขับ</th>
                <th className="px-2 py-3 text-right">ราคาซื้อ</th>
                <th className="px-2 py-3 text-right">มูลค่าตามบัญชี</th>
                <th className="px-2 py-3">สถานะ</th>
                <th className="px-2 py-3">กรรมสิทธิ์</th>
                <th className="px-2 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((v) => (
                <tr key={v.id} className={`border-b border-slate-50 hover:bg-slate-50/60 ${isRetired(v) ? "opacity-60 bg-slate-50/50" : ""}`}>
                  <td className="px-4 py-2.5">
                    <div className="font-semibold text-slate-800">{v.plate}</div>
                    <div className="text-xs text-slate-400">
                      {v.plate_province ?? ""} {v.nickname ? `· ${v.nickname}` : ""}
                    </div>
                  </td>
                  <td className="px-2 py-2.5">{v.vtype}</td>
                  <td className="px-2 py-2.5">{[v.brand, v.model].filter(Boolean).join(" ") || "—"}</td>
                  <td className="px-2 py-2.5">{v.branch ?? "—"}</td>
                  <td className="px-2 py-2.5">{v.driver_name ?? "—"}</td>
                  <td className="px-2 py-2.5 text-right">{fmtBaht(v.purchase_price)}</td>
                  <td className="px-2 py-2.5 text-right">{fmtBaht(bookValue(v))}</td>
                  <td className="px-2 py-2.5">
                    <span className={`px-2 py-0.5 rounded-full text-xs ${
                      v.status === "ใช้งาน" ? "bg-emerald-50 text-emerald-700" :
                      v.status === "ซ่อม" ? "bg-amber-50 text-amber-700" : "bg-slate-200 text-slate-600"
                    }`}>{v.status}</span>
                    {v.disposal_date && (
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {v.disposal_type ?? "ปลด"} {fmtDate(v.disposal_date)}
                        {v.disposal_price != null && ` · ${fmtBaht(v.disposal_price)}`}
                        {(() => {
                          const g = disposalGain(v);
                          return g == null ? null : (
                            <span className={g >= 0 ? "text-emerald-600" : "text-red-600"}>
                              {" "}({g >= 0 ? "กำไร" : "ขาดทุน"} {fmtBaht(Math.abs(g))})
                            </span>
                          );
                        })()}
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-2.5">
                    {v.finance_status ? (
                      <span className={`px-2 py-0.5 rounded-full text-xs ${
                        v.finance_status === "ไฟแนนซ์"
                          ? "bg-orange-50 text-orange-700" : "bg-sky-50 text-sky-700"
                      }`}>{v.finance_status}</span>
                    ) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-2 py-2.5 whitespace-nowrap">
                    <button onClick={() => setEditing(v)} className="p-1.5 text-slate-400 hover:text-teal-600">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(v)} className="p-1.5 text-slate-400 hover:text-red-600">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {!filtered.length && (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-slate-400">ไม่พบรถ</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <VehicleModal
          init={editing}
          staff={staff}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload(); }}
        />
      )}
    </FleetShell>
  );
}

// ---------- ฟอร์มเพิ่ม/แก้ไขรถ ----------
function VehicleModal({
  init, staff, onClose, onSaved,
}: {
  init: Partial<Vehicle>;
  staff: Staff[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState<Partial<Vehicle>>(init);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const set = (k: keyof Vehicle, val: unknown) => setF((p) => ({ ...p, [k]: val }));

  const save = async () => {
    if (!f.plate?.trim()) { setErr("กรอกเลขทะเบียน"); return; }
    setSaving(true);
    try {
      // ส่งเฉพาะฟิลด์ของตาราง (กัน field แปลกปลอมตอนแก้ไข)
      const payload: Partial<Vehicle> & { id?: string } = {
        id: f.id, plate: f.plate.trim(), plate_province: f.plate_province || null,
        vtype: f.vtype || "อื่นๆ", nickname: f.nickname || null, brand: f.brand || null,
        model: f.model || null, year: f.year || null, vin: f.vin || null,
        engine_no: f.engine_no || null, color: f.color || null, branch: f.branch || null,
        driver_name: f.driver_name || null, purchase_date: f.purchase_date || null,
        purchase_price: f.purchase_price || null,
        depreciation_years: f.depreciation_years || 5, salvage_pct: f.salvage_pct ?? 10,
        status: f.disposal_date && f.status !== "ขายแล้ว" ? "ปลดประจำการ" : (f.status || "ใช้งาน"),
        finance_status: f.finance_status || null,
        odometer: f.odometer || null, note: f.note || null,
        in_service_from: f.in_service_from || null,
        disposal_date: f.disposal_date || null, disposal_type: f.disposal_type || null,
        disposal_price: f.disposal_price ?? null, disposal_to: f.disposal_to || null,
        disposal_note: f.disposal_note || null,
      };
      await upsertVehicle(payload);
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
      setSaving(false);
    }
  };

  const inp = "w-full rounded-xl border border-slate-200 px-3 py-2 text-sm";
  const lbl = "text-xs text-slate-500 mb-1 block";

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-end md:items-center justify-center p-0 md:p-6">
      <div className="bg-white w-full md:max-w-2xl rounded-t-2xl md:rounded-2xl shadow-xl max-h-[92vh] overflow-y-auto p-5">
        <h2 className="font-bold text-slate-800 mb-4">{f.id ? `แก้ไขรถ ${init.plate}` : "เพิ่มรถใหม่"}</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div><span className={lbl}>เลขทะเบียน *</span>
            <input className={inp} value={f.plate ?? ""} onChange={(e) => set("plate", e.target.value)} /></div>
          <div><span className={lbl}>จังหวัดทะเบียน</span>
            <input className={inp} value={f.plate_province ?? ""} onChange={(e) => set("plate_province", e.target.value)} /></div>
          <div><span className={lbl}>ประเภท</span>
            <select className={inp} value={f.vtype ?? "อื่นๆ"} onChange={(e) => set("vtype", e.target.value)}>
              {VTYPES.map((t) => <option key={t}>{t}</option>)}
            </select></div>
          <div><span className={lbl}>ชื่อเรียก</span>
            <input className={inp} value={f.nickname ?? ""} onChange={(e) => set("nickname", e.target.value)} /></div>
          <div><span className={lbl}>ยี่ห้อ</span>
            <input className={inp} value={f.brand ?? ""} onChange={(e) => set("brand", e.target.value)} /></div>
          <div><span className={lbl}>รุ่น</span>
            <input className={inp} value={f.model ?? ""} onChange={(e) => set("model", e.target.value)} /></div>
          <div><span className={lbl}>ปีรถ (ค.ศ.)</span>
            <input type="number" className={inp} value={f.year ?? ""} onChange={(e) => set("year", e.target.value ? +e.target.value : null)} /></div>
          <div><span className={lbl}>เลขตัวถัง (VIN)</span>
            <input className={inp} value={f.vin ?? ""} onChange={(e) => set("vin", e.target.value)} /></div>
          <div><span className={lbl}>เลขเครื่อง</span>
            <input className={inp} value={f.engine_no ?? ""} onChange={(e) => set("engine_no", e.target.value)} /></div>
          <div><span className={lbl}>สี</span>
            <input className={inp} value={f.color ?? ""} onChange={(e) => set("color", e.target.value)} /></div>
          <div><span className={lbl}>สาขาประจำ</span>
            <select className={inp} value={f.branch ?? ""} onChange={(e) => set("branch", e.target.value || null)}>
              <option value="">— เลือก —</option>
              {BRANCHES.map((b) => <option key={b}>{b}</option>)}
            </select></div>
          <div><span className={lbl}>คนขับ/ผู้ใช้ประจำ</span>
            <select className={inp} value={f.driver_name ?? ""}
              onChange={(e) => set("driver_name", e.target.value || null)}>
              <option value="">— ยังไม่ระบุ —</option>
              {staff.map((s) => (
                <option key={s.id} value={s.name}>{s.name}{s.department ? ` · ${s.department}` : ""}</option>
              ))}
            </select></div>
          <div><span className={lbl}>วันที่ซื้อ</span>
            <input type="date" className={inp} value={f.purchase_date ?? ""} onChange={(e) => set("purchase_date", e.target.value || null)} /></div>
          <div><span className={lbl}>ราคาซื้อ (บาท)</span>
            <input type="number" className={inp} value={f.purchase_price ?? ""} onChange={(e) => set("purchase_price", e.target.value ? +e.target.value : null)} /></div>
          <div><span className={lbl}>สถานะ</span>
            <select className={inp} value={f.status ?? "ใช้งาน"} onChange={(e) => set("status", e.target.value)}>
              {VEHICLE_STATUSES.map((s) => <option key={s}>{s}</option>)}
            </select></div>
          <div><span className={lbl}>สถานะกรรมสิทธิ์</span>
            <select className={inp} value={f.finance_status ?? ""} onChange={(e) => set("finance_status", e.target.value || null)}>
              <option value="">— ไม่ระบุ —</option>
              {FINANCE_STATUSES.map((s) => <option key={s}>{s}</option>)}
            </select></div>
          <div><span className={lbl}>อายุค่าเสื่อม (ปี)</span>
            <input type="number" className={inp} value={f.depreciation_years ?? 5} onChange={(e) => set("depreciation_years", e.target.value ? +e.target.value : 5)} /></div>
          <div><span className={lbl}>มูลค่าซาก (%)</span>
            <input type="number" className={inp} value={f.salvage_pct ?? 10} onChange={(e) => set("salvage_pct", e.target.value ? +e.target.value : 10)} /></div>
          <div><span className={lbl}>เลขไมล์ (กม.)</span>
            <input type="number" className={inp} value={f.odometer ?? ""} onChange={(e) => set("odometer", e.target.value ? +e.target.value : null)} /></div>
          <div><span className={lbl}>เริ่มใช้งานเมื่อ</span>
            <input type="date" className={inp} value={f.in_service_from ?? ""}
              onChange={(e) => set("in_service_from", e.target.value || null)} /></div>

          {/* ปลดประจำการ */}
          <div className="col-span-2 md:col-span-3 border-t border-slate-100 pt-3 mt-1">
            <div className="text-sm font-semibold text-slate-700 mb-2">การปลดประจำการ (กรอกเมื่อเลิกใช้รถคันนี้)</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div><span className={lbl}>วันที่ปลด</span>
                <input type="date" className={inp} value={f.disposal_date ?? ""}
                  onChange={(e) => set("disposal_date", e.target.value || null)} /></div>
              <div><span className={lbl}>วิธีปลด</span>
                <select className={inp} value={f.disposal_type ?? ""}
                  onChange={(e) => set("disposal_type", e.target.value || null)}>
                  <option value="">— เลือก —</option>
                  {DISPOSAL_TYPES.map((t) => <option key={t}>{t}</option>)}
                </select></div>
              <div><span className={lbl}>เงินที่ได้รับ (บาท)</span>
                <input type="number" className={inp} value={f.disposal_price ?? ""}
                  onChange={(e) => set("disposal_price", e.target.value ? +e.target.value : null)} /></div>
              <div><span className={lbl}>ขายให้ / ส่งคืนใคร</span>
                <input className={inp} value={f.disposal_to ?? ""}
                  onChange={(e) => set("disposal_to", e.target.value || null)} /></div>
              <div className="col-span-2 md:col-span-4"><span className={lbl}>หมายเหตุการปลด</span>
                <input className={inp} value={f.disposal_note ?? ""}
                  onChange={(e) => set("disposal_note", e.target.value || null)} /></div>
            </div>
            {f.disposal_date && f.disposal_price != null && f.purchase_price && f.purchase_date && (() => {
              const g = disposalGain(f as Vehicle);
              return g == null ? null : (
                <p className={`text-xs mt-2 ${g >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                  มูลค่าตามบัญชี ณ วันปลด {fmtBaht(bookValue(f as Vehicle, new Date(f.disposal_date!)))} →
                  {" "}<b>{g >= 0 ? "กำไร" : "ขาดทุน"}จากการปลด {fmtBaht(Math.abs(g))}</b>
                </p>
              );
            })()}
            <p className="text-xs text-slate-400 mt-2">
              ใส่วันที่ปลดแล้ว รถจะหายจากตารางเวรและแอปคนขับอัตโนมัติ แต่<b>ประวัติน้ำมัน ซ่อมบำรุง เอกสาร ยังอยู่ครบ</b>
            </p>
          </div>

          <div className="col-span-2 md:col-span-3"><span className={lbl}>หมายเหตุ</span>
            <input className={inp} value={f.note ?? ""} onChange={(e) => set("note", e.target.value)} /></div>
        </div>
        {f.purchase_price && f.purchase_date ? (
          <p className="text-xs text-slate-500 mt-3">
            มูลค่าตามบัญชีปัจจุบัน ≈ <b>{fmtBaht(bookValue(f as Vehicle))}</b> (ซื้อ {fmtDate(f.purchase_date)})
          </p>
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
