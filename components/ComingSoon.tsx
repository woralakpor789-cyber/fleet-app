"use client";

// ป้ายบอกฟีเจอร์ที่ยังไม่เปิด (ระหว่างพัฒนาตามเฟสใน FLEET-PLAN.md)
import type { LucideIcon } from "lucide-react";

export default function ComingSoon({
  icon: Icon,
  title,
  phase,
  detail,
}: {
  icon: LucideIcon;
  title: string;
  phase: string;
  detail: string;
}) {
  return (
    <div className="max-w-xl mx-auto mt-10 bg-white rounded-2xl border border-slate-200 shadow-sm p-10 text-center">
      <div className="mx-auto w-14 h-14 rounded-2xl bg-teal-50 flex items-center justify-center mb-4">
        <Icon className="w-7 h-7 text-teal-600" />
      </div>
      <h1 className="text-xl font-bold text-slate-800">{title}</h1>
      <p className="text-slate-500 mt-2">{detail}</p>
      <span className="inline-block mt-4 px-3 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-medium border border-amber-200">
        กำลังพัฒนา — {phase}
      </span>
    </div>
  );
}
