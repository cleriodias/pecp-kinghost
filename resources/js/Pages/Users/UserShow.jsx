import AlertMessage from "@/Components/Alert/AlertMessage";
import Modal from "@/Components/Modal";
import SecondaryButton from "@/Components/SecondaryButton";
import AuthenticatedLayout from "@/Layouts/AuthenticatedLayout";
import { formatBrazilDate, formatBrazilDateTime } from "@/Utils/date";
import { Head, Link, usePage } from "@inertiajs/react";
import { useState } from "react";

const funcaoLabels = {
    0: 'MASTER',
    1: 'GERENTE',
    2: 'SUB-GERENTE',
    3: 'CAIXA',
    4: 'LANCHONETE',
    5: 'FUNCIONARIO',
    6: 'CLIENTE',
};

const paymentLabels = {
    refeicao: 'Refeição',
    vale: 'Vale',
    dinheiro: 'Dinheiro',
    maquina: 'Maquina',
};

const formatTime = (value) => {
    if (!value) {
        return '--:--';
    }

    return value.substring(0, 5);
};

const formatCurrency = (value) => {
    const parsed = Number(value ?? 0);

    return parsed.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const formatDateTime = (value) => {
    if (!value) {
        return '--';
    }

    return formatBrazilDateTime(value);
};

const formatDate = (value) => {
    if (!value) {
        return '--';
    }

    return formatBrazilDate(value);
};

export default function UserShow({
    auth,
    user,
    valeUsage = [],
    vrUsage = [],
    advanceUsage = [],
    financialSummary = {},
}) {
    const { flash } = usePage().props;
    const linkedUnits = user.units ?? [];
    const [activeModal, setActiveModal] = useState(null);
    const [expandedAdvances, setExpandedAdvances] = useState({});

    const openModal = (type, group) => {
        setActiveModal({ type, group });
    };

    const closeModal = () => setActiveModal(null);

    const toggleAdvanceGroup = (period) => {
        setExpandedAdvances((prev) => ({
            ...prev,
            [period]: !prev[period],
        }));
    };

    const summaryCards = [
        {
            key: 'valeTotal',
            title: 'Vale',
            value: financialSummary?.valeTotal ?? 0,
            subtitle: 'Vales realizados',
            accent: 'text-indigo-600',
        },
        {
            key: 'vrCreditTotal',
            title: 'VR Crédito',
            value: financialSummary?.vrCreditTotal ?? 0,
            subtitle: 'Refeição utilizado',
            accent: 'text-amber-600',
        },
        {
            key: 'advanceTotal',
            title: 'Adiantamento',
            value: financialSummary?.advanceTotal ?? 0,
            subtitle: 'Adiantamentos realizados',
            accent: 'text-orange-500',
        },
        {
            key: 'balance',
            title: 'Saldo',
            value: financialSummary?.balance ?? 0,
            subtitle:
                (financialSummary?.balance ?? 0) >= 0 ? 'A receber' : 'A devolver',
            accent:
                (financialSummary?.balance ?? 0) >= 0
                    ? 'text-green-600'
                    : 'text-red-600',
        },
    ];

    const infoItems = [
        { label: 'NOME', value: user.name ?? '---' },
        { label: 'E-MAIL', value: user.email ?? '---' },
        { label: 'FUN\u00c7\u00c3O', value: funcaoLabels[user.funcao] ?? '---' },
        { label: 'STATUS', value: user.is_active ? 'ATIVO' : 'INATIVO' },
        { label: 'JORNADA', value: `${formatTime(user.hr_ini)} - ${formatTime(user.hr_fim)}` },
        { label: 'SAL\u00c1RIO', value: formatCurrency(user.salario) },
        { label: 'CR\u00c9DITO VR', value: formatCurrency(user.vr_cred) },
    ];

    const renderGroupedList = (groups, type) => {
        if (!groups.length) {
            return (
                <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
                    Nenhum registro encontrado.
                </p>
            );
        }

        return (
            <div className="mt-4 space-y-3">
                {groups.map((group) => (
                    <button
                        key={`${type}-${group.period}`}
                        type="button"
                        onClick={() => openModal(type, group)}
                        className="flex w-full items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 text-left shadow-sm transition hover:border-indigo-300 hover:shadow-md dark:border-gray-700 dark:bg-gray-900"
                    >
                        <div>
                            <p className="font-semibold text-gray-800 dark:text-gray-100">
                                {group.label}
                            </p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                {group.count} registro(s)
                            </p>
                        </div>
                        <div className="text-right">
                            <p className="text-lg font-bold text-indigo-600 dark:text-indigo-300">
                                {formatCurrency(group.total)}
                            </p>
                            <span className="text-xs text-indigo-600">
                                Ver detalhes
                            </span>
                        </div>
                    </button>
                ))}
            </div>
        );
    };

    const modalTitle = activeModal?.type === 'vr' ? 'VR CR\u00c9DITO' : 'Vale';
    const modalItems = activeModal?.group?.items ?? [];

    return (
        <AuthenticatedLayout
            user={auth.user}
            header={
                <h2 className="font-semibold text-xl text-gray-800 dark:text-gray-200 leading-tight">
                    {'Usuários'}
                </h2>
            }
        >
            <Head title={'Usuário'} />

            <div className="py-6 max-w-7xl mx-auto sm:px-6 lg:px-8">
                <div className="space-y-6">
                    <div className="rounded-[32px] border border-gray-100 bg-white shadow-xl">
                        <div className="flex items-center justify-between px-6 py-5">
                            <div>
                                <h3 className="text-lg font-semibold text-gray-900">Visualizar</h3>
                                <p className="text-sm text-gray-500">Informações gerais do usuário</p>
                            </div>
                            <div className="flex items-center gap-3">
                                <Link
                                    href={route('users.create')}
                                    className="inline-flex items-center rounded-2xl border border-transparent bg-green-500 px-3 py-3 text-md tracking-widest text-white transition duration-150 ease-in-out hover:bg-green-600 focus:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 active:bg-green-900 dark:bg-green-200 dark:text-green-800 dark:hover:bg-white dark:focus:bg-white dark:focus:ring-offset-green-900 dark:active:bg-green-300"
                                    aria-label="Incluir"
                                    title="Incluir"
                                >
                                    <i className="bi bi-plus-lg text-lg" aria-hidden="true"></i>
                                </Link>
                                <Link
                                    href={route('users.index')}
                                    className="inline-flex items-center rounded-2xl border border-transparent bg-cyan-500 px-3 py-3 text-md tracking-widest text-white transition duration-150 ease-in-out hover:bg-cyan-600 focus:bg-cyan-600 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 active:bg-cyan-400 dark:bg-cyan-200 dark:text-cyan-800 dark:hover:bg-white dark:focus:bg-white dark:focus:ring-offset-cyan-900 dark:active:bg-cyan-400"
                                    aria-label="Listar"
                                    title="Listar"
                                >
                                    <i className="bi bi-list text-lg" aria-hidden="true"></i>
                                </Link>
                            </div>
                        </div>

                        <AlertMessage message={flash} />

                        <div className="border-t border-gray-100 px-6 py-8 text-sm text-gray-700">
                            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                                {infoItems.map((item) => (
                                    <div key={item.label} className="space-y-2">
                                        <p className="text-[0.65rem] font-bold uppercase tracking-[0.3em] text-gray-400">
                                            {item.label}
                                        </p>
                                        <div className="rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-center text-lg font-semibold uppercase tracking-wide text-indigo-700 shadow-sm">
                                            {item.value}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="mt-8 rounded-2xl border border-gray-100 bg-gray-50/70 p-4">
                                <p className="text-[0.65rem] font-bold uppercase tracking-[0.3em] text-gray-400">
                                    Unidades vinculadas
                                </p>
                                {linkedUnits.length ? (
                                    <ul className="mt-2 list-disc list-inside text-gray-700">
                                        {linkedUnits.map((unit) => (
                                            <li key={unit.tb2_id}>
                                                #{unit.tb2_id} - {unit.tb2_nome}
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p className="mt-2 text-gray-500">Nenhuma unidade vinculada.</p>
                                )}
                            </div>
                        </div>
                    </div>


                    <section className="rounded-2xl bg-white p-6 shadow dark:bg-gray-800">
                        <div className="flex flex-col gap-1">
                            <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
                                Financeiro
                            </h4>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                Uso de recursos financeiros do usuário
                            </p>
                        </div>
                        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                            {summaryCards.map((card) => (
                                <div
                                    key={card.key}
                                    className="rounded-2xl border border-gray-100 bg-gradient-to-br from-white to-indigo-50 p-4 shadow-sm dark:border-gray-700 dark:from-gray-900 dark:to-gray-800"
                                >
                                    <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                        {card.title}
                                    </p>
                                    <p className={`mt-2 text-2xl font-bold ${card.accent}`}>
                                        {formatCurrency(card.value)}
                                    </p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                        {card.subtitle}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </section>

                    <section className="rounded-2xl bg-white p-6 shadow dark:bg-gray-800">
                        <div className="flex flex-col gap-1">
                            <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
                                Utilização VR crédito
                            </h4>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                Registros agrupados por período
                            </p>
                        </div>
                        {renderGroupedList(vrUsage, 'vr')}
                    </section>

                    <section className="rounded-2xl bg-white p-6 shadow dark:bg-gray-800">
                        <div className="flex flex-col gap-1">
                            <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
                                Registros de vale
                            </h4>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                Clique para visualizar os itens lançados
                            </p>
                        </div>
                        {renderGroupedList(valeUsage, 'vale')}
                    </section>

                    <section className="rounded-2xl bg-white p-6 shadow dark:bg-gray-800">
                        <div className="flex flex-col gap-1">
                            <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
                                Adiantamentos
                            </h4>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                Registros agrupados por período. Clique para expandir.
                            </p>
                        </div>

                        {!advanceUsage.length ? (
                            <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
                                Nenhum adiantamento registrado.
                            </p>
                        ) : (
                            <div className="mt-4 space-y-3">
                                {advanceUsage.map((group) => {
                                    const isOpen = expandedAdvances[group.period];

                                    return (
                                        <div
                                            key={group.period}
                                            className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900"
                                        >
                                            <button
                                                type="button"
                                                onClick={() => toggleAdvanceGroup(group.period)}
                                                className="flex w-full items-center justify-between px-4 py-3 text-left"
                                            >
                                                <div>
                                                    <p className="font-semibold text-gray-800 dark:text-gray-100">
                                                        {group.label}
                                                    </p>
                                                    <p className="text-sm text-gray-500 dark:text-gray-400">
                                                        {group.count} registro(s)
                                                    </p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-lg font-bold text-orange-500">
                                                        {formatCurrency(group.total)}
                                                    </p>
                                                    <i
                                                        className={`bi ${
                                                            isOpen
                                                                ? 'bi-chevron-up'
                                                                : 'bi-chevron-down'
                                                        } text-xl text-gray-500`}
                                                        aria-hidden="true"
                                                    ></i>
                                                </div>
                                            </button>
                                            {isOpen && (
                                                <div className="border-t border-gray-100 px-4 py-3 text-sm dark:border-gray-700">
                                                    <div className="overflow-x-auto">
                                                        <table className="w-full text-left text-sm">
                                                            <thead>
                                                                <tr className="text-gray-500 dark:text-gray-400">
                                                                    <th className="py-2">Data</th>
                                                                    <th className="py-2">Valor</th>
                                                                    <th className="py-2">Motivo</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                                                {group.items.map((item) => (
                                                                    <tr key={item.id}>
                                                                        <td className="py-2 text-gray-700 dark:text-gray-200">
                                                                            {formatDate(item.date)}
                                                                        </td>
                                                                        <td className="py-2 font-semibold text-gray-900 dark:text-gray-100">
                                                                            {formatCurrency(item.amount)}
                                                                        </td>
                                                                        <td className="py-2 text-gray-600 dark:text-gray-300">
                                                                            {item.reason || '---'}
                                                                        </td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </section>
                </div>
            </div>

            <Modal show={Boolean(activeModal)} onClose={closeModal} tone="light">
                <div className="bg-white p-6 text-gray-800">
                    <h3 className="text-lg font-semibold text-gray-900">
                        Registros de {modalTitle} - {activeModal?.group?.label}
                    </h3>
                    {!modalItems.length ? (
                        <p className="mt-4 text-sm text-gray-500">
                            Nenhum registro dispon\u00edvel para este perÃ­odo.
                        </p>
                    ) : (
                        <div className="mt-4 max-h-96 overflow-y-auto">
                            <table className="w-full text-left text-sm">
                                <thead>
                                    <tr className="text-gray-500">
                                        <th className="py-2">Cupom</th>
                                        <th className="py-2">Data/Hora</th>
                                        <th className="py-2">Tipo</th>
                                        <th className="py-2">Unidade</th>
                                        <th className="py-2 text-right">Total</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {modalItems.map((item) => (
                                        <tr key={item.id}>
                                            <td className="py-2 text-gray-700">
                                                #{item.cupom ?? item.id}
                                            </td>
                                            <td className="py-2 text-gray-700">
                                                {formatDateTime(item.date_time)}
                                            </td>
                                            <td className="py-2 text-gray-600">
                                                {paymentLabels[item.type] ?? item.type}
                                            </td>
                                            <td className="py-2 text-gray-700">
                                                {item.unit ?? '---'}
                                            </td>
                                            <td className="py-2 text-right font-semibold text-gray-900">
                                                {formatCurrency(item.total)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    <div className="mt-6 flex justify-end">
                        <SecondaryButton type="button" onClick={closeModal}>
                            Fechar
                        </SecondaryButton>
                    </div>
                </div>
            </Modal>
        </AuthenticatedLayout>
    );
}
