<?php

namespace App\Support;

use App\Models\ControlePagamento;
use Carbon\Carbon;
use Illuminate\Support\Collection;

class PaymentControlTimeline
{
    public const FREQUENCY_LABELS = [
        'semanal' => 'Semanal',
        'quinzenal' => 'Quinzenal',
        'mensal' => 'Mensal',
    ];

    public const WEEKDAY_LABELS = [
        0 => 'Domingo',
        1 => 'Segunda-feira',
        2 => 'Terca-feira',
        3 => 'Quarta-feira',
        4 => 'Quinta-feira',
        5 => 'Sexta-feira',
        6 => 'Sabado',
    ];

    public static function calculateEndDate(
        string $frequency,
        Carbon $startDate,
        int $installments,
        ?int $monthDay
    ): Carbon {
        if ($installments <= 1) {
            return $startDate->copy();
        }

        if ($frequency === 'semanal') {
            return $startDate->copy()->addDays(($installments - 1) * 7);
        }

        if ($frequency === 'quinzenal') {
            return $startDate->copy()->addDays(($installments - 1) * 14);
        }

        $current = $startDate->copy();
        for ($index = 1; $index < $installments; $index++) {
            $current = self::addNextMonthlyOccurrence($current, (int) $monthDay);
        }

        return $current;
    }

    public static function buildInstallmentTimeline(ControlePagamento $item, Carbon $today): array
    {
        $records = collect();

        for ($installmentNumber = 1; $installmentNumber <= (int) $item->quantidade_parcelas; $installmentNumber++) {
            $dueDate = self::calculateInstallmentDate($item, $installmentNumber);
            $status = self::classifyInstallmentStatus($dueDate, $today);

            $records->push([
                'numero' => $installmentNumber,
                'data_vencimento' => $dueDate->toDateString(),
                'valor' => round((float) $item->valor_parcela, 2),
                'status' => $status['key'],
                'status_label' => $status['label'],
                'dias_para_vencer' => $today->diffInDays($dueDate, false),
            ]);
        }

        return [
            'summary' => [
                'total_parcelas' => $records->count(),
                'vencido' => $records->where('status', 'vencido')->count(),
                'por_vencer' => $records->where('status', 'por_vencer')->count(),
                'nao_venceu' => $records->where('status', 'nao_venceu')->count(),
            ],
            'records' => $records->values()->all(),
        ];
    }

    public static function installmentsBetween(
        ControlePagamento $item,
        Carbon $start,
        Carbon $end
    ): Collection {
        $records = collect();

        for ($installmentNumber = 1; $installmentNumber <= (int) $item->quantidade_parcelas; $installmentNumber++) {
            $dueDate = self::calculateInstallmentDate($item, $installmentNumber);

            if ($dueDate->lt($start) || $dueDate->gt($end)) {
                continue;
            }

            $records->push([
                'numero' => $installmentNumber,
                'data_vencimento' => $dueDate->toDateString(),
                'valor' => round((float) $item->valor_parcela, 2),
            ]);
        }

        return $records->values();
    }

    private static function calculateInstallmentDate(ControlePagamento $item, int $installmentNumber): Carbon
    {
        $startDate = $item->data_inicio instanceof Carbon
            ? $item->data_inicio->copy()->startOfDay()
            : Carbon::parse($item->data_inicio)->startOfDay();

        if ($installmentNumber <= 1) {
            return $startDate;
        }

        if ($item->frequencia === 'semanal') {
            return $startDate->addDays(($installmentNumber - 1) * 7);
        }

        if ($item->frequencia === 'quinzenal') {
            return $startDate->addDays(($installmentNumber - 1) * 14);
        }

        $current = $startDate;
        for ($index = 1; $index < $installmentNumber; $index++) {
            $current = self::addNextMonthlyOccurrence($current, (int) $item->dia_mes);
        }

        return $current;
    }

    private static function addNextMonthlyOccurrence(Carbon $current, int $targetDay): Carbon
    {
        $nextMonthStart = $current->copy()->startOfDay()->addMonthNoOverflow()->startOfMonth();
        $day = min($targetDay, $nextMonthStart->daysInMonth);

        return $nextMonthStart->copy()->day($day);
    }

    private static function classifyInstallmentStatus(Carbon $dueDate, Carbon $today): array
    {
        $daysUntilDue = $today->diffInDays($dueDate, false);

        if ($daysUntilDue < 0) {
            return [
                'key' => 'vencido',
                'label' => 'Vencido',
            ];
        }

        if ($daysUntilDue <= 7) {
            return [
                'key' => 'por_vencer',
                'label' => 'Por vencer',
            ];
        }

        return [
            'key' => 'nao_venceu',
            'label' => 'Nao venceu',
        ];
    }
}
