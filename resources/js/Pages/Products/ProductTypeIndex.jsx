import AlertMessage from "@/Components/Alert/AlertMessage";
import InfoButton from "@/Components/Button/InfoButton";
import SuccessButton from "@/Components/Button/SuccessButton";
import WarningButton from "@/Components/Button/WarningButton";
import AuthenticatedLayout from "@/Layouts/AuthenticatedLayout";
import { Head, Link, router, useForm, usePage } from "@inertiajs/react";
import { useState } from "react";

const emptyForm = {
    tb32_nome: "",
    tb32_ncm: "",
    tb32_tipo_ncm: 0,
};

const normalizeNcm = (value) => value.replace(/\D/g, "").slice(0, 8);

export default function ProductTypeIndex({ auth, productTypes = [], ncmTypeOptions = [] }) {
    const { flash } = usePage().props;
    const [editingId, setEditingId] = useState(null);
    const { data, setData, post, put, processing, errors, reset, clearErrors } = useForm(emptyForm);

    const stopEditing = () => {
        setEditingId(null);
        reset();
        clearErrors();
    };

    const edit = (productType) => {
        setEditingId(productType.tb32_id);
        setData({
            tb32_nome: productType.tb32_nome ?? "",
            tb32_ncm: productType.tb32_ncm ?? "",
            tb32_tipo_ncm: productType.tb32_tipo_ncm ?? 0,
        });
        clearErrors();
    };

    const submit = (event) => {
        event.preventDefault();

        const options = {
            preserveScroll: true,
            onSuccess: stopEditing,
        };

        if (editingId) {
            put(route("product-types.update", { productType: editingId }), options);
            return;
        }

        post(route("product-types.store"), options);
    };

    const remove = (productType) => {
        if (!window.confirm(`Remover o tipo de produto ${productType.tb32_nome}?`)) {
            return;
        }

        router.delete(route("product-types.destroy", { productType: productType.tb32_id }), {
            preserveScroll: true,
        });
    };

    return (
        <AuthenticatedLayout
            user={auth.user}
            header={<h2 className="text-xl font-semibold leading-tight text-gray-800 dark:text-gray-200">Produtos</h2>}
        >
            <Head title="Tipos de produto" />

            <div className="mx-auto max-w-7xl py-4 sm:px-6 lg:px-8">
                <div className="overflow-hidden bg-white shadow-lg sm:rounded-lg dark:bg-gray-800">
                    <div className="m-4 flex items-center justify-between">
                        <h3 className="text-lg">Cadastro de tipo de produto</h3>
                        <Link href={route("products.index")}>
                            <InfoButton aria-label="Voltar para produtos" title="Voltar para produtos">
                                <i className="bi bi-list text-lg" aria-hidden="true"></i>
                            </InfoButton>
                        </Link>
                    </div>

                    <AlertMessage message={flash} />

                    <div className="bg-gray-50 p-4 text-sm dark:bg-gray-700">
                        <form onSubmit={submit} className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_180px_260px_auto] lg:items-end">
                            <div>
                                <label htmlFor="tb32_nome" className="block text-sm font-medium text-gray-700">Nome</label>
                                <input
                                    id="tb32_nome"
                                    type="text"
                                    maxLength="50"
                                    value={data.tb32_nome}
                                    onChange={(event) => setData("tb32_nome", event.target.value)}
                                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
                                />
                                {errors.tb32_nome && <span className="text-red-600">{errors.tb32_nome}</span>}
                            </div>
                            <div>
                                <label htmlFor="tb32_ncm" className="block text-sm font-medium text-gray-700">NCM</label>
                                <input
                                    id="tb32_ncm"
                                    type="text"
                                    inputMode="numeric"
                                    maxLength="8"
                                    value={data.tb32_ncm}
                                    onChange={(event) => setData("tb32_ncm", normalizeNcm(event.target.value))}
                                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
                                />
                                {errors.tb32_ncm && <span className="text-red-600">{errors.tb32_ncm}</span>}
                            </div>
                            <fieldset>
                                <legend className="block text-sm font-medium text-gray-700">Tipo do NCM</legend>
                                <div className="mt-2 flex gap-4">
                                    {ncmTypeOptions.map((option) => (
                                        <label key={option.value} className="inline-flex items-center gap-2 text-sm text-gray-700">
                                            <input
                                                type="radio"
                                                name="tb32_tipo_ncm"
                                                value={option.value}
                                                checked={Number(data.tb32_tipo_ncm) === Number(option.value)}
                                                onChange={(event) => setData("tb32_tipo_ncm", Number(event.target.value))}
                                                className="border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                            />
                                            {option.label}
                                        </label>
                                    ))}
                                </div>
                                {errors.tb32_tipo_ncm && <span className="text-red-600">{errors.tb32_tipo_ncm}</span>}
                            </fieldset>
                            <div className="flex gap-2">
                                <SuccessButton type="submit" disabled={processing} aria-label={editingId ? "Atualizar" : "Cadastrar"} title={editingId ? "Atualizar" : "Cadastrar"}>
                                    <i className={editingId ? "bi bi-floppy text-lg" : "bi bi-plus-lg text-lg"} aria-hidden="true"></i>
                                </SuccessButton>
                                {editingId && (
                                    <InfoButton type="button" onClick={stopEditing} aria-label="Cancelar edicao" title="Cancelar edicao">
                                        <i className="bi bi-x-lg text-lg" aria-hidden="true"></i>
                                    </InfoButton>
                                )}
                            </div>
                        </form>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                            <thead className="bg-gray-50 dark:bg-gray-700">
                                <tr>
                                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Nome</th>
                                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">NCM</th>
                                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Tipo NCM</th>
                                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Produtos</th>
                                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">Acoes</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                                {productTypes.map((productType) => (
                                    <tr key={productType.tb32_id}>
                                        <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{productType.tb32_nome}</td>
                                        <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{productType.tb32_ncm}</td>
                                        <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">
                                            {ncmTypeOptions.find((option) => Number(option.value) === Number(productType.tb32_tipo_ncm))?.label ?? "Industria"}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{productType.produtos_count}</td>
                                        <td className="px-4 py-3 text-right">
                                            <WarningButton type="button" onClick={() => edit(productType)} aria-label="Editar" title="Editar">
                                                <i className="bi bi-pencil-square text-lg" aria-hidden="true"></i>
                                            </WarningButton>
                                            <button
                                                type="button"
                                                onClick={() => remove(productType)}
                                                disabled={Number(productType.produtos_count) > 0}
                                                title={Number(productType.produtos_count) > 0 ? "Existem produtos vinculados" : "Apagar"}
                                                className="ms-1 inline-flex items-center rounded-md border border-red-300 px-3 py-2 text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                                            >
                                                <i className="bi bi-trash text-lg" aria-hidden="true"></i>
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {productTypes.length === 0 && (
                                    <tr>
                                        <td colSpan="5" className="px-4 py-8 text-center text-sm text-gray-500">Nenhum tipo de produto cadastrado.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
