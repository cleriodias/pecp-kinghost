import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { formatBrazilDate } from '@/Utils/date';
import { Head, router } from '@inertiajs/react';
import { useMemo } from 'react';

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

export default function SalaryAdvanceIndex({ advances, filters = {}, units = [], canDeleteAdvances = false }) {
    const createUrl = route('salary-advances.create');

    const handleDelete = (advanceId) => {
        if (!advanceId) {
            return;
        }

        if (!window.confirm('Confirma excluir este adiantamento?')) {
            return;
        }

        router.delete(route('salary-advances.destroy', advanceId));
    };
    const totalAmount = useMemo(
        () => advances.data.reduce((sum, advance) => sum + Number(advance.amount ?? 0), 0),
        [advances.data],
    );
    const header = (
        <div>
            <h2 className="text-xl font-semibold leading-tight text-gray-800 dark:text-gray-200">
                Adiantamentos registrados
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-300">
                Liste e acompanhe os adiantamentos de cada colaborador.
            </p>
        </div>
    );

    return (
        <AuthenticatedLayout header={header}>
            <Head title="Adiantamentos" />

            <div className="py-12">
                <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                    <div className="rounded-2xl bg-white p-6 shadow dark:bg-gray-800">
                        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                            <div className="flex flex-wrap gap-3">
                                <div>
                                    <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                        Mês/Ano&nbsp;
                                    </label>
                                    <input
                                        type="month"
                                        value={filters.month ?? ''}
                                        onChange={(e) =>
                                            router.get(
                                                route('salary-advances.index'),
                                                { ...filters, month: e.target.value || null },
                                                { preserveState: true, preserveScroll: true, replace: true },
                                            )
                                        }
                                        className="mt-1 w-52 rounded-xl border border-gray-300 px-3 py-2 text-gray-800 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                                    />
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                        Unidade&nbsp;
                                    </label>
                                    <select
                                        value={filters.unit_id ?? ''}
                                        onChange={(e) =>
                                            router.get(
                                                route('salary-advances.index'),
                                                { ...filters, unit_id: e.target.value || null },
                                                { preserveState: true, preserveScroll: true, replace: true },
                                            )
                                        }
                                        className="mt-1 w-48 rounded-xl border border-gray-300 px-3 py-2 text-gray-800 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                                    >
                                        <option value="">Todas</option>
                                        {units.map((unit) => (
                                            <option key={unit.tb2_id} value={unit.tb2_id}>
                                                {unit.tb2_nome}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div className="flex justify-end">
                                <a
                                    href={createUrl}
                                    className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-700"
                                >
                                    Novo adiantamento
                                </a>
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-700">
                                <thead className="bg-gray-50 dark:bg-gray-900/40">
                                    <tr>
                                        <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">
                                            Data
                                        </th>
                                        <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">
                                            Usuario
                                        </th>
                                        <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-300">
                                            Valor
                                        </th>
                                        <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">
                                            Motivo
                                        </th>
                                        <th className="px-3 py-2 text-center font-medium text-gray-600 dark:text-gray-300">
                                            Ações
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                    {advances.data.map((advance) => (
                                        <tr key={advance.id}>
                                            <td className="px-3 py-2 text-gray-700 dark:text-gray-200">
                                                {formatDate(advance.advance_date)}
                                            </td>
                                            <td className="px-3 py-2 text-gray-800 dark:text-gray-100">
                                                {advance.user?.name ?? '---'}
                                            </td>
                                            <td className="px-3 py-2 text-right font-semibold text-gray-900 dark:text-white">
                                                {formatCurrency(advance.amount)}
                                            </td>
                                            <td className="px-3 py-2 text-gray-600 dark:text-gray-300">
                                                {advance.reason ?? '--'}
                                            </td>
                                            <td className="px-3 py-2 text-center">
                                                {canDeleteAdvances ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDelete(advance.id)}
                                                        className="rounded-lg border border-red-200 px-3 py-1 text-xs font-semibold text-red-600 transition hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-200 dark:border-red-500/60 dark:text-red-300 dark:hover:bg-red-500/10"
                                                    >
                                                        Excluir
                                                    </button>
                                                ) : (
                                                    <span className="text-xs text-gray-400">Somente Master</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                    <tr className="bg-gray-50 font-semibold text-gray-800 dark:bg-gray-900/40 dark:text-gray-100">
                                        <td className="px-3 py-2" colSpan={2}>
                                            Total
                                        </td>
                                        <td className="px-3 py-2 text-right">
                                            {formatCurrency(totalAmount)}
                                        </td>
                                        <td className="px-3 py-2" colSpan={2}>
                                            &nbsp;
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
