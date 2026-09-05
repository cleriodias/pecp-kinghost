<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tb26_configuracoes_fiscais', function (Blueprint $table) {
            $table->string('tb26_certificado_nome')->nullable()->after('tb26_certificado_tipo');
            $table->string('tb26_certificado_cnpj', 14)->nullable()->after('tb26_certificado_nome');
        });
    }

    public function down(): void
    {
        Schema::table('tb26_configuracoes_fiscais', function (Blueprint $table) {
            $table->dropColumn([
                'tb26_certificado_nome',
                'tb26_certificado_cnpj',
            ]);
        });
    }
};
