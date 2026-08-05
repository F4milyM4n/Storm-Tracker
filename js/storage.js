/**
 * storage.js
 * All persistence is local (localStorage) — this app has no backend server.
 * A single JSON blob under one key keeps export/import simple and atomic.
 */

const STORAGE_KEY = 'cycleTracker.v1';
const SCHEMA_VERSION = 1;

/** Seeded on first run; fully user-editable afterward (add/remove/rename). */
const DEFAULT_MEDICATIONS = [
  { id: 'med_ibuprofen', name: 'Ibuprofen', dose: '' },
  { id: 'med_acetaminophen', name: 'Acetaminophen / paracetamol', dose: '' },
  { id: 'med_naproxen', name: 'Naproxen', dose: '' }
];

function defaultState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    settings: {
      lutealLength: 14,
      lookbackCycles: 6,
      defaultCycleLength: 28,
      defaultPeriodLength: 5,
      onboarded: false,
      // ids of built-in PHYSICAL_SYMPTOMS/PSYCH_SYMPTOMS the user has hidden from the log form
      hiddenSymptomIds: [],
      // user-added symptoms, same shape as the built-ins ({id, label})
      customSymptoms: { physical: [], psych: [] },
      // persistent medication list — this is what renders as quick-select chips in
      // the log form, so a prescription added once keeps showing up every day
      medications: DEFAULT_MEDICATIONS.map((m) => ({ ...m })),
      // persistent coping-strategies list, seeded from the evidence-tagged presets in
      // content.js (COPING_STRATEGIES) — fully editable: remove ones you don't use,
      // add your own (custom ones carry no evidence tag, since that's not a claim
      // Claude is positioned to make about something the user typed in themselves)
      copingStrategies: (typeof COPING_STRATEGIES !== 'undefined' ? COPING_STRATEGIES : []).map((c) => ({ ...c }))
    },
    // entries keyed by ISO date string 'YYYY-MM-DD', one per day
    entries: {}
  };
}

function makeId(prefix, label) {
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 24);
  return `${prefix}_${slug}_${Math.random().toString(36).slice(2, 7)}`;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    if (!parsed.schemaVersion) return defaultState();
    // Fill in any settings added in later versions without wiping existing data.
    return { ...defaultState(), ...parsed, settings: { ...defaultState().settings, ...parsed.settings } };
  } catch (e) {
    console.error('Failed to load state, starting fresh:', e);
    return defaultState();
  }
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (e) {
    console.error('Failed to save state (storage full or blocked?):', e);
    return false;
  }
}

function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function fromISODate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Upsert a day's entry. Merges rather than overwrites unspecified fields. */
function saveEntry(state, isoDate, entryPatch) {
  const existing = state.entries[isoDate] || {
    date: isoDate,
    isPeriodStart: false,
    isPeriodDay: false,
    mood: [],
    physicalSymptoms: {}, // { symptomId: severity(1-3) }
    psychSymptoms: {},
    medications: [], // [{ name, dose, time }]
    copingStrategies: [], // [strategyId, ...] — simple "did this today" list, no severity
    notes: ''
  };
  state.entries[isoDate] = { ...existing, ...entryPatch };
  saveState(state);
  return state;
}

function deleteEntry(state, isoDate) {
  delete state.entries[isoDate];
  saveState(state);
  return state;
}

/**
 * Logs a past period in one step: marks `lengthDays` consecutive days
 * starting at `startISO` as bleed days, the first as day 1. Used by both
 * the onboarding wizard and the "log a past period" tool in Settings, so
 * backfilling history doesn't mean tapping through the calendar day by day.
 * Merges into any existing entries for those dates rather than overwriting
 * symptoms/notes already logged there.
 */
function bulkLogPeriod(state, startISO, lengthDays) {
  const start = fromISODate(startISO);
  for (let i = 0; i < lengthDays; i++) {
    const d = new Date(start.getTime() + i * 86400000);
    const iso = toISODate(d);
    saveEntry(state, iso, { isPeriodDay: true, isPeriodStart: i === 0 });
  }
  return state;
}

/** Symptom visibility + custom symptoms ------------------------------------ */
function setSymptomHidden(state, symptomId, hidden) {
  const set = new Set(state.settings.hiddenSymptomIds);
  if (hidden) set.add(symptomId); else set.delete(symptomId);
  state.settings.hiddenSymptomIds = [...set];
  saveState(state);
  return state;
}

function addCustomSymptom(state, category, label) {
  const trimmed = label.trim();
  if (!trimmed) return state;
  const id = makeId('custom', trimmed);
  state.settings.customSymptoms[category].push({ id, label: trimmed });
  saveState(state);
  return state;
}

function removeCustomSymptom(state, category, id) {
  state.settings.customSymptoms[category] = state.settings.customSymptoms[category].filter((s) => s.id !== id);
  saveState(state);
  return state;
}

/** Combines built-ins (minus hidden) with user-added custom symptoms for display. */
function getVisibleSymptoms(builtIns, category, settings) {
  const hidden = new Set(settings.hiddenSymptomIds);
  const visibleBuiltIns = builtIns.filter((s) => !hidden.has(s.id));
  return [...visibleBuiltIns, ...settings.customSymptoms[category]];
}

/** Persistent medications ---------------------------------------------------- */
function addMedication(state, name, dose = '') {
  const trimmed = name.trim();
  if (!trimmed) return state;
  const id = makeId('med', trimmed);
  state.settings.medications.push({ id, name: trimmed, dose: dose.trim() });
  saveState(state);
  return state;
}

function removeMedication(state, id) {
  state.settings.medications = state.settings.medications.filter((m) => m.id !== id);
  saveState(state);
  return state;
}

function updateMedication(state, id, patch) {
  state.settings.medications = state.settings.medications.map((m) => (m.id === id ? { ...m, ...patch } : m));
  saveState(state);
  return state;
}

/** Persistent coping strategies ---------------------------------------------- */
function addCopingStrategy(state, name) {
  const trimmed = name.trim();
  if (!trimmed) return state;
  const id = makeId('coping', trimmed);
  // No evidence tag on user-added entries — that's a claim about trial support
  // that only applies to the curated presets, not something typed in ad hoc.
  state.settings.copingStrategies.push({ id, label: trimmed, evidence: null });
  saveState(state);
  return state;
}

function removeCopingStrategy(state, id) {
  state.settings.copingStrategies = state.settings.copingStrategies.filter((c) => c.id !== id);
  saveState(state);
  return state;
}

/** All period-start dates, ascending, as Date objects. */
function getPeriodStarts(state) {
  return Object.values(state.entries)
    .filter((e) => e.isPeriodStart)
    .map((e) => fromISODate(e.date))
    .sort((a, b) => a - b);
}

/** Period length (bleed-day count) per cycle, aligned to getPeriodStarts order. */
function getPeriodLengths(state) {
  const days = Object.values(state.entries)
    .filter((e) => e.isPeriodDay)
    .map((e) => e.date)
    .sort();
  const starts = Object.values(state.entries)
    .filter((e) => e.isPeriodStart)
    .map((e) => e.date)
    .sort();

  return starts.map((startIso, i) => {
    const nextStartIso = starts[i + 1];
    const start = fromISODate(startIso);
    let count = 0;
    for (const d of days) {
      if (d >= startIso && (!nextStartIso || d < nextStartIso)) {
        const gap = daysBetweenISO(startIso, d);
        if (gap < 14) count++; // sanity cap so stray tags don't inflate a period length
      }
    }
    return Math.max(count, 1);
  });
}

function daysBetweenISO(isoA, isoB) {
  const a = fromISODate(isoA);
  const b = fromISODate(isoB);
  return Math.round((b - a) / 86400000);
}

function exportJSON(state) {
  return JSON.stringify(state, null, 2);
}

function importJSON(jsonString) {
  const parsed = JSON.parse(jsonString);
  if (!parsed.schemaVersion || !parsed.entries) {
    throw new Error('This file doesn\u2019t look like a cycle tracker backup.');
  }
  saveState(parsed);
  return parsed;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    STORAGE_KEY, SCHEMA_VERSION, defaultState, loadState, saveState,
    toISODate, fromISODate, saveEntry, deleteEntry, bulkLogPeriod,
    getPeriodStarts, getPeriodLengths, exportJSON, importJSON,
    setSymptomHidden, addCustomSymptom, removeCustomSymptom, getVisibleSymptoms,
    addMedication, removeMedication, updateMedication, DEFAULT_MEDICATIONS,
    addCopingStrategy, removeCopingStrategy
  };
}
