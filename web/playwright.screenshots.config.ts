import { defineConfig, devices } from "@playwright/test";

// Regenerates docs/images/*.png from a fresh demo chain: `make screenshots`.
// Own ports and build folder, so it never touches `make anvil` / `make dev`.
const RPC_PORT = 8600;
const APP_PORT = 3200;

export default defineConfig({
  testDir: "./e2e-docs",
  workers: 1,
  timeout: 10 * 60_000,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${APP_PORT}`, colorScheme: "light", deviceScaleFactor: 1 },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], deviceScaleFactor: 1 } }],
  webServer: [
    {
      command: "bash e2e/start-chain.sh",
      url: "http://127.0.0.1:8601",
      env: { E2E_RPC_PORT: String(RPC_PORT), E2E_READY_PORT: "8601" },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `npx next build && npx next start --port ${APP_PORT}`,
      url: `http://localhost:${APP_PORT}`,
      env: {
        NEXT_PUBLIC_LOCAL_RPC_URL: `http://127.0.0.1:${RPC_PORT}`,
        NEXT_DIST_DIR: ".next-docs",
        // Demo covers are served locally by the screenshot script (no real IPFS traffic).
        NEXT_PUBLIC_IPFS_GATEWAY: "https://gw.docs.local/ipfs/",
        PINATA_JWT: "",
      },
      reuseExistingServer: false,
      timeout: 300_000,
    },
  ],
});
