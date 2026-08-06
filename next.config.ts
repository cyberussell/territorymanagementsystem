import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-XSS-Protection", value: "1; mode=block" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  // Multi-zone deploy: cyberussell.com proxies /tms/* here, but without this, this app's own
  // /_next/static/* asset requests would collide with cyberussell.com's own build output on
  // that shared domain (different app, different files, same default path) and 404. Serving
  // this app's assets under /tms-assets instead — matched by the /tms-assets/:path+ rewrite
  // already configured on the cyberussell.com side — avoids the collision. Next.js handles
  // requests at the prefixed path automatically; this is its documented multi-zones mechanism.
  assetPrefix: "/tms-assets",
  // Next.js's default Server Action body limit is 1MB — below the 5MB the map-upload UI
  // advertises ("JPG or PNG — up to 5MB") and below that action's own MAP_MAX_BYTES check.
  experimental: {
    serverActions: {
      bodySizeLimit: "6mb",
    },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
