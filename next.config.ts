import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Must fit MAX_UPLOAD_FILES x MAX_UPLOAD_SIZE from lib/uploads.ts.
    serverActions: { bodySizeLimit: "32mb" },
    // The proxy (proxy.ts) buffers request bodies and cuts them at 10 MB by
    // default, which breaks uploads of several files with an unhandled error.
    proxyClientMaxBodySize: "32mb",
  },
};

export default nextConfig;
