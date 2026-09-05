import AlertMessage from "@/Components/Alert/AlertMessage";
import PrimaryButton from "@/Components/Button/PrimaryButton";
import SuccessButton from "@/Components/Button/SuccessButton";
import WarningButton from "@/Components/Button/WarningButton";
import ConfirmDeleteButton from "@/Components/Delete/ConfirmDeleteButton";
import Pagination from "@/Components/Pagination";
import TextInput from "@/Components/TextInput";
import AuthenticatedLayout from "@/Layouts/AuthenticatedLayout";
import { Head, Link, usePage, router } from "@inertiajs/react";
import { useEffect, useState } from "react";

const funcaoLabels = {
    0: "MASTER",
    1: "GERENTE",
    2: "SUB-GERENTE",
    3: "CAIXA",
    4: "LANCHONETE",
    5: "FUNCIONARIO",
    6: "CLIENTE",
};

const formatTime = (value) => {
    if (!value) {
        return "--:--";
    }

    return value.substring(0, 5);
};

const formatCurrency = (value) => {
    const parsed = Number(value ?? 0);

    return parsed.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

const formatPaymentDay = (value) => {
    if (value === null || value === undefined || value === "") {
        return "Pagamento: --";
    }

    return `Pagamento: dia ${value}`;
};

const getOriginalRole = (user) => Number(user?.funcao_original ?? user?.funcao);

const shouldShowUserStore = (user) => ![0, 1].includes(getOriginalRole(user));

const formatUserStore = (user) => {
    const linkedUnits = Array.isArray(user?.units) ? user.units : [];
    const unitNames = linkedUnits
        .map((unit) => unit?.tb2_nome ?? unit?.name ?? unit?.tb2_id)
        .filter(Boolean);

    if (unitNames.length > 0) {
        return unitNames.join(", ");
    }

    return user?.tb2_id ? `Loja ${user.tb2_id}` : "---";
};

export default function UserIndex({ auth, users, units = [], filters = {}, permissions = {} }) {
    const { flash } = usePage().props;
    const currentUnit = filters.unit ?? "";
    const currentRole = filters.funcao ?? "";
    const currentSearch = filters.search ?? "";
    const currentStatus = filters.status ?? "active";
    const [search, setSearch] = useState(currentSearch);
    const canCreate = Boolean(permissions.canCreate);
    const canView = Boolean(permissions.canView);
    const canEdit = Boolean(permissions.canEdit);
    const canDelete = Boolean(permissions.canDelete);
    const canToggleActive = Boolean(permissions.canToggleActive);
    const canManageSalaryAdvances = Boolean(permissions.canManageSalaryAdvances);

    useEffect(() => {
        setSearch(currentSearch);
    }, [currentSearch]);

    const handleFilterChange = (key, value) => {
        const payload = {
            ...filters,
            [key]: value || undefined,
        };

        router.get(route("users.index"), payload, {
            preserveState: true,
            preserveScroll: true,
            replace: true,
        });
    };

    useEffect(() => {
        const trimmedSearch = search.trim();
        const nextSearch = trimmedSearch.length >= 3 ? trimmedSearch : "";
        const hasActiveSearch = currentSearch !== "";

        if (nextSearch === currentSearch) {
            return undefined;
        }

        if (trimmedSearch.length > 0 && trimmedSearch.length < 3 && !hasActiveSearch) {
            return undefined;
        }

        const timeoutId = setTimeout(() => {
            router.get(route("users.index"), {
                unit: currentUnit || undefined,
                funcao: currentRole || undefined,
                search: nextSearch || undefined,
                status: currentStatus,
            }, {
                preserveState: true,
                preserveScroll: true,
                replace: true,
            });
        }, 300);

        return () => clearTimeout(timeoutId);
    }, [search, currentSearch, currentUnit, currentRole, currentStatus]);

    const handleToggleActive = (user) => {
        if (!user?.id || !canToggleActive) {
            return;
        }

        const confirmationMessage = user.is_active
            ? `Tem certeza que deseja inativar o usuario ${user.name}?`
            : `Tem certeza que deseja reativar o usuario ${user.name}?`;

        if (!window.confirm(confirmationMessage)) {
            return;
        }

        router.patch(route("users.toggle-active", { user: user.id }), {}, {
            preserveScroll: true,
        });
    };

    return (
        <AuthenticatedLayout
            user={auth.user}
            header={<h2 className="font-semibold text-xl text-gray-800 dark:text-gray-200 leading-tight">{"Usu\u00E1rios"}</h2>}
        >
            <Head title={"Usu\u00E1rio"} />

            <div className="py-4 max-w-7xl mx-auto sm:px-6 lg:px-8">
                <div className="overflow-hidden bg-white shadow-lg sm:rounded-lg dark:bg-gray-800">
                    <div className="flex items-center justify-between px-4 pt-4">
                        <h3 className="text-lg">Listar</h3>
                        {canCreate && (
                            <Link
                                href={route("users.create")}
                                className="inline-flex items-center rounded-md border border-transparent bg-green-500 px-2 py-1 text-md tracking-widest text-white transition duration-150 ease-in-out hover:bg-green-600 focus:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 active:bg-green-900 dark:bg-green-200 dark:text-green-800 dark:hover:bg-white dark:focus:bg-white dark:focus:ring-offset-green-900 dark:active:bg-green-300 rounded-xl px-4 py-3"
                                aria-label="Cadastrar"
                                title="Cadastrar"
                            >
                                <i className="bi bi-plus-lg text-lg" aria-hidden="true"></i>
                            </Link>
                        )}
                    </div>

                    <AlertMessage message={flash} />

                    <div className="px-4 pb-3 pt-4">
                        <div className="grid gap-3 md:grid-cols-4 md:items-end">
                            <div className="flex flex-col gap-1">
                                <label className="text-sm font-medium text-gray-700">Pesquisar usuario</label>
                                <TextInput
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Pesquisar por nome ou e-mail"
                                    className="block w-full"
                                />
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-sm font-medium text-gray-700">Unidade</label>
                                <select
                                    value={currentUnit}
                                    onChange={(e) => handleFilterChange("unit", e.target.value)}
                                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                >
                                    <option value="">Todas</option>
                                    {units.map((unit) => (
                                        <option key={unit.tb2_id} value={unit.tb2_id}>
                                            {unit.tb2_nome} ({unit.tb2_id})
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-sm font-medium text-gray-700">Perfil</label>
                                <select
                                    value={currentRole}
                                    onChange={(e) => handleFilterChange("funcao", e.target.value)}
                                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                >
                                    <option value="">Todos</option>
                                    {Object.entries(funcaoLabels).map(([key, label]) => (
                                        <option key={key} value={key}>
                                            {label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-sm font-medium text-gray-700">Status</label>
                                <select
                                    value={currentStatus}
                                    onChange={(e) => handleFilterChange("status", e.target.value)}
                                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                >
                                    <option value="active">Ativos</option>
                                    <option value="inactive">Inativos</option>
                                    <option value="all">Todos</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-700">
                            <tr>
                                <td className="px-4 py-3 text-left text-sm font-medium text-gray-500 tracking-wider">ID</td>
                                <td className="px-4 py-3 text-left text-sm font-medium text-gray-500 tracking-wider">Nome</td>
                                <td className="px-4 py-3 text-left text-sm font-medium text-gray-500 tracking-wider">E-mail</td>
                                <td className="px-4 py-3 text-left text-sm font-medium text-gray-500 tracking-wider">{"Fun\u00E7\u00E3o"}</td>
                                <td className="px-4 py-3 text-left text-sm font-medium text-gray-500 tracking-wider">Jornada</td>
                                <td className="px-4 py-3 text-right text-sm font-medium text-gray-500 tracking-wider">{"Sal\u00E1rio / Cr\u00E9dito VR"}</td>
                                <td className="px-4 py-3 text-center text-sm font-medium text-gray-500 tracking-wider">{"A\u00E7\u00F5es"}</td>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200 dark:bg-gray-800 dark:divide-gray-700">
                            {users.data.map((user) => (
                                <tr key={user.id}>
                                    <td className="px-4 py-2 text-sm text-gray-500 tracking-wider">
                                        {user.id}
                                    </td>
                                    <td className="px-4 py-2 text-sm text-gray-500 tracking-wider">
                                        {user.name}
                                    </td>
                                    <td className="px-4 py-2 text-sm text-gray-500 tracking-wider">
                                        <div className="flex flex-col gap-1">
                                            <span>{user.email}</span>
                                            {shouldShowUserStore(user) && (
                                                <span className="text-xs text-gray-400 tracking-normal dark:text-gray-300">
                                                    Loja: {formatUserStore(user)}
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-4 py-2 text-sm text-gray-500 tracking-wider">
                                        {funcaoLabels[user.funcao] ?? "---"}
                                    </td>
                                    <td className="px-4 py-2 text-sm text-gray-500 tracking-wider">
                                        <div className="flex flex-col gap-1">
                                            <span>{formatTime(user.hr_ini)} - {formatTime(user.hr_fim)}</span>
                                            <span className="text-xs text-gray-400">{formatPaymentDay(user.payment_day)}</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-2 text-sm text-gray-500 tracking-wider text-right">
                                        <div className="flex flex-col gap-1">
                                            <span>{formatCurrency(user.salario)}</span>
                                            <span className="text-xs text-gray-400">VR: {formatCurrency(user.vr_cred)}</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-2 text-sm text-gray-500 tracking-wider">
                                        <div className="flex flex-wrap justify-center gap-1">
                                            {canManageSalaryAdvances && (
                                                <Link href={route("salary-advances.create", { user: user.id })}>
                                                    <SuccessButton
                                                        className="ms-1"
                                                        aria-label="Adiantamento salarial"
                                                        title="Adiantamento salarial"
                                                    >
                                                        <i className="bi bi-cash-coin text-lg" aria-hidden="true"></i>
                                                    </SuccessButton>
                                                </Link>
                                            )}
                                            {canView && (
                                                <Link href={route("users.show", { user: user.id })}>
                                                    <PrimaryButton
                                                        className="ms-1"
                                                        aria-label="Visualizar"
                                                        title="Visualizar"
                                                    >
                                                        <i className="bi bi-eye text-lg" aria-hidden="true"></i>
                                                    </PrimaryButton>
                                                </Link>
                                            )}
                                            {canEdit && (
                                                <Link href={route("users.edit", { user: user.id })}>
                                                    <WarningButton
                                                        className="ms-1"
                                                        aria-label="Editar"
                                                        title="Editar"
                                                    >
                                                        <i className="bi bi-pencil-square text-lg" aria-hidden="true"></i>
                                                    </WarningButton>
                                                </Link>
                                            )}
                                            {canDelete && (
                                                <ConfirmDeleteButton id={user.id} routeName="users.destroy" />
                                            )}
                                            {canToggleActive && (
                                                <button
                                                    type="button"
                                                    className={`ms-1 inline-flex items-center rounded-md border border-transparent bg-slate-700 px-2 py-1 text-md tracking-widest text-white transition duration-150 ease-in-out hover:bg-slate-800 focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-700 focus:ring-offset-2 ${
                                                        user.id === auth.user.id ? "cursor-not-allowed opacity-25" : ""
                                                    }`}
                                                    aria-label={user.is_active ? "Inativar" : "Reativar"}
                                                    title={user.is_active ? "Inativar" : "Reativar"}
                                                    disabled={user.id === auth.user.id}
                                                    onClick={() => handleToggleActive(user)}
                                                >
                                                    <i
                                                        className={`bi ${user.is_active ? "bi-person-dash" : "bi-person-check"} text-lg`}
                                                        aria-hidden="true"
                                                    ></i>
                                                </button>
                                            )}
                                            {!canManageSalaryAdvances && !canView && !canEdit && !canDelete && !canToggleActive && (
                                                <span className="text-xs text-gray-400">--</span>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    <Pagination links={users.links} currentPage={users.current_page} />
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
