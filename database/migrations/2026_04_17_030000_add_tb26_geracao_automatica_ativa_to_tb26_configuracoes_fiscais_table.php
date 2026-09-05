<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tb26_configuracoes_fiscais', function (Blueprint $table) {
            $table->boolean('tb26_geracao_automatica_ativa')->default(true)->after('tb26_emitir_nfce');
        });
    }

    public function down(): void
    {
        Schema::table('tb26_configuracoes_fiscais', function (Blueprint $table) {
            $table->dropColumn('tb26_geracao_automatica_ativa');
        });
    }
};
