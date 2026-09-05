<?php

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "Este script deve ser executado via CLI.\n");
    exit(1);
}

$outputDir = $argv[1] ?? storage_path('app/kinghost-import');
$outputDir = rtrim($outputDir, DIRECTORY_SEPARATOR);
$payloadFile = $outputDir . DIRECTORY_SEPARATOR . 'kinghost_import_payload.json.gz';

$sourceHost = (string) ($argv[2] ?? getenv('SOURCE_DB_HOST') ?: '127.0.0.1');
$sourcePort = (int) ($argv[3] ?? getenv('SOURCE_DB_PORT') ?: 3306);
$sourceDatabase = (string) ($argv[4] ?? getenv('SOURCE_DB_DATABASE') ?: 'paoecafe8301');
$sourceUser = (string) ($argv[5] ?? getenv('SOURCE_DB_USERNAME') ?: 'root');
$sourcePassword = (string) ($argv[6] ?? getenv('SOURCE_DB_PASSWORD') ?: '');
$sourceMatrixName = (string) ($argv[7] ?? getenv('SOURCE_MATRIX_NAME') ?: 'Jd.Paraiso');

$pdo = new PDO(
    sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $sourceHost, $sourcePort, $sourceDatabase),
    $sourceUser,
    $sourcePassword,
    [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::MYSQL_ATTR_USE_BUFFERED_QUERY => false,
    ]
);

$tables = [
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
];

if (! is_dir($outputDir) && ! mkdir($outputDir, 0777, true) && ! is_dir($outputDir)) {
    fwrite(STDERR, "Nao foi possivel criar o diretorio de saida: {$outputDir}\n");
    exit(1);
}

$getPrimaryKey = static function (PDO $pdo, string $table): ?string {
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

    return $column !== false ? (string) $column : null;
};

$openGz = gzopen($payloadFile, 'wb9');
if ($openGz === false) {
    fwrite(STDERR, "Nao foi possivel criar o arquivo de saida: {$payloadFile}\n");
    exit(1);
}

$write = static function (string $content) use ($openGz): void {
    gzwrite($openGz, $content);
};

$write('{');
$write('"meta":{');
$write('"source_database":' . json_encode($sourceDatabase, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
$write(',');
$write('"source_matrix_name":' . json_encode($sourceMatrixName, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
$write(',');
$write('"source_primary_unit_name":' . json_encode($sourceMatrixName, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
$write(',');
$write('"exported_at":' . json_encode(gmdate('c'), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
$write('},');
$write('"tables":{');

$tableCount = count($tables);

foreach ($tables as $index => $table) {
    $primaryKey = $getPrimaryKey($pdo, $table);
    $orderBy = $primaryKey ? " ORDER BY `{$primaryKey}`" : '';

    $write(json_encode($table, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    $write(':[');

    $stmt = $pdo->query("SELECT * FROM `{$table}`{$orderBy}");
    $rowIndex = 0;

    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        if ($rowIndex > 0) {
            $write(',');
        }

        $write(json_encode($row, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        $rowIndex++;
    }

    $write(']');

    if ($index < $tableCount - 1) {
        $write(',');
    }
}

$write('}}');

gzclose($openGz);

echo "Pacote gerado em: {$payloadFile}\n";
echo "Origem: {$sourceDatabase} @ {$sourceHost}:{$sourcePort}\n";
echo 'Tabelas exportadas: ' . implode(', ', $tables) . "\n";

function storage_path(string $path = ''): string
{
    $base = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'storage';

    return $path === '' ? $base : $base . DIRECTORY_SEPARATOR . $path;
}
