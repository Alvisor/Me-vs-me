import test from 'node:test';
import assert from 'node:assert/strict';
import {
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
  const e = w.entries[0];
  assert.equal(e.exercise, 'hsLegPress');
  assert.equal(e.sets.length, 6);
  assert.deepEqual(e.sets.map((s) => s.side), ['R', 'L', 'R', 'L', 'R', 'L']);
  assert.equal(e.sets[0].weight, 42.5);
  assert.equal(e.pain, null);
  assert.equal('pain' in w.entries[1], false); // press inclinado no es pierna
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
