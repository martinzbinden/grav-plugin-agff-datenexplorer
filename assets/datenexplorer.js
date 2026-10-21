/*
 * Datenexplorer-Lader: ersetzt den Platzhalter [data-datenexplorer] durch die
 * eingebettete htmlwidgets-App. Die Einbettungsdatei (JSON) liegt bei der App:
 *   { "css": ["lib/…css"], "js": ["lib/…js"], "html": "<div id=…>…</div>" }
 * Pfade darin sind relativ zur App-Adresse (data-quelle).
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
  function offlineAnzeigen(el) {
    if (el.classList.contains('datenexplorer--bereit')) return;
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
    // Fuer die App: Adresse fuer nachgeladene Dateien, Einbettungsmodus
    window.GW_DATENEXPLORER_BASIS = basis;
    window.GW_DATENEXPLORER_EINGEBETTET = true;

    // Einmal wiederholen: ein abgebrochener erster Verbindungsaufbau soll
    // nicht gleich die Fehlermeldung zeigen.
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

    function holeEinbettung(versuch) {
      return fetch(new URL(datei, basis).href, { cache: 'no-cache' })
        .then(function (r) {
          geantwortet = true;
          if (!r.ok) throw new Error('Einbettung nicht gefunden (' + r.status + ')');
          return r.json();
        })
        .catch(function (err) {
          if (versuch > 0) throw err;
          return new Promise(function (ok) { setTimeout(ok, 1500); }).then(function () { return holeEinbettung(1); });
        });
    }

    holeEinbettung(0)
      .then(function (b) {
        (b.css || []).forEach(function (c) { ladeCss(new URL(c, basis).href); });
        var huelle = document.createElement('div');
        huelle.className = 'datenexplorer-app';
        huelle.hidden = true;
        huelle.innerHTML = b.html || '';
        el.appendChild(huelle);
        return (b.js || []).reduce(function (kette, src) {
          return kette.then(function () { return ladeSkript(new URL(src, basis).href); });
        }, Promise.resolve()).then(function () { return huelle; });
      })
      .then(function (huelle) {
        clearTimeout(zeitlimit);
        el.classList.remove('datenexplorer--offline');
        Array.prototype.slice.call(el.children).forEach(function (k) { if (k !== huelle) k.remove(); });
        huelle.hidden = false;
        el.classList.add('datenexplorer--bereit');
        if (window.HTMLWidgets && window.HTMLWidgets.staticRender) window.HTMLWidgets.staticRender();
      })
      .catch(function (err) {
        console.error('Datenexplorer:', err);
        clearTimeout(zeitlimit);
        if (window.AGFF_STATUS) offlineAnzeigen(el); else fehlerAnzeigen(el, basis);
      });
  }

  function init() {
    var el = document.querySelector('[data-datenexplorer]');
    if (el) starte(el);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
