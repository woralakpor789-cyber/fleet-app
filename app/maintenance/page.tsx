"use client";

// เฟส 3 — ซ่อมบำรุง: รอบบำรุงรักษา (กม./ชม./เดือน) + ประวัติซ่อม + ยาง + อัปเดตเลขไมล์
import { useEffect, useMemo, useState } from "react";
import FleetShell from "@/components/FleetShell";
import { CircleDot, Gauge, Pencil, Plus, Trash2, Wrench, CheckCircle2 } from "lucide-react";
import {
  MAINT_TASKS, TIRE_POSITIONS, fmtBaht, fmtDate, planDue, tireDue,
  type DueInfo, type MaintLog, type MaintPlan, type Tire, type Vehicle,
} from "@/lib/types";
import {
  listMaintLogs, listPlans, listTires, listVehicles, saveMaintLog,
  softDeleteMaintLog, softDeletePlan, softDeleteTire, updateMeter, upsertPlan, upsertTire,
} from "@/lib/fleetApi";

const DUE_BADGE: Record<string, string> = {
  due: "bg-red-100 text-red-700 border-red-200",
  near: "bg-amber-50 text-amber-700 border-amber-200",
  ok: "bg-emerald-50 text-emerald-700 border-emerald-200",
  no_baseline: "bg-slate-100 text-slate-500 border-slate-200",
};

function dueText(d: DueInfo): string {
  if (d.level === "no_baseline") return "ยังไม่มีข้อมูลตั้งต้น";
  const parts: string[] = [];
  if (d.kmLeft != null) parts.push(d.kmLeft <= 0 ? `เกินรอบ ${Math.abs(d.kmLeft).toLocaleString()} กม.` : `อีก ${d.kmLeft.toLocaleString()} กม.`);
  if (d.daysLeft != null) parts.push(d.daysLeft <= 0 ? `เกินกำหนด ${-d.daysLeft} วัน` : `อีก ${d.daysLeft} วัน`);
  return parts.join(" · ") || "—";
}

export default function MaintenancePage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [plans, setPlans] = useState<MaintPlan[]>([]);
  const [logs, setLogs] = useState<MaintLog[]>([]);
  const [tires, setTires] = useState<Tire[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<"plans" | "logs" | "tires">("plans");
  const [fVehicle, setFVehicle] = useState("");
  const [editPlan, setEditPlan] = useState<Partial<MaintPlan> | null>(null);
  const [editLog, setEditLog] = useState<Partial<MaintLog> | null>(null);
  const [editTire, setEditTire] = useState<Partial<Tire> | null>(null);
  const [meterFor, setMeterFor] = useState<Vehicle | null>(null);

  const reload = async () => {
    try {
      const [v, p, l, t] = await Promise.all([listVehicles(), listPlans(), listMaintLogs(), listTires()]);
      setVehicles(v); setPlans(p); setLogs(l); setTires(t); setErr("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { reload(); }, []);

  const vById = useMemo(() => new Map(vehicles.map((v) => [v.id, v])), [vehicles]);
  const nameOf = (id: string) => {
    const v = vById.get(id);
    return v ? v.plate + (v.nickname ? ` (${v.nickname})` : "") : "?";
  };

  const planRows = useMemo(
    () => plans
      .filter((p) => !fVehicle || p.vehicle_id === fVehicle)
      .map((p) => ({ ...p, due: planDue(p, vById.get(p.vehicle_id)) }))
      .sort((a, b) => {
        const rank = { due: 0, near: 1, no_baseline: 2, ok: 3 };
        return rank[a.due.level] - rank[b.due.level];
      }),
    [plans, vById, fVehicle]
  );
  const tireRows = useMemo(
    () => tires
      .filter((t) => !fVehicle || t.vehicle_id === fVehicle)
      .map((t) => ({ ...t, due: tireDue(t, vById.get(t.vehicle_id)) })),
    [tires, vById, fVehicle]
  );
  const filteredLogs = useMemo(
    () => logs.filter((l) => !fVehicle || l.vehicle_id === fVehicle),
    [logs, fVehicle]
  );

  const nDue = planRows.filter((p) => p.due.level === "due").length +
    tireRows.filter((t) => t.due.level === "due").length;
  const nNear = planRows.filter((p) => p.due.level === "near").length +
    tireRows.filter((t) => t.due.level === "near").length;

  return (
    <FleetShell>
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <Wrench className="w-5 h-5 text-teal-600" /> ซ่อมบำรุง
        </h1>
        <div className="flex gap-2">
          {tab === "plans" && (
            <button onClick={() => setEditPlan({})}
              className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-4 py-2 rounded-xl">
              <Plus className="w-4 h-4" /> เพิ่มรอบบำรุงรักษา
            </button>
          )}
          {tab === "logs" && (
            <button onClick={() => setEditLog({})}
              className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-4 py-2 rounded-xl">
              <Plus className="w-4 h-4" /> บันทึกงานซ่อม
            </button>
          )}
          {tab === "tires" && (
            <button onClick={() => setEditTire({})}
              className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-4 py-2 rounded-xl">
              <Plus className="w-4 h-4" /> เพิ่มยาง
            </button>
          )}
        </div>
      </div>

      {/* สรุป */}
      <div className="grid grid-cols-2 gap-3 mb-4 max-w-md">
        <div className="rounded-2xl border border-red-200 bg-red-50 text-red-700 p-3">
          <div className="text-xs">ถึงรอบแล้ว</div>
          <div className="text-2xl font-bold mt-1">{nDue}</div>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 text-amber-700 p-3">
          <div className="text-xs">ใกล้ถึงรอบ</div>
          <div className="text-2xl font-bold mt-1">{nNear}</div>
        </div>
      </div>

      {/* แท็บ + กรองรถ */}
      <div className="flex gap-2 mb-4 flex-wrap items-center">
        {([["plans", "รอบบำรุงรักษา"], ["logs", `ประวัติซ่อม (${logs.length})`], ["tires", "ยาง"]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-1.5 rounded-full text-sm ${
              tab === k ? "bg-teal-600 text-white font-medium" : "bg-white border border-slate-200 text-slate-600"
            }`}>{label}</button>
        ))}
        <select value={fVehicle} onChange={(e) => setFVehicle(e.target.value)}
          className="ml-auto rounded-xl border border-slate-200 bg-white text-sm px-3 py-2">
          <option value="">ทุกคัน</option>
          {vehicles.map((v) => <option key={v.id} value={v.id}>{v.plate}{v.nickname ? ` (${v.nickname})` : ""}</option>)}
        </select>
      </div>

      {err && <p className="text-red-600 text-sm mb-3">{err}</p>}
      {loading ? (
        <p className="text-slate-400">กำลังโหลด…</p>
      ) : tab === "plans" ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="w-full text-sm min-w-[780px]">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-100">
                <th className="px-4 py-3">รถ</th>
                <th className="px-2 py-3">รายการ</th>
                <th className="px-2 py-3">รอบ</th>
                <th className="px-2 py-3">ทำล่าสุด</th>
                <th className="px-2 py-3">สถานะ</th>
                <th className="px-2 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {planRows.map((p) => (
                <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-slate-800">{nameOf(p.vehicle_id)}</div>
                    <MeterInline v={vById.get(p.vehicle_id)} onEdit={setMeterFor} />
                  </td>
                  <td className="px-2 py-2.5">{p.task}</td>
                  <td className="px-2 py-2.5 text-slate-500 text-xs">
                    {[
                      p.interval_km ? `ทุก ${p.interval_km.toLocaleString()} กม.` : null,
                      p.interval_months ? `ทุก ${p.interval_months} เดือน` : null,
                    ].filter(Boolean).join(" หรือ ") || "—"}
                  </td>
                  <td className="px-2 py-2.5 text-xs text-slate-500">
                    {p.last_date ? fmtDate(p.last_date) : "—"}
                    {p.last_odometer != null ? ` · ${p.last_odometer.toLocaleString()} กม.` : ""}
                  </td>
                  <td className="px-2 py-2.5">
                    <span className={`px-2 py-0.5 rounded-full text-xs border ${DUE_BADGE[p.due.level]}`}>
                      {dueText(p.due)}
                    </span>
                  </td>
                  <td className="px-2 py-2.5 whitespace-nowrap">
                    <button title="บันทึกว่าทำแล้ว"
                      onClick={() => setEditLog({
                        vehicle_id: p.vehicle_id, plan_id: p.id, items: p.task,
                        work_date: new Date().toISOString().slice(0, 10),
                      })}
                      className="p-1.5 text-slate-400 hover:text-emerald-600">
                      <CheckCircle2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => setEditPlan(p)} className="p-1.5 text-slate-400 hover:text-teal-600">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={async () => {
                        if (confirm(`ลบรอบ "${p.task}" ของ ${nameOf(p.vehicle_id)}?`)) { await softDeletePlan(p.id); reload(); }
                      }}
                      className="p-1.5 text-slate-400 hover:text-red-600">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {!planRows.length && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  ยังไม่มีรอบบำรุงรักษา — กด "เพิ่มรอบบำรุงรักษา" เช่น เปลี่ยนถ่ายน้ำมันเครื่องทุก 10,000 กม. หรือ 6 เดือน
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      ) : tab === "logs" ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-100">
                <th className="px-4 py-3">วันที่</th>
                <th className="px-2 py-3">รถ</th>
                <th className="px-2 py-3">รายการ</th>
                <th className="px-2 py-3">อู่/ศูนย์</th>
                <th className="px-2 py-3 text-right">ค่าแรง</th>
                <th className="px-2 py-3 text-right">ค่าอะไหล่</th>
                <th className="px-2 py-3 text-right">รวม</th>
                <th className="px-2 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map((l) => (
                <tr key={l.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                  <td className="px-4 py-2.5">{fmtDate(l.work_date)}</td>
                  <td className="px-2 py-2.5 font-medium text-slate-800">{nameOf(l.vehicle_id)}</td>
                  <td className="px-2 py-2.5 max-w-52 truncate">{l.items}</td>
                  <td className="px-2 py-2.5 text-slate-500">{l.shop ?? "—"}</td>
                  <td className="px-2 py-2.5 text-right">{fmtBaht(l.labor_cost)}</td>
                  <td className="px-2 py-2.5 text-right">{fmtBaht(l.parts_cost)}</td>
                  <td className="px-2 py-2.5 text-right font-medium">
                    {fmtBaht((l.labor_cost ?? 0) + (l.parts_cost ?? 0) || null)}
                  </td>
                  <td className="px-2 py-2.5 whitespace-nowrap">
                    <button onClick={() => setEditLog(l)} className="p-1.5 text-slate-400 hover:text-teal-600">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={async () => {
                        if (confirm("ลบบันทึกซ่อมนี้?")) { await softDeleteMaintLog(l.id); reload(); }
                      }}
                      className="p-1.5 text-slate-400 hover:text-red-600">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {!filteredLogs.length && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">ยังไม่มีประวัติซ่อม</td></tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-100">
                <th className="px-4 py-3">รถ</th>
                <th className="px-2 py-3">ตำแหน่ง</th>
                <th className="px-2 py-3">ยี่ห้อ/รุ่น</th>
                <th className="px-2 py-3">เปลี่ยนเมื่อ</th>
                <th className="px-2 py-3 text-right">ราคา</th>
                <th className="px-2 py-3">สถานะ</th>
                <th className="px-2 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {tireRows.map((t) => (
                <tr key={t.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                  <td className="px-4 py-2.5 font-medium text-slate-800">{nameOf(t.vehicle_id)}</td>
                  <td className="px-2 py-2.5">
                    <span className="inline-flex items-center gap-1"><CircleDot className="w-3.5 h-3.5 text-slate-400" />{t.position}</span>
                  </td>
                  <td className="px-2 py-2.5">{[t.brand, t.model].filter(Boolean).join(" ") || "—"}</td>
                  <td className="px-2 py-2.5 text-xs text-slate-500">
                    {fmtDate(t.change_date)}
                    {t.change_odometer != null ? ` · ${t.change_odometer.toLocaleString()} กม.` : ""}
                  </td>
                  <td className="px-2 py-2.5 text-right">{fmtBaht(t.price)}</td>
                  <td className="px-2 py-2.5">
                    <span className={`px-2 py-0.5 rounded-full text-xs border ${DUE_BADGE[t.due.level]}`}>
                      {dueText(t.due)}
                    </span>
                  </td>
                  <td className="px-2 py-2.5 whitespace-nowrap">
                    <button onClick={() => setEditTire(t)} className="p-1.5 text-slate-400 hover:text-teal-600">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={async () => {
                        if (confirm(`ลบยาง ${t.position} ของ ${nameOf(t.vehicle_id)}?`)) { await softDeleteTire(t.id); reload(); }
                      }}
                      className="p-1.5 text-slate-400 hover:text-red-600">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {!tireRows.length && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  ยังไม่มีข้อมูลยาง — บันทึกยางรายตำแหน่งพร้อมอายุ (กม./ปี) เพื่อให้ระบบเตือนเปลี่ยน
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {editPlan && (
        <PlanModal init={editPlan} vehicles={vehicles}
          onClose={() => setEditPlan(null)} onSaved={() => { setEditPlan(null); reload(); }} />
      )}
      {editLog && (
        <LogModal init={editLog} vehicles={vehicles} plans={plans}
          onClose={() => setEditLog(null)} onSaved={() => { setEditLog(null); reload(); }} />
      )}
      {editTire && (
        <TireModal init={editTire} vehicles={vehicles}
          onClose={() => setEditTire(null)} onSaved={() => { setEditTire(null); reload(); }} />
      )}
      {meterFor && (
        <MeterModal v={meterFor} onClose={() => setMeterFor(null)}
          onSaved={() => { setMeterFor(null); reload(); }} />
      )}
    </FleetShell>
  );
}

// เลขไมล์ปัจจุบัน + ปุ่มแก้ด่วน
function MeterInline({ v, onEdit }: { v: Vehicle | undefined; onEdit: (v: Vehicle) => void }) {
  if (!v) return null;
  return (
    <button onClick={() => onEdit(v)}
      className="text-xs text-slate-400 hover:text-teal-600 inline-flex items-center gap-1">
      <Gauge className="w-3 h-3" />
      {v.odometer != null ? `${v.odometer.toLocaleString()} กม.` : "ใส่เลขไมล์"}
    </button>
  );
}

const inp = "w-full rounded-xl border border-slate-200 px-3 py-2 text-sm";
const lbl = "text-xs text-slate-500 mb-1 block";

function ModalFrame({ title, children, onClose, onSave, saving, err }: {
  title: string; children: React.ReactNode; onClose: () => void; onSave: () => void;
  saving: boolean; err: string;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-end md:items-center justify-center p-0 md:p-6">
      <div className="bg-white w-full md:max-w-lg rounded-t-2xl md:rounded-2xl shadow-xl max-h-[92vh] overflow-y-auto p-5">
        <h2 className="font-bold text-slate-800 mb-4">{title}</h2>
        {children}
        {err && <p className="text-red-600 text-sm mt-3">{err}</p>}
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-slate-600 hover:bg-slate-100">ยกเลิก</button>
          <button onClick={onSave} disabled={saving}
            className="px-5 py-2 rounded-xl text-sm font-medium bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-50">
            {saving ? "กำลังบันทึก…" : "บันทึก"}
          </button>
        </div>
      </div>
    </div>
  );
}

function VehicleSelect({ value, onChange, vehicles }: {
  value: string | undefined; onChange: (id: string) => void; vehicles: Vehicle[];
}) {
  return (
    <select className={inp} value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
      <option value="">— เลือกรถ —</option>
      {vehicles.map((v) => (
        <option key={v.id} value={v.id}>{v.plate}{v.nickname ? ` (${v.nickname})` : ""}</option>
      ))}
    </select>
  );
}

// ---------- ฟอร์มรอบบำรุงรักษา ----------
function PlanModal({ init, vehicles, onClose, onSaved }: {
  init: Partial<MaintPlan>; vehicles: Vehicle[]; onClose: () => void; onSaved: () => void;
}) {
  const [f, setF] = useState<Partial<MaintPlan>>({ task: MAINT_TASKS[0], ...init });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const set = (k: keyof MaintPlan, val: unknown) => setF((p) => ({ ...p, [k]: val }));

  const save = async () => {
    if (!f.vehicle_id) { setErr("เลือกรถ"); return; }
    if (!f.task?.trim()) { setErr("กรอกรายการ"); return; }
    if (!f.interval_km && !f.interval_months) { setErr("กำหนดรอบอย่างน้อย 1 แบบ (กม./เดือน)"); return; }
    setSaving(true);
    try {
      await upsertPlan({
        id: f.id, vehicle_id: f.vehicle_id, task: f.task.trim(),
        interval_km: f.interval_km || null,
        interval_months: f.interval_months || null,
        last_date: f.last_date || null, last_odometer: f.last_odometer || null,
        note: f.note || null,
      });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
      setSaving(false);
    }
  };

  return (
    <ModalFrame title={f.id ? "แก้ไขรอบบำรุงรักษา" : "เพิ่มรอบบำรุงรักษา"}
      onClose={onClose} onSave={save} saving={saving} err={err}>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2"><span className={lbl}>รถ *</span>
          <VehicleSelect value={f.vehicle_id} onChange={(id) => set("vehicle_id", id)} vehicles={vehicles} /></div>
        <div className="col-span-2"><span className={lbl}>รายการ *</span>
          <input className={inp} list="maint-tasks" value={f.task ?? ""} onChange={(e) => set("task", e.target.value)} />
          <datalist id="maint-tasks">{MAINT_TASKS.map((t) => <option key={t} value={t} />)}</datalist></div>
        <div><span className={lbl}>รอบตามระยะ (กม.)</span>
          <input type="number" className={inp} placeholder="เช่น 10000" value={f.interval_km ?? ""}
            onChange={(e) => set("interval_km", e.target.value ? +e.target.value : null)} /></div>
        <div><span className={lbl}>รอบตามเวลา (เดือน)</span>
          <input type="number" className={inp} placeholder="เช่น 6" value={f.interval_months ?? ""}
            onChange={(e) => set("interval_months", e.target.value ? +e.target.value : null)} /></div>
        <div><span className={lbl}>ทำล่าสุดวันที่</span>
          <input type="date" className={inp} value={f.last_date ?? ""} onChange={(e) => set("last_date", e.target.value || null)} /></div>
        <div><span className={lbl}>เลขไมล์ตอนทำล่าสุด (กม.)</span>
          <input type="number" className={inp} value={f.last_odometer ?? ""}
            onChange={(e) => set("last_odometer", e.target.value ? +e.target.value : null)} /></div>
        <div className="col-span-2"><span className={lbl}>หมายเหตุ</span>
          <input className={inp} value={f.note ?? ""} onChange={(e) => set("note", e.target.value)} /></div>
      </div>
      <p className="text-xs text-slate-400 mt-2">ระบบเตือนเมื่อถึงรอบ กม. หรือเวลา — แล้วแต่อะไรถึงก่อน</p>
    </ModalFrame>
  );
}

// ---------- ฟอร์มบันทึกงานซ่อม ----------
function LogModal({ init, vehicles, plans, onClose, onSaved }: {
  init: Partial<MaintLog>; vehicles: Vehicle[]; plans: MaintPlan[];
  onClose: () => void; onSaved: () => void;
}) {
  const [f, setF] = useState<Partial<MaintLog>>({
    work_date: new Date().toISOString().slice(0, 10), ...init,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const set = (k: keyof MaintLog, val: unknown) => setF((p) => ({ ...p, [k]: val }));
  const vehicle = vehicles.find((v) => v.id === f.vehicle_id);
  const vehiclePlans = plans.filter((p) => p.vehicle_id === f.vehicle_id);

  const save = async () => {
    if (!f.vehicle_id) { setErr("เลือกรถ"); return; }
    if (!f.work_date) { setErr("กรอกวันที่"); return; }
    if (!f.items?.trim()) { setErr("กรอกรายการที่ทำ"); return; }
    setSaving(true);
    try {
      await saveMaintLog({
        id: f.id, vehicle_id: f.vehicle_id, plan_id: f.plan_id || null,
        work_date: f.work_date, odometer: f.odometer || null,
        items: f.items.trim(), shop: f.shop || null,
        labor_cost: f.labor_cost || null, parts_cost: f.parts_cost || null, note: f.note || null,
      }, { vehicle });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
      setSaving(false);
    }
  };

  return (
    <ModalFrame title={f.id ? "แก้ไขบันทึกซ่อม" : "บันทึกงานซ่อม"}
      onClose={onClose} onSave={save} saving={saving} err={err}>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2"><span className={lbl}>รถ *</span>
          <VehicleSelect value={f.vehicle_id} onChange={(id) => set("vehicle_id", id)} vehicles={vehicles} /></div>
        {vehiclePlans.length > 0 && (
          <div className="col-span-2"><span className={lbl}>ผูกกับรอบบำรุงรักษา (ถ้าเป็นงานตามรอบ — ระบบจะรีเซ็ตรอบให้)</span>
            <select className={inp} value={f.plan_id ?? ""} onChange={(e) => set("plan_id", e.target.value || null)}>
              <option value="">— ไม่ผูก (ซ่อมทั่วไป) —</option>
              {vehiclePlans.map((p) => <option key={p.id} value={p.id}>{p.task}</option>)}
            </select></div>
        )}
        <div><span className={lbl}>วันที่ทำ *</span>
          <input type="date" className={inp} value={f.work_date ?? ""} onChange={(e) => set("work_date", e.target.value)} /></div>
        <div><span className={lbl}>เลขไมล์ (กม.)</span>
          <input type="number" className={inp} value={f.odometer ?? ""}
            onChange={(e) => set("odometer", e.target.value ? +e.target.value : null)} /></div>
        <div className="col-span-2"><span className={lbl}>รายการที่ทำ *</span>
          <input className={inp} value={f.items ?? ""} onChange={(e) => set("items", e.target.value)} /></div>
        <div><span className={lbl}>อู่/ศูนย์</span>
          <input className={inp} value={f.shop ?? ""} onChange={(e) => set("shop", e.target.value)} /></div>
        <div><span className={lbl}>ค่าแรง (บาท)</span>
          <input type="number" className={inp} value={f.labor_cost ?? ""}
            onChange={(e) => set("labor_cost", e.target.value ? +e.target.value : null)} /></div>
        <div><span className={lbl}>ค่าอะไหล่ (บาท)</span>
          <input type="number" className={inp} value={f.parts_cost ?? ""}
            onChange={(e) => set("parts_cost", e.target.value ? +e.target.value : null)} /></div>
        <div><span className={lbl}>หมายเหตุ</span>
          <input className={inp} value={f.note ?? ""} onChange={(e) => set("note", e.target.value)} /></div>
      </div>
    </ModalFrame>
  );
}

// ---------- ฟอร์มยาง ----------
function TireModal({ init, vehicles, onClose, onSaved }: {
  init: Partial<Tire>; vehicles: Vehicle[]; onClose: () => void; onSaved: () => void;
}) {
  const [f, setF] = useState<Partial<Tire>>({ position: TIRE_POSITIONS[0], ...init });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const set = (k: keyof Tire, val: unknown) => setF((p) => ({ ...p, [k]: val }));

  const save = async () => {
    if (!f.vehicle_id) { setErr("เลือกรถ"); return; }
    if (!f.position?.trim()) { setErr("ระบุตำแหน่งล้อ"); return; }
    setSaving(true);
    try {
      await upsertTire({
        id: f.id, vehicle_id: f.vehicle_id, position: f.position.trim(),
        brand: f.brand || null, model: f.model || null,
        change_date: f.change_date || null, change_odometer: f.change_odometer || null,
        price: f.price || null, lifespan_km: f.lifespan_km || null,
        lifespan_years: f.lifespan_years || null, note: f.note || null,
      });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
      setSaving(false);
    }
  };

  return (
    <ModalFrame title={f.id ? "แก้ไขข้อมูลยาง" : "เพิ่มยาง"}
      onClose={onClose} onSave={save} saving={saving} err={err}>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2"><span className={lbl}>รถ *</span>
          <VehicleSelect value={f.vehicle_id} onChange={(id) => set("vehicle_id", id)} vehicles={vehicles} /></div>
        <div><span className={lbl}>ตำแหน่งล้อ *</span>
          <input className={inp} list="tire-pos" value={f.position ?? ""} onChange={(e) => set("position", e.target.value)} />
          <datalist id="tire-pos">{TIRE_POSITIONS.map((t) => <option key={t} value={t} />)}</datalist></div>
        <div><span className={lbl}>ยี่ห้อ</span>
          <input className={inp} value={f.brand ?? ""} onChange={(e) => set("brand", e.target.value)} /></div>
        <div><span className={lbl}>รุ่น/เบอร์ยาง</span>
          <input className={inp} value={f.model ?? ""} onChange={(e) => set("model", e.target.value)} /></div>
        <div><span className={lbl}>วันที่เปลี่ยน</span>
          <input type="date" className={inp} value={f.change_date ?? ""} onChange={(e) => set("change_date", e.target.value || null)} /></div>
        <div><span className={lbl}>เลขไมล์ตอนเปลี่ยน (กม.)</span>
          <input type="number" className={inp} value={f.change_odometer ?? ""}
            onChange={(e) => set("change_odometer", e.target.value ? +e.target.value : null)} /></div>
        <div><span className={lbl}>ราคา (บาท)</span>
          <input type="number" className={inp} value={f.price ?? ""}
            onChange={(e) => set("price", e.target.value ? +e.target.value : null)} /></div>
        <div><span className={lbl}>อายุยางตามระยะ (กม.)</span>
          <input type="number" className={inp} placeholder="เช่น 50000" value={f.lifespan_km ?? ""}
            onChange={(e) => set("lifespan_km", e.target.value ? +e.target.value : null)} /></div>
        <div><span className={lbl}>อายุยางตามเวลา (ปี)</span>
          <input type="number" step="0.5" className={inp} placeholder="เช่น 4" value={f.lifespan_years ?? ""}
            onChange={(e) => set("lifespan_years", e.target.value ? +e.target.value : null)} /></div>
        <div className="col-span-2"><span className={lbl}>หมายเหตุ</span>
          <input className={inp} value={f.note ?? ""} onChange={(e) => set("note", e.target.value)} /></div>
      </div>
    </ModalFrame>
  );
}

// ---------- ฟอร์มอัปเดตเลขไมล์ด่วน ----------
function MeterModal({ v, onClose, onSaved }: { v: Vehicle; onClose: () => void; onSaved: () => void }) {
  const [val, setVal] = useState<string>(String(v.odometer ?? ""));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const save = async () => {
    const n = +val;
    if (!val || isNaN(n) || n < 0) { setErr("กรอกตัวเลขให้ถูกต้อง"); return; }
    setSaving(true);
    try {
      await updateMeter(v.id, n);
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
      setSaving(false);
    }
  };

  return (
    <ModalFrame title={`อัปเดตเลขไมล์ — ${v.plate}`}
      onClose={onClose} onSave={save} saving={saving} err={err}>
      <span className={lbl}>เลขไมล์ปัจจุบัน (กม.)</span>
      <input type="number" autoFocus className={inp} value={val} onChange={(e) => setVal(e.target.value)} />
    </ModalFrame>
  );
}
