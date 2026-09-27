// Lógica pura (sin DOM) para poder testearla con `node --test`.
import { EXERCISES, ROUTINES, PAIN_LIMIT } from './data.js';

export const SIDE_LABEL = { L: 'Izq', R: 'Der' };

// Doble progresión: si todas las series llegaron al tope de reps → cambia peso;
// si no, mismo peso e intenta +1 rep.
// En asistidos el "peso" es la ayuda: progresar = restar.
// En recuperación (piernas): saltos a la mitad y el dolor frena o hace bajar la carga.
export function suggest(lastSets, [minReps, maxReps], ex = {}, { recovery = false, pain = null } = {}) {
  const increment = ex.increment ?? 2.5;
  const careful = recovery && ex.leg;
  const done = (lastSets || []).filter((s) => s.done && s.reps > 0);
  if (!done.length) {
    const text = careful
      ? `Empieza ligero: un peso con el que hagas ${maxReps} reps sin dolor y dejando 3 en reserva.`
      : `Elige un peso con el que llegues a ${minReps}–${maxReps} reps dejando 1–2 en reserva.`;
    return { weight: null, reps: minReps, text };
  }
  const weights = done.map((s) => s.weight || 0);
  const weight = ex.assisted ? Math.min(...weights) : Math.max(...weights);
  const topSets = done.filter((s) => (s.weight || 0) === weight);
  const minDone = Math.min(...topSets.map((s) => s.reps));

  if (careful && pain != null && pain > PAIN_LIMIT) {
    const lower = roundTo(weight * 0.9, 0.5);
    return { weight: lower, reps: minReps, text: `Dolor ${pain}/10 la última vez: baja a ${lower} kg y prioriza la técnica.` };
  }
  if (topSets.every((s) => s.reps >= maxReps)) {
    if (careful && pain === PAIN_LIMIT) {
      return { weight, reps: maxReps, text: `Llegaste al tope pero con dolor ${pain}/10: mantén ${weight} kg una sesión más.` };
    }
    const step = careful ? increment / 2 : increment;
    const next = ex.assisted ? Math.max(0, round(weight - step)) : round(weight + step);
    const text = ex.assisted
      ? `¡Progresas! Baja la asistencia a ${next} kg × ${minReps}+ reps.`
      : `¡Subes! Prueba ${next} kg × ${minReps}+ reps.`;
    return { weight: next, reps: minReps, text };
  }
  const target = Math.min(maxReps, minDone + 1);
  return { weight, reps: target, text: `Mantén ${weight} kg y busca ${target}+ reps en cada serie.` };
}

// Estimación de 1RM (Epley) para comparar sesiones con distinto peso/reps.
export function e1rm(weight, reps) {
  if (!weight || !reps) return 0;
  return round(weight * (1 + reps / 30));
}

// Carga real movida: en asistidos es peso corporal − asistencia.
export function effectiveWeight(set, ex = {}, bodyweight = null) {
  const w = Number(set.weight) || 0;
  return ex.assisted ? Math.max(0, (bodyweight || 75) - w) : w;
}

export function bestE1rm(sets, ex = {}, bodyweight = null) {
  return Math.max(0, ...(sets || []).filter((s) => s.done).map((s) => e1rm(effectiveWeight(s, ex, bodyweight), s.reps)));
}

// Pierna lesionada primero.
export function sideOrder(injuredSide) {
  return injuredSide === 'R' ? ['R', 'L'] : ['L', 'R'];
}

// Diferencia entre lados en la mejor serie (1RM estimado). null si falta un lado.
export function asymmetry(sets) {
  const best = {};
  for (const s of sets || []) {
    if (!s.done || !s.side) continue;
    best[s.side] = Math.max(best[s.side] || 0, e1rm(s.weight, s.reps));
  }
  if (!best.L || !best.R) return null;
  const hi = Math.max(best.L, best.R);
  return { pct: Math.round((Math.abs(best.L - best.R) / hi) * 100), weaker: best.L < best.R ? 'L' : best.R < best.L ? 'R' : null };
}

// Texto compacto: "40×15 ×3" o "Der 40×15 ×3 · Izq 35×15, 35×12".
export function formatSets(sets) {
  const done = (sets || []).filter((s) => s.done);
  const sides = [...new Set(done.map((s) => s.side || ''))];
  return sides.map((side) => {
    const parts = done.filter((s) => (s.side || '') === side).map((s) => `${s.weight || 0}×${s.reps}`);
    const txt = parts.every((x) => x === parts[0]) && parts.length > 1 ? `${parts[0]} ×${parts.length}` : parts.join(', ');
    return side ? `${SIDE_LABEL[side]} ${txt}` : txt;
  }).join(' · ');
}

// Lunes 00:00 de la semana de `date`.
export function weekStart(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

// Series completadas por músculo en la semana: principal = 1, secundario = 0.5.
// En unilaterales, izquierda + derecha cuentan como una serie.
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
      let n = e.sets.filter((s) => s.done).length;
      if (ex.unilateral) n /= 2;
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
    if (e) return { date: workouts[i].date, sets: e.sets, pain: e.pain ?? null };
  }
  return null;
}

// Sustitución válida solo si sigue siendo alternativa del ejercicio del slot.
export function slotExercise(slot, swaps = {}) {
  const swap = swaps[slot.id];
  return swap && EXERCISES[swap] && EXERCISES[slot.exercise].alternatives.includes(swap) ? swap : slot.exercise;
}

// Sugerencia para un ejercicio a partir del historial y el perfil.
export function suggestFor(workouts, exerciseId, reps, profile = {}) {
  const ex = EXERCISES[exerciseId];
  const prev = lastEntry(workouts, exerciseId);
  let sets = prev?.sets;
  // En unilaterales manda la pierna lesionada.
  if (ex.unilateral && sets) {
    const first = sideOrder(profile.injuredSide)[0];
    const side = sets.filter((s) => s.side === first);
    if (side.length) sets = side;
  }
  return suggest(sets, reps, ex, { recovery: profile.recovery, pain: prev?.pain ?? null });
}

export function newWorkout(routineKey, workouts, swaps = {}, profile = {}) {
  const r = ROUTINES[routineKey];
  return {
    id: Date.now().toString(36),
    routine: routineKey,
    date: new Date().toISOString(),
    entries: r.slots.map((slot) => {
      const exercise = slotExercise(slot, swaps);
      const ex = EXERCISES[exercise];
      const s = suggestFor(workouts, exercise, slot.reps, profile);
      const blank = (side) => ({ ...(side ? { side } : {}), weight: s.weight ?? '', reps: '', done: false });
      const sets = [];
      for (let i = 0; i < slot.sets; i++) {
        if (ex.unilateral) sideOrder(profile.injuredSide).forEach((side) => sets.push(blank(side)));
        else sets.push(blank());
      }
      return { slot: slot.id, exercise, sets, ...(ex.leg && profile.recovery ? { pain: null } : {}) };
    }),
  };
}

// "Me vs Me": compara cada ejercicio con la vez anterior.
export function compare(workout, previousWorkouts, bodyweight = null) {
  return workout.entries
    .filter((e) => e.sets.some((s) => s.done))
    .map((e) => {
      const ex = EXERCISES[e.exercise];
      const prev = lastEntry(previousWorkouts, e.exercise);
      const now = bestE1rm(e.sets, ex, bodyweight);
      const before = prev ? bestE1rm(prev.sets, ex, bodyweight) : null;
      return { exercise: e.exercise, now, before, diff: before == null ? null : round(now - before) };
    });
}

function round(n) {
  return Math.round(n * 100) / 100;
}

function roundTo(n, step) {
  return Math.round(n / step) * step;
}
