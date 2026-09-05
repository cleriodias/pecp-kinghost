import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { formatBrazilDateTime } from '@/Utils/date';
import { Head, Link, useForm } from '@inertiajs/react';
import { useState } from 'react';

const formatCurrency = (value) =>
    Number(value ?? 0).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });

const formatDateTime = (value) => {
    if (!value) {
        return '--';
    }

    return formatBrazilDateTime(value);
};

export default function SalesDetailed({
    payments,
    dateValue,
    unit,
    filterUnits = [],
    selectedUnitId = null,
}) {
    const { data, setData, get, processing } = useForm({
        date: dateValue ?? '',
        unit_id:
            selectedUnitId !== null && selectedUnitId !== undefined
                ? String(selectedUnitId)
                : 'all',
    });
    const [selectedPayment, setSelectedPayment] = useState(null);
    const totalAmount = payments.reduce(
        (sum, payment) => sum + (Number(payment.valor_total) || 0),
        0,
    );

    const handleSubmit = (event) => {
        event.preventDefault();
        get(route('reports.sales.detailed'), {
            preserveState: true,
            preserveScroll: true,
            replace: true,
            data,
        });
    };

    const headerContent = (
        <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
                <h2 className="text-xl font-semibold leading-tight text-gray-800 dark:text-gray-200">
                    Relatorio detalhado
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-300">
                    Filtre um dia e visualize todas as vendas e itens registrados.
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-300">
                    Unidade atual: {unit?.name ?? '---'}.
                </p>
            </div>
            <div className="flex items-center gap-2">
                <Link
                    href={route('reports.sales.today')}
                    className="inline-flex items-center justify-center rounded-xl border border-indigo-200 bg-indigo-50 p-2 text-indigo-700 shadow-sm transition hover:bg-indigo-100 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-200"
                    aria-label="Voltar: Vendas de hoje"
                    title="Voltar"
                >
                    <i className="bi bi-arrow-left" aria-hidden="true"></i>
                </Link>
                <Link
                    href={route('reports.lanchonete')}
                    className="inline-flex items-center justify-center rounded-xl border border-indigo-200 bg-indigo-50 p-2 text-indigo-700 shadow-sm transition hover:bg-indigo-100 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-200"
                    aria-label="Avancar: Relatorio Lanchonete"
                    title="Avancar"
                >
                    <i className="bi bi-arrow-right" aria-hidden="true"></i>
                </Link>
            </div>
        </div>
    );

    return (
        <AuthenticatedLayout header={headerContent}>
            <Head title="Relatorio detalhado" />

            <div className="py-12">
                <div className="mx-auto max-w-7xl space-y-8 px-4 sm:px-6 lg:px-8">
                    <form
                        onSubmit={handleSubmit}
                        className="rounded-2xl bg-white p-6 shadow dark:bg-gray-800"
                    >
                        <div className="grid gap-4 sm:grid-cols-[200px_240px_auto]">
                            <div>
                                <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                    Dia
                                </label>
                                <input
                                    type="date"
                                    value={data.date}
                                    onChange={(event) => setData('date', event.target.value)}
                                    className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-gray-800 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                    Unidade
                                </label>
                                <select
                                    value={data.unit_id}
                                    onChange={(event) => setData('unit_id', event.target.value)}
                                    className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-gray-800 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                                >
                                    <option value="all">Todas</option>
                                    {filterUnits.map((filterUnit) => (
                                        <option key={filterUnit.id} value={filterUnit.id}>
                                            {filterUnit.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex items-end">
                                <button
                                    type="submit"
                                    disabled={processing}
                                    className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-700 disabled:opacity-60"
                                >
                                    Atualizar
                                </button>
                            </div>
                        </div>
                    </form>

                    <div className="rounded-2xl bg-white p-6 shadow dark:bg-gray-800">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                                Vendas do dia
                            </h3>
                            <div className="flex flex-wrap items-center gap-3">
                                <span className="text-xs font-semibold text-gray-500 dark:text-gray-300">
                                    {payments.length} registros
                                </span>
                                <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-indigo-700 shadow-sm dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-200">
                                    <p className="text-[10px] font-semibold uppercase tracking-wide">
                                        Total
                                    </p>
                                    <p className="text-sm font-bold">
                                        {formatCurrency(totalAmount)}
                                    </p>
                                </div>
                            </div>
                        </div>
                        <div className="mt-4 overflow-x-auto">
                            {payments.length === 0 ? (
                                <p className="rounded-xl border border-dashed border-gray-200 px-4 py-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-300">
                                    Nenhum registro encontrado para esta data.
                                </p>
                            ) : (
                                <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-700">
                                    <thead className="bg-gray-100 dark:bg-gray-900/60">
                                        <tr>
                                            <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">
                                                Cupom
                                            </th>
                                            <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">
                                                Data/Hora
                                            </th>
                                            <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">
                                                Tipo
                                            </th>
                                            <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-300">
                                                Total
                                            </th>
                                            <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-300">
                                                Dinheiro recebido
                                            </th>
                                            <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-300">
                                                Troco
                                            </th>
                                            <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-300">
                                                Complemento
                                            </th>
                                            <th className="px-3 py-2 text-right" />
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                        {payments.map((payment) => (
                                            <tr key={payment.tb4_id}>
                                                <td className="px-3 py-2 text-gray-800 dark:text-gray-100">#{payment.tb4_id}</td>
                                                <td className="px-3 py-2 text-gray-700 dark:text-gray-200">
                                                    {formatDateTime(payment.created_at)}
                                                </td>
                                                <td className="px-3 py-2 text-gray-700 dark:text-gray-200">
                                                    {payment.tipo_pagamento}
                                                </td>
                                                <td className="px-3 py-2 text-right font-semibold text-gray-900 dark:text-white">
                                                    {formatCurrency(payment.valor_total)}
                                                </td>
                                                <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-200">
                                                    {payment.valor_pago ? formatCurrency(payment.valor_pago) : '--'}
                                                </td>
                                                <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-200">
                                                    {payment.troco ? formatCurrency(payment.troco) : '--'}
                                                </td>
                                                <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-200">
                                                    {payment.dois_pgto ? formatCurrency(payment.dois_pgto) : '--'}
                                                </td>
                                                <td className="px-3 py-2 text-right">
                                                    <button
                                                        type="button"
                                                        onClick={() => setSelectedPayment(payment)}
                                                        className="rounded-xl bg-indigo-600 px-3 py-1 text-xs font-semibold text-white shadow hover:bg-indigo-700"
                                                    >
                                                        Itens
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {selectedPayment && (
                <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-4 py-6">
                    <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-900">
                        <div className="flex items-start justify-between">
                            <div>
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                                    Cupom #{selectedPayment.tb4_id}
                                </h3>
                                <p className="text-sm text-gray-500 dark:text-gray-300">
                                    {formatDateTime(selectedPayment.created_at)}
                                </p>
                                {selectedPayment.items?.[0]?.id_comanda && (
                                    <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                                        Comanda: {selectedPayment.items[0].id_comanda}
                                    </p>
                                )}
                            </div>
                            <button
                                type="button"
                                onClick={() => setSelectedPayment(null)}
                                className="text-gray-500 hover:text-gray-800 dark:text-gray-300 dark:hover:text-white"
                            >
                                Fechar
                            </button>
                        </div>

                        <div className="mt-4 space-y-2 text-sm text-gray-700 dark:text-gray-200">
                            <p>
                                <span className="font-medium">Tipo:</span> {selectedPayment.tipo_pagamento}
                            </p>
                            <p>
                                <span className="font-medium">Total:</span> {formatCurrency(selectedPayment.valor_total)}
                            </p>
                            {selectedPayment.valor_pago && (
                                <p>
                                    <span className="font-medium">Valor pago:</span> {formatCurrency(selectedPayment.valor_pago)}
                                </p>
                            )}
                            {selectedPayment.troco && (
                                <p>
                                    <span className="font-medium">Troco:</span> {formatCurrency(selectedPayment.troco)}
                                </p>
                            )}
                            {selectedPayment.dois_pgto && (
                                <p>
                                    <span className="font-medium">
                                        {selectedPayment.tipo_pagamento === 'dinheiro_pix' ? 'Pix' : 'Cartao'} (compl.):
                                    </span>{' '}
                                    {formatCurrency(selectedPayment.dois_pgto)}
                                </p>
                            )}
                        </div>

                        <div className="mt-6 rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/40">
                            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Itens</h4>
                            <div className="mt-3 space-y-3 text-sm">
                                {selectedPayment.items.map((item) => (
                                    <div
                                        key={item.tb3_id}
                                        className="flex items-center justify-between rounded-xl bg-white/80 px-3 py-2 shadow-sm dark:bg-gray-800/70"
                                    >
                                        <div>
                                            <p className="font-medium text-gray-900 dark:text-gray-100">
                                                {item.quantidade}x {item.produto_nome}
                                            </p>
                                            <p className="text-xs text-gray-500 dark:text-gray-300">
                                                {formatCurrency(item.valor_unitario)} cada
                                            </p>
                                            {item.lanc_user_name && (
                                                <p className="text-xs font-semibold text-gray-600 dark:text-gray-200">
                                                    {item.lanc_user_name}
                                                </p>
                                            )}
                                        </div>
                                        <p className="font-semibold text-gray-900 dark:text-gray-100">
                                            {formatCurrency(item.valor_total)}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </AuthenticatedLayout>
    );
}
