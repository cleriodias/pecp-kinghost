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
    'output:',
    'ssl-ca::',
    'tables::',
]);

$required = ['host', 'database', 'user', 'password', 'output'];
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
$output = (string) $options['output'];
$sslCa = isset($options['ssl-ca']) ? trim((string) $options['ssl-ca']) : '';
$requestedTables = isset($options['tables'])
    ? array_values(array_filter(array_map('trim', explode(',', (string) $options['tables']))))
    : [];

$connection = mysqli_init();
if ($connection === false) {
    fwrite(STDERR, "Nao foi possivel inicializar a conexao MySQL.\n");
    exit(1);
}

if ($sslCa !== '') {
    mysqli_ssl_set($connection, null, null, $sslCa, null, null);
}

mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

try {
    $connection->real_connect($host, $user, $password, $database, $port);
} catch (Throwable $e) {
    fwrite(STDERR, $e->getMessage() . PHP_EOL);
    exit(1);
}

$connection->set_charset('utf8mb4');

$outputDir = dirname($output);
if (! is_dir($outputDir)) {
    mkdir($outputDir, 0777, true);
}

$handle = fopen($output, 'wb');
if ($handle === false) {
    fwrite(STDERR, "Nao foi possivel criar o arquivo: {$output}\n");
    exit(1);
}

$write = static function (string $content) use ($handle): void {
    fwrite($handle, $content);
};

$quoteIdentifier = static function (string $identifier): string {
    return '`' . str_replace('`', '``', $identifier) . '`';
};

$quoteValue = static function (mixed $value) use ($connection): string {
    if ($value === null) {
        return 'NULL';
    }

    return "'" . $connection->real_escape_string((string) $value) . "'";
};

$queryColumns = static function (mysqli $connection, string $sql): array {
    $result = $connection->query($sql, MYSQLI_USE_RESULT);
    $rows = [];
    while ($row = $result->fetch_assoc()) {
        $rows[] = $row;
    }
    $result->free();

    return $rows;
};

$queryColumn = static function (mysqli $connection, string $sql): array {
    $result = $connection->query($sql, MYSQLI_USE_RESULT);
    $values = [];
    while ($row = $result->fetch_row()) {
        $values[] = $row[0];
    }
    $result->free();

    return $values;
};

$getPrimaryKey = static function (mysqli $connection, string $table) use ($queryColumn): ?string {
    $tableEscaped = str_replace("'", "''", $table);
    $sql = "
        SELECT COLUMN_NAME
        FROM information_schema.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = '{$tableEscaped}'
          AND CONSTRAINT_NAME = 'PRIMARY'
        ORDER BY ORDINAL_POSITION
        LIMIT 1
    ";

    $values = $queryColumn($connection, $sql);

    return $values[0] ?? null;
};

$baseTables = $queryColumn(
    $connection,
    "SELECT TABLE_NAME
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_TYPE = 'BASE TABLE'
     ORDER BY TABLE_NAME"
);

if ($requestedTables !== []) {
    $availableTables = array_flip(array_map('strval', $baseTables));
    foreach ($requestedTables as $requestedTable) {
        if (! isset($availableTables[$requestedTable])) {
            fwrite(STDERR, "Tabela nao encontrada no banco selecionado: {$requestedTable}\n");
            exit(1);
        }
    }

    $baseTables = $requestedTables;
}

$views = $queryColumn(
    $connection,
    "SELECT TABLE_NAME
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_TYPE = 'VIEW'
     ORDER BY TABLE_NAME"
);

if ($requestedTables !== []) {
    $views = [];
}

$write("-- Dump gerado por scripts/export-mysql-dump-mysqli.php\n");
$write("-- Origem: {$host}\n");
$write("-- Banco: {$database}\n\n");
$write("SET SESSION sql_generate_invisible_primary_key=OFF;\n");
$write("SET SQL_MODE = \"NO_AUTO_VALUE_ON_ZERO\";\n");
$write("SET time_zone = \"+00:00\";\n");
$write("SET FOREIGN_KEY_CHECKS = 0;\n\n");
$write("/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;\n");
$write("/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;\n");
$write("/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;\n");
$write("/*!40101 SET NAMES utf8mb4 */;\n\n");

foreach ($baseTables as $tableName) {
    $quotedTable = $quoteIdentifier((string) $tableName);
    $createRows = $queryColumns($connection, "SHOW CREATE TABLE {$quotedTable}");
    $createStatement = $createRows[0]['Create Table'] ?? null;

    if (! is_string($createStatement) || $createStatement === '') {
        throw new RuntimeException("Nao foi possivel obter a estrutura de {$tableName}");
    }

    $write("--\n-- Estrutura da tabela {$quotedTable}\n--\n\n");
    $write("DROP TABLE IF EXISTS {$quotedTable};\n");
    $write($createStatement . ";\n\n");

    $columns = $queryColumn($connection, "SHOW COLUMNS FROM {$quotedTable}");
    $columnRows = $queryColumns($connection, "SHOW COLUMNS FROM {$quotedTable}");
    $columnNames = array_map(static fn (array $row) => (string) $row['Field'], $columnRows);
    $quotedColumns = array_map($quoteIdentifier, $columnNames);
    $columnList = implode(', ', $quotedColumns);

    $primaryKey = $getPrimaryKey($connection, (string) $tableName);
    $orderBy = $primaryKey !== null ? ' ORDER BY ' . $quoteIdentifier($primaryKey) : '';

    $rowStatement = $connection->query("SELECT * FROM {$quotedTable}{$orderBy}", MYSQLI_USE_RESULT);
    $batch = [];
    $rowCount = 0;

    while ($row = $rowStatement->fetch_assoc()) {
        $values = [];
        foreach ($columnNames as $column) {
            $values[] = $quoteValue($row[$column] ?? null);
        }

        $batch[] = '(' . implode(', ', $values) . ')';
        $rowCount++;

        if (count($batch) >= 250) {
            $write("INSERT INTO {$quotedTable} ({$columnList}) VALUES\n");
            $write(implode(",\n", $batch) . ";\n");
            $batch = [];
        }
    }

    $rowStatement->free();

    if ($batch !== []) {
        $write("INSERT INTO {$quotedTable} ({$columnList}) VALUES\n");
        $write(implode(",\n", $batch) . ";\n");
    }

    $write("-- {$rowCount} registros exportados de {$quotedTable}\n\n");
}

foreach ($views as $viewName) {
    $quotedView = $quoteIdentifier((string) $viewName);
    $createRows = $queryColumns($connection, "SHOW CREATE VIEW {$quotedView}");
    $createStatement = $createRows[0]['Create View'] ?? null;

    if (! is_string($createStatement) || $createStatement === '') {
        throw new RuntimeException("Nao foi possivel obter a estrutura da view {$viewName}");
    }

    $write("--\n-- Estrutura da view {$quotedView}\n--\n\n");
    $write("DROP VIEW IF EXISTS {$quotedView};\n");
    $write($createStatement . ";\n\n");
}

$write("SET FOREIGN_KEY_CHECKS = 1;\n");
$write("/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;\n");
$write("/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;\n");
$write("/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;\n");

fclose($handle);

echo "Dump criado em {$output}\n";
echo count($baseTables) . " tabelas exportadas\n";
echo count($views) . " views exportadas\n";
