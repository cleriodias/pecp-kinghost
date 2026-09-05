<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tb1_produto', function (Blueprint $table) {
            $table->string('tb1_ncm', 8)->nullable()->after('tb1_codbar');
            $table->string('tb1_cest', 7)->nullable()->after('tb1_ncm');
            $table->string('tb1_cfop', 4)->nullable()->after('tb1_cest');
            $table->string('tb1_unidade_comercial', 6)->default('UN')->after('tb1_cfop');
            $table->string('tb1_unidade_tributavel', 6)->default('UN')->after('tb1_unidade_comercial');
            $table->unsignedTinyInteger('tb1_origem')->default(0)->after('tb1_unidade_tributavel');
            $table->string('tb1_csosn', 4)->nullable()->after('tb1_origem');
            $table->string('tb1_cst', 3)->nullable()->after('tb1_csosn');
            $table->decimal('tb1_aliquota_icms', 5, 2)->default(0)->after('tb1_cst');
        });
    }

    public function down(): void
    {
        Schema::table('tb1_produto', function (Blueprint $table) {
            $table->dropColumn([
                'tb1_ncm',
                'tb1_cest',
                'tb1_cfop',
                'tb1_unidade_comercial',
                'tb1_unidade_tributavel',
                'tb1_origem',
                'tb1_csosn',
                'tb1_cst',
                'tb1_aliquota_icms',
            ]);
        });
    }
};
