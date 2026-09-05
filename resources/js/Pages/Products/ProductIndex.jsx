import AlertMessage from "@/Components/Alert/AlertMessage";
import PrimaryButton from "@/Components/Button/PrimaryButton";
import InfoButton from "@/Components/Button/InfoButton";
import SuccessButton from "@/Components/Button/SuccessButton";
import WarningButton from "@/Components/Button/WarningButton";
import ConfirmDeleteButton from "@/Components/Delete/ConfirmDeleteButton";
import Pagination from "@/Components/Pagination";
import AuthenticatedLayout from "@/Layouts/AuthenticatedLayout";
import { Head, Link, usePage, router } from "@inertiajs/react";
import { useEffect, useRef, useState } from "react";

const MIN_SEARCH_CHARACTERS = 3;
const MAX_PRODUCT_NAME_LENGTH = 25;
const numericRegex = /^\d+$/;

const formatCurrency = (value) => {
    const parsed = Number(value ?? 0);

    return parsed.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
    });
};

const resolveLabel = (labels, key) => {
    if (!labels) {
        return "---";
    }

    return labels[key] ?? "---";
};

const truncateText = (value, maxLength) => {
    if (!value) {
        return "";
    }

    if (value.length <= maxLength) {
        return value;
    }

    if (maxLength <= 3) {
        return value.slice(0, maxLength);
    }

    return `${value.slice(0, maxLength - 3)}...`;
};

const ncmDescriptionLabel = (value) => {
    const label = String(value ?? '').trim();

    return (label.split('-')[0] ?? label).trim() || label;
};

export default function ProductIndex({
    auth,
    products,
    typeLabels,
    statusLabels,
    search = '',
    vrCreditOnly = false,
    fiscalStatus = '',
    ncmFilter = '',
    ncmOptions = [],
    sort = '',
    direction = '',
}) {
    const { flash } = usePage().props;

    const [searchTerm, setSearchTerm] = useState(search ?? '');
    const [searchError, setSearchError] = useState('');
    const [favoriteLoading, setFavoriteLoading] = useState(null);
    const [sortField, setSortField] = useState(sort ?? '');
    const [sortDirection, setSortDirection] = useState(direction || 'asc');
    const [selectedNcm, setSelectedNcm] = useState(ncmFilter ?? '');
    const initialSearchHandled = useRef(false);

    useEffect(() => {
        setSearchTerm(search ?? '');
    }, [search]);

    useEffect(() => {
        setSortField(sort ?? '');
        setSortDirection(direction || 'asc');
    }, [sort, direction]);

    useEffect(() => {
        setSelectedNcm(ncmFilter ?? '');
    }, [ncmFilter]);

    const buildQuery = ({ term, field, dir, ncm } = {}) => {
        const resolvedTerm = term !== undefined ? term : (search ?? '').trim();
        const resolvedField = field !== undefined ? field : sortField;
        const resolvedDir = dir !== undefined ? dir : sortDirection;
        const resolvedNcm = ncm !== undefined ? ncm : selectedNcm;
        const query = {};

        if (resolvedTerm !== '') {
            query.search = resolvedTerm;
        }

        if (resolvedField) {
            query.sort = resolvedField;
            query.direction = resolvedDir;
        }

        if (vrCreditOnly) {
            query.vr_credit = 1;
        }

        if (fiscalStatus) {
            query.fiscal_status = fiscalStatus;
        }

        if (resolvedNcm) {
            query.ncm = resolvedNcm;
        }

        return query;
    };

    const applyQuery = (overrides = {}) => {
        router.get(route('products.index'), buildQuery(overrides), { preserveState: true, replace: true });
    };

    useEffect(() => {
        const handler = setTimeout(() => {
            const term = searchTerm.trim();
            const isNumeric = numericRegex.test(term);

            if (initialSearchHandled.current === false) {
                initialSearchHandled.current = true;
                if ((search ?? '') === term) {
                    return;
                }
            }

            if (term === '') {
                setSearchError('');
                applyQuery({ term: '' });
                return;
            }

            if (!isNumeric && term.length < MIN_SEARCH_CHARACTERS) {
                setSearchError(`Digite pelo menos ${MIN_SEARCH_CHARACTERS} caracteres ou utilize ID/c?digo.`);
                return;
            }

            setSearchError('');
            applyQuery({ term });
        }, 400);

        return () => clearTimeout(handler);
    }, [searchTerm, search]);

    const handleToggleFavorite = (productId, currentValue) => {
        setFavoriteLoading(productId);
        router.post(route('products.favorite', { product: productId }), { favorite: !currentValue }, {
            preserveScroll: true,
            preserveState: true,
            onFinish: () => setFavoriteLoading(null),
        });
    };

    const handleSort = (field, dir) => {
        setSortField(field);
        setSortDirection(dir);
        applyQuery({ field, dir });
    };

    const handleVrCreditFilter = () => {
        router.get(route('products.index'), {
            ...(searchTerm.trim() !== '' ? { search: searchTerm.trim() } : {}),
            ...(sortField ? { sort: sortField, direction: sortDirection } : {}),
            ...(selectedNcm ? { ncm: selectedNcm } : {}),
            vr_credit: 1,
        }, { preserveState: true, replace: true });
    };

    const handleFiscalFilter = (status) => {
        router.get(route('products.index'), {
            ...(searchTerm.trim() !== '' ? { search: searchTerm.trim() } : {}),
            ...(sortField ? { sort: sortField, direction: sortDirection } : {}),
            ...(vrCreditOnly ? { vr_credit: 1 } : {}),
            ...(selectedNcm ? { ncm: selectedNcm } : {}),
            fiscal_status: status,
        }, { preserveState: true, replace: true });
    };

    const handleNcmFilter = (event) => {
        const ncm = event.target.value;

        setSelectedNcm(ncm);
        applyQuery({ ncm });
    };

    const renderSortHeader = (label, field, align = 'left') => {
        const isActive = sortField === field;
        const isAsc = isActive && sortDirection === 'asc';
        const isDesc = isActive && sortDirection === 'desc';
        const alignClass = align === 'right'
            ? 'justify-end'
            : align === 'center'
                ? 'justify-center'
                : 'justify-start';

        return (
            <div className={`flex items-center gap-2 ${alignClass}`}>
                <span>{label}</span>
                <span className="flex flex-col leading-none">
                    <button
                        type="button"
                        onClick={() => handleSort(field, 'asc')}
                        className="leading-none"
                        aria-label={`Ordenar ${label} crescente`}
                        title={`Ordenar ${label} crescente`}
                    >
                        <i
                            className={`bi bi-caret-up-fill text-xs ${isAsc ? 'text-indigo-600' : 'text-gray-400'}`}
                            aria-hidden="true"
                        ></i>
                    </button>
                    <button
                        type="button"
                        onClick={() => handleSort(field, 'desc')}
                        className="-mt-1 leading-none"
                        aria-label={`Ordenar ${label} decrescente`}
                        title={`Ordenar ${label} decrescente`}
                    >
                        <i
                            className={`bi bi-caret-down-fill text-xs ${isDesc ? 'text-indigo-600' : 'text-gray-400'}`}
                            aria-hidden="true"
                        ></i>
                    </button>
                </span>
            </div>
        );
    };

    return (
        <AuthenticatedLayout
            user={auth.user}
            header={
                <h2 className="font-semibold text-xl text-gray-800 dark:text-gray-200 leading-tight">
                    Produtos
                </h2>
            }
        >
            <Head title="Produtos" />

            <div className="py-4 max-w-7xl mx-auto sm:px-6 lg:px-8">
                <div className="overflow-hidden bg-white shadow-lg sm:rounded-lg dark:bg-gray-800">
                    <AlertMessage message={flash} />

                    <div className="px-4 pb-4">
                        <div className="flex flex-col gap-3">
                            <label htmlFor="product-search" className="text-sm font-medium text-gray-700 dark:text-gray-200">

                            </label>
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                                <InfoButton
                                    type="button"
                                    onClick={handleVrCreditFilter}
                                    aria-label="Mostrar produtos disponiveis para VR Credito"
                                    title="Mostrar produtos disponiveis para VR Credito"
                                    className="self-start sm:self-auto whitespace-nowrap"
                                >
                                    <i className="bi bi-credit-card text-sm" aria-hidden="true"></i>
                                </InfoButton>
                                <Link
                                    href={route("products.production-stock")}
                                    className="self-start sm:self-auto"
                                >
                                    <InfoButton
                                        aria-label="Estoque de Producao"
                                        title="Estoque de Producao"
                                        className="whitespace-nowrap"
                                    >
                                        <i className="bi bi-boxes text-sm" aria-hidden="true"></i>
                                    </InfoButton>
                                </Link>
                                <InfoButton
                                    type="button"
                                    onClick={() => handleFiscalFilter('incomplete')}
                                    aria-label="Mostrar produtos com cadastro fiscal incompleto"
                                    title="Mostrar produtos com cadastro fiscal incompleto"
                                    className="self-start sm:self-auto whitespace-nowrap"
                                >
                                    <i className="bi bi-exclamation-triangle text-sm" aria-hidden="true"></i>
                                </InfoButton>
                                <InfoButton
                                    type="button"
                                    onClick={() => handleFiscalFilter('complete')}
                                    aria-label="Mostrar produtos com cadastro fiscal completo"
                                    title="Mostrar produtos com cadastro fiscal completo"
                                    className="self-start sm:self-auto whitespace-nowrap"
                                >
                                    <i className="bi bi-patch-check text-sm" aria-hidden="true"></i>
                                </InfoButton>
                                <Link
                                    href={route("products.fiscal-queue")}
                                    className="self-start sm:self-auto"
                                >
                                    <InfoButton
                                        aria-label="Abrir fila de atualizacao fiscal"
                                        title="Abrir fila de atualizacao fiscal"
                                        className="whitespace-nowrap"
                                    >
                                        <i className="bi bi-ui-checks-grid text-sm" aria-hidden="true"></i>
                                    </InfoButton>
                                </Link>
                                <input
                                    id="product-search"
                                    type="text"
                                    value={searchTerm}
                                    onChange={(event) => setSearchTerm(event.target.value)}
                                    placeholder="Digite ID ou nome"
                                    className="w-full flex-1 rounded-xl border border-gray-300 px-3 py-2 text-gray-800 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 sm:w-auto dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                                />
                                <select
                                    value={selectedNcm}
                                    onChange={handleNcmFilter}
                                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-gray-800 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 sm:w-64 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                                    aria-label="Filtrar produtos por descricao do NCM"
                                    title="Filtrar por descricao do NCM"
                                >
                                    <option value="">Todos os NCMs</option>
                                    {ncmOptions.map((option) => (
                                        <option key={option.value} value={option.value}>
                                            {ncmDescriptionLabel(option.label)}
                                        </option>
                                    ))}
                                </select>
                                <Link
                                    href={route("products.create")}
                                    className="self-start sm:ms-auto sm:self-auto"
                                >
                                    <SuccessButton aria-label="Cadastrar" title="Cadastrar" className="h-10 w-10 justify-center p-0">
                                        <i className="bi bi-plus-lg text-lg" aria-hidden="true"></i>
                                    </SuccessButton>
                                </Link>
                                <Link
                                    href={route("product-types.index")}
                                    className="self-start sm:self-auto"
                                >
                                    <InfoButton aria-label="Cadastro Tipo Produto" title="Cadastro Tipo Produto" className="h-10 w-10 justify-center p-0">
                                        <i className="bi bi-tags text-lg" aria-hidden="true"></i>
                                    </InfoButton>
                                </Link>
                            </div>
                            {searchError && (
                                <p className="text-sm text-red-600 dark:text-red-400">{searchError}</p>
                            )}
                        </div>
                    </div>

                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-700">
                            <tr>
                                <td className="px-4 py-3 text-center text-sm font-medium text-gray-500 tracking-wider">
                                    {renderSortHeader('Favorito', 'tb1_favorito', 'center')}
                                </td>
                                <td className="px-4 py-3 text-left text-sm font-medium text-gray-500 tracking-wider">
                                    {renderSortHeader('ID', 'tb1_id')}
                                </td>
                                <td className="px-4 py-3 text-left text-sm font-medium text-gray-500 tracking-wider">
                                    {renderSortHeader('Nome', 'tb1_nome')}
                                </td>
                                <td className="px-4 py-3 text-right text-sm font-medium text-gray-500 tracking-wider">
                                    {renderSortHeader('Custo', 'tb1_vlr_custo', 'right')}
                                </td>
                                <td className="px-4 py-3 text-right text-sm font-medium text-gray-500 tracking-wider">
                                    {renderSortHeader('Venda', 'tb1_vlr_venda', 'right')}
                                </td>
                                <td className="px-4 py-3 text-left text-sm font-medium text-gray-500 tracking-wider">
                                    {renderSortHeader('Tipo', 'tb1_tipo')}
                                </td>
                                <td className="px-4 py-3 text-right text-sm font-medium text-gray-500 tracking-wider">
                                    {renderSortHeader('Estoque', 'tb1_qtd', 'right')}
                                </td>
                                <td className="px-4 py-3 text-left text-sm font-medium text-gray-500 tracking-wider">
                                    {renderSortHeader('Status', 'tb1_status')}
                                </td>
                                <td className="px-4 py-3 text-center text-sm font-medium text-gray-500 tracking-wider">
                                    Acoes
                                </td>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200 dark:bg-gray-800 dark:divide-gray-700">
                            {products.data.map((product) => (
                                <tr key={product.tb1_id}>
                                    <td className="px-4 py-2 text-center">
                                        <button
                                            type="button"
                                            onClick={() => handleToggleFavorite(product.tb1_id, product.tb1_favorito)}
                                            disabled={favoriteLoading === product.tb1_id}
                                            className="text-xl text-yellow-400 transition hover:scale-110 disabled:opacity-50"
                                            aria-label={product.tb1_favorito ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
                                        >
                                            <i
                                                className={product.tb1_favorito ? 'bi bi-star-fill' : 'bi bi-star'}
                                                aria-hidden="true"
                                            ></i>
                                        </button>
                                    </td>
                                    <td className="px-4 py-2 text-sm text-gray-500 tracking-wider">
                                        {product.tb1_id}
                                    </td>
                                    <td className="px-4 py-2 text-sm text-gray-500 tracking-wider">
                                        <div className="flex flex-col">
                                            <span title={product.tb1_nome}>
                                                {truncateText(product.tb1_nome, MAX_PRODUCT_NAME_LENGTH)}
                                            </span>
                                            <span className="text-xs text-gray-400">
                                                {product.tb1_codbar}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-2 text-sm text-gray-500 tracking-wider text-right">
                                        {formatCurrency(product.tb1_vlr_custo)}
                                    </td>
                                    <td className="px-4 py-2 text-sm text-gray-500 tracking-wider text-right">
                                        {formatCurrency(product.tb1_vlr_venda)}
                                    </td>
                                    <td className="px-4 py-2 text-sm text-gray-500 tracking-wider">
                                        {resolveLabel(typeLabels, product.tb1_tipo)}
                                    </td>
                                    <td className="px-4 py-2 text-sm text-gray-500 tracking-wider text-right">
                                        {Number(product.tb1_tipo) === 3 ? Number(product.tb1_qtd ?? 0) : '--'}
                                    </td>
                                    <td className="px-4 py-2 text-sm text-gray-500 tracking-wider">
                                        {resolveLabel(statusLabels, product.tb1_status)}
                                    </td>
                                    <td className="px-4 py-2 text-sm text-gray-500 tracking-wider">
                                        {Number(product.tb1_tipo) === 3 && (
                                            <Link href={route("products.production-stock", { product_id: product.tb1_id })}>
                                                <InfoButton className="ms-1" aria-label="Estoque" title="Estoque">
                                                    <i className="bi bi-boxes text-lg" aria-hidden="true"></i>
                                                </InfoButton>
                                            </Link>
                                        )}
                                        <Link href={route("products.show", { product: product.tb1_id })}>
                                            <PrimaryButton className="ms-1" aria-label="Visualizar" title="Visualizar">
                                                <i className="bi bi-eye text-lg" aria-hidden="true"></i>
                                            </PrimaryButton>
                                        </Link>
                                        <Link href={route("products.edit", { product: product.tb1_id })}>
                                            <WarningButton className="ms-1" aria-label="Editar" title="Editar">
                                                <i className="bi bi-pencil-square text-lg" aria-hidden="true"></i>
                                            </WarningButton>
                                        </Link>
                                        <ConfirmDeleteButton id={product.tb1_id} routeName="products.destroy" />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    <Pagination links={products.links} currentPage={products.current_page} />
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
