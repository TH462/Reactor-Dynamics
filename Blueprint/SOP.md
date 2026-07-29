# SOP — how to apply the Hard Rules

**Status: ADVISORY, not binding.** The binding rules are the Hard Rules in
`Blueprint/CONTEXT.md` §3 and `CLAUDE.md` — nothing else, including this file. What lives
here is the *how*: the worked cases, the failure modes each rule was written from, and the
procedure that has been found to work. Read it for evidence and technique; do not obey it as
policy, and do not cite it as authority.

It exists because §3 was ~200 lines and most of that was not the rules — it was the
elaboration around them. Rules that long stop being read. *(Owner, 2026-07-29: "I think we
may have too many hard rules. We should keep hard rules concise.")*

---

## 1. Applying HR9 — the plant is the ground truth

### The dangerous case is not the crude one

"Deepen the shrink so the mission's trip stays unavoidable" is an obvious inversion and
nobody has to be warned about it. The hard case is a change that **looks like genuine
plant-correctness *and* happens to rescue the content**. You cannot tell motive from
outcome, so settle it on the physics alone — and say out loud which behaviour you are
treating as ground truth.

### Beware of using level 2 to dismiss level 1 — the P-9 case

This is the worked example, and it is worth reading in full because the wrong answer was
reached first, by an agent applying HR9 correctly-looking but backwards.

**The reasoning that was wrong.** Real Westinghouse PWRs trip the reactor on a turbine trip
above the P-9 power permissive (~50 %). This plant had no such trip. Working #215, the gap
was ruled acceptable on the grounds that behaviour-catalog row `TR-1` pins turbine-trip
**ride-out** as this plant's deliberate character — a level-2 identity claim overriding a
level-1 prototypicality claim.

**Why it was wrong.** An identity deviation is only valid for **what it was actually ruled
on**. In a real plant a **load rejection** is the ride-out case; a **turbine trip** — stop
valves slamming shut — is precisely what P-9 arms the reactor trip *for*. `TR-1` conflated
the two. So the identity claim never covered the case it was being used to excuse: the
catalog row was the defect, and the missing trip was real.

**How it resolved.** The trip was **adopted** — `protection_options.turbine_trip_reactor_trip`
is `true` (#216, commit `2fb0b78`, 2026-07-26). `TR-1` was split: it now drives the ride-out
with a genuine load rejection, and a new `TR-1b` pins the P-9 anticipatory scram. Content
followed the plant, exactly as HR9 says it must.

**The tail, which is the real lesson.** The decision survived; its provenance did not. The
config comment next to the flag still read *"absent here for historical reasons… Default OFF
preserves today's behaviour"* for two days after the value was flipped to `true`, so the
codebase documented the opposite of what it did — and `CONTEXT.md` §3 itself still described
the question as open on 2026-07-29, three days after it closed. Both were found and fixed by
audit, not by anyone noticing.

> **Two rules fall out of this.** An identity deviation must be checked against what it was
> actually ruled on, never stretched onto an adjacent case that happens to need covering.
> And when a ruling lands, the *reason* text next to the value is part of the change — a
> stale rationale is worse than none, because the next reader believes it.

---

## 2. Applying HR10 — tests assert the claim

Three shapes, each found in this repo.

**1. Mechanism fitted to a suite.** #219's steam-dump arm was arrived at by three attempts,
each prompted by a red gate, until everything passed. Three probes accepting a mechanism says
only that those three probes accept it. Measured afterwards, it had a one-megawatt cliff — a
39 MWe rejection lifted the PORV where 41 MWe was caught — and was blind to staircased
rejections entirely. **No probe covered either case, so nothing was red.**

**2. A test driven through the one path the bug does not break.** `TR-11` exercised
`stuck_open_spray` through the only command form the broken override actually intercepted,
with a comment recording that the two forms which *defeated* the failure were deliberately
left unpinned "so the fix does not have to fight a test" (#200). The defect was documented
inside its own regression test and stayed shipped for months.

**3. A test that pins an incidental value instead of its claim.** `verify_e2e_ui` sampled feed
flow 120 s after a turbine trip and asserted `> 30 gpm`. Its stated claim was that feed
*tracks total steam flow*; at that moment the plant read feed 60 against steam 80, so it
cleared the bar **without tracking at all**. When legitimate physics moved the transient it
failed, and blamed the wrong component in its error message.

### What to do instead

- **Derive first, then test.** Reach for a mechanism because it is what the plant should do.
  A suite is how you check that; it is not where the answer comes from.
- **When a change reddens a gate, ask what the gate was really asserting** before touching
  either side. It may be pinning a fixture, a transient, or the very defect you are fixing.
- **Probe the edges you did not design for.** Every threshold has two sides and every latch
  has a reset. Most defects here lived where no probe looked, not where one was wrong.
- **If you must move a test, validate the new form against the OLD behaviour too.** Passing
  on both makes it a better test. Passing only on your change means you refitted it — say so
  out loud and expect to be challenged.
- **Assert the claim in the words of the claim.** "Feed tracks steam within 15 gpm" survives
  a transient shifting; "feed > 30" does not, and never tested tracking.
- **A declared behaviour that nothing measures is only a comment** — but a measurement with
  no stated claim is only a number. Pin both sides of a deliberate discontinuity (`TR-1c` is
  the worked example).

**A worked case in the right direction (#240, 2026-07-29).** Two new alarm suites were run
against the pre-change source before being trusted: both failed wholesale, as they should,
while the regression checks *inside* them — "a warning alarm still arrives unacknowledged",
"an operator ack sticks" — passed on **both** sides. That is what makes them worth having.
One pre-existing check was deliberately inverted by the ruling and was replaced by one
pinning what it had actually been there for, with the change noted at the call site rather
than quietly refitted.

---

## 3. Applying HR11 — questioning rulings

*(Owner instruction, 2026-07-26: "we should question my own decisions because they may have
been made with inaccurate assumptions.")* A ruling is only as good as the premise it was made
on, and premises go stale: the plant changes, a measurement turns out wrong, or the ruling was
given on a summary that was itself mistaken.

**This is targeted, not a standing re-audit** *(owner, same day: "we don't need to question
every decision made — that would be a lot; let's be more targeted")*. Do not re-litigate
settled rulings on principle. Raise one when you have a **specific reason to doubt its
premise**: you are working in that area and the facts do not match, a measurement contradicts
it, or its stated justification points at something that has since changed. Otherwise take the
ruling and move on.

- **Record the premise, not just the decision.** A ruling written as a bare verdict cannot be
  re-examined later, because nobody can tell what it assumed. This is exactly how the P-9 gap
  became "by design" (#216): the decision survived, its provenance did not.
- **When you find a ruling whose premise no longer holds, say so** — surface it with the
  evidence rather than deferring to it. Deferring to a ruling you have reason to doubt is not
  respect; it launders an error into a standing rule.
- **Beware of citing a ruling for something it did not decide.** Check what was actually
  ruled on, not what the ruling is now being used to justify. Stretching one onto an adjacent
  case is the most common way a level-2 claim appears out of nowhere.

---

## 4. The evidence pass — sourcing a prototypicality claim

The **directive** is binding and lives in `CLAUDE.md`: before you change a plant number,
setpoint or behaviour on the grounds that "real plants do X", find the document that says so
and cite it — accession number, section, and enough verbatim quote to check. Recall is not
evidence; neither is another agent's summary, nor a claim already in this repo.

The **method**, which is what belongs here:

- Source corpus, accession numbers and the findings already verdicted: `Diagnostic/TUNING_LOG.md`
  entry 2026-07-28q, and the `pwr-prototypicality-sources` memory. Check there first — ten
  claims are already settled against NRC primaries.
- `nrc.gov` returns 403 to non-browser fetches. Workaround that works:
  `web.archive.org/web/2023id_/<url>` with `curl` and a browser user-agent, then `pypdf` or
  `pdftotext`.
- Worked examples of the pass changing the answer: **#220** (ten recalled claims verdicted
  against primaries) and **#205**, where the evidence overturned both the filed diagnosis
  *and* one of the investigating agent's own interim findings.
- If you cannot source it, say so plainly and mark the claim unverified rather than acting
  on it.
