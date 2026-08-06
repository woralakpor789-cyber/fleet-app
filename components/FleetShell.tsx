"use client";

// FleetShell — โครงหน้าหลัก: sidebar (desktop) / เมนูล่าง (mobile) + ตรวจสิทธิ์ก่อนแสดง
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Car, FileText, Wrench, Fuel, Receipt, BarChart3, LayoutDashboard, LogOut, Truck, UserCheck,
} from "lucide-react";
import { checkFleetAccess, getStoredUser, signOut, type FleetUser } from "@/lib/auth";

const MENU = [
  { href: "/home",        label: "ภาพรวม",          icon: LayoutDashboard },
  { href: "/vehicles",    label: "ทะเบียนรถ",        icon: Car },
  { href: "/documents",   label: "เอกสาร/ภาษี",      icon: FileText },
  { href: "/maintenance", label: "ซ่อมบำรุง",        icon: Wrench },
  { href: "/fuel",        label: "น้ำมัน",           icon: Fuel },
  { href: "/invoices",    label: "ใบกำกับภาษี",      icon: Receipt },
  { href: "/reports",     label: "รายงาน",           icon: BarChart3 },
  { href: "/drivers",     label: "คนขับ/QR",         icon: UserCheck },
];

export default function FleetShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<FleetUser | null>(null);
  const [ready, setReady] = useState(false);

  // guard: ไม่มีสิทธิ์ → เด้งกลับหน้า login
  useEffect(() => {
    (async () => {
      const u = getStoredUser();
      if (!u || !(await checkFleetAccess()).ok) {
        router.replace("/");
        return;
      }
      setUser(u);
      setReady(true);
    })();
  }, [router]);

  const handleLogout = async () => {
    await signOut();
    router.replace("/");
  };

  if (!ready) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-400">
        กำลังตรวจสอบสิทธิ์…
      </div>
    );
  }

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <div className="flex-1 flex min-h-screen">
      {/* Sidebar — desktop */}
      <aside className="hidden md:flex flex-col w-60 shrink-0 bg-teal-900 text-teal-100">
        <div className="flex items-center gap-3 px-5 py-5 border-b border-teal-800">
          <div className="w-10 h-10 rounded-xl bg-teal-600 flex items-center justify-center">
            <Truck className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="font-bold text-white leading-tight">FleetOS</div>
            <div className="text-xs text-teal-300">บริหารยานพาหนะ</div>
          </div>
        </div>
        <nav className="flex-1 py-4 space-y-1 px-3">
          {MENU.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors ${
                isActive(href)
                  ? "bg-teal-700 text-white font-semibold"
                  : "hover:bg-teal-800/60"
              }`}
            >
              <Icon className="w-5 h-5" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="px-5 py-4 border-t border-teal-800 text-sm">
          <div className="text-white font-medium truncate">{user?.name}</div>
          <div className="text-teal-300 text-xs truncate mb-2">{user?.email}</div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-teal-200 hover:text-white text-xs"
          >
            <LogOut className="w-4 h-4" /> ออกจากระบบ
          </button>
        </div>
      </aside>

      {/* เนื้อหา */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar — mobile */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 bg-teal-900 text-white">
          <div className="flex items-center gap-2 font-bold">
            <Truck className="w-5 h-5" /> FleetOS
          </div>
          <button onClick={handleLogout} className="text-teal-200">
            <LogOut className="w-5 h-5" />
          </button>
        </header>

        <main className="flex-1 p-4 md:p-6 pb-20 md:pb-6">{children}</main>

        {/* เมนูล่าง — mobile */}
        <nav className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 flex justify-around py-1.5 z-40">
          {MENU.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-0.5 px-2 py-1 text-[10px] ${
                isActive(href) ? "text-teal-700 font-semibold" : "text-slate-400"
              }`}
            >
              <Icon className="w-5 h-5" />
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
