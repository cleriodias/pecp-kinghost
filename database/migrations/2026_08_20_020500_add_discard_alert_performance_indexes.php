<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (DB::getDriverName() === 'sqlite') {
            return;
        }

        if (Schema::hasTable('tb3_vendas')) {
            $this->addIndexIfMissing(
                'tb3_vendas',
                'tb3_vendas_unit_payment_idx',
                'ALTER TABLE tb3_vendas ADD INDEX tb3_vendas_unit_payment_idx (id_unidade, tb4_id)'
            );
        }

        if (Schema::hasTable('tb4_vendas_pg')) {
            $this->addIndexIfMissing(
                'tb4_vendas_pg',
                'tb4_vendas_pg_created_payment_total_idx',
                'ALTER TABLE tb4_vendas_pg ADD INDEX tb4_vendas_pg_created_payment_total_idx (created_at, tb4_id, valor_total)'
            );
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'sqlite') {
            return;
        }

        $this->dropIndexIfExists('tb4_vendas_pg', 'tb4_vendas_pg_created_payment_total_idx');
        $this->dropIndexIfExists('tb3_vendas', 'tb3_vendas_unit_payment_idx');
    }

    private function addIndexIfMissing(string $table, string $index, string $statement): void
    {
        if (! $this->indexExists($table, $index)) {
            DB::statement($statement);
        }
    }

    private function dropIndexIfExists(string $table, string $index): void
    {
        if (Schema::hasTable($table) && $this->indexExists($table, $index)) {
            DB::statement(sprintf('ALTER TABLE %s DROP INDEX %s', $table, $index));
        }
    }

    private function indexExists(string $table, string $index): bool
    {
        if (! Schema::hasTable($table)) {
            return false;
        }

        return DB::table('information_schema.statistics')
            ->where('table_schema', DB::raw('DATABASE()'))
            ->where('table_name', $table)
            ->where('index_name', $index)
            ->exists();
    }
};
