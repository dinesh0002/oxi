import { expect, test, type Page } from "@playwright/test";

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

test("every local asset referenced returns 200", async ({ page, request }) => {
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

// ---- Docs, local-only testing guide, marquee logos and screenshots ----
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const docsPages = (dir = join(ROOT, "docs")): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return docsPages(p);
    return n.endsWith(".html") ? [p] : [];
  });
const publicDocs = () => docsPages().filter((p) => !p.endsWith("local-testing.html"));
const searchIndex: { title: string; section: string; path: string; text: string }[] = JSON.parse(read("docs/search-index.json"));
const pageUrl = (path: string) => "/" + path.replace(/^docs\//, "docs/");

test("marquee holds the logos and the works strip is gone", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".works")).toHaveCount(0);
  const marquee = page.locator(".marquee");
  expect(await marquee.locator("img.mq-logo").count()).toBeGreaterThanOrEqual(8);
  const logos = await marquee.locator("img").evaluateAll((imgs) => imgs.map((i) => ({
    src: i.getAttribute("src") ?? "", aria: i.getAttribute("aria-hidden"), w: i.getBoundingClientRect().width, h: i.getBoundingClientRect().height,
  })));
  for (const l of logos) {
    expect(l.src, l.src).toMatch(/^assets\/logos\/[a-z0-9]+\.svg$/);
    expect(l.aria, l.src).toBe("true");
    expect(l.h, l.src).toBeCloseTo(20, 0);
  }
  await expect(marquee.locator(".soon")).toHaveCount(16); // 8 coming items, in the visible list and its hidden copy
  // The visible names are in the first list; the duplicate list is hidden from assistive tech.
  await expect(marquee.locator("ul.marquee-list").first()).toContainText("Power BI");
  await expect(marquee.locator("ul[aria-hidden='true']")).toHaveCount(1);
});

test("docs landing: section cards exist and every card link resolves", async ({ page, request }) => {
  await page.goto("/docs/");
  await expect(page.locator("h1")).toHaveText("Docs");
  const cards = await page.locator(".doc-card").evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""));
  expect(cards.length).toBe(27);
  for (const href of cards) {
    const res = await request.get(new URL(href, "http://127.0.0.1/docs/").pathname);
    expect(res.status(), href).toBe(200);
  }
  await expect(page.locator(".doc-section")).toHaveCount(7);
});

test("every docs page: breadcrumb, sidebar with aria-current, working prev and next", async ({ page, request }) => {
  const entries = searchIndex.map((e) => e.path);
  expect(entries.length).toBe(27);
  for (const path of entries) {
    await page.goto(pageUrl(path));
    await expect(page.locator(".crumbs"), path).toBeVisible();
    await expect(page.locator(".doc-side-nav [aria-current='page']"), path).toHaveCount(1);
    for (const sel of [".pager-prev", ".pager-next"]) {
      const href = await page.locator(sel).getAttribute("href");
      expect(href, `${path} ${sel}`).toBeTruthy();
      const res = await request.get(new URL(href as string, `http://127.0.0.1${pageUrl(path)}`).pathname);
      expect(res.status(), `${path} ${sel} -> ${href}`).toBe(200);
    }
  }
});

test("search: Ctrl+K opens the modal, finds ClickHouse, and Escape closes it", async ({ page }) => {
  await page.goto("/docs/");
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await page.keyboard.type("ClickHouse");
  await expect(page.getByRole("option", { name: /ClickHouse/ }).first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("mobile sections toggle works with aria-expanded", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/docs/connections/postgres.html");
  const toggle = page.locator("#doc-side-toggle");
  const nav = page.locator("#doc-side-nav");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(nav).toBeHidden();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(nav).toBeVisible();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
});

test("terminal card: Copy copies the commands without the prompt or output", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: (t: string) => { (window as any).__copied = t; return Promise.resolve(); } } });
  });
  await page.goto("/docs/getting-started/installation.html");
  const card = page.locator(".term-card").first();
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: /Copy/ }).click();
  await expect(card.getByRole("button", { name: /Copy/ })).toHaveText("Copied");
  const copied = await page.evaluate(() => (window as any).__copied as string);
  expect(copied).toContain("npm install");
  expect(copied).not.toContain("$");
  expect(copied).not.toMatch(/#/);
});

test("terminal cards: the cursor is a yellow block that stays solid under reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/docs/getting-started/installation.html");
  const cursor = await page.locator(".term-body code").first().evaluate((el) => getComputedStyle(el, "::after").animationName);
  expect(cursor).toBe("none");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/docs/getting-started/installation.html");
  const blinks = await page.locator(".term-body code").first().evaluate((el) => getComputedStyle(el, "::after").animationName);
  expect(blinks).toBe("blink");
});

test("docs at 390 px: a long command scrolls inside its card, never the page", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/docs/getting-started/installation.html");
  await page.evaluate(() => {
    const main = document.querySelector(".doc-body")!;
    const long = "npm run tauri dev -- --config ./src-tauri/tauri.conf.json --features " + "x".repeat(200);
    main.insertAdjacentHTML("beforeend", `<div class="term term-card"><div class="term-bar"><span class="term-label">long</span></div><pre class="term-body"><code><span class="t-cmd"><span class="t-prompt" aria-hidden="true">$ </span>${long}</span></code></pre></div>`);
  });
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(over).toBeLessThanOrEqual(0);
  const scrolls = await page.locator(".term-card").last().locator(".term-body").evaluate((p) => p.scrollWidth > p.clientWidth);
  expect(scrolls).toBe(true);
});

test("figures and images: no image wider than its parent, no page scroll, and at least 16px around each figure", async ({ page }) => {
  const urls = ["/", "/docs/connections/overview.html", "/docs/trusted-answers/ask-bar.html", "/docs/real-time/live-dashboards.html"];
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const url of urls) {
      await page.goto(url);
      const imgs = page.locator("img[src$='.png']");
      for (let k = 0; k < (await imgs.count()); k++) {
        await imgs.nth(k).evaluate(async (i) => { i.scrollIntoView(); await (i as HTMLImageElement).decode().catch(() => undefined); });
      }
      const problems = await page.evaluate(() => {
        const out: string[] = [];
        document.querySelectorAll("img").forEach((img) => {
          const parent = img.parentElement!;
          if (img.getBoundingClientRect().width > parent.getBoundingClientRect().width + 1) out.push(`img wider than parent: ${img.getAttribute("src")}`);
        });
        document.querySelectorAll(".shot-figure, .term-card").forEach((el) => {
          const r = el.getBoundingClientRect();
          const prev = el.previousElementSibling?.getBoundingClientRect();
          const next = el.nextElementSibling?.getBoundingClientRect();
          if (prev && r.top - prev.bottom < 16) out.push(`less than 16px above ${el.className}`);
          if (next && next.top - r.bottom < 16) out.push(`less than 16px below ${el.className}`);
        });
        if (document.documentElement.scrollWidth > window.innerWidth) out.push("horizontal page scroll");
        return out;
      });
      expect(problems, `${url} at ${width}px`).toEqual([]);
    }
  }
});

test("logos are local SVGs, hidden from assistive tech, with a visible name", async ({ page }) => {
  await page.goto("/");
  const names = await page.locator(".marquee li").evaluateAll((lis) => lis.map((li) => (li.textContent ?? "").trim()));
  expect(names.every((n) => n.length > 0)).toBe(true);
  await expect(page.locator(".marquee img").first()).toHaveAttribute("alt", "");
});

test("docs page: one h1, the Oxi brand, no console errors, and its own assets load", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const at = m.location().url || "";
    if (EXTERNAL_OK.test(at) || (/Failed to load resource/.test(m.text()) && EXTERNAL_OK.test(m.text()))) return;
    errors.push(`console: ${m.text()} @ ${at}`);
  });
  for (const url of ["/docs/", "/docs/connections/postgres.html"]) {
    await page.goto(url);
    await expect(page.locator("h1")).toHaveCount(1);
    const text = await page.evaluate(() => {
      const clone = document.body.cloneNode(true) as HTMLElement;
      clone.querySelectorAll("code, pre").forEach((el) => el.remove());
      return clone.innerText;
    });
    expect(text).toContain("Oxi");
    expect(text).not.toMatch(/oxicore/i);
    const refs = await page.evaluate(() => {
      const urls = new Set<string>();
      document.querySelectorAll("link[href], script[src], img[src]").forEach((el) => {
        const v = el.getAttribute("href") || el.getAttribute("src");
        if (v) urls.add(v);
      });
      return [...urls];
    });
    const base = url;
    for (const ref of refs) {
      if (/^[a-z]+:/i.test(ref) || ref.startsWith("#")) continue;
      const res = await request.get(new URL(ref, `http://127.0.0.1${base}`).pathname);
      expect(res.status(), `${url} ${ref}`).toBe(200);
    }
  }
  expect(errors).toEqual([]);
});

test("docs pages: no horizontal scroll at 320, 390, 768, 1024 and 1440 px, and no text under 12px", async ({ page }) => {
  await page.goto("/docs/");
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 800 });
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(over, `docs scroll overflow at ${width}px`).toBeLessThanOrEqual(0);
  }
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
    expect(small, `docs small text at ${width}px`).toEqual([]);
  }
});

test("docs links: the header and footer Docs links and the product 'Read the docs' links point to docs/", async ({ page }) => {
  await page.goto("/");
  const docsLinks = page.locator("a", { hasText: /^(Docs|Read the docs)$/ });
  const count = await docsLinks.count();
  expect(count).toBeGreaterThanOrEqual(5);
  for (let i = 0; i < count; i++) {
    const href = await docsLinks.nth(i).getAttribute("href");
    expect(href, `Docs link ${i}`).toMatch(/^docs\/(#[a-z-]+)?$/);
  }
  const html = read("index.html");
  expect(html).not.toMatch(/href="#">(Docs|Read the docs)</);
});

test("local testing guide is never linked from the public pages or the search index", async () => {
  expect(read("index.html")).not.toMatch(/local-testing/);
  expect(read("docs/search-index.json")).not.toMatch(/local-testing/);
  for (const p of publicDocs()) expect(readFileSync(p, "utf8"), p).not.toMatch(/local-testing/);
});

test("local testing guide is excluded from deploys and marked noindex, with its banner", async ({ page }) => {
  const ignore = read(".vercelignore").split("\n").map((l) => l.trim());
  expect(ignore).toContain("docs/local-testing.html");
  const guide = read("docs/local-testing.html");
  expect(guide).toMatch(/<meta name="robots" content="noindex, nofollow">/);
  await page.goto("/docs/local-testing.html");
  await expect(page.locator(".local-banner")).toContainText("Local testing only. Not deployed. Default test credentials for local Docker containers.");
});

test("screenshots: every product screenshot is a local PNG, and the docs and home page show them", async ({ request }) => {
  const names = ["models-lineage", "explore-ask", "metric-trust", "migration-review", "tableau-preview", "connections", "secure-approval", "dashboard-live"];
  for (const n of names) {
    const res = await request.get(`assets/screens/${n}.png`);
    expect(res.status(), n).toBe(200);
    expect(res.headers()["content-type"], n).toContain("image/png");
    expect(Number(res.headers()["content-length"] ?? 0), `${n} size`).toBeLessThanOrEqual(400 * 1024);
  }
  const docs = publicDocs().map((p) => readFileSync(p, "utf8")).join("\n");
  for (const n of names) expect(docs + read("index.html"), n).toContain(`assets/screens/${n}.png`);
});

test("docs and home page render their screenshots with alt text", async ({ page }) => {
  for (const url of ["/", "/docs/connections/overview.html", "/docs/trusted-answers/ask-bar.html", "/docs/real-time/live-dashboards.html"]) {
    await page.goto(url);
    // Images load lazily: scroll each one into view before checking that it loaded.
    const shots = page.locator("img[src$='.png']");
    for (let k = 0; k < (await shots.count()); k++) {
      await shots.nth(k).evaluate(async (i) => {
        i.scrollIntoView();
        await (i as HTMLImageElement).decode().catch(() => undefined);
      });
    }
    const imgs = await page.evaluate(() =>
      [...document.querySelectorAll("img[src^='assets/screens/'], img[src^='../../assets/screens/'], img[src^='../assets/screens/']")].map((i) => ({
        src: i.getAttribute("src"),
        alt: i.getAttribute("alt") ?? "",
        complete: (i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth > 0,
      })),
    );
    expect(imgs.length, url).toBeGreaterThan(0);
    for (const i of imgs) {
      expect(i.alt.length, `${url} ${i.src}`).toBeGreaterThan(20);
      expect(i.complete, `${url} ${i.src} loaded`).toBe(true);
    }
  }
});

test("product blocks: no placeholder frame is left, and every screenshot is loaded", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.waitForFunction(() => document.querySelectorAll("video[data-video][src]").length >= 4);
  const imgs = page.locator("#product img");
  for (let k = 0; k < (await imgs.count()); k++) {
    await imgs.nth(k).evaluate(async (i) => { i.scrollIntoView(); await (i as HTMLImageElement).decode().catch(() => undefined); });
  }
  await expect(page.locator("#product .frame-ph:visible")).toHaveCount(0);
  const broken = await imgs.evaluateAll((els) => els.filter((i) => !(i as HTMLImageElement).complete || (i as HTMLImageElement).naturalWidth === 0).map((i) => i.getAttribute("src")));
  expect(broken).toEqual([]);
});
