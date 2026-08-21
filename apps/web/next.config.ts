import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@hiraku/core", "@hiraku/rules", "@hiraku/report"],
};

export default nextConfig;
