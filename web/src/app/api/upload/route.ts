import { connection } from "next/server";
import { MAX_UPLOAD_BYTES, cidFromPinata, createRateLimiter, sniffImageType, uploadName } from "@/lib/upload";

// Pins campaign cover images to public IPFS via Pinata. The JWT stays on the server.
// Abuse limits: 3 MB, PNG/JPEG/WebP/GIF only (checked by magic bytes), 10 uploads per IP per 10 minutes.

const allow = createRateLimiter(10, 10 * 60_000);
const jwt = () => process.env.PINATA_JWT;

/** Lets the UI decide between "upload a file" and "paste a link". */
export async function GET() {
  await connection(); // read env at request time, not at build time
  return Response.json({ enabled: Boolean(jwt()), maxBytes: MAX_UPLOAD_BYTES });
}

export async function POST(request: Request) {
  const token = jwt();
  if (!token) return Response.json({ error: "Image upload isn't configured (PINATA_JWT missing). Paste a link instead." }, { status: 503 });

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!allow(ip)) return Response.json({ error: "Too many uploads. Try again in a few minutes." }, { status: 429 });

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_UPLOAD_BYTES + 64 * 1024) return Response.json({ error: "Image must be 3 MB or smaller." }, { status: 413 });

  let file: FormDataEntryValue | null;
  try {
    file = (await request.formData()).get("file");
  } catch {
    return Response.json({ error: "Expected a multipart form with a 'file' field." }, { status: 400 });
  }
  if (!(file instanceof File)) return Response.json({ error: "No file received." }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) return Response.json({ error: "Image must be 3 MB or smaller." }, { status: 413 });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffImageType(bytes);
  if (!type) return Response.json({ error: "Only PNG, JPEG, WebP or GIF images are allowed." }, { status: 415 });

  const body = new FormData();
  body.append("file", new File([bytes], uploadName(type), { type }));
  body.append("network", "public");

  let res: Response;
  try {
    res = await fetch("https://uploads.pinata.cloud/v3/files", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body,
    });
  } catch {
    return Response.json({ error: "Couldn't reach the IPFS pinning service." }, { status: 502 });
  }
  const cid = res.ok ? cidFromPinata(await res.json().catch(() => null)) : null;
  if (!cid) return Response.json({ error: `Pinning failed (${res.status}).` }, { status: 502 });

  return Response.json({ uri: `ipfs://${cid}`, cid });
}
