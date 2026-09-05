<?php

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "Este script deve ser executado via CLI.\n");
    exit(1);
}

require_once __DIR__ . '/../vendor/autoload.php';

use Dotenv\Dotenv;

if (is_file(__DIR__ . '/../.env')) {
    Dotenv::createImmutable(__DIR__ . '/..')->safeLoad();
}

$options = getopt('', [
    'host::',
    'port::',
    'database::',
    'user::',
    'password::',
]);

$dbHost = trim((string) ($options['host'] ?? ($_ENV['DB_HOST'] ?? getenv('DB_HOST') ?: '127.0.0.1')));
$dbPort = (int) ($options['port'] ?? ($_ENV['DB_PORT'] ?? getenv('DB_PORT') ?: 3306));
$dbName = trim((string) ($options['database'] ?? ($_ENV['DB_DATABASE'] ?? getenv('DB_DATABASE') ?: '')));
$dbUser = trim((string) ($options['user'] ?? ($_ENV['DB_USERNAME'] ?? getenv('DB_USERNAME') ?: 'root')));
$dbPassword = (string) ($options['password'] ?? ($_ENV['DB_PASSWORD'] ?? getenv('DB_PASSWORD') ?: ''));

if ($dbName === '') {
    fwrite(STDERR, "Banco de dados de destino nao informado.\n");
    exit(1);
}

$pdo = new PDO(
    sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $dbHost, $dbPort, $dbName),
    $dbUser,
    $dbPassword,
    [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]
);

$duplicateQuery = <<<SQL
DELETE v
FROM tb3_vendas v
JOIN (
    SELECT tb3_id,
           ROW_NUMBER() OVER (
               PARTITION BY tb4_id, tb1_id, id_comanda, produto_nome, valor_unitario, quantidade, valor_total,
                            data_hora, id_user_caixa, id_user_vale, id_lanc, id_unidade, tipo_pago, status_pago, status
               ORDER BY tb3_id
           ) AS rn
    FROM tb3_vendas
) ranked ON ranked.tb3_id = v.tb3_id
WHERE ranked.rn > 1
SQL;

$affected = $pdo->exec($duplicateQuery);

echo json_encode([
    'deleted_rows' => (int) $affected,
], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL;
