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
        Schema::create('tb3_vendas', function (Blueprint $table) {
            $table->id('tb3_id');
            $table->unsignedBigInteger('tb1_id');
            $table->string('produto_nome', 120);
            $table->decimal('valor_unitario', 10, 2);
            $table->unsignedInteger('quantidade')->default(1);
            $table->decimal('valor_total', 12, 2);
            $table->timestamp('data_hora')->useCurrent();
            $table->unsignedBigInteger('id_user_caixa');
            $table->unsignedBigInteger('id_user_vale')->nullable();
            $table->unsignedBigInteger('id_unidade');
            $table->enum('tipo_pago', ['maquina', 'dinheiro', 'vale', 'faturar']);
            $table->boolean('status_pago')->default(true);
            $table->timestamps();

            $table->foreign('tb1_id')
                ->references('tb1_id')
                ->on('tb1_produto')
                ->cascadeOnUpdate();

            $table->foreign('id_user_caixa')
                ->references('id')
                ->on('users')
                ->cascadeOnUpdate();

            $table->foreign('id_user_vale')
                ->references('id')
                ->on('users')
                ->nullOnDelete();

            $table->foreign('id_unidade')
                ->references('tb2_id')
                ->on('tb2_unidades')
                ->cascadeOnUpdate();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('tb3_vendas');
    }
};
