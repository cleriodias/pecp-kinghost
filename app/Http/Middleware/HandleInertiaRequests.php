<?php

namespace App\Http\Middleware;

use App\Models\NotaFiscal;
use App\Models\SupportTicket;
use App\Support\DiscardAlertService;
use App\Support\ManagementScope;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Log;
use Inertia\Middleware;
use Throwable;

class HandleInertiaRequests extends Middleware
{
    /**
     * The root template that is loaded on the first page visit.
     *
     * @var string
     */
    protected $rootView = 'app';

    /**
     * Determine the current asset version.
     */
    public function version(Request $request): ?string
    {
        return parent::version($request);
    }

    /**
     * Define the props that are shared by default.
     *
     * @return array<string, mixed>
     */
    public function share(Request $request): array
    {
        $user = $request->user();
        if ($user) {
            $user->loadMissing('units');
        }

        return [
            ...parent::share($request),
            'auth' => [
                'user' => $user,
                'unit' => $request->session()->get('active_unit'),
            ],
            'flash' => [
                'success' => fn () => $request->session()->get('success'),
                'error' => fn () => $request->session()->get('error'),
            ],
            'discardAlert' => fn () => $this->safeDiscardAlert($request),
            'supportTicketsMenu' => fn () => $this->safeSupportTicketsMenu($request),
            'pendingFiscalTransmissions' => fn () => $this->sharePendingFiscalTransmissions($request),
            'csrf_token' => csrf_token(),
        ];
    }

    private function sharePendingFiscalTransmissions(Request $request): array
    {
        $user = $request->user();

        if (! $user || ! ManagementScope::canAccessFiscal($user)) {
            return [
                'count' => 0,
                'items' => [],
            ];
        }

        if (! $this->fiscalTablesAreAvailable()) {
            return [
                'count' => 0,
                'items' => [],
            ];
        }

        try {
            $query = NotaFiscal::query()
                ->where('tb27_status', 'xml_assinado')
                ->with([
                    'unidade:tb2_id,tb2_nome',
                    'pagamento:tb4_id,valor_total',
                ]);

            if (! ManagementScope::isMaster($user)) {
                $unitIds = ManagementScope::managedUnitIds($user);

                if ($unitIds->isEmpty()) {
                    return [
                        'count' => 0,
                        'items' => [],
                    ];
                }

                $query->whereIn('tb2_id', $unitIds->all());
            }

            $count = (clone $query)->count();

            $items = $query
                ->orderByDesc('created_at')
                ->limit(20)
                ->get([
                    'tb27_id',
                    'tb2_id',
                    'tb4_id',
                    'tb27_modelo',
                    'tb27_serie',
                    'tb27_numero',
                    'tb27_status',
                    'tb27_mensagem',
                    'created_at',
                ])
                ->map(fn (NotaFiscal $invoice) => [
                    'id' => (int) $invoice->tb27_id,
                    'unit_id' => (int) $invoice->tb2_id,
                    'unit_name' => $invoice->unidade?->tb2_nome ?? 'Loja nao identificada',
                    'payment_id' => (int) $invoice->tb4_id,
                    'model' => strtoupper((string) $invoice->tb27_modelo),
                    'serie' => (string) $invoice->tb27_serie,
                    'number' => (string) $invoice->tb27_numero,
                    'status' => (string) $invoice->tb27_status,
                    'message' => $invoice->tb27_mensagem,
                    'total' => round((float) ($invoice->pagamento?->valor_total ?? 0), 2),
                    'created_at' => optional($invoice->created_at)->format('d/m/y H:i'),
                    'transmit_url' => route('settings.fiscal.invoices.transmit', ['notaFiscal' => $invoice->tb27_id]),
                    'settings_url' => route('settings.fiscal'),
                ])
                ->values()
                ->all();

            return [
                'count' => $count,
                'items' => $items,
            ];
        } catch (Throwable) {
            return [
                'count' => 0,
                'items' => [],
            ];
        }
    }

    private function fiscalTablesAreAvailable(): bool
    {
        try {
            return Schema::hasTable('tb26_configuracoes_fiscais')
                && Schema::hasTable('tb27_notas_fiscais');
        } catch (Throwable) {
            return false;
        }
    }

    private function safeDiscardAlert(Request $request): ?array
    {
        if (! $request->routeIs('reports.cash.closure')) {
            return null;
        }

        try {
            return app(DiscardAlertService::class)->forRequest($request);
        } catch (Throwable $exception) {
            Log::warning('Falha ao montar alerta de descarte do dashboard.', [
                'user_id' => $request->user()?->id,
                'exception' => $exception,
            ]);

            return null;
        }
    }

    private function safeSupportTicketsMenu(Request $request): array
    {
        try {
            return SupportTicket::menuSummaryFor($request->user());
        } catch (Throwable $exception) {
            Log::warning('Falha ao montar menu de chamados do dashboard.', [
                'user_id' => $request->user()?->id,
                'exception' => $exception,
            ]);

            return [
                'can_view' => false,
                'counts' => [
                    'aberto' => 0,
                    'em_analise' => 0,
                    'aguardando_usuario' => 0,
                ],
            ];
        }
    }
}
