<?php

namespace Database\Seeders;

use App\Models\Supplier;
use Illuminate\Database\Seeder;

class SupplierSeeder extends Seeder
{
    public function run(): void
    {
        $suppliers = [
            [
                'name' => 'ESTRELINHA',
                'dispute' => false,
                'access_code' => '6446',
            ],
            [
                'name' => 'BONA MIX ATACADISTA',
                'dispute' => true,
                'access_code' => '1221',
            ],
            [
                'name' => 'PEROLA ATACADISTA',
                'dispute' => false,
                'access_code' => '0110',
            ],
            [
                'name' => 'S.A ATACADISTA ',
                'dispute' => false,
                'access_code' => '6116',
            ],
            [
                'name' => 'MAX GOUD ATACADISTA',
                'dispute' => true,
                'access_code' => '8008',
            ],
            [
                'name' => 'UNIPAN ATACADISTA',
                'dispute' => true,
                'access_code' => '6006',
            ],
            [
                'name' => 'BRF',
                'dispute' => true,
                'access_code' => '7447',
            ],
            [
                'name' => 'REALLI',
                'dispute' => true,
                'access_code' => '2552',
            ],
            [
                'name' => 'GUARA DISTRIBUICAO',
                'dispute' => true,
                'access_code' => '3003',
            ],
            [
                'name' => 'OVO',
                'dispute' => true,
                'access_code' => '1',
            ],
            [
                'name' => 'IORGUTE GOIANINHO',
                'dispute' => true,
                'access_code' => '2',
            ],
            [
                'name' => 'ELMA CHIPS',
                'dispute' => true,
                'access_code' => '3',
            ],
            [
                'name' => 'MICOS SALGADINHO',
                'dispute' => true,
                'access_code' => '4',
            ],
            [
                'name' => 'CAPITAL EMBALAGUENS',
                'dispute' => true,
                'access_code' => '5',
            ],
            [
                'name' => 'ATACADAO DIA A DIA',
                'dispute' => true,
                'access_code' => '6',
            ],
            [
                'name' => 'MERCADO IDEAL',
                'dispute' => true,
                'access_code' => '7',
            ],
            [
                'name' => 'ALMOÇO',
                'dispute' => true,
                'access_code' => '8',
            ],
            [
                'name' => 'PASSAGEM FUNCIONARIO',
                'dispute' => true,
                'access_code' => '9',
            ],
            [
                'name' => 'PAMONHA',
                'dispute' => true,
                'access_code' => '10',
            ],
            [
                'name' => 'VILMA CIGARRO',
                'dispute' => true,
                'access_code' => '11',
            ],
            [
                'name' => 'PAGAMENTO DE DIARIAS',
                'dispute' => true,
                'access_code' => '12',
            ],
            [
                'name' => 'RODRIGO RETIRADA',
                'dispute' => true,
                'access_code' => '13',
            ],
            [
                'name' => 'PRESUNTO JAL ALIMENTOS',
                'dispute' => true,
                'access_code' => '14',
            ],
            [
                'name' => 'IORGUTE GOIANINHO',
                'dispute' => true,
                'access_code' => '15',
            ],
            [
                'name' => 'JM CAMPOS ETIQUETAS',
                'dispute' => true,
                'access_code' => '16',
            ],
            [
                'name' => 'COCADA E LEITE NINHO',
                'dispute' => true,
                'access_code' => '17',
            ],
        ];

        foreach ($suppliers as $payload) {
            Supplier::updateOrCreate(
                ['access_code' => $payload['access_code']],
                $payload
            );
        }
    }
}
