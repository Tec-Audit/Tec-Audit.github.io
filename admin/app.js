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
  fetch(APPS_SCRIPT_URL, { method: 'POST', body: JSON.stringify(payload) })
    .then(function (r) { return r.json(); })
    .then(cb)
    .catch(function (e) { cb({ ok: false, error: 'Erreur réseau : ' + e.message }); });
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
      $('login-screen').style.display = 'none';
      $('app').style.display = 'flex';
      $('user-nom').textContent = res.nom;
      $('user-role').textContent = res.role === 'associe' ? 'Associé' : 'Collaborateur';
      if (res.role === 'associe') $('tab-entrees').style.display = '';
      chargerDossiers();
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
  location.reload();
}

// ── Chargement des données ───────────────────────────────────
function chargerDossiers() {
  $('loading').style.display = 'flex';
  api({ action: 'adminDossiers', email: SESSION.email, token: SESSION.token }, function (res) {
    $('loading').style.display = 'none';
    if (!res || !res.ok) {
      alert('Chargement impossible : ' + ((res && res.error) || 'erreur'));
      return;
    }
    DATA.colonnes = res.colonnes;
    DATA.lignes = res.lignes;
    DATA.idx = {};
    res.colonnes.forEach(function (c, i) { DATA.idx[c] = i; });
    DATA.iLigne = res.colonnes.length; // n° de ligne ajouté en fin
    remplirFiltres();
    rendre();
    if (res.avertissement) {
      $('liste').innerHTML = '<div class="alerte">' + esc(res.avertissement) + '</div>';
    }
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
  if (VUE === 'entrees') return;
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

// Regroupe les libellés SIRENE trop longs en familles lisibles
function normActivite(a) {
  var s = String(a || '').trim();
  if (!s) return 'Non renseignée';
  return s.length > 42 ? s.slice(0, 40).replace(/[\s,;.]+$/, '') + '…' : s;
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
      '<i style="background:' + p.c + '"></i>' + esc(p.nom) +
      '<b>' + p.n + '</b><span>' + Math.round(p.n / total * 100) + '%</span></button>';
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
      ? val(l, 'Honoraires HT') + ' € HT / ' + val(l, 'Périodicité') : ''],
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
    (SESSION.role === 'associe' ? boutonsModif(l, lignesSheet) : '') +
    (SESSION.role === 'associe' ? blocLDM(l, lignesSheet) : '') +
  '</div>';
}

// ── Lettre de mission ────────────────────────────────────────
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
    $('apercu-corps').srcdoc = res.html;
    $('apercu-dest').textContent = res.denomination + ' — modèle ' +
      (res.modele === 'sci' ? 'SCI' : 'général') + ', signée ' + res.signataire;
    $('apercu-modale').style.display = 'flex';
    $('apercu-fermer').focus();
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

var COLS_TABLE = ['Dénomination', 'Forme', 'Nom', 'Ville', 'Collaborateur', 'Associé responsable', 'Statut LDM'];

function rendreDossiers(L) {
  var cols = COLS_TABLE.slice();
  if (SESSION.role !== 'associe') {
    cols = cols.filter(function (c) { return c !== 'Collaborateur' && c !== 'Associé responsable'; });
  }
  // Tri
  var iTri = DATA.idx[TRI.col];
  var tri = L.slice().sort(function (a, b) {
    var x = String(a[iTri] || '').toLowerCase(), y = String(b[iTri] || '').toLowerCase();
    if (!x && y) return 1; if (x && !y) return -1;
    return TRI.dir * x.localeCompare(y, 'fr');
  });

  var html = '<div class="table-wrap"><table><thead><tr>' +
    cols.map(function (c) {
      var actif = TRI.col === c;
      return '<th aria-sort="' + (actif ? (TRI.dir === 1 ? 'ascending' : 'descending') : 'none') + '">' +
        '<button class="th-btn" onclick="trier(\'' + c + '\')">' + esc(c) +
        '<span class="tri">' + (actif ? (TRI.dir === 1 ? '▲' : '▼') : '') + '</span></button></th>';
    }).join('') + '</tr></thead><tbody>' +
    tri.map(function (l) {
      var id = l[DATA.iLigne];
      var ouverte = LIGNE_OUVERTE === id;
      var ldm = val(l, 'Statut LDM');
      var cls = ldm === 'SIGNÉE' ? 'ok' : (ldm === 'EN ATTENTE' ? 'warn' : 'neutre');
      return '<tr class="ligne' + (ouverte ? ' ouverte' : '') + '" tabindex="0" aria-expanded="' + ouverte + '"' +
        ' onclick="ouvrirLigne(' + id + ')" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();ouvrirLigne(' + id + ');}">' +
        cols.map(function (c) {
          var v = val(l, c);
          if (c === 'Statut LDM') return '<td><span class="tag ' + cls + '">' + esc(v || '—') + '</span></td>';
          return '<td>' + esc(v) + '</td>';
        }).join('') + '</tr>' +
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
  var horsDossiers = (v === 'entrees');
  document.querySelector('.apercu').style.display = horsDossiers ? 'none' : '';
  document.querySelector('.bar').style.display = horsDossiers ? 'none' : '';
  if (v === 'entrees') { chargerEntrees(); }
  document.querySelectorAll('.tab').forEach(function (t) {
    var actif = t.dataset.vue === v;
    t.classList.toggle('active', actif);
    t.setAttribute('aria-selected', actif ? 'true' : 'false');
  });
  rendre();
}

// ── Pipeline « Nouveaux dossiers » (associés) ────────────────
var ENTREES = { entrees: [], signataires: [] };

function chargerEntrees() {
  document.querySelectorAll('.tab').forEach(function (t) {
    var actif = t.dataset.vue === 'entrees';
    t.classList.toggle('active', actif);
    t.setAttribute('aria-selected', actif ? 'true' : 'false');
  });
  $('liste').innerHTML = '<p class="vide">Chargement…</p>';
  api({ action: 'adminEntrees', email: SESSION.email, token: SESSION.token }, function (res) {
    if (!res || !res.ok) { $('liste').innerHTML = '<div class="alerte">' + esc((res && res.error) || 'Erreur') + '</div>'; return; }
    ENTREES = res;
    rendreEntrees();
  });
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

  var t = $('tab-entrees');
  t.textContent = 'Nouveaux dossiers' + (aTraiter.length ? ' (' + aTraiter.length + ')' : '');
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
    (e.codeDossier ? ' · dossier <b>' + esc(e.codeDossier) + '</b>' : '') +
    (e.drive ? ' · <a href="' + esc(e.drive) + '" target="_blank" rel="noopener">pièces</a>' : '');

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
      '<label>Honoraires € HT <input type="number" id="ch-' + ligne + '" style="width:96px;"></label>' +
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

function allerAuDossier(denomination) {
  changerVue('dossiers');
  $('q').value = denomination;
  rendre();
  var t = document.querySelector('tr.ligne');
  if (t) t.click();
}

function creerDossier(ligne, btn) {
  var msg = btn.parentNode.querySelector('.maj');
  btn.disabled = true; btn.textContent = 'Création…';
  api({ action: 'adminCreerDossier', email: SESSION.email, token: SESSION.token, ligne: ligne,
        code: $('cd-' + ligne).value, associe: $('ca-' + ligne).value,
        collaborateur: $('cc-' + ligne).value, honoraires: $('ch-' + ligne).value },
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
      $('apercu-corps').srcdoc = res.html;
      $('apercu-dest').textContent = res.destinataire || '(email du confrère manquant)';
      $('apercu-modale').style.display = 'flex';
      $('apercu-fermer').focus();
    });
}

function fermerApercu() { $('apercu-modale').style.display = 'none'; }

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
