<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('tb25_produto_movimentacoes')) {
            Schema::create('tb25_produto_movimentacoes', function (Blueprint $table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('product_id');
                $table->unsignedBigInteger('user_id')->nullable();
                $table->unsignedTinyInteger('movement_type')->comment('1: entrada, 0: saida');
                $table->unsignedInteger('quantity');
                $table->unsignedInteger('stock_before');
                $table->unsignedInteger('stock_after');
                $table->string('notes', 255)->nullable();
                $table->timestamps();

                $table->foreign('product_id')
                    ->references('tb1_id')
                    ->on('tb1_produto')
                    ->cascadeOnDelete();
                $table->foreign('user_id')
                    ->references('id')
                    ->on('users')
                    ->nullOnDelete();
                $table->index(['product_id', 'created_at'], 'tb25_prod_mov_prod_created_idx');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('tb25_produto_movimentacoes');
    }
};
