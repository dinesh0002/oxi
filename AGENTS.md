# Agent guide: Oxi site

Read this before changing anything.

## Purpose

The marketing site for **Oxi**, a local-first desktop BI app. It explains the product, shows
the demos and sets early-access expectations. It has no backend and no accounts. The only analytics is cookieless Vercel Web
Analytics, loaded by `main.js` on the deployed site only; do not add other tracking.

Brand note: the product brand is **Oxi**. Some names inside the app and its tooling still say
`oxicore` (the app repo, `oxicore-devserver`, the `oxicore.yml` workspace file and the
`OXICORE_REPO` variable). Keep those names as they are: they refer to real files and commands.

## Structure

```
index.html            all sections and content (one h1, skip link, landmarks)
styles.css            tokens on :root, layout, motion, responsive rules (also the docs page)
main.js               mobile menu, scroll reveal, demo videos, hero terminal
favicon.svg
docs/index.html       docs landing: categories and section cards (same header/footer as every page)
docs/<section>/<page>.html  27 docs pages in 7 sections; see "Working with docs" below
docs/docs.js          search modal (Ctrl/Cmd+K), mobile sections toggle, terminal Copy buttons
docs/search-index.json  the search index (title, section, path, text), one entry per page
docs/local-testing.html  OWNER ONLY, LOCAL ONLY: test-service values. In .vercelignore, noindex,
                      linked from nothing public. Never link to it, and never deploy it
assets/videos/        .webm demos, .png posters, captions.json (drives "How it works")
assets/screens/       app screenshots: crops of the relevant region, 2x PNG, made by tools/capture-screens.mjs
assets/logos/         Simple Icons SVGs (CC0), vendored once; README.md has the source and licence
tools/record-demos.mjs  re-records the demos from the app repo (env OXICORE_REPO)
tools/capture-screens.mjs  re-captures assets/screens/ from the app repo (env OXICORE_REPO)
tests/site.spec.ts    Playwright checks (desktop and mobile projects)
vercel.json           headers, cache rules, CSP, static output
.vercelignore         files kept out of the deploy (tools, tests, docs/local-testing.html)
.github/workflows/    ci.yml (tests on pull requests and main)
```

## How to run and test

- Serve: `npm run serve` (http://127.0.0.1:5190)
- Test: `npm ci` once, then `npx playwright test`. The suite starts its own server on 5191.
- Playwright uses Brave locally when it is installed; CI uses bundled chromium.

## HARD RULES

1. **Plain HTML, CSS and vanilla JS only.** No frameworks, no build step, no bundlers, no CSS
   libraries, no runtime npm dependencies. Playwright is the only dev dependency.
2. **Light theme only.** Colours come from the tokens on `:root` in `styles.css`. Do not add a
   dark theme. The hero terminal panel is dark on purpose.
3. **Design tokens.**
   - Font: JetBrains Mono everywhere (`--mono`).
   - Colours: `--bg` #F6F8FC, `--panel` #FFFFFF, `--surface` #EEF2FA, `--border` #D6DEEE,
     `--text` #0B1530, `--muted` #44516E, `--primary` #1E40AF (links, focus-adjacent accents),
     `--accent` #FACC15 (yellow), `--accent-hover` #EAB308, `--accent-wash` #FEF9C3,
     `--accent-line` #FDE047, `--on-accent` #0B1530, `--green` #15803D, `--focus` #1D4ED8.
   - Yellow (`--accent`) is for fills, markers, bullets and bars only, with near-black text on
     it. Never use yellow as text on white.
   - Logo (`assets/logo.svg`, `favicon.svg`): navy (#0B1530) pixel letters "oxi" with a yellow
     i-dot and a yellow underline bar, transparent background. Yellow stays an accent, never the
     letters, so the logo reads clearly from a distance.
   - Links and text use `--primary` or `--text`. Focus rings stay blue (`--focus`).
   - Square corners, 1px borders, the grid background. No shadows except the terminal.
4. **Motion** only through CSS keyframes and the single IntersectionObserver in `main.js`.
   Everything stops under `prefers-reduced-motion: reduce` (the test checks this).
5. **Accessibility musts.**
   - Text contrast at least 4.5:1 (3:1 for large text). The test suite does not check this;
     check new colour pairs by hand.
   - Touch targets at least 44x44 px at 834 px wide and below.
   - Visible focus on every interactive element.
   - Menu and toggles keep `aria-expanded`, `aria-controls` and an updated `aria-label`.
   - Images and icons have `alt` or `aria-hidden`. Icon-only links have accessible names.
   - Videos are `muted`, `playsinline`, have a `poster`, and have a Pause/Play button.
6. **Copy rules.**
   - Only true product facts. Mark unbuilt features as "coming" (for example, "Coming: secure
     connections to Postgres").
   - No fake customers, logos, quotes, testimonials or pricing.
   - Every number must cite a bench result (see the Benchmarks section and `bench/` in the app
     repo). Do not add numbers without one.
   - Headlines are short and two-beat, for example "Your data. Your laptop. Instant answers."
   - Labels are lowercase monospace (`// why oxi`).
   - Visible text says **Oxi**, never "OxiCore" (a test enforces it).
7. **Videos.**
   - Format: `.webm` with a `.png` poster in `assets/videos/`.
   - `captions.json` is an array of `{ id, title, file, poster, steps[] }`. The hero and product
     blocks use `data-video="<id>"`.
   - Re-record with `tools/record-demos.mjs` (set `OXICORE_REPO`). Do not hand-edit recordings.
   - Privacy: no local paths or usernames may be visible in a recording. The tool masks the
     scratch folder; check the posters and the video before you commit.
8. **Working style ("ponytail").** Make the smallest complete change. Reuse existing classes
   and tokens. Add one test per new behaviour.
9. **Before finishing any change:** run `npx playwright test` until it is green, and look at
   the 390 px and 1440 px screenshots of the page.
10. **Never deploy.** The Vercel Git integration has auto-deploys off
    (`"git": { "deploymentEnabled": false }` in `vercel.json`); a maintainer deploys by hand
    from the Vercel dashboard. Do not run `vercel deploy` or add a deploy workflow.
11. **Never commit secrets.** No tokens, keys, `.env` files or `.vercel/` folder.
12. **The GitHub link is a placeholder.** The header and mobile link is `href="#"` with
    `data-github-link` and `aria-disabled="true"`, and it has a `TODO` comment in `index.html`.
    Set the URL only when the repo is public, and update the TODO.
13. **CSP.** `vercel.json` allows only self and Google Fonts. The inline `<script>` in
    `index.html` is allowed by its SHA-256 hash, so changing that script changes the hash.
    Inline `style=` attributes are allowed via `style-src-attr`. Any new external origin
    needs a CSP change and a reason.

## Working with docs

The docs are plain static HTML: there is no generator in the repo. Every page carries its own
header, footer and sidebar, so a change to the shared parts is made in every page. Run the tests after
each change.

### Files and links

- Landing: `docs/index.html`. Pages: `docs/<section>/<page>.html`. Shared CSS is in `styles.css`
  (the docs rules sit under the "Docs" comments); behaviour is in `docs/docs.js`.
- Link to pages with the `.html` extension, relative (for example `../connections/postgres.html` from a
  page). `npm run serve` (python http.server) does not do clean URLs, so `.html` is the form that works
  both locally and on Vercel (`cleanUrls` redirects `.html` to the clean path).
- Directory links keep the trailing slash: `docs/`, `../`.
- No inline scripts. The one inline snippet (`document.documentElement.classList.add('js')`) is the same
  text on every page, so its CSP hash stays valid. Put new behaviour in `docs/docs.js`.

### Adding a page (checklist)

1. Copy an existing page in the same section as the template.
2. Set `<title>` ("Page | Oxi docs"), the meta description, one `<h1>`, and the `<p class="lead">`.
3. Breadcrumb: Oxi / docs / Section / Page (the `nav.crumbs` block).
4. Sidebar: add the link to the `ul.side-links` of its section on every docs page (27 copies, kept in
   sync by hand).
5. Landing: add the card (`li > a.doc-card`, with the next zero-padded index) and bump that section's
   category pill count (`.count`).
6. Search: add an entry to `docs/search-index.json` (`path` is `docs/<section>/<page>.html`).
7. Prev and next: set the `.pager` links on the new page and on its two neighbours. The first page's
   previous and the last page's next both point to the docs landing.
8. Run `npx playwright test`. The suite checks the card count (27), the search index count (27), the
   breadcrumb, aria-current, prev and next, and that no page links to `local-testing`. Update the counts
   in `tests/site.spec.ts` when you add or remove a page.

### Adding a section

- Give it a slug (lowercase, hyphens). Use it in the eyebrow `<p class="eyebrow">// slug</p>`, the
  `<section id="slug">` on the landing, the category pill `a.pill[href="#slug"]`, and a sidebar group
  (`li.side-group > a.side-label[href="../#slug"]`) on every page.

### Layout and headings

- `main.doc-page` > `.doc-layout`: the sidebar (`aside.doc-side`) and the article (`article.doc-article`).
  From 835 px the sidebar is 240 px wide and sticky. At 834 px and below it collapses into
  `button#doc-side-toggle` (aria-expanded, aria-controls `doc-side-nav`). There is no "on this page"
  table of contents.
- Headings: one `h1` per page, in `.doc-head`. Each part of the page is `<section id aria-labelledby>`
  inside `.doc-body`, with an `h2`. Use `h3` inside a section. There is no numbered-H3 pattern: numbered
  steps come from `ol.steps`, which counts 01, 02 and so on.
- Lists: `ol.steps` for procedures; `ul.facts` for facts (yellow square bullets).
- Callouts: `p.note-line` (yellow left rule; the text stays `--text`).
- Tables: `div.table-wrap > table.fields`, with a Field and Notes header and `th scope="row"` for the
  field name. A table scrolls inside its wrap, never the page.
- Inline code: `<code>`. Multi-line file snippets (YAML): `pre.code > code`.

### Shell commands: terminal cards

- Every shell command block is a card in the hero terminal's look (dark panel, `--t-*` tokens):

```html
<div class="term term-card">
  <div class="term-bar"><span class="dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="term-label">desktop app</span></div>
  <pre class="term-body"><code><span class="t-comment"># from the source repository</span>
<span class="t-cmd"><span class="t-prompt" aria-hidden="true">$ </span>npm install</span>
<span class="t-out">output lines go here, without a prompt</span></code></pre>
</div>
```

- `span.t-cmd` is one command. `span.t-prompt` (the `$`) is not selectable and not copied.
  `span.t-comment` is a muted `#` line. `span.t-out` is dimmer output.
- The Copy button is added by `docs/docs.js` to the `.term-bar` (44 px, keyboard focusable). It copies
  the `t-cmd` lines only, shows "Copied" for 2 seconds, and announces it in a polite live region.
- Long lines scroll inside the card (`.term-body` has `overflow-x: auto`), never the page.
- The yellow block cursor after the last line is CSS (`.term-body code::after`), so it is never copied.
  It blinks on a 1 s step keyframe and stays solid under `prefers-reduced-motion`.
- Commands in running text stay inline `<code>`. The `local-testing` page uses the same cards.

### Figures and screenshots

- One style, in `styles.css`: `figure.shot-figure` has 24 px above and below. The `img` has a 1 px
  `--border` frame and never grows past its column (`max-width: 100%`). The `figcaption` sits 8 px below
  the image, in `--muted`, 13 px.
- On the home page, product blocks are two columns from 1025 px with a 32 to 48 px gap. The text and the
  image tops align (`align-items: start`). Below 1025 px they stack with the same spacing. Each block has one
  focused crop, or two stacked crops when the content needs both.
- Screenshots are crops, not whole windows. Each capture is a clip of the region the text describes, taken at
  about the size it is shown (roughly 460 to 660 CSS px wide), so the app text reads at 11 px or more. The
  capture tool sets a narrower window for panels that are wide (`VIEWPORT` in the tool), so the crop needs no
  scaling. Never upscale: the CSS sets no width, so the `width` attribute (half the PNG size) sets the size
  and `max-width: 100%` caps it at the column.
- A figure with no real media must not be left as a placeholder. The `.frame-ph` stripe is only a loading
  state for a demo video. Every product block must show a loaded screenshot or a demo that exists.
- Files: `assets/screens/<name>.png`, captured at 2x (`deviceScaleFactor: 2`). Set the `width` and
  `height` attributes to half the PNG's pixel size, so the browser shows it at 2x and never up-scales.
- Alt text describes what is on screen and ends with "Sample data." It must be over 20 characters (a
  test checks this).
- Privacy: check each capture at 100 percent zoom for local paths, usernames or real data. The capture
  tool masks the scratch folder; check anyway.

### Logos and tags

- Logos: `assets/logos/*.svg` (Simple Icons, CC0; see the README there). Use `alt=""` and
  `aria-hidden="true"`, always next to the visible name. Marquee logos are 20 px (`.mq-logo`); docs marks
  are 32 px in a 48 px box (`.doc-mark`).
- Where Simple Icons has no icon, use a text badge: `.mq-badge` (marquee) or `.doc-mark.is-badge` (docs).
  Never draw a logo by hand.
- "coming": `<span class="soon">coming</span>` next to the name. "new" is written in the text ("New: ...")
  and is used only for things that are built on the backend.
- Colour: tokens from `:root` only, no new colours. Yellow (`--accent`) is a fill, a marker or a bullet,
  never text.

### Copy style

- Short sentences. Steps as ordered lists. Only true facts about the app; unbuilt features say "coming".
- No test passwords or credentials in public docs. The only page with test values is
  `docs/local-testing.html`.

### local-testing.html

- Owner only and local only: listed in `.vercelignore`, `noindex, nofollow`, linked from no page and
  absent from the search index. Keep it that way; the suite enforces it.

### Search modal

- `docs/search-index.json` is an array of `{ title, section, path, text }`. `path` is
  `docs/<section>/<page>.html`; docs.js resolves it from the site root. `text` is a summary of about 400
  characters, from the description, the lead and the body, without code blocks.
- Ctrl+K or Cmd+K (or the header search button) opens it. Type to search: every word must match.
  Up and Down move, Enter opens, Escape closes. Focus stays inside the dialog (Tab moves between the
  input and Close).
- To update: edit the entry for the page you changed, or add one for a new page.

### Recording and screenshots

- Screenshots: `OXICORE_REPO=/Users/jyothsnapriya/Documents/BI/oxicore node tools/capture-screens.mjs`
  (optionally with names to capture only some). Each crop is set in its screen function (`shotRect` with CSS
  pixel coordinates, or a locator). After a capture, set the `width` and `height` attributes to half the new
  PNG size in index.html and in the docs pages that use it. The app needs `npm run build` (its `dist/`) and
  `cargo build -p oxicore-devserver` first.
- Demos: `OXICORE_REPO=... node tools/record-demos.mjs`, then regenerate the posters and check
  `captions.json`.
- Rerun both after any change to the app's UI, and check every output at 100 percent zoom for privacy.
