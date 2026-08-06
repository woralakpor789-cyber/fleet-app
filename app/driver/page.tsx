"use client";
// หน้าคนขับ — ส่งบิลน้ำมันจากมือถือ
// ล็อกอินด้วย Google + ต้องอยู่ในรายชื่อคนขับที่แอดมินอนุมัติ (DB ตัดสินสิทธิ์ผ่าน RLS)
// สแกน QR ในรถ → ?v=<vehicle_id> จะเลือกรถให้อัตโนมัติ
// ทุกใบเข้าคิว "รอตรวจ" ให้ backoffice อนุมัติก่อนถึงจะเป็นข้อมูลจริง

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Camera, CheckCircle2, ClipboardList, Fuel, Loader2, LogOut, Send, ShieldAlert, Truck,
} from "lucide-react";
import GoogleLoginButton, { type GoogleUser } from "@/components/GoogleLoginButton";
import { FUEL_TYPES } from "@/lib/types";
import { signOut } from "@/lib/auth";
import { ocrImage } from "@/lib/docImport/imageOcr";
import { parseFuelAmounts } from "@/lib/docImport/fuelParse";
import {
  amIDriver, driverVehicles, getContact, myEmail, mySubmissions, saveContact,
  submitFuel, uploadReceipt, type DriverVehicle, type MySubmission,
} from "@/lib/driverApi";

export default function DriverPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-400">กำลังโหลด…</div>}>
      <DriverInner />
    </Suspense>
  );
}

type Me = { email: string; name: string };

function DriverInner() {
  const params = useSearchParams();
  const preVehicle = params.get("v");
  const [me, setMe] = useState<Me | null>(null);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(true);
  const [loginErr, setLoginErr] = useState("");
  const [tab, setTab] = useState<"send" | "history">("send");

  const verify = useCallback(async (fallbackName?: string) => {
    const email = await myEmail();
    if (!email) { setMe(null); setAllowed(null); setChecking(false); return; }
    const ok = await amIDriver();
    const saved = getContact();
    setMe({ email, name: saved?.name || fallbackName || email });
    setAllowed(ok);
    setChecking(false);
  }, []);

  useEffect(() => { verify(); }, [verify]);

  const onLogin = async (u: GoogleUser) => {
    setLoginErr("");
    setChecking(true);
    await verify(u.name);
  };

  const logout = async () => {
    await signOut();
    setMe(null); setAllowed(null);
  };

  return (
    <main className="flex-1 max-w-md mx-auto w-full pb-10">
      <header className="bg-teal-800 text-white px-5 py-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-teal-600 flex items-center justify-center shrink-0">
          <Truck className="w-6 h-6" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold leading-tight">แจ้งเติมน้ำมัน</div>
          <div className="text-xs text-teal-200 truncate">
            {me ? me.email : "กู๊ด แอนด์ ริช เพาเวอร์พลัส"}
          </div>
        </div>
        {me && (
          <button onClick={logout} title="ออกจากระบบ" className="text-teal-200 hover:text-white">
            <LogOut className="w-5 h-5" />
          </button>
        )}
      </header>

      {checking ? (
        <p className="p-8 text-center text-slate-400">กำลังตรวจสอบสิทธิ์…</p>
      ) : !me ? (
        <div className="p-6 text-center">
          <p className="text-slate-600 mb-1">เข้าใช้งานด้วยบัญชี Google ของคุณ</p>
          <p className="text-xs text-slate-400 mb-5">ต้องเป็นบัญชีที่ออฟฟิศอนุมัติไว้แล้ว</p>
          <GoogleLoginButton onSuccess={onLogin} onError={setLoginErr} />
          {loginErr && <p className="mt-4 text-sm text-red-600">{loginErr}</p>}
        </div>
      ) : !allowed ? (
        <div className="p-8 text-center">
          <ShieldAlert className="w-12 h-12 text-amber-500 mx-auto mb-3" />
          <p className="font-bold text-slate-800">บัญชีนี้ยังไม่ได้รับสิทธิ์</p>
          <p className="text-sm text-slate-500 mt-1">
            แจ้งออฟฟิศให้เพิ่ม <b className="break-all">{me.email}</b> ในรายชื่อคนขับ
          </p>
          <button onClick={logout} className="mt-5 px-5 py-2 rounded-xl border border-slate-200 text-sm text-slate-600">
            เปลี่ยนบัญชี
          </button>
        </div>
      ) : (
        <>
          <div className="flex gap-1 px-4 pt-4">
            {([["send", "ส่งบิล"], ["history", "ประวัติที่ส่ง"]] as const).map(([k, label]) => (
              <button key={k} onClick={() => setTab(k)}
                className={`flex-1 py-2 rounded-xl text-sm ${
                  tab === k ? "bg-teal-600 text-white font-medium" : "bg-white border border-slate-200 text-slate-600"
                }`}>{label}</button>
            ))}
          </div>
          {tab === "send" ? <SendForm me={me} preVehicle={preVehicle} /> : <History />}
        </>
      )}
    </main>
  );
}

// ---------- ฟอร์มส่งบิล ----------
function SendForm({ me, preVehicle }: { me: Me; preVehicle: string | null }) {
  const saved = getContact();
  const [vehicles, setVehicles] = useState<DriverVehicle[]>([]);
  const [vehicleId, setVehicleId] = useState(preVehicle ?? "");
  const [name, setName] = useState(saved?.name ?? me.name);
  const [phone, setPhone] = useState(saved?.phone ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [ocrMsg, setOcrMsg] = useState("");
  const [fillDate, setFillDate] = useState(new Date().toISOString().slice(0, 10));
  const [odometer, setOdometer] = useState("");
  const [liters, setLiters] = useState("");
  const [amount, setAmount] = useState("");
  const [fuelType, setFuelType] = useState("ดีเซล");
  const [station, setStation] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    driverVehicles().then(setVehicles).catch(() => setErr("โหลดรายชื่อรถไม่สำเร็จ"));
  }, []);

  const perLiter = useMemo(() => {
    const l = +liters, a = +amount;
    return l > 0 && a > 0 ? a / l : null;
  }, [liters, amount]);

  const pickFile = async (f: File | null) => {
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setOcrMsg("กำลังอ่านบิล…");
    try {
      const text = await ocrImage(f, (pct) => setOcrMsg(`กำลังอ่านบิล ${pct}%`));
      const { liters: L, amount: A } = parseFuelAmounts(text);
      if (L && !liters) setLiters(String(L));
      if (A && !amount) setAmount(String(A));
      setOcrMsg(L || A ? "อ่านได้บางส่วน — ตรวจตัวเลขให้ถูกก่อนส่ง" : "อ่านบิลไม่ออก — กรอกเองได้เลย");
    } catch {
      setOcrMsg("อ่านบิลไม่ออก — กรอกเองได้เลย");
    }
  };

  const send = async () => {
    if (!vehicleId) { setErr("เลือกรถ"); return; }
    if (!name.trim()) { setErr("กรอกชื่อผู้ส่ง"); return; }
    if (!fillDate) { setErr("เลือกวันที่"); return; }
    if (!(+liters > 0)) { setErr("กรอกจำนวนลิตร"); return; }
    if (!(+amount > 0)) { setErr("กรอกยอดเงิน"); return; }
    setBusy(true); setErr("");
    try {
      saveContact({ name: name.trim(), phone: phone.trim() });
      const path = file ? await uploadReceipt(file) : null;
      await submitFuel({
        vehicle_id: vehicleId, driver_name: name.trim(), driver_phone: phone.trim(),
        driver_email: me.email, fill_date: fillDate,
        odometer: odometer ? +odometer : null, liters: +liters, amount: +amount,
        fuel_type: fuelType || null, station: station || null, file_path: path,
      });
      setDone(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "ส่งไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="p-8 text-center">
        <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto mb-3" />
        <p className="text-lg font-bold text-slate-800">ส่งเรียบร้อยแล้ว</p>
        <p className="text-sm text-slate-500 mt-1">รอออฟฟิศตรวจสอบ · ดูสถานะได้ที่แท็บ &quot;ประวัติที่ส่ง&quot;</p>
        <button
          onClick={() => {
            setDone(false); setFile(null); setPreview(""); setLiters(""); setAmount("");
            setOdometer(""); setStation(""); setOcrMsg("");
          }}
          className="mt-6 px-6 py-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-medium">
          ส่งใบถัดไป
        </button>
      </div>
    );
  }

  const inp = "w-full rounded-xl border border-slate-200 px-4 py-3 text-base";
  const lbl = "text-xs text-slate-500 mb-1 block";

  return (
    <div className="p-5 space-y-3">
      <div><span className={lbl}>รถ *</span>
        <select className={inp} value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
          <option value="">— เลือกรถ —</option>
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>{v.plate}{v.nickname ? ` (${v.nickname})` : ""}</option>
          ))}
        </select>
        {preVehicle && vehicleId === preVehicle && (
          <p className="text-xs text-emerald-600 mt-1">เลือกจาก QR ในรถให้แล้ว</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div><span className={lbl}>ชื่อผู้ส่ง *</span>
          <input className={inp} value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div><span className={lbl}>เบอร์โทร</span>
          <input className={inp} inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
      </div>

      <div>
        <span className={lbl}>รูปบิล</span>
        <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-2xl py-7 cursor-pointer active:bg-slate-50">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="บิล" className="max-h-44 rounded-lg" />
          ) : (
            <>
              <Camera className="w-8 h-8 text-slate-400" />
              <span className="text-sm text-slate-600 font-medium">ถ่ายรูปบิล</span>
              <span className="text-xs text-slate-400">หรือเลือกรูปจากเครื่อง</span>
            </>
          )}
          <input type="file" accept="image/*" capture="environment" className="hidden"
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
        </label>
        {ocrMsg && (
          <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
            {ocrMsg.startsWith("กำลัง") && <Loader2 className="w-3 h-3 animate-spin" />}{ocrMsg}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div><span className={lbl}>วันที่เติม *</span>
          <input type="date" className={inp} value={fillDate} onChange={(e) => setFillDate(e.target.value)} /></div>
        <div><span className={lbl}>เลขไมล์ (กม.)</span>
          <input type="number" inputMode="numeric" className={inp} value={odometer}
            onChange={(e) => setOdometer(e.target.value)} placeholder="ดูจากหน้าปัด" /></div>
        <div><span className={lbl}>จำนวนลิตร *</span>
          <input type="number" inputMode="decimal" step="0.01" className={inp} value={liters}
            onChange={(e) => setLiters(e.target.value)} /></div>
        <div><span className={lbl}>ยอดเงิน (บาท) *</span>
          <input type="number" inputMode="decimal" step="0.01" className={inp} value={amount}
            onChange={(e) => setAmount(e.target.value)} /></div>
        <div><span className={lbl}>ชนิดน้ำมัน</span>
          <select className={inp} value={fuelType} onChange={(e) => setFuelType(e.target.value)}>
            {FUEL_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select></div>
        <div><span className={lbl}>ปั๊ม</span>
          <input className={inp} value={station} onChange={(e) => setStation(e.target.value)} placeholder="เช่น ปตท." /></div>
      </div>

      {perLiter && (
        <p className="text-sm text-slate-500">
          คิดเป็น <b className="text-slate-700">{perLiter.toFixed(2)} ฿/ลิตร</b>
          {(perLiter < 15 || perLiter > 60) && <span className="text-red-600"> · ดูผิดปกติ ตรวจตัวเลขอีกครั้ง</span>}
        </p>
      )}
      {err && <p className="text-sm text-red-600">{err}</p>}

      <button onClick={send} disabled={busy}
        className="w-full py-4 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-base flex items-center justify-center gap-2 disabled:opacity-50">
        {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
        {busy ? "กำลังส่ง…" : "ส่งให้ออฟฟิศ"}
      </button>
      <p className="text-xs text-slate-400 text-center">ออฟฟิศจะตรวจสอบก่อนบันทึกเข้าระบบ</p>
    </div>
  );
}

// ---------- ประวัติที่ส่ง ----------
function History() {
  const [rows, setRows] = useState<MySubmission[] | null>(null);
  const [plates, setPlates] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    mySubmissions().then(setRows);
    driverVehicles().then((vs) => setPlates(new Map(vs.map((v) => [v.id, v.plate])))).catch(() => {});
  }, []);

  if (!rows) return <p className="p-6 text-center text-slate-400">กำลังโหลด…</p>;
  if (!rows.length) return (
    <div className="p-8 text-center text-slate-400">
      <ClipboardList className="w-8 h-8 mx-auto mb-2 text-slate-300" />ยังไม่มีรายการที่ส่ง
    </div>
  );

  return (
    <div className="p-4 space-y-2">
      {rows.map((r) => (
        <div key={r.id} className="bg-white border border-slate-200 rounded-2xl p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                <Fuel className="w-4 h-4 text-teal-600" />{plates.get(r.vehicle_id) ?? "รถ"}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                {r.fill_date} · {r.liters} ลิตร · {r.amount.toLocaleString()} ฿
              </div>
            </div>
            <span className={`px-2 py-0.5 rounded-full text-xs shrink-0 ${
              r.status === "อนุมัติ" ? "bg-emerald-50 text-emerald-700"
                : r.status === "ปฏิเสธ" ? "bg-red-50 text-red-700"
                : "bg-amber-50 text-amber-700"
            }`}>{r.status}</span>
          </div>
          {r.reject_reason && <p className="text-xs text-red-600 mt-2">เหตุผล: {r.reject_reason}</p>}
        </div>
      ))}
    </div>
  );
}
