/* ============================================================
   Mes Voyages — Mode famille (pCloud)
   Les données vivent dans un fichier JSON du dossier synchronisé :
   - carnet-famille.json  : le carnet partagé par toute la famille
   - carnet-<prenom>.json : les carnets personnels
   - profils.json         : la liste des profils
   Chargé en DERNIER : c'est lui qui démarre l'application (bootApp).
   ============================================================ */

"use strict";

const FAM = {
  dirHandle: null,   // dossier choisi (persisté en IndexedDB)
  carnet: null,      // nom du fichier carnet ouvert
  rev: 0,            // révision chargée (compteur anti-conflit)
  profile: null,     // { name, emoji }
  profiles: [],
  active: false,
  busy: false,       // écriture/lecture fichier en cours
  dirty: false,      // une sauvegarde fichier est en attente
  saveTimer: null,
  pollTimer: null,
  _conflict: null
};

/* ===================== Mémorisation du dossier (IndexedDB) ===================== */

function fsdb() {
  return new Promise((res, rej) => {
    if (window._fsdb) return res(window._fsdb);
    const rq = indexedDB.open("mesVoyagesFS", 1);
    rq.onupgradeneeded = () => rq.result.createObjectStore("kv");
    rq.onsuccess = () => { window._fsdb = rq.result; res(rq.result); };
    rq.onerror = () => rej(rq.error);
  });
}

async function kvSet(k, v) {
  const db = await fsdb();
  return new Promise((res, rej) => {
    const tx = db.transaction("kv", "readwrite");
    tx.objectStore("kv").put(v, k);
    tx.oncomplete = res;
    tx.onerror = () => rej(tx.error);
  });
}

async function kvGet(k) {
  const db = await fsdb();
  return new Promise((res, rej) => {
    const rq = db.transaction("kv").objectStore("kv").get(k);
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(rq.error);
  });
}

async function kvDel(k) {
  const db = await fsdb();
  return new Promise((res, rej) => {
    const tx = db.transaction("kv", "readwrite");
    tx.objectStore("kv").delete(k);
    tx.oncomplete = res;
    tx.onerror = () => rej(tx.error);
  });
}

/* ===================== Lecture / écriture de fichiers ===================== */

async function famRead(name) {
  try {
    const fh = await FAM.dirHandle.getFileHandle(name);
    const txt = await (await fh.getFile()).text();
    return txt ? JSON.parse(txt) : null;
  } catch (e) {
    if (e.name === "NotFoundError") return null;
    throw e;
  }
}

async function famWrite(name, obj) {
  const fh = await FAM.dirHandle.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(JSON.stringify(obj, null, 1));
  await w.close();
}

function famSlug(name) {
  return name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function carnetLabel(n) {
  if (n === "carnet-famille.json") return "👨‍👩‍👧 Carnet familial";
  const who = n.replace("carnet-", "").replace(".json", "");
  return "🔒 Carnet de " + who.charAt(0).toUpperCase() + who.slice(1);
}

/* ===================== Indicateur dans la barre latérale ===================== */

function famStatus(s) {
  const el = document.getElementById("fam-status");
  if (el) el.textContent = { ok: "🟢", save: "🟡", warn: "🔴" }[s] || "🟢";
}

function updateFamIndicator() {
  const el = document.getElementById("fam-indicator");
  if (!el) return;
  if (!FAM.active) { el.style.display = "none"; return; }
  el.style.display = "flex";
  el.innerHTML = `<span id="fam-status">🟢</span>
    <span>${FAM.profile ? FAM.profile.emoji + " " + esc(FAM.profile.name) : "?"}</span>
    <span class="muted">· ${carnetLabel(FAM.carnet)}</span>`;
}

/* ===================== Configuration (depuis les Paramètres) ===================== */

async function setupFamily() {
  if (!window.showDirectoryPicker) {
    toast("❌ Nécessite Chrome ou Edge (accès aux fichiers non supporté ici)");
    return;
  }
  try {
    const dir = await window.showDirectoryPicker({ mode: "readwrite" });
    if (await dir.requestPermission({ mode: "readwrite" }) !== "granted") {
      toast("❌ Autorisation d'écriture refusée");
      return;
    }
    FAM.dirHandle = dir;
    await kvSet("dir", dir);
    await initFamily(true);
  } catch (e) {
    if (e.name !== "AbortError") toast("❌ " + e.message);
  }
}

async function initFamily(forcePicker) {
  const pj = await famRead("profils.json");
  FAM.profiles = (pj && pj.profiles) || [];
  const saved = localStorage.getItem("mesVoyages.profil");
  const found = FAM.profiles.find(p => p.name === saved);
  if (found && !forcePicker) {
    FAM.profile = found;
    await openCarnet(localStorage.getItem("mesVoyages.carnet") || "carnet-famille.json");
  } else {
    openProfilePicker();
  }
}

/* ===================== Profils : « Qui es-tu ? » ===================== */

function openProfilePicker() {
  const btns = FAM.profiles.map((p, i) =>
    `<button class="profile-btn" onclick="pickProfile(${i})"><span style="font-size:2.1rem;">${p.emoji}</span><b>${esc(p.name)}</b></button>`).join("");
  openModal("👨‍👩‍👧 Qui es-tu ?", `
    ${FAM.profiles.length ? `<div class="profile-grid">${btns}</div>` : `<p class="muted">Aucun profil pour l'instant — crée le tien !</p>`}
    <div style="border-top:1px solid var(--border);margin-top:16px;padding-top:14px;">
      <b class="small">➕ Nouveau profil</b>
      <div class="row" style="margin-top:8px;flex-wrap:wrap;">
        <input class="search-input" id="new-prof-name" placeholder="Prénom" style="max-width:170px;" onkeydown="if(event.key==='Enter')createProfile()">
        <select id="new-prof-emoji" class="transport-select" style="font-size:1.1rem;">${PERSON_EMOJIS.map(e => `<option>${e}</option>`).join("")}</select>
        <button class="btn btn-primary btn-sm" onclick="createProfile()">Créer</button>
      </div>
    </div>`);
}

async function pickProfile(i) {
  FAM.profile = FAM.profiles[i];
  localStorage.setItem("mesVoyages.profil", FAM.profile.name);
  closeModal();
  await openCarnet(localStorage.getItem("mesVoyages.carnet") || "carnet-famille.json");
}

async function createProfile() {
  const name = document.getElementById("new-prof-name").value.trim();
  if (!name) { toast("⚠️ Donne un prénom"); return; }
  if (FAM.profiles.some(p => p.name.toLowerCase() === name.toLowerCase())) { toast("⚠️ Ce profil existe déjà"); return; }
  const p = { name, emoji: document.getElementById("new-prof-emoji").value };
  FAM.profiles.push(p);
  try { await famWrite("profils.json", { profiles: FAM.profiles }); }
  catch (e) { toast("❌ Impossible d'écrire profils.json : " + e.message); return; }
  FAM.profile = p;
  localStorage.setItem("mesVoyages.profil", name);
  closeModal();
  await openCarnet("carnet-famille.json");
}

/* ===================== Ouverture d'un carnet ===================== */

function adoptDoc(doc) {
  state = Object.assign({ trips: [], wishlist: [], trash: [], passports: [], settings: {} }, doc.data);
  state.settings = Object.assign({ theme: "light", currency: "EUR", userName: "" }, doc.data.settings);
  FAM.rev = doc.rev || 0;
  saveStateLocal();
  applyTheme();
  updateFamIndicator();
  rerenderCurrentView();
}

async function openCarnet(name) {
  // on vide la file d'attente d'écriture du carnet précédent
  if (FAM.active && FAM.dirty) { clearTimeout(FAM.saveTimer); await doFamSave(); }
  try {
    const doc = await famRead(name);
    if (doc && doc.data) {
      adoptDocSilent(doc);
    } else if (name === "carnet-famille.json") {
      // première création du carnet familial : les données locales actuelles y migrent
      FAM.rev = 0;
      await famWrite(name, { rev: 0, savedBy: FAM.profile ? FAM.profile.name : "", savedAt: new Date().toISOString(), data: state });
    } else {
      // un carnet personnel démarre vide (on garde juste les réglages)
      state = { trips: [], wishlist: [], trash: [], settings: Object.assign({}, state.settings) };
      FAM.rev = 0;
      await famWrite(name, { rev: 0, savedBy: FAM.profile ? FAM.profile.name : "", savedAt: new Date().toISOString(), data: state });
    }
  } catch (e) {
    toast("❌ Ouverture du carnet impossible : " + e.message);
    return;
  }
  FAM.carnet = name;
  FAM.active = true;
  FAM.dirty = false;
  localStorage.setItem("mesVoyages.carnet", name);
  saveStateLocal();
  applyTheme();
  updateFamIndicator();
  rerenderCurrentView();
  startFamPolling();
  toast(carnetLabel(name) + " ouvert ✓");
}

function adoptDocSilent(doc) {
  state = Object.assign({ trips: [], wishlist: [], trash: [], passports: [], settings: {} }, doc.data);
  state.settings = Object.assign({ theme: "light", currency: "EUR", userName: "" }, doc.data.settings);
  FAM.rev = doc.rev || 0;
}

function rerenderCurrentView() {
  const main = document.getElementById("main");
  if (!main) return;
  if (currentTripId && getTrip(currentTripId)) renderTripDetail(main);
  else if (currentTripId) showView("trips");
  else if (["dashboard", "trips", "wishlist", "calendrier", "monde", "planisphere", "globe", "stats", "settings"].includes(currentView)) showView(currentView);
  else showView("dashboard");
}

/* ===================== Sauvegarde : locale + fichier partagé ===================== */

function saveStateLocal() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/* Redéfinition de saveState (app.js) : on garde le cache local
   et on programme l'écriture dans le fichier partagé. */
saveState = function () {
  saveStateLocal();
  if (FAM.active) {
    FAM.dirty = true;
    famStatus("save");
    clearTimeout(FAM.saveTimer);
    FAM.saveTimer = setTimeout(doFamSave, 700);
  }
};

async function doFamSave() {
  if (!FAM.active) return;
  if (FAM.busy) { FAM.saveTimer = setTimeout(doFamSave, 500); return; }
  FAM.busy = true;
  try {
    const cur = await famRead(FAM.carnet);
    if (cur && (cur.rev || 0) > FAM.rev) {
      famConflict(cur);
      return;
    }
    FAM.rev++;
    await famWrite(FAM.carnet, { rev: FAM.rev, savedBy: FAM.profile ? FAM.profile.name : "", savedAt: new Date().toISOString(), data: state });
    FAM.dirty = false;
    famStatus("ok");
  } catch (e) {
    famStatus("warn");
    toast("⚠️ Écriture du carnet impossible (pCloud accessible ?)");
  } finally {
    FAM.busy = false;
  }
}

/* ===================== Conflit : deux personnes ont enregistré ===================== */

function famConflict(cur) {
  famStatus("warn");
  FAM._conflict = cur;
  openModal("⚠️ Modifications simultanées", `
    <p><b>${esc(cur.savedBy || "Quelqu'un d'autre")}</b> a enregistré ce carnet pendant que tu l'utilisais
    (${cur.savedAt ? "à " + new Date(cur.savedAt).toLocaleTimeString("fr-FR") : ""}).</p>
    <p class="muted small" style="margin-top:8px;">Il faut choisir la version à garder — l'autre sera écrasée.</p>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="resolveConflict('mine')">💪 Garder MA version</button>
      <button class="btn btn-primary" onclick="resolveConflict('theirs')">🔄 Prendre celle de ${esc(cur.savedBy || "l'autre")}</button>
    </div>`);
}

async function resolveConflict(which) {
  const cur = FAM._conflict;
  FAM._conflict = null;
  closeModal();
  if (!cur) return;
  if (which === "theirs") {
    adoptDoc(cur);
    FAM.dirty = false;
    famStatus("ok");
    toast("🔄 Version de " + (cur.savedBy || "l'autre") + " chargée");
  } else {
    FAM.rev = cur.rev || 0; // on repart au-dessus de leur révision
    await doFamSave();
    toast("💪 Ta version a été conservée");
  }
}

/* ===================== Synchro : surveiller les enregistrements des autres ===================== */

async function famPollOnce() {
  if (!FAM.active || FAM.busy || FAM.dirty || document.hidden) return;
  const overlay = document.getElementById("modal-overlay");
  if (overlay && overlay.classList.contains("open")) return; // pas pendant une saisie
  try {
    const cur = await famRead(FAM.carnet);
    if (cur && (cur.rev || 0) > FAM.rev) {
      adoptDoc(cur);
      toast("🔄 Carnet mis à jour par " + (cur.savedBy || "un autre appareil"));
    }
  } catch (e) { /* hors ligne ou fichier momentanément verrouillé : on réessaiera */ }
}

function startFamPolling() {
  clearInterval(FAM.pollTimer);
  FAM.pollTimer = setInterval(famPollOnce, 15000);
}

/* ===================== Menu famille (clic sur l'indicateur) ===================== */

async function openFamilyMenu() {
  const mine = FAM.profile ? "carnet-" + famSlug(FAM.profile.name) + ".json" : null;
  let names = [];
  try {
    for await (const [n] of FAM.dirHandle.entries()) {
      if (/^carnet-.+\.json$/.test(n)) names.push(n);
    }
  } catch (e) { /* listing impossible : on propose au moins les carnets connus */ }
  if (!names.includes("carnet-famille.json")) names.unshift("carnet-famille.json");
  if (mine && !names.includes(mine)) names.push(mine);
  names = [...new Set(names)].sort((a, b) =>
    a === "carnet-famille.json" ? -1 : b === "carnet-famille.json" ? 1 : a.localeCompare(b));

  openModal("👨‍👩‍👧 Mode famille", `
    <p class="muted small" style="margin-bottom:12px;">Connecté en tant que <b>${FAM.profile ? FAM.profile.emoji + " " + esc(FAM.profile.name) : "?"}</b>. Choisis un carnet :</p>
    <div style="display:flex;flex-direction:column;gap:8px;">
      ${names.map(n => `
        <button class="profile-btn" style="flex-direction:row;justify-content:flex-start;gap:10px;" onclick="closeModal();openCarnet('${n}')">
          ${n === FAM.carnet ? "✅" : "📓"} <b>${carnetLabel(n)}</b>
          ${n === mine && !names.includes(mine) ? '<span class="muted small">(sera créé)</span>' : ""}
        </button>`).join("")}
    </div>
    <div class="form-actions" style="justify-content:space-between;">
      <button class="btn btn-ghost btn-sm" onclick="closeModal();openProfilePicker()">👤 Changer d'utilisateur</button>
      <button class="btn btn-secondary btn-sm" onclick="closeModal();showView('settings')">⚙️ Réglages du mode famille</button>
    </div>`);
}

/* ===================== Carte Paramètres ===================== */

function familySettingsHTML() {
  if (FAM.active) {
    return `<div class="card" style="margin-bottom:18px;max-width:560px;border-left:4px solid var(--success);">
    <h3>👨‍👩‍👧 Mode famille — actif ✅</h3>
    <p class="muted small" style="margin:10px 0 12px;">
      Profil : <b>${FAM.profile ? FAM.profile.emoji + " " + esc(FAM.profile.name) : "?"}</b> ·
      Carnet ouvert : <b>${carnetLabel(FAM.carnet)}</b><br>
      Les modifications des autres sont récupérées automatiquement (toutes les 15 s).
      Les pièces jointes 📎 restent locales à chaque PC.</p>
    <div class="row" style="flex-wrap:wrap;">
      <button class="btn btn-secondary btn-sm" onclick="openFamilyMenu()">📓 Changer de carnet / d'utilisateur</button>
      <button class="btn btn-ghost btn-sm" onclick="famDisconnect()">🔌 Désactiver sur ce PC</button>
    </div>
  </div>`;
  }
  if (!window.showDirectoryPicker) {
    return `<div class="card" style="margin-bottom:18px;max-width:560px;">
      <h3>👨‍👩‍👧 Mode famille (pCloud)</h3>
      <p class="muted small" style="margin-top:10px;">Ce navigateur ne supporte pas l'accès aux fichiers.
      Utilise <b>Chrome</b> ou <b>Edge</b> pour activer le carnet partagé dans le dossier pCloud.</p>
    </div>`;
  }
  if (!FAM.active) {
    return `<div class="card" style="margin-bottom:18px;max-width:560px;border-left:4px solid var(--primary);">
      <h3>👨‍👩‍👧 Mode famille (pCloud)</h3>
      <p class="muted small" style="margin:10px 0 12px;">Stocke le carnet dans un dossier <b>synchronisé par pCloud</b> :
      toute la famille verra les mêmes voyages, depuis n'importe quel PC. Chacun a son profil,
      plus un carnet personnel s'il le souhaite.<br><br>
      👉 Choisis un dossier <b>dans ton pCloud</b> (par exemple un sous-dossier « donnees » de ce dossier d'application).</p>
      <button class="btn btn-primary btn-sm" onclick="setupFamily()">📂 Choisir le dossier des données</button>
    </div>`;
  }
}

async function famDisconnect() {
  if (!confirm("Désactiver le mode famille sur ce PC ? (les fichiers du dossier pCloud sont conservés ; cette session repasse sur les données locales)")) return;
  if (FAM.dirty) { clearTimeout(FAM.saveTimer); await doFamSave(); }
  clearInterval(FAM.pollTimer);
  FAM.active = false;
  FAM.dirHandle = null;
  FAM.carnet = null;
  await kvDel("dir");
  updateFamIndicator();
  renderSettings(document.getElementById("main"));
  toast("🔌 Mode famille désactivé sur ce PC");
}

/* ===================== Démarrage de l'application ===================== */

function showReconnectBar() {
  if (document.querySelector(".fam-reconnect")) return;
  const bar = document.createElement("div");
  bar.className = "fam-reconnect";
  bar.innerHTML = `<span>👨‍👩‍👧 Carnet familial configuré sur ce PC.</span>
    <button class="btn btn-primary btn-sm" onclick="famReconnect(this)">📂 Reconnecter</button>
    <button class="btn btn-ghost btn-sm" onclick="this.parentElement.remove()">Plus tard</button>`;
  document.body.appendChild(bar);
}

async function famReconnect(btn) {
  try {
    if (await FAM.dirHandle.requestPermission({ mode: "readwrite" }) === "granted") {
      btn.parentElement.remove();
      await initFamily(false);
    } else {
      toast("❌ Autorisation refusée");
    }
  } catch (e) {
    toast("❌ " + e.message);
  }
}

/* ===================== 📱 Consultation à distance (mobile) =====================
   Sur un appareil sans accès au dossier pCloud (téléphone), on charge le carnet
   depuis un lien public pCloud (lecture). Les photos, elles, viennent d'un import
   ZIP fait une fois (IndexedDB) et se recollent par identifiant. */

const REMOTE_KEY = "mesVoyages.remoteCarnet";

function getRemoteURL() { return (localStorage.getItem(REMOTE_KEY) || "").trim(); }

// Convertit un lien public pCloud en lien de téléchargement direct (via l'API pCloud)
async function resolvePcloudLink(url) {
  const m = url.match(/[?&]code=([A-Za-z0-9]+)/);
  if (!m) return url; // déjà un lien direct
  const code = m[1];
  for (const api of ["https://eapi.pcloud.com/getpublinkdownload?code=", "https://api.pcloud.com/getpublinkdownload?code="]) {
    try {
      const r = await (await fetch(api + code)).json();
      if (r && r.result === 0 && r.hosts && r.hosts.length) return "https://" + r.hosts[0] + r.path;
    } catch (e) { /* essaie l'autre région, puis l'URL brute */ }
  }
  return url;
}

async function loadRemoteCarnet(url, silent) {
  url = (url || getRemoteURL()).trim();
  if (!url) { if (!silent) toast("Colle d'abord un lien de carnet 📱"); return false; }
  if (!silent) toast("⏳ Chargement du carnet depuis le lien…");
  try {
    const direct = await resolvePcloudLink(url);
    const res = await fetch(direct, { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const doc = await res.json();
    const data = (doc && doc.data && Array.isArray(doc.data.trips)) ? doc.data : doc;
    if (!data || !Array.isArray(data.trips)) throw new Error("format");
    state = Object.assign({ trips: [], wishlist: [], trash: [], passports: [], settings: {} }, data);
    state.settings = Object.assign({ theme: "light", currency: "EUR", userName: "" }, data.settings);
    window._remoteMode = true;
    saveStateLocal();
    applyTheme();
    rerenderCurrentView();
    if (!silent) toast(`📱 Carnet chargé (lecture) — ${state.trips.length} voyage(s)`);
    return true;
  } catch (e) {
    if (!silent) toast("❌ Lien illisible (lien non direct, CORS, ou format). Utilise un lien de TÉLÉCHARGEMENT direct, ou la restauration ZIP pour les photos.");
    return false;
  }
}

function saveRemoteURL() {
  const v = (document.getElementById("remote-url").value || "").trim();
  if (v) { localStorage.setItem(REMOTE_KEY, v); loadRemoteCarnet(v, false); }
  else { localStorage.removeItem(REMOTE_KEY); toast("Lien effacé — ce téléphone repart sur son carnet local."); }
}

async function bootApp() {
  loadState();
  state.trash = state.trash || [];
  applyTheme();
  autoBackup();
  showView("dashboard");
  // Reconnexion du mode famille si configuré sur ce PC
  try {
    const dir = await kvGet("dir");
    if (dir) {
      FAM.dirHandle = dir;
      const perm = await dir.queryPermission({ mode: "readwrite" });
      if (perm === "granted") await initFamily(false);
      else showReconnectBar();
      return;
    }
  } catch (e) { /* mode solo */ }
  // Pas de dossier pCloud (ex : téléphone) → consultation à distance si un lien est configuré
  if (getRemoteURL()) loadRemoteCarnet(getRemoteURL(), true);
}

bootApp();
