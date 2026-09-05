import InfoButton from "@/Components/Button/InfoButton";
import WarningButton from "@/Components/Button/WarningButton";
import AuthenticatedLayout from "@/Layouts/AuthenticatedLayout";
import { Head, Link, useForm } from "@inertiajs/react";

export default function UnitEdit({ auth, unit }) {

    const { data, setData, put, processing, errors } = useForm({
        tb2_id: unit.tb2_id || '',
        tb2_nome: unit.tb2_nome || '',
        tb2_endereco: unit.tb2_endereco || '',
        tb2_cep: unit.tb2_cep || '',
        tb2_fone: unit.tb2_fone || '',
        tb2_cnpj: unit.tb2_cnpj || '',
        tb2_localizacao: unit.tb2_localizacao || '',
        tb2_status: String(unit.tb2_status ?? 1),
    });

    const handleSubmit = (e) => {
        e.preventDefault();

        put(route('units.update', { unit: data.tb2_id }));
    }

    return (
        <AuthenticatedLayout
            user={auth.user}
            header={<h2 className="font-semibold text-xl text-gray-800 dark:text-gray-200 leading-tight">{'Unidades'}</h2>}
        >
            <Head title="Unidades" />

            <div className="py-4 max-w-7xl mx-auto sm:px-6 lg:px-8">
                <div className="overflow-hidden bg-white shadow-lg sm:rounded-lg dark:bg-gray-800">
                    <div className="flex justify-between items-center m-4">
                        <h3 className="text-lg">Editar</h3>
                        <div className="flex space-x-4">
                            <Link href={route('units.index')}>
                                <InfoButton aria-label="Listar" title="Listar">
                                    <i className="bi bi-list text-lg" aria-hidden="true"></i>
                                </InfoButton>
                            </Link>
                        </div>
                    </div>

                    <div className="bg-gray-50 text-sm dark:bg-gray-700 p-4 rounded-lg shadow-m">
                        <form onSubmit={handleSubmit}>
                            <div className="mb-4">
                                <label htmlFor="tb2_nome" className="block text-sm font-medium text-gray-700">Nome</label>
                                <input
                                    id="tb2_nome"
                                    type="text"
                                    placeholder="Nome da unidade"
                                    value={data.tb2_nome}
                                    onChange={(e) => setData('tb2_nome', e.target.value)}
                                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                />
                                {errors.tb2_nome && <span className="text-red-600">{errors.tb2_nome}</span>}
                            </div>

                            <div className="mb-4">
                                <label htmlFor="tb2_endereco" className="block text-sm font-medium text-gray-700">{'Endere\u00E7o'}</label>
                                <input
                                    id="tb2_endereco"
                                    type="text"
                                    placeholder="Rua, n\u00FAmero, bairro"
                                    value={data.tb2_endereco}
                                    onChange={(e) => setData('tb2_endereco', e.target.value)}
                                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                />
                                {errors.tb2_endereco && <span className="text-red-600">{errors.tb2_endereco}</span>}
                            </div>

                            <div className="mb-4 grid gap-4 sm:grid-cols-2">
                                <div>
                                    <label htmlFor="tb2_cep" className="block text-sm font-medium text-gray-700">CEP</label>
                                    <input
                                        id="tb2_cep"
                                        type="text"
                                        placeholder="00000-000"
                                        value={data.tb2_cep}
                                        onChange={(e) => setData('tb2_cep', e.target.value)}
                                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                    />
                                    {errors.tb2_cep && <span className="text-red-600">{errors.tb2_cep}</span>}
                                </div>
                                <div>
                                    <label htmlFor="tb2_fone" className="block text-sm font-medium text-gray-700">Telefone</label>
                                    <input
                                        id="tb2_fone"
                                        type="text"
                                        placeholder="(00) 0000-0000"
                                        value={data.tb2_fone}
                                        onChange={(e) => setData('tb2_fone', e.target.value)}
                                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                    />
                                    {errors.tb2_fone && <span className="text-red-600">{errors.tb2_fone}</span>}
                                </div>
                            </div>

                            <div className="mb-4 grid gap-4 sm:grid-cols-2">
                                <div>
                                    <label htmlFor="tb2_cnpj" className="block text-sm font-medium text-gray-700">CNPJ</label>
                                    <input
                                        id="tb2_cnpj"
                                        type="text"
                                        placeholder="00.000.000/0000-00"
                                        value={data.tb2_cnpj}
                                        onChange={(e) => setData('tb2_cnpj', e.target.value)}
                                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                    />
                                    {errors.tb2_cnpj && <span className="text-red-600">{errors.tb2_cnpj}</span>}
                                </div>
                                <div>
                                    <label htmlFor="tb2_localizacao" className="block text-sm font-medium text-gray-700">Link Google Maps</label>
                                    <input
                                        id="tb2_localizacao"
                                        type="text"
                                        placeholder="https://www.google.com/maps/... ou <iframe ...>"
                                        value={data.tb2_localizacao}
                                        onChange={(e) => setData('tb2_localizacao', e.target.value)}
                                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                    />
                                    <p className="mt-1 text-xs text-gray-500">
                                        Use um link completo do Google Maps (https://www.google.com/maps/...) ou cole o iframe de embed.
                                    </p>
                                    {errors.tb2_localizacao && <span className="text-red-600">{errors.tb2_localizacao}</span>}
                                </div>
                            </div>

                            <div className="mb-4">
                                <label htmlFor="tb2_status" className="block text-sm font-medium text-gray-700">Status</label>
                                <select
                                    id="tb2_status"
                                    value={data.tb2_status}
                                    onChange={(e) => setData('tb2_status', e.target.value)}
                                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                >
                                    <option value="1">Ativa</option>
                                    <option value="0">Inativa</option>
                                </select>
                                {errors.tb2_status && <span className="text-red-600">{errors.tb2_status}</span>}
                            </div>

                            <div className="flex justify-end">
                                <WarningButton
                                    type="submit"
                                    disabled={processing}
                                    className="text-sm"
                                    aria-label="Salvar"
                                    title="Salvar"
                                >
                                    <i className="bi bi-floppy text-lg" aria-hidden="true"></i>
                                </WarningButton>
                            </div>
                        </form>
                    </div>
                </div>
            </div>

        </AuthenticatedLayout>
    )
}
