"use client";
// components/FuelReview.tsx — backoffice ตรวจบิลที่คนขับส่งมา (เฟส 6F)
// ดูรูปบิลเทียบตัวเลข → แก้ได้ → อนุมัติ (สร้างรายการเติมจริง) หรือปฏิเสธพร้อมเหตุผล

import { useMemo, useState } from "react";
import { AlertTriangle, Check, Loader2, Paperclip, X } from "lucide-react";
import { FUEL_TYPES, fmtBaht, fmtDate, type FuelSubmission, type Vehicle } from "@/lib/types";
import { approveSubmission, rejectSubmission, signedDocUrl } from "@/lib/fleetApi";
import { getStoredUser } from "@/lib/auth";

export default function FuelReview({
  rows, vehicles, onChanged,
}: {
  rows: FuelSubmission[];
  vehicles: Vehicle[];
  onChanged: () => void;
}) {
  const [busyId, setBusyId] = useState("");
  const [edits, setEdits] = useState<Record<string, Partial<FuelSubmission>>>({});
  const [err, setErr] = useState("");
  const reviewer = getStoredUser()?.name ?? "backoffice";

  const vById = useMemo(() => new Map(vehicles.map((v) => [v.id, v])), [vehicles]);
  const pending = rows.filter((r) => r.status === "รอตรวจ");
  const reviewed = rows.filter((r) => r.status !== "รอตรวจ").slice(0, 20);

  const val = <K extends keyof FuelSubmission>(r: FuelSubmission, k: K): FuelSubmission[K] =>
    (edits[r.id]?.[k] ?? r[k]) as FuelSubmission[K];
  const setVal = (id: string, patch: Partial<FuelSubmission>) =>
    setEdits((e) => ({ ...e, [id]: { ...e[id], ...patch } }));

  const openFile = async (path: string) => {
    const url = await signedDocUrl(path);
    if (url) window.open(url, "_blank", "noopener");
    else alert("เปิดไฟล์ไม่สำเร็จ");
  };

  const approve = async (r: FuelSubmission) => {
    setBusyId(r.id); setErr("");
    try {
      await approveSubmission(r, edits[r.id] ?? {}, reviewer, vById.get(val(r, "vehicle_id")));
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "อนุมัติไม่สำเร็จ");
    } finally {
      setBusyId("");
    }
  };

  const reject = async (r: FuelSubmission) => {
    const reason = prompt(`ปฏิเสธบิลของ ${r.driver_name} เพราะอะไร? (คนขับจะเห็นข้อความนี้)`);
    if (reason === null) return;
    setBusyId(r.id); setErr("");
    try {
      await rejectSubmission(r.id, reason.trim() || "ข้อมูลไม่ถูกต้อง", reviewer);
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setBusyId("");
    }
  };

  const inp = "w-full rounded-lg border border-slate-200 px-2 py-1 text-xs";

  return (
    <div className="space-y-3">
      {err && <p className="text-sm text-red-600">{err}</p>}

      {!pending.length && (
        <p className="bg-white rounded-2xl border border-slate-200 p-6 text-center text-slate-400">
          ไม่มีบิลรอตรวจ — คนขับส่งเข้ามาเมื่อไหร่จะขึ้นที่นี่
        </p>
      )}

      {pending.map((r) => {
        const v = vById.get(val(r, "vehicle_id"));
        const liters = Number(val(r, "liters")) || 0;
        const amount = Number(val(r, "amount")) || 0;
        const perL = liters > 0 ? amount / liters : 0;
        const odd = perL > 0 && (perL < 15 || perL > 60);
        return (
          <div key={r.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <div className="font-semibold text-slate-800">{v?.plate ?? "?"}</div>
                <div className="text-xs text-slate-500">
                  ส่งโดย {r.driver_name}{r.driver_phone ? ` · ${r.driver_phone}` : ""} · {fmtDate(r.created_at)}
                </div>
              </div>
              {r.file_path && (
                <button onClick={() => openFile(r.file_path!)}
                  className="flex items-center gap-1 text-sm text-sky-700 hover:text-sky-800 shrink-0">
                  <Paperclip className="w-4 h-4" /> ดูรูปบิล
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div><span className="text-[10px] text-slate-500 block mb-0.5">รถ</span>
                <select className={inp} value={val(r, "vehicle_id")}
                  onChange={(e) => setVal(r.id, { vehicle_id: e.target.value })}>
                  {vehicles.map((x) => <option key={x.id} value={x.id}>{x.plate}</option>)}
                </select></div>
              <div><span className="text-[10px] text-slate-500 block mb-0.5">วันที่</span>
                <input type="date" className={inp} value={val(r, "fill_date") ?? ""}
                  onChange={(e) => setVal(r.id, { fill_date: e.target.value })} /></div>
              <div><span className="text-[10px] text-slate-500 block mb-0.5">เลขไมล์</span>
                <input type="number" className={inp} value={val(r, "odometer") ?? ""}
                  onChange={(e) => setVal(r.id, { odometer: e.target.value ? +e.target.value : null })} /></div>
              <div><span className="text-[10px] text-slate-500 block mb-0.5">ลิตร</span>
                <input type="number" step="0.01" className={inp} value={val(r, "liters") ?? ""}
                  onChange={(e) => setVal(r.id, { liters: +e.target.value })} /></div>
              <div><span className="text-[10px] text-slate-500 block mb-0.5">บาท</span>
                <input type="number" step="0.01" className={inp} value={val(r, "amount") ?? ""}
                  onChange={(e) => setVal(r.id, { amount: +e.target.value })} /></div>
              <div><span className="text-[10px] text-slate-500 block mb-0.5">ชนิด</span>
                <select className={inp} value={val(r, "fuel_type") ?? ""}
                  onChange={(e) => setVal(r.id, { fuel_type: e.target.value || null })}>
                  <option value="">—</option>
                  {FUEL_TYPES.map((t) => <option key={t}>{t}</option>)}
                </select></div>
              <div><span className="text-[10px] text-slate-500 block mb-0.5">ปั๊ม</span>
                <input className={inp} value={val(r, "station") ?? ""}
                  onChange={(e) => setVal(r.id, { station: e.target.value || null })} /></div>
              <div><span className="text-[10px] text-slate-500 block mb-0.5">เลขที่ใบกำกับ</span>
                <input className={inp} value={val(r, "tax_invoice_no") ?? ""}
                  onChange={(e) => setVal(r.id, { tax_invoice_no: e.target.value || null })} /></div>
              <div className="flex items-end">
                <span className={`text-xs ${odd ? "text-red-600" : "text-slate-500"}`}>
                  {perL > 0 ? `${perL.toFixed(2)} ฿/ลิตร` : "—"}
                  {odd && <> <AlertTriangle className="w-3 h-3 inline" /> ผิดปกติ</>}
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-3">
              <button onClick={() => reject(r)} disabled={busyId === r.id}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-sm border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                <X className="w-4 h-4" /> ปฏิเสธ
              </button>
              <button onClick={() => approve(r)} disabled={busyId === r.id}
                className="flex items-center gap-1 px-4 py-1.5 rounded-xl text-sm font-medium bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50">
                {busyId === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} อนุมัติ
              </button>
            </div>
          </div>
        );
      })}

      {reviewed.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto mt-4">
          <div className="px-4 py-2 text-xs text-slate-500 border-b border-slate-100">ตรวจไปแล้วล่าสุด</div>
          <table className="w-full text-xs min-w-[560px]">
            <tbody>
              {reviewed.map((r) => (
                <tr key={r.id} className="border-b border-slate-50">
                  <td className="px-4 py-2">{fmtDate(r.fill_date)}</td>
                  <td className="px-2 py-2 font-medium text-slate-700">{vById.get(r.vehicle_id)?.plate ?? "?"}</td>
                  <td className="px-2 py-2 text-slate-500">{r.driver_name}</td>
                  <td className="px-2 py-2 text-right">{fmtBaht(r.amount)}</td>
                  <td className="px-2 py-2">
                    <span className={`px-2 py-0.5 rounded-full ${
                      r.status === "อนุมัติ" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                    }`}>{r.status}</span>
                  </td>
                  <td className="px-2 py-2 text-slate-400 max-w-40 truncate">{r.reject_reason ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
