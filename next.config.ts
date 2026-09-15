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
    removeConsole: process.env.NODE_ENV === 'production'
  }
};

export default nextConfig;
