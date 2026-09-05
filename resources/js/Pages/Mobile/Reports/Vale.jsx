import MobileLayout from '@/Layouts/MobileLayout';
import { formatBrazilDateTime } from '@/Utils/date';
import { Head, useForm } from '@inertiajs/react';

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

export default function ValeMobileReport({
    rows = [],
    startDate,
    endDate,
    filterUsers = [],
    selectedUserId = null,
}) {
    const { data, setData, get, processing } = useForm({
        start_date: startDate ?? '',
        end_date: endDate ?? '',
        user_id:
            selectedUserId !== null && selectedUserId !== undefined
                ? String(selectedUserId)
                : 'all',
    });

    const selectedUserName =
        filterUsers.find((user) => String(user.id) === String(data.user_id))?.name ?? 'Todos';
    const totalAmount = rows.reduce((sum, row) => sum + (Number(row.total) || 0), 0);

    const handleSubmit = (event) => {
        event.preventDefault();
        get(route('mobile.reports.vale'), {
            data,
            preserveScroll: true,
            preserveState: true,
            replace: true,
        });
    };

    return (
        <MobileLayout
            title="Relatorio de vale"
            subtitle="Todos os registros das lojas no periodo."
        >
            <Head title="Relatorio de vale" />

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

                    <div className="mt-4">
                        <label className="text-sm font-medium text-slate-700">Funcionario</label>
                        <select
                            value={data.user_id}
                            onChange={(event) => setData('user_id', event.target.value)}
                            className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
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
                        <p className="mt-2 text-sm font-bold text-slate-900">{rows.length}</p>
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

                <section className="rounded-[1.5rem] bg-white p-4 shadow-sm">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-400">
                        Funcionario
                    </p>
                    <p className="mt-2 truncate text-sm font-bold text-slate-900">
                        {selectedUserName}
                    </p>
                </section>

                <section className="space-y-3">
                    {rows.length === 0 ? (
                        <div className="rounded-[1.5rem] border border-dashed border-slate-300 bg-white p-5 text-center text-sm text-slate-500">
                            Nenhum vale encontrado para os filtros selecionados.
                        </div>
                    ) : (
                        rows.map((row) => (
                            <article key={row.id} className="rounded-[1.5rem] bg-white p-4 shadow-sm">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold text-slate-900">
                                            {formatDateTime(row.date_time)}
                                        </p>
                                        <p className="mt-1 truncate text-xs text-slate-500">
                                            {row.vale_user ?? 'Funcionario nao informado'}
                                        </p>
                                    </div>
                                    <p className="shrink-0 text-base font-bold text-slate-900">
                                        {formatCurrency(row.total)}
                                    </p>
                                </div>

                                <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
                                    <div className="rounded-2xl bg-slate-50 px-3 py-2">
                                        <dt className="font-semibold uppercase tracking-[0.18em] text-slate-400">
                                            Loja
                                        </dt>
                                        <dd className="mt-1 font-semibold text-slate-800">
                                            {row.unit_name ?? '---'}
                                        </dd>
                                    </div>
                                    <div className="rounded-2xl bg-slate-50 px-3 py-2">
                                        <dt className="font-semibold uppercase tracking-[0.18em] text-slate-400">
                                            Caixa
                                        </dt>
                                        <dd className="mt-1 font-semibold text-slate-800">
                                            {row.cashier ?? '--'}
                                        </dd>
                                    </div>
                                </dl>
                            </article>
                        ))
                    )}
                </section>
            </div>
        </MobileLayout>
    );
}
