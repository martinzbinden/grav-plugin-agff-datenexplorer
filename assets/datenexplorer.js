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

  // Voller Datenexplorer: volle Breite (Klasse am Element) und kompakter Kopf (Klassen an <html>; auf dem Handy immer kompakt)
  function kompaktPruefen() {
    var r = document.documentElement;
    r.classList.toggle('datenexplorer-kompakt', r.classList.contains('datenexplorer-voll') || window.innerWidth <= 900);
  }
  function alsVoll(el) {
    el.classList.add('datenexplorer--voll');
    document.documentElement.classList.add('datenexplorer-voll');
    kompaktPruefen();
  }
  window.addEventListener('resize', kompaktPruefen);

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
        alsVoll(el);
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
    // Ohne Startansicht (oder Link mit Ansicht) ist es gleich der volle Datenexplorer: schon beim Laden in voller Breite
    if (!(kurz && !mitAnsicht)) alsVoll(el);
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

  // Lange offene Seite: Die Daten kommen jede Nacht neu, ein tagelang offener Tab zeigt sonst den alten Stand.
  // Nach 12 Stunden laedt die Seite neu (die Ansicht steckt im Link nach dem #, bleibt also erhalten) -
  // sofort, wenn der Tab im Hintergrund ist oder wieder angezeigt wird; im aktiven Tab erst, wenn
  // 2 Minuten nichts bedient wurde. Auch nach Standby (Timer stehen dann still) greift die Pruefung beim Zurueckkehren.
  var MAX_ALTER = 12 * 3600 * 1000, RUHE = 2 * 60 * 1000;
  function alterNeuladen() {
    var geladen = Date.now(), letzte = geladen;
    function bedient() { letzte = Date.now(); }
    ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'].forEach(function (ev) {
      window.addEventListener(ev, bedient, { passive: true, capture: true });
    });
    function pruefen() {
      if (Date.now() - geladen < MAX_ALTER) return;
      if (document.hidden || Date.now() - letzte > RUHE) window.location.reload();
    }
    setInterval(pruefen, 60 * 1000);
    document.addEventListener('visibilitychange', pruefen);
    window.addEventListener('online', pruefen);
  }

  // Kopfzeile und «Drehen» (Handy): Brotkrumen und Ueberschrift vor der App wandern in eine schmale Leiste, rechts der
  // Knopf «Drehen». Er zeigt die App im Querformat ueber den ganzen Schirm: wo der Browser es erlaubt (Android, iPad)
  // als echtes Vollbild mit Querformat-Sperre, sonst (iPhone) als Ersatz - die Ansicht wird per CSS um 90 Grad gedreht,
  // solange das Geraet im Hochformat steht. Auf dem Desktop bleibt alles beim Alten (Leiste: display: contents).
  function drehenEinrichten(el) {
    var eltern = el.parentNode;
    if (!eltern) return;
    var krume = function (k) { return /krume|breadcrumb/i.test(k.className || ''); };
    var vorn = [];
    for (var k = el.previousElementSibling; k; k = k.previousElementSibling) {
      if (k.tagName === 'H1' || ((k.tagName === 'P' || k.tagName === 'NAV' || k.tagName === 'OL') && krume(k))) vorn.unshift(k);
      else break;
    }
    var leiste = document.createElement('div');
    leiste.className = 'datenexplorer-kopf';
    var text = document.createElement('div');
    text.className = 'datenexplorer-kopf-text';
    leiste.appendChild(text);
    eltern.insertBefore(leiste, vorn.length ? vorn[0] : el);
    vorn.forEach(function (n) { text.appendChild(n); });

    var knopf = document.createElement('button');
    knopf.type = 'button';
    knopf.className = 'datenexplorer-drehen';
    knopf.textContent = el.getAttribute('data-text-drehen') || 'Drehen';
    leiste.appendChild(knopf);

    var wurzel = document.documentElement;
    var aktiv = false, imVollbild = false;
    var schliessen = document.createElement('button');
    schliessen.type = 'button';
    schliessen.className = 'datenexplorer-schliessen';
    schliessen.textContent = el.getAttribute('data-text-schliessen') || 'Zurück';
    var beobachter = window.MutationObserver ? new MutationObserver(function () {
      // Wechselt die App ihre Ansicht, raeumt sie el auf: den Knopf wieder einsetzen
      if (aktiv && schliessen.parentNode !== el) el.insertBefore(schliessen, el.firstChild);
    }) : null;

    function groesseMelden() {
      // Plotly & Co. messen ihren Behaelter neu
      [60, 350].forEach(function (ms) { setTimeout(function () { window.dispatchEvent(new Event('resize')); }, ms); });
    }
    function hochkant() {
      el.classList.toggle('datenexplorer--hochkant', aktiv && !imVollbild && window.innerHeight > window.innerWidth);
    }
    function echtesVollbild() {
      return !!((document.fullscreenElement || document.webkitFullscreenElement) === el);
    }
    function an() {
      if (aktiv) return;
      aktiv = true;
      el.classList.add('datenexplorer--quer');
      wurzel.classList.add('datenexplorer-fixiert');
      el.insertBefore(schliessen, el.firstChild);
      if (beobachter) beobachter.observe(el, { childList: true });
      hochkant();
      var rf = el.requestFullscreen || el.webkitRequestFullscreen;
      var kann = rf && (document.fullscreenEnabled || document.webkitFullscreenEnabled);
      if (kann) {
        try {
          Promise.resolve(rf.call(el)).then(function () {
            imVollbild = echtesVollbild();
            hochkant();
            var o = window.screen && window.screen.orientation;
            if (o && o.lock) return o.lock('landscape');
          }).catch(function () {}).then(function () {
            setTimeout(function () {
              if (!aktiv) return;
              if (imVollbild && window.innerHeight > window.innerWidth) {
                // Querformat nicht erzwingbar: das echte Vollbild erlaubt keine Drehung per CSS, also verlassen;
                // die gedrehte Ansicht bleibt als Ersatz
                imVollbild = false;
                try { (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch (e) { /* schon draussen */ }
              }
              hochkant(); groesseMelden();
            }, 400);
          });
        } catch (e) { /* Ersatz bleibt */ }
      }
      groesseMelden();
    }
    function aus() {
      if (!aktiv) return;
      aktiv = false;
      var warVoll = imVollbild; imVollbild = false;
      if (beobachter) beobachter.disconnect();
      if (schliessen.parentNode) schliessen.parentNode.removeChild(schliessen);
      el.classList.remove('datenexplorer--quer', 'datenexplorer--hochkant');
      wurzel.classList.remove('datenexplorer-fixiert');
      try {
        var o = window.screen && window.screen.orientation;
        if (o && o.unlock) o.unlock();
        if (warVoll && echtesVollbild()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      } catch (e) { /* schon draussen */ }
      groesseMelden();
    }
    knopf.addEventListener('click', an);
    schliessen.addEventListener('click', aus);
    document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') aus(); });
    ['fullscreenchange', 'webkitfullscreenchange'].forEach(function (n) {
      // Wer das echte Vollbild per Geste verlaesst, verlaesst auch den Ersatz
      document.addEventListener(n, function () { if (aktiv && imVollbild && !echtesVollbild()) { imVollbild = false; aus(); } });
    });
    window.addEventListener('resize', hochkant);
    window.addEventListener('orientationchange', function () { setTimeout(hochkant, 100); });
  }

  function init() {
    var el = document.querySelector('[data-datenexplorer]');
    if (el) {
      document.documentElement.classList.add('datenexplorer-seite');
      kompaktPruefen();
      drehenEinrichten(el);
      starte(el);
      alterNeuladen();
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
