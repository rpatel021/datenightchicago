# Night Out Chicago

Live: **https://nightoutchicago.com**

Also: datenightchicago.app redirects here.

Pick a night, then who you’re with (Couple / Family / Friends). One corridor plan: Eat → Then → Backup → Transit → Don’t.

## Update content
Edit `plans.json` on `main`. Each night has `parties.couple` / `parties.family` / `parties.friends`.

## Palette
Cream `#FDFCF4` · Ink `#0A0A0A` · Sun `#FFCC33` · Mint `#E8F5E9` · Blush `#FFE5E5` · Paper `#FFFFFF`

## Restaurant catalog
`restaurants.json` is the Eat catalog foundation (peer to the events warehouse). The live matcher loads it with neighborhoods + plans: Eat is enriched or swapped from the catalog by party, vibe, and corridor neighborhood; Then/Backup stay in `plans.json`.
