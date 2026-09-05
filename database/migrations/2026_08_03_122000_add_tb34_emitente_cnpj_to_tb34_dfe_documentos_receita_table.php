<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('tb34_dfe_documentos_receita')) {
            return;
        }

        if (! Schema::hasColumn('tb34_dfe_documentos_receita', 'tb34_emitente_cnpj')) {
            Schema::table('tb34_dfe_documentos_receita', function (Blueprint $table) {
                $table->string('tb34_emitente_cnpj', 14)->nullable()->after('tb34_cnpj');
                $table->index('tb34_emitente_cnpj', 'tb34_emitente_cnpj_index');
            });
        }
    }

    public function down(): void
    {
        if (! Schema::hasTable('tb34_dfe_documentos_receita') || ! Schema::hasColumn('tb34_dfe_documentos_receita', 'tb34_emitente_cnpj')) {
            return;
        }

        Schema::table('tb34_dfe_documentos_receita', function (Blueprint $table) {
            $table->dropIndex('tb34_emitente_cnpj_index');
            $table->dropColumn('tb34_emitente_cnpj');
        });
    }
};
