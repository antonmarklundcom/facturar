import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  eslint: {
    // `npm run lint` and the pre-push hook own linting; keep `next build` fast.
    ignoreDuringBuilds: true,
  },
};

export default withNextIntl(nextConfig);
