# FORGE 728 — DESIGN

**Concept.** Seven hundred and twenty-seven pixel weapons are not a catalogue, they are ammunition. You are in a dark forge yard with a rack of every weapon in the pack; a creature steps out of the smoke; you have three swings. Pick the right blade from the rack, hit the thing, keep the streak alive.

**Why this shape.** The asset pack (PixelSRPG-Forge, 727 weapon icons + 18 animated monsters) contains equipment and enemies and nothing else — no heroes, no terrain, no UI. So the game is built from exactly what exists: the rack is the inventory, the monsters are the opponents, and the *only* thing that separates one weapon from another is what can be measured in its pixels. Nothing on screen is invented.

**Palette**
| role | hex | use |
|---|---|---|
| ground | `#0a0908` | page, deep forge dark |
| iron | `#15130f` | panels, rack bed |
| iron-2 | `#221d16` | rules, tile frames |
| ink | `#f2ead9` | primary text, weapon labels |
| muted | `#8b8071` | secondary text, units |
| ember | `#ff5c1a` | single accent: action, HP damage, focus |
| bone | `#cfc6b4` | numbers on dark |

Every impact inherits the **measured dominant colour of the weapon that caused it** — a violet staff throws violet sparks, a gold axe throws gold ones. The UI accent stays ember.

**Type.** Silkscreen (OFL, pixel display) for the mark, damage numbers and monster names; IBM Plex Mono for the ledger, filter labels and units. Two families, hard split: pixel type never sets a paragraph, mono never sets a headline.

**Layout.** Two zones, no page-level scroll on desktop: the arena (left, 60%) holds the fight; the rack (right, 40%) is a scrollable 1:1 inventory wall of all 727 icons at native pixel size. Phone: arena pinned on top at 52vh, rack scrolls beneath, strike bar fixed to the bottom thumb zone.

**Motion character.** Weighty and mechanical: fast attack (90 ms), a 70 ms hit-stop, then slow settles. Screen shake scales with measured mass. Nothing bounces except damage numbers, which overshoot once. Embers drift constantly but never distract. Full motion always — no reduced-motion branch.

**Signature moment.** The strike. The chosen weapon lifts off the pedestal, rotates back, and comes down across the creature in one arc; impact freezes the frame, throws a spark burst in the weapon's own colour, shakes the yard by an amount derived from the weapon's weight, and punches a damage number out above the monster while the HP bar drains with a lagging second bar behind it.

**Game rule (measured, not invented).**
`DMG = round(60 × len / 70.58 + 60 × mass / 2182)` where `len` = max Feret diameter of the sprite silhouette in px and `mass` = opaque pixel count. Both are computed from the PNG at build time and printed in the ledger. A monster dies inside three swings only if the maths says it can — so the rack becomes a real decision.

**Avoid.**
1. Purple-gradient SaaS panels and glassmorphism.
2. Rarity badges, loot beams and "legendary" labelling the pack never provided.
3. Inventing weapon names or stats that are not in the pixels.
4. Generic card-grid hover-lift on the rack; it is inventory, not a pricing page.
