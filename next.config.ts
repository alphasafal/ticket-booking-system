import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Pins the workspace root to this project explicitly. Without this,
  // Turbopack's root auto-detection can walk up to a package-lock.json in a
  // parent directory that belongs to a different, unrelated project.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
