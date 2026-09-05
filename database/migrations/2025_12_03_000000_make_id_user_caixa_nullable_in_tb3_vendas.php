<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('tb3_vendas', function (Blueprint $table) {
            $table->dropForeign(['id_user_caixa']);
            $table->unsignedBigInteger('id_user_caixa')->nullable()->change();
            $table->foreign('id_user_caixa')
                ->references('id')
                ->on('users')
                ->nullOnDelete()
                ->cascadeOnUpdate();
        });
    }

    public function down(): void
    {
        Schema::table('tb3_vendas', function (Blueprint $table) {
            $table->dropForeign(['id_user_caixa']);
            $table->unsignedBigInteger('id_user_caixa')->nullable(false)->change();
            $table->foreign('id_user_caixa')
                ->references('id')
                ->on('users')
                ->cascadeOnUpdate();
        });
    }
};
