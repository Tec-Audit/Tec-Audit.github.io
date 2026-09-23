/* pieces.js — commun aux formulaires « constitution » et « nouveau-client ».
 *
 * Trois choses que chaque formulaire faisait de son côté, et que les premiers
 * clients ont relevées :
 *   1. Choisir ses pièces en plusieurs fois. Un <input type="file"> remplace sa
 *      sélection à chaque ouverture : la photo du verso effaçait celle du recto.
 *   2. Alléger les photos avant l'envoi. Une photo de téléphone pèse 3 à 5 Mo ;
 *      ramenée à 2 200 px de côté, elle reste parfaitement lisible pour quelques
 *      centaines de Ko. C'était l'essentiel des 30 secondes d'attente.
 *   3. Montrer que l'envoi avance, et dire clairement s'il a abouti.
 *
 * Pas de pourcentage d'envoi réel : suivre la progression d'un envoi oblige le
 * navigateur à une requête préalable que Google Apps Script ne sait pas traiter.
 * On affiche donc les étapes, et un compteur qui prouve que rien n'est figé.
 */
(function () {
  'use strict';

  var COTE_MAX = 2200;           // px, côté le plus long après allègement
  var QUALITE = 0.82;            // JPEG
  var SEUIL = 350 * 1024;        // en dessous, une image part telle quelle
  var MAX_TOTAL = 20 * 1024 * 1024;

  function taille(o) {
    if (o < 1024 * 1024) return Math.max(1, Math.round(o / 1024)) + ' Ko';
    return (o / (1024 * 1024)).toFixed(1).replace('.', ',') + ' Mo';
  }

  // ── 1. Sélection cumulative ─────────────────────────────────
  function cle(f) { return f.name + '|' + f.size + '|' + f.lastModified; }

  function fixer(input, liste) {
    input._cumul = liste;
    try {
      var dt = new DataTransfer();
      liste.forEach(function (f) { dt.items.add(f); });
      input.files = dt.files;
    } catch (e) { /* navigateur ancien : la dernière sélection seule est conservée */ }
  }

  function afficher(pid) {
    var input = document.getElementById('file-' + pid);
    if (!input) return;
    var zone = document.getElementById(pid + '-names');
    var texte = document.getElementById(pid + '-text');
    var liste = input._cumul || Array.prototype.slice.call(input.files || []);
    if (texte) texte.textContent = liste.length ? '+ Ajouter un fichier' : 'Choisir les fichiers';
    if (!zone) return;
    zone.innerHTML = '';
    liste.forEach(function (f, i) {
      var ligne = document.createElement('span');
      ligne.className = 'tp-fichier';
      ligne.appendChild(document.createTextNode('✓ ' + f.name + ' '));
      var poids = document.createElement('small');
      poids.textContent = '(' + taille(f.size) + ')';
      ligne.appendChild(poids);
      var x = document.createElement('button');
      x.type = 'button';
      x.className = 'tp-retirer';
      x.title = 'Retirer ce fichier';
      x.setAttribute('aria-label', 'Retirer ' + f.name);
      x.textContent = '×';
      x.onclick = function (ev) { ev.preventDefault(); retirer(pid, i); };
      ligne.appendChild(x);
      zone.appendChild(ligne);
    });
  }

  function retirer(pid, i) {
    var input = document.getElementById('file-' + pid);
    if (!input) return;
    var liste = (input._cumul || Array.prototype.slice.call(input.files || [])).slice();
    liste.splice(i, 1);
    fixer(input, liste);
    afficher(pid);
  }

  // Appelée par chaque champ de pièce (onchange) et après une reconstruction de
  // la liste. Un champ neuf n'a pas d'historique : il reprend alors exactement
  // ce qu'on lui a donné, sans doublon.
  function updateFileLabel(pid) {
    var input = document.getElementById('file-' + pid);
    if (!input) return;
    var avant = input._cumul || [];
    var nouveaux = Array.prototype.slice.call(input.files || []);
    var vus = {}, liste = [];
    avant.concat(nouveaux).forEach(function (f) {
      var k = cle(f);
      if (!vus[k]) { vus[k] = 1; liste.push(f); }
    });
    fixer(input, liste);
    afficher(pid);
  }

  // ── 2. Allègement des photos ────────────────────────────────
  // JPEG, PNG, WebP partout ; HEIC/HEIF là où le navigateur sait le lire (Safari).
  // Au moindre doute — format illisible, résultat plus lourd — l'original part.
  function alleger(file) {
    return new Promise(function (resolve) {
      if (!/^image\/(jpe?g|png|webp|heic|heif)$/i.test(file.type || '') || file.size < SEUIL) {
        resolve(file); return;
      }
      var url = URL.createObjectURL(file);
      var img = new Image();
      var fin = function (res) { try { URL.revokeObjectURL(url); } catch (e) {} resolve(res); };
      img.onload = function () {
        try {
          var w = img.naturalWidth, h = img.naturalHeight;
          if (!w || !h) { fin(file); return; }
          var r = Math.min(1, COTE_MAX / Math.max(w, h));
          var c = document.createElement('canvas');
          c.width = Math.round(w * r);
          c.height = Math.round(h * r);
          var ctx = c.getContext('2d');
          ctx.fillStyle = '#ffffff';              // une transparence deviendrait noire en JPEG
          ctx.fillRect(0, 0, c.width, c.height);
          ctx.drawImage(img, 0, 0, c.width, c.height);
          c.toBlob(function (b) {
            if (!b || b.size >= file.size) { fin(file); return; }
            var nom = String(file.name || 'photo').replace(/\.[^.]+$/, '') + '.jpg';
            try { fin(new File([b], nom, { type: 'image/jpeg', lastModified: file.lastModified })); }
            catch (e) { b.name = nom; fin(b); }
          }, 'image/jpeg', QUALITE);
        } catch (e) { fin(file); }
      };
      img.onerror = function () { fin(file); };
      img.src = url;
    });
  }

  function base64(blob) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(String(r.result).split(',')[1] || ''); };
      r.onerror = function () { reject(new Error('Lecture impossible : ' + (blob.name || 'fichier'))); };
      r.readAsDataURL(blob);
    });
  }

  // Une pièce après l'autre : décoder plusieurs photos de 12 Mpx à la fois
  // suffit à saturer la mémoire d'un téléphone.
  function preparer(pieces, suivi) {
    var out = [], i = 0, avant = 0, apres = 0;
    function suivant() {
      if (i >= pieces.length) return Promise.resolve({ fichiers: out, avant: avant, apres: apres });
      var p = pieces[i];
      if (suivi) suivi(i, pieces.length);
      return alleger(p.file).then(function (f) {
        avant += p.file.size;
        apres += f.size;
        return base64(f).then(function (data) {
          out.push({ categorie: p.categorie, nom: f.name || p.file.name,
                     mimeType: f.type || p.file.type || 'application/octet-stream', data: data });
          i++;
          return suivant();
        });
      });
    }
    return suivant();
  }

  // ── 3. Fenêtre d'envoi ──────────────────────────────────────
  var STYLE =
    '.tp-fichier{display:inline-flex;align-items:center;gap:4px;margin:3px 10px 0 0;font-size:12px}' +
    '.tp-fichier small{color:#777}' +
    '.tp-retirer{border:0;background:#eef1f6;color:#555;width:20px;height:20px;border-radius:50%;' +
      'cursor:pointer;font-size:14px;line-height:20px;padding:0;margin-left:2px}' +
    '.tp-retirer:hover{background:#fdecea;color:#c0392b}' +
    '#tp-voile{position:fixed;inset:0;background:rgba(22,33,62,.6);z-index:9000;display:flex;' +
      'align-items:center;justify-content:center;padding:20px}' +
    '#tp-boite{background:#fff;border-radius:8px;max-width:440px;width:100%;padding:26px 26px 22px;' +
      'box-shadow:0 20px 60px rgba(0,0,0,.3);font-family:Poppins,-apple-system,Segoe UI,sans-serif}' +
    '#tp-boite h3{font-size:17px;color:#0B316F;margin:0 0 16px;font-weight:600}' +
    '.tp-etape{display:flex;align-items:center;gap:11px;font-size:13.5px;color:#999;padding:6px 0}' +
    '.tp-etape.en-cours{color:#1c1c1c;font-weight:600}.tp-etape.faite{color:#2e7d32}' +
    '.tp-puce{width:20px;height:20px;border-radius:50%;border:2px solid #d4d8e0;flex-shrink:0;' +
      'display:flex;align-items:center;justify-content:center;font-size:11px}' +
    '.tp-etape.en-cours .tp-puce{border-color:#0E4194;border-top-color:transparent;animation:tp-tourne .8s linear infinite}' +
    '.tp-etape.faite .tp-puce{border-color:#2e7d32;background:#2e7d32;color:#fff}' +
    '.tp-detail{margin-left:auto;font-weight:400;color:#777;font-variant-numeric:tabular-nums}' +
    '.tp-barre{height:4px;background:#eef1f6;border-radius:2px;overflow:hidden;margin:14px 0 12px}' +
    '.tp-barre i{display:block;height:100%;width:35%;background:#0E4194;border-radius:2px;animation:tp-glisse 1.4s ease-in-out infinite}' +
    '.tp-note{font-size:12.5px;color:#5a6070;line-height:1.6;margin:0}' +
    '.tp-res{font-size:14px;line-height:1.6;margin:4px 0 16px}.tp-res.ok{color:#2e7d32}.tp-res.ko{color:#c0392b}' +
    '.tp-actions{display:flex;gap:9px;justify-content:flex-end;flex-wrap:wrap}' +
    '.tp-actions button{font:inherit;font-size:13px;font-weight:600;padding:9px 16px;border-radius:4px;cursor:pointer;' +
      'border:1px solid #0B316F;background:#fff;color:#0B316F}' +
    '.tp-actions button.tp-principal{background:#0B316F;color:#fff}' +
    '@keyframes tp-tourne{to{transform:rotate(360deg)}}' +
    '@keyframes tp-glisse{0%{margin-left:-35%}100%{margin-left:100%}}' +
    '@media (prefers-reduced-motion:reduce){.tp-etape.en-cours .tp-puce,.tp-barre i{animation:none}}';

  function injecterStyle() {
    if (document.getElementById('tp-style')) return;
    var s = document.createElement('style');
    s.id = 'tp-style';
    s.textContent = STYLE;
    (document.head || document.documentElement).appendChild(s);
  }

  var ETAPES = ['Préparation de vos pièces', 'Transmission sécurisée au cabinet', 'Confirmation de réception'];
  var chrono = null, debut = 0, garde = null;

  function ouvrir() {
    injecterStyle();
    fermer();
    var v = document.createElement('div');
    v.id = 'tp-voile';
    v.setAttribute('role', 'dialog');
    v.setAttribute('aria-modal', 'true');
    v.setAttribute('aria-labelledby', 'tp-titre');
    v.innerHTML = '<div id="tp-boite"><h3 id="tp-titre">Transmission de votre dossier</h3>' +
      '<div id="tp-etapes">' + ETAPES.map(function (t, i) {
        return '<div class="tp-etape" id="tp-e' + i + '"><span class="tp-puce"></span><span>' + t +
               '</span><span class="tp-detail" id="tp-d' + i + '"></span></div>';
      }).join('') + '</div>' +
      '<div class="tp-barre" id="tp-barre"><i></i></div>' +
      '<p class="tp-note" id="tp-note" aria-live="polite">Ne fermez pas cette page. ' +
        'L’envoi prend généralement moins d’une minute.</p>' +
      '<div id="tp-fin" hidden></div></div>';
    document.body.appendChild(v);
    // Quitter pendant l'envoi ferait perdre la transmission en cours.
    garde = function (e) { e.preventDefault(); e.returnValue = ''; return ''; };
    window.addEventListener('beforeunload', garde);
  }

  function etape(n, detail) {
    for (var i = 0; i < ETAPES.length; i++) {
      var e = document.getElementById('tp-e' + i);
      if (!e) continue;
      e.className = 'tp-etape' + (i < n ? ' faite' : i === n ? ' en-cours' : '');
      e.querySelector('.tp-puce').textContent = i < n ? '✓' : '';
    }
    var d = document.getElementById('tp-d' + n);
    if (d && detail != null) d.textContent = detail;
  }

  function lancerChrono(n) {
    arreterChrono();
    debut = Date.now();
    var d = document.getElementById('tp-d' + n);
    chrono = setInterval(function () {
      var s = Math.round((Date.now() - debut) / 1000);
      if (d) d.textContent = s + ' s';
      var note = document.getElementById('tp-note');
      if (note && s === 45) {
        note.textContent = 'Toujours en cours : les pièces volumineuses ou une connexion lente allongent ' +
          'le délai. Ne fermez pas cette page, le cabinet n’a pas encore répondu.';
      }
    }, 1000);
  }
  function arreterChrono() { if (chrono) { clearInterval(chrono); chrono = null; } }

  function terminer(ok, html, boutons) {
    arreterChrono();
    if (garde) { window.removeEventListener('beforeunload', garde); garde = null; }
    if (ok) etape(ETAPES.length);
    var barre = document.getElementById('tp-barre'), note = document.getElementById('tp-note');
    if (barre) barre.hidden = true;
    if (note) note.hidden = true;
    var fin = document.getElementById('tp-fin');
    if (!fin) return;
    fin.hidden = false;
    fin.innerHTML = '<p class="tp-res ' + (ok ? 'ok' : 'ko') + '">' + html + '</p><div class="tp-actions"></div>';
    var zone = fin.querySelector('.tp-actions');
    (boutons || []).forEach(function (b) {
      var el = document.createElement('button');
      el.type = 'button';
      el.textContent = b.texte;
      if (b.principal) el.className = 'tp-principal';
      el.onclick = b.action;
      zone.appendChild(el);
    });
    var premier = zone.querySelector('button');
    if (premier) premier.focus();
  }

  function fermer() {
    arreterChrono();
    if (garde) { window.removeEventListener('beforeunload', garde); garde = null; }
    var v = document.getElementById('tp-voile');
    if (v && v.parentNode) v.parentNode.removeChild(v);
  }

  // Enchaîne tout : allègement, contrôle du volume, récapitulatif PDF, envoi.
  //   opts.pieces    [{ file, categorie }]
  //   opts.recapPdf  fonction renvoyant le Blob du récapitulatif (facultatif)
  //   opts.envoyer   function (fichiers, pdfBase64, rappel) — appelle le serveur
  //   opts.reussite  function (res)           — mise à jour du formulaire
  //   opts.echec     function ()              — rendre la main (bouton réactivé)
  function transmettre(opts) {
    ouvrir();
    etape(0, opts.pieces.length ? '0 / ' + opts.pieces.length : '');

    preparer(opts.pieces, function (i, n) { etape(0, (i + 1) + ' / ' + n); })
      .then(function (prep) {
        var total = prep.fichiers.reduce(function (s, f) { return s + f.data.length * 0.75; }, 0);
        if (total > MAX_TOTAL) {
          var err = new Error('Vos pièces pèsent encore ' + taille(total) + ' après allègement, au-delà des 20 Mo ' +
            'acceptés. Retirez les plus lourdes — souvent des PDF scannés — et envoyez-les-nous par email.');
          err.volume = true;
          throw err;
        }
        etape(0, prep.fichiers.length ? prep.fichiers.length + ' pièce' + (prep.fichiers.length > 1 ? 's' : '') +
          ' · ' + taille(total) : '—');
        var pdf = Promise.resolve(null);
        if (opts.recapPdf) {
          try { var blob = opts.recapPdf(); if (blob) pdf = base64(blob).catch(function () { return null; }); }
          catch (e) { if (window.console) console.warn('Récapitulatif PDF impossible :', e); }
        }
        return pdf.then(function (pdfB64) { return { fichiers: prep.fichiers, pdf: pdfB64 }; });
      })
      .then(function (pret) {
        etape(1, '0 s');
        lancerChrono(1);
        var t0 = Date.now();
        opts.envoyer(pret.fichiers, pret.pdf, function (res) {
          var duree = Math.round((Date.now() - t0) / 100) / 10;
          if (window.console) console.log('portail · envoi · ' + String(duree).replace('.', ',') + ' s' +
            (res && res.ms ? ' · serveur ' + JSON.stringify(res.ms) : ''));
          if (res && res.ok) {
            terminer(true, '✓ Le dossier est bien arrivé au cabinet. ' +
              'Un accusé de réception part par email.',
              [{ texte: 'Fermer', principal: true, action: function () { fermer(); if (opts.reussite) opts.reussite(res); } }]);
            return;
          }
          var msg = (res && res.error) || 'erreur du serveur';
          // Une coupure réseau ne dit pas si le serveur a reçu le dossier : renvoyer
          // à l'aveugle créerait un doublon.
          var reseau = /réseau|network|fetch/i.test(msg);
          terminer(false, (reseau
              ? 'La connexion a été interrompue pendant l’envoi. Le dossier est peut-être bien arrivé : ' +
                'vérifiez si l’accusé de réception est arrivé par email avant de renvoyer, pour éviter un doublon.'
              : 'L’envoi n’a pas abouti : ' + escHtml(msg) + '.') +
            '<br><small>Votre saisie est conservée. En cas de doute : 01 45 08 44 64.</small>',
            [{ texte: 'Fermer', action: function () { fermer(); if (opts.echec) opts.echec(); } },
             { texte: 'Réessayer', principal: true, action: function () { fermer(); if (opts.echec) opts.echec(); if (opts.reessayer) opts.reessayer(); } }]);
        });
      })
      .catch(function (err) {
        terminer(false, escHtml(err && err.message ? err.message : 'Préparation de l’envoi impossible.') +
          (err && err.volume ? '' : '<br><small>Votre saisie est conservée. En cas de doute : 01 45 08 44 64.</small>'),
          [{ texte: 'Fermer', principal: true, action: function () { fermer(); if (opts.echec) opts.echec(); } }]);
      });
  }

  function escHtml(t) {
    return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  // Les pièces choisies dans une liste de champs, prêtes pour transmettre().
  function piecesDe(champs) {
    var out = [];
    champs.forEach(function (c) {
      var input = document.getElementById(c.id);
      var liste = input ? (input._cumul || Array.prototype.slice.call(input.files || [])) : [];
      liste.forEach(function (f) { out.push({ file: f, categorie: c.categorie }); });
    });
    return out;
  }

  injecterStyle();
  window.updateFileLabel = updateFileLabel;
  window.TecPieces = { transmettre: transmettre, piecesDe: piecesDe, fermer: fermer,
                       alleger: alleger, taille: taille, updateFileLabel: updateFileLabel };
})();
