import PrimaryButton from '@/Components/Button/PrimaryButton';
import InputError from '@/Components/InputError';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { formatBrazilShortDate } from '@/Utils/date';
import { Head, useForm } from '@inertiajs/react';

const formatCurrency = (value) =>
    Number(value ?? 0).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });

const formatPercentage = (value) => {
    if (value === null || value === undefined) {
        return '--';
    }

    return `${Number(value).toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}%`;
};

const formatPeriod = (startDate, endDate) => {
    if (!startDate || !endDate) {
        return '--';
    }

    return `${formatBrazilShortDate(startDate)} a ${formatBrazilShortDate(endDate)}`;
};

const resolveStatusMeta = (enabled, exceeded) => {
    if (!enabled) {
        return {
            label: 'Monitoramento desligado',
            className: 'border-slate-200 bg-slate-50 text-slate-700',
            icon: 'bi bi-pause-circle-fill',
        };
    }

    if (exceeded) {
        return {
            label: 'Limite atingido',
            className: 'border-amber-200 bg-amber-50 text-amber-800',
            icon: 'bi bi-exclamation-triangle-fill',
        };
    }

    return {
        label: 'Dentro do limite',
        className: 'border-emerald-200 bg-emerald-50 text-emerald-800',
        icon: 'bi bi-check-circle-fill',
    };
};

function RangeSummaryCard({ title, subtitle, data = {}, threshold, enabled }) {
    const status = resolveStatusMeta(enabled, Boolean(data?.exceeded));

    return (
        <div className="rounded-2xl bg-white p-6 shadow dark:bg-gray-800">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        {title}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-300">
                        {subtitle}
                    </p>
                </div>
                <span
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${status.className}`}
                >
                    <i className={status.icon} aria-hidden="true"></i>
                    {status.label}
                </span>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-3">
                <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/40">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-300">
                        Descarte
                    </p>
                    <p className="mt-2 text-lg font-bold text-gray-900 dark:text-gray-100">
                        {formatCurrency(data?.discard_total)}
                    </p>
                </div>
                <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/40">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-300">
                        Faturamento
                    </p>
                    <p className="mt-2 text-lg font-bold text-gray-900 dark:text-gray-100">
                        {formatCurrency(data?.revenue_total)}
                    </p>
                </div>
                <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/40">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-300">
                        Percentual
                    </p>
                    <p className="mt-2 text-lg font-bold text-gray-900 dark:text-gray-100">
                        {formatPercentage(data?.percentage)}
                    </p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-300">
                        Limite: {formatPercentage(threshold ?? 0)}
                    </p>
                </div>
            </div>

            <p className="mt-4 text-xs text-gray-500 dark:text-gray-300">
                Periodo: {formatPeriod(data?.start_date, data?.end_date)}
            </p>
        </div>
    );
}

export default function DiscardConfig({ setting, monitoring }) {
    const {
        data: settingData,
        setData: setSettingData,
        put,
        processing,
        errors,
    } = useForm({
        percentual_aceitavel: setting?.percentual_aceitavel ?? 0,
    });

    const {
        data: filterData,
        setData: setFilterData,
        get,
        processing: filtering,
    } = useForm({
        month: monitoring?.month_filter_value ?? '',
    });

    const handleSubmit = (event) => {
        event.preventDefault();
        put(route('settings.discard-config.update'), {
            preserveScroll: true,
        });
    };

    const handleFilterSubmit = (event) => {
        event.preventDefault();
        get(route('settings.discard-config'), {
            preserveState: true,
            preserveScroll: true,
            replace: true,
            data: filterData,
        });
    };

    const consolidatedToday = monitoring?.consolidated?.today ?? {};
    const consolidatedMonth = monitoring?.consolidated?.month ?? {};
    const stores = monitoring?.stores ?? [];
    const enabled = Boolean(monitoring?.enabled);

    return (
        <AuthenticatedLayout
            header={
                <div className="flex flex-col gap-1">
                    <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">
                        Configuracao do Discarte
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-300">
                        Defina o percentual aceitavel e acompanhe o consolidado de todas as lojas.
                    </p>
                </div>
            }
        >
            <Head title="Configuracao do Discarte" />

            <div className="py-8">
                <div className="mx-auto max-w-7xl space-y-6 px-4 sm:px-6 lg:px-8">
                    <div className="grid gap-6 xl:grid-cols-[1.75fr_0.95fr]">
                        <form
                            onSubmit={handleSubmit}
                            className="rounded-2xl bg-white p-6 shadow dark:bg-gray-800"
                        >
                            <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                Percentual aceitavel
                            </label>
                            <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-center">
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    max="100"
                                    value={settingData.percentual_aceitavel}
                                    onChange={(event) =>
                                        setSettingData('percentual_aceitavel', event.target.value)
                                    }
                                    className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 lg:max-w-[176px] dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                                    placeholder="Ex.: 4"
                                />
                                <div >
                                    <PrimaryButton
                                        type="submit"
                                        disabled={processing}
                                        className="px-5 py-3 text-sm font-semibold normal-case tracking-normal"
                                    >
                                        Salvar configuracao
                                    </PrimaryButton>
                                </div>
                            </div>
                            <InputError message={errors.percentual_aceitavel} className="mt-2" />
                            <p className="mt-3 text-xs text-gray-500 dark:text-gray-300">
                                Se o valor estiver em 0, o sistema nao trata alerta de discarte.
                            </p>
                        </form>

                        <form
                            onSubmit={handleFilterSubmit}
                            className="rounded-2xl bg-white p-6 shadow dark:bg-gray-800"
                        >
                            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-300">
                                Filtro do acumulado
                            </p>
                            <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center">
                                <input
                                    type="month"
                                    value={filterData.month}
                                    onChange={(event) => setFilterData('month', event.target.value)}
                                    aria-label="Mes de referencia"
                                    className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 sm:flex-1 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                                />
                                <div className="sm:shrink-0">
                                    <PrimaryButton
                                        type="submit"
                                        disabled={filtering}
                                        className="w-full justify-center px-5 py-3 text-sm font-semibold normal-case tracking-normal sm:w-auto"
                                    >
                                        Aplicar mes
                                    </PrimaryButton>
                                </div>
                            </div>
                            <p className="mt-3 text-xs text-gray-500 dark:text-gray-300">
                                Hoje usa a data atual. O acumulado considera o mes filtrado.
                            </p>

                        </form>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                        <RangeSummaryCard
                            title="Consolidado de hoje"
                            subtitle={`Todas as lojas permitidas em ${formatBrazilShortDate(
                                monitoring?.today_reference_date,
                            )}.`}
                            data={consolidatedToday}
                            threshold={monitoring?.threshold_percentage}
                            enabled={enabled}
                        />
                        <RangeSummaryCard
                            title="Consolidado acumulado"
                            subtitle={`Todas as lojas permitidas no mes ${monitoring?.month_filter_label ?? '--'}.`}
                            data={consolidatedMonth}
                            threshold={monitoring?.threshold_percentage}
                            enabled={enabled}
                        />
                    </div>

                    <div className="rounded-2xl bg-white p-6 shadow dark:bg-gray-800">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                                    Detalhamento por loja
                                </h3>
                                <p className="text-sm text-gray-500 dark:text-gray-300">
                                    Hoje e acumulado individual das {monitoring?.store_count ?? 0} lojas visiveis.
                                </p>
                            </div>
                            <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-blue-700 shadow-sm dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200">
                                <p className="text-[10px] font-semibold uppercase tracking-wide">
                                    Limite global
                                </p>
                                <p className="text-sm font-bold">
                                    {formatPercentage(monitoring?.threshold_percentage ?? 0)}
                                </p>
                            </div>
                        </div>

                        {stores.length === 0 ? (
                            <p className="mt-4 rounded-xl border border-dashed border-gray-200 px-4 py-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-300">
                                Nenhuma loja disponivel para o monitoramento.
                            </p>
                        ) : (
                            <div className="mt-4 overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-700">
                                    <thead className="bg-gray-100 dark:bg-gray-900/60">
                                        <tr>
                                            <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">
                                                Loja
                                            </th>
                                            <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-300">
                                                Hoje descarte
                                            </th>
                                            <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-300">
                                                Hoje faturamento
                                            </th>
                                            <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-300">
                                                Hoje %
                                            </th>
                                            <th className="px-3 py-2 text-center font-medium text-gray-600 dark:text-gray-300">
                                                Hoje status
                                            </th>
                                            <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-300">
                                                Acumulado descarte
                                            </th>
                                            <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-300">
                                                Acumulado faturamento
                                            </th>
                                            <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-300">
                                                Acumulado %
                                            </th>
                                            <th className="px-3 py-2 text-center font-medium text-gray-600 dark:text-gray-300">
                                                Acumulado status
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                        {stores.map((store) => {
                                            const todayStatus = resolveStatusMeta(
                                                enabled,
                                                Boolean(store?.today?.exceeded),
                                            );
                                            const monthStatus = resolveStatusMeta(
                                                enabled,
                                                Boolean(store?.month?.exceeded),
                                            );

                                            return (
                                                <tr key={store.unit_id}>
                                                    <td className="px-3 py-3 text-gray-800 dark:text-gray-100">
                                                        <div className="font-semibold">
                                                            {store.unit_name}
                                                        </div>
                                                        <div className="mt-1 text-xs text-gray-500 dark:text-gray-300">
                                                            Acumulado:{' '}
                                                            {formatPeriod(
                                                                store?.month?.start_date,
                                                                store?.month?.end_date,
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-gray-100">
                                                        {formatCurrency(store?.today?.discard_total)}
                                                    </td>
                                                    <td className="px-3 py-3 text-right text-gray-700 dark:text-gray-200">
                                                        {formatCurrency(store?.today?.revenue_total)}
                                                    </td>
                                                    <td className="px-3 py-3 text-right text-gray-700 dark:text-gray-200">
                                                        {formatPercentage(store?.today?.percentage)}
                                                    </td>
                                                    <td className="px-3 py-3 text-center">
                                                        <span
                                                            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${todayStatus.className}`}
                                                        >
                                                            <i
                                                                className={todayStatus.icon}
                                                                aria-hidden="true"
                                                            ></i>
                                                            {todayStatus.label}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-gray-100">
                                                        {formatCurrency(store?.month?.discard_total)}
                                                    </td>
                                                    <td className="px-3 py-3 text-right text-gray-700 dark:text-gray-200">
                                                        {formatCurrency(store?.month?.revenue_total)}
                                                    </td>
                                                    <td className="px-3 py-3 text-right text-gray-700 dark:text-gray-200">
                                                        {formatPercentage(store?.month?.percentage)}
                                                    </td>
                                                    <td className="px-3 py-3 text-center">
                                                        <span
                                                            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${monthStatus.className}`}
                                                        >
                                                            <i
                                                                className={monthStatus.icon}
                                                                aria-hidden="true"
                                                            ></i>
                                                            {monthStatus.label}
                                                        </span>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
