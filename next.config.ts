import type { NextConfig } from "next";
import { execSync } from "child_process";

let commitHash = 'unknown';
try {
  commitHash = execSync('git rev-parse --short HEAD', { stdio: 'pipe' }).toString().trim();
} catch (e) {
  // Fallback if git is not available
}

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_GIT_COMMIT: commitHash,
  },
  output: 'standalone', // Required for Docker deployments
  serverExternalPackages: ['yahoo-finance2'],
  typescript: {
    // !! WARN !!
    // Dangerously allow production builds to successfully complete even if
    // your project has type errors.
    // !! WARN !!
    ignoreBuildErrors: true,
  },
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
