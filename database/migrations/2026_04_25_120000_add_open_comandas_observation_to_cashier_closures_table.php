<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('cashier_closures', function (Blueprint $table) {
            $table->text('open_comandas_observation')
                ->nullable()
                ->after('card_amount');
        });
    }

    public function down(): void
    {
        Schema::table('cashier_closures', function (Blueprint $table) {
            $table->dropColumn('open_comandas_observation');
        });
    }
};
