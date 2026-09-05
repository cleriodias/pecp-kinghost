<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('tb3_vendas', function (Blueprint $table) {
            $table->enum('vale_tipo', ['vale', 'refeicao'])
                ->nullable()
                ->after('tipo_pago');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('tb3_vendas', function (Blueprint $table) {
            $table->dropColumn('vale_tipo');
        });
    }
};
