"use client";

// ภาพรวม — สรุปจำนวนรถ + เอกสารใกล้หมดอายุ (เฟส 1-2) · ซ่อม/น้ำมันจะมาเฟส 3-4
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import FleetShell from "@/components/FleetShell";
import { AlertTriangle, Car, FileText, Fuel, Wrench } from "lucide-react";
import {
  daysToExpiry, expiryLevel, fmtBaht, fmtDate, planDue, tireDue,
  type FuelLog, type MaintPlan, type Tire, type Vehicle, type VehicleDoc,
} from "@/lib/types";
import { listDocs, listFuelLogs, listPlans, listTires, listVehicles } from "@/lib/fleetApi";

export default function HomePage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [docs, setDocs] = useState<VehicleDoc[]>([]);
  const [plans, setPlans] = useState<MaintPlan[]>([]);
  const [tires, setTires] = useState<Tire[]>([]);
  const [fuel, setFuel] = useState<FuelLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [v, d, p, t, fl] = await Promise.all([
          listVehicles(), listDocs(), listPlans(), listTires(), listFuelLogs(),
        ]);
        setVehicles(v); setDocs(d); setPlans(p); setTires(t); setFuel(fl);
      } catch { /* หน้า overview — เงียบไว้ */ }
      setLoading(false);
    })();
  }, []);

  const expiring = useMemo(
    () => docs
      .map((d) => ({ ...d, days: daysToExpiry(d.expiry_date) }))
      .filter((d) => expiryLevel(d.days) !== "ok")
      .sort((a, b) => a.days - b.days)
      .slice(0, 8),
    [docs]
  );

  const plateOf = useMemo(() => {
    const m = new Map(vehicles.map((v) => [v.id, v.plate]));
    return (id: string) => m.get(id) ?? "?";
  }, [vehicles]);

  // งานซ่อมที่ถึงรอบ/ใกล้ถึงรอบ (แผน + ยาง)
  const maintAlerts = useMemo(() => {
    const vById = new Map(vehicles.map((v) => [v.id, v]));
    const p = plans.map((x) => planDue(x, vById.get(x.vehicle_id)).level);
    const t = tires.map((x) => tireDue(x, vById.get(x.vehicle_id)).level);
    const all = [...p, ...t];
    return { due: all.filter((l) => l === "due").length, near: all.filter((l) => l === "near").length };
  }, [plans, tires, vehicles]);

  const cards = [
    { icon: Car, label: "รถทั้งหมด", value: loading ? "…" : String(vehicles.length), href: "/vehicles", note: `ใช้งาน ${vehicles.filter((v) => v.status === "ใช้งาน").length} คัน` },
    { icon: FileText, label: "เอกสารใกล้หมดอายุ", value: loading ? "…" : String(expiring.length), href: "/documents", note: "ภายใน 60 วัน" },
    { icon: Wrench, label: "ถึงรอบซ่อมบำรุง", value: loading ? "…" : String(maintAlerts.due), href: "/maintenance", note: `ใกล้ถึงรอบอีก ${maintAlerts.near}` },
    {
      icon: Fuel, label: "ค่าน้ำมันเดือนนี้",
      value: loading ? "…" : fmtBaht(
        fuel.filter((l) => l.fill_date.startsWith(new Date().toISOString().slice(0, 7)))
          .reduce((s, l) => s + l.amount, 0) || null),
      href: "/fuel", note: "จากบันทึกการเติม",
    },
  ];

  return (
    <FleetShell>
      <h1 className="text-xl font-bold text-slate-800 mb-4">ภาพรวม</h1>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map(({ icon: Icon, label, value, note, href }) => (
          <Link key={label} href={href}
            className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 hover:border-teal-300 transition-colors">
            <div className="flex items-center gap-2 text-slate-500 text-sm">
              <Icon className="w-4 h-4 text-teal-600" /> {label}
            </div>
            <div className="text-2xl font-bold text-slate-800 mt-2">{value}</div>
            <div className="text-xs text-slate-400 mt-1">{note}</div>
          </Link>
        ))}
      </div>

      {/* รายการแจ้งเตือนเอกสาร */}
      <h2 className="font-bold text-slate-700 mt-6 mb-3 flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-500" /> เอกสารที่ต้องจัดการ
      </h2>
      {loading ? (
        <p className="text-slate-400 text-sm">กำลังโหลด…</p>
      ) : expiring.length ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-50">
          {expiring.map((d) => (
            <Link key={d.id} href="/documents" className="flex items-center justify-between px-4 py-3 hover:bg-slate-50">
              <div>
                <span className="font-medium text-slate-800">{plateOf(d.vehicle_id)}</span>
                <span className="text-slate-500 text-sm"> · {d.doc_type}{d.provider ? ` (${d.provider})` : ""}</span>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                d.days < 0 ? "bg-red-100 text-red-700" :
                d.days <= 30 ? "bg-orange-50 text-orange-600" : "bg-amber-50 text-amber-700"
              }`}>
                {d.days < 0 ? `หมดอายุ ${-d.days} วันแล้ว` : `${fmtDate(d.expiry_date)} · เหลือ ${d.days} วัน`}
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-400 bg-white rounded-2xl border border-slate-200 p-4">
          ไม่มีเอกสารใกล้หมดอายุใน 60 วัน — เพิ่มข้อมูล พ.ร.บ./ประกัน/ภาษี ได้ที่เมนู "เอกสาร/ภาษี"
        </p>
      )}
    </FleetShell>
  );
}
