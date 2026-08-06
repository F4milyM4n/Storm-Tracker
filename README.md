# Cycle Tracker

A menstrual cycle tracker that runs entirely in the browser: adaptive phase
calculation from your own logged history, physical + psychological symptom
logging, mood, medications, and phase-specific tips (what's physiologically
happening + coping strategies, each labeled by evidence type) shown when you
open it. Inspired by Garmin Connect's menstrual cycle tracking, rebuilt as a
standalone installable web app.

No account, no server, no analytics. All data is stored in `localStorage` on
your device. Nothing leaves your browser.

## Install it as an app

**Host it (once):**
1. Create a GitHub repo and push everything in this folder to it.
2. In the repo, go to **Settings → Pages**, set source to the `main` branch
   (root), save. GitHub gives you a URL like
   `https://yourname.github.io/cycle-tracker/`.

**Then, on your phone/desktop:**
- **Android / Chrome / Edge:** open the URL, tap the "Install" prompt or the
  browser's menu → *Install app* / *Add to Home screen*.
- **iOS / Safari:** open the URL, tap Share → *Add to Home Screen*.
- **Desktop Chrome/Edge:** click the install icon in the address bar.

It then opens full-screen from your home screen/app list like a native app,
and works offline (the service worker caches the app shell — your data was
always local anyway).

## What it tracks

- **Onboarding** — on first launch: optionally enter cycle info (last period,
  typical lengths, any earlier periods you remember), then a **customize**
  step where you pick which symptoms to track, set up medications, and
  choose coping strategies — before you ever see the main app. Skippable at
  the cycle-info step (customize still runs either way), and re-runnable
  anytime from Settings.
- **Cycle phases** — Menstrual, Follicular, Ovulatory, Luteal, shown as a
  ring sized by your *actual* phase lengths, not a generic quarter-split.
- **Calendar with forecast** — past and current-cycle days use your real
  logged period starts (ground truth). Future days show a *forecast*
  instead: projected phase colors that fade the further out you go, based
  on your own cycle variability, plus a small ring marker on each day a
  period is projected to start. See "How the forecast works" below for the
  math behind the fade.
- **Physical symptoms** and **psychological symptoms**, each with a
  Mild/Moderate/Severe severity tap. Hide any you never experience, or add
  your own custom symptoms — from onboarding or Settings.
- **Mood** — quick multi-select tags, separate from the symptom checklists.
- **Coping strategies taken** — a daily checklist (cardio, walking, yoga,
  strength training, meditation, breathing, heat therapy, stretching, rest,
  massage) for what you actually did that day, distinct from the advice
  text on the Today card. Each preset carries an evidence dot: research-backed
  for cycle-specific symptoms, or commonly-reported-but-thinner-evidence. Add
  your own (custom ones carry no evidence claim) or drop any preset that
  doesn't fit — same persistent, editable-list pattern as medications.
- **Medications** — a persistent, editable list (Settings → Medications).
  Add a prescription once and it shows up as a quick-tap chip in the log
  every day after, alongside a few seeded OTC defaults.
- **Historical logging** — log a past period in one step (start date +
  length) from Settings, without tapping through the calendar day by day.
  Any individual day, past or present, can also be logged directly by
  tapping it on the Calendar.
- **Notes** — free text.
- **Insights** — once you've logged enough days in a given phase, the
  Insights tab shows real frequency percentages computed from *your* data
  ("you've logged cramps in 80% of your menstrual-phase days"), not a
  canned educational message. It stays silent on a phase until there's
  enough of your own history to say something real (3+ logged days in it).
- **3-day outlook** — at the top of Insights: projects which phase each of
  the next 3 days will likely fall in, and attaches that phase's historical
  symptom frequencies. Flags a projection as uncertain when it lands close
  enough to a phase boundary that your own cycle variability could shift
  it either way, and flags the day a new period is projected to start.

## How the phase math works (and why)

This app deliberately does **not** just assume a 28-day cycle forever. It
recalculates from your own logged period-start dates:

- **Cycle length** is the **median** of your last 3–6 cycles (configurable
  in Settings), not the mean. A single stressful/sick/travel cycle can swing
  an average noticeably; the median resists that one outlier while still
  adapting as you log more. (See `test/cycle-math.test.js` for a worked
  example: cycles of 28/29/27/28/45 days give a median of 28, vs. a mean of
  31 that the one 45-day outlier would otherwise drag toward.)
- **Ovulation day** is estimated by counting *backward* from the end of the
  cycle (`cycle length − luteal length`), not forward from day 1. This is
  because the luteal phase (ovulation → next period) is the physiologically
  more constant part of the cycle — governed by the ~14-day lifespan of the
  corpus luteum — while the follicular phase (period → ovulation) is what
  actually stretches or shrinks a cycle. Luteal length defaults to 14 days
  and is adjustable in Settings, since it isn't directly measurable from
  period dates alone (that would need basal body temperature or LH data).
- **Confidence is shown, not hidden.** With 0 logged cycles you get a
  labeled default (28/14). With 1, you get a low-confidence estimate. With
  3+, you get "based on your last N cycles" plus the day-to-day variability
  (standard deviation), so a ±1 day cycle and a ±6 day cycle don't get
  presented with false equal precision.
- **Late-period handling.** If today is more than 3 days past your average
  cycle length with no new period logged, the app says so explicitly rather
  than mislabeling the phase.
- **A known simplification, stated plainly:** textbook physiology defines
  the follicular phase as day 1 → ovulation (it technically *includes*
  menstruation). This app shows Menstrual and Follicular as separate,
  non-overlapping phases on the ring — the same simplification most
  consumer cycle-tracking apps make, for a legible display — and says so in
  the Luteal-phase tip card rather than leaving it implied.

### The Calendar forecast (multi-month)

Scrolling the Calendar forward always shows *something* — at minimum the
next 3 months — but the confidence behind that color is honestly
represented rather than painted uniformly:

1. **Wraparound projection.** Future days use the same `projectDayOfCycle`
   wraparound math as the 3-day outlook, just extended arbitrarily far
   forward — a date 4 cycles out correctly lands in a *projected 4th*
   cycle's phases, not stuck showing "late" forever the way a live-status
   check would.
2. **Compounding uncertainty, not a flat guess.** Projecting 1 cycle ahead
   carries about `cycleVariability` days of uncertainty (your own logged
   stdDev). Projecting *k* cycles ahead means summing k cycle lengths, and
   for a sum of independent-ish values, stdDev(sum) = stdDev(single) ×
   √k — standard error propagation. That's why the fade isn't linear: a
   very regular cycle (±1 day) stays meaningfully forecastable for a long
   time, while an irregular one (±5+ days) degrades within a cycle or two —
   computed from *your* data, not a fixed calendar cutoff.
3. **A checkable reliability threshold.** A day-level phase call stops
   being trustworthy once that uncertainty band approaches the width of
   the narrowest phase (ovulatory, typically the shortest). 20% of the
   average cycle length is used as a proxy for "uncertainty is now
   comparable to an entire phase" — verifiable against the phase widths
   `estimatePhases()` actually produced, not an arbitrary decoration.
4. **The fade is the confidence, not just decoration.** Each day's color
   opacity is computed directly from its reliability ratio (0 = as
   confident as the near-term forecast gets, 1 = at/beyond the threshold)
   — so a quick glance at how saturated a month looks tells you how much
   to trust it, and the app also states this in words below the grid
   ("...should stay meaningfully accurate through about \<date\>").
5. **Never fabricated.** With fewer than 2 logged cycle gaps there's no
   variability estimate to compound, so the forecast renders at a flat
   reduced-confidence shade throughout rather than a fake gradient — and
   with zero periods logged, there's no forecast at all.

This all lives in `js/cycle-math.js` (`cycleSigma`, `cyclesAheadFor`,
`forecastReliabilityRatio`, `maxReliableForecastCycles`,
`forecastPhaseForDate`) and is tested in `test/forecast.test.js`, including
a check that the reported "reliable through" horizon is self-consistent
with the underlying per-day reliability math rather than just eyeballed.

### The 3-day outlook

The outlook combines two separate calculations rather than guessing:

1. **Forward projection** — your current day-of-cycle is projected 1, 2,
   and 3 days ahead (`projectDayOfCycle`), wrapping into a new cycle once it
   runs past your average length, then classified into a phase
   (`classifyPhaseForDay`).
2. **Historical attachment** — each projected day is matched against that
   phase's *already-computed* symptom frequencies from your own logged
   history (the same numbers shown lower down in Insights).

A projection is flagged **uncertain** when the projected day lands closer to
a phase boundary than your own cycle's day-to-day variability
(`boundaryDistance` vs. the standard deviation from `estimateCycleStats`) —
so a highly regular cycle gets confident near-boundary projections, and an
irregular one gets an honest "this could shift" instead of false precision.
The day a new period is projected to start gets its own flag. With no
period logged yet, the outlook says so rather than fabricating one.

All of this logic lives in `js/cycle-math.js`, is framework-free, and has a
test suite in `test/` covering the math with `node test/cycle-math.test.js`,
`test/storage.test.js`, `test/storage2.test.js`, `test/storage3.test.js`,
`test/insights.test.js`, `test/outlook.test.js`, `test/forecast.test.js`,
and `test/integration.test.js`.

## On the coping-strategy content

Every tip in `js/content.js` is tagged **Research-backed** or **Commonly
reported**. Research-backed means there's controlled-trial or clinical-
guideline support (e.g. NSAIDs for prostaglandin-driven cramps, exercise and
calcium/vitamin D for PMS severity). Commonly reported means it's widely
self-reported by cycle-trackers but has limited or mixed formal trial
evidence (e.g. magnesium, reducing caffeine/salt for bloating). Both are
included deliberately — the point isn't to only trust journals or to only
trust anecdote, it's to be upfront about which kind of evidence a given tip
rests on so you can weigh it for yourself. None of this is medical advice;
if symptoms are severe enough to disrupt daily functioning (a pattern
consistent with PMDD, for instance), the app says to raise it with a
clinician rather than self-manage it.

The **coping strategies taken** checklist (what you log as done, not the
advice text above) uses the same two tags, deliberately kept separate from
each other: cardio, walking, yoga, meditation, and heat therapy are tagged
research-backed because there's cycle-specific trial support (dysmenorrhea/
PMS RCTs); strength training, deep breathing, stretching, rest, and massage
are tagged commonly-reported. That's not a claim they don't help — it's
that their trial evidence *specific to cycle symptoms* is thinner than their
general-health reputation might suggest, and conflating "well-evidenced for
health in general" with "well-evidenced for period symptoms specifically"
would overstate the second claim. Custom coping strategies you add carry no
evidence tag at all, since that's not a claim Claude is positioned to make
about something typed in ad hoc.

## Project structure

```
cycle-tracker/
├── index.html            # App shell, all views (incl. onboarding wizard)
├── css/style.css          # Design system + layout
├── js/
│   ├── cycle-math.js       # Pure phase-calculation + projection functions (tested)
│   ├── storage.js          # localStorage wrapper, export/import, medications/symptoms CRUD
│   ├── content.js          # Built-in symptom presets + phase tip copy
│   ├── insights.js         # Personal frequency patterns + 3-day outlook (tested)
│   └── app.js               # DOM wiring / view controller / onboarding flow
├── manifest.json           # PWA manifest
├── service-worker.js        # Offline app-shell caching
├── icons/                  # App icons (192, 512)
└── test/                   # node test/*.test.js — no build step needed
```

## Extending it

- **Add a symptom:** add an entry to `PHYSICAL_SYMPTOMS` or `PSYCH_SYMPTOMS`
  in `js/content.js` — the log form and insights picks it up automatically.
- **Change the luteal-length assumption or lookback window:** Settings tab,
  or edit the defaults in `js/storage.js` (`defaultState()`).
- **Swap the palette/type:** all design tokens are CSS custom properties at
  the top of `css/style.css`.

## Backing up your data

Settings → **Export backup (JSON)** downloads everything. Keep it somewhere
safe — clearing your browser's site data or switching devices otherwise
means starting over. **Import backup** restores from that file.
