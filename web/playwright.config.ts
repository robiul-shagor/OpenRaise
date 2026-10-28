import { defineConfig, devices } from "@playwright/test";

const RPC_PORT = 8555;
const APP_PORT = 3100;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1, // tests share one chain and move its clock
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${APP_PORT}`, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "bash e2e/start-chain.sh",
      url: "http://127.0.0.1:8556",
      env: { E2E_RPC_PORT: String(RPC_PORT), E2E_READY_PORT: "8556" },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      // Production build in a separate distDir: closer to what ships, and works while `next dev` is running.
      command: `npx next build && npx next start --port ${APP_PORT}`,
      url: `http://localhost:${APP_PORT}`,
      env: {
        NEXT_PUBLIC_LOCAL_RPC_URL: `http://127.0.0.1:${RPC_PORT}`,
        NEXT_DIST_DIR: ".next-e2e",
        // Fake gateway host: tests intercept it, so no real IPFS traffic. No PINATA_JWT → upload is off, paste-a-link path.
        NEXT_PUBLIC_IPFS_GATEWAY: "https://gw.e2e.test/ipfs/",
        PINATA_JWT: "",
      },
      reuseExistingServer: false,
      timeout: 300_000,
    },
  ],
});
