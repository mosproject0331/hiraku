import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@hiraku/core", "@hiraku/rules", "@hiraku/report", "@hiraku/estimate", "@hiraku/llm", "@hiraku/regionpack"],
};

export default nextConfig;
