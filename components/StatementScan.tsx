"use client";
// components/StatementScan.tsx — อ่านใบแจ้งยอดฟลีทการ์ดจากไฟล์ (PDF/JPG/PNG) มาเติมในตาราง
// ไฟล์ไม่ออกนอกเครื่อง อ่านในเบราว์เซอร์ล้วน · ผลลัพธ์ต้องให้คนตรวจก่อนเสมอ

import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FileSearch, Loader2, Upload, X } from "lucide-react";
import { fmtBaht } from "@/lib/types";
import { scanStatement, type StatementScan as ScanResult } from "@/lib/statementImport";
import type { FuelCard } from "@/lib/types";

export default function StatementScanModal({
  cards, onClose, onApply,
}: {
  cards: FuelCard[];
  onClose: () => void;
  onApply: (r: ScanResult) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [err, setErr] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const accounts = cards.map((c) => c.account_name ?? "").filter(Boolean);

  const run = async (list: FileList | File[] | null) => {
    const files = list ? Array.from(list) : [];
    if (!files.length) return;
    setBusy(true); setErr(""); setResult(null);
    try {
      const r = await scanStatement(files, accounts, setProgress);
      setResult(r);
      if (!r.lines.length) {
        setErr("อ่านไม่พบชื่อบัญชีบัตรในไฟล์ — ลองสแกนใหม่ให้ตรงหัว/คมชัดขึ้น หรือคีย์เองในตาราง");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "อ่านไฟล์ไม่สำเร็จ");
    } finally {
      setBusy(false); setProgress("");
    }
  };

  const sumLines = result?.lines.reduce((s, l) => s + l.amount, 0) ?? 0;
  const matchTotal = result?.total != null && Math.abs(sumLines - result.total) < 0.5;

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-end md:items-center justify-center p-0 md:p-6">
      <div className="bg-white w-full md:max-w-2xl rounded-t-2xl md:rounded-2xl shadow-xl max-h-[92vh] flex flex-col">
        <div className="flex items-start justify-between gap-3 p-5 border-b border-slate-100">
          <div>
            <h2 className="font-bold text-slate-800 flex items-center gap-2">
              <FileSearch className="w-5 h-5 text-teal-600" /> อ่านใบแจ้งยอดจากไฟล์
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              PDF / JPG / PNG · อ่านในเครื่อง 100% · ใช้ชื่อบัญชีบัตรที่มีอยู่เป็นจุดยึด จึงทนต่อสแกนกลับหัวได้
            </p>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); run(e.dataTransfer.files); }}
            onClick={() => !busy && fileRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl py-9 text-center cursor-pointer transition-colors ${
              dragOver ? "border-teal-500 bg-teal-50" : "border-slate-200 hover:border-teal-300"
            } ${busy ? "opacity-50 pointer-events-none" : ""}`}>
            <Upload className="w-8 h-8 mx-auto text-slate-400 mb-2" />
            <p className="font-medium text-slate-700">ลากหน้าสรุปบัญชีมาวาง หรือกดเลือก</p>
            <p className="text-xs text-slate-400 mt-1">
              ใส่เฉพาะ<b>หน้าแรก (สรุปบัญชี)</b> ก็พอ · ใส่หลายไฟล์พร้อมกันได้
            </p>
            <input ref={fileRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp"
              className="hidden" onChange={(e) => run(e.target.files)} />
          </div>

          {busy && (
            <p className="mt-3 text-sm text-teal-700 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> {progress || "กำลังอ่าน…"}
              <span className="text-xs text-slate-400">(OCR ใช้เวลาสักครู่ ห้ามปิดหน้านี้)</span>
            </p>
          )}
          {err && <p className="mt-3 text-sm text-red-600">{err}</p>}

          {result && (
            <>
              <div className="mt-4 flex flex-wrap gap-3 text-sm">
                <span className="text-slate-500">วันที่ในใบแจ้งยอด: <b className="text-slate-800">{result.statementDate ?? "อ่านไม่ได้"}</b></span>
                <span className="text-slate-500">ยอดรวมในใบ: <b className="text-slate-800">{result.total != null ? fmtBaht(result.total) : "อ่านไม่ได้"}</b></span>
                {result.rotated && <span className="text-xs text-slate-400">(ไฟล์กลับหัว — ระบบหมุนให้แล้ว)</span>}
              </div>

              <div className={`mt-3 rounded-xl p-3 text-sm border ${
                matchTotal ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                  : "bg-amber-50 border-amber-200 text-amber-800"
              }`}>
                {matchTotal ? (
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" />
                    อ่านได้ {result.lines.length} บัตร รวม {fmtBaht(sumLines)} — <b>ตรงกับยอดรวมในใบ</b> เชื่อถือได้
                  </span>
                ) : (
                  <span className="flex items-start gap-1.5">
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                    อ่านได้ {result.lines.length} บัตร รวม {fmtBaht(sumLines)}
                    {result.total != null && <> แต่ยอดรวมในใบคือ {fmtBaht(result.total)} — <b>ต่างกัน {fmtBaht(Math.abs(sumLines - result.total))} ต้องตรวจทีละบรรทัด</b></>}
                    {result.total == null && " — อ่านยอดรวมไม่ได้ ตรวจให้ครบก่อนบันทึก"}
                  </span>
                )}
              </div>

              {result.lines.length > 0 && (
                <div className="mt-3 border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-left text-slate-500">
                        <th className="px-3 py-2">ชื่อบัญชีบัตร</th>
                        <th className="px-3 py-2 text-right">ยอดที่อ่านได้</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.lines.map((l) => (
                        <tr key={l.account} className="border-t border-slate-50">
                          <td className="px-3 py-1.5">{l.account}</td>
                          <td className="px-3 py-1.5 text-right font-medium">{fmtBaht(l.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {result.lines.length < accounts.length && (
                <p className="text-xs text-amber-700 mt-2">
                  ⚠️ มี {accounts.length - result.lines.length} บัตรที่อ่านไม่เจอ — อาจไม่มียอดในรอบนี้ หรือ OCR อ่านไม่ออก ตรวจในตารางอีกครั้ง
                </p>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 p-4 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-slate-600 hover:bg-slate-100">ปิด</button>
          <button
            onClick={() => { if (result) { onApply(result); onClose(); } }}
            disabled={!result || !result.lines.length}
            className="px-5 py-2 rounded-xl text-sm font-medium bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-40">
            เติมลงตาราง ({result?.lines.length ?? 0} บัตร)
          </button>
        </div>
      </div>
    </div>
  );
}
