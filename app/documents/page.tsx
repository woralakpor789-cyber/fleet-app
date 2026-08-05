"use client";

// เฟส 2 — เอกสาร ภาษี ประกัน + เคลม: แจ้งเตือนหมดอายุ 60/30/7 วัน + ประวัติ + การเคลม
import { useEffect, useMemo, useState } from "react";
import FleetShell from "@/components/FleetShell";
import { AlertTriangle, FileText, Paperclip, Pencil, Plus, ShieldAlert, Trash2, Upload } from "lucide-react";
import DocImport from "@/components/DocImport";
import {
  CLAIM_STATUSES, DOC_TYPES, daysToExpiry, expiryLevel, fmtBaht, fmtDate,
  type Claim, type Vehicle, type VehicleDoc,
} from "@/lib/types";
import {
  listClaims, listDocs, listVehicles, signedDocUrl, softDeleteClaim, softDeleteDoc,
  upsertClaim, upsertDoc,
} from "@/lib/fleetApi";

const LEVEL_STYLE: Record<string, { badge: string; label: (d: number) => string }> = {
  expired: { badge: "bg-red-100 text-red-700 border-red-200",       label: (d) => `หมดอายุแล้ว ${-d} วัน` },
  d7:      { badge: "bg-red-50 text-red-600 border-red-200",        label: (d) => `เหลือ ${d} วัน` },
  d30:     { badge: "bg-orange-50 text-orange-600 border-orange-200", label: (d) => `เหลือ ${d} วัน` },
  d60:     { badge: "bg-amber-50 text-amber-700 border-amber-200",  label: (d) => `เหลือ ${d} วัน` },
  ok:      { badge: "bg-emerald-50 text-emerald-700 border-emerald-200", label: (d) => `เหลือ ${d} วัน` },
};

export default function DocumentsPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [docs, setDocs] = useState<VehicleDoc[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<"docs" | "claims">("docs");
  const [fVehicle, setFVehicle] = useState("");
  const [fType, setFType] = useState("");
  const [editDoc, setEditDoc] = useState<Partial<VehicleDoc> | null>(null);
  const [editClaim, setEditClaim] = useState<Partial<Claim> | null>(null);
  const [importing, setImporting] = useState(false);

  const reload = async () => {
    try {
      const [v, d, c] = await Promise.all([listVehicles(), listDocs(), listClaims()]);
      setVehicles(v); setDocs(d); setClaims(c); setErr("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { reload(); }, []);

  const plateOf = useMemo(() => {
    const m = new Map(vehicles.map((v) => [v.id, v.plate + (v.nickname ? ` (${v.nickname})` : "")]));
    return (id: string) => m.get(id) ?? "?";
  }, [vehicles]);

  const filteredDocs = useMemo(
    () => docs.filter((d) =>
      (!fVehicle || d.vehicle_id === fVehicle) && (!fType || d.doc_type === fType)),
    [docs, fVehicle, fType]
  );

  // สรุปจำนวนตามระดับเตือน (จากเอกสารทั้งหมด ไม่ใช่ตามฟิลเตอร์)
  const counts = useMemo(() => {
    const c = { expired: 0, d7: 0, d30: 0, d60: 0 };
    for (const d of docs) {
      const lv = expiryLevel(daysToExpiry(d.expiry_date));
      if (lv !== "ok") c[lv]++;
    }
    return c;
  }, [docs]);

  return (
    <FleetShell>
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <FileText className="w-5 h-5 text-teal-600" /> เอกสาร ภาษี ประกัน
        </h1>
        <div className="flex gap-2">
          {tab === "docs" ? (
            <>
              <button onClick={() => setImporting(true)}
                className="flex items-center gap-1.5 bg-white border border-teal-600 text-teal-700 hover:bg-teal-50 text-sm font-medium px-4 py-2 rounded-xl">
                <Upload className="w-4 h-4" /> นำเข้าจากไฟล์
              </button>
              <button onClick={() => setEditDoc({})}
                className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-4 py-2 rounded-xl">
                <Plus className="w-4 h-4" /> เพิ่มเอกสาร
              </button>
            </>
          ) : (
            <button onClick={() => setEditClaim({})}
              className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-4 py-2 rounded-xl">
              <Plus className="w-4 h-4" /> แจ้งเคลมใหม่
            </button>
          )}
        </div>
      </div>

      {/* การ์ดสรุปแจ้งเตือน */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {([
          ["หมดอายุแล้ว", counts.expired, "text-red-700 bg-red-50 border-red-200"],
          ["ภายใน 7 วัน", counts.d7, "text-red-600 bg-red-50 border-red-100"],
          ["ภายใน 30 วัน", counts.d30, "text-orange-600 bg-orange-50 border-orange-100"],
          ["ภายใน 60 วัน", counts.d60, "text-amber-700 bg-amber-50 border-amber-100"],
        ] as const).map(([label, n, cls]) => (
          <div key={label} className={`rounded-2xl border p-3 ${cls}`}>
            <div className="flex items-center gap-1.5 text-xs"><AlertTriangle className="w-3.5 h-3.5" />{label}</div>
            <div className="text-2xl font-bold mt-1">{n}</div>
          </div>
        ))}
      </div>

      {/* แท็บ */}
      <div className="flex gap-1 mb-4">
        {([["docs", "เอกสาร"], ["claims", `เคลมประกัน (${claims.length})`]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-1.5 rounded-full text-sm ${
              tab === k ? "bg-teal-600 text-white font-medium" : "bg-white border border-slate-200 text-slate-600"
            }`}>{label}</button>
        ))}
      </div>

      {err && <p className="text-red-600 text-sm mb-3">{err}</p>}
      {loading ? (
        <p className="text-slate-400">กำลังโหลด…</p>
      ) : tab === "docs" ? (
        <>
          <div className="flex gap-2 mb-3 flex-wrap">
            <select value={fVehicle} onChange={(e) => setFVehicle(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white text-sm px-3 py-2">
              <option value="">ทุกคัน</option>
              {vehicles.map((v) => <option key={v.id} value={v.id}>{v.plate}{v.nickname ? ` (${v.nickname})` : ""}</option>)}
            </select>
            <select value={fType} onChange={(e) => setFType(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white text-sm px-3 py-2">
              <option value="">ทุกประเภทเอกสาร</option>
              {DOC_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-100">
                  <th className="px-4 py-3">รถ</th>
                  <th className="px-2 py-3">เอกสาร</th>
                  <th className="px-2 py-3">บริษัท/เลขที่</th>
                  <th className="px-2 py-3">วันหมดอายุ</th>
                  <th className="px-2 py-3">สถานะ</th>
                  <th className="px-2 py-3 text-right">ค่าใช้จ่าย</th>
                  <th className="px-2 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filteredDocs.map((d) => {
                  const days = daysToExpiry(d.expiry_date);
                  const lv = LEVEL_STYLE[expiryLevel(days)];
                  return (
                    <tr key={d.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                      <td className="px-4 py-2.5 font-medium text-slate-800">{plateOf(d.vehicle_id)}</td>
                      <td className="px-2 py-2.5">
                        {d.doc_type}{d.insurance_class ? ` ชั้น ${d.insurance_class}` : ""}
                      </td>
                      <td className="px-2 py-2.5 text-slate-500">
                        {[d.provider, d.policy_no].filter(Boolean).join(" · ") || "—"}
                      </td>
                      <td className="px-2 py-2.5">{fmtDate(d.expiry_date)}</td>
                      <td className="px-2 py-2.5">
                        <span className={`px-2 py-0.5 rounded-full text-xs border ${lv.badge}`}>{lv.label(days)}</span>
                      </td>
                      <td className="px-2 py-2.5 text-right">{fmtBaht(d.cost)}</td>
                      <td className="px-2 py-2.5 whitespace-nowrap">
                        {d.file_path && (
                          <button title="เปิดไฟล์แนบ"
                            onClick={async () => {
                              const url = await signedDocUrl(d.file_path!);
                              if (url) window.open(url, "_blank", "noopener");
                              else alert("เปิดไฟล์ไม่สำเร็จ");
                            }}
                            className="p-1.5 text-slate-400 hover:text-sky-600">
                            <Paperclip className="w-4 h-4" />
                          </button>
                        )}
                        <button onClick={() => setEditDoc(d)} className="p-1.5 text-slate-400 hover:text-teal-600">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={async () => {
                            if (confirm("ลบเอกสารนี้?")) { await softDeleteDoc(d.id); reload(); }
                          }}
                          className="p-1.5 text-slate-400 hover:text-red-600">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {!filteredDocs.length && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                    ยังไม่มีเอกสาร — กด "เพิ่มเอกสาร" เพื่อบันทึก พ.ร.บ./ประกัน/ภาษี ของรถแต่ละคัน
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-100">
                <th className="px-4 py-3">วันที่เกิดเหตุ</th>
                <th className="px-2 py-3">รถ</th>
                <th className="px-2 py-3">รายละเอียด</th>
                <th className="px-2 py-3">เลขเคลม</th>
                <th className="px-2 py-3">สถานะ</th>
                <th className="px-2 py-3 text-right">จ่ายเอง</th>
                <th className="px-2 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {claims.map((c) => (
                <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                  <td className="px-4 py-2.5">{fmtDate(c.incident_date)}</td>
                  <td className="px-2 py-2.5 font-medium text-slate-800">{plateOf(c.vehicle_id)}</td>
                  <td className="px-2 py-2.5 text-slate-600 max-w-56 truncate">{c.description ?? "—"}</td>
                  <td className="px-2 py-2.5">{c.claim_no ?? "—"}</td>
                  <td className="px-2 py-2.5">
                    <span className={`px-2 py-0.5 rounded-full text-xs ${
                      c.status === "จบเคลม" ? "bg-emerald-50 text-emerald-700" :
                      c.status === "กำลังซ่อม" ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700"
                    }`}>{c.status}</span>
                  </td>
                  <td className="px-2 py-2.5 text-right">{fmtBaht(c.excess_cost)}</td>
                  <td className="px-2 py-2.5 whitespace-nowrap">
                    <button onClick={() => setEditClaim(c)} className="p-1.5 text-slate-400 hover:text-teal-600">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={async () => {
                        if (confirm("ลบรายการเคลมนี้?")) { await softDeleteClaim(c.id); reload(); }
                      }}
                      className="p-1.5 text-slate-400 hover:text-red-600">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {!claims.length && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  <ShieldAlert className="w-6 h-6 mx-auto mb-2 text-slate-300" />
                  ยังไม่มีการเคลม
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {editDoc && (
        <DocModal init={editDoc} vehicles={vehicles}
          onClose={() => setEditDoc(null)}
          onSaved={() => { setEditDoc(null); reload(); }} />
      )}
      {editClaim && (
        <ClaimModal init={editClaim} vehicles={vehicles}
          onClose={() => setEditClaim(null)}
          onSaved={() => { setEditClaim(null); reload(); }} />
      )}
      {importing && (
        <DocImport vehicles={vehicles} existingDocs={docs}
          onClose={() => setImporting(false)} onSaved={reload} />
      )}
    </FleetShell>
  );
}

// ---------- ฟอร์มเอกสาร ----------
function DocModal({
  init, vehicles, onClose, onSaved,
}: {
  init: Partial<VehicleDoc>; vehicles: Vehicle[]; onClose: () => void; onSaved: () => void;
}) {
  const [f, setF] = useState<Partial<VehicleDoc>>({ doc_type: "พ.ร.บ.", ...init });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const set = (k: keyof VehicleDoc, val: unknown) => setF((p) => ({ ...p, [k]: val }));
  const inp = "w-full rounded-xl border border-slate-200 px-3 py-2 text-sm";
  const lbl = "text-xs text-slate-500 mb-1 block";

  const save = async () => {
    if (!f.vehicle_id) { setErr("เลือกรถ"); return; }
    if (!f.expiry_date) { setErr("กรอกวันหมดอายุ"); return; }
    setSaving(true);
    try {
      await upsertDoc({
        id: f.id, vehicle_id: f.vehicle_id, doc_type: f.doc_type ?? "อื่นๆ",
        provider: f.provider || null, policy_no: f.policy_no || null,
        insurance_class: f.insurance_class || null,
        start_date: f.start_date || null, expiry_date: f.expiry_date,
        cost: f.cost || null, note: f.note || null,
      });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-end md:items-center justify-center p-0 md:p-6">
      <div className="bg-white w-full md:max-w-lg rounded-t-2xl md:rounded-2xl shadow-xl max-h-[92vh] overflow-y-auto p-5">
        <h2 className="font-bold text-slate-800 mb-4">{f.id ? "แก้ไขเอกสาร" : "เพิ่มเอกสาร"}</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><span className={lbl}>รถ *</span>
            <select className={inp} value={f.vehicle_id ?? ""} onChange={(e) => set("vehicle_id", e.target.value)}>
              <option value="">— เลือกรถ —</option>
              {vehicles.map((v) => <option key={v.id} value={v.id}>{v.plate}{v.nickname ? ` (${v.nickname})` : ""}</option>)}
            </select></div>
          <div><span className={lbl}>ประเภทเอกสาร</span>
            <select className={inp} value={f.doc_type ?? "พ.ร.บ."} onChange={(e) => set("doc_type", e.target.value)}>
              {DOC_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select></div>
          {f.doc_type === "ประกันภัย" && (
            <div><span className={lbl}>ชั้นประกัน</span>
              <input className={inp} placeholder="เช่น 1, 2+, 3+" value={f.insurance_class ?? ""}
                onChange={(e) => set("insurance_class", e.target.value)} /></div>
          )}
          <div><span className={lbl}>บริษัท/หน่วยงาน</span>
            <input className={inp} value={f.provider ?? ""} onChange={(e) => set("provider", e.target.value)} /></div>
          <div><span className={lbl}>เลขกรมธรรม์/อ้างอิง</span>
            <input className={inp} value={f.policy_no ?? ""} onChange={(e) => set("policy_no", e.target.value)} /></div>
          <div><span className={lbl}>วันเริ่มคุ้มครอง</span>
            <input type="date" className={inp} value={f.start_date ?? ""} onChange={(e) => set("start_date", e.target.value || null)} /></div>
          <div><span className={lbl}>วันหมดอายุ *</span>
            <input type="date" className={inp} value={f.expiry_date ?? ""} onChange={(e) => set("expiry_date", e.target.value)} /></div>
          <div><span className={lbl}>ค่าใช้จ่าย (บาท)</span>
            <input type="number" className={inp} value={f.cost ?? ""} onChange={(e) => set("cost", e.target.value ? +e.target.value : null)} /></div>
          <div className="col-span-2"><span className={lbl}>หมายเหตุ</span>
            <input className={inp} value={f.note ?? ""} onChange={(e) => set("note", e.target.value)} /></div>
        </div>
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

// ---------- ฟอร์มเคลม ----------
function ClaimModal({
  init, vehicles, onClose, onSaved,
}: {
  init: Partial<Claim>; vehicles: Vehicle[]; onClose: () => void; onSaved: () => void;
}) {
  const [f, setF] = useState<Partial<Claim>>({ status: "แจ้งเคลม", ...init });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const set = (k: keyof Claim, val: unknown) => setF((p) => ({ ...p, [k]: val }));
  const inp = "w-full rounded-xl border border-slate-200 px-3 py-2 text-sm";
  const lbl = "text-xs text-slate-500 mb-1 block";

  const save = async () => {
    if (!f.vehicle_id) { setErr("เลือกรถ"); return; }
    if (!f.incident_date) { setErr("กรอกวันที่เกิดเหตุ"); return; }
    setSaving(true);
    try {
      await upsertClaim({
        id: f.id, vehicle_id: f.vehicle_id, incident_date: f.incident_date,
        description: f.description || null, claim_no: f.claim_no || null,
        status: f.status ?? "แจ้งเคลม", damage_cost: f.damage_cost || null,
        excess_cost: f.excess_cost || null, repair_shop: f.repair_shop || null,
        note: f.note || null,
      });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-end md:items-center justify-center p-0 md:p-6">
      <div className="bg-white w-full md:max-w-lg rounded-t-2xl md:rounded-2xl shadow-xl max-h-[92vh] overflow-y-auto p-5">
        <h2 className="font-bold text-slate-800 mb-4">{f.id ? "แก้ไขรายการเคลม" : "แจ้งเคลมใหม่"}</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><span className={lbl}>รถ *</span>
            <select className={inp} value={f.vehicle_id ?? ""} onChange={(e) => set("vehicle_id", e.target.value)}>
              <option value="">— เลือกรถ —</option>
              {vehicles.map((v) => <option key={v.id} value={v.id}>{v.plate}{v.nickname ? ` (${v.nickname})` : ""}</option>)}
            </select></div>
          <div><span className={lbl}>วันที่เกิดเหตุ *</span>
            <input type="date" className={inp} value={f.incident_date ?? ""} onChange={(e) => set("incident_date", e.target.value)} /></div>
          <div><span className={lbl}>สถานะ</span>
            <select className={inp} value={f.status ?? "แจ้งเคลม"} onChange={(e) => set("status", e.target.value)}>
              {CLAIM_STATUSES.map((s) => <option key={s}>{s}</option>)}
            </select></div>
          <div className="col-span-2"><span className={lbl}>รายละเอียดเหตุการณ์</span>
            <input className={inp} value={f.description ?? ""} onChange={(e) => set("description", e.target.value)} /></div>
          <div><span className={lbl}>เลขเคลม</span>
            <input className={inp} value={f.claim_no ?? ""} onChange={(e) => set("claim_no", e.target.value)} /></div>
          <div><span className={lbl}>อู่/ศูนย์ที่ซ่อม</span>
            <input className={inp} value={f.repair_shop ?? ""} onChange={(e) => set("repair_shop", e.target.value)} /></div>
          <div><span className={lbl}>มูลค่าความเสียหาย (บาท)</span>
            <input type="number" className={inp} value={f.damage_cost ?? ""} onChange={(e) => set("damage_cost", e.target.value ? +e.target.value : null)} /></div>
          <div><span className={lbl}>ค่า excess จ่ายเอง (บาท)</span>
            <input type="number" className={inp} value={f.excess_cost ?? ""} onChange={(e) => set("excess_cost", e.target.value ? +e.target.value : null)} /></div>
          <div className="col-span-2"><span className={lbl}>หมายเหตุ</span>
            <input className={inp} value={f.note ?? ""} onChange={(e) => set("note", e.target.value)} /></div>
        </div>
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
