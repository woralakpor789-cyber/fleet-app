import type { NextConfig } from "next";

// basePath สำหรับ GitHub Pages (ตั้งผ่าน env ตอน deploy — เว้นว่างตอน dev)
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",             // static site เหมือน sales-os-app
  basePath: basePath || undefined,
  assetPrefix: basePath || undefined,
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
