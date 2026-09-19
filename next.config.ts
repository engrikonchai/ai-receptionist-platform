import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: process.env.BUILD_STANDALONE === 'true' ? 'standalone' : undefined,
  env: {
    // Vercel sets `VERCEL_URL` automatically per-deployment, but it's a
    // plain server-side env var. Re-expose it under a NEXT_PUBLIC_ name
    // so `src/lib/site-url.ts` can read it from the browser too (e.g.
    // when building the Supabase `emailRedirectTo` at signup).
    NEXT_PUBLIC_VERCEL_URL: process.env.VERCEL_URL
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'api.slingacademy.com',
        port: ''
      }
    ]
  },
  transpilePackages: ['geist'],
  compiler: {
    // Strips console.log/debug/info/warn from the production build, but
    // NEVER console.error — every safe, secret-free diagnostic logger
    // in this app (src/lib/paddle/webhook-signature-diagnostics.ts,
    // src/features/billing/api/diagnostics.ts,
    // src/app/api/paddle/webhook/route.ts, src/features/inbox/,
    // src/lib/public-widget/) calls console.error specifically so it
    // survives this compiler option and reaches Vercel's Runtime Logs.
    // A bare `removeConsole: true` (no `exclude`) strips console.error
    // too — verified against the compiled production output, where it
    // silently erased every diagnostic call above, including a request
    // that legitimately failed and returned a 400.
    removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error'] } : false
  }
};

export default nextConfig;
