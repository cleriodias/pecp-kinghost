<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tb24_controle_pagamentos', function (Blueprint $table) {
            $table->id();
            $table->string('descricao');
            $table->string('frequencia', 20);
            $table->unsignedTinyInteger('dia_semana')->nullable();
            $table->unsignedTinyInteger('dia_mes')->nullable();
            $table->decimal('valor_total', 12, 2);
            $table->unsignedInteger('quantidade_parcelas');
            $table->decimal('valor_parcela', 12, 2);
            $table->date('data_inicio');
            $table->date('data_fim');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tb24_controle_pagamentos');
    }
};
