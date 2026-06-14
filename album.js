/* ============================================================
   Mes Voyages — Album souvenir de fin de voyage
   Génère une page HTML autonome et exhaustive : couverture,
   chiffres clés, carte du parcours, itinéraire, journal AVEC
   photos intégrées, budget, palmarès… À garder, imprimer ou partager.
   Chargé après features.js (utilise fdb, esc, fmtMoney, etc.).
   ============================================================ */

"use strict";

/* ===================== Outils images ===================== */

// Compresse une image (Blob) en JPEG redimensionné, en respectant l'orientation EXIF.
async function shrinkImageBlob(blob, maxDim, quality) {
  const bmp = await createImageBitmap(blob, { imageOrientation: "from-image" });
  const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  canvas.getContext("2d").drawImage(bmp, 0, 0, w, h);
  bmp.close();
  return canvas;
}

async function blobToDataURL(blob, maxDim, quality) {
  try {
    const canvas = await shrinkImageBlob(blob, maxDim, quality);
    return canvas.toDataURL("image/jpeg", quality);
  } catch (e) {
    // Format non décodable par canvas : on tente le fichier brut
    return new Promise(res => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = () => res(null);
      r.readAsDataURL(blob);
    });
  }
}

// Blob JPEG compressé (pour stocker les grosses photos au lieu de les refuser)
async function compressImageBlob(blob, maxDim, quality) {
  const canvas = await shrinkImageBlob(blob, maxDim, quality);
  return new Promise(res => canvas.toBlob(res, "image/jpeg", quality));
}

/* ===================== Options de l'album ===================== */

function openAlbumOptions(tripId) {
  const t = getTrip(tripId);
  if (!t) return;
  openModal("📕 Album souvenir — " + esc(t.title), `
    <p class="muted small" style="margin-bottom:14px;">
      L'album rassemble <b>tout le voyage</b> dans une seule page : couverture, chiffres clés, carte du parcours,
      itinéraire jour par jour, journal de bord <b>avec les photos</b>, budget, palmarès…
      Un fichier unique à garder précieusement, imprimer en PDF 🖨️ ou envoyer à la famille 💌.</p>
    <div class="form-group"><label>Qualité des photos intégrées</label>
      <select id="al-quality">
        <option value="std" selected>📷 Standard — bon équilibre (recommandé)</option>
        <option value="hi">✨ Haute — photos plus grandes (fichier plus lourd)</option>
        <option value="lo">🪶 Légère — fichier compact, idéal pour envoyer</option>
      </select></div>
    <div class="form-group">
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
        <input type="checkbox" id="al-prepa" checked style="width:auto;"> Inclure bagages, préparatifs et liste de courses</label>
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-top:6px;">
        <input type="checkbox" id="al-docs" style="width:auto;"> Inclure les documents (n° de résa, adresses… infos parfois sensibles)</label>
    </div>
    <p class="muted small">📎 Les photos intégrées sont celles enregistrées sur <b>ce</b> PC (journal, étapes, photos géolocalisées).</p>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Annuler</button>
      <button class="btn btn-primary" onclick="generateAlbum('${tripId}')">📕 Générer l'album</button>
    </div>`);
}

/* ===================== Collecte des photos ===================== */

async function albumCollectImages(owner, maxDim, quality, onOne) {
  let files = [];
  try { files = await fdbList(owner); } catch (e) {}
  const imgs = [];
  for (const f of files) {
    if (!f.type || !f.type.startsWith("image/")) continue;
    const src = await blobToDataURL(f.blob, maxDim, quality);
    if (src) imgs.push({ name: f.name, src });
    if (onOne) onOne();
  }
  return imgs;
}

/* ===================== Carte SVG du parcours (hors ligne) ===================== */

function albumMapSVG(t) {
  const steps = t.steps || [];
  const photos = t.geophotos || [];
  const pts = steps.concat(photos);
  if (!pts.length) return "";

  const W = 760, H = 430, pad = 46;
  // Géométrie de chaque tronçon : vraies routes si dispo (legGeom), sinon ligne droite
  const legs = [];
  for (let i = 1; i < steps.length; i++) {
    const geom = (typeof legGeom === "function") ? legGeom(steps[i - 1], steps[i]) : [[steps[i - 1].lat, steps[i - 1].lng], [steps[i].lat, steps[i].lng]];
    legs.push({ transport: steps[i].transport, coords: geom, routed: geom.length > 2 });
  }
  // Bornes : étapes + photos + tous les points des tracés (pour bien cadrer la route)
  const allLat = pts.map(p => p.lat), allLng = pts.map(p => p.lng);
  legs.forEach(l => l.coords.forEach(c => { allLat.push(c[0]); allLng.push(c[1]); }));
  let minLat = Math.min(...allLat), maxLat = Math.max(...allLat);
  let minLng = Math.min(...allLng), maxLng = Math.max(...allLng);
  const kx = Math.cos((minLat + maxLat) / 2 * Math.PI / 180) || 1;
  // marge minimale pour éviter une carte à plat avec 1 seul point
  const spanLng = Math.max(0.05, maxLng - minLng), spanLat = Math.max(0.05, maxLat - minLat);
  const scale = Math.min((W - 2 * pad) / (spanLng * kx), (H - 2 * pad) / spanLat);
  const cx = (minLng + maxLng) / 2, cy = (minLat + maxLat) / 2;
  const X = lng => W / 2 + (lng - cx) * kx * scale;
  const Y = lat => H / 2 - (lat - cy) * scale;

  let svg = "";
  // Tronçons colorés selon le transport : polyligne le long des vraies routes
  legs.forEach(l => {
    const tr = TRANSPORTS[l.transport] || TRANSPORTS.voiture;
    const dpts = l.coords.map(c => `${X(c[1]).toFixed(1)},${Y(c[0]).toFixed(1)}`).join(" ");
    // liseré blanc sous les tracés routés pour le relief
    if (l.routed) svg += `<polyline points="${dpts}" fill="none" stroke="#ffffff" stroke-width="6" stroke-linejoin="round" stroke-linecap="round" opacity="0.9"/>`;
    svg += `<polyline points="${dpts}" fill="none" stroke="${tr.color}" stroke-width="${l.routed ? 3.5 : 3.5}" stroke-linejoin="round" stroke-linecap="round" ${l.routed ? "" : (tr.dash ? `stroke-dasharray="${tr.dash}"` : "")} opacity="0.95"/>`;
    const mid = l.coords[Math.floor(l.coords.length / 2)];
    svg += `<text x="${X(mid[1]).toFixed(1)}" y="${(Y(mid[0]) - 7).toFixed(1)}" font-size="15" text-anchor="middle">${tr.emoji}</text>`;
  });
  // Photos géolocalisées
  photos.forEach(p => {
    svg += `<text x="${X(p.lng).toFixed(1)}" y="${(Y(p.lat) + 5).toFixed(1)}" font-size="15" text-anchor="middle">📷</text>`;
  });
  // Étapes numérotées
  steps.forEach((s, i) => {
    const x = X(s.lng).toFixed(1), y = Y(s.lat).toFixed(1);
    svg += `<circle cx="${x}" cy="${y}" r="13" fill="${t.color || "#4f6df5"}" stroke="#fff" stroke-width="2.5"/>
      <text x="${x}" y="${(+y + 4.5).toFixed(1)}" font-size="12" font-weight="bold" fill="#fff" text-anchor="middle">${i + 1}</text>`;
    const name = s.name.length > 24 ? s.name.slice(0, 23) + "…" : s.name;
    svg += `<text x="${x}" y="${(+y - 18).toFixed(1)}" font-size="11" fill="#3a4358" text-anchor="middle" font-weight="600">${esc(name)}</text>`;
  });

  const used = [...new Set(steps.slice(1).map(s => s.transport || "voiture"))];
  const legend = used.map(k => { const tr = TRANSPORTS[k] || TRANSPORTS.voiture; return `<span style="border-left:4px solid ${tr.color};padding:2px 8px;margin-right:8px;background:#fff;border-radius:6px;display:inline-block;">${tr.label}</span>`; }).join("");

  const anyRouted = legs.some(l => l.routed);
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;background:linear-gradient(160deg,#eef4ff,#f0fbf4);border-radius:14px;border:1px solid #dfe6f2;" xmlns="http://www.w3.org/2000/svg">${svg}</svg>
    ${legend ? `<p style="margin-top:8px;font-size:0.82rem;">${legend}</p>` : ""}
    <p class="al-muted">${anyRouted ? "Tracé suivant les vraies routes pour les trajets terrestres" : "Tracé schématique à vol d'oiseau"} — les numéros suivent l'ordre des étapes.</p>`;
}

/* ===================== Génération de l'album ===================== */

function albumProgress(msg) {
  const el = document.getElementById("album-progress");
  if (el) el.textContent = msg;
}

async function generateAlbum(tripId) {
  const t = getTrip(tripId);
  if (!t) return;

  // Lecture des options (avec valeurs par défaut si la modale n'est pas ouverte)
  const qSel = document.getElementById("al-quality");
  const quality = qSel ? qSel.value : "std";
  const includePrepa = !document.getElementById("al-prepa") || document.getElementById("al-prepa").checked;
  const includeDocs = !!(document.getElementById("al-docs") && document.getElementById("al-docs").checked);
  const photoOpts = { std: { dim: 1280, q: 0.8 }, hi: { dim: 1920, q: 0.85 }, lo: { dim: 900, q: 0.68 } }[quality] || { dim: 1280, q: 0.8 };

  openModal("📕 Création de l'album…", `
    <div style="text-align:center;padding:18px 0;">
      <div style="font-size:2.6rem;">📕</div>
      <p id="album-progress" style="margin-top:12px;">Préparation…</p>
      <p class="muted small" style="margin-top:8px;">Les photos sont en cours d'intégration, cela peut prendre quelques secondes.</p>
    </div>`);

  try {
    /* ---- Calcule les tracés routiers manquants (pour la carte de l'album) ---- */
    if (typeof ensureRoutesCached === "function") {
      albumProgress("Calcul des trajets sur routes…");
      try { await ensureRoutesCached(t); } catch (e) { /* hors ligne : tracé à vol d'oiseau */ }
    }

    /* ---- Collecte des photos ---- */
    const journal = (t.journal || []).slice().sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    const steps = t.steps || [];
    const docs = t.documents || [];
    const geo = t.geophotos || [];

    let totalImgs = geo.length, doneImgs = 0;
    const bump = () => { doneImgs++; albumProgress(`Photos intégrées : ${doneImgs}…`); };

    albumProgress("Lecture des photos…");
    const journalImgs = {}, stepImgs = {}, docImgs = {};
    for (const j of journal) journalImgs[j.id] = await albumCollectImages(j.id, photoOpts.dim, photoOpts.q, bump);
    for (const s of steps) stepImgs[s.id] = await albumCollectImages(s.id, photoOpts.dim, photoOpts.q, bump);
    if (includeDocs) for (const d of docs) docImgs[d.id] = await albumCollectImages(d.id, photoOpts.dim, photoOpts.q, bump);

    const geoImgs = [];
    for (const p of geo) {
      try {
        const rec = await fdbGet(p.id);
        if (rec && rec.blob) {
          const src = await blobToDataURL(rec.blob, photoOpts.dim, photoOpts.q);
          if (src) geoImgs.push({ name: p.name, src, lat: p.lat, lng: p.lng });
        }
      } catch (e) {}
      bump();
    }

    const nbPhotos = geoImgs.length
      + Object.values(journalImgs).reduce((s, a) => s + a.length, 0)
      + Object.values(stepImgs).reduce((s, a) => s + a.length, 0);

    albumProgress("Mise en page de l'album…");
    const html = buildAlbumHTML(t, { journal, journalImgs, stepImgs, docImgs, geoImgs, includePrepa, includeDocs, nbPhotos });

    /* ---- Téléchargement + aperçu ---- */
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "album-" + t.title.replace(/[^\w\sàâäéèêëîïôöùûüç-]/gi, "").trim().replace(/\s+/g, "-").toLowerCase() + "-" + todayISO() + ".html";
    a.click();
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60000);

    t.albumAt = todayISO();
    saveState();
    closeModal();
    if (currentTripId === t.id) renderTripDetail(document.getElementById("main"));
    toast("📕 Album souvenir généré — bon voyage dans tes souvenirs !");
  } catch (e) {
    console.error("Album :", e);
    closeModal();
    toast("❌ Erreur pendant la création de l'album : " + e.message);
  }
}

/* ===================== Construction du HTML ===================== */

function buildAlbumHTML(t, c) {
  const dur = tripDuration(t);
  const est = tripEstimates(t);
  const spent = (t.expenses || []).reduce((s, e) => s + (+e.amount || 0), 0);
  const acts = (t.activities || []).slice().sort((a, b) => ((a.date || "") + (a.time || "99:99")).localeCompare((b.date || "") + (b.time || "99:99")));
  const color = t.color || "#4f6df5";
  const nl2br = s => esc(s).replace(/\n/g, "<br>");

  /* ---- Couverture : première photo disponible ---- */
  const coverImg = (c.geoImgs[0] && c.geoImgs[0].src)
    || (Object.values(c.journalImgs).find(a => a.length) || [])[0] && (Object.values(c.journalImgs).find(a => a.length))[0].src
    || (Object.values(c.stepImgs).find(a => a.length) || [])[0] && (Object.values(c.stepImgs).find(a => a.length))[0].src
    || null;

  /* ---- En chiffres ---- */
  const stats = [
    dur ? [dur, "jour" + (dur > 1 ? "s" : "")] : null,
    (t.steps || []).length ? [(t.steps || []).length, "étapes"] : null,
    est.km ? [fmtKm(est.km), "parcourus"] : null,
    acts.length ? [acts.length, "activités"] : null,
    c.journal.length ? [c.journal.length, "récits du journal"] : null,
    c.nbPhotos ? [c.nbPhotos, "photos"] : null,
    spent ? [fmtMoney(spent), "dépensés"] : null,
    est.co2 ? [Math.round(est.co2) + " kg", "CO₂ / pers."] : null
  ].filter(Boolean).map(([n, l]) => `<div class="al-stat"><b>${n}</b><span>${l}</span></div>`).join("");

  /* ---- Étapes ---- */
  const stepsHTML = (t.steps || []).map((s, i) => {
    let leg = "";
    if (i > 0) {
      const tr = TRANSPORTS[s.transport] || TRANSPORTS.voiture;
      const km = haversineKm(t.steps[i - 1], s);
      const e = estimateLeg(km, s.transport);
      leg = `<div class="al-muted">${tr.label} depuis ${esc(t.steps[i - 1].name)} · ${fmtKm(km)} · ~${fmtH(e.h)}</div>`;
    }
    const imgs = (c.stepImgs[s.id] || []).map(im => `<img src="${im.src}" alt="${esc(im.name)}">`).join("");
    return `<div class="al-step">
      <div class="al-stepnum" style="background:${color}">${i + 1}</div>
      <div style="flex:1;"><b>${esc(s.name)}</b>${leg}
        ${s.notes ? `<div class="al-muted">📝 ${nl2br(s.notes)}</div>` : ""}
        ${imgs ? `<div class="al-thumbs">${imgs}</div>` : ""}
      </div></div>`;
  }).join("");

  /* ---- Itinéraire jour par jour ---- */
  const byDate = {};
  acts.forEach(a => { (byDate[a.date] = byDate[a.date] || []).push(a); });
  const itiHTML = Object.keys(byDate).sort().map(d => {
    const dayNum = t.start ? daysBetween(t.start, d) + 1 : null;
    const list = byDate[d].map(a => `
      <li>${a.done ? "✅" : "•"} <b>${a.time || ""}</b> ${(CAT_ACTIVITES[a.category] || "📌").split(" ")[0]} ${esc(a.title)}
        ${a.cost ? `<span class="al-muted">· ${fmtMoney(a.cost)}</span>` : ""}
        ${a.notes ? `<div class="al-muted" style="margin-left:22px;">${nl2br(a.notes)}</div>` : ""}</li>`).join("");
    return `<div class="al-day"><h3>${dayNum ? `<span class="al-daynum" style="background:${color}">Jour ${dayNum}</span> ` : ""}${fmtDate(d)}</h3><ul>${list}</ul></div>`;
  }).join("");

  /* ---- Journal avec photos ---- */
  const journalHTML = c.journal.map(j => {
    const imgs = (c.journalImgs[j.id] || []).map(im => `<img src="${im.src}" alt="${esc(im.name)}">`).join("");
    return `<div class="al-entry">
      <h3><span class="al-mood">${j.mood || "🙂"}</span> ${esc(j.title)} <small>— ${fmtDate(j.date)}</small></h3>
      <p>${nl2br(j.content)}</p>
      ${imgs ? `<div class="al-photos">${imgs}</div>` : ""}
    </div>`;
  }).join("");

  /* ---- Galerie des photos géolocalisées ---- */
  const galleryHTML = c.geoImgs.map(im =>
    `<figure><img src="${im.src}" alt="${esc(im.name)}"><figcaption>📍 ${im.lat.toFixed(3)}, ${im.lng.toFixed(3)}</figcaption></figure>`).join("");

  /* ---- Budget ---- */
  let budgetHTML = "";
  const expenses = (t.expenses || []).slice().sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  if (expenses.length) {
    const byCat = {};
    expenses.forEach(e => { byCat[e.category] = (byCat[e.category] || 0) + (+e.amount || 0); });
    const maxCat = Math.max(1, ...Object.values(byCat));
    const bars = Object.entries(CAT_DEPENSES).filter(([k]) => byCat[k]).sort((a, b) => byCat[b[0]] - byCat[a[0]]).map(([k, cat]) => `
      <div class="al-bar"><span>${cat.emoji} ${cat.label}</span>
        <div class="al-track"><div style="width:${Math.round(byCat[k] / maxCat * 100)}%;background:${cat.color};"></div></div>
        <b>${fmtMoney(byCat[k])}</b></div>`).join("");
    const lines = expenses.map(e => {
      const cat = CAT_DEPENSES[e.category] || CAT_DEPENSES.autre;
      return `<tr><td>${e.date ? fmtDateShort(e.date) : ""}</td><td>${cat.emoji} ${esc(e.label)}${e.payer && payerName(t, e.payer) ? ` <small>(${payerName(t, e.payer)})</small>` : ""}</td><td style="text-align:right;"><b>${fmtMoney(e.amount)}</b></td></tr>`;
    }).join("");
    budgetHTML = `<h2>💰 Le budget</h2>
      <p style="font-size:1.25rem;"><b>${fmtMoney(spent)}</b> dépensés${t.budget ? ` sur ${fmtMoney(t.budget)} prévus` : ""}${t.travelers > 1 ? ` · soit ${fmtMoney(spent / t.travelers)} par personne` : ""}</p>
      ${bars}<details style="margin-top:12px;"><summary style="cursor:pointer;font-weight:600;">🧾 Les ${expenses.length} dépenses en détail</summary>
      <table class="al-table">${lines}</table></details>`;
  }

  /* ---- Palmarès ---- */
  const aw = t.awards || {};
  const awardsHTML = (aw.moment || aw.repas || aw.paysage || aw.galere || aw.note) ? `
    <h2>🏆 Le palmarès du voyage</h2><div class="al-awards">
    ${aw.moment ? `<div>🌟 <b>Meilleur moment</b><br>${esc(aw.moment)}</div>` : ""}
    ${aw.repas ? `<div>🍽️ <b>Meilleur repas</b><br>${esc(aw.repas)}</div>` : ""}
    ${aw.paysage ? `<div>📸 <b>Plus beau paysage</b><br>${esc(aw.paysage)}</div>` : ""}
    ${aw.galere ? `<div>😱 <b>Plus grosse galère</b><br>${esc(aw.galere)}</div>` : ""}
    ${aw.note ? `<div>⭐ <b>Note globale</b><br><span style="font-size:1.3rem;color:#f59e0b;">${"★".repeat(aw.note)}${"☆".repeat(5 - aw.note)}</span></div>` : ""}
    </div>` : "";

  /* ---- Bagages / préparatifs / courses ---- */
  let prepaHTML = "";
  if (c.includePrepa) {
    const cols = [];
    if ((t.packing || []).length) cols.push(`<div><h3>🎒 Dans les valises</h3><ul class="al-check">${t.packing.map(i => {
      const owner = (t.people || []).find(p => p.id === i.owner);
      return `<li>${i.done ? "☑" : "☐"} ${esc(i.label)}${owner ? ` <small>(${owner.emoji} ${esc(owner.name)})</small>` : ""}</li>`;
    }).join("")}</ul></div>`);
    if ((t.todos || []).length) cols.push(`<div><h3>✅ Les préparatifs</h3><ul class="al-check">${t.todos.map(x =>
      `<li>${x.done ? "☑" : "☐"} ${esc(x.label)}</li>`).join("")}</ul></div>`);
    if ((t.shopping || []).length) cols.push(`<div><h3>🛒 La liste de courses</h3><ul class="al-check">${t.shopping.map(i =>
      `<li>${i.done ? "☑" : "☐"} ${esc(i.label)}</li>`).join("")}</ul></div>`);
    if (cols.length) prepaHTML = `<h2>🧳 Côté organisation</h2><div class="al-cols">${cols.join("")}</div>`;
  }

  /* ---- Bingo souvenir ---- */
  let bingoHTML = "";
  if (t.bingo && t.bingo.cells && t.bingo.cells.some(x => x.found)) {
    const found = t.bingo.cells.filter(x => x.found);
    bingoHTML = `<h2>🎮 Le bingo du trajet</h2>
      <p>${found.length}/${t.bingo.cells.length} cases trouvées en route : ${found.map(x => `<span class="al-chip">${esc(x.label)}</span>`).join(" ")}</p>`;
  }

  /* ---- Documents (option) ---- */
  let docsHTML = "";
  if (c.includeDocs && (t.documents || []).length) {
    docsHTML = `<h2>📄 Les documents du voyage</h2>` + t.documents.map(d => {
      const imgs = (c.docImgs[d.id] || []).map(im => `<img src="${im.src}" alt="${esc(im.name)}">`).join("");
      return `<div class="al-entry"><h3>${(DOC_TYPES[d.type] || DOC_TYPES.autre).split(" ")[0]} ${esc(d.title)}</h3>
        <pre class="al-pre">${esc(d.content)}</pre>${imgs ? `<div class="al-thumbs">${imgs}</div>` : ""}</div>`;
    }).join("");
  }

  /* ---- Voyageurs ---- */
  const peopleHTML = (t.people || []).length
    ? `<p style="margin-top:8px;">👥 L'équipe du voyage : ${t.people.map(p => `<b>${p.emoji} ${esc(p.name)}</b>`).join(" · ")}</p>` : "";

  /* ---- Mot de la fin de chaque voyageur ---- */
  const fw = t.farewells || {};
  const fwPeople = (t.people || []).filter(p => fw[p.id]);
  const farewellHTML = fwPeople.length ? `<h2>✍️ Le mot de la fin</h2><div class="al-awards">
    ${fwPeople.map(p => `<div><b>${p.emoji} ${esc(p.name)}</b><br>${nl2br(fw[p.id])}</div>`).join("")}
  </div>` : "";

  const mapHTML = albumMapSVG(t);

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>📕 ${esc(t.title)} — Album souvenir</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  /* Drapeaux emoji sous Windows (charge en ligne, retombe sur les lettres hors connexion) */
  @font-face {
    font-family: "TwemojiFlags";
    src: url("https://cdn.jsdelivr.net/npm/country-flag-emoji-polyfill@0.1.8/dist/TwemojiCountryFlags.woff2") format("woff2");
    unicode-range: U+1F1E6-1F1FF, U+1F3F4, U+E0062-E0063, U+E0065, U+E0067, U+E006C, U+E006E, U+E0073-E0074, U+E0077, U+E007F;
    font-display: swap;
  }
  body { font-family: "TwemojiFlags", "Segoe UI", system-ui, -apple-system, sans-serif; margin: 0; background: #f2f4fa; color: #1c2333; line-height: 1.65; }
  .page { max-width: 860px; margin: 0 auto; padding: 26px 22px 70px; }
  .cover { position: relative; border-radius: 22px; overflow: hidden; color: #fff; padding: 60px 40px;
    background: linear-gradient(135deg, ${color}, ${color}bb); box-shadow: 0 10px 35px rgba(28,35,51,0.22); text-align: center; }
  .cover img.bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0.42; }
  .cover > div { position: relative; }
  .cover h1 { font-size: 2.5rem; margin: 6px 0 4px; text-shadow: 0 2px 12px rgba(0,0,0,0.45); }
  .cover .flag { font-size: 3.4rem; }
  .cover p { font-size: 1.08rem; margin: 4px 0; text-shadow: 0 1px 8px rgba(0,0,0,0.45); }
  h2 { margin: 44px 0 14px; font-size: 1.45rem; border-bottom: 3px solid ${color}33; padding-bottom: 8px; }
  h3 { margin: 18px 0 6px; }
  .al-statgrid { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 18px; }
  .al-stat { flex: 1 1 130px; background: #fff; border-radius: 14px; padding: 14px 10px; text-align: center; box-shadow: 0 3px 12px rgba(28,35,51,0.07); }
  .al-stat b { display: block; font-size: 1.35rem; color: ${color}; }
  .al-stat span { font-size: 0.82rem; color: #6b7487; }
  .al-step { display: flex; gap: 12px; padding: 10px 0; border-bottom: 1px dashed #dfe4ef; }
  .al-stepnum { width: 30px; height: 30px; border-radius: 50%; color: #fff; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .al-muted { color: #6b7487; font-size: 0.88rem; }
  .al-day { background: #fff; border-radius: 14px; padding: 14px 20px; margin-bottom: 14px; box-shadow: 0 3px 12px rgba(28,35,51,0.06); }
  .al-day ul { margin: 8px 0 0; padding-left: 6px; list-style: none; }
  .al-day li { padding: 3px 0; }
  .al-daynum { color: #fff; font-size: 0.8rem; padding: 3px 10px; border-radius: 999px; vertical-align: 2px; }
  .al-entry { background: #fff; border-radius: 14px; padding: 16px 22px; margin-bottom: 16px; box-shadow: 0 3px 12px rgba(28,35,51,0.06); }
  .al-entry small { color: #6b7487; font-weight: 400; }
  .al-mood { font-size: 1.4rem; }
  .al-photos { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 12px; }
  .al-photos img { max-width: calc(50% - 5px); border-radius: 12px; box-shadow: 0 3px 10px rgba(28,35,51,0.15); }
  .al-thumbs { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
  .al-thumbs img { height: 110px; border-radius: 10px; }
  .al-gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 12px; }
  .al-gallery figure { margin: 0; }
  .al-gallery img { width: 100%; height: 190px; object-fit: cover; border-radius: 12px; box-shadow: 0 3px 10px rgba(28,35,51,0.15); }
  .al-gallery figcaption { font-size: 0.75rem; color: #6b7487; margin-top: 3px; }
  .al-bar { display: flex; align-items: center; gap: 10px; padding: 4px 0; }
  .al-bar span { width: 165px; flex-shrink: 0; }
  .al-bar b { width: 95px; text-align: right; flex-shrink: 0; }
  .al-track { flex: 1; height: 12px; background: #e8ecf5; border-radius: 999px; overflow: hidden; }
  .al-track div { height: 100%; border-radius: 999px; }
  .al-table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  .al-table td { padding: 5px 8px; border-bottom: 1px solid #e8ecf5; font-size: 0.92rem; }
  .al-awards { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
  .al-awards > div { background: #fff; border-radius: 14px; padding: 14px 16px; box-shadow: 0 3px 12px rgba(28,35,51,0.06); border-top: 3px solid ${color}; }
  .al-cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; }
  .al-check { list-style: none; padding: 0; margin: 6px 0; font-size: 0.92rem; }
  .al-check li { padding: 2px 0; }
  .al-chip { display: inline-block; background: #fff; border: 1px solid #dfe4ef; border-radius: 999px; padding: 2px 10px; font-size: 0.85rem; margin: 2px; }
  .al-pre { white-space: pre-wrap; background: #f6f8fc; border-radius: 10px; padding: 10px 14px; font-family: inherit; font-size: 0.92rem; }
  .al-notes { background: #fff8e8; border-radius: 14px; padding: 14px 20px; border-left: 4px solid #f59e0b; }
  footer { text-align: center; margin-top: 60px; color: #6b7487; font-size: 0.85rem; }
  .print-btn { position: fixed; right: 20px; bottom: 20px; background: ${color}; color: #fff; border: none; border-radius: 999px;
    padding: 13px 22px; font-size: 1rem; cursor: pointer; box-shadow: 0 6px 20px rgba(28,35,51,0.3); font-family: inherit; }
  @media print {
    body { background: #fff; }
    .print-btn { display: none; }
    .cover { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    h2 { break-after: avoid; }
    .al-entry, .al-day, .al-awards > div, .al-gallery figure { break-inside: avoid; }
  }
</style></head><body>
<div class="page">
  <div class="cover">
    ${coverImg ? `<img class="bg" src="${coverImg}" alt="">` : ""}
    <div>
      <div class="flag">${flagFor(t.country)}</div>
      <h1>${esc(t.title)}</h1>
      <p>📍 ${esc(t.destination)}${t.country ? ", " + esc(t.country) : ""}</p>
      ${t.start ? `<p>📅 du ${fmtDate(t.start)} au ${fmtDate(t.end)} — ${dur} jours</p>` : ""}
      <p>👥 ${t.travelers || 1} voyageur${(t.travelers || 1) > 1 ? "s" : ""}</p>
    </div>
  </div>

  ${stats ? `<div class="al-statgrid">${stats}</div>` : ""}
  ${peopleHTML}
  ${t.notes ? `<div class="al-notes" style="margin-top:18px;">📝 ${nl2br(t.notes)}</div>` : ""}

  ${mapHTML ? `<h2>🗺️ Le parcours</h2>${mapHTML}` : ""}
  ${stepsHTML ? `<h2>🧭 Les étapes</h2>${stepsHTML}` : ""}
  ${itiHTML ? `<h2>🗓️ L'itinéraire jour par jour</h2>${itiHTML}` : ""}
  ${journalHTML ? `<h2>📔 Le journal de bord</h2>${journalHTML}` : ""}
  ${galleryHTML ? `<h2>📷 La galerie photos</h2><div class="al-gallery">${galleryHTML}</div>` : ""}
  ${budgetHTML}
  ${awardsHTML}
  ${farewellHTML}
  ${bingoHTML}
  ${prepaHTML}
  ${docsHTML}

  <footer>📕 Album généré le ${fmtDate(todayISO())} avec ❤️ par <b>Mes Voyages</b>.<br>
  Astuce : le bouton 🖨️ transforme cet album en PDF (choisis « Enregistrer au format PDF »).</footer>
</div>
<button class="print-btn" onclick="window.print()">🖨️ Imprimer / PDF</button>
</body></html>`;
}

/* ===================== Rappel sur le tableau de bord ===================== */

function albumNudgeHTML() {
  const today = todayISO();
  const candidates = state.trips.filter(t =>
    t.status === "termine" && t.end && !t.albumAt &&
    daysBetween(t.end, today) >= 0 && daysBetween(t.end, today) <= 60 &&
    ((t.journal || []).length || (t.activities || []).length || (t.steps || []).length || (t.geophotos || []).length));
  if (!candidates.length) return "";
  const t = candidates.sort((a, b) => b.end.localeCompare(a.end))[0];
  return `<div class="card" style="margin-bottom:24px;border-left:4px solid var(--success);">
    <div class="row-between">
      <div>
        <h3>📕 Et si on gravait les souvenirs ?</h3>
        <p class="muted small" style="margin-top:6px;">« ${esc(t.title)} » est terminé — génère son <b>album souvenir</b> :
        photos, journal, itinéraire, budget… tout le voyage dans une seule page à garder.</p>
      </div>
      <button class="btn btn-primary btn-sm" style="flex-shrink:0;" onclick="openAlbumOptions('${t.id}')">📕 Créer l'album</button>
    </div>
  </div>`;
}
