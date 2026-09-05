<?php

namespace App\Support;

use App\Models\ChatMessage;
use App\Models\ControlePagamento;
use App\Models\Unidade;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\URL;

class PaymentControlNotificationService
{
    private const SYSTEM_EMAIL = 'sistema.chat@pec.local';

    public function notifyUserOnLogin(User $recipient, ?int $activeUnitId = null): void
    {
        if (! in_array((int) $recipient->funcao, [0, 1], true)) {
            return;
        }

        $today = Carbon::today();
        $controls = ControlePagamento::query()
            ->where('user_id', $recipient->id)
            ->orderByDesc('id')
            ->get();

        if ($controls->isEmpty()) {
            return;
        }

        $todayRecords = $this->collectRecordsForWindow(
            $controls,
            $today->copy()->startOfDay(),
            $today->copy()->endOfDay(),
        );
        $nextRecords = $this->collectRecordsForWindow(
            $controls,
            $today->copy()->addDay()->startOfDay(),
            $today->copy()->addDays(3)->endOfDay(),
        );

        if ($todayRecords->isEmpty() && $nextRecords->isEmpty()) {
            return;
        }

        $systemUser = $this->ensureSystemUser($activeUnitId);

        ChatMessage::create([
            'sender_id' => $systemUser->id,
            'recipient_id' => $recipient->id,
            'sender_role' => (int) $systemUser->funcao,
            'sender_unit_id' => ($activeUnitId && $activeUnitId > 0)
                ? $activeUnitId
                : (((int) ($systemUser->tb2_id ?? 0)) > 0 ? (int) $systemUser->tb2_id : null),
            'message' => $this->buildSummaryMessage($todayRecords, $nextRecords, $today),
        ]);
    }

    private function collectRecordsForWindow(Collection $controls, Carbon $start, Carbon $end): Collection
    {
        return $controls
            ->flatMap(function (ControlePagamento $item) use ($start, $end) {
                return PaymentControlTimeline::installmentsBetween($item, $start, $end)
                    ->map(function (array $record) use ($item) {
                        return [
                            'descricao' => $item->descricao,
                            'parcela' => (int) $record['numero'],
                            'data_vencimento' => $record['data_vencimento'],
                            'valor' => round((float) $record['valor'], 2),
                        ];
                    });
            })
            ->sortBy([
                ['data_vencimento', 'asc'],
                ['descricao', 'asc'],
                ['parcela', 'asc'],
            ])
            ->values();
    }

    private function buildSummaryMessage(Collection $todayRecords, Collection $nextRecords, Carbon $today): string
    {
        $lines = [
            '[b]Resumo de pagamentos[/b]',
            sprintf('Referencia: %s', $today->format('d/m/y')),
            '',
            sprintf('Hoje: %d pendencia(s)', $todayRecords->count()),
        ];

        if ($todayRecords->isEmpty()) {
            $lines[] = '- Nenhum pagamento previsto para hoje.';
        } else {
            foreach ($todayRecords as $record) {
                $lines[] = sprintf(
                    '- %s | Parcela %d | %s | %s',
                    $record['descricao'],
                    $record['parcela'],
                    Carbon::parse($record['data_vencimento'])->format('d/m/y'),
                    $this->formatCurrency($record['valor']),
                );
            }
        }

        $lines[] = '';
        $lines[] = sprintf(
            'Proximos 3 dias: %d pendencia(s)',
            $nextRecords->count(),
        );

        if ($nextRecords->isEmpty()) {
            $lines[] = '- Nenhum pagamento previsto para os proximos 3 dias.';
        } else {
            foreach ($nextRecords as $record) {
                $lines[] = sprintf(
                    '- %s | Parcela %d | %s | %s',
                    $record['descricao'],
                    $record['parcela'],
                    Carbon::parse($record['data_vencimento'])->format('d/m/y'),
                    $this->formatCurrency($record['valor']),
                );
            }
        }

        $lines[] = '';
        $lines[] = '[link=/settings/controle-pagamentos]Abrir Controle de Pagamentos[/link]';
        $lines[] = 'Link direto: ' . URL::to('/settings/controle-pagamentos');

        return implode("\n", $lines);
    }

    private function ensureSystemUser(?int $activeUnitId = null): User
    {
        $activeUnitIds = Unidade::active()
            ->orderBy('tb2_id')
            ->pluck('tb2_id')
            ->map(fn ($value) => (int) $value)
            ->values();

        $primaryUnitId = $activeUnitId && $activeUnitId > 0
            ? $activeUnitId
            : (int) ($activeUnitIds->first() ?? 0);

        $systemUser = User::query()->firstOrCreate(
            ['email' => self::SYSTEM_EMAIL],
            [
                'name' => 'Sistema',
                'password' => Str::random(32),
                'funcao' => 1,
                'funcao_original' => 1,
                'hr_ini' => '00:00',
                'hr_fim' => '23:59',
                'salario' => 0,
                'vr_cred' => 0,
                'tb2_id' => $primaryUnitId > 0 ? $primaryUnitId : null,
                'cod_acesso' => Str::upper(Str::random(6)),
            ]
        );

        $nextPrimaryUnitId = $primaryUnitId > 0
            ? $primaryUnitId
            : (int) ($systemUser->tb2_id ?? 0);

        if ($nextPrimaryUnitId > 0 && (int) $systemUser->tb2_id !== $nextPrimaryUnitId) {
            $systemUser->forceFill(['tb2_id' => $nextPrimaryUnitId])->save();
        }

        if ($activeUnitIds->isNotEmpty()) {
            $systemUser->units()->sync($activeUnitIds->all());
        }

        return $systemUser->fresh(['units']) ?? $systemUser;
    }

    private function formatCurrency(float $value): string
    {
        return 'R$ ' . number_format($value, 2, ',', '.');
    }
}
