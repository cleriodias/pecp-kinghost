import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { formatBrazilDateTime } from '@/Utils/date';
import { Head, useForm } from '@inertiajs/react';

const formatCurrency = (value) =>
    Number(value ?? 0).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });

const formatQuantity = (value) =>
    Number(value ?? 0).toLocaleString('pt-BR', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 3,
    });

const formatDateTime = (value) => {
    if (!value) {
        return '--';
    }

    return formatBrazilDateTime(value);
};

const SummaryCard = ({ title, value, description, accentClass }) => (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-300">
            {title}
        </p>
        <p className={`mt-2 text-2xl font-bold ${accentClass}`}>
            {value}
        </p>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-300">
            {description}
        </p>
    </div>
);

export default function DiscardConsolidated({
    rows = [],
    summary = {},
    monthValue,
    monthLabel,
    unit,
    filterUnits = [],
    selectedUnitId = null,
}) {
    const { data, setData, get, processing } = useForm({
        month: monthValue ?? '',
        unit_id:
            selectedUnitId !== null && selectedUnitId !== undefined
                ? String(selectedUnitId)
                : '',
    });

    const handleSubmit = (event) => {
        event.preventDefault();
        get(route('reports.descarte.consolidado'), {
            preserveState: true,
            preserveScroll: true,
            replace: true,
            data,
        });
    };

    const topQuantityProduct = summary?.top_quantity_product ?? null;
    const topValueProduct = summary?.top_value_product ?? null;

    return (
        <AuthenticatedLayout
            header={
                <div>
                    <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">
                        Discarte Consolidado
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-300">
                        Ranking de itens mais descartados no mes. Loja atual: {unit?.name ?? '---'}.
                    </p>
                </div>
            }
        >
            <Head title="Discarte Consolidado" />

            <div className="py-8">
                <div className="mx-auto max-w-7xl space-y-6 px-4 sm:px-6 lg:px-8">
                    <form
                        onSubmit={handleSubmit}
                        className="rounded-2xl bg-white p-4 shadow dark:bg-gray-800"
                    >
                        <div className="flex flex-wrap items-end gap-3">
                            <div>
                                <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                    Loja
                                </label>
                                <select
                                    value={data.unit_id}
                                    onChange={(event) => setData('unit_id', event.target.value)}
                                    className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                                >
                                    {filterUnits.map((filterUnit) => (
                                        <option key={filterUnit.id} value={filterUnit.id}>
                                            {filterUnit.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                    Mes
                                </label>
                                <input
                                    type="month"
                                    value={data.month}
                                    onChange={(event) => setData('month', event.target.value)}
                                    className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={processing}
                                className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-700 disabled:opacity-60"
                            >
                                Filtrar
                            </button>
                        </div>

                        <p className="mt-4 text-xs text-gray-500 dark:text-gray-300">
                            Referencia: {monthLabel ?? '--'}.
                        </p>
                    </form>

                    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        <SummaryCard
                            title="Itens distintos"
                            value={String(summary?.products_count ?? 0)}
                            description="Produtos agrupados no filtro atual."
                            accentClass="text-indigo-700 dark:text-indigo-300"
                        />
                        <SummaryCard
                            title="Quantidade descartada"
                            value={formatQuantity(summary?.total_quantity ?? 0)}
                            description="Soma de todas as quantidades descartadas."
                            accentClass="text-rose-700 dark:text-rose-300"
                        />
                        <SummaryCard
                            title="Valor total"
                            value={formatCurrency(summary?.total_value ?? 0)}
                            description="Total financeiro estimado dos descartes."
                            accentClass="text-emerald-700 dark:text-emerald-300"
                        />
                        <SummaryCard
                            title="Lider por quantidade"
                            value={topQuantityProduct?.product ?? 'Nenhum'}
                            description={
                                topQuantityProduct
                                    ? `${formatQuantity(topQuantityProduct.total_quantity)} descartados em ${topQuantityProduct.occurrences} registros`
                                    : 'Nenhum descarte encontrado no filtro.'
                            }
                            accentClass="text-amber-700 dark:text-amber-300"
                        />
                    </section>

                    <section className="grid gap-4 md:grid-cols-1 xl:grid-cols-2">
                        <SummaryCard
                            title="Maior soma por valor"
                            value={topValueProduct?.product ?? 'Nenhum'}
                            description={
                                topValueProduct
                                    ? `${formatCurrency(topValueProduct.total_value)} acumulados no filtro`
                                    : 'Nenhum descarte encontrado no filtro.'
                            }
                            accentClass="text-emerald-700 dark:text-emerald-300"
                        />
                        <SummaryCard
                            title="Loja analisada"
                            value={unit?.name ?? '---'}
                            description="Este relatorio sempre considera uma loja individual."
                            accentClass="text-slate-700 dark:text-slate-200"
                        />
                    </section>

                    <div className="rounded-2xl bg-white p-6 shadow dark:bg-gray-800">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                                    Ranking de descarte
                                </h3>
                                <p className="text-sm text-gray-500 dark:text-gray-300">
                                    Ordenado por quantidade, com destaque adicional para o maior valor acumulado.
                                </p>
                            </div>
                            <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-indigo-700 shadow-sm dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-200">
                                <p className="text-[10px] font-semibold uppercase tracking-wide">
                                    Registros agrupados
                                </p>
                                <p className="text-sm font-bold">
                                    {summary?.total_occurrences ?? 0}
                                </p>
                            </div>
                        </div>

                        {rows.length === 0 ? (
                            <p className="mt-4 rounded-xl border border-dashed border-gray-200 px-4 py-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-300">
                                Nenhum descarte encontrado para o filtro selecionado.
                            </p>
                        ) : (
                            <div className="mt-4 overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-700">
                                    <thead className="bg-gray-100 dark:bg-gray-900/60">
                                        <tr>
                                            <th className="px-3 py-2 text-center font-medium text-gray-600 dark:text-gray-300">
                                                Rank
                                            </th>
                                            <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">
                                                Produto
                                            </th>
                                            <th className="px-3 py-2 text-center font-medium text-gray-600 dark:text-gray-300">
                                                Registros
                                            </th>
                                            <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-300">
                                                Quantidade
                                            </th>
                                            <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-300">
                                                Valor medio
                                            </th>
                                            <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-300">
                                                Valor total
                                            </th>
                                            <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">
                                                Ultimo descarte
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                        {rows.map((row) => (
                                            (() => {
                                                const isTopQuantity =
                                                    topQuantityProduct
                                                    && row.product === topQuantityProduct.product
                                                    && Number(row.total_quantity) === Number(topQuantityProduct.total_quantity)
                                                    && Number(row.total_value) === Number(topQuantityProduct.total_value);
                                                const isTopValue =
                                                    topValueProduct
                                                    && row.product === topValueProduct.product
                                                    && Number(row.total_value) === Number(topValueProduct.total_value)
                                                    && Number(row.total_quantity) === Number(topValueProduct.total_quantity);
                                                const rowClassName =
                                                    isTopQuantity && isTopValue
                                                        ? 'bg-gradient-to-r from-amber-50 to-emerald-50 dark:from-amber-500/10 dark:to-emerald-500/10'
                                                        : isTopQuantity
                                                            ? 'bg-amber-50/60 dark:bg-amber-500/10'
                                                            : isTopValue
                                                                ? 'bg-emerald-50/70 dark:bg-emerald-500/10'
                                                                : '';

                                                return (
                                            <tr
                                                key={`${row.product_id ?? row.product}-${row.rank}`}
                                                className={rowClassName}
                                            >
                                                <td className="px-3 py-2 text-center font-bold text-gray-700 dark:text-gray-200">
                                                    {row.rank}
                                                </td>
                                                <td className="px-3 py-2 text-gray-800 dark:text-gray-100">
                                                    <div className="font-semibold">{row.product}</div>
                                                    <div className="mt-1 flex flex-wrap gap-2 text-xs">
                                                        {isTopQuantity ? (
                                                            <span className="rounded-full bg-amber-100 px-2 py-1 font-semibold text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">
                                                                Lider em quantidade
                                                            </span>
                                                        ) : null}
                                                        {isTopValue ? (
                                                            <span className="rounded-full bg-emerald-100 px-2 py-1 font-semibold text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300">
                                                                Lider em valor
                                                            </span>
                                                        ) : null}
                                                    </div>
                                                </td>
                                                <td className="px-3 py-2 text-center text-gray-700 dark:text-gray-200">
                                                    {row.occurrences}
                                                </td>
                                                <td className="px-3 py-2 text-right font-semibold text-gray-900 dark:text-gray-100">
                                                    {formatQuantity(row.total_quantity)}
                                                </td>
                                                <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-200">
                                                    {formatCurrency(row.average_unit_price)}
                                                </td>
                                                <td className="px-3 py-2 text-right font-semibold text-emerald-700 dark:text-emerald-300">
                                                    {formatCurrency(row.total_value)}
                                                </td>
                                                <td className="px-3 py-2 text-gray-700 dark:text-gray-200">
                                                    {formatDateTime(row.last_discard_at)}
                                                </td>
                                            </tr>
                                                );
                                            })()
                                        ))}
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
