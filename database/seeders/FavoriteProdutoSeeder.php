<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class FavoriteProdutoSeeder extends Seeder
{
    public function run(): void
    {
        DB::table('tb1_produto')
            ->whereIn('tb1_id', [
                2284, 2285, 2286, 2906, 2287,
                2289, 2288, 2230, 2232, 2290,
            ])
            ->update([
                'tb1_favorito' => true,
                'updated_at' => now(),
            ]);
    }
}
