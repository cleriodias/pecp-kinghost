import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { formatBrazilDateTime } from '@/Utils/date';
import { buildReceiptHtml } from '@/Utils/receipt';
import { Head, useForm } from '@inertiajs/react';
import { useState } from 'react';

const PAYMENT_LABELS = {
    dinheiro: 'Dinheiro',
    maquina: 'Maquina',
    vale: 'Vale',
    refeicao: 'Refeicao',
    faturar: 'Faturar',
};

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

const escapeHtml = (value) =>
    String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

const buildValeSummaryHtml = (rows, totalAmount) => {
    const printedAt = formatDateTime(new Date());
    const rowsHtml = rows
        .map(
            (row) => `
                <div class="sale-row">
                    <div class="sale-head">
                        <span>ID ${escapeHtml(`#${row.id}`)}</span>
                        <span>${escapeHtml(formatCurrency(row.total))}</span>
                    </div>
                    <div class="sale-date">${escapeHtml(formatDateTime(row.date_time))}</div>
                    <div class="sale-user">Funcionario: ${escapeHtml(row.vale_user ?? '--')}</div>
                </div>
            `,
        )
        .join('');

    return `
        <!DOCTYPE html>
        <html>
            <head>
                <meta charset="utf-8" />
                <title>Compras no vale</title>
                <style>
                    * { font-family: 'Courier New', monospace; box-sizing: border-box; }
                    body { width: 80mm; margin: 0 auto; padding: 12px; color: #111827; }
                    h1 { margin: 0; text-align: center; font-size: 16px; }
                    p { margin: 4px 0; font-size: 12px; }
                    .divider { border-top: 1px dashed #000; margin: 10px 0; }
                    .meta { text-align: center; }
                    .table-head,
                    .sale-head,
                    .total-row { display: flex; justify-content: space-between; gap: 8px; }
                    .table-head,
                    .total-row { font-size: 12px; font-weight: bold; }
                    .sale-row { padding: 6px 0; border-bottom: 1px dashed #d1d5db; }
                    .sale-head { font-size: 12px; font-weight: bold; }
                    .sale-date { margin-top: 2px; font-size: 11px; }
                    .sale-user { margin-top: 2px; font-size: 11px; }
                    .total-row { font-size: 14px; }
                </style>
            </head>
            <body>
                <h1>Compras no vale</h1>
                <p class="meta">${rows.length} registro(s)</p>
                <p class="meta">Impresso em: ${escapeHtml(printedAt)}</p>
                <div class="divider"></div>
                <div class="table-head">
                    <span>ID / Data-Hora / Funcionario</span>
                    <span>Valor</span>
                </div>
                <div class="divider"></div>
                ${rowsHtml || '<p>Nenhum registro para imprimir.</p>'}
                <div class="divider"></div>
                <div class="total-row">
                    <span>Total</span>
                    <span>${escapeHtml(formatCurrency(totalAmount))}</span>
                </div>
            </body>
        </html>
    `;
};

export default function ValeReport({
    rows = [],
    startDate,
    endDate,
    unit,
    filterUnits = [],
    filterUsers = [],
    selectedUnitId = null,
    selectedUserId = null,
}) {
    const { data, setData, get, processing } = useForm({
        start_date: startDate ?? '',
        end_date: endDate ?? '',
        unit_id:
            selectedUnitId !== null && selectedUnitId !== undefined
                ? String(selectedUnitId)
                : 'all',
        user_id:
            selectedUserId !== null && selectedUserId !== undefined
                ? String(selectedUserId)
                : 'all',
    });
    const [selectedReceipt, setSelectedReceipt] = useState(null);
    const [printError, setPrintError] = useState('');

    const handleSubmit = (event) => {
        event.preventDefault();
        get(route('reports.vale'), {
            preserveState: true,
            preserveScroll: true,
            replace: true,
            data,
        });
    };

    const handlePrint = (receipt) => {
        setPrintError('');

        const printWindow = window.open('', '_blank', 'width=400,height=600');

        if (!printWindow) {
            setPrintError('Permita pop-ups para imprimir o cupom.');
            return;
        }

        printWindow.document.write(buildReceiptHtml(receipt));
        printWindow.document.close();
        printWindow.focus();
        printWindow.print();
        printWindow.close();
    };

    const handlePrintValeSummary = () => {
        setPrintError('');

        const printWindow = window.open('', '_blank', 'width=400,height=600');

        if (!printWindow) {
            setPrintError('Permita pop-ups para imprimir os vales.');
            return;
        }

        printWindow.document.write(buildValeSummaryHtml(rows, totalAmount));
        printWindow.document.close();
        printWindow.focus();
        printWindow.print();
        printWindow.close();
    };

    const totalAmount = rows.reduce((sum, row) => sum + (Number(row.total) || 0), 0);

    return (
        <AuthenticatedLayout
            header={
                <div>
                    <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">
                        Relatorio Vales
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-300">
                        Compras feitas no vale. Unidade atual: {unit?.name ?? '---'}.
                    </p>
                </div>
            }
        >
            <Head title="Relatorio Vales" />

            <div className="py-8">
                <div className="mx-auto max-w-6xl space-y-6 px-4 sm:px-6 lg:px-8">
                    {printError && (
                        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200">
                            {printError}
                        </div>
                    )}

                    <form
                        onSubmit={handleSubmit}
                        className="rounded-2xl bg-white p-4 shadow dark:bg-gray-800"
                    >
                        <div className="flex flex-wrap items-end gap-3">
                            <div>
                                <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                    Inicio
                                </label>
                                <input
                                    type="date"
                                    value={data.start_date}
                                    onChange={(event) => setData('start_date', event.target.value)}
                                    className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                    Fim
                                </label>
                                <input
                                    type="date"
                                    value={data.end_date}
                                    onChange={(event) => setData('end_date', event.target.value)}
                                    className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                    Unidade
                                </label>
                                <select
                                    value={data.unit_id}
                                    onChange={(event) => setData('unit_id', event.target.value)}
                                    className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                                >
                                    <option value="all">Todas</option>
                                    {filterUnits.map((filterUnit) => (
                                        <option key={filterUnit.id} value={filterUnit.id}>
                                            {filterUnit.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                    Usuario
                                </label>
                                <select
                                    value={data.user_id}
                                    onChange={(event) => setData('user_id', event.target.value)}
                                    className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                                >
                                    <option value="all">Todos</option>
                                    {filterUsers.map((filterUser) => (
                                        <option key={filterUser.id} value={filterUser.id}>
                                            {filterUser.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <button
                                type="submit"
                                disabled={processing}
                                className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-700 disabled:opacity-60"
                            >
                                Filtrar
                            </button>
                        </div>
                    </form>

                    <div className="rounded-2xl bg-white p-6 shadow dark:bg-gray-800">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                                Compras no vale
                            </h3>
                            <div className="flex flex-wrap items-center gap-3">
                                <button
                                    type="button"
                                    onClick={handlePrintValeSummary}
                                    disabled={rows.length === 0}
                                    className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    Imprimir Vales
                                </button>
                                <span className="text-xs font-semibold text-gray-500 dark:text-gray-300">
                                    {rows.length} registros
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

                        {rows.length === 0 ? (
                            <p className="mt-4 rounded-xl border border-dashed border-gray-200 px-4 py-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-300">
                                Nenhuma compra no vale para o periodo selecionado.
                            </p>
                        ) : (
                            <div className="mt-4 overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-700">
                                    <thead className="bg-gray-100 dark:bg-gray-900/60">
                                        <tr>
                                            <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">
                                                ID tb4
                                            </th>
                                            <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">
                                                Data/Hora
                                            </th>
                                            <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">
                                                Comanda
                                            </th>
                                            <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">
                                                Itens
                                            </th>
                                            <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-300">
                                                Total
                                            </th>
                                            <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">
                                                Unidade
                                            </th>
                                            <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">
                                                Caixa
                                            </th>
                                            <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">
                                                Usuario Vale
                                            </th>
                                            <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-300">
                                                Cupom
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                        {rows.map((row) => (
                                            <tr key={row.id}>
                                                <td className="px-3 py-2 font-semibold text-gray-800 dark:text-gray-100">
                                                    #{row.id}
                                                </td>
                                                <td className="px-3 py-2 text-gray-700 dark:text-gray-200">
                                                    {formatDateTime(row.date_time)}
                                                </td>
                                                <td className="px-3 py-2 text-gray-700 dark:text-gray-200">
                                                    {row.comanda ?? '--'}
                                                </td>
                                                <td className="px-3 py-2 text-gray-800 dark:text-gray-100">
                                                    <p className="font-medium">{row.items_count} item(ns)</p>
                                                </td>
                                                <td className="px-3 py-2 text-right font-semibold text-gray-900 dark:text-gray-100">
                                                    {formatCurrency(row.total)}
                                                </td>
                                                <td className="px-3 py-2 text-gray-700 dark:text-gray-200">
                                                    {row.unit_name ?? '---'}
                                                </td>
                                                <td className="px-3 py-2 text-gray-700 dark:text-gray-200">
                                                    {row.cashier ?? '--'}
                                                </td>
                                                <td className="px-3 py-2 text-gray-700 dark:text-gray-200">
                                                    {row.vale_user ?? '--'}
                                                </td>
                                                <td className="px-3 py-2 text-right">
                                                    <button
                                                        type="button"
                                                        onClick={() => setSelectedReceipt(row.receipt)}
                                                        className="rounded-xl bg-indigo-600 px-3 py-1 text-xs font-semibold text-white shadow hover:bg-indigo-700"
                                                    >
                                                        Abrir cupom
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {selectedReceipt && (
                <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-4 py-6">
                    <div className="flex max-h-[calc(100vh-3rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-900">
                        <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-6 py-4 dark:border-gray-700">
                            <div>
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                                    Cupom #{selectedReceipt.id}
                                </h3>
                                <p className="text-sm text-gray-500 dark:text-gray-300">
                                    {formatDateTime(selectedReceipt.date_time)}
                                </p>
                                <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                                    Loja: {selectedReceipt.unit_name ?? '---'}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setSelectedReceipt(null)}
                                className="text-sm font-semibold text-gray-500 hover:text-gray-800 dark:text-gray-300 dark:hover:text-white"
                            >
                                Fechar
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto px-6 py-4">
                            <div className="space-y-2 text-sm text-gray-700 dark:text-gray-200">
                                <p>
                                    <span className="font-medium">Pagamento:</span>{' '}
                                    {PAYMENT_LABELS[selectedReceipt.tipo_pago] ?? selectedReceipt.tipo_pago}
                                </p>
                                <p>
                                    <span className="font-medium">Caixa:</span> {selectedReceipt.cashier_name}
                                </p>
                                {selectedReceipt.vale_user_name && (
                                    <p>
                                        <span className="font-medium">Cliente Vale:</span> {selectedReceipt.vale_user_name}
                                    </p>
                                )}
                                <p className="text-lg font-bold text-indigo-600">
                                    Total: {formatCurrency(selectedReceipt.total)}
                                </p>
                            </div>

                            <div className="mt-6 rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/40">
                                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                                    Itens
                                </h4>
                                <div className="mt-3 space-y-3 text-sm">
                                    {(selectedReceipt.items || []).map((item) => (
                                        <div
                                            key={item.id}
                                            className="flex items-center justify-between rounded-xl bg-white/80 px-3 py-2 shadow-sm dark:bg-gray-800/70"
                                        >
                                            <div>
                                                <p className="font-medium text-gray-900 dark:text-gray-100">
                                                    {item.quantity}x {item.product_name}
                                                </p>
                                                <p className="text-xs text-gray-500 dark:text-gray-300">
                                                    {formatCurrency(item.unit_price)} cada
                                                </p>
                                                {item.comanda && (
                                                    <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                                                        Comanda: {item.comanda}
                                                    </p>
                                                )}
                                            </div>
                                            <p className="font-semibold text-gray-900 dark:text-gray-100">
                                                {formatCurrency(item.subtotal)}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4 dark:border-gray-700">
                            <button
                                type="button"
                                onClick={() => setSelectedReceipt(null)}
                                className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
                            >
                                Fechar
                            </button>
                            <button
                                type="button"
                                onClick={() => handlePrint(selectedReceipt)}
                                className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-700"
                            >
                                Imprimir
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </AuthenticatedLayout>
    );
}
