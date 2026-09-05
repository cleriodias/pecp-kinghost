<?php

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "Este script deve ser executado via CLI.\n");
    exit(1);
}

$options = getopt('', [
    'host:',
    'port::',
    'database:',
    'user:',
    'password:',
    'ssl-ca::',
    'output::',
]);

$required = ['host', 'database', 'user', 'password'];
foreach ($required as $key) {
    if (! isset($options[$key]) || $options[$key] === '') {
        fwrite(STDERR, "Parametro obrigatorio ausente: --{$key}\n");
        exit(1);
    }
}

$host = (string) $options['host'];
$port = (int) ($options['port'] ?? 3306);
$database = (string) $options['database'];
$user = (string) $options['user'];
$password = (string) $options['password'];
$sslCa = isset($options['ssl-ca']) ? trim((string) $options['ssl-ca']) : '';
$output = isset($options['output']) ? trim((string) $options['output']) : '';

mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

$connection = mysqli_init();
if ($connection === false) {
    fwrite(STDERR, "Nao foi possivel inicializar a conexao MySQL.\n");
    exit(1);
}

if ($sslCa !== '') {
    mysqli_ssl_set($connection, null, null, $sslCa, null, null);
}

$connection->real_connect($host, $user, $password, $database, $port);
$connection->set_charset('utf8mb4');

$quoteIdentifier = static fn (string $identifier): string => '`' . str_replace('`', '``', $identifier) . '`';

$queryRows = static function (mysqli $connection, string $sql): array {
    $result = $connection->query($sql);
    $rows = $result->fetch_all(MYSQLI_ASSOC);
    $result->free();

    return $rows;
};

$queryValue = static function (mysqli $connection, string $sql): mixed {
    $result = $connection->query($sql);
    $row = $result->fetch_row();
    $result->free();

    return $row[0] ?? null;
};

$tables = $queryRows(
    $connection,
    "SELECT TABLE_NAME, TABLE_TYPE, ENGINE, TABLE_COLLATION, AUTO_INCREMENT
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
     ORDER BY TABLE_NAME"
);

$report = [
    'host' => $host,
    'database' => $database,
    'generated_at' => gmdate('c'),
    'table_count' => count($tables),
    'tables' => [],
];

foreach ($tables as $table) {
    $tableName = (string) $table['TABLE_NAME'];
    $quotedTable = $quoteIdentifier($tableName);
    $rowCount = (int) $queryValue($connection, "SELECT COUNT(*) FROM {$quotedTable}");

    $primaryKeys = $queryRows(
        $connection,
        sprintf(
            "SELECT k.COLUMN_NAME, c.DATA_TYPE
             FROM information_schema.KEY_COLUMN_USAGE k
             JOIN information_schema.COLUMNS c
               ON c.TABLE_SCHEMA = k.TABLE_SCHEMA
              AND c.TABLE_NAME = k.TABLE_NAME
              AND c.COLUMN_NAME = k.COLUMN_NAME
             WHERE k.TABLE_SCHEMA = DATABASE()
               AND k.TABLE_NAME = '%s'
               AND k.CONSTRAINT_NAME = 'PRIMARY'
             ORDER BY k.ORDINAL_POSITION",
            $connection->real_escape_string($tableName)
        )
    );

    $maxPrimaryKey = null;
    if (count($primaryKeys) === 1) {
        $dataType = strtolower((string) $primaryKeys[0]['DATA_TYPE']);
        if (in_array($dataType, ['tinyint', 'smallint', 'mediumint', 'int', 'bigint'], true)) {
            $column = $quoteIdentifier((string) $primaryKeys[0]['COLUMN_NAME']);
            $maxPrimaryKey = (int) $queryValue($connection, "SELECT COALESCE(MAX({$column}), 0) FROM {$quotedTable}");
        }
    }

    $report['tables'][$tableName] = [
        'rows' => $rowCount,
        'type' => $table['TABLE_TYPE'],
        'engine' => $table['ENGINE'],
        'collation' => $table['TABLE_COLLATION'],
        'auto_increment' => $table['AUTO_INCREMENT'] !== null ? (int) $table['AUTO_INCREMENT'] : null,
        'primary_key' => array_map(static fn (array $row): string => (string) $row['COLUMN_NAME'], $primaryKeys),
        'max_primary_key' => $maxPrimaryKey,
    ];
}

$json = json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
if ($json === false) {
    fwrite(STDERR, "Nao foi possivel gerar o JSON do relatorio.\n");
    exit(1);
}

if ($output !== '') {
    $outputDir = dirname($output);
    if (! is_dir($outputDir)) {
        mkdir($outputDir, 0777, true);
    }

    file_put_contents($output, $json . PHP_EOL);
    echo "Relatorio criado em {$output}\n";
    exit(0);
}

echo $json . PHP_EOL;
