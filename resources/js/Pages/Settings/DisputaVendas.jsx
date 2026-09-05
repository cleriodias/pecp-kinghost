import AlertMessage from '@/Components/Alert/AlertMessage';
import SuccessButton from '@/Components/Button/SuccessButton';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { formatBrazilDate } from '@/Utils/date';
import { Head, router, useForm, usePage } from '@inertiajs/react';
import { Fragment, useMemo } from 'react';

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

export default function DisputaVendas({ auth, suppliers = [], disputes = [] }) {
    const { flash } = usePage().props;
    const { data, setData, post, processing, errors, reset } = useForm({
        supplier_ids: [],
        product_name: '',
        quantity: '',
    });
    const selectedSuppliers = useMemo(() => data.supplier_ids ?? [], [data.supplier_ids]);

    const handleSupplierToggle = (supplierId) => {
        const current = Array.isArray(selectedSuppliers) ? selectedSuppliers : [];
        if (current.includes(supplierId)) {
            setData(
                'supplier_ids',
                current.filter((id) => id !== supplierId),
            );
            return;
        }
        setData('supplier_ids', [...current, supplierId]);
    };

    const handleSubmit = (event) => {
        event.preventDefault();
        post(route('settings.sales-disputes.store'), {
            onSuccess: () => reset('product_name', 'quantity', 'supplier_ids'),
        });
    };

    const handleDeleteDispute = (disputeId) => {
        if (!disputeId) {
            return;
        }
        if (!window.confirm('Confirma excluir esta disputa?')) {
            return;
        }
        router.delete(route('settings.sales-disputes.destroy', disputeId));
    };

    const handleDeleteBid = (bidId) => {
        if (!bidId) {
            return;
        }
        if (!window.confirm('Confirma excluir este lance?')) {
            return;
        }
        router.delete(route('settings.sales-disputes.bids.destroy', bidId));
    };

    const handleApproveBid = (bidId) => {
        if (!bidId) {
            return;
        }
        if (!window.confirm('Confirma aprovar esta cotacao?')) {
            return;
        }
        router.put(route('settings.sales-disputes.bids.approve', bidId));
    };

    const headerContent = (
        <div>
            <h2 className="text-xl font-semibold leading-tight text-gray-800 dark:text-gray-200">
                Disputa de vendas
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-300">
                Cadastre disputas e acompanhe os lances dos fornecedores.
            </p>
        </div>
    );

    const hasSuppliers = suppliers.length > 0;
    const supplierError = errors.supplier_ids ?? errors['supplier_ids.0'];

    return (
        <AuthenticatedLayout user={auth.user} header={headerContent}>
            <Head title="Disputa de vendas" />

            <div className="py-8">
                <div className="mx-auto max-w-6xl space-y-6 px-4 sm:px-6 lg:px-8">
                    <AlertMessage message={flash} />

                    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
                        <h3 className="text-sm font-semibold uppercase text-gray-600 dark:text-gray-300">
                            Nova disputa
                        </h3>

                        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
                            <div>
                                <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                                    Fornecedores
                                </p>
                                {hasSuppliers ? (
                                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                        {suppliers.map((supplier) => (
                                            <label
                                                key={supplier.id}
                                                className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 dark:border-gray-700 dark:text-gray-200"
                                            >
                                                <input
                                                    type="checkbox"
                                                    value={supplier.id}
                                                    checked={selectedSuppliers.includes(supplier.id)}
                                                    onChange={() => handleSupplierToggle(supplier.id)}
                                                    className="rounded border-gray-300 text-indigo-600 shadow-sm focus:ring-indigo-500"
                                                />
                                                <span>{supplier.name}</span>
                                            </label>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="mt-2 text-sm text-gray-500 dark:text-gray-300">
                                        Nenhum fornecedor habilitado para disputa.
                                    </p>
                                )}
                                {supplierError && (
                                    <p className="text-sm text-red-600">{supplierError}</p>
                                )}
                            </div>

                            <div className="grid gap-4 sm:grid-cols-2">
                                <div>
                                    <label className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                                        Produto
                                    </label>
                                    <input
                                        type="text"
                                        value={data.product_name}
                                        onChange={(event) => setData('product_name', event.target.value)}
                                        className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                                        placeholder="Produto"
                                    />
                                    {errors.product_name && (
                                        <p className="text-sm text-red-600">{errors.product_name}</p>
                                    )}
                                </div>
                                <div>
                                    <label className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                                        Quantidade
                                    </label>
                                    <input
                                        type="number"
                                        min="1"
                                        value={data.quantity}
                                        onChange={(event) => setData('quantity', event.target.value)}
                                        className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                                        placeholder="Quantidade"
                                    />
                                    {errors.quantity && (
                                        <p className="text-sm text-red-600">{errors.quantity}</p>
                                    )}
                                </div>
                            </div>

                            <div className="flex justify-end">
                                <SuccessButton
                                    type="submit"
                                    disabled={processing || !hasSuppliers || selectedSuppliers.length === 0}
                                >
                                    Gravar
                                </SuccessButton>
                            </div>
                        </form>
                    </div>

                    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
                        <h3 className="text-sm font-semibold uppercase text-gray-600 dark:text-gray-300">
                            Disputas cadastradas
                        </h3>
                        <div className="mt-4 overflow-x-auto">
                            {disputes.length ? (
                                <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-700">
                                    <thead className="bg-gray-50 dark:bg-gray-900/40">
                                        <tr>
                                            <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">
                                                ID
                                            </th>
                                            <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">
                                                Fornecedor
                                            </th>
                                            <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">
                                                Produto
                                            </th>
                                            <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-300">
                                                Qtde
                                            </th>
                                            <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-300">
                                                Valor
                                            </th>
                                            <th className="px-3 py-2 text-center font-medium text-gray-600 dark:text-gray-300">
                                                Acoes
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                        {disputes.map((dispute) => (
                                            <Fragment key={dispute.id}>
                                                <tr className="bg-gray-50 font-semibold text-gray-700 dark:bg-gray-900/40 dark:text-gray-200">
                                                    <td className="px-3 py-2">{dispute.id}</td>
                                                    <td className="px-3 py-2">-</td>
                                                    <td className="px-3 py-2">{dispute.product_name}</td>
                                                    <td className="px-3 py-2 text-right">{dispute.quantity}</td>
                                                    <td className="px-3 py-2 text-right">{formatCurrency(0)}</td>
                                                    <td className="px-3 py-2 text-center">
                                                        <button
                                                            type="button"
                                                            onClick={() => handleDeleteDispute(dispute.id)}
                                                            className="rounded-lg border border-red-200 px-3 py-1 text-xs font-semibold text-red-600 transition hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-200 dark:border-red-500/60 dark:text-red-300 dark:hover:bg-red-500/10"
                                                        >
                                                            Excluir
                                                        </button>
                                                    </td>
                                                </tr>
                                                {dispute.bids.map((bid) => {
                                                    const unitCost = Number(bid.unit_cost ?? 0);
                                                    const totalCost = unitCost * Number(dispute.quantity ?? 0);
                                                    const isApproved = Boolean(bid.is_approved);
                                                    const canApprove = !isApproved && unitCost > 0;
                                                    const hasInvoice = Boolean(
                                                        bid.invoiced_at || bid.invoice_note || bid.invoice_download_url,
                                                    );
                                                    return (
                                                        <Fragment key={bid.id}>
                                                            <tr>
                                                                <td className="px-3 py-2">{dispute.id}</td>
                                                                <td className="px-3 py-2 font-semibold text-gray-800 dark:text-gray-100">
                                                                    {bid.supplier?.name ?? '--'}
                                                                </td>
                                                                <td className="px-3 py-2">{dispute.product_name}</td>
                                                                <td className="px-3 py-2 text-right">{dispute.quantity}</td>
                                                                <td className="px-3 py-2 text-right">
                                                                    {formatCurrency(totalCost)} ({formatCurrency(unitCost)})
                                                                </td>
                                                                <td className="px-3 py-2 text-center">
                                                                    <div className="flex flex-wrap justify-center gap-2">
                                                                        {isApproved && (
                                                                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-700">
                                                                                Aprovado
                                                                            </span>
                                                                        )}
                                                                        {canApprove && (
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => handleApproveBid(bid.id)}
                                                                                className="rounded-lg border border-emerald-200 px-3 py-1 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-200 dark:border-emerald-500/60 dark:text-emerald-200 dark:hover:bg-emerald-500/10"
                                                                            >
                                                                                Aprovar
                                                                            </button>
                                                                        )}
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleDeleteBid(bid.id)}
                                                                            className="rounded-lg border border-red-200 px-3 py-1 text-xs font-semibold text-red-600 transition hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-200 dark:border-red-500/60 dark:text-red-300 dark:hover:bg-red-500/10"
                                                                        >
                                                                            Excluir
                                                                        </button>
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                            {hasInvoice && (
                                                                <tr>
                                                                    <td colSpan={6} className="bg-emerald-50 px-4 py-3">
                                                                        <div className="flex flex-wrap items-center gap-4 text-xs text-emerald-900">
                                                                            <span className="font-semibold">
                                                                                Faturacao: {formatDate(bid.invoiced_at)}
                                                                            </span>
                                                                            {bid.invoice_note && (
                                                                                <span>
                                                                                    Observacao: {bid.invoice_note}
                                                                                </span>
                                                                            )}
                                                                            {bid.invoice_download_url && (
                                                                                <a
                                                                                    href={bid.invoice_download_url}
                                                                                    target="_blank"
                                                                                    rel="noreferrer"
                                                                                    className="font-semibold text-emerald-700 underline"
                                                                                >
                                                                                    Baixar boleto
                                                                                </a>
                                                                            )}
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                            )}
                                                        </Fragment>
                                                    );
                                                })}
                                            </Fragment>
                                        ))}
                                    </tbody>
                                </table>
                            ) : (
                                <p className="text-sm text-gray-500 dark:text-gray-300">
                                    Nenhuma disputa cadastrada.
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
