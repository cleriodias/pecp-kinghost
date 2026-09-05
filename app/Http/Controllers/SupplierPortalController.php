<?php

namespace App\Http\Controllers;

use App\Models\SalesDisputeBid;
use App\Models\Supplier;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class SupplierPortalController extends Controller
{
    public function access(): Response
    {
        return Inertia::render('Supplier/Access');
    }

    public function authenticate(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'access_code' => ['required', 'digits:4'],
        ]);

        $supplier = Supplier::where('access_code', $validated['access_code'])->first();

        if (! $supplier) {
            return back()->withErrors([
                'access_code' => 'Codigo de acesso invalido.',
            ]);
        }

        $request->session()->put('supplier_access', [
            'id' => $supplier->id,
            'name' => $supplier->name,
        ]);

        return redirect()->route('supplier.disputes');
    }

    public function disputes(Request $request): Response|RedirectResponse
    {
        $supplier = $this->supplierFromSession($request);

        if (! $supplier) {
            return redirect()->route('supplier.access');
        }

        $approvedDisputes = SalesDisputeBid::query()
            ->whereNotNull('approved_at')
            ->select('sales_dispute_id');

        $bids = SalesDisputeBid::with('dispute:id,product_name,quantity')
            ->where('supplier_id', $supplier->id)
            ->where(function ($query) use ($approvedDisputes) {
                $query->whereNotIn('sales_dispute_id', $approvedDisputes)
                    ->orWhereNotNull('approved_at');
            })
            ->orderByDesc('sales_dispute_id')
            ->get()
            ->map(fn (SalesDisputeBid $bid) => [
                'id' => $bid->id,
                'unit_cost' => $bid->unit_cost,
                'approved_at' => optional($bid->approved_at)->toIso8601String(),
                'is_approved' => (bool) $bid->approved_at,
                'invoice_note' => $bid->invoice_note,
                'invoice_file_path' => $bid->invoice_file_path,
                'invoiced_at' => optional($bid->invoiced_at)->toIso8601String(),
                'dispute' => $bid->dispute
                    ? [
                        'id' => $bid->dispute->id,
                        'product_name' => $bid->dispute->product_name,
                        'quantity' => $bid->dispute->quantity,
                    ]
                    : null,
            ])
            ->values();

        return Inertia::render('Supplier/Disputes', [
            'supplier' => [
                'id' => $supplier->id,
                'name' => $supplier->name,
            ],
            'bids' => $bids,
        ]);
    }

    public function updateBid(Request $request, SalesDisputeBid $bid): RedirectResponse
    {
        $supplier = $this->supplierFromSession($request);

        if (! $supplier || (int) $bid->supplier_id !== (int) $supplier->id) {
            abort(403);
        }

        if ($bid->approved_at) {
            return redirect()
                ->route('supplier.disputes')
                ->with('error', 'Cotacao ja aprovada. Nao e possivel alterar.');
        }

        $data = $request->validate([
            'unit_cost' => ['required', 'numeric', 'min:0.01'],
        ]);

        $bid->update([
            'unit_cost' => $data['unit_cost'],
        ]);

        return redirect()
            ->route('supplier.disputes')
            ->with('success', 'Lance atualizado com sucesso!');
    }

    public function invoice(Request $request, SalesDisputeBid $bid): RedirectResponse
    {
        $supplier = $this->supplierFromSession($request);

        if (! $supplier || (int) $bid->supplier_id !== (int) $supplier->id) {
            abort(403);
        }

        if (! $bid->approved_at) {
            return redirect()
                ->route('supplier.disputes')
                ->with('error', 'Cotacao ainda nao foi aprovada.');
        }

        if ($bid->invoiced_at) {
            return redirect()
                ->route('supplier.disputes')
                ->with('error', 'Faturamento ja enviado. Nao e possivel alterar.');
        }

        $data = $request->validate([
            'invoice_note' => ['nullable', 'string', 'max:500'],
            'invoice_file' => ['required', 'file', 'mimes:pdf,jpg,jpeg,png', 'max:5120'],
        ]);

        $path = $request->file('invoice_file')->store('supplier-bills', 'public');

        $bid->update([
            'invoice_note' => $data['invoice_note'] ?? null,
            'invoice_file_path' => $path,
            'invoiced_at' => now(),
        ]);

        return redirect()
            ->route('supplier.disputes')
            ->with('success', 'Boleto enviado com sucesso!');
    }

    public function logout(Request $request): RedirectResponse
    {
        $request->session()->forget('supplier_access');

        return redirect()->route('supplier.access');
    }

    private function supplierFromSession(Request $request): ?Supplier
    {
        $sessionData = $request->session()->get('supplier_access');

        if (! is_array($sessionData) || ! isset($sessionData['id'])) {
            return null;
        }

        return Supplier::find($sessionData['id']);
    }
}
