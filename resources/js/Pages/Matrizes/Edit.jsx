import SecondaryButton from '@/Components/SecondaryButton';
import InputError from '@/Components/InputError';
import InputLabel from '@/Components/InputLabel';
import TextInput from '@/Components/TextInput';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, Link, useForm } from '@inertiajs/react';

export default function MatrizesEdit({ auth, matriz }) {
    const { data, setData, put, processing, errors } = useForm({
        tb30_nome: matriz.tb30_nome || '',
        tb30_slug: matriz.tb30_slug || '',
        tb30_status: String(matriz.tb30_status ?? 1),
    });

    const handleSubmit = (event) => {
        event.preventDefault();

        put(route('matrizes.update', { matriz: matriz.tb30_id }), {
            preserveScroll: true,
        });
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
                        Edite os dados da matriz selecionada.
                    </p>
                </div>
            }
        >
            <Head title={`Editar matriz - ${matriz.tb30_nome}`} />

            <div className="py-8">
                <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
                    <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
                        <div className="flex flex-col gap-3 border-b border-gray-200 px-6 py-5 dark:border-gray-700 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                                    Editar matriz
                                </h3>
                                <p className="mt-1 text-sm text-gray-500 dark:text-gray-300">
                                    ID {matriz.tb30_id} | {matriz.unidades_count ?? 0} unidade(s) vinculada(s)
                                </p>
                            </div>
                            <Link
                                href={route('matrizes.index')}
                                className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-700 transition hover:bg-slate-100"
                            >
                                Voltar
                            </Link>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-5 px-6 py-6">
                            <div>
                                <InputLabel htmlFor="tb30_nome" value="Nome da matriz" />
                                <TextInput
                                    id="tb30_nome"
                                    name="tb30_nome"
                                    value={data.tb30_nome}
                                    onChange={(event) => setData('tb30_nome', event.target.value)}
                                    className="mt-2 block w-full rounded-xl border-slate-300 bg-white px-4 py-3 focus:border-indigo-500 focus:ring-indigo-500 dark:bg-slate-900 dark:text-gray-100"
                                    autoComplete="off"
                                />
                                <InputError message={errors.tb30_nome} className="mt-2" />
                            </div>

                            <div>
                                <InputLabel htmlFor="tb30_slug" value="Slug" />
                                <TextInput
                                    id="tb30_slug"
                                    name="tb30_slug"
                                    value={data.tb30_slug}
                                    onChange={(event) => setData('tb30_slug', event.target.value)}
                                    className="mt-2 block w-full rounded-xl border-slate-300 bg-white px-4 py-3 focus:border-indigo-500 focus:ring-indigo-500 dark:bg-slate-900 dark:text-gray-100"
                                    autoComplete="off"
                                />
                                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                    O slug identifica a matriz na URL e precisa ser unico.
                                </p>
                                <InputError message={errors.tb30_slug} className="mt-2" />
                            </div>

                            <div>
                                <InputLabel htmlFor="tb30_status" value="Status" />
                                <select
                                    id="tb30_status"
                                    value={data.tb30_status}
                                    onChange={(event) => setData('tb30_status', event.target.value)}
                                    className="mt-2 block w-full rounded-xl border-slate-300 bg-white px-4 py-3 text-sm focus:border-indigo-500 focus:ring-indigo-500 dark:bg-slate-900 dark:text-gray-100"
                                >
                                    <option value="1">Ativa</option>
                                    <option value="0">Inativa</option>
                                </select>
                                <InputError message={errors.tb30_status} className="mt-2" />
                            </div>

                            <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
                                <Link
                                    href={route('matrizes.index')}
                                    className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                                >
                                    Cancelar
                                </Link>

                                <SecondaryButton
                                    type="submit"
                                    disabled={processing}
                                    className="text-sm"
                                    aria-label="Salvar matriz"
                                    title="Salvar matriz"
                                >
                                    Salvar
                                </SecondaryButton>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
