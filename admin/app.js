// ══════════════════════════════════════════════════════════════
//  TEC AUDIT — Espace interne : logique applicative
// ══════════════════════════════════════════════════════════════
var APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwbTEFCrnTOjmhycGdb1ShTln6ntnAi-cSeFyPbmIjqoxBqBZRlKwMc44uJev8Q8HI/exec';

var SESSION = { email: '', nom: '', role: '', token: '' };
var DATA = { colonnes: [], lignes: [], idx: {} };
var VUE = 'dossiers';
var TRI = { col: 'Dénomination', dir: 1 };
var LIGNE_OUVERTE = null;

function api(payload, cb) {
  var debut = Date.now();
  payload.t0 = debut;   // permet au serveur de mesurer le temps passé avant lui
  fetch(APPS_SCRIPT_URL, { method: 'POST', body: JSON.stringify(payload) })
    .then(function (r) { return r.json(); })
    .then(function (res) {
      // Mesure visible dans la console (console.debug est masqué par défaut
      // dans Chrome : on utilise console.log pour que la ligne apparaisse).
      var duree = (Date.now() - debut) / 1000;
      var poids = Math.round(JSON.stringify(res || '').length / 1024);
      var detail = (res && res.ms) ? ' · serveur ' + JSON.stringify(res.ms) : '';
      console.log('portail · ' + payload.action + ' · ' + duree.toFixed(1).replace('.', ',') + ' s · ' + poids + ' Ko' + detail);
      return res;
    })
    .catch(function (e) { return { ok: false, error: 'Erreur réseau : ' + e.message }; })
    .then(function (res) {
      // Une session expirée interrompt tout : on le dit clairement plutôt que
      // de laisser l'utilisateur cliquer dans le vide.
      if (res && !res.ok && /Session expirée/.test(res.error || '')) { sessionExpiree(); return; }
      cb(res);   // hors du catch : une erreur d'affichage garde sa trace dans la console
    });
}

function sessionExpiree() {
  oublierSessionAdmin();
  if ($('expire').style.display === 'flex') return;
  $('expire').style.display = 'flex';
  $('expire-btn').focus();
}

// Postes d'honoraires : mêmes libellés et mêmes clés que le serveur
var POSTES = [
  { cle: 'hCompta',    colonne: 'Honoraires compta-fiscal', libelle: 'Comptabilité et fiscal' },
  { cle: 'hOutils',    colonne: 'Débours outils digitaux',  libelle: 'Débours outils digitaux' },
  { cle: 'hJuridique', colonne: 'Honoraires juridique',     libelle: 'Juridique' }
];
function nombre(v) { var n = parseFloat(String(v == null ? '' : v).replace(/[^0-9.,-]/g, '').replace(',', '.')); return isNaN(n) ? null : n; }
function montantFr(n) { return n === null ? '' : n.toLocaleString('fr-FR', { maximumFractionDigits: 2 }); }
// Champs de ventilation + total calculé en direct. `prefixe` évite les collisions d'identifiants.
function champsPostes(prefixe, valeurs) {
  return POSTES.map(function (p) {
    var v = valeurs ? valeurs[p.cle] : '';
    return '<label>' + esc(p.libelle) + ' € HT <input type="number" min="0" step="1" id="' + prefixe + p.cle +
      '" value="' + esc(v == null ? '' : v) + '" style="width:104px;" oninput="majTotalPostes(\'' + prefixe + '\')"></label>';
  }).join('') + '<span class="maj" id="' + prefixe + 'total" aria-live="polite"></span>';
}
function totalPostes(prefixe) {
  var total = null;
  POSTES.forEach(function (p) {
    var n = nombre(($(prefixe + p.cle) || {}).value);
    if (n !== null) total = (total || 0) + n;
  });
  return total;
}
function majTotalPostes(prefixe) {
  var el = $(prefixe + 'total'); if (!el) return;
  var t = totalPostes(prefixe);
  el.textContent = t === null ? '' : 'Total ' + montantFr(t) + ' € HT';
  el.className = 'maj';
}
function valeursPostes(prefixe) {
  var out = {};
  POSTES.forEach(function (p) { out[p.cle] = ($(prefixe + p.cle) || {}).value || ''; });
  return out;
}

function $(id) { return document.getElementById(id); }
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}

// ── Connexion ────────────────────────────────────────────────
function login() {
  var email = ($('email').value || '').trim();
  var mdp = $('motdepasse').value || '';
  var err = $('login-error');
  var btn = $('login-btn');
  if (!email || !mdp) { err.textContent = 'Renseignez votre email et votre mot de passe.'; err.style.display = 'block'; return; }
  err.style.display = 'none';
  btn.disabled = true;
  btn.textContent = 'Connexion…';

  api({ action: 'adminLogin', email: email, motdepasse: mdp }, function (res) {
    if (res && res.ok) {
      SESSION = { email: email.toLowerCase(), nom: res.nom, role: res.role, token: res.token };
      memoriserSessionAdmin();
      ouvrirApp();
    } else {
      btn.disabled = false;
      btn.textContent = 'Se connecter';
      err.textContent = (res && res.error) || 'Erreur.';
      err.style.display = 'block';
    }
  });
}

function afficherOubli(afficher) {
  $('form-login').style.display = afficher ? 'none' : '';
  $('form-oubli').style.display = afficher ? '' : 'none';
  $('login-error').style.display = 'none';
  $('oubli-ok').style.display = 'none';
}

function demanderReinit() {
  var email = ($('email-oubli').value || '').trim();
  var btn = $('oubli-btn');
  if (!email) return;
  btn.disabled = true;
  btn.textContent = 'Envoi…';
  api({ action: 'adminMdpOublie', email: email }, function () {
    btn.disabled = false;
    btn.textContent = 'Recevoir le lien';
    $('oubli-ok').style.display = 'block';
  });
}

// Arrivée depuis le lien reçu par email : ?email=…&reset=…
function verifierLienReinit() {
  var p = new URLSearchParams(location.search);
  var email = p.get('email'), reset = p.get('reset');
  if (!email || !reset) return false;
  $('form-login').style.display = 'none';
  $('form-oubli').style.display = 'none';
  $('form-definir').style.display = '';
  $('definir-email').textContent = email;
  window.__reset = { email: email, token: reset };
  return true;
}

function definirMdp() {
  var m1 = $('mdp1').value || '', m2 = $('mdp2').value || '';
  var err = $('definir-error');
  var btn = $('definir-btn');
  if (m1.length < 10) { err.textContent = 'Au moins 10 caractères.'; err.style.display = 'block'; return; }
  if (m1 !== m2) { err.textContent = 'Les deux mots de passe ne correspondent pas.'; err.style.display = 'block'; return; }
  err.style.display = 'none';
  btn.disabled = true;
  btn.textContent = 'Enregistrement…';
  api({ action: 'adminDefinirMdp', email: window.__reset.email, reset: window.__reset.token, motdepasse: m1 },
    function (res) {
      btn.disabled = false;
      btn.textContent = 'Enregistrer';
      if (res && res.ok) {
        history.replaceState({}, '', location.pathname);
        $('form-definir').style.display = 'none';
        $('form-login').style.display = '';
        $('email').value = window.__reset.email;
        $('motdepasse').focus();
        var ok = $('login-error');
        ok.textContent = '✓ Mot de passe enregistré. Vous pouvez vous connecter.';
        ok.style.display = 'block';
        ok.style.background = '#e8f5e9';
        ok.style.borderLeftColor = '#2e7d32';
        ok.style.color = '#2e7d32';
      } else {
        err.textContent = (res && res.error) || 'Erreur.';
        err.style.display = 'block';
      }
    });
}

function deconnexion() {
  SESSION = { email: '', nom: '', role: '', token: '' };
  oublierSessionAdmin();
  location.reload();
}

// ── Session mémorisée dans le navigateur (8 h, comme côté serveur) : plus de
//    reconnexion à chaque rechargement, et les formulaires en mode cabinet la lisent.
var CLE_SESSION_ADMIN = 'tec.admin.session';

// Le classeur met une dizaine de secondes à répondre. Plutôt que d'attendre
// devant un écran vide, on réaffiche la liste de la dernière consultation et on
// la remplace dès que le serveur a répondu. Effacée à la déconnexion.
var CLE_DOSSIERS = 'tec.admin.dossiers';
function memoriserDossiers(res) {
  try {
    localStorage.setItem(CLE_DOSSIERS, JSON.stringify({
      email: SESSION.email, le: Date.now(),
      colonnes: res.colonnes, lignes: res.lignes, role: res.role, nom: res.nom
    }));
  } catch (e) {}   // quota dépassé : on se passe du cache, sans rien casser
}
function oublierDossiers() { try { localStorage.removeItem(CLE_DOSSIERS); } catch (e) {} }
function dossiersMemorises() {
  try {
    var c = JSON.parse(localStorage.getItem(CLE_DOSSIERS) || 'null');
    if (!c || c.email !== SESSION.email || !c.colonnes || !c.lignes) return null;
    if (Date.now() - c.le > 8 * 3600 * 1000) { oublierDossiers(); return null; }
    return c;
  } catch (e) { return null; }
}
function installerDossiers(res) {
  DATA.colonnes = res.colonnes;
  DATA.lignes = res.lignes;
  DATA.idx = {};
  res.colonnes.forEach(function (c, i) { DATA.idx[c] = i; });
  DATA.iLigne = res.colonnes.length;   // n° de ligne ajouté en fin
  remplirFiltres();
  rendre();
}
function messageActualisation(le) {
  var el = $('avis');
  if (!el) return;
  var h = new Date(le).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  el.innerHTML = '<div class="alerte" style="background:#eef3fb;border-color:#0E4194;color:#0B316F;">' +
    'Liste affichée depuis votre dernière consultation de ' + h + ' — actualisation en cours…</div>';
}
function memoriserSessionAdmin() {
  try { localStorage.setItem(CLE_SESSION_ADMIN, JSON.stringify({ email: SESSION.email, nom: SESSION.nom, role: SESSION.role, token: SESSION.token, exp: Date.now() + 8 * 3600 * 1000 })); } catch (e) {}
}
function oublierSessionAdmin() { try { localStorage.removeItem(CLE_SESSION_ADMIN); } catch (e) {} oublierDossiers(); oublierEntrees(); }
function restaurerSessionAdmin() {
  try {
    var s = JSON.parse(localStorage.getItem(CLE_SESSION_ADMIN) || 'null');
    if (!s || !s.token || !s.exp || s.exp < Date.now()) { oublierSessionAdmin(); return false; }
    SESSION = { email: s.email, nom: s.nom, role: s.role, token: s.token };
    ouvrirApp();
    return true;
  } catch (e) { return false; }
}
function ouvrirApp() {
  $('login-screen').style.display = 'none';
  $('app').style.display = 'flex';
  $('user-nom').textContent = SESSION.nom;
  $('user-role').textContent = SESSION.role === 'associe' ? 'Associé' : 'Collaborateur';
  if (SESSION.role === 'associe') $('tab-entrees').style.display = ''; $('tab-pennylane').style.display = '';
  chargerDossiers(function () {
    // Apps Script exécute les requêtes d'un même utilisateur l'une après l'autre :
    // lancer le compteur en parallèle ferait attendre la liste des dossiers.
    if (SESSION.role === 'associe') chargerEntrees(true);
  });
}

// ── Saisie d'un dossier pour un client : ouvre le formulaire en mode cabinet ──
function basculerSaisieCabinet() {
  var p = $('saisie-cabinet');
  p.style.display = p.style.display === 'none' || !p.style.display ? 'flex' : 'none';
  if (p.style.display === 'flex') $('saisie-email').focus();
}
function ouvrirSaisieCabinet(parcours) {
  var email = ($('saisie-email').value || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { $('saisie-email').focus(); $('saisie-email').style.borderColor = '#c0392b'; return; }
  $('saisie-email').style.borderColor = '';
  memoriserSessionAdmin();
  window.open('/' + parcours + '/?cabinet=1&client=' + encodeURIComponent(email), '_blank', 'noopener');
}

// ── Chargement des données ───────────────────────────────────
function chargerDossiers(ensuite) {
  var cache = dossiersMemorises();
  if (cache) {
    installerDossiers(cache);              // affichage immédiat
    messageActualisation(cache.le);
  } else {
    $('loading').style.display = 'flex';   // première visite : on attend le serveur
  }
  api({ action: 'adminDossiers', email: SESSION.email, token: SESSION.token }, function (res) {
    $('loading').style.display = 'none';
    if (!res || !res.ok) {
      if (ensuite) ensuite();
      if (cache) { $('avis').innerHTML = '<div class="alerte">⚠ Actualisation impossible : ' + esc((res && res.error) || 'erreur') + '. La liste ci-dessous date de votre dernière consultation.</div>'; return; }
      alert('Chargement impossible : ' + ((res && res.error) || 'erreur'));
      return;
    }
    if (!res || !res.colonnes || !res.lignes) {
      console.error('adminDossiers : réponse inattendue', res);
      alert('Le serveur a répondu sans la liste des dossiers.\n\n' +
            'Clés reçues : ' + Object.keys(res).join(', ') + '\n' +
            'Rechargez la page (⌘⇧R). Si cela se reproduit, envoyez cette fenêtre à Emmanuel.');
      return;
    }
    installerDossiers(res);
    memoriserDossiers(res);
    $('avis').innerHTML = res.avertissement ? '<div class="alerte">⚠ ' + esc(res.avertissement) + '</div>' : '';
    if (ensuite) ensuite();
  });
}

function val(l, col) { return l[DATA.idx[col]] || ''; }

// ── Filtres ──────────────────────────────────────────────────
function remplirFiltres() {
  [['f-perimetre', 'Périmètre'], ['f-associe', 'Associé responsable'],
   ['f-collab', 'Collaborateur'], ['f-ldm', 'Statut LDM'], ['f-forme', 'Forme']].forEach(function (p) {
    var sel = $(p[0]);
    var vals = {};
    DATA.lignes.forEach(function (l) {
      var v = val(l, p[1]);
      if (p[0] === 'f-forme') v = normForme(v);
      if (v) vals[v] = (vals[v] || 0) + 1;
    });
    var keys = Object.keys(vals).sort();
    sel.innerHTML = '<option value="">Tous</option>' + keys.map(function (k) {
      return '<option value="' + esc(k) + '">' + esc(k) + ' (' + vals[k] + ')</option>';
    }).join('');
  });
  if (SESSION.role !== 'associe') {
    $('f-collab').parentNode.style.display = 'none';
    $('f-associe').parentNode.style.display = 'none';
  }
}

function lignesFiltrees() {
  var q = ($('q').value || '').trim().toLowerCase();
  var fp = $('f-perimetre').value, fa = $('f-associe').value,
      fc = $('f-collab').value, fl = $('f-ldm').value, ff = $('f-forme').value;
  return DATA.lignes.filter(function (l) {
    if (fp && val(l, 'Périmètre') !== fp) return false;
    if (fa && val(l, 'Associé responsable') !== fa) return false;
    if (fc && val(l, 'Collaborateur') !== fc) return false;
    if (fl && val(l, 'Statut LDM') !== fl) return false;
    if (ff && normForme(val(l, 'Forme')) !== normForme(ff)) return false;
    if (q) {
      var hay = [val(l, 'Dénomination'), val(l, 'Nom'), val(l, 'Prénom'), val(l, 'Email'),
                 val(l, 'Code dossier'), val(l, 'SIRET'), val(l, 'Ville'), val(l, 'Mobile')]
                 .join(' ').toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  });
}

// ── Rendu ────────────────────────────────────────────────────
function rendre() {
  if (VUE === 'entrees' || VUE === 'pennylane' || VUE === 'incomplets') return;
  var L = lignesFiltrees();
  var contacts = {};
  L.forEach(function (l) { contacts[val(l, 'Email') || '(sans email)'] = 1; });

  $('stats').innerHTML = stat(L.length, 'dossiers') + stat(Object.keys(contacts).length, 'contacts');

  rendreDonut(L);
  if (VUE === 'contacts') rendreContacts(L); else rendreDossiers(L);
}

// ── Répartition par type d'entité : anneau SVG cliquable ──
var COULEURS = ['#0E4194', '#4E7FD0', '#93B3E8', '#16213E', '#B45309', '#2E7D32', '#6B7A99', '#C8A84B'];
var REPARTITION = 'forme';   // 'forme' ou 'activite'

function changerRepartition(mode) { REPARTITION = mode; rendre(); }

function normActivite(a) {
  var s = String(a || '').trim();
  return s || 'Non renseignée';
}

function rendreDonut(L) {
  var parActivite = (REPARTITION === 'activite');
  var formes = {};
  L.forEach(function (l) {
    var f = parActivite ? normActivite(val(l, 'Activité')) : normForme(val(l, 'Forme'));
    formes[f] = (formes[f] || 0) + 1;
  });
  var cles = Object.keys(formes).sort(function (a, b) { return formes[b] - formes[a]; });
  // Top 7 + « Autres » regroupés pour garder l'anneau lisible
  var top = cles.slice(0, 7);
  var autres = cles.slice(7).reduce(function (s, k) { return s + formes[k]; }, 0);
  var parts = top.map(function (f, i) { return { nom: f, n: formes[f], c: COULEURS[i] }; });
  if (autres > 0) parts.push({ nom: 'Autres', n: autres, c: '#B8C0CE' });

  var total = L.length || 1;
  var actif = (!parActivite && $('f-forme').value) ? normForme($('f-forme').value) : '';
  var R = 54, EP = 16, C = 70;
  var circ = 2 * Math.PI * R;
  var offset = 0;
  var segs = parts.map(function (p) {
    var frac = p.n / total;
    var estActif = actif && actif === normForme(p.nom);
    var seg = '<circle r="' + R + '" cx="' + C + '" cy="' + C + '" fill="none"' +
      ' stroke="' + p.c + '" stroke-width="' + (estActif ? EP + 5 : EP) + '"' +
      ' stroke-dasharray="' + (frac * circ - 2) + ' ' + (circ - frac * circ + 2) + '"' +
      ' stroke-dashoffset="' + (-offset * circ) + '"' +
      (parActivite ? ' style="transition:stroke-width .15s ease;"' :
        ' style="cursor:pointer;transition:stroke-width .15s ease;" onclick="filtrerForme(\'' +
        p.nom.replace(/'/g, "\\'") + '\')"') + '>' +
      '<title>' + esc(p.nom) + ' : ' + p.n + '</title></circle>';
    offset += frac;
    return seg;
  }).join('');

  var legende = parts.map(function (p) {
    var estActif = actif && actif === normForme(p.nom);
    return '<button class="leg' + (estActif ? ' actif' : '') + '" aria-pressed="' + (estActif ? 'true' : 'false') +
      '"' + (parActivite ? ' disabled style="cursor:default;"' :
        ' onclick="filtrerForme(\'' + p.nom.replace(/'/g, "\\'") + '\')"') + '>' +
      '<i style="background:' + p.c + '"></i>' +
      '<span class="leg-nom" title="' + esc(p.nom) + '">' + esc(p.nom) + '</span>' +
      '<b>' + p.n + '</b><span class="leg-pct">' + Math.round(p.n / total * 100) + '%</span></button>';
  }).join('');

  $('dashboard').innerHTML =
    '<div class="dash-titre">Répartition par' +
    '<span class="bascule">' +
      '<button class="' + (parActivite ? '' : 'on') + '" onclick="changerRepartition(\'forme\')">type d\u2019entité</button>' +
      '<button class="' + (parActivite ? 'on' : '') + '" onclick="changerRepartition(\'activite\')">activité</button>' +
    '</span>' +
    (actif ? '<button class="dash-reset" onclick="filtrerForme($(\'f-forme\').value)">✕ réinitialiser</button>' : '') +
    '</div>' +
    '<div class="donut-row">' +
      '<svg viewBox="0 0 140 140" width="140" height="140" role="img" aria-label="Répartition des dossiers par forme juridique">' +
        '<g transform="rotate(-90 70 70)">' + segs + '</g>' +
        '<text x="70" y="66" text-anchor="middle" style="font-size:24px;font-weight:700;fill:#0B316F;font-family:Poppins,sans-serif;">' + L.length + '</text>' +
        '<text x="70" y="84" text-anchor="middle" style="font-size:9px;fill:#5a6070;letter-spacing:.5px;font-family:Poppins,sans-serif;">DOSSIERS</text>' +
      '</svg>' +
      '<div class="legende">' + legende + '</div>' +
    '</div>';
}

// Regroupe les variantes d'écriture d'après les valeurs réelles de la base :
// S.C.I. / SCI / Soc. Civile / Société civile → une seule famille, etc.
function normForme(f) {
  var s = String(f || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[.\s]/g, '');
  if (!s) return 'Non renseignée';
  if (s.indexOf('SASU') === 0) return 'SASU';
  if (s.indexOf('SAS') === 0) return 'SAS';
  if (s.indexOf('EURL') === 0) return 'EURL';
  if (s.indexOf('SARL') === 0) return 'SARL';
  if (s.indexOf('SELARL') === 0 || s.indexOf('SELAS') === 0 || s.indexOf('SELURL') === 0) return 'SEL (prof. lib.)';
  if (s.indexOf('SCM') === 0) return 'SCM';
  if (s.indexOf('SCP') === 0) return 'SCP';
  if (s.indexOf('SCI') === 0 || s.indexOf('SOCCIV') === 0 || s.indexOf('SOCIETECIV') === 0 ||
      s.indexOf('STECIV') === 0 || s.indexOf('SCEA') === 0) return 'SCI / Sté civile';
  if (s.indexOf('ENTINDIV') === 0 || s.indexOf('ENTREPRENEURINDIV') === 0 ||
      s.indexOf('ENTREPRISEINDIV') === 0 || s === 'EI' || s.indexOf('EIRL') === 0) return 'Entreprise individuelle';
  if (s.indexOf('PERSONNEPHYSIQUE') === 0) return 'Personne physique';
  if (s.indexOf('ASSOC') === 0) return 'Association';
  if (s.indexOf('STEPARTICIPATION') === 0 || s.indexOf('SOCIETEPARTICIPATION') === 0 ||
      s.indexOf('SOCPARTICIPATION') === 0) return 'Sté de participation';
  if (s.indexOf('SNC') === 0) return 'SNC';
  if (s.indexOf('INDIVISION') === 0) return 'Indivision';
  if (s === 'SA') return 'SA';
  return String(f).trim();
}

function filtrerForme(f) {
  var sel = $('f-forme');
  sel.value = (normForme(sel.value) === f) ? '' : f;  // re-clic = retour à « Tous »
  rendre();
}

function stat(n, label) {
  return '<div class="stat"><div class="stat-n">' + n + '</div><div class="stat-l">' + label + '</div></div>';
}

function basculerContact(btn) {
  var carte = btn.closest('.contact');
  var ouvert = carte.classList.toggle('open');
  btn.setAttribute('aria-expanded', ouvert ? 'true' : 'false');
}

function rendreContacts(L) {
  var groupes = {};
  L.forEach(function (l) {
    var e = val(l, 'Email') || '(sans email)';
    if (!groupes[e]) groupes[e] = [];
    groupes[e].push(l);
  });
  var keys = Object.keys(groupes).sort(function (a, b) {
    return (groupes[b].length - groupes[a].length) || a.localeCompare(b);
  });
  var html = keys.map(function (e) {
    var g = groupes[e];
    var p = g[0];
    var nom = [val(p, 'Civilité'), val(p, 'Prénom'), val(p, 'Nom')].filter(Boolean).join(' ') || '—';
    return '<div class="contact">' +
      '<button class="contact-head" aria-expanded="false" onclick="basculerContact(this)">' +
        '<div><div class="contact-nom">' + esc(nom) + '</div>' +
        '<div class="contact-mail">' + esc(e) + (val(p, 'Mobile') ? ' · ' + esc(val(p, 'Mobile')) : '') + '</div></div>' +
        '<div style="display:flex;align-items:center;gap:10px;">' +
          '<span class="contact-count">' + g.length + ' dossier' + (g.length > 1 ? 's' : '') + '</span>' +
          '<span class="chevron" aria-hidden="true">▼</span>' +
        '</div>' +
      '</button>' +
      '<div class="contact-body">' + g.map(ficheDossier).join('') + '</div>' +
    '</div>';
  }).join('');
  $('liste').innerHTML = html || '<p class="vide">Aucun résultat.</p>';
}

function ficheDossier(l) {
  var ldm = val(l, 'Statut LDM');
  var cls = ldm === 'SIGNÉE' ? 'ok' : (ldm === 'EN ATTENTE' ? 'warn' : 'neutre');
  var lignesSheet = l[DATA.iLigne];
  var champs = [
    ['Code dossier', val(l, 'Code dossier')], ['Forme', val(l, 'Forme')],
    ['SIRET', val(l, 'SIRET')], ['Ville', [val(l, 'CP'), val(l, 'Ville')].filter(Boolean).join(' ')],
    ['Activité', val(l, 'Activité')], ['Clôture', val(l, 'Clôture')],
    ['Honoraires', (SESSION.role === 'associe' && val(l, 'Honoraires HT'))
      ? val(l, 'Honoraires HT') + ' € HT / ' + val(l, 'Périodicité') + detailPostes(l) : ''],
    ['Associé', val(l, 'Associé responsable')], ['Collaborateur', val(l, 'Collaborateur')]
  ].filter(function (c) { return c[1]; });

  // Notes internes de la revue : réservées aux associés, et seulement là où
  // elles aident à décider (dossiers en attente d'arbitrage de périmètre).
  var comm = '';
  if (SESSION.role === 'associe' && val(l, 'Périmètre') === 'À sortir (à confirmer)') {
    comm = [val(l, 'Marqueur'), val(l, 'Commentaire attribution'), val(l, 'Commentaire collaborateur')]
      .filter(Boolean).join(' · ');
  }

  return '<div class="dossier">' +
    '<div class="dossier-head">' +
      '<strong>' + esc(val(l, 'Dénomination')) + '</strong>' +
      '<span class="tag ' + cls + '">' + esc(ldm || '—') + '</span>' +
      '<span class="tag ' + (val(l, 'Périmètre') === 'Actif' ? 'ok' : 'warn') + '">' + esc(val(l, 'Périmètre')) + '</span>' +
    '</div>' +
    '<div class="grid">' + champs.map(function (c) {
      return '<div><span>' + esc(c[0]) + '</span>' + esc(c[1]) + '</div>';
    }).join('') + '</div>' +
    (comm ? '<div class="comm">💬 ' + esc(comm) + '</div>' : '') +
    blocPieces(l, lignesSheet) +
    blocCompletude(l, lignesSheet) +
    blocContact(l, lignesSheet) +
    (SESSION.role === 'associe' ? boutonsModif(l, lignesSheet) : '') +
    (SESSION.role === 'associe' ? blocHonoraires(l, lignesSheet) : '') +
    (SESSION.role === 'associe' ? blocLDM(l, lignesSheet) : '') +
    blocLdmRetour(l, lignesSheet) +
  '</div>';
}

// ── Pièces du dossier : consultation et dépôt ────────────────
function blocPieces(l, ligne) {
  return '<details class="coord" ontoggle="chargerPieces(' + ligne + ', this)">' +
    '<summary>📎 Pièces du dossier</summary>' +
    '<div class="lettre-actions" style="margin-top:9px;">' +
      '<label class="btn-rep" style="cursor:pointer;">➕ Ajouter des documents' +
        '<input type="file" id="up-' + ligne + '" multiple accept="image/*,.pdf" style="display:none;" ' +
        'onchange="deposerPieces(' + ligne + ', this)"></label>' +
      '<span class="maj" role="status" aria-live="polite"></span>' +
    '</div><div class="pieces pieces-dossier" id="pd-' + ligne + '" hidden></div></details>';
}

// Liste des pièces d'une ligne de la base. Chargée à la première ouverture
// du volet, puis rechargée (forcer = true) après chaque dépôt pour que
// l'ajout soit visible immédiatement.
function chargerPieces(ligne, det, forcer) {
  if (det && !det.open && !forcer) return;
  var zone = document.getElementById('pd-' + ligne);
  if (!zone) return;
  if (zone.dataset.charge === '1' && !forcer) return;
  zone.dataset.charge = '1';
  zone.hidden = false;
  zone.innerHTML = '<span class="maj">Chargement des pièces…</span>';
  api({ action: 'adminPiecesDossier', email: SESSION.email, token: SESSION.token,
        ligne: ligne }, function (res) {
    if (!res || !res.ok) {
      zone.dataset.charge = '0';
      zone.innerHTML = '<span class="maj ko">⚠ ' + esc((res && res.error) || 'erreur') + '</span>';
      return;
    }
    zone.innerHTML = listePiecesHtml(res.fichiers);
  });
}

// Rendu commun aux deux listes (fiche dossier et pipeline)
function listePiecesHtml(fichiers) {
  if (!fichiers || !fichiers.length) {
    return '<span class="maj">Aucune pièce dans ce dossier pour le moment.</span>';
  }
  var n = fichiers.length;
  return '<div class="pieces-titre">' + n + ' pièce' + (n > 1 ? 's' : '') +
    ' jointe' + (n > 1 ? 's' : '') + '</div>' +
    fichiers.map(function (f) {
      var voir = apercuPossible(f.type);
      return '<div class="piece-lig">' +
        '<span>' + iconePiece(f.type) + '</span>' +
        '<span class="piece-nom" title="' + esc(f.nom) + '">' + esc(f.nom) + '</span>' +
        '<span class="piece-taille">' + tailleLisible(f.taille) + '</span>' +
        '<button class="piece-act" onclick="apercuPiece(\'' + f.id + '\', this)"' +
          (voir ? '' : ' disabled title="Aperçu indisponible pour ce format"') + '>👁 Aperçu</button>' +
        '<button class="piece-act" onclick="telechargerPiece(\'' + f.id + '\', this)">↓ Télécharger</button>' +
        '<button class="piece-act" title="Mettre à la corbeille" onclick="supprimerFichier(\'' + f.id + '\', this)">🗑</button>' +
      '</div>';
    }).join('');
}

// ── Complétude : ce qu'on attend du dossier, ce qui est reçu, ce qui manque ──
function blocCompletude(l, ligne) {
  var code = val(l, 'Code dossier');
  if (!code) return '';
  return '<details class="coord" ontoggle="chargerCompletude(' + ligne + ', this)" data-code="' + esc(code) + '">' +
    '<summary>✅ Complétude du dossier</summary>' +
    '<div class="completude" id="cp-' + ligne + '" hidden></div></details>';
}

function chargerCompletude(ligne, det, forcer) {
  if (det && !det.open && !forcer) return;
  var zone = $('cp-' + ligne);
  if (!zone) return;
  if (zone.dataset.charge === '1' && !forcer) return;
  zone.dataset.charge = '1';
  zone.hidden = false;
  var code = zone.parentNode.dataset.code;
  zone.innerHTML = '<span class="maj">Chargement…</span>';
  api({ action: 'adminCompletude', email: SESSION.email, token: SESSION.token, code: code }, function (res) {
    if (!res || !res.ok) {
      zone.dataset.charge = '0';
      zone.innerHTML = '<span class="maj ko">⚠ ' + esc((res && res.error) || 'erreur') + '</span>';
      return;
    }
    zone.innerHTML = rendreCompletude(res, ligne);
  });
}

var LIBELLE_PHASE = { 'soumission': 'À la soumission', 'statuts-signes': 'Documents à signer', 'depot-capital': 'Dépôt du capital',
                      'siren-definitif': 'Après immatriculation', 'ldm-signee': 'Après la lettre de mission signée' };
var ORDRE_PHASES = ['soumission', 'statuts-signes', 'depot-capital', 'siren-definitif', 'ldm-signee'];

function classeStatut(st) {
  if (st === 'attendue') return 'attendue';
  if (st === 'reçue') return 'recue';
  if (st === 'à vérifier') return 'averifier';
  if (st === 'non applicable') return 'na';
  return 'ok';
}

function rendreCompletude(r, ligne) {
  var code = r.code;
  if (!r.lignes.length) {
    return '<div class="cp-resume">Aucune checklist pour ce dossier.</div>' +
      '<div class="lettre-actions"><button class="btn-envoyer" onclick="genererCompletude(' + ligne + ', this)">' +
      '➕ Générer la checklist</button><span class="maj" role="status" aria-live="polite"></span></div>';
  }
  var h = '<div class="cp-resume">' +
    (r.resume.complet ? '<b>✓ Dossier complet</b> sur les phases ouvertes'
      : '<b>' + r.resume.attendues + '</b> en attente du client · <b>' + r.resume.aTraiter + '</b> à vérifier par le cabinet') +
    '<span style="flex:1"></span>' +
    '<button class="btn-rep" onclick="genererCompletude(' + ligne + ', this)" title="Ajoute les éléments manquants selon les règles">↻ Compléter</button>' +
    '<span class="maj" role="status" aria-live="polite"></span></div>';

  h += blocRelances(r, ligne);

  ORDRE_PHASES.forEach(function (ph) {
    var lignes = r.lignes.filter(function (l) { return l.phase === ph; });
    if (!lignes.length) return;
    var ouverte = r.phases.indexOf(ph) > -1;
    h += '<div class="cp-phase"><div class="cp-phase-titre">' + esc(LIBELLE_PHASE[ph] || ph) +
      '<span class="tag ' + (ouverte ? 'ok' : 'neutre') + '">' + (ouverte ? 'ouverte' : 'à venir') + '</span></div>';
    lignes.forEach(function (l) {
      var b = function (statut, txt, cls) {
        return '<button class="piece-act' + (cls ? ' ' + cls : '') + '" onclick="statutPiece(' + ligne + ', \'' + esc(code) + '\', ' +
          l.ligne + ', \'' + statut + '\', this)">' + txt + '</button>';
      };
      var actions = '';
      if (l.statut === 'attendue') {
        if (l.type === 'piece') {
          actions += '<label class="piece-act" style="cursor:pointer;">📎 Déposer<input type="file" multiple accept="image/*,.pdf" style="display:none;" ' +
            'onchange="deposerPour(' + ligne + ', \'' + esc(l.cle) + '\', \'' + esc(l.personne) + '\', this)"></label>' +
            b('reçue hors portail', 'Reçue par email');
        } else {
          actions += b('faite', '✓ Faite');
        }
        actions += b('non applicable', 'N/A');
      } else if (l.statut === 'reçue' || l.statut === 'à vérifier') {
        actions += b('vérifiée', '✓ Vérifiée') + b('attendue', '↩ Redemander');
      } else {
        actions += b('attendue', '↩ Rouvrir');
      }
      if (l.fichier) {
        actions = '<button class="piece-act" onclick="apercuPiece(\'' + l.fichier + '\', this)">👁 Aperçu</button>' + actions +
          '<button class="piece-act" title="Met le fichier à la corbeille et remet l\'élément en attente" ' +
          'onclick="supprimerFichier(\'' + l.fichier + '\', this)">🗑</button>';
      }
      h += '<div class="cp-lig' + (ouverte ? '' : ' fermee') + '">' +
        '<span>' + (l.type === 'demarche' ? '📌' : '📄') + '</span>' +
        '<span class="cp-lib">' + esc(l.libelle) + (l.personne ? ' — <b>' + esc(l.personne) + '</b>' : '') +
        (l.verdict ? '<small>' + esc(l.verdict) + '</small>' : '') +
        (l.recuLe && !l.verifiePar ? '<small>reçue le ' + esc(l.recuLe) + '</small>' : '') +
        (l.verifiePar ? '<small>' + esc(l.statut) + ' par ' + esc(l.verifiePar) + ' le ' + esc(l.verifieLe) + '</small>' : '') +
        '</span>' +
        '<span class="cp-st ' + classeStatut(l.statut) + '">' + esc(l.statut) + '</span>' +
        '<span class="cp-act">' + actions + '</span></div>';
    });
    h += '</div>';
  });
  return h;
}

// ── Relances : rythme du dossier, état, envoi manuel ──────────
var LIBELLE_RYTHME = { 'standard': 'standard — J+7 · J+14 · J+30', 'espacé': 'espacé — J+14 · J+30 · J+60', 'aucune': 'aucune' };

function blocRelances(r, ligne) {
  var rel = r.relances;
  if (!rel) return '';
  var actives = rel.suivi.filter(function (s) { return s.prochaine || s.relances; });
  var etat = rel.rythme === 'aucune' ? 'suspendues — choisissez un rythme pour relancer ce client'
    : actives.map(function (s) {
        return (LIBELLE_PHASE[s.phase] || s.phase).toLowerCase() + ' : ' +
          (s.relances ? s.relances + ' envoyée' + (s.relances > 1 ? 's' : '') + (s.derniere ? ' (dernière le ' + esc(s.derniere) + ')' : '') : 'aucune envoyée') +
          (s.prochaine ? ', prochaine le ' + esc(s.prochaine) : '');
      }).join(' · ') || 'rien à relancer';
  return '<div class="cp-relances"><b style="color:var(--blue-dark);">Relances</b>' +
    '<select onchange="changerRythme(' + ligne + ', \'' + esc(r.code) + '\', this)" aria-label="Rythme des relances">' +
      Object.keys(LIBELLE_RYTHME).map(function (k) {
        return '<option value="' + k + '"' + (k === rel.rythme ? ' selected' : '') + '>' + esc(LIBELLE_RYTHME[k]) + '</option>';
      }).join('') + '</select>' +
    '<span>' + etat + '</span>' +
    (rel.mode !== 'actif' ? '<span class="blanc" title="Paramètres → relance.mode = actif pour envoyer réellement">mode blanc</span>' : '') +
    '<span style="flex:1"></span>' +
    '<button class="btn-rep" onclick="relancerMaintenant(' + ligne + ', \'' + esc(r.code) + '\', this)">✉ Relancer maintenant</button></div>';
}

function changerRythme(ligne, code, sel) {
  var zone = $('cp-' + ligne);
  sel.disabled = true;
  api({ action: 'adminRythmeRelance', email: SESSION.email, token: SESSION.token, code: code, rythme: sel.value }, function (res) {
    if (!res || !res.ok) { sel.disabled = false; alert((res && res.error) || 'Modification impossible.'); return; }
    zone.innerHTML = rendreCompletude(res, ligne);
  });
}

function relancerMaintenant(ligne, code, btn) {
  if (!confirm('Envoyer maintenant un email de relance au client pour les éléments encore attendus ?')) return;
  var zone = $('cp-' + ligne);
  btn.disabled = true; btn.textContent = 'Envoi…';
  api({ action: 'adminRelancerMaintenant', email: SESSION.email, token: SESSION.token, code: code }, function (res) {
    if (!res || !res.ok) { btn.disabled = false; btn.textContent = '✉ Relancer maintenant'; alert((res && res.error) || 'Envoi impossible.'); return; }
    zone.innerHTML = rendreCompletude(res, ligne);
    var msg = zone.querySelector('.maj');
    if (msg) { msg.textContent = res.envois ? '✓ ' + res.envois + ' email(s) envoyé(s).' : 'Rien à relancer : aucun élément attendu du client.'; msg.className = 'maj ok'; }
  });
}

function genererCompletude(ligne, btn) {
  var zone = $('cp-' + ligne);
  var msg = btn.parentNode.querySelector('.maj');
  btn.disabled = true;
  api({ action: 'adminGenererPieces', email: SESSION.email, token: SESSION.token, code: zone.parentNode.dataset.code }, function (res) {
    btn.disabled = false;
    if (!res || !res.ok) { msg.textContent = '⚠ ' + ((res && res.error) || 'échec'); msg.className = 'maj ko'; return; }
    chargerCompletude(ligne, null, true);
  });
}

function statutPiece(ligne, code, lignePiece, statut, btn) {
  var msg = btn.closest('.completude').querySelector('.maj');
  btn.disabled = true;
  api({ action: 'adminStatutPiece', email: SESSION.email, token: SESSION.token, code: code, ligne: lignePiece, statut: statut }, function (res) {
    if (!res || !res.ok) { btn.disabled = false; msg.textContent = '⚠ ' + ((res && res.error) || 'échec'); msg.className = 'maj ko'; return; }
    var zone = $('cp-' + ligne);
    if (res.lignes) zone.innerHTML = rendreCompletude(res, ligne); else chargerCompletude(ligne, null, true);
  });
}

// Dépôt d'une pièce pour une ligne précise : le fichier part avec sa
// déclaration, la ligne passe à « reçue », le volet Pièces se rafraîchit.
function deposerPour(ligne, cle, personne, input) {
  var zone = $('cp-' + ligne);
  var msg = zone.querySelector('.maj');
  var fichiers = Array.from(input.files || []);
  if (!fichiers.length) return;
  var refus = refusEnvoi(fichiers);
  if (refus) { msg.textContent = '⚠ ' + refus; msg.className = 'maj ko'; input.value = ''; return; }
  msg.textContent = '⏳ Envoi…'; msg.className = 'maj';
  lireFichiers(fichiers, 'application/octet-stream').then(function (payload) {
    payload.forEach(function (f) { f.pour = { cle: cle, personne: personne }; });
    api({ action: 'adminAjouterPieces', email: SESSION.email, token: SESSION.token, ligne: ligne, fichiers: payload,
          code: zone.parentNode.dataset.code }, function (res) {
      input.value = '';
      if (!res || !res.ok) { msg.textContent = '⚠ ' + ((res && res.error) || 'échec'); msg.className = 'maj ko'; return; }
      if (res.completude) zone.innerHTML = rendreCompletude(res.completude, ligne); else chargerCompletude(ligne, null, true);
      var pd = $('pd-' + ligne);
      if (pd && pd.dataset.charge === '1') chargerPieces(ligne, null, true);
    });
  }).catch(function (e) { msg.textContent = '⚠ Lecture impossible : ' + e.message; msg.className = 'maj ko'; });
}

// Le serveur compte en Ko ; au-delà du millier on bascule en Mo.
function tailleLisible(ko) {
  return ko >= 1024 ? (ko / 1024).toFixed(1).replace('.', ',') + ' Mo' : ko + ' Ko';
}

// Formats que le navigateur sait afficher tels quels dans la modale.
function apercuPossible(type) {
  type = String(type || '');
  return /^image\//.test(type) || type.indexOf('pdf') > -1 || /^text\//.test(type);
}

function iconePiece(type) {
  type = String(type || '');
  if (type.indexOf('pdf') > -1) return '📄';
  if (/^image\//.test(type)) return '🖼';
  return '📎';
}

// Cache des pièces déjà rapatriées : consulter puis télécharger un même
// document ne coûte qu'un seul aller-retour. Les huit derniers documents
// sont conservés, les plus anciens sont libérés.
var PIECES = {}, PIECES_ORDRE = [];

function memoriserPiece(id, o) {
  PIECES[id] = o;
  PIECES_ORDRE.push(id);
  while (PIECES_ORDRE.length > 8) {
    var vieux = PIECES_ORDRE.shift();
    if (PIECES[vieux]) { URL.revokeObjectURL(PIECES[vieux].url); delete PIECES[vieux]; }
  }
}

// D'où vient la pièce : une ligne de la base, ou le dossier Drive d'une
// soumission du pipeline. Le serveur s'en sert pour revérifier les droits
// au moment de l'accès, sans se fier à la liste qui a fourni l'identifiant.
function contextePiece(btn) {
  if (!btn || !btn.closest) return {};
  var fiche = btn.closest('.pieces-dossier');
  if (fiche) return { ligne: parseInt(fiche.id.replace('pd-', ''), 10) };
  var cp = btn.closest('.completude');
  if (cp) return { ligne: parseInt(cp.id.replace('cp-', ''), 10) };
  var entree = btn.closest('.pieces');
  if (entree && entree.dataset.url) return { url: entree.dataset.url };
  return {};
}

// Rapatrie une pièce par le portail (jamais par Drive), puis la met en cache.
function chargerFichier(id, btn, suite) {
  if (PIECES[id]) { suite(PIECES[id]); return; }
  var avant = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '…'; }
  var ctx = contextePiece(btn);
  api({ action: 'adminFichier', email: SESSION.email, token: SESSION.token, id: id,
        ligne: ctx.ligne || '', url: ctx.url || '' }, function (res) {
    if (btn) { btn.disabled = false; btn.textContent = avant; }
    if (!res || !res.ok) { alert((res && res.error) || 'Document indisponible.'); return; }
    var bin = atob(res.donnees), buf = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    var o = { nom: res.nom, type: res.type,
              url: URL.createObjectURL(new Blob([buf], { type: res.type })) };
    memoriserPiece(id, o);
    suite(o);
  });
}

function apercuPiece(id, btn) {
  chargerFichier(id, btn, function (o) {
    APERCU_COURANT = o;
    ouvrirApercu(o.nom, (o.type.indexOf('pdf') > -1 ? 'Document PDF' : o.type), true);
    var cadre = $('apercu-corps');
    cadre.removeAttribute('srcdoc');
    cadre.src = o.url;
  });
}

function telechargerPiece(id, btn) {
  chargerFichier(id, btn, function (o) { enregistrer(o.url, o.nom); });
}

// Suppression d'une pièce (cabinet) : corbeille Drive, checklist remise en
// attente. Le contexte du bouton donne au serveur le dossier à vérifier.
function supprimerFichier(id, btn) {
  if (!confirm('Mettre ce document à la corbeille ? L\'élément de checklist correspondant repassera « en attente ».')) return;
  var ctx = contextePiece(btn);
  var cp = btn.closest('.completude');
  var code = cp ? cp.parentNode.dataset.code : '';
  btn.disabled = true; btn.textContent = '…';
  api({ action: 'adminSupprimerFichier', email: SESSION.email, token: SESSION.token, id: id,
        ligne: ctx.ligne || '', url: ctx.url || '', code: code }, function (res) {
    if (!res || !res.ok) { btn.disabled = false; btn.textContent = '🗑'; alert((res && res.error) || 'Suppression impossible.'); return; }
    if (PIECES[id]) { URL.revokeObjectURL(PIECES[id].url); delete PIECES[id]; }
    var ligne = ctx.ligne;
    if (ligne) {
      var zone = $('cp-' + ligne);
      if (zone) { if (res.completude) zone.innerHTML = rendreCompletude(res.completude, ligne); else if (zone.dataset.charge === '1') chargerCompletude(ligne, null, true); }
      var pd = $('pd-' + ligne);
      if (pd && pd.dataset.charge === '1') chargerPieces(ligne, null, true);
    } else if (ctx.url) {
      var entree = btn.closest('.entree');
      var lien = entree && entree.querySelector('.lien-pieces');
      if (lien) { entree.querySelector('.pieces').dataset.ouvert = '0'; voirPieces(ctx.url, lien); }
    }
  });
}

function telechargerDepuisApercu() {
  if (APERCU_COURANT) enregistrer(APERCU_COURANT.url, APERCU_COURANT.nom);
}

// Déclenche l'enregistrement d'un blob déjà chargé, sans nouvel appel réseau.
function enregistrer(url, nom) {
  var a = document.createElement('a');
  a.href = url; a.download = nom;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

// Le transport base64 gonfle les fichiers d'un tiers : au-delà d'une
// vingtaine de Mo au total, la requête échoue côté Apps Script avec un
// message illisible. Mieux vaut le dire avant d'envoyer.
var MAX_PIECE = 12 * 1024 * 1024, MAX_LOT = 20 * 1024 * 1024;

function refusEnvoi(fichiers) {
  var trop = fichiers.filter(function (f) { return f.size > MAX_PIECE; });
  if (trop.length) return trop[0].name + ' dépasse 12 Mo.';
  var total = fichiers.reduce(function (n, f) { return n + f.size; }, 0);
  if (total > MAX_LOT) {
    return 'Ensemble trop volumineux (' + Math.round(total / 1048576) +
           ' Mo). Envoyez-les en deux fois.';
  }
  return '';
}

// Lecture des fichiers en base64, prêts pour le transport JSON.
function lireFichiers(fichiers, mimeDefaut) {
  return Promise.all(fichiers.map(function (f) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () {
        res({ nom: f.name, mimeType: f.type || mimeDefaut,
              data: String(r.result).split(',')[1] });
      };
      r.onerror = function () { rej(new Error(f.name)); };
      r.readAsDataURL(f);
    });
  }));
}

// ── Retour de la lettre de mission ───────────────────────────
// Générer la LDM reste réservé aux associés (elle porte les honoraires) ;
// enregistrer son retour est un geste administratif, ouvert au
// collaborateur en charge du dossier pour ne pas créer de goulot.

// Vocabulaire de la colonne « Statut LDM », identique au backend.
var STATUTS_LDM = ['EN ATTENTE',
                   'À VÉRIFIER (client partiellement signé)',
                   'SIGNÉE',
                   'HORS CAMPAGNE (à sortir)',
                   'JAMAIS ENVOYÉE'];

function blocLdmRetour(l, ligne) {
  var courant = val(l, 'Statut LDM');
  var signee = val(l, 'LDM signée le');
  var connu = STATUTS_LDM.indexOf(courant) > -1;
  return '<div class="actions ldm-bloc">' +
    '<b style="color:var(--blue-dark);">Retour du client</b>' +
    '<label class="btn-envoyer" style="cursor:pointer;">✅ LDM signée reçue' +
      '<input type="file" multiple accept=".pdf,image/*" style="display:none;" ' +
      'onchange="deposerLdmSignee(' + ligne + ', this)"></label>' +
    '<select onchange="changerStatutLdm(' + ligne + ', this)" aria-label="Statut de la lettre de mission">' +
      (connu || !courant ? '' : '<option selected disabled>' + esc(courant) + '</option>') +
      STATUTS_LDM.map(function (st) {
        return '<option' + (st === courant ? ' selected' : '') + '>' + esc(st) + '</option>';
      }).join('') +
    '</select>' +
    '<span class="maj' + (signee ? ' ok' : '') + '" role="status" aria-live="polite">' +
      (signee ? '✓ signée le ' + esc(signee) : '') + '</span></div>';
}

function deposerLdmSignee(ligne, input) {
  var msg = input.closest('.actions').querySelector('.maj');
  var fichiers = Array.from(input.files || []);
  if (!fichiers.length) return;
  var refus = refusEnvoi(fichiers);
  if (refus) { msg.textContent = '⚠ ' + refus; msg.className = 'maj ko'; input.value = ''; return; }

  msg.textContent = '⏳ Enregistrement de ' + fichiers.length + ' document(s)…';
  msg.className = 'maj';

  lireFichiers(fichiers, 'application/pdf').then(function (payload) {
    api({ action: 'adminLdmSignee', email: SESSION.email, token: SESSION.token,
          ligne: ligne, fichiers: payload }, function (res) {
      input.value = '';
      if (!res || !res.ok) {
        msg.textContent = '⚠ ' + ((res && res.error) || 'échec');
        msg.className = 'maj ko'; return;
      }
      msg.textContent = '✓ signée le ' + res.date +
        (res.ajoutes > 1 ? ' — ' + res.ajoutes + ' documents' : '');
      msg.className = 'maj ok';
      var sel = msg.parentNode.querySelector('select');
      if (sel) sel.value = 'SIGNÉE';
      appliquerStatutLdm(ligne, 'SIGNÉE', msg, res.date);
      chargerPieces(ligne, null, true);   // les PDF rejoignent les pièces
    });
  }).catch(function (e) {
    msg.textContent = '⚠ Lecture impossible : ' + e.message;
    msg.className = 'maj ko';
  });
}

function changerStatutLdm(ligne, sel) {
  var msg = sel.closest('.actions').querySelector('.maj');
  var statut = sel.value;
  msg.textContent = '…'; msg.className = 'maj';
  api({ action: 'adminStatutLdm', email: SESSION.email, token: SESSION.token,
        ligne: ligne, statut: statut }, function (res) {
    if (!res || !res.ok) {
      msg.textContent = '⚠ ' + ((res && res.error) || 'échec');
      msg.className = 'maj ko'; return;
    }
    msg.textContent = '✓ enregistré'; msg.className = 'maj ok';
    appliquerStatutLdm(ligne, statut, sel);
  });
}

// Répercute le statut sur les données en mémoire et sur l'étiquette de la
// fiche, pour éviter de recharger toute la base après un simple changement.
function appliquerStatutLdm(ligne, statut, el, dateSignature) {
  DATA.lignes.forEach(function (l) {
    if (l[DATA.iLigne] !== ligne) return;
    if (DATA.idx['Statut LDM'] !== undefined) l[DATA.idx['Statut LDM']] = statut;
    if (dateSignature && DATA.idx['LDM signée le'] !== undefined) {
      l[DATA.idx['LDM signée le']] = dateSignature;
    }
  });
  var fiche = el && el.closest ? el.closest('.dossier') : null;
  var tag = fiche ? fiche.querySelector('.dossier-head .tag') : null;
  if (tag) {
    tag.textContent = statutCourt(statut);
    tag.className = 'tag ' + (statut === 'SIGNÉE' ? 'ok' : (statut === 'EN ATTENTE' ? 'warn' : 'neutre'));
  }
}

function deposerPieces(ligne, input) {
  var msg = input.closest('.lettre-actions').querySelector('.maj');
  var fichiers = Array.from(input.files || []);
  if (!fichiers.length) return;
  var refus = refusEnvoi(fichiers);
  if (refus) { msg.textContent = '⚠ ' + refus; msg.className = 'maj ko'; input.value = ''; return; }

  msg.textContent = '⏳ Envoi de ' + fichiers.length + ' document(s)…';
  msg.className = 'maj';

  lireFichiers(fichiers, 'application/octet-stream').then(function (payload) {
    api({ action: 'adminAjouterPieces', email: SESSION.email, token: SESSION.token,
          ligne: ligne, fichiers: payload }, function (res) {
      input.value = '';
      if (res && res.ok) {
        msg.textContent = '✓ ' + res.ajoutes + ' document(s) ajouté(s) au dossier.';
        msg.className = 'maj ok';
        chargerPieces(ligne, null, true);
      } else {
        msg.textContent = '⚠ ' + ((res && res.error) || 'échec');
        msg.className = 'maj ko';
      }
    });
  }).catch(function (e) {
    msg.textContent = '⚠ Lecture impossible : ' + e.message;
    msg.className = 'maj ko';
  });
}

// ── Coordonnées du client (modifiables par l'associé et par le
//    collaborateur en charge du dossier) ──────────────────────
var CHAMPS_CONTACT = ['Civilité', 'Nom', 'Prénom', 'Qualité', 'Email', 'Mobile', 'Tél fixe', 'Adresse', 'CP', 'Ville'];

function blocContact(l, ligne) {
  return '<details class="coord"><summary>✎ Modifier les coordonnées</summary><div class="coord-grille">' +
    CHAMPS_CONTACT.map(function (c) {
      var id = 'ct-' + ligne + '-' + c.replace(/[^a-zA-Z]/g, '');
      var v = esc(val(l, c));
      var champ = (c === 'Civilité')
        ? '<select id="' + id + '">' + ['', 'Monsieur', 'Madame'].map(function (o) {
            return '<option' + (o === val(l, c) ? ' selected' : '') + '>' + o + '</option>'; }).join('') + '</select>'
        : '<input type="text" id="' + id + '" value="' + v + '">';
      return '<label>' + esc(c) + champ + '</label>';
    }).join('') +
    '</div><div class="lettre-actions"><button class="btn-envoyer" onclick="enregistrerContact(' + ligne + ', this)">Enregistrer</button>' +
    '<span class="maj" role="status" aria-live="polite"></span></div></details>';
}

function enregistrerContact(ligne, btn) {
  var msg = btn.parentNode.querySelector('.maj');
  var contact = {};
  CHAMPS_CONTACT.forEach(function (c) {
    var el = $('ct-' + ligne + '-' + c.replace(/[^a-zA-Z]/g, ''));
    if (el) contact[c] = el.value;
  });
  btn.disabled = true; btn.textContent = 'Enregistrement…';
  api({ action: 'adminMajContact', email: SESSION.email, token: SESSION.token, ligne: ligne, contact: contact },
    function (res) {
      btn.disabled = false; btn.textContent = 'Enregistrer';
      if (res && res.ok) {
        msg.textContent = res.modifie ? '✓ ' + res.modifie + ' champ(s) mis à jour.' : 'Aucune modification.';
        msg.className = 'maj ok';
        if (res.modifie) chargerDossiers();
      } else {
        msg.textContent = '⚠ ' + ((res && res.error) || 'échec');
        msg.className = 'maj ko';
      }
    });
}

// ── Lettre de mission ────────────────────────────────────────
// Détail de la ventilation, en clair sous le total
function detailPostes(l) {
  var parts = POSTES.filter(function (p) { return DATA.idx[p.colonne] !== undefined && val(l, p.colonne); })
    .map(function (p) { return p.libelle + ' ' + val(l, p.colonne) + ' €'; });
  return parts.length ? ' (' + parts.join(' · ') + ')' : '';
}

// Honoraires modifiables tant que la lettre de mission n'est pas partie
function blocHonoraires(l, ligne) {
  var valeurs = {};
  POSTES.forEach(function (p) { valeurs[p.cle] = DATA.idx[p.colonne] !== undefined ? val(l, p.colonne) : ''; });
  var per = val(l, 'Périodicité');
  var opts = ['', 'Mensuelle', 'Trimestrielle', 'Annuelle'].map(function (o) {
    return '<option value="' + esc(o) + '"' + (o === per ? ' selected' : '') + '>' + (o || '—') + '</option>';
  }).join('');
  return '<div class="actions ldm-bloc">' +
    '<b style="color:var(--blue-dark);">Honoraires</b>' +
    champsPostes('hp-' + ligne + '-', valeurs) +
    '<label>Facturation <select id="hper-' + ligne + '" style="width:118px;">' + opts + '</select></label>' +
    '<button class="btn-rep" onclick="enregistrerHonoraires(' + ligne + ', this)">Enregistrer</button>' +
    '<span class="maj" role="status" aria-live="polite"></span></div>';
}

function enregistrerHonoraires(ligne, btn) {
  var msg = btn.parentNode.querySelector('.maj[role="status"]');
  var p = valeursPostes('hp-' + ligne + '-');
  btn.disabled = true; msg.textContent = '…'; msg.className = 'maj';
  api({ action: 'adminHonoraires', email: SESSION.email, token: SESSION.token, ligne: ligne,
        hCompta: p.hCompta, hOutils: p.hOutils, hJuridique: p.hJuridique,
        periodicite: ($('hper-' + ligne) || {}).value || '' }, function (res) {
    btn.disabled = false;
    if (res && res.ok) {
      msg.textContent = '✓ enregistré'; msg.className = 'maj ok';
      DATA.lignes.forEach(function (l) {
        if (l[DATA.iLigne] !== ligne) return;
        POSTES.forEach(function (po) { if (DATA.idx[po.colonne] !== undefined) l[DATA.idx[po.colonne]] = p[po.cle]; });
        if (DATA.idx['Honoraires HT'] !== undefined) l[DATA.idx['Honoraires HT']] = res.total;
        if (DATA.idx['Périodicité'] !== undefined) l[DATA.idx['Périodicité']] = ($('hper-' + ligne) || {}).value || '';
      });
    } else {
      msg.textContent = '⚠ ' + ((res && res.error) || 'échec'); msg.className = 'maj ko';
    }
  });
}

function blocLDM(l, ligne) {
  var assoc = val(l, 'Associé responsable') || 'Marc BIJAOUI';
  var opts = ['Marc BIJAOUI', 'Samy HADDAD'].map(function (s) {
    return '<option' + (s === assoc ? ' selected' : '') + '>' + esc(s) + '</option>';
  }).join('');
  return '<div class="actions ldm-bloc">' +
    '<b style="color:var(--blue-dark);">Lettre de mission</b>' +
    '<select id="ldm-modele-' + ligne + '" aria-label="Modèle de lettre de mission">' +
      '<option value="generale" selected>Modèle général</option>' +
      '<option value="sci">Modèle SCI</option>' +
    '</select>' +
    '<select id="ldm-sig-' + ligne + '" aria-label="Signataire">' + opts + '</select>' +
    '<button class="btn-rep" onclick="apercuLDM(' + ligne + ', this)">👁 Aperçu</button>' +
    '<button class="btn-envoyer" onclick="genererLDM(' + ligne + ', this)">📄 Télécharger le PDF</button>' +
    '<span class="maj" role="status" aria-live="polite"></span></div>';
}

function paramsLDM(ligne) {
  return {
    email: SESSION.email, token: SESSION.token, ligne: ligne,
    modele: $('ldm-modele-' + ligne).value,
    signataire: $('ldm-sig-' + ligne).value
  };
}

function apercuLDM(ligne, btn) {
  btn.disabled = true; btn.textContent = 'Chargement…';
  var p = paramsLDM(ligne); p.action = 'adminLDM'; p.apercu = true;
  api(p, function (res) {
    btn.disabled = false; btn.textContent = '👁 Aperçu';
    if (!res || !res.ok) { alert('Aperçu impossible : ' + ((res && res.error) || 'erreur')); return; }
    apercuHtml('Aperçu de la lettre de mission',
      res.denomination + ' — modèle ' + (res.modele === 'sci' ? 'SCI' : 'général') +
      ', signée ' + res.signataire, res.html);
  });
}

function genererLDM(ligne, btn) {
  var msg = btn.parentNode.querySelector('.maj');
  btn.disabled = true; btn.textContent = 'Génération…';
  msg.textContent = '⏳ Création du PDF…'; msg.className = 'maj';
  var p = paramsLDM(ligne); p.action = 'adminLDM';
  api(p, function (res) {
    btn.disabled = false; btn.textContent = '📄 Télécharger le PDF';
    if (res && res.ok && res.pdf) {
      telechargerPdf(res.pdf, res.nom);
      msg.textContent = '✓ ' + res.nom + ' téléchargé — déposez-le dans Yousign pour signature.';
      msg.className = 'maj ok';
    } else {
      msg.textContent = '⚠ ' + ((res && res.error) || 'échec');
      msg.className = 'maj ko';
    }
  });
}

// Reconstitue le PDF depuis le base64 et déclenche le téléchargement
function telechargerPdf(b64, nom) {
  var bin = atob(b64);
  var buf = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  var url = URL.createObjectURL(new Blob([buf], { type: 'application/pdf' }));
  var a = document.createElement('a');
  a.href = url; a.download = nom;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
}

function boutonsModif(l, ligne) {
  var per = val(l, 'Périmètre');
  var opts = ['Actif', 'À sortir (à confirmer)', 'Sorti', 'Radiée / Cessée'];
  return '<div class="actions">Périmètre : <select onchange="modifier(' + ligne + ", 'Périmètre', this.value, this)\">" +
    opts.map(function (o) {
      return '<option' + (o === per ? ' selected' : '') + '>' + esc(o) + '</option>';
    }).join('') + '</select><span class="maj" role="status" aria-live="polite"></span></div>';
}

function modifier(ligne, colonne, valeur, el) {
  var msg = el.parentNode.querySelector('.maj');
  msg.textContent = '…';
  api({ action: 'adminUpdate', email: SESSION.email, token: SESSION.token,
        ligne: ligne, colonne: colonne, valeur: valeur }, function (res) {
    if (res && res.ok) {
      msg.textContent = '✓ enregistré';
      msg.className = 'maj ok';
      DATA.lignes.forEach(function (l) { if (l[DATA.iLigne] === ligne) l[DATA.idx[colonne]] = valeur; });
    } else {
      msg.textContent = '⚠ ' + ((res && res.error) || 'échec');
      msg.className = 'maj ko';
    }
  });
}

// Colonnes du tableau : l'information est regroupée pour tenir dans la
// largeur de l'écran. { titre, tri (colonne réelle), largeur, rendu }
function colonnesTable() {
  var c = [
    { t: 'Société', tri: 'Dénomination', l: '30%', r: function (l) {
        var nom = [val(l, 'Prénom'), val(l, 'Nom')].filter(Boolean).join(' ');
        return '<div class="c1">' + esc(val(l, 'Dénomination')) + '</div>' +
               (nom ? '<div class="c2">' + esc(nom) + '</div>' : ''); } },
    { t: 'Forme', tri: 'Forme', l: '13%', r: function (l) {
        return '<span class="c2">' + esc(normForme(val(l, 'Forme'))) + '</span>'; } },
    { t: 'Ville', tri: 'Ville', l: '15%', r: function (l) {
        return '<div class="c1">' + esc(val(l, 'Ville')) + '</div>' +
               (val(l, 'CP') ? '<div class="c2">' + esc(val(l, 'CP')) + '</div>' : ''); } }
  ];
  if (SESSION.role === 'associe') {
    c.push({ t: 'Suivi par', tri: 'Collaborateur', l: '24%', r: function (l) {
      return '<div class="c1">' + esc(val(l, 'Collaborateur') || '—') + '</div>' +
             '<div class="c2">' + esc(val(l, 'Associé responsable')) + '</div>'; } });
  }
  c.push({ t: 'LDM', tri: 'Statut LDM', l: '18%', r: function (l) {
    var s = val(l, 'Statut LDM');
    var cls = s === 'SIGNÉE' ? 'ok' : (s === 'EN ATTENTE' ? 'warn' : 'neutre');
    return '<span class="tag ' + cls + '" title="' + esc(s) + '">' + esc(statutCourt(s)) + '</span>'; } });
  return c;
}

// Les statuts de la campagne sont trop longs pour une colonne : version courte
// à l'écran, libellé complet au survol.
function statutCourt(s) {
  s = String(s || '');
  if (!s) return '—';
  if (s.indexOf('À VÉRIFIER') === 0) return 'À vérifier';
  if (s.indexOf('HORS CAMPAGNE') === 0) return 'Hors campagne';
  if (s.indexOf('JAMAIS ENVOYÉE') === 0) return 'Jamais envoyée';
  return s.length > 16 ? s.slice(0, 15) + '…' : s;
}

function rendreDossiers(L) {
  var cols = colonnesTable();
  var iTri = DATA.idx[TRI.col];
  var tri = L.slice().sort(function (a, b) {
    var x = String(a[iTri] || '').toLowerCase(), y = String(b[iTri] || '').toLowerCase();
    if (!x && y) return 1; if (x && !y) return -1;
    return TRI.dir * x.localeCompare(y, 'fr');
  });

  var html = '<div class="table-wrap"><table><thead><tr>' +
    cols.map(function (c) {
      var actif = TRI.col === c.tri;
      return '<th style="width:' + c.l + '" aria-sort="' + (actif ? (TRI.dir === 1 ? 'ascending' : 'descending') : 'none') + '">' +
        '<button class="th-btn" onclick="trier(\'' + c.tri + '\')">' + esc(c.t) +
        '<span class="tri">' + (actif ? (TRI.dir === 1 ? '▲' : '▼') : '') + '</span></button></th>';
    }).join('') + '</tr></thead><tbody>' +
    tri.map(function (l) {
      var id = l[DATA.iLigne];
      var ouverte = LIGNE_OUVERTE === id;
      return '<tr class="ligne' + (ouverte ? ' ouverte' : '') + '" tabindex="0" aria-expanded="' + ouverte + '"' +
        ' onclick="ouvrirLigne(' + id + ')" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();ouvrirLigne(' + id + ');}">' +
        cols.map(function (c) { return '<td>' + c.r(l) + '</td>'; }).join('') + '</tr>' +
        (ouverte ? '<tr class="detail"><td colspan="' + cols.length + '">' + ficheDossier(l) + '</td></tr>' : '');
    }).join('') + '</tbody></table></div>' +
    (tri.length ? '' : '<p class="vide">Aucun résultat.</p>');
  $('liste').innerHTML = html;
  if (LIGNE_OUVERTE) {
    var d = document.querySelector('.detail');
    if (d) d.scrollIntoView({ block: 'nearest' });
  }
}

function trier(col) {
  if (TRI.col === col) TRI.dir = -TRI.dir;
  else { TRI.col = col; TRI.dir = 1; }
  rendre();
}

function ouvrirLigne(id) {
  LIGNE_OUVERTE = (LIGNE_OUVERTE === id) ? null : id;
  rendre();
}

function changerVue(v) {
  VUE = v;
  var horsDossiers = (v === 'entrees' || v === 'pennylane' || v === 'incomplets');
  document.querySelector('.apercu').style.display = horsDossiers ? 'none' : '';
  document.querySelector('.bar').style.display = horsDossiers ? 'none' : '';
  if (v === 'entrees') { chargerEntrees(); }
  if (v === 'pennylane') { chargerPennylane('etat'); }
  if (v === 'incomplets') { chargerIncomplets(); }
  document.querySelectorAll('.tab').forEach(function (t) {
    var actif = t.dataset.vue === v;
    t.classList.toggle('active', actif);
    t.setAttribute('aria-selected', actif ? 'true' : 'false');
  });
  rendre();
}

// ── Pipeline « Nouveaux dossiers » (associés) ────────────────
var ENTREES = { entrees: [], signataires: [] };

// ── Pennylane : rapprochement du portefeuille avec la base ────
// La consultation lit le cache du classeur ; seul « Rapprocher maintenant »
// interroge l'API. Réservé aux associés, comme le pipeline.
function chargerPennylane(mode) {
  document.querySelectorAll('.tab').forEach(function (t) {
    var actif = t.dataset.vue === 'pennylane';
    t.classList.toggle('active', actif);
    t.setAttribute('aria-selected', actif ? 'true' : 'false');
  });
  $('liste').innerHTML = '<p class="vide">' + (mode === 'rapprocher'
    ? 'Interrogation de Pennylane et rapprochement par SIREN… (quelques secondes)' : 'Chargement…') + '</p>';
  api({ action: 'adminPennylane', email: SESSION.email, token: SESSION.token, mode: mode }, function (res) {
    if (VUE !== 'pennylane') return;   // la vue a changé pendant l'attente
    if (!res || !res.ok) {
      $('liste').innerHTML = '<div class="alerte">⚠ ' + esc((res && res.error) || 'Erreur') + '</div>' +
        '<div class="pl-tete"><span></span><button class="btn-envoyer" onclick="chargerPennylane(\'rapprocher\')">🔄 Réessayer</button></div>';
      return;
    }
    rendrePennylane(res);
  });
}

// Import de sociétés Pennylane dans la base (associés). Le choix final
// appartient à l'associé, archive ou pas ; le compte rendu s'affiche sur
// place, puis le rapprochement est relu et la base rechargée.
function cocherTout(el) {
  document.querySelectorAll('.pl-coche').forEach(function (c) { c.checked = el.checked; });
}

function importerSelection(btn) {
  var ids = Array.from(document.querySelectorAll('.pl-coche:checked')).map(function (c) { return c.value; });
  var msg = btn.parentNode.querySelector('.maj');
  if (!ids.length) { msg.textContent = 'Cochez au moins une société.'; msg.className = 'maj ko'; return; }
  importerPennylane(ids, btn);
}

function importerPennylane(ids, btn) {
  if (!confirm('Créer ' + ids.length + ' dossier(s) dans la base à partir de Pennylane et du registre SIRENE ?')) return;
  var sec = $('pl-orphelins');
  var msg = sec.querySelector('.maj');
  var avant = btn.textContent;
  btn.disabled = true; btn.textContent = 'Import…';
  msg.textContent = '⏳ Import de ' + ids.length + ' société(s) — quelques secondes par dossier…'; msg.className = 'maj';
  api({ action: 'adminImporterPennylane', email: SESSION.email, token: SESSION.token, ids: ids }, function (res) {
    if (!res || !res.ok) { btn.disabled = false; btn.textContent = avant; msg.textContent = '⚠ ' + ((res && res.error) || 'Import impossible.'); msg.className = 'maj ko'; return; }
    var n = (res.importes || []).length, e = res.erreurs || [];
    msg.textContent = '✓ ' + n + ' dossier(s) créé(s)' + (e.length ? ' · ' + e.length + ' non importé(s) : ' + e.join(' ; ') : '');
    msg.className = e.length && !n ? 'maj ko' : 'maj ok';
    if (n) {
      chargerDossiers();
      setTimeout(function () { chargerPennylane('etat'); }, 1500);
    } else { btn.disabled = false; btn.textContent = avant; }
  });
}

function tablePennylane(colonnes, lignes) {
  return '<table class="pl-table"><tr>' + colonnes.map(function (c) { return '<th>' + esc(c[0]) + '</th>'; }).join('') + '</tr>' +
    lignes.map(function (l) {
      return '<tr>' + colonnes.map(function (c) {
        var v = l[c[1]] || '';
        return '<td' + (c[1] === 'siren' ? ' class="pl-siren"' : '') + '>' + esc(v) + '</td>';
      }).join('') + '</tr>';
    }).join('') + '</table>';
}

function rendrePennylane(r) {
  var carte = function (n, l) { return '<div class="pl-carte"><b>' + n + '</b><span>' + l + '</span></div>'; };
  var h = '<div class="pl-tete"><div>' +
    (r.quand ? 'Dernier rapprochement : <b>' + esc(r.quand) + '</b>' : 'Aucun rapprochement effectué pour le moment — lancez-en un.') +
    (r.total ? ' · portefeuille Pennylane : ' + r.total + ' dossiers' : '') + '</div>' +
    '<button class="btn-envoyer" onclick="chargerPennylane(\'rapprocher\')">🔄 Rapprocher maintenant</button></div>';

  h += '<div class="pl-cartes">' +
    carte(r.actifs, 'dossiers actifs en base') +
    carte(r.rapproches, 'rapprochés par SIREN') +
    carte(r.absents.length, 'à créer ou transférer') +
    carte(r.orphelins.length, 'dans Pennylane, absents de la base') + '</div>';

  if (r.absents.length) {
    h += '<div class="pl-sec"><h3>À créer ou à transférer dans Pennylane (' + r.absents.length + ')</h3>' +
      '<p>Dossiers actifs dont le SIREN n\'est pas dans le portefeuille. Si la société est déjà tenue sur Pennylane par ' +
      'un autre cabinet : Production → Demandes de transfert → Créer un nouveau dossier client → saisir le SIREN → ' +
      '« Demande de transfert ». Sinon, création classique.</p>' +
      tablePennylane([['Code', 'code'], ['Dénomination', 'denomination'], ['SIREN', 'siren'],
                      ['Collaborateur', 'collaborateur'], ['Associé', 'associe']], r.absents) + '</div>';
  }
  if (r.sansSiren.length) {
    h += '<div class="pl-sec"><h3>Sans SIREN exploitable (' + r.sansSiren.length + ')</h3>' +
      '<p>Impossible à rapprocher tant que le SIRET n\'est pas renseigné dans la base — sociétés en cours de constitution, ou fiches à compléter.</p>' +
      tablePennylane([['Code', 'code'], ['Dénomination', 'denomination'], ['Collaborateur', 'collaborateur']], r.sansSiren) + '</div>';
  }
  if (r.orphelins.length) {
    var sortis = r.orphelins.filter(function (o) { return o.archive; }).length;
    h += '<div class="pl-sec" id="pl-orphelins"><h3>Dans Pennylane, absents de la base (' + r.orphelins.length + ')</h3>' +
      '<p>' + (sortis ? '<b>' + sortis + '</b> figurent à l\'archive des dossiers sortis ou radiés en juillet 2026 — indication seulement, le choix vous revient. ' : '') +
      'À l\'import : nom, SIREN et code client viennent de Pennylane ; forme, SIRET, adresse, NAF et dirigeant du registre SIRENE. ' +
      'Associé et collaborateur restent à affecter dans la fiche.</p>' +
      '<div class="lettre-actions" style="margin-bottom:8px;">' +
        '<button class="btn-envoyer" onclick="importerSelection(this)">➕ Importer la sélection</button>' +
        '<span class="maj" role="status" aria-live="polite"></span></div>' +
      '<table class="pl-table"><tr><th><input type="checkbox" onchange="cocherTout(this)" title="Tout sélectionner"></th>' +
      '<th>Nom Pennylane</th><th>SIREN</th><th>Code client</th><th>Archive juillet 2026</th><th></th></tr>' +
      r.orphelins.map(function (o) {
        return '<tr><td><input type="checkbox" class="pl-coche" value="' + esc(o.id) + '"></td>' +
          '<td>' + esc(o.name) + '</td><td class="pl-siren">' + esc(o.siren) + '</td><td>' + esc(o.client_code) + '</td>' +
          '<td>' + (o.archive ? '<span class="tag warn">' + esc(o.archive) + '</span>' : '—') + '</td>' +
          '<td><button class="btn-rep" onclick="importerPennylane([\'' + esc(o.id) + '\'], this)">➕ Importer</button></td></tr>';
      }).join('') + '</table></div>';
  }
  if (r.quand && !r.absents.length && !r.orphelins.length && !r.sansSiren.length) {
    h += '<div class="pl-sec"><p>✓ Base et portefeuille Pennylane parfaitement alignés.</p></div>';
  }
  $('liste').innerHTML = h;
}

// ── Dossiers à compléter ──────────────────────────────────────
function chargerIncomplets() {
  document.querySelectorAll('.tab').forEach(function (t) {
    var actif = t.dataset.vue === 'incomplets';
    t.classList.toggle('active', actif);
    t.setAttribute('aria-selected', actif ? 'true' : 'false');
  });
  $('liste').innerHTML = '<p class="vide">Chargement…</p>';
  api({ action: 'adminIncomplets', email: SESSION.email, token: SESSION.token }, function (res) {
    if (VUE !== 'incomplets') return;   // la vue a changé pendant l'attente
    if (!res || !res.ok) { $('liste').innerHTML = '<div class="alerte">⚠ ' + esc((res && res.error) || 'Erreur') + '</div>'; return; }
    rendreIncomplets(res.dossiers);
  });
}

function rendreIncomplets(dossiers) {
  if (!dossiers.length) {
    $('liste').innerHTML = '<div class="pl-sec"><p>✓ Aucun dossier incomplet parmi ceux qui ont une checklist.</p></div>';
    return;
  }
  $('liste').innerHTML = '<div class="pl-sec"><h3>Dossiers à compléter (' + dossiers.length + ')</h3>' +
    '<p>Éléments en attente du client, et pièces reçues à vérifier par le cabinet, sur les phases ouvertes.</p>' +
    '<table class="pl-table"><tr><th>Dossier</th><th>Code</th><th>Collaborateur</th><th>Phase</th>' +
    '<th>En attente du client</th><th>À vérifier</th><th>Relances</th><th></th></tr>' +
    dossiers.map(function (d) {
      return '<tr><td>' + esc(d.denomination) + '</td><td>' + esc(d.code) + '</td><td>' + esc(d.collaborateur) + '</td>' +
        '<td>' + esc(LIBELLE_PHASE[d.phase] || d.phase) + '</td><td><b>' + d.attendues + '</b></td><td>' + d.aTraiter + '</td><td>' + esc(d.rythme || '—') + '</td>' +
        '<td><button class="btn-rep" onclick="allerAuDossier(\'' + esc(d.denomination).replace(/'/g, "\\'") + '\')">→ Ouvrir</button></td></tr>';
    }).join('') + '</table></div>';
}

// Comme la liste des dossiers : on montre ce qu'on sait déjà, on actualise derrière.
var ENTREES_LE = 0, ENTREES_EN_VOL = false;
var CLE_ENTREES = 'tec.admin.entrees';
function memoriserEntrees(res) {
  try { localStorage.setItem(CLE_ENTREES, JSON.stringify({ email: SESSION.email, le: Date.now(), res: res })); } catch (e) {}
}
function oublierEntrees() { try { localStorage.removeItem(CLE_ENTREES); } catch (e) {} }
function entreesMemorisees() {
  try {
    var c = JSON.parse(localStorage.getItem(CLE_ENTREES) || 'null');
    if (!c || c.email !== SESSION.email || !c.res || !c.res.entrees) return null;
    if (Date.now() - c.le > 8 * 3600 * 1000) { oublierEntrees(); return null; }
    return c;
  } catch (e) { return null; }
}

function chargerEntrees(discret) {
  var connues = ENTREES_LE > 0;   // « jamais chargé » et « chargé, mais vide » ne s'affichent pas pareil
  if (!discret) {
    document.querySelectorAll('.tab').forEach(function (t) {
      var actif = t.dataset.vue === 'entrees';
      t.classList.toggle('active', actif);
      t.setAttribute('aria-selected', actif ? 'true' : 'false');
    });
    if (!connues) {
      var c = entreesMemorisees();
      if (c) { ENTREES = c.res; ENTREES_LE = c.le; connues = true; majOngletEntrees(); }
    }
    if (connues) {
      rendreEntrees();                                  // affichage immédiat
      if (Date.now() - ENTREES_LE < 120000) return;     // assez frais : on s'arrête là
    } else {
      $('liste').innerHTML = '<p class="vide">Chargement…</p>';
    }
  }
  if (ENTREES_EN_VOL) return;   // un appel est déjà parti : son résultat servira aussi ici
  ENTREES_EN_VOL = true;
  api({ action: 'adminEntrees', email: SESSION.email, token: SESSION.token }, function (res) {
    ENTREES_EN_VOL = false;
    if (!res || !res.ok) {
      if (!discret && VUE === 'entrees' && !connues) $('liste').innerHTML = '<div class="alerte">' + esc((res && res.error) || 'Erreur') + '</div>';
      return;
    }
    ENTREES = res;
    ENTREES_LE = Date.now();
    memoriserEntrees(res);
    majOngletEntrees();
    if (VUE === 'entrees') rendreEntrees();   // la vue a pu changer pendant l'attente
  });
}

// Le nombre de dossiers à traiter s'affiche sur l'onglet dès la connexion,
// sans attendre que l'associé ouvre la vue.
function majOngletEntrees() {
  var t = $('tab-entrees');
  if (!t) return;
  var n = (ENTREES.entrees || []).filter(function (e) {
    var c = etapeCourante(e);
    return c && (c.action || c.alerte);
  }).length;
  t.textContent = 'Nouveaux dossiers' + (n ? ' (' + n + ')' : '');
}

// Chaîne d'étapes d'une entrée, selon son parcours
function etapes(e) {
  var st = e.lettre ? e.lettre.statut : '';
  var lettreFaite = st && st.indexOf('À émettre') !== 0;
  var repriseOk = st && (st.indexOf('Reprise effective') === 0 || st.indexOf('Réponse reçue — sans objection') === 0);
  var objection = st && st.indexOf('OBJECTION') > -1;

  var l = [{ nom: 'Reçu', fait: true }];
  if (e.confrere) {
    l.push({ nom: 'Lettre confraternelle', fait: !!lettreFaite, action: lettreFaite ? null : 'lettre' });
    l.push({ nom: 'Délai 15 jours', fait: !!repriseOk, attente: lettreFaite && !repriseOk && !objection,
             alerte: objection, echeance: e.lettre ? e.lettre.echeance : '' });
  }
  var prealableOk = !e.confrere || repriseOk;
  l.push({ nom: 'Dossier créé', fait: !!e.codeDossier, action: (!e.codeDossier && prealableOk) ? 'dossier' : null });
  l.push({ nom: 'Lettre de mission', fait: !!e.ldm, action: (e.codeDossier && !e.ldm) ? 'ldm' : null });
  l.push({ nom: 'Signature', fait: false, futur: true });
  return l;
}

function etapeCourante(e) {
  var l = etapes(e);
  for (var i = 0; i < l.length; i++) if (l[i].action) return l[i];
  for (var j = 0; j < l.length; j++) if (l[j].attente || l[j].alerte) return l[j];
  return null;
}

function joursRestants(dateFr) {
  var m = String(dateFr || '').match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  var d = new Date(+m[3], +m[2] - 1, +m[1], 23, 59);
  return Math.ceil((d - new Date()) / 86400000);
}

function rendreEntrees() {
  var L = ENTREES.entrees || [];
  if (!L.length) {
    $('liste').innerHTML = '<p class="vide">Aucune entrée pour le moment — cette vue se remplit automatiquement à chaque dossier reçu par le portail.</p>';
    return;
  }
  var aTraiter = [], enAttente = [], termines = [];
  L.forEach(function (e) {
    var c = etapeCourante(e);
    if (c && (c.action || c.alerte)) aTraiter.push(e);
    else if (c && c.attente) enAttente.push(e);
    else termines.push(e);
  });
  // Les délais les plus proches en premier
  enAttente.sort(function (a, b) {
    var ja = joursRestants(a.lettre && a.lettre.echeance), jb = joursRestants(b.lettre && b.lettre.echeance);
    return (ja === null ? 999 : ja) - (jb === null ? 999 : jb);
  });

  var html = groupe('🔴 À traiter', aTraiter, 'Ces dossiers attendent une action de votre part.');
  html += groupe('🟠 Délai en cours', enAttente, 'Le confrère dispose de 15 jours pour s\'opposer ; la reprise sera actée automatiquement à l\'échéance.');
  html += groupe('🟢 Terminés', termines, '', true);
  $('liste').innerHTML = html;

  majOngletEntrees();
}

function groupe(titre, L, aide, replie) {
  if (!L.length) return '';
  return '<div class="grp' + (replie ? '' : ' ouvert') + '">' +
    '<button class="grp-tete" onclick="this.parentNode.classList.toggle(\'ouvert\')">' +
    '<span>' + titre + ' <b>' + L.length + '</b></span><span class="chevron">▼</span></button>' +
    (aide ? '<p class="grp-aide">' + aide + '</p>' : '') +
    '<div class="grp-corps">' + L.map(carteEntree).join('') + '</div></div>';
}

function carteEntree(e) {
  var l = etapes(e);
  var stepper = '<div class="stepper">' + l.map(function (s, i) {
    var cls = s.fait ? 'ok' : (s.alerte ? 'ko' : (s.action ? 'now' : (s.attente ? 'wait' : 'todo')));
    return '<span class="step ' + cls + '">' + (i ? '<i></i>' : '') +
      '<b>' + (s.fait ? '✓' : (s.alerte ? '!' : i + 1)) + '</b>' + esc(s.nom) + '</span>';
  }).join('') + '</div>';

  var meta = 'Reçu le ' + esc(e.date) + ' · ' + esc(e.contact || e.email) +
    ' · ' + (e.parcours === 'nouveau-client' ? 'Nouveau client / reprise' : 'Constitution') +
    (e.pennylane === 'oui' ? ' · <span class="tag warn">déjà sur Pennylane — transfert à demander</span>'
      : e.pennylane === 'non' ? ' · <span class="tag neutre">dossier Pennylane à créer</span>' : '') +
    (e.saisiPar ? ' · <span class="tag neutre">saisi par le cabinet — ' + esc(e.saisiPar) + '</span>' : '') +
    (e.codeDossier ? ' · dossier <b>' + esc(e.codeDossier) + '</b>' : '') +
    (e.drive ? ' · <button class="lien-pieces" onclick="voirPieces(\'' + esc(e.drive) + '\', this)">📎 pièces jointes</button>' : '');

  return '<div class="entree">' +
    '<div class="entree-tete"><div><strong>' + esc(e.denomination || '(sans dénomination)') + '</strong>' +
    (e.forme ? ' <span class="tag neutre">' + esc(e.forme) + '</span>' : '') +
    (e.acre && e.acre.indexOf('Oui') === 0 ? ' <span class="tag warn">ACRE</span>' : '') +
    '<div class="lettre-meta">' + meta + '</div></div></div>' +
    stepper + actionEntree(e) + '</div>';
}

function actionEntree(e) {
  var c = etapeCourante(e);
  if (!c) return '<div class="entree-act"><span class="maj ok">✓ Parcours terminé — en attente de signature client.</span></div>';
  var ligne = e.ligne;

  if (c.action === 'lettre') {
    var lg = e.lettre.ligne;
    return '<div class="entree-act"><b>Étape : émettre la lettre confraternelle</b>' +
      '<div class="lettre-meta">Confrère : ' + esc(e.lettre.cabinet || '—') +
      (e.lettre.confrere ? ' (' + esc(e.lettre.confrere) + ')' : '') + ' · ' + esc(e.lettre.emailConfrere || 'email manquant ⚠') +
      (e.lettre.honoraires === 'litige' ? ' · <b style="color:#b45309;">honoraires en litige ⚠</b>' :
       (e.lettre.honoraires === 'non' ? ' · honoraires du confrère non réglés ⚠' : '')) + '</div>' +
      '<div class="lettre-actions">Signataire : <select id="sig-' + lg + '">' +
      ENTREES.signataires.map(function (s) { return '<option>' + esc(s) + '</option>'; }).join('') +
      '</select><button class="btn-rep" onclick="apercuLettre(' + lg + ', this)">👁 Aperçu</button>' +
      '<button class="btn-envoyer" onclick="envoyerLettre(' + lg + ', this)">📨 Envoyer la lettre</button>' +
      '<span class="maj" role="status" aria-live="polite"></span></div></div>';
  }

  if (c.alerte) {
    return '<div class="entree-act"><b style="color:#c0392b;">Le confrère a émis une objection</b>' +
      '<div class="lettre-meta">À traiter avec le client avant d\'aller plus loin (honoraires impayés, litige…).</div></div>';
  }

  if (c.attente) {
    var j = joursRestants(c.echeance);
    var txt = j === null ? '' : (j > 1 ? 'encore ' + j + ' jours' : (j === 1 ? 'échéance demain' : (j === 0 ? 'échéance aujourd\'hui' : 'échéance dépassée, bascule imminente')));
    var lg2 = e.lettre.ligne;
    return '<div class="entree-act"><b>Délai confraternel en cours</b> ' +
      '<span class="pastille' + (j !== null && j <= 3 ? ' urgent' : '') + '">' + esc(txt) + '</span>' +
      '<div class="lettre-meta">Envoyée le ' + esc(e.lettre.envoyee) + ' — sans opposition au ' + esc(e.lettre.echeance) +
      ', la reprise sera actée automatiquement.</div>' +
      '<div class="lettre-actions">Le confrère a répondu ? ' +
      '<button class="btn-rep" onclick="reponseLettre(' + lg2 + ', false, this)">✓ Sans objection</button>' +
      '<button class="btn-rep" onclick="reponseLettre(' + lg2 + ', true, this)">⚠ Objection</button>' +
      '<span class="maj" role="status" aria-live="polite"></span></div></div>';
  }

  if (c.action === 'dossier') {
    var collabs = {};
    DATA.lignes.forEach(function (x) { var v = val(x, 'Collaborateur'); if (v) collabs[v] = 1; });
    return '<div class="entree-act"><b>Étape : créer le dossier dans la base</b>' +
      '<div class="lettre-meta">Le client entrera dans la base des dossiers ; la lettre de mission deviendra possible.</div>' +
      '<div class="lettre-actions">' +
      '<label>Code <input type="text" id="cd-' + ligne + '" placeholder="auto" style="width:82px;"></label>' +
      '<label>Associé <select id="ca-' + ligne + '">' +
        ENTREES.signataires.map(function (s) { return '<option>' + esc(s) + '</option>'; }).join('') +
      '</select></label>' +
      '<label>Collaborateur <select id="cc-' + ligne + '"><option value="">— à affecter —</option>' +
        Object.keys(collabs).sort().map(function (s) { return '<option>' + esc(s) + '</option>'; }).join('') +
      '</select></label>' +
      '<label>Facturation <select id="cper-' + ligne + '" style="width:118px;">' +
        '<option value="">—</option><option>Mensuelle</option><option>Trimestrielle</option><option>Annuelle</option>' +
      '</select></label>' +
      '</div><div class="lettre-actions" style="margin-top:6px;">' +
      '<b style="font-weight:600;">Honoraires</b> ' + champsPostes('cp-' + ligne + '-') +
      '<button class="btn-envoyer" onclick="creerDossier(' + ligne + ', this)">➕ Créer le dossier</button>' +
      '<span class="maj" role="status" aria-live="polite"></span></div></div>';
  }

  if (c.action === 'ldm') {
    return '<div class="entree-act"><b>Étape : lettre de mission</b>' +
      '<div class="lettre-meta">Le dossier <b>' + esc(e.codeDossier) + '</b> est dans la base. ' +
      'Générez la lettre depuis l\'onglet <b>Dossiers</b> (recherchez « ' + esc(e.denomination) + ' »), ' +
      'puis déposez le PDF dans Yousign pour signature.</div>' +
      '<div class="lettre-actions"><button class="btn-rep" onclick="allerAuDossier(\'' +
      esc(e.denomination).replace(/'/g, "\\'") + '\')">→ Ouvrir le dossier</button></div></div>';
  }
  return '';
}

// Liste les pièces et les télécharge via le portail (jamais via Drive)
function voirPieces(url, btn) {
  var zone = btn.closest('.entree').querySelector('.pieces') || (function () {
    var d = document.createElement('div');
    d.className = 'pieces';
    btn.closest('.entree').appendChild(d);
    return d;
  })();
  if (zone.dataset.ouvert === '1') { zone.dataset.ouvert = '0'; zone.innerHTML = ''; return; }
  zone.dataset.ouvert = '1';
  zone.dataset.url = url;
  zone.innerHTML = '<span class="maj">Chargement des pièces…</span>';
  api({ action: 'adminPieces', email: SESSION.email, token: SESSION.token, url: url }, function (res) {
    if (!res || !res.ok) { zone.innerHTML = '<span class="maj ko">⚠ ' + esc((res && res.error) || 'erreur') + '</span>'; return; }
    zone.innerHTML = listePiecesHtml(res.fichiers);
  });
}


function allerAuDossier(denomination) {
  changerVue('dossiers');
  $('q').value = denomination;
  rendre();
  var t = document.querySelector('tr.ligne');
  if (t) t.click();
}

function creerDossier(ligne, btn) {
  var msg = btn.parentNode.querySelector('.maj[role="status"]');
  btn.disabled = true; btn.textContent = 'Création…';
  api({ action: 'adminCreerDossier', email: SESSION.email, token: SESSION.token, ligne: ligne,
        code: $('cd-' + ligne).value, associe: $('ca-' + ligne).value,
        collaborateur: $('cc-' + ligne).value, periodicite: $('cper-' + ligne).value,
        hCompta: $('cp-' + ligne + '-hCompta').value, hOutils: $('cp-' + ligne + '-hOutils').value,
        hJuridique: $('cp-' + ligne + '-hJuridique').value },
    function (res) {
      btn.disabled = false; btn.textContent = '➕ Créer le dossier';
      if (res && res.ok) {
        msg.textContent = '✓ Dossier ' + res.code + ' créé.';
        msg.className = 'maj ok';
        chargerDossiers();
        setTimeout(chargerEntrees, 400);
      } else {
        msg.textContent = '⚠ ' + ((res && res.error) || 'échec');
        msg.className = 'maj ko';
      }
    });
}

function apercuLettre(ligne, btn) {
  var sig = $('sig-' + ligne).value;
  btn.disabled = true; btn.textContent = 'Chargement…';
  api({ action: 'adminApercuLettre', email: SESSION.email, token: SESSION.token, ligne: ligne, signataire: sig },
    function (res) {
      btn.disabled = false; btn.textContent = '👁 Aperçu';
      if (!res || !res.ok) { alert('Aperçu impossible : ' + ((res && res.error) || 'erreur')); return; }
      apercuHtml('Aperçu de la lettre confraternelle',
        'Sera envoyée en PDF à ' + (res.destinataire || '(email du confrère manquant)'),
        res.html);
    });
}

// Modale d'aperçu, partagée par la lettre confraternelle, la lettre de
// mission (HTML injecté) et les pièces jointes (blob local).
var APERCU_COURANT = null;

function ouvrirApercu(titre, sous, avecTelechargement) {
  $('apercu-titre').textContent = titre;
  $('apercu-sous').textContent = sous || '';
  $('apercu-dl').hidden = !avecTelechargement;
  $('apercu-modale').style.display = 'flex';
  $('apercu-fermer').focus();
}

function apercuHtml(titre, sous, html) {
  var cadre = $('apercu-corps');
  cadre.removeAttribute('src');
  cadre.srcdoc = html;
  APERCU_COURANT = null;
  ouvrirApercu(titre, sous, false);
}

function fermerApercu() {
  $('apercu-modale').style.display = 'none';
  var cadre = $('apercu-corps');
  cadre.removeAttribute('srcdoc');
  cadre.removeAttribute('src');
  APERCU_COURANT = null;
}

function envoyerLettre(ligne, btn) {
  var sig = $('sig-' + ligne).value;
  var msg = btn.parentNode.querySelector('.maj');
  if (!confirm('Envoyer la lettre confraternelle, signée ' + sig + ' ?\n\nElle partira par email au confrère avec le PDF en pièce jointe. Sans opposition sous 15 jours, la reprise sera automatiquement actée.')) {
    msg.textContent = 'Envoi annulé.'; msg.className = 'maj';
    return;
  }
  btn.disabled = true; btn.textContent = 'Envoi…';
  msg.textContent = '⏳ Envoi en cours (génération du PDF)…'; msg.className = 'maj';
  var repondu = false;
  var minuteur = setTimeout(function () {
    if (repondu) return;
    btn.disabled = false; btn.textContent = '📨 Envoyer la lettre';
    msg.textContent = '⚠ Aucune réponse du serveur après 60 s. Rechargez la page et vérifiez le statut avant de réessayer.';
    msg.className = 'maj ko';
  }, 60000);
  api({ action: 'adminEnvoyerLettre', email: SESSION.email, token: SESSION.token, ligne: ligne, signataire: sig },
    function (res) {
      repondu = true; clearTimeout(minuteur);
      if (res && res.ok) {
        alert('✓ Lettre envoyée au confrère, signée ' + sig + '.');
        chargerEntrees();
      } else {
        btn.disabled = false; btn.textContent = '📨 Envoyer la lettre';
        var txt = (res && res.error) || 'erreur inconnue';
        msg.textContent = '⚠ ' + txt; msg.className = 'maj ko';
        alert('⚠ Envoi impossible\n\n' + txt);
      }
    });
}

function reponseLettre(ligne, objection, btn) {
  btn.disabled = true;
  api({ action: 'adminLettreReponse', email: SESSION.email, token: SESSION.token, ligne: ligne, objection: objection },
    function (res) {
      if (res && res.ok) { chargerEntrees(); }
      else { btn.disabled = false; alert((res && res.error) || 'Échec'); }
    });
}

document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape' && $('apercu-modale') && $('apercu-modale').style.display === 'flex') fermerApercu();
});

function exporterCSV() {
  var L = lignesFiltrees();
  var cols = DATA.colonnes;
  var csv = [cols.join(';')].concat(L.map(function (l) {
    return cols.map(function (c, i) { return '"' + String(l[i] || '').replace(/"/g, '""') + '"'; }).join(';');
  })).join('\n');
  var a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  a.download = 'tec-audit-dossiers.csv';
  a.click();
}

document.addEventListener('DOMContentLoaded', function () {
  ['email', 'motdepasse'].forEach(function (id) {
    $(id).addEventListener('keydown', function (e) { if (e.key === 'Enter') login(); });
  });
  $('email-oubli').addEventListener('keydown', function (e) { if (e.key === 'Enter') demanderReinit(); });
  $('mdp2').addEventListener('keydown', function (e) { if (e.key === 'Enter') definirMdp(); });
  verifierLienReinit();
  restaurerSessionAdmin();
  $('saisie-email').addEventListener('keydown', function (e) { if (e.key === 'Enter') ouvrirSaisieCabinet('constitution'); });
  ['q'].forEach(function (id) { $(id).addEventListener('input', rendre); });
  // Raccourci « / » : focus sur la recherche depuis n'importe où
  document.addEventListener('keydown', function (e) {
    if (e.key === '/' && document.activeElement.tagName !== 'INPUT' &&
        document.activeElement.tagName !== 'SELECT' && $('app').style.display !== 'none') {
      e.preventDefault();
      $('q').focus();
    }
  });
  ['f-perimetre', 'f-associe', 'f-collab', 'f-ldm', 'f-forme'].forEach(function (id) {
    $(id).addEventListener('change', rendre);
  });
});
