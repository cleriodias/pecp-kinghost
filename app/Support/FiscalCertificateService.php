<?php

namespace App\Support;

use App\Models\ConfiguracaoFiscal;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Storage;
use RuntimeException;
use Throwable;

class FiscalCertificateService
{
    public function inspectStoredCertificate(string $storagePath, string $password): array
    {
        $absolutePath = $this->resolveStorageAbsolutePath($storagePath);

        if ($absolutePath === null) {
            throw new RuntimeException(sprintf(
                'Arquivo do certificado nao encontrado no armazenamento local. Caminho fiscal salvo: %s.',
                trim((string) $storagePath) !== '' ? trim((string) $storagePath) : 'nao informado'
            ));
        }

        return $this->inspectCertificateFile($absolutePath, $password);
    }

    public function loadCertificateForConfiguration(ConfiguracaoFiscal $configuration): array
    {
        $storagePath = trim((string) $configuration->tb26_certificado_arquivo);
        $password = $this->resolveConfigurationPassword($configuration);

        if ($storagePath === '') {
            throw new RuntimeException('Nenhum arquivo de certificado foi configurado para esta loja.');
        }

        if ($password === null || $password === '') {
            throw new RuntimeException($this->resolveConfigurationPasswordDetails($configuration)['message']);
        }

        return $this->inspectStoredCertificate($storagePath, $password);
    }

    public function resolveConfigurationPassword(ConfiguracaoFiscal $configuration): ?string
    {
        return $this->resolveConfigurationPasswordDetails($configuration)['password'];
    }

    public function hasStoredPassword(ConfiguracaoFiscal $configuration): bool
    {
        return $this->resolveConfigurationPasswordDetails($configuration)['has_password'];
    }

    public function resolveConfigurationPasswordDetails(ConfiguracaoFiscal $configuration): array
    {
        $sharedPassword = trim((string) $configuration->getRawOriginal('tb26_certificado_senha_compartilhada'));

        if ($sharedPassword !== '') {
            return [
                'password' => $sharedPassword,
                'has_password' => true,
                'readable' => true,
                'source' => 'shared',
                'message' => 'A senha compartilhada do certificado esta disponivel neste ambiente sem depender da APP_KEY.',
            ];
        }

        $legacyPassword = trim((string) $configuration->getRawOriginal('tb26_certificado_senha'));

        if ($legacyPassword === '') {
            return [
                'password' => null,
                'has_password' => false,
                'readable' => null,
                'source' => null,
                'message' => 'Nenhuma senha de certificado foi salva no banco.',
            ];
        }

        try {
            $decryptedPassword = trim((string) Crypt::decryptString($legacyPassword));

            if ($decryptedPassword === '') {
                return [
                    'password' => null,
                    'has_password' => true,
                    'readable' => false,
                    'source' => 'legacy_encrypted',
                    'message' => 'A senha criptografada existe no banco, mas retornou vazia ao tentar ler neste ambiente.',
                ];
            }

            return [
                'password' => $decryptedPassword,
                'has_password' => true,
                'readable' => true,
                'source' => 'legacy_encrypted',
                'message' => 'A senha criptografada do certificado conseguiu ser lida neste ambiente.',
            ];
        } catch (Throwable) {
            return [
                'password' => null,
                'has_password' => true,
                'readable' => false,
                'source' => 'legacy_encrypted',
                'message' => 'A senha criptografada existe no banco, mas nao conseguiu ser lida neste ambiente. Verifique se a APP_KEY da producao coincide com a do ambiente que salvou a configuracao.',
            ];
        }
    }

    public function inspectCertificateFile(string $absolutePath, string $password): array
    {
        if (! function_exists('openssl_pkcs12_read') || ! function_exists('openssl_x509_parse')) {
            throw new RuntimeException('A extensao OpenSSL nao esta disponivel neste ambiente para ler o certificado digital.');
        }

        $content = @file_get_contents($absolutePath);

        if ($content === false) {
            throw new RuntimeException('Nao foi possivel ler o arquivo do certificado.');
        }

        $certificates = [];

        if (! openssl_pkcs12_read($content, $certificates, $password)) {
            throw new RuntimeException('Nao foi possivel abrir o certificado A1. Verifique o arquivo e a senha informada.');
        }

        $certificatePem = (string) ($certificates['cert'] ?? '');
        $privateKeyPem = (string) ($certificates['pkey'] ?? '');
        $extraCaCertificates = $certificates['extracerts'] ?? [];

        if ($certificatePem === '' || $privateKeyPem === '') {
            throw new RuntimeException('O certificado informado nao contem os dados necessarios para assinatura.');
        }

        if (is_string($extraCaCertificates)) {
            $extraCaCertificates = [$extraCaCertificates];
        }

        $extraCaPem = collect(is_array($extraCaCertificates) ? $extraCaCertificates : [])
            ->map(fn ($certificate) => trim((string) $certificate))
            ->filter()
            ->implode(PHP_EOL);

        $parsed = openssl_x509_parse($certificatePem);

        if (! is_array($parsed)) {
            throw new RuntimeException('Nao foi possivel interpretar os dados do certificado.');
        }

        $commonName = $this->extractCertificateName($parsed);
        $document = $this->extractCertificateCnpj($parsed);

        return [
            'certificate_pem' => $certificatePem,
            'certificate_chain_pem' => trim($certificatePem . PHP_EOL . $extraCaPem),
            'extra_ca_pem' => $extraCaPem !== '' ? $extraCaPem : null,
            'private_key_pem' => $privateKeyPem,
            'password' => $password,
            'public_certificate_base64' => $this->normalizeCertificateForXml($certificatePem),
            'common_name' => $commonName,
            'cnpj' => $document,
            'serial' => trim((string) ($parsed['serialNumber'] ?? '')),
            'valid_from' => $parsed['validFrom_time_t'] ?? null,
            'valid_to' => $parsed['validTo_time_t'] ?? null,
            'subject' => $parsed['subject'] ?? [],
            'issuer' => $parsed['issuer'] ?? [],
        ];
    }

    public function extractCertificateName(array $parsedCertificate): ?string
    {
        $subject = $parsedCertificate['subject'] ?? [];

        $candidates = [
            $subject['CN'] ?? null,
            $subject['commonName'] ?? null,
            $parsedCertificate['name'] ?? null,
        ];

        foreach ($candidates as $candidate) {
            $value = trim((string) $candidate);

            if ($value !== '') {
                return $value;
            }
        }

        return null;
    }

    public function extractCertificateCnpj(array $parsedCertificate): ?string
    {
        $subject = $parsedCertificate['subject'] ?? [];
        $extensions = $parsedCertificate['extensions'] ?? [];

        $candidates = [
            $subject['serialNumber'] ?? null,
            $subject['serialnumber'] ?? null,
            $parsedCertificate['name'] ?? null,
            $extensions['subjectAltName'] ?? null,
        ];

        foreach ($candidates as $candidate) {
            $digits = $this->extractFourteenDigits($candidate);

            if ($digits !== null) {
                return $digits;
            }
        }

        return null;
    }

    private function normalizeCertificateForXml(string $certificatePem): string
    {
        $normalized = str_replace([
            '-----BEGIN CERTIFICATE-----',
            '-----END CERTIFICATE-----',
            "\r",
            "\n",
        ], '', $certificatePem);

        return trim($normalized);
    }

    private function resolveStorageAbsolutePath(string $storagePath): ?string
    {
        foreach ($this->resolveStorageCandidates($storagePath) as $candidate) {
            $absolutePath = Storage::path($candidate);

            if (is_file($absolutePath)) {
                return $absolutePath;
            }
        }

        return null;
    }

    private function resolveStorageCandidates(string $storagePath): array
    {
        $normalized = ltrim(trim($storagePath), '/\\');

        if ($normalized === '') {
            return [];
        }

        $candidates = [$normalized];

        if (str_starts_with($normalized, 'private/')) {
            $candidates[] = substr($normalized, strlen('private/'));
        } else {
            $candidates[] = 'private/' . $normalized;
        }

        return array_values(array_unique(array_filter($candidates)));
    }

    private function extractFourteenDigits(mixed $value): ?string
    {
        $rawValue = (string) $value;
        $tailMatch = [];

        if (preg_match('/(\d{14})(?!.*\d)/', $rawValue, $tailMatch)) {
            return $tailMatch[1];
        }

        $digits = preg_replace('/\D+/', '', $rawValue);

        if ($digits === '') {
            return null;
        }

        if (strlen($digits) === 14) {
            return $digits;
        }

        if (strlen($digits) > 14) {
            preg_match_all('/\d{14}/', $digits, $matches);

            foreach ($matches[0] ?? [] as $candidate) {
                return $candidate;
            }
        }

        return null;
    }
}
