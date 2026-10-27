// Records the Oxi website demo videos (.webm + poster .png) and writes assets/videos/captions.json.
// Usage: node tools/record-demos.mjs [catalog model dashboard sql nested-json]   (default: all)
// Env (all optional): OXICORE_REPO=<oxicore app repo> (needs dist/ built with `npm run build`),
//   OXI_PORT=4396 (devserver port; started here if nothing answers), OXI_DEMO=<scratch dir>.
import { spawn } from "node:child_process";
import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const APP = process.env.OXICORE_REPO ?? join(dirname(fileURLToPath(import.meta.url)), "..", "..", "BI", "oxicore");
const { chromium } = await import(`${APP}/node_modules/playwright/index.mjs`);
const SITE = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT = join(SITE, "assets", "videos");
const DEMO = process.env.OXI_DEMO ?? join(tmpdir(), "oxicore-demo");
const PORT = process.env.OXI_PORT ?? "4396";
const BASE = `http://127.0.0.1:${PORT}`;
const BRAVE = "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Mouse cursor overlay: Playwright's video does not draw the pointer, so clicks would be invisible.
const CURSOR_JS = `(() => {
  const d = document.createElement('div');
  d.id = 'demo-cursor';
  d.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:rgba(255,90,40,.55);border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.35);transition:transform .08s;left:-100px;top:-100px';
  document.addEventListener('mousemove', (e) => { d.style.left = e.clientX + 'px'; d.style.top = e.clientY + 'px'; }, true);
  document.addEventListener('mousedown', () => { d.style.transform = 'scale(.7)'; }, true);
  document.addEventListener('mouseup', () => { d.style.transform = 'scale(1)'; }, true);
  if (document.documentElement) document.documentElement.appendChild(d);
  else document.addEventListener('DOMContentLoaded', () => document.documentElement.appendChild(d));
})();`;

// The app shows the workspace's absolute folder in its headers. Swap the local scratch folder for "~/oxicore-demo"
// in the page text so no machine-specific path is recorded.
function maskJs() {
  const roots = [...new Set([realpathSync(DEMO), DEMO])].sort((a, b) => b.length - a.length);
  return `(() => {
  const roots = ${JSON.stringify(roots)};
  const sub = (s) => { for (const r of roots) s = s.split(r).join("~/oxicore-demo"); return s; };
  // Editable content is never rewritten: CodeMirror and inputs sync DOM edits back into app state.
  const EDIT = "[contenteditable], .cm-editor, input, textarea, select";
  const fixNode = (n) => {
    const el = n.nodeType === Node.TEXT_NODE ? n.parentElement : n;
    if (!el || el.closest(EDIT)) return;
    if (n.nodeType === Node.TEXT_NODE) { const v = sub(n.nodeValue); if (v !== n.nodeValue) n.nodeValue = v; return; }
    if (n.nodeType !== Node.ELEMENT_NODE) return;
    for (const a of ["title", "aria-label", "placeholder"]) { const v = n.getAttribute(a); if (v && sub(v) !== v) n.setAttribute(a, sub(v)); }
  };
  const sweep = (root) => { const w = document.createTreeWalker(root, 5); let n = w.currentNode; while (n) { fixNode(n); n = w.nextNode(); } };
  // Runs as a microtask after each DOM change, so the real path is rewritten before the next paint.
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

async function api(cmd, args = {}) {
  const r = await fetch(`${BASE}/api/call`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ cmd, args }),
  });
  if (!r.ok) throw new Error(`${cmd} failed: HTTP ${r.status}`);
}

/** Centre of data point `idx` of a chart (ECharts instance on the tile's node), in page pixels. */
async function markAt(page, testId, idx = 0) {
  const el = page.getByTestId(testId);
  await el.waitFor({ state: "visible" });
  await el.scrollIntoViewIfNeeded();
  const p = await el.evaluate((node, i) => {
    const c = node.__oxiChart;
    const data = c.getModel().getSeriesByIndex(0).getData();
    const l = data.getItemLayout(i);
    if (l && l.width !== undefined) return { x: l.x + l.width / 2, y: l.y + l.height / 2 };
    if (l && l.r !== undefined) {
      const a = (l.startAngle + l.endAngle) / 2;
      const r = (l.r + l.r0) / 2;
      return { x: l.cx + r * Math.cos(a), y: l.cy + r * Math.sin(a) };
    }
    const [x, y] = c.convertToPixel({ seriesIndex: 0 }, [i, data.get(data.mapDimension("y"), i)]);
    return { x, y };
  }, idx);
  const box = await el.boundingBox();
  return { x: box.x + p.x, y: box.y + p.y };
}

const DEMOS = {
  catalog: {
    title: "Browse every dataset",
    steps: [
      "Open Catalog: Parquet, CSV, JSON, NDJSON and Excel files appear as datasets",
      "Folder datasets, like a partitioned Parquet table, sit alongside single files",
      "Pick a dataset to see its row count and column schema",
      "Switch to Preview to read the first rows",
      "Open Profile for null rates and value stats per column",
    ],
    async run(page, shot) {
      await page.getByRole("heading", { name: "Catalog" }).waitFor();
      await page.getByTestId("dataset-list").getByText("transactions_partitioned", { exact: true }).hover();
      await sleep(2200);
      await page.getByTestId("ds-sales/transactions.parquet").click();
      await page.getByTestId("schema-table").waitFor();
      await sleep(2000);
      await page.getByTestId("tab-preview").click();
      await page.getByTestId("preview-grid").waitFor();
      await sleep(2000);
      await page.getByTestId("tab-profile").click();
      await page.getByTestId("profile-store_region").getByRole("button", { name: "Profile" }).click();
      await page.getByTestId("profile-store_region").getByText("Nulls 0.0%").waitFor();
      await sleep(1800);
      await shot();
    },
  },

  model: {
    title: "Turn a file into a semantic model",
    steps: [
      "Select a file and choose Create model",
      "Oxi drafts a dbt-compatible YAML model from the file's columns",
      "The validator checks the model: the status reads Valid",
      "Save writes the model into the workspace's models folder",
    ],
    async run(page, shot) {
      await page.getByTestId("ds-reference/customers_sample.tsv").click();
      await sleep(2600);
      await page.getByTestId("create-model").click();
      await page.getByTestId("model-editor").waitFor();
      await page.getByTestId("yaml-editor").getByText("semantic_model:").waitFor();
      await page.getByTestId("validation-status").getByText("Valid").waitFor({ timeout: 20_000 });
      await sleep(3000);
      await page.getByTestId("yaml-editor").evaluate((n) => n.scrollBy(0, 260));
      await sleep(3500);
      await shot();
      await page.getByTestId("save-model").click();
      await page.getByTestId("toast-success").getByText("models/customers_sample.yml").waitFor();
      await sleep(3000);
    },
  },

  dashboard: {
    title: "Slice and cross-filter a dashboard",
    steps: [
      "Open the Sales overview dashboard: every card runs its query on DuckDB",
      "Add a Region slicer to narrow all the cards at once",
      "Click a slice to cross-filter the other cards on that channel",
      "The performance panel logs each card's timing, cache use and filters",
    ],
    async run(page, shot) {
      await page.getByTestId("nav-dashboards").click();
      await page.getByTestId("dashboard-select").waitFor();
      await page.getByTestId("tile-foot-t8").getByText(/\d row/).waitFor();
      await sleep(1800);
      await page.getByTestId("slicer-open-transaction__region").click();
      await sleep(600);
      await page.getByTestId("slicer-value-North").check();
      await sleep(400);
      await page.getByTestId("slicer-value-West").check();
      await sleep(600);
      await page.getByTestId("slicer-done").click();
      await page.getByTestId("tile-foot-t6").getByText("2 rows").waitFor();
      await sleep(1400);
      const pt = await markAt(page, "tile-view-t8", 0);
      await page.mouse.click(pt.x, pt.y);
      await page.locator('[data-testid^="cross-"]').first().waitFor();
      await sleep(1600);
      await page.getByTestId("perf-panel").scrollIntoViewIfNeeded();
      await page.getByTestId("perf-table").waitFor();
      await sleep(1800);
      await shot();
      await sleep(800);
    },
  },

  sql: {
    title: "Query models with SQL, then chart the result",
    steps: [
      "Write SQL over the sales model in the SQL console",
      "Run it: the result appears in a grid",
      "Save the result as a card with a bar chart",
      "The chart lands on the Sales pages dashboard",
    ],
    async run(page, shot) {
      await page.getByTestId("nav-sql").click();
      await page.getByTestId("sql-editor").locator(".cm-content").click();
      await sleep(600);
      await page.keyboard.press("ControlOrMeta+A");
      await page.keyboard.insertText("SELECT product_category, SUM(amount) AS revenue FROM sales GROUP BY 1 ORDER BY 1");
      await sleep(1000);
      await page.getByTestId("sql-run").click();
      await page.getByTestId("sql-stats").getByText("6 rows").waitFor();
      await page.getByTestId("sql-grid").getByText("revenue").waitFor();
      await sleep(2200);
      await page.getByTestId("sql-create-card").click();
      await page.getByTestId("save-card-title").fill("Revenue by category (SQL)");
      await page.getByTestId("save-card-chart").selectOption("bar");
      await page.getByTestId("save-card-dashboard").selectOption("sales_pages");
      await page.getByTestId("save-card-page").selectOption("overview");
      await sleep(1000);
      await page.getByTestId("save-to-dashboard-confirm").click();
      await page.getByTestId("toast-success").getByText("Sales pages").waitFor();
      await sleep(900);
      await page.getByTestId("nav-dashboards").click();
      await page.getByTestId("dashboard-select").selectOption("sales_pages");
      const card = page.getByRole("article", { name: "Revenue by category (SQL)" });
      await card.waitFor();
      await card.scrollIntoViewIfNeeded();
      await sleep(2000);
      await shot();
      await sleep(800);
    },
  },

  "nested-json": {
    title: "Flatten nested JSON into tables",
    steps: [
      "Open orders.json: Oxi shows its nested structure as a tree",
      "Arrays of objects become a child table automatically",
      "The preview shows nested fields flattened, such as customer_address_city",
      "Switch to the items table to see one row per SKU",
    ],
    async run(page, shot) {
      await page.getByTestId("ds-nested/orders.json").click();
      await page.getByTestId("nested-panel").waitFor();
      await page.getByTestId("nested-tree").getByText("customer").first().waitFor();
      await sleep(2600);
      await page.getByTestId("nested-array-items").scrollIntoViewIfNeeded();
      await sleep(2600);
      await page.getByTestId("nested-preview").getByText("customer_address_city").waitFor();
      await sleep(4000);
      await page.getByTestId("nested-table-tab-items").click();
      await page.getByTestId("nested-preview").getByText("sku").waitFor();
      await sleep(4000);
      await shot();
      await sleep(800);
    },
  },
};

async function main() {
  const want = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(DEMOS);
  mkdirSync(OUT, { recursive: true });
  mkdirSync(DEMO, { recursive: true });

  // Start the devserver only when nothing answers on the port; a copy of the binary keeps rebuilds from disturbing it.
  let server = null;
  if (!(await up())) {
    const bin = join(DEMO, "oxicore-devserver");
    copyFileSync(join(APP, "target", "debug", "oxicore-devserver"), bin);
    chmodSync(bin, 0o755);
    server = spawn(bin, ["--port", PORT, "--state-dir", join(DEMO, "state"), "--static", join(APP, "dist")], { stdio: "ignore" });
    for (let i = 0; i < 50 && !(await up()); i++) await sleep(200);
  }

  const browser = await chromium.launch({ executablePath: BRAVE, headless: true, slowMo: 120 });
  try {
    for (const id of want) {
      const demo = DEMOS[id];
      // Fresh copy of the fixtures so saves from earlier runs do not leak into this recording.
      await api("close_workspace");
      rmSync(join(DEMO, "ws"), { recursive: true, force: true });
      cpSync(join(APP, "fixtures"), join(DEMO, "ws"), { recursive: true });
      // The model demo uses a workspace whose root holds the data, so the generated source path is relative.
      const wsPath = id === "model" ? join(DEMO, "ws-model") : join(DEMO, "ws", "workspace-plain");
      if (id === "model") {
        rmSync(wsPath, { recursive: true, force: true });
        mkdirSync(wsPath, { recursive: true });
        writeFileSync(join(wsPath, "oxicore.yml"), "version: 1\nname: sales-analytics\ndata_folders:\n- path: ./data\n");
        cpSync(join(APP, "fixtures", "data"), join(wsPath, "data"), { recursive: true });
      }
      await api("open_workspace", { path: wsPath });

      const videoDir = join(DEMO, "video", id);
      rmSync(videoDir, { recursive: true, force: true });
      const ctx = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 2,
        recordVideo: { dir: videoDir, size: { width: 1440, height: 900 } },
      });
      await ctx.addInitScript(CURSOR_JS);
      await ctx.addInitScript(maskJs());
      const page = await ctx.newPage();
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(`${BASE}/`);
      await sleep(800);
      const shot = async () => {
        await page.evaluate(() => (document.getElementById("demo-cursor").style.display = "none"));
        await page.screenshot({ path: join(OUT, `${id}.png`) });
        await page.evaluate(() => (document.getElementById("demo-cursor").style.display = ""));
      };
      const video = page.video();
      await demo.run(page, shot);
      await sleep(600);
      await ctx.close();
      renameSync(await video.path(), join(OUT, `${id}.webm`));
      console.log(`recorded ${id}.webm and ${id}.png`);
    }
  } finally {
    await browser.close();
    await api("close_workspace").catch(() => {});
    if (server) server.kill();
  }

  // Captions for the site, in the brief's format. Entries for demos not recorded now are kept.
  const capFile = join(OUT, "captions.json");
  const old = existsSync(capFile) ? JSON.parse(readFileSync(capFile, "utf8")) : [];
  const all = Object.entries(DEMOS).map(([id, d]) => ({ id, title: d.title, file: `${id}.webm`, poster: `${id}.png`, steps: d.steps }));
  const merged = all.map((c) => old.find((o) => o.id === c.id && want.indexOf(c.id) < 0) ?? c);
  writeFileSync(capFile, JSON.stringify(merged, null, 2) + "\n");
}

await main();
