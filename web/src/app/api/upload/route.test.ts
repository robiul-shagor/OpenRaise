// @vitest-environment node
// Route handlers run on Node in Next; jsdom's File class would not match Request.formData()'s.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

function req(body: BodyInit, ip = "1.1.1.1") {
  return new Request("http://localhost/api/upload", { method: "POST", body, headers: { "x-forwarded-for": ip } });
}
function form(bytes: Uint8Array<ArrayBuffer>, name = "x.png", type = "image/png") {
  const f = new FormData();
  f.append("file", new File([bytes], name, { type }));
  return f;
}

describe("POST /api/upload", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("returns 503 when Pinata isn't configured", async () => {
    vi.stubEnv("PINATA_JWT", "");
    const { POST } = await import("./route");
    expect((await POST(req(form(PNG)))).status).toBe(503);
  });

  it("rejects non-images by content, even if labelled image/png", async () => {
    vi.stubEnv("PINATA_JWT", "test-jwt");
    const { POST } = await import("./route");
    const svg = new TextEncoder().encode("<svg><script>alert(1)</script></svg>");
    expect((await POST(req(form(svg, "evil.png", "image/png")))).status).toBe(415);
  });

  it("pins a valid image and returns an ipfs:// URI without forwarding the user's filename", async () => {
    vi.stubEnv("PINATA_JWT", "test-jwt");
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const sent = (init.body as FormData).get("file") as File;
      expect(sent.name).toMatch(/^openraise-cover-\d+\.png$/);
      expect((init.body as FormData).get("network")).toBe("public");
      expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-jwt");
      return new Response(JSON.stringify({ data: { cid: "bafytestcid" } }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { POST } = await import("./route");
    const res = await POST(req(form(PNG, "my-private-name.png")));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ uri: "ipfs://bafytestcid", cid: "bafytestcid" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("rate-limits per IP", async () => {
    vi.stubEnv("PINATA_JWT", "test-jwt");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: { cid: "bafy1" } }))));
    const { POST } = await import("./route");
    const codes = [];
    for (let i = 0; i < 11; i++) codes.push((await POST(req(form(PNG), "9.9.9.9"))).status);
    expect(codes.slice(0, 10).every((c) => c === 200)).toBe(true);
    expect(codes[10]).toBe(429);
  });
});
