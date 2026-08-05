/**
 * insights.js
 * Turns the user's own logged entries into personalized frequency stats:
 * "you logged X in Y% of your <phase> days." This is computed fresh from
 * their data every time — not a canned message — and only shown once
 * there's enough of their own history to say something meaningful.
 */

const MIN_ENTRIES_PER_PHASE = 3;
const SURFACE_THRESHOLD_PCT = 40; // only surface symptoms present in >=40% of that phase's logged days

/**
 * entries: array of { phase, physicalSymptoms: {id:severity}, psychSymptoms: {id:severity}, mood: [] }
 * labelLookup: map of symptomId -> display label (merge PHYSICAL_SYMPTOMS + PSYCH_SYMPTOMS)
 * Returns { [phase]: [{ symptom, label, pct, avgSeverity, count }] | null }
 */
function computeSymptomInsights(entries, labelLookup) {
  const byPhase = { menstrual: [], follicular: [], ovulatory: [], luteal: [] };
  entries.forEach((e) => {
    if (byPhase[e.phase]) byPhase[e.phase].push(e);
  });

  const result = {};
  for (const phase of Object.keys(byPhase)) {
    const group = byPhase[phase];
    if (group.length < MIN_ENTRIES_PER_PHASE) {
      result[phase] = { ready: false, loggedDays: group.length, needed: MIN_ENTRIES_PER_PHASE };
      continue;
    }

    const tally = {}; // id -> { count, severitySum }
    group.forEach((e) => {
      const all = { ...e.physicalSymptoms, ...e.psychSymptoms };
      Object.entries(all).forEach(([id, severity]) => {
        if (!tally[id]) tally[id] = { count: 0, severitySum: 0 };
        tally[id].count += 1;
        tally[id].severitySum += Number(severity) || 0;
      });
    });

    const ranked = Object.entries(tally)
      .map(([id, v]) => ({
        symptom: id,
        label: labelLookup[id] || id,
        count: v.count,
        pct: Math.round((100 * v.count) / group.length),
        avgSeverity: Math.round((v.severitySum / v.count) * 10) / 10
      }))
      .filter((x) => x.pct >= SURFACE_THRESHOLD_PCT)
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 4);

    result[phase] = { ready: true, loggedDays: group.length, top: ranked };
  }
  return result;
}

/**
 * Cross-cycle mood insight: which mood tags cluster in which phase.
 * Same 'own data, real percentages' approach as symptoms.
 */
function computeMoodInsights(entries) {
  const byPhase = { menstrual: [], follicular: [], ovulatory: [], luteal: [] };
  entries.forEach((e) => {
    if (byPhase[e.phase]) byPhase[e.phase].push(e);
  });

  const result = {};
  for (const phase of Object.keys(byPhase)) {
    const group = byPhase[phase];
    if (group.length < MIN_ENTRIES_PER_PHASE) {
      result[phase] = null;
      continue;
    }
    const tally = {};
    group.forEach((e) => (e.mood || []).forEach((tag) => (tally[tag] = (tally[tag] || 0) + 1)));
    const ranked = Object.entries(tally)
      .map(([tag, count]) => ({ tag, pct: Math.round((100 * count) / group.length) }))
      .filter((x) => x.pct >= SURFACE_THRESHOLD_PCT)
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 3);
    result[phase] = ranked;
  }
  return result;
}

/**
 * 3-day outlook: for each of the next 3 days, projects which phase it will
 * likely fall in (via cycle-math's forward projection) and attaches that
 * phase's already-computed historical symptom frequencies. This is a
 * projection built from two real calculations — where you are in the
 * average cycle, and what you've actually logged in that phase before —
 * not a canned "here's what phase X is like" message.
 *
 * ctx: the cycle context from getCycleContext() (needs dayOfCycle, phases, stats)
 * symptomInsights: output of computeSymptomInsights()
 * Returns null if no period has been logged yet (nothing to project from).
 */
function buildThreeDayOutlook(ctx, symptomInsights) {
  if (!ctx.dayOfCycle) return null;
  const days = [];
  for (let offset = 1; offset <= 3; offset++) {
    const projectedDay = projectDayOfCycle(ctx.dayOfCycle, offset, ctx.stats.avgCycleLength);
    const phase = classifyPhaseForDay(projectedDay, ctx.phases);
    const dist = boundaryDistance(projectedDay, phase, ctx.phases);
    const uncertain = ctx.stats.cycleVariability !== null && dist < ctx.stats.cycleVariability;
    // Flag the specific day a new period is projected to begin.
    const periodLikelyStarts = phase === 'menstrual' && projectedDay === ctx.phases.menstrual.start;
    const date = new Date();
    date.setDate(date.getDate() + offset);
    days.push({ offset, date, projectedDay, phase, uncertain, periodLikelyStarts, insight: symptomInsights[phase] || null });
  }
  return days;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { computeSymptomInsights, computeMoodInsights, buildThreeDayOutlook, MIN_ENTRIES_PER_PHASE, SURFACE_THRESHOLD_PCT };
}
