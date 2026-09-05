import AlertMessage from "@/Components/Alert/AlertMessage";
import DangerButton from "@/Components/Button/DangerButton";
import PrimaryButton from "@/Components/Button/PrimaryButton";
import SuccessButton from "@/Components/Button/SuccessButton";
import Modal from "@/Components/Modal";
import SecondaryButton from "@/Components/SecondaryButton";
import AuthenticatedLayout from "@/Layouts/AuthenticatedLayout";
import {
    formatBrazilShortDate,
    getBrazilTodayShortInputValue,
    normalizeBrazilShortDateInput,
    shortBrazilDateInputToIso,
} from "@/Utils/date";
import { printSalaryAdvanceDetail } from "@/Utils/salaryAdvancePrint";
import { Head, Link, router, usePage } from "@inertiajs/react";
import { useEffect, useMemo, useState } from "react";

const formatCurrency = (value) =>
    Number(value ?? 0).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
    });

const formatPercentage = (value) =>
    Number(value ?? 0).toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });

export default function SalaryAdvanceCreate({
    users,
    activeUnit = null,
    selectedUser = null,
    currentMonthAdvances = [],
    currentMonthTotal = 0,
    currentMonthReference = "",
    currentMonthStart = "",
    currentMonthEnd = "",
    canDeleteAdvances = false,
}) {
    const { flash } = usePage().props;
    const [form, setForm] = useState({
        user_id: selectedUser?.id ?? 0,
        user_name: selectedUser?.name ?? "",
        amount: "",
        advance_date: getBrazilTodayShortInputValue(),
        reason: "",
    });
    const [errors, setErrors] = useState({});
    const [submitting, setSubmitting] = useState(false);
    const [previewOpen, setPreviewOpen] = useState(false);
    const [printError, setPrintError] = useState("");
    const hasActiveUnit = Boolean(activeUnit?.id);

    useEffect(() => {
        if (!selectedUser) {
            return;
        }

        setForm((prev) => ({
            ...prev,
            user_id: selectedUser.id,
            user_name: selectedUser.name,
        }));
    }, [selectedUser]);

    const filteredUsers = useMemo(() => {
        const term = form.user_name.trim().toLowerCase();

        if (term.length < 2) {
            return [];
        }

        if (selectedUser?.name?.toLowerCase() === term) {
            return [];
        }

        return users.filter((user) =>
            user.name.toLowerCase().includes(term),
        );
    }, [form.user_name, selectedUser, users]);

    const selectedSalary = Number(selectedUser?.salary_limit ?? 0);
    const enteredAmount = Number(form.amount || 0);
    const projectedTotal = Number(currentMonthTotal ?? 0) + enteredAmount;
    const projectedPercentage =
        selectedSalary > 0 ? (projectedTotal / selectedSalary) * 100 : 0;
    const projectedBalance = selectedSalary - projectedTotal;
    const currentMonthDetail = useMemo(() => {
        if (!selectedUser || currentMonthAdvances.length === 0) {
            return null;
        }

        return {
            user_name: selectedUser.name,
            start_date: currentMonthStart,
            end_date: currentMonthEnd,
            records_count: currentMonthAdvances.length,
            total_amount: Number(currentMonthTotal ?? 0),
            records: currentMonthAdvances.map((advance) => ({
                ...advance,
                unit_name: advance.unit_name || activeUnit?.name || "---",
            })),
        };
    }, [
        activeUnit?.name,
        currentMonthAdvances,
        currentMonthEnd,
        currentMonthStart,
        currentMonthTotal,
        selectedUser,
    ]);

    const handleSelectUser = (userId) => {
        if (!userId) {
            return;
        }

        router.get(
            route("salary-advances.create"),
            { user: userId },
            { preserveScroll: true },
        );
    };

    const handleClearUser = () => {
        router.get(route("salary-advances.create"), {}, { preserveScroll: true });
    };

    const handlePreview = (event) => {
        event.preventDefault();

        const nextErrors = {};

        if (!form.user_id || !selectedUser) {
            nextErrors.user_id = "Selecione um usuario para continuar.";
        }

        if (!shortBrazilDateInputToIso(form.advance_date)) {
            nextErrors.advance_date = "Informe a data no formato DD/MM/AA.";
        }

        if (!Number.isFinite(enteredAmount) || enteredAmount <= 0) {
            nextErrors.amount = "Informe um valor maior que zero.";
        }

        if (!hasActiveUnit) {
            nextErrors.unit = "Nenhuma unidade ativa definida para registrar o adiantamento.";
        }

        setErrors(nextErrors);

        if (Object.keys(nextErrors).length > 0) {
            setPreviewOpen(false);
            return;
        }

        setPreviewOpen(true);
    };

    const handleConfirm = () => {
        setSubmitting(true);
        setErrors({});

        router.post(route("salary-advances.store"), form, {
            onError: (nextErrors) => {
                setErrors(nextErrors);
                setPreviewOpen(false);
            },
            onSuccess: () => setPreviewOpen(false),
            onFinish: () => setSubmitting(false),
        });
    };

    const handleDeleteAdvance = (advanceId) => {
        if (!advanceId || !canDeleteAdvances) {
            return;
        }

        if (!window.confirm("Confirma excluir este adiantamento?")) {
            return;
        }

        router.delete(route("salary-advances.destroy", advanceId), {
            preserveScroll: true,
        });
    };

    const handlePrintAdvance = (advance) => {
        if (!advance) {
            return;
        }

        setPrintError(
            printSalaryAdvanceDetail(
                {
                    user_name: selectedUser?.name ?? "---",
                    start_date: advance.advance_date,
                    end_date: advance.advance_date,
                    records_count: 1,
                    total_amount: Number(advance.amount ?? 0),
                    records: [
                        {
                            ...advance,
                            unit_name: advance.unit_name || activeUnit?.name || "---",
                        },
                    ],
                },
                "Permita pop-ups para imprimir este adiantamento.",
            ),
        );
    };

    const handlePrintAllAdvances = () => {
        if (!currentMonthDetail) {
            return;
        }

        setPrintError(
            printSalaryAdvanceDetail(
                currentMonthDetail,
                "Permita pop-ups para imprimir os adiantamentos.",
            ),
        );
    };

    const headerContent = (
        <div>
            <h2 className="text-xl font-semibold leading-tight text-gray-800 dark:text-gray-200">
                Adiantamento de salario
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-300">
                Cadastre vales salariais e acompanhe o mes corrente do colaborador.
            </p>
        </div>
    );

    return (
        <AuthenticatedLayout header={headerContent}>
            <Head title="Adiantamento" />

            <div className="py-8">
                <div className="mx-auto max-w-6xl space-y-6 px-4 sm:px-6 lg:px-8">
                    <div className="rounded-2xl bg-white p-6 shadow dark:bg-gray-800">
                        <div className="flex flex-col gap-3 border-b border-gray-100 pb-4 md:flex-row md:items-center md:justify-between">
                            <div>
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                                    Inclusao
                                </h3>
                                <p className="text-sm text-gray-500 dark:text-gray-300">
                                    Usuario selecionado: {selectedUser?.name ?? "nenhum"}
                                </p>
                            </div>
                            <Link
                                href={route("users.index")}
                                className="inline-flex items-center justify-center rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-gray-600 dark:text-gray-100 dark:hover:bg-gray-700"
                            >
                                Voltar para usuarios
                            </Link>
                        </div>

                        <AlertMessage message={flash} />
                        {printError && (
                            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200">
                                {printError}
                            </div>
                        )}

                        <form onSubmit={handlePreview} className="mt-6 space-y-6">
                            <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
                                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900">
                                    <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                        Buscar usuario
                                    </label>
                                    <input
                                        type="text"
                                        value={form.user_name}
                                        onChange={(event) =>
                                            setForm((prev) => ({
                                                ...prev,
                                                user_name: event.target.value,
                                                user_id:
                                                    selectedUser?.name === event.target.value
                                                        ? prev.user_id
                                                        : 0,
                                            }))
                                        }
                                        className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                                        placeholder="Digite o nome do colaborador"
                                    />
                                    {filteredUsers.length > 0 && (
                                        <div className="mt-2 rounded-2xl border border-gray-200 bg-white shadow dark:border-gray-700 dark:bg-gray-800">
                                            {filteredUsers.map((user) => (
                                                <button
                                                    type="button"
                                                    key={user.id}
                                                    onClick={() => handleSelectUser(user.id)}
                                                    className="flex w-full items-center justify-between px-4 py-3 text-left text-sm text-gray-700 transition hover:bg-blue-50 dark:text-gray-100 dark:hover:bg-blue-500/10"
                                                >
                                                    <span>{user.name}</span>
                                                    <span className="font-semibold text-blue-600 dark:text-blue-300">
                                                        {formatCurrency(user.salary_limit)}
                                                    </span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                    {errors.user_id && (
                                        <p className="mt-2 text-sm text-red-600">{errors.user_id}</p>
                                    )}
                                </div>

                                <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900">
                                    <p className="text-xs font-bold uppercase tracking-[0.25em] text-gray-400">
                                        Resumo atual
                                    </p>
                                    <div className="mt-3 space-y-2 text-sm text-gray-600 dark:text-gray-300">
                                        <div className="flex items-center justify-between">
                                            <span>Salario</span>
                                            <span className="font-semibold text-gray-900 dark:text-gray-100">
                                                {formatCurrency(selectedSalary)}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span>Total no mes</span>
                                            <span className="font-semibold text-gray-900 dark:text-gray-100">
                                                {formatCurrency(currentMonthTotal)}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span>Unidade da sessao</span>
                                            <span className="font-semibold text-gray-900 dark:text-gray-100">
                                                {activeUnit?.name ?? "--"}
                                            </span>
                                        </div>
                                    </div>
                                    {selectedUser && (
                                        <button
                                            type="button"
                                            onClick={handleClearUser}
                                            className="mt-4 text-sm font-semibold text-blue-600 transition hover:text-blue-700 dark:text-blue-300"
                                        >
                                            Trocar usuario
                                        </button>
                                    )}
                                    {!hasActiveUnit && (
                                        <p className="mt-3 text-sm text-red-600">{errors.unit ?? "Nenhuma unidade ativa definida para registrar o adiantamento."}</p>
                                    )}
                                </div>
                            </div>

                            <div className="grid gap-4 md:grid-cols-2">
                                <div>
                                    <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                        Valor
                                    </label>
                                    <input
                                        type="number"
                                        min="0.01"
                                        step="0.01"
                                        value={form.amount}
                                        onChange={(event) =>
                                            setForm((prev) => ({
                                                ...prev,
                                                amount: event.target.value,
                                            }))
                                        }
                                        className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                                        placeholder="0,00"
                                    />
                                    {errors.amount && (
                                        <p className="mt-2 text-sm text-red-600">{errors.amount}</p>
                                    )}
                                </div>

                                <div>
                                    <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                        Data
                                    </label>
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        value={form.advance_date}
                                        onChange={(event) =>
                                            setForm((prev) => ({
                                                ...prev,
                                                advance_date: normalizeBrazilShortDateInput(event.target.value),
                                            }))
                                        }
                                        className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                                        placeholder="DD/MM/AA"
                                    />
                                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                                        Pode ser retroativa.
                                    </p>
                                    {errors.advance_date && (
                                        <p className="mt-2 text-sm text-red-600">{errors.advance_date}</p>
                                    )}
                                </div>
                            </div>

                            <div>
                                <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                    Observacao
                                </label>
                                <textarea
                                    rows={3}
                                    value={form.reason}
                                    onChange={(event) =>
                                        setForm((prev) => ({
                                            ...prev,
                                            reason: event.target.value,
                                        }))
                                    }
                                    className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                                    placeholder="Descreva brevemente o motivo do adiantamento"
                                />
                            </div>

                            <div className="flex justify-end">
                                <PrimaryButton
                                    type="submit"
                                    disabled={submitting || !hasActiveUnit}
                                    className="rounded-xl px-4 py-2 text-sm font-semibold normal-case tracking-normal disabled:opacity-50"
                                >
                                    Gravar
                                </PrimaryButton>
                            </div>
                        </form>
                    </div>

                    <div className="rounded-2xl bg-white p-6 shadow dark:bg-gray-800">
                        <div className="flex flex-col gap-3 border-b border-gray-100 pb-4 md:flex-row md:items-center md:justify-between">
                            <div className="flex flex-col gap-1">
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                                    Vales do mes corrente
                                </h3>
                                <p className="text-sm text-gray-500 dark:text-gray-300">
                                    Referencia {currentMonthReference || "--"} para {selectedUser?.name ?? "nenhum usuario selecionado"}.
                                </p>
                            </div>
                            {currentMonthDetail && (
                                <PrimaryButton
                                    type="button"
                                    onClick={handlePrintAllAdvances}
                                    className="justify-center rounded-xl px-4 py-2 text-sm font-semibold normal-case tracking-normal"
                                >
                                    Imprimir todos
                                </PrimaryButton>
                            )}
                        </div>

                        {!selectedUser ? (
                            <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
                                Selecione um usuario para visualizar os adiantamentos do mes corrente.
                            </p>
                        ) : currentMonthAdvances.length === 0 ? (
                            <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
                                Nenhum adiantamento registrado neste mes para este usuario.
                            </p>
                        ) : (
                            <div className="mt-4 overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-700">
                                    <thead className="bg-gray-50 dark:bg-gray-900/40">
                                        <tr>
                                            <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">
                                                Data
                                            </th>
                                            <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-300">
                                                Valor
                                            </th>
                                            <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">
                                                Observacao
                                            </th>
                                            <th className="px-3 py-2 text-center font-medium text-gray-600 dark:text-gray-300">
                                                Acoes
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                        {currentMonthAdvances.map((advance) => (
                                            <tr key={advance.id}>
                                                <td className="px-3 py-2 text-gray-700 dark:text-gray-200">
                                                    {formatBrazilShortDate(advance.advance_date)}
                                                </td>
                                                <td className="px-3 py-2 text-right font-semibold text-gray-900 dark:text-gray-100">
                                                    {formatCurrency(advance.amount)}
                                                </td>
                                                <td className="px-3 py-2 text-gray-600 dark:text-gray-300">
                                                    {advance.reason || "--"}
                                                </td>
                                                <td className="px-3 py-2 text-center">
                                                    <div className="flex flex-wrap items-center justify-center gap-2">
                                                        <PrimaryButton
                                                            type="button"
                                                            onClick={() => handlePrintAdvance(advance)}
                                                            className="rounded-lg px-3 py-1 text-xs font-semibold normal-case tracking-normal"
                                                        >
                                                            Imprimir
                                                        </PrimaryButton>
                                                        {canDeleteAdvances ? (
                                                            <DangerButton
                                                                type="button"
                                                                onClick={() => handleDeleteAdvance(advance.id)}
                                                                className="rounded-lg px-3 py-1 text-xs font-semibold normal-case tracking-normal"
                                                            >
                                                                Excluir
                                                            </DangerButton>
                                                        ) : (
                                                            <span className="text-xs text-gray-400">Somente Master</span>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                        <tr className="bg-gray-50 font-semibold text-gray-800 dark:bg-gray-900/40 dark:text-gray-100">
                                            <td className="px-3 py-2">Total do mes</td>
                                            <td className="px-3 py-2 text-right">
                                                {formatCurrency(currentMonthTotal)}
                                            </td>
                                            <td className="px-3 py-2" colSpan={2}>
                                                &nbsp;
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <Modal show={previewOpen} onClose={() => setPreviewOpen(false)} maxWidth="lg" tone="light">
                <div className="bg-white p-6 text-gray-900">
                    <h3 className="text-lg font-semibold">Resumo do adiantamento</h3>
                    <p className="mt-1 text-sm text-gray-500">
                        Confira os valores antes de confirmar o lancamento.
                    </p>

                    <div className="mt-6 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                            <p className="text-xs font-bold uppercase tracking-[0.25em] text-gray-400">
                                Usuario
                            </p>
                            <p className="mt-2 text-base font-semibold text-gray-900">
                                {selectedUser?.name ?? "--"}
                            </p>
                        </div>
                        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                            <p className="text-xs font-bold uppercase tracking-[0.25em] text-gray-400">
                                Data
                            </p>
                            <p className="mt-2 text-base font-semibold text-gray-900">
                                {form.advance_date || "--"}
                            </p>
                        </div>
                        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                            <p className="text-xs font-bold uppercase tracking-[0.25em] text-gray-400">
                                Salario
                            </p>
                            <p className="mt-2 text-base font-semibold text-gray-900">
                                {formatCurrency(selectedSalary)}
                            </p>
                        </div>
                        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                            <p className="text-xs font-bold uppercase tracking-[0.25em] text-gray-400">
                                Valor informado
                            </p>
                            <p className="mt-2 text-base font-semibold text-gray-900">
                                {formatCurrency(enteredAmount)}
                            </p>
                        </div>
                        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                            <p className="text-xs font-bold uppercase tracking-[0.25em] text-gray-400">
                                Total no mes corrente
                            </p>
                            <p className="mt-2 text-base font-semibold text-gray-900">
                                {formatCurrency(projectedTotal)}
                            </p>
                        </div>
                        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                            <p className="text-xs font-bold uppercase tracking-[0.25em] text-gray-400">
                                Percentual do vale
                            </p>
                            <p className="mt-2 text-base font-semibold text-gray-900">
                                {formatPercentage(projectedPercentage)}%
                            </p>
                        </div>
                        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 sm:col-span-2">
                            <p className="text-xs font-bold uppercase tracking-[0.25em] text-gray-400">
                                Saldo
                            </p>
                            <p className={`mt-2 text-base font-semibold ${projectedBalance < 0 ? "text-red-600" : "text-green-600"}`}>
                                {formatCurrency(projectedBalance)}
                            </p>
                        </div>
                    </div>

                    <div className="mt-6 flex justify-end gap-3">
                        <SecondaryButton type="button" onClick={() => setPreviewOpen(false)}>
                            Cancelar
                        </SecondaryButton>
                        <SuccessButton
                            type="button"
                            onClick={handleConfirm}
                            disabled={submitting}
                            className="rounded-xl px-4 py-2"
                        >
                            Confirmar
                        </SuccessButton>
                    </div>
                </div>
            </Modal>
        </AuthenticatedLayout>
    );
}
