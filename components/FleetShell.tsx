"use client";

// FleetShell — โครงหน้าหลัก: sidebar (desktop) / เมนูล่าง (mobile) + ตรวจสิทธิ์ก่อนแสดง
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Car, FileText, Wrench, Fuel, Receipt, CreditCard, BarChart3, CalendarDays,
  LayoutDashboard, LogOut, Menu, Truck, UserCheck, X,
} from "lucide-react";
import { checkFleetAccess, getStoredUser, signOut, type FleetUser } from "@/lib/auth";

const MENU = [
  { href: "/home",        label: "ภาพรวม",          icon: LayoutDashboard },
  { href: "/vehicles",    label: "ทะเบียนรถ",        icon: Car },
  { href: "/documents",   label: "เอกสาร/ภาษี",      icon: FileText },
  { href: "/maintenance", label: "ซ่อมบำรุง",        icon: Wrench },
  { href: "/fuel",        label: "น้ำมัน",           icon: Fuel },
  { href: "/invoices",    label: "ใบกำกับภาษี",      icon: Receipt },
  { href: "/cards",       label: "ฟลีทการ์ด",        icon: CreditCard },
  { href: "/reports",     label: "รายงาน",           icon: BarChart3 },
  { href: "/roster",      label: "ตารางเวร",         icon: CalendarDays },
  { href: "/drivers",     label: "คนขับ/QR",         icon: UserCheck },
];

export default function FleetShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<FleetUser | null>(null);
  const [ready, setReady] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

  // ปิดเมนูอัตโนมัติเมื่อเปลี่ยนหน้า
  useEffect(() => { setNavOpen(false); }, [pathname]);

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
  const currentLabel = MENU.find(({ href }) => isActive(href))?.label ?? "FleetOS";

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
        {/* Topbar — mobile: ปุ่มเมนู + ชื่อหน้าปัจจุบัน */}
        <header className="md:hidden sticky top-0 z-30 flex items-center gap-3 px-3 py-3 bg-teal-900 text-white">
          <button onClick={() => setNavOpen(true)} aria-label="เปิดเมนู"
            className="p-1.5 -m-1.5 rounded-lg active:bg-teal-800">
            <Menu className="w-6 h-6" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="font-bold leading-tight truncate">{currentLabel}</div>
            <div className="text-[11px] text-teal-300 leading-tight">FleetOS</div>
          </div>
          <button onClick={handleLogout} aria-label="ออกจากระบบ" className="text-teal-200 p-1.5 -m-1.5">
            <LogOut className="w-5 h-5" />
          </button>
        </header>

        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>

      {/* เมนูสไลด์ — mobile */}
      {navOpen && (
        <div className="md:hidden fixed inset-0 z-50" onClick={() => setNavOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <nav
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-teal-900 text-teal-100 flex flex-col shadow-2xl">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-teal-800">
              <div className="w-10 h-10 rounded-xl bg-teal-600 flex items-center justify-center">
                <Truck className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-white leading-tight">FleetOS</div>
                <div className="text-xs text-teal-300 truncate">{user?.name}</div>
              </div>
              <button onClick={() => setNavOpen(false)} aria-label="ปิดเมนู" className="text-teal-300 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-3 px-3 space-y-1">
              {MENU.map(({ href, label, icon: Icon }) => (
                <Link key={href} href={href} onClick={() => setNavOpen(false)}
                  className={`flex items-center gap-3 px-3 py-3 rounded-xl text-[15px] ${
                    isActive(href) ? "bg-teal-700 text-white font-semibold" : "active:bg-teal-800/60"
                  }`}>
                  <Icon className="w-5 h-5 shrink-0" />
                  {label}
                </Link>
              ))}
            </div>

            <button onClick={handleLogout}
              className="flex items-center gap-2 px-5 py-4 border-t border-teal-800 text-teal-200 text-sm">
              <LogOut className="w-4 h-4" /> ออกจากระบบ
            </button>
          </nav>
        </div>
      )}
    </div>
  );
}
