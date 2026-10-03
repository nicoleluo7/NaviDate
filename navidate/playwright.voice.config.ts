import { defineConfig, devices } from "@playwright/test";
// Run against the local configured dev server. All voice and planning calls are mocked.
export default defineConfig({
  testDir: "tests/voice-e2e",
  workers: 1,
  use: {
    baseURL: "http://localhost:3000",
    ...devices["Desktop Chrome"],
    trace: "retain-on-failure",
  },
});
