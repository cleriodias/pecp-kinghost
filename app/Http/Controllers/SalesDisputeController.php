<?php

namespace App\Http\Controllers;

use App\Models\SalesDispute;
use App\Models\SalesDisputeBid;
use App\Models\Supplier;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class SalesDisputeController extends Controller
{
    public function index(Request $request): Response
    {
        $this->ensureMaster($request->user());

        $suppliers = Supplier::query()
            ->where('dispute', true)
            ->orderBy('name')
            ->get(['id', 'name']);

        $disputes = SalesDispute::with(['bids.supplier:id,name'])
            ->orderByDesc('id')
            ->get()
            ->map(fn (SalesDispute $dispute) => [
                'id' => $dispute->id,
                'product_name' => $dispute->product_name,
                'quantity' => $dispute->quantity,
                'bids' => $this->mapBidsForDispute($dispute),
            ]);

        return Inertia::render('Settings/DisputaVendas', [
            'suppliers' => $suppliers,
            'disputes' => $disputes,
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $this->ensureMaster($request->user());

        $data = $request->validate([
            'product_name' => ['required', 'string', 'max:160'],
            'quantity' => ['required', 'integer', 'min:1'],
            'supplier_ids' => ['required', 'array', 'min:1'],
            'supplier_ids.*' => [
                'integer',
                Rule::exists('suppliers', 'id')->where('dispute', true),
            ],
        ]);

        $supplierIds = array_values(array_unique($data['supplier_ids']));

        DB::transaction(function () use ($data, $supplierIds, $request) {
            $dispute = SalesDispute::create([
                'product_name' => $data['product_name'],
                'quantity' => (int) $data['quantity'],
                'created_by' => $request->user()->id,
            ]);

            $rows = array_map(
                fn (int $supplierId) => [
                    'supplier_id' => $supplierId,
                    'unit_cost' => null,
                ],
                $supplierIds
            );

            $dispute->bids()->createMany($rows);
        });

        return redirect()
            ->route('settings.sales-disputes')
            ->with('success', 'Disputa cadastrada com sucesso!');
    }

    public function destroy(Request $request, SalesDispute $salesDispute): RedirectResponse
    {
        $this->ensureMaster($request->user());

        $salesDispute->delete();

        return redirect()
            ->route('settings.sales-disputes')
            ->with('success', 'Disputa removida com sucesso!');
    }

    public function destroyBid(Request $request, SalesDisputeBid $bid): RedirectResponse
    {
        $this->ensureMaster($request->user());

        $bid->delete();

        return redirect()
            ->route('settings.sales-disputes')
            ->with('success', 'Lance removido com sucesso!');
    }

    public function approveBid(Request $request, SalesDisputeBid $bid): RedirectResponse
    {
        $this->ensureMaster($request->user());

        DB::transaction(function () use ($bid, $request) {
            SalesDisputeBid::where('sales_dispute_id', $bid->sales_dispute_id)
                ->update([
                    'approved_at' => null,
                    'approved_by' => null,
                ]);

            $bid->update([
                'approved_at' => now(),
                'approved_by' => $request->user()->id,
            ]);
        });

        return redirect()
            ->route('settings.sales-disputes')
            ->with('success', 'Cotacao aprovada com sucesso!');
    }

    public function downloadInvoice(Request $request, SalesDisputeBid $bid)
    {
        $this->ensureMaster($request->user());

        if (! $bid->invoice_file_path) {
            abort(404);
        }

        $disk = Storage::disk('public');
        if (! $disk->exists($bid->invoice_file_path)) {
            abort(404);
        }

        $path = $disk->path($bid->invoice_file_path);

        return response()->download($path);
    }

    private function ensureMaster($user): void
    {
        if (! $user || (int) $user->funcao !== 0) {
            abort(403);
        }
    }

    private function mapBidsForDispute(SalesDispute $dispute)
    {
        $bids = $dispute->bids;
        $approved = $bids->filter(fn (SalesDisputeBid $bid) => $bid->approved_at);
        $visibleBids = $approved->isNotEmpty() ? $approved : $bids;

        return $visibleBids
            ->sortBy(fn (SalesDisputeBid $bid) => $bid->supplier?->name ?? '')
            ->values()
            ->map(fn (SalesDisputeBid $bid) => [
                'id' => $bid->id,
                'supplier' => $bid->supplier
                    ? [
                        'id' => $bid->supplier->id,
                        'name' => $bid->supplier->name,
                    ]
                    : null,
                'unit_cost' => $bid->unit_cost,
                'approved_at' => optional($bid->approved_at)->toIso8601String(),
                'is_approved' => (bool) $bid->approved_at,
                'invoice_note' => $bid->invoice_note,
                'invoice_download_url' => $bid->invoice_file_path
                    ? route('settings.sales-disputes.bids.invoice', $bid, false)
                    : null,
                'invoiced_at' => optional($bid->invoiced_at)->toIso8601String(),
            ]);
    }
}
