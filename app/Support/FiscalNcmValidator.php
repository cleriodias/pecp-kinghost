<?php

namespace App\Support;

class FiscalNcmValidator
{
    private const INVALID_NCMS = [
        '04069000' => 'NCM 04069000 inexistente na tabela vigente. Para mussarela, confira 04061010; para outros itens, consulte a tabela Classif/Receita',
    ];

    public static function invalidCodes(): array
    {
        return array_keys(self::INVALID_NCMS);
    }

    public static function invalidMessage(?string $ncm): ?string
    {
        $digits = preg_replace('/\D+/', '', (string) $ncm);

        return self::INVALID_NCMS[$digits] ?? null;
    }
}
