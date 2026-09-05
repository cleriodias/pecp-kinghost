<?php

namespace App\Http\Controllers;

use App\Support\ManagementScope;
use App\Support\DiscardAlertService;
use Carbon\Carbon;
use Carbon\Exceptions\InvalidFormatException;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class DiscardSettingsController extends Controller
{
    public function index(Request $request, DiscardAlertService $discardAlertService): Response
    {
        $user = $request->user();
        $this->ensureAdmin($user);

        $configuration = $discardAlertService->configuration();
        [$monthReference, $monthValue, $monthLabel] = $this->resolveMonthReference($request->query('month'));
        $units = ManagementScope::managedUnits($user, ['tb2_id', 'tb2_nome'])
            ->map(fn ($unit) => [
                'id' => (int) $unit->tb2_id,
                'name' => $unit->tb2_nome,
            ])
            ->values();

        $monitoring = $discardAlertService->dashboardForAdmin($user, $units, $monthReference);

        return Inertia::render('Settings/DiscardConfig', [
            'setting' => [
                'percentual_aceitavel' => round((float) $configuration->percentual_aceitavel, 2),
            ],
            'monitoring' => array_merge($monitoring, [
                'month_filter_value' => $monthValue,
                'month_filter_label' => $monthLabel,
            ]),
        ]);
    }

    public function update(Request $request, DiscardAlertService $discardAlertService): RedirectResponse
    {
        $this->ensureAdmin($request->user());

        $data = $request->validate([
            'percentual_aceitavel' => [
                'required',
                'numeric',
                'min:0',
                'max:100',
            ],
        ]);

        $configuration = $discardAlertService->configuration();
        $configuration->update([
            'percentual_aceitavel' => round((float) $data['percentual_aceitavel'], 2),
        ]);

        return back()->with('success', 'Configuracao do discarte atualizada com sucesso.');
    }

    private function ensureAdmin($user): void
    {
        if (! $user || ! in_array((int) $user->funcao, [0, 1], true)) {
            abort(403);
        }
    }

    private function resolveMonthReference(?string $value): array
    {
        $fallback = Carbon::today()->startOfMonth();

        if ($value) {
            try {
                $month = Carbon::createFromFormat('Y-m', $value)->startOfMonth();
            } catch (InvalidFormatException $exception) {
                $month = $fallback->copy();
            }
        } else {
            $month = $fallback->copy();
        }

        return [
            $month,
            $month->format('Y-m'),
            $month->format('m/y'),
        ];
    }
}
