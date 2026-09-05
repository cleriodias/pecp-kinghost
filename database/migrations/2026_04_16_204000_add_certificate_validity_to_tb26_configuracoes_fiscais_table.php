<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tb26_configuracoes_fiscais', function (Blueprint $table) {
            $table->timestamp('tb26_certificado_valido_ate')->nullable()->after('tb26_certificado_cnpj');
        });
    }

    public function down(): void
    {
        Schema::table('tb26_configuracoes_fiscais', function (Blueprint $table) {
            $table->dropColumn('tb26_certificado_valido_ate');
        });
    }
};
