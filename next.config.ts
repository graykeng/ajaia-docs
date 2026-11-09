import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {};

export default nextConfig;

// Gives `next dev` the same Cloudflare bindings (the D1 database) as production,
// backed by a local SQLite file under .wrangler/.
initOpenNextCloudflareForDev();
