import type { NextConfig } from "next";
import { execSync } from "child_process";

let commitHash = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'unknown';
try {
  if (commitHash === 'unknown') {
    commitHash = execSync('git rev-parse --short HEAD', { stdio: 'pipe' }).toString().trim();
  }
} catch {
  // Standalone and Docker builds may not include the Git directory.
}

const nextConfig: NextConfig = {
  allowedDevOrigins: ['127.0.0.1'],
  poweredByHeader: false,
  env: {
    NEXT_PUBLIC_GIT_COMMIT: commitHash,
  },
  output: 'standalone',
  serverExternalPackages: ['yahoo-finance2'],
  turbopack: {
    root: process.cwd(),
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
