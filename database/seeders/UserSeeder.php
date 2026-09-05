<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class UserSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $users = [
            [
                'name' => 'Clerio',
                'email' => 'cleriodias@gmail.com',
                'password' => Hash::make('0800'),
                'funcao' => 0,
                'funcao_original' => 0,
                'hr_ini' => '00:00:00',
                'hr_fim' => '23:00:00',
                'tb2_id' => 1,
                'cod_acesso' => '0800',
            ],
            [
                'name' => 'Rodrigo',
                'email' => 'trucadoturbinado@gmail.com',
                'password' => Hash::make('0258'),
                'hr_ini' => '00:00:00',
                'hr_fim' => '23:00:00',
                'funcao' => 0,
                'funcao_original' => 0,
                'tb2_id' => 1,
                'cod_acesso' => '0258',
            ],
            [
                'name' => 'Selma',
                'email' => 'paoecaf83@gmail.com',
                'password' => Hash::make('025879'),
                'funcao' => 1,
                'funcao_original' => 1,
                'hr_ini' => '00:00:00',
                'hr_fim' => '23:00:00',
                'tb2_id' => 1,
                'cod_acesso' => '8520',
            ],
        ];

        foreach ($users as $payload) {
            User::updateOrCreate(
                ['email' => $payload['email']],
                $payload
            );
        }
    }
}
