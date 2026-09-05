import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, Link, useForm } from '@inertiajs/react';
import { useMemo } from 'react';

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

export default function SalesPeriod({
    chartData,
    expenseTotal = 0,
    dailyTotals = [],
    loadDailyTotals = false,
    mode,
    dateValue,
    startDate,
    endDate,
    unit,
    filterUnits = [],
    selectedUnitId = null,
}) {
    const { data, setData, get, processing } = useForm({
        mode,
        date: dateValue ?? '',
        unit_id:
            selectedUnitId !== null && selectedUnitId !== undefined
                ? String(selectedUnitId)
                : 'all',
        load_daily_totals: loadDailyTotals ? '1' : '0',
    });

    const submitReport = (payload) => {
        get(route('reports.sales.period'), {
            preserveState: true,
            preserveScroll: true,
            replace: true,
            data: payload,
        });
    };

    const handleSubmit = (event) => {
        event.preventDefault();
        submitReport(data);
    };

    const handleLoadDailyTotals = () => {
        const nextData = {
            ...data,
            load_daily_totals: '1',
        };

        setData('load_daily_totals', '1');
        submitReport(nextData);
    };

    const totalSum = chartData.reduce((sum, item) => sum + item.total, 0);
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

    const headerContent = (
        <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
                <h2 className="text-xl font-semibold leading-tight text-gray-800 dark:text-gray-200">
                    Vendas por periodo
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-300">
                    Consulte o desempenho por mes completo ou dia especifico.
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-300">
                    Unidade atual: {unit?.name ?? '---'}.
                </p>
            </div>
            <div className="flex items-center gap-2">
                <Link
                    href={route('reports.lanchonete')}
                    className="inline-flex items-center justify-center rounded-xl border border-indigo-200 bg-indigo-50 p-2 text-indigo-700 shadow-sm transition hover:bg-indigo-100 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-200"
                    aria-label="Voltar: Relatorio Lanchonete"
                    title="Voltar"
                >
                    <i className="bi bi-arrow-left" aria-hidden="true"></i>
                </Link>
                <Link
                    href={route('reports.control')}
                    className="inline-flex items-center justify-center rounded-xl border border-indigo-200 bg-indigo-50 p-2 text-indigo-700 shadow-sm transition hover:bg-indigo-100 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-200"
                    aria-label="Avancar: Controle financeiro"
                    title="Avancar"
                >
                    <i className="bi bi-arrow-right" aria-hidden="true"></i>
                </Link>
            </div>
        </div>
    );

    const dateInputType = data.mode === 'day' ? 'date' : 'month';

    return (
        <AuthenticatedLayout header={headerContent}>
            <Head title="Vendas por periodo" />

            <div className="py-12">
                <div className="mx-auto max-w-7xl space-y-8 px-4 sm:px-6 lg:px-8">
                    <form
                        onSubmit={handleSubmit}
                        className="rounded-2xl bg-white p-6 shadow dark:bg-gray-800"
                    >
                        <div className="grid gap-4 sm:grid-cols-4">
                            <div>
                                <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                    Tipo de filtro
                                </label>
                                <select
                                    value={data.mode}
                                    onChange={(event) => setData('mode', event.target.value)}
                                    className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-gray-800 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                                >
                                    <option value="month">Mes inteiro</option>
                                    <option value="day">Dia especifico</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                    {dateInputType === 'date' ? 'Dia' : 'Mes'}
                                </label>
                                <input
                                    type={dateInputType}
                                    value={data.date}
                                    onChange={(event) => setData('date', event.target.value)}
                                    className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-gray-800 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                    Unidade
                                </label>
                                <select
                                    value={data.unit_id}
                                    onChange={(event) => setData('unit_id', event.target.value)}
                                    className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-gray-800 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                                >
                                    <option value="all">Todas</option>
                                    {filterUnits.map((filterUnit) => (
                                        <option key={filterUnit.id} value={filterUnit.id}>
                                            {filterUnit.name}
                                        </option>
                                    ))}
                                </select>
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
                        <p className="mt-4 text-xs text-gray-500 dark:text-gray-300">
                            Intervalo considerado: {startDate} a {endDate}
                        </p>
                    </form>

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
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                                Totais diarios
                            </h3>
                            <div className="flex flex-wrap items-center justify-end gap-3">
                                {!loadDailyTotals && (
                                    <button
                                        type="button"
                                        onClick={handleLoadDailyTotals}
                                        disabled={processing}
                                        className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-700 disabled:opacity-60"
                                    >
                                        {processing ? 'Carregando...' : 'Carregar totais diarios'}
                                    </button>
                                )}
                                <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-indigo-700 shadow-sm dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-200">
                                    <p className="text-[10px] font-semibold uppercase tracking-wide">
                                        Total do periodo
                                    </p>
                                    <p className="text-sm font-bold">
                                        {formatCurrency(totalSum)}
                                    </p>
                                </div>
                            </div>
                        </div>
                        <div className="mt-4 overflow-x-auto">
                            {!loadDailyTotals ? (
                                <p className="rounded-xl border border-dashed border-gray-200 px-4 py-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-300">
                                    Os totais diarios ficam sob demanda para evitar timeout em periodos com muitos pagamentos.
                                </p>
                            ) : dailyTotals.length === 0 ? (
                                <p className="rounded-xl border border-dashed border-gray-200 px-4 py-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-300">
                                    Nenhuma venda registrada neste periodo.
                                </p>
                            ) : (
                                <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-700">
                                    <thead className="bg-gray-100 dark:bg-gray-900/60">
                                        <tr>
                                            <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">
                                                Dia
                                            </th>
                                            <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-300">
                                                Dinheiro
                                            </th>
                                            <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-300">
                                                Maquina
                                            </th>
                                            <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-300">
                                                Vale
                                            </th>
                                            <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-300">
                                                Refeicao
                                            </th>
                                            <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-300">
                                                Faturar
                                            </th>
                                            <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-300">
                                                Gastos
                                            </th>
                                            <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-300">
                                                Total
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                        {dailyTotals.map((day) => (
                                            <tr key={day.date}>
                                                <td className="px-3 py-2 text-gray-700 dark:text-gray-200">
                                                    {day.label}
                                                </td>
                                                <td className="px-3 py-2 text-right font-semibold text-gray-900 dark:text-white">
                                                    {formatCurrency(day.dinheiro)}
                                                </td>
                                                <td className="px-3 py-2 text-right font-semibold text-gray-900 dark:text-white">
                                                    {formatCurrency(day.maquina)}
                                                </td>
                                                <td className="px-3 py-2 text-right font-semibold text-gray-900 dark:text-white">
                                                    {formatCurrency(day.vale)}
                                                </td>
                                                <td className="px-3 py-2 text-right font-semibold text-gray-900 dark:text-white">
                                                    {formatCurrency(day.refeicao)}
                                                </td>
                                                <td className="px-3 py-2 text-right font-semibold text-gray-900 dark:text-white">
                                                    {formatCurrency(day.faturar)}
                                                </td>
                                                <td className="px-3 py-2 text-right font-semibold text-red-600 dark:text-red-300">
                                                    {formatCurrency(day.gastos)}
                                                </td>
                                                <td className="px-3 py-2 text-right font-semibold text-gray-900 dark:text-white">
                                                    {formatCurrency(day.total)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
