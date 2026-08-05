/**
 * app.js — wires together cycle-math.js, storage.js, content.js, insights.js
 * and the DOM. No framework, no build step, so the repo can be cloned and
 * opened straight from a static host with nothing to compile.
 */

(function () {
  'use strict';

  const state = loadState();
  let currentLogDate = storage_toISO(new Date());

  // Local aliases so the file reads cleanly (all functions are attached to
  // window by the other script files, loaded before this one).
  const CM = window; // cycle-math.js exports live on window in-browser (see bottom of that file, module.exports guarded)

  function storage_toISO(d) { return toISODate(d); }

  // ---------------------------------------------------------------------
  // Derived cycle data (recomputed whenever the view needs it — cheap)
  // ---------------------------------------------------------------------
  function getCycleContext() {
    const periodStarts = getPeriodStarts(state);
    const periodLengths = getPeriodLengths(state);
    const stats = estimateCycleStats(periodStarts, periodLengths, {
      lookback: state.settings.lookbackCycles,
      defaultCycleLength: state.settings.defaultCycleLength,
      defaultPeriodLength: state.settings.defaultPeriodLength
    });
    const phases = estimatePhases(stats, state.settings.lutealLength);

    let dayOfCycle = null;
    let phaseInfo = { phase: null };
    if (periodStarts.length > 0) {
      const lastStart = periodStarts[periodStarts.length - 1];
      dayOfCycle = dayOfCycleFor(lastStart, new Date());
      phaseInfo = getCurrentPhase(dayOfCycle, phases, stats.avgCycleLength);
    }

    return { periodStarts, periodLengths, stats, phases, dayOfCycle, phaseInfo };
  }

  /** Phase for an arbitrary date, used by the calendar. Returns null before any period is logged. */
  function phaseForDate(date, ctx) {
    if (ctx.periodStarts.length === 0) return null;
    // Find the most recent period start on/before this date.
    let lastStart = null;
    for (const s of ctx.periodStarts) {
      if (s <= date) lastStart = s; else break;
    }
    if (!lastStart) return null;
    const dayOfCycle = dayOfCycleFor(lastStart, date);
    const info = getCurrentPhase(dayOfCycle, ctx.phases, ctx.stats.avgCycleLength);
    return info.phase;
  }

  // ---------------------------------------------------------------------
  // View routing
  // ---------------------------------------------------------------------
  function showView(name) {
    document.querySelectorAll('.view').forEach((el) => {
      el.hidden = el.dataset.view !== name;
    });
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.view === name);
    });
    document.querySelector('.tab-bar').hidden = name === 'onboarding';
    if (name === 'today') renderToday();
    if (name === 'calendar') renderCalendar();
    if (name === 'insights') renderInsights();
    if (name === 'settings') renderSettings();
  }

  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => showView(btn.dataset.view));
  });

  // ---------------------------------------------------------------------
  // TODAY view
  // ---------------------------------------------------------------------
  const RING_R = 100;
  const RING_CIRC = 2 * Math.PI * RING_R;
  const ARC_GAP = 3; // px gap between phase arcs on the ring

  function renderRing(ctx) {
    const group = document.getElementById('ring-arcs');
    group.innerHTML = '';
    const order = ['menstrual', 'follicular', 'ovulatory', 'luteal'];
    order.forEach((phase) => {
      const range = ctx.phases[phase];
      const offsetDays = range.start - 1;
      const lengthDays = Math.max(range.end - range.start + 1, 0);
      const offsetLen = (offsetDays / ctx.stats.avgCycleLength) * RING_CIRC;
      const arcLen = Math.max((lengthDays / ctx.stats.avgCycleLength) * RING_CIRC - ARC_GAP, 1);

      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', '120');
      circle.setAttribute('cy', '120');
      circle.setAttribute('r', String(RING_R));
      circle.setAttribute('class', 'ring-arc');
      circle.style.stroke = `var(${PHASE_META[phase].color})`;
      circle.setAttribute('stroke-dasharray', `${arcLen} ${RING_CIRC - arcLen}`);
      circle.setAttribute('stroke-dashoffset', String(-offsetLen));
      group.appendChild(circle);
    });

    // Marker at current day-of-cycle (or hidden if no period logged yet)
    const marker = document.getElementById('ring-marker');
    if (ctx.dayOfCycle) {
      const fraction = Math.min((ctx.dayOfCycle - 0.5) / ctx.stats.avgCycleLength, 0.995);
      const theta = fraction * 2 * Math.PI;
      const x = 120 + RING_R * Math.cos(theta);
      const y = 120 + RING_R * Math.sin(theta);
      marker.setAttribute('cx', String(x));
      marker.setAttribute('cy', String(y));
      marker.style.display = '';
    } else {
      marker.style.display = 'none';
    }
  }

  function renderToday() {
    const ctx = getCycleContext();
    document.getElementById('today-date').textContent = new Date().toLocaleDateString(undefined, {
      weekday: 'long', month: 'long', day: 'numeric'
    });

    renderRing(ctx);

    const dayEl = document.getElementById('ring-day');
    const phaseEl = document.getElementById('ring-phase');
    const confEl = document.getElementById('confidence-note');
    const lateEl = document.getElementById('late-note');

    if (!ctx.dayOfCycle) {
      dayEl.textContent = '—';
      phaseEl.textContent = 'Log day 1 to begin';
      confEl.textContent = 'Phases will appear once you log the first day of a period.';
      lateEl.hidden = true;
      renderTips(null);
      renderInsightTeaser(null, ctx);
      return;
    }

    dayEl.textContent = String(ctx.dayOfCycle);
    const phaseKey = ctx.phaseInfo.phase;
    phaseEl.textContent = `${PHASE_META[phaseKey].label} phase`;

    const confMsg = {
      default: 'Using a standard 28-day estimate — log one full cycle for a personalized calculation.',
      low: `Based on 1 logged cycle. A couple more will sharpen this.`,
      high: `Based on your last ${ctx.stats.cyclesUsed} cycles (avg ${ctx.stats.avgCycleLength}d${ctx.stats.cycleVariability !== null ? `, ±${ctx.stats.cycleVariability}d` : ''}).`
    }[ctx.stats.confidence];
    confEl.textContent = confMsg;

    if (ctx.phaseInfo.late) {
      lateEl.hidden = false;
      lateEl.textContent = ctx.phaseInfo.note;
    } else {
      lateEl.hidden = true;
    }

    renderTips(phaseKey);
    renderInsightTeaser(phaseKey, ctx);
  }

  function renderTips(phaseKey) {
    const bodyEl = document.getElementById('tip-body');
    const copingEl = document.getElementById('tip-coping');
    const footEl = document.getElementById('tip-footnote');

    if (!phaseKey) {
      bodyEl.innerHTML = '<p>Once you log your first period start, this card will explain what\u2019s physiologically happening in your current phase and offer coping strategies suited to it.</p>';
      copingEl.innerHTML = '';
      footEl.textContent = '';
      return;
    }

    const tip = PHASE_TIPS[phaseKey];
    bodyEl.innerHTML = `<h3>${PHASE_META[phaseKey].label} phase</h3><p>${tip.physiology}</p>`;

    copingEl.innerHTML = tip.coping
      .map(
        (c) => `<div class="coping-item">
          <span class="evidence-tag ${c.evidence}">${c.evidence === 'research' ? 'Research-backed' : 'Commonly reported'}</span>
          <p style="margin:0">${c.text}</p>
        </div>`
      )
      .join('');

    footEl.textContent = tip.note || '';
  }

  function renderInsightTeaser(phaseKey, ctx) {
    const box = document.getElementById('insight-teaser');
    const textEl = document.getElementById('insight-teaser-text');
    if (!phaseKey) { box.hidden = true; return; }

    const entries = Object.values(state.entries).map((e) => withPhase(e, ctx));
    const labelLookup = buildLabelLookup();
    const insights = computeSymptomInsights(entries, labelLookup);
    const phaseInsight = insights[phaseKey];

    if (!phaseInsight || !phaseInsight.ready) {
      box.hidden = true;
      return;
    }
    if (phaseInsight.top.length === 0) {
      box.hidden = true;
      return;
    }
    const top = phaseInsight.top[0];
    textEl.textContent = `You've logged ${top.label.toLowerCase()} in ${top.pct}% of your ${PHASE_META[phaseKey].label.toLowerCase()}-phase entries (avg severity ${top.avgSeverity}/3, from ${phaseInsight.loggedDays} logged days).`;
    box.hidden = false;
  }

  function withPhase(entry, ctx) {
    const d = fromISODate(entry.date);
    return { ...entry, phase: phaseForDate(d, ctx) };
  }

  function buildLabelLookup() {
    const map = {};
    PHYSICAL_SYMPTOMS.forEach((s) => (map[s.id] = s.label));
    PSYCH_SYMPTOMS.forEach((s) => (map[s.id] = s.label));
    state.settings.customSymptoms.physical.forEach((s) => (map[s.id] = s.label));
    state.settings.customSymptoms.psych.forEach((s) => (map[s.id] = s.label));
    return map;
  }

  document.querySelectorAll('.tip-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tip-tab').forEach((t) => { t.classList.remove('active'); t.setAttribute('aria-selected', 'false'); });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      document.getElementById('tip-body').hidden = tab.dataset.tab !== 'body';
      document.getElementById('tip-coping').hidden = tab.dataset.tab !== 'coping';
    });
  });

  document.getElementById('open-log-btn').addEventListener('click', () => openLog(storage_toISO(new Date())));

  // ---------------------------------------------------------------------
  // LOG view
  // ---------------------------------------------------------------------
  let draftEntry = null;

  function blankEntry(iso) {
    return {
      date: iso, isPeriodStart: false, isPeriodDay: false,
      mood: [], physicalSymptoms: {}, psychSymptoms: {}, medications: [], copingStrategies: [], notes: ''
    };
  }

  function openLog(iso) {
    currentLogDate = iso;
    draftEntry = state.entries[iso] ? JSON.parse(JSON.stringify(state.entries[iso])) : blankEntry(iso);
    document.getElementById('log-date').value = iso;
    document.getElementById('log-period-start').checked = !!draftEntry.isPeriodStart;
    document.getElementById('log-period-day').checked = !!draftEntry.isPeriodDay;
    document.getElementById('log-notes').value = draftEntry.notes || '';
    renderMoodChips();
    renderSymptomList('physical-symptom-list', getVisibleSymptoms(PHYSICAL_SYMPTOMS, 'physical', state.settings), 'physicalSymptoms');
    renderSymptomList('psych-symptom-list', getVisibleSymptoms(PSYCH_SYMPTOMS, 'psych', state.settings), 'psychSymptoms');
    renderCopingChips();
    renderMedChips();
    renderMedList();
    showView('log');
  }

  document.getElementById('log-back-btn').addEventListener('click', () => showView('today'));

  document.getElementById('log-date').addEventListener('change', (e) => {
    // Switching date mid-edit loads that day's existing entry (or a blank one).
    openLog(e.target.value);
  });
  document.getElementById('log-period-start').addEventListener('change', (e) => {
    draftEntry.isPeriodStart = e.target.checked;
    if (e.target.checked) {
      draftEntry.isPeriodDay = true;
      document.getElementById('log-period-day').checked = true;
    }
  });
  document.getElementById('log-period-day').addEventListener('change', (e) => { draftEntry.isPeriodDay = e.target.checked; });
  document.getElementById('log-notes').addEventListener('input', (e) => { draftEntry.notes = e.target.value; });

  function renderMoodChips() {
    const wrap = document.getElementById('mood-chips');
    wrap.innerHTML = '';
    MOOD_TAGS.forEach((tag) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip' + (draftEntry.mood.includes(tag) ? ' selected' : '');
      chip.textContent = tag;
      chip.addEventListener('click', () => {
        if (draftEntry.mood.includes(tag)) {
          draftEntry.mood = draftEntry.mood.filter((t) => t !== tag);
        } else {
          draftEntry.mood.push(tag);
        }
        renderMoodChips();
      });
      wrap.appendChild(chip);
    });
  }

  function renderSymptomList(containerId, list, field) {
    const wrap = document.getElementById(containerId);
    wrap.innerHTML = '';
    list.forEach((symptom) => {
      const row = document.createElement('div');
      row.className = 'symptom-row';
      const selected = draftEntry[field][symptom.id] !== undefined;

      const top = document.createElement('div');
      top.className = 'symptom-row-top';
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip' + (selected ? ' selected' : '');
      chip.textContent = symptom.label;
      chip.addEventListener('click', () => {
        if (draftEntry[field][symptom.id] !== undefined) {
          delete draftEntry[field][symptom.id];
        } else {
          draftEntry[field][symptom.id] = 2; // default to Moderate when first toggled on
        }
        renderSymptomList(containerId, list, field);
      });
      top.appendChild(chip);
      row.appendChild(top);

      if (selected) {
        const picker = document.createElement('div');
        picker.className = 'severity-picker';
        [1, 2, 3].forEach((level) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.textContent = SEVERITY_LABELS[level];
          b.className = draftEntry[field][symptom.id] === level ? 'selected' : '';
          b.addEventListener('click', () => {
            draftEntry[field][symptom.id] = level;
            renderSymptomList(containerId, list, field);
          });
          picker.appendChild(b);
        });
        row.appendChild(picker);
      }
      wrap.appendChild(row);
    });
  }

  function renderCopingChips() {
    const wrap = document.getElementById('coping-chips');
    wrap.innerHTML = '';
    state.settings.copingStrategies.forEach((c) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      const selected = draftEntry.copingStrategies.includes(c.id);
      chip.className = 'chip' + (c.evidence ? ' coping' : '') + (selected ? ' selected' : '');
      if (c.evidence) {
        const dot = document.createElement('span');
        dot.className = `evidence-dot ${c.evidence}`;
        chip.appendChild(dot);
      }
      chip.appendChild(document.createTextNode(c.label));
      chip.addEventListener('click', () => {
        if (draftEntry.copingStrategies.includes(c.id)) {
          draftEntry.copingStrategies = draftEntry.copingStrategies.filter((id) => id !== c.id);
        } else {
          draftEntry.copingStrategies.push(c.id);
        }
        renderCopingChips();
      });
      wrap.appendChild(chip);
    });
    if (state.settings.copingStrategies.length === 0) {
      const hint = document.createElement('p');
      hint.className = 'hint';
      hint.style.margin = '0';
      hint.textContent = 'No saved coping strategies yet — add some in Settings.';
      wrap.appendChild(hint);
    }
  }

  function renderMedChips() {
    const wrap = document.getElementById('med-chips');
    wrap.innerHTML = '';
    state.settings.medications.forEach((med) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.textContent = med.dose ? `${med.name} (${med.dose})` : med.name;
      chip.addEventListener('click', () => {
        draftEntry.medications.push({ name: med.name, dose: med.dose || '', time: new Date().toISOString() });
        renderMedList();
      });
      wrap.appendChild(chip);
    });
    if (state.settings.medications.length === 0) {
      const hint = document.createElement('p');
      hint.className = 'hint';
      hint.style.margin = '0';
      hint.textContent = 'No saved medications yet — add one in Settings, or use the field below just for today.';
      wrap.appendChild(hint);
    }
  }

  document.getElementById('med-add-btn').addEventListener('click', () => {
    const nameEl = document.getElementById('med-custom-name');
    const doseEl = document.getElementById('med-custom-dose');
    const name = nameEl.value.trim();
    if (!name) return;
    draftEntry.medications.push({ name, dose: doseEl.value.trim(), time: new Date().toISOString() });
    nameEl.value = '';
    doseEl.value = '';
    renderMedList();
  });

  function renderMedList() {
    const list = document.getElementById('med-list');
    list.innerHTML = '';
    draftEntry.medications.forEach((med, i) => {
      const li = document.createElement('li');
      const label = document.createElement('span');
      label.textContent = med.dose ? `${med.name} — ${med.dose}` : med.name;
      const removeBtn = document.createElement('button');
      removeBtn.textContent = 'Remove';
      removeBtn.addEventListener('click', () => {
        draftEntry.medications.splice(i, 1);
        renderMedList();
      });
      li.appendChild(label);
      li.appendChild(removeBtn);
      list.appendChild(li);
    });
  }

  document.getElementById('save-log-btn').addEventListener('click', () => {
    saveEntry(state, currentLogDate, draftEntry);
    showView('today');
  });

  // ---------------------------------------------------------------------
  // CALENDAR view
  // ---------------------------------------------------------------------
  let calCursor = new Date(); // any date within the displayed month

  function renderCalendar() {
    const ctx = getCycleContext();
    const year = calCursor.getFullYear();
    const month = calCursor.getMonth();
    document.getElementById('cal-month-label').textContent = calCursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

    const grid = document.getElementById('cal-grid');
    grid.innerHTML = '';

    const firstOfMonth = new Date(year, month, 1);
    const startWeekday = firstOfMonth.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const todayISO = storage_toISO(new Date());

    for (let i = 0; i < startWeekday; i++) {
      const filler = document.createElement('div');
      filler.className = 'cal-day empty';
      grid.appendChild(filler);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const iso = storage_toISO(date);
      const phase = phaseForDate(date, ctx);

      const cell = document.createElement('div');
      cell.className = 'cal-day';
      if (phase) cell.classList.add(`phase-${phase}`);
      if (iso === todayISO) cell.classList.add('today');
      if (state.entries[iso]) cell.classList.add('has-log');
      cell.textContent = String(day);
      cell.addEventListener('click', () => openLog(iso));
      grid.appendChild(cell);
    }
  }

  document.getElementById('cal-prev-btn').addEventListener('click', () => {
    calCursor = new Date(calCursor.getFullYear(), calCursor.getMonth() - 1, 1);
    renderCalendar();
  });
  document.getElementById('cal-next-btn').addEventListener('click', () => {
    calCursor = new Date(calCursor.getFullYear(), calCursor.getMonth() + 1, 1);
    renderCalendar();
  });

  // ---------------------------------------------------------------------
  // INSIGHTS view
  // ---------------------------------------------------------------------
  function renderInsights() {
    const ctx = getCycleContext();
    const entries = Object.values(state.entries).map((e) => withPhase(e, ctx));
    const labelLookup = buildLabelLookup();
    const insights = computeSymptomInsights(entries, labelLookup);

    renderOutlook(ctx, insights);

    const container = document.getElementById('insights-content');
    container.innerHTML = '';

    ['menstrual', 'follicular', 'ovulatory', 'luteal'].forEach((phase) => {
      const data = insights[phase];
      const card = document.createElement('div');
      card.className = 'card insight-phase-card';
      const dotColor = PHASE_META[phase].color;
      let inner = `<h3><i class="dot" style="background:var(${dotColor})"></i>${PHASE_META[phase].label}</h3>`;

      if (!data || !data.ready) {
        const have = data ? data.loggedDays : 0;
        const need = data ? data.needed : 3;
        inner += `<p class="insight-empty">${have}/${need} logged days in this phase — a pattern will show up here once there's enough of your own data.</p>`;
      } else if (data.top.length === 0) {
        inner += `<p class="insight-empty">No symptom logged in \u226540% of your ${data.loggedDays} logged ${PHASE_META[phase].label.toLowerCase()}-phase days.</p>`;
      } else {
        inner += data.top
          .map((row) => `<div class="insight-row"><span>${row.label}</span><span class="insight-pct">${row.pct}% · avg ${row.avgSeverity}/3</span></div>`)
          .join('');
      }
      card.innerHTML = inner;
      container.appendChild(card);
    });
  }

  function renderOutlook(ctx, insights) {
    const section = document.getElementById('outlook-section');
    const content = document.getElementById('outlook-content');
    const outlook = buildThreeDayOutlook(ctx, insights);

    if (!outlook) {
      section.hidden = false;
      content.innerHTML = '<p class="insight-empty">Log your first period to see a projected outlook for the next 3 days.</p>';
      return;
    }
    section.hidden = false;

    const row = document.createElement('div');
    row.className = 'outlook-row';

    outlook.forEach((day) => {
      const card = document.createElement('div');
      card.className = 'outlook-day';
      const label = day.date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
      let inner = `<p class="outlook-day-label">${label}</p>`;
      inner += `<span class="outlook-phase-pill" style="background:${PHASE_META[day.phase].color}30; color:${PHASE_META[day.phase].color}">${PHASE_META[day.phase].label}</span>`;

      if (day.periodLikelyStarts) {
        inner += `<p class="outlook-period-flag">Period may start</p>`;
      }

      if (!day.insight || !day.insight.ready) {
        const have = day.insight ? day.insight.loggedDays : 0;
        inner += `<p class="outlook-empty">Not enough logged ${PHASE_META[day.phase].label.toLowerCase()}-phase history yet (${have}/3 days).</p>`;
      } else if (day.insight.top.length === 0) {
        inner += `<p class="outlook-empty">No symptom has shown up consistently in this phase for you yet.</p>`;
      } else {
        inner += day.insight.top
          .slice(0, 2)
          .map((s) => `<p class="outlook-symptom">${s.label}<br><span style="color:var(--bone-dim)">${s.pct}% of days · avg ${s.avgSeverity}/3</span></p>`)
          .join('');
      }

      if (day.uncertain) {
        inner += `<p class="outlook-uncertain">Near a phase transition \u2014 your cycle varies by \u00b1${ctx.stats.cycleVariability}d, so this could shift.</p>`;
      }

      card.innerHTML = inner;
      row.appendChild(card);
    });

    content.innerHTML = '';
    content.appendChild(row);
  }

  // ---------------------------------------------------------------------
  // SETTINGS view
  // ---------------------------------------------------------------------
  function renderSettings() {
    document.getElementById('set-luteal').value = state.settings.lutealLength;
    document.getElementById('set-lookback').value = state.settings.lookbackCycles;
    renderSymptomToggles('set-physical-toggles', PHYSICAL_SYMPTOMS, 'physical');
    renderSymptomToggles('set-psych-toggles', PSYCH_SYMPTOMS, 'psych');
    renderMedicationList('set-med-list');
    renderCopingList('set-coping-list');
  }

  document.getElementById('set-luteal').addEventListener('change', (e) => {
    const v = Math.min(17, Math.max(10, Number(e.target.value) || 14));
    state.settings.lutealLength = v;
    saveState(state);
  });
  document.getElementById('set-lookback').addEventListener('change', (e) => {
    const v = Math.min(6, Math.max(3, Number(e.target.value) || 6));
    state.settings.lookbackCycles = v;
    saveState(state);
  });

  document.getElementById('replay-onboard-btn').addEventListener('click', () => {
    startOnboarding();
  });

  document.getElementById('hist-add-btn').addEventListener('click', () => {
    const dateEl = document.getElementById('hist-date');
    const lengthEl = document.getElementById('hist-length');
    const statusEl = document.getElementById('hist-status');
    if (!dateEl.value) {
      statusEl.textContent = 'Pick a date first.';
      return;
    }
    const length = Math.min(14, Math.max(1, Number(lengthEl.value) || 5));
    bulkLogPeriod(state, dateEl.value, length);
    statusEl.textContent = `Logged a ${length}-day period starting ${dateEl.value}.`;
    dateEl.value = '';
  });

  function renderSymptomToggles(containerId, builtIns, category) {
    const wrap = document.getElementById(containerId);
    wrap.innerHTML = '';
    const hidden = new Set(state.settings.hiddenSymptomIds);

    builtIns.forEach((s) => {
      const row = document.createElement('label');
      row.className = 'symptom-toggle-row';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = !hidden.has(s.id);
      checkbox.addEventListener('change', (e) => {
        setSymptomHidden(state, s.id, !e.target.checked);
      });
      const span = document.createElement('span');
      span.textContent = s.label;
      row.appendChild(span);
      row.appendChild(checkbox);
      wrap.appendChild(row);
    });

    state.settings.customSymptoms[category].forEach((s) => {
      const row = document.createElement('div');
      row.className = 'symptom-toggle-row';
      const removeBtn = document.createElement('button');
      removeBtn.className = 'remove-custom';
      removeBtn.textContent = 'Remove';
      removeBtn.addEventListener('click', () => {
        removeCustomSymptom(state, category, s.id);
        renderSymptomToggles(containerId, builtIns, category);
      });
      row.innerHTML = `<span>${s.label}<span class="custom-tag">custom</span></span>`;
      row.appendChild(removeBtn);
      wrap.appendChild(row);
    });
  }

  document.getElementById('new-symptom-add-btn').addEventListener('click', () => {
    const nameEl = document.getElementById('new-symptom-name');
    const categoryEl = document.getElementById('new-symptom-category');
    if (!nameEl.value.trim()) return;
    addCustomSymptom(state, categoryEl.value, nameEl.value);
    nameEl.value = '';
    refreshSymptomToggleUI();
  });

  function refreshSymptomToggleUI() {
    renderSymptomToggles('set-physical-toggles', PHYSICAL_SYMPTOMS, 'physical');
    renderSymptomToggles('set-psych-toggles', PSYCH_SYMPTOMS, 'psych');
    renderSymptomToggles('ob-physical-toggles', PHYSICAL_SYMPTOMS, 'physical');
    renderSymptomToggles('ob-psych-toggles', PSYCH_SYMPTOMS, 'psych');
  }

  document.getElementById('ob-new-symptom-add-btn').addEventListener('click', () => {
    const nameEl = document.getElementById('ob-new-symptom-name');
    const categoryEl = document.getElementById('ob-new-symptom-category');
    if (!nameEl.value.trim()) return;
    addCustomSymptom(state, categoryEl.value, nameEl.value);
    nameEl.value = '';
    refreshSymptomToggleUI();
  });

  function renderMedicationList(listId) {
    const list = document.getElementById(listId);
    list.innerHTML = '';
    state.settings.medications.forEach((med) => {
      const li = document.createElement('li');
      const label = document.createElement('span');
      label.textContent = med.dose ? `${med.name} — ${med.dose}` : med.name;
      const removeBtn = document.createElement('button');
      removeBtn.textContent = 'Remove';
      removeBtn.addEventListener('click', () => {
        removeMedication(state, med.id);
        refreshMedicationUI();
      });
      li.appendChild(label);
      li.appendChild(removeBtn);
      list.appendChild(li);
    });
    if (state.settings.medications.length === 0) {
      const li = document.createElement('li');
      li.innerHTML = '<span class="hint" style="padding:8px 0">No medications saved yet.</span>';
      list.appendChild(li);
    }
  }

  function refreshMedicationUI() {
    renderMedicationList('set-med-list');
    renderMedicationList('ob-med-list');
  }

  document.getElementById('new-med-add-btn').addEventListener('click', () => {
    const nameEl = document.getElementById('new-med-name');
    const doseEl = document.getElementById('new-med-dose');
    if (!nameEl.value.trim()) return;
    addMedication(state, nameEl.value, doseEl.value);
    nameEl.value = '';
    doseEl.value = '';
    refreshMedicationUI();
  });

  document.getElementById('ob-new-med-add-btn').addEventListener('click', () => {
    const nameEl = document.getElementById('ob-new-med-name');
    const doseEl = document.getElementById('ob-new-med-dose');
    if (!nameEl.value.trim()) return;
    addMedication(state, nameEl.value, doseEl.value);
    nameEl.value = '';
    doseEl.value = '';
    refreshMedicationUI();
  });

  function renderCopingList(listId) {
    const list = document.getElementById(listId);
    list.innerHTML = '';
    state.settings.copingStrategies.forEach((c) => {
      const li = document.createElement('li');
      const label = document.createElement('span');
      if (c.evidence) {
        label.innerHTML = `<span class="evidence-dot ${c.evidence}"></span>${c.label}`;
      } else {
        label.innerHTML = `${c.label}<span class="custom-tag">custom</span>`;
      }
      const removeBtn = document.createElement('button');
      removeBtn.textContent = 'Remove';
      removeBtn.addEventListener('click', () => {
        removeCopingStrategy(state, c.id);
        refreshCopingUI();
      });
      li.appendChild(label);
      li.appendChild(removeBtn);
      list.appendChild(li);
    });
    if (state.settings.copingStrategies.length === 0) {
      const li = document.createElement('li');
      li.innerHTML = '<span class="hint" style="padding:8px 0">No coping strategies saved yet.</span>';
      list.appendChild(li);
    }
  }

  function refreshCopingUI() {
    renderCopingList('set-coping-list');
    renderCopingList('ob-coping-list');
  }

  document.getElementById('new-coping-add-btn').addEventListener('click', () => {
    const nameEl = document.getElementById('new-coping-name');
    if (!nameEl.value.trim()) return;
    addCopingStrategy(state, nameEl.value);
    nameEl.value = '';
    refreshCopingUI();
  });

  document.getElementById('ob-new-coping-add-btn').addEventListener('click', () => {
    const nameEl = document.getElementById('ob-new-coping-name');
    if (!nameEl.value.trim()) return;
    addCopingStrategy(state, nameEl.value);
    nameEl.value = '';
    refreshCopingUI();
  });

  document.getElementById('export-btn').addEventListener('click', () => {
    const blob = new Blob([exportJSON(state)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cycle-tracker-backup-${storage_toISO(new Date())}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById('import-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = importJSON(reader.result);
        Object.assign(state, imported);
        document.getElementById('import-status').textContent = 'Backup imported.';
        renderSettings();
      } catch (err) {
        document.getElementById('import-status').textContent = `Import failed: ${err.message}`;
      }
    };
    reader.readAsText(file);
  });

  document.getElementById('clear-btn').addEventListener('click', () => {
    if (!confirm('This deletes all logged entries from this device. This can\u2019t be undone unless you have an exported backup. Continue?')) return;
    const fresh = defaultState();
    Object.keys(state).forEach((k) => delete state[k]);
    Object.assign(state, fresh);
    saveState(state);
    showView('today');
  });

  // ---------------------------------------------------------------------
  // ONBOARDING
  // ---------------------------------------------------------------------
  let onboardData = { lastStart: '', periodLength: 5, cycleLength: 28, pastPeriods: [] };

  function startOnboarding() {
    onboardData = { lastStart: '', periodLength: 5, cycleLength: 28, pastPeriods: [] };
    document.getElementById('onboard-period-length').value = 5;
    document.getElementById('onboard-cycle-length').value = 28;
    document.getElementById('onboard-last-start').value = '';
    document.getElementById('onboard-past-list').innerHTML = '';
    document.getElementById('onboard-past-add').hidden = true;
    showView('onboarding');
    goToOnboardStep('welcome');
  }

  function goToOnboardStep(step) {
    ['welcome', 'choice', 'form', 'customize', 'summary'].forEach((s) => {
      document.getElementById(`onboard-${s}`).hidden = s !== step;
    });
    document.querySelectorAll('.dot-step').forEach((dot) => {
      dot.classList.toggle('active', dot.dataset.step === step);
    });
    if (step === 'customize') {
      renderSymptomToggles('ob-physical-toggles', PHYSICAL_SYMPTOMS, 'physical');
      renderSymptomToggles('ob-psych-toggles', PSYCH_SYMPTOMS, 'psych');
      renderMedicationList('ob-med-list');
      renderCopingList('ob-coping-list');
    }
    if (step === 'summary') renderOnboardSummary();
  }

  function renderOnboardSummary() {
    const el = document.getElementById('onboard-summary-text');
    const trackedCounts = `${state.settings.medications.length} medication${state.settings.medications.length === 1 ? '' : 's'} and ${state.settings.copingStrategies.length} coping strateg${state.settings.copingStrategies.length === 1 ? 'y' : 'ies'}`;

    if (!onboardData.lastStart) {
      el.textContent = `Using a standard 28-day cycle estimate until you log your first period — it'll switch to your own data automatically. Ready with ${trackedCounts} set up.`;
      return;
    }

    // Confidence is driven by the number of GAPS between period starts, not
    // the count of starts itself — matches estimateCycleStats exactly, so
    // this summary never claims more precision than the math will actually give.
    const gaps = onboardData.pastPeriods.length;
    let text = `Setting your typical cycle to ${onboardData.cycleLength} days, period length ${onboardData.periodLength} days, `;
    text += `with your last period logged starting ${onboardData.lastStart}`;
    if (gaps === 0) {
      text += `. With just one period logged, there's no gap yet to calculate from — your ring will use the ${onboardData.cycleLength}/${onboardData.periodLength}-day figures above until a second period gives it a real cycle length to work with.`;
    } else if (gaps < 3) {
      text += ` plus ${gaps} earlier period${gaps > 1 ? 's' : ''} you added \u2014 that's enough for a low-confidence estimate already (${gaps} logged gap${gaps > 1 ? 's' : ''}). Add ${3 - gaps} more for a high-confidence average.`;
    } else {
      text += ` plus ${gaps} earlier periods you added \u2014 that's ${gaps} logged cycle gaps, enough to start at high confidence right away.`;
    }
    text += ` Ready with ${trackedCounts} set up.`;
    el.textContent = text;
  }

  document.getElementById('onboard-start-btn').addEventListener('click', () => goToOnboardStep('choice'));
  document.getElementById('onboard-know-btn').addEventListener('click', () => goToOnboardStep('form'));
  document.getElementById('onboard-back-btn').addEventListener('click', () => goToOnboardStep('customize'));

  document.getElementById('onboard-skip-btn').addEventListener('click', () => {
    goToOnboardStep('customize');
  });

  document.getElementById('onboard-customize-continue-btn').addEventListener('click', () => {
    goToOnboardStep('summary');
  });

  document.getElementById('onboard-customize-back-btn').addEventListener('click', () => {
    goToOnboardStep(onboardData.lastStart ? 'form' : 'choice');
  });

  document.getElementById('onboard-past-add-btn').addEventListener('click', () => {
    document.getElementById('onboard-past-add').hidden = false;
  });

  document.getElementById('onboard-past-confirm-btn').addEventListener('click', () => {
    const dateEl = document.getElementById('onboard-past-date');
    const lengthEl = document.getElementById('onboard-past-length');
    if (!dateEl.value) return;
    onboardData.pastPeriods.push({ start: dateEl.value, length: Math.min(14, Math.max(1, Number(lengthEl.value) || 5)) });
    renderOnboardPastList();
    dateEl.value = '';
    document.getElementById('onboard-past-add').hidden = true;
  });

  function renderOnboardPastList() {
    const list = document.getElementById('onboard-past-list');
    list.innerHTML = '';
    onboardData.pastPeriods.forEach((p, i) => {
      const li = document.createElement('li');
      const span = document.createElement('span');
      span.textContent = `${p.start} · ${p.length} day${p.length > 1 ? 's' : ''}`;
      const removeBtn = document.createElement('button');
      removeBtn.textContent = 'Remove';
      removeBtn.addEventListener('click', () => {
        onboardData.pastPeriods.splice(i, 1);
        renderOnboardPastList();
      });
      li.appendChild(span);
      li.appendChild(removeBtn);
      list.appendChild(li);
    });
  }

  document.getElementById('onboard-form-continue-btn').addEventListener('click', () => {
    const lastStart = document.getElementById('onboard-last-start').value;
    if (!lastStart) {
      alert('Enter when your last period started, or use Skip on the previous step if you\u2019d rather not.');
      return;
    }
    onboardData.lastStart = lastStart;
    onboardData.periodLength = Math.min(14, Math.max(1, Number(document.getElementById('onboard-period-length').value) || 5));
    onboardData.cycleLength = Math.min(60, Math.max(15, Number(document.getElementById('onboard-cycle-length').value) || 28));
    goToOnboardStep('customize');
  });

  document.getElementById('onboard-finish-btn').addEventListener('click', () => {
    state.settings.defaultCycleLength = onboardData.cycleLength;
    state.settings.defaultPeriodLength = onboardData.periodLength;
    if (onboardData.lastStart) {
      onboardData.pastPeriods.forEach((p) => bulkLogPeriod(state, p.start, p.length));
      bulkLogPeriod(state, onboardData.lastStart, onboardData.periodLength);
    }
    state.settings.onboarded = true;
    saveState(state);
    showView('today');
  });

  // ---------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------
  document.getElementById('log-date').value = storage_toISO(new Date());
  if (!state.settings.onboarded) {
    startOnboarding();
  } else {
    showView('today');
  }

  // Register service worker for offline/installable support.
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('service-worker.js').catch((err) => console.warn('SW registration failed', err));
    });
  }
})();
