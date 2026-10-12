# TASTE_LOG — the owner's reactions, verbatim

*(OWNER DIRECTIVE, 2026-10-12: "I want you to create a taste log. Every time I react to something
you should log it. Create a list of obvious AI built website tells and check your design against
it.")*

**What goes here:** every reaction the owner gives to something an agent showed or built —
approval, rejection, irritation, a "yes, that" — with the date, his exact words, what he was
reacting to, and the taste it implies. **Log it in the same turn as the reaction.** Neutral
instructions are not reactions; a reaction says something about what he *likes*.

**How to use it:** before you design, write copy, or style anything he will see, read the log and
§2. A pattern that shows up twice is a standing preference — act on it without being told. The
"Taste" column is an agent's reading of his words, not a ruling (see the `ruling-reading` lesson):
when they disagree, his quote wins.

## 1. The log (newest first)

| Date | Reacting to | His words (verbatim) | Taste it implies |
|---|---|---|---|
| 2026-10-12 | Mockup v1 — strip chart | "I also like having the strip chart. The chart should show an interesting plant interaction." | Real plant data is the site's signature; it must show a coupling, not just a trip. |
| 2026-10-12 | Mockup v1 — alarm tiles | "I like the alarm tiles. It brings the control room element into the page." | Borrow real control-room elements into the site; the board is the brand. |
| 2026-10-12 | Request for this log + tells list | "Create a list of obvious AI built website tells and check your design against it." | Looking machine-made is a defect in its own right; wants a checklist, not a vibe. |
| 2026-10-12 | Current landing page (`index.html`) | "Our current landing page looks like it was created by AI with low effort. My goal is to make it look like its own website and not look like it was created by AI." | Identity over polish. The site should look like it belongs to *this* plant. |
| 2026-10-12 | Landing redesign — banned list | "Do not use: Purple to blue gradients, big rounded cards with soft shadows, emoji as icons, and a centered hero with three feature boxes underneath." | Hard bans; see §2 items 1–4. |
| 2026-10-10 | Walkthrough step text | *paraphrase from memory `players-read-only-the-action`, verbatim not recorded:* nobody reads fine text or descriptions | Lead with the action; teach by visible response, not paragraphs. |
| 2026-09-13 | Landing "Who it's for" block (#742) | "Its too wordy and i doubt anyone reads it" | Cut text no one will read. Short beats complete. |
| 2026-08-04 | `changelog.html` | "Just keep to facts in the changelog page. Minimize prose." | Facts, no marketing voice. |
| 2026-07-30 | Agent replies | "Most replies are a bit too long. I need just the facts and important information" | Same taste in chat: brevity, numbers. |

## 2. AI-built website tells

A design passes when it shows **none** of 1–4 (owner bans) and has a stated reason for any other
item it keeps.

| # | Tell | Why it reads as AI |
|---|---|---|
| 1 | **Purple→blue / indigo gradients**, gradient text | Default palette of every generator. *(owner ban)* |
| 2 | **Big rounded cards with soft shadows**, glassmorphism | Template component library look. *(owner ban)* |
| 3 | **Emoji or stock icon-set icons** (Lucide, Heroicons) as feature icons | Decoration standing in for content. *(owner ban)* |
| 4 | **Centered hero → subtitle → button → three feature boxes** | The single most common generated layout. *(owner ban)* |
| 5 | **Eyebrow label + H2 + paragraph** repeated as every section's opener | One section template stamped N times. |
| 6 | **Slogan cadence**: "Fast. Simple. Powerful.", "X, not Y", "X. Reimagined." | LLM copy rhythm; says nothing specific. |
| 7 | Marketing verbs: unlock, empower, supercharge, seamless, elevate | Generic; could describe any product. |
| 8 | **Em dashes everywhere** in copy | The most-noticed LLM writing tic. |
| 9 | Glows, blurred blobs, mesh gradients, grain overlays | Atmosphere with no information in it. |
| 10 | "✨ New" pill badge above the headline | Template announcement slot. |
| 11 | Product screenshot in a fake browser frame, tilted in 3D | Stock SaaS hero. |
| 12 | Fake social proof: logo walls, testimonials, "10k+ users" counters | Unearned claims; this site has none to show. |
| 13 | Closing "Ready to get started?" banner that repeats the hero | Template filler. |
| 14 | Fade-up-on-scroll and hover-lift on every element | Motion with no purpose. |
| 15 | **Uppercase letter-spaced monospace labels everywhere** ("terminal chic") | The 2025–26 "technical" AI look; fine on data, a tell on prose labels. |
| 16 | **"01 / 02 / 03" numbered feature rows** in an accent colour | Newer template move, replaced the icon grid. |
| 17 | Text-left / product-image-right split hero | Second most common generated layout; needs something specific to earn it. |
| 18 | Perfect symmetry, identical blurb lengths, equal spacing everywhere | Nothing was edited by a person with an opinion. |
| 19 | Four-column footer of links for a six-page site | Scaffolding bigger than the site. |
| 20 | Copy that would still be true if you swapped the product name | Not about *this* thing. |

## 3. Checks run

### 2026-10-12 — landing redesign mockup v1 ("plant drawing")

| # | Result | Note |
|---|---|---|
| 1–4 | PASS | No gradients, 2 px corners, no shadows, no emoji, split hero, rows not boxes. |
| 5 | **FAIL** | Eyebrow on every section (spec line, "Recorded, not drawn", "Contents"). |
| 6 | **FAIL** | "Recorded, not drawn" (X, not Y); "One plant. Everything is connected." (slogan cadence). |
| 8 | **PARTIAL** | Dashes in the pressurizer callout and the footer note. "FIG. 1 —" is drawing convention, kept. |
| 15 | **PARTIAL** | Monospace caps on nav, tags, links and footer too, not just data. |
| 16 | **PARTIAL** | Amber 01–04 row numbers. |
| 17 | **PARTIAL** | Split hero, earned by the bleeding board image and its numbered callouts. |
| 20 | **PARTIAL** | "What you can do here" is generic. |
| 9–14, 18, 19 | PASS | No glow, no frame or tilt, no social proof, no closing banner, no motion, one-row footer. |

**Fixes applied in mockup v2:** eyebrows cut to the hero spec line only; slogans rewritten as
plain statements about this plant; monospace kept for data, version, figure caption and title
block only; row numbers dropped; section heading made specific; copy dashes removed.
