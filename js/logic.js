// Lógica pura (sin DOM) para poder testearla con `node --test`.
import { EXERCISES, ROUTINES, PAIN_LIMIT, PLAN_V2_START } from './data.js';

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

// Método 3/7: 2 bloques de 3-4-5-6-7 reps con 15 s entre mini-series.
export const LADDER = [3, 4, 5, 6, 7];

export function suggest37(lastSets, ex = {}) {
  const increment = ex.increment ?? 2.5;
  const done = (lastSets || []).filter((s) => s.done && s.reps > 0);
  if (!done.length) {
    return { weight: null, reps: 3, text: 'Usa tu peso de 12-13 reps (≈70 %): escalera 3-4-5-6-7, 15 s entre mini-series, 2 bloques.' };
  }
  const weight = Math.max(...done.map((s) => s.weight || 0));
  const complete = done.length >= 2 * LADDER.length && done.every((s) => s.reps >= (s.target ?? 0));
  if (complete) {
    const next = round(weight + increment);
    return { weight: next, reps: 3, text: `¡Completaste los dos bloques! Sube a ${next} kg.` };
  }
  return { weight, reps: 3, text: `Mantén ${weight} kg hasta completar los dos bloques enteros (la última de 7 limpia).` };
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
      if (e.technique === '37') n *= 0.4; // 3/7 completo (10 mini-series) ≈ 4 series duras
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

// Alterna A y B; el día C es opcional y no altera la alternancia.
export function nextRoutineKey(workouts) {
  const last = [...workouts].reverse().find((w) => w.routine === 'A' || w.routine === 'B');
  return last && last.routine === 'A' ? 'B' : 'A';
}

// Última vez que se hizo este ejercicio (en cualquier rutina) con la misma técnica:
// las mini-series del 3/7 no sirven para progresar las series normales, ni al revés.
export function lastEntry(workouts, exerciseId, technique = 'normal') {
  for (let i = workouts.length - 1; i >= 0; i--) {
    const e = workouts[i].entries.find((x) => x.exercise === exerciseId
      && (x.technique || 'normal') === technique && x.sets.some((s) => s.done));
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
// opts.technique: 'normal' | '37'. opts.planStart: fecha ISO del cambio al plan v2 (pesos de partida).
// opts.side: en unilaterales, de qué pierna sacar la sugerencia (por defecto la lesionada).
export function suggestFor(workouts, exerciseId, reps, profile = {}, { technique = 'normal', planStart = null, side = null } = {}) {
  const ex = EXERCISES[exerciseId];
  const prev = lastEntry(workouts, exerciseId, technique);
  const seed = PLAN_V2_START[technique]?.[exerciseId];
  const hadHistory = planStart && workouts.some((w) => new Date(w.date) < new Date(planStart));
  const doneSincePlan = prev && planStart && new Date(prev.date) >= new Date(planStart);
  if (seed != null && hadHistory && !doneSincePlan) {
    const text = technique === '37'
      ? `Plan nuevo: empieza el 3/7 con ${seed} kg. Si el segundo bloque sale fácil, sube; si no completas el primero, baja un escalón.`
      : `Plan nuevo: empieza con ${seed} kg para ${reps[0]}-${reps[1]} reps. Si te sobran más de 3 reps, sube; si no llegas, baja un escalón.`;
    return { weight: seed, reps: technique === '37' ? 3 : reps[0], text };
  }
  if (technique === '37') return suggest37(prev?.sets, ex);
  let sets = prev?.sets;
  // En unilaterales manda la pierna lesionada (o la pedida).
  if (ex.unilateral && sets) {
    const wanted = side || sideOrder(profile.injuredSide)[0];
    const bySide = sets.filter((s) => s.side === wanted);
    if (bySide.length) sets = bySide;
  }
  return suggest(sets, reps, ex, { recovery: profile.recovery, pain: prev?.pain ?? null });
}

export function newWorkout(routineKey, workouts, swaps = {}, profile = {}, planStart = null) {
  const r = ROUTINES[routineKey];
  return {
    id: Date.now().toString(36),
    routine: routineKey,
    date: new Date().toISOString(),
    entries: r.slots.map((slot) => {
      const exercise = slotExercise(slot, swaps);
      const ex = EXERCISES[exercise];
      const technique = slot.technique || 'normal';
      const opts = { technique, planStart };
      const s = suggestFor(workouts, exercise, slot.reps, profile, opts);
      const sets = [];
      if (technique === '37') {
        for (let b = 1; b <= slot.sets; b++) {
          for (const target of LADDER) sets.push({ block: b, target, weight: s.weight ?? '', reps: '', done: false });
        }
        return { slot: slot.id, exercise, technique, sets };
      }
      const order = sideOrder(profile.injuredSide);
      // Fase 1 de salida del modo recuperación: la pierna sana trabaja con su propio peso.
      const other = ex.unilateral && profile.healthyOwnLoad ? suggestFor(workouts, exercise, slot.reps, profile, { ...opts, side: order[1] }) : s;
      const blank = (side) => ({ ...(side ? { side } : {}), weight: (side && side === order[1] ? other.weight : s.weight) ?? '', reps: '', done: false });
      for (let i = 0; i < slot.sets; i++) {
        if (ex.unilateral) order.forEach((side) => sets.push(blank(side)));
        else sets.push(blank());
      }
      return { slot: slot.id, exercise, sets, ...(ex.leg && profile.recovery ? { pain: null } : {}) };
    }),
  };
}

// Estado de un ejercicio según su 1RM estimado (misma técnica): progresa, estancado (3+ sesiones
// sin superar su mejor marca) o retrocede (las 2 últimas >5 % por debajo de su mejor marca).
// Cambios de menos del 3 % se consideran ruido.
export function exerciseTrend(workouts, exerciseId, technique = 'normal', bodyweight = null) {
  const ex = EXERCISES[exerciseId];
  const pts = workouts
    .map((w) => w.entries.find((e) => e.exercise === exerciseId && (e.technique || 'normal') === technique && e.sets.some((s) => s.done)))
    .filter(Boolean)
    .map((e) => bestE1rm(e.sets, ex, bodyweight));
  if (pts.length < 3) return { status: 'nuevo', sessions: pts.length };
  let best = 0;
  for (let i = 1; i < pts.length; i++) if (pts[i] > pts[best] * 1.03) best = i;
  const since = pts.length - 1 - best;
  const lastTwo = pts.slice(-2);
  if (since >= 2 && lastTwo.every((p) => p < pts[best] * 0.95)) return { status: 'retrocede', sessions: pts.length, since };
  if (since >= 3) return { status: 'estancado', sessions: pts.length, since };
  return { status: 'progresa', sessions: pts.length, since };
}

// Seguimiento: compara la última revisión con la anterior. Un cambio de cinta solo es "real" si
// supera el umbral de error de medida.
export function reviewDelta(measurements, thresholds) {
  const list = [...(measurements || [])].sort((a, b) => new Date(a.date) - new Date(b.date));
  if (list.length < 2) return null;
  const [prev, last] = list.slice(-2);
  const days = Math.round((new Date(last.date) - new Date(prev.date)) / 864e5);
  const out = { days, fields: {} };
  for (const k of ['weight', 'waist', 'arm', 'thigh', 'chest']) {
    if (last[k] == null || prev[k] == null || last[k] === '' || prev[k] === '') continue;
    const d = round(last[k] - prev[k]);
    out.fields[k] = { delta: d, real: k === 'weight' ? true : Math.abs(d) >= (thresholds[k] ?? 1) };
  }
  return out;
}

export function daysSince(iso, now = new Date()) {
  return iso ? Math.floor((now - new Date(iso)) / 864e5) : null;
}

// "Me vs Me": compara cada ejercicio con la vez anterior.
export function compare(workout, previousWorkouts, bodyweight = null) {
  return workout.entries
    .filter((e) => e.sets.some((s) => s.done))
    .map((e) => {
      const ex = EXERCISES[e.exercise];
      const prev = lastEntry(previousWorkouts, e.exercise, e.technique || 'normal');
      const now = bestE1rm(e.sets, ex, bodyweight);
      const before = prev ? bestE1rm(prev.sets, ex, bodyweight) : null;
      return { exercise: e.exercise, now, before, diff: before == null ? null : round(now - before) };
    });
}

// Une dos copias (p. ej. de dos móviles). Junta los entrenos de ambas, incluidos los que quedaron
// sin terminar, y recompone en uno solo los de la misma rutina hechos el mismo día: por cada
// ejercicio se queda con la versión que tiene más series hechas. El perfil es el de `local`.
export function mergeStates(local, incoming) {
  const doneOnly = (w) => ({
    ...w,
    entries: w.entries.map((e) => ({ ...e, sets: e.sets.filter((s) => s.done) })).filter((e) => e.sets.length),
  });
  const pool = [...(local.workouts || []), ...(incoming.workouts || [])];
  for (const c of [local.current, incoming.current]) {
    if (c?.entries?.some((e) => e.sets.some((s) => s.done))) pool.push(doneOnly(c));
  }
  const groups = new Map();
  for (const w of pool) {
    const key = `${w.routine}|${new Date(w.date).toDateString()}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(w);
  }
  const doneCount = (e) => e.sets.filter((s) => s.done).length;
  const workouts = [...groups.values()].map((ws) => {
    if (ws.length === 1) return ws[0];
    const bySlot = new Map();
    for (const w of ws) {
      for (const e of w.entries) {
        const k = e.slot || e.exercise;
        const prev = bySlot.get(k);
        const best = !prev || doneCount(e) > doneCount(prev) ? e : prev;
        const pains = [e.pain, prev?.pain].filter((p) => p != null);
        bySlot.set(k, pains.length ? { ...best, pain: Math.max(...pains) } : best);
      }
    }
    const first = ws.reduce((a, b) => (new Date(a.date) <= new Date(b.date) ? a : b));
    const entries = [...bySlot.values()].sort((a, b) => String(a.slot).localeCompare(String(b.slot), 'es', { numeric: true }));
    return { ...first, entries };
  });
  workouts.sort((a, b) => new Date(a.date) - new Date(b.date));
  const byDate = new Map();
  for (const m of [...(local.measurements || []), ...(incoming.measurements || [])]) byDate.set(m.date, { ...byDate.get(m.date), ...m });
  const measurements = [...byDate.values()].sort((a, b) => new Date(a.date) - new Date(b.date));
  return { ...local, workouts, measurements, current: null };
}

function round(n) {
  return Math.round(n * 100) / 100;
}

function roundTo(n, step) {
  return Math.round(n / step) * step;
}
