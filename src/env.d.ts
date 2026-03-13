/// <reference types="astro/client" />

type Runtime = import("@astrojs/cloudflare").Runtime<{
  RESEND_API_KEY: string;
}>;

declare namespace App {
  interface Locals extends Runtime {}
}
