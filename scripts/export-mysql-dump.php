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

$dsn = sprintf(
    'mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
    $host,
    $port,
    $database
);

$pdo = new PDO($dsn, $user, $password, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::MYSQL_ATTR_USE_BUFFERED_QUERY => false,
    ...($sslCa !== '' ? [PDO::MYSQL_ATTR_SSL_CA => $sslCa] : []),
]);

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
    return '`'.str_replace('`', '``', $identifier).'`';
};

$quoteValue = static function (mixed $value) use ($pdo): string {
    if ($value === null) {
        return 'NULL';
    }

    return $pdo->quote((string) $value);
};

$baseTables = $pdo->query(
    "SELECT TABLE_NAME
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_TYPE = 'BASE TABLE'
     ORDER BY TABLE_NAME"
)->fetchAll(PDO::FETCH_COLUMN);

$views = $pdo->query(
    "SELECT TABLE_NAME
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_TYPE = 'VIEW'
     ORDER BY TABLE_NAME"
)->fetchAll(PDO::FETCH_COLUMN);

$write("-- Dump gerado por scripts/export-mysql-dump.php\n");
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

foreach ($baseTables as $table) {
    $tableName = (string) $table;
    $quotedTable = $quoteIdentifier($tableName);

    $createStatement = $pdo
        ->query("SHOW CREATE TABLE {$quotedTable}")
        ->fetch();

    $write("--\n-- Estrutura da tabela {$quotedTable}\n--\n\n");
    $write("DROP TABLE IF EXISTS {$quotedTable};\n");
    $write($createStatement['Create Table'].";\n\n");

    $columns = $pdo
        ->query("SHOW COLUMNS FROM {$quotedTable}")
        ->fetchAll(PDO::FETCH_COLUMN);

    $quotedColumns = array_map($quoteIdentifier, $columns);
    $columnList = implode(', ', $quotedColumns);
    $rowStatement = $pdo->query("SELECT * FROM {$quotedTable}");
    $batch = [];
    $rowCount = 0;

    while ($row = $rowStatement->fetch(PDO::FETCH_ASSOC)) {
        $values = [];
        foreach ($columns as $column) {
            $values[] = $quoteValue($row[$column]);
        }

        $batch[] = '('.implode(', ', $values).')';
        $rowCount++;

        if (count($batch) >= 250) {
            $write("INSERT INTO {$quotedTable} ({$columnList}) VALUES\n");
            $write(implode(",\n", $batch).";\n");
            $batch = [];
        }
    }

    if ($batch !== []) {
        $write("INSERT INTO {$quotedTable} ({$columnList}) VALUES\n");
        $write(implode(",\n", $batch).";\n");
    }

    $write("-- {$rowCount} registros exportados de {$quotedTable}\n\n");
}

foreach ($views as $view) {
    $viewName = (string) $view;
    $quotedView = $quoteIdentifier($viewName);

    $createStatement = $pdo
        ->query("SHOW CREATE VIEW {$quotedView}")
        ->fetch();

    $write("--\n-- Estrutura da view {$quotedView}\n--\n\n");
    $write("DROP VIEW IF EXISTS {$quotedView};\n");
    $write($createStatement['Create View'].";\n\n");
}

$write("SET FOREIGN_KEY_CHECKS = 1;\n");
$write("/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;\n");
$write("/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;\n");
$write("/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;\n");

fclose($handle);

echo "Dump criado em {$output}\n";
echo count($baseTables) . " tabelas exportadas\n";
echo count($views) . " views exportadas\n";
