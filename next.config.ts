import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["yahoo-finance2"],
  images: {
    remotePatterns: [
      { hostname: "lh3.googleusercontent.com" }, // Google profile pictures
    ],
  },
};

export default nextConfig;
