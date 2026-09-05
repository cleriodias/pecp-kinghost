<?php

declare(strict_types=1);

if (PHP_SAPI !== 'cli' && ! isset($_GET['payload']) && ! isset($_GET['dry_run'])) {
    header('Content-Type: text/plain; charset=utf-8');
}

use Dotenv\Dotenv;

require_once __DIR__ . '/../vendor/autoload.php';

if (is_file(__DIR__ . '/../.env')) {
    Dotenv::createImmutable(__DIR__ . '/..')->safeLoad();
}

$options = php_sapi_name() === 'cli'
    ? getopt('', [
        'payload::',
        'host::',
        'port::',
        'database::',
        'user::',
        'password::',
        'matrix::',
        'primary-unit::',
        'reset',
        'dry-run',
        'payment-offset::',
        'sales-offset::',
        'closure-offset::',
        'boleto-offset::',
        'skip-notes',
        'skip-expenses',
        'skip-salary',
    ])
    : [
        'payload' => $_GET['payload'] ?? null,
        'host' => $_GET['host'] ?? null,
        'port' => $_GET['port'] ?? null,
        'database' => $_GET['database'] ?? null,
        'user' => $_GET['user'] ?? null,
        'password' => $_GET['password'] ?? null,
        'matrix' => $_GET['matrix'] ?? null,
        'primary-unit' => $_GET['primary-unit'] ?? ($_GET['primary_unit'] ?? null),
        'dry-run' => isset($_GET['dry_run']) || isset($_GET['dry-run']),
    ];

$cliArguments = $_SERVER['argv'] ?? [];
$dryRunRequested = php_sapi_name() === 'cli'
    ? in_array('--dry-run', $cliArguments, true) || in_array('--dry_run', $cliArguments, true)
    : (bool) ($options['dry-run'] ?? false);

$payloadPath = (string) ($options['payload'] ?? '');
if ($payloadPath === '') {
    $payloadPath = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'storage' . DIRECTORY_SEPARATOR . 'app' . DIRECTORY_SEPARATOR . 'kinghost-import' . DIRECTORY_SEPARATOR . 'kinghost_import_payload.json.gz';
}

$matrixName = trim((string) ($options['matrix'] ?? 'Jd.Paraiso'));
$resetRequested = array_key_exists('reset', $options);
$dryRun = $dryRunRequested;
$paymentOffset = isset($options['payment-offset']) ? (int) $options['payment-offset'] : 0;
$salesOffset = isset($options['sales-offset']) ? max(0, (int) $options['sales-offset']) : 0;
$closureOffset = isset($options['closure-offset']) ? max(0, (int) $options['closure-offset']) : 0;
$boletoOffset = isset($options['boleto-offset']) ? max(0, (int) $options['boleto-offset']) : 0;
$skipNotes = array_key_exists('skip-notes', $options);
$skipExpenses = array_key_exists('skip-expenses', $options);
$skipSalary = array_key_exists('skip-salary', $options);

$dbHost = trim((string) ($options['host'] ?? ($_ENV['DB_HOST'] ?? getenv('DB_HOST') ?: '127.0.0.1')));
$dbPort = (int) ($options['port'] ?? ($_ENV['DB_PORT'] ?? getenv('DB_PORT') ?: 3306));
$dbName = trim((string) ($options['database'] ?? ($_ENV['DB_DATABASE'] ?? getenv('DB_DATABASE') ?: '')));
$dbUser = trim((string) ($options['user'] ?? ($_ENV['DB_USERNAME'] ?? getenv('DB_USERNAME') ?: 'root')));
$dbPassword = (string) ($options['password'] ?? ($_ENV['DB_PASSWORD'] ?? getenv('DB_PASSWORD') ?: ''));

if ($dbName === '') {
    fwrite(STDERR, "Banco de dados de destino nao informado.\n");
    exit(1);
}

if (! is_file($payloadPath)) {
    fwrite(STDERR, "Arquivo de payload nao encontrado: {$payloadPath}\n");
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

if ($resetRequested && ! $dryRun) {
    resetDestinationTables($pdo);
}

$payload = loadPayload($payloadPath);

$tables = $payload['tables'] ?? [];
$meta = $payload['meta'] ?? [];
$primaryUnitName = trim((string) ($options['primary-unit'] ?? ($meta['source_primary_unit_name'] ?? 'Jd.Paraiso')));

$matrixId = resolveMatrixId($pdo, $matrixName);

$report = [
    'meta' => $meta,
    'matrix' => [
        'name' => $matrixName,
        'id' => $matrixId,
    ],
    'dry_run' => $dryRun,
    'tables' => [],
];

$unitMap = [];
$userMap = [];
$supplierMap = [];
$productMap = [];
$productNameMap = [];
$paymentMap = [];
$saleMap = [];
$noteMap = [];
$closureMap = [];
$expenseMap = [];
$advanceMap = [];
$boletoMap = [];
$chatMap = [];
$controlPaymentMap = [];
$stockMap = [];
$disputeMap = [];
$bidMap = [];
$ticketMap = [];
$interactionMap = [];
$attachmentMap = [];
$anyDeskMap = [];
$configMap = [];

$tableStats = [];

processSuppliers($pdo, $tables['suppliers'] ?? [], $supplierMap, $tableStats, $dryRun);
processUnits($pdo, $tables['tb2_unidades'] ?? [], $matrixId, $primaryUnitName, $unitMap, $tableStats, $dryRun);
processUsers($pdo, $tables['users'] ?? [], $matrixId, $unitMap, $userMap, $tableStats, $dryRun);
processUnitUsers($pdo, $tables['tb2_unidade_user'] ?? [], $unitMap, $userMap, $tableStats, $dryRun);
processProducts($pdo, $tables['tb1_produto'] ?? [], $matrixId, $productMap, $productNameMap, $tableStats, $dryRun);
processConfigs($pdo, $tables['tb26_configuracoes_fiscais'] ?? [], $matrixId, $unitMap, $configMap, $tableStats, $dryRun);
processPayments($pdo, $tables['tb4_vendas_pg'] ?? [], $paymentMap, $tableStats, $dryRun, $paymentOffset);
processSales($pdo, $tables['tb3_vendas'] ?? [], $paymentMap, $productMap, $productNameMap, $matrixId, $userMap, $unitMap, $saleMap, $tableStats, $dryRun, $salesOffset);
if (! $skipNotes) {
    processNotes($pdo, $tables['tb27_notas_fiscais'] ?? [], $paymentMap, $unitMap, $configMap, $noteMap, $tableStats, $dryRun);
}
processClosures($pdo, $tables['cashier_closures'] ?? [], $userMap, $unitMap, $closureMap, $tableStats, $dryRun, $closureOffset);
if (! $skipExpenses) {
    processExpenses($pdo, $tables['expenses'] ?? [], $supplierMap, $unitMap, $userMap, $expenseMap, $tableStats, $dryRun);
}
if (! $skipSalary) {
    processSalaryAdvances($pdo, $tables['salary_advances'] ?? [], $unitMap, $userMap, $advanceMap, $tableStats, $dryRun);
}
processBoletos($pdo, $tables['tb_16_boletos'] ?? [], $unitMap, $userMap, $boletoMap, $tableStats, $dryRun, $boletoOffset);
processChatMessages($pdo, $tables['tb22_chat_mensagens'] ?? [], $userMap, $unitMap, $chatMap, $tableStats, $dryRun);
processControlPayments($pdo, $tables['tb24_controle_pagamentos'] ?? [], $userMap, $controlPaymentMap, $tableStats, $dryRun);
processStockMovements($pdo, $tables['tb25_produto_movimentacoes'] ?? [], $productMap, $userMap, $stockMap, $tableStats, $dryRun);
processSalesDisputes($pdo, $tables['sales_disputes'] ?? [], $userMap, $disputeMap, $tableStats, $dryRun);
processSalesDisputeBids($pdo, $tables['sales_dispute_bids'] ?? [], $disputeMap, $supplierMap, $userMap, $bidMap, $tableStats, $dryRun);
processSupportTickets($pdo, $tables['tb18_chamados'] ?? [], $userMap, $unitMap, $ticketMap, $tableStats, $dryRun);
processSupportTicketInteractions($pdo, $tables['tb19_chamado_interacoes'] ?? [], $ticketMap, $userMap, $interactionMap, $tableStats, $dryRun);
processSupportTicketAttachments($pdo, $tables['tb20_chamado_anexos'] ?? [], $interactionMap, $attachmentMap, $tableStats, $dryRun);
processAnyDeskCodes($pdo, $tables['tb23_anydesck_codigos'] ?? [], $unitMap, $anyDeskMap, $tableStats, $dryRun);
processProductDiscards($pdo, $tables['product_discards'] ?? [], $productMap, $userMap, $unitMap, $tableStats, $dryRun);

$report['tables'] = $tableStats;

emitResult($report);

function loadPayload(string $payloadPath): array
{
    $handle = gzopen($payloadPath, 'rb');
    if ($handle === false) {
        throw new RuntimeException('Nao foi possivel abrir o payload compactado.');
    }

    $raw = '';
    while (! gzeof($handle)) {
        $chunk = gzread($handle, 8192);
        if ($chunk === false) {
            gzclose($handle);
            throw new RuntimeException('Nao foi possivel ler o payload compactado.');
        }

        $raw .= $chunk;
    }

    gzclose($handle);

    $decoded = json_decode($raw, true);
    if (! is_array($decoded)) {
        throw new RuntimeException('Payload JSON invalido.');
    }

    return $decoded;
}

function resolveMatrixId(PDO $pdo, string $matrixName): int
{
    $tablesStmt = $pdo->query("SHOW TABLES LIKE 'tb30_matrizes'");
    if ($tablesStmt->fetchColumn() === false) {
        fwrite(STDERR, "Tabela tb30_matrizes nao encontrada; usando matriz 1 para simulacao local.\n");
        return 1;
    }

    $stmt = $pdo->prepare('SELECT tb30_id FROM tb30_matrizes WHERE LOWER(tb30_nome) = LOWER(?) OR LOWER(tb30_slug) = LOWER(?) LIMIT 1');
    $slug = normalizeKey($matrixName, false);
    $stmt->execute([$matrixName, $slug]);
    $matrixId = $stmt->fetchColumn();

    if ($matrixId === false) {
        $insert = $pdo->prepare('INSERT INTO tb30_matrizes (tb30_nome, tb30_slug, tb30_status, created_at, updated_at) VALUES (?, ?, 1, NOW(), NOW())');
        $insert->execute([$matrixName, $slug]);
        return (int) $pdo->lastInsertId();
    }

    return (int) $matrixId;
}

function normalizeKey(?string $value, bool $keepSpaces = true): string
{
    $value = trim((string) $value);
    if ($value === '') {
        return '';
    }

    $ascii = iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $value);
    if ($ascii !== false) {
        $value = $ascii;
    }

    $value = strtoupper($value);
    $value = preg_replace('/[^A-Z0-9]+/', $keepSpaces ? ' ' : '', $value) ?? $value;
    $value = $keepSpaces ? preg_replace('/\s+/', ' ', $value) ?? $value : $value;

    return trim($value);
}

function pick(array $row, array $keys, mixed $default = null): mixed
{
    foreach ($keys as $key) {
        if (array_key_exists($key, $row)) {
            return $row[$key];
        }
    }

    return $default;
}

function castNullOrString(mixed $value): ?string
{
    if ($value === null) {
        return null;
    }

    $value = trim((string) $value);

    return $value === '' ? null : $value;
}

function castString(mixed $value, string $default = ''): string
{
    $value = castNullOrString($value);

    return $value ?? $default;
}

function castInt(mixed $value, ?int $default = 0): ?int
{
    if ($value === null || $value === '') {
        return $default;
    }

    return (int) $value;
}

function castFloat(mixed $value, float $default = 0.0): float
{
    if ($value === null || $value === '') {
        return $default;
    }

    return (float) $value;
}

function targetColumns(PDO $pdo, string $table): array
{
    static $cache = [];

    if (isset($cache[$table])) {
        return $cache[$table];
    }

    $stmt = $pdo->prepare(
        'SELECT COLUMN_NAME
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = ?
         ORDER BY ORDINAL_POSITION'
    );
    $stmt->execute([$table]);

    return $cache[$table] = array_map(
        static fn (array $row) => (string) $row['COLUMN_NAME'],
        $stmt->fetchAll()
    );
}

function hasColumn(PDO $pdo, string $table, string $column): bool
{
    return in_array($column, targetColumns($pdo, $table), true);
}

function primaryKey(PDO $pdo, string $table): ?string
{
    static $cache = [];

    if (array_key_exists($table, $cache)) {
        return $cache[$table];
    }

    $stmt = $pdo->prepare(
        'SELECT COLUMN_NAME
         FROM information_schema.KEY_COLUMN_USAGE
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = ?
           AND CONSTRAINT_NAME = "PRIMARY"
         ORDER BY ORDINAL_POSITION
         LIMIT 1'
    );
    $stmt->execute([$table]);
    $column = $stmt->fetchColumn();

    return $cache[$table] = $column !== false ? (string) $column : null;
}

function insertRow(PDO $pdo, string $table, array $row): int
{
    if ($row === []) {
        throw new RuntimeException('Nao e possivel inserir linha vazia na tabela ' . $table);
    }

    $columns = array_keys($row);
    $columnSql = implode(', ', array_map(static fn (string $column) => '`' . $column . '`', $columns));
    $placeholderSql = implode(', ', array_fill(0, count($columns), '?'));
    $stmt = $pdo->prepare(sprintf('INSERT INTO `%s` (%s) VALUES (%s)', $table, $columnSql, $placeholderSql));
    $stmt->execute(array_values($row));

    return (int) $pdo->lastInsertId();
}

function updateRow(PDO $pdo, string $table, string $pk, int $id, array $row): void
{
    if ($row === []) {
        return;
    }

    $assignments = [];
    $values = [];

    foreach ($row as $column => $value) {
        if ($column === $pk) {
            continue;
        }

        $assignments[] = '`' . $column . '` = ?';
        $values[] = $value;
    }

    if ($assignments === []) {
        return;
    }

    $values[] = $id;
    $stmt = $pdo->prepare(sprintf('UPDATE `%s` SET %s WHERE `%s` = ?', $table, implode(', ', $assignments), $pk));
    $stmt->execute($values);
}

function tableStatsRow(string $table, int $selected, int $inserted, int $updated, int $skipped = 0): array
{
    return [
        'selecionados' => $selected,
        'inseridos' => $inserted,
        'atualizados' => $updated,
        'ignorados' => $skipped,
    ];
}

function executeUpsert(PDO $pdo, string $table, array $match, array $row): array
{
    $pk = primaryKey($pdo, $table);
    if ($pk === null) {
        throw new RuntimeException('Tabela sem chave primaria: ' . $table);
    }

    $where = [];
    $params = [];

    foreach ($match as $column => $value) {
        $where[] = '`' . $column . '` = ?';
        $params[] = $value;
    }

    $stmt = $pdo->prepare(sprintf('SELECT `%s` FROM `%s` WHERE %s LIMIT 1', $pk, $table, implode(' AND ', $where)));
    $stmt->execute($params);
    $existingId = $stmt->fetchColumn();

    if ($existingId !== false) {
        updateRow($pdo, $table, $pk, (int) $existingId, $row);

        return ['id' => (int) $existingId, 'created' => false];
    }

    $id = insertRow($pdo, $table, $row);

    return ['id' => $id, 'created' => true];
}

function normalizeMaybeDateTime(mixed $value): ?string
{
    $value = castNullOrString($value);

    return $value === null ? null : $value;
}

function normalizeJson(mixed $value): ?string
{
    if ($value === null || $value === '') {
        return null;
    }

    if (is_string($value)) {
        $decoded = json_decode($value, true);
        if (json_last_error() === JSON_ERROR_NONE) {
            return json_encode($decoded, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        }
    }

    return json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}

function ensureMatrixColumn(array $row, int $matrixId, PDO $pdo, string $table): array
{
    if (hasColumn($pdo, $table, 'matriz_id')) {
        $row['matriz_id'] = $matrixId;
    }

    return $row;
}

function selectOne(PDO $pdo, string $table, array $criteria): ?array
{
    if ($criteria === []) {
        return null;
    }

    $clauses = [];
    $values = [];

    foreach ($criteria as $column => $value) {
        if ($value === null) {
            $clauses[] = '`' . $column . '` IS NULL';
            continue;
        }

        $clauses[] = '`' . $column . '` = ?';
        $values[] = $value;
    }

    $stmt = $pdo->prepare(sprintf('SELECT * FROM `%s` WHERE %s LIMIT 1', $table, implode(' AND ', $clauses)));
    $stmt->execute($values);

    $row = $stmt->fetch();

    return $row !== false ? $row : null;
}

function selectOneMatrixScope(PDO $pdo, string $table, array $criteria, ?int $matrixId): ?array
{
    $matrixColumn = hasColumn($pdo, $table, 'matriz_id') ? 'matriz_id' : (hasColumn($pdo, $table, 'matrix_id') ? 'matrix_id' : null);

    if ($matrixColumn === null) {
        return selectOne($pdo, $table, $criteria);
    }

    $scopes = [$matrixId, null];
    foreach ($scopes as $scopeMatrixId) {
        $searchCriteria = $criteria;
        $searchCriteria[$matrixColumn] = $scopeMatrixId;
        $row = selectOne($pdo, $table, $searchCriteria);
        if ($row !== null) {
            return $row;
        }
    }

    return null;
}

function isTrueLike(mixed $value): bool
{
    return in_array(strtolower((string) $value), ['1', 'true', 'yes', 'on'], true);
}

function reportTable(array &$stats, string $table, int $selected, int $inserted, int $updated, int $skipped = 0): void
{
    $stats[$table] = tableStatsRow($table, $selected, $inserted, $updated, $skipped);
}

function processSuppliers(PDO $pdo, array $rows, array &$supplierMap, array &$stats, bool $dryRun): void
{
    $selected = count($rows);
    $inserted = 0;
    $updated = 0;

    foreach ($rows as $row) {
        $sourceId = (int) ($row['id'] ?? 0);
        if ($sourceId <= 0) {
            continue;
        }

        $name = castString($row['name'] ?? null);
        $accessCode = castString($row['access_code'] ?? null);
        $payload = [
            'name' => $name,
            'dispute' => isTrueLike($row['dispute'] ?? false) ? 1 : 0,
            'access_code' => $accessCode !== '' ? $accessCode : (string) random_int(1000, 9999),
        ];

        $existing = null;
        if ($accessCode !== '') {
            $existing = selectOne($pdo, 'suppliers', ['access_code' => $accessCode]);
        }
        if ($existing === null && $name !== '') {
            $existing = selectOne($pdo, 'suppliers', ['name' => $name]);
        }

        if ($existing !== null) {
            $supplierMap[$sourceId] = (int) $existing['id'];
            if (! $dryRun) {
                updateRow($pdo, 'suppliers', 'id', (int) $existing['id'], $payload);
            }
            $updated++;
            continue;
        }

        if (! $dryRun) {
            $newId = insertRow($pdo, 'suppliers', $payload);
            $supplierMap[$sourceId] = $newId;
        } else {
            $supplierMap[$sourceId] = $sourceId;
        }
        $inserted++;
    }

    reportTable($stats, 'suppliers', $selected, $inserted, $updated);
}

function processUnits(PDO $pdo, array $rows, int $matrixId, string $primaryUnitName, array &$unitMap, array &$stats, bool $dryRun): void
{
    $selected = count($rows);
    $inserted = 0;
    $updated = 0;

    $targetColumns = targetColumns($pdo, 'tb2_unidades');
    $hasTipo = in_array('tb2_tipo', $targetColumns, true);
    $normalizedPrimaryUnit = normalizeKey($primaryUnitName);

    foreach ($rows as $row) {
        $sourceId = (int) ($row['tb2_id'] ?? 0);
        if ($sourceId <= 0) {
            continue;
        }

        $name = castString($row['tb2_nome'] ?? null);
        $normalized = normalizeKey($name);

        $existing = null;
        if ($name !== '') {
            $criteria = ['tb2_nome' => $name];
            if (hasColumn($pdo, 'tb2_unidades', 'matriz_id')) {
                $criteria['matriz_id'] = $matrixId;
            }
            $existing = selectOne($pdo, 'tb2_unidades', $criteria);
            if ($existing === null && hasColumn($pdo, 'tb2_unidades', 'matriz_id')) {
                $rowsByMatrix = $pdo->prepare('SELECT * FROM tb2_unidades WHERE matriz_id = ?');
                $rowsByMatrix->execute([$matrixId]);
                foreach ($rowsByMatrix->fetchAll() as $candidate) {
                    if (normalizeKey((string) ($candidate['tb2_nome'] ?? '')) === $normalized) {
                        $existing = $candidate;
                        break;
                    }
                }
            }
        }

        $payload = [];
        foreach (['tb2_id_origem', 'tb2_nome', 'tb2_endereco', 'tb2_cep', 'tb2_fone', 'tb2_cnpj', 'tb2_localizacao'] as $column) {
            if (in_array($column, $targetColumns, true)) {
                $payload[$column] = $column === 'tb2_id_origem'
                    ? $sourceId
                    : castString($row[$column] ?? null);
            }
        }

        if (in_array('tb2_id', $targetColumns, true)) {
            unset($payload['tb2_id']);
        }

        if (hasColumn($pdo, 'tb2_unidades', 'tb2_status')) {
            $payload['tb2_status'] = array_key_exists('tb2_status', $row)
                ? (int) $row['tb2_status']
                : 1;
        }

        $payload = ensureMatrixColumn($payload, $matrixId, $pdo, 'tb2_unidades');

        if ($hasTipo) {
            $payload['tb2_tipo'] = $normalized !== '' && $normalized === $normalizedPrimaryUnit ? 'matriz' : 'filial';
        }

        if ($existing !== null) {
            $unitMap[$sourceId] = (int) $existing['tb2_id'];
            if (! $dryRun) {
                updateRow($pdo, 'tb2_unidades', 'tb2_id', (int) $existing['tb2_id'], $payload);
            }
            $updated++;
            continue;
        }

        if (! $dryRun) {
            $newId = insertRow($pdo, 'tb2_unidades', $payload);
            $unitMap[$sourceId] = $newId;
        } else {
            $unitMap[$sourceId] = $sourceId;
        }
        $inserted++;
    }

    reportTable($stats, 'tb2_unidades', $selected, $inserted, $updated);
}

function processUsers(PDO $pdo, array $rows, int $matrixId, array $unitMap, array &$userMap, array &$stats, bool $dryRun): void
{
    $selected = count($rows);
    $inserted = 0;
    $updated = 0;
    $targetColumns = targetColumns($pdo, 'users');

    foreach ($rows as $row) {
        $sourceId = (int) ($row['id'] ?? 0);
        if ($sourceId <= 0) {
            continue;
        }

        $name = castString($row['name'] ?? null);
        $email = castString($row['email'] ?? null);
        $normalizedName = normalizeKey($name);

        $payload = [];
        foreach (['name', 'email', 'phone', 'chave_pix', 'password', 'funcao', 'funcao_original', 'hr_ini', 'hr_fim', 'salario', 'vr_cred', 'payment_day', 'is_active', 'cod_acesso'] as $column) {
            if (! in_array($column, $targetColumns, true)) {
                continue;
            }

            $payload[$column] = match ($column) {
                'name' => $name,
                'email' => $email,
                'phone', 'chave_pix', 'password', 'hr_ini', 'hr_fim', 'cod_acesso' => castNullOrString($row[$column] ?? null),
                'funcao', 'funcao_original', 'payment_day' => array_key_exists($column, $row) ? castInt($row[$column], null) : null,
                'salario', 'vr_cred' => array_key_exists($column, $row) ? castFloat($row[$column], 0.0) : 0.0,
                'is_active' => array_key_exists($column, $row) ? (isTrueLike($row[$column]) ? 1 : 0) : 1,
                default => $row[$column] ?? null,
            };
        }

        if (in_array('id', $targetColumns, true)) {
            unset($payload['id']);
        }

        if (in_array('tb2_id', $targetColumns, true)) {
            $sourceUnitId = castInt($row['tb2_id'] ?? null, null);
            $fallbackUnitId = $unitMap !== [] ? (int) reset($unitMap) : null;
            $payload['tb2_id'] = $sourceUnitId !== null && isset($unitMap[$sourceUnitId]) ? $unitMap[$sourceUnitId] : $fallbackUnitId;
        }

        if (in_array('matriz_id', $targetColumns, true)) {
            $payload['matriz_id'] = $matrixId;
        }

        $existing = null;
        if ($email !== '') {
            $existing = selectOne($pdo, 'users', ['email' => $email]);
        }
        if ($existing === null && array_key_exists('cod_acesso', $row) && castNullOrString($row['cod_acesso'] ?? null) !== null) {
            $existing = selectOne($pdo, 'users', ['cod_acesso' => castNullOrString($row['cod_acesso'] ?? null)]);
        }
        if ($existing === null && $name !== '') {
            $nameCriteria = ['name' => $name];
            if (hasColumn($pdo, 'users', 'matriz_id')) {
                $nameCriteria['matriz_id'] = $matrixId;
            }
            $existing = selectOne($pdo, 'users', $nameCriteria);
        }
        if ($existing === null && $name !== '' && hasColumn($pdo, 'users', 'matriz_id')) {
            $stmt = $pdo->prepare('SELECT * FROM users WHERE matriz_id = ?');
            $stmt->execute([$matrixId]);
            foreach ($stmt->fetchAll() as $candidate) {
                if (normalizeKey((string) ($candidate['name'] ?? '')) === $normalizedName) {
                    $existing = $candidate;
                    break;
                }
            }
        }

        if ($existing !== null) {
            $userMap[$sourceId] = (int) $existing['id'];
            if (! $dryRun) {
                updateRow($pdo, 'users', 'id', (int) $existing['id'], $payload);
            }
            $updated++;
            continue;
        }

        if (! $dryRun) {
            $newId = insertRow($pdo, 'users', $payload);
            $userMap[$sourceId] = $newId;
        } else {
            $userMap[$sourceId] = $sourceId;
        }
        $inserted++;
    }

    reportTable($stats, 'users', $selected, $inserted, $updated);
}

function processUnitUsers(PDO $pdo, array $rows, array $unitMap, array $userMap, array &$stats, bool $dryRun): void
{
    $selected = count($rows);
    $inserted = 0;
    $updated = 0;

    foreach ($rows as $row) {
        $sourceUserId = (int) ($row['user_id'] ?? 0);
        $sourceUnitId = (int) ($row['tb2_id'] ?? 0);

        if ($sourceUserId <= 0 || $sourceUnitId <= 0 || ! isset($userMap[$sourceUserId], $unitMap[$sourceUnitId])) {
            continue;
        }

        $payload = [
            'user_id' => $userMap[$sourceUserId],
            'tb2_id' => $unitMap[$sourceUnitId],
        ];

        $existing = selectOne($pdo, 'tb2_unidade_user', $payload);
        if ($existing !== null) {
            $updated++;
            continue;
        }

        if (! $dryRun) {
            insertRow($pdo, 'tb2_unidade_user', array_merge($payload, [
                'created_at' => $row['created_at'] ?? nowString(),
                'updated_at' => $row['updated_at'] ?? nowString(),
            ]));
        }
        $inserted++;
    }

    reportTable($stats, 'tb2_unidade_user', $selected, $inserted, $updated);
}

function processProducts(PDO $pdo, array $rows, int $matrixId, array &$productMap, array &$productNameMap, array &$stats, bool $dryRun): void
{
    $selected = count($rows);
    $inserted = 0;
    $updated = 0;
    $targetColumns = targetColumns($pdo, 'tb1_produto');
    $productCodeColumn = null;
    foreach (['codigoProduto', 'produto_id'] as $candidateColumn) {
        if (in_array($candidateColumn, $targetColumns, true)) {
            $productCodeColumn = $candidateColumn;
            break;
        }
    }

    foreach ($rows as $row) {
        $sourceId = (int) ($row['tb1_id'] ?? 0);
        if ($sourceId <= 0) {
            continue;
        }

        $name = castString($row['tb1_nome'] ?? null);
        $codbar = castString($row['tb1_codbar'] ?? null);
        $payload = [];
        foreach (['tb1_nome', 'tb1_vlr_custo', 'tb1_vlr_venda', 'tb1_codbar', 'tb1_ncm', 'tb1_cest', 'tb1_cfop', 'tb1_unidade_comercial', 'tb1_unidade_tributavel', 'tb1_origem', 'tb1_csosn', 'tb1_cst', 'tb1_aliquota_icms', 'tb1_tipo', 'tb1_qtd', 'tb1_status', 'tb1_favorito', 'tb1_vr_credit'] as $column) {
            if (! in_array($column, $targetColumns, true)) {
                continue;
            }

            $payload[$column] = match ($column) {
                'tb1_nome', 'tb1_codbar', 'tb1_ncm', 'tb1_cest', 'tb1_cfop', 'tb1_unidade_comercial', 'tb1_unidade_tributavel', 'tb1_csosn', 'tb1_cst' => castNullOrString($row[$column] ?? null),
                'tb1_vlr_custo', 'tb1_vlr_venda', 'tb1_aliquota_icms' => array_key_exists($column, $row) ? castFloat($row[$column], 0.0) : 0.0,
                'tb1_origem', 'tb1_tipo', 'tb1_qtd', 'tb1_status' => array_key_exists($column, $row) ? castInt($row[$column], 0) : 0,
                'tb1_favorito', 'tb1_vr_credit' => array_key_exists($column, $row) ? (isTrueLike($row[$column]) ? 1 : 0) : 0,
                default => $row[$column] ?? null,
            };
        }

        $payload = ensureMatrixColumn($payload, $matrixId, $pdo, 'tb1_produto');

        if ($productCodeColumn !== null) {
            $payload[$productCodeColumn] = $sourceId;
        }

        $existing = null;
        if ($productCodeColumn !== null) {
            $existing = selectOneMatrixScope($pdo, 'tb1_produto', [
                $productCodeColumn => $sourceId,
            ], $matrixId);
        }
        if ($existing === null && $codbar !== '') {
            $existing = selectOne($pdo, 'tb1_produto', [
                'tb1_codbar' => $codbar,
            ]);
        }

        if ($existing !== null) {
            $productMap[$sourceId] = (int) $existing['tb1_id'];
            if ($name !== '') {
                $productNameMap['name:' . normalizeKey($name)] = (int) $existing['tb1_id'];
            }
            if (! $dryRun) {
                updateRow($pdo, 'tb1_produto', 'tb1_id', (int) $existing['tb1_id'], $payload);
            }
            $updated++;
            continue;
        }

        if (! $dryRun) {
            $newId = insertRow($pdo, 'tb1_produto', $payload);
            $productMap[$sourceId] = $newId;
            if ($name !== '') {
                $productNameMap['name:' . normalizeKey($name)] = $newId;
            }
        } else {
            $productMap[$sourceId] = $sourceId;
            if ($name !== '') {
                $productNameMap['name:' . normalizeKey($name)] = $sourceId;
            }
        }
        $inserted++;
    }

    reportTable($stats, 'tb1_produto', $selected, $inserted, $updated);
}

function processConfigs(PDO $pdo, array $rows, int $matrixId, array $unitMap, array &$configMap, array &$stats, bool $dryRun): void
{
    $selected = count($rows);
    $inserted = 0;
    $updated = 0;
    $targetColumns = targetColumns($pdo, 'tb26_configuracoes_fiscais');

    foreach ($rows as $row) {
        $sourceId = (int) ($row['tb26_id'] ?? 0);
        $sourceUnitId = (int) ($row['tb2_id'] ?? 0);
        $targetUnitId = $sourceUnitId > 0 && isset($unitMap[$sourceUnitId]) ? $unitMap[$sourceUnitId] : null;

        if ($targetUnitId === null) {
            continue;
        }

        $payload = [];
        foreach ($targetColumns as $column) {
            if ($column === 'tb26_id') {
                continue;
            }
            if (! array_key_exists($column, $row) && $column !== 'tb2_id') {
                continue;
            }

            $payload[$column] = match ($column) {
                'tb2_id' => $targetUnitId,
                'tb26_emitir_nfe', 'tb26_emitir_nfce', 'tb26_geracao_automatica_ativa' => array_key_exists($column, $row) ? (isTrueLike($row[$column]) ? 1 : 0) : 0,
                'tb26_proximo_numero', 'tb26_crt' => array_key_exists($column, $row) ? castInt($row[$column], 0) : null,
                'tb26_certificado_valido_ate' => normalizeMaybeDateTime($row[$column] ?? null),
                default => castNullOrString($row[$column] ?? null),
            };
        }

        $existing = selectOne($pdo, 'tb26_configuracoes_fiscais', ['tb2_id' => $targetUnitId]);
        if ($existing !== null) {
            $configMap[$sourceId] = (int) $existing['tb26_id'];
            if (! $dryRun) {
                updateRow($pdo, 'tb26_configuracoes_fiscais', 'tb26_id', (int) $existing['tb26_id'], $payload);
            }
            $updated++;
            continue;
        }

        if (! $dryRun) {
            $newId = insertRow($pdo, 'tb26_configuracoes_fiscais', $payload);
            $configMap[$sourceId] = $newId;
        } else {
            $configMap[$sourceId] = $sourceId;
        }
        $inserted++;
    }

    reportTable($stats, 'tb26_configuracoes_fiscais', $selected, $inserted, $updated);
}

function processPayments(PDO $pdo, array $rows, array &$paymentMap, array &$stats, bool $dryRun, int $paymentOffset = 0): void
{
    $selected = count($rows);
    $inserted = 0;
    $updated = 0;
    $targetColumns = targetColumns($pdo, 'tb4_vendas_pg');

    foreach ($rows as $row) {
        $sourceId = (int) ($row['tb4_id'] ?? 0);
        if ($sourceId <= 0) {
            continue;
        }

        if ($paymentOffset > 0) {
            $paymentMap[$sourceId] = $sourceId + $paymentOffset;
            $inserted++;
            continue;
        }

        $payload = [];
        foreach ($targetColumns as $column) {
            if ($column === 'tb4_id') {
                continue;
            }
            if (! array_key_exists($column, $row)) {
                continue;
            }

            $payload[$column] = match ($column) {
                'valor_total', 'valor_pago', 'troco', 'dois_pgto' => castFloat($row[$column], 0.0),
                default => $row[$column],
            };
        }

        if (! $dryRun) {
            $newId = insertRow($pdo, 'tb4_vendas_pg', $payload);
            $paymentMap[$sourceId] = $newId;
        } else {
            $paymentMap[$sourceId] = $sourceId;
        }
        $inserted++;
    }

    reportTable($stats, 'tb4_vendas_pg', $selected, $inserted, $updated);
}

function processSales(PDO $pdo, array $rows, array $paymentMap, array &$productMap, array &$productNameMap, int $matrixId, array $userMap, array $unitMap, array &$saleMap, array &$stats, bool $dryRun, int $salesOffset = 0): void
{
    if ($salesOffset > 0) {
        $rows = array_slice($rows, $salesOffset);
    }

    $selected = count($rows);
    $inserted = 0;
    $updated = 0;
    $targetColumns = targetColumns($pdo, 'tb3_vendas');

    foreach ($rows as $row) {
        $sourceId = (int) ($row['tb3_id'] ?? 0);
        if ($sourceId <= 0) {
            continue;
        }

        $sourcePaymentId = castInt($row['tb4_id'] ?? null, null);
        $sourceProductId = castInt($row['tb1_id'] ?? null, null);
        $productName = castString($row['produto_nome'] ?? null);
        $sourceCashierId = castInt($row['id_user_caixa'] ?? null, null);
        $sourceValeId = castInt($row['id_user_vale'] ?? null, null);
        $sourceLaunchId = castInt($row['id_lanc'] ?? null, null);
        $sourceUnitId = castInt($row['id_unidade'] ?? null, null);
        $targetProductId = $sourceProductId !== null && isset($productMap[$sourceProductId])
            ? $productMap[$sourceProductId]
            : null;
        if ($targetProductId === null && $productName !== '') {
            $normalizedProductName = 'name:' . normalizeKey($productName);
            $targetProductId = $productNameMap[$normalizedProductName] ?? null;
        }
        if ($targetProductId === null && ! $dryRun) {
            $fallbackName = $productName !== '' ? $productName : ('PRODUTO SEM NOME ' . $sourceId);
            $fallbackCode = 'SALE-' . $sourceId;
            $productPayload = [];
            foreach (targetColumns($pdo, 'tb1_produto') as $column) {
                if ($column === 'tb1_id') {
                    continue;
                }

                $productPayload[$column] = match ($column) {
                    'tb1_nome' => mb_substr($fallbackName, 0, 45),
                    'tb1_vlr_custo', 'tb1_vlr_venda', 'tb1_aliquota_icms' => 0.0,
                    'tb1_codbar' => mb_substr($fallbackCode, 0, 64),
                    'tb1_ncm', 'tb1_cest', 'tb1_cfop', 'tb1_csosn', 'tb1_cst' => null,
                    'tb1_unidade_comercial', 'tb1_unidade_tributavel' => 'UN',
                    'tb1_origem', 'tb1_tipo', 'tb1_qtd', 'tb1_status', 'tb1_favorito', 'tb1_vr_credit' => 0,
                    default => castNullOrString($row[$column] ?? null),
                };
            }

            $productPayload = ensureMatrixColumn($productPayload, $matrixId, $pdo, 'tb1_produto');
            $targetProductId = insertRow($pdo, 'tb1_produto', $productPayload);
            if ($sourceProductId !== null) {
                $productMap[$sourceProductId] = $targetProductId;
            }
            $productNameMap['name:' . normalizeKey($fallbackName)] = $targetProductId;
        }
        if ($targetProductId === null && $dryRun) {
            $targetProductId = -$sourceId;
        }

        $payload = [];
        foreach ($targetColumns as $column) {
            if ($column === 'tb3_id') {
                continue;
            }

            $payload[$column] = match ($column) {
                'tb4_id' => $sourcePaymentId !== null && isset($paymentMap[$sourcePaymentId]) ? $paymentMap[$sourcePaymentId] : null,
                'tb1_id' => $targetProductId,
                'id_user_caixa' => $sourceCashierId !== null && isset($userMap[$sourceCashierId]) ? $userMap[$sourceCashierId] : null,
                'id_user_vale' => $sourceValeId !== null && isset($userMap[$sourceValeId]) ? $userMap[$sourceValeId] : null,
                'id_lanc' => $sourceLaunchId !== null && isset($userMap[$sourceLaunchId]) ? $userMap[$sourceLaunchId] : null,
                'id_unidade' => $sourceUnitId !== null && isset($unitMap[$sourceUnitId]) ? $unitMap[$sourceUnitId] : null,
                'valor_unitario', 'valor_total' => castFloat($row[$column] ?? null, 0.0),
                'quantidade', 'status' => castInt($row[$column] ?? null, 0),
                'status_pago' => isTrueLike($row[$column] ?? false) ? 1 : 0,
                'data_hora' => normalizeMaybeDateTime($row[$column] ?? null),
                default => $row[$column] ?? null,
            };
        }

        if (! $dryRun) {
            $newId = insertRow($pdo, 'tb3_vendas', $payload);
            $saleMap[$sourceId] = $newId;
        } else {
            $saleMap[$sourceId] = $sourceId;
        }
        $inserted++;
    }

    reportTable($stats, 'tb3_vendas', $selected, $inserted, $updated);
}

function processNotes(PDO $pdo, array $rows, array $paymentMap, array $unitMap, array $configMap, array &$noteMap, array &$stats, bool $dryRun): void
{
    $selected = count($rows);
    $inserted = 0;
    $updated = 0;
    $targetColumns = targetColumns($pdo, 'tb27_notas_fiscais');

    foreach ($rows as $row) {
        $sourceId = (int) ($row['tb27_id'] ?? 0);
        if ($sourceId <= 0) {
            continue;
        }

        $sourcePaymentId = castInt($row['tb4_id'] ?? null, null);
        $sourceUnitId = castInt($row['tb2_id'] ?? null, null);
        $targetUnitId = $sourceUnitId !== null && isset($unitMap[$sourceUnitId]) ? $unitMap[$sourceUnitId] : null;
        $sourceConfigId = castInt($row['tb26_id'] ?? null, null);
        $targetConfigId = $sourceConfigId !== null && isset($configMap[$sourceConfigId]) ? $configMap[$sourceConfigId] : null;

        if ($sourcePaymentId === null || ! isset($paymentMap[$sourcePaymentId]) || $targetUnitId === null) {
            continue;
        }

        $payload = [];
        foreach ($targetColumns as $column) {
            if ($column === 'tb27_id') {
                continue;
            }

            $payload[$column] = match ($column) {
                'tb4_id' => $paymentMap[$sourcePaymentId],
                'tb2_id' => $targetUnitId,
                'tb26_id' => $targetConfigId,
                'tb27_numero' => castInt($row[$column] ?? null, null),
                'tb27_payload', 'tb27_erros' => normalizeJson($row[$column] ?? null),
                'tb27_emitida_em', 'tb27_cancelada_em', 'tb27_ultima_tentativa_em' => normalizeMaybeDateTime($row[$column] ?? null),
                default => $row[$column] ?? null,
            };
        }

        if (! $dryRun) {
            $newId = insertRow($pdo, 'tb27_notas_fiscais', $payload);
            $noteMap[$sourceId] = $newId;
        } else {
            $noteMap[$sourceId] = $sourceId;
        }
        $inserted++;
    }

    reportTable($stats, 'tb27_notas_fiscais', $selected, $inserted, $updated);
}

function processClosures(PDO $pdo, array $rows, array $userMap, array $unitMap, array &$closureMap, array &$stats, bool $dryRun, int $closureOffset = 0): void
{
    if ($closureOffset > 0) {
        $rows = array_slice($rows, $closureOffset);
    }

    $selected = count($rows);
    $inserted = 0;
    $updated = 0;
    $targetColumns = targetColumns($pdo, 'cashier_closures');

    foreach ($rows as $row) {
        $sourceId = (int) ($row['id'] ?? 0);
        if ($sourceId <= 0) {
            continue;
        }

        $sourceUserId = castInt($row['user_id'] ?? null, null);
        $sourceUnitId = castInt($row['unit_id'] ?? null, null);
        $sourceMasterId = castInt($row['master_checked_by'] ?? null, null);

        $existing = null;
        if ($sourceUserId !== null && $sourceUnitId !== null && isset($userMap[$sourceUserId], $unitMap[$sourceUnitId])) {
            $existing = selectOneMatrixScope($pdo, 'cashier_closures', [
                'user_id' => $userMap[$sourceUserId],
                'unit_id' => $unitMap[$sourceUnitId],
                'closed_date' => normalizeMaybeDateTime($row['closed_date'] ?? null),
            ], null);
        }

        $payload = [];
        foreach ($targetColumns as $column) {
            if ($column === 'id') {
                continue;
            }
            if ($column === 'tb1_id') {
                continue;
            }

            $payload[$column] = match ($column) {
                'user_id' => $sourceUserId !== null && isset($userMap[$sourceUserId]) ? $userMap[$sourceUserId] : null,
                'unit_id' => $sourceUnitId !== null && isset($unitMap[$sourceUnitId]) ? $unitMap[$sourceUnitId] : null,
                'master_checked_by' => $sourceMasterId !== null && isset($userMap[$sourceMasterId]) ? $userMap[$sourceMasterId] : null,
                'cash_amount', 'card_amount', 'master_cash_amount', 'master_card_amount' => castFloat($row[$column] ?? null, 0.0),
                'closed_date', 'closed_at', 'master_checked_at' => normalizeMaybeDateTime($row[$column] ?? null),
                default => castNullOrString($row[$column] ?? null),
            };
        }

        if ($existing !== null) {
            $closureMap[$sourceId] = (int) $existing['id'];
            if (! $dryRun) {
                updateRow($pdo, 'cashier_closures', 'id', (int) $existing['id'], $payload);
            }
            $updated++;
            continue;
        }

        if (! $dryRun) {
            $newId = insertRow($pdo, 'cashier_closures', $payload);
            $closureMap[$sourceId] = $newId;
        } else {
            $closureMap[$sourceId] = $sourceId;
        }
        $inserted++;
    }

    reportTable($stats, 'cashier_closures', $selected, $inserted, $updated);
}

function processExpenses(PDO $pdo, array $rows, array $supplierMap, array $unitMap, array $userMap, array &$expenseMap, array &$stats, bool $dryRun): void
{
    $selected = count($rows);
    $inserted = 0;
    $updated = 0;
    $targetColumns = targetColumns($pdo, 'expenses');

    foreach ($rows as $row) {
        $sourceId = (int) ($row['id'] ?? 0);
        if ($sourceId <= 0) {
            continue;
        }

        $sourceSupplierId = castInt($row['supplier_id'] ?? null, null);
        $sourceUnitId = castInt($row['unit_id'] ?? null, null);
        $sourceUserId = castInt($row['user_id'] ?? null, null);

        $payload = [];
        foreach ($targetColumns as $column) {
            if ($column === 'id') {
                continue;
            }
            if ($column === 'tb4_id') {
                continue;
            }

            $payload[$column] = match ($column) {
                'supplier_id' => $sourceSupplierId !== null && isset($supplierMap[$sourceSupplierId]) ? $supplierMap[$sourceSupplierId] : null,
                'unit_id' => $sourceUnitId !== null && isset($unitMap[$sourceUnitId]) ? $unitMap[$sourceUnitId] : null,
                'user_id' => $sourceUserId !== null && isset($userMap[$sourceUserId]) ? $userMap[$sourceUserId] : null,
                'expense_date' => normalizeMaybeDateTime($row[$column] ?? null),
                'amount' => castFloat($row[$column] ?? null, 0.0),
                default => castNullOrString($row[$column] ?? null),
            };
        }

        if (! $dryRun) {
            $newId = insertRow($pdo, 'expenses', $payload);
            $expenseMap[$sourceId] = $newId;
        } else {
            $expenseMap[$sourceId] = $sourceId;
        }
        $inserted++;
    }

    reportTable($stats, 'expenses', $selected, $inserted, $updated);
}

function processSalaryAdvances(PDO $pdo, array $rows, array $unitMap, array $userMap, array &$advanceMap, array &$stats, bool $dryRun): void
{
    $selected = count($rows);
    $inserted = 0;
    $updated = 0;
    $targetColumns = targetColumns($pdo, 'salary_advances');

    foreach ($rows as $row) {
        $sourceId = (int) ($row['id'] ?? 0);
        if ($sourceId <= 0) {
            continue;
        }

        $sourceUserId = castInt($row['user_id'] ?? null, null);
        $sourceUnitId = castInt($row['unit_id'] ?? null, null);

        $payload = [];
        foreach ($targetColumns as $column) {
            if ($column === 'id') {
                continue;
            }

            $payload[$column] = match ($column) {
                'user_id' => $sourceUserId !== null && isset($userMap[$sourceUserId]) ? $userMap[$sourceUserId] : null,
                'unit_id' => $sourceUnitId !== null && isset($unitMap[$sourceUnitId]) ? $unitMap[$sourceUnitId] : null,
                'advance_date' => normalizeMaybeDateTime($row[$column] ?? null),
                'amount' => castFloat($row[$column] ?? null, 0.0),
                default => castNullOrString($row[$column] ?? null),
            };
        }

        if (! $dryRun) {
            $newId = insertRow($pdo, 'salary_advances', $payload);
            $advanceMap[$sourceId] = $newId;
        } else {
            $advanceMap[$sourceId] = $sourceId;
        }
        $inserted++;
    }

    reportTable($stats, 'salary_advances', $selected, $inserted, $updated);
}

function processBoletos(PDO $pdo, array $rows, array $unitMap, array $userMap, array &$boletoMap, array &$stats, bool $dryRun, int $boletoOffset = 0): void
{
    if ($boletoOffset > 0) {
        $rows = array_slice($rows, $boletoOffset);
    }

    $selected = count($rows);
    $inserted = 0;
    $updated = 0;
    $targetColumns = targetColumns($pdo, 'tb_16_boletos');

    foreach ($rows as $row) {
        $sourceId = (int) ($row['id'] ?? 0);
        if ($sourceId <= 0) {
            continue;
        }

        $sourceUnitId = castInt($row['unit_id'] ?? null, null);
        $sourceUserId = castInt($row['user_id'] ?? null, null);
        $sourcePaidBy = castInt($row['paid_by'] ?? null, null);
        $barcodeFallback = castNullOrString($row['barcode'] ?? null);
        $digitableFallback = castNullOrString($row['digitable_line'] ?? null);
        if ($barcodeFallback === null || $barcodeFallback === '') {
            $barcodeFallback = $digitableFallback !== null && $digitableFallback !== ''
                ? $digitableFallback
                : ('BOLETO-' . $sourceId);
        }
        if ($digitableFallback === null || $digitableFallback === '') {
            $digitableFallback = $barcodeFallback;
        }

        $payload = [];
        foreach ($targetColumns as $column) {
            if ($column === 'id') {
                continue;
            }

            $payload[$column] = match ($column) {
                'unit_id' => $sourceUnitId !== null && isset($unitMap[$sourceUnitId]) ? $unitMap[$sourceUnitId] : null,
                'user_id' => $sourceUserId !== null && isset($userMap[$sourceUserId]) ? $userMap[$sourceUserId] : null,
                'paid_by' => $sourcePaidBy !== null && isset($userMap[$sourcePaidBy]) ? $userMap[$sourcePaidBy] : null,
                'amount' => castFloat($row[$column] ?? null, 0.0),
                'due_date', 'paid_at' => normalizeMaybeDateTime($row[$column] ?? null),
                'is_paid' => isTrueLike($row[$column] ?? false) ? 1 : 0,
                'barcode' => $barcodeFallback,
                'digitable_line' => $digitableFallback,
                default => castNullOrString($row[$column] ?? null),
            };
        }

        if (! $dryRun) {
            $newId = insertRow($pdo, 'tb_16_boletos', $payload);
            $boletoMap[$sourceId] = $newId;
        } else {
            $boletoMap[$sourceId] = $sourceId;
        }
        $inserted++;
    }

    reportTable($stats, 'tb_16_boletos', $selected, $inserted, $updated);
}

function processChatMessages(PDO $pdo, array $rows, array $userMap, array $unitMap, array &$chatMap, array &$stats, bool $dryRun): void
{
    $selected = count($rows);
    $inserted = 0;
    $updated = 0;
    $targetColumns = targetColumns($pdo, 'tb22_chat_mensagens');

    foreach ($rows as $row) {
        $sourceId = (int) ($row['id'] ?? 0);
        if ($sourceId <= 0) {
            continue;
        }

        $sourceSenderId = castInt($row['sender_id'] ?? null, null);
        $sourceRecipientId = castInt($row['recipient_id'] ?? null, null);
        $sourceUnitId = castInt($row['sender_unit_id'] ?? null, null);

        $payload = [];
        foreach ($targetColumns as $column) {
            if ($column === 'id') {
                continue;
            }

            $payload[$column] = match ($column) {
                'sender_id' => $sourceSenderId !== null && isset($userMap[$sourceSenderId]) ? $userMap[$sourceSenderId] : null,
                'recipient_id' => $sourceRecipientId !== null && isset($userMap[$sourceRecipientId]) ? $userMap[$sourceRecipientId] : null,
                'sender_unit_id' => $sourceUnitId !== null && isset($unitMap[$sourceUnitId]) ? $unitMap[$sourceUnitId] : null,
                'sender_role' => castInt($row[$column] ?? null, 0),
                'message' => castNullOrString($row[$column] ?? null),
                'read_at' => normalizeMaybeDateTime($row[$column] ?? null),
                default => castNullOrString($row[$column] ?? null),
            };
        }

        if (! $dryRun) {
            $newId = insertRow($pdo, 'tb22_chat_mensagens', $payload);
            $chatMap[$sourceId] = $newId;
        } else {
            $chatMap[$sourceId] = $sourceId;
        }
        $inserted++;
    }

    reportTable($stats, 'tb22_chat_mensagens', $selected, $inserted, $updated);
}

function processControlPayments(PDO $pdo, array $rows, array $userMap, array &$controlPaymentMap, array &$stats, bool $dryRun): void
{
    $selected = count($rows);
    $inserted = 0;
    $updated = 0;
    $targetColumns = targetColumns($pdo, 'tb24_controle_pagamentos');

    foreach ($rows as $row) {
        $sourceId = (int) ($row['id'] ?? 0);
        if ($sourceId <= 0) {
            continue;
        }

        $sourceUserId = castInt($row['user_id'] ?? null, null);
        $payload = [];
        foreach ($targetColumns as $column) {
            if ($column === 'id') {
                continue;
            }

            $payload[$column] = match ($column) {
                'user_id' => $sourceUserId !== null && isset($userMap[$sourceUserId]) ? $userMap[$sourceUserId] : null,
                'dia_semana', 'dia_mes', 'quantidade_parcelas' => castInt($row[$column] ?? null, 0),
                'valor_total', 'valor_parcela' => castFloat($row[$column] ?? null, 0.0),
                'data_inicio', 'data_fim' => normalizeMaybeDateTime($row[$column] ?? null),
                default => castNullOrString($row[$column] ?? null),
            };
        }

        if (! $dryRun) {
            $newId = insertRow($pdo, 'tb24_controle_pagamentos', $payload);
            $controlPaymentMap[$sourceId] = $newId;
        } else {
            $controlPaymentMap[$sourceId] = $sourceId;
        }
        $inserted++;
    }

    reportTable($stats, 'tb24_controle_pagamentos', $selected, $inserted, $updated);
}

function processStockMovements(PDO $pdo, array $rows, array $productMap, array $userMap, array &$stockMap, array &$stats, bool $dryRun): void
{
    $selected = count($rows);
    $inserted = 0;
    $updated = 0;
    $targetColumns = targetColumns($pdo, 'tb25_produto_movimentacoes');

    foreach ($rows as $row) {
        $sourceId = (int) ($row['id'] ?? 0);
        if ($sourceId <= 0) {
            continue;
        }

        $sourceProductId = castInt($row['product_id'] ?? null, null);
        $sourceUserId = castInt($row['user_id'] ?? null, null);

        $payload = [];
        foreach ($targetColumns as $column) {
            if ($column === 'id') {
                continue;
            }

            $payload[$column] = match ($column) {
                'product_id' => $sourceProductId !== null && isset($productMap[$sourceProductId]) ? $productMap[$sourceProductId] : null,
                'user_id' => $sourceUserId !== null && isset($userMap[$sourceUserId]) ? $userMap[$sourceUserId] : null,
                'movement_type', 'quantity', 'stock_before', 'stock_after' => castInt($row[$column] ?? null, 0),
                'notes' => castNullOrString($row[$column] ?? null),
                default => castNullOrString($row[$column] ?? null),
            };
        }

        if (! $dryRun) {
            $newId = insertRow($pdo, 'tb25_produto_movimentacoes', $payload);
            $stockMap[$sourceId] = $newId;
        } else {
            $stockMap[$sourceId] = $sourceId;
        }
        $inserted++;
    }

    reportTable($stats, 'tb25_produto_movimentacoes', $selected, $inserted, $updated);
}

function processSalesDisputes(PDO $pdo, array $rows, array $userMap, array &$disputeMap, array &$stats, bool $dryRun): void
{
    $selected = count($rows);
    $inserted = 0;
    $updated = 0;
    $targetColumns = targetColumns($pdo, 'sales_disputes');

    foreach ($rows as $row) {
        $sourceId = (int) ($row['id'] ?? 0);
        if ($sourceId <= 0) {
            continue;
        }

        $sourceCreatorId = castInt($row['created_by'] ?? null, null);
        $payload = [];
        foreach ($targetColumns as $column) {
            if ($column === 'id') {
                continue;
            }

            $payload[$column] = match ($column) {
                'created_by' => $sourceCreatorId !== null && isset($userMap[$sourceCreatorId]) ? $userMap[$sourceCreatorId] : null,
                'quantity' => castInt($row[$column] ?? null, 0),
                'product_name' => castNullOrString($row[$column] ?? null),
                default => castNullOrString($row[$column] ?? null),
            };
        }

        if (! $dryRun) {
            $newId = insertRow($pdo, 'sales_disputes', $payload);
            $disputeMap[$sourceId] = $newId;
        } else {
            $disputeMap[$sourceId] = $sourceId;
        }
        $inserted++;
    }

    reportTable($stats, 'sales_disputes', $selected, $inserted, $updated);
}

function processSalesDisputeBids(PDO $pdo, array $rows, array $disputeMap, array $supplierMap, array $userMap, array &$bidMap, array &$stats, bool $dryRun): void
{
    $selected = count($rows);
    $inserted = 0;
    $updated = 0;
    $targetColumns = targetColumns($pdo, 'sales_dispute_bids');

    foreach ($rows as $row) {
        $sourceId = (int) ($row['id'] ?? 0);
        if ($sourceId <= 0) {
            continue;
        }

        $sourceDisputeId = castInt($row['sales_dispute_id'] ?? null, null);
        $sourceSupplierId = castInt($row['supplier_id'] ?? null, null);
        $sourceApprovedBy = castInt($row['approved_by'] ?? null, null);

        if ($sourceDisputeId === null || ! isset($disputeMap[$sourceDisputeId]) || $sourceSupplierId === null || ! isset($supplierMap[$sourceSupplierId])) {
            continue;
        }

        $payload = [];
        foreach ($targetColumns as $column) {
            if ($column === 'id') {
                continue;
            }

            $payload[$column] = match ($column) {
                'sales_dispute_id' => $disputeMap[$sourceDisputeId],
                'supplier_id' => $supplierMap[$sourceSupplierId],
                'approved_by' => $sourceApprovedBy !== null && isset($userMap[$sourceApprovedBy]) ? $userMap[$sourceApprovedBy] : null,
                'unit_cost' => castFloat($row[$column] ?? null, 0.0),
                'approved_at', 'invoiced_at' => normalizeMaybeDateTime($row[$column] ?? null),
                'invoice_note', 'invoice_file_path' => castNullOrString($row[$column] ?? null),
                default => castNullOrString($row[$column] ?? null),
            };
        }

        if (! $dryRun) {
            $newId = insertRow($pdo, 'sales_dispute_bids', $payload);
            $bidMap[$sourceId] = $newId;
        } else {
            $bidMap[$sourceId] = $sourceId;
        }
        $inserted++;
    }

    reportTable($stats, 'sales_dispute_bids', $selected, $inserted, $updated);
}

function processSupportTickets(PDO $pdo, array $rows, array $userMap, array $unitMap, array &$ticketMap, array &$stats, bool $dryRun): void
{
    $selected = count($rows);
    $inserted = 0;
    $updated = 0;
    $targetColumns = targetColumns($pdo, 'tb18_chamados');

    foreach ($rows as $row) {
        $sourceId = (int) ($row['id'] ?? 0);
        if ($sourceId <= 0) {
            continue;
        }

        $sourceUserId = castInt($row['user_id'] ?? null, null);
        $sourceUnitId = castInt($row['unit_id'] ?? null, null);

        $payload = [];
        foreach ($targetColumns as $column) {
            if ($column === 'id') {
                continue;
            }

            $payload[$column] = match ($column) {
                'user_id' => $sourceUserId !== null && isset($userMap[$sourceUserId]) ? $userMap[$sourceUserId] : null,
                'unit_id' => $sourceUnitId !== null && isset($unitMap[$sourceUnitId]) ? $unitMap[$sourceUnitId] : null,
                'video_size' => castInt($row[$column] ?? null, 0),
                'title', 'video_path', 'video_original_name', 'video_mime_type', 'status' => castNullOrString($row[$column] ?? null),
                'description' => castNullOrString($row[$column] ?? null),
                default => castNullOrString($row[$column] ?? null),
            };
        }

        if (! $dryRun) {
            $newId = insertRow($pdo, 'tb18_chamados', $payload);
            $ticketMap[$sourceId] = $newId;
        } else {
            $ticketMap[$sourceId] = $sourceId;
        }
        $inserted++;
    }

    reportTable($stats, 'tb18_chamados', $selected, $inserted, $updated);
}

function processSupportTicketInteractions(PDO $pdo, array $rows, array $ticketMap, array $userMap, array &$interactionMap, array &$stats, bool $dryRun): void
{
    $selected = count($rows);
    $inserted = 0;
    $updated = 0;
    $targetColumns = targetColumns($pdo, 'tb19_chamado_interacoes');

    foreach ($rows as $row) {
        $sourceId = (int) ($row['id'] ?? 0);
        if ($sourceId <= 0) {
            continue;
        }

        $sourceTicketId = castInt($row['support_ticket_id'] ?? null, null);
        $sourceUserId = castInt($row['user_id'] ?? null, null);
        if ($sourceTicketId === null || ! isset($ticketMap[$sourceTicketId])) {
            continue;
        }

        $payload = [];
        foreach ($targetColumns as $column) {
            if ($column === 'id') {
                continue;
            }

            $payload[$column] = match ($column) {
                'support_ticket_id' => $ticketMap[$sourceTicketId],
                'user_id' => $sourceUserId !== null && isset($userMap[$sourceUserId]) ? $userMap[$sourceUserId] : null,
                'author_name', 'message' => castNullOrString($row[$column] ?? null),
                default => castNullOrString($row[$column] ?? null),
            };
        }

        if (! $dryRun) {
            $newId = insertRow($pdo, 'tb19_chamado_interacoes', $payload);
            $interactionMap[$sourceId] = $newId;
        } else {
            $interactionMap[$sourceId] = $sourceId;
        }
        $inserted++;
    }

    reportTable($stats, 'tb19_chamado_interacoes', $selected, $inserted, $updated);
}

function processSupportTicketAttachments(PDO $pdo, array $rows, array $interactionMap, array &$attachmentMap, array &$stats, bool $dryRun): void
{
    $selected = count($rows);
    $inserted = 0;
    $updated = 0;
    $targetColumns = targetColumns($pdo, 'tb20_chamado_anexos');

    foreach ($rows as $row) {
        $sourceId = (int) ($row['id'] ?? 0);
        if ($sourceId <= 0) {
            continue;
        }

        $sourceInteractionId = castInt($row['support_ticket_interaction_id'] ?? null, null);
        if ($sourceInteractionId === null || ! isset($interactionMap[$sourceInteractionId])) {
            continue;
        }

        $payload = [];
        foreach ($targetColumns as $column) {
            if ($column === 'id') {
                continue;
            }

            $payload[$column] = match ($column) {
                'support_ticket_interaction_id' => $interactionMap[$sourceInteractionId],
                'file_size' => castInt($row[$column] ?? null, 0),
                'file_path', 'original_name', 'mime_type' => castNullOrString($row[$column] ?? null),
                default => castNullOrString($row[$column] ?? null),
            };
        }

        if (! $dryRun) {
            $newId = insertRow($pdo, 'tb20_chamado_anexos', $payload);
            $attachmentMap[$sourceId] = $newId;
        } else {
            $attachmentMap[$sourceId] = $sourceId;
        }
        $inserted++;
    }

    reportTable($stats, 'tb20_chamado_anexos', $selected, $inserted, $updated);
}

function processAnyDeskCodes(PDO $pdo, array $rows, array $unitMap, array &$anyDeskMap, array &$stats, bool $dryRun): void
{
    $selected = count($rows);
    $inserted = 0;
    $updated = 0;
    $targetColumns = targetColumns($pdo, 'tb23_anydesck_codigos');

    foreach ($rows as $row) {
        $sourceId = (int) ($row['id'] ?? 0);
        if ($sourceId <= 0) {
            continue;
        }

        $sourceUnitId = castInt($row['unit_id'] ?? null, null);
        if ($sourceUnitId === null || ! isset($unitMap[$sourceUnitId])) {
            continue;
        }

        $code = castNullOrString($row['code'] ?? null);
        $existing = $code !== ''
            ? selectOneMatrixScope($pdo, 'tb23_anydesck_codigos', ['code' => $code], null)
            : null;

        $payload = [];
        foreach ($targetColumns as $column) {
            if ($column === 'id') {
                continue;
            }

            $payload[$column] = match ($column) {
                'unit_id' => $unitMap[$sourceUnitId],
                'code', 'type' => castNullOrString($row[$column] ?? null),
                default => castNullOrString($row[$column] ?? null),
            };
        }

        if ($existing !== null) {
            if (! $dryRun) {
                updateRow($pdo, 'tb23_anydesck_codigos', 'id', (int) $existing['id'], $payload);
            }

            $anyDeskMap[$sourceId] = (int) $existing['id'];
            $updated++;
            continue;
        }

        if (! $dryRun) {
            $newId = insertRow($pdo, 'tb23_anydesck_codigos', $payload);
            $anyDeskMap[$sourceId] = $newId;
        } else {
            $anyDeskMap[$sourceId] = $sourceId;
        }
        $inserted++;
    }

    reportTable($stats, 'tb23_anydesck_codigos', $selected, $inserted, $updated);
}

function processProductDiscards(PDO $pdo, array $rows, array $productMap, array $userMap, array $unitMap, array &$stats, bool $dryRun): void
{
    $selected = count($rows);
    $inserted = 0;
    $updated = 0;
    $targetColumns = targetColumns($pdo, 'product_discards');

    foreach ($rows as $row) {
        $sourceId = (int) ($row['id'] ?? 0);
        if ($sourceId <= 0) {
            continue;
        }

        $sourceProductId = castInt($row['product_id'] ?? null, null);
        $sourceUserId = castInt($row['user_id'] ?? null, null);
        $sourceUnitId = castInt($row['unit_id'] ?? null, null);

        $payload = [];
        foreach ($targetColumns as $column) {
            if ($column === 'id') {
                continue;
            }

            $payload[$column] = match ($column) {
                'product_id' => $sourceProductId !== null && isset($productMap[$sourceProductId]) ? $productMap[$sourceProductId] : null,
                'user_id' => $sourceUserId !== null && isset($userMap[$sourceUserId]) ? $userMap[$sourceUserId] : null,
                'unit_id' => $sourceUnitId !== null && isset($unitMap[$sourceUnitId]) ? $unitMap[$sourceUnitId] : null,
                'quantity', 'unit_price' => castFloat($row[$column] ?? null, 0.0),
                default => castNullOrString($row[$column] ?? null),
            };
        }

        if (! $dryRun) {
            insertRow($pdo, 'product_discards', $payload);
        }
        $inserted++;
    }

    reportTable($stats, 'product_discards', $selected, $inserted, $updated);
}

function nowString(): string
{
    return date('Y-m-d H:i:s');
}

function emitResult(array $report): void
{
    $json = json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false) {
        throw new RuntimeException('Nao foi possivel montar o relatorio final.');
    }

    if (PHP_SAPI === 'cli') {
        fwrite(STDOUT, $json . PHP_EOL);
        return;
    }

    header('Content-Type: application/json; charset=utf-8');
    echo $json;
}

function resetDestinationTables(PDO $pdo): void
{
    $tables = [
        'tb20_chamado_anexos',
        'tb19_chamado_interacoes',
        'tb18_chamados',
        'sales_dispute_bids',
        'sales_disputes',
        'product_discards',
        'tb25_produto_movimentacoes',
        'tb24_controle_pagamentos',
        'tb23_anydesck_codigos',
        'tb22_chat_mensagens',
        'tb_16_boletos',
        'salary_advances',
        'expenses',
        'cashier_closures',
        'tb27_notas_fiscais',
        'tb26_configuracoes_fiscais',
        'tb3_vendas',
        'tb4_vendas_pg',
        'tb2_unidade_user',
        'users',
        'tb1_produto',
        'tb2_unidades',
        'suppliers',
        'tb30_matrizes',
    ];

    $pdo->exec('SET FOREIGN_KEY_CHECKS = 0');

    foreach ($tables as $table) {
        $pdo->exec(sprintf('TRUNCATE TABLE `%s`', $table));
    }

    $pdo->exec('SET FOREIGN_KEY_CHECKS = 1');
}
