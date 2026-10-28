import { describe, expect, it } from "vitest";
import { imageSrc, isValidImageURI } from "./image";

const GW = "https://gw.example/ipfs/";
const CID = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";

describe("imageSrc", () => {
  it("resolves ipfs:// through the gateway", () => {
    expect(imageSrc(`ipfs://${CID}`, GW)).toBe(GW + CID);
    expect(imageSrc(`ipfs://${CID}/cover.png`, GW)).toBe(`${GW}${CID}/cover.png`);
    expect(imageSrc(`ipfs://ipfs/${CID}`, GW)).toBe(GW + CID);
  });
  it("passes well-formed https URLs through", () => {
    expect(imageSrc("https://example.org/a.png")).toBe("https://example.org/a.png");
  });
  it("rejects unsafe or malformed values", () => {
    for (const bad of [
      "",
      undefined,
      "http://example.org/a.png",
      "javascript:alert(1)",
      "data:image/png;base64,AAAA",
      'ipfs://x"onerror=alert(1)',
      "ipfs://../../etc",
      "https://user:pass@example.org/a.png",
      "https://",
    ]) {
      expect(imageSrc(bad, GW)).toBeNull();
    }
  });
});

describe("isValidImageURI", () => {
  it("allows empty and valid links, rejects long or bad ones", () => {
    expect(isValidImageURI("")).toBe(true);
    expect(isValidImageURI(`ipfs://${CID}`)).toBe(true);
    expect(isValidImageURI("http://x.org/a.png")).toBe(false);
    expect(isValidImageURI(`https://x.org/${"a".repeat(260)}`)).toBe(false);
  });
});
