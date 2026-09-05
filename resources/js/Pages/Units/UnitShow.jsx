import AlertMessage from "@/Components/Alert/AlertMessage";
import InfoButton from "@/Components/Button/InfoButton";
import AuthenticatedLayout from "@/Layouts/AuthenticatedLayout";
import { Head, Link, usePage } from "@inertiajs/react";

export default function UnitShow({ auth, unit }) {

    const { flash } = usePage().props;
    const isActive = Number(unit.tb2_status) === 1;

    return (
        <AuthenticatedLayout
            user={auth.user}
            header={<h2 className="font-semibold text-xl text-gray-800 dark:text-gray-200 leading-tight">{'Unidades'}</h2>}
        >
            <Head title="Unidades" />

            <div className="py-4 max-w-7xl mx-auto sm:px-6 lg:px-8">
                <div className="overflow-hidden bg-white shadow-lg sm:rounded-lg dark:bg-gray-800">
                    <div className="flex justify-between items-center m-4">
                        <h3 className="text-lg">Visualizar</h3>
                        <div className="flex space-x-4">
                            <Link href={route('units.index')}>
                                <InfoButton aria-label="Listar" title="Listar">
                                    <i className="bi bi-list text-lg" aria-hidden="true"></i>
                                </InfoButton>
                            </Link>
                        </div>
                    </div>

                    <AlertMessage message={flash} />

                    <div className="bg-gray-50 text-sm dark:bg-gray-700 p-4 rounded-lg shadow-m">
                        <div className="mb-4">
                            <p className="text-md font-semibold text-gray-700 dark:text-gray-200">ID</p>
                            <p className="text-gray-600 dark:text-gray-400">{unit.tb2_id}</p>
                        </div>

                        <div className="mb-4">
                            <p className="text-md font-semibold text-gray-700 dark:text-gray-200">Nome</p>
                            <p className="text-gray-600 dark:text-gray-400">{unit.tb2_nome}</p>
                        </div>

                        <div className="mb-4">
                            <p className="text-md font-semibold text-gray-700 dark:text-gray-200">{'Endere\u00E7o'}</p>
                            <p className="text-gray-600 dark:text-gray-400">{unit.tb2_endereco}</p>
                        </div>

                        <div className="mb-4">
                            <p className="text-md font-semibold text-gray-700 dark:text-gray-200">CEP</p>
                            <p className="text-gray-600 dark:text-gray-400">{unit.tb2_cep}</p>
                        </div>

                        <div className="mb-4">
                            <p className="text-md font-semibold text-gray-700 dark:text-gray-200">Telefone</p>
                            <p className="text-gray-600 dark:text-gray-400">{unit.tb2_fone}</p>
                        </div>

                        <div className="mb-4">
                            <p className="text-md font-semibold text-gray-700 dark:text-gray-200">CNPJ</p>
                            <p className="text-gray-600 dark:text-gray-400">{unit.tb2_cnpj}</p>
                        </div>

                        <div className="mb-4">
                            <p className="text-md font-semibold text-gray-700 dark:text-gray-200">Status</p>
                            <span
                                className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                                    isActive
                                        ? 'bg-emerald-100 text-emerald-700'
                                        : 'bg-red-100 text-red-700'
                                }`}
                            >
                                {isActive ? 'Ativa' : 'Inativa'}
                            </span>
                        </div>

                        <div className="mb-4">
                            <p className="text-md font-semibold text-gray-700 dark:text-gray-200">{'Localiza\u00E7\u00E3o'}</p>
                            <a
                                href={unit.tb2_localizacao}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:underline break-words"
                            >
                                {unit.tb2_localizacao}
                            </a>
                        </div>
                    </div>
                </div>
            </div>

        </AuthenticatedLayout>
    )
}
