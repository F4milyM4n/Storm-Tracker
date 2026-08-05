/**
 * content.js
 * Symptom presets and phase-tip copy.
 *
 * Evidence labeling: every coping tip is tagged 'research' or 'anecdotal'.
 * 'research' = has controlled-trial or clinical-guideline support.
 * 'anecdotal' = widely self-reported by cycle-trackers/health communities,
 * but with limited or mixed formal trial evidence. Both are shown — the
 * point isn't to only trust journals, it's to be honest about which kind
 * of evidence each tip rests on so you can weigh it yourself.
 */

const MOOD_TAGS = [
  'Happy', 'Calm', 'Energetic', 'Confident', 'Focused',
  'Sad', 'Irritable', 'Anxious', 'Stressed', 'Sensitive / tearful', 'Low motivation'
];

const PHYSICAL_SYMPTOMS = [
  { id: 'cramps', label: 'Cramps' },
  { id: 'headache', label: 'Headache / migraine' },
  { id: 'bloating', label: 'Bloating' },
  { id: 'breast_tenderness', label: 'Breast tenderness' },
  { id: 'fatigue', label: 'Fatigue' },
  { id: 'back_pain', label: 'Back pain' },
  { id: 'acne', label: 'Acne / skin changes' },
  { id: 'nausea', label: 'Nausea' },
  { id: 'joint_aches', label: 'Joint / muscle aches' },
  { id: 'digestive', label: 'Digestive changes' },
  { id: 'sleep_disruption', label: 'Sleep disruption' },
  { id: 'food_cravings', label: 'Food cravings' }
];

const PSYCH_SYMPTOMS = [
  { id: 'anxiety', label: 'Anxiety' },
  { id: 'irritability', label: 'Irritability' },
  { id: 'mood_swings', label: 'Mood swings' },
  { id: 'low_mood', label: 'Low mood / sadness' },
  { id: 'brain_fog', label: 'Brain fog / concentration' },
  { id: 'low_motivation', label: 'Low motivation' },
  { id: 'overwhelm', label: 'Overwhelm' },
  { id: 'social_withdrawal', label: 'Social withdrawal' },
  { id: 'libido_low', label: 'Low libido' },
  { id: 'libido_high', label: 'High libido' }
];

const SEVERITY_LABELS = { 1: 'Mild', 2: 'Moderate', 3: 'Severe' };

/**
 * Preset coping strategies for the daily log's "taken today" checklist —
 * distinct from PHASE_TIPS.coping below, which is *advice text* shown on
 * the Today card. This list is what actually gets logged as done.
 *
 * Evidence tags use the same standard as PHASE_TIPS:
 * 'research' = controlled-trial or clinical-guideline support specifically
 * for cycle-related symptoms (dysmenorrhea, PMS/PMDD).
 * 'anecdotal' = plausible and widely self-reported, but the trial evidence
 * specific to cycle symptoms is thin, mixed, or nonexistent — even where
 * the practice has good evidence for *other* things (e.g. resistance
 * training has strong general-health evidence, but not much cycle-specific
 * trial data, so it's tagged anecdotal here, not because it's unhelpful,
 * but because the two evidence bases shouldn't be conflated).
 */
const COPING_STRATEGIES = [
  { id: 'cardio', label: 'Cardio / aerobic exercise', evidence: 'research' },
  { id: 'walking', label: 'Walking', evidence: 'research' },
  { id: 'yoga', label: 'Yoga', evidence: 'research' },
  { id: 'strength_training', label: 'Strength training', evidence: 'anecdotal' },
  { id: 'meditation', label: 'Meditation / mindfulness', evidence: 'research' },
  { id: 'breathing', label: 'Deep breathing', evidence: 'anecdotal' },
  { id: 'heat', label: 'Heat therapy', evidence: 'research' },
  { id: 'stretching', label: 'Stretching', evidence: 'anecdotal' },
  { id: 'rest', label: 'Extra sleep / rest', evidence: 'anecdotal' },
  { id: 'massage', label: 'Massage', evidence: 'anecdotal' }
];

const PHASE_META = {
  menstrual: { label: 'Menstrual', color: '--rust' },
  follicular: { label: 'Follicular', color: '--sage' },
  ovulatory: { label: 'Ovulatory', color: '--gold' },
  luteal: { label: 'Luteal', color: '--plum' }
};

const PHASE_TIPS = {
  menstrual: {
    physiology:
      'Estrogen and progesterone are both at their lowest point in the cycle. The uterine lining releases prostaglandins to trigger the contractions that shed it — that\u2019s the direct cause of cramping. Blood loss can also draw down iron, which contributes to fatigue for some.',
    commonSymptoms: ['cramps', 'fatigue', 'back_pain', 'headache', 'low_mood'],
    coping: [
      { text: 'NSAIDs (ibuprofen, naproxen) block prostaglandin production directly and are first-line for cramp relief.', evidence: 'research' },
      { text: 'A heating pad on the lower abdomen performs comparably to OTC pain relievers for period pain in trials.', evidence: 'research' },
      { text: 'Light aerobic movement (walking, gentle yoga) is linked to reduced cramp severity in several studies.', evidence: 'research' },
      { text: 'Ginger and cinnamon tea, and cutting back caffeine/salt to ease bloating, are widely reported as helpful, though trial evidence is limited.', evidence: 'anecdotal' }
    ]
  },
  follicular: {
    physiology:
      'Follicle-stimulating hormone prompts ovarian follicles to mature, and estrogen climbs steadily through this phase. Rising estrogen is generally associated with improving energy, mood, and pain tolerance as the phase goes on.',
    commonSymptoms: ['acne'],
    coping: [
      { text: 'Many people report this window as their highest-capacity stretch for demanding workouts or focus-heavy tasks — worth testing against your own logged energy levels rather than assuming it applies to you.', evidence: 'anecdotal' },
      { text: 'Rising estrogen here is consistently linked to improved insulin sensitivity, which is one reason harder training sessions often feel more recoverable in this window.', evidence: 'research' }
    ]
  },
  ovulatory: {
    physiology:
      'A surge in luteinizing hormone (LH) triggers the release of an egg, roughly mid-cycle. Estrogen peaks just before ovulation and then drops sharply right after. Some people notice a one-sided pelvic twinge (\u201cmittelschmerz\u201d) around this point.',
    commonSymptoms: ['libido_high'],
    coping: [
      { text: 'A brief rise in basal body temperature after ovulation is well documented and is the basis of temperature-based fertility tracking.', evidence: 'research' },
      { text: 'If pelvic pain here is severe, one-sided, and worsening rather than brief, that pattern is worth a clinical check rather than assuming it\u2019s ovulation pain — the timing can look similar to other causes.', evidence: 'research' },
      { text: 'Many trackers report a temporary rise in libido and social energy around ovulation.', evidence: 'anecdotal' }
    ]
  },
  luteal: {
    physiology:
      'Progesterone rises after ovulation as the corpus luteum forms, then — if there\u2019s no pregnancy — both progesterone and estrogen fall sharply in the final days before your period. That hormonal withdrawal, not a single hormone level in isolation, is the leading biological driver of PMS-type symptoms.',
    commonSymptoms: ['mood_swings', 'irritability', 'anxiety', 'bloating', 'breast_tenderness', 'food_cravings', 'sleep_disruption'],
    coping: [
      { text: 'Regular aerobic exercise has randomized-trial support for reducing PMS symptom severity.', evidence: 'research' },
      { text: 'Calcium and vitamin D intake has trial support for easing PMS symptoms in some studies.', evidence: 'research' },
      { text: 'For PMDD-level symptoms (severe enough to disrupt daily functioning), CBT and luteal-phase-dosed SSRIs are evidence-based clinical options — worth raising with a clinician rather than self-managing if symptoms hit that level.', evidence: 'research' },
      { text: 'Cutting caffeine, alcohol, and salt in the late luteal window is commonly reported to ease bloating and irritability, though controlled evidence is mixed.', evidence: 'anecdotal' },
      { text: 'Magnesium and vitamin B6 supplementation are frequently self-reported as helpful for mood and bloating.', evidence: 'anecdotal' }
    ],
    note:
      'Reminder: the follicular phase, strictly defined, actually starts on day 1 (it overlaps with menstruation) — this app shows menstrual and follicular as separate phases for clarity, the way most cycle-tracking apps do, but that\u2019s a display simplification, not the textbook definition.'
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    MOOD_TAGS, PHYSICAL_SYMPTOMS, PSYCH_SYMPTOMS, SEVERITY_LABELS,
    PHASE_META, PHASE_TIPS, COPING_STRATEGIES
  };
}
