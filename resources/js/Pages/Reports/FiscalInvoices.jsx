import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import {
    formatBrazilTime,
} from '@/Utils/date';
import { buildFiscalReceiptHtml } from '@/Utils/receipt';
import { Head, useForm } from '@inertiajs/react';
import { useState } from 'react';

const STATUS_CLASS = {
    Assinada: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200',
    Erro: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200',
    Emitida: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200',
};

const formatCurrency = (value) =>
    Number(value ?? 0).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });

const parseDateParts = (value) => {
    if (!value) {
        return null;
    }

    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);

    if (!match) {
        return null;
    }

    return {
        day: match[3],
        month: match[2],
    };
};

const formatDateTime = (value) => {
    const parts = parseDateParts(value);

    return parts ? `${parts.day}/${parts.month} ${formatBrazilTime(value)}` : '--';
};

const statusClassName = (label) =>
    `inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${
        STATUS_CLASS[label] ?? 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100'
    }`;

const PAYMENT_META = {
    dinheiro: { label: 'Dinheiro', icon: 'bi-cash-coin', className: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200' },
    dinheiro_cartao_credito: { label: 'Dinheiro + Cartao credito', icon: 'bi-cash-stack', className: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200' },
    dinheiro_cartao_debito: { label: 'Dinheiro + Cartao debito', icon: 'bi-cash-stack', className: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200' },
    dinheiro_pix: { label: 'Dinheiro + Pix', icon: 'bi-cash-stack', className: 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-500/30 dark:bg-cyan-500/10 dark:text-cyan-200' },
    maquina: { label: 'Cartao', icon: 'bi-credit-card', className: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200' },
    cartao_credito: { label: 'Cartao credito', icon: 'bi-credit-card', className: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200' },
    cartao_debito: { label: 'Cartao debito', icon: 'bi-credit-card-2-front', className: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200' },
    vale: { label: 'Vale', icon: 'bi-ticket-perforated', className: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200' },
    refeicao: { label: 'Refeicao', icon: 'bi-cup-straw', className: 'border-yellow-200 bg-yellow-50 text-yellow-800 dark:border-yellow-500/30 dark:bg-yellow-500/10 dark:text-yellow-100' },
    faturar: { label: 'Faturar', icon: 'bi-journal-text', className: 'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100' },
};

const PaymentIcon = ({ type }) => {
    const meta = PAYMENT_META[type] ?? { label: type || 'Pagamento nao informado', icon: 'bi-question-circle', className: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100' };

    return (
        <span
            className={`inline-flex h-9 w-9 items-center justify-center rounded-full border text-base ${meta.className}`}
            title={meta.label}
            aria-label={meta.label}
        >
            <i className={`bi ${meta.icon}`} aria-hidden="true"></i>
        </span>
    );
};

export default function FiscalInvoicesReport({
    rows = [],
    startDate,
    endDate,
    unit,
    filterUnits = [],
    selectedUnitId = null,
    selectedStatus = 'all',
    statusOptions = [],
}) {
    const [printError, setPrintError] = useState('');
    const { data, setData, get, processing } = useForm({
        start_date: startDate ?? '',
        end_date: endDate ?? '',
        unit_id:
            selectedUnitId !== null && selectedUnitId !== undefined
                ? String(selectedUnitId)
                : 'all',
        status: selectedStatus ?? 'all',
    });

    const totalAmount = rows.reduce((sum, row) => sum + (Number(row.total) || 0), 0);

    const handleSubmit = (event) => {
        event.preventDefault();

        get(route('reports.notas-fiscais-emitidas'), {
            preserveState: true,
            preserveScroll: true,
            replace: true,
            data: {
                start_date: data.start_date || undefined,
                end_date: data.end_date || undefined,
                unit_id: data.unit_id,
                status: data.status,
            },
        });
    };

    const handlePrintFiscalReceipt = (row) => {
        setPrintError('');

        if (!row?.fiscal_receipt) {
            setPrintError('Nao foi possivel montar os dados do cupom fiscal desta nota.');
            return;
        }

        const printWindow = window.open('', '_blank', 'width=400,height=600');

        if (!printWindow) {
            setPrintError('Permita pop-ups para imprimir o cupom fiscal.');
            return;
        }

        printWindow.document.write(buildFiscalReceiptHtml(row.fiscal_receipt));
        printWindow.document.close();
    };

    return (
        <AuthenticatedLayout
            header={
                <div>
                    <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">
                        Notas Fiscais Emitidas
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-300">
                        Relatorio de notas fiscais por loja, situacao e periodo. Unidade atual: {unit?.name ?? '---'}.
                    </p>
                </div>
            }
        >
            <Head title="Notas Fiscais Emitidas" />

            <div className="py-8">
                <div className="mx-auto max-w-7xl space-y-6 px-4 sm:px-6 lg:px-8">
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
                                    Loja
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
                                    Situacao
                                </label>
                                <select
                                    value={data.status}
                                    onChange={(event) => setData('status', event.target.value)}
                                    className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                                >
                                    {statusOptions.map((option) => (
                                        <option key={option.value} value={option.value}>
                                            {option.label}
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
                            <div>
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                                    Notas fiscais
                                </h3>
                                <p className="text-sm text-gray-500 dark:text-gray-300">
                                    A data do filtro considera a criacao do registro fiscal.
                                </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-3">
                                <span className="text-xs font-semibold text-gray-500 dark:text-gray-300">
                                    {rows.length} registro(s)
                                </span>
                                <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-indigo-700 shadow-sm dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-200">
                                    <p className="text-[10px] font-semibold uppercase tracking-wide">
                                        Total filtrado
                                    </p>
                                    <p className="text-sm font-bold">
                                        {formatCurrency(totalAmount)}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {printError && (
                            <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
                                {printError}
                            </p>
                        )}

                        {rows.length === 0 ? (
                            <p className="mt-4 rounded-xl border border-dashed border-gray-200 px-4 py-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-300">
                                Nenhuma nota fiscal para os filtros selecionados.
                            </p>
                        ) : (
                            <div className="mt-4 overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-700">
                                    <thead className="bg-gray-100 dark:bg-gray-900/60">
                                        <tr>
                                            <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">I.D</th>
                                            <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">Situacao</th>
                                            <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">M.S.N</th>
                                            <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">Criada em</th>
                                            <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">Emitida em</th>
                                            <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-300">Valor</th>
                                            <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">Pagamento</th>
                                            <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">Caixa</th>
                                            <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">SEFAZ</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                        {rows.map((row) => (
                                            <tr key={row.id}>
                                                <td className="px-3 py-3 text-gray-700 dark:text-gray-200">
                                                    <div className="flex flex-col gap-0.5">
                                                        <span className="font-semibold text-gray-900 dark:text-gray-100">
                                                            #{row.payment_id}
                                                        </span>
                                                        <span className="text-xs text-gray-500 dark:text-gray-300">
                                                            {row.unit_name ?? '--'}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-3 py-3">
                                                    <span className={statusClassName(row.status_label)}>
                                                        {row.status_label ?? '--'}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-3 text-gray-700 dark:text-gray-200">
                                                    <div className="flex flex-col gap-0.5">
                                                        <span className="font-semibold uppercase text-gray-900 dark:text-gray-100">
                                                            {String(row.modelo ?? '').toUpperCase() || '--'}
                                                        </span>
                                                        <span className="text-xs text-gray-500 dark:text-gray-300">
                                                            {row.serie || row.numero ? `${row.serie ?? '--'}/${row.numero ?? '--'}` : '--'}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-3 py-3 text-gray-700 dark:text-gray-200">
                                                    {formatDateTime(row.created_at)}
                                                </td>
                                                <td className="px-3 py-3 text-gray-700 dark:text-gray-200">
                                                    {formatDateTime(row.issued_at)}
                                                </td>
                                                <td className="px-3 py-3 text-right">
                                                    <button
                                                        type="button"
                                                        onClick={() => handlePrintFiscalReceipt(row)}
                                                        className="inline-flex items-center justify-end gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700 shadow-sm transition hover:border-indigo-300 hover:bg-indigo-100 focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-200 dark:hover:bg-indigo-500/20"
                                                        title="Imprimir cupom fiscal"
                                                    >
                                                        <i className="bi bi-printer" aria-hidden="true"></i>
                                                        {formatCurrency(row.total)}
                                                    </button>
                                                </td>
                                                <td className="px-3 py-3 text-gray-700 dark:text-gray-200">
                                                    <PaymentIcon type={row.payment_type} />
                                                </td>
                                                <td className="px-3 py-3 text-gray-700 dark:text-gray-200">
                                                    {row.cashier ?? '--'}
                                                </td>
                                                <td className="min-w-[22rem] px-3 py-3 text-gray-700 dark:text-gray-200">
                                                    <div className="space-y-1">
                                                        <p className="break-all font-mono text-[11px]">
                                                            <span className="font-semibold text-gray-500 dark:text-gray-400">Chave: </span>
                                                            {row.access_key ?? '--'}
                                                        </p>
                                                        <p className="text-xs">
                                                            <span className="font-semibold text-gray-500 dark:text-gray-400">Protocolo: </span>
                                                            {row.protocol ?? '--'}
                                                        </p>
                                                        <p className="text-xs">
                                                            <span className="font-semibold text-gray-500 dark:text-gray-400">Mensagem: </span>
                                                            {row.message ?? row.items_label ?? '--'}
                                                        </p>
                                                    </div>
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
        </AuthenticatedLayout>
    );
}
