"use client";

// หน้า login — เข้าด้วย Google แล้วเช็คสิทธิ์ (แอดมิน/ฝ่ายสต็อกเท่านั้น)
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Truck } from "lucide-react";
import GoogleLoginButton, { type GoogleUser } from "@/components/GoogleLoginButton";
import BrowserWarning from "@/components/BrowserWarning";
import { checkFleetAccess, getStoredUser, signOut, storeUser } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(true);

  // ล็อกอินค้างอยู่ + session ยังไม่หมดอายุ → เข้าเลย
  useEffect(() => {
    (async () => {
      if (getStoredUser() && (await checkFleetAccess()).ok) {
        router.replace("/home");
        return;
      }
      setChecking(false);
    })();
  }, [router]);

  const handleLogin = async (u: GoogleUser) => {
    setError("");
    const access = await checkFleetAccess();
    if (!access.ok) {
      await signOut();
      setError(
        access.reason === "forbidden"
          ? "บัญชีนี้ไม่มีสิทธิ์เข้าระบบ Fleet (เฉพาะแอดมิน/ฝ่ายสต็อก) — ติดต่อแอดมินเพื่อขอสิทธิ์"
          : "เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่"
      );
      return;
    }
    storeUser(u);
    router.replace("/home");
  };

  return (
    <main className="flex-1 flex items-center justify-center p-6">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg border border-slate-200 p-8 text-center">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-teal-600 flex items-center justify-center mb-4">
          <Truck className="w-9 h-9 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-slate-800">FleetOS</h1>
        <p className="text-slate-500 mt-1 mb-6">ระบบบริหารจัดการยานพาหนะ<br />กู๊ด แอนด์ ริช เพาเวอร์พลัส</p>
        {checking ? (
          <p className="text-slate-400 text-sm">กำลังตรวจสอบสิทธิ์…</p>
        ) : (
          <>
            <BrowserWarning />
            <GoogleLoginButton onSuccess={handleLogin} onError={setError} />
          </>
        )}
        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
        <p className="mt-6 text-xs text-slate-400">เฉพาะเจ้าหน้าที่ backoffice ที่ได้รับสิทธิ์</p>
      </div>
    </main>
  );
}
