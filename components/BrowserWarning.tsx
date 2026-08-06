"use client";
// components/BrowserWarning.tsx — เตือนเมื่อเปิดในเบราว์เซอร์ฝังของแอป (LINE / Facebook / IG)
// Google บล็อกการล็อกอินใน embedded webview → ผู้ใช้จะค้างอยู่ที่หน้า sign-in ของ Google
// ต้องบอกให้เปิดในเบราว์เซอร์จริง (Chrome / Safari) เท่านั้น

import { useEffect, useState } from "react";
import { AlertTriangle, Copy, ExternalLink } from "lucide-react";

/** เบราว์เซอร์ฝังในแอปที่ Google ไม่ให้ล็อกอิน */
export function detectInAppBrowser(ua: string): string | null {
  if (/\bLine\//i.test(ua)) return "LINE";
  if (/FBAN|FBAV|FB_IAB/i.test(ua)) return "Facebook";
  if (/Instagram/i.test(ua)) return "Instagram";
  if (/Messenger/i.test(ua)) return "Messenger";
  if (/MicroMessenger/i.test(ua)) return "WeChat";
  if (/TikTok/i.test(ua)) return "TikTok";
  // Android WebView ทั่วไป (มี "; wv" ใน UA)
  if (/Android.*;\s*wv\)/i.test(ua)) return "แอปอื่น";
  return null;
}

export default function BrowserWarning() {
  const [app, setApp] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setApp(detectInAppBrowser(navigator.userAgent));
    setUrl(window.location.href);
  }, []);

  if (!app) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 text-left mb-4">
      <div className="flex items-start gap-2 text-amber-900">
        <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-bold">เปิดจากแอป {app} — ล็อกอิน Google ไม่ได้</p>
          <p className="mt-1">
            Google ไม่อนุญาตให้ล็อกอินในเบราว์เซอร์ที่ฝังอยู่ในแอป
            <b> ต้องเปิดใน Chrome หรือ Safari</b> เท่านั้น
          </p>
          <p className="mt-2 font-medium">วิธีเปิด:</p>
          <ul className="list-disc ml-4 mt-0.5 space-y-0.5">
            <li>กดปุ่ม <b>⋯</b> หรือ <b>⋮</b> มุมขวาบน → เลือก <b>&quot;เปิดในเบราว์เซอร์&quot;</b></li>
            <li>หรือกดปุ่มด้านล่างเพื่อคัดลอกลิงก์ แล้วนำไปวางใน Chrome/Safari</li>
          </ul>
        </div>
      </div>
      <div className="flex gap-2 mt-3">
        <button onClick={copy}
          className="flex-1 flex items-center justify-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium py-2.5 rounded-xl">
          <Copy className="w-4 h-4" /> {copied ? "คัดลอกลิงก์แล้ว ✓" : "คัดลอกลิงก์"}
        </button>
        <a href={url} target="_blank" rel="noopener noreferrer"
          className="flex items-center justify-center gap-1.5 border border-amber-600 text-amber-800 text-sm font-medium px-4 py-2.5 rounded-xl">
          <ExternalLink className="w-4 h-4" /> ลองเปิด
        </a>
      </div>
    </div>
  );
}
