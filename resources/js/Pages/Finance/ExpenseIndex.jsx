import AlertMessage from '@/Components/Alert/AlertMessage';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { formatBrazilDate, getBrazilTodayInputValue } from '@/Utils/date';
import { Head, useForm, usePage } from '@inertiajs/react';
import { useState } from 'react';

const formatCurrency = (value) =>
    Number(value ?? 0).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });

const formatDate = (value) => {
    if (!value) {
        return '--/--/----';
    }

    return formatBrazilDate(value);
};

const normalizeInputDate = (value) => {
    if (!value) {
        return '';
    }

    return String(value).slice(0, 10);
};

export default function ExpenseIndex({
    suppliers = [],
    expenses = [],
    activeUnit = null,
    canFilterList = false,
    filterUnits = [],
    filters = {},
    listTotalAmount = 0,
}) {
    const { flash } = usePage().props;
    const defaultSupplier = suppliers.length ? String(suppliers[0].id) : '';
    const today = getBrazilTodayInputValue();
    const hasActiveUnit = Boolean(activeUnit?.id);
    const [editingExpense, setEditingExpense] = useState(null);
    const { data, setData, post, put, processing, errors } = useForm({
        supplier_id: defaultSupplier,
        expense_date: today,
        amount: '',
        notes: '',
    });
    const {
        data: filterData,
        setData: setFilterData,
        get,
        processing: filterProcessing,
    } = useForm({
        start_date: filters.start_date ?? '',
        end_date: filters.end_date ?? '',
        unit_id: filters.unit_id ?? 'all',
    });

    const buildFilterParams = () => {
        if (!canFilterList) {
            return {};
        }

        return {
            start_date: filterData.start_date,
            end_date: filterData.end_date,
            unit_id: filterData.unit_id,
        };
    };

    const handleSubmit = (event) => {
        event.preventDefault();

        if (editingExpense?.id) {
            put(route('expenses.update', { expense: editingExpense.id, ...buildFilterParams() }), {
                preserveScroll: true,
                onSuccess: () => {
                    setEditingExpense(null);
                    resetForm();
                },
            });

            return;
        }

        post(route('expenses.store', buildFilterParams()), {
            preserveScroll: true,
            onSuccess: () => resetForm(),
        });
    };

    const handleFilterSubmit = (event) => {
        event.preventDefault();
        get(route('expenses.index'), {
            preserveState: true,
            preserveScroll: true,
            replace: true,
            data: buildFilterParams(),
        });
    };

    const resetForm = () => {
        setData({
            supplier_id: defaultSupplier,
            expense_date: today,
            amount: '',
            notes: '',
        });
    };

    const handleEdit = (expense) => {
        if (!expense?.id) {
            return;
        }

        setEditingExpense(expense);
        setData({
            supplier_id: expense.supplier_id ? String(expense.supplier_id) : defaultSupplier,
            expense_date: normalizeInputDate(expense.expense_date) || today,
            amount: expense.amount !== null && expense.amount !== undefined ? String(expense.amount) : '',
            notes: expense.notes ?? '',
        });
    };

    const handleCancelEdit = () => {
        setEditingExpense(null);
        resetForm();
    };

    const headerContent = (
        <div>
            <h2 className="text-xl font-semibold leading-tight text-gray-800 dark:text-gray-200">
                Gastos
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-300">
                Cadastre gastos com fornecedor, data, valor e observacao.
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-300">
                Unidade ativa: <span className="font-semibold text-gray-700 dark:text-gray-200">{activeUnit?.name ?? '--'}</span>
            </p>
        </div>
    );

    return (
        <AuthenticatedLayout header={headerContent}>
            <Head title="Gastos" />

            <div className="py-12">
                <div className="mx-auto max-w-6xl space-y-6 px-4 sm:px-6 lg:px-8">
                    <AlertMessage message={flash} />

                    <div className="rounded-2xl bg-white p-6 shadow dark:bg-gray-800">
                        {!hasActiveUnit && (
                            <p className="mb-4 text-sm text-red-600">
                                Nenhuma unidade ativa definida. Selecione uma unidade para cadastrar gastos.
                            </p>
                        )}
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="grid gap-4 md:grid-cols-4">
                                <div className="md:col-span-2">
                                    <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                        Fornecedor
                                    </label>
                                    <select
                                        value={data.supplier_id}
                                        onChange={(event) => setData('supplier_id', event.target.value)}
                                        className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-gray-800 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                                        disabled={!suppliers.length || !hasActiveUnit}
                                    >
                                        {!suppliers.length ? (
                                            <option value="">Nenhum fornecedor cadastrado</option>
                                        ) : (
                                            suppliers.map((supplier) => (
                                                <option key={supplier.id} value={supplier.id}>
                                                    {supplier.name}
                                                </option>
                                            ))
                                        )}
                                    </select>
                                    {errors.supplier_id && (
                                        <p className="text-sm text-red-600">{errors.supplier_id}</p>
                                    )}
                                </div>

                                <div>
                                    <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                        Data
                                    </label>
                                    <input
                                        type="date"
                                        value={data.expense_date}
                                        onChange={(event) => setData('expense_date', event.target.value)}
                                        className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-gray-800 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:disabled:bg-gray-800 dark:disabled:text-gray-400"
                                        disabled={!hasActiveUnit || Boolean(editingExpense)}
                                    />
                                    {editingExpense && (
                                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                            A data do gasto nao pode ser alterada na edicao.
                                        </p>
                                    )}
                                    {errors.expense_date && (
                                        <p className="text-sm text-red-600">{errors.expense_date}</p>
                                    )}
                                </div>

                                <div>
                                    <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                        Valor (R$)
                                    </label>
                                    <input
                                        type="number"
                                        min="0.01"
                                        step="0.01"
                                        value={data.amount}
                                        onChange={(event) => setData('amount', event.target.value)}
                                        className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-gray-800 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                                        disabled={!hasActiveUnit}
                                    />
                                    {errors.amount && (
                                        <p className="text-sm text-red-600">{errors.amount}</p>
                                    )}
                                </div>
                            </div>

                            <div>
                                <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                    Observacao
                                </label>
                                <textarea
                                    rows={3}
                                    value={data.notes}
                                    onChange={(event) => setData('notes', event.target.value)}
                                    className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-gray-800 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                                    placeholder="Descreva o gasto"
                                    disabled={!hasActiveUnit}
                                />
                                {errors.notes && (
                                    <p className="text-sm text-red-600">{errors.notes}</p>
                                )}
                            </div>

                            <div className="flex justify-end">
                                <div className="flex gap-2">
                                    {editingExpense && (
                                        <button
                                            type="button"
                                            onClick={handleCancelEdit}
                                            className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                                        >
                                            Cancelar
                                        </button>
                                    )}
                                    <button
                                        type="submit"
                                        disabled={processing || !suppliers.length || !hasActiveUnit}
                                        className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-700 disabled:opacity-50"
                                    >
                                        {editingExpense ? 'Atualizar' : 'Salvar'}
                                    </button>
                                </div>
                            </div>
                        </form>
                    </div>

                    {canFilterList && (
                        <form
                            onSubmit={handleFilterSubmit}
                            className="rounded-2xl bg-white p-5 shadow dark:bg-gray-800"
                        >
                            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto_auto]">
                                <div>
                                    <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                        Loja
                                    </label>
                                    <select
                                        value={filterData.unit_id}
                                        onChange={(event) => setFilterData('unit_id', event.target.value)}
                                        className="mt-2 w-full rounded-2xl border border-gray-300 px-4 py-3 text-gray-800 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                                    >
                                        <option value="all">Todas</option>
                                        {filterUnits.map((unit) => (
                                            <option key={unit.id} value={unit.id}>
                                                {unit.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                        Inicio
                                    </label>
                                    <input
                                        type="date"
                                        value={filterData.start_date}
                                        onChange={(event) => setFilterData('start_date', event.target.value)}
                                        className="mt-2 w-full rounded-2xl border border-gray-300 px-4 py-3 text-gray-800 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                                    />
                                </div>

                                <div>
                                    <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                        Fim
                                    </label>
                                    <input
                                        type="date"
                                        value={filterData.end_date}
                                        onChange={(event) => setFilterData('end_date', event.target.value)}
                                        className="mt-2 w-full rounded-2xl border border-gray-300 px-4 py-3 text-gray-800 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                                    />
                                </div>

                                <div className="rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-indigo-700 shadow-sm dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-200">
                                    <p className="text-[10px] font-semibold uppercase tracking-wide">
                                        Total
                                    </p>
                                    <p className="mt-1 text-lg font-bold">
                                        {formatCurrency(listTotalAmount)}
                                    </p>
                                </div>

                                <div className="flex items-end">
                                    <button
                                        type="submit"
                                        disabled={filterProcessing}
                                        className="w-full rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow hover:bg-indigo-700 disabled:opacity-60"
                                    >
                                        Filtrar
                                    </button>
                                </div>
                            </div>
                        </form>
                    )}

                    <div className="rounded-2xl bg-white p-6 shadow dark:bg-gray-800">
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                                Listagem de gastos
                            </h3>
                            <span className="text-xs font-semibold text-gray-500 dark:text-gray-300">
                                {expenses.length} registro(s)
                            </span>
                        </div>
                        <div className="overflow-x-auto">
                            {expenses.length ? (
                                <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-700">
                                    <thead className="bg-gray-50 dark:bg-gray-900/40">
                                        <tr>
                                            <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">
                                                Fornecedor
                                            </th>
                                            <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">
                                                Loja
                                            </th>
                                            <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">
                                                Usuario
                                            </th>
                                            <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">
                                                Data
                                            </th>
                                            <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-300">
                                                Valor
                                            </th>
                                            <th className="px-3 py-2 text-center font-medium text-gray-600 dark:text-gray-300">
                                                Acoes
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                        {expenses.map((expense) => (
                                            <tr key={expense.id} title={expense.notes ?? ''}>
                                                <td className="px-3 py-2 text-gray-800 dark:text-gray-100">
                                                    {expense.supplier?.name ?? '---'}
                                                </td>
                                                <td className="px-3 py-2 text-gray-700 dark:text-gray-200">
                                                    {expense.unit?.tb2_nome ?? '---'}
                                                </td>
                                                <td className="px-3 py-2 text-gray-700 dark:text-gray-200">
                                                    {expense.user?.name ?? '---'}
                                                </td>
                                                <td className="px-3 py-2 text-gray-700 dark:text-gray-200">
                                                    {formatDate(expense.expense_date)}
                                                </td>
                                                <td className="px-3 py-2 text-right font-semibold text-gray-900 dark:text-white">
                                                    {formatCurrency(expense.amount)}
                                                </td>
                                                <td className="px-3 py-2 text-center">
                                                    {expense.can_edit ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleEdit(expense)}
                                                            className="rounded-lg border border-indigo-200 px-3 py-1 text-xs font-semibold text-indigo-600 transition hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-indigo-500/60 dark:text-indigo-300 dark:hover:bg-indigo-500/10"
                                                        >
                                                            Editar
                                                        </button>
                                                    ) : (
                                                        <span className="text-xs text-gray-400 dark:text-gray-500">
                                                            --
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            ) : (
                                <p className="text-sm text-gray-500 dark:text-gray-300">
                                    Nenhum gasto cadastrado.
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
