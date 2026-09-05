<?php

namespace App\Support;

use App\Models\ConfiguracaoFiscal;
use App\Models\DfeDistribuicaoControle;
use App\Models\DfeDocumentoReceita;
use App\Models\NotaFiscal;
use Carbon\Carbon;
use DOMDocument;
use DOMElement;
use DOMXPath;
use Illuminate\Support\Facades\Config;
use RuntimeException;
use Throwable;

class FiscalDfeDistributionService
{
    private const ENDPOINTS = [
        'producao' => 'https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx',
        'homologacao' => 'https://hom1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx',
    ];

    private const SOAP_ACTION = 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe/nfeDistDFeInteresse';

    public function __construct(
        private readonly FiscalCertificateService $fiscalCertificateService,
    ) {
    }

    public function syncAndCompareMonthly(ConfiguracaoFiscal $configuration, Carbon $month): array
    {
        $control = $this->resolveControl($configuration);

        if ($this->isInNoDocumentCooldown($control)) {
            return $this->compareStoredMonthlySummary(
                $configuration,
                $month,
                'A Receita informou que nao havia documentos novos na ultima consulta. Para evitar bloqueio por consumo indevido, aguarde 1 hora antes de consultar novamente.',
                false,
            );
        }

        $certificateData = $this->fiscalCertificateService->loadCertificateForConfiguration($configuration);
        $receivedCount = 0;
        $consultedCount = 0;
        $lastStatus = null;
        $lastMessage = null;

        for ($attempt = 0; $attempt < 10; $attempt++) {
            $response = $this->requestDistributionBatch($configuration, $control, $certificateData);
            $consultedCount++;
            $lastStatus = $response['status'];
            $lastMessage = $response['message'];

            $control->update([
                'tb33_ult_nsu' => $response['ult_nsu'] ?? $control->tb33_ult_nsu,
                'tb33_max_nsu' => $response['max_nsu'] ?? $control->tb33_max_nsu,
                'tb33_ultima_consulta_em' => now(),
                'tb33_ultimo_status' => $response['status'],
                'tb33_ultima_mensagem' => $response['message'],
            ]);

            $control->refresh();

            foreach ($response['documents'] as $document) {
                $this->storeDistributedDocument($configuration, $control, $document);
                $receivedCount++;
            }

            if ($response['status'] !== '138' || $this->nsuIsComplete($response['ult_nsu'], $response['max_nsu'])) {
                break;
            }
        }

        $message = sprintf(
            'Consulta realizada. %s lote(s), %s documento(s) recebido(s). Ultimo retorno: cStat %s - %s',
            $consultedCount,
            $receivedCount,
            $lastStatus ?: '--',
            $lastMessage ?: '--'
        );

        return $this->compareStoredMonthlySummary($configuration, $month, $message, true);
    }

    public function compareStoredMonthlySummary(
        ConfiguracaoFiscal $configuration,
        Carbon $month,
        ?string $message = null,
        bool $consulted = false,
    ): array {
        $control = $this->resolveControl($configuration);
        $monthStart = $month->copy()->startOfMonth();
        $monthEnd = $month->copy()->endOfMonth();
        $cnpj = $this->configurationCnpj($configuration);
        $ambiente = $this->configurationEnvironment($configuration);

        $systemRows = NotaFiscal::query()
            ->where('tb2_id', $configuration->tb2_id)
            ->where('tb27_ambiente', $ambiente)
            ->where('tb27_status', 'emitida')
            ->whereBetween('tb27_emitida_em', [$monthStart, $monthEnd])
            ->with('pagamento:tb4_id,valor_total')
            ->get(['tb27_id', 'tb4_id', 'tb27_chave_acesso', 'tb27_serie', 'tb27_numero', 'tb27_xml_envio', 'tb27_payload', 'tb27_emitida_em'])
            ->map(fn (NotaFiscal $invoice): array => $this->buildSystemInvoiceSnapshot($invoice))
            ->filter(fn (array $invoice): bool => ($invoice['access_key'] ?? '') !== '')
            ->values();

        $officialRows = DfeDocumentoReceita::query()
            ->where('tb34_cnpj', $cnpj)
            ->where('tb34_emitente_cnpj', $cnpj)
            ->where('tb34_ambiente', $ambiente)
            ->whereIn('tb34_status', ['autorizada', 'resumo'])
            ->whereBetween('tb34_emitida_em', [$monthStart, $monthEnd])
            ->whereNotNull('tb34_chave_acesso')
            ->get()
            ->values();

        $officialKeys = $officialRows
            ->pluck('tb34_chave_acesso')
            ->filter()
            ->unique()
            ->values();

        $canceledKeys = $officialKeys->isEmpty()
            ? collect()
            : DfeDocumentoReceita::query()
                ->where('tb34_cnpj', $cnpj)
                ->where('tb34_emitente_cnpj', $cnpj)
                ->where('tb34_ambiente', $ambiente)
                ->where('tb34_status', 'cancelada')
                ->whereIn('tb34_chave_acesso', $officialKeys)
                ->pluck('tb34_chave_acesso')
                ->filter()
                ->unique()
                ->values();

        $officialActiveRows = $officialRows
            ->reject(fn (DfeDocumentoReceita $document): bool => $canceledKeys->contains($document->tb34_chave_acesso))
            ->values();

        $systemByKey = $systemRows->keyBy('access_key');
        $officialByKey = $officialActiveRows->keyBy('tb34_chave_acesso');
        $missingInReceita = $systemRows
            ->reject(fn (array $invoice): bool => $officialByKey->has($invoice['access_key']))
            ->values();
        $missingInSystem = $officialActiveRows
            ->reject(fn (DfeDocumentoReceita $document): bool => $systemByKey->has($document->tb34_chave_acesso))
            ->map(fn (DfeDocumentoReceita $document): array => $this->buildOfficialInvoiceSnapshot($document))
            ->values();
        $divergentValues = $systemRows
            ->filter(function (array $invoice) use ($officialByKey): bool {
                $official = $officialByKey->get($invoice['access_key']);

                if (! $official) {
                    return false;
                }

                return abs(round((float) $invoice['total'], 2) - round((float) $official->tb34_valor_total, 2)) > 0.01;
            })
            ->map(function (array $invoice) use ($officialByKey): array {
                $official = $officialByKey->get($invoice['access_key']);

                return [
                    ...$invoice,
                    'receita_total' => round((float) $official->tb34_valor_total, 2),
                    'difference' => round((float) $invoice['total'] - (float) $official->tb34_valor_total, 2),
                ];
            })
            ->values();
        $canceledInReceita = $systemRows
            ->filter(fn (array $invoice): bool => $canceledKeys->contains($invoice['access_key']))
            ->values();

        $systemTotal = round((float) $systemRows->sum('total'), 2);
        $officialTotal = round((float) $officialActiveRows->sum('tb34_valor_total'), 2);

        return [
            'available' => true,
            'consulted' => $consulted,
            'message' => $message,
            'cnpj' => $cnpj,
            'ambiente' => $ambiente,
            'last_sync_at' => $control->tb33_ultima_consulta_em?->toIso8601String(),
            'last_status' => $control->tb33_ultimo_status,
            'last_message' => $control->tb33_ultima_mensagem,
            'ult_nsu' => $control->tb33_ult_nsu,
            'max_nsu' => $control->tb33_max_nsu,
            'complete' => $this->nsuIsComplete($control->tb33_ult_nsu, $control->tb33_max_nsu),
            'system' => [
                'count' => $systemRows->count(),
                'total' => $systemTotal,
            ],
            'receita' => [
                'count' => $officialActiveRows->count(),
                'total' => $officialTotal,
            ],
            'difference' => round($systemTotal - $officialTotal, 2),
            'missing_in_receita_count' => $missingInReceita->count(),
            'missing_in_system_count' => $missingInSystem->count(),
            'divergent_count' => $divergentValues->count(),
            'canceled_count' => $canceledInReceita->count(),
            'missing_in_receita' => $missingInReceita->take(20)->values(),
            'missing_in_system' => $missingInSystem->take(20)->values(),
            'divergent_values' => $divergentValues->take(20)->values(),
            'canceled_in_receita' => $canceledInReceita->take(20)->values(),
        ];
    }

    private function resolveControl(ConfiguracaoFiscal $configuration): DfeDistribuicaoControle
    {
        $cnpj = $this->configurationCnpj($configuration);
        $ambiente = $this->configurationEnvironment($configuration);

        $control = DfeDistribuicaoControle::query()->firstOrCreate(
            [
                'tb33_cnpj' => $cnpj,
                'tb33_ambiente' => $ambiente,
            ],
            [
                'tb2_id' => $configuration->tb2_id,
                'tb33_uf_autor' => $this->configurationUfCode($configuration),
                'tb33_ult_nsu' => '000000000000000',
                'tb33_max_nsu' => '000000000000000',
            ],
        );

        $ufCode = $this->configurationUfCode($configuration);

        if ($ufCode !== null && $control->tb33_uf_autor !== $ufCode) {
            $control->update(['tb33_uf_autor' => $ufCode]);
            $control->refresh();
        }

        return $control;
    }

    private function requestDistributionBatch(ConfiguracaoFiscal $configuration, DfeDistribuicaoControle $control, array $certificateData): array
    {
        $ambiente = $this->configurationEnvironment($configuration);
        $endpoint = self::ENDPOINTS[$ambiente] ?? null;

        if ($endpoint === null) {
            throw new RuntimeException('Ambiente fiscal invalido para consulta automatica na Receita.');
        }

        $requestXml = $this->buildDistributionRequestXml(
            $this->configurationCnpj($configuration),
            $ambiente,
            (string) $control->tb33_ult_nsu,
            $this->configurationUfCode($configuration),
        );
        $soapEnvelope = $this->buildSoapEnvelope($requestXml);
        $responseXml = $this->sendSoapRequest($endpoint, $soapEnvelope, $certificateData);

        return $this->parseDistributionResponse($responseXml);
    }

    private function buildDistributionRequestXml(string $cnpj, string $ambiente, string $ultNsu, ?string $ufCode): string
    {
        $tpAmb = $ambiente === 'producao' ? '1' : '2';
        $ufTag = $ufCode !== null
            ? '<cUFAutor>' . htmlspecialchars($ufCode, ENT_XML1) . '</cUFAutor>'
            : '';

        return '<?xml version="1.0" encoding="UTF-8"?>'
            . '<distDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01">'
            . '<tpAmb>' . $tpAmb . '</tpAmb>'
            . $ufTag
            . '<CNPJ>' . htmlspecialchars($cnpj, ENT_XML1) . '</CNPJ>'
            . '<distNSU><ultNSU>' . str_pad(preg_replace('/\D+/', '', $ultNsu) ?: '0', 15, '0', STR_PAD_LEFT) . '</ultNSU></distNSU>'
            . '</distDFeInt>';
    }

    private function buildSoapEnvelope(string $requestXml): string
    {
        $cleanRequestXml = preg_replace('/^\s*<\?xml[^>]+>\s*/', '', trim($requestXml));

        return '<?xml version="1.0" encoding="UTF-8"?>'
            . '<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"'
            . ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"'
            . ' xmlns:xsd="http://www.w3.org/2001/XMLSchema">'
            . '<soap12:Body>'
            . '<nfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe">'
            . '<nfeDadosMsg>'
            . $cleanRequestXml
            . '</nfeDadosMsg>'
            . '</nfeDistDFeInteresse>'
            . '</soap12:Body>'
            . '</soap12:Envelope>';
    }

    private function parseDistributionResponse(string $responseXml): array
    {
        $document = new DOMDocument();

        if (! @$document->loadXML($responseXml)) {
            throw new RuntimeException('A Receita nao retornou um XML valido na distribuicao DF-e.');
        }

        $xpath = new DOMXPath($document);
        $xpath->registerNamespace('nfe', 'http://www.portalfiscal.inf.br/nfe');
        $status = $this->xpathValue($xpath, 'string(//*[local-name()="retDistDFeInt"]/*[local-name()="cStat"])');
        $message = $this->xpathValue($xpath, 'string(//*[local-name()="retDistDFeInt"]/*[local-name()="xMotivo"])');
        $ultNsu = $this->xpathValue($xpath, 'string(//*[local-name()="retDistDFeInt"]/*[local-name()="ultNSU"])');
        $maxNsu = $this->xpathValue($xpath, 'string(//*[local-name()="retDistDFeInt"]/*[local-name()="maxNSU"])');

        if ($status === '') {
            $fault = $this->xpathValue($xpath, 'string(//*[local-name()="Fault"]//*[local-name()="Text"] | //*[local-name()="Fault"]//*[local-name()="faultstring"])');
            throw new RuntimeException($fault !== '' ? $fault : 'A Receita nao retornou o status da distribuicao DF-e.');
        }

        if (! in_array($status, ['137', '138', '656'], true)) {
            throw new RuntimeException(sprintf('cStat %s - %s', $status, $message !== '' ? $message : 'Consulta DF-e nao autorizada pela Receita.'));
        }

        $documents = [];

        foreach ($xpath->query('//*[local-name()="docZip"]') as $node) {
            if (! $node instanceof DOMElement) {
                continue;
            }

            $xml = $this->decodeDocZip($node->textContent);

            if ($xml === null) {
                continue;
            }

            $documents[] = [
                'nsu' => str_pad((string) $node->getAttribute('NSU'), 15, '0', STR_PAD_LEFT),
                'schema' => $node->getAttribute('schema') ?: null,
                'xml' => $xml,
            ];
        }

        return [
            'status' => $status,
            'message' => $message,
            'ult_nsu' => $ultNsu !== '' ? $ultNsu : null,
            'max_nsu' => $maxNsu !== '' ? $maxNsu : null,
            'documents' => $documents,
        ];
    }

    private function storeDistributedDocument(ConfiguracaoFiscal $configuration, DfeDistribuicaoControle $control, array $distributedDocument): void
    {
        $snapshot = $this->extractDistributedDocumentSnapshot(
            (string) $distributedDocument['xml'],
            (string) ($distributedDocument['schema'] ?? ''),
        );

        DfeDocumentoReceita::query()->updateOrCreate(
            [
                'tb34_cnpj' => $this->configurationCnpj($configuration),
                'tb34_ambiente' => $this->configurationEnvironment($configuration),
                'tb34_nsu' => (string) $distributedDocument['nsu'],
            ],
            [
                'tb33_id' => $control->tb33_id,
                'tb2_id' => $configuration->tb2_id,
                'tb34_emitente_cnpj' => $snapshot['issuer_cnpj'],
                'tb34_chave_acesso' => $snapshot['access_key'],
                'tb34_schema' => $distributedDocument['schema'],
                'tb34_tipo_documento' => $snapshot['document_type'],
                'tb34_modelo' => $snapshot['model'],
                'tb34_serie' => $snapshot['series'],
                'tb34_numero' => $snapshot['number'],
                'tb34_status' => $snapshot['status'],
                'tb34_emitida_em' => $snapshot['issued_at'],
                'tb34_valor_total' => $snapshot['total'],
                'tb34_valor_icms' => $snapshot['icms'],
                'tb34_valor_pis' => $snapshot['pis'],
                'tb34_valor_cofins' => $snapshot['cofins'],
                'tb34_valor_ipi' => $snapshot['ipi'],
                'tb34_valor_tributos' => $snapshot['taxes'],
                'tb34_xml' => $distributedDocument['xml'],
            ],
        );
    }

    private function extractDistributedDocumentSnapshot(string $xml, string $schema): array
    {
        $document = new DOMDocument();

        if (! @$document->loadXML(trim($xml))) {
            return $this->emptyDocumentSnapshot($schema);
        }

        $xpath = new DOMXPath($document);
        $xpath->registerNamespace('nfe', 'http://www.portalfiscal.inf.br/nfe');
        $rootName = $document->documentElement?->localName ?: '';
        $accessKey = $this->firstXpathValue($xpath, [
            'string(//nfe:protNFe/nfe:infProt/nfe:chNFe)',
            'string(//nfe:resNFe/nfe:chNFe)',
            'string(//nfe:procEventoNFe/nfe:evento/nfe:infEvento/nfe:chNFe)',
            'string(//nfe:resEvento/nfe:chNFe)',
            'string(//nfe:infNFe/@Id)',
        ]);
        $accessKey = preg_replace('/^NFe/', '', $accessKey);
        $eventType = $this->firstXpathValue($xpath, [
            'string(//nfe:procEventoNFe/nfe:evento/nfe:infEvento/nfe:tpEvento)',
            'string(//nfe:resEvento/nfe:tpEvento)',
        ]);
        $statusCode = $this->firstXpathValue($xpath, [
            'string(//nfe:protNFe/nfe:infProt/nfe:cStat)',
            'string(//nfe:resNFe/nfe:cSitNFe)',
        ]);
        $issuedAt = $this->parseDate($this->firstXpathValue($xpath, [
            'string(//nfe:NFe/nfe:infNFe/nfe:ide/nfe:dhEmi)',
            'string(//nfe:resNFe/nfe:dhEmi)',
            'string(//nfe:procEventoNFe/nfe:evento/nfe:infEvento/nfe:dhEvento)',
            'string(//nfe:resEvento/nfe:dhEvento)',
        ]));
        $documentType = $rootName !== '' ? $rootName : ($schema !== '' ? $schema : 'desconhecido');
        $isCancelEvent = $eventType === '110111';
        $model = $this->firstXpathValue($xpath, ['string(//nfe:NFe/nfe:infNFe/nfe:ide/nfe:mod)']);
        $series = $this->firstXpathValue($xpath, [
            'string(//nfe:NFe/nfe:infNFe/nfe:ide/nfe:serie)',
            'string(//nfe:resNFe/nfe:serie)',
        ]);
        $number = $this->firstXpathValue($xpath, [
            'string(//nfe:NFe/nfe:infNFe/nfe:ide/nfe:nNF)',
            'string(//nfe:resNFe/nfe:nNF)',
        ]);

        return [
            'document_type' => $documentType,
            'access_key' => $accessKey !== '' ? $accessKey : null,
            'issuer_cnpj' => $this->normalizeCnpj($this->firstXpathValue($xpath, [
                'string(//nfe:NFe/nfe:infNFe/nfe:emit/nfe:CNPJ)',
                'string(//nfe:resNFe/nfe:CNPJ)',
            ])) ?: $this->accessKeySlice($accessKey, 6, 14),
            'model' => $model !== '' ? $model : $this->accessKeySlice($accessKey, 20, 2),
            'series' => $series !== '' ? $series : $this->accessKeySeries($accessKey),
            'number' => $this->integerOrNull($number !== '' ? $number : $this->accessKeySlice($accessKey, 25, 9)),
            'status' => $isCancelEvent ? 'cancelada' : $this->normalizeOfficialStatus($statusCode, $rootName),
            'issued_at' => $issuedAt,
            'total' => $this->decimalValue($this->firstXpathValue($xpath, [
                'string(//nfe:NFe/nfe:infNFe/nfe:total/nfe:ICMSTot/nfe:vNF)',
                'string(//nfe:resNFe/nfe:vNF)',
            ])),
            'icms' => $this->decimalValue($this->firstXpathValue($xpath, ['string(//nfe:NFe/nfe:infNFe/nfe:total/nfe:ICMSTot/nfe:vICMS)'])),
            'pis' => $this->decimalValue($this->firstXpathValue($xpath, ['string(//nfe:NFe/nfe:infNFe/nfe:total/nfe:ICMSTot/nfe:vPIS)'])),
            'cofins' => $this->decimalValue($this->firstXpathValue($xpath, ['string(//nfe:NFe/nfe:infNFe/nfe:total/nfe:ICMSTot/nfe:vCOFINS)'])),
            'ipi' => $this->decimalValue($this->firstXpathValue($xpath, ['string(//nfe:NFe/nfe:infNFe/nfe:total/nfe:ICMSTot/nfe:vIPI)'])),
            'taxes' => $this->decimalValue($this->firstXpathValue($xpath, ['string(//nfe:NFe/nfe:infNFe/nfe:total/nfe:ICMSTot/nfe:vTotTrib)'])),
        ];
    }

    private function buildSystemInvoiceSnapshot(NotaFiscal $invoice): array
    {
        $xmlSnapshot = filled($invoice->tb27_xml_envio)
            ? $this->extractDistributedDocumentSnapshot((string) $invoice->tb27_xml_envio, 'sistema')
            : [];
        $payload = is_array($invoice->tb27_payload) ? $invoice->tb27_payload : [];

        return [
            'id' => (int) $invoice->tb27_id,
            'payment_id' => (int) $invoice->tb4_id,
            'access_key' => $invoice->tb27_chave_acesso ?: ($xmlSnapshot['access_key'] ?? null),
            'series' => $invoice->tb27_serie ?: ($xmlSnapshot['series'] ?? null),
            'number' => $invoice->tb27_numero ?: ($xmlSnapshot['number'] ?? null),
            'issued_at' => $invoice->tb27_emitida_em?->toIso8601String(),
            'total' => round((float) (($xmlSnapshot['total'] ?? 0) > 0 ? $xmlSnapshot['total'] : ($payload['valor_total_documento'] ?? $invoice->pagamento?->valor_total ?? 0)), 2),
        ];
    }

    private function buildOfficialInvoiceSnapshot(DfeDocumentoReceita $document): array
    {
        return [
            'id' => (int) $document->tb34_id,
            'access_key' => $document->tb34_chave_acesso,
            'series' => $document->tb34_serie,
            'number' => $document->tb34_numero,
            'issued_at' => $document->tb34_emitida_em?->toIso8601String(),
            'total' => round((float) $document->tb34_valor_total, 2),
        ];
    }

    private function sendSoapRequest(string $url, string $soapEnvelope, array $certificateData): string
    {
        [$certificatePath, $privateKeyPath] = $this->writeTemporaryPemPair(
            (string) ($certificateData['certificate_chain_pem'] ?? $certificateData['certificate_pem']),
            (string) $certificateData['private_key_pem'],
        );
        $caBundlePath = $this->resolveCaBundlePath();
        $caBundleDirectory = dirname($caBundlePath);
        $openSslLegacyConfigPath = $this->resolveOpenSslLegacyConfigPath();
        $previousOpenSslConf = getenv('OPENSSL_CONF');
        $previousSslCertFile = getenv('SSL_CERT_FILE');

        try {
            if ($openSslLegacyConfigPath !== null) {
                putenv('OPENSSL_CONF=' . $openSslLegacyConfigPath);
            }

            putenv('SSL_CERT_FILE=' . $caBundlePath);

            $curl = curl_init($url);
            $verboseStream = fopen('php://temp', 'w+');

            try {
                $curlOptions = [
                    CURLOPT_POST => true,
                    CURLOPT_RETURNTRANSFER => true,
                    CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
                    CURLOPT_TIMEOUT => 90,
                    CURLOPT_CONNECTTIMEOUT => 30,
                    CURLOPT_SSLCERTTYPE => 'PEM',
                    CURLOPT_SSLCERT => $certificatePath,
                    CURLOPT_SSLKEY => $privateKeyPath,
                    CURLOPT_SSLCERTPASSWD => (string) ($certificateData['password'] ?? ''),
                    CURLOPT_CAINFO => $caBundlePath,
                    CURLOPT_SSL_VERIFYPEER => true,
                    CURLOPT_SSL_VERIFYHOST => 2,
                    CURLOPT_POSTFIELDS => $soapEnvelope,
                    CURLOPT_HTTPHEADER => [
                        'Content-Type: application/soap+xml; charset=utf-8; action="' . self::SOAP_ACTION . '"',
                        'Content-Length: ' . strlen($soapEnvelope),
                    ],
                    CURLOPT_VERBOSE => $verboseStream !== false,
                    CURLOPT_STDERR => $verboseStream !== false ? $verboseStream : null,
                ];

                if (is_dir($caBundleDirectory)) {
                    $curlOptions[CURLOPT_CAPATH] = $caBundleDirectory;
                }

                curl_setopt_array($curl, $curlOptions);

                $response = curl_exec($curl);
                $error = curl_error($curl);
                $errno = curl_errno($curl);
                $statusCode = (int) curl_getinfo($curl, CURLINFO_HTTP_CODE);
                $verboseOutput = $this->readVerboseStream($verboseStream);
                curl_close($curl);

                if ($response === false || $error !== '' || $errno !== 0) {
                    logger()->error('Receita DF-e - cURL SSL Error', [
                        'errno' => $errno,
                        'error' => $error,
                        'url' => $url,
                        'http_code' => $statusCode,
                        'ca_bundle' => $caBundlePath,
                        'ca_path' => is_dir($caBundleDirectory) ? $caBundleDirectory : null,
                        'openssl_conf' => $openSslLegacyConfigPath,
                        'verbose' => $verboseOutput,
                    ]);

                    throw new RuntimeException($this->buildSoapCommunicationErrorMessage($error !== '' ? $error : ('cURL errno ' . $errno), $caBundlePath));
                }

                if ($statusCode >= 400) {
                    throw new RuntimeException('A Receita respondeu com erro HTTP ' . $statusCode . ' durante a consulta DF-e.');
                }

                return (string) $response;
            } finally {
                if (is_resource($verboseStream)) {
                    fclose($verboseStream);
                }
            }
        } finally {
            $this->restoreEnvironmentVariable('OPENSSL_CONF', $previousOpenSslConf);
            $this->restoreEnvironmentVariable('SSL_CERT_FILE', $previousSslCertFile);
            @unlink($certificatePath);
            @unlink($privateKeyPath);
        }
    }

    private function configurationCnpj(ConfiguracaoFiscal $configuration): string
    {
        $cnpj = preg_replace('/\D+/', '', (string) ($configuration->tb26_certificado_cnpj ?: $configuration->unidade?->tb2_cnpj));

        if (strlen($cnpj) !== 14) {
            throw new RuntimeException('CNPJ da loja/certificado nao configurado para consulta automatica na Receita.');
        }

        return $cnpj;
    }

    private function configurationEnvironment(ConfiguracaoFiscal $configuration): string
    {
        return strtolower((string) ($configuration->tb26_ambiente ?: 'producao')) === 'homologacao'
            ? 'homologacao'
            : 'producao';
    }

    private function configurationUfCode(ConfiguracaoFiscal $configuration): ?string
    {
        $municipalityCode = preg_replace('/\D+/', '', (string) $configuration->tb26_codigo_municipio);

        if (strlen($municipalityCode) >= 2) {
            return substr($municipalityCode, 0, 2);
        }

        $uf = strtoupper(trim((string) $configuration->tb26_uf));
        $codes = [
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

        return $codes[$uf] ?? null;
    }

    private function isInNoDocumentCooldown(DfeDistribuicaoControle $control): bool
    {
        return in_array((string) $control->tb33_ultimo_status, ['137', '656'], true)
            && $control->tb33_ultima_consulta_em
            && $control->tb33_ultima_consulta_em->greaterThan(now()->subHour())
            && $this->nsuIsComplete($control->tb33_ult_nsu, $control->tb33_max_nsu);
    }

    private function nsuIsComplete(?string $ultNsu, ?string $maxNsu): bool
    {
        return (int) preg_replace('/\D+/', '', (string) $ultNsu) >= (int) preg_replace('/\D+/', '', (string) $maxNsu);
    }

    private function decodeDocZip(string $content): ?string
    {
        $decoded = base64_decode(preg_replace('/\s+/', '', $content), true);

        if ($decoded === false) {
            return null;
        }

        $unzipped = @gzdecode($decoded);

        return $unzipped !== false ? $unzipped : $decoded;
    }

    private function emptyDocumentSnapshot(string $schema): array
    {
        return [
            'document_type' => $schema !== '' ? $schema : 'desconhecido',
            'access_key' => null,
            'issuer_cnpj' => null,
            'model' => null,
            'series' => null,
            'number' => null,
            'status' => 'desconhecido',
            'issued_at' => null,
            'total' => 0,
            'icms' => 0,
            'pis' => 0,
            'cofins' => 0,
            'ipi' => 0,
            'taxes' => 0,
        ];
    }

    private function normalizeOfficialStatus(string $statusCode, string $rootName): string
    {
        if (in_array($rootName, ['resNFe', 'procNFe'], true) && in_array($statusCode, ['1', '100'], true)) {
            return $rootName === 'resNFe' ? 'resumo' : 'autorizada';
        }

        if (in_array($statusCode, ['2', '101', '151', '155'], true)) {
            return 'cancelada';
        }

        if ($rootName === 'resNFe') {
            return 'resumo';
        }

        if ($rootName === 'procNFe') {
            return 'autorizada';
        }

        return 'desconhecido';
    }

    private function firstXpathValue(DOMXPath $xpath, array $expressions): string
    {
        foreach ($expressions as $expression) {
            $value = $this->xpathValue($xpath, $expression);

            if ($value !== '') {
                return $value;
            }
        }

        return '';
    }

    private function xpathValue(DOMXPath $xpath, string $expression): string
    {
        return trim((string) $xpath->evaluate($expression));
    }

    private function decimalValue(string $value): float
    {
        return round((float) str_replace(',', '.', $value), 2);
    }

    private function integerOrNull(string $value): ?int
    {
        $digits = preg_replace('/\D+/', '', $value);

        return $digits !== '' ? (int) $digits : null;
    }

    private function accessKeySeries(string $accessKey): ?string
    {
        $series = $this->accessKeySlice($accessKey, 22, 3);

        return $series !== null ? ltrim($series, '0') ?: '0' : null;
    }

    private function accessKeySlice(string $accessKey, int $offset, int $length): ?string
    {
        $digits = preg_replace('/\D+/', '', $accessKey);

        if (strlen($digits) !== 44) {
            return null;
        }

        return substr($digits, $offset, $length);
    }

    private function normalizeCnpj(string $value): ?string
    {
        $digits = preg_replace('/\D+/', '', $value);

        return strlen($digits) === 14 ? $digits : null;
    }

    private function parseDate(string $value): ?Carbon
    {
        if (trim($value) === '') {
            return null;
        }

        try {
            return Carbon::parse($value);
        } catch (Throwable) {
            return null;
        }
    }

    private function resolveCaBundlePath(): string
    {
        $configuredPath = trim((string) Config::get('services.fiscal.ca_bundle', ''));
        $iniCurlPath = trim((string) ini_get('curl.cainfo'));
        $iniOpenSslPath = trim((string) ini_get('openssl.cafile'));

        $candidates = array_filter([
            $configuredPath,
            storage_path('app/private/fiscal-ca-bundle.pem'),
            storage_path('app/private/cacert.pem'),
            base_path('storage/app/private/fiscal-ca-bundle.pem'),
            base_path('storage/app/private/cacert.pem'),
            $iniCurlPath,
            $iniOpenSslPath,
            base_path('cacert.pem'),
            'C:\\xampp\\php\\extras\\ssl\\cacert.pem',
            'C:\\php\\extras\\ssl\\cacert.pem',
        ]);

        $checkedPaths = [];

        foreach ($candidates as $candidate) {
            $checkedPaths[] = $candidate;

            if (is_file($candidate) && is_readable($candidate)) {
                return $candidate;
            }
        }

        throw new RuntimeException(
            'Falha de comunicacao com o webservice da Receita: nenhuma cadeia de certificados confiaveis foi encontrada no ambiente. '
            . 'Configure um CA bundle valido em services.fiscal.ca_bundle, php.ini (curl.cainfo/openssl.cafile) ou em C:\\xampp\\php\\extras\\ssl\\cacert.pem. '
            . 'Caminhos verificados: ' . implode(' | ', $checkedPaths)
        );
    }

    private function buildSoapCommunicationErrorMessage(string $error, string $caBundlePath): string
    {
        $message = 'Falha de comunicacao com o webservice da Receita: ' . $error;

        if (str_contains(strtolower($error), 'unable to get local issuer certificate')) {
            $message .= sprintf(
                ' Cadeia SSL nao validada neste ambiente durante o handshake TLS/renegociacao com a Receita. CA bundle usado: %s.',
                $caBundlePath
            );
        }

        return $message;
    }

    private function resolveOpenSslLegacyConfigPath(): ?string
    {
        $configuredPath = trim((string) Config::get('services.fiscal.openssl_legacy_config', ''));

        if ($configuredPath === '') {
            return null;
        }

        return is_file($configuredPath) && is_readable($configuredPath)
            ? $configuredPath
            : null;
    }

    private function restoreEnvironmentVariable(string $name, string|false $previousValue): void
    {
        if ($previousValue === false) {
            putenv($name);

            return;
        }

        putenv($name . '=' . $previousValue);
    }

    private function readVerboseStream($stream): ?string
    {
        if (! is_resource($stream)) {
            return null;
        }

        rewind($stream);
        $content = stream_get_contents($stream);

        if ($content === false) {
            return null;
        }

        $content = trim($content);

        return $content !== '' ? $content : null;
    }

    private function writeTemporaryPemPair(string $certificatePem, string $privateKeyPem): array
    {
        $certificatePath = tempnam(sys_get_temp_dir(), 'pec_dfe_cert_');
        $privateKeyPath = tempnam(sys_get_temp_dir(), 'pec_dfe_key_');

        if ($certificatePath === false || $privateKeyPath === false) {
            if ($certificatePath !== false) {
                @unlink($certificatePath);
            }

            if ($privateKeyPath !== false) {
                @unlink($privateKeyPath);
            }

            throw new RuntimeException('Nao foi possivel criar arquivos temporarios para o certificado da loja.');
        }

        $certificateWritten = file_put_contents($certificatePath, trim($certificatePem) . PHP_EOL);
        $privateKeyWritten = file_put_contents($privateKeyPath, trim($privateKeyPem) . PHP_EOL);

        if ($certificateWritten === false || $privateKeyWritten === false) {
            @unlink($certificatePath);
            @unlink($privateKeyPath);
            throw new RuntimeException('Nao foi possivel preparar o certificado da loja para consulta na Receita.');
        }

        return [$certificatePath, $privateKeyPath];
    }
}
