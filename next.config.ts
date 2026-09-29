import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  outputFileTracingIncludes: {
    "/api/search": ["./data/szentivanyi.json", "./data/helyek.json"],
  },
};

export default nextConfig;
