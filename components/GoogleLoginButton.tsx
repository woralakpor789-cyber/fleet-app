"use client";

import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";

// Client ID เดียวกับ SalesOS (ค่าสาธารณะ ฝังหน้าเว็บได้)
export const GOOGLE_CLIENT_ID =
  "855176346227-aotvac36o9io3u5um9mie9tdagvlj5tp.apps.googleusercontent.com";

export interface GoogleUser {
  email: string;
  name: string;
  picture?: string;
}

/** ถอด payload ของ JWT (รองรับ UTF-8 เช่นชื่อภาษาไทย) */
function decodeJwt(token: string): { email?: string; name?: string; picture?: string } {
  try {
    const base = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(base)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(json);
  } catch {
    return {};
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare global { interface Window { google?: any; } }

const GSI_SRC = "https://accounts.google.com/gsi/client";

/**
 * ปุ่ม "เข้าสู่ระบบด้วย Google" — แลก credential เป็น Supabase session ผ่าน signInWithIdToken
 * (จำเป็นเมื่อเปิด RLS — ทุก query ต้องมี JWT ที่ verify แล้ว)
 */
export default function GoogleLoginButton({
  onSuccess,
  onError,
}: {
  onSuccess: (user: GoogleUser) => void;
  onError?: (message: string) => void;
}) {
  const divRef = useRef<HTMLDivElement>(null);
  const cbRef = useRef(onSuccess);
  cbRef.current = onSuccess;
  const errRef = useRef(onError);
  errRef.current = onError;

  useEffect(() => {
    let cancelled = false;

    const handle = async (resp: { credential?: string }) => {
      if (!resp?.credential) return;
      const p = decodeJwt(resp.credential);
      if (!p.email) return;
      if (supabase) {
        const { error } = await supabase.auth.signInWithIdToken({
          provider: "google",
          token: resp.credential,
        });
        if (error) {
          console.warn("supabase signInWithIdToken", error);
          errRef.current?.(`เชื่อมระบบยืนยันตัวตนไม่สำเร็จ: ${error.message}`);
          return;
        }
      }
      cbRef.current({ email: p.email, name: p.name || p.email, picture: p.picture });
    };

    const render = (): boolean => {
      const g = window.google;
      if (!g?.accounts?.id || !divRef.current) return false;
      g.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handle,
        // ช่วยให้ล็อกอินผ่านบน Safari/iOS ที่บล็อกคุกกี้บุคคลที่สาม
        itp_support: true,
        use_fedcm_for_prompt: true,
        auto_select: false,
      });
      g.accounts.id.renderButton(divRef.current, {
        theme: "outline",
        size: "large",
        shape: "pill",
        text: "signin_with",
        logo_alignment: "left",
        width: 280,
      });
      return true;
    };

    if (render()) return;

    if (!document.querySelector(`script[src="${GSI_SRC}"]`)) {
      const s = document.createElement("script");
      s.src = GSI_SRC;
      s.async = true;
      s.defer = true;
      document.head.appendChild(s);
    }
    let tries = 0;
    const iv = setInterval(() => {
      if (cancelled || render() || ++tries > 50) clearInterval(iv);
    }, 100);

    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, []);

  return <div ref={divRef} className="flex justify-center min-h-[44px]" />;
}
