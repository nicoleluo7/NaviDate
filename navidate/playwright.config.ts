import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  use: { baseURL: "http://localhost:3100", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: {
        ...devices["iPhone 13"],
        defaultBrowserType: "chromium",
        viewport: { width: 375, height: 812 },
      },
    },
  ],
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3100",
    url: "http://localhost:3100",
    reuseExistingServer: false,
    env: {
      NAVIDATE_E2E: "1",
      DISABLE_EXTERNAL_APIS: "true",
      LOCAL_DB_PATH: ".local/e2e.sqlite",
      NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: "",
      GOOGLE_MAPS_API_KEY: "",
      GEMINI_API_KEY: "",
      XAI_API_KEY: "",
    },
    timeout: 120000,
  },
});
