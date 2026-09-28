import { defineCloudflareConfig } from '@opennextjs/cloudflare';

// Keep the default cache adapter so the app can deploy without requiring an
// R2 bucket. Configure an R2 incremental cache later if long-lived ISR is
// needed for a production deployment.
const config = defineCloudflareConfig();

// OpenNext normally invokes `pnpm build`. Calling the Next CLI directly keeps
// Cloudflare builds independent from pnpm lifecycle-script policy.
config.buildCommand =
  'node scripts/generate-manifest.js && node scripts/generate-version-metadata.js && node node_modules/next/dist/bin/next build';

export default config;
