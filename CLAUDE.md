Read AGENTS.md first. It has the full rules.

The five hardest rules:

1. Plain HTML, CSS and vanilla JS only. No framework, bundler, build step or CSS library.
2. Light theme only. Yellow (#FACC15) is for fills and markers, never text on white.
3. Visible text says "Oxi", never "OxiCore". Mark unbuilt features as "coming". No fake numbers, customers or quotes.
4. Accessibility: 44px touch targets, visible focus, 4.5:1 contrast, and everything still under prefers-reduced-motion.
5. Before finishing: `npx playwright test` must pass. Never commit secrets, and never deploy: deploys are started by hand from the Vercel dashboard.
