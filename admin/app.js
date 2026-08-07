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
      if (res.role === 'associe') $('tab-lettres').style.display = '';
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
  if (VUE === 'lettres') return;
  var L = lignesFiltrees();
  var contacts = {};
  L.forEach(function (l) { contacts[val(l, 'Email') || '(sans email)'] = 1; });

  $('stats').innerHTML = stat(L.length, 'dossiers') + stat(Object.keys(contacts).length, 'contacts');

  rendreDonut(L);
  if (VUE === 'contacts') rendreContacts(L); else rendreDossiers(L);
}

// ── Répartition par type d'entité : anneau SVG cliquable ──
var COULEURS = ['#0E4194', '#4E7FD0', '#93B3E8', '#16213E', '#B45309', '#2E7D32', '#6B7A99', '#C8A84B'];

function rendreDonut(L) {
  var formes = {};
  L.forEach(function (l) {
    var f = normForme(val(l, 'Forme'));
    formes[f] = (formes[f] || 0) + 1;
  });
  var cles = Object.keys(formes).sort(function (a, b) { return formes[b] - formes[a]; });
  // Top 7 + « Autres » regroupés pour garder l'anneau lisible
  var top = cles.slice(0, 7);
  var autres = cles.slice(7).reduce(function (s, k) { return s + formes[k]; }, 0);
  var parts = top.map(function (f, i) { return { nom: f, n: formes[f], c: COULEURS[i] }; });
  if (autres > 0) parts.push({ nom: 'Autres', n: autres, c: '#B8C0CE' });

  var total = L.length || 1;
  var actif = $('f-forme').value ? normForme($('f-forme').value) : '';
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
      ' style="cursor:pointer;transition:stroke-width .15s ease;"' +
      ' onclick="filtrerForme(\'' + p.nom.replace(/'/g, "\\'") + '\')">' +
      '<title>' + esc(p.nom) + ' : ' + p.n + '</title></circle>';
    offset += frac;
    return seg;
  }).join('');

  var legende = parts.map(function (p) {
    var estActif = actif && actif === normForme(p.nom);
    return '<button class="leg' + (estActif ? ' actif' : '') + '" aria-pressed="' + (estActif ? 'true' : 'false') +
      '" onclick="filtrerForme(\'' + p.nom.replace(/'/g, "\\'") + '\')">' +
      '<i style="background:' + p.c + '"></i>' + esc(p.nom) +
      '<b>' + p.n + '</b><span>' + Math.round(p.n / total * 100) + '%</span></button>';
  }).join('');

  $('dashboard').innerHTML =
    '<div class="dash-titre">Répartition par type d\u2019entité' +
    (actif ? ' <button class="dash-reset" onclick="filtrerForme($(\'f-forme\').value)">✕ réinitialiser</button>' : '') +
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
    ['Honoraires', val(l, 'Honoraires HT') ? val(l, 'Honoraires HT') + ' € HT / ' + val(l, 'Périodicité') : ''],
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
  '</div>';
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
  var horsDossiers = (v === 'lettres');
  document.querySelector('.apercu').style.display = horsDossiers ? 'none' : '';
  document.querySelector('.bar').style.display = horsDossiers ? 'none' : '';
  if (v === 'lettres') { chargerLettres(); }
  document.querySelectorAll('.tab').forEach(function (t) {
    var actif = t.dataset.vue === v;
    t.classList.toggle('active', actif);
    t.setAttribute('aria-selected', actif ? 'true' : 'false');
  });
  rendre();
}

// ── Lettres confraternelles (associés) ───────────────────────
var LETTRES = { colonnes: [], lignes: [], signataires: [] };

function chargerLettres() {
  document.querySelectorAll('.tab').forEach(function (t) {
    var actif = t.dataset.vue === 'lettres';
    t.classList.toggle('active', actif);
    t.setAttribute('aria-selected', actif ? 'true' : 'false');
  });
  $('liste').innerHTML = '<p class="vide">Chargement…</p>';
  api({ action: 'adminLettres', email: SESSION.email, token: SESSION.token }, function (res) {
    if (!res || !res.ok) { $('liste').innerHTML = '<div class="alerte">' + esc((res && res.error) || 'Erreur') + '</div>'; return; }
    LETTRES = res;
    rendreLettres();
  });
}

function lv(l, col) { return l[LETTRES.colonnes.indexOf(col)] || ''; }

function rendreLettres() {
  var L = LETTRES.lignes.slice().reverse();
  if (!L.length) {
    $('liste').innerHTML = '<p class="vide">Aucune lettre confraternelle en attente — la file se remplit automatiquement quand un nouveau client déclare un expert-comptable actuel.</p>';
    return;
  }
  $('liste').innerHTML = L.map(function (l) {
    var ligne = l[l.length - 1];
    var statut = lv(l, 'Statut');
    var aEmettre = statut === 'À émettre';
    var envoyee = statut.indexOf('Envoyée') === 0;
    var cls = aEmettre ? 'warn' : (statut.indexOf('OBJECTION') > -1 ? 'warn' : (envoyee ? 'envoyee' : 'ok'));
    var hono = lv(l, 'Honoraires confrère');
    var honoTxt = { oui: 'réglés', non: '⚠ pas encore réglés', litige: '⚠ EN LITIGE' }[hono] || hono || 'n.c.';
    return '<div class="lettre">' +
      '<div class="lettre-head"><div><strong>' + esc(lv(l, 'Dénomination')) + '</strong>' +
      '<div class="lettre-meta">Demandé le ' + esc(lv(l, 'Date demande')) + ' · client : ' + esc(lv(l, 'Email client')) + '</div></div>' +
      '<span class="tag ' + cls + '">' + esc(statut) + '</span></div>' +
      '<div class="lettre-meta">' +
      'Confrère : <b>' + esc(lv(l, 'Cabinet confrère') || '—') + '</b>' +
      (lv(l, 'Confrère') ? ' (' + esc(lv(l, 'Confrère')) + ')' : '') +
      ' · ' + esc(lv(l, 'Email confrère') || 'email manquant ⚠') +
      '<br>Dernier exercice traité : ' + esc(lv(l, 'Dernier exercice') || 'n.c.') +
      ' · Honoraires du confrère : ' + esc(honoTxt) +
      (lv(l, 'Envoyée le') ? '<br>Envoyée le ' + esc(lv(l, 'Envoyée le')) + ' — échéance accord tacite : ' + esc(lv(l, 'Échéance accord tacite')) : '') +
      '</div>' +
      (aEmettre ?
        '<div class="lettre-actions">Signataire : <select id="sig-' + ligne + '">' +
        LETTRES.signataires.map(function (s) { return '<option>' + esc(s) + '</option>'; }).join('') +
        '</select><button class="btn-rep" onclick="apercuLettre(' + ligne + ', this)">👁 Aperçu</button>' +
        '<button class="btn-envoyer" onclick="envoyerLettre(' + ligne + ', this)">📨 Envoyer la lettre</button>' +
        '<span class="maj" role="status" aria-live="polite"></span></div>' : '') +
      (envoyee ?
        '<div class="lettre-actions">Le confrère a répondu ? ' +
        '<button class="btn-rep" onclick="reponseLettre(' + ligne + ', false, this)">✓ Sans objection</button>' +
        '<button class="btn-rep" onclick="reponseLettre(' + ligne + ', true, this)">⚠ Objection</button>' +
        '<span class="maj" role="status" aria-live="polite"></span></div>' : '') +
      '</div>';
  }).join('');
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
  msg.textContent = '⏳ Envoi en cours (génération du PDF, cela peut prendre quelques secondes)…';
  msg.className = 'maj';

  var repondu = false;
  // Filet de sécurité : si le serveur ne répond pas, on le dit au lieu de rester figé
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
        msg.textContent = '✓ Lettre envoyée et archivée dans Drive.';
        msg.className = 'maj ok';
        alert('✓ Lettre envoyée au confrère, signée ' + sig + '.\nLe PDF est archivé dans le dossier Drive du client.');
        chargerLettres();
      } else {
        btn.disabled = false; btn.textContent = '📨 Envoyer la lettre';
        var txt = (res && res.error) || 'erreur inconnue';
        msg.textContent = '⚠ ' + txt;
        msg.className = 'maj ko';
        alert('⚠ Envoi impossible\n\n' + txt);
      }
    });
}

function reponseLettre(ligne, objection, btn) {
  btn.disabled = true;
  api({ action: 'adminLettreReponse', email: SESSION.email, token: SESSION.token, ligne: ligne, objection: objection },
    function (res) {
      if (res && res.ok) { chargerLettres(); }
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
