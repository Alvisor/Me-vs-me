// Lógica pura (sin DOM) para poder testearla con `node --test`.
import { EXERCISES, ROUTINES } from './data.js';

// Doble progresión: si todas las series llegaron al tope de reps → sube peso;
// si no, mismo peso e intenta +1 rep.
export function suggest(lastSets, [minReps, maxReps], increment) {
  const done = (lastSets || []).filter((s) => s.done && s.reps > 0);
  if (!done.length) {
    return { weight: null, reps: minReps, text: `Elige un peso con el que llegues a ${minReps}–${maxReps} reps dejando 1–2 en reserva.` };
  }
  const weight = Math.max(...done.map((s) => s.weight || 0));
  const topSets = done.filter((s) => (s.weight || 0) === weight);
  if (topSets.every((s) => s.reps >= maxReps)) {
    const next = round(weight + increment);
    return { weight: next, reps: minReps, text: `¡Subes! Prueba ${next} kg × ${minReps}+ reps.` };
  }
  const minDone = Math.min(...topSets.map((s) => s.reps));
  const target = Math.min(maxReps, minDone + 1);
  return { weight, reps: target, text: `Mantén ${weight} kg y busca ${target}+ reps en cada serie.` };
}

// Estimación de 1RM (Epley) para comparar sesiones con distinto peso/reps.
export function e1rm(weight, reps) {
  if (!weight || !reps) return 0;
  return round(weight * (1 + reps / 30));
}

export function volumeLoad(sets) {
  return (sets || []).filter((s) => s.done).reduce((acc, s) => acc + (s.weight || 0) * (s.reps || 0), 0);
}

export function bestE1rm(sets) {
  return Math.max(0, ...(sets || []).filter((s) => s.done).map((s) => e1rm(s.weight, s.reps)));
}

// Lunes 00:00 de la semana de `date`.
export function weekStart(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

// Series completadas por músculo en la semana: principal = 1, secundario = 0.5.
export function weeklySets(workouts, now = new Date()) {
  const start = weekStart(now).getTime();
  const end = start + 7 * 864e5;
  const totals = {};
  for (const w of workouts) {
    const t = new Date(w.date).getTime();
    if (t < start || t >= end) continue;
    for (const e of w.entries) {
      const ex = EXERCISES[e.exercise];
      if (!ex) continue;
      const n = e.sets.filter((s) => s.done).length;
      for (const m of ex.primary) totals[m] = (totals[m] || 0) + n;
      for (const m of ex.secondary) totals[m] = (totals[m] || 0) + n * 0.5;
    }
  }
  return totals;
}

export function sessionsThisWeek(workouts, now = new Date()) {
  const start = weekStart(now).getTime();
  return workouts.filter((w) => new Date(w.date).getTime() >= start).length;
}

export function nextRoutineKey(workouts) {
  const last = workouts[workouts.length - 1];
  return last && last.routine === 'A' ? 'B' : 'A';
}

// Última vez que se hizo este ejercicio (en cualquier rutina).
export function lastEntry(workouts, exerciseId) {
  for (let i = workouts.length - 1; i >= 0; i--) {
    const e = workouts[i].entries.find((x) => x.exercise === exerciseId && x.sets.some((s) => s.done));
    if (e) return { date: workouts[i].date, sets: e.sets };
  }
  return null;
}

export function newWorkout(routineKey, workouts, swaps = {}) {
  const r = ROUTINES[routineKey];
  return {
    id: Date.now().toString(36),
    routine: routineKey,
    date: new Date().toISOString(),
    entries: r.slots.map((slot) => {
      const exercise = swaps[slot.id] || slot.exercise;
      const s = suggest(lastEntry(workouts, exercise)?.sets, slot.reps, EXERCISES[exercise].increment);
      return {
        slot: slot.id,
        exercise,
        sets: Array.from({ length: slot.sets }, () => ({ weight: s.weight ?? '', reps: '', done: false })),
      };
    }),
  };
}

// "Me vs Me": compara cada ejercicio con la vez anterior.
export function compare(workout, previousWorkouts) {
  return workout.entries
    .filter((e) => e.sets.some((s) => s.done))
    .map((e) => {
      const prev = lastEntry(previousWorkouts, e.exercise);
      const now = bestE1rm(e.sets);
      const before = prev ? bestE1rm(prev.sets) : null;
      return { exercise: e.exercise, now, before, diff: before == null ? null : round(now - before) };
    });
}

function round(n) {
  return Math.round(n * 100) / 100;
}
