// Server-side helpers for /api/upload. Kept framework-free so they can be unit-tested.

export const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;
export const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
export type ImageType = (typeof ALLOWED_TYPES)[number];

/** Detects the real image type from magic bytes; the client-provided MIME type is never trusted. */
export function sniffImageType(b: Uint8Array): ImageType | null {
  const at = (i: number, ...xs: number[]) => xs.every((x, j) => b[i + j] === x);
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (at(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (at(0, 0x47, 0x49, 0x46, 0x38) && (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61) return "image/gif";
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return "image/webp";
  return null; // SVG deliberately unsupported: it can carry script
}

const EXT: Record<ImageType, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

/** Neutral filename so user-provided names never reach the pinning service. */
export function uploadName(type: ImageType): string {
  return `openraise-cover-${Date.now()}.${EXT[type]}`;
}

/** Fixed-window, in-memory rate limiter. Per-process only: fine for a demo, use a shared store in production. */
export function createRateLimiter(limit: number, windowMs: number) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (key: string, now = Date.now()): boolean => {
    const h = hits.get(key);
    if (!h || now >= h.resetAt) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    if (h.count >= limit) return false;
    h.count++;
    return true;
  };
}

/** Extracts the CID from a Pinata v3 upload response. */
export function cidFromPinata(json: unknown): string | null {
  const data = (json as { data?: { cid?: unknown } } | null)?.data;
  return typeof data?.cid === "string" && /^[A-Za-z0-9]+$/.test(data.cid) ? data.cid : null;
}
