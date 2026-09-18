import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Must fit MAX_UPLOAD_FILES x MAX_UPLOAD_SIZE from lib/uploads.ts.
    serverActions: { bodySizeLimit: "32mb" },
  },
};

export default nextConfig;
