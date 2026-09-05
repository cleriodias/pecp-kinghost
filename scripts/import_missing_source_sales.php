<?php

declare(strict_types=1);

use Dotenv\Dotenv;

require_once __DIR__ . '/../vendor/autoload.php';

if (is_file(__DIR__ . '/../.env')) {
    Dotenv::createImmutable(__DIR__ . '/..')->safeLoad();
}

$payloadPath = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'storage' . DIRECTORY_SEPARATOR . 'app' . DIRECTORY_SEPARATOR . 'kinghost-import' . DIRECTORY_SEPARATOR . 'kinghost_import_payload.json.gz';
if (! is_file($payloadPath)) {
    fwrite(STDERR, "Arquivo de payload nao encontrado: {$payloadPath}\n");
    exit(1);
}

$pdo = new PDO(
    'mysql:host=mysql.pdv.kinghost.net;port=3306;dbname=pdv;charset=utf8mb4',
    'pdv',
    '6yh7UJ8ik',
    [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]
);

$matrixId = resolveMatrixId($pdo, 'Jd.Paraiso');
$payload = loadPayload($payloadPath);

$sourcePayments = $payload['tables']['tb4_vendas_pg'] ?? [];
$sourceSales = $payload['tables']['tb3_vendas'] ?? [];

$productMap = loadProductMap($pdo, $matrixId);
$unitMap = loadUnitMap($pdo, $matrixId);

$targetPaymentRows = $pdo->query('SELECT tb4_id, valor_total, tipo_pagamento, valor_pago, troco, dois_pgto, created_at, updated_at FROM tb4_vendas_pg')->fetchAll();
$paymentBuckets = [];
foreach ($targetPaymentRows as $row) {
    $key = paymentSignature($row);
    $paymentBuckets[$key][] = (int) $row['tb4_id'];
}

$targetSalesRows = $pdo->query(
    'SELECT tb4_id, tb1_id, id_comanda, produto_nome, valor_unitario, quantidade, valor_total, data_hora, id_user_caixa, id_user_vale, id_lanc, id_unidade, tipo_pago, status_pago, status
     FROM tb3_vendas'
)->fetchAll();

$targetSalesIndex = [];
foreach ($targetSalesRows as $row) {
    $targetSalesIndex[saleSignature($row)] = true;
}

$paymentMap = [];
$usedPaymentIds = [];
$paymentColumns = targetColumns($pdo, 'tb4_vendas_pg');
$paymentInsertColumns = filteredColumns($paymentColumns, ['tb4_id']);
$paymentInsert = buildInsertStatement($pdo, 'tb4_vendas_pg', $paymentInsertColumns);

$matchedPayments = 0;
$insertedPayments = 0;
$paymentPending = 0;
$pdo->beginTransaction();
foreach ($sourcePayments as $row) {
    $sourceId = (int) ($row['tb4_id'] ?? 0);
    if ($sourceId <= 0) {
        continue;
    }

    $key = paymentSignature($row);
    $mappedId = null;
    if (isset($paymentBuckets[$key])) {
        while ($paymentBuckets[$key] !== []) {
            $candidate = array_shift($paymentBuckets[$key]);
            if (! isset($usedPaymentIds[$candidate])) {
                $mappedId = $candidate;
                $usedPaymentIds[$candidate] = true;
                $matchedPayments++;
                break;
            }
        }
    }

    if ($mappedId === null) {
        $payloadRow = payloadForColumns($paymentInsertColumns, $row, []);
        $paymentInsert->execute(array_values($payloadRow));
        $mappedId = (int) $pdo->lastInsertId();
        $insertedPayments++;
        $paymentPending++;
        if ($paymentPending >= 1000) {
            $pdo->commit();
            $pdo->beginTransaction();
            $paymentPending = 0;
        }
    }

    $paymentMap[$sourceId] = $mappedId;
}
$pdo->commit();

$saleColumns = targetColumns($pdo, 'tb3_vendas');
$saleInsertColumns = filteredColumns($saleColumns, ['tb3_id']);
$saleInsert = buildInsertStatement($pdo, 'tb3_vendas', $saleInsertColumns);

$matchedSales = 0;
$insertedSales = 0;
$salePending = 0;
$pdo->beginTransaction();

foreach ($sourceSales as $row) {
    $sourceSaleId = (int) ($row['tb3_id'] ?? 0);
    if ($sourceSaleId <= 0) {
        continue;
    }

    $sourcePaymentId = castInt($row['tb4_id'] ?? null, null);
    $sourceProductId = castInt($row['tb1_id'] ?? null, null);
    $sourceUnitId = castInt($row['id_unidade'] ?? null, null);
    $mappedPaymentId = $sourcePaymentId !== null && isset($paymentMap[$sourcePaymentId]) ? $paymentMap[$sourcePaymentId] : null;
    $mappedProductId = $sourceProductId !== null && isset($productMap[$sourceProductId]) ? $productMap[$sourceProductId] : null;
    $mappedUnitId = $sourceUnitId !== null && isset($unitMap[$sourceUnitId]) ? $unitMap[$sourceUnitId] : null;

    $key = saleSignature([
        'tb4_id' => $mappedPaymentId,
        'tb1_id' => $mappedProductId,
        'id_comanda' => $row['id_comanda'] ?? null,
        'produto_nome' => $row['produto_nome'] ?? null,
        'valor_unitario' => $row['valor_unitario'] ?? null,
        'quantidade' => $row['quantidade'] ?? null,
        'valor_total' => $row['valor_total'] ?? null,
        'data_hora' => $row['data_hora'] ?? null,
        'id_user_caixa' => $row['id_user_caixa'] ?? null,
        'id_user_vale' => $row['id_user_vale'] ?? null,
        'id_lanc' => $row['id_lanc'] ?? null,
        'id_unidade' => $mappedUnitId,
        'tipo_pago' => $row['tipo_pago'] ?? null,
        'status_pago' => $row['status_pago'] ?? null,
        'status' => $row['status'] ?? null,
    ]);

    if (isset($targetSalesIndex[$key])) {
        $matchedSales++;
        continue;
    }

    $payloadRow = payloadForColumns($saleInsertColumns, $row, [
        'tb4_id' => $mappedPaymentId,
        'tb1_id' => $mappedProductId,
        'id_unidade' => $mappedUnitId,
        'data_hora' => normalizeMaybeDateTime($row['data_hora'] ?? null),
    ]);

    $saleInsert->execute(array_values($payloadRow));
    $insertedSales++;
    $salePending++;
    if ($salePending >= 1000) {
        $pdo->commit();
        $pdo->beginTransaction();
        $salePending = 0;
    }
}
$pdo->commit();

echo json_encode([
    'payments' => [
        'source' => count($sourcePayments),
        'matched' => $matchedPayments,
        'inserted' => $insertedPayments,
    ],
    'sales' => [
        'source' => count($sourceSales),
        'matched' => $matchedSales,
        'inserted' => $insertedSales,
    ],
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL;

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
    $stmt = $pdo->prepare('SELECT tb30_id FROM tb30_matrizes WHERE LOWER(tb30_nome) = LOWER(?) OR LOWER(tb30_slug) = LOWER(?) LIMIT 1');
    $slug = preg_replace('/[^a-z0-9]+/', '-', strtolower(trim($matrixName))) ?? strtolower(trim($matrixName));
    $stmt->execute([$matrixName, $slug]);
    $matrixId = $stmt->fetchColumn();

    if ($matrixId === false) {
        throw new RuntimeException('Nao foi possivel localizar a matriz de destino: ' . $matrixName);
    }

    return (int) $matrixId;
}

function loadProductMap(PDO $pdo, int $matrixId): array
{
    $stmt = $pdo->prepare('SELECT produto_id, tb1_id FROM tb1_produto WHERE matriz_id = ? AND produto_id IS NOT NULL');
    $stmt->execute([$matrixId]);

    $map = [];
    foreach ($stmt->fetchAll() as $row) {
        $map[(int) $row['produto_id']] = (int) $row['tb1_id'];
    }

    return $map;
}

function loadUnitMap(PDO $pdo, int $matrixId): array
{
    $stmt = $pdo->prepare('SELECT tb2_id_origem, tb2_id FROM tb2_unidades WHERE matriz_id = ? AND tb2_id_origem IS NOT NULL');
    $stmt->execute([$matrixId]);

    $map = [];
    foreach ($stmt->fetchAll() as $row) {
        $map[(int) $row['tb2_id_origem']] = (int) $row['tb2_id'];
    }

    return $map;
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

function filteredColumns(array $columns, array $excludedColumns): array
{
    return array_values(array_filter($columns, static fn (string $column) => ! in_array($column, $excludedColumns, true)));
}

function buildInsertStatement(PDO $pdo, string $table, array $columns): PDOStatement
{
    $columnSql = implode(', ', array_map(static fn (string $column) => '`' . $column . '`', $columns));
    $placeholderSql = implode(', ', array_fill(0, count($columns), '?'));

    return $pdo->prepare(sprintf('INSERT INTO `%s` (%s) VALUES (%s)', $table, $columnSql, $placeholderSql));
}

function payloadForColumns(array $columns, array $sourceRow, array $overrides): array
{
    $payload = [];
    foreach ($columns as $column) {
        if (array_key_exists($column, $overrides)) {
            $payload[$column] = $overrides[$column];
            continue;
        }

        if (! array_key_exists($column, $sourceRow)) {
            continue;
        }

        $payload[$column] = match ($column) {
            'valor_total', 'valor_pago', 'troco', 'dois_pgto', 'valor_unitario' => castFloat($sourceRow[$column], 0.0),
            'quantidade', 'status', 'status_pago' => castInt($sourceRow[$column], 0),
            'data_hora', 'created_at', 'updated_at' => normalizeMaybeDateTime($sourceRow[$column] ?? null),
            default => $sourceRow[$column],
        };
    }

    return $payload;
}

function paymentSignature(array $row): string
{
    return implode('|', [
        normalizeScalar($row['created_at'] ?? null),
        normalizeScalar($row['valor_total'] ?? null),
        trim((string) ($row['tipo_pagamento'] ?? '')),
        normalizeScalar($row['valor_pago'] ?? null),
        normalizeScalar($row['troco'] ?? null),
        normalizeScalar($row['dois_pgto'] ?? null),
    ]);
}

function saleSignature(array $row): string
{
    return implode('|', [
        normalizeScalar($row['created_at'] ?? null),
        normalizeScalar($row['tb1_id'] ?? null),
        normalizeScalar($row['id_comanda'] ?? null),
        trim((string) ($row['produto_nome'] ?? '')),
        normalizeScalar($row['valor_unitario'] ?? null),
        normalizeScalar($row['quantidade'] ?? null),
        normalizeScalar($row['valor_total'] ?? null),
        normalizeScalar($row['data_hora'] ?? null),
        normalizeScalar($row['id_user_caixa'] ?? null),
        normalizeScalar($row['id_user_vale'] ?? null),
        normalizeScalar($row['id_lanc'] ?? null),
        normalizeScalar($row['id_unidade'] ?? null),
        trim((string) ($row['tipo_pago'] ?? '')),
        normalizeScalar($row['status_pago'] ?? null),
        normalizeScalar($row['status'] ?? null),
    ]);
}

function normalizeScalar(mixed $value): string
{
    if ($value === null || $value === '') {
        return 'NULL';
    }

    if (is_bool($value)) {
        return $value ? '1' : '0';
    }

    if (is_numeric($value)) {
        if (str_contains((string) $value, '.')) {
            return number_format((float) $value, 2, '.', '');
        }

        return (string) (int) $value;
    }

    $date = normalizeMaybeDateTime($value);
    if ($date !== null) {
        return $date;
    }

    return trim((string) $value);
}

function normalizeMaybeDateTime(mixed $value): ?string
{
    if ($value === null) {
        return null;
    }

    $value = trim((string) $value);
    if ($value === '') {
        return null;
    }

    try {
        return (new DateTimeImmutable($value))->format('Y-m-d H:i:s');
    } catch (Throwable) {
        return $value;
    }
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
