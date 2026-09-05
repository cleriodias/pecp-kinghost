<?php

namespace App\Support;

use App\Models\ConfiguracaoFiscal;
use App\Models\NotaFiscal;
use App\Models\Produto;
use App\Models\Unidade;
use App\Models\Venda;
use App\Models\VendaPagamento;
use Carbon\Carbon;
use DOMDocument;
use DOMElement;
use RobRichards\XMLSecLibs\XMLSecurityDSig;
use RobRichards\XMLSecLibs\XMLSecurityKey;
use RuntimeException;

class FiscalNfceXmlService
{
    private const HOMOLOGATION_ITEM_DESCRIPTION = 'NOTA FISCAL EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL';

    public function __construct(
        private readonly FiscalWebserviceResolverService $fiscalWebserviceResolverService,
    ) {
    }

    public function buildSignedXml(
        NotaFiscal $invoice,
        VendaPagamento $payment,
        $sales,
        ?array $consumer,
        ConfiguracaoFiscal $configuration,
        array $certificateData,
        ?Unidade $emitterUnit = null,
    ): array {
        if ($invoice->tb27_modelo !== 'nfce') {
            throw new RuntimeException('A geracao automatica de XML assinado nesta etapa esta disponivel apenas para NFC-e.');
        }

        $unit = $emitterUnit ?: $sales->first()?->unidade;

        if (! $unit) {
            throw new RuntimeException('Nao foi possivel identificar a loja da venda para gerar o XML fiscal.');
        }

        $issueDate = Carbon::now();
        $unitCnpj = $this->onlyDigits($unit->tb2_cnpj);
        $municipalityCode = $this->onlyDigits($configuration->tb26_codigo_municipio);
        $serie = $this->normalizeSerie($invoice->tb27_serie);
        $number = (int) $invoice->tb27_numero;
        $modelCode = '65';
        $cUf = substr((string) $municipalityCode, 0, 2);
        $cNf = $this->generateRandomCode($payment->tb4_id);
        $accessKeyWithoutDigit = $cUf
            . $issueDate->format('ym')
            . $unitCnpj
            . $modelCode
            . str_pad($serie, 3, '0', STR_PAD_LEFT)
            . str_pad((string) $number, 9, '0', STR_PAD_LEFT)
            . '1'
            . $cNf;
        $verifierDigit = $this->calculateAccessKeyDigit($accessKeyWithoutDigit);
        $accessKey = $accessKeyWithoutDigit . $verifierDigit;
        $endpoints = $this->fiscalWebserviceResolverService->resolveNfceEndpoints(
            (string) $configuration->tb26_uf,
            (string) $configuration->tb26_ambiente,
        );

        $document = new DOMDocument('1.0', 'UTF-8');
        $document->preserveWhiteSpace = false;
        $document->formatOutput = false;

        $nfe = $document->createElementNS('http://www.portalfiscal.inf.br/nfe', 'NFe');
        $document->appendChild($nfe);

        $infNfe = $document->createElement('infNFe');
        $infNfe->setAttribute('Id', 'NFe' . $accessKey);
        $infNfe->setAttribute('versao', '4.00');
        $nfe->appendChild($infNfe);

        $this->appendIde($document, $infNfe, $configuration, $issueDate, $cUf, $cNf, $serie, $number, $verifierDigit);
        $this->appendEmitter($document, $infNfe, $configuration, $unitCnpj);
        $this->appendDestination($document, $infNfe, $consumer);
        $this->appendItems($document, $infNfe, $sales, (int) $configuration->tb26_crt, $configuration);
        $documentTotal = (float) $sales->sum('valor_total');

        $this->appendTotals($document, $infNfe, $sales);
        $this->appendTransport($document, $infNfe);
        $this->appendPayment($document, $infNfe, $payment, $documentTotal);
        $this->appendAdditionalInfo($document, $infNfe, $payment, $unit->tb2_nome);
        $this->appendSupplementalInfo($document, $nfe, $configuration, $accessKey, $endpoints);
        $this->signDocument($document, $infNfe, $certificateData);
        $signedXml = $document->saveXML();

        if ($signedXml === false) {
            throw new RuntimeException('Nao foi possivel serializar o XML fiscal assinado.');
        }

        $this->assertSignedXmlIsLocallyValid($signedXml, $certificateData);

        return [
            'xml' => $signedXml,
            'access_key' => $accessKey,
        ];
    }

    public function validateSignedXmlOrFail(string $signedXml, array $certificateData): void
    {
        $this->assertSignedXmlIsLocallyValid($signedXml, $certificateData);
    }

    private function appendIde(
        DOMDocument $document,
        DOMElement $infNfe,
        ConfiguracaoFiscal $configuration,
        Carbon $issueDate,
        string $cUf,
        string $cNf,
        string $serie,
        int $number,
        int $verifierDigit,
    ): void {
        $ide = $document->createElement('ide');
        $infNfe->appendChild($ide);

        $this->appendTextElement($document, $ide, 'cUF', $cUf);
        $this->appendTextElement($document, $ide, 'cNF', $cNf);
        $this->appendTextElement($document, $ide, 'natOp', 'VENDA');
        $this->appendTextElement($document, $ide, 'mod', '65');
        $this->appendTextElement($document, $ide, 'serie', (string) (int) $serie);
        $this->appendTextElement($document, $ide, 'nNF', (string) $number);
        $this->appendTextElement($document, $ide, 'dhEmi', $issueDate->format('Y-m-d\TH:i:sP'));
        $this->appendTextElement($document, $ide, 'tpNF', '1');
        $this->appendTextElement($document, $ide, 'idDest', '1');
        $this->appendTextElement($document, $ide, 'cMunFG', $this->requiredDigits($configuration->tb26_codigo_municipio, 7, 'Codigo do municipio IBGE'));
        $this->appendTextElement($document, $ide, 'tpImp', '4');
        $this->appendTextElement($document, $ide, 'tpEmis', '1');
        $this->appendTextElement($document, $ide, 'cDV', (string) $verifierDigit);
        $this->appendTextElement($document, $ide, 'tpAmb', $configuration->tb26_ambiente === 'producao' ? '1' : '2');
        $this->appendTextElement($document, $ide, 'finNFe', '1');
        $this->appendTextElement($document, $ide, 'indFinal', '1');
        $this->appendTextElement($document, $ide, 'indPres', '1');
        $this->appendTextElement($document, $ide, 'procEmi', '0');
        $this->appendTextElement($document, $ide, 'verProc', 'PEC-RODRIGO 1.0');
    }

    private function appendEmitter(
        DOMDocument $document,
        DOMElement $infNfe,
        ConfiguracaoFiscal $configuration,
        string $unitCnpj,
    ): void {
        $emit = $document->createElement('emit');
        $infNfe->appendChild($emit);

        $this->appendTextElement($document, $emit, 'CNPJ', $unitCnpj);
        $this->appendTextElement($document, $emit, 'xNome', (string) $configuration->tb26_razao_social);
        $this->appendTextElement($document, $emit, 'xFant', (string) ($configuration->tb26_nome_fantasia ?: $configuration->tb26_razao_social));

        $address = $document->createElement('enderEmit');
        $emit->appendChild($address);
        $this->appendTextElement($document, $address, 'xLgr', (string) $configuration->tb26_logradouro);
        $this->appendTextElement($document, $address, 'nro', (string) $configuration->tb26_numero);
        $this->appendOptionalTextElement($document, $address, 'xCpl', $configuration->tb26_complemento);
        $this->appendTextElement($document, $address, 'xBairro', (string) $configuration->tb26_bairro);
        $this->appendTextElement($document, $address, 'cMun', $this->requiredDigits($configuration->tb26_codigo_municipio, 7, 'Codigo do municipio IBGE'));
        $this->appendTextElement($document, $address, 'xMun', (string) $configuration->tb26_municipio);
        $this->appendTextElement($document, $address, 'UF', (string) $configuration->tb26_uf);
        $this->appendTextElement($document, $address, 'CEP', $this->requiredDigits($configuration->tb26_cep, 8, 'CEP'));
        $this->appendTextElement($document, $address, 'cPais', '1058');
        $this->appendTextElement($document, $address, 'xPais', 'BRASIL');
        $this->appendOptionalTextElement($document, $address, 'fone', $this->onlyDigits($configuration->tb26_telefone));

        $this->appendTextElement($document, $emit, 'IE', $this->requiredStateRegistration($configuration->tb26_ie, 'Inscricao estadual'));
        $municipalRegistration = trim((string) $configuration->tb26_im);
        $cnae = trim((string) $configuration->tb26_cnae);

        // Evita schema invalido no emitente: CNAE nao deve ser enviado sozinho sem IM.
        if ($municipalRegistration !== '') {
            $this->appendTextElement($document, $emit, 'IM', $municipalRegistration);
            $this->appendOptionalTextElement($document, $emit, 'CNAE', $cnae);
        }

        $this->appendTextElement($document, $emit, 'CRT', (string) $configuration->tb26_crt);
    }

    private function appendDestination(
        DOMDocument $document,
        DOMElement $infNfe,
        ?array $consumer,
    ): void {
        if ($consumer === null) {
            return;
        }

        $consumerType = trim((string) ($consumer['type'] ?? ''));
        $documentDigits = $this->onlyDigits($consumer['document'] ?? null);
        $isFiscalCoupon = $consumerType === 'cupom_fiscal';

        if ($isFiscalCoupon && strlen($documentDigits) !== 11) {
            throw new RuntimeException('CPF do consumidor invalido para montar o cupom fiscal da NFC-e.');
        }

        if (! $isFiscalCoupon && ! in_array(strlen($documentDigits), [11, 14], true)) {
            throw new RuntimeException('Documento do consumidor invalido para montar o destinatario da NFC-e.');
        }

        $dest = $document->createElement('dest');
        $infNfe->appendChild($dest);

        $this->appendTextElement($document, $dest, strlen($documentDigits) === 11 ? 'CPF' : 'CNPJ', $documentDigits);

        if (! $isFiscalCoupon) {
            $cep = $this->requiredDigits($consumer['cep'] ?? null, 8, 'CEP do consumidor');
            $cityCode = $this->requiredDigits($consumer['city_code'] ?? null, 7, 'Codigo do municipio IBGE do consumidor');
            $state = strtoupper(trim((string) ($consumer['state'] ?? '')));
            $name = trim((string) ($consumer['name'] ?? ''));

            if ($name === '') {
                throw new RuntimeException('Nome do consumidor nao informado para montar o destinatario da NFC-e.');
            }

            if (strlen($state) !== 2) {
                throw new RuntimeException('UF do consumidor invalida para montar o destinatario da NFC-e.');
            }

            $this->appendTextElement($document, $dest, 'xNome', $name);

            $address = $document->createElement('enderDest');
            $dest->appendChild($address);
            $this->appendTextElement($document, $address, 'xLgr', trim((string) ($consumer['street'] ?? '')));
            $this->appendTextElement($document, $address, 'nro', trim((string) ($consumer['number'] ?? '')));
            $this->appendOptionalTextElement($document, $address, 'xCpl', $consumer['complement'] ?? null);
            $this->appendTextElement($document, $address, 'xBairro', trim((string) ($consumer['neighborhood'] ?? '')));
            $this->appendTextElement($document, $address, 'cMun', $cityCode);
            $this->appendTextElement($document, $address, 'xMun', trim((string) ($consumer['city'] ?? '')));
            $this->appendTextElement($document, $address, 'UF', $state);
            $this->appendTextElement($document, $address, 'CEP', $cep);
            $this->appendTextElement($document, $address, 'cPais', '1058');
            $this->appendTextElement($document, $address, 'xPais', 'BRASIL');
        }

        $this->appendTextElement($document, $dest, 'indIEDest', '9');
    }

    private function appendItems(
        DOMDocument $document,
        DOMElement $infNfe,
        $sales,
        int $crt,
        ConfiguracaoFiscal $configuration,
    ): void
    {
        foreach ($sales->values() as $index => $sale) {
            /** @var Venda $sale */
            /** @var Produto|null $product */
            $product = $sale->produto;

            if (! $product) {
                throw new RuntimeException(sprintf('Produto %d nao encontrado para montar o XML fiscal.', $sale->tb1_id));
            }

            if ($crt !== 1) {
                throw new RuntimeException('A geracao automatica de XML assinado nesta etapa esta preparada apenas para CRT 1.');
            }

            $allowedCsosn = ['102', '103', '300', '400', '500'];
            $cfop = $this->requiredDigits($product->tb1_cfop, 4, sprintf('CFOP do produto %s', $sale->produto_nome));
            $csosn = $this->normalizeCsosnForCfop(
                $cfop,
                str_pad((string) $product->tb1_csosn, 3, '0', STR_PAD_LEFT)
            );

            if (! in_array($csosn, $allowedCsosn, true)) {
                throw new RuntimeException(sprintf(
                    'O produto %d (%s) possui CSOSN %s. Nesta etapa o XML automatico suporta somente 102, 103, 300, 400 e 500.',
                    $sale->tb1_id,
                    $sale->produto_nome,
                    $csosn
                ));
            }

            $det = $document->createElement('det');
            $det->setAttribute('nItem', (string) ($index + 1));
            $infNfe->appendChild($det);

            $prod = $document->createElement('prod');
            $det->appendChild($prod);

            $ean = $this->normalizeGtIn($product->tb1_codbar);
            $quantity = number_format((float) $sale->quantidade, 4, '.', '');
            $unitPrice = number_format((float) $sale->valor_unitario, 4, '.', '');
            $total = number_format((float) $sale->valor_total, 2, '.', '');
            $productDescription = $index === 0 && $configuration->tb26_ambiente === 'homologacao'
                ? self::HOMOLOGATION_ITEM_DESCRIPTION
                : (string) $sale->produto_nome;

            $this->appendTextElement($document, $prod, 'cProd', (string) $sale->tb1_id);
            $this->appendTextElement($document, $prod, 'cEAN', $ean);
            $this->appendTextElement($document, $prod, 'xProd', $productDescription);
            $this->appendTextElement($document, $prod, 'NCM', $this->requiredDigits($product->tb1_ncm, 8, sprintf('NCM do produto %s', $sale->produto_nome)));
            $this->appendOptionalTextElement($document, $prod, 'CEST', $this->optionalDigits($product->tb1_cest, 7));
            $this->appendTextElement($document, $prod, 'CFOP', $cfop);
            $this->appendTextElement($document, $prod, 'uCom', (string) $product->tb1_unidade_comercial);
            $this->appendTextElement($document, $prod, 'qCom', $quantity);
            $this->appendTextElement($document, $prod, 'vUnCom', $unitPrice);
            $this->appendTextElement($document, $prod, 'vProd', $total);
            $this->appendTextElement($document, $prod, 'cEANTrib', $ean);
            $this->appendTextElement($document, $prod, 'uTrib', (string) $product->tb1_unidade_tributavel);
            $this->appendTextElement($document, $prod, 'qTrib', $quantity);
            $this->appendTextElement($document, $prod, 'vUnTrib', $unitPrice);
            $this->appendTextElement($document, $prod, 'indTot', '1');

            $imposto = $document->createElement('imposto');
            $det->appendChild($imposto);

            $icms = $document->createElement('ICMS');
            $imposto->appendChild($icms);
            $icmsSimpleNational = $document->createElement($this->icmsSimpleNationalGroupForCsosn($csosn));
            $icms->appendChild($icmsSimpleNational);
            $this->appendTextElement($document, $icmsSimpleNational, 'orig', $this->requiredDigits((string) $product->tb1_origem, 1, sprintf('Origem fiscal do produto %s', $sale->produto_nome)));
            $this->appendTextElement($document, $icmsSimpleNational, 'CSOSN', $csosn);

            $pis = $document->createElement('PIS');
            $imposto->appendChild($pis);
            $pisOther = $document->createElement('PISOutr');
            $pis->appendChild($pisOther);
            $this->appendTextElement($document, $pisOther, 'CST', '99');
            $this->appendTextElement($document, $pisOther, 'vBC', '0.00');
            $this->appendTextElement($document, $pisOther, 'pPIS', '0.00');
            $this->appendTextElement($document, $pisOther, 'vPIS', '0.00');

            $cofins = $document->createElement('COFINS');
            $imposto->appendChild($cofins);
            $cofinsOther = $document->createElement('COFINSOutr');
            $cofins->appendChild($cofinsOther);
            $this->appendTextElement($document, $cofinsOther, 'CST', '99');
            $this->appendTextElement($document, $cofinsOther, 'vBC', '0.00');
            $this->appendTextElement($document, $cofinsOther, 'pCOFINS', '0.00');
            $this->appendTextElement($document, $cofinsOther, 'vCOFINS', '0.00');
        }
    }

    private function icmsSimpleNationalGroupForCsosn(string $csosn): string
    {
        return match ($csosn) {
            '102', '103', '300', '400' => 'ICMSSN102',
            default => 'ICMSSN' . $csosn,
        };
    }

    private function normalizeCsosnForCfop(string $cfop, string $csosn): string
    {
        if ($cfop === '5405' && $csosn === '400') {
            return '500';
        }

        return $csosn;
    }

    private function appendTotals(DOMDocument $document, DOMElement $infNfe, $sales): void
    {
        $sumProducts = number_format((float) $sales->sum('valor_total'), 2, '.', '');

        $total = $document->createElement('total');
        $infNfe->appendChild($total);

        $icmsTot = $document->createElement('ICMSTot');
        $total->appendChild($icmsTot);
        foreach ([
            'vBC' => '0.00',
            'vICMS' => '0.00',
            'vICMSDeson' => '0.00',
            'vFCP' => '0.00',
            'vBCST' => '0.00',
            'vST' => '0.00',
            'vFCPST' => '0.00',
            'vFCPSTRet' => '0.00',
            'vProd' => $sumProducts,
            'vFrete' => '0.00',
            'vSeg' => '0.00',
            'vDesc' => '0.00',
            'vII' => '0.00',
            'vIPI' => '0.00',
            'vIPIDevol' => '0.00',
            'vPIS' => '0.00',
            'vCOFINS' => '0.00',
            'vOutro' => '0.00',
            'vNF' => $sumProducts,
            'vTotTrib' => '0.00',
        ] as $tag => $value) {
            $this->appendTextElement($document, $icmsTot, $tag, $value);
        }
    }

    private function appendTransport(DOMDocument $document, DOMElement $infNfe): void
    {
        $transport = $document->createElement('transp');
        $infNfe->appendChild($transport);
        $this->appendTextElement($document, $transport, 'modFrete', '9');
    }

    private function appendPayment(
        DOMDocument $document,
        DOMElement $infNfe,
        VendaPagamento $payment,
        float $documentTotal,
    ): void
    {
        $paymentNode = $document->createElement('pag');
        $infNfe->appendChild($paymentNode);

        foreach ($this->resolvePaymentDetails($payment, $documentTotal) as $paymentDetail) {
            $detail = $document->createElement('detPag');
            $paymentNode->appendChild($detail);

            $paymentData = $this->resolvePaymentData($paymentDetail['type']);
            $this->appendTextElement($document, $detail, 'tPag', $paymentData['code']);

            if ($paymentData['description'] !== null) {
                $this->appendTextElement($document, $detail, 'xPag', $paymentData['description']);
            }

            $this->appendTextElement(
                $document,
                $detail,
                'vPag',
                number_format((float) $paymentDetail['amount'], 2, '.', ''),
            );

            if ($paymentData['requires_card']) {
                $card = $document->createElement('card');
                $detail->appendChild($card);
                $this->appendTextElement($document, $card, 'tpIntegra', '2');
            }
        }
    }

    private function appendAdditionalInfo(
        DOMDocument $document,
        DOMElement $infNfe,
        VendaPagamento $payment,
        ?string $unitName,
    ): void {
        $additional = $document->createElement('infAdic');
        $infNfe->appendChild($additional);
        $this->appendTextElement(
            $document,
            $additional,
            'infCpl',
            sprintf('Pagamento interno %d | Loja %s', (int) $payment->tb4_id, $unitName ?: 'NAO INFORMADA')
        );
    }

    private function appendSupplementalInfo(
        DOMDocument $document,
        DOMElement $nfe,
        ConfiguracaoFiscal $configuration,
        string $accessKey,
        array $endpoints,
    ): void {
        $qrCodeUrl = trim((string) ($endpoints['qr_code_url'] ?? ''));
        $consultationUrl = trim((string) ($endpoints['consultation_url'] ?? ''));

        if ($qrCodeUrl === '' || $consultationUrl === '') {
            throw new RuntimeException('Os enderecos de consulta da NFC-e nao estao configurados para a UF da loja.');
        }

        $supplemental = $document->createElement('infNFeSupl');
        $nfe->appendChild($supplemental);

        $this->appendTextElement(
            $document,
            $supplemental,
            'qrCode',
            $this->buildQrCodeUrl($configuration, $accessKey, $qrCodeUrl)
        );
        $this->appendTextElement($document, $supplemental, 'urlChave', $consultationUrl);
    }

    private function signDocument(DOMDocument $document, DOMElement $infNfe, array $certificateData): void
    {
        try {
            $privateKey = new XMLSecurityKey(XMLSecurityKey::RSA_SHA1, ['type' => 'private']);
            $privateKey->loadKey((string) $certificateData['private_key_pem'], false);

            $signature = new XMLSecurityDSig('');
            $signature->setCanonicalMethod(XMLSecurityDSig::C14N);
            $signature->addReference(
                $infNfe,
                XMLSecurityDSig::SHA1,
                [
                    'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
                    XMLSecurityDSig::C14N,
                ],
                [
                    'overwrite' => false,
                    'id_name' => 'Id',
                ]
            );
            $signature->sign($privateKey, $document->documentElement);
            $signature->add509Cert((string) $certificateData['certificate_pem'], true, false);
        } catch (\Throwable $exception) {
            $detail = trim((string) $exception->getMessage());

            throw new RuntimeException(
                $detail !== ''
                    ? 'Falha ao assinar o XML fiscal com o certificado da loja. Detalhe: ' . $detail
                    : 'Falha ao assinar o XML fiscal com o certificado da loja.',
                previous: $exception
            );
        }
    }

    private function assertSignedXmlIsLocallyValid(string $signedXml, array $certificateData): void
    {
        try {
            $document = new DOMDocument();

            if (! @$document->loadXML($signedXml)) {
                throw new RuntimeException('O XML fiscal assinado gerado localmente nao e valido.');
            }

            $signature = new XMLSecurityDSig('');
            $signatureNode = $signature->locateSignature($document);

            if (! $signatureNode instanceof DOMElement) {
                throw new RuntimeException('A assinatura digital nao foi localizada no XML fiscal gerado.');
            }

            try {
                $signature->canonicalizeSignedInfo();
                $signature->validateReference();
            } catch (\Throwable $exception) {
                throw new RuntimeException(sprintf(
                    'A assinatura digital gerada ficou inconsistente no DigestValue/Reference do XML fiscal (URI %s).',
                    $this->extractSignatureReferenceUri($document)
                ), previous: $exception);
            }

            $publicKey = $signature->locateKey();

            if (! $publicKey) {
                throw new RuntimeException('Nao foi possivel localizar a chave publica da assinatura fiscal.');
            }

            try {
                $publicKey->loadKey((string) $certificateData['certificate_pem'], false, true);
            } catch (\Throwable $exception) {
                throw new RuntimeException('Nao foi possivel carregar a chave publica do certificado para validar a assinatura fiscal.', previous: $exception);
            }

            try {
                $verified = $signature->verify($publicKey);
            } catch (\Throwable $exception) {
                throw new RuntimeException('A assinatura digital gerada ficou inconsistente no SignatureValue do XML fiscal.', previous: $exception);
            }

            if ($verified !== 1 && $verified !== true) {
                throw new RuntimeException(sprintf(
                    'A assinatura digital gerada ficou inconsistente no SignatureValue do XML fiscal (retorno %s).',
                    var_export($verified, true)
                ));
            }
        } catch (RuntimeException $exception) {
            throw $exception;
        } catch (\Throwable $exception) {
            throw new RuntimeException(
                'A assinatura digital gerada nao confere com o conteudo atual do XML fiscal.',
                previous: $exception
            );
        }
    }

    private function extractSignatureReferenceUri(DOMDocument $document): string
    {
        $xpath = new \DOMXPath($document);
        $xpath->registerNamespace('ds', 'http://www.w3.org/2000/09/xmldsig#');
        $uri = trim((string) $xpath->evaluate('string(//ds:Signature/ds:SignedInfo/ds:Reference/@URI)'));

        return $uri !== '' ? $uri : 'nao informada';
    }

    private function appendTextElement(DOMDocument $document, DOMElement $parent, string $tag, string $value): void
    {
        $element = $document->createElement($tag);
        $element->appendChild($document->createTextNode($value));
        $parent->appendChild($element);
    }

    private function appendOptionalTextElement(DOMDocument $document, DOMElement $parent, string $tag, ?string $value): void
    {
        $value = trim((string) $value);

        if ($value === '') {
            return;
        }

        $this->appendTextElement($document, $parent, $tag, $value);
    }

    private function onlyDigits(?string $value): string
    {
        return preg_replace('/\D+/', '', (string) $value);
    }

    private function normalizeSerie(?string $serie): string
    {
        $digits = $this->onlyDigits($serie);

        return $digits === '' ? '1' : substr($digits, -3);
    }

    private function generateRandomCode(int $paymentId): string
    {
        $base = (string) (($paymentId * 97) % 99999999);

        return str_pad($base, 8, '0', STR_PAD_LEFT);
    }

    private function calculateAccessKeyDigit(string $keyWithoutDigit): int
    {
        $multiplier = 2;
        $sum = 0;

        for ($index = strlen($keyWithoutDigit) - 1; $index >= 0; $index--) {
            $sum += (int) $keyWithoutDigit[$index] * $multiplier;
            $multiplier = $multiplier === 9 ? 2 : $multiplier + 1;
        }

        $remainder = $sum % 11;
        $digit = 11 - $remainder;

        return $digit >= 10 ? 0 : $digit;
    }

    private function normalizeGtIn(?string $barcode): string
    {
        $digits = $this->onlyDigits($barcode);

        if (in_array(strlen($digits), [8, 12, 13, 14], true)) {
            return $digits;
        }

        return 'SEM GTIN';
    }

    private function resolvePaymentData(string $paymentType): array
    {
        return match ($paymentType) {
            'dinheiro' => ['code' => '01', 'description' => null, 'requires_card' => false],
            'cartao_credito', 'maquina' => ['code' => '03', 'description' => null, 'requires_card' => true],
            'cartao_debito' => ['code' => '04', 'description' => null, 'requires_card' => true],
            'pix' => ['code' => '17', 'description' => null, 'requires_card' => true],
            'vale' => ['code' => '10', 'description' => null, 'requires_card' => false],
            'refeicao' => ['code' => '11', 'description' => null, 'requires_card' => false],
            'faturar' => ['code' => '90', 'description' => null, 'requires_card' => false],
            default => ['code' => '99', 'description' => strtoupper(str_replace('_', ' ', trim($paymentType))) ?: 'OUTROS', 'requires_card' => false],
        };
    }

    private function resolvePaymentDetails(VendaPagamento $payment, float $documentTotal): array
    {
        $paymentType = (string) $payment->tipo_pagamento;
        $cardAmount = max((float) $payment->dois_pgto, 0);

        if ($paymentType === 'dinheiro' && $cardAmount > 0) {
            $paymentType = 'dinheiro_cartao_credito';
        }

        if ($paymentType === 'dinheiro_pix' && $cardAmount > 0) {
            $cashAmount = max((float) $payment->valor_total - $cardAmount, 0);
            $documentCashAmount = min($cashAmount, $documentTotal);
            $documentPixAmount = max($documentTotal - $documentCashAmount, 0);
            $details = [];

            if ($documentCashAmount > 0) {
                $details[] = [
                    'type' => 'dinheiro',
                    'amount' => $documentCashAmount,
                ];
            }

            if ($documentPixAmount > 0) {
                $details[] = [
                    'type' => 'pix',
                    'amount' => $documentPixAmount,
                ];
            }

            return $details !== [] ? $details : [[
                'type' => 'dinheiro',
                'amount' => $documentTotal,
            ]];
        }

        if (! in_array($paymentType, ['dinheiro_cartao_credito', 'dinheiro_cartao_debito'], true)) {
            return [[
                'type' => $paymentType,
                'amount' => $documentTotal,
            ]];
        }

        $cashAmount = max((float) $payment->valor_total - $cardAmount, 0);
        $documentCashAmount = min($cashAmount, $documentTotal);
        $documentCardAmount = max($documentTotal - $documentCashAmount, 0);
        $cardPaymentType = str_ends_with($paymentType, 'debito') ? 'cartao_debito' : 'cartao_credito';
        $details = [];

        if ($documentCashAmount > 0) {
            $details[] = [
                'type' => 'dinheiro',
                'amount' => $documentCashAmount,
            ];
        }

        if ($documentCardAmount > 0) {
            $details[] = [
                'type' => $cardPaymentType,
                'amount' => $documentCardAmount,
            ];
        }

        return $details !== [] ? $details : [[
            'type' => 'dinheiro',
            'amount' => $documentTotal,
        ]];
    }

    private function buildQrCodeUrl(
        ConfiguracaoFiscal $configuration,
        string $accessKey,
        string $baseUrl,
    ): string {
        $baseUrl = rtrim($baseUrl, '?');
        $tpAmb = $configuration->tb26_ambiente === 'producao' ? '1' : '2';
        $qrCodeVersion = '2';
        $cscId = $this->normalizeQrCodeCscId($configuration->tb26_csc_id);
        $csc = trim((string) $configuration->tb26_csc);

        if ($cscId === '' || $csc === '') {
            throw new RuntimeException('CSC ID e CSC sao obrigatorios para montar o QR Code da NFC-e.');
        }

        $hashBase = implode('|', [$accessKey, $qrCodeVersion, $tpAmb, $cscId]) . $csc;
        $hash = strtoupper(sha1($hashBase));

        return $baseUrl . '?p=' . implode('|', [$accessKey, $qrCodeVersion, $tpAmb, $cscId, $hash]);
    }

    private function normalizeQrCodeCscId(?string $value): string
    {
        $digits = $this->onlyDigits($value);

        if ($digits === '') {
            return '';
        }

        return ltrim($digits, '0') ?: '0';
    }

    private function optionalDigits(?string $value, ?int $expectedLength = null): ?string
    {
        $digits = $this->onlyDigits($value);

        if ($digits === '') {
            return null;
        }

        if ($expectedLength !== null && strlen($digits) !== $expectedLength) {
            return null;
        }

        return $digits;
    }

    private function requiredDigits(?string $value, int $expectedLength, string $fieldLabel): string
    {
        $digits = $this->optionalDigits($value, $expectedLength);

        if ($digits === null) {
            throw new RuntimeException(sprintf(
                '%s invalido para o schema fiscal. Informe exatamente %d digitos sem mascara.',
                $fieldLabel,
                $expectedLength
            ));
        }

        return $digits;
    }

    private function requiredStateRegistration(?string $value, string $fieldLabel): string
    {
        $value = strtoupper(trim((string) $value));

        if ($value === 'ISENTO') {
            return $value;
        }

        $digits = $this->onlyDigits($value);

        if (strlen($digits) < 2 || strlen($digits) > 14) {
            throw new RuntimeException(sprintf(
                '%s invalida para o schema fiscal. Informe apenas digitos ou ISENTO.',
                $fieldLabel
            ));
        }

        return $digits;
    }
}
