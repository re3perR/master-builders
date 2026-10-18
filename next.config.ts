import type { NextConfig } from "next";

const supabase = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321");

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  serverExternalPackages: ["sharp"],
  images: {
    remotePatterns: [
      {
        protocol: supabase.protocol === "https:" ? "https" : "http",
        hostname: supabase.hostname,
        port: supabase.port,
        pathname: "/storage/v1/object/sign/task-photos/**",
      },
    ],
    dangerouslyAllowLocalIP: ["localhost", "127.0.0.1"].includes(supabase.hostname),
    minimumCacheTTL: 0,
    maximumDiskCacheSize: 0,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
