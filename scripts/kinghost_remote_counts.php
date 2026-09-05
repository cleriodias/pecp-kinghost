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
    'matrix::',
]);

$dbHost = trim((string) ($options['host'] ?? ($_ENV['DB_HOST'] ?? getenv('DB_HOST') ?: '127.0.0.1')));
$dbPort = (int) ($options['port'] ?? ($_ENV['DB_PORT'] ?? getenv('DB_PORT') ?: 3306));
$dbName = trim((string) ($options['database'] ?? ($_ENV['DB_DATABASE'] ?? getenv('DB_DATABASE') ?: '')));
$dbUser = trim((string) ($options['user'] ?? ($_ENV['DB_USERNAME'] ?? getenv('DB_USERNAME') ?: 'root')));
$dbPassword = (string) ($options['password'] ?? ($_ENV['DB_PASSWORD'] ?? getenv('DB_PASSWORD') ?: ''));
$matrixName = trim((string) ($options['matrix'] ?? 'Jd.Paraiso'));

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

$report = [];
$report['matrizes'] = tableExists($pdo, 'tb30_matrizes') ? tableCount($pdo, 'tb30_matrizes') : 0;

$matrixId = resolveMatrixId($pdo, $matrixName);
$report['matrix_id'] = $matrixId;

$report['tb2_unidades_matriz'] = columnExists($pdo, 'tb2_unidades', 'matriz_id')
    ? tableCount($pdo, 'tb2_unidades', 'matriz_id = ?', [$matrixId])
    : tableCount($pdo, 'tb2_unidades');
$report['users_matriz'] = columnExists($pdo, 'users', 'matriz_id')
    ? tableCount($pdo, 'users', 'matriz_id = ?', [$matrixId])
    : tableCount($pdo, 'users');
$report['tb1_produto_matriz'] = columnExists($pdo, 'tb1_produto', 'matriz_id')
    ? tableCount($pdo, 'tb1_produto', 'matriz_id = ?', [$matrixId])
    : tableCount($pdo, 'tb1_produto');
$report['tb2_unidades_tb2_id_origem_exists'] = columnExists($pdo, 'tb2_unidades', 'tb2_id_origem');
$report['tb2_unidades_tb2_id_origem_missing'] = columnMissingCount($pdo, 'tb2_unidades', 'tb2_id_origem', $matrixId);
$report['tb1_produto_codigoProduto_exists'] = columnExists($pdo, 'tb1_produto', 'codigoProduto');
$report['tb1_produto_produto_id_exists'] = columnExists($pdo, 'tb1_produto', 'produto_id');
$report['tb1_produto_codigoProduto_missing'] = columnMissingCount($pdo, 'tb1_produto', 'codigoProduto', $matrixId);
$report['tb1_produto_produto_id_missing'] = columnMissingCount($pdo, 'tb1_produto', 'produto_id', $matrixId);
$report['tb3_vendas_duplicate_rows'] = duplicateCount(
    $pdo,
    'tb3_vendas',
    [
        'tb4_id',
        'tb1_id',
        'id_comanda',
        'produto_nome',
        'valor_unitario',
        'quantidade',
        'valor_total',
        'data_hora',
        'id_user_caixa',
        'id_user_vale',
        'id_lanc',
        'id_unidade',
        'tipo_pago',
        'status_pago',
        'status',
    ]
);

foreach ([
    'suppliers',
    'tb2_unidades',
    'users',
    'tb2_unidade_user',
    'tb1_produto',
    'tb26_configuracoes_fiscais',
    'tb4_vendas_pg',
    'tb3_vendas',
    'tb27_notas_fiscais',
    'cashier_closures',
    'expenses',
    'salary_advances',
    'tb_16_boletos',
    'tb22_chat_mensagens',
    'tb23_anydesck_codigos',
    'tb24_controle_pagamentos',
    'tb25_produto_movimentacoes',
    'product_discards',
    'sales_disputes',
    'sales_dispute_bids',
    'tb18_chamados',
    'tb19_chamado_interacoes',
    'tb20_chamado_anexos',
] as $table) {
    $report[$table] = tableCount($pdo, $table);
}

foreach ([
    'tb4_vendas_pg' => 'tb4_id',
    'tb3_vendas' => 'tb3_id',
    'users' => 'id',
    'tb1_produto' => 'tb1_id',
    'tb2_unidades' => 'tb2_id',
    'tb26_configuracoes_fiscais' => 'tb26_id',
    'cashier_closures' => 'id',
    'expenses' => 'id',
    'salary_advances' => 'id',
    'tb_16_boletos' => 'id',
    'tb22_chat_mensagens' => 'id',
    'tb23_anydesck_codigos' => 'id',
    'tb24_controle_pagamentos' => 'id',
    'product_discards' => 'id',
] as $table => $column) {
    $report[$table . '_max'] = maxId($pdo, $table, $column);
}

echo json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL;

function tableCount(PDO $pdo, string $table, ?string $where = null, array $params = []): int
{
    if (! tableExists($pdo, $table)) {
        return 0;
    }

    $sql = sprintf('SELECT COUNT(*) FROM `%s`', $table);
    if ($where !== null) {
        $sql .= ' WHERE ' . $where;
    }

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    return (int) $stmt->fetchColumn();
}

function tableExists(PDO $pdo, string $table): bool
{
    $stmt = $pdo->prepare(
        'SELECT COUNT(*)
         FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = ?'
    );
    $stmt->execute([$table]);

    return (int) $stmt->fetchColumn() > 0;
}

function columnExists(PDO $pdo, string $table, string $column): bool
{
    $stmt = $pdo->prepare(
        'SELECT COUNT(*)
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = ?
           AND COLUMN_NAME = ?'
    );
    $stmt->execute([$table, $column]);

    return (int) $stmt->fetchColumn() > 0;
}

function columnMissingCount(PDO $pdo, string $table, string $column, int $matrixId): ?int
{
    if (! columnExists($pdo, $table, $column)) {
        return null;
    }

    $stmt = $pdo->prepare(sprintf(
        'SELECT COUNT(*)
         FROM `%s`
         WHERE matriz_id = ?
           AND (`%s` IS NULL OR `%s` = 0 OR `%s` = "")',
        $table,
        $column,
        $column,
        $column
    ));
    $stmt->execute([$matrixId]);

    return (int) $stmt->fetchColumn();
}

function maxId(PDO $pdo, string $table, string $column): int
{
    $stmt = $pdo->query(sprintf('SELECT COALESCE(MAX(`%s`), 0) FROM `%s`', $column, $table));

    return (int) $stmt->fetchColumn();
}

function duplicateCount(PDO $pdo, string $table, array $columns): int
{
    $groupColumns = implode(', ', array_map(static fn (string $column) => sprintf('`%s`', $column), $columns));
    $sql = sprintf(
        'SELECT COALESCE(SUM(dup_count - 1), 0)
         FROM (
             SELECT COUNT(*) AS dup_count
             FROM `%s`
             GROUP BY %s
             HAVING COUNT(*) > 1
         ) AS grouped_rows',
        $table,
        $groupColumns
    );
    $stmt = $pdo->query($sql);

    return (int) $stmt->fetchColumn();
}

function resolveMatrixId(PDO $pdo, string $matrixName): int
{
    $tablesStmt = $pdo->query("SHOW TABLES LIKE 'tb30_matrizes'");
    if ($tablesStmt->fetchColumn() === false) {
        return 1;
    }

    $stmt = $pdo->prepare('SELECT tb30_id FROM tb30_matrizes WHERE LOWER(tb30_nome) = LOWER(?) OR LOWER(tb30_slug) = LOWER(?) LIMIT 1');
    $slug = strtolower(trim($matrixName));
    $slug = preg_replace('/[^a-z0-9]+/', '-', $slug) ?? $slug;
    $stmt->execute([$matrixName, $slug]);
    $matrixId = $stmt->fetchColumn();

    return $matrixId !== false ? (int) $matrixId : 1;
}
