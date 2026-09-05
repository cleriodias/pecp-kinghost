<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class VrCreditProdutoSeeder extends Seeder
{
    public function run(): void
    {
        DB::table('tb1_produto')
            ->whereIn('tb1_id', [
                1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
                11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
                21, 22, 23, 24, 25, 26, 27, 28, 30, 35,
                36, 71, 72,
            ])
            ->update([
                'tb1_vr_credit' => true,
                'updated_at' => now(),
            ]);
    }
}
