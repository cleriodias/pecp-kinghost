<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use RuntimeException;

class AzureLivePatch20260706FabianaFranSeeder extends Seeder
{
    private const SQL_FILE = 'storage/app/azure-live/patch_2026-07-06_fabiana_fran.sql';

    public function run(): void
    {
        $path = base_path(self::SQL_FILE);

        if (! File::exists($path)) {
            throw new RuntimeException(sprintf(
                'Arquivo SQL nao encontrado: %s',
                self::SQL_FILE
            ));
        }

        $statements = $this->splitStatements(File::get($path));
        $statements = array_map([$this, 'normalizeInsertStatement'], $statements);

        DB::transaction(function () use ($statements): void {
            foreach ($statements as $statement) {
                DB::statement($statement);
            }
        });
    }

    /**
     * Split a SQL script into executable statements.
     *
     * The patch file is intentionally simple: comments, SET statements and
     * INSERT blocks. We only split on semicolons outside quoted strings.
     *
     * @return array<int, string>
     */
    private function splitStatements(string $sql): array
    {
        $sql = preg_replace('/^\s*--.*$/m', '', $sql) ?? $sql;

        $statements = [];
        $buffer = '';
        $inSingleQuote = false;
        $inDoubleQuote = false;
        $length = strlen($sql);

        for ($i = 0; $i < $length; $i++) {
            $char = $sql[$i];
            $previous = $i > 0 ? $sql[$i - 1] : '';

            if ($char === "'" && ! $inDoubleQuote && $previous !== '\\') {
                $inSingleQuote = ! $inSingleQuote;
            } elseif ($char === '"' && ! $inSingleQuote && $previous !== '\\') {
                $inDoubleQuote = ! $inDoubleQuote;
            }

            if ($char === ';' && ! $inSingleQuote && ! $inDoubleQuote) {
                $statement = trim($buffer);
                if ($statement !== '') {
                    $statements[] = $statement;
                }

                $buffer = '';
                continue;
            }

            $buffer .= $char;
        }

        $tail = trim($buffer);
        if ($tail !== '') {
            $statements[] = $tail;
        }

        return $statements;
    }

    private function normalizeInsertStatement(string $statement): string
    {
        if (! preg_match('/^INSERT\s+IGNORE\s+INTO\s+(.+?)\s*\((.+?)\)\s*VALUES\s*(.+)$/is', $statement, $matches)) {
            return $statement;
        }

        $table = trim($matches[1]);
        $columns = array_values(array_filter(array_map(static function (string $column): string {
            return trim($column, " \t\n\r\0\x0B`");
        }, explode(',', $matches[2]))));

        if (count($columns) < 2) {
            return str_replace('INSERT IGNORE INTO', 'INSERT INTO', $statement);
        }

        $valueList = trim($matches[3]);
        $updateColumns = array_slice($columns, 1);
        $updates = array_map(static fn (string $column): string => sprintf('`%s` = VALUES(`%s`)', $column, $column), $updateColumns);

        return sprintf(
            'INSERT INTO %s (%s) VALUES %s ON DUPLICATE KEY UPDATE %s',
            $table,
            implode(', ', array_map(static fn (string $column): string => sprintf('`%s`', $column), $columns)),
            $valueList,
            implode(', ', $updates)
        );
    }
}
