import { defineConfig, devices } from "@playwright/test";
const port = 3200;

// Voice and planning calls are mocked; the fixture key only exposes voice mode.
export default defineConfig({
  testDir: "tests/voice-e2e",
  workers: 1,
  use: {
    baseURL: `http://localhost:${port}`,
    ...devices["Desktop Chrome"],
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npm run dev -- --hostname 127.0.0.1 --port ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
    env: {
      NAVIDATE_E2E: "1",
      DISABLE_EXTERNAL_APIS: "false",
      LOCAL_DB_PATH: ".local/voice-e2e.sqlite",
      NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: "",
      GOOGLE_MAPS_API_KEY: "",
      GEMINI_API_KEY: "",
      XAI_API_KEY: "voice-e2e-fixture",
    },
    timeout: 120000,
  },
});
