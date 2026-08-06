// ══════════════════════════════════════════════════════════════
//  TEC AUDIT — Espace interne : logique applicative
// ══════════════════════════════════════════════════════════════
var APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwbTEFCrnTOjmhycGdb1ShTln6ntnAi-cSeFyPbmIjqoxBqBZRlKwMc44uJev8Q8HI/exec';

var SESSION = { email: '', nom: '', role: '', token: '' };
var DATA = { colonnes: [], lignes: [], idx: {} };
var VUE = 'contacts';

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
  var L = lignesFiltrees();
  var contacts = {};
  L.forEach(function (l) { contacts[val(l, 'Email') || '(sans email)'] = 1; });

  $('stats').innerHTML = stat(L.length, 'dossiers') + stat(Object.keys(contacts).length, 'contacts');

  // Dashboard par type d'entité (forme juridique), cliquable pour filtrer
  var formes = {};
  L.forEach(function (l) {
    var f = normForme(val(l, 'Forme'));
    formes[f] = (formes[f] || 0) + 1;
  });
  var cles = Object.keys(formes).sort(function (a, b) { return formes[b] - formes[a]; });
  var actif = $('f-forme').value;
  $('dashboard').innerHTML = '<div class="dash-titre">Répartition par type d\u2019entité</div>' +
    '<div class="dash-row">' + cles.map(function (f) {
      var pct = Math.round(formes[f] / L.length * 100);
      return '<div class="dash-item' + (normForme(actif) === f ? ' actif' : '') + '" onclick="filtrerForme(\'' +
        f.replace(/'/g, "\\'") + '\')">' +
        '<div class="dash-n">' + formes[f] + '</div>' +
        '<div class="dash-f">' + esc(f) + '</div>' +
        '<div class="dash-bar"><i style="width:' + pct + '%"></i></div>' +
        '<div class="dash-p">' + pct + '\u00a0%</div></div>';
    }).join('') + '</div>';

  if (VUE === 'contacts') rendreContacts(L); else rendreDossiers(L);
}

// Regroupe les variantes d'écriture : S.A.R.L. / SARL / Sarl → SARL
function normForme(f) {
  var s = String(f || '').toUpperCase().replace(/[.\s]/g, '');
  if (!s) return 'Non renseignée';
  if (s.indexOf('SARL') === 0 || s.indexOf('EURL') === 0) return s.indexOf('EURL') === 0 ? 'EURL' : 'SARL';
  if (s.indexOf('SASU') === 0) return 'SASU';
  if (s.indexOf('SAS') === 0) return 'SAS';
  if (s.indexOf('SCI') === 0) return 'SCI';
  if (s.indexOf('SELARL') === 0 || s.indexOf('SELAS') === 0) return 'SEL';
  if (s.indexOf('SCP') === 0 || s.indexOf('SCM') === 0) return s.slice(0, 3);
  if (s.indexOf('SA') === 0 && s.length <= 3) return 'SA';
  if (s.indexOf('EI') === 0 || s.indexOf('ENTREPRENEUR') === 0) return 'Entreprise individuelle';
  if (s.indexOf('ASSOC') === 0) return 'Association';
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
    return '<div class="contact" onclick="this.classList.toggle(\'open\')">' +
      '<div class="contact-head">' +
        '<div><div class="contact-nom">' + esc(nom) + '</div>' +
        '<div class="contact-mail">' + esc(e) + (val(p, 'Mobile') ? ' · ' + esc(val(p, 'Mobile')) : '') + '</div></div>' +
        '<div class="contact-count">' + g.length + ' dossier' + (g.length > 1 ? 's' : '') + '</div>' +
      '</div>' +
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

  var comm = [val(l, 'Marqueur'), val(l, 'Commentaire attribution'), val(l, 'Commentaire collaborateur')]
    .filter(Boolean).join(' · ');

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
    }).join('') + '</select><span class="maj"></span></div>';
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

function rendreDossiers(L) {
  var cols = ['Code dossier', 'Dénomination', 'Forme', 'Ville', 'Nom', 'Email',
              'Collaborateur', 'Associé responsable', 'Statut LDM', 'Périmètre'];
  var html = '<div class="table-wrap"><table><thead><tr>' +
    cols.map(function (c) { return '<th>' + esc(c) + '</th>'; }).join('') +
    '</tr></thead><tbody>' +
    L.slice(0, 500).map(function (l) {
      return '<tr>' + cols.map(function (c) { return '<td>' + esc(val(l, c)) + '</td>'; }).join('') + '</tr>';
    }).join('') + '</tbody></table></div>' +
    (L.length > 500 ? '<p class="vide">500 premiers résultats affichés sur ' + L.length + ' — affinez la recherche.</p>' : '');
  $('liste').innerHTML = L.length ? html : '<p class="vide">Aucun résultat.</p>';
}

function changerVue(v) {
  VUE = v;
  document.querySelectorAll('.tab').forEach(function (t) { t.classList.toggle('active', t.dataset.vue === v); });
  rendre();
}

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
  ['f-perimetre', 'f-associe', 'f-collab', 'f-ldm', 'f-forme'].forEach(function (id) {
    $(id).addEventListener('change', rendre);
  });
});
