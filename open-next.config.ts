import { defineCloudflareConfig } from '@opennextjs/cloudflare'

// The app does not use ISR and Next image optimization is disabled, so the
// default in-memory/dummy cache avoids requiring R2 or Cloudflare Images.
export default defineCloudflareConfig()
