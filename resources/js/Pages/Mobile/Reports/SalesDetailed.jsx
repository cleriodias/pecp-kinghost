import MobileLayout from '@/Layouts/MobileLayout';
import { formatBrazilDateTime } from '@/Utils/date';
import { Head, router, useForm } from '@inertiajs/react';
import { useState } from 'react';

const formatCurrency = (value) =>
    Number(value ?? 0).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });

export default function SalesDetailed({
    payments = [],
    dateValue = '',
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
    const [expandedId, setExpandedId] = useState(null);
    const totalAmount = payments.reduce((sum, payment) => sum + (Number(payment.valor_total) || 0), 0);

    const handleSubmit = (event) => {
        event.preventDefault();
        get(route('mobile.reports.sales.detailed'), {
            data,
            preserveScroll: true,
            preserveState: true,
            replace: true,
        });
    };

    return (
        <MobileLayout
            title="Relatorio detalhado"
            subtitle={`Unidade: ${unit?.name ?? '---'}`}
        >
            <Head title="Relatorio detalhado" />

            <div className="space-y-4">
                <form onSubmit={handleSubmit} className="rounded-[1.5rem] bg-white p-4 shadow-sm">
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-sm font-medium text-slate-700">Data</label>
                            <input
                                type="date"
                                value={data.date}
                                onChange={(event) => setData('date', event.target.value)}
                                className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
                            />
                        </div>
                        <div>
                            <label className="text-sm font-medium text-slate-700">Unidade</label>
                            <select
                                value={data.unit_id}
                                onChange={(event) => setData('unit_id', event.target.value)}
                                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
                            >
                                <option value="all">Todas</option>
                                {filterUnits.map((filterUnit) => (
                                    <option key={filterUnit.id} value={filterUnit.id}>
                                        {filterUnit.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={processing}
                        className="mt-4 w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
                    >
                        Atualizar
                    </button>
                </form>

                <section className="grid grid-cols-2 gap-3">
                    <div className="rounded-[1.25rem] bg-white p-4 shadow-sm">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-400">
                            Registros
                        </p>
                        <p className="mt-2 text-sm font-bold text-slate-900">{payments.length}</p>
                    </div>
                    <div className="rounded-[1.25rem] bg-white p-4 shadow-sm">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-400">
                            Total
                        </p>
                        <p className="mt-2 text-sm font-bold text-slate-900">
                            {formatCurrency(totalAmount)}
                        </p>
                    </div>
                </section>

                <section className="space-y-3">
                    {payments.length === 0 ? (
                        <div className="rounded-[1.5rem] border border-dashed border-slate-300 bg-white p-5 text-center text-sm text-slate-500">
                            Nenhum registro encontrado para esta data.
                        </div>
                    ) : (
                        payments.map((payment) => (
                            <div key={payment.tb4_id} className="rounded-[1.5rem] bg-white p-4 shadow-sm">
                                <button
                                    type="button"
                                    onClick={() =>
                                        setExpandedId((current) =>
                                            current === payment.tb4_id ? null : payment.tb4_id,
                                        )
                                    }
                                    className="w-full text-left"
                                >
                                    <div className="flex items-start justify-between gap-4">
                                        <div>
                                            <p className="text-sm font-semibold text-slate-900">
                                                Cupom #{payment.tb4_id}
                                            </p>
                                            <p className="mt-1 text-xs text-slate-500">
                                                {formatBrazilDateTime(payment.created_at)}
                                            </p>
                                            <p className="mt-1 text-xs text-slate-500">
                                                Tipo: {payment.tipo_pagamento}
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-400">
                                                Total
                                            </p>
                                            <p className="text-base font-bold text-slate-900">
                                                {formatCurrency(payment.valor_total)}
                                            </p>
                                        </div>
                                    </div>
                                </button>

                                {expandedId === payment.tb4_id ? (
                                    <div className="mt-4 space-y-2 rounded-[1.25rem] bg-slate-50 p-4">
                                        {(payment.items ?? []).map((item) => (
                                            <div key={item.tb3_id} className="rounded-xl bg-white px-3 py-2 shadow-sm">
                                                <p className="text-sm font-semibold text-slate-900">
                                                    {item.quantidade}x {item.produto_nome}
                                                </p>
                                                <p className="text-xs text-slate-500">
                                                    {formatCurrency(item.valor_unitario)} cada
                                                </p>
                                                {item.lanc_user_name ? (
                                                    <p className="text-xs text-slate-600">{item.lanc_user_name}</p>
                                                ) : null}
                                            </div>
                                        ))}
                                    </div>
                                ) : null}
                            </div>
                        ))
                    )}
                </section>
            </div>
        </MobileLayout>
    );
}
