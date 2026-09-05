import AlertMessage from "@/Components/Alert/AlertMessage";
import InfoButton from "@/Components/Button/InfoButton";
import PrimaryButton from "@/Components/Button/PrimaryButton";
import SuccessButton from "@/Components/Button/SuccessButton";
import AuthenticatedLayout from "@/Layouts/AuthenticatedLayout";
import { formatBrazilDateTime } from "@/Utils/date";
import { Head, Link, useForm, usePage } from "@inertiajs/react";

const MOVEMENT_BADGE_STYLES = {
    1: "border-emerald-200 bg-emerald-50 text-emerald-700",
    0: "border-rose-200 bg-rose-50 text-rose-700",
};

const resolveMovementBadge = (movementType) =>
    MOVEMENT_BADGE_STYLES[movementType] ?? "border-slate-200 bg-slate-50 text-slate-700";

export default function ProductionStock({
    auth,
    productionProducts = [],
    movementTypeOptions = [],
    recentMovements = [],
    selectedProductId = null,
}) {
    const { flash } = usePage().props;
    const defaultProductId = selectedProductId ?? productionProducts[0]?.tb1_id ?? "";
    const defaultMovementType = movementTypeOptions[0]?.value ?? 1;

    const { data, setData, post, processing, errors, reset } = useForm({
        product_id: defaultProductId,
        movement_type: defaultMovementType,
        quantity: "1",
        notes: "",
    });

    const selectedProduct = productionProducts.find(
        (product) => Number(product.tb1_id) === Number(data.product_id)
    );

    const handleSubmit = (event) => {
        event.preventDefault();
        post(route("products.production-stock.store"), {
            preserveScroll: true,
            onSuccess: () => reset("movement_type", "quantity", "notes"),
        });
    };

    return (
        <AuthenticatedLayout
            user={auth.user}
            header={
                <div className="flex flex-col gap-1">
                    <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">
                        Estoque de Producao
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-300">
                        Registre entrada e saida dos produtos do tipo Producao.
                    </p>
                </div>
            }
        >
            <Head title="Estoque de Producao" />

            <div className="py-8">
                <div className="mx-auto max-w-7xl space-y-6 px-4 sm:px-6 lg:px-8">
                    <AlertMessage message={flash} />

                    <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
                        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
                            <div className="flex items-center justify-between gap-3">
                                <h3 className="text-sm font-semibold uppercase text-gray-600 dark:text-gray-300">
                                    Nova movimentacao
                                </h3>
                                <Link href={route("products.index")}>
                                    <InfoButton aria-label="Produtos" title="Produtos">
                                        <i className="bi bi-list text-lg" aria-hidden="true"></i>
                                    </InfoButton>
                                </Link>
                            </div>

                            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
                                <div>
                                    <label htmlFor="product_id" className="block text-sm font-medium text-gray-700">
                                        Produto
                                    </label>
                                    <select
                                        id="product_id"
                                        value={data.product_id}
                                        onChange={(event) => setData("product_id", event.target.value)}
                                        className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
                                    >
                                        {productionProducts.map((product) => (
                                            <option key={product.tb1_id} value={product.tb1_id}>
                                                {product.tb1_nome}
                                            </option>
                                        ))}
                                    </select>
                                    {errors.product_id && <span className="text-red-600">{errors.product_id}</span>}
                                </div>

                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div>
                                        <label htmlFor="movement_type" className="block text-sm font-medium text-gray-700">
                                            Tipo
                                        </label>
                                        <select
                                            id="movement_type"
                                            value={data.movement_type}
                                            onChange={(event) => setData("movement_type", Number(event.target.value))}
                                            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
                                        >
                                            {movementTypeOptions.map((option) => (
                                                <option key={option.value} value={option.value}>
                                                    {option.label}
                                                </option>
                                            ))}
                                        </select>
                                        {errors.movement_type && <span className="text-red-600">{errors.movement_type}</span>}
                                    </div>

                                    <div>
                                        <label htmlFor="quantity" className="block text-sm font-medium text-gray-700">
                                            Quantidade
                                        </label>
                                        <input
                                            id="quantity"
                                            type="number"
                                            min="1"
                                            step="1"
                                            value={data.quantity}
                                            onChange={(event) => setData("quantity", event.target.value)}
                                            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
                                        />
                                        {errors.quantity && <span className="text-red-600">{errors.quantity}</span>}
                                    </div>
                                </div>

                                <div>
                                    <label htmlFor="notes" className="block text-sm font-medium text-gray-700">
                                        Observacao
                                    </label>
                                    <textarea
                                        id="notes"
                                        rows={3}
                                        value={data.notes}
                                        onChange={(event) => setData("notes", event.target.value)}
                                        className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
                                        placeholder="Motivo da entrada ou saida"
                                    />
                                    {errors.notes && <span className="text-red-600">{errors.notes}</span>}
                                </div>

                                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                                    <p className="font-semibold text-slate-800">Saldo atual</p>
                                    <p className="mt-1 text-2xl font-bold text-slate-900">
                                        {Number(selectedProduct?.tb1_qtd ?? 0)}
                                    </p>
                                    <p className="mt-1 text-xs text-slate-500">
                                        {selectedProduct?.tb1_nome ?? "Nenhum produto selecionado"}
                                    </p>
                                </div>

                                <div className="flex justify-end">
                                    <SuccessButton type="submit" disabled={processing}>
                                        Registrar
                                    </SuccessButton>
                                </div>
                            </form>
                        </div>

                        <div className="space-y-6">
                            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
                                <h3 className="text-sm font-semibold uppercase text-gray-600 dark:text-gray-300">
                                    Produtos de Producao
                                </h3>
                                <div className="mt-4 overflow-x-auto">
                                    {productionProducts.length ? (
                                        <table className="min-w-full text-left text-sm text-gray-700 dark:text-gray-200">
                                            <thead className="text-xs uppercase text-gray-500 dark:text-gray-400">
                                                <tr>
                                                    <th className="px-3 py-2">Produto</th>
                                                    <th className="px-3 py-2">Codigo</th>
                                                    <th className="px-3 py-2 text-right">Estoque</th>
                                                    <th className="px-3 py-2 text-center">Acao</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                                {productionProducts.map((product) => (
                                                    <tr key={product.tb1_id}>
                                                        <td className="px-3 py-2 font-semibold">{product.tb1_nome}</td>
                                                        <td className="px-3 py-2">{product.tb1_codbar}</td>
                                                        <td className="px-3 py-2 text-right">{Number(product.tb1_qtd ?? 0)}</td>
                                                        <td className="px-3 py-2 text-center">
                                                            <PrimaryButton
                                                                type="button"
                                                                onClick={() => setData("product_id", product.tb1_id)}
                                                                className="px-3 py-2 text-sm normal-case tracking-normal"
                                                            >
                                                                Selecionar
                                                            </PrimaryButton>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    ) : (
                                        <p className="text-sm text-gray-500 dark:text-gray-300">
                                            Nenhum produto de Producao cadastrado.
                                        </p>
                                    )}
                                </div>
                            </div>

                            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
                                <h3 className="text-sm font-semibold uppercase text-gray-600 dark:text-gray-300">
                                    Historico de movimentacoes
                                </h3>
                                <div className="mt-4 overflow-x-auto">
                                    {recentMovements.length ? (
                                        <table className="min-w-full text-left text-sm text-gray-700 dark:text-gray-200">
                                            <thead className="text-xs uppercase text-gray-500 dark:text-gray-400">
                                                <tr>
                                                    <th className="px-3 py-2">Data</th>
                                                    <th className="px-3 py-2">Produto</th>
                                                    <th className="px-3 py-2">Tipo</th>
                                                    <th className="px-3 py-2 text-right">Qtd</th>
                                                    <th className="px-3 py-2 text-right">Antes</th>
                                                    <th className="px-3 py-2 text-right">Depois</th>
                                                    <th className="px-3 py-2">Usuario</th>
                                                    <th className="px-3 py-2">Observacao</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                                {recentMovements.map((movement) => (
                                                    <tr key={movement.id}>
                                                        <td className="px-3 py-2 whitespace-nowrap">
                                                            {formatBrazilDateTime(movement.created_at)}
                                                        </td>
                                                        <td className="px-3 py-2 font-semibold">
                                                            {movement.product?.name ?? "--"}
                                                        </td>
                                                        <td className="px-3 py-2">
                                                            <span
                                                                className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${resolveMovementBadge(
                                                                    movement.movement_type
                                                                )}`}
                                                            >
                                                                {movement.movement_label}
                                                            </span>
                                                        </td>
                                                        <td className="px-3 py-2 text-right">{movement.quantity}</td>
                                                        <td className="px-3 py-2 text-right">{movement.stock_before}</td>
                                                        <td className="px-3 py-2 text-right">{movement.stock_after}</td>
                                                        <td className="px-3 py-2">{movement.user?.name ?? "--"}</td>
                                                        <td className="px-3 py-2">{movement.notes || "--"}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    ) : (
                                        <p className="text-sm text-gray-500 dark:text-gray-300">
                                            Nenhuma movimentacao registrada.
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
