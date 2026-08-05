"use client";

// เฟส 5 — รายงาน & บัญชี: ต้นทุนรายคัน/เดือน + ทะเบียนทรัพย์สิน (ค่าเสื่อม) + Timeline รายคัน + Export Excel
import { useEffect, useMemo, useState } from "react";
import FleetShell from "@/components/FleetShell";
import { BarChart3, Download, FileSpreadsheet } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  bookValue, fmtBaht, fmtDate,
  type Claim, type FuelLog, type MaintLog, type Tire, type Vehicle, type VehicleDoc,
} from "@/lib/types";
import {
  buildCostRows, buildTimeline, exportXlsx, type TimelineEvent,
} from "@/lib/report";
import {
  listClaims, listDocs, listFuelLogs, listMaintLogs, listTires, listVehicles,
} from "@/lib/fleetApi";

const KIND_BADGE: Record<TimelineEvent["kind"], string> = {
  "น้ำมัน": "bg-sky-50 text-sky-700 border-sky-200",
  "ซ่อม": "bg-amber-50 text-amber-700 border-amber-200",
  "ยาง": "bg-violet-50 text-violet-700 border-violet-200",
  "เอกสาร": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "เคลม": "bg-red-50 text-red-700 border-red-200",
};

export default function ReportsPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [fuel, setFuel] = useState<FuelLog[]>([]);
  const [maint, setMaint] = useState<MaintLog[]>([]);
  const [tires, setTires] = useState<Tire[]>([]);
  const [docs, setDocs] = useState<VehicleDoc[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<"cost" | "assets" | "timeline">("cost");
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [tlVehicle, setTlVehicle] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [v, f, m, t, d, c] = await Promise.all([
          listVehicles(), listFuelLogs(), listMaintLogs(), listTires(), listDocs(), listClaims(),
        ]);
        setVehicles(v); setFuel(f); setMaint(m); setTires(t); setDocs(d); setClaims(c);
        setErr("");
      } catch (e) {
        setErr(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const costRows = useMemo(
    () => buildCostRows(month, vehicles, fuel, maint, tires, docs, claims)
      .sort((a, b) => b.total - a.total),
    [month, vehicles, fuel, maint, tires, docs, claims]
  );
  const costTotal = useMemo(() => ({
    fuel: costRows.reduce((s, r) => s + r.fuel, 0),
    maint: costRows.reduce((s, r) => s + r.maint, 0),
    tire: costRows.reduce((s, r) => s + r.tire, 0),
    doc: costRows.reduce((s, r) => s + r.doc, 0),
    claim: costRows.reduce((s, r) => s + r.claim, 0),
    dep: costRows.reduce((s, r) => s + r.dep, 0),
    total: costRows.reduce((s, r) => s + r.total, 0),
  }), [costRows]);

  const chartData = useMemo(
    () => costRows.filter((r) => r.total > 0).slice(0, 10)
      .map((r) => ({ name: r.vehicle.plate, total: Math.round(r.total) })),
    [costRows]
  );

  const timeline = useMemo(
    () => (tlVehicle ? buildTimeline(tlVehicle, fuel, maint, tires, docs, claims) : []),
    [tlVehicle, fuel, maint, tires, docs, claims]
  );

  const nameOf = (v: Vehicle) => v.plate + (v.nickname ? ` (${v.nickname})` : "");

  // ---------- Export ----------
  const exportCost = () => exportXlsx(
    `fleet-cost-${month}.xlsx`, `ต้นทุน ${month}`,
    [
      ["รายงานต้นทุนยานพาหนะ ประจำเดือน", month],
      [],
      ["ทะเบียน", "ประเภท", "สาขา", "น้ำมัน", "ซ่อมบำรุง", "ยาง", "เอกสาร/ประกัน/ภาษี", "เคลม (จ่ายเอง)", "ค่าเสื่อม", "รวม"],
      ...costRows.map((r) => [
        nameOf(r.vehicle), r.vehicle.vtype, r.vehicle.branch ?? "",
        r.fuel, r.maint, r.tire, r.doc, r.claim, Math.round(r.dep), Math.round(r.total),
      ]),
      ["รวมทั้งหมด", "", "", costTotal.fuel, costTotal.maint, costTotal.tire, costTotal.doc,
        costTotal.claim, Math.round(costTotal.dep), Math.round(costTotal.total)],
    ]
  );

  const exportAssets = () => exportXlsx(
    "fleet-assets.xlsx", "ทะเบียนทรัพย์สิน",
    [
      ["ทะเบียนทรัพย์สินยานพาหนะ ณ วันที่", new Date().toISOString().slice(0, 10)],
      [],
      ["ทะเบียน", "ประเภท", "ยี่ห้อ/รุ่น", "เลขตัวถัง", "เลขเครื่อง", "จังหวัด", "สาขา",
        "วันที่ซื้อ", "ราคาซื้อ", "อายุค่าเสื่อม (ปี)", "ซาก (%)", "ค่าเสื่อมสะสม",
        "มูลค่าตามบัญชี", "สถานะ", "กรรมสิทธิ์"],
      ...vehicles.map((v) => {
        const bv = bookValue(v);
        const accDep = v.purchase_price != null && bv != null ? v.purchase_price - bv : null;
        return [
          nameOf(v), v.vtype, [v.brand, v.model].filter(Boolean).join(" "), v.vin ?? "",
          v.engine_no ?? "", v.plate_province ?? "", v.branch ?? "",
          v.purchase_date ?? "", v.purchase_price ?? "",
          v.depreciation_years ?? 5, v.salvage_pct ?? 10,
          accDep != null ? Math.round(accDep) : "", bv != null ? Math.round(bv) : "",
          v.status, v.finance_status ?? "",
        ];
      }),
    ]
  );

  return (
    <FleetShell>
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-teal-600" /> รายงาน & บัญชี
        </h1>
        {tab !== "timeline" && (
          <button onClick={tab === "cost" ? exportCost : exportAssets}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-4 py-2 rounded-xl">
            <FileSpreadsheet className="w-4 h-4" /> Export Excel
          </button>
        )}
      </div>

      <div className="flex gap-2 mb-4 flex-wrap items-center">
        {([["cost", "ต้นทุนรายคัน"], ["assets", "ทะเบียนทรัพย์สิน"], ["timeline", "Timeline รายคัน"]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-1.5 rounded-full text-sm ${
              tab === k ? "bg-teal-600 text-white font-medium" : "bg-white border border-slate-200 text-slate-600"
            }`}>{label}</button>
        ))}
        {tab === "cost" && (
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)}
            className="ml-auto rounded-xl border border-slate-200 bg-white text-sm px-3 py-2" />
        )}
        {tab === "timeline" && (
          <select value={tlVehicle} onChange={(e) => setTlVehicle(e.target.value)}
            className="ml-auto rounded-xl border border-slate-200 bg-white text-sm px-3 py-2">
            <option value="">— เลือกรถ —</option>
            {vehicles.map((v) => <option key={v.id} value={v.id}>{nameOf(v)}</option>)}
          </select>
        )}
      </div>

      {err && <p className="text-red-600 text-sm mb-3">{err}</p>}
      {loading ? (
        <p className="text-slate-400">กำลังโหลด…</p>
      ) : tab === "cost" ? (
        <>
          {chartData.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 mb-4">
              <div className="text-sm font-medium text-slate-700 mb-2">ต้นทุนรวมต่อคัน เดือน {month} (10 อันดับแรก)</div>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} width={56} />
                    <Tooltip formatter={(v) => [`${Number(v).toLocaleString()} ฿`, "ต้นทุนรวม"]} />
                    <Bar dataKey="total" fill="#0d9488" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
            <table className="w-full text-sm min-w-[880px]">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-100">
                  <th className="px-4 py-3">รถ</th>
                  <th className="px-2 py-3 text-right">น้ำมัน</th>
                  <th className="px-2 py-3 text-right">ซ่อมบำรุง</th>
                  <th className="px-2 py-3 text-right">ยาง</th>
                  <th className="px-2 py-3 text-right">เอกสาร/ประกัน</th>
                  <th className="px-2 py-3 text-right">เคลม</th>
                  <th className="px-2 py-3 text-right">ค่าเสื่อม</th>
                  <th className="px-2 py-3 text-right">รวม</th>
                </tr>
              </thead>
              <tbody>
                {costRows.map((r) => (
                  <tr key={r.vehicle.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-slate-800">{r.vehicle.plate}</div>
                      <div className="text-xs text-slate-400">{r.vehicle.vtype}{r.vehicle.branch ? ` · ${r.vehicle.branch}` : ""}</div>
                    </td>
                    <td className="px-2 py-2.5 text-right">{fmtBaht(r.fuel || null)}</td>
                    <td className="px-2 py-2.5 text-right">{fmtBaht(r.maint || null)}</td>
                    <td className="px-2 py-2.5 text-right">{fmtBaht(r.tire || null)}</td>
                    <td className="px-2 py-2.5 text-right">{fmtBaht(r.doc || null)}</td>
                    <td className="px-2 py-2.5 text-right">{fmtBaht(r.claim || null)}</td>
                    <td className="px-2 py-2.5 text-right text-slate-500">{fmtBaht(Math.round(r.dep) || null)}</td>
                    <td className="px-2 py-2.5 text-right font-semibold">{fmtBaht(Math.round(r.total) || null)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-700">
                  <td className="px-4 py-3">รวมทั้งหมด ({costRows.length} คัน)</td>
                  <td className="px-2 py-3 text-right">{fmtBaht(costTotal.fuel || null)}</td>
                  <td className="px-2 py-3 text-right">{fmtBaht(costTotal.maint || null)}</td>
                  <td className="px-2 py-3 text-right">{fmtBaht(costTotal.tire || null)}</td>
                  <td className="px-2 py-3 text-right">{fmtBaht(costTotal.doc || null)}</td>
                  <td className="px-2 py-3 text-right">{fmtBaht(costTotal.claim || null)}</td>
                  <td className="px-2 py-3 text-right">{fmtBaht(Math.round(costTotal.dep) || null)}</td>
                  <td className="px-2 py-3 text-right">{fmtBaht(Math.round(costTotal.total) || null)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="text-xs text-slate-400 mt-2">
            เอกสาร/ประกัน นับเดือนที่เริ่มคุ้มครอง · เคลม = ค่า excess จ่ายเอง นับเดือนเกิดเหตุ · ค่าเสื่อม = เส้นตรงรายเดือนตามที่ตั้งไว้รายคัน
          </p>
        </>
      ) : tab === "assets" ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="w-full text-sm min-w-[860px]">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-100">
                <th className="px-4 py-3">ทะเบียน</th>
                <th className="px-2 py-3">ยี่ห้อ/รุ่น</th>
                <th className="px-2 py-3">วันที่ซื้อ</th>
                <th className="px-2 py-3 text-right">ราคาซื้อ</th>
                <th className="px-2 py-3 text-right">ค่าเสื่อมสะสม</th>
                <th className="px-2 py-3 text-right">มูลค่าตามบัญชี</th>
                <th className="px-2 py-3">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {vehicles.map((v) => {
                const bv = bookValue(v);
                const accDep = v.purchase_price != null && bv != null ? v.purchase_price - bv : null;
                return (
                  <tr key={v.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-slate-800">{v.plate}</div>
                      <div className="text-xs text-slate-400">{v.vtype}{v.nickname ? ` · ${v.nickname}` : ""}</div>
                    </td>
                    <td className="px-2 py-2.5">{[v.brand, v.model].filter(Boolean).join(" ") || "—"}</td>
                    <td className="px-2 py-2.5">{fmtDate(v.purchase_date)}</td>
                    <td className="px-2 py-2.5 text-right">{fmtBaht(v.purchase_price)}</td>
                    <td className="px-2 py-2.5 text-right text-slate-500">{fmtBaht(accDep != null ? Math.round(accDep) : null)}</td>
                    <td className="px-2 py-2.5 text-right font-medium">{fmtBaht(bv != null ? Math.round(bv) : null)}</td>
                    <td className="px-2 py-2.5">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${
                        v.status === "ใช้งาน" ? "bg-emerald-50 text-emerald-700" :
                        v.status === "ซ่อม" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-500"
                      }`}>{v.status}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="text-xs text-slate-400 px-4 py-3">
            คันที่ยังไม่กรอกราคาซื้อ/วันที่ซื้อ จะไม่แสดงมูลค่า — เติมได้ที่หน้า "ทะเบียนรถ"
          </p>
        </div>
      ) : !tlVehicle ? (
        <p className="text-slate-400 bg-white rounded-2xl border border-slate-200 p-6 text-center">
          เลือกรถด้านบนเพื่อดูประวัติเหตุการณ์ทั้งหมดเรียงตามเวลา
        </p>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-50">
          {timeline.map((e, i) => (
            <div key={i} className="flex items-start gap-3 px-4 py-3">
              <span className={`shrink-0 mt-0.5 px-2 py-0.5 rounded-full text-xs border ${KIND_BADGE[e.kind]}`}>{e.kind}</span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-slate-800">{e.title}</div>
                {e.detail && <div className="text-xs text-slate-400 truncate">{e.detail}</div>}
              </div>
              <div className="text-right shrink-0">
                <div className="text-xs text-slate-400">{fmtDate(e.date)}</div>
                {e.amount != null && <div className="text-sm font-medium text-slate-700">{fmtBaht(e.amount)}</div>}
              </div>
            </div>
          ))}
          {!timeline.length && (
            <p className="text-slate-400 p-6 text-center">ยังไม่มีเหตุการณ์ของรถคันนี้</p>
          )}
        </div>
      )}

      {tab === "timeline" && tlVehicle && timeline.length > 0 && (
        <button
          onClick={() => {
            const v = vehicles.find((x) => x.id === tlVehicle);
            exportXlsx(
              `fleet-timeline-${v?.plate ?? "vehicle"}.xlsx`, "Timeline",
              [
                ["ประวัติรถ", v ? nameOf(v) : ""],
                [],
                ["วันที่", "ประเภท", "รายการ", "รายละเอียด", "จำนวนเงิน"],
                ...timeline.map((e) => [e.date, e.kind, e.title, e.detail, e.amount ?? ""]),
              ]
            );
          }}
          className="mt-3 flex items-center gap-1.5 text-sm text-emerald-700 hover:text-emerald-800">
          <Download className="w-4 h-4" /> Export Timeline เป็น Excel
        </button>
      )}
    </FleetShell>
  );
}
