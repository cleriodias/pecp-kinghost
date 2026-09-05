<?php

namespace App\Support;

use RuntimeException;

class FiscalWebserviceResolverService
{
    private const NFCE_AUTHORIZATION_URLS = [
        'GO' => [
            'homologacao' => [
                'authorization' => 'https://homolog.sefaz.go.gov.br/nfe/services/NFeAutorizacao4',
                'authorization_wsdl' => 'https://homolog.sefaz.go.gov.br/nfe/services/NFeAutorizacao4?wsdl',
                'authorization_operation' => 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4/nfeAutorizacaoLote',
                'status' => 'https://homolog.sefaz.go.gov.br/nfe/services/NFeStatusServico4',
                'status_wsdl' => 'https://homolog.sefaz.go.gov.br/nfe/services/NFeStatusServico4?wsdl',
                'return' => 'https://homolog.sefaz.go.gov.br/nfe/services/NFeRetAutorizacao4',
                'return_wsdl' => 'https://homolog.sefaz.go.gov.br/nfe/services/NFeRetAutorizacao4?wsdl',
                'qr_code_url' => 'https://nfewebhomolog.sefaz.go.gov.br/nfeweb/sites/nfce/danfeNFCe',
                'consultation_url' => 'http://www.sefaz.go.gov.br/nfce/consulta',
            ],
            'producao' => [
                'authorization' => 'https://nfe.sefaz.go.gov.br/nfe/services/NFeAutorizacao4',
                'authorization_wsdl' => 'https://nfe.sefaz.go.gov.br/nfe/services/NFeAutorizacao4?wsdl',
                'authorization_operation' => 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4/nfeAutorizacaoLote',
                'status' => 'https://nfe.sefaz.go.gov.br/nfe/services/NFeStatusServico4',
                'status_wsdl' => 'https://nfe.sefaz.go.gov.br/nfe/services/NFeStatusServico4?wsdl',
                'return' => 'https://nfe.sefaz.go.gov.br/nfe/services/NFeRetAutorizacao4',
                'return_wsdl' => 'https://nfe.sefaz.go.gov.br/nfe/services/NFeRetAutorizacao4?wsdl',
                'qr_code_url' => 'https://nfeweb.sefaz.go.gov.br/nfeweb/sites/nfce/danfeNFCe',
                'consultation_url' => 'http://www.sefaz.go.gov.br/nfce/consulta',
            ],
        ],
    ];

    public function resolveNfceEndpoints(string $uf, string $ambiente): array
    {
        $uf = strtoupper(trim($uf));
        $ambiente = strtolower(trim($ambiente));

        $endpoints = self::NFCE_AUTHORIZATION_URLS[$uf][$ambiente] ?? null;

        if (! is_array($endpoints)) {
            throw new RuntimeException(sprintf(
                'Nao existe mapeamento oficial de webservice NFC-e configurado para a UF %s no ambiente %s.',
                $uf !== '' ? $uf : 'NAO INFORMADA',
                $ambiente !== '' ? $ambiente : 'NAO INFORMADO'
            ));
        }

        return $endpoints;
    }
}
