<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tb29_contra_cheque_pagamentos', function (Blueprint $table) {
            $table->bigIncrements('tb29_id');
            $table->unsignedBigInteger('user_id');
            $table->unsignedBigInteger('tb29_registrado_por')->nullable();
            $table->date('tb29_periodo_inicio');
            $table->date('tb29_periodo_fim');
            $table->date('tb29_data_pagamento');
            $table->timestamps();

            $table
                ->foreign('user_id')
                ->references('id')
                ->on('users')
                ->cascadeOnDelete();

            $table
                ->foreign('tb29_registrado_por')
                ->references('id')
                ->on('users')
                ->nullOnDelete();

            $table->unique(
                ['user_id', 'tb29_periodo_inicio', 'tb29_periodo_fim'],
                'tb29_contra_cheque_pagamentos_periodo_unique'
            );
            $table->index(['tb29_periodo_inicio', 'tb29_periodo_fim'], 'tb29_contra_cheque_pagamentos_periodo_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tb29_contra_cheque_pagamentos');
    }
};
