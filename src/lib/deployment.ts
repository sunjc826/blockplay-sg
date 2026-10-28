/** Build-only switch: local development retains the optional backend features. */
export const IS_STATIC_SITE = import.meta.env.MODE === 'sites';
/** The cloud deployment has a companion API, but no local rendezvous server. */
export const HAS_LAN_SERVER = !IS_STATIC_SITE && import.meta.env.MODE !== 'cloudflare';
/** Public rooms use the same-origin Worker API (proxied to Wrangler in dev). */
export const HAS_PUBLIC_ROOMS = !IS_STATIC_SITE;
