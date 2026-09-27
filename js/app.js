import { EXERCISES, ROUTINES, MUSCLES, WEEKLY_TARGET, imgUrl } from './data.js';
import {
  suggest, lastEntry, newWorkout, nextRoutineKey, weeklySets, sessionsThisWeek, compare, bestE1rm,
} from './logic.js';

// ---------- Estado persistente ----------
const KEY = 'mevsme.v1';
const defaults = () => ({ settings: { daysPerWeek: 2, swaps: {} }, workouts: [], current: null });

function load() {
  try {
    return { ...defaults(), ...JSON.parse(localStorage.getItem(KEY)) };
  } catch {
    return defaults();
  }
}
let state = load();
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* almacenamiento no disponible */ }
}

// ---------- Utilidades ----------
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = (iso) => new Date(iso).toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' });
const setsText = (sets) => sets.filter((s) => s.done).map((s) => `${s.weight || 0}×${s.reps}`).join(', ');
const slotOf = (w, slotId) => ROUTINES[w.routine].slots.find((s) => s.id === slotId);

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
  main.innerHTML = `
    <section class="card hero">
      <p class="muted">Esta semana</p>
      <p class="big">${done} / ${goal} <span class="muted">entrenos</span></p>
      <div class="bar"><span style="width:${Math.min(100, (done / goal) * 100)}%"></span></div>
    </section>
    <section class="card">
      <p class="muted">Próximo entreno</p>
      <h2>${r.name}</h2>
      <ul class="plan">
        ${r.slots.map((s) => {
          const id = state.settings.swaps[s.id] || s.exercise;
          return `<li><img src="${imgUrl(id)}" alt="" loading="lazy"><span>${esc(EXERCISES[id].name)}</span><span class="muted">${s.sets}×${s.reps[0]}–${s.reps[1]}</span></li>`;
        }).join('')}
      </ul>
      <button class="primary" id="start">Empezar ${r.name}</button>
      <button class="ghost" id="startOther">Hacer ${ROUTINES[key === 'A' ? 'B' : 'A'].name} en su lugar</button>
    </section>`;
  $('#start').onclick = () => start(key);
  $('#startOther').onclick = () => start(key === 'A' ? 'B' : 'A');
}

function start(key) {
  state.current = newWorkout(key, state.workouts, state.settings.swaps);
  save();
  render();
}

function renderWorkout() {
  const w = state.current;
  let lastSuperset = null;
  main.innerHTML = `
    <h2>${ROUTINES[w.routine].name}</h2>
    ${w.entries.map((e, ei) => {
      const slot = slotOf(w, e.slot);
      const ex = EXERCISES[e.exercise];
      const prev = lastEntry(state.workouts, e.exercise);
      const sug = suggest(prev?.sets, slot.reps, ex.increment);
      const ssLabel = slot.superset && slot.superset !== lastSuperset ? '<p class="tag">Superserie ↓ alterna estos dos</p>' : '';
      lastSuperset = slot.superset || null;
      return `${ssLabel}
      <section class="card exercise ${slot.superset ? 'ss' : ''}">
        <header>
          <img src="${imgUrl(e.exercise)}" alt="" data-info="${e.exercise}" class="thumb">
          <div>
            <h3 data-info="${e.exercise}">${esc(ex.name)}</h3>
            <p class="muted">${slot.sets} series · ${slot.reps[0]}–${slot.reps[1]} reps · descanso ${Math.round(slot.rest / 60 * 10) / 10} min</p>
          </div>
        </header>
        <p class="hint">${prev ? `Última vez: <b>${setsText(prev.sets)}</b><br>` : ''}🎯 ${esc(sug.text)}</p>
        <div class="sets">
          <div class="row head"><span>#</span><span>kg</span><span>reps</span><span></span></div>
          ${e.sets.map((s, si) => `
            <div class="row ${s.done ? 'done' : ''}">
              <span>${si + 1}</span>
              <input type="number" inputmode="decimal" step="0.5" min="0" value="${esc(s.weight)}" data-e="${ei}" data-s="${si}" data-f="weight" placeholder="${sug.weight ?? ''}">
              <input type="number" inputmode="numeric" min="0" value="${esc(s.reps)}" data-e="${ei}" data-s="${si}" data-f="reps" placeholder="${sug.reps}">
              <button class="check" data-e="${ei}" data-s="${si}" aria-label="Completar serie">${s.done ? '✓' : '○'}</button>
            </div>`).join('')}
        </div>
        <button class="link" data-add="${ei}">+ serie</button>
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
      const s = e.sets[btn.dataset.s];
      const row = btn.closest('.row');
      // Si el campo está vacío usa la sugerencia (placeholder).
      for (const f of ['weight', 'reps']) {
        const inp = row.querySelector(`[data-f="${f}"]`);
        if (s[f] === '' && inp.placeholder) s[f] = Number(inp.placeholder);
      }
      s.done = !s.done;
      save();
      const slot = slotOf(w, e.slot);
      const nextSlot = ROUTINES[w.routine].slots[Number(btn.dataset.e) + 1];
      const inSuperset = slot.superset && nextSlot?.superset === slot.superset;
      if (s.done) startTimer(inSuperset ? 20 : slot.rest);
      renderWorkout();
    };
  });
  main.querySelectorAll('[data-add]').forEach((btn) => {
    btn.onclick = () => {
      const sets = w.entries[btn.dataset.add].sets;
      sets.push({ weight: sets[sets.length - 1]?.weight ?? '', reps: '', done: false });
      save();
      renderWorkout();
    };
  });
  main.querySelectorAll('[data-info]').forEach((el) => { el.onclick = () => openExercise(el.dataset.info); });
  $('#finish').onclick = finish;
  $('#discard').onclick = () => {
    if (!confirm('¿Descartar este entreno?')) return;
    state.current = null;
    save();
    render();
  };
}

function finish() {
  const w = state.current;
  const doneSets = w.entries.flatMap((e) => e.sets).filter((s) => s.done).length;
  if (!doneSets && !confirm('No has completado ninguna serie. ¿Terminar igualmente?')) return;
  const results = compare(w, state.workouts);
  w.entries.forEach((e) => { e.sets = e.sets.filter((s) => s.done); });
  w.entries = w.entries.filter((e) => e.sets.length);
  if (w.entries.length) state.workouts.push(w);
  state.current = null;
  save();
  stopTimer();
  const wins = results.filter((r) => r.diff > 0).length;
  const compared = results.filter((r) => r.before != null).length;
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
function renderLibrary() {
  const byMuscle = {};
  for (const [id, ex] of Object.entries(EXERCISES)) (byMuscle[ex.primary[0]] ||= []).push(id);
  main.innerHTML = `
    <h2>Ejercicios</h2>
    <p class="muted">Toca un ejercicio para ver la técnica.</p>
    ${Object.entries(MUSCLES).filter(([m]) => byMuscle[m]).map(([m, label]) => `
      <h3 class="group">${label}</h3>
      <div class="grid">
        ${byMuscle[m].map((id) => `
          <button class="tile" data-info="${id}">
            <img src="${imgUrl(id)}" alt="" loading="lazy">
            <span>${esc(EXERCISES[id].name)}</span>
          </button>`).join('')}
      </div>`).join('')}`;
  main.querySelectorAll('[data-info]').forEach((el) => { el.onclick = () => openExercise(el.dataset.info); });
}

function openExercise(id) {
  const ex = EXERCISES[id];
  const history = state.workouts
    .map((w) => ({ date: w.date, e: w.entries.find((x) => x.exercise === id) }))
    .filter((h) => h.e)
    .slice(-5)
    .reverse();
  // Slots donde este ejercicio (o su original) puede ir, para permitir sustituir.
  const slots = Object.values(ROUTINES).flatMap((r) => r.slots.map((s) => ({ ...s, routine: r.name })))
    .filter((s) => s.exercise !== id && EXERCISES[s.exercise].alternatives.includes(id));
  openModal(`
    <div class="anim" aria-label="Posición inicial y final">
      <img src="${imgUrl(id, 0)}" alt="${esc(ex.name)}: posición inicial">
      <img src="${imgUrl(id, 1)}" alt="${esc(ex.name)}: posición final">
    </div>
    <h2>${esc(ex.name)}</h2>
    <p class="chips">${ex.primary.map((m) => `<span class="chip">${MUSCLES[m]}</span>`).join('')}${ex.secondary.map((m) => `<span class="chip soft">${MUSCLES[m]}</span>`).join('')}</p>
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
    ${history.length ? `<h3>Tu historial</h3><ul class="results">${history.map((h) => `<li><span>${fmtDate(h.date)}</span><span>${setsText(h.e.sets)}</span></li>`).join('')}</ul>` : ''}
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
  const exIds = [...new Set(state.workouts.flatMap((w) => w.entries.map((e) => e.exercise)))];
  main.innerHTML = `
    <h2>Progreso</h2>
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
        const points = state.workouts.map((w) => w.entries.find((e) => e.exercise === id)).filter(Boolean).map((e) => bestE1rm(e.sets));
        return `<div class="trend" data-info="${id}"><span>${esc(EXERCISES[id].name)}</span>${spark(points)}<b>${points[points.length - 1]} kg</b></div>`;
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
  main.innerHTML = `
    <h2>Ajustes</h2>
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
        <li>Cada serie a 0–3 repeticiones del fallo.</li>
        <li>Rango completo, controlando la bajada.</li>
        <li>Cuando llegues al tope de reps en todas las series, sube peso (la app te avisa).</li>
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
      state = { ...defaults(), ...data };
      save();
      alert('Copia importada.');
      render();
    } catch {
      alert('El archivo no es una copia válida.');
    }
  };
  $('#reset').onclick = () => {
    if (!confirm('¿Borrar todos tus entrenos? No se puede deshacer.')) return;
    state = defaults();
    save();
    render();
  };
}

// ---------- Modal ----------
let animTimer = null;
function openModal(html) {
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
$('#modal').onclick = (e) => { if (e.target.id === 'modal') closeModal(); };

document.querySelectorAll('nav button').forEach((b) => {
  b.onclick = () => { view = b.dataset.view; render(); window.scrollTo(0, 0); };
});

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

render();
