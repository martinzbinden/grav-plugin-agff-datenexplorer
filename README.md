# Grav-Plugin Datenexplorer

Bettet eine mit R/[htmlwidgets](https://www.htmlwidgets.org/) erzeugte Web-App
(z. B. einen Plotly-Datenexplorer) direkt in eine Grav-Seite ein – ohne
iframe, im Seitenrahmen der Website. Die App übernimmt Schrift und
Akzentfarbe der Website, soweit sie das unterstützt (siehe unten).

Im Einsatz auf [graswachstum.ch](https://graswachstum.ch/de/growth) für den
Graswachstum-Datenexplorer.

## Verwendung

1. Plugin nach `user/plugins/datenexplorer` kopieren.
2. In `user/config/plugins/datenexplorer.yaml` die Adresse der App setzen:

   ```yaml
   enabled: true
   quelle: 'https://apps.example.ch/explorer/'
   vorschaubild: karte_aktuell.svg     # optional, solange die App lädt
   vorschaubild_alt: 'Aktuelle Karte'
   ```

3. Im Seiteninhalt an der gewünschten Stelle `[datenexplorer]` schreiben.

Skript und Stil werden nur auf Seiten geladen, die die Marke enthalten.

## Einbettungsdatei

Unter der Adresse liegt eine JSON-Datei (Standard
`Datenexplorer_einbettung.json`), Pfade relativ zur Adresse:

```json
{ "css": ["lib/…/x.css"], "js": ["lib/…/y.js"], "html": "<div id=\"…\">…</div>" }
```

In R lässt sie sich aus einer htmltools-Seite erzeugen:

```r
deps <- lapply(htmltools::resolveDependencies(htmltools::findDependencies(inhalt)),
  function(d) htmltools::makeDependencyRelative(
    htmltools::copyDependencyToDir(d, file.path(out_dir, "lib"), mustWork = FALSE), out_dir))
pfade <- function(d, feld) {
  x <- d[[feld]]; if (!length(x)) return(character())
  x <- vapply(x, function(s) if (is.list(s)) s$src else s, character(1))
  utils::URLencode(file.path(d$src[["file"]], x))
}
jsonlite::write_json(list(
  css = I(unlist(lapply(deps, pfade, "stylesheet"))),
  js  = I(unlist(lapply(deps, pfade, "script"))),
  html = as.character(htmltools::renderTags(inhalt)$html)
), file.path(out_dir, "Datenexplorer_einbettung.json"), auto_unbox = TRUE)
```

Der Server der App muss JSON mit `Access-Control-Allow-Origin` ausliefern
(die Einbettungsdatei und alles, was die App selbst per `fetch()` nachlädt).

## Schnittstelle zur App

Vor dem Start setzt der Lader:

- `window.GW_DATENEXPLORER_BASIS` – Adresse der App mit `/` am Ende; die App
  sollte nachgeladene Dateien relativ dazu holen.
- `window.GW_DATENEXPLORER_EINGEBETTET = true` – die App kann sich daran
  anpassen (z. B. Schrift von der Seite übernehmen, Vollbild-Knopf anbieten).

Danach ruft er `HTMLWidgets.staticRender()` auf.

## Lizenz

MIT

## Kurzlinks

Für PDF-Berichte mit QR-Code (lange Links mit allen Parametern sind nur gross scanbar) bietet das Plugin
Kurzlinks: `POST <seite>/g` mit `{"url": "<Link>"}` antwortet mit `{"kurz": "<seite>/g/<code>"}`, `GET <seite>/g/<code>`
leitet auf den Link weiter. Der Code ergibt sich aus dem Link (derselbe Link gibt denselben Code).

- Nur Ziele der eigenen Datenexplorer-Seite (`kurz_hosts`, `kurz_ziele`), keine Konten, nichts wird gelöscht.
- Begrenzt: `kurz_max` (50000) Links, `kurz_limit` (120) neue Links je Absender und Stunde.
- `kurz_origins`: Seiten, die aus dem Browser anlegen dürfen (CORS), Standard `https://apps.graswachstum.ch`.
- Ablage: `kurz_daten_dir` (Standard `../datenexplorer-daten`, ausserhalb des Webverzeichnisses), Datei `kurzlinks.json`.
