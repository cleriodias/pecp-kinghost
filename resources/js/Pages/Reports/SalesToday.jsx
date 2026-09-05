import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { formatBrazilDateTime } from '@/Utils/date';
import { buildReceiptHtml } from '@/Utils/receipt';
import axios from 'axios';
import { Head, Link, router, usePage } from '@inertiajs/react';
import { useMemo, useState } from 'react';

const PAYMENT_LABELS = {
    dinheiro: 'Dinheiro',
    maquina: 'Maquina',
    dinheiro_pix: 'Dinheiro + Pix',
    vale: 'Vale',
    refeicao: 'Refeicao',
    faturar: 'Faturar',
};

const CARD_TEXT_COLORS = {
    dinheiro: '#ffffff',
    maquina: '#ffffff',
    vale: '#ffffff',
    refeicao: '#111827',
    faturar: '#ffffff',
    gastos: '#ffffff',
};

const EXPENSE_CARD = {
    type: 'gastos',
    label: 'Gastos',
    color: '#dc2626',
};

const formatCurrency = (value) =>
    Number(value ?? 0).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });

const formatDate = (value) => {
    if (!value) {
        return '--';
    }

    return formatBrazilDateTime(value);
};

const dayOptions = [
    { id: 'current', label: 'Hoje' },
    { id: 'previous', label: 'Ontem' },
];

const splitRecordsInColumns = (records) => {
    const columns = [[], []];

    records.forEach((record, index) => {
        columns[index % 2].push(record);
    });

    return columns;
};

const resolveErrorMessage = (error, fallback) => {
    if (error?.response?.data?.errors) {
        const first = Object.values(error.response.data.errors).flat()[0];
        if (first) {
            return String(first);
        }
    }

    if (error?.response?.data?.message) {
        return String(error.response.data.message);
    }

    if (error?.message) {
        return String(error.message);
    }

    return fallback;
};

export default function SalesToday({
    meta,
    chartData,
    details,
    totals,
    expenseTotal = 0,
    dateLabel,
    filterUnits = [],
    selectedUnitId = null,
    selectedDay = 'current',
}) {
    const { auth } = usePage().props;
    const isMaster = Number(auth?.user?.funcao ?? -1) === 0;
    const initialType = useMemo(() => {
        const withValue = chartData.find((item) => item.total > 0);
        return withValue?.type ?? 'dinheiro';
    }, [chartData]);

    const [selectedType, setSelectedType] = useState(initialType);
    const [selectedReceipt, setSelectedReceipt] = useState(null);
    const [printError, setPrintError] = useState('');
    const [deleteError, setDeleteError] = useState('');
    const [deletingReceiptId, setDeletingReceiptId] = useState(null);

    const unitOptions = useMemo(() => {
        const base = [{ id: null, name: 'Todas as unidades' }];
        if (!Array.isArray(filterUnits) || filterUnits.length === 0) {
            return base;
        }

        return base.concat(
            filterUnits.map((unit) => ({
                id: unit.id ?? unit.tb2_id ?? null,
                name: unit.name ?? unit.tb2_nome ?? '---',
            })),
        );
    }, [filterUnits]);

    const handleFilterChange = (unitId) => {
        const normalized = unitId ?? null;
        if (normalized === (selectedUnitId ?? null)) {
            return;
        }

        const params = {};
        if (normalized !== null) {
            params.unit_id = normalized;
        }
        if (selectedDay && selectedDay !== 'current') {
            params.day = selectedDay;
        }

        router.get(route('reports.sales.today'), params, { preserveScroll: true });
    };

    const handleDayChange = (day) => {
        if (day === selectedDay) {
            return;
        }

        const params = {};
        if (selectedUnitId !== null && selectedUnitId !== undefined) {
            params.unit_id = selectedUnitId;
        }
        if (day !== 'current') {
            params.day = day;
        }

        router.get(route('reports.sales.today'), params, { preserveScroll: true });
    };

    const totalSum = chartData.reduce((sum, item) => sum + item.total, 0);
    const selectedDetails = details[selectedType] ?? [];
    const selectedMeta = meta[selectedType] ?? { label: selectedType, color: '#111827' };
    const selectedTotal = totals[selectedType] ?? 0;
    const detailColumns = useMemo(() => splitRecordsInColumns(selectedDetails), [selectedDetails]);
    const summaryCards = useMemo(
        () => [
            ...chartData,
            {
                ...EXPENSE_CARD,
                total: Number(expenseTotal ?? 0),
            },
        ],
        [chartData, expenseTotal],
    );

    const pieStyle = useMemo(() => {
        if (totalSum <= 0) {
            return { background: '#e5e7eb' };
        }

        let accumulated = 0;
        const segments = chartData.flatMap((item) => {
            if (item.total <= 0) {
                return [];
            }

            const angle = (item.total / totalSum) * 360;
            const start = accumulated;
            const end = accumulated + angle;
            accumulated = end;

            return [`${item.color} ${start}deg ${end}deg`];
        });

        return {
            background: `conic-gradient(${segments.join(',')})`,
        };
    }, [chartData, totalSum]);

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

    const handleDeleteReceipt = async (receiptId) => {
        if (!isMaster || deletingReceiptId) {
            return;
        }

        const confirmed = window.confirm(`Deseja realmente excluir o cupom #${receiptId}?`);
        if (!confirmed) {
            return;
        }

        setDeleteError('');
        setDeletingReceiptId(receiptId);

        try {
            await axios.delete(route('reports.sales.today.destroy', receiptId));

            if (Number(selectedReceipt?.id ?? 0) === Number(receiptId)) {
                setSelectedReceipt(null);
            }

            router.reload({
                only: [
                    'meta',
                    'chartData',
                    'details',
                    'totals',
                    'dateLabel',
                    'filterUnits',
                    'selectedUnitId',
                    'selectedDay',
                ],
                preserveScroll: true,
                preserveState: true,
            });
        } catch (error) {
            setDeleteError(resolveErrorMessage(error, 'Nao foi possivel excluir o cupom.'));
        } finally {
            setDeletingReceiptId(null);
        }
    };

    const headerContent = (
        <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
                <h2 className="text-xl font-semibold leading-tight text-gray-800 dark:text-gray-200">
                    Vendas de hoje ({dateLabel})
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-300">
                    Visao geral dos pagamentos registrados no dia, com destaque para cada forma de
                    pagamento.
                </p>
            </div>
            <div className="flex items-center gap-2">
                <Link
                    href={route('reports.control')}
                    className="inline-flex items-center justify-center rounded-xl border border-indigo-200 bg-indigo-50 p-2 text-indigo-700 shadow-sm transition hover:bg-indigo-100 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-200"
                    aria-label="Voltar: Controle financeiro"
                    title="Voltar"
                >
                    <i className="bi bi-arrow-left" aria-hidden="true"></i>
                </Link>
                <Link
                    href={route('reports.sales.detailed')}
                    className="inline-flex items-center justify-center rounded-xl border border-indigo-200 bg-indigo-50 p-2 text-indigo-700 shadow-sm transition hover:bg-indigo-100 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-200"
                    aria-label="Avancar: Relatorio detalhado"
                    title="Avancar"
                >
                    <i className="bi bi-arrow-right" aria-hidden="true"></i>
                </Link>
            </div>
        </div>
    );

    return (
        <AuthenticatedLayout header={headerContent}>
            <Head title="Vendas de hoje" />

            <div className="py-12">
                <div className="mx-auto max-w-7xl space-y-8 px-4 sm:px-6 lg:px-8">
                    {printError && (
                        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200">
                            {printError}
                        </div>
                    )}

                    {deleteError && (
                        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200">
                            {deleteError}
                        </div>
                    )}

                    <div className="rounded-2xl bg-white p-6 shadow dark:bg-gray-800">
                        <div className="flex flex-col gap-6">
                            <div className="flex flex-col gap-2">
                                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-gray-400">Periodo</p>
                                <div className="flex flex-wrap gap-2">
                                    {dayOptions.map((option) => {
                                        const isActive = option.id === selectedDay;

                                        return (
                                            <button
                                                type="button"
                                                key={option.id}
                                                onClick={() => handleDayChange(option.id)}
                                                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                                                    isActive
                                                        ? 'bg-indigo-600 text-white shadow'
                                                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200'
                                                }`}
                                            >
                                                {option.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="flex flex-col gap-2">
                                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-gray-400">Unidade</p>
                                <div className="flex flex-wrap gap-2">
                                    {unitOptions.map((unit) => {
                                        const isActive = (unit.id ?? null) === (selectedUnitId ?? null);

                                        return (
                                            <button
                                                type="button"
                                                key={`unit-filter-${unit.id ?? 'all'}`}
                                                onClick={() => handleFilterChange(unit.id)}
                                                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                                                    isActive
                                                        ? 'bg-indigo-600 text-white shadow'
                                                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200'
                                                }`}
                                            >
                                                {unit.name}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="grid gap-6 rounded-2xl bg-white p-6 shadow dark:bg-gray-800 lg:grid-cols-2">
                        <div>
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                                Totais por tipo
                            </h3>
                            <div className="mt-4 grid gap-4 sm:grid-cols-2">
                                {summaryCards.map((item) => (
                                    <div
                                        key={item.type}
                                        className="rounded-2xl border p-4 shadow-sm"
                                        style={{
                                            backgroundColor: item.color,
                                            borderColor: item.color,
                                            color: CARD_TEXT_COLORS[item.type] ?? '#ffffff',
                                        }}
                                    >
                                        <p className="text-sm font-semibold">
                                            {item.label}
                                        </p>
                                        <p className="text-2xl font-bold">
                                            {formatCurrency(item.total)}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="flex flex-col items-center justify-center gap-4">
                            <div className="text-center">
                                <p className="text-sm font-medium text-gray-500 dark:text-gray-300">
                                    Total geral
                                </p>
                                <p className="text-3xl font-bold text-gray-900 dark:text-white">
                                    {formatCurrency(totalSum)}
                                </p>
                            </div>
                            <div className="relative">
                                <div className="absolute inset-0 translate-y-3 rounded-full bg-black/20 blur-2xl" />
                                <div
                                    className="relative flex h-48 w-48 items-center justify-center rounded-full border-[10px] border-white shadow-2xl shadow-indigo-900/30 dark:border-gray-900"
                                    style={{
                                        ...pieStyle,
                                        boxShadow:
                                            'inset 0 12px 24px rgba(255,255,255,0.35), inset 0 -12px 24px rgba(15,23,42,0.4), 0 15px 35px rgba(15,23,42,0.25)',
                                    }}
                                >
                                    <div className="absolute inset-[14%] rounded-full bg-white/70 backdrop-blur dark:bg-gray-900/70" />
                                    <div className="absolute inset-[18%] rounded-full border border-white/40" />
                                </div>
                            </div>
                            <div className="flex flex-wrap justify-center gap-3 text-sm">
                                {chartData.map((item) => (
                                    <div key={item.type} className="flex items-center gap-2">
                                        <span
                                            className="inline-block h-3 w-3 rounded-full"
                                            style={{ backgroundColor: item.color }}
                                        />
                                        <span className="text-gray-600 dark:text-gray-200">
                                            {item.label}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="rounded-2xl bg-white p-6 shadow dark:bg-gray-800">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                                    Detalhes por pagamento
                                </h3>
                                <p className="text-sm text-gray-500 dark:text-gray-300">
                                    Selecione uma forma de pagamento para listar as vendas.
                                </p>
                            </div>
                            <div className="flex flex-wrap gap-3">
                                {chartData.map((item) => (
                                    <button
                                        type="button"
                                        key={item.type}
                                        onClick={() => setSelectedType(item.type)}
                                        className={`rounded-2xl px-4 py-3 text-left text-white shadow transition ${
                                            selectedType === item.type
                                                ? 'ring-2 ring-offset-2 ring-offset-gray-50 dark:ring-offset-gray-800'
                                                : 'opacity-80 hover:opacity-100'
                                        }`}
                                        style={{ backgroundColor: item.color }}
                                    >
                                        <p className="text-[11px] font-semibold uppercase tracking-wide text-white/80">
                                            Total em {item.label}
                                        </p>
                                        <p className="text-lg font-bold leading-tight">
                                            {formatCurrency(item.total)}
                                        </p>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="mt-6">
                            {selectedDetails.length === 0 ? (
                                <p className="rounded-xl border border-dashed border-gray-200 px-4 py-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-300">
                                    Nenhuma venda registrada nesta forma de pagamento hoje.
                                </p>
                            ) : (
                                <div className="grid gap-4 lg:grid-cols-2">
                                    {detailColumns.map((column, columnIndex) => (
                                        <div key={`detail-column-${columnIndex}`} className="space-y-4">
                                            {column.map((record) => (
                                                <div
                                                    key={`${record.tb4_id}-${record.origin}-${record.applied_total}`}
                                                    className="rounded-3xl border border-gray-200 bg-white px-5 py-4 shadow-sm dark:border-gray-700 dark:bg-gray-900/60"
                                                >
                                                    <div className="flex items-center justify-between gap-4">
                                                        <div>
                                                            <p className="text-[15px] font-semibold text-gray-900 dark:text-white">
                                                                Cupom{' '}
                                                                {isMaster ? (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleDeleteReceipt(record.tb4_id)}
                                                                        disabled={deletingReceiptId === record.tb4_id}
                                                                        className="font-bold text-red-600 transition hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                                                                    >
                                                                        #{record.tb4_id}
                                                                    </button>
                                                                ) : (
                                                                    <span className="font-bold text-gray-900 dark:text-white">
                                                                        #{record.tb4_id}
                                                                    </span>
                                                                )}
                                                            </p>
                                                            <p className="text-[15px] text-gray-500 dark:text-gray-300">
                                                                {formatDate(record.created_at)}
                                                            </p>
                                                        </div>
                                                        <div className="text-right">
                                                            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                                                                Valor considerado
                                                            </p>
                                                            <p className="text-2xl font-bold leading-none text-gray-900 dark:text-white">
                                                                {formatCurrency(record.applied_total)}
                                                            </p>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => setSelectedReceipt(record.receipt)}
                                                            className="inline-flex shrink-0 items-center rounded-full border border-gray-200 px-3 py-1 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-100 dark:border-gray-600 dark:text-gray-100"
                                                        >
                                                            Abrir cupom
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
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
                                    {formatDate(selectedReceipt.date_time)}
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
                                        {selectedReceipt.vale_type === 'refeicao' && (
                                            <span className="ml-1 text-xs text-amber-600 dark:text-amber-200">
                                                (Refeicao)
                                            </span>
                                        )}
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
                                            <p className="font-semibold text-gray-900 dark:text-white">
                                                {formatCurrency(item.subtotal)}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-gray-200 px-6 py-4 dark:border-gray-700">
                            <button
                                type="button"
                                onClick={() => handlePrint(selectedReceipt)}
                                className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-700"
                            >
                                Imprimir
                            </button>
                            <button
                                type="button"
                                onClick={() => setSelectedReceipt(null)}
                                className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
                            >
                                Fechar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </AuthenticatedLayout>
    );
}
