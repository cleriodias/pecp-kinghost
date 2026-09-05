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

        if (! Schema::hasTable('tb3_vendas')) {
            return;
        }

        $this->addIndexIfMissing(
            'tb3_vendas',
            'tb3_vendas_payment_unit_id_idx',
            'ALTER TABLE tb3_vendas ADD INDEX tb3_vendas_payment_unit_id_idx (tb4_id, id_unidade, tb3_id)'
        );

        $this->addIndexIfMissing(
            'tb3_vendas',
            'tb3_vendas_tipo_unit_data_idx',
            'ALTER TABLE tb3_vendas ADD INDEX tb3_vendas_tipo_unit_data_idx (tipo_pago, id_unidade, data_hora)'
        );
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'sqlite') {
            return;
        }

        $this->dropIndexIfExists('tb3_vendas', 'tb3_vendas_tipo_unit_data_idx');
        $this->dropIndexIfExists('tb3_vendas', 'tb3_vendas_payment_unit_id_idx');
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
