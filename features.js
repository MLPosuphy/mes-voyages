/* ============================================================
   Mes Voyages — fonctionnalités étendues
   Chargé APRÈS app.js. C'est ici que l'application démarre.
   ============================================================ */

"use strict";

/* ===================== Utilitaires communs ===================== */

function addDaysISO(iso, delta) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + delta);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

function fmtH(h) {
  if (h < 1) return Math.round(h * 60) + " min";
  return Math.floor(h) + " h " + String(Math.round((h % 1) * 60)).padStart(2, "0");
}

function paysLabel(key) {
  return key.split(" ").map(w => w.split("-").map(p => p.charAt(0).toUpperCase() + p.slice(1)).join("-")).join(" ");
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ===================== Carte : durées et CO2 ===================== */

function estimateLeg(km, transport) {
  const x = TRANSPORT_EXTRA[transport] || TRANSPORT_EXTRA.voiture;
  return { h: km / x.speed + x.fixed, co2: Math.round(km * x.co2 / 1000) };
}

function tripEstimates(t) {
  const steps = t.steps || [];
  let km = 0, h = 0, co2 = 0;
  for (let i = 1; i < steps.length; i++) {
    // Distance et temps routés si disponibles (legMetrics), sinon estimation
    const m = (typeof legMetrics === "function") ? legMetrics(steps[i - 1], steps[i]) : { dist: haversineKm(steps[i - 1], steps[i]), dur: estimateLeg(haversineKm(steps[i - 1], steps[i]), steps[i].transport).h };
    const x = TRANSPORT_EXTRA[steps[i].transport] || TRANSPORT_EXTRA.voiture;
    km += m.dist; h += m.dur; co2 += Math.round(m.dist * x.co2 / 1000);
  }
  return { km, h, co2 };
}

/* ===================== Météo (Open-Meteo, gratuit) ===================== */

async function stepWeather(tripId, stepId) {
  const s = getTrip(tripId).steps.find(x => x.id === stepId);
  openModal("🌦️ Météo — " + esc(s.name), `<p class="muted">⏳ Chargement des prévisions…</p>`);
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${s.lat}&longitude=${s.lng}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=7`;
    const d = await (await fetch(url)).json();
    const rows = d.daily.time.map((day, i) => {
      const [emo, txt] = wmoInfo(d.daily.weather_code[i]);
      return `<div class="expense-row">
        <span class="exp-cat">${emo}</span>
        <div class="exp-label"><div>${fmtDate(day)}</div><div class="muted small">${txt} · ☔ ${d.daily.precipitation_probability_max[i] != null ? d.daily.precipitation_probability_max[i] : "–"}%</div></div>
        <span class="exp-amount">${Math.round(d.daily.temperature_2m_min[i])}° / ${Math.round(d.daily.temperature_2m_max[i])}°</span>
      </div>`;
    }).join("");
    document.getElementById("modal-body").innerHTML = rows + `<p class="muted small" style="margin-top:10px;">Prévisions Open-Meteo sur 7 jours.</p>`;
  } catch (e) {
    document.getElementById("modal-body").innerHTML = `<p class="muted">❌ Météo indisponible (connexion ?).</p>`;
  }
}

/* ===================== Où suis-je ? ===================== */

function whereAmI(tripId) {
  if (!navigator.geolocation) { toast("❌ Géolocalisation non disponible"); return; }
  toast("📡 Localisation en cours…");
  navigator.geolocation.getCurrentPosition(pos => {
    const { latitude: lat, longitude: lng } = pos.coords;
    const t = getTrip(tripId);
    if (window._leafletMap) {
      L.circleMarker([lat, lng], { radius: 9, color: "#e5484d", fillColor: "#e5484d", fillOpacity: 0.8 })
        .addTo(window._leafletMap).bindPopup("📍 Tu es ici !").openPopup();
      window._leafletMap.setView([lat, lng], Math.max(window._leafletMap.getZoom(), 7));
    }
    let best = null;
    (t.steps || []).forEach(s => {
      const d = haversineKm({ lat, lng }, s);
      if (!best || d < best.d) best = { s, d };
    });
    if (best) toast(`📍 Tu es à ${fmtKm(best.d)} de ${best.s.name}`);
  }, () => toast("❌ Localisation refusée ou impossible"));
}

/* ===================== Guide Wikipédia ===================== */

async function guideFor(title) {
  openModal("📖 " + esc(title), `<p class="muted">⏳ Recherche dans Wikipédia…</p>`);
  try {
    const d = await (await fetch("https://fr.wikipedia.org/api/rest_v1/page/summary/" + encodeURIComponent(title))).json();
    if (!d.extract) throw new Error("not found");
    document.getElementById("modal-body").innerHTML = `
      ${d.thumbnail ? `<img src="${d.thumbnail.source}" style="width:100%;border-radius:12px;margin-bottom:14px;" alt="">` : ""}
      <p style="line-height:1.6;">${esc(d.extract)}</p>
      <div class="form-actions"><a class="btn btn-secondary btn-sm" href="${d.content_urls.desktop.page}" target="_blank">Lire l'article complet ↗</a></div>`;
  } catch (e) {
    document.getElementById("modal-body").innerHTML = `<p class="muted">Pas de fiche trouvée pour « ${esc(title)} ». Essaie avec un nom plus simple (ex : la ville seule).</p>`;
  }
}

/* Wrappers par identifiant : les noms avec apostrophes casseraient un onclick inline */
function guideStep(tripId, stepId) {
  const s = getTrip(tripId).steps.find(x => x.id === stepId);
  if (s) guideFor(s.name);
}

function guideTrip(tripId) {
  const t = getTrip(tripId);
  guideFor((t.destination || t.country || "").split(",")[0].trim());
}

/* ===================== Onglet Préparatifs (todos) ===================== */

function renderPrepa(el, t) {
  t.todos = t.todos || [];
  const today = todayISO();
  const sorted = t.todos.slice().sort((a, b) => ((a.done ? "z" : "a") + (a.due || "9999")).localeCompare((b.done ? "z" : "a") + (b.due || "9999")));
  const done = t.todos.filter(x => x.done).length;
  const pct = t.todos.length ? Math.round(done / t.todos.length * 100) : 0;

  const rows = sorted.map(x => {
    const late = !x.done && x.due && x.due < today;
    return `
      <div class="pack-item ${x.done ? "done" : ""}">
        <input type="checkbox" id="td-${x.id}" ${x.done ? "checked" : ""} onchange="toggleTodo('${t.id}','${x.id}')">
        <label for="td-${x.id}">${esc(x.label)}
          ${x.due ? `<span class="small ${late ? "todo-late" : "muted"}" style="margin-left:8px;">📅 ${fmtDateShort(x.due)}${late ? " · EN RETARD !" : ""}</span>` : ""}
        </label>
        <button class="icon-btn" onclick="deleteTodo('${t.id}','${x.id}')">🗑️</button>
      </div>`;
  }).join("");

  el.innerHTML = `
    <div class="card" style="margin-bottom:18px;">
      <div class="row" style="margin-bottom:8px;">
        <h3 style="flex-shrink:0;">✅ Préparatifs (${done}/${t.todos.length})</h3>
        <div class="progress-pill"><div class="fill" style="width:${pct}%"></div></div>
      </div>
      <p class="muted small">Visa, passeport, assurance… génère la checklist type (adaptée au pays et datée par rapport au départ), puis complète-la.</p>
      <button class="btn btn-secondary btn-sm" style="margin-top:10px;" onclick="generateTodos('${t.id}')">⚡ Générer la checklist type</button>
    </div>
    <div class="card">
      <div class="form-row" style="margin-bottom:12px;align-items:flex-end;">
        <div class="form-group" style="margin:0;flex:2;"><label>Nouvelle tâche</label><input id="todo-new" placeholder="Ex : Réserver le parking de l'aéroport" onkeydown="if(event.key==='Enter')addTodo('${t.id}')"></div>
        <div class="form-group" style="margin:0;"><label>Échéance</label><input id="todo-due" type="date"></div>
        <button class="btn btn-primary btn-sm" style="margin-bottom:2px;" onclick="addTodo('${t.id}')">Ajouter</button>
      </div>
      ${rows || `<p class="muted" style="padding:10px 0;">Aucune tâche. Clique sur « ⚡ Générer la checklist type » pour démarrer.</p>`}
    </div>`;
}

function generateTodos(t_or_id) {
  const t = typeof t_or_id === "string" ? getTrip(t_or_id) : t_or_id;
  const info = countryInfo(t.country);
  const isEU = info && info.cont === "Europe";
  const existing = new Set((t.todos || []).map(x => x.label));
  let added = 0;
  CHECKLIST_ADMIN.forEach(c => {
    if (c.euOnly && !isEU) return;
    if (c.horsEU && isEU) return;
    if (existing.has(c.label)) return;
    t.todos.push({ id: uid(), label: c.label, due: t.start ? addDaysISO(t.start, -c.off) : "", done: false });
    added++;
  });
  saveState();
  renderTripDetail(document.getElementById("main"));
  toast(added ? `⚡ ${added} tâche(s) ajoutée(s)` : "La checklist type est déjà là !");
}

function addTodo(tripId) {
  const label = document.getElementById("todo-new").value.trim();
  if (!label) return;
  getTrip(tripId).todos.push({ id: uid(), label, due: document.getElementById("todo-due").value, done: false });
  saveState();
  renderTripDetail(document.getElementById("main"));
}

function toggleTodo(tripId, id) {
  const x = getTrip(tripId).todos.find(y => y.id === id);
  x.done = !x.done;
  saveState();
  renderTripDetail(document.getElementById("main"));
}

function deleteTodo(tripId, id) {
  const t = getTrip(tripId);
  t.todos = t.todos.filter(y => y.id !== id);
  saveState();
  renderTripDetail(document.getElementById("main"));
}

function todosAlertHTML() {
  const today = todayISO(), soon = addDaysISO(today, 7);
  const items = [];
  state.trips.forEach(t => {
    if (t.status === "termine") return;
    (t.todos || []).forEach(x => {
      if (!x.done && x.due && x.due <= soon) items.push({ t, x, late: x.due < today });
    });
  });
  if (!items.length) return "";
  items.sort((a, b) => a.x.due.localeCompare(b.x.due));
  const rows = items.slice(0, 5).map(({ t, x, late }) =>
    `<div class="row" style="padding:5px 0;cursor:pointer;" onclick="openTrip('${t.id}','prepa')">
      <span>${late ? "🔴" : "🟠"}</span>
      <span style="flex:1;">${esc(x.label)} <span class="muted small">— ${esc(t.title)}</span></span>
      <span class="small ${late ? "todo-late" : "muted"}">${fmtDateShort(x.due)}</span>
    </div>`).join("");
  return `<div class="card" style="margin-bottom:24px;border-left:4px solid var(--accent);">
    <h3>⏰ Préparatifs à ne pas oublier</h3>
    <div style="margin-top:8px;">${rows}</div>
    ${items.length > 5 ? `<p class="muted small" style="margin-top:6px;">… et ${items.length - 5} autre(s).</p>` : ""}
  </div>`;
}

/* ===================== Onglet Pratique ===================== */

function renderPratique(el, t) {
  t.shopping = t.shopping || [];
  const info = countryInfo(t.country);
  const langDefault = (info && info.lang) || "en";

  const shopRows = t.shopping.map(i => `
    <div class="pack-item ${i.done ? "done" : ""}">
      <input type="checkbox" id="sh-${i.id}" ${i.done ? "checked" : ""} onchange="toggleShopping('${t.id}','${i.id}')">
      <label for="sh-${i.id}">${esc(i.label)}</label>
      <button class="icon-btn" onclick="delShopping('${t.id}','${i.id}')">🗑️</button>
    </div>`).join("");

  el.innerHTML = `
    <div class="grid grid-2">
      <div class="card">
        <div class="row-between"><h3>${info ? info.flag : "🌍"} Fiche pays${t.country ? " — " + esc(t.country) : ""}</h3>
          ${t.destination || t.country ? `<button class="btn btn-ghost btn-sm" onclick="guideTrip('${t.id}')">📖 Guide</button>` : ""}</div>
        <div id="fiche-pays" style="margin-top:12px;"><p class="muted small">⏳ Chargement…</p></div>
      </div>
      <div class="card">
        <h3>🕐 Double horloge</h3>
        <div class="grid grid-2" style="margin-top:14px;">
          <div class="clock-box"><div class="clock-label">🏠 Maison</div><div class="clock-time" id="clock-home">--:--:--</div></div>
          <div class="clock-box"><div class="clock-label">📍 Sur place</div><div class="clock-time" id="clock-dest">--:--:--</div></div>
        </div>
        <p class="muted small" id="clock-note" style="margin-top:10px;"></p>
      </div>
      <div class="card">
        <h3>🆘 En cas d'urgence</h3>
        <p style="margin-top:10px;">Numéro d'urgence local : <b style="font-size:1.2rem;">${info ? (URGENCES[info.iso2] || "112") : "112 (Europe)"}</b></p>
        <p class="muted small" style="margin:4px 0 12px;">Le 112 fonctionne partout en Europe. Ambassades de France : diplomatie.gouv.fr</p>
        <div class="form-group"><label>Fiche ICE (contacts, groupe sanguin, allergies…) — pense à l'imprimer 🖨️</label>
          <textarea id="ice-text" placeholder="Contact d'urgence : …&#10;Groupe sanguin : …&#10;Allergies : …">${esc(t.ice || "")}</textarea></div>
        <button class="btn btn-secondary btn-sm" onclick="saveICE('${t.id}')">Enregistrer la fiche</button>
      </div>
      <div class="card">
        <h3>🎉 Jours fériés sur place</h3>
        <div id="feries" style="margin-top:12px;"><p class="muted small">⏳ Chargement…</p></div>
      </div>
      <div class="card">
        <div class="row-between">
          <h3>🗣️ Guide de conversation</h3>
          <select id="phrase-lang" class="transport-select" onchange="renderPhrasesTable(this.value)">
            ${Object.entries(PHRASES).map(([k, p]) => `<option value="${k}" ${k === langDefault ? "selected" : ""}>${p.label}</option>`).join("")}
          </select>
        </div>
        <div id="phrases" style="margin-top:12px;"></div>
      </div>
      <div class="card">
        <h3>🛒 Liste de courses</h3>
        <div class="row" style="margin:12px 0;">
          <input class="search-input" id="shop-new" placeholder="Ajouter… (Entrée)" onkeydown="if(event.key==='Enter')addShopping('${t.id}')">
          <button class="btn btn-primary btn-sm" onclick="addShopping('${t.id}')">＋</button>
        </div>
        ${shopRows || `<p class="muted small">Pratique pour les locations : pain, café, crème solaire…</p>`}
      </div>
      ${pratiqueExtraCards(t, info)}
    </div>`;

  renderPhrasesTable(langDefault);
  fillFichePays(t, info);
  fillFeries(t, info);
  startClocks(null, null);
}

function renderPhrasesTable(lang) {
  const el = document.getElementById("phrases");
  if (!el) return;
  const p = PHRASES[lang];
  el.innerHTML = `<table class="phrase-table">${PHRASES_FR.map((fr, i) =>
    `<tr><td class="muted">${esc(fr)}</td><td><b>${esc(p.list[i] || "")}</b></td>
      <td style="width:32px;text-align:right;"><button class="icon-btn" title="Écouter la prononciation" onclick="speakPhrase('${lang}',${i})">🔊</button></td></tr>`).join("")}</table>`;
}

async function fillFichePays(t, info) {
  const el = document.getElementById("fiche-pays");
  if (!el) return;
  if (!info) {
    el.innerHTML = `<p class="muted small">Pays non reconnu. Renseigne un pays dans les infos du voyage (✏️) — ex : Italie, Japon, États-Unis…</p>`;
    return;
  }
  try {
    window._countryCache = window._countryCache || {};
    let d = window._countryCache[info.iso2];
    if (!d) {
      d = await (await fetch(`https://restcountries.com/v3.1/alpha/${info.iso2}?fields=capital,currencies,languages,timezones,idd,car,population,region`)).json();
      window._countryCache[info.iso2] = d;
    }
    const monnaie = d.currencies ? Object.entries(d.currencies).map(([c, v]) => `${v.name} (${v.symbol || c})`).join(", ") : "—";
    const langues = d.languages ? Object.values(d.languages).join(", ") : "—";
    const tel = d.idd && d.idd.root ? d.idd.root + (d.idd.suffixes && d.idd.suffixes.length === 1 ? d.idd.suffixes[0] : "") : "—";
    const conduite = d.car && d.car.side === "left" ? "à GAUCHE ⚠️" : "à droite";
    const tz = d.timezones && d.timezones[0] ? d.timezones[0] : null;
    el.innerHTML = `
      <table class="phrase-table">
        <tr><td class="muted">Capitale</td><td><b>${esc((d.capital && d.capital[0]) || info.cap)}</b></td></tr>
        <tr><td class="muted">Monnaie</td><td><b>${esc(monnaie)}</b></td></tr>
        <tr><td class="muted">Langue(s)</td><td><b>${esc(langues)}</b></td></tr>
        <tr><td class="muted">Indicatif tél.</td><td><b>${esc(tel)}</b></td></tr>
        <tr><td class="muted">Conduite</td><td><b>${conduite}</b></td></tr>
        <tr><td class="muted">Population</td><td><b>${(+d.population || 0).toLocaleString("fr-FR")}</b></td></tr>
        <tr><td class="muted">Fuseau</td><td><b>${esc(tz || "—")}</b></td></tr>
      </table>`;
    if (tz) startClocks(parseUTCOffset(tz), t.country);
  } catch (e) {
    // Service injoignable : on retombe sur les infos locales de data.js
    el.innerHTML = `
      <table class="phrase-table">
        <tr><td class="muted">Capitale</td><td><b>${esc(info.cap)}</b></td></tr>
        <tr><td class="muted">Continent</td><td><b>${esc(info.cont)}</b></td></tr>
        <tr><td class="muted">Code pays</td><td><b>${info.iso2}</b></td></tr>
      </table>
      <p class="muted small" style="margin-top:8px;">ℹ️ Détails complets (monnaie, conduite, fuseau…) indisponibles pour le moment — service en ligne injoignable.</p>`;
  }
}

function parseUTCOffset(tz) {
  if (tz === "UTC") return 0;
  const m = tz.match(/UTC([+-])(\d{2}):(\d{2})/);
  if (!m) return null;
  return (m[1] === "-" ? -1 : 1) * (parseInt(m[2]) * 60 + parseInt(m[3]));
}

function startClocks(destOffsetMin, destLabel) {
  if (window._clockTimer) clearInterval(window._clockTimer);
  function tick() {
    const home = document.getElementById("clock-home");
    if (!home) { clearInterval(window._clockTimer); return; }
    home.textContent = new Date().toLocaleTimeString("fr-FR");
    const dest = document.getElementById("clock-dest");
    if (dest) {
      if (destOffsetMin == null) { dest.textContent = "—"; return; }
      dest.textContent = new Date(Date.now() + destOffsetMin * 60000).toLocaleTimeString("fr-FR", { timeZone: "UTC" });
      const note = document.getElementById("clock-note");
      if (note && !note.textContent) {
        const localOff = -new Date().getTimezoneOffset();
        const diff = (destOffsetMin - localOff) / 60;
        const adv = jetlagAdvice(diff);
        note.textContent = (diff === 0 ? "Aucun décalage horaire 👌" :
          `Décalage : ${diff > 0 ? "+" : ""}${diff} h ${diff > 0 ? "(plus tard qu'en France)" : "(plus tôt qu'en France)"} — heure standard, hors heure d'été locale.`) +
          (adv ? "\n" + adv : "");
      }
    }
  }
  tick();
  window._clockTimer = setInterval(tick, 1000);
}

async function fillFeries(t, info) {
  const el = document.getElementById("feries");
  if (!el) return;
  if (!info) { el.innerHTML = `<p class="muted small">Renseigne d'abord le pays du voyage.</p>`; return; }
  try {
    const year = (t.start || todayISO()).slice(0, 4);
    const d = await (await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/${info.iso2}`)).json();
    if (!Array.isArray(d) || !d.length) throw new Error("none");
    const rows = d.map(h => {
      const inTrip = t.start && t.end && h.date >= t.start && h.date <= t.end;
      return `<tr ${inTrip ? 'class="holiday-hit"' : ""}><td class="muted">${fmtDateShort(h.date)}</td><td>${inTrip ? "🎉 " : ""}${esc(h.localName)}</td></tr>`;
    }).join("");
    const hits = t.start && t.end ? d.filter(h => h.date >= t.start && h.date <= t.end).length : 0;
    el.innerHTML = `${hits ? `<p class="small" style="margin-bottom:8px;">🎉 <b>${hits} jour(s) férié(s) pendant ton séjour</b> — attention aux musées et commerces fermés !</p>` : ""}
      <div style="max-height:220px;overflow-y:auto;"><table class="phrase-table">${rows}</table></div>`;
  } catch (e) {
    el.innerHTML = `<p class="muted small">Jours fériés indisponibles pour ce pays (ou hors connexion).</p>`;
  }
}

function saveICE(tripId) {
  getTrip(tripId).ice = document.getElementById("ice-text").value.trim();
  saveState();
  toast("🆘 Fiche urgence enregistrée");
}

function addShopping(tripId) {
  const input = document.getElementById("shop-new");
  const label = input.value.trim();
  if (!label) return;
  getTrip(tripId).shopping.push({ id: uid(), label, done: false });
  saveState();
  renderTripDetail(document.getElementById("main"));
}

function toggleShopping(tripId, id) {
  const i = getTrip(tripId).shopping.find(x => x.id === id);
  i.done = !i.done;
  saveState();
  renderTripDetail(document.getElementById("main"));
}

function delShopping(tripId, id) {
  const t = getTrip(tripId);
  t.shopping = t.shopping.filter(x => x.id !== id);
  saveState();
  renderTripDetail(document.getElementById("main"));
}

/* ===================== Voyageurs et équilibre des comptes ===================== */

function budgetExtrasHTML(t) {
  t.people = t.people || [];
  const chips = t.people.map(p =>
    `<span class="country-chip">${p.emoji} ${esc(p.name)} <button class="icon-btn" style="padding:0 4px;" onclick="removePerson('${t.id}','${p.id}')">✕</button></span>`).join("");

  let balanceHTML = "";
  if (t.people.length >= 2) {
    t.transfers = t.transfers || [];
    const withPayer = (t.expenses || []).filter(e => e.payer && t.people.some(p => p.id === e.payer));
    const total = withPayer.reduce((s, e) => s + (+e.amount || 0), 0);
    const share = total / t.people.length;
    const nets = t.people.map(p => {
      const paid = withPayer.filter(e => e.payer === p.id).reduce((s, e) => s + (+e.amount || 0), 0);
      const sent = t.transfers.filter(x => x.from === p.id).reduce((s, x) => s + (+x.amount || 0), 0);
      const recv = t.transfers.filter(x => x.to === p.id).reduce((s, x) => s + (+x.amount || 0), 0);
      return { p, paid, sent, net: paid - share + sent - recv };
    });
    const rows = nets.map(x => `
      <div class="row-between" style="padding:6px 0;border-bottom:1px solid var(--border);">
        <span>${x.p.emoji} ${esc(x.p.name)} <span class="muted small">a payé ${fmtMoney(x.paid)}${x.sent ? ` · a remboursé ${fmtMoney(x.sent)}` : ""}</span></span>
        <b style="color:${x.net >= 0 ? "var(--success)" : "var(--danger)"}">${x.net >= 0 ? "+" : ""}${fmtMoney(x.net)}</b>
      </div>`).join("");
    const sugg = computeSettlements(nets);
    const suggRows = sugg.map(s => `
      <div class="row" style="padding:4px 0;">
        <span style="flex:1;">${s.from.emoji} ${esc(s.from.name)} → ${s.to.emoji} ${esc(s.to.name)} : <b>${fmtMoney(s.amount)}</b></span>
        <button class="btn btn-secondary btn-sm" title="Noter ce remboursement comme effectué"
          onclick="recordTransfer('${t.id}','${s.from.id}','${s.to.id}',${s.amount.toFixed(2)})">✅ C'est réglé</button>
      </div>`).join("");
    const histRows = t.transfers.map(x => {
      const from = t.people.find(p => p.id === x.from), to = t.people.find(p => p.id === x.to);
      return `<div class="row" style="padding:3px 0;">
        <span class="muted small" style="flex:1;">💸 ${from ? from.emoji + " " + esc(from.name) : "?"} a remboursé ${fmtMoney(x.amount)} à ${to ? to.emoji + " " + esc(to.name) : "?"} le ${fmtDateShort(x.date)}</span>
        <button class="icon-btn" title="Annuler ce remboursement" onclick="deleteTransfer('${t.id}','${x.id}')">🗑️</button>
      </div>`;
    }).join("");
    balanceHTML = `
      <div class="card" style="margin-top:18px;">
        <h3>⚖️ Équilibre des comptes</h3>
        <p class="muted small" style="margin-top:6px;">Basé sur les ${withPayer.length} dépense(s) avec un payeur (part égale : ${fmtMoney(share)} chacun)${t.transfers.length ? ", remboursements déduits" : ""}.</p>
        <div style="margin-top:10px;">${rows}</div>
        ${suggRows ? `<div style="margin-top:12px;"><b>💸 Pour équilibrer :</b>${suggRows}</div>` : `<p class="small" style="margin-top:10px;">✅ Les comptes sont équilibrés !</p>`}
        ${histRows ? `<div style="margin-top:12px;border-top:1px solid var(--border);padding-top:8px;">${histRows}</div>` : ""}
      </div>`;
  }

  return `
    <div class="card" style="margin-top:18px;">
      <h3>👥 Voyageurs</h3>
      <p class="muted small" style="margin:6px 0 10px;">Ajoute les voyageurs pour suivre qui paie quoi (façon Tricount) et attribuer les bagages.</p>
      <div style="margin-bottom:10px;">${chips || ""}</div>
      <div class="row">
        <input class="search-input" id="p-name" placeholder="Prénom…" onkeydown="if(event.key==='Enter')addPerson('${t.id}')">
        <button class="btn btn-primary btn-sm" onclick="addPerson('${t.id}')">Ajouter</button>
      </div>
    </div>
    ${balanceHTML}
    <div class="card" style="margin-top:18px;">
      <h3>💱 Convertisseur de devises</h3>
      <div class="row" style="margin-top:12px;flex-wrap:wrap;">
        <input class="search-input" id="conv-amount" type="number" value="100" style="max-width:130px;">
        <select id="conv-from" class="transport-select">${DEVISES_CONV.map(c => `<option ${c === (state.settings.currency || "EUR") ? "selected" : ""}>${c}</option>`).join("")}</select>
        <span>→</span>
        <select id="conv-to" class="transport-select">${DEVISES_CONV.map(c => `<option ${c === "USD" ? "selected" : ""}>${c}</option>`).join("")}</select>
        <button class="btn btn-secondary btn-sm" onclick="convertNow()">Convertir</button>
        <b id="conv-result" style="font-size:1.05rem;"></b>
      </div>
      <p class="muted small" style="margin-top:8px;">Taux du jour (open.er-api.com), mis en cache 24 h.</p>
    </div>`;
}

function addPerson(tripId) {
  const t = getTrip(tripId);
  const name = document.getElementById("p-name").value.trim();
  if (!name) return;
  t.people = t.people || [];
  t.people.push({ id: uid(), name, emoji: PERSON_EMOJIS[t.people.length % PERSON_EMOJIS.length] });
  saveState();
  renderTripDetail(document.getElementById("main"));
}

function removePerson(tripId, pid) {
  const t = getTrip(tripId);
  t.people = t.people.filter(p => p.id !== pid);
  (t.expenses || []).forEach(e => { if (e.payer === pid) e.payer = ""; });
  (t.packing || []).forEach(i => { if (i.owner === pid) i.owner = ""; });
  (t.defis || []).forEach(d => { if (d.by === pid) d.by = ""; });
  t.transfers = (t.transfers || []).filter(x => x.from !== pid && x.to !== pid);
  if (t.farewells) delete t.farewells[pid];
  saveState();
  renderTripDetail(document.getElementById("main"));
}

function payerName(t, pid) {
  const p = (t.people || []).find(x => x.id === pid);
  return p ? `${p.emoji} ${esc(p.name)}` : "";
}


async function convertNow() {
  const out = document.getElementById("conv-result");
  out.textContent = "⏳…";
  try {
    let cache = JSON.parse(localStorage.getItem("mesVoyages.rates") || "null");
    if (!cache || cache.date !== todayISO()) {
      const d = await (await fetch("https://open.er-api.com/v6/latest/EUR")).json();
      if (d.result !== "success") throw new Error("api");
      cache = { date: todayISO(), rates: d.rates };
      localStorage.setItem("mesVoyages.rates", JSON.stringify(cache));
    }
    const amount = +document.getElementById("conv-amount").value || 0;
    const from = document.getElementById("conv-from").value, to = document.getElementById("conv-to").value;
    const val = amount / cache.rates[from] * cache.rates[to];
    out.textContent = `= ${val.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} ${to}`;
  } catch (e) {
    out.textContent = "❌ taux indisponibles hors connexion";
  }
}

/* ===================== Bagages : propriétaires ===================== */

function packOwnerBtnHTML(t, item) {
  if (!(t.people || []).length) return "";
  const p = t.people.find(x => x.id === item.owner);
  return `<button class="icon-btn" title="Attribuer (clic pour changer)" onclick="cyclePackOwner('${t.id}','${item.id}')">${p ? p.emoji : "👜"}</button>`;
}

function cyclePackOwner(tripId, itemId) {
  const t = getTrip(tripId);
  const item = t.packing.find(x => x.id === itemId);
  const ids = ["", ...t.people.map(p => p.id)];
  item.owner = ids[(ids.indexOf(item.owner || "") + 1) % ids.length];
  saveState();
  renderTripDetail(document.getElementById("main"));
}

function packFilterHTML(t) {
  if (!(t.people || []).length) return "";
  const f = window._packFilter || "";
  const chip = (val, label) => `<button class="chip ${f === val ? "active" : ""}" onclick="window._packFilter='${val}';renderTripDetail(document.getElementById('main'))">${label}</button>`;
  return `<div class="filters" style="margin:10px 0 0;">${chip("", "Tous")}${chip("commun", "👜 Commun")}${t.people.map(p => chip(p.id, p.emoji + " " + esc(p.name))).join("")}</div>`;
}

function filterPackItems(t, items) {
  const f = window._packFilter || "";
  if (!f || !(t.people || []).length) return items;
  if (f === "commun") return items.filter(i => !i.owner);
  return items.filter(i => i.owner === f);
}

/* ===================== Journal : dictée, stickers, best-of ===================== */

function stickersHTML() {
  return `<div class="form-group"><label>Stickers (clic pour insérer) — et 🎤 pour dicter !</label>
    <div class="row" style="flex-wrap:wrap;gap:4px;">
      <button type="button" class="icon-btn" style="font-size:1.2rem;" onclick="toggleDictation()" id="mic-btn" title="Dicter à la voix">🎤</button>
      ${STICKERS.map(s => `<button type="button" class="icon-btn" style="font-size:1.1rem;" onclick="addSticker('${s}')">${s}</button>`).join("")}
    </div></div>`;
}

function addSticker(s) {
  const ta = document.getElementById("j-content");
  if (ta) { ta.value += (ta.value && !ta.value.endsWith(" ") ? " " : "") + s + " "; ta.focus(); }
}

function toggleDictation() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { toast("❌ Dictée non supportée par ce navigateur (essaie Chrome/Edge)"); return; }
  if (window._rec) { window._rec.stop(); return; }
  const rec = new SR();
  window._rec = rec;
  rec.lang = "fr-FR";
  rec.continuous = true;
  rec.interimResults = false;
  const btn = document.getElementById("mic-btn");
  if (btn) btn.style.background = "var(--danger)";
  toast("🎤 Dictée en cours… reclique sur le micro pour arrêter");
  rec.onresult = ev => {
    const ta = document.getElementById("j-content");
    if (!ta) return;
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      if (ev.results[i].isFinal) ta.value += (ta.value ? " " : "") + ev.results[i][0].transcript.trim();
    }
  };
  rec.onend = () => {
    window._rec = null;
    const b = document.getElementById("mic-btn");
    if (b) b.style.background = "";
  };
  rec.onerror = () => toast("❌ Erreur de dictée (micro autorisé ?)");
  rec.start();
}

function bestOfHTML(t) {
  if (t.status !== "termine") return "";
  const a = t.awards || {};
  const field = (key, label, ph) => `
    <div class="form-group"><label>${label}</label>
      <input id="bo-${key}" value="${esc(a[key] || "")}" placeholder="${ph}"></div>`;
  return `
    <div class="card" style="margin-bottom:18px;border-left:4px solid var(--accent);">
      <h3>🏆 Best-of du voyage</h3>
      <p class="muted small" style="margin:6px 0 12px;">Le palmarès à remplir au retour — un plaisir à relire des années après.</p>
      <div class="form-row">
        ${field("moment", "🌟 Meilleur moment", "Le coucher de soleil sur…")}
        ${field("repas", "🍽️ Meilleur repas", "Les pâtes de la trattoria…")}
      </div>
      <div class="form-row">
        ${field("paysage", "📸 Plus beau paysage", "La vue depuis…")}
        ${field("galere", "😱 Plus grosse galère", "Le train raté à…")}
      </div>
      <div class="form-row">
        <div class="form-group"><label>⭐ Note globale</label>
          <select id="bo-note">${[5, 4, 3, 2, 1].map(n => `<option value="${n}" ${a.note == n ? "selected" : ""}>${"★".repeat(n)}${"☆".repeat(5 - n)}</option>`).join("")}</select></div>
        <div class="form-group" style="display:flex;align-items:flex-end;gap:8px;flex-direction:row;">
          <button class="btn btn-primary btn-sm" onclick="saveBestOf('${t.id}')">Enregistrer le palmarès</button>
          <button class="btn btn-secondary btn-sm" title="Tout le voyage (photos, journal, budget…) dans une page à garder" onclick="openAlbumOptions('${t.id}')">📕 Générer l'album souvenir${t.albumAt ? " (déjà créé le " + fmtDateShort(t.albumAt) + ")" : ""}</button>
        </div>
      </div>
      ${farewellHTML(t)}
    </div>`;
}

/* ===================== Mot de la fin par voyageur ===================== */

function farewellHTML(t) {
  if (!(t.people || []).length) return "";
  t.farewells = t.farewells || {};
  const rows = t.people.map(p => `
    <div class="form-group">
      <label>${p.emoji} ${esc(p.name)} — son mot de la fin</label>
      <textarea id="fw-${p.id}" placeholder="Ce que ${esc(p.name)} retient du voyage…" style="min-height:60px;">${esc(t.farewells[p.id] || "")}</textarea>
    </div>`).join("");
  return `<div style="border-top:1px solid var(--border);margin-top:14px;padding-top:12px;">
    <b class="small">✍️ Le mot de la fin de chacun</b>
    <p class="muted small" style="margin:4px 0 10px;">Chaque voyageur laisse sa trace — un régal à relire des années après. Apparaît dans l'album souvenir.</p>
    ${rows}
    <button class="btn btn-secondary btn-sm" onclick="saveFarewells('${t.id}')">Enregistrer les mots</button>
  </div>`;
}

function saveFarewells(tripId) {
  const t = getTrip(tripId);
  t.farewells = {};
  (t.people || []).forEach(p => {
    const el = document.getElementById("fw-" + p.id);
    if (el && el.value.trim()) t.farewells[p.id] = el.value.trim();
  });
  saveState();
  toast("✍️ Mots de la fin enregistrés !");
}

function saveBestOf(tripId) {
  const t = getTrip(tripId);
  t.awards = {
    moment: document.getElementById("bo-moment").value.trim(),
    repas: document.getElementById("bo-repas").value.trim(),
    paysage: document.getElementById("bo-paysage").value.trim(),
    galere: document.getElementById("bo-galere").value.trim(),
    note: +document.getElementById("bo-note").value
  };
  saveState();
  toast("🏆 Palmarès enregistré !");
}

/* ===================== Pièces jointes (IndexedDB) ===================== */

function fdb() {
  if (window._fdb) return Promise.resolve(window._fdb);
  // On met en cache la promesse d'ouverture : si plusieurs vignettes/popups
  // demandent la base en même temps (planisphère), on n'ouvre qu'UNE seule connexion.
  if (window._fdbOpening) return window._fdbOpening;
  window._fdbOpening = new Promise((res, rej) => {
    const rq = indexedDB.open("mesVoyagesFiles", 1);
    rq.onupgradeneeded = () => {
      const st = rq.result.createObjectStore("files", { keyPath: "id" });
      st.createIndex("owner", "owner");
    };
    rq.onsuccess = () => { window._fdb = rq.result; window._fdbOpening = null; res(rq.result); };
    rq.onerror = () => { window._fdbOpening = null; rej(rq.error); };
  });
  return window._fdbOpening;
}

async function fdbList(owner) {
  const db = await fdb();
  return new Promise((res, rej) => {
    const rq = db.transaction("files").objectStore("files").index("owner").getAll(owner);
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(rq.error);
  });
}

async function fdbGet(id) {
  const db = await fdb();
  return new Promise((res, rej) => {
    const rq = db.transaction("files").objectStore("files").get(id);
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(rq.error);
  });
}

// Les photos de téléphone dépassent souvent 4 Mo : on les compresse au lieu de les refuser.
async function normalizeFileBlob(f) {
  if (f.type.startsWith("image/") && f.size > 4 * 1024 * 1024) {
    try {
      const small = await compressImageBlob(f, 2200, 0.85);
      if (small) return { blob: small, type: "image/jpeg" };
    } catch (e) { /* format non compressible : on garde l'original */ }
  }
  if (f.size > 12 * 1024 * 1024) return null; // vraiment trop gros (gros PDF…)
  return { blob: f, type: f.type };
}

async function attachFilesList(owner, files) {
  let added = 0;
  for (const f of files) {
    const norm = await normalizeFileBlob(f);
    if (!norm) { toast(`⚠️ ${f.name} dépasse 12 Mo, ignoré`); continue; }
    const db = await fdb();
    await new Promise((res, rej) => {
      const tx = db.transaction("files", "readwrite");
      tx.objectStore("files").put({ id: uid(), owner, name: f.name, type: norm.type, blob: norm.blob });
      tx.oncomplete = res;
      tx.onerror = () => rej(tx.error);
    });
    added++;
  }
  loadAttachZones();
  if (added) toast(`📎 ${added} pièce(s) jointe(s) ajoutée(s)`);
  return added;
}

async function attachFile(owner, input) {
  await attachFilesList(owner, [...input.files]);
  input.value = "";
}

// Supprime toutes les pièces jointes d'un élément (journal, document, étape, photo géolocalisée)
async function deleteAttachmentsFor(owner) {
  try {
    const files = await fdbList(owner);
    if (!files.length) return;
    const db = await fdb();
    await new Promise(res => {
      const tx = db.transaction("files", "readwrite");
      files.forEach(f => tx.objectStore("files").delete(f.id));
      tx.oncomplete = res;
      tx.onerror = res;
    });
  } catch (e) { /* IndexedDB indisponible */ }
}

// Nettoie les pièces jointes d'un voyage entier (utilisé quand la corbeille est vidée)
function deleteTripAttachments(t) {
  (t.journal || []).forEach(j => deleteAttachmentsFor(j.id));
  (t.documents || []).forEach(d => deleteAttachmentsFor(d.id));
  (t.steps || []).forEach(s => deleteAttachmentsFor(s.id));
  (t.geophotos || []).forEach(p => deleteAttachmentsFor("geo:" + p.id));
  (t.expenses || []).forEach(e => deleteAttachmentsFor(e.id));          // tickets de dépense
  (t.defis || []).forEach(d => deleteAttachmentsFor("defi:" + d.id));   // photos-preuve des défis
  (t.itemTrash || []).forEach(x => deleteAttachmentsFor(x.item.id));    // éléments en corbeille interne
}

async function deleteAttachment(id) {
  const db = await fdb();
  await new Promise((res, rej) => {
    const tx = db.transaction("files", "readwrite");
    tx.objectStore("files").delete(id);
    tx.oncomplete = res;
    tx.onerror = () => rej(tx.error);
  });
  loadAttachZones();
}

async function viewAttachment(id) {
  const rec = await fdbGet(id);
  if (!rec) return;
  const url = URL.createObjectURL(rec.blob);
  if (rec.type.startsWith("image/")) {
    openModal("🖼️ " + esc(rec.name), `<img src="${url}" style="max-width:100%;border-radius:12px;" alt="">`);
  } else {
    window.open(url, "_blank");
  }
}

function attachZoneHTML(ownerId) {
  return `
    <div class="row" style="margin-top:10px;">
      <label class="btn btn-ghost btn-sm" style="cursor:pointer;">📎 Joindre billet / photo / PDF
        <input type="file" accept="image/*,application/pdf" multiple style="display:none" onchange="attachFile('${ownerId}',this)">
      </label>
    </div>
    <div class="attach-zone" data-owner="${ownerId}"></div>`;
}

function loadAttachZones() {
  document.querySelectorAll(".attach-zone").forEach(async zone => {
    try {
      const files = await fdbList(zone.dataset.owner);
      zone.innerHTML = files.map(f => {
        if (f.type.startsWith("image/")) {
          const url = URL.createObjectURL(f.blob);
          return `<span class="attach-item"><img class="attach-thumb" src="${url}" onclick="viewAttachment('${f.id}')" alt="${esc(f.name)}" title="${esc(f.name)}"><button class="icon-btn" onclick="deleteAttachment('${f.id}')">🗑️</button></span>`;
        }
        if (f.type.startsWith("audio/")) {
          const url = URL.createObjectURL(f.blob);
          return `<span class="attach-item" title="🎙️ ${esc(f.name)}"><audio controls src="${url}" style="height:34px;max-width:230px;"></audio><button class="icon-btn" onclick="deleteAttachment('${f.id}')">🗑️</button></span>`;
        }
        return `<span class="attach-item"><button class="chip" onclick="viewAttachment('${f.id}')">📄 ${esc(f.name)}</button><button class="icon-btn" onclick="deleteAttachment('${f.id}')">🗑️</button></span>`;
      }).join("");
    } catch (e) { /* IndexedDB indisponible */ }
  });
}

/* ===================== Photos géolocalisées sur la carte ===================== */

// Lit les métadonnées EXIF d'une photo JPEG (GPS + date de prise de vue), sans librairie externe.
function readExifMeta(file) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const view = new DataView(e.target.result);
        if (view.getUint16(0) !== 0xFFD8) return resolve(null); // pas un JPEG
        let offset = 2;
        while (offset + 4 <= view.byteLength) {
          const marker = view.getUint16(offset);
          if (marker === 0xFFE1) return resolve(parseExifAll(view, offset + 4));
          if ((marker & 0xFF00) !== 0xFF00) return resolve(null);
          offset += 2 + view.getUint16(offset + 2);
        }
        resolve(null);
      } catch (err) { resolve(null); }
    };
    reader.onerror = () => resolve(null);
    reader.readAsArrayBuffer(file.slice(0, 256 * 1024)); // l'EXIF se trouve en tête de fichier
  });
}

// Compatibilité : ne renvoie que les coordonnées GPS
async function readExifGps(file) {
  const meta = await readExifMeta(file);
  return meta && meta.gps ? meta.gps : null;
}

function parseExifAll(view, start) {
  if (view.getUint32(start) !== 0x45786966) return null; // "Exif"
  const tiff = start + 6;
  const bo = view.getUint16(tiff);
  const little = bo === 0x4949;
  if (!little && bo !== 0x4D4D) return null;
  const u16 = o => view.getUint16(o, little);
  const u32 = o => view.getUint32(o, little);
  const ifd0 = tiff + u32(tiff + 4);
  let gpsIfd = 0, exifIfd = 0;
  const n0 = u16(ifd0);
  for (let i = 0; i < n0; i++) {
    const e = ifd0 + 2 + i * 12;
    if (u16(e) === 0x8825) gpsIfd = tiff + u32(e + 8);   // IFD GPS
    if (u16(e) === 0x8769) exifIfd = tiff + u32(e + 8);  // IFD Exif (date…)
  }
  const out = { gps: null, date: null };

  if (gpsIfd) {
    const gps = {};
    const ng = u16(gpsIfd);
    for (let i = 0; i < ng; i++) {
      const e = gpsIfd + 2 + i * 12;
      gps[u16(e)] = e + 8; // tag -> offset de la valeur
    }
    if (gps[2] != null && gps[4] != null) {
      const rational = o => u32(o) / u32(o + 4);
      const dms = valOff => {
        const o = tiff + u32(valOff); // 3 rationnels (degrés, minutes, secondes)
        return rational(o) + rational(o + 8) / 60 + rational(o + 16) / 3600;
      };
      let lat = dms(gps[2]);
      let lng = dms(gps[4]);
      if (gps[1] != null && String.fromCharCode(view.getUint8(gps[1])) === "S") lat = -lat;
      if (gps[3] != null && String.fromCharCode(view.getUint8(gps[3])) === "W") lng = -lng;
      if (isFinite(lat) && isFinite(lng) && !(lat === 0 && lng === 0)) out.gps = { lat, lng };
    }
  }

  if (exifIfd) {
    const ne = u16(exifIfd);
    for (let i = 0; i < ne; i++) {
      const e = exifIfd + 2 + i * 12;
      if (u16(e) === 0x9003) { // DateTimeOriginal "YYYY:MM:DD HH:MM:SS"
        const cnt = u32(e + 4);
        const off = cnt > 4 ? tiff + u32(e + 8) : e + 8;
        let s = "";
        for (let k = 0; k < Math.min(cnt, 19); k++) s += String.fromCharCode(view.getUint8(off + k));
        const m = s.match(/^(\d{4}):(\d{2}):(\d{2})/);
        if (m) out.date = `${m[1]}-${m[2]}-${m[3]}`;
        break;
      }
    }
  }

  return (out.gps || out.date) ? out : null;
}

async function importGeoPhotos(tripId, input) {
  const t = getTrip(tripId);
  t.geophotos = t.geophotos || [];
  const box = document.getElementById("geo-import-status");
  if (box) box.textContent = "⏳ Lecture des photos…";
  let added = 0, skipped = 0;
  for (const f of input.files) {
    if (!f.type.startsWith("image/")) { skipped++; continue; }
    // Important : lire le GPS + la date AVANT la compression (qui supprime les métadonnées EXIF)
    const meta = await readExifMeta(f);
    const gps = meta && meta.gps;
    if (!gps) { skipped++; continue; }
    const date = (meta && meta.date) || (typeof planPhotoDate === "function" ? planPhotoDate({ name: f.name }, null) : null);
    const norm = await normalizeFileBlob(f);
    if (!norm) { skipped++; continue; }
    const id = uid();
    const db = await fdb();
    await new Promise((res, rej) => {
      const tx = db.transaction("files", "readwrite");
      tx.objectStore("files").put({ id, owner: "geo:" + id, name: f.name, type: norm.type, blob: norm.blob });
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
    t.geophotos.push(date ? { id, name: f.name, lat: gps.lat, lng: gps.lng, date } : { id, name: f.name, lat: gps.lat, lng: gps.lng });
    added++;
  }
  input.value = "";
  saveState();
  renderTripDetail(document.getElementById("main"));
  if (added) toast(`📷 ${added} photo(s) placée(s) sur la carte${skipped ? ` · ${skipped} sans GPS ignorée(s)` : ""}`);
  else if (skipped) toast("Aucune coordonnée GPS trouvée dans ces photos 🗺️ (souvent retirées par WhatsApp & co)");
}

async function deleteGeoPhoto(tripId, id) {
  const t = getTrip(tripId);
  t.geophotos = (t.geophotos || []).filter(p => p.id !== id);
  try {
    const db = await fdb();
    await new Promise(res => { const tx = db.transaction("files", "readwrite"); tx.objectStore("files").delete(id); tx.oncomplete = res; tx.onerror = res; });
  } catch (e) {}
  saveState();
  renderTripDetail(document.getElementById("main"));
  toast("🗑️ Photo retirée de la carte");
}

// Galerie de vignettes sous la carte
function geoPhotoGalleryHTML(t) {
  const n = (t.geophotos || []).length;
  if (!n) return "";
  return `<div class="card" style="margin-top:18px;">
    <h3 style="margin-bottom:4px;">📷 Photos géolocalisées (${n})</h3>
    <p class="muted small" style="margin-bottom:10px;">Clique une vignette pour la situer sur la carte.</p>
    <div class="geo-gallery" id="geo-gallery-${t.id}"></div>
  </div>`;
}

function loadGeoGallery(t) {
  const box = document.getElementById("geo-gallery-" + t.id);
  if (!box) return;
  box.innerHTML = (t.geophotos || []).map(p =>
    `<span class="attach-item">
      <img class="attach-thumb" data-geo="${p.id}" alt="${esc(p.name)}" title="${esc(p.name)}" onclick="focusGeoPhoto('${t.id}','${p.id}')">
      <button class="icon-btn" onclick="deleteGeoPhoto('${t.id}','${p.id}')">🗑️</button>
    </span>`).join("");
  (t.geophotos || []).forEach(async p => {
    const rec = await fdbGet(p.id);
    if (!rec) return;
    const img = box.querySelector(`img[data-geo="${p.id}"]`);
    if (img) img.src = URL.createObjectURL(rec.blob);
  });
}

function focusGeoPhoto(tripId, id) {
  const p = (getTrip(tripId).geophotos || []).find(x => x.id === id);
  if (!p || !window._leafletMap) return;
  window._leafletMap.setView([p.lat, p.lng], 13);
  const m = (window._geoMarkers || {})[id];
  if (m) m.openPopup();
}

// Marqueurs « photo » sur la carte (appelé depuis initStepMap)
function addGeoPhotoMarkers(map, t, pts) {
  window._geoMarkers = {};
  (t.geophotos || []).forEach(p => {
    const m = L.marker([p.lat, p.lng], {
      icon: L.divIcon({ className: "leg-emoji-icon", html: `<div class="photo-marker">📷</div>`, iconSize: [30, 30], iconAnchor: [15, 15] })
    }).addTo(map);
    window._geoMarkers[p.id] = m;
    bindPhotoPopup(m, p.id, p.name);
    pts.push([p.lat, p.lng]);
  });
}

// Popup qui charge la photo à l'ouverture (depuis IndexedDB)
function bindPhotoPopup(marker, fileId, title) {
  const head = `<b>📷 ${esc(title)}</b>`;
  marker.bindPopup(`<div style="text-align:center;">${head}<br><span class="muted small">Chargement…</span></div>`);
  marker.on("popupopen", async () => {
    // L'object URL précédent (popup rouvert) est révoqué pour ne pas fuir en mémoire.
    if (marker._phUrl) { try { URL.revokeObjectURL(marker._phUrl); } catch (e) {} marker._phUrl = null; }
    let rec = null;
    try { rec = await fdbGet(fileId); } catch (e) { /* IndexedDB indisponible */ }
    if (!rec || !rec.blob) {
      // Cas fréquent : le carnet (texte) est synchronisé via pCloud mais la photo
      // vit dans l'IndexedDB de l'appareil — donc absente sur un autre appareil.
      marker.setPopupContent(`<div style="text-align:center;">${head}<br><span class="muted small">📭 Photo absente de cet appareil<br>(importe le ZIP de sauvegarde pour la voir)</span></div>`);
      return;
    }
    const url = URL.createObjectURL(rec.blob);
    marker._phUrl = url;
    marker.setPopupContent(`<div style="text-align:center;">${head}<br>
      <img src="${url}" style="max-width:220px;max-height:180px;border-radius:8px;margin-top:6px;cursor:pointer;" onclick="viewAttachment('${fileId}')"></div>`);
  });
  marker.on("popupclose", () => {
    if (marker._phUrl) { try { URL.revokeObjectURL(marker._phUrl); } catch (e) {} marker._phUrl = null; }
  });
}

// Ajoute les photos jointes à une étape dans son popup
function enrichStepPopup(marker, stepId, baseHTML) {
  marker.on("popupopen", async () => {
    let imgs = [];
    try { imgs = (await fdbList(stepId)).filter(f => f.type.startsWith("image/")); } catch (e) {}
    if (!imgs.length) return;
    const thumbs = imgs.map(f =>
      `<img src="${URL.createObjectURL(f.blob)}" style="width:54px;height:54px;object-fit:cover;border-radius:6px;margin:4px 4px 0 0;cursor:pointer;" onclick="viewAttachment('${f.id}')">`).join("");
    marker.setPopupContent(baseHTML + `<div style="margin-top:6px;max-width:206px;">${thumbs}</div>`);
  });
}

/* ===================== Onglet Jeux ===================== */

function renderJeux(el, t) {
  el.innerHTML = `
    <div class="card" style="margin-bottom:16px;">
      <h3>🏅 Chasse aux défis</h3>
      <div id="defis-zone">${defisHTML(t)}</div>
    </div>
    <div class="grid grid-2">
      <div class="card">
        <h3>🚗 Bingo du trajet</h3>
        <p class="muted small" style="margin:6px 0 12px;">Le premier qui repère tout ce qui est sur sa grille a gagné !</p>
        <div id="bingo-zone">${bingoHTML(t)}</div>
      </div>
      <div class="card">
        <h3>🧠 Quiz des pays</h3>
        <p class="muted small" style="margin:6px 0 12px;">Capitales et drapeaux — qui sera le champion de la voiture ?</p>
        <div id="quiz-zone"><button class="btn btn-primary btn-sm" onclick="startQuiz()">▶️ Lancer un quiz (8 questions)</button>${leaderboardHTML()}</div>
      </div>
      <div class="card">
        <h3>🪢 Le pendu du voyageur</h3>
        <p class="muted small" style="margin:6px 0 12px;">Devine le mot sur le thème du voyage avant le bonhomme !</p>
        <div id="pendu-zone" style="text-align:center;"><button class="btn btn-primary btn-sm" onclick="startPendu()">▶️ Nouveau mot</button></div>
      </div>
      <div class="card">
        <h3>🎲 Tirage au sort</h3>
        <p class="muted small" style="margin:6px 0 12px;">Qui choisit le resto ce soir ? Qui prend la fenêtre ?</p>
        <input class="search-input" id="tirage-names" placeholder="Prénoms séparés par des virgules"
          value="${esc((t.people || []).map(p => p.name).join(", "))}">
        <div class="row" style="margin-top:10px;">
          <button class="btn btn-primary btn-sm" onclick="tirageSort()">🎲 Tirer au sort</button>
          <b id="tirage-result" style="font-size:1.15rem;"></b>
        </div>
      </div>
      <div class="card">
        <h3>🌍 Devine où ?</h3>
        <p class="muted small" style="margin:6px 0 12px;">Une de tes photos s'affiche : devine où elle a été prise en cliquant sur la carte !</p>
        <div id="guess-zone">${typeof guessWhereLaunchHTML === "function" ? guessWhereLaunchHTML(t) : ""}</div>
      </div>
    </div>`;
  loadAttachZones();
}

function bingoHTML(t) {
  if (!t.bingo) {
    return `<div class="row">
      <button class="btn btn-secondary btn-sm" onclick="startBingo('${t.id}',3)">Nouvelle grille 3×3</button>
      <button class="btn btn-secondary btn-sm" onclick="startBingo('${t.id}',4)">Nouvelle grille 4×4</button>
    </div>`;
  }
  const size = Math.sqrt(t.bingo.cells.length);
  return `
    <div class="bingo-grid" style="grid-template-columns:repeat(${size},1fr);">
      ${t.bingo.cells.map((c, i) => `<button class="bingo-cell ${c.found ? "found" : ""}" onclick="toggleBingoCell('${t.id}',${i})">${esc(c.label)}</button>`).join("")}
    </div>
    <button class="btn btn-ghost btn-sm" style="margin-top:10px;" onclick="startBingo('${t.id}',${size})">🔄 Nouvelle grille</button>`;
}

function startBingo(tripId, size) {
  const t = getTrip(tripId);
  t.bingo = { cells: shuffle(BINGO_ITEMS).slice(0, size * size).map(label => ({ label, found: false })), wonLines: [] };
  saveState();
  document.getElementById("bingo-zone").innerHTML = bingoHTML(t);
}

function toggleBingoCell(tripId, i) {
  const t = getTrip(tripId);
  t.bingo.cells[i].found = !t.bingo.cells[i].found;
  const n = Math.sqrt(t.bingo.cells.length);
  const lines = [];
  for (let r = 0; r < n; r++) lines.push({ key: "r" + r, idx: Array.from({ length: n }, (_, c) => r * n + c) });
  for (let c = 0; c < n; c++) lines.push({ key: "c" + c, idx: Array.from({ length: n }, (_, r) => r * n + c) });
  lines.push({ key: "d1", idx: Array.from({ length: n }, (_, k) => k * n + k) });
  lines.push({ key: "d2", idx: Array.from({ length: n }, (_, k) => k * n + (n - 1 - k)) });
  t.bingo.wonLines = t.bingo.wonLines || [];
  lines.forEach(l => {
    const full = l.idx.every(ix => t.bingo.cells[ix].found);
    const known = t.bingo.wonLines.includes(l.key);
    if (full && !known) { t.bingo.wonLines.push(l.key); toast("🎉 BINGO ! Ligne complète !"); }
    if (!full && known) t.bingo.wonLines = t.bingo.wonLines.filter(k => k !== l.key);
  });
  saveState();
  document.getElementById("bingo-zone").innerHTML = bingoHTML(t);
}

function startQuiz() {
  const pool = shuffle(Object.entries(PAYS_INFO)).slice(0, 8);
  const allCaps = Object.values(PAYS_INFO).map(p => p.cap);
  const allKeys = Object.keys(PAYS_INFO);
  window._quiz = {
    i: 0, score: 0,
    qs: pool.map(([key, p], idx) => {
      if (idx % 2 === 0) {
        const opts = shuffle([p.cap, ...shuffle(allCaps.filter(c => c !== p.cap)).slice(0, 3)]);
        return { q: `Quelle est la capitale de <b>${paysLabel(key)} ${p.flag}</b> ?`, opts, ok: opts.indexOf(p.cap) };
      }
      const opts = shuffle([key, ...shuffle(allKeys.filter(k => k !== key)).slice(0, 3)]);
      return { q: `À quel pays appartient ce drapeau : <span style="font-size:2.2rem;">${p.flag}</span> ?`, opts: opts.map(paysLabel), ok: opts.indexOf(key) };
    })
  };
  renderQuizQ();
}

function renderQuizQ() {
  const z = document.getElementById("quiz-zone");
  const q = window._quiz;
  if (!z || !q) return;
  if (q.i >= q.qs.length) {
    const msg = q.score === q.qs.length ? "🏆 Parfait, champion du monde !" : q.score >= q.qs.length / 2 ? "👏 Pas mal du tout !" : "🙈 On révisera dans l'avion…";
    // Qui a joué ? Profil famille, sinon prénoms du voyage, sinon enregistrement libre
    const t = getTrip(currentTripId);
    const names = (typeof FAM !== "undefined" && FAM.profile) ? [FAM.profile.name] : (t && (t.people || []).map(p => p.name));
    let saver;
    if (names && names.length) {
      // Référence par index : aucun prénom (potentiellement avec apostrophe) injecté dans l'onclick
      window._quizNames = names;
      saver = `<p class="muted small" style="margin-top:10px;">Enregistrer ce score pour :</p><div class="filters" style="margin:6px 0 0;">
        ${names.map((n, i) => `<button class="chip" onclick="saveQuizScoreByIdx(${i},${q.score},${q.qs.length})">${esc(n)}</button>`).join("")}</div>`;
    } else {
      saver = `<div class="row" style="margin-top:10px;"><input class="search-input" id="quiz-name" placeholder="Ton prénom pour le classement"><button class="btn btn-ghost btn-sm" onclick="if(document.getElementById('quiz-name').value.trim()){saveQuizScore(document.getElementById('quiz-name').value.trim(),${q.score},${q.qs.length});toast('🏆 Score enregistré !');renderQuizQ()}">💾</button></div>`;
    }
    z.innerHTML = `<p style="font-size:1.2rem;"><b>Score : ${q.score}/${q.qs.length}</b></p><p style="margin:8px 0 12px;">${msg}</p>
      <button class="btn btn-primary btn-sm" onclick="startQuiz()">🔄 Rejouer</button>
      ${saver}
      ${leaderboardHTML()}`;
    return;
  }
  const cur = q.qs[q.i];
  z.innerHTML = `
    <p class="muted small">Question ${q.i + 1}/${q.qs.length} — Score : ${q.score}</p>
    <p style="margin:10px 0;">${cur.q}</p>
    <div class="grid grid-2" style="gap:8px;">
      ${cur.opts.map((o, i) => `<button class="quiz-option" onclick="answerQuiz(${i})">${esc(o)}</button>`).join("")}
    </div>`;
}

function answerQuiz(i) {
  const q = window._quiz;
  const cur = q.qs[q.i];
  if (i === cur.ok) { q.score++; toast("✅ Bonne réponse !"); }
  else toast("❌ Raté ! C'était : " + cur.opts[cur.ok]);
  q.i++;
  renderQuizQ();
}

function tirageSort() {
  const names = document.getElementById("tirage-names").value.split(",").map(s => s.trim()).filter(Boolean);
  if (names.length < 2) { toast("⚠️ Donne au moins 2 prénoms"); return; }
  const out = document.getElementById("tirage-result");
  let n = 0;
  const timer = setInterval(() => {
    if (!document.getElementById("tirage-result")) { clearInterval(timer); return; }
    out.textContent = names[Math.floor(Math.random() * names.length)];
    if (++n > 14) {
      clearInterval(timer);
      out.textContent = "🎉 " + names[Math.floor(Math.random() * names.length)] + " !";
    }
  }, 100);
}

/* ===================== Carte du monde (vue Monde) ===================== */

async function renderMonde(main) {
  const visited = new Set(), wished = new Set();
  const visitedNames = [], wishedNames = [];
  state.trips.filter(t => t.status === "termine" || t.status === "encours").forEach(t => {
    const info = countryInfo(t.country);
    if (info && !visited.has(info.iso3)) { visited.add(info.iso3); visitedNames.push(t.country); }
  });
  state.wishlist.forEach(w => {
    const info = countryInfo(w.country);
    if (info && !visited.has(info.iso3) && !wished.has(info.iso3)) { wished.add(info.iso3); wishedNames.push(w.country); }
  });

  main.innerHTML = `
    <h1 class="page-title">🌍 Ma carte du monde</h1>
    <p class="page-sub">Chaque pays visité se colore — la carte à gratter version numérique !</p>
    <div class="row" style="margin-bottom:14px;flex-wrap:wrap;">
      <span class="country-chip" style="border-left:4px solid #30a46c;">✅ Visité (${visited.size})</span>
      <span class="country-chip" style="border-left:4px solid #f59e0b;">💫 Liste d'envies (${wished.size})</span>
      <span class="country-chip" style="border-left:4px solid #94a3b8;">À découvrir…</span>
    </div>
    <div id="worldmap" class="map-container" style="height:520px;"></div>
    <p class="muted small" style="margin-top:10px;">Sont comptés les pays des voyages 🌍 en cours et 🏁 terminés. ${visited.size ? "Déjà " + visited.size + " pays sur ~195 — continue ! 🚀" : "Termine ton premier voyage pour gratter ton premier pays !"}</p>`;

  if (typeof L === "undefined") {
    document.getElementById("worldmap").outerHTML = `<div class="empty-state card"><span class="big-emoji">📡</span><p>La carte du monde a besoin d'une connexion internet.</p></div>`;
    return;
  }
  if (window._leafletMap) { try { window._leafletMap.remove(); } catch (e) {} window._leafletMap = null; }
  const map = L.map("worldmap", { worldCopyJump: true, minZoom: 1 }).setView([25, 10], 2);
  window._leafletMap = map;
  if (typeof baseTiles === "function") baseTiles(map, 8);
  else L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 8, attribution: "© OpenStreetMap" }).addTo(map);
  try {
    if (!window._worldGeo) {
      window._worldGeo = await (await fetch("https://cdn.jsdelivr.net/gh/johan/world.geo.json@master/countries.geo.json")).json();
    }
    L.geoJSON(window._worldGeo, {
      style: f => {
        if (visited.has(f.id)) return { fillColor: "#30a46c", fillOpacity: 0.65, color: "#1d7a4f", weight: 1 };
        if (wished.has(f.id)) return { fillColor: "#f59e0b", fillOpacity: 0.55, color: "#b45309", weight: 1 };
        return { fillColor: "#94a3b8", fillOpacity: 0.12, color: "#94a3b8", weight: 0.5 };
      },
      onEachFeature: (f, layer) => {
        const tag = visited.has(f.id) ? "✅ Visité !" : wished.has(f.id) ? "💫 Sur la liste d'envies" : "À découvrir…";
        layer.bindPopup(`<b>${esc(f.properties.name)}</b><br>${tag}`);
      }
    }).addTo(map);
  } catch (e) {
    toast("❌ Contours des pays indisponibles hors connexion");
  }

  // 📷 Toutes les photos géolocalisées et récits 📔 localisés, tous voyages confondus
  let nPhotos = 0;
  state.trips.forEach(t => {
    (t.geophotos || []).forEach(p => {
      const m = L.marker([p.lat, p.lng], {
        icon: L.divIcon({ className: "leg-emoji-icon", html: `<div class="photo-marker">📷</div>`, iconSize: [30, 30], iconAnchor: [15, 15] })
      }).addTo(map);
      bindPhotoPopup(m, p.id, p.name + " — " + t.title);
      nPhotos++;
    });
    (t.journal || []).filter(j => j.lat && j.lng).forEach(j => {
      L.marker([j.lat, j.lng], {
        icon: L.divIcon({ className: "leg-emoji-icon", html: `<div class="photo-marker">📔</div>`, iconSize: [30, 30], iconAnchor: [15, 15] })
      }).addTo(map).bindPopup(`<b>${j.mood || "📔"} ${esc(j.title)}</b><br>${fmtDate(j.date)} · ${esc(t.title)}`);
      nPhotos++;
    });
  });
  if (nPhotos) {
    const note = main.querySelector(".page-sub");
    if (note) note.textContent += ` · 📷 ${nPhotos} souvenir(s) épinglé(s) sur la carte`;
  }
}

/* ===================== Tableau de bord : souvenirs et focus du jour ===================== */

function memoriesHTML() {
  const today = todayISO();
  const mmdd = today.slice(5);
  const curY = +today.slice(0, 4);
  const items = [];
  state.trips.forEach(t => {
    if (t.status !== "termine" || !t.start || !t.end) return;
    const y = +t.start.slice(0, 4);
    if (y >= curY) return;
    const s = t.start.slice(5), e = t.end.slice(5);
    // Gère aussi les voyages à cheval sur le Nouvel An (ex : 28/12 → 04/01)
    const inRange = s <= e ? (s <= mmdd && mmdd <= e) : (mmdd >= s || mmdd <= e);
    if (inRange) {
      items.push(`<div class="row" style="padding:5px 0;cursor:pointer;" onclick="openTrip('${t.id}','journal')">
        <span>🕰️</span><span>Il y a <b>${curY - y} an${curY - y > 1 ? "s" : ""}</b> jour pour jour, tu étais à <b>${esc(t.destination)}</b> ${flagFor(t.country)} <span class="muted small">(${esc(t.title)})</span></span>
      </div>`);
    }
  });
  if (!items.length) return "";
  return `<div class="card" style="margin-bottom:24px;border-left:4px solid var(--primary);">
    <h3>✨ Souvenirs du jour</h3><div style="margin-top:8px;">${items.join("")}</div></div>`;
}

function todayActivitiesHTML(t) {
  const today = todayISO();
  const acts = (t.activities || []).filter(a => a.date === today)
    .sort((a, b) => (a.time || "99").localeCompare(b.time || "99"));
  const list = acts.length
    ? acts.map(a => `<div class="row" style="padding:4px 0;"><b style="color:var(--primary);min-width:50px;">${a.time || "—"}</b><span class="${a.done ? "muted" : ""}">${a.done ? "✅ " : ""}${esc(a.title)}</span></div>`).join("")
    : `<p class="muted small" style="padding:4px 0;">Journée libre aujourd'hui ! 😎</p>`;
  const firstStep = (t.steps || [])[0];
  return `
    <div style="margin-top:12px;border-top:1px solid var(--border);padding-top:10px;">
      <div class="small" id="dash-weather" style="margin-bottom:6px;"></div>
      <b class="small">📋 Au programme aujourd'hui :</b>
      <div style="margin-top:4px;">${list}</div>
      <div class="row" style="margin-top:10px;">
        <button class="btn btn-secondary btn-sm" onclick="quickExpense('${t.id}')">💸 Noter une dépense</button>
        ${firstStep ? `<button class="btn btn-secondary btn-sm" onclick="stepWeather('${t.id}','${firstStep.id}')">🌦️ Météo</button>` : ""}
        <button class="btn btn-secondary btn-sm" onclick="openTrip('${t.id}','journal')">📔 Écrire le journal</button>
      </div>
    </div>`;
}

/* ===================== Dépense rapide (bouton flottant) ===================== */

function quickExpense(preferId) {
  if (!state.trips.length) { toast("Crée d'abord un voyage ! 🧳"); return; }
  const today = todayISO();
  const sorted = state.trips.slice().sort((a, b) => {
    const score = t => (t.start && t.end && t.start <= today && today <= t.end) ? 0 : (t.start && t.start > today ? 1 : 2);
    return score(a) - score(b);
  });
  const selId = preferId || sorted[0].id;
  const catOpts = Object.entries(CAT_DEPENSES).map(([k, c]) => `<option value="${k}">${c.emoji} ${c.label}</option>`).join("");
  openModal("💸 Dépense rapide", `
    <div class="form-group"><label>Voyage</label>
      <select id="qe-trip">${sorted.map(t => `<option value="${t.id}" ${t.id === selId ? "selected" : ""}>${flagFor(t.country)} ${esc(t.title)}</option>`).join("")}</select></div>
    <div class="form-row">
      <div class="form-group"><label>Montant *</label><input id="qe-amount" type="number" min="0" step="0.01" autofocus></div>
      <div class="form-group"><label>Catégorie</label><select id="qe-cat">${catOpts}</select></div>
    </div>
    <div class="form-group"><label>Libellé *</label><input id="qe-label" placeholder="Ex : Glaces sur le port" onkeydown="if(event.key==='Enter')saveQuickExpense()"></div>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Annuler</button>
      <button class="btn btn-primary" onclick="saveQuickExpense()">Enregistrer 💸</button>
    </div>`);
}

function saveQuickExpense() {
  const t = getTrip(document.getElementById("qe-trip").value);
  const amount = +document.getElementById("qe-amount").value;
  const label = document.getElementById("qe-label").value.trim();
  if (!label || !amount) { toast("⚠️ Libellé et montant obligatoires"); return; }
  t.expenses.push({ id: uid(), label, amount, category: document.getElementById("qe-cat").value, date: todayISO() });
  saveState();
  closeModal();
  if (currentTripId === t.id || currentView === "dashboard") {
    currentTripId ? renderTripDetail(document.getElementById("main")) : renderDashboard(document.getElementById("main"));
  }
  toast(`💸 ${fmtMoney(amount)} — c'est noté !`);
}

/* ===================== Statistiques avancées ===================== */

function statsExtraHTML(trips, visited) {
  // Empreinte carbone et budget moyen / jour
  const totalCO2 = visited.reduce((s, t) => s + tripEstimates(t).co2, 0);
  const spentDone = visited.reduce((s, t) => s + (t.expenses || []).reduce((a, e) => a + (+e.amount || 0), 0), 0);
  const daysDone = visited.reduce((s, t) => s + tripDuration(t), 0);
  const perDay = daysDone ? spentDone / daysDone : 0;

  // Top pays par dépenses
  const byCountry = {};
  trips.forEach(t => {
    const c = (t.country || "").trim();
    if (!c) return;
    byCountry[c] = (byCountry[c] || 0) + (t.expenses || []).reduce((a, e) => a + (+e.amount || 0), 0);
  });
  const topCountries = Object.entries(byCountry).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 3);

  // Heatmap des mois
  const monthCount = Array(12).fill(0);
  visited.forEach(t => { if (t.start) monthCount[+t.start.slice(5, 7) - 1]++; });
  const maxMonth = Math.max(1, ...monthCount);
  const monthNames = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Aoû", "Sep", "Oct", "Nov", "Déc"];
  const heatmap = monthNames.map((m, i) => `
    <div class="heat-cell" title="${monthCount[i]} voyage(s)">
      <div class="heat-box" style="opacity:${monthCount[i] ? 0.25 + 0.75 * monthCount[i] / maxMonth : 0.06};"></div>
      <span class="small muted">${m}</span>
    </div>`).join("");

  // Badges
  const continents = new Set();
  visited.forEach(t => { const i = countryInfo(t.country); if (i) continents.add(i.cont); });
  const countries = new Set(visited.map(t => normPays(t.country)).filter(Boolean));
  const bStats = {
    voyages: visited.length, pays: countries.size, jours: daysDone,
    km: visited.reduce((s, t) => s + tripTotalKm(t), 0),
    continents: continents.size,
    journal: trips.reduce((s, t) => s + (t.journal || []).length, 0),
    envies: state.wishlist.length,
    photos: trips.reduce((s, t) => s + (t.geophotos || []).length, 0),
    activites: trips.reduce((s, t) => s + (t.activities || []).length, 0)
  };
  const badges = BADGES_DEFS.map(b => {
    const won = b.test(bStats);
    return `<div class="badge-card ${won ? "" : "locked"}" title="${esc(b.desc)}">
      <span class="badge-emoji">${won ? b.emoji : "🔒"}</span>
      <b class="small">${b.label}</b>
      <span class="small muted">${esc(b.desc)}</span>
    </div>`;
  }).join("");
  const wonCount = BADGES_DEFS.filter(b => b.test(bStats)).length;

  // Frise chronologique
  const dated = trips.filter(t => t.start).sort((a, b) => a.start.localeCompare(b.start));
  let lastYear = "";
  const timeline = dated.map(t => {
    const y = t.start.slice(0, 4);
    const yearMark = y !== lastYear ? `<div class="tl-year">${y}</div>` : "";
    lastYear = y;
    return `${yearMark}
      <div class="tl-item" onclick="openTrip('${t.id}')">
        <span class="tl-dot" style="background:${esc(t.color || "#4f6df5")}"></span>
        <span class="tl-date muted small">${fmtDateShort(t.start)}</span>
        <span>${flagFor(t.country)} <b>${esc(t.title)}</b> <span class="muted small">· ${tripDuration(t)} j · ${STATUTS[t.status] ? STATUTS[t.status].label : ""}</span></span>
      </div>`;
  }).join("");

  return `
    <div class="grid grid-3" style="margin-bottom:20px;">
      <div class="card stat-card"><div class="stat-num">${Math.round(totalCO2).toLocaleString("fr-FR")} kg</div>
        <div class="stat-label">CO₂ estimé (par pers., trajets des cartes)</div></div>
      <div class="card stat-card"><div class="stat-num">${fmtMoney(perDay)}</div><div class="stat-label">Budget moyen par jour de voyage</div></div>
      <div class="card stat-card"><div class="stat-num">${wonCount}/${BADGES_DEFS.length}</div><div class="stat-label">Badges débloqués</div></div>
    </div>

    ${topCountries.length ? `<div class="card" style="margin-bottom:20px;">
      <h3>💎 Pays les plus dépensiers</h3>
      <div style="margin-top:12px;">${topCountries.map(([c, v], i) => `<div class="row" style="padding:4px 0;"><span>${["🥇", "🥈", "🥉"][i]}</span><span style="flex:1;">${flagFor(c)} ${esc(c)}</span><b>${fmtMoney(v)}</b></div>`).join("")}</div>
    </div>` : ""}

    <div class="card" style="margin-bottom:20px;">
      <h3>🌡️ Tes mois de voyage préférés</h3>
      <div class="heatmap" style="margin-top:14px;">${heatmap}</div>
    </div>

    <div class="card" style="margin-bottom:20px;">
      <h3>🏅 Badges de globe-trotteur (${wonCount}/${BADGES_DEFS.length})</h3>
      <div class="badges-grid" style="margin-top:14px;">${badges}</div>
    </div>

    ${dated.length ? `<div class="card" style="margin-bottom:20px;">
      <h3>🧵 La frise de tes voyages</h3>
      <div class="timeline" style="margin-top:14px;">${timeline}</div>
    </div>` : ""}

    ${travelerStatsHTML()}
    ${recordsHTML()}
    ${retroCardHTML()}
    ${compareCardHTML()}`;
}

/* ===================== Roulette des envies ===================== */

function openRoulette() {
  const wishes = state.wishlist;
  if (wishes.length < 2) { toast("Ajoute au moins 2 envies pour faire tourner la roulette ! 💫"); return; }
  openModal("🎲 La roulette des envies", `
    <p class="muted" style="text-align:center;">Le destin choisit ta prochaine destination…</p>
    <div class="roulette-name" id="roulette-name">…</div>
    <div class="form-actions" id="roulette-actions" style="justify-content:center;"></div>`);
  let n = 0;
  const timer = setInterval(() => {
    const el = document.getElementById("roulette-name");
    if (!el) { clearInterval(timer); return; }
    const w = wishes[Math.floor(Math.random() * wishes.length)];
    el.textContent = `${flagFor(w.country)} ${w.destination}`;
    if (++n > 20) {
      clearInterval(timer);
      const pick = wishes[Math.floor(Math.random() * wishes.length)];
      el.innerHTML = `🎉 ${flagFor(pick.country)} <b>${esc(pick.destination)}</b> !`;
      document.getElementById("roulette-actions").innerHTML = `
        <button class="btn btn-secondary" onclick="openRoulette()">🔄 Relancer</button>
        <button class="btn btn-primary" onclick="closeModal();wishToTrip('${pick.id}')">🚀 Transformer en voyage</button>`;
    }
  }, 100);
}

/* ===================== Recherche globale ===================== */

function globalSearch(q) {
  q = (q || "").trim();
  if (q.length < 2) { toast("Tape au moins 2 caractères 🔎"); return; }
  currentView = "search";
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
  const lc = q.toLowerCase();
  const hit = s => (s || "").toLowerCase().includes(lc);
  const results = [];

  state.trips.forEach(t => {
    if (hit(t.title) || hit(t.destination) || hit(t.country) || hit(t.notes))
      results.push({ icon: "🧳", what: "Voyage", label: t.title, ctx: t.destination, go: `openTrip('${t.id}')` });
    (t.activities || []).forEach(a => { if (hit(a.title) || hit(a.notes)) results.push({ icon: "🗓️", what: "Activité", label: a.title, ctx: t.title + " · " + fmtDateShort(a.date), go: `openTrip('${t.id}','itineraire')` }); });
    (t.journal || []).forEach(j => { if (hit(j.title) || hit(j.content)) results.push({ icon: "📔", what: "Journal", label: j.title, ctx: t.title, go: `openTrip('${t.id}','journal')` }); });
    (t.documents || []).forEach(d => { if (hit(d.title) || hit(d.content)) results.push({ icon: "📄", what: "Document", label: d.title, ctx: t.title, go: `openTrip('${t.id}','documents')` }); });
    (t.packing || []).forEach(i => { if (hit(i.label)) results.push({ icon: "🎒", what: "Bagages", label: i.label, ctx: t.title, go: `openTrip('${t.id}','bagages')` }); });
    (t.todos || []).forEach(x => { if (hit(x.label)) results.push({ icon: "✅", what: "Préparatif", label: x.label, ctx: t.title, go: `openTrip('${t.id}','prepa')` }); });
    (t.steps || []).forEach(s => { if (hit(s.name) || hit(s.notes)) results.push({ icon: "🧭", what: "Étape", label: s.name, ctx: t.title, go: `openTrip('${t.id}','carte')` }); });
  });
  state.wishlist.forEach(w => { if (hit(w.destination) || hit(w.country) || hit(w.notes)) results.push({ icon: "💫", what: "Envie", label: w.destination, ctx: w.country || "", go: `showView('wishlist')` }); });

  const main = document.getElementById("main");
  main.innerHTML = `
    <h1 class="page-title">🔎 Résultats pour « ${esc(q)} »</h1>
    <p class="page-sub">${results.length} résultat${results.length > 1 ? "s" : ""} dans tout le carnet</p>
    ${results.length ? results.map(r => `
      <div class="card search-hit" onclick="${r.go}">
        <span style="font-size:1.4rem;">${r.icon}</span>
        <div style="flex:1;"><b>${esc(r.label)}</b><div class="muted small">${r.what}${r.ctx ? " · " + esc(r.ctx) : ""}</div></div>
        <span class="muted">→</span>
      </div>`).join("") : `<div class="empty-state card"><span class="big-emoji">🤷</span><p>Rien trouvé. Essaie un autre mot.</p></div>`}`;
  window.scrollTo(0, 0);
}

/* ===================== Corbeille et sauvegardes auto ===================== */

function settingsExtraHTML() {
  const trash = state.trash || [];
  const trashRows = trash.map((x, i) => `
    <div class="row-between" style="padding:7px 0;border-bottom:1px solid var(--border);">
      <span>${flagFor(x.trip.country)} ${esc(x.trip.title)} <span class="muted small">supprimé le ${fmtDateShort(x.deletedAt)}</span></span>
      <button class="btn btn-secondary btn-sm" onclick="restoreTrash(${i})">↩️ Restaurer</button>
    </div>`).join("");

  const backups = Object.keys(localStorage).filter(k => k.startsWith("mesVoyages.auto.")).sort().reverse();
  const backupRows = backups.map(k => `
    <div class="row-between" style="padding:7px 0;border-bottom:1px solid var(--border);">
      <span>📦 Sauvegarde du ${fmtDate(k.replace("mesVoyages.auto.", ""))}</span>
      <button class="btn btn-secondary btn-sm" onclick="restoreAutoBackup('${k}')">↩️ Restaurer</button>
    </div>`).join("");

  return `
    <div class="card" style="margin:18px 0;max-width:560px;">
      <h3>🗑️ Corbeille (${trash.length})</h3>
      <p class="muted small" style="margin:8px 0 10px;">Les 10 derniers voyages supprimés peuvent être restaurés ici.</p>
      ${trashRows || `<p class="muted small">La corbeille est vide.</p>`}
      ${trash.length ? `<button class="btn btn-ghost btn-sm" style="margin-top:10px;" onclick="purgeTrash()">Vider la corbeille</button>` : ""}
    </div>
    <div class="card" style="margin-bottom:18px;max-width:560px;">
      <h3>🛟 Sauvegardes automatiques</h3>
      <p class="muted small" style="margin:8px 0 10px;">Une copie de sécurité est faite chaque jour à l'ouverture (5 dernières conservées). Les pièces jointes (📎) ne sont pas incluses dans les exports JSON.</p>
      ${backupRows || `<p class="muted small">Aucune sauvegarde automatique pour l'instant.</p>`}
    </div>`;
}

function restoreTrash(i) {
  const x = state.trash[i];
  if (!x) return;
  state.trips.push(x.trip);
  state.trash.splice(i, 1);
  saveState();
  toast("↩️ Voyage restauré !");
  showView("trips");
}

function purgeTrash() {
  if (!confirm("Vider définitivement la corbeille ? (les pièces jointes 📎 de ces voyages seront aussi supprimées)")) return;
  (state.trash || []).forEach(x => deleteTripAttachments(x.trip));
  state.trash = [];
  saveState();
  renderSettings(document.getElementById("main"));
}

function restoreAutoBackup(key) {
  if (!confirm("Remplacer les données actuelles par cette sauvegarde automatique ?")) return;
  try {
    const data = JSON.parse(localStorage.getItem(key));
    state = Object.assign({ trips: [], wishlist: [], trash: [], passports: [], settings: {} }, data);
    state.settings = Object.assign({ theme: "light", currency: "EUR", userName: "" }, data.settings);
    saveState();
    applyTheme();
    showView("dashboard");
    toast("✅ Sauvegarde restaurée !");
  } catch (e) { toast("❌ Sauvegarde illisible"); }
}

function autoBackup() {
  try {
    const key = "mesVoyages.auto." + todayISO();
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(state));
    Object.keys(localStorage).filter(k => k.startsWith("mesVoyages.auto.")).sort().reverse().slice(5)
      .forEach(k => localStorage.removeItem(k));
  } catch (e) { /* stockage plein : tant pis pour la sauvegarde auto */ }
}

/* ===================== Exports et duplication ===================== */

function icsEscape(s) {
  return String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

function exportICS(tripId) {
  const t = getTrip(tripId);
  const acts = (t.activities || []).filter(a => a.date);
  if (!acts.length) { toast("Ajoute d'abord des activités à l'itinéraire 🗓️"); return; }
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//MesVoyages//FR", "CALSCALE:GREGORIAN"];
  acts.forEach(a => {
    lines.push("BEGIN:VEVENT", `UID:${a.id}@mesvoyages`, `DTSTAMP:${stamp}`);
    const d = a.date.replace(/-/g, "");
    if (a.time) {
      const hm = a.time.replace(":", "");
      lines.push(`DTSTART:${d}T${hm}00`, `DURATION:PT1H30M`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${addDaysISO(a.date, 1).replace(/-/g, "")}`);
    }
    lines.push(`SUMMARY:${icsEscape((CAT_ACTIVITES[a.category] || "📌").split(" ")[0] + " " + a.title)}`);
    if (a.notes) lines.push(`DESCRIPTION:${icsEscape(a.notes)}`);
    lines.push(`LOCATION:${icsEscape(t.destination)}`, "END:VEVENT");
  });
  lines.push("END:VCALENDAR");
  const blob = new Blob([lines.join("\r\n")], { type: "text/calendar" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = t.title.replace(/[^\w\sàâäéèêëîïôöùûüç-]/gi, "").trim().replace(/\s+/g, "-").toLowerCase() + ".ics";
  a.click();
  URL.revokeObjectURL(a.href);
  toast("📅 Calendrier exporté — importe le fichier .ics dans Google Agenda / Outlook");
}

function exportTripHTML(tripId) {
  const t = getTrip(tripId);
  const acts = (t.activities || []).slice().sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")));
  const byDate = {};
  acts.forEach(a => { (byDate[a.date] = byDate[a.date] || []).push(a); });
  const spent = (t.expenses || []).reduce((s, e) => s + (+e.amount || 0), 0);
  const est = tripEstimates(t);

  const stepsHTML = (t.steps || []).map((s, i) => {
    const leg = i > 0 ? ` <small>(${TRANSPORTS[s.transport] ? TRANSPORTS[s.transport].label : ""} · ${fmtKm(haversineKm(t.steps[i - 1], s))})</small>` : "";
    return `<li><b>${esc(s.name)}</b>${leg}${s.notes ? `<br><small>${esc(s.notes)}</small>` : ""}</li>`;
  }).join("");

  const itiHTML = Object.keys(byDate).sort().map(d => `
    <h3>📅 ${fmtDate(d)}</h3>
    <ul>${byDate[d].map(a => `<li><b>${a.time || ""}</b> ${esc(a.title)}${a.notes ? ` — <small>${esc(a.notes)}</small>` : ""}</li>`).join("")}</ul>`).join("");

  const journalHTML = (t.journal || []).slice().sort((a, b) => (a.date || "").localeCompare(b.date || "")).map(j => `
    <h3>${j.mood || "🙂"} ${esc(j.title)} <small>— ${fmtDate(j.date)}</small></h3>
    <p>${esc(j.content).replace(/\n/g, "<br>")}</p>`).join("");

  const aw = t.awards || {};
  const awardsHTML = (aw.moment || aw.repas || aw.paysage || aw.galere) ? `
    <h2>🏆 Le palmarès</h2><ul>
    ${aw.moment ? `<li>🌟 Meilleur moment : <b>${esc(aw.moment)}</b></li>` : ""}
    ${aw.repas ? `<li>🍽️ Meilleur repas : <b>${esc(aw.repas)}</b></li>` : ""}
    ${aw.paysage ? `<li>📸 Plus beau paysage : <b>${esc(aw.paysage)}</b></li>` : ""}
    ${aw.galere ? `<li>😱 Plus grosse galère : <b>${esc(aw.galere)}</b></li>` : ""}
    ${aw.note ? `<li>⭐ Note : <b>${"★".repeat(aw.note)}${"☆".repeat(5 - aw.note)}</b></li>` : ""}</ul>` : "";

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>${esc(t.title)} — Carnet de voyage</title>
<style>body{font-family:Segoe UI,system-ui,sans-serif;max-width:760px;margin:30px auto;padding:0 20px;color:#1c2333;line-height:1.6;}
header{background:linear-gradient(120deg,${esc(t.color || "#4f6df5")},${esc(t.color || "#4f6df5")}cc);color:#fff;padding:30px;border-radius:16px;}
h1{margin:0;}h2{margin-top:34px;border-bottom:2px solid #e3e8f2;padding-bottom:6px;}small{color:#6b7487;}ul{padding-left:22px;}</style></head><body>
<header><h1>${flagFor(t.country)} ${esc(t.title)}</h1>
<p>📍 ${esc(t.destination)}${t.country ? ", " + esc(t.country) : ""}${t.start ? ` · 📅 ${fmtDate(t.start)} → ${fmtDate(t.end)} (${tripDuration(t)} jours)` : ""} · 👥 ${t.travelers || 1} voyageur(s)</p>
${est.km ? `<p>🧭 ${fmtKm(est.km)} parcourus${spent ? ` · 💶 ${fmtMoney(spent)} dépensés` : ""}</p>` : ""}</header>
${stepsHTML ? `<h2>🗺️ Les étapes</h2><ol>${stepsHTML}</ol>` : ""}
${itiHTML ? `<h2>🗓️ L'itinéraire</h2>${itiHTML}` : ""}
${journalHTML ? `<h2>📔 Le carnet de bord</h2>${journalHTML}` : ""}
${awardsHTML}
<p style="margin-top:40px;"><small>Généré avec ❤️ par Mes Voyages, le ${fmtDate(todayISO())}.</small></p>
</body></html>`;

  const blob = new Blob([html], { type: "text/html" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "souvenir-" + t.title.replace(/[^\w\sàâäéèêëîïôöùûüç-]/gi, "").trim().replace(/\s+/g, "-").toLowerCase() + ".html";
  a.click();
  URL.revokeObjectURL(a.href);
  toast("📤 Page souvenir téléchargée — à envoyer à la famille !");
}

function duplicateTrip(id) {
  const src = getTrip(id);
  const t = JSON.parse(JSON.stringify(src));
  t.id = uid();
  t.title = src.title + " (copie)";
  t.status = "idee";
  t.expenses = [];
  t.journal = [];
  t.awards = {};
  t.bingo = null;
  t.transfers = [];
  t.geophotos = [];
  t.defis = [];
  t.albumAt = "";
  ["activities", "packing", "documents", "steps", "todos", "shopping", "people"].forEach(k => {
    (t[k] = t[k] || []).forEach(x => { x.id = uid(); if (x.done !== undefined) x.done = false; });
  });
  state.trips.push(t);
  saveState();
  toast("📑 Voyage dupliqué — adapte les dates !");
  openTrip(t.id);
}

/* ===================== Démarrage de l'application ===================== */

PACK_TEMPLATES.pharmacie = {
  label: "💊 Pharmacie",
  items: ["Pansements", "Antiseptique", "Doliprane / paracétamol", "Anti-diarrhéique", "Pastilles pour la gorge",
    "Antihistaminique", "Crème apaisante (piqûres)", "Répulsif moustiques", "Sérum physiologique",
    "Médicaments personnels + ordonnance", "Pince à épiler", "Compresses"]
};

/* Le démarrage (bootApp) est assuré par family.js, chargé en dernier,
   afin de pouvoir reconnecter le mode famille avant le premier rendu. */
