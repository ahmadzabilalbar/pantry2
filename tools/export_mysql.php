<?php
/**
 * One-off: dump the old app's MySQL data to JSON for tools/import.mjs.
 *
 *   php tools/export_mysql.php C:/xampp/htdocs/pantry > migration/export.json
 *
 * Uses the old app's own db.php / credentials, so run it on the XAMPP machine.
 * The output holds real staff names and the full contribution ledger: keep it
 * in migration/ (git-ignored) and delete it once the import is verified.
 */
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit();
}

$appDir = rtrim($argv[1] ?? '', '/\\');
if ($appDir === '' || !is_file($appDir . '/db.php')) {
    fwrite(STDERR, "Usage: php tools/export_mysql.php <path to old pantry app>\n");
    exit(1);
}

require_once $appDir . '/db.php';
$pdo = get_db_connection();
if (!$pdo) {
    fwrite(STDERR, "Could not connect to MySQL.\n");
    exit(1);
}

$tables = [
    'settings', 'announcement', 'showcase', 'items', 'contributions',
    'contributions_backup', 'events', 'expenses', 'staff',
];
$out = ['exported_at' => date('c')];
foreach ($tables as $t) {
    $out[$t] = $pdo->query("SELECT * FROM `{$t}`")->fetchAll(PDO::FETCH_ASSOC);
    fwrite(STDERR, sprintf("%-22s %d rows\n", $t, count($out[$t])));
}

echo json_encode($out, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), "\n";
