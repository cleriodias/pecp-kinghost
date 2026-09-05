<?php

namespace App\Support;

use App\Models\ConfiguracaoFiscal;
use App\Models\NotaFiscal;
use App\Models\VendaPagamento;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

class FiscalTaxLimitService
{
    private const COUNTED_STATUSES = ['emitida'];
    private const BLOCK_DAILY = 'diario';
    private const BLOCK_MONTHLY = 'mensal';

    public function reactivateAutomaticGenerationIfEligible(ConfiguracaoFiscal $configuration): ConfiguracaoFiscal
    {
        if (
            (bool) $configuration->tb26_geracao_automatica_ativa
            || ! (bool) $configuration->tb26_limite_imposto_ativo
            || blank($configuration->tb26_limite_imposto_bloqueado_por)
        ) {
            return $configuration;
        }

        $blockedBy = $this->blockedReasons($configuration);
        $now = now();
        $summary = $this->summarize($configuration, $now);

        if ($summary['monthly']['exceeded']) {
            return $configuration;
        }

        if (
            in_array(self::BLOCK_DAILY, $blockedBy, true)
            && (
                $summary['daily']['exceeded']
                || $configuration->tb26_limite_imposto_bloqueado_em?->isSameDay($now)
            )
        ) {
            return $configuration;
        }

        if (
            ! in_array(self::BLOCK_DAILY, $blockedBy, true)
            && ! in_array(self::BLOCK_MONTHLY, $blockedBy, true)
            && $summary['daily']['exceeded']
        ) {
            return $configuration;
        }

        $configuration->forceFill([
            'tb26_geracao_automatica_ativa' => true,
            'tb26_limite_imposto_bloqueado_por' => null,
            'tb26_limite_imposto_bloqueado_em' => null,
        ])->save();

        return $configuration->fresh();
    }

    public function reactivateAutomaticGenerationForEligibleBlocks(): int
    {
        $reactivated = 0;

        ConfiguracaoFiscal::query()
            ->where('tb26_geracao_automatica_ativa', false)
            ->where('tb26_limite_imposto_ativo', true)
            ->whereNotNull('tb26_limite_imposto_bloqueado_por')
            ->orderBy('tb26_id')
            ->chunkById(100, function ($configurations) use (&$reactivated): void {
                foreach ($configurations as $configuration) {
                    $wasInactive = ! (bool) $configuration->tb26_geracao_automatica_ativa;
                    $configuration = $this->reactivateAutomaticGenerationIfEligible($configuration);

                    if ($wasInactive && (bool) $configuration?->tb26_geracao_automatica_ativa) {
                        $reactivated++;
                    }
                }
            }, 'tb26_id', 'tb26_id');

        return $reactivated;
    }

    public function blockAutomaticGenerationIfLimitReached(NotaFiscal $invoice): void
    {
        if (! in_array((string) $invoice->tb27_status, self::COUNTED_STATUSES, true)) {
            return;
        }

        DB::transaction(function () use ($invoice): void {
            $configuration = ConfiguracaoFiscal::query()
                ->whereKey($invoice->tb26_id)
                ->lockForUpdate()
                ->first();

            if (
                ! $configuration
                || ! (bool) $configuration->tb26_limite_imposto_ativo
                || ! (bool) $configuration->tb26_geracao_automatica_ativa
            ) {
                return;
            }

            $summary = $this->summarize($configuration);
            $blockedBy = [];

            if ($summary['daily']['exceeded']) {
                $blockedBy[] = self::BLOCK_DAILY;
            }

            if ($summary['monthly']['exceeded']) {
                $blockedBy[] = self::BLOCK_MONTHLY;
            }

            if ($blockedBy === []) {
                return;
            }

            $configuration->forceFill([
                'tb26_geracao_automatica_ativa' => false,
                'tb26_limite_imposto_bloqueado_por' => implode(',', $blockedBy),
                'tb26_limite_imposto_bloqueado_em' => now(),
            ])->save();
        });
    }

    public function clearAutomaticLimitBlock(ConfiguracaoFiscal $configuration): void
    {
        if (blank($configuration->tb26_limite_imposto_bloqueado_por) && ! $configuration->tb26_limite_imposto_bloqueado_em) {
            return;
        }

        $configuration->forceFill([
            'tb26_limite_imposto_bloqueado_por' => null,
            'tb26_limite_imposto_bloqueado_em' => null,
        ])->save();
    }

    public function isPurchaseValueLimitExceeded(?ConfiguracaoFiscal $configuration, VendaPagamento $payment): bool
    {
        $limit = $this->normalizeLimit($configuration?->tb26_limite_valor_compra);

        return $limit !== null && round((float) $payment->valor_total, 2) > $limit;
    }

    public function summarize(?ConfiguracaoFiscal $configuration, ?Carbon $now = null): array
    {
        $now ??= now();
        $dailyLimit = $this->normalizeLimit($configuration?->tb26_limite_imposto_diario);
        $monthlyLimit = $this->normalizeLimit($configuration?->tb26_limite_imposto_mensal);
        $dailyTotal = $configuration ? $this->sumIssuedInvoiceTotal($configuration, $now->copy()->startOfDay(), $now->copy()->endOfDay()) : 0.0;
        $monthlyTotal = $configuration ? $this->sumIssuedInvoiceTotal($configuration, $now->copy()->startOfMonth(), $now->copy()->endOfMonth()) : 0.0;

        return [
            'enabled' => (bool) ($configuration?->tb26_limite_imposto_ativo ?? false),
            'automatic_generation_enabled' => (bool) ($configuration?->tb26_geracao_automatica_ativa ?? false),
            'blocked_by' => $configuration?->tb26_limite_imposto_bloqueado_por,
            'blocked_at' => optional($configuration?->tb26_limite_imposto_bloqueado_em)?->toIso8601String(),
            'daily' => $this->buildPeriodSummary($dailyTotal, $dailyLimit),
            'monthly' => $this->buildPeriodSummary($monthlyTotal, $monthlyLimit),
        ];
    }

    private function sumIssuedInvoiceTotal(ConfiguracaoFiscal $configuration, Carbon $start, Carbon $end): float
    {
        return round((float) NotaFiscal::query()
            ->where('tb2_id', (int) $configuration->tb2_id)
            ->whereIn('tb27_status', self::COUNTED_STATUSES)
            ->whereBetween('tb27_emitida_em', [$start, $end])
            ->with('pagamento:tb4_id,valor_total')
            ->get(['tb27_id', 'tb4_id', 'tb27_payload'])
            ->sum(function (NotaFiscal $invoice): float {
                $payload = is_array($invoice->tb27_payload) ? $invoice->tb27_payload : [];

                return (float) ($payload['valor_total_documento'] ?? $invoice->pagamento?->valor_total ?? 0);
            }), 2);
    }

    private function buildPeriodSummary(float $total, ?float $limit): array
    {
        return [
            'limit' => $limit,
            'total' => $total,
            'remaining' => $limit !== null ? round(max(0, $limit - $total), 2) : null,
            'exceeded' => $limit !== null && $total >= $limit,
            'percentage' => $limit !== null && $limit > 0 ? round(min(100, ($total / $limit) * 100), 1) : null,
        ];
    }

    private function normalizeLimit(mixed $value): ?float
    {
        $limit = round((float) $value, 2);

        return $limit > 0 ? $limit : null;
    }

    private function blockedReasons(ConfiguracaoFiscal $configuration): array
    {
        return collect(explode(',', (string) $configuration->tb26_limite_imposto_bloqueado_por))
            ->map(fn (string $reason): string => trim($reason))
            ->filter()
            ->values()
            ->all();
    }
}
