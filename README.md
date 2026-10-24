# Oxi site

The marketing site for Oxi, a local-first desktop BI app. Plain HTML, CSS and vanilla JS.
No framework, no bundler, no build step. Fonts come from Google Fonts.

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
Any static server works too (for example `npx serve .`). Opening `index.html` straight from disk also works, but
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

## Deploy

Hosted on Vercel as a static site. `.github/workflows/deploy.yml` runs the tests, then:

- push to `main` deploys to production
- a pull request deploys a preview (not for forks, which have no secrets)

One-time setup:

1. Create the Vercel project: run `npx vercel link` once in this folder, then note the
   `orgId` and `projectId` in `.vercel/project.json`.
2. In GitHub, add these repository secrets:
   - `VERCEL_TOKEN`: a Vercel access token
   - `VERCEL_ORG_ID`: the `orgId` from `.vercel/project.json`
   - `VERCEL_PROJECT_ID`: the `projectId` from `.vercel/project.json`

`vercel.json` sets the security headers and the Content-Security-Policy. If you add an
external script, style or font origin, update the policy there.

## Project structure

```
index.html            all sections and content
styles.css            design tokens (light theme only), layout, motion
main.js               mobile menu, scroll reveal, demo videos, hero terminal
favicon.svg           square glyph in the brand colours
assets/videos/        demo recordings (.webm), posters (.png) and captions.json
tools/record-demos.mjs  re-records the demo videos from the Oxi app
tests/site.spec.ts    Playwright checks
vercel.json           headers, cache rules, static output
.github/workflows/    ci.yml (tests) and deploy.yml (Vercel)
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
