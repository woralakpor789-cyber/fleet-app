"use client";
// เฟส 7 — ติดตามใบกำกับภาษีน้ำมัน
// ตอบ 3 คำถามที่บัญชีถามบ่อย: ใบไหนยังไม่ได้คืน · ใครถืออยู่ · VAT ที่ยังเคลมไม่ได้เท่าไร

import { useEffect, useMemo, useState } from "react";
import FleetShell from "@/components/FleetShell";
import {
  AlertTriangle, Check, FileCheck2, Paperclip, Receipt, Search, User,
} from "lucide-react";
import {
  INVOICE_STATUSES, fmtBaht, fmtDate, vatFromGross,
  type FuelLog, type Vehicle,
} from "@/lib/types";
import {
  listFuelLogs, listVehicles, markInvoicesReturned, signedDocUrl, updateInvoiceStatus,
} from "@/lib/fleetApi";
import { getStoredUser } from "@/lib/auth";

const STATUS_STYLE: Record<string, string> = {
  "รอคนขับส่ง": "bg-amber-50 text-amber-700 border-amber-200",
  "คนขับถือไว้": "bg-orange-50 text-orange-700 border-orange-200",
  "ส่งบัญชีแล้ว": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "หาย": "bg-red-100 text-red-700 border-red-200",
  "ไม่มีใบกำกับ": "bg-slate-100 text-slate-500 border-slate-200",
  "ยกยอด (ก่อนใช้ระบบ)": "bg-slate-100 text-slate-400 border-slate-200",
};
const OUTSTANDING = ["รอคนขับส่ง", "คนขับถือไว้"];

export default function InvoicesPage() {
  const [logs, setLogs] = useState<FuelLog[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [fStatus, setFStatus] = useState("ค้างอยู่");
  const [fHolder, setFHolder] = useState("");
  const [fMonth, setFMonth] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [showHist, setShowHist] = useState(false);
  const [busy, setBusy] = useState(false);
  const receiver = getStoredUser()?.name ?? "บัญชี";

  const reload = async () => {
    try {
      const [l, v] = await Promise.all([listFuelLogs(), listVehicles()]);
      setLogs(l); setVehicles(v); setErr(""); setSel(new Set());
    } catch (e) {
      setErr(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { reload(); }, []);

  const plateOf = useMemo(() => {
    const m = new Map(vehicles.map((v) => [v.id, v.plate]));
    return (id: string) => m.get(id) ?? "?";
  }, [vehicles]);

  const holders = useMemo(
    () => [...new Set(logs.map((l) => l.invoice_holder).filter(Boolean) as string[])].sort(),
    [logs]
  );

  // ข้อมูลก่อนเริ่มใช้ระบบ = ยกยอดไปแล้ว ไม่นับ ไม่แสดง (เว้นแต่ติ๊กดู)
  const live = useMemo(() => logs.filter((l) => !l.historical), [logs]);

  const rows = useMemo(() => (showHist ? logs : live).filter((l) => {
    if (fStatus === "ค้างอยู่" ? !OUTSTANDING.includes(l.invoice_status) : fStatus && l.invoice_status !== fStatus) return false;
    if (fHolder && (l.invoice_holder ?? "") !== fHolder) return false;
    if (fMonth && !l.fill_date.startsWith(fMonth)) return false;
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return [plateOf(l.vehicle_id), l.tax_invoice_no, l.invoice_holder, l.station]
      .some((x) => x?.toLowerCase().includes(s));
  }), [logs, live, showHist, fStatus, fHolder, fMonth, q, plateOf]);

  // สรุปภาพรวม
  const stat = useMemo(() => {
    const out = live.filter((l) => OUTSTANDING.includes(l.invoice_status));
    const lost = live.filter((l) => l.invoice_status === "หาย");
    const vatOut = out.reduce((s, l) => s + (l.vat_amount ?? vatFromGross(l.amount)), 0);
    const vatLost = lost.reduce((s, l) => s + (l.vat_amount ?? vatFromGross(l.amount)), 0);
    return { nOut: out.length, vatOut, nLost: lost.length, vatLost };
  }, [live]);

  // ค้างแยกตามคนขับ — ใช้ตามทวง
  const byHolder = useMemo(() => {
    const m = new Map<string, { n: number; vat: number; oldest: string }>();
    for (const l of live) {
      if (!OUTSTANDING.includes(l.invoice_status)) continue;
      const k = l.invoice_holder || "(ไม่ระบุคนถือ)";
      const cur = m.get(k) ?? { n: 0, vat: 0, oldest: l.fill_date };
      cur.n++;
      cur.vat += l.vat_amount ?? vatFromGross(l.amount);
      if (l.fill_date < cur.oldest) cur.oldest = l.fill_date;
      m.set(k, cur);
    }
    return [...m.entries()].sort((a, b) => b[1].n - a[1].n);
  }, [live]);

  const toggle = (id: string) =>
    setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () =>
    setSel((s) => (s.size === rows.length ? new Set() : new Set(rows.map((r) => r.id))));

  const doReturn = async () => {
    if (!sel.size) return;
    if (!confirm(`บันทึกว่าบัญชีรับใบกำกับตัวจริงคืนแล้ว ${sel.size} ใบ?`)) return;
    setBusy(true);
    try { await markInvoicesReturned([...sel], receiver); await reload(); }
    catch (e) { setErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setBusy(false); }
  };

  const setStatus = async (status: string) => {
    if (!sel.size) return;
    if (status === "หาย" && !confirm(`ทำเครื่องหมายว่าใบกำกับหาย ${sel.size} ใบ? (เคลมภาษีซื้อไม่ได้)`)) return;
    setBusy(true);
    try { await updateInvoiceStatus([...sel], { invoice_status: status }); await reload(); }
    catch (e) { setErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setBusy(false); }
  };

  const openFile = async (path: string) => {
    const url = await signedDocUrl(path);
    if (url) window.open(url, "_blank", "noopener"); else alert("เปิดไฟล์ไม่สำเร็จ");
  };

  return (
    <FleetShell>
      <h1 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
        <Receipt className="w-5 h-5 text-teal-600" /> ใบกำกับภาษีน้ำมัน
      </h1>

      {/* สรุป */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
          <div className="text-xs text-amber-800">ใบที่ยังไม่ได้คืนบัญชี</div>
          <div className="text-2xl font-bold text-amber-800 mt-1">{loading ? "…" : stat.nOut}</div>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
          <div className="text-xs text-amber-800">VAT ที่ยังเคลมไม่ได้</div>
          <div className="text-2xl font-bold text-amber-800 mt-1">{loading ? "…" : fmtBaht(stat.vatOut || null)}</div>
        </div>
        <div className="rounded-2xl border border-red-200 bg-red-50 p-3">
          <div className="text-xs text-red-700">ใบที่หาย</div>
          <div className="text-2xl font-bold text-red-700 mt-1">{loading ? "…" : stat.nLost}</div>
        </div>
        <div className="rounded-2xl border border-red-200 bg-red-50 p-3">
          <div className="text-xs text-red-700">VAT ที่เสียไปจากใบหาย</div>
          <div className="text-2xl font-bold text-red-700 mt-1">{loading ? "…" : fmtBaht(stat.vatLost || null)}</div>
        </div>
      </div>

      {/* ค้างแยกตามคนขับ */}
      {byHolder.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 mb-4">
          <h2 className="font-semibold text-slate-700 text-sm mb-2 flex items-center gap-1.5">
            <User className="w-4 h-4 text-slate-400" /> ใครค้างส่งบ้าง (กดชื่อเพื่อกรอง)
          </h2>
          <div className="flex flex-wrap gap-2">
            {byHolder.map(([name, v]) => (
              <button key={name} onClick={() => { setFHolder(name === fHolder ? "" : name); setFStatus("ค้างอยู่"); }}
                className={`px-3 py-1.5 rounded-xl border text-sm ${
                  fHolder === name ? "bg-teal-600 text-white border-teal-600" : "bg-white border-slate-200 hover:border-teal-300"
                }`}>
                {name} · <b>{v.n} ใบ</b>
                <span className={fHolder === name ? "text-teal-100" : "text-slate-400"}> ({fmtBaht(v.vat)} VAT · เก่าสุด {fmtDate(v.oldest)})</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ตัวกรอง */}
      <div className="flex gap-2 mb-3 flex-wrap">
        <div className="relative flex-1 min-w-44">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นหา ทะเบียน / เลขที่ใบกำกับ / คนถือ / ปั๊ม"
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-white text-sm" />
        </div>
        <select value={fStatus} onChange={(e) => setFStatus(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white text-sm px-3 py-2">
          <option value="ค้างอยู่">ค้างอยู่ (ยังไม่คืน)</option>
          <option value="">ทุกสถานะ</option>
          {INVOICE_STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select value={fHolder} onChange={(e) => setFHolder(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white text-sm px-3 py-2">
          <option value="">ทุกคน</option>
          {holders.map((h) => <option key={h}>{h}</option>)}
        </select>
        <input type="month" value={fMonth} onChange={(e) => setFMonth(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white text-sm px-3 py-2" />
        {logs.length - live.length > 0 && (
          <label className="flex items-center gap-2 text-sm text-slate-500 px-2 cursor-pointer">
            <input type="checkbox" checked={showHist} onChange={(e) => setShowHist(e.target.checked)}
              className="w-4 h-4 accent-slate-500" />
            ดูข้อมูลยกยอดก่อนใช้ระบบ ({logs.length - live.length})
          </label>
        )}
      </div>

      {/* แถบทำงานกับที่เลือกไว้ */}
      {sel.size > 0 && (
        <div className="sticky top-2 z-10 flex items-center gap-2 flex-wrap bg-teal-900 text-white rounded-2xl px-4 py-3 mb-3 shadow-lg">
          <span className="text-sm">เลือกไว้ <b>{sel.size}</b> ใบ</span>
          <button onClick={doReturn} disabled={busy}
            className="flex items-center gap-1 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium px-3 py-1.5 rounded-xl disabled:opacity-50">
            <Check className="w-4 h-4" /> บัญชีรับคืนแล้ว
          </button>
          <button onClick={() => setStatus("หาย")} disabled={busy}
            className="text-sm px-3 py-1.5 rounded-xl bg-red-500 hover:bg-red-600 disabled:opacity-50">ทำเครื่องหมายว่าหาย</button>
          <button onClick={() => setStatus("ไม่มีใบกำกับ")} disabled={busy}
            className="text-sm px-3 py-1.5 rounded-xl bg-teal-700 hover:bg-teal-600 disabled:opacity-50">ไม่มีใบกำกับ</button>
          <button onClick={() => setSel(new Set())} className="text-sm text-teal-200 ml-auto">ยกเลิกเลือก</button>
        </div>
      )}

      {err && <p className="text-red-600 text-sm mb-3">{err}</p>}
      {loading ? (
        <p className="text-slate-400">กำลังโหลด…</p>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-100">
                <th className="px-3 py-3 w-8">
                  <input type="checkbox" className="w-4 h-4 accent-teal-600"
                    checked={rows.length > 0 && sel.size === rows.length} onChange={toggleAll} />
                </th>
                <th className="px-2 py-3">วันที่เติม</th>
                <th className="px-2 py-3">รถ</th>
                <th className="px-2 py-3">เลขที่ใบกำกับ</th>
                <th className="px-2 py-3">ปั๊ม</th>
                <th className="px-2 py-3 text-right">ยอดรวม</th>
                <th className="px-2 py-3 text-right">VAT</th>
                <th className="px-2 py-3">คนถือ</th>
                <th className="px-2 py-3">สถานะ</th>
                <th className="px-2 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => {
                const vat = l.vat_amount ?? vatFromGross(l.amount);
                const days = Math.round((Date.now() - new Date(l.fill_date).getTime()) / 86400000);
                const late = OUTSTANDING.includes(l.invoice_status) && days > 30;
                return (
                  <tr key={l.id} className={`border-b border-slate-50 hover:bg-slate-50/60 ${sel.has(l.id) ? "bg-teal-50/50" : ""}`}>
                    <td className="px-3 py-2.5">
                      <input type="checkbox" className="w-4 h-4 accent-teal-600"
                        checked={sel.has(l.id)} onChange={() => toggle(l.id)} />
                    </td>
                    <td className="px-2 py-2.5">
                      {fmtDate(l.fill_date)}
                      {late && (
                        <div className="text-[10px] text-red-600 flex items-center gap-0.5">
                          <AlertTriangle className="w-3 h-3" />ค้าง {days} วัน
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-2.5 font-medium text-slate-800">{plateOf(l.vehicle_id)}</td>
                    <td className="px-2 py-2.5">{l.tax_invoice_no ?? <span className="text-slate-300">—</span>}</td>
                    <td className="px-2 py-2.5 text-slate-500">{l.station ?? "—"}</td>
                    <td className="px-2 py-2.5 text-right">{fmtBaht(l.amount)}</td>
                    <td className="px-2 py-2.5 text-right text-slate-500">{fmtBaht(vat)}</td>
                    <td className="px-2 py-2.5">{l.invoice_holder ?? <span className="text-slate-300">—</span>}</td>
                    <td className="px-2 py-2.5">
                      <span className={`px-2 py-0.5 rounded-full text-xs border ${STATUS_STYLE[l.invoice_status] ?? "bg-slate-100 text-slate-500"}`}>
                        {l.invoice_status}
                      </span>
                      {l.invoice_returned_at && (
                        <div className="text-[10px] text-slate-400 mt-0.5">รับคืน {fmtDate(l.invoice_returned_at)}</div>
                      )}
                    </td>
                    <td className="px-2 py-2.5">
                      {l.file_path && (
                        <button onClick={() => openFile(l.file_path!)} title="ดูรูปใบกำกับ"
                          className="p-1.5 text-slate-400 hover:text-sky-600">
                          <Paperclip className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!rows.length && (
                <tr><td colSpan={10} className="px-4 py-10 text-center text-slate-400">
                  <FileCheck2 className="w-8 h-8 mx-auto mb-2 text-emerald-300" />
                  ไม่มีใบกำกับค้างตามเงื่อนไขนี้
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-slate-400 mt-2">
        VAT คำนวณจากยอดรวม (ราคาน้ำมันไทยรวม VAT 7% แล้ว = ยอด × 7/107) · ติ๊กเลือกหลายใบแล้วกด &quot;บัญชีรับคืนแล้ว&quot; ทีเดียวได้
      </p>
    </FleetShell>
  );
}
