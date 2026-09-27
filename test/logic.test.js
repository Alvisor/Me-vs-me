import test from 'node:test';
import assert from 'node:assert/strict';
import { suggest, e1rm, weeklySets, nextRoutineKey, newWorkout, compare, lastEntry } from '../js/logic.js';

const set = (weight, reps, done = true) => ({ weight, reps, done });

test('sin historial pide elegir peso', () => {
  const s = suggest([], [6, 10], 2.5);
  assert.equal(s.weight, null);
  assert.equal(s.reps, 6);
});

test('sube peso cuando todas las series llegan al tope', () => {
  const s = suggest([set(60, 10), set(60, 10), set(60, 11)], [6, 10], 2.5);
  assert.deepEqual([s.weight, s.reps], [62.5, 6]);
});

test('mantiene peso y pide +1 rep si alguna serie se quedó corta', () => {
  const s = suggest([set(60, 10), set(60, 9), set(60, 8)], [6, 10], 2.5);
  assert.deepEqual([s.weight, s.reps], [60, 9]);
});

test('ignora series no completadas', () => {
  const s = suggest([set(60, 10), set(80, 3, false)], [6, 10], 2.5);
  assert.equal(s.weight, 62.5);
});

test('e1rm Epley', () => {
  assert.equal(e1rm(100, 10), 133.33);
  assert.equal(e1rm(0, 10), 0);
});

test('series semanales: principal cuenta 1, secundario 0.5, fuera de semana no cuenta', () => {
  const now = new Date('2026-09-30T12:00:00'); // miércoles
  const workouts = [
    { date: '2026-09-28T18:00:00', routine: 'A', entries: [
      { exercise: 'inclineDbPress', sets: [set(20, 8), set(20, 8), set(20, 7)] },
      { exercise: 'squat', sets: [set(80, 8), set(80, 8, false)] },
    ] },
    { date: '2026-09-25T18:00:00', routine: 'B', entries: [{ exercise: 'benchPress', sets: [set(60, 8)] }] },
  ];
  const v = weeklySets(workouts, now);
  assert.equal(v.chest, 3);
  assert.equal(v.triceps, 1.5);
  assert.equal(v.quads, 1);
  assert.equal(v.hamstrings, 0.5);
});

test('alterna rutinas A/B', () => {
  assert.equal(nextRoutineKey([]), 'A');
  assert.equal(nextRoutineKey([{ routine: 'A' }]), 'B');
  assert.equal(nextRoutineKey([{ routine: 'B' }]), 'A');
});

test('nuevo entreno aplica sustituciones y precarga el peso sugerido', () => {
  const history = [{ date: '2026-09-20', routine: 'B', entries: [{ exercise: 'legPress', sets: [set(100, 12), set(100, 12)] }] }];
  const w = newWorkout('A', history, { A1: 'legPress' });
  assert.equal(w.entries[0].exercise, 'legPress');
  assert.equal(w.entries[0].sets[0].weight, 105);
  assert.equal(w.entries[0].sets.length, 3);
});

test('compare: Me vs Me contra la última vez', () => {
  const prev = [{ date: '2026-09-20', routine: 'A', entries: [{ exercise: 'squat', sets: [set(80, 8)] }] }];
  const cur = { entries: [{ exercise: 'squat', sets: [set(80, 9)] }, { exercise: 'calfRaise', sets: [set(50, 12)] }] };
  const [sq, calf] = compare(cur, prev);
  assert.ok(sq.diff > 0);
  assert.equal(calf.before, null);
  assert.equal(lastEntry(prev, 'squat').sets[0].reps, 8);
});
