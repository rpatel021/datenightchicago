# Night Out Chicago

Live: **https://nightoutchicago.com**

Also: datenightchicago.app redirects here.

**Snap lanes:** three full-viewport cards — **What to eat**, **What to do**, **Backup** — with CSS `scroll-snap-type: y mandatory`. Swipe up/down between lanes; swipe left/right inside a lane to cycle options from the filtered catalogs. Sticky vibe / with / night filters stay put and rebuild each lane’s pool (horizontal index resets when the current option drops out). Warm Chicago-host copy; vibe pills wrap.

## Data files
- `neighborhoods.json` — vibe categories + neighborhood imagery fallbacks
- `plans.json` — night corridors (Then / Backup soft fills)
- `restaurants.json` — Eat catalog
- `events.json` — things to do

## Palette
Cream `#FDFCF4` · Ink `#0A0A0A` · Sun `#FFCC33` · Mint `#E8F5E9` · Flame `#FF5A36`

## Venue pages
- `/v/<slug>` → `venue.html` (Vercel rewrite). `venue.js` renders from `venues.json` (stable slug index + approved
  `details`), `restaurants.json`, and `events.json` (upcoming events matched on venue name/aliases).
- `/v/<slug>/edit?k=<token>` → same page in private editor mode (noindex, no-referrer). Tokens are permanent per venue;
  only sha256 hashes live server-side (Supabase `venue_edit_tokens`). Plain links are kept privately outside the repo.
- `api/venue-token.js` checks a token; `api/submit.js` validates and stores a **pending** submission in Supabase
  (`venue_submissions`). Nothing auto-publishes. Env: `NIGHTOUT_SUPABASE_URL`, `NIGHTOUT_SUPABASE_KEY`, `NIGHTOUT_IP_SALT`.
- After any data refresh: `python3 /workspace/datenight-scout/build_venues.py --tokens` (keeps slugs stable, mints links
  for new venues). Review: `python3 /workspace/datenight-scout/review_submissions.py`.
