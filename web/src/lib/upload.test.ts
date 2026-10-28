import { describe, expect, it } from "vitest";
import { cidFromPinata, createRateLimiter, sniffImageType, uploadName } from "./upload";

const bytes = (...xs: number[]) => new Uint8Array([...xs, ...new Array(16).fill(0)]);

describe("sniffImageType", () => {
  it("detects real image types from magic bytes", () => {
    expect(sniffImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("image/png");
    expect(sniffImageType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(sniffImageType(bytes(0x47, 0x49, 0x46, 0x38, 0x39, 0x61))).toBe("image/gif");
    expect(sniffImageType(bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50))).toBe("image/webp");
  });
  it("rejects SVG, HTML and anything else regardless of the claimed MIME type", () => {
    expect(sniffImageType(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'))).toBeNull();
    expect(sniffImageType(new TextEncoder().encode("<html><script>alert(1)</script>"))).toBeNull();
    expect(sniffImageType(new Uint8Array())).toBeNull();
  });
});

describe("uploadName", () => {
  it("never uses the user's filename", () => {
    expect(uploadName("image/png")).toMatch(/^openraise-cover-\d+\.png$/);
  });
});

describe("createRateLimiter", () => {
  it("allows up to the limit per window, then resets", () => {
    const allow = createRateLimiter(2, 1000);
    expect(allow("ip", 0)).toBe(true);
    expect(allow("ip", 10)).toBe(true);
    expect(allow("ip", 20)).toBe(false);
    expect(allow("other", 20)).toBe(true);
    expect(allow("ip", 1000)).toBe(true);
  });
});

describe("cidFromPinata", () => {
  it("reads data.cid and rejects odd values", () => {
    expect(cidFromPinata({ data: { cid: "bafyabc123" } })).toBe("bafyabc123");
    expect(cidFromPinata({ data: { cid: "bad/../cid" } })).toBeNull();
    expect(cidFromPinata({})).toBeNull();
    expect(cidFromPinata(null)).toBeNull();
  });
});
