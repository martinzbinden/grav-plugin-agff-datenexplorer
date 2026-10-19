<?php
namespace Grav\Plugin;

use Grav\Common\Plugin;
use Grav\Plugin\Datenexplorer\Kurzlinks;
use RocketTheme\Toolbox\Event\Event;

/**
 * Datenexplorer: bettet eine mit R/htmlwidgets erzeugte Web-App (z.B. den
 * Graswachstum-Datenexplorer) direkt in eine Grav-Seite ein - ohne iframe,
 * im Seitenrahmen und Stil der Website.
 *
 * Im Seiteninhalt genügt die Marke [datenexplorer]. Sie wird durch einen
 * Platzhalter ersetzt (statisches Vorschaubild), den das Skript
 * assets/datenexplorer.js durch die App ersetzt: es lädt
 * <quelle>/<einbettung> (JSON mit css, js und html, siehe README), setzt
 * Stylesheets und HTML ein, lädt die Skripte und startet die Widgets.
 *
 * Kurzlinks: Die App (PDF-Berichte mit QR-Code) tauscht lange Links mit allen
 * Parametern gegen <seite>/g/<code> (classes/Kurzlinks.php, nur Ziele der
 * eigenen Datenexplorer-Seite), damit QR-Codes klein und scanbar bleiben.
 */
class DatenexplorerPlugin extends Plugin
{
    private const MARKE = '[datenexplorer]';

    public function __construct($name, $grav, $config = null)
    {
        parent::__construct($name, $grav, $config);
        spl_autoload_register(static function (string $class): void {
            $prefix = 'Grav\\Plugin\\Datenexplorer\\';
            if (str_starts_with($class, $prefix)) {
                $file = __DIR__ . '/classes/' . str_replace('\\', '/', substr($class, strlen($prefix))) . '.php';
                if (is_file($file)) {
                    require_once $file;
                }
            }
        });
    }

    public static function getSubscribedEvents(): array
    {
        return ['onPluginsInitialized' => ['onPluginsInitialized', 0]];
    }

    public function onPluginsInitialized(): void
    {
        if ($this->isAdmin()) {
            return;
        }
        $this->enable([
            'onPagesInitialized' => ['onPagesInitialized', 0],
            'onPageContentProcessed' => ['onPageContentProcessed', 0],
            'onTwigSiteVariables' => ['onTwigSiteVariables', 0],
        ]);
    }

    private function cfg(string $k, $d = null)
    {
        return $this->config->get('plugins.datenexplorer.' . $k, $d);
    }

    /** Kurzlinks: POST <pfad> legt an, GET <pfad>/<code> leitet weiter */
    public function onPagesInitialized(): void
    {
        $pfad = (string) parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH);
        $basis = rtrim((string) ($this->grav['base_url_relative'] ?? ''), '/');
        if ($basis !== '' && str_starts_with($pfad, $basis)) {
            $pfad = substr($pfad, strlen($basis));
        }
        $pfad = rtrim($pfad, '/');
        $ep = preg_quote('/' . trim((string) $this->cfg('kurz_pfad', '/g'), '/'), '#');
        if (!preg_match('#^(?:/[a-z]{2})?' . $ep . '(?:/([a-z0-9]{4,12}))?$#', $pfad, $m)) {
            return;
        }
        $dir = (string) $this->cfg('kurz_daten_dir', '../datenexplorer-daten');
        $k = new Kurzlinks(str_starts_with($dir, '/') ? $dir : GRAV_ROOT . '/' . $dir, [
            'hosts' => array_merge((array) $this->cfg('kurz_hosts', ['graswachstum.ch']), [parse_url('http://' . ($_SERVER['HTTP_HOST'] ?? ''), PHP_URL_HOST) ?: '']),
            'origins' => (array) $this->cfg('kurz_origins', ['https://apps.graswachstum.ch']),
            'max' => (int) $this->cfg('kurz_max', 50000),
            'limit' => (int) $this->cfg('kurz_limit', 120),
            'ziele' => (string) $this->cfg('kurz_ziele', '#^/(?:(?:de|fr|it|en)/)?growth(?:/|$)#'),
        ]);
        $k->behandeln($m[1] ?? '', rtrim($this->grav['uri']->rootUrl(true), '/') . '/' . trim((string) $this->cfg('kurz_pfad', '/g'), '/'));
    }

    /** Marke durch den Platzhalter ersetzen (das Ergebnis landet im Seiten-Cache) */
    public function onPageContentProcessed(Event $event): void
    {
        $page = $event['page'];
        $content = $page->getRawContent();
        if (strpos($content, self::MARKE) === false) {
            return;
        }
        // Von Markdown in <p> gepackte Marke mitsamt Absatz ersetzen
        $html = $this->platzhalter();
        $content = preg_replace('#<p>\s*' . preg_quote(self::MARKE, '#') . '\s*</p>#', $html, $content);
        $content = str_replace(self::MARKE, $html, $content);
        $page->setRawContent($content);
    }

    /** Text aus der Konfiguration, sonst aus languages.yaml in der Seitensprache */
    private function text(string $cfgKey, string $langKey): string
    {
        $t = (string) $this->cfg($cfgKey, '');
        return $t !== '' ? $t : (string) $this->grav['language']->translate(['PLUGIN_DATENEXPLORER.' . $langKey]);
    }

    private function platzhalter(): string
    {
        $quelle = rtrim((string) $this->cfg('quelle', ''), '/') . '/';
        $e = static fn($s) => htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8');
        $bild = (string) $this->cfg('vorschaubild', '');
        $bildHtml = $bild !== ''
            ? '<img class="datenexplorer-vorschau" src="' . $e($quelle . $bild) . '" alt="' . $e($this->cfg('vorschaubild_alt', '')) . '">'
            : '';
        $abstand = trim((string) $this->cfg('abstand_oben', ''));
        $stil = preg_match('/^-?[0-9.]+(px|rem|em)$/', $abstand) ? ' style="--datenexplorer-abstand-oben: ' . $abstand . '"' : '';
        return '<div class="datenexplorer not-prose" data-datenexplorer' . $stil
            . ' data-quelle="' . $e($quelle) . '"'
            . ' data-einbettung="' . $e($this->cfg('einbettung', 'Datenexplorer_einbettung.json')) . '"'
            . ' data-text-fehler="' . $e($this->text('text_fehler', 'FEHLER')) . '"'
            . ' data-text-fenster="' . $e($this->text('text_fenster', 'FENSTER')) . '">'
            . $bildHtml
            . '<p class="datenexplorer-status" role="status"><span class="datenexplorer-lader" aria-hidden="true"></span>'
            . $e($this->text('text_laden', 'LADEN')) . '</p>'
            . '<noscript><p><a href="' . $e($quelle) . '">' . $e($this->text('text_fenster', 'FENSTER')) . '</a></p></noscript>'
            . '</div>';
    }

    /** Skript und Stil nur auf Seiten mit Datenexplorer laden */
    public function onTwigSiteVariables(): void
    {
        $page = $this->grav['page'] ?? null;
        if (!$page || strpos((string) $page->content(), 'data-datenexplorer') === false) {
            return;
        }
        // Version (Aenderungszeit) anhaengen, damit Browser nach einem Update
        // nicht die alten Dateien aus dem Cache nehmen
        $v = static fn(string $f) => '?v=' . (@filemtime(__DIR__ . '/assets/' . $f) ?: '1');
        $assets = $this->grav['assets'];
        $assets->addCss('plugin://datenexplorer/assets/datenexplorer.css' . $v('datenexplorer.css'));
        $assets->addJs('plugin://datenexplorer/assets/datenexplorer.js' . $v('datenexplorer.js'), ['group' => 'bottom', 'loading' => 'defer']);
    }
}
