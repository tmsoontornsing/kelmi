<?php
// Local dev router for `php -S`: clean URLs (/terms -> terms.php). On Apache, .htaccess does this.
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if (preg_match('#^/(includes|content)/#', $path) || basename($path) === 'router.php') { http_response_code(404); exit; }
if ($path !== '/' && is_file(__DIR__ . $path)) return false;
$page = trim($path, '/');
if ($page === '') $page = 'index';
if (preg_match('/^[a-z-]+$/', $page) && is_file(__DIR__ . "/$page.php") && $page !== 'router') { require __DIR__ . "/$page.php"; return true; }
http_response_code(404); echo '<!doctype html><title>Not found · Kelmi</title><p>Page not found. <a href="/">Back to Kelmi</a>';
