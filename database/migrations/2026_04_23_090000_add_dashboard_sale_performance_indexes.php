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

        if (Schema::hasTable('tb1_produto')) {
            $this->addIndexIfMissing(
                'tb1_produto',
                'tb1_produto_nome_fulltext',
                'ALTER TABLE tb1_produto ADD FULLTEXT INDEX tb1_produto_nome_fulltext (tb1_nome)'
            );

            $this->addIndexIfMissing(
                'tb1_produto',
                'tb1_produto_fav_status_nome_idx',
                'ALTER TABLE tb1_produto ADD INDEX tb1_produto_fav_status_nome_idx (tb1_favorito, tb1_status, tb1_nome)'
            );

            $this->addIndexIfMissing(
                'tb1_produto',
                'tb1_produto_status_nome_idx',
                'ALTER TABLE tb1_produto ADD INDEX tb1_produto_status_nome_idx (tb1_status, tb1_nome)'
            );
        }

        if (Schema::hasTable('tb3_vendas')) {
            $this->addIndexIfMissing(
                'tb3_vendas',
                'tb3_vendas_unit_status_comanda_idx',
                'ALTER TABLE tb3_vendas ADD INDEX tb3_vendas_unit_status_comanda_idx (id_unidade, status, id_comanda)'
            );

            $this->addIndexIfMissing(
                'tb3_vendas',
                'tb3_vendas_unit_status_data_idx',
                'ALTER TABLE tb3_vendas ADD INDEX tb3_vendas_unit_status_data_idx (id_unidade, status, data_hora)'
            );

            $this->addIndexIfMissing(
                'tb3_vendas',
                'tb3_vendas_caixa_unit_status_data_idx',
                'ALTER TABLE tb3_vendas ADD INDEX tb3_vendas_caixa_unit_status_data_idx (id_user_caixa, id_unidade, status, data_hora)'
            );

            $this->addIndexIfMissing(
                'tb3_vendas',
                'tb3_vendas_tipo_vale_data_idx',
                'ALTER TABLE tb3_vendas ADD INDEX tb3_vendas_tipo_vale_data_idx (tipo_pago, id_user_vale, data_hora)'
            );
        }

        if (Schema::hasTable('tb4_vendas_pg')) {
            $this->addIndexIfMissing(
                'tb4_vendas_pg',
                'tb4_vendas_pg_created_idx',
                'ALTER TABLE tb4_vendas_pg ADD INDEX tb4_vendas_pg_created_idx (created_at)'
            );
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'sqlite') {
            return;
        }

        $this->dropIndexIfExists('tb4_vendas_pg', 'tb4_vendas_pg_created_idx');
        $this->dropIndexIfExists('tb3_vendas', 'tb3_vendas_tipo_vale_data_idx');
        $this->dropIndexIfExists('tb3_vendas', 'tb3_vendas_caixa_unit_status_data_idx');
        $this->dropIndexIfExists('tb3_vendas', 'tb3_vendas_unit_status_data_idx');
        $this->dropIndexIfExists('tb3_vendas', 'tb3_vendas_unit_status_comanda_idx');
        $this->dropIndexIfExists('tb1_produto', 'tb1_produto_status_nome_idx');
        $this->dropIndexIfExists('tb1_produto', 'tb1_produto_fav_status_nome_idx');
        $this->dropIndexIfExists('tb1_produto', 'tb1_produto_nome_fulltext');
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
