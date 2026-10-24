import { expect, test, type Page } from "@playwright/test";

// Known gap: secure.webm and secure.png are not recorded yet, so their 404s are expected.
const KNOWN_MISSING = /secure\./;
const EXTERNAL_OK = /fonts\.(googleapis|gstatic)\.com/;
const WIDTHS = [320, 390, 768, 1024, 1440];

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
});

test("loads with one h1, the Oxi brand, and no console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const at = m.location().url || "";
    if (KNOWN_MISSING.test(at) || KNOWN_MISSING.test(m.text())) return;
    if (EXTERNAL_OK.test(at) || (/Failed to load resource/.test(m.text()) && EXTERNAL_OK.test(m.text()))) return;
    errors.push(`console: ${m.text()} @ ${at}`);
  });
  await page.goto("/");
  await expect(page.locator("h1")).toHaveCount(1);
  await page.waitForTimeout(300);
  const text = await page.evaluate(() => document.body.innerText);
  expect(text).toContain("Oxi");
  expect(text).not.toMatch(/oxicore/i);
  expect(errors).toEqual([]);
});

test("every local asset referenced returns 200 except the known missing secure files", async ({ page, request }) => {
  await page.goto("/");
  // Demo videos and posters are set by main.js after captions.json loads.
  await page.waitForFunction(() => document.querySelectorAll("video[data-video][src]").length >= 4);
  const refs = await page.evaluate(() => {
    const urls = new Set<string>();
    document.querySelectorAll("link[href], script[src], img[src], source[src], video[src], video[poster]").forEach((el) => {
      const v = el.getAttribute("href") || el.getAttribute("src") || el.getAttribute("poster");
      if (v) urls.add(v);
    });
    return [...urls];
  });
  const local = refs.filter((r) => !r.startsWith("#") && !/^[a-z]+:/i.test(r));
  const captions = await request.get("assets/videos/captions.json");
  expect(captions.status()).toBe(200);
  for (const entry of await captions.json()) {
    local.push(`assets/videos/${entry.file}`, `assets/videos/${entry.poster}`);
  }
  const failures: string[] = [];
  for (const ref of [...new Set(local)]) {
    if (KNOWN_MISSING.test(ref)) continue;
    const res = await request.get(ref);
    if (res.status() !== 200) failures.push(`${res.status()} ${ref}`);
  }
  expect(failures).toEqual([]);
});

test("no horizontal scroll at 320, 390, 768, 1024 and 1440 px", async ({ page }) => {
  await page.goto("/");
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 800 });
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(over, `scroll overflow at ${width}px`).toBeLessThanOrEqual(0);
  }
});

test("no visible text smaller than 12px", async ({ page }) => {
  await page.goto("/");
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const small = await page.evaluate(() => {
      const out: string[] = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let n: Node | null;
      while ((n = walker.nextNode())) {
        if (!n.textContent || !n.textContent.trim()) continue;
        const p = n.parentElement;
        if (!p || p.closest("script,style,noscript,template") || p.getClientRects().length === 0) continue;
        const size = parseFloat(getComputedStyle(p).fontSize);
        if (size < 12) out.push(`${p.tagName.toLowerCase()} "${n.textContent.trim().slice(0, 30)}" ${size}px`);
      }
      return out;
    });
    expect(small, `small text at ${width}px`).toEqual([]);
  }
});

test("touch targets are at least 44x44 at 834px and below", async ({ page }) => {
  await page.goto("/");
  for (const width of [390, 768]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(100);
    const small = await page.evaluate(() => {
      const out: string[] = [];
      document.querySelectorAll("a, button, input, select, textarea, [role=button]").forEach((el) => {
        const r = el.getBoundingClientRect();
        const visible = r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < document.documentElement.scrollHeight && r.right > 0 && r.left < window.innerWidth;
        if (!visible) return;
        const h = el as HTMLElement;
        if (h.offsetWidth < 44 || h.offsetHeight < 44) out.push(`${el.tagName.toLowerCase()} "${(el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 25)}" ${h.offsetWidth}x${h.offsetHeight}`);
      });
      return out;
    });
    expect(small, `small touch targets at ${width}px`).toEqual([]);
  }
});

test("mobile menu opens, closes with Escape, and closes on link tap", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const btn = page.locator("#menu-btn");
  const nav = page.locator("#site-nav");
  await expect(btn).toHaveAttribute("aria-expanded", "false");
  await expect(nav).toBeHidden();

  await btn.click();
  await expect(btn).toHaveAttribute("aria-expanded", "true");
  await expect(nav).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(btn).toHaveAttribute("aria-expanded", "false");
  await expect(nav).toBeHidden();
  await expect(btn).toBeFocused();

  await btn.click();
  await page.locator("#site-nav a", { hasText: "Benchmarks" }).click();
  await expect(btn).toHaveAttribute("aria-expanded", "false");
});

test("GitHub link is in the header, disabled, and points nowhere yet", async ({ page }) => {
  await page.goto("/");
  const gh = page.locator("header a[data-github-link]");
  await expect(gh).toHaveCount(1);
  await expect(gh).toHaveAttribute("href", "#");
  await expect(gh).toHaveAttribute("aria-disabled", "true");
  await expect(gh).toHaveAttribute("title", "GitHub — link coming soon");
  await expect(page.getByRole("link", { name: "GitHub" })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#menu-btn").click();
  await expect(page.locator("#site-nav a[data-github-link]")).toBeVisible();
});

test("reduced motion: no CSS animation or transition runs", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.waitForTimeout(300);
  const running = await page.evaluate(() =>
    document.getAnimations().filter((a) => a.playState === "running").map((a) => (a as CSSAnimation).animationName || a.id || "transition"),
  );
  expect(running).toEqual([]);
});
