import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  typescript: {
    // Type errors are caught in CI — don't block production deploys
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Prevent pdf-parse (and its pdfjs-dist worker) from being bundled by webpack.
  // Without this, Vercel serverless can't find pdf.worker.mjs at runtime.
  serverExternalPackages: ["pdf-parse"],
};

export default config;
