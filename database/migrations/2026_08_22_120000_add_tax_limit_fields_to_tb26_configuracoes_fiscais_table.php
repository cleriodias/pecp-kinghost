<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tb26_configuracoes_fiscais', function (Blueprint $table) {
            if (! Schema::hasColumn('tb26_configuracoes_fiscais', 'tb26_limite_imposto_ativo')) {
                $table->boolean('tb26_limite_imposto_ativo')->default(false)->after('tb26_geracao_automatica_ativa');
            }

            if (! Schema::hasColumn('tb26_configuracoes_fiscais', 'tb26_limite_imposto_diario')) {
                $table->decimal('tb26_limite_imposto_diario', 12, 2)->nullable()->after('tb26_limite_imposto_ativo');
            }

            if (! Schema::hasColumn('tb26_configuracoes_fiscais', 'tb26_limite_imposto_mensal')) {
                $table->decimal('tb26_limite_imposto_mensal', 12, 2)->nullable()->after('tb26_limite_imposto_diario');
            }

            if (! Schema::hasColumn('tb26_configuracoes_fiscais', 'tb26_limite_valor_compra')) {
                $table->decimal('tb26_limite_valor_compra', 12, 2)->nullable()->after('tb26_limite_imposto_mensal');
            }

            if (! Schema::hasColumn('tb26_configuracoes_fiscais', 'tb26_limite_imposto_bloqueado_por')) {
                $table->string('tb26_limite_imposto_bloqueado_por', 20)->nullable()->after('tb26_limite_valor_compra');
            }

            if (! Schema::hasColumn('tb26_configuracoes_fiscais', 'tb26_limite_imposto_bloqueado_em')) {
                $table->timestamp('tb26_limite_imposto_bloqueado_em')->nullable()->after('tb26_limite_imposto_bloqueado_por');
            }
        });
    }

    public function down(): void
    {
        Schema::table('tb26_configuracoes_fiscais', function (Blueprint $table) {
            $columns = [
                'tb26_limite_imposto_ativo',
                'tb26_limite_imposto_diario',
                'tb26_limite_imposto_mensal',
                'tb26_limite_valor_compra',
                'tb26_limite_imposto_bloqueado_por',
                'tb26_limite_imposto_bloqueado_em',
            ];

            foreach ($columns as $column) {
                if (Schema::hasColumn('tb26_configuracoes_fiscais', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};
