<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tb3_vendas', function (Blueprint $table) {
            $table->unsignedInteger('id_comanda')->nullable()->after('tb1_id');
            $table->unsignedBigInteger('id_lanc')->nullable()->after('id_user_vale');
            $table->unsignedTinyInteger('status')->default(0)->after('status_pago');

            $table->index('id_comanda');
            $table->index('id_lanc');
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::table('tb3_vendas', function (Blueprint $table) {
            $table->dropIndex(['id_comanda']);
            $table->dropIndex(['id_lanc']);
            $table->dropIndex(['status']);
            $table->dropColumn(['id_comanda', 'id_lanc', 'status']);
        });
    }
};
