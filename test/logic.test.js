import test from 'node:test';
import assert from 'node:assert/strict';
import {
  suggest37, exerciseTrend, reviewDelta, LADDER,
  suggest, suggestFor, e1rm, weeklySets, nextRoutineKey, newWorkout, compare, lastEntry, asymmetry, sideOrder, slotExercise,
} from '../js/logic.js';

const set = (weight, reps, done = true, side) => ({ ...(side ? { side } : {}), weight, reps, done });
const barbell = { increment: 2.5 };

test('sin historial pide elegir peso', () => {
  const s = suggest([], [6, 10], barbell);
  assert.equal(s.weight, null);
  assert.equal(s.reps, 6);
});

test('sube peso cuando todas las series llegan al tope', () => {
  const s = suggest([set(60, 10), set(60, 10), set(60, 11)], [6, 10], barbell);
  assert.deepEqual([s.weight, s.reps], [62.5, 6]);
});

test('mantiene peso y pide +1 rep si alguna serie se quedó corta', () => {
  const s = suggest([set(60, 10), set(60, 9), set(60, 8)], [6, 10], barbell);
  assert.deepEqual([s.weight, s.reps], [60, 9]);
});

test('ignora series no completadas', () => {
  const s = suggest([set(60, 10), set(80, 3, false)], [6, 10], barbell);
  assert.equal(s.weight, 62.5);
});

test('asistidos: progresar es bajar la asistencia', () => {
  const ex = { increment: 5, assisted: true };
  assert.equal(suggest([set(30, 10), set(30, 10)], [6, 10], ex).weight, 25);
  assert.equal(suggest([set(30, 10), set(35, 10)], [6, 10], ex).weight, 25); // manda la menor ayuda
  assert.equal(suggest([set(3, 10)], [6, 10], ex).weight, 0);
});

test('recuperación: medio salto en piernas, dolor alto baja carga, dolor 3 mantiene', () => {
  const leg = { increment: 5, leg: true };
  const sets = [set(40, 15), set(40, 15)];
  assert.equal(suggest(sets, [10, 15], leg, { recovery: true, pain: 1 }).weight, 42.5);
  assert.equal(suggest(sets, [10, 15], leg, { recovery: true, pain: 3 }).weight, 40);
  assert.equal(suggest(sets, [10, 15], leg, { recovery: true, pain: 5 }).weight, 36);
  assert.equal(suggest(sets, [10, 15], leg, { recovery: false, pain: 5 }).weight, 45);
  assert.equal(suggest(sets, [10, 15], { increment: 5 }, { recovery: true, pain: 5 }).weight, 45); // no es pierna
});

test('e1rm Epley', () => {
  assert.equal(e1rm(100, 10), 133.33);
  assert.equal(e1rm(0, 10), 0);
});

test('series semanales: principal 1, secundario 0.5, unilateral cuenta par como 1, fuera de semana no cuenta', () => {
  const now = new Date('2026-09-30T12:00:00'); // miércoles
  const workouts = [
    { date: '2026-09-28T18:00:00', routine: 'A', entries: [
      { exercise: 'inclineDbPress', sets: [set(20, 8), set(20, 8), set(20, 7)] },
      { exercise: 'squat', sets: [set(80, 8), set(80, 8, false)] },
      { exercise: 'seatedLegCurl', sets: [set(30, 12, true, 'L'), set(30, 12, true, 'R'), set(30, 11, true, 'L'), set(30, 11, true, 'R')] },
    ] },
    { date: '2026-09-25T18:00:00', routine: 'B', entries: [{ exercise: 'benchPress', sets: [set(60, 8)] }] },
  ];
  const v = weeklySets(workouts, now);
  assert.equal(v.chest, 3);
  assert.equal(v.triceps, 1.5);
  assert.equal(v.quads, 1);
  assert.equal(v.hamstrings, 2.5);
});

test('alterna rutinas A/B', () => {
  assert.equal(nextRoutineKey([]), 'A');
  assert.equal(nextRoutineKey([{ routine: 'A' }]), 'B');
  assert.equal(nextRoutineKey([{ routine: 'B' }]), 'A');
});

test('sustituciones: solo valen si son alternativas del slot', () => {
  const slot = { id: 'A1', exercise: 'hsLegPress' };
  assert.equal(slotExercise(slot, { A1: 'legPress' }), 'legPress');
  assert.equal(slotExercise(slot, { A1: 'machineCurl' }), 'hsLegPress');
});

test('nuevo entreno: unilateral alterna lados empezando por la lesionada y precarga peso', () => {
  const history = [{ date: '2026-09-20', routine: 'A', entries: [{ exercise: 'hsLegPress', pain: 1, sets: [
    set(40, 15, true, 'R'), set(40, 15, true, 'L'), set(40, 15, true, 'R'), set(40, 15, true, 'L'),
  ] }] }];
  const w = newWorkout('A', history, {}, { injuredSide: 'R', recovery: true });
  const e = w.entries.find((x) => x.exercise === 'hsLegPress');
  assert.equal(e.sets.length, 6);
  assert.deepEqual(e.sets.map((s) => s.side), ['R', 'L', 'R', 'L', 'R', 'L']);
  assert.equal(e.sets[0].weight, 42.5);
  assert.equal(e.pain, null);
  assert.equal('pain' in w.entries.find((x) => x.exercise === 'hsInclinePress'), false); // no es pierna
});

test('sugerencia unilateral usa solo la pierna lesionada', () => {
  const history = [{ date: '2026-09-20', routine: 'A', entries: [{ exercise: 'seatedLegCurl', sets: [
    set(20, 12, true, 'L'), set(30, 15, true, 'R'),
  ] }] }];
  const s = suggestFor(history, 'seatedLegCurl', [10, 15], { injuredSide: 'L', recovery: true });
  assert.deepEqual([s.weight, s.reps], [20, 13]);
});

test('asimetría entre piernas', () => {
  assert.equal(asymmetry([set(40, 10, true, 'L')]), null);
  const a = asymmetry([set(40, 10, true, 'L'), set(40, 15, true, 'R')]);
  assert.equal(a.weaker, 'L');
  assert.ok(a.pct >= 10);
  assert.deepEqual(sideOrder(null), ['L', 'R']);
});

test('compare: Me vs Me contra la última vez', () => {
  const prev = [{ date: '2026-09-20', routine: 'A', entries: [{ exercise: 'squat', sets: [set(80, 8)] }] }];
  const cur = { entries: [{ exercise: 'squat', sets: [set(80, 9)] }, { exercise: 'calfRaise', sets: [set(50, 12)] }] };
  const [sq, calf] = compare(cur, prev);
  assert.ok(sq.diff > 0);
  assert.equal(calf.before, null);
  assert.equal(lastEntry(prev, 'squat').sets[0].reps, 8);
});

test('compare en asistidos: menos ayuda cuenta como mejora', () => {
  const prev = [{ date: '2026-09-20', routine: 'A', entries: [{ exercise: 'assistedChin', sets: [set(30, 8)] }] }];
  const cur = { entries: [{ exercise: 'assistedChin', sets: [set(25, 8)] }] };
  assert.ok(compare(cur, prev, 80)[0].diff > 0);
});

test('formatSets compacta series iguales y separa lados', async () => {
  const { formatSets } = await import('../js/logic.js');
  assert.equal(formatSets([set(40, 10), set(40, 10), set(40, 9)]), '40×10, 40×10, 40×9');
  assert.equal(formatSets([set(40, 10), set(40, 10)]), '40×10 ×2');
  assert.equal(formatSets([set(40, 15, true, 'R'), set(40, 15, true, 'L'), set(40, 15, true, 'R'), set(40, 12, true, 'L'), set(9, 9, false, 'L')]),
    'Der 40×15 ×2 · Izq 40×15, 40×12');
});

test('mergeStates une una sesión partida entre dos móviles', async () => {
  const { mergeStates } = await import('../js/logic.js');
  // Móvil 1: se apagó a mitad de la rutina A (entreno sin terminar).
  const phone1 = {
    settings: { daysPerWeek: 2 },
    workouts: [{ id: 'old', routine: 'B', date: '2026-10-06T15:00:00Z', entries: [{ slot: 'B1', exercise: 'hackSquat', sets: [set(40, 12)] }] }],
    current: { id: 'p1', routine: 'A', date: '2026-10-09T15:00:00Z', entries: [
      { slot: 'A1', exercise: 'hsLegPress', pain: 2, sets: [set(30, 14, true, 'L'), set(30, 14, true, 'R')] },
      { slot: 'A2', exercise: 'hsInclinePress', sets: [set(85, 8), set(85, 8), set(85, 7)] },
      { slot: 'A3', exercise: 'assistedChin', sets: [set(40, 8), set(40, '', false)] },
    ] },
  };
  // Móvil 2: siguió la misma rutina y la terminó.
  const phone2 = {
    settings: { daysPerWeek: 3 },
    workouts: [
      { id: 'old', routine: 'B', date: '2026-10-06T15:00:00Z', entries: [{ slot: 'B1', exercise: 'hackSquat', sets: [set(40, 12)] }] },
      { id: 'p2', routine: 'A', date: '2026-10-09T15:40:00Z', entries: [
        { slot: 'A3', exercise: 'assistedChin', sets: [set(40, 9), set(40, 8), set(40, 8)] },
        { slot: 'A4', exercise: 'seatedLegCurl', pain: 1, sets: [set(15, 15, true, 'L'), set(15, 15, true, 'R')] },
      ] },
    ],
    current: null,
  };
  const m = mergeStates(phone1, phone2);
  assert.equal(m.workouts.length, 2); // el B repetido no se duplica
  const a = m.workouts[1];
  assert.equal(a.routine, 'A');
  assert.equal(a.date, '2026-10-09T15:00:00Z'); // hora de inicio real
  assert.deepEqual(a.entries.map((e) => e.slot), ['A1', 'A2', 'A3', 'A4']);
  assert.equal(a.entries[2].sets.length, 3); // dominadas: gana la versión con más series hechas
  assert.ok(a.entries.every((e) => e.sets.every((s) => s.done)));
  assert.equal(m.current, null);
  assert.equal(m.settings.daysPerWeek, 2); // el perfil es el del móvil que importa
});

test('3/7: dos bloques de 3-4-5-6-7, sube peso solo si completa los dos', async () => {
  const { newWorkout: nw } = await import('../js/logic.js');
  const w = nw('B', [], {}, {});
  const fly = w.entries.find((e) => e.exercise === 'pecFly');
  assert.equal(fly.technique, '37');
  assert.deepEqual(fly.sets.map((s) => s.target), [...LADDER, ...LADDER]);
  const full = fly.sets.map((s) => ({ ...s, weight: 50, reps: s.target, done: true }));
  assert.equal(suggest37(full, { increment: 2.5 }).weight, 52.5);
  const short = full.map((s, i) => (i === 9 ? { ...s, reps: 5 } : s));
  assert.equal(suggest37(short, { increment: 2.5 }).weight, 50);
});

test('plan v2: pesos de partida solo con historial previo y hasta hacerlo en el plan nuevo', async () => {
  const { suggestFor: sf } = await import('../js/logic.js');
  const old = [{ date: '2026-11-15T10:00:00Z', routine: 'A', entries: [{ exercise: 'machineCurl', sets: [set(20, 8), set(20, 8)] }] }];
  const planStart = '2026-11-21T00:00:00Z';
  assert.equal(sf(old, 'machineCurl', [3, 7], {}, { technique: '37', planStart }).weight, 17.5);
  assert.equal(sf([], 'machineCurl', [3, 7], {}, { technique: '37', planStart }).weight, null); // usuario nuevo: sin semilla
  const after = [...old, { date: '2026-11-22T10:00:00Z', routine: 'B', entries: [{ exercise: 'machineCurl', technique: '37',
    sets: LADDER.concat(LADDER).map((t) => ({ target: t, weight: 17.5, reps: t, done: true })) }] }];
  assert.equal(sf(after, 'machineCurl', [3, 7], {}, { technique: '37', planStart }).weight, 20);
  // Las mini-series del 3/7 no contaminan la progresión normal del mismo ejercicio.
  assert.equal(sf(after, 'machineCurl', [10, 15], {}, { technique: 'normal' }).weight, 20);
});

test('alternancia A/B ignora el día C y el 3/7 cuenta 4 series', async () => {
  const { nextRoutineKey: nk, weeklySets: ws } = await import('../js/logic.js');
  assert.equal(nk([{ routine: 'A' }, { routine: 'C' }]), 'B');
  const v = ws([{ date: '2026-11-18T10:00:00', entries: [{ exercise: 'machineCurl', technique: '37',
    sets: LADDER.concat(LADDER).map((t) => ({ target: t, weight: 17.5, reps: t, done: true })) }] }], new Date('2026-11-19T12:00:00'));
  assert.equal(v.biceps, 4);
});

test('tendencia: progresa, estancado y retrocede', () => {
  const w = (wt, reps) => ({ date: '2026-11-01', routine: 'A', entries: [{ exercise: 'machineCurl', sets: [set(wt, reps)] }] });
  assert.equal(exerciseTrend([w(20, 10), w(20, 12)], 'machineCurl').status, 'nuevo');
  assert.equal(exerciseTrend([w(20, 10), w(20, 12), w(20, 14)], 'machineCurl').status, 'progresa');
  assert.equal(exerciseTrend([w(20, 15), w(20, 15), w(20, 14), w(20, 15)], 'machineCurl').status, 'estancado');
  assert.equal(exerciseTrend([w(20, 15), w(20, 10), w(20, 8)], 'machineCurl').status, 'retrocede');
});

test('revisión: cambios de cinta reales solo por encima del umbral', () => {
  const d = reviewDelta([
    { date: '2026-11-01', weight: 76, arm: 34, thigh: 56 },
    { date: '2026-11-29', weight: 76.8, arm: 34.4, thigh: 57.5 },
  ], { arm: 0.6, thigh: 1.3 });
  assert.equal(d.days, 28);
  assert.equal(d.fields.weight.delta, 0.8);
  assert.equal(d.fields.arm.real, false);
  assert.equal(d.fields.thigh.real, true);
  assert.equal(reviewDelta([{ date: '2026-11-01', weight: 76 }], {}), null);
});
