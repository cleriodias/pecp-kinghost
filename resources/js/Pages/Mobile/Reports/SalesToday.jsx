import MobileLayout from '@/Layouts/MobileLayout';
import { formatBrazilDateTime } from '@/Utils/date';
import { Head, router, usePage } from '@inertiajs/react';
import { useMemo, useState } from 'react';

const formatCurrency = (value) =>
    Number(value ?? 0).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });

const dayOptions = [
    { id: 'current', label: 'Hoje' },
    { id: 'previous', label: 'Ontem' },
];

export default function SalesToday({
    meta = {},
    chartData = [],
    details = {},
    totals = {},
    expenseTotal = 0,
    dateLabel = '',
    filterUnits = [],
    selectedUnitId = null,
    selectedDay = 'current',
}) {
    const { auth } = usePage().props;
    const isMaster = Number(auth?.user?.funcao ?? -1) === 0;
    const [selectedType, setSelectedType] = useState(
        chartData.find((item) => Number(item.total ?? 0) > 0)?.type ?? chartData[0]?.type ?? 'dinheiro',
    );
    const [selectedReceipt, setSelectedReceipt] = useState(null);

    const selectedDetails = details[selectedType] ?? [];
    const selectedMeta = meta[selectedType] ?? { label: selectedType, color: '#111827' };
    const selectedTotal = totals[selectedType] ?? 0;
    const totalSum = useMemo(
        () => chartData.reduce((sum, item) => sum + Number(item.total ?? 0), 0),
        [chartData],
    );
    const unitOptions = useMemo(() => [{ id: null, name: 'Todas as unidades' }, ...filterUnits], [filterUnits]);

    const applyFilters = (params) => {
        router.get(route('mobile.reports.sales.today'), params, {
            preserveScroll: true,
            preserveState: true,
            replace: true,
        });
    };

    const handleDayChange = (day) => {
        const params = {};

        if (selectedUnitId !== null && selectedUnitId !== undefined) {
            params.unit_id = selectedUnitId;
        }

        if (day !== 'current') {
            params.day = day;
        }

        applyFilters(params);
    };

    const handleUnitChange = (event) => {
        const unitId = event.target.value;
        const params = {};

        if (unitId !== 'all' && unitId !== '') {
            params.unit_id = unitId;
        }

        if (selectedDay !== 'current') {
            params.day = selectedDay;
        }

        applyFilters(params);
    };

    return (
        <MobileLayout
            title="Vendas de hoje"
            subtitle={`Periodo: ${dateLabel || '--'}`}
        >
            <Head title="Vendas de hoje" />

            <div className="space-y-4">
                <section className="grid grid-cols-3 gap-3">
                    <div className="rounded-[1.25rem] bg-white p-4 shadow-sm">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-400">
                            Total
                        </p>
                        <p className="mt-2 text-sm font-bold text-slate-900">
                            {formatCurrency(totalSum)}
                        </p>
                    </div>
                    <div className="rounded-[1.25rem] bg-white p-4 shadow-sm">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-400">
                            Selecao
                        </p>
                        <p className="mt-2 text-sm font-bold text-slate-900">
                            {selectedMeta.label}
                        </p>
                    </div>
                    <div className="rounded-[1.25rem] bg-white p-4 shadow-sm">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-400">
                            Valor
                        </p>
                        <p className="mt-2 text-sm font-bold text-slate-900">
                            {formatCurrency(selectedTotal)}
                        </p>
                    </div>
                </section>

                <section className="rounded-[1.5rem] bg-white p-4 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">
                        Periodo
                    </p>
                    <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                        {dayOptions.map((option) => (
                            <button
                                key={option.id}
                                type="button"
                                onClick={() => handleDayChange(option.id)}
                                className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold ${
                                    option.id === selectedDay
                                        ? 'bg-slate-900 text-white'
                                        : 'bg-slate-100 text-slate-700'
                                }`}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                    <label className="mt-4 block text-sm font-medium text-slate-700">
                        Unidade
                    </label>
                    <select
                        value={selectedUnitId ?? 'all'}
                        onChange={handleUnitChange}
                        className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900"
                    >
                        {unitOptions.map((unit) => (
                            <option key={`unit-${unit.id ?? 'all'}`} value={unit.id ?? 'all'}>
                                {unit.name}
                            </option>
                        ))}
                    </select>
                </section>

                <section className="rounded-[1.5rem] bg-white p-4 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">
                        Formas
                    </p>
                    <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                        {chartData.map((item) => (
                            <button
                                key={item.type}
                                type="button"
                                onClick={() => setSelectedType(item.type)}
                                className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold text-white ${
                                    selectedType === item.type ? 'opacity-100' : 'opacity-50'
                                }`}
                                style={{ backgroundColor: item.color }}
                            >
                                {item.label}
                            </button>
                        ))}
                    </div>

                    <div className="mt-4 rounded-[1.25rem] bg-slate-50 p-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-400">
                            {selectedMeta.label}
                        </p>
                        <p className="mt-2 text-2xl font-bold text-slate-900">
                            {formatCurrency(selectedTotal)}
                        </p>
                        <p className="mt-1 text-sm text-slate-600">
                            {selectedDetails.length} registro(s) | Gastos: {formatCurrency(expenseTotal)}
                        </p>
                    </div>
                </section>

                <section className="space-y-3">
                    {selectedDetails.length === 0 ? (
                        <div className="rounded-[1.5rem] border border-dashed border-slate-300 bg-white p-5 text-center text-sm text-slate-500">
                            Nenhum registro encontrado.
                        </div>
                    ) : (
                        selectedDetails.map((record) => (
                            <button
                                key={`${record.tb4_id}-${record.origin}-${record.applied_total}`}
                                type="button"
                                onClick={() => setSelectedReceipt(record.receipt)}
                                className="w-full rounded-[1.5rem] border border-slate-200 bg-white p-4 text-left shadow-sm"
                            >
                                <div className="flex items-start justify-between gap-4">
                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold text-slate-900">
                                            Cupom #{record.tb4_id}
                                            {isMaster ? ' ' : ''}
                                        </p>
                                        <p className="mt-1 text-xs text-slate-500">
                                            {formatBrazilDateTime(record.created_at)}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-400">
                                            Valor
                                        </p>
                                        <p className="text-base font-bold text-slate-900">
                                            {formatCurrency(record.applied_total)}
                                        </p>
                                    </div>
                                </div>
                            </button>
                        ))
                    )}
                </section>
            </div>

            {selectedReceipt && (
                <div className="fixed inset-0 z-40 flex items-end bg-black/60">
                    <div className="max-h-[86vh] w-full overflow-y-auto rounded-t-[2rem] bg-white px-5 py-5 shadow-2xl">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <p className="text-lg font-semibold text-slate-900">
                                    Cupom #{selectedReceipt.id}
                                </p>
                                <p className="text-sm text-slate-500">
                                    {formatBrazilDateTime(selectedReceipt.date_time)}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setSelectedReceipt(null)}
                                className="rounded-full bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700"
                            >
                                Fechar
                            </button>
                        </div>

                        <div className="mt-4 space-y-2 rounded-[1.25rem] bg-slate-50 p-4 text-sm text-slate-700">
                            <p><span className="font-semibold">Pagamento:</span> {selectedReceipt.tipo_pago}</p>
                            <p><span className="font-semibold">Caixa:</span> {selectedReceipt.cashier_name}</p>
                            <p><span className="font-semibold">Total:</span> {formatCurrency(selectedReceipt.total)}</p>
                            {selectedReceipt.unit_name ? (
                                <p><span className="font-semibold">Unidade:</span> {selectedReceipt.unit_name}</p>
                            ) : null}
                        </div>

                        <div className="mt-4 space-y-3">
                            {(selectedReceipt.items ?? []).map((item) => (
                                <div key={item.id} className="rounded-[1.25rem] border border-slate-200 p-4">
                                    <p className="text-sm font-semibold text-slate-900">
                                        {item.quantity}x {item.product_name}
                                    </p>
                                    <p className="text-xs text-slate-500">
                                        {formatCurrency(item.unit_price)} cada
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </MobileLayout>
    );
}
