import MobileLayout from '@/Layouts/MobileLayout';
import { Head, router, useForm } from '@inertiajs/react';
import { useMemo } from 'react';

const formatCurrency = (value) =>
    Number(value ?? 0).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });

export default function ControlPanel({
    period,
    paymentType,
    paymentOptions = [],
    stores = [],
    summary,
}) {
    const { data, setData, get, processing } = useForm({
        payment_type: paymentType ?? 'all',
        start_date: period?.start ?? '',
        end_date: period?.end ?? '',
    });

    const totalSum = Number(summary?.grand_total ?? 0);
    const selectedPaymentLabel =
        paymentOptions.find((option) => option.value === data.payment_type)?.label ?? 'Tudo';
    const storesWithMovement = useMemo(
        () => stores.filter((store) => Number(store.total ?? 0) > 0),
        [stores],
    );

    const submit = (event) => {
        event.preventDefault();
        get(route('mobile.reports.control'), {
            data,
            preserveScroll: true,
            preserveState: true,
            replace: true,
        });
    };

    return (
        <MobileLayout
            title="Controle financeiro"
            subtitle={period?.label ?? 'Resumo por forma de pagamento e unidade'}
        >
            <Head title="Controle financeiro" />

            <div className="space-y-4">
                <form onSubmit={submit} className="rounded-[1.5rem] bg-white p-4 shadow-sm">
                    <label className="text-sm font-medium text-slate-700">Forma de pagamento</label>
                    <select
                        value={data.payment_type}
                        onChange={(event) => setData('payment_type', event.target.value)}
                        className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
                    >
                        {paymentOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>

                    <div className="mt-4 grid grid-cols-2 gap-3">
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
                            Total
                        </p>
                        <p className="mt-2 text-sm font-bold text-slate-900">
                            {formatCurrency(totalSum)}
                        </p>
                    </div>
                    <div className="rounded-[1.25rem] bg-white p-4 shadow-sm">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-400">
                            Filtro
                        </p>
                        <p className="mt-2 text-sm font-bold text-slate-900">
                            {selectedPaymentLabel}
                        </p>
                    </div>
                    <div className="rounded-[1.25rem] bg-white p-4 shadow-sm">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-400">
                            Lojas
                        </p>
                        <p className="mt-2 text-sm font-bold text-slate-900">
                            {summary?.stores_with_sales ?? 0}
                        </p>
                    </div>
                    <div className="rounded-[1.25rem] bg-white p-4 shadow-sm">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-400">
                            Media
                        </p>
                        <p className="mt-2 text-sm font-bold text-slate-900">
                            {formatCurrency(summary?.average_per_store ?? 0)}
                        </p>
                    </div>
                </section>

                <section className="rounded-[1.5rem] bg-white p-4 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">
                        Lojas com movimento
                    </p>
                    <div className="mt-3 space-y-2">
                        {storesWithMovement.length === 0 ? (
                            <div className="rounded-[1.25rem] border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">
                                Nenhuma loja com movimento para este filtro.
                            </div>
                        ) : (
                            storesWithMovement.map((store) => (
                                <div key={store.id} className="rounded-[1.25rem] bg-slate-50 px-4 py-3">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-semibold text-slate-900">
                                                {store.name}
                                            </p>
                                            <p className="text-xs text-slate-500">
                                                {store.percentage?.toFixed?.(2) ?? 0}% do total
                                            </p>
                                        </div>
                                        <p className="text-sm font-bold text-slate-900">
                                            {formatCurrency(store.total)}
                                        </p>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </section>
            </div>
        </MobileLayout>
    );
}
