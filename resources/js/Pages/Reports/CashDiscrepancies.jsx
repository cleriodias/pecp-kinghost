import Modal from '@/Components/Modal';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, Link, useForm } from '@inertiajs/react';
import { useMemo, useState } from 'react';

const paymentColumns = [
    { key: 'maquina', label: 'Cartao' },
    { key: 'dinheiro', label: 'Dinheiro' },
    { key: 'vale', label: 'Vale' },
    { key: 'refeicao', label: 'Refeicao' },
    { key: 'faturar', label: 'Fatura' },
];

const systemDetailColumns = [
    { key: 'dinheiro', label: 'Dinheiro' },
    { key: 'maquina', label: 'Cartao' },
    { key: 'vale', label: 'Vale' },
    { key: 'refeicao', label: 'Refeicao' },
    { key: 'faturar', label: 'Fatura' },
];

const formatCurrency = (value) =>
    Number(value ?? 0).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });

const shortDateFormatter = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
});

const shortDateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
});

const DATE_ONLY_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_TIME_REGEX = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/;

const parseDateValue = (value) => {
    if (!value) {
        return null;
    }

    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value;
    }

    if (typeof value !== 'string') {
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    const normalized = value.trim();

    if (normalized === '') {
        return null;
    }

    const dateOnlyMatch = normalized.match(DATE_ONLY_REGEX);
    if (dateOnlyMatch) {
        return new Date(
            Date.UTC(
                Number(dateOnlyMatch[1]),
                Number(dateOnlyMatch[2]) - 1,
                Number(dateOnlyMatch[3]),
                12,
                0,
                0,
            ),
        );
    }

    const dateTimeMatch = normalized.match(DATE_TIME_REGEX);
    if (dateTimeMatch) {
        return new Date(
            Date.UTC(
                Number(dateTimeMatch[1]),
                Number(dateTimeMatch[2]) - 1,
                Number(dateTimeMatch[3]),
                Number(dateTimeMatch[4]) + 3,
                Number(dateTimeMatch[5]),
                Number(dateTimeMatch[6] ?? 0),
            ),
        );
    }

    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDate = (value) => {
    const date = parseDateValue(value);

    if (!date) {
        return '--';
    }

    return shortDateFormatter.format(date);
};

const formatDateTime = (value) => {
    const date = parseDateValue(value);

    if (!date) {
        return '--';
    }

    return shortDateTimeFormatter.format(date);
};

const differenceTone = (value) => {
    if (Math.abs(value ?? 0) < 0.005) {
        return 'text-gray-700 dark:text-gray-200';
    }
    return (value ?? 0) > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400';
};

const systemCashBase = (record) =>
    Number(
        record?.conference_base_total ??
            (Number(record?.conference_base_cash) || 0) + (Number(record?.totals?.maquina) || 0),
    );

export default function CashDiscrepancies({
    records = [],
    dateValue = '',
    filterUnits = [],
    cashiers = [],
    selectedUnitId = null,
    selectedCashierId = null,
}) {
    const { data, setData, get, processing } = useForm({
        date: dateValue ?? '',
        unit_id:
            selectedUnitId !== null && selectedUnitId !== undefined
                ? String(selectedUnitId)
                : 'all',
        cashier_id:
            selectedCashierId !== null && selectedCashierId !== undefined
                ? String(selectedCashierId)
                : 'all',
    });
    const [detailModal, setDetailModal] = useState({
        open: false,
        record: null,
    });

    const handleSubmit = (event) => {
        event.preventDefault();
        get(route('reports.cash.discrepancies'), {
            preserveState: true,
            preserveScroll: true,
            replace: true,
            data,
        });
    };

    const totalDiscrepancy = useMemo(
        () =>
            records.reduce(
                (sum, record) => sum + Math.max(Number(record.discrepancy) || 0, 0),
                0,
            ),
        [records],
    );

    const totalSurplus = useMemo(
        () =>
            records.reduce((sum, record) => {
                const discrepancy = Number(record.discrepancy) || 0;
                return sum + Math.abs(Math.min(discrepancy, 0));
            }, 0),
        [records],
    );

    const tableTotals = useMemo(() => {
        return records.reduce(
            (acc, record) => {
                const next = { ...acc };

                next.discrepancy += Number(record.discrepancy) || 0;

                paymentColumns.forEach((column) => {
                    next.totals[column.key] += Number(record.totals?.[column.key] ?? 0);
                });

                return next;
            },
            {
                discrepancy: 0,
                totals: paymentColumns.reduce(
                    (acc, column) => ({
                        ...acc,
                        [column.key]: 0,
                    }),
                    {},
                ),
            },
        );
    }, [records]);

    const openDetails = (record) => {
        setDetailModal({
            open: true,
            record,
        });
    };

    const closeDetails = () => {
        setDetailModal({
            open: false,
            record: null,
        });
    };

    const valeShortcutParams = {
        start_date: data.date,
        end_date: data.date,
        unit_id: data.unit_id,
    };

    return (
        <AuthenticatedLayout
            header={
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">
                            Fechamentos com discrepancia
                        </h2>
                        <p className="text-sm text-gray-500 dark:text-gray-300">
                            Fechamentos de caixa com diferencas entre sistema e fechamento. A discrepancia considera somente dinheiro e cartao, com gastos do dia deduzidos do dinheiro.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Link
                            href={route('reports.vale', valeShortcutParams)}
                            className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 shadow-sm transition hover:bg-indigo-100 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-200"
                            aria-label="Atalho para relatorio de vales"
                        >
                            <i className="bi bi-exclamation-triangle" aria-hidden="true"></i>
                            <span>Vales</span>
                        </Link>
                    </div>
                </div>
            }
        >
            <Head title="Fechamentos com discrepancia" />

            <div className="py-8">
                <div className="mx-auto max-w-6xl space-y-6 px-4 sm:px-6 lg:px-8">
                    <form
                        onSubmit={handleSubmit}
                        className="rounded-2xl bg-white p-4 shadow dark:bg-gray-800"
                    >
                        <div className="flex flex-wrap items-end gap-3">
                            <div>
                                <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                    Data
                                </label>
                                <input
                                    type="date"
                                    value={data.date}
                                    onChange={(event) => setData('date', event.target.value)}
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
                                    {filterUnits.map((unit) => (
                                        <option key={unit.id} value={unit.id}>
                                            {unit.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                    Caixa responsavel
                                </label>
                                <select
                                    value={data.cashier_id}
                                    onChange={(event) => setData('cashier_id', event.target.value)}
                                    className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                                >
                                    <option value="all">Todos</option>
                                    {cashiers.map((cashier) => (
                                        <option key={cashier.id} value={cashier.id}>
                                            {cashier.name}
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
                                Fechamentos com discrepancia
                            </h3>
                            <div className="flex flex-wrap items-center gap-3">
                                <span className="text-xs font-semibold text-gray-500 dark:text-gray-300">
                                    {records.length} registros
                                </span>
                                <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-indigo-700 shadow-sm dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-200">
                                    <p className="text-[10px] font-semibold uppercase tracking-wide">
                                        Total discrepancia
                                    </p>
                                    <p className="text-sm font-bold">
                                        {formatCurrency(totalDiscrepancy)}
                                    </p>
                                </div>
                                <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-emerald-700 shadow-sm dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
                                    <p className="text-[10px] font-semibold uppercase tracking-wide">
                                        Total sobra
                                    </p>
                                    <p className="text-sm font-bold">
                                        {formatCurrency(totalSurplus)}
                                    </p>
                                </div>
                            </div>
                        </div>
                        <p className="mt-3 text-sm text-gray-500 dark:text-gray-300">
                            O valor do sistema usado na discrepancia soma apenas dinheiro e cartao, com gastos do dia deduzidos do dinheiro. Vale, refeicao e fatura permanecem exibidos apenas para conferencia das vendas.
                        </p>

                        {records.length === 0 ? (
                            <p className="mt-4 rounded-xl border border-dashed border-gray-200 px-4 py-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-300">
                                Nenhum fechamento com discrepancia para a data selecionada.
                            </p>
                        ) : (
                            <div className="mt-4 overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-700">
                                    <thead className="bg-gray-100 dark:bg-gray-900/60">
                                        <tr>
                                            <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">
                                                Fechamento
                                            </th>
                                            <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">
                                                Referencia
                                            </th>
                                            <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">
                                               Caixa / Unid.
                                            </th>
                                            <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-300">
                                                Discrepancia
                                            </th>
                                            {paymentColumns.map((column) => (
                                                <th
                                                    key={`header-${column.key}`}
                                                    className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-300"
                                                >
                                                    {column.label}
                                                </th>
                                            ))}
                                            <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-300">
                                                Acoes
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                        {records.map((record) => {
                                            const rowKey = `${record.id}-${record.cashier_id}-${record.unit_id ?? 'none'}`;
                                            const discrepancyClass = differenceTone(record.discrepancy);

                                            return (
                                                <tr key={rowKey}>
                                                    <td className="px-3 py-2 text-gray-700 dark:text-gray-200">
                                                        {formatDateTime(record.closed_at)}
                                                    </td>
                                                    <td className="px-3 py-2 text-gray-700 dark:text-gray-200">
                                                        {formatDate(record.closed_date)}
                                                    </td>
                                                    <td className="px-3 py-2 text-gray-800 dark:text-gray-100">
                                                        {record.cashier_name}: {record.unit_name ?? '---'}
                                                    </td>
                                                    <td className={`px-3 py-2 text-right font-semibold ${discrepancyClass}`}>
                                                        {formatCurrency(record.discrepancy)}
                                                    </td>
                                                    {paymentColumns.map((column) => (
                                                        <td
                                                            key={`${rowKey}-${column.key}`}
                                                            className="px-3 py-2 text-right text-gray-700 dark:text-gray-200"
                                                        >
                                                            {formatCurrency(record.totals?.[column.key] ?? 0)}
                                                        </td>
                                                    ))}
                                                    <td className="px-3 py-2 text-right">
                                                        <button
                                                            type="button"
                                                            onClick={() => openDetails(record)}
                                                            className="rounded-full border border-indigo-200 px-3 py-1 text-xs font-semibold text-indigo-700 transition hover:border-indigo-300 hover:bg-indigo-50 dark:border-indigo-500/40 dark:text-indigo-200 dark:hover:bg-indigo-900/30"
                                                        >
                                                            Detalhar
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        <tr className="bg-gray-50/80 dark:bg-gray-900/40">
                                            <td className="px-3 py-3 text-gray-800 dark:text-gray-100" colSpan={3}>
                                                <span className="font-semibold">Total geral</span>
                                            </td>
                                            <td
                                                className={`px-3 py-3 text-right font-semibold ${differenceTone(
                                                    tableTotals.discrepancy,
                                                )}`}
                                            >
                                                {formatCurrency(tableTotals.discrepancy)}
                                            </td>
                                            {paymentColumns.map((column) => (
                                                <td
                                                    key={`total-${column.key}`}
                                                    className="px-3 py-3 text-right font-semibold text-gray-800 dark:text-gray-100"
                                                >
                                                    {formatCurrency(tableTotals.totals[column.key] ?? 0)}
                                                </td>
                                            ))}
                                            <td className="px-3 py-3 text-right text-gray-500 dark:text-gray-300">
                                                --
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            <Modal show={detailModal.open} onClose={closeDetails} maxWidth="2xl" tone="light">
                <div className="bg-white p-6 text-gray-800">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <h3 className="text-lg font-semibold text-gray-900">
                                Detalhe do fechamento
                            </h3>
                            <p className="text-sm text-gray-500">
                                Valores informados pelo caixa no fechamento.
                            </p>
                        </div>
                    </div>

                    {!detailModal.record ? (
                        <p className="mt-6 text-sm text-gray-500">Nenhum fechamento selecionado.</p>
                    ) : (
                        <div className="mt-6 space-y-6">
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                                    <p className="text-xs font-semibold uppercase text-gray-500">Caixa responsavel</p>
                                    <p className="text-sm font-semibold text-gray-900">
                                        {detailModal.record.cashier_name}
                                    </p>
                                </div>
                                <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                                    <p className="text-xs font-semibold uppercase text-gray-500">Unidade</p>
                                    <p className="text-sm font-semibold text-gray-900">
                                        {detailModal.record.unit_name ?? '---'}
                                    </p>
                                </div>
                                <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                                    <p className="text-xs font-semibold uppercase text-gray-500">Data fechamento</p>
                                    <p className="text-sm font-semibold text-gray-900">
                                        {formatDateTime(detailModal.record.closed_at)}
                                    </p>
                                </div>
                                <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                                    <p className="text-xs font-semibold uppercase text-gray-500">Data referencia</p>
                                    <p className="text-sm font-semibold text-gray-900">
                                        {formatDate(detailModal.record.closed_date)}
                                    </p>
                                </div>
                            </div>

                            <div>
                                <p className="text-xs font-semibold uppercase text-gray-500">Valores do sistema</p>
                                <p className="mt-1 text-sm text-gray-500">
                                    A discrepancia abaixo considera somente dinheiro e cartao, com gastos deduzidos do dinheiro.
                                </p>
                                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                    {systemDetailColumns.map((column) => (
                                        <div
                                            key={`system-${column.key}`}
                                            className="rounded-xl border border-gray-100 bg-white p-4"
                                        >
                                            <p className="text-xs font-semibold uppercase text-gray-500">
                                                {column.label}
                                            </p>
                                            <p className="text-lg font-bold text-gray-900">
                                                {formatCurrency(detailModal.record.totals?.[column.key] ?? 0)}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <p className="text-xs font-semibold uppercase text-gray-500">Base da discrepancia</p>
                                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                    <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                                        <p className="text-xs font-semibold uppercase text-gray-500">
                                            Sistema dinheiro
                                        </p>
                                        <p className="text-lg font-bold text-gray-900">
                                            {formatCurrency(detailModal.record.conference_base_cash ?? 0)}
                                        </p>
                                    </div>
                                    <div className="rounded-xl border border-amber-100 bg-amber-50 p-4">
                                        <p className="text-xs font-semibold uppercase text-amber-700">
                                            Gastos
                                        </p>
                                        <p className="text-lg font-bold text-amber-900">
                                            {formatCurrency(detailModal.record.expense_total ?? 0)}
                                        </p>
                                    </div>
                                    <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                                        <p className="text-xs font-semibold uppercase text-gray-500">
                                            Sistema cartao
                                        </p>
                                        <p className="text-lg font-bold text-gray-900">
                                            {formatCurrency(detailModal.record.totals?.maquina ?? 0)}
                                        </p>
                                    </div>
                                    <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
                                        <p className="text-xs font-semibold uppercase text-emerald-700">
                                            Sistema caixa
                                        </p>
                                        <p className="text-lg font-bold text-emerald-900">
                                            {formatCurrency(systemCashBase(detailModal.record))}
                                        </p>
                                    </div>
                                    <div className="rounded-xl border border-amber-100 bg-amber-50 p-4">
                                        <p className="text-xs font-semibold uppercase text-amber-700">
                                            Diferenca
                                        </p>
                                        <p
                                            className={`text-lg font-bold ${differenceTone(
                                                detailModal.record.discrepancy,
                                            )}`}
                                        >
                                            {formatCurrency(detailModal.record.discrepancy)}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <p className="text-xs font-semibold uppercase text-gray-500">Valores informados</p>
                                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                    <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4">
                                        <p className="text-xs font-semibold uppercase text-indigo-600">
                                            Dinheiro informado
                                        </p>
                                        <p className="text-lg font-bold text-indigo-900">
                                            {formatCurrency(detailModal.record.closure?.cash_amount ?? 0)}
                                        </p>
                                    </div>
                                    <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4">
                                        <p className="text-xs font-semibold uppercase text-indigo-600">
                                            Cartao informado
                                        </p>
                                        <p className="text-lg font-bold text-indigo-900">
                                            {formatCurrency(detailModal.record.closure?.card_amount ?? 0)}
                                        </p>
                                    </div>
                                    <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 sm:col-span-2">
                                        <p className="text-xs font-semibold uppercase text-emerald-700">
                                            Total informado
                                        </p>
                                        <p className="text-xl font-bold text-emerald-900">
                                            {formatCurrency(detailModal.record.closure?.total_amount ?? 0)}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </Modal>
        </AuthenticatedLayout>
    );
}
