<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class UserUnitSeeder extends Seeder
{
    public function run(): void
    {
        $unitIds = [1, 2, 3];
        $emails = [
            'cleriodias@gmail.com',
            'trucadoturbinado@gmail.com',
            'paoecaf83@gmail.com',
        ];

        foreach ($emails as $email) {
            $userId = User::where('email', $email)->value('id');

            if (! $userId) {
                continue;
            }

            foreach ($unitIds as $unitId) {
                DB::table('tb2_unidade_user')->updateOrInsert(
                    ['user_id' => $userId, 'tb2_id' => $unitId],
                    ['created_at' => now(), 'updated_at' => now()]
                );
            }
        }
    }
}
