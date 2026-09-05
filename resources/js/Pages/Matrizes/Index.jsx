import Pagination from '@/Components/Pagination';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, Link } from '@inertiajs/react';

const normalizeText = (value) =>
    String(value ?? '')
        .trim()
        .toLowerCase();

export default function MatrizesIndex({ auth, matrizes }) {
    const renderStatus = (status) => {
        const isActive = Number(status) === 1;

        return (
            <span
                className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                    isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                }`}
            >
                {isActive ? 'Ativa' : 'Inativa'}
            </span>
        );
    };

    const renderUnitRole = (matriz, unit) => {
        const isMatrizPrincipal =
            normalizeText(unit?.tb2_nome) === normalizeText(matriz?.tb30_nome);

        return (
            <span
                className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                    isMatrizPrincipal
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-slate-100 text-slate-700'
                }`}
            >
                {isMatrizPrincipal ? 'Matriz' : 'Filial'}
            </span>
        );
    };

    return (
        <AuthenticatedLayout
            user={auth.user}
            header={
                <div className="flex flex-col gap-1">
                    <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">
                        Matrizes
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-300">
                        Visualize a matriz principal e as filiais vinculadas por nome.
                    </p>
                </div>
            }
        >
            <Head title="Matrizes" />

            <div className="py-8">
                <div className="mx-auto max-w-7xl space-y-6 px-4 sm:px-6 lg:px-8">
                    <div className="space-y-4">
                        {matrizes.data.map((matriz) => (
                            <div
                                key={matriz.tb30_id}
                                className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700"
                            >
                                <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-700">
                                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                        <div>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                                                    {matriz.tb30_nome}
                                                </h3>
                                                {renderStatus(matriz.tb30_status)}
                                            </div>
                                            <p className="mt-1 text-sm text-gray-500 dark:text-gray-300">
                                                Slug: {matriz.tb30_slug} | ID: {matriz.tb30_id} | Unidades vinculadas: {matriz.unidades_count ?? 0}
                                            </p>
                                        </div>
                                        <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:bg-slate-900 dark:text-slate-200">
                                            <span className="font-semibold">Matriz principal:</span>{' '}
                                            {matriz.tb30_nome}
                                        </div>
                                    </div>
                                    <div className="mt-4 flex justify-end">
                                        <Link
                                            href={route('matrizes.edit', { matriz: matriz.tb30_id })}
                                            className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-indigo-700 transition hover:bg-indigo-100"
                                        >
                                            Editar matriz
                                        </Link>
                                    </div>
                                </div>

                                <div className="px-6 py-4">
                                    {Array.isArray(matriz.unidades) && matriz.unidades.length > 0 ? (
                                        <div className="space-y-3">
                                            <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-300">
                                                Unidades / Filiais
                                            </h4>
                                            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                                                {matriz.unidades.map((unit) => (
                                                    <div
                                                        key={unit.tb2_id}
                                                        className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-900"
                                                    >
                                                        <div className="flex items-start justify-between gap-3">
                                                            <div>
                                                                <div className="flex flex-wrap items-center gap-2">
                                                                    <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                                                                        {unit.tb2_nome}
                                                                    </span>
                                                                    {renderUnitRole(matriz, unit)}
                                                                </div>
                                                                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                                                    Código interno: {unit.tb2_id}
                                                                </p>
                                                            </div>
                                                            {renderStatus(unit.tb2_status)}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="rounded-xl border border-dashed border-gray-300 px-4 py-6 text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">
                                            Nenhuma unidade vinculada a esta matriz.
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="rounded-2xl bg-white px-6 pb-4 pt-2 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
                        <Pagination links={matrizes.links} currentPage={matrizes.current_page} />
                    </div>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
