import type { NextConfig } from "next";

const allowedDevOrigins = process.env.XR_ALLOWED_DEV_ORIGIN
  ? [process.env.XR_ALLOWED_DEV_ORIGIN]
  : [];

const nextConfig: NextConfig = {
  allowedDevOrigins,
};

export default nextConfig;
