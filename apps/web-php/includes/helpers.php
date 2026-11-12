<?php
// Shared settings and small view helpers for the Kelmi site. No framework, no build step.

const APP_STORE_URL = '';   // Fill in once the listings are live. While empty, the store badges say "Coming soon".
const PLAY_STORE_URL = '';
const CONTACT_EMAIL = 'support@usekelmi.com';
const COMPANY = 'LOGICBAKER COMPANY LIMITED';
const SITE_URL = 'https://usekelmi.com';
const DESCRIPTION = 'Meet Pip, the jar that plans your week. Tell Kelmi who you cook for and what you spend, and Pip fills the week with meals that fit, plus one grocery list to shop from.';

function h(string $s): string { return htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }

// A heading split into words that slide up out of a mask (site.js adds `in` when it scrolls into view).
function words(string $text, int $from = 0): string {
    $out = '';
    foreach (explode(' ', $text) as $i => $w) {
        $out .= ($i > 0 ? ' ' : '') . '<span class="w"><span style="--i:' . ($i + $from) . '">' . h($w) . '</span></span>';
    }
    return $out;
}

function pip(string $pose): string {
    $zs = $pose === 'sleep' ? '<span class="zs"><b>z</b><b>z</b><b>Z</b></span>' : '';
    return '<span class="pip-slot pa-' . h($pose) . '" aria-hidden="true"><img src="/mascot/' . h($pose) . '.svg" alt="" draggable="false">' . $zs . '</span>';
}

function aurora(): string {
    $bubbles = [[6,18,22,0],[16,10,26,6],[27,24,19,11],[38,12,28,3],[49,20,23,14],[58,9,30,8],[68,22,21,1],[77,14,27,12],[86,26,20,5],[94,11,25,16],[33,16,24,18],[72,8,29,20]];
    $sparks = [[8,14,0],[21,62,1.2],[34,28,2.1],[47,78,0.6],[59,18,1.8],[71,52,2.7],[83,33,0.3],[92,70,1.5],[14,84,2.4],[41,46,3],[64,88,0.9],[88,8,2]];
    $o = '<div class="aurora" aria-hidden="true"><span class="au au1"></span><span class="au au2"></span><span class="au au3"></span>';
    foreach ($bubbles as [$x, $s, $d, $w]) $o .= "<i class=\"bub\" style=\"left:{$x}%;width:{$s}px;height:{$s}px;animation-duration:{$d}s;animation-delay:-{$w}s\"></i>";
    foreach ($sparks as [$x, $y, $w]) $o .= "<b class=\"spark\" style=\"left:{$x}%;top:{$y}%;animation-delay:{$w}s\"></b>";
    return $o . '</div>';
}

// Decorative parallax layers. Each shape carries data-depth, which site.js turns into a vertical offset.
function depth(string $set): string {
    static $sets = [
        'hero' => [['blob','62%','-6%',520,-0.22],['blob','-8%','58%',360,0.16],['leaf','55%','3%',54,-0.34,24],['ring','90%','64%',150,0.28]],
        'how' => [['blob','-10%','10%',420,0.18],['leaf','88%','6%',60,-0.3,-30],['ring','94%','70%',190,0.22]],
        'features' => [['blob','78%','4%',480,-0.16],['leaf','3%','12%',50,-0.32,40],['blob','-12%','70%',400,0.18]],
        'pricing' => [['blob','70%','10%',420,0.16],['leaf','6%','70%',56,-0.3,-18]],
        'box' => [['pip','58%','58%',150,-0.14,-14],['leaf','74%','12%',46,0.3,32],['ring','40%','80%',110,0.24]],
        'faq' => [['blob','-10%','20%',380,0.18],['leaf','92%','10%',52,-0.3,20]],
    ];
    $o = '<div class="depth-layer set-' . h($set) . '" aria-hidden="true">';
    foreach ($sets[$set] as $s) {
        [$k, $x, $y, $size, $d] = $s;
        $r = $s[5] ?? 0;
        $o .= "<span class=\"depth d-$k\" data-depth=\"$d\" style=\"left:$x;top:$y;width:{$size}px;height:{$size}px;--r:{$r}deg\">";
        if ($k === 'leaf') $o .= '<svg viewBox="0 0 48 48" width="100%" height="100%"><path d="M8 40C8 18 22 6 42 6c0 20-12 34-34 34Z" fill="currentColor"/><path d="M8 40 30 18" stroke="var(--bg)" stroke-width="2" stroke-linecap="round" fill="none"/></svg>';
        if ($k === 'pip') $o .= '<img src="/pip-mark.svg" alt="" width="100%" height="100%">';
        $o .= '</span>';
    }
    return $o . '</div>';
}

function theme_toggle(): string {
    return '<button class="toggle" type="button" role="switch" aria-checked="false" aria-label="Dark mode" title="Switch to dark mode">'
        . '<span class="toggle-track" data-on="false">'
        . '<svg class="toggle-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/></svg>'
        . '<svg class="toggle-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z"/></svg>'
        . '<span class="toggle-knob"></span></span></button>';
}

function store_badge(string $href, string $small, string $big): string {
    if ($href !== '') return '<a class="btn store" href="' . h($href) . '"><small>' . h($small) . '</small><b>' . h($big) . '</b></a>';
    return '<span class="btn store soon" aria-label="' . h($big) . ': coming soon"><small>Coming soon to</small><b>' . h($big) . '</b></span>';
}

// <head> through the opening of <body>. $title is the full page title.
function page_start(string $title, bool $home = false, string $path = '/'): void {
    $desc = DESCRIPTION;
    $graph = ['@context' => 'https://schema.org', '@graph' => [
        ['@type' => 'Organization', '@id' => SITE_URL . '/#org', 'name' => 'Kelmi', 'legalName' => COMPANY, 'url' => SITE_URL, 'logo' => SITE_URL . '/apple-icon.png'],
        ['@type' => 'WebSite', '@id' => SITE_URL . '/#site', 'url' => SITE_URL, 'name' => 'Kelmi', 'publisher' => ['@id' => SITE_URL . '/#org']],
        ['@type' => 'MobileApplication', 'name' => 'Kelmi', 'description' => $desc, 'applicationCategory' => 'LifestyleApplication', 'operatingSystem' => 'iOS, Android', 'offers' => ['@type' => 'Offer', 'price' => '0', 'priceCurrency' => 'USD'], 'publisher' => ['@id' => SITE_URL . '/#org']],
    ]];
    ?><!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title><?= h($title) ?></title>
<meta name="description" content="<?= h($desc) ?>">
<meta name="theme-color" content="#F7FAF5">
<link rel="canonical" href="<?= h(SITE_URL . $path) ?>">
<link rel="icon" href="/favicon.png">
<link rel="apple-touch-icon" href="/apple-icon.png">
<meta property="og:title" content="<?= h($title) ?>">
<meta property="og:description" content="<?= h($desc) ?>">
<meta property="og:url" content="<?= h(SITE_URL . $path) ?>">
<meta property="og:site_name" content="Kelmi">
<meta property="og:type" content="website">
<meta property="og:image" content="<?= h(SITE_URL) ?>/social-card.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="<?= h($title) ?>">
<meta name="twitter:description" content="<?= h($desc) ?>">
<meta name="twitter:image" content="<?= h(SITE_URL) ?>/social-card.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="/assets/style.css?v=<?= (int) @filemtime(__DIR__ . '/../assets/style.css') ?>">
<script>try{var t=localStorage.getItem('kavi-theme');if(t!=='dark')t='light';document.documentElement.dataset.theme=t}catch(e){}var w=innerWidth;document.documentElement.style.setProperty('--z',w>1500?Math.min(1.5,1+(w-1500)/2500).toFixed(3):'1');</script>
<?php if ($home): ?><script type="application/ld+json"><?= json_encode($graph, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG) ?></script>
<?php endif; ?>
</head>
<body>
<?php
}

function page_end(): void {
    echo '<script src="/assets/site.js?v=' . (int) @filemtime(__DIR__ . '/../assets/site.js') . '" defer></script>' . "\n</body>\n</html>\n";
}

function legal_nav(): string {
    return '<nav aria-label="Legal"><a href="/terms">Terms</a><a href="/privacy">Privacy</a><a href="/consumer-health-data">Health data</a><a href="/delete-account">Delete account</a></nav>';
}

// Chrome shared by the legal documents and the delete-account page. $body is trusted HTML.
function legal_page(string $pageTitle, string $path, string $title, string $summary, string $body): void {
    page_start($pageTitle, false, $path);
    ?>
<header class="nav"><div class="wrap">
<a class="brand" href="/" aria-label="Kelmi home"><span class="pipbadge"><img src="/pip-mark.svg" alt=""></span>Kelmi</a>
<div class="navright"><?= theme_toggle() ?></div>
</div></header>
<main class="wrap legal">
<a class="back" href="/">← Back to Kelmi</a>
<h1 class="display"><?= h($title) ?></h1>
<p class="summary"><?= h($summary) ?></p>
<article><?= $body ?></article>
</main>
<footer><div class="wrap"><div class="row">
<span class="footnote">© <?= date('Y') ?> <?= h(COMPANY) ?></span>
<?= legal_nav() ?>
</div></div></footer>
<?php
    page_end();
}

// Renders content/<doc>.md (headings "## ", bullets "- ", paragraphs, "# " title, "> " summary).
function legal_doc(string $doc, string $pageTitle): void {
    $lines = preg_split('/\R/', (string) file_get_contents(__DIR__ . '/../content/' . $doc . '.md'));
    $title = $summary = $out = '';
    $list = [];
    $flush = function () use (&$out, &$list) {
        if ($list) $out .= '<ul>' . implode('', array_map(fn($i) => '<li>' . h($i) . '</li>', $list)) . '</ul>';
        $list = [];
    };
    foreach ($lines as $raw) {
        $l = rtrim($raw);
        if (str_starts_with($l, '# ')) $title = substr($l, 2);
        elseif (str_starts_with($l, '> ')) $summary = substr($l, 2);
        elseif (str_starts_with($l, '## ')) { $flush(); $out .= '<h2>' . h(substr($l, 3)) . '</h2>'; }
        elseif (str_starts_with($l, '- ')) $list[] = substr($l, 2);
        elseif (trim($l) !== '') { $flush(); $out .= '<p>' . h($l) . '</p>'; }
    }
    $flush();
    legal_page($pageTitle, '/' . $doc, $title, $summary, $out);
}
