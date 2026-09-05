import AlertMessage from '@/Components/Alert/AlertMessage';
import InputError from '@/Components/InputError';
import PrimaryButton from '@/Components/Button/PrimaryButton';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, useForm, usePage } from '@inertiajs/react';
import { useState } from 'react';

const applyCodeMask = (value) => {
    const digits = (value || '').replace(/\D/g, '').slice(0, 10);
    const groups = [];

    if (digits.length > 0) {
        groups.push(digits.slice(0, 1));
    }

    if (digits.length > 1) {
        groups.push(digits.slice(1, 4));
    }

    if (digits.length > 4) {
        groups.push(digits.slice(4, 7));
    }

    if (digits.length > 7) {
        groups.push(digits.slice(7, 10));
    }

    return groups.join(' ');
};

export default function AnyDesck({ auth, codes = [], stores = [] }) {
    const { flash } = usePage().props;
    const [editingId, setEditingId] = useState(null);
    const { data, setData, post, put, processing, errors, reset } = useForm({
        code: '',
        unit_id: '',
        type: 'Caixa',
    });

    const resetForm = () => {
        setEditingId(null);
        reset();
        setData('type', 'Caixa');
    };

    const handleEdit = (item) => {
        setEditingId(item.id);
        setData({
            code: item.code,
            unit_id: String(item.unit_id ?? ''),
            type: item.type,
        });
    };

    const handleSubmit = (event) => {
        event.preventDefault();

        const options = {
            preserveScroll: true,
            onSuccess: () => resetForm(),
        };

        if (editingId) {
            put(route('settings.anydesck.update', editingId), options);
            return;
        }

        post(route('settings.anydesck.store'), options);
    };

    return (
        <AuthenticatedLayout
            user={auth.user}
            header={
                <div className="flex flex-col gap-1">
                    <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">
                        AnyDesck
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-300">
                        Cadastre os codigos AnyDesck dos computadores das lojas.
                    </p>
                </div>
            }
        >
            <Head title="AnyDesck" />
            <div className="py-8">
                <div className="mx-auto max-w-6xl space-y-6 px-4 sm:px-6 lg:px-8">
                    <AlertMessage message={flash} />

                    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
                        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
                            <h3 className="text-sm font-semibold uppercase text-gray-600 dark:text-gray-300">
                                {editingId ? 'Editar codigo' : 'Novo codigo'}
                            </h3>

                            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
                                <div>
                                    <label htmlFor="code" className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                                        Codigo
                                    </label>
                                    <input
                                        id="code"
                                        type="text"
                                        value={data.code}
                                        onChange={(event) => setData('code', applyCodeMask(event.target.value))}
                                        placeholder="1 186 429 402"
                                        inputMode="numeric"
                                        className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                                    />
                                    <InputError message={errors.code} className="mt-2" />
                                </div>

                                <div>
                                    <label htmlFor="unit_id" className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                                        Loja
                                    </label>
                                    <select
                                        id="unit_id"
                                        value={data.unit_id}
                                        onChange={(event) => setData('unit_id', event.target.value)}
                                        className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                                    >
                                        <option value="">Selecione</option>
                                        {stores.map((store) => (
                                            <option key={store.tb2_id} value={store.tb2_id}>
                                                {store.tb2_nome}
                                            </option>
                                        ))}
                                    </select>
                                    <InputError message={errors.unit_id} className="mt-2" />
                                </div>

                                <div>
                                    <label htmlFor="type" className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                                        Tipo
                                    </label>
                                    <select
                                        id="type"
                                        value={data.type}
                                        onChange={(event) => setData('type', event.target.value)}
                                        className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                                    >
                                        <option value="Caixa">Caixa</option>
                                        <option value="Lanchonete">Lanchonete</option>
                                    </select>
                                    <InputError message={errors.type} className="mt-2" />
                                </div>

                                <div className="flex justify-end">
                                    <div className="flex items-center gap-2">
                                        {editingId ? (
                                            <button
                                                type="button"
                                                onClick={resetForm}
                                                className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
                                            >
                                                Cancelar
                                            </button>
                                        ) : null}

                                        <PrimaryButton type="submit" disabled={processing}>
                                            {editingId ? 'Atualizar' : 'Salvar'}
                                        </PrimaryButton>
                                    </div>
                                </div>
                            </form>
                        </div>

                        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
                            <h3 className="text-sm font-semibold uppercase text-gray-600 dark:text-gray-300">
                                Codigos cadastrados
                            </h3>

                            <div className="mt-4 overflow-x-auto">
                                {codes.length ? (
                                    <table className="min-w-full text-left text-sm text-gray-700 dark:text-gray-200">
                                        <thead className="text-xs uppercase text-gray-500 dark:text-gray-400">
                                            <tr>
                                                <th className="px-3 py-2">Codigo</th>
                                                <th className="px-3 py-2">Loja</th>
                                                <th className="px-3 py-2">Tipo</th>
                                                <th className="px-3 py-2 text-right">Acoes</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                            {codes.map((item) => (
                                                <tr key={item.id}>
                                                    <td className="px-3 py-2 font-mono">{item.code}</td>
                                                    <td className="px-3 py-2 font-semibold">{item.store}</td>
                                                    <td className="px-3 py-2">{item.type}</td>
                                                    <td className="px-3 py-2 text-right">
                                                        <button
                                                            type="button"
                                                            onClick={() => handleEdit(item)}
                                                            className="inline-flex items-center rounded-md bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-600"
                                                        >
                                                            Editar
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                ) : (
                                    <p className="text-sm text-gray-500 dark:text-gray-300">
                                        Nenhum codigo AnyDesck cadastrado.
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
