<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class UnitSeeder extends Seeder
{
    public function run(): void
    {
        $now = now();
        $units = [
            [
                'tb2_id' => 1,
                'tb2_nome' => 'SETOR 10',
                'tb2_endereco' => 'Area Av-3 Lt, 3/4, Lote 02',
                'tb2_cep' => '72925-170',
                'tb2_fone' => '(61) 9 8452-4923',
                'tb2_cnpj' => '50.359.790/0001-74',
                'tb2_localizacao' => 'https://maps.app.goo.gl/RamuBRPegsbk7NZZA',
                'tb2_status' => 1,
            ],
            [
                'tb2_id' => 2,
                'tb2_nome' => 'SETOR 1',
                'tb2_endereco' => 'Area Av-3 Lt, 3/4, Lote 02',
                'tb2_cep' => '72925-000',
                'tb2_fone' => '(61) 9 8452-4923',
                'tb2_cnpj' => '50.359.790/0001-74',
                'tb2_localizacao' => 'https://maps.app.goo.gl/98f3uSdHqm7d5Xcm9',
                'tb2_status' => 1,
            ],
            [
                'tb2_id' => 3,
                'tb2_nome' => 'BARRAGEM 1',
                'tb2_endereco' => 'Area Av-3 Lt, 3/4, Lote 02',
                'tb2_cep' => '72925-000',
                'tb2_fone' => '(61) 9 8452-4923',
                'tb2_cnpj' => '50.359.790/0001-74',
                'tb2_localizacao' => 'https://maps.app.goo.gl/ZeCTtye7KcYZ56E88',
                'tb2_status' => 1,
            ],
        ];

        foreach ($units as $unit) {
            DB::table('tb2_unidades')->updateOrInsert(
                ['tb2_id' => $unit['tb2_id']],
                array_merge($unit, ['created_at' => $now, 'updated_at' => $now])
            );
        }
    }
}
