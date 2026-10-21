/*
 * Datenexplorer-Lader: ersetzt den Platzhalter [data-datenexplorer] durch die
 * eingebettete htmlwidgets-App. Die Einbettungsdatei (JSON) liegt bei der App:
 *   { "css": ["lib/…css"], "js": ["lib/…js"], "html": "<div id=…>…</div>" }
 * Pfade darin sind relativ zur App-Adresse (data-quelle).
 *
 * Mit data-kurz (Konfiguration «kurzansicht») erscheint zuerst eine schlichte
 * Startansicht ({ "css", "js", "daten" }, gezeichnet von window.GWKurzansicht);
 * der volle Datenexplorer laedt erst auf Klick - oder sofort, wenn der Link
 * eine Ansicht nennt (#…).
 */
(function () {
  'use strict';

  // Geteilter Bericht (#…ber=1…): sofort eine Ladeanzeige ueber die Seite; die App uebernimmt sie
  // (gleiche Klassen wie GWDatenexplorer.berichtLaden in der App)
  function berichtLaden() {
    if (!/[#&]ber=1(&|$)/.test(window.location.hash) || document.querySelector('.gw-bericht')) return;
    var st = document.createElement('style');
    st.id = 'gw-bericht-stil';
    st.textContent = '.gw-bericht{position:fixed;inset:0;z-index:2147483000;background:#eef1ee;display:flex;flex-direction:column;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}' +
      '.gw-bericht-laden{margin:auto;display:flex;flex-direction:column;align-items:center;gap:18px;color:#2f4f47;font-size:16px}' +
      '.gw-bericht-rad{position:relative;width:56px;height:56px;animation:gw-drehen 1.1s steps(8) infinite}' +
      '.gw-bericht-rad i{position:absolute;left:24px;top:0;width:8px;height:8px;border-radius:50%;background:#2f6f5e;transform-origin:4px 28px}' +
      '@keyframes gw-drehen{to{transform:rotate(360deg)}}@media (prefers-reduced-motion:reduce){.gw-bericht-rad{animation-duration:4s}}';
    document.head.appendChild(st);
    var d = document.createElement('div'), rad = '';
    d.className = 'gw-bericht';
    for (var i = 0; i < 8; i++) rad += '<i style="transform:rotate(' + (i * 45) + 'deg);opacity:' + (0.2 + i * 0.1).toFixed(1) + '"></i>';
    d.innerHTML = '<div class="gw-bericht-laden" role="status"><div class="gw-bericht-rad" aria-hidden="true">' + rad + '</div><span>Bericht wird aufgebaut …</span></div>';
    document.body.appendChild(d);
  }
  if (document.body) berichtLaden(); else document.addEventListener('DOMContentLoaded', berichtLaden);

  function ladeSkript(src) {
    return new Promise(function (ok, fehler) {
      var s = document.createElement('script');
      s.src = src;
      s.async = false;
      s.onload = function () { ok(); };
      s.onerror = function () { fehler(new Error('Skript nicht geladen: ' + src)); };
      document.head.appendChild(s);
    });
  }

  function ladeCss(href) {
    var l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = href;
    document.head.appendChild(l);
  }

  function fehlerAnzeigen(el, basis) {
    var status = el.querySelector('.datenexplorer-status');
    if (!status) {
      status = document.createElement('p');
      status.className = 'datenexplorer-status';
      el.appendChild(status);
    }
    status.textContent = (el.getAttribute('data-text-fehler') || 'Die interaktive Ansicht konnte nicht geladen werden.') + ' ';
    var a = document.createElement('a');
    a.href = basis;
    a.textContent = el.getAttribute('data-text-fenster') || 'In eigenem Fenster öffnen';
    status.appendChild(a);
  }

  // Zurzeit nicht erreichbar (laut Status-Seite des Plugins agff-status oder nach Zeitlimit):
  // freundlicher Hinweis, die lokale Karte bleibt sichtbar, Link zum Status der Apps
  // Vorschaubild (bei Startansicht nur vorgemerkt, data-src) jetzt laden
  function vorschauZeigen(el) {
    var img = el.querySelector('img.datenexplorer-vorschau[data-src]');
    if (!img) return;
    img.src = img.getAttribute('data-src');
    img.removeAttribute('data-src');
    img.hidden = false;
  }

  function offlineAnzeigen(el) {
    if (el.classList.contains('datenexplorer--bereit')) return;
    vorschauZeigen(el);
    el.classList.add('datenexplorer--offline');
    var status = el.querySelector('.datenexplorer-status') || document.createElement('p');
    status.className = 'datenexplorer-status';
    el.insertBefore(status, el.firstChild);   // Hinweis ueber der Karte
    status.textContent = (el.getAttribute('data-text-offline') || 'Der Datenexplorer ist zurzeit nicht erreichbar.') + ' ';
    if (window.AGFF_STATUS && window.AGFF_STATUS.seite) {
      var a = document.createElement('a');
      a.href = window.AGFF_STATUS.seite;
      a.textContent = el.getAttribute('data-text-status') || 'Status der Apps';
      status.appendChild(a);
    }
  }

  function starte(el) {
    var basis = el.getAttribute('data-quelle') || '';
    if (basis && !/\/$/.test(basis)) basis += '/';
    var datei = el.getAttribute('data-einbettung') || 'Datenexplorer_einbettung.json';
    var kurz = el.getAttribute('data-kurz') || '';
    // Fuer die App: Adresse fuer nachgeladene Dateien, Einbettungsmodus
    window.GW_DATENEXPLORER_BASIS = basis;
    window.GW_DATENEXPLORER_EINGEBETTET = true;

    // Parallel den Status pruefen (graswachstum.ch, schnell): meldet er die App als gestoert, sofort Hinweis
    if (window.AGFF_STATUS && window.AGFF_STATUS.json && window.fetch) {
      fetch(window.AGFF_STATUS.json, { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (d) {
        var x = (d.dienste || []).filter(function (s) { return s.id === 'datenexplorer'; })[0];
        if (x && x.ok === false) offlineAnzeigen(el);
      }).catch(function () {});
    }
    // Nur solange die App gar nicht antwortet (langsame Verbindungen laden danach noch Skripte)
    var geantwortet = false;
    var zeitlimit = setTimeout(function () { if (!geantwortet) offlineAnzeigen(el); }, 15000);

    // Einmal wiederholen: ein abgebrochener erster Verbindungsaufbau soll
    // nicht gleich die Fehlermeldung zeigen.
    function holeJson(name, versuch) {
      return fetch(new URL(name, basis).href, { cache: 'no-cache' })
        .then(function (r) {
          geantwortet = true;
          if (!r.ok) throw new Error(name + ' nicht gefunden (' + r.status + ')');
          return r.json();
        })
        .catch(function (err) {
          if (versuch > 0) throw err;
          return new Promise(function (ok) { setTimeout(ok, 1500); }).then(function () { return holeJson(name, 1); });
        });
    }
    function ladeDateien(b) {
      (b.css || []).forEach(function (c) { ladeCss(new URL(c, basis).href); });
      return (b.js || []).reduce(function (kette, src) {
        return kette.then(function () { return ladeSkript(new URL(src, basis).href); });
      }, Promise.resolve());
    }
    function nurNoch(kind) {
      clearTimeout(zeitlimit);
      el.classList.remove('datenexplorer--offline');
      Array.prototype.slice.call(el.children).forEach(function (k) { if (k !== kind) k.remove(); });
      kind.hidden = false;
      el.classList.add('datenexplorer--bereit');
    }

    // Voller Datenexplorer: Einbettung holen und Skripte laden (einmal, auch
    // schon beim Zeigen auf einen Knopf der Startansicht), dann einsetzen
    var vorbereitet = null;
    function vorbereiten() {
      if (!vorbereitet) {
        vorbereitet = holeJson(datei, 0).then(function (b) {
          return ladeDateien(b).then(function () { return b; });
        });
        vorbereitet.catch(function () { vorbereitet = null; });
      }
      return vorbereitet;
    }
    function voll(hash) {
      if (hash) {
        try { history.replaceState(history.state, '', window.location.pathname + window.location.search + hash); } catch (e) { window.location.hash = hash; }
      }
      return vorbereiten().then(function (b) {
        var huelle = document.createElement('div');
        huelle.className = 'datenexplorer-app';
        huelle.hidden = true;
        huelle.innerHTML = b.html || '';
        el.appendChild(huelle);
        nurNoch(huelle);
        if (kurz) {
          // Zurueck zur schlichten Ansicht: Seite ohne Ansicht im Link neu laden
          var zurueck = document.createElement('p');
          zurueck.className = 'datenexplorer-zurueck';
          var a = document.createElement('a');
          a.href = window.location.pathname + window.location.search;
          a.textContent = el.getAttribute('data-text-schlicht') || 'Schlichte Ansicht';
          a.addEventListener('click', function (ev) { ev.preventDefault(); window.location.href = a.href; });
          zurueck.appendChild(a);
          el.insertBefore(zurueck, huelle);
        }
        if (window.HTMLWidgets && window.HTMLWidgets.staticRender) window.HTMLWidgets.staticRender();
        if (hash !== undefined) {
          var oben = el.getBoundingClientRect().top;
          if (oben < 0 || oben > window.innerHeight * 0.5) el.scrollIntoView({ block: 'start' });
        }
      });
    }
    function vollFehler(err) {
      console.error('Datenexplorer:', err);
      clearTimeout(zeitlimit);
      if (window.AGFF_STATUS) offlineAnzeigen(el); else fehlerAnzeigen(el, basis);
    }

    // Startansicht (schlicht, wenige KB), solange der Link keine Ansicht nennt (#ebene=…, #ber=1 …)
    var mitAnsicht = /^#./.test(window.location.hash || '');
    if (kurz && !mitAnsicht) {
      holeJson(kurz, 0)
        .then(function (b) {
          return ladeDateien(b).then(function () {
            if (!window.GWKurzansicht) throw new Error('Startansicht fehlt');
            var huelle = document.createElement('div');
            huelle.className = 'datenexplorer-kurz';
            huelle.hidden = true;
            el.appendChild(huelle);
            window.GWKurzansicht.zeige(huelle, b.daten, {
              basis: basis,
              sprache: el.getAttribute('data-sprache') || document.documentElement.lang || 'de',
              vorladen: function () { vorbereiten().catch(function () {}); },
              voll: function (hash) {
                return voll(hash).catch(function (err) {
                  console.error('Datenexplorer:', err);
                  var st = document.createElement('p');
                  st.className = 'datenexplorer-status';
                  st.textContent = el.getAttribute('data-text-fehler') || 'Die interaktive Ansicht konnte nicht geladen werden.';
                  huelle.insertBefore(st, huelle.firstChild);
                  throw err;
                });
              }
            });
            nurNoch(huelle);
          });
        })
        .catch(function (err) {
          // Ohne Startansicht wie bisher direkt den vollen Datenexplorer
          console.warn('Datenexplorer-Startansicht:', err);
          if (!el.classList.contains('datenexplorer--bereit')) { vorschauZeigen(el); voll().catch(vollFehler); }
        });
    } else {
      vorschauZeigen(el);
      voll().catch(vollFehler);
    }
  }

  function init() {
    var el = document.querySelector('[data-datenexplorer]');
    if (el) starte(el);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
