# Wordmates

A complete Wordle-style game with persistent daily puzzles, private multiplayer rooms for 2–8 players, friend requests, live progress, rankings, rematches, and shareable spoiler-free results.

## Play

Open the app and play immediately—no sign-in or account required. Choose a display name from your profile. Create a room and share its invite link or 10-character code. Friends join while the lobby is open; the host starts when everyone is ready. Everyone receives the same word and has six guesses. Fewest guesses wins, with elapsed time breaking ties. The host can open the lobby again after everyone finishes.

Use **Your circle → Add friends** to exchange friend codes. A request must be accepted before two players appear in each other's circles. Friend codes and room codes are different.

The daily puzzle resets at midnight UTC. The keyboard works on touch devices and physical keyboards. Blue means correct position, amber means elsewhere, grey means absent (or already used copies of that letter).

## Stack

- React 19, TypeScript, Vinext, Vite, and Tailwind CSS
- Radix-backed Shadcn dialogs and tabs; Sonner notifications
- Cloudflare Workers HTTP API and D1/SQLite, with Drizzle migrations
- Anonymous guest sessions in secure HttpOnly cookies; token hashes stored in D1; authorization checked on the server
- Room progress refreshes every 3 seconds; daily/circle data refreshes every 15 seconds while the tab is visible

## Development

Requires Node 22.13 or newer and the pnpm version declared in `package.json`. Run `pnpm install --frozen-lockfile`, then `pnpm dev`. Guest play uses a Secure cookie and therefore requires HTTPS (or a browser-trusted localhost development origin). Existing signed-in visitors can retain their old player record when a guest session is first created. No sign-in is initiated.

The D1 binding is declared as `DB` in `.openai/hosting.json`. Generate migrations with `pnpm db:generate`. Build with `pnpm build` and apply pending migrations to the local database with:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_moaning_gunslinger.sql
```

Migrations apply automatically on Sites publication. Keep applied migration files immutable. Do not commit local `.env` files or credentials.

## Verification

```sh
node tests/game.integration.mjs
pnpm exec tsc --noEmit
pnpm build
```

The integration test runs the real route and word-engine code against a disposable in-memory SQLite database with isolated synthetic identities. It covers duplicate-letter scoring, authentication, cross-origin rejection, friend request acceptance, room membership and host authorization, hidden answers, private guesses, stale-write rejection, the six-attempt limit, score persistence, rankings, and rematches. It also checks anonymous session creation, cookie attributes, persistence, and forged/expired session rejection.

## Deployment and access

This project is configured for Sites hosting. The deployment builds a Worker and binds its D1 database; it is not a static GitHub Pages app. The hosting access policy is separate from room membership. A new Sites deployment starts owner-private. To play with external friends, the owner must enable link access or explicitly grant site access to those friends. The live site is public. Players receive a guest session automatically; room codes control individual game membership. Guest progress stays in the database but is accessible through that browser’s cookie: clearing cookies or using a new browser starts a new player.

GitHub stores the source. Commits pushed to GitHub do not automatically redeploy the Sites instance; publish a new Sites version after changes.

## Word list and privacy

14,855 allowed guesses from [tabatkins/wordle-list](https://github.com/tabatkins/wordle-list), under MIT (see `lib/dictionary.LICENSE`). Answers use a curated common-word subset selected on the server. Answers never appear in the frontend bundle or a response until the requesting player finishes. Opponents see guess counts and completion times, never your words.

Stored data: random guest user ID (or an existing player ID retained during migration), display name, friend code and relationships, room membership, guesses, and completion timestamps. Guest session token hashes and expiry timestamps are also stored. Account emails are not stored or returned by the game API. No analytics or advertising scripts are included.

Independent word game; not affiliated with The New York Times or Wordle.
