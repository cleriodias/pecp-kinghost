<?php

namespace App\Support;

use App\Models\NotaFiscal;
use Carbon\Carbon;
use DOMDocument;
use DOMXPath;
use Illuminate\Support\Facades\Config;
use RuntimeException;

class FiscalNfceTransmissionService
{
    private readonly FiscalTaxLimitService $fiscalTaxLimitService;

    public function __construct(
        private readonly FiscalCertificateService $fiscalCertificateService,
        private readonly FiscalWebserviceResolverService $fiscalWebserviceResolverService,
        private readonly FiscalNfceXmlService $fiscalNfceXmlService,
        ?FiscalTaxLimitService $fiscalTaxLimitService = null,
    ) {
        $this->fiscalTaxLimitService = $fiscalTaxLimitService ?? new FiscalTaxLimitService();
    }

    public function transmit(NotaFiscal $invoice): NotaFiscal
    {
        $invoice->loadMissing([
            'pagamento.vendas.produto',
            'pagamento.vendas.unidade',
            'configuracaoFiscal',
        ]);

        $configuration = $invoice->configuracaoFiscal;

        if (! $configuration) {
            throw new RuntimeException('A nota nao possui configuracao fiscal vinculada.');
        }

        if ($invoice->tb27_modelo !== 'nfce') {
            throw new RuntimeException('Nesta etapa a transmissao automatica esta disponivel apenas para NFC-e.');
        }

        if (! filled($invoice->tb27_xml_envio)) {
            throw new RuntimeException('A nota ainda nao possui XML assinado para transmissao.');
        }

        try {
            $certificateData = $this->fiscalCertificateService->loadCertificateForConfiguration($configuration);
            $this->assertSignedXmlStructureOrFail((string) $invoice->tb27_xml_envio);
            $this->fiscalNfceXmlService->validateSignedXmlOrFail((string) $invoice->tb27_xml_envio, $certificateData);
            $endpoints = $this->fiscalWebserviceResolverService->resolveNfceEndpoints(
                (string) $configuration->tb26_uf,
                (string) $configuration->tb26_ambiente,
            );

            $lotXml = $this->buildBatchXml($invoice->tb27_xml_envio, (int) $invoice->tb4_id);
            $this->assertBatchPreservesSignedXmlOrFail((string) $invoice->tb27_xml_envio, $lotXml, $certificateData);
            $soapEnvelope = $this->buildSoapEnvelope(
                $lotXml,
                (string) $configuration->tb26_codigo_municipio,
            );

            $responseXml = $this->sendSoapRequest(
                $endpoints['authorization'],
                $endpoints['authorization_operation'],
                $soapEnvelope,
                $certificateData,
            );

            $parsed = $this->parseAuthorizationResponse($responseXml);

            $invoice->update([
                'tb27_status' => $parsed['status'],
                'tb27_chave_acesso' => $parsed['access_key'] ?? $invoice->tb27_chave_acesso,
                'tb27_protocolo' => $parsed['protocol'] ?? $invoice->tb27_protocolo,
                'tb27_recibo' => $parsed['receipt'] ?? $invoice->tb27_recibo,
                'tb27_xml_retorno' => $responseXml,
                'tb27_mensagem' => $parsed['message'],
                'tb27_emitida_em' => $parsed['emitted_at'],
                'tb27_ultima_tentativa_em' => now(),
            ]);
        } catch (RuntimeException $exception) {
            $invoice->update([
                'tb27_status' => 'erro_transmissao',
                'tb27_mensagem' => $exception->getMessage(),
                'tb27_ultima_tentativa_em' => now(),
            ]);

            throw $exception;
        }

        $invoice = $invoice->fresh();
        $this->fiscalTaxLimitService->blockAutomaticGenerationIfLimitReached($invoice);

        return $invoice;
    }

    private function buildBatchXml(string $signedXml, int $paymentId): string
    {
        $cleanXml = preg_replace('/^\s*<\?xml[^>]+>\s*/', '', trim($signedXml));
        $lotId = str_pad((string) $paymentId, 15, '0', STR_PAD_LEFT);

        return '<?xml version="1.0" encoding="UTF-8"?>'
            . '<enviNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">'
            . '<idLote>' . $lotId . '</idLote>'
            . '<indSinc>1</indSinc>'
            . $cleanXml
            . '</enviNFe>';
    }

    private function buildSoapEnvelope(string $lotXml, string $municipalityCode): string
    {
        $cUf = substr(preg_replace('/\D+/', '', $municipalityCode), 0, 2);

        if ($cUf === '') {
            throw new RuntimeException('Codigo do municipio da loja nao informado para transmissao da NFC-e.');
        }

        $cleanLotXml = preg_replace('/^\s*<\?xml[^>]+>\s*/', '', trim($lotXml));

        if ($cleanLotXml === null || $cleanLotXml === '') {
            throw new RuntimeException('O lote fiscal assinado nao gerou um XML valido para montagem do SOAP.');
        }

        $document = new DOMDocument('1.0', 'UTF-8');
        $loaded = @$document->loadXML($cleanLotXml);

        if (! $loaded) {
            throw new RuntimeException('O lote fiscal assinado nao gerou um XML valido para montagem do SOAP.');
        }

        return '<?xml version="1.0" encoding="UTF-8"?>'
            . '<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"'
            . ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"'
            . ' xmlns:xsd="http://www.w3.org/2001/XMLSchema">'
            . '<soap12:Header>'
            . '<nfeCabecMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4">'
            . '<cUF>' . htmlspecialchars($cUf, ENT_XML1) . '</cUF>'
            . '<versaoDados>4.00</versaoDados>'
            . '</nfeCabecMsg>'
            . '</soap12:Header>'
            . '<soap12:Body>'
            . '<nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4">'
            . $cleanLotXml
            . '</nfeDadosMsg>'
            . '</soap12:Body>'
            . '</soap12:Envelope>';
    }

    private function assertSignedXmlStructureOrFail(string $signedXml): void
    {
        $document = new DOMDocument();

        if (! @$document->loadXML(trim($signedXml))) {
            throw new RuntimeException('O XML fiscal salvo na nota nao e valido para transmissao.');
        }

        $xpath = new DOMXPath($document);
        $xpath->registerNamespace('nfe', 'http://www.portalfiscal.inf.br/nfe');

        $model = trim((string) $xpath->evaluate('string(/nfe:NFe/nfe:infNFe/nfe:ide/nfe:mod)'));
        $danfeType = trim((string) $xpath->evaluate('string(/nfe:NFe/nfe:infNFe/nfe:ide/nfe:tpImp)'));

        if ($model !== '65') {
            throw new RuntimeException(sprintf(
                'O XML fiscal salvo na nota esta com modelo %s, mas a transmissao automatica desta etapa exige NFC-e modelo 65.',
                $model !== '' ? $model : 'nao informado'
            ));
        }

        if ($danfeType !== '4') {
            throw new RuntimeException(sprintf(
                'O XML fiscal salvo na nota esta com tpImp %s, mas a NFC-e desta etapa exige tpImp 4.',
                $danfeType !== '' ? $danfeType : 'nao informado'
            ));
        }

        $destinationNode = $xpath->query('/nfe:NFe/nfe:infNFe/nfe:dest')->item(0);

        if (! $destinationNode) {
            return;
        }

        $cpf = trim((string) $xpath->evaluate('string(/nfe:NFe/nfe:infNFe/nfe:dest/nfe:CPF)'));
        $cnpj = trim((string) $xpath->evaluate('string(/nfe:NFe/nfe:infNFe/nfe:dest/nfe:CNPJ)'));
        $foreignId = trim((string) $xpath->evaluate('string(/nfe:NFe/nfe:infNFe/nfe:dest/nfe:idEstrangeiro)'));
        $name = trim((string) $xpath->evaluate('string(/nfe:NFe/nfe:infNFe/nfe:dest/nfe:xNome)'));
        $cityCode = trim((string) $xpath->evaluate('string(/nfe:NFe/nfe:infNFe/nfe:dest/nfe:enderDest/nfe:cMun)'));
        $address = trim((string) $xpath->evaluate('string(/nfe:NFe/nfe:infNFe/nfe:dest/nfe:enderDest/nfe:xLgr)'));
        $hasAddress = $cityCode !== '' || $address !== '';
        $isFiscalCoupon = $cpf !== '' && $cnpj === '' && $foreignId === '' && $name === '' && ! $hasAddress;

        if ($cpf === '' && $cnpj === '' && $foreignId === '') {
            throw new RuntimeException('O XML fiscal abriu o grupo dest, mas nao informou CPF, CNPJ ou idEstrangeiro do destinatario.');
        }

        if ($isFiscalCoupon) {
            return;
        }

        if ($name === '') {
            throw new RuntimeException('O XML fiscal abriu o grupo dest, mas nao informou o nome do destinatario.');
        }

        if ($cityCode === '' || $address === '') {
            throw new RuntimeException('O XML fiscal abriu o grupo dest, mas nao informou endereco completo do destinatario.');
        }
    }

    private function assertBatchPreservesSignedXmlOrFail(string $signedXml, string $lotXml, array $certificateData): void
    {
        $normalizedSignedXml = $this->normalizeXmlFragment($signedXml);
        $extractedNfeXml = $this->extractSignedXmlFromBatch($lotXml);
        $normalizedBatchXml = $this->normalizeXmlFragment($extractedNfeXml);

        if ($normalizedSignedXml !== $normalizedBatchXml) {
            throw new RuntimeException('O XML assinado salvo na nota foi alterado durante a montagem do lote SOAP.');
        }

        try {
            $this->fiscalNfceXmlService->validateSignedXmlOrFail($extractedNfeXml, $certificateData);
        } catch (RuntimeException $exception) {
            throw new RuntimeException(
                'A assinatura digital ficou invalida no XML enviado ao SOAP. ' . $exception->getMessage(),
                previous: $exception
            );
        }
    }

    private function sendSoapRequest(
        string $url,
        string $soapAction,
        string $soapEnvelope,
        array $certificateData,
    ): string {
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
                $this->setEnvironmentVariable('OPENSSL_CONF', $openSslLegacyConfigPath);
            }

            $this->setEnvironmentVariable('SSL_CERT_FILE', $caBundlePath);

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
                        'Content-Type: application/soap+xml; charset=utf-8; action="' . $soapAction . '"',
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
                    logger()->error('SEFAZ GO - cURL SSL Error', [
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
                    throw new RuntimeException('A SEFAZ respondeu com erro HTTP ' . $statusCode . ' durante a autorizacao.');
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
            'Falha de comunicacao com o webservice da SEFAZ: nenhuma cadeia de certificados confiaveis foi encontrada no ambiente. '
            . 'Configure um CA bundle valido em services.fiscal.ca_bundle, php.ini (curl.cainfo/openssl.cafile) ou em C:\\xampp\\php\\extras\\ssl\\cacert.pem. '
            . 'Caminhos verificados: ' . implode(' | ', $checkedPaths)
        );
    }

    private function buildSoapCommunicationErrorMessage(string $error, string $caBundlePath): string
    {
        $message = 'Falha de comunicacao com o webservice da SEFAZ: ' . $error;

        if (str_contains(strtolower($error), 'unable to get local issuer certificate')) {
            $message .= sprintf(
                ' Cadeia SSL nao validada neste ambiente durante o handshake TLS/renegociacao com a SEFAZ. CA bundle usado: %s.',
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
        if (! function_exists('putenv')) {
            return;
        }

        if ($previousValue === false) {
            putenv($name);

            return;
        }

        putenv($name . '=' . $previousValue);
    }

    private function setEnvironmentVariable(string $name, string $value): void
    {
        if (! function_exists('putenv')) {
            return;
        }

        putenv($name . '=' . $value);
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

    private function parseAuthorizationResponse(string $responseXml): array
    {
        $document = new DOMDocument();
        $loaded = @$document->loadXML($responseXml);

        if (! $loaded) {
            throw new RuntimeException('A resposta da SEFAZ nao retornou um XML valido.');
        }

        $xpath = new DOMXPath($document);
        $xpath->registerNamespace('soap', 'http://www.w3.org/2003/05/soap-envelope');
        $xpath->registerNamespace('nfe', 'http://www.portalfiscal.inf.br/nfe');

        $rootStatus = $this->xpathValue($xpath, 'string(//nfe:retEnviNFe/nfe:cStat)');
        $rootMessage = $this->xpathValue($xpath, 'string(//nfe:retEnviNFe/nfe:xMotivo)');
        $receipt = $this->xpathValue($xpath, 'string(//nfe:retEnviNFe/nfe:nRec | //nfe:retEnviNFe/nfe:infRec/nfe:nRec)');
        $protocolStatus = $this->xpathValue($xpath, 'string(//nfe:protNFe/nfe:infProt/nfe:cStat)');
        $protocolMessage = $this->xpathValue($xpath, 'string(//nfe:protNFe/nfe:infProt/nfe:xMotivo)');
        $protocol = $this->xpathValue($xpath, 'string(//nfe:protNFe/nfe:infProt/nfe:nProt)');
        $accessKey = $this->xpathValue($xpath, 'string(//nfe:protNFe/nfe:infProt/nfe:chNFe)');
        $emittedAt = $this->xpathValue($xpath, 'string(//nfe:protNFe/nfe:infProt/nfe:dhRecbto)');
        $soapFaultReason = $this->xpathValue($xpath, 'string(//soap:Fault/soap:Reason/soap:Text)');

        if ($rootStatus === '104' && $protocolStatus === '100') {
            return [
                'status' => 'emitida',
                'message' => $protocolMessage !== '' ? $protocolMessage : 'NFC-e autorizada com sucesso.',
                'receipt' => $receipt !== '' ? $receipt : null,
                'protocol' => $protocol !== '' ? $protocol : null,
                'access_key' => $accessKey !== '' ? $accessKey : null,
                'emitted_at' => $emittedAt !== '' ? Carbon::parse($emittedAt) : now(),
            ];
        }

        $message = $protocolMessage !== '' ? $protocolMessage : $rootMessage;

        if ($message === '' && $soapFaultReason !== '') {
            $message = $soapFaultReason;
        }

        if ($protocolStatus !== '') {
            $message = sprintf('cStat %s - %s', $protocolStatus, $message !== '' ? $message : 'A SEFAZ nao autorizou a NFC-e.');
        } elseif ($rootStatus !== '') {
            $message = sprintf('cStat %s - %s', $rootStatus, $message !== '' ? $message : 'A SEFAZ nao autorizou a NFC-e.');
        }

        return [
            'status' => 'erro_transmissao',
            'message' => $message !== '' ? $message : 'A SEFAZ nao autorizou a NFC-e.',
            'receipt' => $receipt !== '' ? $receipt : null,
            'protocol' => $protocol !== '' ? $protocol : null,
            'access_key' => $accessKey !== '' ? $accessKey : null,
            'emitted_at' => null,
        ];
    }

    private function xpathValue(DOMXPath $xpath, string $expression): string
    {
        return trim((string) $xpath->evaluate($expression));
    }

    private function extractSignedXmlFromBatch(string $lotXml): string
    {
        $document = new DOMDocument();

        if (! @$document->loadXML($lotXml)) {
            throw new RuntimeException('O lote fiscal assinado nao gerou um XML valido para extrair a NFC-e antes do SOAP.');
        }

        $xpath = new DOMXPath($document);
        $xpath->registerNamespace('nfe', 'http://www.portalfiscal.inf.br/nfe');
        $nfeNode = $xpath->query('/nfe:enviNFe/nfe:NFe')->item(0);

        if (! $nfeNode) {
            throw new RuntimeException('O lote fiscal nao contem a NFC-e assinada esperada antes do SOAP.');
        }

        $xml = $document->saveXML($nfeNode);

        if ($xml === false || trim($xml) === '') {
            throw new RuntimeException('Nao foi possivel extrair a NFC-e assinada do lote fiscal antes do SOAP.');
        }

        return $xml;
    }

    private function normalizeXmlFragment(string $xml): string
    {
        $document = new DOMDocument('1.0', 'UTF-8');
        $document->preserveWhiteSpace = false;
        $document->formatOutput = false;

        if (! @$document->loadXML(trim($xml))) {
            throw new RuntimeException('Nao foi possivel normalizar o XML fiscal para comparacao antes do SOAP.');
        }

        $normalized = $document->saveXML($document->documentElement);

        if ($normalized === false || trim($normalized) === '') {
            throw new RuntimeException('Nao foi possivel serializar o XML fiscal normalizado antes do SOAP.');
        }

        return $normalized;
    }

    private function writeTemporaryPemPair(string $certificatePem, string $privateKeyPem): array
    {
        $certificatePath = tempnam(sys_get_temp_dir(), 'pec_nfce_cert_');
        $privateKeyPath = tempnam(sys_get_temp_dir(), 'pec_nfce_key_');

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
            throw new RuntimeException('Nao foi possivel preparar o certificado da loja para transmissao.');
        }

        return [$certificatePath, $privateKeyPath];
    }
}
