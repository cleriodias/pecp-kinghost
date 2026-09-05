<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (DB::getDriverName() !== 'sqlite') {
            DB::statement("ALTER TABLE tb3_vendas MODIFY tipo_pago ENUM('maquina','dinheiro','vale','refeicao','faturar') NOT NULL");
        }

        DB::table('tb3_vendas')
            ->where('vale_tipo', 'refeicao')
            ->update(['tipo_pago' => 'refeicao']);

        Schema::table('tb3_vendas', function (Blueprint $table) {
            $table->dropColumn('vale_tipo');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('tb3_vendas', function (Blueprint $table) {
            $table->enum('vale_tipo', ['vale', 'refeicao'])->nullable()->after('tipo_pago');
        });

        DB::table('tb3_vendas')
            ->where('tipo_pago', 'refeicao')
            ->update([
                'vale_tipo' => 'refeicao',
                'tipo_pago' => 'vale',
            ]);

        if (DB::getDriverName() !== 'sqlite') {
            DB::statement("ALTER TABLE tb3_vendas MODIFY tipo_pago ENUM('maquina','dinheiro','vale','faturar') NOT NULL");
        }
    }
};
