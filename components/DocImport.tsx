"use client";
// components/DocImport.tsx — นำเข้าเอกสารรถ (เฟส 6A + 6B)
// ลากไฟล์ พ.ร.บ./กรมธรรม์/ภาษี → อ่านในเบราว์เซอร์ (ไฟล์ไม่ออกนอกเครื่อง) → คนตรวจ/แก้ → บันทึกทีเดียว
// PDF ที่มี text layer อ่านวันที่/เบี้ย/เลขกรมธรรม์ได้ · ไฟล์สแกน/รูป ยังต้องกรอกวันที่เอง (OCR = เฟส 6C)

import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle, CheckCircle, FileText, Loader2, Plus, Trash2, Undo2, Upload, X,
} from "lucide-react";
import { DOC_TYPES, type Vehicle, type VehicleDoc } from "@/lib/types";
import { emptyDoc, readDocFiles, type ParsedDoc } from "@/lib/docImport";
import { insertDocsBulk, softDeleteDoc, uploadDocFile } from "@/lib/fleetApi";

export default function DocImport({
  vehicles, existingDocs, onClose, onSaved,
}: {
  vehicles: Vehicle[];
  existingDocs: VehicleDoc[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [rows, setRows] = useState<ParsedDoc[]>([]);
  const [busy, setBusy] = useState<{ done: number; total: number; name: string } | null>(null);
  const [ocrOn, setOcrOn] = useState(true);        // อ่านรูป/สแกนด้วย OCR (ช้าแต่ได้วันที่)
  const [keepFile, setKeepFile] = useState(true);  // เก็บไฟล์ต้นฉบับไว้ในระบบ
  const [ocrMsg, setOcrMsg] = useState("");
  const [notice, setNotice] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ saved: number; skippedDup: number; skippedBad: number; ids: string[] } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // คีย์กันซ้ำ: รถ + ประเภท + วันหมดอายุ
  const dupKeys = useMemo(
    () => new Set(existingDocs.map((d) => `${d.vehicle_id}|${d.doc_type}|${d.expiry_date}`)),
    [existingDocs]
  );

  const handleFiles = async (list: FileList | File[] | null) => {
    const files = list ? Array.from(list) : [];
    if (!files.length) return;
    setErr(""); setNotice("");
    setBusy({ done: 0, total: files.length, name: files[0].name });
    try {
      const parsed = await readDocFiles(files, vehicles, {
        useOcr: ocrOn,
        onFile: (done, total, name) => { setBusy({ done, total, name }); setOcrMsg(""); },
        onOcr: (pct, status) => setOcrMsg(status ? `OCR ${pct}% (${status})` : ""),
      });
      setOcrMsg("");
      setRows((r) => [...r, ...parsed]);
      const ok = parsed.filter((p) => p.vehicle_id && p.expiry_date).length;
      setNotice(
        `อ่าน ${parsed.length} ไฟล์ — อ่านครบพร้อมบันทึก ${ok} รายการ` +
        (ok < parsed.length ? ` · อีก ${parsed.length - ok} รายการต้องเติมข้อมูลเอง` : "")
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "อ่านไฟล์ไม่สำเร็จ");
    } finally {
      setBusy(null);
    }
  };

  const edit = (key: string, patch: Partial<ParsedDoc>) =>
    setRows((r) => r.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const removeRow = (key: string) => setRows((r) => r.filter((x) => x.key !== key));
  const addBlank = () => setRows((r) => [...r, emptyDoc(`m${Date.now()}${r.length}`)]);

  const stat = useMemo(() => {
    let ready = 0, dup = 0, bad = 0;
    for (const r of rows) {
      if (!r.vehicle_id || !r.expiry_date) { bad++; continue; }
      if (dupKeys.has(`${r.vehicle_id}|${r.doc_type}|${r.expiry_date}`)) { dup++; continue; }
      ready++;
    }
    return { ready, dup, bad };
  }, [rows, dupKeys]);

  const save = async () => {
    setSaving(true); setErr("");
    try {
      const seen = new Set(dupKeys);
      const payload: Partial<VehicleDoc>[] = [];
      let skippedDup = 0, skippedBad = 0;
      for (const r of rows) {
        if (!r.vehicle_id || !r.expiry_date) { skippedBad++; continue; }
        const k = `${r.vehicle_id}|${r.doc_type}|${r.expiry_date}`;
        if (seen.has(k)) { skippedDup++; continue; }
        seen.add(k);
        // เก็บไฟล์ต้นฉบับไว้ดูย้อนหลัง (ไม่สำเร็จก็ยังบันทึกข้อมูลต่อ)
        const filePath = keepFile && r.file ? await uploadDocFile(r.file) : null;
        payload.push({
          file_path: filePath,
          vehicle_id: r.vehicle_id, doc_type: r.doc_type,
          provider: r.provider || null, policy_no: r.policy_no || null,
          insurance_class: r.insurance_class || null,
          start_date: r.start_date || null, expiry_date: r.expiry_date,
          cost: r.cost ?? null,
          note: [r.note, r.fileName ? `นำเข้าจากไฟล์ ${r.fileName}` : null].filter(Boolean).join(" · ") || null,
        });
      }
      const saved = await insertDocsBulk(payload);
      setResult({ saved: saved.length, skippedDup, skippedBad, ids: saved.map((d) => d.id) });
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
      for (const id of result.ids) await softDeleteDoc(id);
      setResult(null); setRows([]); onSaved();
      setNotice("ยกเลิกการนำเข้าแล้ว");
    } finally {
      setSaving(false);
    }
  };

  const inp = "w-full rounded-lg border border-slate-200 px-2 py-1 text-xs";

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-end md:items-center justify-center p-0 md:p-6">
      <div className="bg-white w-full md:max-w-6xl rounded-t-2xl md:rounded-2xl shadow-xl max-h-[94vh] flex flex-col">
        {/* หัวข้อ */}
        <div className="flex items-start justify-between gap-3 p-5 border-b border-slate-100">
          <div>
            <h2 className="font-bold text-slate-800 flex items-center gap-2">
              <FileText className="w-5 h-5 text-teal-600" /> นำเข้าเอกสารรถ
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              อ่านไฟล์ในเครื่อง 100% · PDF กรมธรรม์/พ.ร.บ. อ่านวันหมดอายุให้อัตโนมัติ · จับคู่รถจากชื่อไฟล์
            </p>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {result ? (
            /* ---------- หน้าสรุปหลังบันทึก ---------- */
            <div className="text-center py-8">
              <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
              <p className="text-lg font-bold text-slate-800">บันทึกแล้ว {result.saved} รายการ</p>
              <p className="text-sm text-slate-500 mt-1">
                {result.skippedDup > 0 && `ข้ามเพราะซ้ำกับที่มีอยู่ ${result.skippedDup} · `}
                {result.skippedBad > 0 && `ข้ามเพราะข้อมูลไม่ครบ ${result.skippedBad}`}
              </p>
              <div className="flex justify-center gap-2 mt-5">
                {result.saved > 0 && (
                  <button onClick={undo} disabled={saving}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm border border-slate-200 hover:bg-slate-50 disabled:opacity-50">
                    <Undo2 className="w-4 h-4" /> ยกเลิกการนำเข้า
                  </button>
                )}
                <button onClick={onClose}
                  className="px-5 py-2 rounded-xl text-sm font-medium bg-teal-600 hover:bg-teal-700 text-white">
                  เสร็จสิ้น
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* ---------- กล่องลากไฟล์ ---------- */}
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
                <p className="font-medium text-slate-700">ลากไฟล์มาวาง หรือกดเลือก</p>
                <p className="text-xs text-slate-400 mt-1">
                  PDF กรมธรรม์/พ.ร.บ. (อ่านอัตโนมัติ) · รูป JPG/PNG (กรอกวันที่เอง) · หลายไฟล์พร้อมกันได้
                </p>
                <input ref={fileRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp"
                  className="hidden" onChange={(e) => handleFiles(e.target.files)} />
              </div>

              {/* ตัวเลือกการอ่าน */}
              <div className="flex flex-wrap gap-4 mt-3 text-sm">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={ocrOn} onChange={(e) => setOcrOn(e.target.checked)}
                    className="w-4 h-4 accent-teal-600" />
                  <span className="text-slate-600">อ่านรูป/ไฟล์สแกนด้วย OCR</span>
                  <span className="text-xs text-slate-400">(ช้ากว่า ~10 วิ/ไฟล์ แต่ได้วันหมดอายุ)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={keepFile} onChange={(e) => setKeepFile(e.target.checked)}
                    className="w-4 h-4 accent-teal-600" />
                  <span className="text-slate-600">เก็บไฟล์ต้นฉบับไว้ในระบบ</span>
                </label>
              </div>

              {busy && (
                <p className="mt-3 text-sm text-teal-700 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  กำลังอ่าน {busy.done}/{busy.total} — {busy.name}
                  {ocrMsg && <span className="text-slate-400">· {ocrMsg}</span>}
                </p>
              )}
              {notice && <p className="mt-3 text-sm text-slate-600">{notice}</p>}
              {err && <p className="mt-3 text-sm text-red-600">{err}</p>}

              {/* ---------- ตารางตรวจ/แก้ ---------- */}
              {rows.length > 0 && (
                <div className="mt-4 border border-slate-200 rounded-2xl overflow-x-auto">
                  <table className="w-full text-xs min-w-[980px]">
                    <thead>
                      <tr className="text-left text-slate-500 border-b border-slate-100 bg-slate-50">
                        <th className="px-3 py-2">รถ *</th>
                        <th className="px-2 py-2">ประเภท</th>
                        <th className="px-2 py-2">บริษัท</th>
                        <th className="px-2 py-2">เลขที่</th>
                        <th className="px-2 py-2">วันเริ่ม</th>
                        <th className="px-2 py-2">วันหมดอายุ *</th>
                        <th className="px-2 py-2">ค่าใช้จ่าย</th>
                        <th className="px-2 py-2">สถานะ</th>
                        <th className="px-2 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => {
                        const isDup = !!r.vehicle_id && !!r.expiry_date &&
                          dupKeys.has(`${r.vehicle_id}|${r.doc_type}|${r.expiry_date}`);
                        const bad = !r.vehicle_id || !r.expiry_date;
                        return (
                          <tr key={r.key} className={`border-b border-slate-50 ${bad ? "bg-amber-50/50" : isDup ? "bg-slate-50" : ""}`}>
                            <td className="px-3 py-2 min-w-44">
                              <select className={inp} value={r.vehicle_id ?? ""}
                                onChange={(e) => edit(r.key, { vehicle_id: e.target.value || null })}>
                                <option value="">— เลือกรถ —</option>
                                {vehicles.map((v) => (
                                  <option key={v.id} value={v.id}>{v.plate}{v.nickname ? ` (${v.nickname})` : ""}</option>
                                ))}
                              </select>
                              <div className="text-[10px] text-slate-400 mt-0.5 truncate max-w-44" title={r.fileName}>
                                {r.fileName || "เพิ่มเอง"}{r.plateGuess && !r.vehicle_id ? ` · เดา: ${r.plateGuess}` : ""}
                              </div>
                            </td>
                            <td className="px-2 py-2">
                              <select className={inp} value={r.doc_type}
                                onChange={(e) => edit(r.key, { doc_type: e.target.value })}>
                                {DOC_TYPES.map((t) => <option key={t}>{t}</option>)}
                              </select>
                            </td>
                            <td className="px-2 py-2 min-w-32">
                              <input className={inp} value={r.provider ?? ""}
                                onChange={(e) => edit(r.key, { provider: e.target.value })} />
                            </td>
                            <td className="px-2 py-2 min-w-28">
                              <input className={inp} value={r.policy_no ?? ""}
                                onChange={(e) => edit(r.key, { policy_no: e.target.value })} />
                            </td>
                            <td className="px-2 py-2">
                              <input type="date" className={inp} value={r.start_date ?? ""}
                                onChange={(e) => edit(r.key, { start_date: e.target.value || null })} />
                            </td>
                            <td className="px-2 py-2">
                              <input type="date" className={inp} value={r.expiry_date ?? ""}
                                onChange={(e) => edit(r.key, { expiry_date: e.target.value || null })} />
                            </td>
                            <td className="px-2 py-2 w-24">
                              <input type="number" className={inp} value={r.cost ?? ""}
                                onChange={(e) => edit(r.key, { cost: e.target.value ? +e.target.value : null })} />
                            </td>
                            <td className="px-2 py-2 max-w-40">
                              {bad ? (
                                <span className="inline-flex items-center gap-1 text-amber-700">
                                  <AlertTriangle className="w-3 h-3" />{!r.vehicle_id ? "เลือกรถ" : "ใส่วันหมดอายุ"}
                                </span>
                              ) : isDup ? (
                                <span className="text-slate-400">ซ้ำ — จะข้าม</span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-emerald-600">
                                  <CheckCircle className="w-3 h-3" />พร้อมบันทึก
                                </span>
                              )}
                              {r.flags.length > 0 && (
                                <div className="text-[10px] text-slate-400 mt-0.5">{r.flags.join(" · ")}</div>
                              )}
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

              <button onClick={addBlank}
                className="mt-3 inline-flex items-center gap-1.5 text-sm text-teal-700 hover:text-teal-800">
                <Plus className="w-4 h-4" /> เพิ่มแถวเอง (กรอกมือ)
              </button>
            </>
          )}
        </div>

        {/* ---------- ท้าย ---------- */}
        {!result && (
          <div className="flex items-center justify-between gap-3 p-4 border-t border-slate-100">
            <div className="text-xs text-slate-500">
              {rows.length > 0 && (
                <>พร้อมบันทึก <b className="text-emerald-600">{stat.ready}</b>
                  {stat.dup > 0 && <> · ซ้ำ {stat.dup}</>}
                  {stat.bad > 0 && <> · ข้อมูลไม่ครบ {stat.bad}</>}
                  {" "}จากทั้งหมด {rows.length} รายการ</>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-slate-600 hover:bg-slate-100">ปิด</button>
              <button onClick={save} disabled={saving || stat.ready === 0}
                className="px-5 py-2 rounded-xl text-sm font-medium bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-40">
                {saving ? "กำลังบันทึก…" : `บันทึก ${stat.ready} รายการ`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
