<?php

namespace App\Support;

class FiscalMunicipalityCodeService
{
    private const UF_IBGE_PREFIX = [
        'RO' => '11',
        'AC' => '12',
        'AM' => '13',
        'RR' => '14',
        'PA' => '15',
        'AP' => '16',
        'TO' => '17',
        'MA' => '21',
        'PI' => '22',
        'CE' => '23',
        'RN' => '24',
        'PB' => '25',
        'PE' => '26',
        'AL' => '27',
        'SE' => '28',
        'BA' => '29',
        'MG' => '31',
        'ES' => '32',
        'RJ' => '33',
        'SP' => '35',
        'PR' => '41',
        'SC' => '42',
        'RS' => '43',
        'MS' => '50',
        'MT' => '51',
        'GO' => '52',
        'DF' => '53',
    ];

    public function expectedPrefixForUf(?string $uf): ?string
    {
        $uf = strtoupper(trim((string) $uf));

        return self::UF_IBGE_PREFIX[$uf] ?? null;
    }

    public function matchesUf(?string $uf, ?string $municipalityCode): bool
    {
        $expectedPrefix = $this->expectedPrefixForUf($uf);
        $municipalityCode = preg_replace('/\D+/', '', (string) $municipalityCode);

        if ($expectedPrefix === null || $municipalityCode === '' || strlen($municipalityCode) < 2) {
            return true;
        }

        return substr($municipalityCode, 0, 2) === $expectedPrefix;
    }
}
