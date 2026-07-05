import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
