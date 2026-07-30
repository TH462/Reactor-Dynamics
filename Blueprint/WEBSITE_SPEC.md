# Reactor Dynamics — Website Spec

Status: DRAFT (2026-07-19) · Owner: Tim
Decisions locked with owner: **Vercel + Supabase** hosting, **anonymous-first** identity
(no accounts), and "stats" means **owner-facing analytics** — usage volume, geography,
and campaign-health data for deciding what needs work — not a public player-stats page.

---

## 1. Goals

- Give the simulator a public home: landing page, about page, plant picker.
- PWR is playable now; BWR and RBMK show **Coming soon** (they exist in the repo but
  aren't ship-ready).
- Collect anonymous usage telemetry so the owner can answer:
  - How many people use it, over time, and from where (coarse country only)?
  - Which plants/modes/scenarios get played? How long are sessions?
  - Campaign funnel: which beats do players fail or abandon repeatedly? → "this
    beat/manual section needs work" signal.
- Let users submit feedback and bug reports **with game telemetry attached** — the
  existing `exportDiag()` payload (`ui/app.js:1653`, `rd_diag_*.json` schema 1.0 with
  command history + full `saveState()`) becomes the attachment instead of a download.

### Non-goals (v1)

- No user accounts, no login, no cross-device sync.
- No public leaderboards/achievements/community stats.
- No framework/build step for the site itself — plain HTML/CSS/JS, matching the
  project's "no build step" philosophy. Vercel serves static files + `/api` functions.

---

## 2. Site map

| Route | Purpose |
|---|---|
| `/` | Landing: hero, plant picker (PWR live, BWR/RBMK coming soon), feature strip |
| `/sim` → `ui/shell.html` | The simulator, unchanged. Plant cards deep-link via existing `?engine=` param (`ui/app.js:2848`) |
| `/about.html` | What it is, fidelity/education disclaimer, how it's built, credits |
| `/feedback.html` | Feedback + bug report form (also reachable from inside the sim) |
| `/privacy.html` | Short notice: anonymous ID, coarse country, no PII unless email volunteered |
| *(no public stats page)* | Owner analytics via Supabase dashboard/SQL views; optional protected `/admin` in Phase W3 |

## 3. Landing page layout

```
┌──────────────────────────────────────────────────────────────┐
│  ⚛ Reactor Dynamics          Simulator · About · Feedback    │  header (sticky)
├──────────────────────────────────────────────────────────────┤
│   Run a nuclear power plant from your browser.               │
│   Real reactor physics · guided training campaigns ·         │  hero: tagline,
│   nothing to install.                                        │  screenshot of the
│                [ ▶ Enter the Control Room ]                  │  PWR board behind/
│                                                              │  beside the CTA
├──────────────────────────────────────────────────────────────┤
│  CHOOSE YOUR PLANT                                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │
│  │ PWR          │  │ BWR          │  │ RBMK         │        │  3 cards; PWR is
│  │ Westinghouse │  │ GE-style     │  │ Chernobyl-   │        │  clickable →
│  │ 4-loop       │  │ direct cycle │  │ era design   │        │  /ui/shell.html
│  │              │  │              │  │              │        │  ?engine=pwr;
│  │ [ Operate ]  │  │ COMING SOON  │  │ COMING SOON  │        │  others dimmed,
│  └──────────────┘  └──────────────┘  └──────────────┘        │  badge, no link
├──────────────────────────────────────────────────────────────┤
│  · Physics engine — point kinetics, xenon, two-phase…        │  feature strip
│  · Training campaigns — startup to TMI-2, instructor-gated   │  (3-4 short blurbs)
│  · Fail things on purpose — fault injection, diagnostics     │
├──────────────────────────────────────────────────────────────┤
│  About teaser (2 sentences) → /about.html                    │
│  footer: educational disclaimer · privacy · version          │
└──────────────────────────────────────────────────────────────┘
```

Design language: dark control-room aesthetic consistent with the sim UI so entering
the shell doesn't feel like a site change. Coming-soon cards are rendered at ~50%
opacity with an amber `COMING SOON` badge; clicking shows nothing (not a dead link).

## 4. About page

- What it is: educational, browser-only nuclear plant simulator; three reactor types.
- Fidelity statement: real physics models (point kinetics, decay heat, xenon, SG
  two-phase, etc.) but **a game/trainer, not engineering software** — the standing
  disclaimer used in the manuals.
- The training campaign concept + TMI-2 story module (spoiler-light).
- Tech: vanilla JS, no server for the sim itself, open questions/credits.
- Link to the in-sim manuals as documentation.

---

## 5. Telemetry (owner analytics)

### Identity & privacy

- Anonymous UUID generated once, stored in `localStorage` (`rd_anon_id`). No cookies,
  no fingerprinting, no IP stored.
- Country resolved **server-side** from Vercel's `x-vercel-ip-country` request header;
  only the 2-letter code is stored. IP never written to the DB.
- Feedback email field is optional and the only possible PII.

### Client (small module, `ui/telemetry.js`)

- Loaded by `shell.html`; buffers events, flushes via `fetch` every ~60 s and
  `navigator.sendBeacon` on `pagehide`/`visibilitychange:hidden`.
- Fails silent (offline / adblock / file:// dev use = no-op). A `?tm=0` param and a
  settings-tab toggle disable it entirely.
- Every event carries: `anon_id`, `session_id` (per-tab UUID), `sim_version` (git sha
  or CHANGELOG version, stamped at deploy), `ts`.

### Event vocabulary (v1 — keep it small)

| event | payload | answers |
|---|---|---|
| `session_start` | engine, mode, referrer path | traffic volume, plant popularity |
| `heartbeat` (5 min) | sim_time, engine | session-length distribution without relying on unload |
| `mode_select` | free/campaign/scenarios/walkthroughs | which modes people actually use |
| `campaign_beat` | campaign, phase, beat_id, result (pass/fail/abandon), retries, sim_time | **the funnel** — where players die/quit → what needs rework |
| `scenario_start` | scenario_id, engine | scenario popularity |
| `scram` | manual/auto, first_cause | difficulty signal per plant |
| `feedback_submitted` | category, has_diag | closes the loop |

Rule: payloads are context, not content — no free text in telemetry events.

### Answering the owner's questions (SQL views, no dashboard needed for v1)

- `v_daily_users` — count distinct anon_id per day/week, split by country.
- `v_engine_share` — session_start counts per engine/mode.
- `v_campaign_funnel` — per beat_id: attempts, pass rate, median retries, abandon
  rate. Sorted by abandon rate = the "needs attention" worklist.
- `v_session_length` — heartbeat-derived duration histogram.

---

## 6. Feedback & bug reports

**OWNER RULING (2026-07-19) — verbatim not recorded, so advisory under HR11: players can never upload their own files.** Telemetry
attaches ONLY from the live session, via the in-sim flow below. The site form is
text-only (`diag: null` always); `/api/feedback` rejects any `diag` payload whose
request doesn't originate from the in-sim path shape.

### In-sim (primary path) — BUILT (W1 form of it)

The 💬 button in the sim-controls row opens a feedback overlay (category / free-text /
optional email / pre-checked **"Attach this session's telemetry"**). Attachment is the
live recorder's `buildDiagBundle()` (the same payload as the Dev-tab **Diagnosis
JSON** export — split out of `exportDiag()` in `ui/app.js`). W1 packages the report as
a `rd_feedback_<category>_<plant>.json` download; W2 swaps the tail of
`sendFeedback()` for the POST. The Dev-tab export download remains for AI/debug use.

### Site form (`/feedback.html`)

Category / text / optional email only. No file input. Points users at the in-sim 💬
button for anything that needs telemetry.

### Anti-spam

Honeypot field + per-anon-id rate limit (e.g. 5/hour) enforced in the API function.
Cloudflare Turnstile only if spam actually appears.

---

## 7. Backend

### Supabase schema

```sql
events   (id bigint pk, ts timestamptz, anon_id uuid, session_id uuid,
          event text, engine text, country char(2), sim_version text,
          payload jsonb)
feedback (id bigint pk, ts timestamptz, anon_id uuid, category text,
          body text, email text null, country char(2), sim_version text,
          diag_path text null,          -- Storage path of attached diag JSON
          status text default 'new')    -- new / seen / fixed / wontfix
-- Storage bucket: diag-reports (private), max ~2 MB per object
```

RLS: no anon access at all — **all writes go through Vercel API functions using the
service-role key** (server-side only). The browser never talks to Supabase directly;
this is what lets us stamp country server-side and enforce rate limits.

### API (Vercel serverless functions, `/api`)

| endpoint | behavior |
|---|---|
| `POST /api/events` | accepts a batch (≤50 events), validates event names against the vocabulary, stamps country, inserts. Returns 204 always (fire-and-forget). |
| `POST /api/feedback` | JSON; validates (`diag`, when present, must be a well-formed `reactor_dynamics_diagnosis` ≤ 2 MB — size/shape checks server-side since the client can't be trusted), uploads diag to Storage, inserts row, rate-limits. |

No read APIs in v1 — the owner reads via the Supabase dashboard/SQL editor.

---

## 8. Repo & deployment

- Site lives **in this repo** so sim and site version together:
  - `/index.html` — replace the current meta-refresh redirect with the landing page
    (it's already the natural entry point).
  - `/about.html`, `/feedback.html`, `/privacy.html`, `/site/` for shared css/js.
  - `/api/` — Vercel functions (this introduces the repo's first server-side code;
    keep it to the two endpoints).
- `.vercelignore`: `node_modules`, `test`, `Diagnostic`, `inbox`, `mcps`, `tools`,
  `Blueprint`, `terminals`, dev harness pages (`test_*.html`, `*_diagram_v2.html`).
  `Manuals/` need not ship (`ui/manual_data.js` embeds the content) but is harmless.
- Env vars (Vercel): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- Domain: **ReactorDynamics.com** (owner registers; point DNS at Vercel, apex +
  `www` redirect).
- Deploy: Vercel Git integration, production = `main`, previews = `develop` pushes —
  matches the existing branch discipline (work on `develop`, promote to `main`).
- `sim_version`: inject at deploy (Vercel build step writes `site/version.js` from
  `VERCEL_GIT_COMMIT_SHA`) — the only "build" the project gains, and it's optional.

---

## 9. Build phases

| phase | scope | ships when |
|---|---|---|
| **W1 — static shell** ✅ 2026-07-19 | Landing (plant cards + coming-soon), about, privacy, feedback page UI (packages a downloadable `rd_feedback_*.json` bundle until W2), root `index.html` swap, `.vercelignore`. Remaining W1 step: create the Vercel project + connect the repo (owner). Hero slot awaits owner's `site/hero.png` (frame auto-collapses until then). | site is live, sim playable via it |
| **W2 — backend** | Supabase project + schema, `/api/events` + `/api/feedback`, `ui/telemetry.js`, in-sim Report-a-bug overlay, SQL views | telemetry + feedback flowing |
| **W3 — nice-to-have** | Protected `/admin` funnel dashboard, feedback status workflow UI, Turnstile if needed, BWR/RBMK card flip-on when ready | as needed |

## 10. Resolved decisions (2026-07-19)

1. Domain: **ReactorDynamics.com**.
2. Hero screenshot: **owner provides** the asset (no headless capture needed).
3. **No GitHub link** — repo is private for now; revisit if it goes public. Keep all
   site copy free of repo URLs.

## 11. Event retention

**Policy: keep raw events indefinitely**, with a tripwire instead of a schedule:
when the `events` table exceeds ~100 MB or the funnel views get slow, move to
roll-up-then-archive — `pg_cron` job aggregates rows older than ~90 days into
daily-summary tables (users/day/country, beat pass-fail counts, session-length
buckets), exports the raw rows to a Storage bucket, then prunes them.

Rationale: at launch scale (~300–500 bytes/event, ~20–40 events/session) even
1,000 sessions/month is ~15 MB/year against Supabase's 500 MB free tier, and raw
retention preserves the ability to ask new diagnostic questions of old data.
Migration later is cheap because owner queries live in SQL views — storage can
change underneath them without touching anything else.
