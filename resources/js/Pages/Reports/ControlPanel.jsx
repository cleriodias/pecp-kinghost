import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, Link, useForm } from '@inertiajs/react';
import { useMemo } from 'react';

const formatCurrency = (value) =>
    Number(value ?? 0).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });

const MetricCard = ({ title, value, description, accent }) => (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <p className="text-sm font-medium text-gray-500">{title}</p>
        <p className="mt-2 text-3xl font-bold" style={{ color: accent ?? '#111827' }}>
            {value}
        </p>
        {description ? <p className="mt-2 text-sm text-gray-500">{description}</p> : null}
    </div>
);

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
    const storesWithMovement = Array.isArray(stores) ? stores.filter((store) => Number(store.total) > 0) : [];

    const pieSegments = useMemo(() => {
        if (totalSum <= 0 || storesWithMovement.length === 0) {
            return [];
        }

        const radius = 54;
        const circumference = 2 * Math.PI * radius;
        let offset = 0;

        return storesWithMovement.map((store) => {
            const segmentLength = (Number(store.total) / totalSum) * circumference;
            const segment = {
                ...store,
                radius,
                circumference,
                strokeDasharray: `${segmentLength} ${Math.max(circumference - segmentLength, 0)}`,
                strokeDashoffset: -offset,
            };

            offset += segmentLength;

            return segment;
        });
    }, [storesWithMovement, totalSum]);

    const handleSubmit = (event) => {
        event.preventDefault();
        get(route('reports.control'), {
            preserveState: true,
            preserveScroll: true,
            replace: true,
            data,
        });
    };

    const selectedPaymentLabel =
        paymentOptions.find((option) => option.value === data.payment_type)?.label ?? 'Tudo (Dinheiro + Cartao + Vale)';

    const topStoreName = summary?.top_store?.name ?? 'Nenhuma loja com movimento';

    const headerContent = (
        <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
                <h2 className="text-xl font-semibold leading-tight text-gray-800">Controle financeiro</h2>
                <p className="text-sm text-gray-500">
                    Comparativo das lojas por forma de pagamento no periodo selecionado.
                </p>
            </div>
            <div className="flex items-center gap-2">
                <Link
                    href={route('reports.sales.period')}
                    className="inline-flex items-center justify-center rounded-xl border border-indigo-200 bg-indigo-50 p-2 text-indigo-700 shadow-sm transition hover:bg-indigo-100"
                    aria-label="Voltar: Vendas por periodo"
                    title="Voltar"
                >
                    <i className="bi bi-arrow-left" aria-hidden="true"></i>
                </Link>
                <Link
                    href={route('reports.sales.today')}
                    className="inline-flex items-center justify-center rounded-xl border border-indigo-200 bg-indigo-50 p-2 text-indigo-700 shadow-sm transition hover:bg-indigo-100"
                    aria-label="Avancar: Vendas hoje"
                    title="Avancar"
                >
                    <i className="bi bi-arrow-right" aria-hidden="true"></i>
                </Link>
            </div>
        </div>
    );

    return (
        <AuthenticatedLayout header={headerContent}>
            <Head title="Controle financeiro" />

            <div className="py-12">
                <div className="mx-auto max-w-7xl space-y-8 px-4 sm:px-6 lg:px-8">
                    <form onSubmit={handleSubmit} className="rounded-3xl bg-white p-6 shadow ring-1 ring-gray-100">
                        <div className="grid gap-4 lg:grid-cols-4">
                            <div>
                                <label className="text-sm font-medium text-gray-700">Forma de pagamento</label>
                                <select
                                    value={data.payment_type}
                                    onChange={(event) => setData('payment_type', event.target.value)}
                                    className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-gray-800 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                                >
                                    {paymentOptions.map((option) => (
                                        <option key={option.value} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="text-sm font-medium text-gray-700">Inicio</label>
                                <input
                                    type="date"
                                    value={data.start_date}
                                    onChange={(event) => setData('start_date', event.target.value)}
                                    className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-gray-800 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                                />
                            </div>

                            <div>
                                <label className="text-sm font-medium text-gray-700">Fim</label>
                                <input
                                    type="date"
                                    value={data.end_date}
                                    onChange={(event) => setData('end_date', event.target.value)}
                                    className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-gray-800 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                                />
                            </div>

                            <div className="flex items-end">
                                <button
                                    type="submit"
                                    disabled={processing}
                                    className="w-full rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-700 disabled:opacity-60"
                                >
                                    Atualizar
                                </button>
                            </div>
                        </div>

                        <p className="mt-4 text-xs text-gray-500">
                            Periodo considerado: {period?.label ?? '-'}.
                        </p>
                    </form>

                    <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
                        <MetricCard
                            title="Total consolidado"
                            value={formatCurrency(summary?.grand_total ?? 0)}
                            description={selectedPaymentLabel}
                            accent="#4338ca"
                        />
                        <MetricCard
                            title="Lojas com movimento"
                            value={String(summary?.stores_with_sales ?? 0)}
                            description="Quantidade de lojas com total acima de zero"
                            accent="#0f766e"
                        />
                        <MetricCard
                            title="Media por loja"
                            value={formatCurrency(summary?.average_per_store ?? 0)}
                            description="Media calculada apenas entre lojas com movimento"
                            accent="#ea580c"
                        />
                        <MetricCard
                            title="Loja lider"
                            value={topStoreName}
                            description={
                                summary?.top_store
                                    ? formatCurrency(summary.top_store.total)
                                    : 'Nenhuma loja com vendas no filtro atual'
                            }
                            accent="#16a34a"
                        />
                    </section>

                    <section className="grid gap-6 rounded-3xl bg-white p-6 shadow ring-1 ring-gray-100 lg:grid-cols-[1.1fr_0.9fr]">
                        <div className="space-y-5">
                            <div>
                                <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
                                    Distribuicao por loja
                                </p>
                                <p className="text-sm text-gray-600">
                                    O grafico compara todas as lojas disponiveis para o filtro selecionado.
                                </p>
                            </div>

                            <div className="grid gap-3">
                                {stores.length === 0 ? (
                                    <p className="rounded-2xl border border-dashed border-gray-200 px-4 py-6 text-center text-sm text-gray-500">
                                        Nenhuma loja disponivel para este usuario.
                                    </p>
                                ) : (
                                    stores.map((store) => (
                                        <div
                                            key={store.id}
                                            className="flex items-center justify-between gap-4 rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3"
                                        >
                                            <div className="flex min-w-0 items-center gap-3">
                                                <span
                                                    className="h-3.5 w-3.5 shrink-0 rounded-full"
                                                    style={{ backgroundColor: store.color }}
                                                />
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-semibold text-gray-900">
                                                        {store.name}
                                                    </p>
                                                    <p className="text-xs text-gray-500">
                                                        {store.percentage.toFixed(2)}% do total
                                                    </p>
                                                </div>
                                            </div>
                                            <p className="text-sm font-bold text-gray-900">
                                                {formatCurrency(store.total)}
                                            </p>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        <div className="flex flex-col items-center justify-center gap-5 rounded-[2rem] bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 p-8 text-white shadow-2xl">
                            <div className="text-center">
                                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-indigo-200">
                                    Total
                                </p>
                                <p className="mt-3 text-4xl font-bold">{formatCurrency(summary?.grand_total ?? 0)}</p>
                                <p className="mt-2 text-sm text-indigo-100">{selectedPaymentLabel}</p>
                            </div>

                            <div className="relative">
                                <div className="absolute inset-0 rounded-full bg-indigo-500/30 blur-3xl" />
                                <div className="relative flex h-64 w-64 items-center justify-center rounded-full border-[10px] border-white/15 shadow-[0_25px_80px_rgba(15,23,42,0.55)]">
                                    <svg
                                        viewBox="0 0 120 120"
                                        className="absolute inset-0 h-full w-full -rotate-90"
                                        aria-hidden="true"
                                    >
                                        <circle cx="60" cy="60" r="54" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="12" />
                                        {pieSegments.map((segment) => (
                                            <circle
                                                key={`pie-${segment.id}`}
                                                cx="60"
                                                cy="60"
                                                r={segment.radius}
                                                fill="none"
                                                stroke={segment.color}
                                                strokeWidth="12"
                                                strokeDasharray={segment.strokeDasharray}
                                                strokeDashoffset={segment.strokeDashoffset}
                                            />
                                        ))}
                                    </svg>
                                    <div className="absolute inset-[17%] rounded-full bg-slate-950/80 backdrop-blur" />
                                    <div className="absolute inset-[23%] rounded-full border border-white/10" />
                                    <div className="relative text-center">
                                        <p className="text-[11px] uppercase tracking-[0.3em] text-indigo-200">
                                            Lojas ativas
                                        </p>
                                        <p className="mt-2 text-4xl font-bold">{summary?.stores_with_sales ?? 0}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="grid w-full gap-2 text-sm">
                                {storesWithMovement.length === 0 ? (
                                    <p className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-center text-indigo-100">
                                        Nenhuma venda encontrada para o filtro atual.
                                    </p>
                                ) : (
                                    storesWithMovement.slice(0, 5).map((store) => (
                                        <div
                                            key={`highlight-${store.id}`}
                                            className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
                                        >
                                            <div className="flex items-center gap-2">
                                                <span
                                                    className="h-3 w-3 rounded-full"
                                                    style={{ backgroundColor: store.color }}
                                                />
                                                <span className="font-medium text-white">{store.name}</span>
                                            </div>
                                            <span className="font-semibold text-indigo-100">
                                                {store.percentage.toFixed(2)}%
                                            </span>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </section>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
