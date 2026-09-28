# Card audit (second pass)

Scraping gets a night on the board. This pass decides whether we should show it.

## Rule
Do not publish a guess. Empty is better than wrong. If a listing confirms venue, address, hours, and category, write a patch. If it only *probably* matches, show the line with `likely`. If we cannot stand behind it, leave the field blank and mark the card in the review queue.

Castle was the template: feed said live music / couple / no venue. Choose Chicago said Chicago Children’s Museum, 700 E Grand Ave, Streeterville, 10–5, kids exhibit. Category was wrong even though some fields were filled.

## What gets flagged (not only blanks)
- Missing venue, neighborhood, or photo
- Source already marked `needs_check`
- Family / museum / zoo / exhibit language tagged as live music or comedy
- Couple-only on a kids listing
- Short title with no venue (`Castle`, `Dinos!`, `Happy Hour`)

First run against the live feed: **353 dated rows, 151 titles**. Highest severity right now: Dinos!, Fall Fest at Lincoln Park Zoo, Mini Zoom Room, Haunted History Tours, BOO! at the Zoo.

## Loop
1. `review-queue.json` — titles the rules do not trust
2. Open the official URL
3. If confirmed, add `event-patches.json` (venue, address, hood, hours, category, photo, confidence)
4. Site reads patches at render time so a bad scrape cannot ship the wrong night
5. Re-run the queue after each scout dump — patches stay, new junk gets flagged
