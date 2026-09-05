import MobileLayout from '@/Layouts/MobileLayout';
import { formatBrazilShortDate, shortBrazilDateInputToIso } from '@/Utils/date';
import { Head, router, useForm } from '@inertiajs/react';
import { useState } from 'react';

const formatCurrency = (value) =>
    Number(value ?? 0).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });

export default function ContraCheque({
    rows = [],
    summary = {},
    startDate,
    endDate,
    filterUsers = [],
    selectedUserId = null,
    unit = null,
}) {
    const { data, setData, get, processing } = useForm({
        start_date: shortBrazilDateInputToIso(startDate ?? ''),
        end_date: shortBrazilDateInputToIso(endDate ?? ''),
        user_id:
            selectedUserId !== null && selectedUserId !== undefined
                ? String(selectedUserId)
                : 'all',
    });
    const [expandedId, setExpandedId] = useState(null);

    const applyFilters = (params) => {
        router.get(route('mobile.settings.contra-cheque'), params, {
            preserveState: true,
            preserveScroll: true,
            replace: true,
        });
    };

    const handleSubmit = (event) => {
        event.preventDefault();

        const params = {};

        if (data.start_date) {
            params.start_date = data.start_date;
        }

        if (data.end_date) {
            params.end_date = data.end_date;
        }

        if (data.user_id && data.user_id !== 'all') {
            params.user_id = data.user_id;
        }

        applyFilters(params);
    };

    return (
        <MobileLayout
            title="Contra-cheque"
            subtitle={unit?.name ?? 'Consulta resumida por periodo e usuario'}
        >
            <Head title="Contra-cheque" />

            <div className="space-y-4">
                <form onSubmit={handleSubmit} className="rounded-[1.5rem] bg-white p-4 shadow-sm">
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-sm font-medium text-slate-700">Inicio</label>
                            <input
                                type="date"
                                value={data.start_date}
                                onChange={(event) => setData('start_date', event.target.value)}
                                className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
                            />
                        </div>
                        <div>
                            <label className="text-sm font-medium text-slate-700">Fim</label>
                            <input
                                type="date"
                                value={data.end_date}
                                onChange={(event) => setData('end_date', event.target.value)}
                                className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
                            />
                        </div>
                    </div>

                    <label className="mt-4 block text-sm font-medium text-slate-700">Usuario</label>
                    <select
                        value={data.user_id}
                        onChange={(event) => setData('user_id', event.target.value)}
                        className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
                    >
                        <option value="all">Todos</option>
                        {filterUsers.map((user) => (
                            <option key={user.id} value={user.id}>
                                {user.name}
                            </option>
                        ))}
                    </select>

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
                            Colaboradores
                        </p>
                        <p className="mt-2 text-sm font-bold text-slate-900">
                            {summary.employees_count ?? rows.length}
                        </p>
                    </div>
                    <div className="rounded-[1.25rem] bg-white p-4 shadow-sm">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-400">
                            Saldo total
                        </p>
                        <p className="mt-2 text-sm font-bold text-slate-900">
                            {formatCurrency(summary.balance_total ?? 0)}
                        </p>
                    </div>
                </section>

                <section className="space-y-3">
                    {rows.length === 0 ? (
                        <div className="rounded-[1.5rem] border border-dashed border-slate-300 bg-white p-5 text-center text-sm text-slate-500">
                            Nenhum contra-cheque encontrado.
                        </div>
                    ) : (
                        rows.map((row) => (
                            <div key={row.id} className="rounded-[1.5rem] bg-white p-4 shadow-sm">
                                <button
                                    type="button"
                                    onClick={() =>
                                        setExpandedId((current) => (current === row.id ? null : row.id))
                                    }
                                    className="w-full text-left"
                                >
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-semibold text-slate-900">
                                                {row.name}
                                            </p>
                                            <p className="mt-1 text-xs text-slate-500">
                                                {row.role_label} | {row.unit_names?.join(', ') || '---'}
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-400">
                                                Saldo
                                            </p>
                                            <p className="text-base font-bold text-slate-900">
                                                {formatCurrency(row.balance)}
                                            </p>
                                        </div>
                                    </div>
                                </button>

                                {expandedId === row.id ? (
                                    <div className="mt-4 grid grid-cols-2 gap-2 rounded-[1.25rem] bg-slate-50 p-4 text-sm">
                                        <div className="rounded-xl bg-white px-3 py-2">
                                            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                                                Salario
                                            </p>
                                            <p className="mt-1 font-bold text-slate-900">
                                                {formatCurrency(row.salary)}
                                            </p>
                                        </div>
                                        <div className="rounded-xl bg-white px-3 py-2">
                                            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                                                Adiant.
                                            </p>
                                            <p className="mt-1 font-bold text-slate-900">
                                                {formatCurrency(row.advances_total)}
                                            </p>
                                        </div>
                                        <div className="rounded-xl bg-white px-3 py-2">
                                            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                                                Vales
                                            </p>
                                            <p className="mt-1 font-bold text-slate-900">
                                                {formatCurrency(row.vales_total)}
                                            </p>
                                        </div>
                                        <div className="rounded-xl bg-white px-3 py-2">
                                            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                                                Creditos
                                            </p>
                                            <p className="mt-1 font-bold text-slate-900">
                                                {formatCurrency(row.extra_credits_total)}
                                            </p>
                                        </div>
                                        <div className="rounded-xl bg-white px-3 py-2">
                                            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                                                Descontos
                                            </p>
                                            <p className="mt-1 font-bold text-slate-900">
                                                {formatCurrency(row.extra_discounts_total)}
                                            </p>
                                        </div>
                                        <div className="rounded-xl bg-white px-3 py-2">
                                            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                                                Periodo
                                            </p>
                                            <p className="mt-1 font-bold text-slate-900">
                                                {formatBrazilShortDate(row.detail?.start_date)} a {formatBrazilShortDate(row.detail?.end_date)}
                                            </p>
                                        </div>
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
