import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // yahoo-finance2 uses node APIs — keep it server-side only
  serverExternalPackages: ["yahoo-finance2"],
};

export default nextConfig;
