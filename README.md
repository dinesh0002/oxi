# Oxi site

The marketing site for Oxi. Plain HTML, CSS and vanilla JS. No framework, no bundler,
no build step. Fonts come from Google Fonts.

## What is Oxi

Oxi is a local-first desktop BI app. It runs entirely on your machine: point it at your
files, model them once, and build dashboards on top.

- **Catalog**: point it at folders and Oxi shows Parquet, CSV/TSV, JSON/NDJSON, Excel and
  DuckDB files as datasets.
- **Semantic models**: metrics, entities and joins live in dbt-compatible YAML, validated
  live as you edit, with OSI (open semantic interchange) import and export.
- **Dashboards**: card types, slicers, cross-filter and drill-through pages.
- **Engine**: a Rust core with embedded DuckDB, and a React UI in a Tauri shell.

Oxi is early (v0.1). Connections to databases such as Postgres, Snowflake and BigQuery
are coming.

## Why Oxi

Hosted BI tools bill per query, keep metric definitions in more than one place, and make
you upload your extracts to someone else's servers. Oxi does the same work on your laptop:

- **Your data stays local.** No uploads, no telemetry, no network calls.
- **No server to run.** Open a folder and query it. No warehouse to set up.
- **Fast on a laptop.** 100M rows reload in 5.6 s uncached on an M1 Mac with 8 GB RAM,
  and cached reloads take under 1 ms on the backend.
- **One set of numbers.** Metrics are defined once in open formats, with no lock-in.
- **Safe by default.** Data files open read-only, and the SQL console accepts only
  `SELECT` and cannot read files outside the workspace.

## Run it locally

You need Python 3 (`python3 --version`). There is no build step and no `npm install` needed
just to view the site.

1. Open a terminal in this folder.
2. Start the server:

   ```sh
   npm run serve
   ```

   Without npm, run the same command directly: `python3 -m http.server 5190 --bind 127.0.0.1`.
3. Open http://127.0.0.1:5190 in your browser.
4. Edit `index.html`, `styles.css` or `main.js` and refresh the page to see changes.
5. Press `Ctrl+C` in the terminal to stop the server.

If port 5190 is busy, pick another one, for example `python3 -m http.server 8080 --bind 127.0.0.1`.
Keep `--bind 127.0.0.1` so the server is only reachable from your own machine, not from
other devices on your network. Opening `index.html` straight from disk also works, but
`captions.json` is then blocked by some browsers and the built-in demo list is used.

## Test

```sh
npm ci
npx playwright install chromium   # only if you do not have Brave or Chrome
npm test
```

Locally the tests use Brave when it is installed (or `PW_BROWSER_PATH` to any Chromium browser).
They start their own server on port 5191, so `npm run serve` can keep running on 5190.
The suite covers load and console errors, asset URLs, horizontal scroll, text size,
touch targets, the mobile menu, the GitHub link and reduced motion.

## Security

The site is static: no backend, no accounts, no forms, no cookies and no tracking.
Keep it that way.

- **Never commit secrets.** No tokens, keys, passwords or `.env` files. `.gitignore`
  already excludes `node_modules`, test output and local host config. If a secret is ever
  pushed, revoke it first, then remove it from the history.
- **Content-Security-Policy and headers.** `vercel.json` sets `nosniff`,
  `X-Frame-Options: DENY`, a strict referrer policy and a CSP that allows only this site
  and Google Fonts. The local Python server does not send these headers, so test CSP
  changes on a preview of the hosted site.
- **Inline script hash.** The one inline `<script>` in `index.html` is allowed by its
  SHA-256 hash in the CSP. If you change that script, update the hash.
- **New external origins** (scripts, styles, fonts, images) need a CSP change and a reason
  in the pull request. Do not add third-party analytics or trackers.
- **Dependencies.** Playwright is the only dependency, and it is dev-only. Its version is
  pinned and `package-lock.json` is committed; install with `npm ci`.
- **Demo recordings.** No local paths, usernames or real data may be visible. Check the
  videos and posters in `assets/videos/` before you commit.
- **Reporting a vulnerability.** Do not open a public issue. Use GitHub's private
  vulnerability reporting (the repo's **Security** tab, then **Report a vulnerability**).

## Project structure

```
index.html            all sections and content
styles.css            design tokens (light theme only), layout, motion
main.js               mobile menu, scroll reveal, demo videos, hero terminal
favicon.svg           square glyph in the brand colours
assets/videos/        demo recordings (.webm), posters (.png) and captions.json
tools/record-demos.mjs  re-records the demo videos from the Oxi app
tests/site.spec.ts    Playwright checks
vercel.json           security headers, CSP and cache rules
.github/workflows/    CI workflows
AGENTS.md             rules for coding agents (read first)
```

## Re-record the demos

`tools/record-demos.mjs` drives the Oxi desktop app's dev server and writes the videos and
`captions.json` into `assets/videos/`. Point it at the app repo:

```sh
OXICORE_REPO=/path/to/oxicore node tools/record-demos.mjs            # all demos
OXICORE_REPO=/path/to/oxicore node tools/record-demos.mjs catalog    # one demo
```

The app repo needs its `dist/` built (`npm run build`) and `target/debug/oxicore-devserver`
built. `OXICORE_REPO` is the app's own folder name, so it still says `oxicore`.

## Where to set the GitHub link

The header and mobile menu link is a placeholder: `data-github-link`, `aria-disabled="true"`,
`href="#"`. When the repo is public, set the `href` to the repo URL, remove `aria-disabled`,
change the `title` to `GitHub`, and delete the `TODO` comment above the link in `index.html`.
The same link is in the mobile menu.
