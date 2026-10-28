/** Public gateway used to display ipfs:// images. Override with a dedicated (e.g. Pinata) gateway in production. */
export const IPFS_GATEWAY = (process.env.NEXT_PUBLIC_IPFS_GATEWAY ?? "https://ipfs.io/ipfs/").replace(/\/?$/, "/");

const CID_PATH = /^[A-Za-z0-9]+(\/[A-Za-z0-9._~-]+)*$/;

/**
 * Turns an onchain imageURI into a safe <img src>. Campaign images are untrusted input:
 * only ipfs://<cid>[/path] (via the gateway) and well-formed https:// URLs are rendered; anything else is ignored.
 */
export function imageSrc(uri: string | undefined, gateway = IPFS_GATEWAY): string | null {
  if (!uri) return null;
  if (uri.startsWith("ipfs://")) {
    const path = uri.slice("ipfs://".length).replace(/^ipfs\//, "");
    return CID_PATH.test(path) ? gateway + path : null;
  }
  if (uri.startsWith("https://")) {
    try {
      const u = new URL(uri);
      return u.protocol === "https:" && !u.username && !u.password ? u.toString() : null;
    } catch {
      return null;
    }
  }
  return null;
}

/** Mirrors the contract's _validateImageURI so the form can reject bad links before simulation. */
export function isValidImageURI(uri: string): boolean {
  if (uri === "") return true;
  if (new TextEncoder().encode(uri).length > 256) return false;
  return imageSrc(uri) !== null;
}
