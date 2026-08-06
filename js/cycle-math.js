/**
 * cycle-math.js
 * Pure, dependency-free functions for cycle phase estimation.
 * No DOM, no storage — this file can be tested in isolation (see /test/cycle-math.test.js).
 *
 * FIRST PRINCIPLES this module encodes:
 *
 * 1. The luteal phase (ovulation -> next period) is physiologically the more
 *    CONSTANT part of the cycle — it's paced by the ~14-day lifespan of the
 *    corpus luteum, and typically varies only ~11-17 days. The FOLLICULAR
 *    phase (period -> ovulation) is what actually stretches or shrinks a
 *    cycle. So we estimate ovulation day by counting backward from the end
 *    of the cycle (cycleLength - lutealLength), not forward from day 1.
 *    This is the standard basis used by fertility-awareness methods.
 *
 * 2. Without direct ovulation data (BBT, LH strips, cervical mucus), luteal
 *    length can't be measured from period-start dates alone — so it's a
 *    configurable assumption (default 14), not something we silently invent
 *    a false-precision estimate for.
 *
 * 3. Cycle length prediction uses the MEDIAN of recent cycles, not the mean.
 *    One stressful/sick/travel cycle can swing a mean noticeably; the median
 *    is more robust to that single outlier while still adapting over time.
 *    We also report the standard deviation, so the app can be honest about
 *    how much a given person's cycles actually vary, instead of presenting
 *    a single day as if it were certain.
 *
 * 4. Menstrual/Follicular/Ovulatory/Luteal are treated here as four
 *    non-overlapping display phases for simplicity (this matches how most
 *    consumer trackers, incl. Garmin Connect, present it). Note this is a
 *    simplification: strictly speaking, textbook physiology defines the
 *    follicular phase as day 1 -> ovulation (i.e. it INCLUDES menstruation).
 *    We flag that distinction in the UI copy rather than hide it.
 */

const MS_PER_DAY = 86400000;

/** Whole days from dateA to dateB (dateB - dateA), ignoring time-of-day. */
function daysBetween(dateA, dateB) {
  const a = Date.UTC(dateA.getFullYear(), dateA.getMonth(), dateA.getDate());
  const b = Date.UTC(dateB.getFullYear(), dateB.getMonth(), dateB.getDate());
  return Math.round((b - a) / MS_PER_DAY);
}

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mean(values) {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function stdDev(values) {
  if (values.length < 2) return null;
  const m = mean(values);
  const variance = values.reduce((sum, v) => sum + Math.pow(v - m, 2), 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * periodStarts: array of Date objects, ascending, each the first day of a logged period.
 * Returns array of cycle lengths (gaps between consecutive starts), oldest-pair first.
 */
function computeCycleLengths(periodStarts) {
  const lengths = [];
  for (let i = 1; i < periodStarts.length; i++) {
    lengths.push(daysBetween(periodStarts[i - 1], periodStarts[i]));
  }
  return lengths;
}

/**
 * Adaptive stats from the user's own logged history.
 * periodStarts: ascending Date[]
 * periodLengths: number[] (bleed-day counts), same order/length as periodStarts
 * opts.lookback: how many recent cycles to use (3-6 per project defaults)
 */
function estimateCycleStats(periodStarts, periodLengths, opts = {}) {
  const lookback = opts.lookback || 6;
  const defaultCycleLength = opts.defaultCycleLength || 28;
  const defaultPeriodLength = opts.defaultPeriodLength || 5;

  const recentStarts = periodStarts.slice(-(lookback + 1));
  const allCycleLengths = computeCycleLengths(recentStarts);
  // Guard against logging errors (e.g. duplicate/near-duplicate dates producing
  // near-zero gaps) and physiologically implausible values.
  const cycleLengths = allCycleLengths.filter((d) => d >= 15 && d <= 90);

  const recentPeriodLengths = periodLengths.slice(-lookback).filter((d) => d >= 1 && d <= 14);

  const haveCycles = cycleLengths.length >= 1;
  const avgCycleLength = haveCycles ? Math.round(median(cycleLengths)) : defaultCycleLength;
  const cycleVariability = cycleLengths.length >= 2 ? Math.round(stdDev(cycleLengths) * 10) / 10 : null;

  const avgPeriodLength =
    recentPeriodLengths.length > 0 ? Math.round(median(recentPeriodLengths)) : defaultPeriodLength;

  let confidence = 'default'; // fewer than 1 full cycle logged
  if (cycleLengths.length >= 3) confidence = 'high';
  else if (cycleLengths.length >= 1) confidence = 'low';

  return {
    avgCycleLength,
    avgPeriodLength,
    cycleVariability, // days, stdev — null until >=2 cycles logged
    cyclesUsed: cycleLengths.length,
    confidence
  };
}

/**
 * Turns cycle stats into day-of-cycle ranges for the 4 display phases.
 * Ovulation day is estimated by counting back from cycle end (see file header).
 */
function estimatePhases(stats, lutealLength = 14) {
  const { avgCycleLength, avgPeriodLength } = stats;
  // Never let ovulation land inside or before the period window.
  const ovulationDay = Math.max(avgPeriodLength + 2, avgCycleLength - lutealLength);

  const menstrual = { start: 1, end: avgPeriodLength };
  const ovulatory = {
    start: Math.max(avgPeriodLength + 1, ovulationDay - 1),
    end: ovulationDay + 1
  };
  const follicular = {
    start: avgPeriodLength + 1,
    end: Math.max(avgPeriodLength + 1, ovulatory.start - 1)
  };
  const luteal = {
    start: ovulatory.end + 1,
    end: avgCycleLength
  };

  return { ovulationDay, menstrual, follicular, ovulatory, luteal };
}

/**
 * dayOfCycle: 1-indexed day since last logged period start.
 * Returns { phase, note? } — note is set when the cycle has run past the
 * predicted length (period may be late) rather than silently mislabeling it.
 */
function getCurrentPhase(dayOfCycle, phases, avgCycleLength) {
  const LATE_GRACE_DAYS = 3;
  if (dayOfCycle > avgCycleLength + LATE_GRACE_DAYS) {
    return {
      phase: 'luteal',
      late: true,
      daysLate: dayOfCycle - avgCycleLength,
      note: `Day ${dayOfCycle} — ${dayOfCycle - avgCycleLength} day(s) past your average cycle length. Periods run late sometimes (stress, travel, illness, or just normal variation); log day 1 as soon as it starts to recalibrate.`
    };
  }
  if (dayOfCycle >= phases.menstrual.start && dayOfCycle <= phases.menstrual.end) {
    return { phase: 'menstrual' };
  }
  if (dayOfCycle >= phases.follicular.start && dayOfCycle <= phases.follicular.end) {
    return { phase: 'follicular' };
  }
  if (dayOfCycle >= phases.ovulatory.start && dayOfCycle <= phases.ovulatory.end) {
    return { phase: 'ovulatory' };
  }
  return { phase: 'luteal' };
}

/** Day-of-cycle for `today`, given the most recent logged period start date. */
function dayOfCycleFor(lastPeriodStart, today = new Date()) {
  return daysBetween(lastPeriodStart, today) + 1;
}

/**
 * Projects a day-of-cycle `offsetDays` into the future, wrapping into a new
 * cycle once it runs past avgCycleLength. Used for the 3-day outlook — this
 * is a forward simulation (not a live status), so unlike getCurrentPhase it
 * always wraps rather than flagging "late."
 */
function projectDayOfCycle(baseDayOfCycle, offsetDays, avgCycleLength) {
  return ((baseDayOfCycle - 1 + offsetDays) % avgCycleLength) + 1;
}

/** Which of the 4 display phases a given day-of-cycle falls in (no "late" case). */
function classifyPhaseForDay(day, phases) {
  if (day >= phases.menstrual.start && day <= phases.menstrual.end) return 'menstrual';
  if (day >= phases.follicular.start && day <= phases.follicular.end) return 'follicular';
  if (day >= phases.ovulatory.start && day <= phases.ovulatory.end) return 'ovulatory';
  return 'luteal';
}

/**
 * Days between `day` and the nearer edge of its own phase's range. Small
 * values mean the day sits close to a phase transition — and since real
 * cycles vary by roughly `cycleVariability` days, a projection landing
 * within that many days of a boundary is genuinely uncertain about which
 * phase it will turn out to be, not just imprecise.
 */
function boundaryDistance(day, phaseKey, phases) {
  const range = phases[phaseKey];
  return Math.min(day - range.start, range.end - day);
}

/**
 * FORECASTING MULTIPLE CYCLES AHEAD — the math behind the Calendar's
 * forward-looking phase coloring.
 *
 * Projecting 1 cycle ahead carries roughly `cycleVariability` days of
 * uncertainty (the stdDev already computed from the user's own recent
 * cycles). Projecting k cycles ahead means summing k cycle lengths, each an
 * independent-ish draw with that same stdDev — for a sum of k i.i.d. random
 * variables, stdDev(sum) = stdDev(single) * sqrt(k). That's standard error
 * propagation, not a guess, and it's why uncertainty grows with the SQUARE
 * ROOT of distance rather than linearly: forecasting stays meaningfully
 * useful much further out for a regular cycle than a naive "just multiply
 * the error" model would suggest.
 *
 * A day-level phase call stops being trustworthy once that uncertainty band
 * approaches the width of the narrowest phase (ovulatory is typically the
 * shortest, ~3 days on a 28-day cycle). 20% of the average cycle length is
 * used here as a checkable proxy for "the uncertainty is now comparable to
 * an entire phase" — not an arbitrary decoration, a threshold that can be
 * verified against the phase widths estimatePhases() actually produced.
 */
const FORECAST_RELIABILITY_FRACTION = 0.2;

/** Uncertainty (in days) of a projection landing `cyclesAhead` full cycles from today. */
function cycleSigma(cycleVariability, cyclesAhead) {
  if (cycleVariability === null || cycleVariability === undefined) return null;
  return cycleVariability * Math.sqrt(cyclesAhead + 1);
}

/** How many full cycles separate today's day-of-cycle from a day `offsetDays` in the future. */
function cyclesAheadFor(dayOfCycleToday, offsetDays, avgCycleLength) {
  return Math.floor((dayOfCycleToday - 1 + offsetDays) / avgCycleLength);
}

/**
 * 0 = fully confident, 1 = at/beyond the point where a day-level phase call
 * is no longer meaningfully trustworthy. Null when there's not yet enough
 * logged history to estimate variability at all (fewer than 2 cycle gaps).
 */
function forecastReliabilityRatio(stats, cyclesAhead) {
  if (stats.cycleVariability === null) return null;
  if (stats.cycleVariability === 0) return 0;
  const sigma = cycleSigma(stats.cycleVariability, cyclesAhead);
  const threshold = FORECAST_RELIABILITY_FRACTION * stats.avgCycleLength;
  return Math.min(1, sigma / threshold);
}

/**
 * How many full cycles ahead the forecast stays within the reliability
 * threshold, given the user's own logged variability. Null if unknown yet
 * (not enough cycles logged to estimate variability — the forecast still
 * renders, just uniformly flagged low-confidence rather than gradient-faded,
 * since there's no real basis for a gradient without a variability estimate).
 */
function maxReliableForecastCycles(stats) {
  if (stats.cycleVariability === null) return null;
  if (stats.cycleVariability === 0) return Infinity;
  const threshold = FORECAST_RELIABILITY_FRACTION * stats.avgCycleLength;
  const kPlus1 = Math.pow(threshold / stats.cycleVariability, 2);
  return Math.max(0, Math.floor(kPlus1 - 1));
}

/**
 * Full forecast for an arbitrary future date: which phase, how many cycles
 * out, and how reliable that call is. Deliberately separate from
 * getCurrentPhase/phaseForDate — those use real logged period starts and
 * are for dates we actually have ground truth for (today and the past).
 * This one always wraps forward via projectDayOfCycle rather than flagging
 * "late," because a forecast several months out shouldn't freeze on
 * whatever "late" meant on the day it was computed.
 */
function forecastPhaseForDate(targetDate, today, ctx) {
  if (!ctx.dayOfCycle) return null;
  const offsetDays = daysBetween(today, targetDate);
  const projectedDay = projectDayOfCycle(ctx.dayOfCycle, offsetDays, ctx.stats.avgCycleLength);
  const phase = classifyPhaseForDay(projectedDay, ctx.phases);
  const cyclesAhead = cyclesAheadFor(ctx.dayOfCycle, offsetDays, ctx.stats.avgCycleLength);
  const reliability = forecastReliabilityRatio(ctx.stats, cyclesAhead);
  const periodStartDay = phase === 'menstrual' && projectedDay === ctx.phases.menstrual.start;
  return { phase, projectedDay, cyclesAhead, reliability, periodStartDay };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    daysBetween,
    median,
    mean,
    stdDev,
    computeCycleLengths,
    estimateCycleStats,
    estimatePhases,
    getCurrentPhase,
    dayOfCycleFor,
    projectDayOfCycle,
    classifyPhaseForDay,
    boundaryDistance,
    FORECAST_RELIABILITY_FRACTION,
    cycleSigma,
    cyclesAheadFor,
    forecastReliabilityRatio,
    maxReliableForecastCycles,
    forecastPhaseForDate
  };
}
