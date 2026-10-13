# ARROW//OUT

A responsive arrow escape puzzle game built with Next.js, React, and Hugeicons.

## Run locally

- `npm install`
- `npm run dev` - http://127.0.0.1:5173
- `npm run build` then `npm start` - production preview
- `npm test` - generation, solvability, collision and multiplayer tests
- `npm run format:check` - formatting verification

## Modes

Campaign levels continue indefinitely with deterministic seeds and bounded board sizes. Daily puzzles use a separate date seed and track streaks. Timed Challenges have independent difficulty profiles and time budgets based on path count and dependency depth.

Each round has three hearts. Wrong taps animate a collision and consume a heart. Successful moves slide along their path. Results use animated SVG graffiti; sounds are synthesized with Web Audio and respect Settings. Hints highlight a legal move. Progress is stored locally in your browser.

## Source

- `app/page.js`: screens, interactions, and audio.
- `app/components/Board.js`: shared puzzle rendering and animations.
- `app/components/Icon.js`: shared Hugeicons adapter.
- `app/components/Multiplayer.js`: room and race interface.
- `app/globals.css`: design system and responsive styles.
- `paths.js`: deterministic puzzle generation and collision rules.
- `lib/race.js`: server-side room rules and move validation.
- `lib/race-store.js`: transactional shared PostgreSQL storage.
- `lib/local-race.js`: local development persistence.

Fonts use Google Fonts with local fallbacks. Icons use the public Hugeicons pack; the Pro package was unavailable with the current registry configuration.

## Two-player races

Open **Friends**, enter a nickname, and create a room. A second player joins with its six-character code. The host selects difficulty; the guest presses Ready, and the host starts the same puzzle after a three-second countdown. Changing difficulty resets readiness. The server validates moves, tracks three hearts per player, declares the first finisher, and supports request/accept/decline rematches. Clients poll every 600 milliseconds.

Local rooms persist in `.data/rooms.json`, which contains private room credentials and is excluded from Git. Rooms expire after one hour without requests. With `DATABASE_URL`, rooms use shared PostgreSQL storage instead. Each action locks its room inside a transaction, preventing simultaneous actions on multiple server instances from overwriting each other. Local rooms are not migrated into the database.

## Deploy on Netlify with Supabase

1. Create a Supabase project. In its SQL Editor, run `supabase/schema.sql` once. This creates the private room table; browser roles cannot read room tokens.
2. In Supabase, choose **Connect > Transaction pooler** and copy the PostgreSQL URI (port `6543`). Replace the password placeholder with your database password, URL-encoding special characters. Use SSL (`sslmode=require`, or the verified SSL mode recommended for your database).
3. Import this repository into Netlify. `netlify.toml` sets `npm run build` and `.next`; Netlify's Next.js adapter supplies the API functions.
4. Add the URI as **DATABASE_URL** in Netlify's environment variables for the Functions runtime. Keep it secret; never use a `NEXT_PUBLIC_` prefix or commit it. Use a separate database/project for deploy previews, or disable multiplayer there to avoid mixing preview and production rooms.
5. Deploy, then open the public URL in two separate browser profiles. Create/join a room, select difficulty, ready/start, finish, and request/accept a rematch.

No Supabase anon key or browser database client is needed. Solo progress remains in browser storage. Without `DATABASE_URL`, local development uses the local file; a Netlify function reports multiplayer setup is incomplete instead of attempting filesystem writes.

For database integration checks, set `ARROW_TEST_DATABASE_URL` to a dedicated test database with the schema applied and run `node --test lib/race-store.test.js`. The live test creates its own rooms and removes them afterward. Without it, live database tests are skipped; a local build does not verify the deployed Supabase connection.

Expired rooms cannot be accessed. Schedule `DELETE FROM public.arrow_rooms WHERE expires_at < now();` in Supabase to remove expired records regularly. Polling generates frequent database requests; review usage before a large public launch.

## Verification limits

Production builds and automated puzzle checks are available. Browser automation cannot access this local preview under its URL policy; mobile layouts, animation, and audio need manual review. Shared database integration requires a configured test database.
