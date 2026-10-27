// Captures the Oxi website screenshots (assets/screens/*.png) from the app's devserver.
// Usage: node tools/capture-screens.mjs [name ...]   (default: all)
// Env (all optional): OXICORE_REPO=<oxicore app repo> (needs dist/ built with `npm run build`
//   and target/debug/oxicore-devserver built), OXI_PORT=4397 (devserver port; started here if nothing
//   answers), OXI_DEMO=<scratch dir> (default: a new folder under the OS temp dir).
// Privacy: the devserver shows the workspace's absolute folder in its headers. The scratch folder is
//   masked to "~/oxi-screens" in page text and attributes, and the run stops if the user's home path or
//   login name shows up on a page before a screenshot is taken.
import { spawn } from "node:child_process";
import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir, userInfo } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Default: the app repo next to this site's parent folder (../BI/oxicore). Set OXICORE_REPO to override.
const APP = process.env.OXICORE_REPO ?? join(dirname(fileURLToPath(import.meta.url)), "..", "..", "BI", "oxicore");
const { chromium } = await import(`${APP}/node_modules/playwright/index.mjs`);
const SITE = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT = join(SITE, "assets", "screens");
const OWN_DEMO = !process.env.OXI_DEMO;
const DEMO = process.env.OXI_DEMO ?? mkdtempSync(join(tmpdir(), "oxi-screens-"));
const PORT = process.env.OXI_PORT ?? "4397";
const BASE = `http://127.0.0.1:${PORT}`;
const BRAVE = "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser";
const FAKE_AI = join(DEMO, "fake-ai.json");
const WS_ROOT = join(DEMO, "ws");
const WS = join(WS_ROOT, "workspace-plain");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LOGIN = userInfo().username;

// Same masking idea as record-demos.mjs: swap the scratch folder for a neutral label in page text.
function maskJs() {
  const roots = [...new Set([realpathSync(DEMO), DEMO])].sort((a, b) => b.length - a.length);
  return `(() => {
  const roots = ${JSON.stringify(roots)};
  const sub = (s) => { for (const r of roots) s = s.split(r).join("~/oxi-screens"); return s; };
  const EDIT = "[contenteditable], .cm-editor, input, textarea, select";
  const fixNode = (n) => {
    const el = n.nodeType === Node.ELEMENT_NODE ? n : n.parentElement;
    // Option labels are not edited by the app, so they are masked too (select values are left alone).
    if (!el || !el.closest || (el.closest(EDIT) && !el.closest("option"))) return;
    if (n.nodeType === Node.TEXT_NODE) { const v = sub(n.nodeValue); if (v !== n.nodeValue) n.nodeValue = v; return; }
    if (n.nodeType !== Node.ELEMENT_NODE) return;
    for (const a of ["title", "aria-label", "placeholder"]) { const v = n.getAttribute(a); if (v && sub(v) !== v) n.setAttribute(a, sub(v)); }
  };
  const sweep = (root) => { const w = document.createTreeWalker(root, 5); let n = w.currentNode; while (n) { fixNode(n); n = w.nextNode(); } };
  new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === "childList") m.addedNodes.forEach((n) => (n.nodeType === 1 ? sweep(n) : fixNode(n)));
      else fixNode(m.target);
    }
  }).observe(document, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["title", "aria-label", "placeholder"] });
  document.addEventListener("DOMContentLoaded", () => sweep(document.documentElement));
})();`;
}

async function up() {
  try { return (await fetch(`${BASE}/api/health`)).ok; } catch { return false; }
}

/** One backend command over the devserver API. Reply: a tag byte (0 = JSON), then the JSON. */
async function call(cmd, args = {}) {
  const r = await fetch(`${BASE}/api/call`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ cmd, args }),
  });
  const bytes = new Uint8Array(await r.arrayBuffer());
  if (!r.ok || bytes[0] !== 0) throw new Error(`${cmd} failed: ${Buffer.from(bytes.subarray(1)).toString()}`);
  return JSON.parse(Buffer.from(bytes.subarray(1)).toString());
}

/** Fresh copy of the fixtures, laid out as the e2e global setup does, then open the workspace. */
async function freshWorkspace(extra = {}) {
  await call("close_workspace").catch(() => {});
  rmSync(WS_ROOT, { recursive: true, force: true });
  mkdirSync(WS_ROOT, { recursive: true });
  const fx = join(APP, "fixtures");
  cpSync(join(fx, "data"), join(WS_ROOT, "data"), { recursive: true });
  cpSync(join(fx, "workspace-plain"), WS, { recursive: true });
  cpSync(join(fx, "pbip"), join(WS_ROOT, "pbip"), { recursive: true });
  cpSync(join(fx, "tableau"), join(WS, "tableau"), { recursive: true });
  writeFileSync(FAKE_AI, "[]");
  await call("open_workspace", { path: WS });
}

const DEMO_PAGE_LEAKS = [`/Users/${LOGIN}`, LOGIN, "/private/var", realpathSync(DEMO), DEMO].filter((s) => s && s.length > 2);

/** Guards a screenshot: fails the run if a local path or the login name is on the page. */
async function checkPrivacy(page, name) {
  const found = await page.evaluate(() => {
    const parts = [document.body.innerText];
    document.querySelectorAll("input, textarea").forEach((el) => parts.push(el.value));
    document.querySelectorAll("option").forEach((el) => parts.push(el.textContent ?? ""));
    document.querySelectorAll("[title], [aria-label], [placeholder]").forEach((el) => {
      for (const a of ["title", "aria-label", "placeholder"]) parts.push(el.getAttribute(a) ?? "");
    });
    return parts.join("\n");
  });
  const hits = DEMO_PAGE_LEAKS.filter((s) => found.includes(s));
  if (hits.length) {
    const at = found.indexOf(hits[0]);
    throw new Error(`${name}: local path or login name is visible (${hits.join(", ")}); not saved. Near: ${JSON.stringify(found.slice(Math.max(0, at - 80), at + 40))}`);
  }
}

async function shot(page, name, locator) {
  await checkPrivacy(page, name);
  const target = locator ?? page;
  const file = join(OUT, `${name}.png`);
  if (locator) await locator.screenshot({ path: file });
  else await page.screenshot({ path: file });
  console.log(`saved assets/screens/${name}.png`);
}

/** Screenshot of one CSS-pixel rectangle of the viewport (the crop), at the context's deviceScaleFactor. */
async function shotRect(page, name, rect) {
  await checkPrivacy(page, name);
  await page.screenshot({ path: join(OUT, `${name}.png`), clip: rect });
  console.log(`saved assets/screens/${name}.png (crop ${rect.width}x${rect.height} CSS px)`);
}

/** Bounding box (viewport CSS px) around the elements with these test ids, plus a margin. */
async function unionRect(page, testIds, pad = 8) {
  const r = await page.evaluate(({ ids, pad }) => {
    const rects = ids.map((id) => document.querySelector(`[data-testid="${id}"]`)?.getBoundingClientRect()).filter(Boolean);
    const x = Math.min(...rects.map((b) => b.left)) - pad;
    const y = Math.min(...rects.map((b) => b.top)) - pad;
    const right = Math.max(...rects.map((b) => b.right)) + pad;
    const bottom = Math.max(...rects.map((b) => b.bottom)) + pad;
    const left = Math.max(0, x), top = Math.max(0, y);
    return { x: Math.floor(left), y: Math.floor(top), width: Math.ceil(right - left), height: Math.ceil(bottom - top) };
  }, { ids: testIds, pad });
  return r;
}

async function enableAi(page) {
  await page.getByTestId("nav-settings").click();
  await page.getByTestId("ai-provider").selectOption("ollama");
  if (!(await page.getByTestId("ai-allow-untested").isChecked())) await page.getByTestId("ai-allow-untested").click();
  await page.getByTestId("ai-enabled").click();
  await page.getByTestId("ai-enabled").isChecked();
}

async function disableAi(page) {
  await page.getByTestId("nav-settings").click();
  if (await page.getByTestId("ai-enabled").isChecked()) await page.getByTestId("ai-enabled").click();
}

// Narrower windows for the panels whose content is wide, so the crop reads at about 1:1 on the page.
const VIEWPORT = { connections: 760, "secure-approval": 760, "migration-review": 900, "tableau-preview": 900, "explore-ask": 980 };

const SCREENS = {
  // Models: the lineage graph (sources → models → metrics → dashboards).
  "models-lineage": async (page) => {
    await page.getByTestId("nav-models").click();
    await page.getByTestId("models-view-lineage").click();
    const graph = page.getByTestId("lineage-graph");
    await graph.waitFor();
    await graph.scrollIntoViewIfNeeded();
    await sleep(1200);
    await shot(page, "models-lineage", graph);
  },

  // Explore: an Ask answer with its metrics and trust status (fake AI, no network). The SQL stays collapsed,
  // because the generated SQL shows the scratch folder.
  "explore-ask": async (page) => {
    page.on("dialog", (d) => void d.accept());
    await page.getByTestId("nav-models").click();
    await page.getByTestId("model-sales").click();
    await page.getByTestId("add-test-total_revenue").click();
    await page.getByTestId("run-metric-tests").click();
    await page.getByTestId("metric-status-total_revenue").getByText("Tested", { exact: true }).waitFor();
    await page.getByTestId("certify-total_revenue").click();
    await page.getByTestId("metric-status-total_revenue").getByText("Certified").waitFor();
    writeFileSync(FAKE_AI, JSON.stringify([{ name: "answer", input: { metrics: ["total_revenue"] } }]));
    await enableAi(page);
    await page.getByTestId("nav-explore").click();
    await page.getByTestId("ask-input").fill("what is our revenue?");
    await page.getByTestId("ask-submit").click();
    await page.getByTestId("ask-result").waitFor();
    await sleep(6500);
    // The answer panel only (metric chip, status line, value, SQL toggle), cropped to its own edges.
    const askBox = await page.evaluate(() => {
      const top = document.querySelector("[data-testid='ask-stats']").getBoundingClientRect();
      const sql = document.querySelector("[data-testid='ask-sql']").closest("details").getBoundingClientRect();
      const panel = document.querySelector("[data-testid='ask-result']").getBoundingClientRect();
      const x = Math.floor(panel.left) - 8, y = Math.floor(top.top) - 8;
      return { x, y, width: Math.ceil(panel.width) + 16, height: Math.ceil(sql.bottom) + 8 - y };
    });
    await shotRect(page, "explore-ask", askBox);
    await disableAi(page);
  },

  // Metric trust: the status badge on each metric (untested, tested, certified).
  "metric-trust": async (page) => {
    page.on("dialog", (d) => void d.accept());
    await page.getByTestId("nav-models").click();
    await page.getByTestId("model-sales").click();
    await page.getByTestId("add-test-order_count").click();
    await page.getByTestId("run-metric-tests").click();
    await page.getByTestId("metric-status-order_count").getByText("Tested", { exact: true }).waitFor();
    await page.getByTestId("certify-order_count").click();
    await page.getByTestId("metric-status-order_count").getByText("Certified").waitFor();
    await sleep(6500);
    // The Metric trust panel only.
    await shotRect(page, "metric-trust", { x: 922, y: 200, width: 347, height: 530 });
  },

  // Migration: Power BI import, reconciliation scored against the Power BI values, and the review queue.
  "migration-review": async (page) => {
    await page.getByTestId("nav-models").click();
    await page.getByTestId("osi-import").click();
    await page.getByTestId("pbip-source").click();
    await page.getByTestId("pbip-path").fill("../pbip/SalesReport");
    await page.getByTestId("pbip-preview").click();
    await page.getByTestId("pbip-coverage").waitFor();
    await page.getByTestId("pbip-import").click();
    await page.getByTestId("toast-success").last().waitFor();
    await page.getByTestId("nav-models").click();
    await page.getByTestId("migration-sales_report").click();
    await page.getByTestId("mig-path").fill("../pbip/reference");
    await page.getByTestId("mig-load").click();
    await page.getByTestId("mig-run").click();
    await page.getByTestId("mig-score-sales_report").getByText("100.0%").waitFor();
    await page.getByTestId("mig-review").scrollIntoViewIfNeeded();
    await sleep(6500);
    // The review queue only: the workspace's own "Problems" list sits beside the panel.
    await shot(page, "migration-review", page.getByTestId("mig-review"));
  },

  // Tableau: the preview with honest coverage before anything is written.
  "tableau-preview": async (page) => {
    await call("add_data_folder", { path: join(WS, "tableau", "data") });
    await page.getByTestId("nav-models").click();
    await page.getByTestId("osi-import").click();
    await page.getByTestId("tableau-source").click();
    await page.getByTestId("tableau-path").fill("tableau/SalesWorkbook.twb");
    await page.getByTestId("tableau-preview").click();
    await page.getByTestId("tableau-coverage").waitFor();
    await sleep(800);
    // The coverage headline and the tables mapping; the modal's buttons and calculated-field list are cut away.
    await shotRect(page, "tableau-preview", { x: 36, y: 232, width: 788, height: 220 });
  },

  // Connections: cards, an approval banner for a definition not yet approved, and the Add form.
  connections: async (page) => {
    await page.getByTestId("nav-connections").click();
    await page.getByTestId("conn-add").click();
    await page.getByTestId("conn-kind-sqlite").click();
    await page.getByTestId("conn-field-id").fill("shop_lite");
    await page.getByTestId("conn-field-path").fill("shop.sqlite");
    await page.getByTestId("conn-test").click();
    await page.getByTestId("conn-test-result").waitFor();
    await page.getByTestId("conn-save").click();
    await page.getByTestId("conn-card-shop_lite").waitFor();
    await call("save_connection", {
      trust: false,
      connection: { id: "shop_copy", kind: "sqlite", path: "shop.sqlite", label: "Shop copy (not yet approved)" },
    }).catch(() => {});
    await page.reload();
    await page.getByTestId("nav-connections").click();
    await page.getByTestId("conn-card-shop_lite").waitFor();
    await sleep(800);
    // Both connection cards, with the approval banner on the second.
    await shotRect(page, "connections", await unionRect(page, ["conn-card-shop_lite", "conn-card-shop_copy"]));
    await call("delete_connection", { id: "shop_copy" }).catch(() => {});
  },

  // Secure by design: the unapproved connection card with its approval banner (replaces the missing video).
  "secure-approval": async (page) => {
    await call("save_connection", {
      trust: false,
      connection: { id: "shop_copy", kind: "sqlite", path: "shop.sqlite", label: "Shop copy (not yet approved)" },
    });
    await page.reload();
    await page.getByTestId("nav-connections").click();
    await page.getByTestId("conn-card-shop_copy").waitFor();
    await sleep(800);
    await page.getByTestId("conn-card-shop_copy").screenshot({ path: join(OUT, "secure-approval.png") });
    console.log("saved assets/screens/secure-approval.png");
  },

  // Live sources: the Add live source wizard, first step.
  "live-wizard": async (page) => {
    await page.getByTestId("nav-connections").click();
    await page.getByTestId("live-add").click();
    await page.getByTestId("live-kind").waitFor();
    await sleep(600);
    await shot(page, "live-wizard");
  },

  // Dashboards: the Live badge while auto-refresh runs.
  "dashboard-live": async (page) => {
    await page.getByTestId("nav-dashboards").click();
    await page.getByTestId("dashboard-select").selectOption("sales_overview");
    await page.getByTestId("tile-foot-t8").getByText(/\d row/).waitFor();
    await sleep(1000);
    await page.getByTestId("auto-refresh").selectOption("1");
    await page.getByTestId("live-badge").getByText("Live").waitFor();
    await sleep(1500);
    // The Live badge directly above the two right-hand KPI cards. The page-tab and slicer rows in between are
    // hidden for this crop only: their content sits on the left, so within the crop they are empty bands.
    await page.addStyleTag({ content: ".page-bar, [data-testid='slicer-bar'] { display: none !important; }" });
    await sleep(300);
    const badge = await unionRect(page, ["live-badge"], 0);
    const tiles = await unionRect(page, ["tiles"], 0);
    const right = badge.x + badge.width + 8;
    await shotRect(page, "dashboard-live", { x: right - 598, y: badge.y - 12, width: 598, height: Math.min(tiles.y + 216, 720) - (badge.y - 12) });
    await page.getByTestId("auto-refresh").selectOption("0");
  },
};

async function main() {
  const want = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SCREENS);
  mkdirSync(OUT, { recursive: true });
  mkdirSync(DEMO, { recursive: true });
  let server = null;
  if (!(await up())) {
    const bin = join(DEMO, "oxicore-devserver");
    copyFileSync(join(APP, "target", "debug", "oxicore-devserver"), bin);
    chmodSync(bin, 0o755);
    server = spawn(bin, ["--port", PORT, "--state-dir", join(DEMO, "state"), "--static", join(APP, "dist")], {
      stdio: "ignore",
      // The app records the OS user name as the certifier: give the server a neutral name instead.
      env: { ...process.env, OXI_FAKE_AI: FAKE_AI, USER: "analyst", USERNAME: "analyst", LOGNAME: "analyst" },
    });
    for (let i = 0; i < 50 && !(await up()); i++) await sleep(200);
  }
  const browser = await chromium.launch({ executablePath: existsSync(BRAVE) ? BRAVE : undefined, headless: true });
  try {
    for (const name of want) {
      if (!SCREENS[name]) throw new Error(`unknown screen ${name}`);
      await freshWorkspace();
      const ctx = await browser.newContext({ viewport: { width: VIEWPORT[name] ?? 1280, height: 800 }, deviceScaleFactor: 2, colorScheme: "light" });
      await ctx.addInitScript(maskJs());
      const page = await ctx.newPage();
      page.on("pageerror", (e) => console.error(`${name} pageerror: ${e.message}`));
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(`${BASE}/`);
      await page.getByRole("heading", { name: "Catalog" }).waitFor();
      await SCREENS[name](page);
      await ctx.close();
    }
  } finally {
    await browser.close();
    await call("close_workspace").catch(() => {});
    if (server) server.kill();
    if (OWN_DEMO) rmSync(DEMO, { recursive: true, force: true });
  }
}
await main();
