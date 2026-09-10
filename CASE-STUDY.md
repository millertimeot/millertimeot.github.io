# Case study: an AI-operated fantasy league platform

Live site: https://millertimeot.github.io/
Site source: https://github.com/millertimeot/millertimeot.github.io (one file, `index.html`)
Built and launched: September 8 to 10, 2026. Owner and product lead: Tom O'Sullivan.

This document describes the system in enough detail for a resume or portfolio writer to work from. It leaves out the league's inside jokes on purpose. The site itself has a strong comedic editorial voice; the engineering underneath it is the subject here.

## 1. What it is

A public web platform for an eight person fantasy football league, plus an autonomous AI operator that keeps it current. It has three layers:

1. **Public editorial site.** Standings, season projections, trade grades, a weekly recap, a "tonight's games" section with pregame and postgame writeups for every matchup, per team roster pages with points and projections, awards, a record book, and a projection history chart.
2. **Members layer.** Passcode based identity (no accounts, no email), a message wall with threaded replies, peer to peer side bets with accept, settle and void flows, a weekly poll, a punishment vote for last place, a talk leaderboard, admin moderation, and opt in push notifications to phones.
3. **AI operator.** A persistently running Claude Code agent on a home PC that reads the league's ESPN data hourly, grades every roster move, writes the editorial, settles wagers from final box scores, manages the owner's own team under explicit authorization rules, and ships site updates through git.

The owner set product direction, editorial rules, and authorization boundaries in plain language; the agent implemented, verified on the live page, and maintained a rule file for every standing instruction so that any other session could act with the same fidelity.

## 2. Architecture

```
ESPN Fantasy API  ──(hourly reads, credentialed)──►  Claude Code operator (Windows PC, always on)
                                                        │  diffs rosters / settings / injuries
                                                        │  grades moves, writes copy, verifies numbers
                                                        ▼
                                          git push ──► GitHub Pages (static site, one HTML file, PWA)
                                                        ▲            │
                                                        │            │ REST (anon key, RLS)
                                          members' phones ◄──────────┤
                                                        │            ▼
                                                        │   Supabase Postgres
                                                        │     tables: notes, replies, bets, members, polls,
                                                        │             poll_votes, sacko_options, sacko_votes,
                                                        │             push_subs, push_queue, settings
                                                        │     writes only via SECURITY DEFINER RPCs
                                                        │     triggers enqueue notifications
                                                        │            │ pg_net HTTP (shared secret from Vault)
                                                        │            ▼
                                                        └── Web Push ◄── Supabase Edge Function (Deno)
                                                                          VAPID keys held in Postgres Vault
```

### Front end
- Static HTML, CSS and vanilla ES5 JavaScript in a single file, deliberately framework free. Mobile first; almost all traffic is phones.
- Installable as a Progressive Web App (manifest, icons, Apple meta tags). When installed, the page shows its own refresh bar and self updates by fetching past the HTTP cache on every foreground event and comparing the server's Last-Modified header.
- A service worker exists only for push notifications. It deliberately has no fetch handler so the site can never be served stale.
- Client side sorting of standings, a tappable projection history chart, collapsible long form sections, a slide in navigation sidebar with a floating menu button, and a hidden three tap easter egg that swaps the site's entire voice.
- All interactive features degrade to read only for visitors without a passcode.

### Backend (Supabase)
- Postgres with row level security. Anonymous clients can only `SELECT` rows where `hidden = false`; no direct writes are possible with the public key.
- Every write goes through a `SECURITY DEFINER` RPC that verifies the caller's passcode, derives the member name server side, enforces business rules (only the two parties can accept or settle a bet, one vote per member, coarse rate limits, character limits), and never trusts a client supplied identity.
- Admin role: a single boolean on the members table checked inside the RPCs; the UI shows house controls only after the server confirms the role.
- Moderation by soft delete (`hidden = true`) so nothing is ever lost.
- A `leaderboard` view aggregates activity per member without exposing hidden rows.

### Notifications
- Opt in web push with VAPID. The key pair is generated once by the edge function and stored in Postgres Vault, never in source or environment files.
- Database triggers decide who gets notified (named on a post, replied to, bet against, bet accepted or settled) and insert into a queue table. A trigger on the queue calls the edge function through `pg_net` with a shared secret header, also from Vault. The function claims unsent rows, sends to every device the member registered, and deletes dead subscriptions on 404 or 410.
- The client never decides who gets pinged; it can only register or remove its own device.
- A house broadcast function can notify every member when the weekly awards are posted.

### AI operator
- Runs as a long lived Claude Code session with a browser pane logged into ESPN. Reads the league API with credentials, never scrapes.
- Hourly job: snapshot rosters, free agents, injury statuses, waiver order and league settings; diff against the last snapshot with a small Node script; on any change, grade the move (fit plus value against ESPN projections), re rank all eight teams by optimal lineup projection, assess the effect on the owner's team, log it to a private repo, and report.
- Pregame and postgame jobs on every game day write matchup cards from the official box score. Every number in a joke is checked against the source before it ships; a wrong joke is treated as a bug.
- Tuesday job: settle measurable side bets as the house from final scores, verify any player or lineup condition a bet named against the actual box score lineup, void expired bets with a note, refresh rosters and points, post awards and records, open the next poll, and push the site.
- Model tiering to control cost: the larger model does analysis, grading, decisions and all comedic copy; a smaller model does layout, placement and mechanical edits.
- Authorization boundaries are written down: lineup changes are pre authorized, adds and drops need a yes or a stated deadline, trades are never sent by the system.
- Every standing instruction from the owner is stored as a rule file with a "why" and a "how to apply" section, mirrored into the private repo so other sessions or machines can take over.

## 3. Notable engineering decisions

- **One HTML file.** Removes a build step and a deploy pipeline entirely; GitHub Pages serves it with a 10 minute cache. The tradeoff (cache staleness for installed apps) was solved in the client with a Last-Modified comparison instead of adding infrastructure.
- **No accounts.** Eight people, one passcode each, case insensitive, remembered per device. Identity is derived server side from the passcode on every write, which made impersonation impossible after an early shared passcode was abused within hours of launch.
- **Writes through RPCs, not tables.** Business rules live in SQL next to the data, so a hostile client with the public key can only read public rows and call the same functions the UI calls.
- **Server decides notifications.** Mention detection, aliases (a nickname maps to a member), and recipient rules are trigger logic, so they apply identically to every write path and cannot be spammed from a client.
- **Secrets in Vault, generated in place.** The push secret was generated by Postgres itself and the VAPID key pair by the edge function's first call, so no secret ever passed through a chat, a terminal, or a file.
- **Cost aware agent design.** Polling cadence, model choice per task, and "only recompute rankings when a roster changed" were explicit decisions, made after measuring where the tokens went.
- **Verification on the live page.** Every site change was checked by loading the deployed page in a browser and asserting on the DOM (sections present, data loaded, controls appearing only for the right role) before reporting done.

## 4. Metrics

- First 24 hours after one share: about 215 page views from roughly 27 device and network combinations, from an 8 person league.
- Typical change to ship: under two minutes from instruction to live, including verification.
- Backend cost: free tier. Site hosting: free. Notification delivery: free.
- Eleven feature releases on launch day, all verified live, zero rollbacks.

## 5. Skills demonstrated

Product ownership and scoping under constraints; directing an autonomous AI agent with explicit authorization boundaries and written rules; static site and PWA engineering; Postgres row level security and security definer patterns; Supabase edge functions, `pg_net`, and Vault; Web Push with VAPID; database driven notification design; cost controlled LLM operations with model tiering; editorial systems driven by structured data; live verification of deployed changes.

## 6. What comes next

Weekly awards computed from box scores (bench points wasted, worst start, luckiest win), a record book fed automatically, a season long projection history per team, and a sanitized public case study page with screenshots.
