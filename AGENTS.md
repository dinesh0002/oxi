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
styles.css            tokens on :root, layout, motion, responsive rules
main.js               mobile menu, scroll reveal, demo videos, hero terminal
favicon.svg
assets/videos/        .webm demos, .png posters, captions.json (drives "How it works")
tools/record-demos.mjs  re-records the demos from the app repo (env OXICORE_REPO)
tests/site.spec.ts    Playwright checks (desktop and mobile projects)
vercel.json           headers, cache rules, CSP, static output
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
