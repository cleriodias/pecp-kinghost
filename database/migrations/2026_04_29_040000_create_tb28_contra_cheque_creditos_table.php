<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tb28_contra_cheque_creditos', function (Blueprint $table) {
            $table->bigIncrements('tb28_id');
            $table->unsignedBigInteger('user_id');
            $table->date('tb28_periodo_inicio');
            $table->date('tb28_periodo_fim');
            $table->string('tb28_tipo', 40);
            $table->string('tb28_descricao', 255)->nullable();
            $table->decimal('tb28_valor', 12, 2);
            $table->timestamps();

            $table
                ->foreign('user_id')
                ->references('id')
                ->on('users')
                ->cascadeOnDelete();

            $table->index(['user_id', 'tb28_periodo_inicio', 'tb28_periodo_fim'], 'tb28_contra_cheque_creditos_periodo_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tb28_contra_cheque_creditos');
    }
};
