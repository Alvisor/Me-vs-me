import { EXERCISES, ROUTINES, MUSCLES, WEEKLY_TARGET, DEFAULT_PROFILE, PAIN_LIMIT, imgUrl } from './data.js';
import {
  suggestFor, lastEntry, newWorkout, nextRoutineKey, weeklySets, sessionsThisWeek, compare, bestE1rm,
  asymmetry, slotExercise, formatSets, SIDE_LABEL,
} from './logic.js';

// ---------- Estado persistente ----------
const KEY = 'mevsme.v1';
const defaults = () => ({ settings: { daysPerWeek: 2, swaps: {}, profile: { ...DEFAULT_PROFILE } }, workouts: [], current: null });

function hydrate(data) {
  const d = defaults();
  const s = data?.settings || {};
  return {
    ...d,
    ...data,
    settings: { ...d.settings, ...s, profile: { ...d.settings.profile, ...s.profile } },
  };
}
function load() {
  try {
    return hydrate(JSON.parse(localStorage.getItem(KEY)));
  } catch {
    return defaults();
  }
}
let state = load();
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* almacenamiento no disponible */ }
}
const profile = () => state.settings.profile;

// ---------- Utilidades ----------
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = (iso) => new Date(iso).toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' });
const setsText = formatSets;
const slotOf = (w, slotId) => ROUTINES[w.routine].slots.find((s) => s.id === slotId);
const sideName = (side) => (side === 'L' ? 'izquierda' : 'derecha');

let view = 'train';
const main = $('#main');

function render() {
  document.querySelectorAll('nav button').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  ({ train: renderTrain, library: renderLibrary, progress: renderProgress, settings: renderSettings })[view]();
}

// ---------- Entrenar ----------
function renderTrain() {
  if (state.current) return renderWorkout();
  const key = nextRoutineKey(state.workouts);
  const r = ROUTINES[key];
  const done = sessionsThisWeek(state.workouts);
  const goal = state.settings.daysPerWeek;
  const p = profile();
  main.innerHTML = `
    <section class="card hero">
      <p class="muted">Esta semana</p>
      <p class="big">${done} / ${goal} <span class="muted">entrenos</span></p>
      <div class="bar"><span style="width:${Math.min(100, (done / goal) * 100)}%"></span></div>
    </section>
    ${p.recovery && !p.injuredSide ? `<section class="card notice">Dime qué pierna fue la lesionada en <a href="#" data-go="settings">Ajustes → Tu perfil</a> para que la app la ponga siempre primero.</section>` : ''}
    <section class="card">
      <p class="muted">Próximo entreno</p>
      <h2>${r.name}</h2>
      <ul class="plan">
        ${r.slots.map((s) => {
          const id = slotExercise(s, state.settings.swaps);
          const ex = EXERCISES[id];
          const sug = suggestFor(state.workouts, id, s.reps, p);
          return `<li><img src="${imgUrl(id)}" alt="" loading="lazy">
            <span>${esc(ex.name)}${ex.unilateral ? ' <small class="pill">1 pierna</small>' : ''}</span>
            <span class="muted">${sug.weight != null ? `${sug.weight} kg` : `${s.sets}×${s.reps[0]}–${s.reps[1]}`}</span></li>`;
        }).join('')}
      </ul>
      <button class="primary" id="start">Empezar ${r.name}</button>
      <button class="ghost" id="startOther">Hacer ${ROUTINES[key === 'A' ? 'B' : 'A'].name} en su lugar</button>
    </section>`;
  $('#start').onclick = () => start(key);
  $('#startOther').onclick = () => start(key === 'A' ? 'B' : 'A');
  bindGo();
}

function bindGo() {
  main.querySelectorAll('[data-go]').forEach((a) => {
    a.onclick = (ev) => { ev.preventDefault(); view = a.dataset.go; render(); };
  });
}

function start(key) {
  state.current = newWorkout(key, state.workouts, state.settings.swaps, profile());
  save();
  render();
}

function renderWorkout() {
  const w = state.current;
  const p = profile();
  let lastSuperset = null;
  main.innerHTML = `
    <h2>${ROUTINES[w.routine].name}</h2>
    ${w.entries.map((e, ei) => {
      const slot = slotOf(w, e.slot);
      const ex = EXERCISES[e.exercise];
      const prev = lastEntry(state.workouts, e.exercise);
      const sug = suggestFor(state.workouts, e.exercise, slot.reps, p);
      const asym = prev && ex.unilateral ? asymmetry(prev.sets) : null;
      const ssLabel = slot.superset && slot.superset !== lastSuperset ? '<p class="tag">Superserie ↓ alterna estos dos</p>' : '';
      lastSuperset = slot.superset || null;
      return `${ssLabel}
      <section class="card exercise ${slot.superset ? 'ss' : ''}">
        <header>
          <img src="${imgUrl(e.exercise)}" alt="" data-info="${e.exercise}" class="thumb">
          <div>
            <h3 data-info="${e.exercise}">${esc(ex.name)}</h3>
            <p class="muted">${slot.sets} series${ex.unilateral ? ' por pierna' : ''} · ${slot.reps[0]}–${slot.reps[1]} reps · descanso ${Math.round(slot.rest / 60 * 10) / 10} min</p>
          </div>
        </header>
        <div class="hint">
          ${prev ? `Última vez: <b>${setsText(prev.sets)}</b>${prev.pain != null ? ` · dolor ${prev.pain}/10` : ''}<br>` : ''}
          🎯 ${esc(sug.text)}
          ${ex.unilateral ? `<br>🦵 Empieza por la ${p.injuredSide ? `${sideName(p.injuredSide)} (lesionada)` : 'pierna lesionada'}; la otra hace el mismo peso y reps, no más.` : ''}
          ${ex.assisted ? '<br>⚖️ El peso es la <b>asistencia</b>: cuanto menos, mejor.' : ''}
          ${asym && asym.pct >= 10 ? `<br><span class="warnText">⚠️ La última vez hubo un ${asym.pct}% de diferencia entre piernas${asym.weaker ? ` (más débil: ${sideName(asym.weaker)})` : ''}.</span>` : ''}
        </div>
        <div class="sets">
          <div class="row head"><span>#</span><span>${ex.assisted ? 'ayuda kg' : 'kg'}</span><span>reps</span><span></span></div>
          ${e.sets.map((s, si) => {
            // En unilaterales, el segundo lado propone lo que hizo el primero.
            const pair = ex.unilateral && si % 2 === 1 ? e.sets[si - 1] : null;
            const phW = pair && pair.weight !== '' ? pair.weight : sug.weight ?? '';
            const phR = pair && pair.reps !== '' ? pair.reps : sug.reps;
            const n = ex.unilateral ? `${Math.floor(si / 2) + 1}<small>${SIDE_LABEL[s.side]}</small>` : si + 1;
            return `
            <div class="row ${s.done ? 'done' : ''} ${pair ? 'pair' : ''}">
              <span class="n">${n}</span>
              <input type="number" inputmode="decimal" step="0.5" min="0" value="${esc(s.weight)}" data-e="${ei}" data-s="${si}" data-f="weight" placeholder="${phW}">
              <input type="number" inputmode="numeric" min="0" value="${esc(s.reps)}" data-e="${ei}" data-s="${si}" data-f="reps" placeholder="${phR}">
              <button class="check" data-e="${ei}" data-s="${si}" aria-label="Completar serie">${s.done ? '✓' : '○'}</button>
            </div>`;
          }).join('')}
        </div>
        <button class="link" data-add="${ei}">+ serie</button>
        ${'pain' in e ? `
        <div class="pain">
          <span>Dolor en la pierna (0–10)</span>
          <div class="painScale">${Array.from({ length: 11 }, (_, i) => `<button data-pain="${ei}" data-v="${i}" class="${e.pain === i ? 'active' : ''} ${i > PAIN_LIMIT ? 'hi' : ''}">${i}</button>`).join('')}</div>
        </div>` : ''}
      </section>`;
    }).join('')}
    <button class="primary" id="finish">Terminar entreno</button>
    <button class="ghost danger" id="discard">Descartar</button>`;

  main.querySelectorAll('input').forEach((inp) => {
    inp.onchange = () => {
      const s = w.entries[inp.dataset.e].sets[inp.dataset.s];
      s[inp.dataset.f] = inp.value === '' ? '' : Number(inp.value);
      save();
    };
  });
  main.querySelectorAll('.check').forEach((btn) => {
    btn.onclick = () => {
      const e = w.entries[btn.dataset.e];
      const si = Number(btn.dataset.s);
      const s = e.sets[si];
      const row = btn.closest('.row');
      // Si el campo está vacío usa la sugerencia (placeholder).
      for (const f of ['weight', 'reps']) {
        const inp = row.querySelector(`[data-f="${f}"]`);
        if (s[f] === '' && inp.placeholder !== '') s[f] = Number(inp.placeholder);
      }
      s.done = !s.done;
      save();
      const ex = EXERCISES[e.exercise];
      const slot = slotOf(w, e.slot);
      const nextSlot = ROUTINES[w.routine].slots[Number(btn.dataset.e) + 1];
      const inSuperset = slot.superset && nextSlot?.superset === slot.superset;
      // En unilaterales se descansa tras hacer las dos piernas.
      const firstSide = ex.unilateral && si % 2 === 0;
      if (s.done && !firstSide) startTimer(inSuperset ? 20 : slot.rest);
      renderWorkout();
    };
  });
  main.querySelectorAll('[data-add]').forEach((btn) => {
    btn.onclick = () => {
      const e = w.entries[btn.dataset.add];
      const ex = EXERCISES[e.exercise];
      const last = e.sets[e.sets.length - 1];
      const sides = ex.unilateral ? [e.sets[e.sets.length - 2]?.side, last?.side] : [undefined];
      sides.forEach((side) => e.sets.push({ ...(side ? { side } : {}), weight: last?.weight ?? '', reps: '', done: false }));
      save();
      renderWorkout();
    };
  });
  main.querySelectorAll('[data-pain]').forEach((btn) => {
    btn.onclick = () => {
      w.entries[btn.dataset.pain].pain = Number(btn.dataset.v);
      save();
      renderWorkout();
    };
  });
  main.querySelectorAll('[data-info]').forEach((el) => { el.onclick = () => openExercise(el.dataset.info); });
  $('#finish').onclick = finish;
  $('#discard').onclick = async () => {
    if (!await ask('¿Descartar este entreno?', 'Descartar')) return;
    state.current = null;
    save();
    render();
  };
}

async function finish() {
  const w = state.current;
  const doneSets = w.entries.flatMap((e) => e.sets).filter((s) => s.done).length;
  if (!doneSets && !await ask('No has completado ninguna serie. ¿Terminar igualmente?', 'Terminar')) return;
  const missingPain = w.entries.filter((e) => 'pain' in e && e.pain == null && e.sets.some((s) => s.done));
  if (missingPain.length && !await ask('No has marcado el dolor en algún ejercicio de pierna. Sirve para frenar la progresión si molesta. ¿Terminar igualmente?', 'Terminar sin marcar')) return;
  const results = compare(w, state.workouts, profile().bodyweight);
  w.entries.forEach((e) => { e.sets = e.sets.filter((s) => s.done); });
  w.entries = w.entries.filter((e) => e.sets.length);
  if (w.entries.length) state.workouts.push(w);
  state.current = null;
  save();
  stopTimer();
  const wins = results.filter((r) => r.diff > 0).length;
  const compared = results.filter((r) => r.before != null).length;
  const asyms = w.entries
    .filter((e) => EXERCISES[e.exercise].unilateral)
    .map((e) => ({ e, a: asymmetry(e.sets) }))
    .filter((x) => x.a && x.a.pct >= 10);
  openModal(`
    <h2>Me vs Me</h2>
    ${compared
      ? `<p class="muted">Comparado con tu última vez (1RM estimado)</p>
         <p class="big">${wins} / ${compared} <span class="muted">mejoras</span></p>`
      : '<p>Primer registro guardado. La próxima vez competirás contra el tú de hoy.</p>'}
    <ul class="results">
      ${results.map((r) => `
        <li><span>${esc(EXERCISES[r.exercise].name)}</span>
        <span class="${r.diff > 0 ? 'up' : r.diff < 0 ? 'down' : 'muted'}">
          ${r.diff == null ? 'primera vez' : r.diff > 0 ? `▲ +${r.diff} kg` : r.diff < 0 ? `▼ ${r.diff} kg` : '= igual'}
        </span></li>`).join('')}
    </ul>
    ${asyms.length ? `<p class="warnText">⚠️ Diferencia entre piernas: ${asyms.map((x) => `${esc(EXERCISES[x.e.exercise].name)} ${x.a.pct}%`).join(', ')}. Iguala la sana a la lesionada.</p>` : ''}
    <button class="primary" data-close>Listo</button>`);
  render();
}

// ---------- Temporizador de descanso ----------
let timer = null;
function startTimer(seconds) {
  stopTimer();
  const el = $('#timer');
  const end = Date.now() + seconds * 1000;
  const tick = () => {
    const left = Math.max(0, Math.round((end - Date.now()) / 1000));
    el.innerHTML = `Descanso <b>${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}</b> <button id="skip">Saltar</button>`;
    $('#skip').onclick = stopTimer;
    if (!left) {
      navigator.vibrate?.([200, 100, 200]);
      el.innerHTML = '¡A por la siguiente serie! <button id="skip">OK</button>';
      $('#skip').onclick = stopTimer;
      clearInterval(timer);
    }
  };
  el.hidden = false;
  tick();
  timer = setInterval(tick, 1000);
}
function stopTimer() {
  clearInterval(timer);
  $('#timer').hidden = true;
}

// ---------- Biblioteca de ejercicios ----------
function tiles(ids) {
  return `<div class="grid">${ids.map((id) => `
    <button class="tile" data-info="${id}">
      <img src="${imgUrl(id)}" alt="" loading="lazy">
      <span>${esc(EXERCISES[id].name)}</span>
    </button>`).join('')}</div>`;
}

function renderLibrary() {
  const ids = Object.keys(EXERCISES);
  const gym = ids.filter((id) => EXERCISES[id].gym);
  const byMuscle = {};
  for (const id of ids.filter((x) => !EXERCISES[x].gym)) (byMuscle[EXERCISES[id].primary[0]] ||= []).push(id);
  main.innerHTML = `
    <h2>Ejercicios</h2>
    <p class="muted">Toca un ejercicio para ver la técnica.</p>
    <h3 class="group">En tu gimnasio</h3>
    ${tiles(gym)}
    <h3 class="group">Otras opciones</h3>
    ${Object.entries(MUSCLES).filter(([m]) => byMuscle[m]).map(([m, label]) => `
      <h4 class="sub">${label}</h4>${tiles(byMuscle[m])}`).join('')}`;
  main.querySelectorAll('[data-info]').forEach((el) => { el.onclick = () => openExercise(el.dataset.info); });
}

function openExercise(id) {
  const ex = EXERCISES[id];
  const history = state.workouts
    .map((w) => ({ date: w.date, e: w.entries.find((x) => x.exercise === id) }))
    .filter((h) => h.e)
    .slice(-6)
    .reverse();
  // Slots donde este ejercicio puede sustituir al original.
  const slots = Object.values(ROUTINES).flatMap((r) => r.slots.map((s) => ({ ...s, routine: r.name })))
    .filter((s) => s.exercise !== id && EXERCISES[s.exercise].alternatives.includes(id));
  const flags = [
    ex.unilateral && '🦵 Una pierna cada vez',
    ex.assisted && '⚖️ Peso = asistencia',
    ex.leg && profile().recovery && '🩹 Modo recuperación',
  ].filter(Boolean);
  openModal(`
    <div class="anim" aria-label="Posición inicial y final">
      <img src="${imgUrl(id, 0)}" alt="${esc(ex.name)}: posición inicial">
      <img src="${imgUrl(id, 1)}" alt="${esc(ex.name)}: posición final">
    </div>
    <h2>${esc(ex.name)}</h2>
    <p class="chips">${ex.primary.map((m) => `<span class="chip">${MUSCLES[m]}</span>`).join('')}${ex.secondary.map((m) => `<span class="chip soft">${MUSCLES[m]}</span>`).join('')}</p>
    ${flags.length ? `<p class="muted">${flags.join(' · ')}</p>` : ''}
    <p><b>Por qué:</b> ${esc(ex.why)}</p>
    <h3>Técnica</h3>
    <ol>${ex.cues.map((c) => `<li>${esc(c)}</li>`).join('')}</ol>
    <h3>Errores comunes</h3>
    <ul class="warn">${ex.mistakes.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>
    ${ex.alternatives.length ? `<h3>Alternativas</h3><p class="chips">${ex.alternatives.map((a) => `<button class="chip link" data-info="${a}">${esc(EXERCISES[a].name)}</button>`).join('')}</p>` : ''}
    ${slots.map((s) => {
      const active = state.settings.swaps[s.id] === id;
      return `<button class="ghost" data-swap="${s.id}">${active ? `✓ Usando en ${s.routine} (volver a ${esc(EXERCISES[s.exercise].name)})` : `Usar en ${s.routine} en vez de ${esc(EXERCISES[s.exercise].name)}`}</button>`;
    }).join('')}
    ${history.length ? `<h3>Tu historial</h3><ul class="results">${history.map((h) => `<li><span>${fmtDate(h.date)}</span><span>${setsText(h.e.sets)}${h.e.pain != null ? ` · dolor ${h.e.pain}` : ''}</span></li>`).join('')}</ul>` : ''}
    <button class="primary" data-close>Cerrar</button>`);
  $('#modal').querySelectorAll('[data-info]').forEach((el) => { el.onclick = () => openExercise(el.dataset.info); });
  $('#modal').querySelectorAll('[data-swap]').forEach((el) => {
    el.onclick = () => {
      const slot = el.dataset.swap;
      if (state.settings.swaps[slot] === id) delete state.settings.swaps[slot];
      else state.settings.swaps[slot] = id;
      save();
      openExercise(id);
      render();
    };
  });
}

// ---------- Progreso ----------
function renderProgress() {
  const vol = weeklySets(state.workouts);
  const max = WEEKLY_TARGET.max;
  const bw = profile().bodyweight;
  const exIds = [...new Set(state.workouts.flatMap((w) => w.entries.map((e) => e.exercise)))];
  const current = exIds.map((id) => {
    const prev = lastEntry(state.workouts, id);
    const slot = Object.values(ROUTINES).flatMap((r) => r.slots).find((s) => slotExercise(s, state.settings.swaps) === id);
    const sug = slot ? suggestFor(state.workouts, id, slot.reps, profile()) : null;
    return { id, prev, sug };
  });
  const unilateral = exIds.filter((id) => EXERCISES[id].unilateral)
    .map((id) => ({ id, a: asymmetry(lastEntry(state.workouts, id)?.sets) }))
    .filter((x) => x.a);
  main.innerHTML = `
    <h2>Progreso</h2>
    ${current.length ? `
    <section class="card">
      <h3>Tus pesos</h3>
      <p class="muted">Lo último que hiciste y lo que toca la próxima vez.</p>
      <table class="weights">
        <thead><tr><th>Ejercicio</th><th>Última vez</th><th>Próxima</th></tr></thead>
        <tbody>${current.map(({ id, prev, sug }) => `
          <tr data-info="${id}">
            <td>${esc(EXERCISES[id].name)}</td>
            <td>${setsText(prev.sets)}</td>
            <td><b>${sug?.weight != null ? `${sug.weight} kg × ${sug.reps}` : '—'}</b></td>
          </tr>`).join('')}</tbody>
      </table>
    </section>` : ''}
    ${unilateral.length ? `
    <section class="card">
      <h3>Pierna izquierda vs derecha</h3>
      <p class="muted">Diferencia en la mejor serie de la última sesión. Objetivo: menos de 10%.</p>
      ${unilateral.map(({ id, a }) => `
        <div class="vol"><span>${esc(EXERCISES[id].name)}</span>
        <div class="bar ${a.pct < 10 ? 'ok' : 'mid'}"><span style="width:${Math.min(100, a.pct * 3)}%"></span></div><b>${a.pct}%</b></div>`).join('')}
    </section>` : ''}
    <section class="card">
      <h3>Series por músculo esta semana</h3>
      <p class="muted">Objetivo: ${WEEKLY_TARGET.min}–${WEEKLY_TARGET.max} series duras</p>
      ${Object.entries(MUSCLES).map(([m, label]) => {
        const n = vol[m] || 0;
        const cls = n >= WEEKLY_TARGET.min ? 'ok' : n > 0 ? 'mid' : '';
        return `<div class="vol"><span>${label}</span><div class="bar ${cls}"><span style="width:${Math.min(100, (n / max) * 100)}%"></span><i style="left:${(WEEKLY_TARGET.min / max) * 100}%"></i></div><b>${n}</b></div>`;
      }).join('')}
    </section>
    ${exIds.length ? `
    <section class="card">
      <h3>Fuerza (1RM estimado)</h3>
      ${exIds.map((id) => {
        const points = state.workouts.map((w) => w.entries.find((e) => e.exercise === id)).filter(Boolean).map((e) => bestE1rm(e.sets, EXERCISES[id], bw));
        return `<div class="trend" data-info="${id}"><span>${esc(EXERCISES[id].name)}</span>${spark(points)}<b>${Math.round(points[points.length - 1])} kg</b></div>`;
      }).join('')}
    </section>` : ''}
    <section class="card">
      <h3>Historial</h3>
      ${state.workouts.length ? `<ul class="results">${state.workouts.slice().reverse().map((w) => `
        <li><span>${fmtDate(w.date)} · ${ROUTINES[w.routine].name}</span><span class="muted">${w.entries.reduce((a, e) => a + e.sets.length, 0)} series</span></li>`).join('')}</ul>`
        : '<p class="muted">Aún no hay entrenos. ¡El primero es el más importante!</p>'}
    </section>`;
  main.querySelectorAll('[data-info]').forEach((el) => { el.onclick = () => openExercise(el.dataset.info); });
}

function spark(points) {
  if (points.length < 2) return '<svg class="spark"></svg>';
  const w = 100, h = 28;
  const lo = Math.min(...points), hi = Math.max(...points);
  const xy = points.map((p, i) => `${(i / (points.length - 1)) * w},${h - 2 - ((p - lo) / (hi - lo || 1)) * (h - 4)}`);
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><polyline points="${xy.join(' ')}"/></svg>`;
}

// ---------- Ajustes ----------
function renderSettings() {
  const p = profile();
  main.innerHTML = `
    <h2>Ajustes</h2>
    <section class="card">
      <h3>Tu perfil</h3>
      <p class="muted">Lo que la app recuerda de ti para adaptar la rutina.</p>
      <label class="field">Pierna lesionada (va siempre primero)</label>
      <div class="seg">
        ${[['L', 'Izquierda'], ['R', 'Derecha']].map(([v, l]) => `<button data-side="${v}" class="${p.injuredSide === v ? 'active' : ''}">${l}</button>`).join('')}
      </div>
      <label class="field" for="bw">Peso corporal (kg) · para calcular la carga real en asistidos</label>
      <input id="bw" class="text" type="number" inputmode="decimal" step="0.1" min="0" value="${esc(p.bodyweight)}" placeholder="p. ej. 78">
      <label class="toggle"><input type="checkbox" id="recovery" ${p.recovery ? 'checked' : ''}>
        <span><b>Modo recuperación en piernas</b><br><small class="muted">Saltos de peso a la mitad, empieza ligero, y si marcas dolor &gt; ${PAIN_LIMIT}/10 te baja la carga la próxima vez.</small></span></label>
      <label class="field" for="notes">Notas</label>
      <textarea id="notes" rows="9">${esc(p.notes)}</textarea>
      <p class="muted small" id="saved"></p>
    </section>
    <section class="card">
      <h3>Días por semana</h3>
      <div class="seg">
        ${[2, 3].map((d) => `<button data-days="${d}" class="${state.settings.daysPerWeek === d ? 'active' : ''}">${d} días</button>`).join('')}
      </div>
      <p class="muted">${state.settings.daysPerWeek === 2
        ? 'Haz A y B (p. ej. lunes y jueves).'
        : 'Alterna A–B–A una semana y B–A–B la siguiente. Si acabas muy cansado, quita 1 serie por ejercicio.'}</p>
    </section>
    <section class="card">
      <h3>Reglas para crecer</h3>
      <ul>
        <li>Cada serie a 0–3 repeticiones del fallo (piernas: 2–3 en reserva mientras te recuperas).</li>
        <li>Rango completo, controlando la bajada.</li>
        <li>Cuando llegues al tope de reps en todas las series, sube peso (la app te avisa).</li>
        <li>Piernas: la sana nunca hace más que la lesionada. Sin saltos ni impacto hasta el alta.</li>
        <li>Proteína: 1,6–2,2 g/kg al día. Duerme 7–9 h.</li>
        <li>Cada 6–8 semanas, una semana de descarga con la mitad de series.</li>
      </ul>
    </section>
    <section class="card">
      <h3>Tus datos</h3>
      <p class="muted">Se guardan solo en este dispositivo. Exporta una copia de vez en cuando.</p>
      <button class="ghost" id="export">Exportar copia (JSON)</button>
      <label class="ghost file">Importar copia<input type="file" accept="application/json" id="import" hidden></label>
      <button class="ghost danger" id="reset">Borrar todo</button>
    </section>
    <p class="muted small">Imágenes: <a href="https://github.com/yuhonas/free-exercise-db" target="_blank" rel="noopener">free-exercise-db</a> (dominio público).</p>`;
  main.querySelectorAll('[data-side]').forEach((b) => {
    b.onclick = () => { p.injuredSide = b.dataset.side; save(); render(); };
  });
  $('#bw').onchange = (ev) => { p.bodyweight = ev.target.value === '' ? null : Number(ev.target.value); save(); };
  $('#recovery').onchange = (ev) => { p.recovery = ev.target.checked; save(); };
  $('#notes').oninput = (ev) => {
    p.notes = ev.target.value;
    save();
    $('#saved').textContent = 'Guardado ✓';
  };
  main.querySelectorAll('[data-days]').forEach((b) => {
    b.onclick = () => { state.settings.daysPerWeek = Number(b.dataset.days); save(); render(); };
  });
  $('#export').onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }));
    a.download = `me-vs-me-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };
  $('#import').onchange = async (ev) => {
    try {
      const data = JSON.parse(await ev.target.files[0].text());
      if (!Array.isArray(data.workouts)) throw new Error();
      state = hydrate(data);
      save();
      toast('Copia importada');
      render();
    } catch {
      toast('Ese archivo no es una copia de Me vs Me');
    }
  };
  $('#reset').onclick = async () => {
    if (!await ask('¿Borrar todos tus entrenos? No se puede deshacer.', 'Borrar todo')) return;
    state = defaults();
    save();
    render();
  };
}

// ---------- Diálogos propios (sin confirm/alert del navegador) ----------
function ask(message, okLabel) {
  return new Promise((resolve) => {
    openModal(`
      <p class="askText">${esc(message)}</p>
      <button class="primary" id="askOk">${esc(okLabel)}</button>
      <button class="ghost" id="askCancel">Cancelar</button>`);
    const done = (v) => { closeModal(); resolve(v); };
    $('#askOk').onclick = () => done(true);
    $('#askCancel').onclick = () => done(false);
    onModalDismiss = () => resolve(false);
  });
}

let toastTimer = null;
function toast(text) {
  const el = $('#toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2500);
}

// ---------- Modal ----------
let onModalDismiss = null;
let animTimer = null;
function openModal(html) {
  onModalDismiss = null;
  const m = $('#modal');
  $('#modalBody').innerHTML = html;
  m.hidden = false;
  $('#modalBody').scrollTop = 0;
  m.querySelectorAll('[data-close]').forEach((b) => { b.onclick = closeModal; });
  // Alterna posición inicial/final para simular el movimiento.
  clearInterval(animTimer);
  const anim = m.querySelector('.anim');
  if (anim) animTimer = setInterval(() => anim.classList.toggle('end'), 1200);
}
function closeModal() {
  clearInterval(animTimer);
  $('#modal').hidden = true;
}
$('#modal').onclick = (e) => {
  if (e.target.id !== 'modal') return;
  closeModal();
  onModalDismiss?.();
};

document.querySelectorAll('nav button').forEach((b) => {
  b.onclick = () => { view = b.dataset.view; render(); window.scrollTo(0, 0); };
});

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

render();
