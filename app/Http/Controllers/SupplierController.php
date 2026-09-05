<?php

namespace App\Http\Controllers;

use App\Models\SalesDisputeBid;
use App\Models\Supplier;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class SupplierController extends Controller
{
    public function index(Request $request): Response
    {
        $this->ensureMaster($request->user());

        $suppliers = Supplier::orderBy('name')
            ->get(['id', 'name', 'dispute', 'access_code']);

        return Inertia::render('Settings/Suppliers', [
            'suppliers' => $suppliers,
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $this->ensureMaster($request->user());

        $request->merge([
            'name' => trim((string) $request->input('name')),
        ]);

        $data = $request->validate([
            'name' => ['required', 'string', 'max:120', Rule::unique('suppliers', 'name')],
            'dispute' => ['required', 'boolean'],
        ], [
            'name.unique' => 'Fornecedor ja cadastrado.',
        ]);

        $accessCode = $this->generateAccessCode();

        if (! $accessCode) {
            return back()->with('error', 'Nao foi possivel gerar um codigo de acesso unico.');
        }

        Supplier::create([
            'name' => $data['name'],
            'dispute' => (bool) $data['dispute'],
            'access_code' => $accessCode,
        ]);

        return redirect()
            ->route('settings.suppliers')
            ->with('success', 'Fornecedor cadastrado com sucesso!');
    }

    public function toggleDispute(Request $request, Supplier $supplier): RedirectResponse
    {
        $this->ensureMaster($request->user());

        $supplier->update([
            'dispute' => ! (bool) $supplier->dispute,
        ]);

        return redirect()
            ->route('settings.suppliers')
            ->with('success', 'Disputa do fornecedor atualizada com sucesso!');
    }

    public function showDisputes(Request $request, Supplier $supplier): Response
    {
        $this->ensureMaster($request->user());

        return Inertia::render('Supplier/Disputes', [
            'supplier' => [
                'id' => $supplier->id,
                'name' => $supplier->name,
            ],
            'bids' => $this->buildSupplierBids($supplier),
            'portalMode' => 'admin',
            'backUrl' => route('settings.suppliers'),
        ]);
    }

    private function ensureMaster($user): void
    {
        if (! $user || (int) $user->funcao !== 0) {
            abort(403);
        }
    }

    private function buildSupplierBids(Supplier $supplier)
    {
        $approvedDisputes = SalesDisputeBid::query()
            ->whereNotNull('approved_at')
            ->select('sales_dispute_id');

        return SalesDisputeBid::with('dispute:id,product_name,quantity')
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
    }

    private function generateAccessCode(): ?string
    {
        $maxCodes = 9000;
        if (Supplier::count() >= $maxCodes) {
            return null;
        }

        for ($attempt = 0; $attempt < 20; $attempt++) {
            $code = (string) random_int(1000, 9999);

            if (! Supplier::where('access_code', $code)->exists()) {
                return $code;
            }
        }

        return null;
    }
}
