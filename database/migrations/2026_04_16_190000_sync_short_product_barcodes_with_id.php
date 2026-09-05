<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (DB::getDriverName() === 'sqlite') {
            return;
        }

        DB::table('tb1_produto')
            ->whereRaw('CHAR_LENGTH(TRIM(tb1_codbar)) < 7')
            ->update([
                'tb1_codbar' => DB::raw("CONCAT('__SYNC_TB1_ID__', CAST(tb1_id AS CHAR))"),
            ]);

        DB::table('tb1_produto')
            ->where('tb1_codbar', 'like', '__SYNC_TB1_ID__%')
            ->update([
                'tb1_codbar' => DB::raw("REPLACE(tb1_codbar, '__SYNC_TB1_ID__', '')"),
            ]);
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // Sem reversao automatica: os valores anteriores de tb1_codbar nao sao recuperaveis.
    }
};
