<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('tb1_produto', function (Blueprint $table) {
            if (!Schema::hasColumn('tb1_produto', 'tb1_vr_credit')) {
                $table->boolean('tb1_vr_credit')->default(false)->after('tb1_favorito');
            }
        });

        DB::table('tb1_produto')
            ->whereIn('tb1_id', [
                1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
                16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28,
                30, 35, 36, 71, 72,
            ])
            ->update(['tb1_vr_credit' => true]);
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('tb1_produto', function (Blueprint $table) {
            if (Schema::hasColumn('tb1_produto', 'tb1_vr_credit')) {
                $table->dropColumn('tb1_vr_credit');
            }
        });
    }
};
