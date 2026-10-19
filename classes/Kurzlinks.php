<?php

declare(strict_types=1);

namespace Grav\Plugin\Datenexplorer;

/**
 * Kurzlinks fuer den Datenexplorer: aus einem langen Link (Jahr, Woche, Ebene, Ausschnitt, Orte)
 * wird <seite>/g/<code>. Der Code ergibt sich aus dem Link (gleicher Link = gleicher Code), es gibt keine
 * Konten und nichts wird geloescht. Missbrauch begrenzt: nur Ziele der eigenen Datenexplorer-Seite
 * (Host- und Pfadpruefung), Hoechstmenge, Anlegen je Absender und Stunde begrenzt.
 * Ablage: kurzlinks.json im Datenordner (ausserhalb des Webverzeichnisses).
 */
class Kurzlinks
{
    private const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';      // ohne i, l, o, 0, 1

    public function __construct(private string $dir, private array $cfg)
    {
    }

    private function antwort(array $d, int $code = 200): never
    {
        http_response_code($code);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        echo json_encode($d, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    private function ordner(): void
    {
        if (!is_dir($this->dir) && !@mkdir($this->dir, 0700, true) && !is_dir($this->dir)) {
            throw new \RuntimeException('Datenordner nicht anlegbar');
        }
        if (!is_file($this->dir . '/.htaccess')) {
            @file_put_contents($this->dir . '/.htaccess', "Require all denied\n");
        }
    }

    /** Anfrage beantworten (beendet das Skript) */
    public function behandeln(string $code, string $basisUrl): void
    {
        $methode = $_SERVER['REQUEST_METHOD'] ?? 'GET';
        $origin = (string) ($_SERVER['HTTP_ORIGIN'] ?? '');
        if ($origin !== '') {
            $host = (string) parse_url($origin, PHP_URL_HOST);
            $erlaubt = in_array($origin, $this->cfg['origins'], true) || in_array($host, $this->cfg['hosts'], true);
            if ($erlaubt) {
                header('Access-Control-Allow-Origin: ' . $origin);
                header('Vary: Origin');
                header('Access-Control-Allow-Methods: POST, OPTIONS');
                header('Access-Control-Allow-Headers: Content-Type');
                header('Access-Control-Max-Age: 86400');
            } elseif ($methode === 'POST') {
                $this->antwort(['ok' => false, 'message' => 'Nicht erlaubt'], 403);
            }
        }
        if ($methode === 'OPTIONS') {
            http_response_code(204);
            exit;
        }
        try {
            $this->ordner();
            if ($methode === 'POST' && $code === '') {
                $this->anlegen($basisUrl);
            }
            if ($methode === 'GET' && $code !== '') {
                $this->weiterleiten($code);
            }
        } catch (\Throwable $e) {
            error_log('datenexplorer Kurzlinks: ' . $e->getMessage());
            $this->antwort(['ok' => false, 'message' => 'Fehler'], 500);
        }
        $this->antwort(['ok' => false, 'message' => 'Nicht gefunden'], 404);
    }

    private function laden(): array
    {
        $f = $this->dir . '/kurzlinks.json';
        $d = is_file($f) ? json_decode((string) file_get_contents($f), true) : [];
        return is_array($d) ? $d : [];
    }

    private function weiterleiten(string $code): never
    {
        $e = $this->laden()[$code] ?? null;
        if (!$e || empty($e['u'])) {
            http_response_code(404);
            header('Content-Type: text/plain; charset=utf-8');
            echo "Dieser Kurzlink ist nicht bekannt.\n";
            exit;
        }
        header('X-Robots-Tag: noindex, nofollow');
        header('Cache-Control: public, max-age=300');
        header('Location: ' . $e['u'], true, 302);
        exit;
    }

    /** Pruefung des Ziels: eigener Host, Datenexplorer-Pfad, keine Steuer- und Leerzeichen */
    private function zielOk(string $url): bool
    {
        if ($url === '' || strlen($url) > 8000 || preg_match('/[\x00-\x20\x7F<>"\'\\\\]/', $url)) {
            return false;
        }
        $p = parse_url($url);
        if (!$p || !in_array($p['scheme'] ?? '', ['http', 'https'], true) || isset($p['user']) || !in_array($p['host'] ?? '', $this->cfg['hosts'], true)) {
            return false;
        }
        return (bool) preg_match($this->cfg['ziele'], (string) ($p['path'] ?? '/'));
    }

    private function code(string $url, int $laenge): string
    {
        $h = hash('sha256', $url, true);
        $c = '';
        for ($i = 0; $i < $laenge; $i++) {
            $c .= self::ALPHABET[ord($h[$i]) % strlen(self::ALPHABET)];
        }
        return $c;
    }

    private function anlegen(string $basisUrl): never
    {
        $roh = (string) file_get_contents('php://input', false, null, 0, 20000);
        $in = json_decode($roh, true);
        $url = is_array($in) ? trim((string) ($in['url'] ?? '')) : '';
        if (!$this->zielOk($url)) {
            $this->antwort(['ok' => false, 'message' => 'Ungültiger Link'], 400);
        }
        $sperre = fopen($this->dir . '/.sperre', 'c');
        flock($sperre, LOCK_EX);
        try {
            $alle = $this->laden();
            $code = null;
            for ($l = 6; $l <= 10; $l++) {
                $c = $this->code($url, $l);
                if (!isset($alle[$c])) {
                    $code = $c;
                    break;
                }
                if ($alle[$c]['u'] === $url) {
                    $this->antwort(['ok' => true, 'code' => $c, 'kurz' => $basisUrl . '/' . $c]);
                }
            }
            if ($code === null || count($alle) >= $this->cfg['max']) {
                $this->antwort(['ok' => false, 'message' => 'Kurzlinks sind zurzeit nicht möglich'], 503);
            }
            // Begrenzung je Absender: neue Kurzlinks pro Stunde
            $lf = $this->dir . '/limit.json';
            $lim = is_file($lf) ? (json_decode((string) file_get_contents($lf), true) ?: []) : [];
            $wer = substr(hash('sha256', ($_SERVER['REMOTE_ADDR'] ?? '') . '|datenexplorer'), 0, 16);
            $jetzt = time();
            $lim = array_filter(array_map(fn($z) => array_values(array_filter((array) $z, fn($t) => $t > $jetzt - 3600)), $lim));
            if (count($lim[$wer] ?? []) >= $this->cfg['limit']) {
                $this->antwort(['ok' => false, 'message' => 'Zu viele Anfragen. Bitte später erneut versuchen.'], 429);
            }
            $lim[$wer][] = $jetzt;
            $alle[$code] = ['u' => $url, 't' => $jetzt];
            $this->schreiben('kurzlinks.json', $alle);
            $this->schreiben('limit.json', $lim);
        } finally {
            flock($sperre, LOCK_UN);
            fclose($sperre);
        }
        $this->antwort(['ok' => true, 'code' => $code, 'kurz' => $basisUrl . '/' . $code]);
    }

    private function schreiben(string $name, array $d): void
    {
        $f = $this->dir . '/' . $name;
        $tmp = $f . '.' . getmypid() . '.tmp';
        file_put_contents($tmp, json_encode($d, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), LOCK_EX);
        @chmod($tmp, 0600);
        rename($tmp, $f);
    }
}
