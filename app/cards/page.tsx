"use client";
// เฟส 8 — ฟลีทการ์ด: ทะเบียนบัตร · คีย์ใบแจ้งยอดรายเดือน · กระทบยอดกับใบกำกับที่เก็บได้
// ตอบคำถาม "เดือนนี้รูดไปเท่าไร แต่ได้ใบกำกับคืนมาเท่าไร ขาดเท่าไร รถคันไหน"

import { useEffect, useMemo, useState } from "react";
import FleetShell from "@/components/FleetShell";
import { AlertTriangle, CheckCircle2, CreditCard, Save, Scale, Trash2 } from "lucide-react";
import ChaseList from "@/components/ChaseList";
import StatementScanModal from "@/components/StatementScan";
import { FileSearch } from "lucide-react";
import {
  fmtBaht, fmtDate,
  type CardStatement, type FuelCard, type FuelLog, type StatementLine, type Vehicle,
} from "@/lib/types";
import {
  deleteCard, listCards, listFuelLogs, listStatementLines, listStatements,
  listVehicles, saveStatement, upsertCard,
} from "@/lib/fleetApi";

const thisMonth = () => new Date().toISOString().slice(0, 7);

export default function CardsPage() {
  const [cards, setCards] = useState<FuelCard[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [statements, setStatements] = useState<CardStatement[]>([]);
  const [logs, setLogs] = useState<FuelLog[]>([]);
  const [lines, setLines] = useState<StatementLine[]>([]);
  const [period, setPeriod] = useState(thisMonth());
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [tab, setTab] = useState<"reconcile" | "chase" | "cards">("reconcile");

  // ค่าที่กำลังคีย์ (การ์ด id → ยอด/จำนวนครั้ง)
  const [amt, setAmt] = useState<Record<string, string>>({});
  const [cnt, setCnt] = useState<Record<string, string>>({});
  const [stmtDate, setStmtDate] = useState("");
  const [stmtTotal, setStmtTotal] = useState("");
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);

  const reload = async () => {
    try {
      const [c, v, s, l] = await Promise.all([listCards(), listVehicles(), listStatements(), listFuelLogs()]);
      setCards(c); setVehicles(v); setStatements(s); setLogs(l); setErr("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { reload(); }, []);

  // โหลดยอดของรอบที่เลือกมาเติมในฟอร์ม
  const current = statements.find((s) => s.period === period);
  useEffect(() => {
    (async () => {
      if (!current) { setLines([]); setAmt({}); setCnt({}); setStmtDate(""); setStmtTotal(""); return; }
      const ls = await listStatementLines(current.id);
      setLines(ls);
      const a: Record<string, string> = {}, n: Record<string, string> = {};
      for (const l of ls) {
        if (l.card_id) { a[l.card_id] = String(l.amount); if (l.txn_count != null) n[l.card_id] = String(l.txn_count); }
      }
      setAmt(a); setCnt(n);
      setStmtDate(current.statement_date ?? "");
      setStmtTotal(current.total_amount != null ? String(current.total_amount) : "");
    })();
  }, [current?.id, period]);   // eslint-disable-line react-hooks/exhaustive-deps

  const vById = useMemo(() => new Map(vehicles.map((v) => [v.id, v])), [vehicles]);
  const plateOf = (id: string | null) => (id ? vById.get(id)?.plate ?? "?" : "— ยังไม่ผูกรถ —");

  const keyed = useMemo(
    () => cards.reduce((s, c) => s + (+(amt[c.id] || 0) || 0), 0),
    [cards, amt]
  );
  const diff = stmtTotal ? keyed - +stmtTotal : 0;

  // ---- กระทบยอด: ยอดตามใบแจ้ง vs ใบกำกับที่เก็บได้ (รายคัน) ----
  const recon = useMemo(() => {
    const collected = new Map<string, { n: number; amount: number; returned: number }>();
    for (const l of logs) {
      if (!l.fill_date.startsWith(period)) continue;
      const cur = collected.get(l.vehicle_id) ?? { n: 0, amount: 0, returned: 0 };
      cur.n++;
      cur.amount += l.amount;
      if (l.invoice_status === "ส่งบัญชีแล้ว") cur.returned++;
      collected.set(l.vehicle_id, cur);
    }
    return lines.map((l) => {
      const got = (l.vehicle_id && collected.get(l.vehicle_id)) || { n: 0, amount: 0, returned: 0 };
      return {
        line: l,
        plate: plateOf(l.vehicle_id),
        billed: l.amount,
        gotAmount: got.amount,
        gotCount: got.n,
        returned: got.returned,
        missing: l.amount - got.amount,
      };
    }).sort((a, b) => b.missing - a.missing);
  }, [lines, logs, period, vById]);   // eslint-disable-line react-hooks/exhaustive-deps

  const totalBilled = recon.reduce((s, r) => s + r.billed, 0);
  const totalGot = recon.reduce((s, r) => s + r.gotAmount, 0);

  const save = async () => {
    setSaving(true); setErr(""); setMsg("");
    try {
      await saveStatement(
        {
          period,
          statement_date: stmtDate || null,
          total_amount: stmtTotal ? +stmtTotal : keyed,
        },
        cards.filter((c) => amt[c.id] !== undefined && amt[c.id] !== "").map((c) => ({
          card_id: c.id, vehicle_id: c.vehicle_id, account_name: c.account_name,
          amount: +amt[c.id] || 0,
          txn_count: cnt[c.id] ? +cnt[c.id] : null,
        })),
      );
      await reload();
      setMsg(`บันทึกใบแจ้งยอดรอบ ${period} แล้ว`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const inp = "w-full rounded-lg border border-slate-200 px-2 py-1 text-sm text-right";

  return (
    <FleetShell>
      <h1 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
        <CreditCard className="w-5 h-5 text-teal-600" /> ฟลีทการ์ด
      </h1>

      <div className="flex gap-2 mb-4 flex-wrap items-center">
        {([["reconcile", "ใบแจ้งยอด & กระทบยอด"], ["chase", "ตามใบกำกับรายใบ"], ["cards", `บัตรทั้งหมด (${cards.length})`]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-1.5 rounded-full text-sm ${
              tab === k ? "bg-teal-600 text-white font-medium" : "bg-white border border-slate-200 text-slate-600"
            }`}>{label}</button>
        ))}
        {tab !== "cards" && (
          <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)}
            className="ml-auto rounded-xl border border-slate-200 bg-white text-sm px-3 py-2" />
        )}
      </div>

      {err && <p className="text-red-600 text-sm mb-3">{err}</p>}
      {msg && <p className="text-emerald-700 text-sm mb-3">{msg}</p>}
      {loading && <p className="text-slate-400">กำลังโหลด…</p>}

      {!loading && tab === "cards" && (
        <CardTable cards={cards} vehicles={vehicles} onChanged={reload} />
      )}

      {tab === "chase" && <ChaseList period={period} />}

      {scanning && (
        <StatementScanModal
          cards={cards}
          onClose={() => setScanning(false)}
          onApply={(r) => {
            // เติมยอดที่อ่านได้ลงในช่องกรอก (ยังไม่บันทึก — ให้ตรวจก่อน)
            const byAcct = new Map(cards.map((c) => [c.account_name ?? "", c.id]));
            setAmt((a) => {
              const n = { ...a };
              for (const l of r.lines) {
                const id = byAcct.get(l.account);
                if (id) n[id] = String(l.amount);
              }
              return n;
            });
            if (r.statementDate) setStmtDate(r.statementDate);
            if (r.total != null) setStmtTotal(String(r.total));
            setMsg(`เติมยอดจากไฟล์ ${r.lines.length} บัตรแล้ว — ตรวจตัวเลขแล้วกด "บันทึกรอบนี้"`);
          }}
        />
      )}

      {!loading && tab === "reconcile" && (
        <>
          {/* คีย์ยอดจากใบแจ้งยอด */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 mb-4">
            <h2 className="font-semibold text-slate-700 mb-1">คีย์ยอดจากใบแจ้งยอด — รอบ {period}</h2>
            <p className="text-xs text-slate-500 mb-3">
              เปิดหน้าสรุปบัญชีของใบแจ้งยอด แล้วคีย์ยอดรายบัตรตามนั้น (ประมาณ 15 ช่อง ใช้เวลา 2-3 นาที)
              · ช่อง &quot;กี่ครั้ง&quot; ใส่จำนวนรายการที่รูดในรอบนั้น จะทำให้ระบบบอกได้ว่าใบกำกับขาดไปกี่ใบ
            </p>
            <div className="flex gap-3 flex-wrap mb-3">
              <label className="text-sm">
                <span className="text-xs text-slate-500 block mb-1">วันที่ในใบแจ้งยอด</span>
                <input type="date" value={stmtDate} onChange={(e) => setStmtDate(e.target.value)}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              </label>
              <label className="text-sm">
                <span className="text-xs text-slate-500 block mb-1">ยอดรวมตามใบแจ้งยอด (ไว้ตรวจ)</span>
                <input type="number" value={stmtTotal} onChange={(e) => setStmtTotal(e.target.value)}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-right" />
              </label>
              <div className="text-sm self-end">
                <span className="text-xs text-slate-500 block mb-1">ผลรวมที่คีย์</span>
                <div className={`px-3 py-2 rounded-xl font-medium ${
                  !stmtTotal ? "bg-slate-100 text-slate-600"
                    : Math.abs(diff) < 0.5 ? "bg-emerald-50 text-emerald-700"
                    : "bg-red-50 text-red-700"
                }`}>
                  {fmtBaht(keyed)}
                  {stmtTotal && (Math.abs(diff) < 0.5
                    ? <span className="ml-1">✓ ตรง</span>
                    : <span className="ml-1">ต่าง {fmtBaht(Math.abs(diff))}</span>)}
                </div>
              </div>
              <button onClick={() => setScanning(true)}
                className="self-end flex items-center gap-1.5 border border-teal-600 text-teal-700 hover:bg-teal-50 text-sm font-medium px-4 py-2 rounded-xl">
                <FileSearch className="w-4 h-4" /> อ่านจากไฟล์
              </button>
              <button onClick={save} disabled={saving}
                className="self-end flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-4 py-2 rounded-xl disabled:opacity-50">
                <Save className="w-4 h-4" /> {saving ? "กำลังบันทึก…" : "บันทึกรอบนี้"}
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[620px]">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-100">
                    <th className="px-2 py-2">บัตร / ชื่อบัญชี</th>
                    <th className="px-2 py-2">รถ</th>
                    <th className="px-2 py-2 w-32 text-right">ยอดในรอบนี้</th>
                    <th className="px-2 py-2 w-24 text-right">กี่ครั้ง</th>
                  </tr>
                </thead>
                <tbody>
                  {cards.map((c) => (
                    <tr key={c.id} className="border-b border-slate-50">
                      <td className="px-2 py-1.5">
                        <div className="font-medium text-slate-700">{c.account_name}</div>
                        <div className="text-[10px] text-slate-400">{c.card_no}</div>
                      </td>
                      <td className="px-2 py-1.5">{plateOf(c.vehicle_id)}</td>
                      <td className="px-2 py-1.5">
                        <input type="number" className={inp} value={amt[c.id] ?? ""}
                          onChange={(e) => setAmt((a) => ({ ...a, [c.id]: e.target.value }))} /></td>
                      <td className="px-2 py-1.5">
                        <input type="number" className={inp} value={cnt[c.id] ?? ""}
                          onChange={(e) => setCnt((n) => ({ ...n, [c.id]: e.target.value }))} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* กระทบยอด */}
          {lines.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2 flex-wrap">
                <Scale className="w-4 h-4 text-teal-600" />
                <span className="font-semibold text-slate-700">กระทบยอด รอบ {period}</span>
                <span className="text-sm text-slate-500 ml-auto">
                  รูดจริง {fmtBaht(totalBilled)} · มีใบกำกับในระบบ {fmtBaht(totalGot)} ·
                  <b className={totalBilled - totalGot > 0 ? "text-red-600" : "text-emerald-600"}>
                    {" "}ขาด {fmtBaht(Math.max(0, totalBilled - totalGot))}
                  </b>
                </span>
              </div>
              <table className="w-full text-sm min-w-[720px]">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-100">
                    <th className="px-4 py-2">รถ</th>
                    <th className="px-2 py-2 text-right">ยอดรูดตามใบแจ้ง</th>
                    <th className="px-2 py-2 text-right">มีใบกำกับในระบบ</th>
                    <th className="px-2 py-2 text-center">จำนวนใบ</th>
                    <th className="px-2 py-2 text-right">ส่วนต่าง</th>
                    <th className="px-2 py-2">สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  {recon.map((r) => {
                    const ok = Math.abs(r.missing) < 1;
                    const expect = r.line.txn_count;
                    return (
                      <tr key={r.line.id} className={`border-b border-slate-50 ${!ok && r.missing > 0 ? "bg-red-50/40" : ""}`}>
                        <td className="px-4 py-2.5 font-medium text-slate-800">{r.plate}</td>
                        <td className="px-2 py-2.5 text-right">{fmtBaht(r.billed || null)}</td>
                        <td className="px-2 py-2.5 text-right">{fmtBaht(r.gotAmount || null)}</td>
                        <td className="px-2 py-2.5 text-center text-slate-500">
                          {r.gotCount}{expect != null ? ` / ${expect}` : ""}
                          {expect != null && r.gotCount < expect && (
                            <div className="text-[10px] text-red-600">ขาด {expect - r.gotCount} ใบ</div>
                          )}
                        </td>
                        <td className={`px-2 py-2.5 text-right font-medium ${r.missing > 0 ? "text-red-600" : "text-slate-400"}`}>
                          {r.missing > 0 ? fmtBaht(r.missing) : "—"}
                        </td>
                        <td className="px-2 py-2.5">
                          {ok ? (
                            <span className="inline-flex items-center gap-1 text-emerald-600 text-xs">
                              <CheckCircle2 className="w-3.5 h-3.5" />ครบ
                            </span>
                          ) : r.missing > 0 ? (
                            <span className="inline-flex items-center gap-1 text-red-600 text-xs">
                              <AlertTriangle className="w-3.5 h-3.5" />ใบกำกับยังไม่ครบ
                            </span>
                          ) : (
                            <span className="text-xs text-amber-600">ในระบบมากกว่าใบแจ้ง — ตรวจซ้ำ</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="text-xs text-slate-400 px-4 py-3">
                &quot;มีใบกำกับในระบบ&quot; = ผลรวมรายการเติมน้ำมันของรถคันนั้นในเดือนนี้ที่บันทึกไว้แล้ว ·
                ส่วนต่างที่เป็นบวก = เงินที่รูดไปแล้วแต่ยังไม่มีใบกำกับ (เคลม VAT ไม่ได้)
              </p>
            </div>
          )}

          {statements.length > 0 && (
            <p className="text-xs text-slate-400 mt-3">
              รอบที่บันทึกไว้แล้ว: {statements.map((s) => s.period).join(" · ")}
            </p>
          )}
        </>
      )}
    </FleetShell>
  );
}

// ---------- ตารางบัตร ----------
function CardTable({ cards, vehicles, onChanged }: {
  cards: FuelCard[]; vehicles: Vehicle[]; onChanged: () => void;
}) {
  const [busy, setBusy] = useState("");
  const inp = "w-full rounded-lg border border-slate-200 px-2 py-1 text-sm";

  const patch = async (id: string, p: Partial<FuelCard>) => {
    setBusy(id);
    try { await upsertCard({ id, ...p }); await onChanged(); } finally { setBusy(""); }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
      <table className="w-full text-sm min-w-[680px]">
        <thead>
          <tr className="text-left text-slate-500 border-b border-slate-100">
            <th className="px-4 py-3">เลขบัตร</th>
            <th className="px-2 py-3">ชื่อบัญชี</th>
            <th className="px-2 py-3">ผูกกับรถ</th>
            <th className="px-2 py-3 text-right">วงเงิน</th>
            <th className="px-2 py-3"></th>
          </tr>
        </thead>
        <tbody>
          {cards.map((c) => (
            <tr key={c.id} className={`border-b border-slate-50 ${busy === c.id ? "opacity-50" : ""}`}>
              <td className="px-4 py-2.5 font-mono text-xs text-slate-600">{c.card_no}</td>
              <td className="px-2 py-2.5">{c.account_name}</td>
              <td className="px-2 py-2.5 min-w-44">
                <select className={inp} value={c.vehicle_id ?? ""}
                  onChange={(e) => patch(c.id, { vehicle_id: e.target.value || null })}>
                  <option value="">— ยังไม่ผูก —</option>
                  {vehicles.map((v) => <option key={v.id} value={v.id}>{v.plate}</option>)}
                </select>
              </td>
              <td className="px-2 py-2.5 text-right text-slate-500">{fmtBaht(c.credit_limit)}</td>
              <td className="px-2 py-2.5">
                <button
                  onClick={async () => {
                    if (confirm(`ลบบัตร ${c.account_name}?`)) { await deleteCard(c.id); onChanged(); }
                  }}
                  className="p-1.5 text-slate-300 hover:text-red-600">
                  <Trash2 className="w-4 h-4" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-slate-400 px-4 py-3">
        ผูกจากชื่อบัญชีบัตรในใบแจ้งยอดให้แล้วอัตโนมัติ (เช่น &quot;ISUZU 72-5949&quot; → ทะเบียน 72-5949)
        · แก้ได้ถ้าย้ายบัตรไปรถคันอื่น · วันที่บันทึกล่าสุด {fmtDate(cards[0]?.created_at)}
      </p>
    </div>
  );
}
