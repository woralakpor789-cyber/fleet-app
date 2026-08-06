"use client";
// components/BillCapture.tsx — ถ่ายรูปบิล/ใบกำกับภาษี → OCR ช่วยกรอก → ยืนยันข้อมูล → บันทึก
// ออกแบบสำหรับมือถือเป็นหลัก (ช่องกรอกใหญ่ ทีละขั้น) แต่ใช้บนคอมได้เหมือนกัน

import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle, Camera, Check, CheckCircle2, ChevronLeft, Loader2, Receipt, X,
} from "lucide-react";
import {
  FUEL_TYPES, INVOICE_STATUSES, fmtBaht, vatFromGross, type Vehicle,
} from "@/lib/types";
import { ocrImage } from "@/lib/docImport/imageOcr";
import { parseFuelAmounts } from "@/lib/docImport/fuelParse";
import { parseDates, parsePolicyNo } from "@/lib/docImport/parse";
import { saveFuelBill, uploadDocFile } from "@/lib/fleetApi";
import { getStoredUser } from "@/lib/auth";

type Step = "photo" | "confirm" | "done";

export default function BillCapture({
  vehicles, staffNames, onClose, onSaved,
}: {
  vehicles: Vehicle[];
  staffNames: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [step, setStep] = useState<Step>("photo");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [ocrMsg, setOcrMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState<{ mode: string; plate: string } | null>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const libRef = useRef<HTMLInputElement>(null);

  // ---- ข้อมูลที่จะบันทึก ----
  const [vehicleId, setVehicleId] = useState("");
  const [fillDate, setFillDate] = useState(new Date().toISOString().slice(0, 10));
  const [odometer, setOdometer] = useState("");
  const [liters, setLiters] = useState("");
  const [amount, setAmount] = useState("");
  const [fuelType, setFuelType] = useState("ดีเซล");
  const [station, setStation] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [invStatus, setInvStatus] = useState("ส่งบัญชีแล้ว");
  const [holder, setHolder] = useState("");
  const [note, setNote] = useState("");

  const perLiter = useMemo(() => {
    const l = +liters, a = +amount;
    return l > 0 && a > 0 ? a / l : null;
  }, [liters, amount]);
  const vat = +amount > 0 ? vatFromGross(+amount) : null;
  const vehicle = vehicles.find((v) => v.id === vehicleId);

  const pick = async (f: File | null) => {
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setStep("confirm");
    setOcrMsg("กำลังอ่านบิล…");
    try {
      const text = await ocrImage(f, (p) => setOcrMsg(`กำลังอ่านบิล ${p}%`));
      const { liters: L, amount: A } = parseFuelAmounts(text);
      if (L) setLiters(String(L));
      if (A) setAmount(String(A));
      const dates = parseDates(text);
      if (dates.length) setFillDate(dates[dates.length - 1]);
      const inv = parsePolicyNo(text);
      if (inv) setInvoiceNo(inv);
      setOcrMsg(L || A ? "อ่านได้บางส่วน — ตรวจตัวเลขให้ตรงกับบิลก่อนบันทึก" : "อ่านบิลไม่ออก — กรอกเองได้เลย");
    } catch {
      setOcrMsg("อ่านบิลไม่ออก — กรอกเองได้เลย");
    }
  };

  const save = async () => {
    if (!vehicleId) { setErr("เลือกรถ"); return; }
    if (!fillDate) { setErr("เลือกวันที่"); return; }
    if (!(+amount > 0)) { setErr("กรอกยอดเงิน"); return; }
    setBusy(true); setErr("");
    try {
      const path = file ? await uploadDocFile(file, "fuel") : null;
      const r = await saveFuelBill({
        vehicle_id: vehicleId, fill_date: fillDate,
        odometer: odometer ? +odometer : null,
        liters: liters ? +liters : null,
        amount: +amount,
        fuel_type: fuelType || null,
        station: station || null,
        file_path: path,
        tax_invoice_no: invoiceNo.trim() || null,
        vat_amount: vat,
        invoice_status: invStatus,
        invoice_holder: invStatus === "ส่งบัญชีแล้ว" ? null : (holder || null),
        invoice_returned_at: invStatus === "ส่งบัญชีแล้ว" ? fillDate : null,
        invoice_returned_to: invStatus === "ส่งบัญชีแล้ว" ? (getStoredUser()?.name ?? "บัญชี") : null,
        note: note || null,
        full_tank: false,
      }, vehicle);
      setResult({ mode: r.mode, plate: vehicle?.plate ?? "" });
      setStep("done");
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally { setBusy(false); }
  };

  const reset = () => {
    setFile(null); setPreview(""); setOcrMsg(""); setResult(null);
    setLiters(""); setAmount(""); setOdometer(""); setStation(""); setInvoiceNo(""); setNote("");
    setStep("photo");
  };

  const inp = "w-full rounded-xl border border-slate-200 px-4 py-3 text-base";
  const lbl = "text-xs text-slate-500 mb-1 block";

  return (
    <div className="fixed inset-0 z-50 bg-white md:bg-black/30 md:flex md:items-center md:justify-center md:p-6">
      <div className="bg-white w-full h-full md:h-auto md:max-w-lg md:rounded-2xl md:shadow-xl md:max-h-[92vh] flex flex-col">
        {/* หัว */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 shrink-0">
          {step === "confirm" ? (
            <button onClick={() => setStep("photo")} className="p-1 -m-1 text-slate-500">
              <ChevronLeft className="w-6 h-6" />
            </button>
          ) : null}
          <div className="flex-1">
            <h2 className="font-bold text-slate-800 flex items-center gap-2">
              <Receipt className="w-5 h-5 text-teal-600" />
              {step === "photo" ? "ถ่ายรูปบิลน้ำมัน" : step === "confirm" ? "ตรวจข้อมูลก่อนบันทึก" : "บันทึกแล้ว"}
            </h2>
            {step === "confirm" && (
              <p className="text-[11px] text-slate-400">ตรวจให้ตรงกับใบกำกับภาษีตัวจริง</p>
            )}
          </div>
          <button onClick={onClose} className="p-1 -m-1 text-slate-400"><X className="w-6 h-6" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {/* ---------- ขั้น 1: ถ่ายรูป ---------- */}
          {step === "photo" && (
            <div className="space-y-3 py-4">
              <button onClick={() => camRef.current?.click()}
                className="w-full flex flex-col items-center gap-2 py-10 rounded-2xl bg-teal-600 text-white active:bg-teal-700">
                <Camera className="w-10 h-10" />
                <span className="font-bold text-lg">ถ่ายรูปบิล</span>
                <span className="text-xs text-teal-100">เปิดกล้องมือถือ</span>
              </button>
              <button onClick={() => libRef.current?.click()}
                className="w-full py-4 rounded-2xl border-2 border-slate-200 text-slate-600 font-medium active:bg-slate-50">
                เลือกรูปจากเครื่อง
              </button>
              <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden"
                onChange={(e) => pick(e.target.files?.[0] ?? null)} />
              <input ref={libRef} type="file" accept="image/*" className="hidden"
                onChange={(e) => pick(e.target.files?.[0] ?? null)} />
              <p className="text-xs text-slate-400 text-center pt-2">
                ถ่ายให้เห็น <b>วันที่ · จำนวนลิตร · ยอดเงิน · เลขที่ใบกำกับ</b> ชัดเจน
                ระบบจะอ่านตัวเลขให้เบื้องต้น แล้วให้คุณตรวจอีกที
              </p>
            </div>
          )}

          {/* ---------- ขั้น 2: ยืนยันข้อมูล ---------- */}
          {step === "confirm" && (
            <div className="space-y-3">
              {preview && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="บิล" className="w-full max-h-52 object-contain rounded-xl border border-slate-200 bg-slate-50" />
              )}
              {ocrMsg && (
                <p className="text-xs text-slate-500 flex items-center gap-1">
                  {ocrMsg.startsWith("กำลัง") && <Loader2 className="w-3 h-3 animate-spin" />}{ocrMsg}
                </p>
              )}

              <div className="pt-1"><span className="text-sm font-semibold text-slate-700">① ข้อมูลรถ</span></div>
              <div><span className={lbl}>รถ *</span>
                <select className={inp} value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
                  <option value="">— เลือกรถ —</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>{v.plate}{v.nickname ? ` (${v.nickname})` : ""}</option>
                  ))}
                </select>
                {vehicle?.odometer != null && (
                  <p className="text-xs text-slate-400 mt-1">เลขไมล์ล่าสุดในระบบ {vehicle.odometer.toLocaleString()} กม.</p>
                )}
              </div>

              <div className="pt-2"><span className="text-sm font-semibold text-slate-700">② ข้อมูลการเติม</span></div>
              <div className="grid grid-cols-2 gap-3">
                <div><span className={lbl}>วันที่ *</span>
                  <input type="date" className={inp} value={fillDate} onChange={(e) => setFillDate(e.target.value)} /></div>
                <div><span className={lbl}>เลขไมล์ (กม.)</span>
                  <input type="number" inputMode="numeric" className={inp} value={odometer}
                    onChange={(e) => setOdometer(e.target.value)} /></div>
                <div><span className={lbl}>จำนวนลิตร</span>
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
                  <input className={inp} value={station} onChange={(e) => setStation(e.target.value)} /></div>
              </div>
              {perLiter && (
                <p className={`text-sm ${perLiter < 15 || perLiter > 60 ? "text-red-600" : "text-slate-500"}`}>
                  = <b>{perLiter.toFixed(2)} ฿/ลิตร</b>
                  {(perLiter < 15 || perLiter > 60) && " · ดูผิดปกติ ตรวจตัวเลขอีกครั้ง"}
                </p>
              )}

              <div className="pt-2"><span className="text-sm font-semibold text-slate-700">③ ใบกำกับภาษี</span></div>
              <div><span className={lbl}>เลขที่ใบกำกับภาษี</span>
                <input className={inp} value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)}
                  placeholder="ดูมุมบนของใบกำกับ" /></div>
              {vat != null && (
                <p className="text-sm text-slate-500">VAT ที่เคลมได้ <b className="text-slate-700">{fmtBaht(vat)}</b>
                  <span className="text-xs text-slate-400"> (คิดจากยอดรวม × 7/107)</span></p>
              )}
              <div><span className={lbl}>สถานะใบตัวจริง</span>
                <select className={inp} value={invStatus} onChange={(e) => setInvStatus(e.target.value)}>
                  {INVOICE_STATUSES.filter((s) => s !== "ยกยอด (ก่อนใช้ระบบ)").map((s) => <option key={s}>{s}</option>)}
                </select></div>
              {invStatus !== "ส่งบัญชีแล้ว" && invStatus !== "ไม่มีใบกำกับ" && (
                <div><span className={lbl}>ใบอยู่กับใคร</span>
                  <select className={inp} value={holder} onChange={(e) => setHolder(e.target.value)}>
                    <option value="">— ไม่ระบุ —</option>
                    {staffNames.map((n) => <option key={n}>{n}</option>)}
                  </select></div>
              )}
              <div><span className={lbl}>หมายเหตุ</span>
                <input className={inp} value={note} onChange={(e) => setNote(e.target.value)} /></div>

              {err && <p className="text-sm text-red-600">{err}</p>}
            </div>
          )}

          {/* ---------- ขั้น 3: เสร็จ ---------- */}
          {step === "done" && result && (
            <div className="text-center py-10">
              <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto mb-3" />
              <p className="text-lg font-bold text-slate-800">บันทึกเรียบร้อย</p>
              <p className="text-sm text-slate-500 mt-1">
                {result.mode === "updated"
                  ? <>เติมข้อมูลใส่รายการรูดบัตรที่มีอยู่แล้วของ <b>{result.plate}</b> — ไม่นับต้นทุนซ้ำ</>
                  : <>สร้างรายการใหม่ให้ <b>{result.plate}</b></>}
              </p>
              <div className="flex flex-col gap-2 mt-6">
                <button onClick={reset}
                  className="py-3.5 rounded-xl bg-teal-600 text-white font-bold">ถ่ายบิลใบถัดไป</button>
                <button onClick={onClose}
                  className="py-3 rounded-xl border border-slate-200 text-slate-600">ปิด</button>
              </div>
            </div>
          )}
        </div>

        {/* ปุ่มบันทึก */}
        {step === "confirm" && (
          <div className="p-4 border-t border-slate-100 shrink-0">
            {(!vehicleId || !(+amount > 0)) && (
              <p className="text-xs text-amber-700 mb-2 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" /> ต้องเลือกรถและกรอกยอดเงินก่อน
              </p>
            )}
            <button onClick={save} disabled={busy || !vehicleId || !(+amount > 0)}
              className="w-full py-4 rounded-xl bg-teal-600 text-white font-bold text-base flex items-center justify-center gap-2 disabled:opacity-40">
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
              {busy ? "กำลังบันทึก…" : "ยืนยันและบันทึก"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
