import AlertMessage from '@/Components/Alert/AlertMessage';
import { formatBrazilDate } from '@/Utils/date';
import PrimaryButton from '@/Components/Button/PrimaryButton';
import { Head, router, usePage } from '@inertiajs/react';
import { Fragment, useEffect, useMemo, useState } from 'react';

const formatCurrency = (value) =>
    Number(value ?? 0).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });

const formatDate = (value) => {
    if (!value) {
        return '--/--/----';
    }
    return formatBrazilDate(value);
};

export default function Disputes({ supplier, bids = [], portalMode = 'supplier', backUrl = null }) {
    const { flash, errors } = usePage().props;
    const isAdminPreview = portalMode === 'admin';
    const initialCosts = useMemo(() => {
        const map = {};
        bids.forEach((bid) => {
            map[bid.id] = bid.unit_cost ?? '';
        });
        return map;
    }, [bids]);
    const initialNotes = useMemo(() => {
        const map = {};
        bids.forEach((bid) => {
            map[bid.id] = bid.invoice_note ?? '';
        });
        return map;
    }, [bids]);
    const [costs, setCosts] = useState(initialCosts);
    const [savingId, setSavingId] = useState(null);
    const [invoiceNotes, setInvoiceNotes] = useState(initialNotes);
    const [invoiceFiles, setInvoiceFiles] = useState({});
    const [uploadingId, setUploadingId] = useState(null);

    useEffect(() => {
        setCosts(initialCosts);
    }, [initialCosts]);

    useEffect(() => {
        setInvoiceNotes(initialNotes);
    }, [initialNotes]);

    const handleSave = (bidId) => {
        setSavingId(bidId);
        router.put(
            route('supplier.disputes.update', bidId),
            { unit_cost: costs[bidId] },
            {
                preserveScroll: true,
                onFinish: () => setSavingId(null),
            },
        );
    };

    const handleLogout = () => {
        router.post(route('supplier.logout'));
    };

    const handleInvoice = (bidId) => {
        setUploadingId(bidId);
        router.post(
            route('supplier.disputes.invoice', bidId),
            {
                invoice_note: invoiceNotes[bidId] ?? '',
                invoice_file: invoiceFiles[bidId] ?? null,
            },
            {
                preserveScroll: true,
                forceFormData: true,
                onFinish: () => setUploadingId(null),
            },
        );
    };

    return (
        <div className="min-h-screen bg-gray-100 py-10">
            <Head title="Cotacoes" />
            <div className="mx-auto max-w-5xl space-y-6 px-4 sm:px-6 lg:px-8">
                <div className="flex flex-col gap-4 rounded-2xl bg-white p-6 shadow sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h1 className="text-2xl font-semibold text-gray-900">
                            Cotacoes
                        </h1>
                        <p className="text-sm text-gray-500">
                            Fornecedor: <span className="font-semibold text-gray-700">{supplier?.name ?? '--'}</span>
                        </p>
                        {isAdminPreview && (
                            <p className="mt-1 text-sm text-gray-500">
                                Visualizacao administrativa da area de resposta do fornecedor.
                            </p>
                        )}
                    </div>
                    <div className="flex gap-2">
                        {isAdminPreview && backUrl && (
                            <PrimaryButton
                                type="button"
                                onClick={() => router.visit(backUrl)}
                                className="px-4 py-2 text-sm normal-case tracking-normal"
                            >
                                Voltar
                            </PrimaryButton>
                        )}
                        {!isAdminPreview && (
                            <button
                                type="button"
                                onClick={handleLogout}
                                className="rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-200"
                            >
                                Sair
                            </button>
                        )}
                    </div>
                </div>

                <AlertMessage message={flash} />
                {(errors?.unit_cost || errors?.invoice_file || errors?.invoice_note) && (
                    <div className="text-sm text-red-600">
                        {errors?.unit_cost ?? errors?.invoice_file ?? errors?.invoice_note}
                    </div>
                )}

                <div className="rounded-2xl bg-white p-6 shadow">
                    <div className="overflow-x-auto">
                        {bids.length ? (
                            <table className="min-w-full divide-y divide-gray-200 text-sm">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-3 py-2 text-left font-medium text-gray-600">
                                            Produto
                                        </th>
                                        <th className="px-3 py-2 text-right font-medium text-gray-600">
                                            Quantidade
                                        </th>
                                        <th className="px-3 py-2 text-right font-medium text-gray-600">
                                            Custo unitario
                                        </th>
                                        <th className="px-3 py-2 text-right font-medium text-gray-600">
                                            Total
                                        </th>
                                        <th className="px-3 py-2 text-center font-medium text-gray-600">
                                            Acao
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {bids.map((bid) => {
                                        const quantity = Number(bid.dispute?.quantity ?? 0);
                                        const unitCost = Number(costs[bid.id] ?? 0);
                                        const totalCost = quantity * unitCost;
                                        const isApproved = Boolean(bid.is_approved);
                                        const hasInvoice = Boolean(bid.invoiced_at);
                                        const isInvoiceLocked = hasInvoice;

                                        return (
                                            <Fragment key={bid.id}>
                                                <tr>
                                                    <td className="px-3 py-2 font-semibold text-gray-800">
                                                        <div className="flex items-center gap-2">
                                                            <span>{bid.dispute?.product_name ?? '--'}</span>
                                                            {isApproved && (
                                                                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-700">
                                                                    Aprovado
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-3 py-2 text-right text-gray-700">
                                                        {quantity}
                                                    </td>
                                                    <td className="px-3 py-2 text-right">
                                                        <input
                                                            type="number"
                                                            min="0.01"
                                                            step="0.01"
                                                            value={costs[bid.id]}
                                                            onChange={(event) =>
                                                                setCosts((prev) => ({
                                                                    ...prev,
                                                                    [bid.id]: event.target.value,
                                                                }))
                                                            }
                                                            disabled={isApproved || isAdminPreview}
                                                            className="w-28 rounded-md border border-gray-300 px-2 py-1 text-right text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-100"
                                                        />
                                                    </td>
                                                    <td className="px-3 py-2 text-right font-semibold text-gray-900">
                                                        {formatCurrency(totalCost)}
                                                    </td>
                                                    <td className="px-3 py-2 text-center">
                                                        {!isApproved && !isAdminPreview && (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleSave(bid.id)}
                                                                disabled={savingId === bid.id}
                                                                className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white shadow hover:bg-emerald-700 disabled:opacity-50"
                                                            >
                                                                Salvar
                                                            </button>
                                                        )}
                                                        {!isApproved && isAdminPreview && (
                                                            <span className="text-xs font-semibold text-slate-500">
                                                                Aguardando fornecedor
                                                            </span>
                                                        )}
                                                        {isApproved && (
                                                            <span className="text-xs font-semibold text-emerald-600">
                                                                Compra confirmada
                                                            </span>
                                                        )}
                                                    </td>
                                                </tr>
                                                {isApproved && (
                                                    <tr>
                                                        <td colSpan={5} className="bg-emerald-50 px-4 py-4">
                                                            <div className="flex flex-col gap-3">
                                                                <p className="text-sm font-semibold text-emerald-700">
                                                                    Voce foi o fornecedor aprovado e a compra sera realizada.
                                                                </p>
                                                                <div className="grid gap-3 md:grid-cols-2">
                                                                    <div>
                                                                        <label className="text-xs font-semibold text-gray-600">
                                                                            Observacao
                                                                        </label>
                                                                        <textarea
                                                                            rows={2}
                                                                            value={invoiceNotes[bid.id] ?? ''}
                                                                            onChange={(event) =>
                                                                                setInvoiceNotes((prev) => ({
                                                                                    ...prev,
                                                                                    [bid.id]: event.target.value,
                                                                                }))
                                                                            }
                                                                            disabled={isInvoiceLocked || isAdminPreview}
                                                                            className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-100"
                                                                            placeholder="Detalhes do faturamento"
                                                                        />
                                                                    </div>
                                                                    <div>
                                                                        <label className="text-xs font-semibold text-gray-600">
                                                                            Boleto
                                                                        </label>
                                                                        <input
                                                                            type="file"
                                                                            accept=".pdf,.png,.jpg,.jpeg"
                                                                            onChange={(event) =>
                                                                                setInvoiceFiles((prev) => ({
                                                                                    ...prev,
                                                                                    [bid.id]: event.target.files?.[0] ?? null,
                                                                                }))
                                                                            }
                                                                            disabled={isInvoiceLocked || isAdminPreview}
                                                                            className="mt-1 w-full text-sm disabled:opacity-60"
                                                                        />
                                                                        {hasInvoice && (
                                                                            <p className="mt-1 text-xs text-gray-600">
                                                                                Boleto enviado em {formatDate(bid.invoiced_at)}.
                                                                            </p>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                                <div className="flex justify-end">
                                                                    {!isAdminPreview && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleInvoice(bid.id)}
                                                                            disabled={uploadingId === bid.id || isInvoiceLocked}
                                                                            className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-indigo-700 disabled:opacity-50"
                                                                        >
                                                                            {hasInvoice ? 'Faturado' : 'Faturar'}
                                                                        </button>
                                                                    )}
                                                                    {isAdminPreview && (
                                                                        <span className="text-xs font-semibold text-slate-500">
                                                                            Faturamento disponivel apenas no portal do fornecedor
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>
                        ) : (
                            <p className="text-sm text-gray-500">
                                Nenhuma cotacao pendente.
                            </p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
