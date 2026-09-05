<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('tb1_produto', 'tb1_qtd')) {
            Schema::table('tb1_produto', function (Blueprint $table) {
                $table->unsignedInteger('tb1_qtd')->default(0)->after('tb1_tipo');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('tb1_produto', 'tb1_qtd')) {
            Schema::table('tb1_produto', function (Blueprint $table) {
                $table->dropColumn('tb1_qtd');
            });
        }
    }
};
