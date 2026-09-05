<?php

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "Este script deve ser executado via CLI.\n");
    exit(1);
}

$options = getopt('', [
    'dump:',
    'host:',
    'port::',
    'database:',
    'user:',
    'password:',
    'ssl-ca::',
]);

$required = ['dump', 'host', 'database', 'user', 'password'];
foreach ($required as $key) {
    if (! isset($options[$key]) || $options[$key] === '') {
        fwrite(STDERR, "Parametro obrigatorio ausente: --{$key}\n");
        exit(1);
    }
}

$dumpFile = (string) $options['dump'];
$host = (string) $options['host'];
$port = (int) ($options['port'] ?? 3306);
$database = (string) $options['database'];
$user = (string) $options['user'];
$password = (string) $options['password'];
$sslCa = isset($options['ssl-ca']) ? trim((string) $options['ssl-ca']) : '';

if (! is_file($dumpFile)) {
    fwrite(STDERR, "Arquivo de dump nao encontrado: {$dumpFile}\n");
    exit(1);
}

mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

$connection = mysqli_init();
if ($connection === false) {
    fwrite(STDERR, "Nao foi possivel inicializar a conexao MySQL.\n");
    exit(1);
}

if ($sslCa !== '') {
    mysqli_ssl_set($connection, null, null, $sslCa, null, null);
}

if (! mysqli_real_connect($connection, $host, $user, $password, $database, $port)) {
    fwrite(STDERR, "Nao foi possivel conectar em {$host}:{$port}/{$database}\n");
    exit(1);
}

$connection->set_charset('utf8mb4');
$connection->query("SET FOREIGN_KEY_CHECKS = 0");
$connection->query("SET time_zone = '+00:00'");

dropCurrentSchemaObjects($connection);

applyDumpStatements($connection, $dumpFile);

$connection->query("SET FOREIGN_KEY_CHECKS = 1");

echo "Dump aplicado com sucesso em {$database} @ {$host}:{$port}\n";

function dropCurrentSchemaObjects(mysqli $connection): void
{
    $views = [];
    $tables = [];

    $result = $connection->query(
        "SELECT TABLE_NAME, TABLE_TYPE
         FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = DATABASE()
         ORDER BY TABLE_TYPE DESC, TABLE_NAME"
    );

    while ($row = $result->fetch_assoc()) {
        if (($row['TABLE_TYPE'] ?? '') === 'VIEW') {
            $views[] = (string) $row['TABLE_NAME'];
            continue;
        }

        $tables[] = (string) $row['TABLE_NAME'];
    }

    foreach ($views as $view) {
        $connection->query(sprintf('DROP VIEW IF EXISTS `%s`', str_replace('`', '``', $view)));
    }

    foreach ($tables as $table) {
        $connection->query(sprintf('DROP TABLE IF EXISTS `%s`', str_replace('`', '``', $table)));
    }
}

function applyDumpStatements(mysqli $connection, string $dumpFile): void
{
    $handle = fopen($dumpFile, 'rb');
    if ($handle === false) {
        fwrite(STDERR, "Nao foi possivel ler o dump: {$dumpFile}\n");
        exit(1);
    }

    $buffer = '';
    $quote = null;
    $escaped = false;
    $statementCount = 0;

    while (! feof($handle)) {
        $chunk = fread($handle, 1024 * 1024);
        if ($chunk === false) {
            fclose($handle);
            fwrite(STDERR, "Falha ao ler o dump: {$dumpFile}\n");
            exit(1);
        }

        $length = strlen($chunk);
        for ($index = 0; $index < $length; $index++) {
            $char = $chunk[$index];
            $buffer .= $char;

            if ($quote !== null) {
                if ($quote !== '`' && $char === '\\' && ! $escaped) {
                    $escaped = true;
                    continue;
                }

                if ($char === $quote && ! $escaped) {
                    $quote = null;
                }

                $escaped = false;
                continue;
            }

            if ($char === '\'' || $char === '"' || $char === '`') {
                $quote = $char;
                continue;
            }

            if ($char !== ';') {
                continue;
            }

            executeDumpStatement($connection, $buffer);
            $statementCount++;

            if ($statementCount % 1000 === 0) {
                echo "{$statementCount} comandos aplicados\n";
            }

            $buffer = '';
        }
    }

    fclose($handle);

    if (trim($buffer) !== '') {
        executeDumpStatement($connection, $buffer);
        $statementCount++;
    }

    echo "{$statementCount} comandos aplicados\n";
}

function executeDumpStatement(mysqli $connection, string $statement): void
{
    $statement = trim($statement);
    if ($statement === '') {
        return;
    }

    if (stripos($statement, 'sql_generate_invisible_primary_key') !== false) {
        return;
    }

    $connection->query($statement);
}
