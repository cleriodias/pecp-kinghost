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
        Schema::create('tb4_vendas_pg', function (Blueprint $table) {
            $table->id('tb4_id');
            $table->decimal('valor_total', 12, 2);
            $table->string('tipo_pagamento', 20);
            $table->decimal('valor_pago', 12, 2)->nullable();
            $table->decimal('troco', 12, 2)->default(0);
            $table->decimal('dois_pgto', 12, 2)->default(0);
            $table->timestamps();
        });

        Schema::table('tb3_vendas', function (Blueprint $table) {
            $table->unsignedBigInteger('tb4_id')
                ->nullable()
                ->after('tb3_id');

            $table->foreign('tb4_id')
                ->references('tb4_id')
                ->on('tb4_vendas_pg')
                ->cascadeOnUpdate()
                ->nullOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('tb3_vendas', function (Blueprint $table) {
            $table->dropForeign(['tb4_id']);
            $table->dropColumn('tb4_id');
        });

        Schema::dropIfExists('tb4_vendas_pg');
    }
};
