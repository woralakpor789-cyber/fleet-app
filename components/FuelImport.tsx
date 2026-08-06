"use client";
// components/FuelImport.tsx — นำเข้าบิลน้ำมันทีละหลายใบ (เฟส 6E)
// ถ่ายรูปบิลมาลากใส่ → OCR ในเครื่อง → ตารางตรวจ/แก้ → บันทึกทีเดียว

import { useMemo, useRef, useState } from "react";
// (useMemo ใช้กับดัชนีบัตร)
import { AlertTriangle, CheckCircle, Fuel, Loader2, Plus, Trash2, Undo2, Upload, X } from "lucide-react";
import { FUEL_TYPES, type Vehicle, type FuelLog } from "@/lib/types";
import { isImageFile, isPdfFile, looksScanned, matchVehicle, normalizePlate, ocrImage, ocrScannedPdf, readPdfText } from "@/lib/docImport";
import { buildRowFromReceipt, emptyFuel, type ParsedFuel } from "@/lib/docImport/fuelParse";
import { matchVehicleByTxn, saveFuelBill, softDeleteFuelLog, uploadDocFile } from "@/lib/fleetApi";
import type { FuelCard } from "@/lib/types";

export default function FuelImport({
  vehicles, cards, onClose, onSaved,
}: {
  vehicles: Vehicle[];
  cards: FuelCard[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [rows, setRows] = useState<ParsedFuel[]>([]);
  const [busy, setBusy] = useState<{ done: number; total: number; name: string } | null>(null);
  const [ocrMsg, setOcrMsg] = useState("");
  const [keepFile, setKeepFile] = useState(true);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ saved: number; skipped: number; ids: string[] } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // ดัชนีบัตร: 4 ตัวท้าย → รถ (ใช้จับคู่จากเลขบัตรบนบิล แม่นกว่าอ่านทะเบียนไทย)
  const cardIndex = useMemo(
    () => cards.map((c) => ({
      last4: (c.card_no.match(/(\d{4})\s*$/)?.[1]) ?? "",
      vehicle_id: c.vehicle_id,
      account: c.account_name ?? "",
    })).filter((c) => c.last4),
    [cards]
  );

  const handleFiles = async (list: FileList | File[] | null) => {
    const files = list ? Array.from(list) : [];
    if (!files.length) return;
    setErr("");
    setBusy({ done: 0, total: files.length, name: files[0].name });
    const out: ParsedFuel[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      setBusy({ done: i, total: files.length, name: f.name });
      const path = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
      let text = "";
      try {
        if (isPdfFile(f.name)) {
          text = await readPdfText(f);
          if (looksScanned(text)) text = await ocrScannedPdf(f, (p, s) => setOcrMsg(`OCR ${p}% ${s}`));
        } else if (isImageFile(f.name)) {
          text = await ocrImage(f, (p, s) => setOcrMsg(`OCR ${p}% ${s}`));
        }
      } catch {
        setErr(`อ่าน "${f.name}" ไม่สำเร็จ`);
      }
      setOcrMsg("");
      const row = buildRowFromReceipt(
        `f${Date.now()}${i}`, f.name, text, cardIndex,
        (plate) => {
          const hit = vehicles.find((v) => normalizePlate(v.plate) === normalizePlate(plate)
            || (v.previous_plate && normalizePlate(v.previous_plate) === normalizePlate(plate)));
          return hit?.id ?? matchVehicle(path, vehicles)?.id ?? null;
        },
        f,
      );
      // OCR อ่านทะเบียน/เลขบัตรไม่ออก → หารถจากรายการรูดบัตร (วันที่+ยอดเงิน) ซึ่งตรวจแล้วว่าถูก
      if (!row.vehicle_id && row.fill_date && row.amount) {
        const hits = await matchVehicleByTxn(row.fill_date, row.amount);
        if (hits.length === 1) {
          row.vehicle_id = hits[0];
          row.flags = [...row.flags.filter((x) => !x.startsWith("จับคู่รถไม่ได้")), "จับคู่รถจากรายการรูดบัตร"];
        } else if (hits.length > 1) {
          row.flags = [...row.flags, `เข้าได้หลายคัน (${hits.length}) — เลือกเอง`];
        }
      }
      out.push(row);
    }
    setRows((r) => [...r, ...out]);
    setBusy(null);
  };

  const edit = (key: string, patch: Partial<ParsedFuel>) =>
    setRows((r) => r.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const removeRow = (key: string) => setRows((r) => r.filter((x) => x.key !== key));
  const addBlank = () => setRows((r) => [...r, emptyFuel(`m${Date.now()}${r.length}`)]);

  const ready = useMemo(
    () => rows.filter((r) => r.vehicle_id && r.fill_date && r.liters && r.amount).length,
    [rows]
  );

  const save = async () => {
    setSaving(true); setErr("");
    try {
      const ids: string[] = [];
      let skipped = 0;
      for (const r of rows) {
        if (!r.vehicle_id || !r.fill_date || !r.liters || !r.amount) { skipped++; continue; }
        const filePath = keepFile && r.file ? await uploadDocFile(r.file, "fuel") : null;
        const saved = await saveFuelBill({
          vehicle_id: r.vehicle_id, fill_date: r.fill_date,
          odometer: r.odometer ?? null, liters: r.liters, amount: r.amount,
          fuel_type: r.fuel_type || null, station: r.station || null,
          full_tank: false, file_path: filePath,
          tax_invoice_no: r.tax_invoice_no,
          vat_amount: r.vat_amount ?? Math.round((r.amount * 7 / 107) * 100) / 100,
          invoice_status: "ส่งบัญชีแล้ว",
          note: r.fileName ? `นำเข้าจากบิล ${r.fileName}` : null,
        }, vehicles.find((v) => v.id === r.vehicle_id));
        ids.push(saved.id);
      }
      setResult({ saved: ids.length, skipped, ids });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const undo = async () => {
    if (!result?.ids.length) return;
    setSaving(true);
    try {
      for (const id of result.ids) await softDeleteFuelLog(id);
      setResult(null); setRows([]); onSaved();
    } finally {
      setSaving(false);
    }
  };

  const inp = "w-full rounded-lg border border-slate-200 px-2 py-1 text-xs";

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-end md:items-center justify-center p-0 md:p-6">
      <div className="bg-white w-full md:max-w-5xl rounded-t-2xl md:rounded-2xl shadow-xl max-h-[94vh] flex flex-col">
        <div className="flex items-start justify-between gap-3 p-5 border-b border-slate-100">
          <div>
            <h2 className="font-bold text-slate-800 flex items-center gap-2">
              <Fuel className="w-5 h-5 text-teal-600" /> นำเข้าบิลน้ำมัน
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              ถ่ายรูปบิลมาลากใส่ได้เลย · OCR อ่านในเครื่อง 100% · ตรวจตัวเลขก่อนบันทึกเสมอ
            </p>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {result ? (
            <div className="text-center py-8">
              <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
              <p className="text-lg font-bold text-slate-800">บันทึกแล้ว {result.saved} รายการ</p>
              {result.skipped > 0 && <p className="text-sm text-slate-500 mt-1">ข้ามเพราะข้อมูลไม่ครบ {result.skipped}</p>}
              <div className="flex justify-center gap-2 mt-5">
                {result.saved > 0 && (
                  <button onClick={undo} disabled={saving}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm border border-slate-200 hover:bg-slate-50 disabled:opacity-50">
                    <Undo2 className="w-4 h-4" /> ยกเลิกการนำเข้า
                  </button>
                )}
                <button onClick={onClose} className="px-5 py-2 rounded-xl text-sm font-medium bg-teal-600 hover:bg-teal-700 text-white">เสร็จสิ้น</button>
              </div>
            </div>
          ) : (
            <>
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
                onClick={() => fileRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl py-10 text-center cursor-pointer transition-colors ${
                  dragOver ? "border-teal-500 bg-teal-50" : "border-slate-200 hover:border-teal-300"
                }`}
              >
                <Upload className="w-8 h-8 mx-auto text-slate-400 mb-2" />
                <p className="font-medium text-slate-700">ลากรูปบิลมาวาง หรือกดเลือก</p>
                <p className="text-xs text-slate-400 mt-1">รูป JPG/PNG หรือ PDF · หลายใบพร้อมกันได้ · ตั้งชื่อไฟล์ให้มีทะเบียนรถจะจับคู่ให้อัตโนมัติ</p>
                <input ref={fileRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp"
                  className="hidden" onChange={(e) => handleFiles(e.target.files)} />
              </div>

              <label className="flex items-center gap-2 mt-3 text-sm cursor-pointer">
                <input type="checkbox" checked={keepFile} onChange={(e) => setKeepFile(e.target.checked)}
                  className="w-4 h-4 accent-teal-600" />
                <span className="text-slate-600">เก็บรูปบิลไว้ในระบบ</span>
              </label>

              {busy && (
                <p className="mt-3 text-sm text-teal-700 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  กำลังอ่าน {busy.done}/{busy.total} — {busy.name} {ocrMsg && <span className="text-slate-400">· {ocrMsg}</span>}
                </p>
              )}
              {err && <p className="mt-3 text-sm text-red-600">{err}</p>}

              {rows.length > 0 && (
                <div className="mt-4 border border-slate-200 rounded-2xl overflow-x-auto">
                  <table className="w-full text-xs min-w-[900px]">
                    <thead>
                      <tr className="text-left text-slate-500 border-b border-slate-100 bg-slate-50">
                        <th className="px-3 py-2">รถ *</th>
                        <th className="px-2 py-2">วันที่ *</th>
                        <th className="px-2 py-2">เลขไมล์</th>
                        <th className="px-2 py-2">ลิตร *</th>
                        <th className="px-2 py-2">บาท *</th>
                        <th className="px-2 py-2">ชนิด</th>
                        <th className="px-2 py-2">ปั๊ม</th>
                        <th className="px-2 py-2">เลขที่ใบกำกับ</th>
                        <th className="px-2 py-2">สถานะ</th>
                        <th className="px-2 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => {
                        const bad = !r.vehicle_id || !r.fill_date || !r.liters || !r.amount;
                        return (
                          <tr key={r.key} className={`border-b border-slate-50 ${bad ? "bg-amber-50/50" : ""}`}>
                            <td className="px-3 py-2 min-w-40">
                              <select className={inp} value={r.vehicle_id ?? ""}
                                onChange={(e) => edit(r.key, { vehicle_id: e.target.value || null })}>
                                <option value="">— เลือกรถ —</option>
                                {vehicles.map((v) => <option key={v.id} value={v.id}>{v.plate}{v.nickname ? ` (${v.nickname})` : ""}</option>)}
                              </select>
                              <div className="text-[10px] text-slate-400 mt-0.5 truncate max-w-40">{r.fileName || "เพิ่มเอง"}</div>
                            </td>
                            <td className="px-2 py-2">
                              <input type="date" className={inp} value={r.fill_date ?? ""}
                                onChange={(e) => edit(r.key, { fill_date: e.target.value || null })} />
                            </td>
                            <td className="px-2 py-2 w-24">
                              <input type="number" className={inp} value={r.odometer ?? ""}
                                onChange={(e) => edit(r.key, { odometer: e.target.value ? +e.target.value : null })} />
                            </td>
                            <td className="px-2 py-2 w-20">
                              <input type="number" step="0.01" className={inp} value={r.liters ?? ""}
                                onChange={(e) => edit(r.key, { liters: e.target.value ? +e.target.value : null })} />
                            </td>
                            <td className="px-2 py-2 w-24">
                              <input type="number" step="0.01" className={inp} value={r.amount ?? ""}
                                onChange={(e) => edit(r.key, { amount: e.target.value ? +e.target.value : null })} />
                            </td>
                            <td className="px-2 py-2 w-28">
                              <select className={inp} value={r.fuel_type ?? ""}
                                onChange={(e) => edit(r.key, { fuel_type: e.target.value || null })}>
                                <option value="">—</option>
                                {FUEL_TYPES.map((t) => <option key={t}>{t}</option>)}
                              </select>
                            </td>
                            <td className="px-2 py-2 w-24">
                              <input className={inp} value={r.station ?? ""}
                                onChange={(e) => edit(r.key, { station: e.target.value })} />
                            </td>
                            <td className="px-2 py-2 w-32">
                              <input className={inp} value={r.tax_invoice_no ?? ""}
                                onChange={(e) => edit(r.key, { tax_invoice_no: e.target.value })} />
                            </td>
                            <td className="px-2 py-2 max-w-36">
                              {bad ? (
                                <span className="inline-flex items-center gap-1 text-amber-700">
                                  <AlertTriangle className="w-3 h-3" />ข้อมูลไม่ครบ
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-emerald-600">
                                  <CheckCircle className="w-3 h-3" />พร้อมบันทึก
                                </span>
                              )}
                              {r.liters && r.amount ? (
                                <div className="text-[10px] text-slate-400 mt-0.5">
                                  {(r.amount / r.liters).toFixed(2)} ฿/ลิตร
                                </div>
                              ) : null}
                            </td>
                            <td className="px-2 py-2">
                              <button onClick={() => removeRow(r.key)} className="p-1 text-slate-300 hover:text-red-600">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <button onClick={addBlank} className="mt-3 inline-flex items-center gap-1.5 text-sm text-teal-700 hover:text-teal-800">
                <Plus className="w-4 h-4" /> เพิ่มแถวเอง (กรอกมือ)
              </button>
            </>
          )}
        </div>

        {!result && (
          <div className="flex items-center justify-between gap-3 p-4 border-t border-slate-100">
            <div className="text-xs text-slate-500">
              {rows.length > 0 && <>พร้อมบันทึก <b className="text-emerald-600">{ready}</b> จาก {rows.length} รายการ</>}
            </div>
            <div className="flex gap-2">
              <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-slate-600 hover:bg-slate-100">ปิด</button>
              <button onClick={save} disabled={saving || ready === 0}
                className="px-5 py-2 rounded-xl text-sm font-medium bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-40">
                {saving ? "กำลังบันทึก…" : `บันทึก ${ready} รายการ`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
