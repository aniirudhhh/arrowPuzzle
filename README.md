# ARROW//OUT

A responsive arrow escape puzzle game built with Next.js, React, and Hugeicons.

## Run locally

- `npm install`
- `npm run dev` — http://127.0.0.1:5173
- `npm run build` then `npm start` — production preview
- `npm test` — generation, solvability, and collision tests
- `npm run format:check` — formatting verification

## Modes

Campaign levels continue indefinitely with deterministic seeds and bounded board sizes. Daily puzzles use a separate date seed and track streaks. Timed Challenges have independent difficulty profiles and time budgets based on path count and dependency depth.

Each round has three hearts. Wrong taps animate a collision and consume a heart. Successful moves slide along their path. Results use animated SVG graffiti; sounds are synthesized with Web Audio and respect Settings. Hints highlight a legal move. Progress is stored locally in your browser.

## Source

- `app/page.js`: screens, puzzle rendering, interactions, and audio.
- `app/components/Icon.js`: shared Hugeicons adapter.
- `app/globals.css`: design system and responsive styles.
- `paths.js`: deterministic puzzle generation and collision rules.
- `paths.test.js`: regression and solvability tests.

Fonts use Google Fonts with local fallbacks. Icons use the public Hugeicons pack; the Pro package was unavailable with the current registry configuration.

## Verification limits

Production builds and automated puzzle checks are available. Browser automation cannot access this local preview under its URL policy; mobile layouts, animation, and audio need manual review.
