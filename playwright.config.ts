import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// Locally, use the installed Brave (Chromium-based) when present; PW_BROWSER_PATH overrides it.
// In CI, use Playwright's bundled chromium.
const BRAVE = "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser";
const executablePath = process.env.CI
  ? undefined
  : process.env.PW_BROWSER_PATH || (existsSync(BRAVE) ? BRAVE : undefined);

// Port 5191 so it does not clash with `npm run serve` on 5190.
const PORT = 5191;

export default defineConfig({
  testDir: "tests",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, launchOptions: { executablePath } },
    },
    {
      name: "mobile",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        launchOptions: { executablePath },
      },
    },
  ],
  webServer: {
    command: `python3 -m http.server ${PORT} --bind 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
