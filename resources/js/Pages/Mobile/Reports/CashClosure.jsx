import MobileLayout from '@/Layouts/MobileLayout';
import { formatBrazilDateTime } from '@/Utils/date';
import { Head, router, useForm } from '@inertiajs/react';
import { useMemo, useState } from 'react';

const formatCurrency = (value) =>
    Number(value ?? 0).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });

const paymentLabels = {
    dinheiro: 'Dinheiro',
    maquina: 'Maquina',
    vale: 'Vale',
    refeicao: 'Refeicao',
    faturar: 'Faturar',
};

export default function CashClosure({
    records = [],
    dateValue = '',
    dateInputValue = '',
    filterUnits = [],
    selectedUnitId = null,
    selectedUnit = { name: 'Todas as unidades' },
}) {
    const { data, setData, get, processing } = useForm({
        date: dateInputValue ?? '',
        unit_id:
            selectedUnitId !== null && selectedUnitId !== undefined
                ? String(selectedUnitId)
                : 'all',
    });
    const [expandedKey, setExpandedKey] = useState(null);

    const totals = useMemo(
        () => ({
            sales: records.reduce((sum, record) => sum + Number(record.grand_total ?? 0), 0),
            closures: records.filter((record) => Boolean(record.closure?.closed)).length,
        }),
        [records],
    );

    const applyFilters = (params) => {
        router.get(route('mobile.reports.cash.closure'), params, {
            preserveState: true,
            preserveScroll: true,
            replace: true,
        });
    };

    const handleDateChange = (event) => {
        const value = event.target.value;
        const params = {};

        if (value) {
            params.date = value;
        }

        if (data.unit_id && data.unit_id !== 'all') {
            params.unit_id = data.unit_id;
        }

        applyFilters(params);
    };

    const handleUnitChange = (event) => {
        const value = event.target.value;
        const params = {};

        if (data.date) {
            params.date = data.date;
        }

        if (value && value !== 'all') {
            params.unit_id = value;
        }

        applyFilters(params);
    };

    return (
        <MobileLayout
            title="Fechamento de caixa"
            subtitle={selectedUnit?.name ?? dateValue ?? '--'}
        >
            <Head title="Fechamento de caixa" />

            <div className="space-y-4">
                <form className="rounded-[1.5rem] bg-white p-4 shadow-sm">
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-sm font-medium text-slate-700">Data</label>
                            <input
                                type="date"
                                value={data.date}
                                onChange={(event) => {
                                    setData('date', event.target.value);
                                    handleDateChange(event);
                                }}
                                className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
                            />
                        </div>
                        <div>
                            <label className="text-sm font-medium text-slate-700">Unidade</label>
                            <select
                                value={data.unit_id}
                                onChange={(event) => {
                                    setData('unit_id', event.target.value);
                                    handleUnitChange(event);
                                }}
                                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
                            >
                                <option value="all">Todas</option>
                                {filterUnits.map((unit) => (
                                    <option key={unit.id} value={unit.id}>
                                        {unit.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {processing ? (
                        <p className="mt-3 text-xs text-slate-500">Atualizando...</p>
                    ) : null}
                </form>

                <section className="grid grid-cols-2 gap-3">
                    <div className="rounded-[1.25rem] bg-white p-4 shadow-sm">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-400">
                            Caixas
                        </p>
                        <p className="mt-2 text-sm font-bold text-slate-900">{records.length}</p>
                    </div>
                    <div className="rounded-[1.25rem] bg-white p-4 shadow-sm">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-400">
                            Movimentos
                        </p>
                        <p className="mt-2 text-sm font-bold text-slate-900">
                            {formatCurrency(totals.sales)}
                        </p>
                    </div>
                </section>

                <section className="space-y-3">
                    {records.length === 0 ? (
                        <div className="rounded-[1.5rem] border border-dashed border-slate-300 bg-white p-5 text-center text-sm text-slate-500">
                            Nenhum fechamento encontrado.
                        </div>
                    ) : (
                        records.map((record) => {
                            const rowKey = record.row_key ?? `${record.cashier_id}-${record.unit_id ?? 'none'}`;

                            return (
                                <div key={rowKey} className="rounded-[1.5rem] bg-white p-4 shadow-sm">
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setExpandedKey((current) =>
                                                current === rowKey ? null : rowKey,
                                            )
                                        }
                                        className="w-full text-left"
                                    >
                                        <div className="flex items-start justify-between gap-4">
                                            <div>
                                                <p className="text-sm font-semibold text-slate-900">
                                                    {record.cashier_name}
                                                </p>
                                                <p className="mt-1 text-xs text-slate-500">
                                                    {record.unit_name}
                                                </p>
                                                <p className="mt-1 text-xs text-slate-500">
                                                    {record.closure?.closed ? 'Fechado' : 'Pendente'}
                                                </p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-400">
                                                    Total
                                                </p>
                                                <p className="text-base font-bold text-slate-900">
                                                    {formatCurrency(record.grand_total)}
                                                </p>
                                            </div>
                                        </div>
                                    </button>

                                    {expandedKey === rowKey ? (
                                        <div className="mt-4 space-y-3 rounded-[1.25rem] bg-slate-50 p-4">
                                            <div className="grid grid-cols-2 gap-2 text-sm">
                                                {Object.entries(record.totals ?? {}).map(([key, value]) => (
                                                    <div key={key} className="rounded-xl bg-white px-3 py-2">
                                                        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                                                            {paymentLabels[key] ?? key}
                                                        </p>
                                                        <p className="mt-1 font-bold text-slate-900">
                                                            {formatCurrency(value)}
                                                        </p>
                                                    </div>
                                                ))}
                                            </div>

                                            <div className="rounded-xl bg-white px-3 py-3 text-sm text-slate-700">
                                                <p className="font-semibold text-slate-900">Conferencia</p>
                                                <p className="mt-1">Sistema: {formatCurrency(record.conference_base_total)}</p>
                                                <p className="mt-1">Gastos: {formatCurrency(record.expense_total)}</p>
                                                <p className="mt-1">Divergencia total: {formatCurrency(record.closure?.differences?.total ?? 0)}</p>
                                                <p className="mt-1 text-xs text-slate-500">
                                                    {record.closure?.closed_at ? `Fechado em ${formatBrazilDateTime(record.closure.closed_at)}` : 'Sem fechamento registrado'}
                                                </p>
                                            </div>
                                        </div>
                                    ) : null}
                                </div>
                            );
                        })
                    )}
                </section>
            </div>
        </MobileLayout>
    );
}
