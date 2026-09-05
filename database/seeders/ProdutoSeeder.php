<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class ProdutoSeeder extends Seeder
{
    public function run(): void
    {
        $path = $this->resolveSqlPath();

        if (! $path) {
            $this->command?->warn('Arquivo SQL de tb1_produto nao encontrado em database/.');
            return;
        }

        $sql = file_get_contents($path);
        if ($sql === false) {
            $this->command?->warn('Falha ao ler o arquivo SQL de tb1_produto.');
            return;
        }

        preg_match_all('/INSERT INTO `tb1_produto`[^;]*?VALUES\\s*(.+?);/s', $sql, $matches);

        if (empty($matches[1])) {
            $this->command?->warn('Nenhum INSERT de tb1_produto encontrado no arquivo SQL.');
            return;
        }

        DB::statement("SET SESSION sql_mode = CONCAT(@@sql_mode, ',NO_AUTO_VALUE_ON_ZERO')");

        $seenCodbar = [];
        $batch = [];
        $now = now();

        foreach ($matches[1] as $valuesBlock) {
            foreach ($this->splitRows($valuesBlock) as $row) {
                $fields = $this->parseRow($row);

                if (count($fields) < 6) {
                    continue;
                }

                $id = (int) $fields[0];
                $name = $this->normalizeName($fields[1]);
                $cost = $this->normalizeNumber($fields[2]);
                $price = $this->normalizeNumber($fields[3]);
                $codbar = $this->normalizeCodbar($fields[4], $id, $seenCodbar);
                $tipo = (int) $this->normalizeNumber($fields[5]);

                $batch[] = [
                    'tb1_id' => $id,
                    'tb1_nome' => $name,
                    'tb1_vlr_custo' => $cost,
                    'tb1_vlr_venda' => $price,
                    'tb1_codbar' => $codbar,
                    'tb1_tipo' => $tipo,
                    'created_at' => $now,
                    'updated_at' => $now,
                ];

                if (count($batch) >= 500) {
                    $this->upsertBatch($batch);
                    $batch = [];
                }
            }
        }

        if ($batch) {
            $this->upsertBatch($batch);
        }
    }

    private function resolveSqlPath(): ?string
    {
        $primary = database_path('tb1_produto.sql');
        if (is_file($primary)) {
            return $primary;
        }

        $candidates = array_merge(
            glob(database_path('*.sql')) ?: [],
            glob(database_path('*.dump')) ?: [],
            glob(database_path('*.crdownload')) ?: [],
            glob(database_path('*.txt')) ?: []
        );

        foreach ($candidates as $candidate) {
            if (! is_file($candidate)) {
                continue;
            }

            $head = file_get_contents($candidate, false, null, 0, 2048);
            if ($head !== false && str_contains($head, 'tb1_produto')) {
                return $candidate;
            }
        }

        return null;
    }

    private function splitRows(string $valuesBlock): array
    {
        $valuesBlock = trim($valuesBlock);
        if ($valuesBlock === '') {
            return [];
        }

        if ($valuesBlock[0] === '(') {
            $valuesBlock = substr($valuesBlock, 1);
        }

        if (substr($valuesBlock, -1) === ')') {
            $valuesBlock = substr($valuesBlock, 0, -1);
        }

        return preg_split('/\\),\\s*\\(/', $valuesBlock) ?: [];
    }

    private function parseRow(string $row): array
    {
        $fields = [];
        $field = '';
        $inString = false;
        $wasQuoted = false;
        $len = strlen($row);

        for ($i = 0; $i < $len; $i++) {
            $ch = $row[$i];

            if ($inString) {
                if ($ch === "'") {
                    if ($i + 1 < $len && $row[$i + 1] === "'") {
                        $field .= "'";
                        $i++;
                        continue;
                    }

                    $inString = false;
                    continue;
                }

                $field .= $ch;
                continue;
            }

            if ($ch === "'") {
                $inString = true;
                $wasQuoted = true;
                continue;
            }

            if ($ch === ',') {
                $fields[] = $wasQuoted ? $field : trim($field);
                $field = '';
                $wasQuoted = false;
                continue;
            }

            if ($wasQuoted && ($ch === ' ' || $ch === "\r" || $ch === "\n" || $ch === "\t")) {
                continue;
            }

            $field .= $ch;
        }

        $fields[] = $wasQuoted ? $field : trim($field);

        return $fields;
    }

    private function normalizeNumber(?string $value): string
    {
        $value = trim((string) $value);
        if ($value === '' || strcasecmp($value, 'NULL') === 0) {
            return '0';
        }

        return $value;
    }

    private function normalizeName(?string $value): string
    {
        $name = trim((string) $value);
        $limit = 45;

        if (function_exists('mb_strlen') && mb_strlen($name, 'UTF-8') > $limit) {
            return mb_substr($name, 0, $limit, 'UTF-8');
        }

        if (strlen($name) > $limit) {
            return substr($name, 0, $limit);
        }

        return $name;
    }

    private function normalizeCodbar(?string $codbar, int $id, array &$seen): string
    {
        $codbar = trim((string) $codbar);

        if ($codbar === '' || $codbar === '0' || strcasecmp($codbar, 'NULL') === 0) {
            $codbar = 'SEM-' . $id;
        }

        $base = substr($codbar, 0, 64);
        $candidate = $base;

        if (isset($seen[$candidate])) {
            $suffix = '-' . $id;
            $candidate = substr($base . $suffix, 0, 64);
            $counter = 1;

            while (isset($seen[$candidate])) {
                $candidate = substr($base . $suffix . '-' . $counter, 0, 64);
                $counter++;
            }
        }

        $seen[$candidate] = true;

        return $candidate;
    }

    private function upsertBatch(array $rows): void
    {
        DB::table('tb1_produto')->upsert(
            $rows,
            ['tb1_id'],
            ['tb1_nome', 'tb1_vlr_custo', 'tb1_vlr_venda', 'tb1_codbar', 'tb1_tipo', 'updated_at']
        );
    }
}
