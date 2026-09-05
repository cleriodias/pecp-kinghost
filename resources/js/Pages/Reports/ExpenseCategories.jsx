import Modal from '@/Components/Modal';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { formatBrazilShortDate } from '@/Utils/date';
import { Head, Link, useForm } from '@inertiajs/react';
import { useState } from 'react';

const formatCurrency = (value) =>
    Number(value ?? 0).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });

function DateField({ label, displayValue, isoValue, onChange, ariaLabel }) {
    return (
        <div className="min-w-[140px]">
            <label className="text-sm font-medium text-stone-700 dark:text-stone-200">
                {label}
            </label>
            <div className="relative mt-2">
                <div className="flex min-h-[42px] items-center rounded-[22px] border border-stone-300 bg-white px-4 py-2 text-sm text-stone-800 shadow-sm transition focus-within:border-slate-600 focus-within:ring-2 focus-within:ring-slate-200 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100">
                    <span className="pointer-events-none">{displayValue || 'DD/MM/AA'}</span>
                    <span className="pointer-events-none ml-auto text-base text-stone-400 dark:text-stone-300">
                        <i className="bi bi-calendar3" aria-hidden="true" />
                    </span>
                </div>
                <input
                    type="date"
                    value={isoValue}
                    onChange={onChange}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    aria-label={ariaLabel}
                />
            </div>
        </div>
    );
}

export default function ExpenseCategories({
    categories = [],
    startDate = '',
    endDate = '',
    unit = null,
    filterUnits = [],
    selectedUnitId = null,
    totalPersonal = 0,
}) {
    const [selectedCategory, setSelectedCategory] = useState(null);
    const { data, setData, get, processing } = useForm({
        start_date: startDate ?? '',
        end_date: endDate ?? '',
        unit_id:
            selectedUnitId !== null && selectedUnitId !== undefined
                ? String(selectedUnitId)
                : 'all',
    });

    const handleSubmit = (event) => {
        event.preventDefault();

        get(route('reports.gastos.categorias'), {
            preserveState: true,
            preserveScroll: true,
            replace: true,
            data,
        });
    };

    const handlePrint = () => {
        window.print();
    };

    const closeDetail = () => setSelectedCategory(null);

    return (
        <AuthenticatedLayout
            header={
                <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                    <div>
                        <h2 className="text-xl font-semibold leading-tight text-gray-800 dark:text-gray-100">
                            Gastos por categoria
                        </h2>
                        <p className="text-sm text-gray-500 dark:text-gray-300">
                            Categorias agrupadas com detalhamento. Unidade atual: {unit?.name ?? '---'}.
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-2 print:hidden">
                        <Link
                            href={route('reports.gastos')}
                            className="inline-flex items-center justify-center rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700 shadow-sm transition hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-700 dark:text-stone-100 dark:hover:bg-stone-600"
                        >
                            Ver gastos
                        </Link>
                        <button
                            type="button"
                            onClick={handlePrint}
                            className="inline-flex items-center justify-center rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-700"
                        >
                            Imprimir
                        </button>
                    </div>
                </div>
            }
        >
            <Head title="Gastos por categoria" />

            <div className="min-h-screen bg-[#f5efe6] py-8 text-stone-900 print:bg-white print:py-0">
                <div className="mx-auto max-w-6xl space-y-6 px-4 sm:px-6 lg:px-8">
                    <form
                        onSubmit={handleSubmit}
                        className="rounded-[2rem] border border-stone-200 bg-white/90 p-5 shadow-[0_10px_30px_rgba(28,20,15,0.08)] backdrop-blur print:hidden"
                    >
                        <div className="flex flex-wrap items-end gap-3">
                            <DateField
                                label="Inicio"
                                displayValue={formatBrazilShortDate(data.start_date)}
                                isoValue={data.start_date}
                                onChange={(event) => setData('start_date', event.target.value)}
                                ariaLabel="Selecionar data inicial"
                            />
                            <DateField
                                label="Fim"
                                displayValue={formatBrazilShortDate(data.end_date)}
                                isoValue={data.end_date}
                                onChange={(event) => setData('end_date', event.target.value)}
                                ariaLabel="Selecionar data final"
                            />
                            <div className="min-w-[190px]">
                                <label className="text-sm font-medium text-stone-700 dark:text-stone-200">
                                    Loja
                                </label>
                                <select
                                    value={data.unit_id}
                                    onChange={(event) => setData('unit_id', event.target.value)}
                                    className="mt-2 w-full rounded-[22px] border border-stone-300 bg-white px-4 py-3 text-sm text-stone-800 shadow-sm focus:border-slate-600 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100"
                                >
                                    <option value="all">Todas</option>
                                    {filterUnits.map((filterUnit) => (
                                        <option key={filterUnit.id} value={filterUnit.id}>
                                            {filterUnit.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <button
                                type="submit"
                                disabled={processing}
                                className="rounded-[22px] bg-slate-800 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-700 disabled:opacity-60"
                            >
                                Filtrar
                            </button>
                        </div>
                    </form>

                    <section className="grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(280px,0.75fr)]">
                        <div className="rounded-[2rem] border border-[#d7cfc2] bg-[#fbf8f3] p-6 shadow-[0_10px_30px_rgba(28,20,15,0.08)]">
                            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#5a4a3f]">
                                Total pessoal
                            </p>
                            <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                                <div>
                                    <p className="text-5xl font-black tracking-tight text-[#2d2018]">
                                        {formatCurrency(totalPersonal)}
                                    </p>
                                    <p className="mt-2 text-sm text-[#6d5c50]">
                                        {categories.length} categoria(s) encontrada(s)
                                    </p>
                                </div>

                                <div className="rounded-[1.5rem] border border-[#d1e3e8] bg-[#dbe9ec] px-5 py-4 text-[#5d4a3c] shadow-sm">
                                    <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#627b86]">
                                        Periodo
                                    </p>
                                    <p className="mt-2 text-lg font-bold">
                                        {formatBrazilShortDate(data.start_date)} a {formatBrazilShortDate(data.end_date)}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="rounded-[2rem] border border-[#d7cfc2] bg-[#dbe9ec] p-6 shadow-[0_10px_30px_rgba(28,20,15,0.08)]">
                            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#5c7480]">
                                Resumo
                            </p>
                            <div className="mt-4 flex h-full flex-col justify-between">
                                <div>
                                    <p className="text-3xl font-black text-[#2d2018]">
                                        {categories.length} categoria(s)
                                    </p>
                                    <p className="mt-2 text-base font-semibold text-[#5d4a3c]">
                                        Clique em <span className="font-black">Ver detalhado</span> para abrir os lançamentos.
                                    </p>
                                </div>
                                <p className="mt-6 text-sm text-[#5d4a3c]">
                                    Tela preparada para impressão no computador.
                                </p>
                            </div>
                        </div>
                    </section>

                    <section className="rounded-[2rem] border border-stone-200 bg-white/95 p-6 shadow-[0_10px_30px_rgba(28,20,15,0.08)]">
                        <div className="flex flex-col gap-1 border-b border-stone-200 pb-4">
                            <h3 className="text-2xl font-black text-[#2d2018]">
                                Categorias existentes
                            </h3>
                            <p className="text-sm text-stone-500">
                                Registros agrupados por categoria com acesso ao detalhamento.
                            </p>
                        </div>

                        {categories.length === 0 ? (
                            <p className="mt-5 rounded-2xl border border-dashed border-stone-300 px-4 py-6 text-center text-sm text-stone-500">
                                Nenhuma categoria encontrada para o periodo selecionado.
                            </p>
                        ) : (
                            <div className="mt-5 space-y-4">
                                {categories.map((category) => (
                                    <article
                                        key={category.id}
                                        className="rounded-[1.75rem] border border-[#ddd2c2] bg-[#fbf8f3] p-4 shadow-sm"
                                    >
                                        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                                            <div>
                                                <h4 className="text-2xl font-black text-[#2d2018]">
                                                    {category.category_name}
                                                </h4>
                                                <p className="mt-2 text-sm font-semibold text-[#6d5c50]">
                                                    {category.records_count} lancamento(s)
                                                </p>
                                            </div>

                                            <div className="flex flex-wrap items-center gap-3">
                                                <div className="rounded-2xl border border-[#b8d6df] bg-[#dbe9ec] px-4 py-3 text-[#35556c]">
                                                    <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#5f7680]">
                                                        Total
                                                    </p>
                                                    <p className="mt-1 text-2xl font-black">
                                                        {formatCurrency(category.total_amount)}
                                                    </p>
                                                </div>

                                                <button
                                                    type="button"
                                                    onClick={() => setSelectedCategory(category)}
                                                    className="rounded-2xl border border-[#d9b8b0] bg-[#f5e7e4] px-4 py-3 text-sm font-bold text-[#9b4a3e] transition hover:bg-[#f1ddd8] print:hidden"
                                                >
                                                    Ver detalhado
                                                </button>
                                            </div>
                                        </div>
                                    </article>
                                ))}
                            </div>
                        )}
                    </section>
                </div>
            </div>

            <Modal show={Boolean(selectedCategory)} onClose={closeDetail} maxWidth="4xl" tone="light">
                <div className="bg-white p-6 text-stone-900">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <p className="text-xs font-bold uppercase tracking-[0.3em] text-stone-400">
                                Detalhado
                            </p>
                            <h3 className="mt-2 text-2xl font-black text-[#2d2018]">
                                {selectedCategory?.category_name}
                            </h3>
                            <p className="mt-1 text-sm text-stone-500">
                                {selectedCategory?.records_count ?? 0} lancamento(s) nesta categoria.
                            </p>
                        </div>

                        <button
                            type="button"
                            onClick={closeDetail}
                            className="text-sm font-semibold text-stone-500 transition hover:text-stone-800"
                        >
                            Fechar
                        </button>
                    </div>

                    {selectedCategory && (
                        <>
                            <div className="mt-6 grid gap-3 sm:grid-cols-3">
                                <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                                    <p className="text-xs font-bold uppercase tracking-[0.25em] text-stone-400">
                                        Categoria
                                    </p>
                                    <p className="mt-2 text-lg font-bold text-stone-900">
                                        {selectedCategory.category_name}
                                    </p>
                                </div>
                                <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                                    <p className="text-xs font-bold uppercase tracking-[0.25em] text-stone-400">
                                        Lançamentos
                                    </p>
                                    <p className="mt-2 text-lg font-bold text-stone-900">
                                        {selectedCategory.records_count}
                                    </p>
                                </div>
                                <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                                    <p className="text-xs font-bold uppercase tracking-[0.25em] text-stone-400">
                                        Total
                                    </p>
                                    <p className="mt-2 text-lg font-bold text-stone-900">
                                        {formatCurrency(selectedCategory.total_amount)}
                                    </p>
                                </div>
                            </div>

                            <div className="mt-6 max-h-[30rem] overflow-y-auto">
                                <table className="min-w-full divide-y divide-stone-200 text-sm">
                                    <thead className="bg-stone-100">
                                        <tr>
                                            <th className="px-3 py-2 text-left font-medium text-stone-600">
                                                Data
                                            </th>
                                            <th className="px-3 py-2 text-left font-medium text-stone-600">
                                                Fornecedor
                                            </th>
                                            <th className="px-3 py-2 text-left font-medium text-stone-600">
                                                Loja
                                            </th>
                                            <th className="px-3 py-2 text-left font-medium text-stone-600">
                                                Usuario
                                            </th>
                                            <th className="px-3 py-2 text-right font-medium text-stone-600">
                                                Valor
                                            </th>
                                            <th className="px-3 py-2 text-left font-medium text-stone-600">
                                                Observacao
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-stone-100">
                                        {(selectedCategory.records ?? []).map((record) => (
                                            <tr key={record.id}>
                                                <td className="px-3 py-2 text-stone-700">
                                                    {formatBrazilShortDate(record.expense_date)}
                                                </td>
                                                <td className="px-3 py-2 text-stone-800">
                                                    {record.supplier ?? '---'}
                                                </td>
                                                <td className="px-3 py-2 text-stone-700">
                                                    {record.unit ?? '---'}
                                                </td>
                                                <td className="px-3 py-2 text-stone-700">
                                                    {record.user_name ?? '---'}
                                                </td>
                                                <td className="px-3 py-2 text-right font-semibold text-stone-900">
                                                    {formatCurrency(record.amount)}
                                                </td>
                                                <td className="px-3 py-2 text-stone-700">
                                                    {record.notes || '--'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <div className="mt-6 flex justify-end gap-3 print:hidden">
                                <button
                                    type="button"
                                    onClick={closeDetail}
                                    className="rounded-xl border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
                                >
                                    Fechar
                                </button>
                                <button
                                    type="button"
                                    onClick={handlePrint}
                                    className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
                                >
                                    Imprimir
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </Modal>
        </AuthenticatedLayout>
    );
}
