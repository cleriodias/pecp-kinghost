<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('tb30_matrizes')) {
            Schema::create('tb30_matrizes', function (Blueprint $table) {
                $table->bigIncrements('tb30_id');
                $table->string('tb30_nome')->unique();
                $table->string('tb30_slug')->unique();
                $table->tinyInteger('tb30_status')->default(1);
                $table->timestamps();
            });
        }

        $tables = [
            'suppliers',
            'tb2_unidades',
            'users',
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
            'tb24_controle_pagamentos',
            'tb25_produto_movimentacoes',
            'product_discards',
            'sales_disputes',
            'sales_dispute_bids',
            'tb18_chamados',
            'tb19_chamado_interacoes',
            'tb20_chamado_anexos',
            'tb23_anydesck_codigos',
        ];

        foreach ($tables as $tableName) {
            if (! Schema::hasTable($tableName) || Schema::hasColumn($tableName, 'matriz_id')) {
                continue;
            }

            Schema::table($tableName, function (Blueprint $table) {
                $table->unsignedBigInteger('matriz_id')->nullable()->index();
            });
        }
    }

    public function down(): void
    {
        $tables = [
            'tb23_anydesck_codigos',
            'tb20_chamado_anexos',
            'tb19_chamado_interacoes',
            'tb18_chamados',
            'sales_dispute_bids',
            'sales_disputes',
            'product_discards',
            'tb25_produto_movimentacoes',
            'tb24_controle_pagamentos',
            'tb22_chat_mensagens',
            'tb_16_boletos',
            'salary_advances',
            'expenses',
            'cashier_closures',
            'tb27_notas_fiscais',
            'tb3_vendas',
            'tb4_vendas_pg',
            'tb26_configuracoes_fiscais',
            'tb1_produto',
            'users',
            'tb2_unidades',
            'suppliers',
        ];

        foreach ($tables as $tableName) {
            if (! Schema::hasTable($tableName) || ! Schema::hasColumn($tableName, 'matriz_id')) {
                continue;
            }

            Schema::table($tableName, function (Blueprint $table) {
                $table->dropColumn('matriz_id');
            });
        }

        Schema::dropIfExists('tb30_matrizes');
    }
};
