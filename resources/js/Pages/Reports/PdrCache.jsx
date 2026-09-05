import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head } from '@inertiajs/react';

const formatCurrency = (value) =>
    Number(value ?? 0).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });

export default function PdrCacheReport({
    products = [],
    cacheScope = 'Todos ativos',
    cacheHours = 8,
    auth,
}) {
    const unitName = auth?.unit?.name ?? '---';

    return (
        <AuthenticatedLayout
            header={
                <div>
                    <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">
                        PDR CACHE
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-300">
                        Lista carregada no Dashboard para leitura rapida. Unidade atual: {unitName}.
                    </p>
                </div>
            }
        >
            <Head title="PDR CACHE" />

            <div className="py-8">
                <div className="mx-auto max-w-5xl space-y-6 px-4 sm:px-6 lg:px-8">
                    <div className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                            <p className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-300">
                                Itens no cache
                            </p>
                            <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">
                                {products.length}
                            </p>
                        </div>
                        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                            <p className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-300">
                                Escopo
                            </p>
                            <p className="mt-1 text-xl font-bold text-gray-900 dark:text-gray-100">
                                {cacheScope}
                            </p>
                        </div>
                        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                            <p className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-300">
                                Validade
                            </p>
                            <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">
                                {cacheHours}h
                            </p>
                        </div>
                    </div>

                    <div className="rounded-2xl bg-white p-6 shadow dark:bg-gray-800">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                                Produtos
                            </h3>
                            <span className="text-xs font-semibold text-gray-500 dark:text-gray-300">
                                {products.length} registro(s)
                            </span>
                        </div>

                        {products.length === 0 ? (
                            <p className="mt-4 rounded-xl border border-dashed border-gray-200 px-4 py-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-300">
                                Nenhum produto encontrado no cache.
                            </p>
                        ) : (
                            <div className="mt-4 overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-700">
                                    <thead className="bg-gray-100 dark:bg-gray-900/60">
                                        <tr>
                                            <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">
                                                #
                                            </th>
                                            <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">
                                                Nome
                                            </th>
                                            <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">
                                                Codigo de barras
                                            </th>
                                            <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-300">
                                                ID
                                            </th>
                                            <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-300">
                                                Venda
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                        {products.map((product) => (
                                            <tr key={`${product.position}-${product.id}`}>
                                                <td className="px-3 py-2 font-semibold text-gray-700 dark:text-gray-200">
                                                    {product.position}
                                                </td>
                                                <td className="px-3 py-2 text-gray-800 dark:text-gray-100">
                                                    {product.name || '--'}
                                                </td>
                                                <td className="px-3 py-2 font-mono text-gray-700 dark:text-gray-200">
                                                    {product.barcode || '--'}
                                                </td>
                                                <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-200">
                                                    {product.id || '--'}
                                                </td>
                                                <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-200">
                                                    {formatCurrency(product.sale_price)}
                                                </td>
                                            </tr>
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
