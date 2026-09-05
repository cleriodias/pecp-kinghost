import InfoButton from '@/Components/Button/InfoButton';
import PrimaryButton from '@/Components/Button/PrimaryButton';
import Modal from '@/Components/Modal';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import {
    formatBrazilShortDate,
    isoToBrazilShortDateInput,
    normalizeBrazilShortDateInput,
    shortBrazilDateInputToIso,
} from '@/Utils/date';
import {
    formatRoleBadgeLabel,
    formatUnitBadgeLabel,
    getRoleBadgeClassName,
    getRoleBadgeStyle,
    getUnitBadgeClassName,
    getUnitBadgeStyle,
} from '@/Utils/brandBadges';
import { printContraCheque } from '@/Utils/contraChequePrint';
import { Head, Link, useForm } from '@inertiajs/react';
import { useMemo, useState } from 'react';

const formatCurrency = (value) =>
    Number(value ?? 0).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });

export default function FolhaPagamento({
    rows = [],
    summary = {},
    startDate,
    endDate,
    filterUnits = [],
    filterUsers = [],
    roleOptions = [],
    selectedUnitId = null,
    selectedRole = null,
    selectedUserId = null,
    unit = null,
}) {
    const { data, setData, get, processing } = useForm({
        start_date: isoToBrazilShortDateInput(startDate ?? ''),
        end_date: isoToBrazilShortDateInput(endDate ?? ''),
        unit_id:
            selectedUnitId !== null && selectedUnitId !== undefined
                ? String(selectedUnitId)
                : 'all',
        role:
            selectedRole !== null && selectedRole !== undefined
                ? String(selectedRole)
                : 'all',
        user_id:
            selectedUserId !== null && selectedUserId !== undefined
                ? String(selectedUserId)
                : 'all',
    });
    const [selectedDetail, setSelectedDetail] = useState(null);
    const [printError, setPrintError] = useState('');

    const summaryCards = useMemo(
        () => [
            { key: 'employees', label: 'Colaboradores', value: Number(summary.employees_count ?? 0).toLocaleString('pt-BR') },
            { key: 'salary', label: 'Salarios', value: formatCurrency(summary.salary_total) },
            { key: 'advances', label: 'Adiantamentos', value: formatCurrency(summary.advances_total) },
            { key: 'vales', label: 'Vales', value: formatCurrency(summary.vales_total) },
            { key: 'balance', label: 'Saldo', value: formatCurrency(summary.balance_total) },
        ],
        [summary],
    );

    const handleSubmit = (event) => {
        event.preventDefault();

        get(route('settings.payroll'), {
            preserveState: true,
            preserveScroll: true,
            replace: true,
            data: {
                start_date: shortBrazilDateInputToIso(data.start_date) || undefined,
                end_date: shortBrazilDateInputToIso(data.end_date) || undefined,
                unit_id: data.unit_id,
                role: data.role,
                user_id: data.user_id,
            },
        });
    };

    const handlePrintContraCheque = (detail) => {
        setPrintError(
            printContraCheque(detail, 'Permita pop-ups para imprimir o contra-cheque.', {
                showDetails: true,
            }),
        );
    };

    return (
        <AuthenticatedLayout
            header={
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">
                            Folha de Pagamento
                        </h2>
                        <p className="text-sm text-gray-500 dark:text-gray-300">
                            Consolidado de salarios, adiantamentos, vales e saldo. Unidade atual: {unit?.name ?? '---'}.
                        </p>
                    </div>
                    <Link
                        href={route('settings.contra-cheque')}
                        className="inline-flex items-center justify-center rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 dark:border-gray-600 dark:text-gray-100 dark:hover:bg-gray-700"
                    >
                        Ir para Contra-Cheque
                    </Link>
                </div>
            }
        >
            <Head title="Folha de Pagamento" />

            <div className="py-8">
                <div className="mx-auto max-w-7xl space-y-6 px-4 sm:px-6 lg:px-8">
                    {printError && (
                        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200">
                            {printError}
                        </div>
                    )}

                    <form
                        onSubmit={handleSubmit}
                        className="rounded-2xl bg-white p-4 shadow dark:bg-gray-800"
                    >
                        <div className="flex flex-wrap items-end gap-3">
                            <div>
                                <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                    Inicio
                                </label>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    value={data.start_date}
                                    onChange={(event) => setData('start_date', normalizeBrazilShortDateInput(event.target.value))}
                                    placeholder="DD/MM/AA"
                                    className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                    Fim
                                </label>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    value={data.end_date}
                                    onChange={(event) => setData('end_date', normalizeBrazilShortDateInput(event.target.value))}
                                    placeholder="DD/MM/AA"
                                    className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                    Unidade
                                </label>
                                <select
                                    value={data.unit_id}
                                    onChange={(event) => setData('unit_id', event.target.value)}
                                    className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                                >
                                    <option value="all">Todas</option>
                                    {filterUnits.map((filterUnit) => (
                                        <option key={filterUnit.id} value={filterUnit.id}>
                                            {filterUnit.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                    Funcao
                                </label>
                                <select
                                    value={data.role}
                                    onChange={(event) => setData('role', event.target.value)}
                                    className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                                >
                                    <option value="all">Todas</option>
                                    {roleOptions.map((roleOption) => (
                                        <option key={roleOption.id} value={roleOption.id}>
                                            {roleOption.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                    Usuario
                                </label>
                                <select
                                    value={data.user_id}
                                    onChange={(event) => setData('user_id', event.target.value)}
                                    className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                                >
                                    <option value="all">Todos</option>
                                    {filterUsers.map((filterUser) => (
                                        <option key={filterUser.id} value={filterUser.id}>
                                            {filterUser.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <PrimaryButton type="submit" disabled={processing} className="px-4 py-2 normal-case tracking-normal">
                                Filtrar
                            </PrimaryButton>
                        </div>
                    </form>

                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                        {summaryCards.map((card) => (
                            <div
                                key={card.key}
                                className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800"
                            >
                                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gray-400">
                                    {card.label}
                                </p>
                                <p className="mt-3 text-xl font-semibold text-gray-900 dark:text-gray-100">
                                    {card.value}
                                </p>
                            </div>
                        ))}
                    </div>

                    <div className="rounded-2xl bg-white p-6 shadow dark:bg-gray-800">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                                    Colaboradores
                                </h3>
                                <p className="text-sm text-gray-500 dark:text-gray-300">
                                    Lista de usuarios sem o perfil Cliente.
                                </p>
                            </div>
                            <span className="text-xs font-semibold text-gray-500 dark:text-gray-300">
                                {rows.length} registro(s)
                            </span>
                        </div>

                        {rows.length === 0 ? (
                            <p className="mt-4 rounded-xl border border-dashed border-gray-200 px-4 py-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-300">
                                Nenhum colaborador encontrado para os filtros informados.
                            </p>
                        ) : (
                            <div className="mt-4 overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-700">
                                    <thead className="bg-gray-100 dark:bg-gray-900/60">
                                        <tr>
                                            <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">
                                                Usuario
                                            </th>
                                            <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-300">
                                                Salario
                                            </th>
                                            <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-300">
                                                Adiantamentos
                                            </th>
                                            <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-300">
                                                Vales
                                            </th>
                                            <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-300">
                                                Saldo
                                            </th>
                                            <th className="px-3 py-2 text-center font-medium text-gray-600 dark:text-gray-300">
                                                Acoes
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                        {rows.map((row) => (
                                            <tr key={row.id}>
                                                <td className="px-3 py-3">
                                                    <div className="space-y-2">
                                                        <p className="font-semibold text-gray-900 dark:text-gray-100">
                                                            {row.name}
                                                        </p>
                                                        <div className="flex flex-wrap gap-2">
                                                            <span
                                                                className={getRoleBadgeClassName()}
                                                                style={getRoleBadgeStyle(row.role_label)}
                                                            >
                                                                {formatRoleBadgeLabel(row.role_label)}
                                                            </span>
                                                            {(row.unit_names ?? []).map((unitName) => (
                                                                <span
                                                                    key={`${row.id}-${unitName}`}
                                                                    className={getUnitBadgeClassName()}
                                                                    style={getUnitBadgeStyle(unitName)}
                                                                >
                                                                    {formatUnitBadgeLabel(unitName)}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-gray-100">
                                                    {formatCurrency(row.salary)}
                                                </td>
                                                <td className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-gray-100">
                                                    {formatCurrency(row.advances_total)}
                                                </td>
                                                <td className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-gray-100">
                                                    {formatCurrency(row.vales_total)}
                                                </td>
                                                <td className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-gray-100">
                                                    {formatCurrency(row.balance)}
                                                </td>
                                                <td className="px-3 py-3">
                                                    <div className="flex flex-wrap items-center justify-center gap-2">
                                                        <InfoButton
                                                            type="button"
                                                            onClick={() => setSelectedDetail(row.detail)}
                                                            className="px-3 py-2 normal-case tracking-normal"
                                                        >
                                                            Detalhes
                                                        </InfoButton>
                                                        <PrimaryButton
                                                            type="button"
                                                            onClick={() => handlePrintContraCheque(row.detail)}
                                                            className="px-3 py-2 normal-case tracking-normal"
                                                        >
                                                            Contra-Cheque
                                                        </PrimaryButton>
                                                    </div>
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

            <Modal show={Boolean(selectedDetail)} onClose={() => setSelectedDetail(null)} maxWidth="2xl" tone="light">
                <div className="bg-white p-6 text-gray-900">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <h3 className="text-lg font-semibold">
                                Detalhamento da folha
                            </h3>
                            <p className="mt-1 text-sm text-gray-500">
                                Periodo: {selectedDetail ? `${formatBrazilShortDate(selectedDetail.start_date)} a ${formatBrazilShortDate(selectedDetail.end_date)}` : '--'}.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setSelectedDetail(null)}
                            className="text-sm font-semibold text-gray-500 transition hover:text-gray-800"
                        >
                            Fechar
                        </button>
                    </div>

                    {selectedDetail && (
                        <>
                            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                                    <p className="text-xs font-bold uppercase tracking-[0.25em] text-gray-400">
                                        Usuario
                                    </p>
                                    <p className="mt-2 text-base font-semibold text-gray-900">
                                        {selectedDetail.user_name}
                                    </p>
                                </div>
                                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                                    <p className="text-xs font-bold uppercase tracking-[0.25em] text-gray-400">
                                        Funcao
                                    </p>
                                    <p className="mt-2 text-base font-semibold text-gray-900">
                                        {selectedDetail.role_label}
                                    </p>
                                </div>
                                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                                    <p className="text-xs font-bold uppercase tracking-[0.25em] text-gray-400">
                                        Salario
                                    </p>
                                    <p className="mt-2 text-base font-semibold text-gray-900">
                                        {formatCurrency(selectedDetail.salary)}
                                    </p>
                                </div>
                                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                                    <p className="text-xs font-bold uppercase tracking-[0.25em] text-gray-400">
                                        Saldo
                                    </p>
                                    <p className="mt-2 text-base font-semibold text-gray-900">
                                        {formatCurrency(selectedDetail.balance)}
                                    </p>
                                </div>
                            </div>

                            <div className="mt-3 rounded-2xl border border-gray-200 bg-gray-50 p-4">
                                <p className="text-xs font-bold uppercase tracking-[0.25em] text-gray-400">
                                    Lojas
                                </p>
                                <div className="mt-2 flex flex-wrap gap-2">
                                    {(selectedDetail.unit_names ?? []).length > 0 ? (
                                        selectedDetail.unit_names.map((unitName) => (
                                            <span
                                                key={`detail-${selectedDetail.user_id}-${unitName}`}
                                                className={getUnitBadgeClassName()}
                                                style={getUnitBadgeStyle(unitName)}
                                            >
                                                {formatUnitBadgeLabel(unitName)}
                                            </span>
                                        ))
                                    ) : (
                                        <span className="text-sm text-gray-500">---</span>
                                    )}
                                </div>
                            </div>

                            <div className="mt-6 grid gap-3 sm:grid-cols-3">
                                <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
                                    <p className="text-xs font-bold uppercase tracking-[0.25em] text-blue-500">
                                        Adiantamentos
                                    </p>
                                    <p className="mt-2 text-2xl font-bold text-blue-700">
                                        {formatCurrency(selectedDetail.advances_total)}
                                    </p>
                                    <p className="mt-1 text-sm text-blue-700">
                                        {selectedDetail.advances_count} lancamento(s)
                                    </p>
                                </div>
                                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                                    <p className="text-xs font-bold uppercase tracking-[0.25em] text-amber-500">
                                        Vales
                                    </p>
                                    <p className="mt-2 text-2xl font-bold text-amber-700">
                                        {formatCurrency(selectedDetail.vales_total)}
                                    </p>
                                    <p className="mt-1 text-sm text-amber-700">
                                        {selectedDetail.vales_count} cupom(ns)
                                    </p>
                                </div>
                                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                                    <p className="text-xs font-bold uppercase tracking-[0.25em] text-emerald-500">
                                        Saldo
                                    </p>
                                    <p className="mt-2 text-2xl font-bold text-emerald-700">
                                        {formatCurrency(selectedDetail.balance)}
                                    </p>
                                    <p className="mt-1 text-sm text-emerald-700">
                                        Salario menos descontos do periodo
                                    </p>
                                </div>
                            </div>

                            <div className="mt-6 space-y-6">
                                <div>
                                    <div className="flex items-center justify-between gap-3">
                                        <h4 className="text-sm font-semibold uppercase tracking-[0.25em] text-gray-500">
                                            Adiantamentos
                                        </h4>
                                        <span className="text-xs font-semibold text-gray-400">
                                            {selectedDetail.advances_count} registro(s)
                                        </span>
                                    </div>

                                    {selectedDetail.advances.length === 0 ? (
                                        <p className="mt-3 rounded-xl border border-dashed border-gray-200 px-4 py-4 text-sm text-gray-500">
                                            Nenhum adiantamento no periodo selecionado.
                                        </p>
                                    ) : (
                                        <div className="mt-3 overflow-x-auto">
                                            <table className="min-w-full divide-y divide-gray-200 text-sm">
                                                <thead className="bg-gray-100">
                                                    <tr>
                                                        <th className="px-3 py-2 text-left font-medium text-gray-600">
                                                            Data
                                                        </th>
                                                        <th className="px-3 py-2 text-left font-medium text-gray-600">
                                                            Loja
                                                        </th>
                                                        <th className="px-3 py-2 text-right font-medium text-gray-600">
                                                            Valor
                                                        </th>
                                                        <th className="px-3 py-2 text-left font-medium text-gray-600">
                                                            Observacao
                                                        </th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-100">
                                                    {selectedDetail.advances.map((advance) => (
                                                        <tr key={advance.id}>
                                                            <td className="px-3 py-2 text-gray-700">
                                                                {formatBrazilShortDate(advance.advance_date)}
                                                            </td>
                                                            <td className="px-3 py-2 text-gray-700">
                                                                {advance.unit_name ?? '---'}
                                                            </td>
                                                            <td className="px-3 py-2 text-right font-semibold text-gray-900">
                                                                {formatCurrency(advance.amount)}
                                                            </td>
                                                            <td className="px-3 py-2 text-gray-700">
                                                                {advance.reason || '--'}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>

                                <div>
                                    <div className="flex items-center justify-between gap-3">
                                        <h4 className="text-sm font-semibold uppercase tracking-[0.25em] text-gray-500">
                                            Vales
                                        </h4>
                                        <span className="text-xs font-semibold text-gray-400">
                                            {selectedDetail.vales_count} cupom(ns)
                                        </span>
                                    </div>

                                    {selectedDetail.vales.length === 0 ? (
                                        <p className="mt-3 rounded-xl border border-dashed border-gray-200 px-4 py-4 text-sm text-gray-500">
                                            Nenhum vale no periodo selecionado.
                                        </p>
                                    ) : (
                                        <div className="mt-3 overflow-x-auto">
                                            <table className="min-w-full divide-y divide-gray-200 text-sm">
                                                <thead className="bg-gray-100">
                                                    <tr>
                                                        <th className="px-3 py-2 text-left font-medium text-gray-600">
                                                            Data/Hora
                                                        </th>
                                                        <th className="px-3 py-2 text-left font-medium text-gray-600">
                                                            Cupom
                                                        </th>
                                                        <th className="px-3 py-2 text-left font-medium text-gray-600">
                                                            Loja
                                                        </th>
                                                        <th className="px-3 py-2 text-left font-medium text-gray-600">
                                                            Itens
                                                        </th>
                                                        <th className="px-3 py-2 text-right font-medium text-gray-600">
                                                            Total
                                                        </th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-100">
                                                    {selectedDetail.vales.map((vale) => (
                                                        <tr key={vale.id}>
                                                            <td className="px-3 py-2 text-gray-700">
                                                                {formatBrazilDateTime(vale.date_time)}
                                                            </td>
                                                            <td className="px-3 py-2 font-semibold text-gray-900">
                                                                #{vale.id}
                                                            </td>
                                                            <td className="px-3 py-2 text-gray-700">
                                                                {vale.unit_name ?? '---'}
                                                            </td>
                                                            <td className="px-3 py-2 text-gray-700">
                                                                <div className="max-w-md">
                                                                    <p className="font-medium">
                                                                        {vale.items_count} item(ns)
                                                                    </p>
                                                                    <p className="text-xs text-gray-500">
                                                                        {vale.items_label || '--'}
                                                                    </p>
                                                                </div>
                                                            </td>
                                                            <td className="px-3 py-2 text-right font-semibold text-gray-900">
                                                                {formatCurrency(vale.total)}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="mt-6 flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => setSelectedDetail(null)}
                                    className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100"
                                >
                                    Fechar
                                </button>
                                <PrimaryButton
                                    type="button"
                                    onClick={() => handlePrintContraCheque(selectedDetail)}
                                    className="px-4 py-2 normal-case tracking-normal"
                                >
                                    Contra-Cheque
                                </PrimaryButton>
                            </div>
                        </>
                    )}
                </div>
            </Modal>
        </AuthenticatedLayout>
    );
}
