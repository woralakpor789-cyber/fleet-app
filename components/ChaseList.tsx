"use client";
// components/ChaseList.tsx — "ตามใบกำกับ" (เฟส 8B)
// ตอบ 2 คำถาม: บิลใบไหนหาย (วันไหน ปั๊มไหน เท่าไร) · ต้องไปตามจากใคร (คนขับรถคันนั้นในวันนั้น)

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, Check, Link2, Loader2, MapPin, Search, User, X,
} from "lucide-react";
import { fmtBaht, fmtDate, vatFromGross } from "@/lib/types";
import {
  TXN_INVOICE_STATUSES, listCardTxns, matchCardTxns, updateCardTxns, type CardTxn,
} from "@/lib/fleetApi";

const BADGE: Record<string, string> = {
  "ยังไม่ได้ใบ": "bg-red-50 text-red-700 border-red-200",
  "ได้ใบแล้ว": "bg-amber-50 text-amber-700 border-amber-200",
  "ส่งบัญชีแล้ว": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "หาย": "bg-red-100 text-red-800 border-red-300",
  "ไม่มีใบกำกับ": "bg-slate-100 text-slate-500 border-slate-200",
  "ยกยอด (ก่อนใช้ระบบ)": "bg-slate-100 text-slate-400 border-slate-200",
};

export default function ChaseList({ period }: { period: string }) {
  const [rows, setRows] = useState<CardTxn[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [fStatus, setFStatus] = useState("ยังไม่ได้ใบ");
  const [fDriver, setFDriver] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [showHist, setShowHist] = useState(false);

  const reload = async () => {
    try {
      setRows(await listCardTxns(period));
      setErr(""); setSel(new Set());
    } catch (e) {
      setErr(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { setLoading(true); reload(); }, [period]);  // eslint-disable-line react-hooks/exhaustive-deps

  const drivers = useMemo(
    () => [...new Set(rows.map((r) => r.driver).filter(Boolean) as string[])].sort(),
    [rows]
  );

  // ข้อมูลก่อนเริ่มใช้ระบบ = ยกยอดแล้ว ไม่นับ ไม่แสดง
  const live = useMemo(() => rows.filter((r) => !r.historical), [rows]);
  const nHist = rows.length - live.length;

  const filtered = useMemo(() => (showHist ? rows : live).filter((r) => {
    if (fStatus && r.invoice_status !== fStatus) return false;
    if (fDriver && (r.driver ?? "") !== fDriver) return false;
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return [r.plate, r.station, r.province, r.driver].some((x) => x?.toLowerCase().includes(s));
  }), [rows, live, showHist, fStatus, fDriver, q]);

  // สรุปคนที่ต้องตาม
  const chaseBy = useMemo(() => {
    const m = new Map<string, { n: number; amount: number; vat: number }>();
    for (const r of live) {
      if (r.invoice_status !== "ยังไม่ได้ใบ") continue;
      const k = r.driver || "(ยังไม่ระบุคนขับ)";
      const cur = m.get(k) ?? { n: 0, amount: 0, vat: 0 };
      cur.n++; cur.amount += r.amount; cur.vat += vatFromGross(r.amount);
      m.set(k, cur);
    }
    return [...m.entries()].sort((a, b) => b[1].n - a[1].n);
  }, [live]);

  const missing = live.filter((r) => r.invoice_status === "ยังไม่ได้ใบ");
  const missingVat = missing.reduce((s, r) => s + vatFromGross(r.amount), 0);

  const autoMatch = async () => {
    setBusy(true); setMsg("");
    try {
      const n = await matchCardTxns(period);
      await reload();
      setMsg(n > 0 ? `จับคู่กับใบกำกับที่มีในระบบได้ ${n} รายการ` : "ไม่พบใบกำกับในระบบที่จับคู่ได้เพิ่ม");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "จับคู่ไม่สำเร็จ");
    } finally { setBusy(false); }
  };

  const setStatus = async (status: string) => {
    if (!sel.size) return;
    setBusy(true);
    try { await updateCardTxns([...sel], { invoice_status: status }); await reload(); setMsg(`อัปเดต ${sel.size} รายการเป็น "${status}"`); }
    catch (e) { setErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setBusy(false); }
  };

  const toggle = (id: string) =>
    setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div>
      {/* สรุป */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-3">
          <div className="text-xs text-slate-500">รูดบัตรทั้งเดือน</div>
          <div className="text-2xl font-bold text-slate-800 mt-1">{loading ? "…" : live.length}</div>
          {nHist > 0 && <div className="text-[10px] text-slate-400">ยกยอดไม่นับอีก {nHist}</div>}
        </div>
        <div className="rounded-2xl border border-red-200 bg-red-50 p-3">
          <div className="text-xs text-red-700">ยังไม่ได้ใบกำกับ</div>
          <div className="text-2xl font-bold text-red-700 mt-1">{loading ? "…" : missing.length}</div>
        </div>
        <div className="rounded-2xl border border-red-200 bg-red-50 p-3">
          <div className="text-xs text-red-700">VAT ที่ยังเคลมไม่ได้</div>
          <div className="text-2xl font-bold text-red-700 mt-1">{loading ? "…" : fmtBaht(missingVat || null)}</div>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
          <div className="text-xs text-emerald-700">ได้ใบแล้ว</div>
          <div className="text-2xl font-bold text-emerald-700 mt-1">
            {loading ? "…" : live.length - missing.length}
          </div>
        </div>
      </div>

      {/* ต้องไปตามจากใคร */}
      {chaseBy.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 mb-4">
          <h3 className="font-semibold text-slate-700 text-sm mb-2 flex items-center gap-1.5">
            <User className="w-4 h-4 text-slate-400" /> ต้องไปตามจากใคร (กดชื่อเพื่อกรอง)
          </h3>
          <div className="flex flex-wrap gap-2">
            {chaseBy.map(([name, v]) => (
              <button key={name} onClick={() => setFDriver(name === fDriver ? "" : name)}
                className={`px-3 py-1.5 rounded-xl border text-sm ${
                  fDriver === name ? "bg-teal-600 text-white border-teal-600" : "bg-white border-slate-200 hover:border-teal-300"
                }`}>
                {name} · <b>{v.n} ใบ</b>
                <span className={fDriver === name ? "text-teal-100" : "text-slate-400"}>
                  {" "}({fmtBaht(v.amount)} · VAT {fmtBaht(v.vat)})
                </span>
              </button>
            ))}
          </div>
          {chaseBy.some(([n]) => n === "(ยังไม่ระบุคนขับ)") && (
            <p className="text-xs text-amber-700 mt-2 flex items-start gap-1">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              มีรถที่ยังไม่ได้ระบุคนขับ — ไปกรอก &quot;คนขับ/ผู้ใช้ประจำ&quot; ที่หน้าทะเบียนรถ แล้วรายการจะบอกชื่อคนที่ต้องตามให้เอง
            </p>
          )}
        </div>
      )}

      {/* เครื่องมือ */}
      <div className="flex gap-2 mb-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-44">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นหา ทะเบียน / ปั๊ม / จังหวัด / คนขับ"
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-white text-sm" />
        </div>
        <select value={fStatus} onChange={(e) => setFStatus(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white text-sm px-3 py-2">
          <option value="">ทุกสถานะ</option>
          {TXN_INVOICE_STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select value={fDriver} onChange={(e) => setFDriver(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white text-sm px-3 py-2">
          <option value="">ทุกคน</option>
          {drivers.map((d) => <option key={d}>{d}</option>)}
        </select>
        {nHist > 0 && (
          <label className="flex items-center gap-2 text-sm text-slate-500 cursor-pointer">
            <input type="checkbox" checked={showHist} onChange={(e) => setShowHist(e.target.checked)}
              className="w-4 h-4 accent-slate-500" />
            ดูข้อมูลยกยอด ({nHist})
          </label>
        )}
        <button onClick={autoMatch} disabled={busy}
          className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-xl border border-teal-600 text-teal-700 hover:bg-teal-50 disabled:opacity-50">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />} จับคู่ใบที่มีในระบบ
        </button>
      </div>

      {msg && <p className="text-emerald-700 text-sm mb-2">{msg}</p>}
      {err && <p className="text-red-600 text-sm mb-2">{err}</p>}

      {sel.size > 0 && (
        <div className="sticky top-2 z-10 flex items-center gap-2 flex-wrap bg-teal-900 text-white rounded-2xl px-4 py-3 mb-3 shadow-lg">
          <span className="text-sm">เลือก <b>{sel.size}</b> รายการ</span>
          <button onClick={() => setStatus("ได้ใบแล้ว")} disabled={busy}
            className="flex items-center gap-1 bg-amber-500 hover:bg-amber-600 text-sm px-3 py-1.5 rounded-xl disabled:opacity-50">
            <Check className="w-4 h-4" /> ได้ใบแล้ว
          </button>
          <button onClick={() => setStatus("ส่งบัญชีแล้ว")} disabled={busy}
            className="flex items-center gap-1 bg-emerald-500 hover:bg-emerald-600 text-sm px-3 py-1.5 rounded-xl disabled:opacity-50">
            <Check className="w-4 h-4" /> ส่งบัญชีแล้ว
          </button>
          <button onClick={() => setStatus("หาย")} disabled={busy}
            className="text-sm px-3 py-1.5 rounded-xl bg-red-500 hover:bg-red-600 disabled:opacity-50">หาย</button>
          <button onClick={() => setSel(new Set())} className="text-sm text-teal-200 ml-auto">
            <X className="w-4 h-4 inline" /> ยกเลิก
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-slate-400">กำลังโหลด…</p>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="w-full text-sm min-w-[880px]">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-100">
                <th className="px-3 py-3 w-8">
                  <input type="checkbox" className="w-4 h-4 accent-teal-600"
                    checked={filtered.length > 0 && sel.size === filtered.length}
                    onChange={() => setSel((s) => (s.size === filtered.length ? new Set() : new Set(filtered.map((r) => r.id))))} />
                </th>
                <th className="px-2 py-3">วันที่รูด</th>
                <th className="px-2 py-3">รถ</th>
                <th className="px-2 py-3">คนขับวันนั้น</th>
                <th className="px-2 py-3">ปั๊ม / จังหวัด</th>
                <th className="px-2 py-3 text-right">ยอด</th>
                <th className="px-2 py-3 text-right">VAT</th>
                <th className="px-2 py-3">สถานะใบกำกับ</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className={`border-b border-slate-50 hover:bg-slate-50/60 ${
                  sel.has(r.id) ? "bg-teal-50/50" : r.invoice_status === "ยังไม่ได้ใบ" ? "bg-red-50/30" : ""
                }`}>
                  <td className="px-3 py-2.5">
                    <input type="checkbox" className="w-4 h-4 accent-teal-600"
                      checked={sel.has(r.id)} onChange={() => toggle(r.id)} />
                  </td>
                  <td className="px-2 py-2.5">{fmtDate(r.trans_date)}</td>
                  <td className="px-2 py-2.5 font-medium text-slate-800">{r.plate ?? "?"}</td>
                  <td className="px-2 py-2.5">
                    {r.driver ?? <span className="text-amber-600 text-xs">ยังไม่ระบุ</span>}
                  </td>
                  <td className="px-2 py-2.5">
                    <div className="text-slate-700">{r.station ?? "—"}</div>
                    {r.province && (
                      <div className="text-[10px] text-slate-400 flex items-center gap-0.5">
                        <MapPin className="w-3 h-3" />{r.province}
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-2.5 text-right font-medium">{fmtBaht(r.amount)}</td>
                  <td className="px-2 py-2.5 text-right text-slate-500">{fmtBaht(vatFromGross(r.amount))}</td>
                  <td className="px-2 py-2.5">
                    <span className={`px-2 py-0.5 rounded-full text-xs border ${BADGE[r.invoice_status] ?? ""}`}>
                      {r.invoice_status}
                    </span>
                    {r.matched_invoice_no && (
                      <div className="text-[10px] text-slate-400 mt-0.5">เลขที่ {r.matched_invoice_no}</div>
                    )}
                  </td>
                </tr>
              ))}
              {!filtered.length && (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">ไม่มีรายการตามเงื่อนไขนี้</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-slate-400 mt-2">
        &quot;จับคู่ใบที่มีในระบบ&quot; = หาใบกำกับที่บันทึกไว้แล้ว (รถเดียวกัน ยอดเท่ากัน วันที่ห่างไม่เกิน 2 วัน) มาผูกให้อัตโนมัติ ·
        รายการที่เหลือคือใบที่ยังไม่มีในระบบ ต้องไปตามจากคนขับตามชื่อในคอลัมน์ &quot;คนขับวันนั้น&quot;
      </p>
    </div>
  );
}
