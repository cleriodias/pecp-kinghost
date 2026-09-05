import AlertMessage from '@/Components/Alert/AlertMessage';
import PrimaryButton from '@/Components/Button/PrimaryButton';
import InputError from '@/Components/InputError';
import Modal from '@/Components/Modal';
import SecondaryButton from '@/Components/SecondaryButton';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { printContraCheque, printContraChequePdf } from '@/Utils/contraChequePrint';
import {
    formatBrazilDateTime,
    formatBrazilShortDate,
    getBrazilTodayShortInputValue,
    isoToBrazilShortDateInput,
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
import { Head, Link, router, useForm, usePage } from '@inertiajs/react';
import { useEffect, useMemo, useState } from 'react';

const EXTRA_CREDIT_TYPE_OPTIONS = [
    { value: 'primeiro_domingo', label: 'Primeiro Domingo' },
    { value: 'feriado', label: 'Feriado' },
    { value: 'bonificacao', label: 'Bonificacao' },
    { value: 'falta', label: 'FALTA' },
    { value: 'inss', label: 'INSS' },
    { value: 'outros', label: 'Outros' },
];

const PAYMENT_STATUS_OPTIONS = [
    { value: 'all', label: 'Todos' },
    { value: 'paid', label: 'Pagos' },
    { value: 'pending', label: 'Pendentes' },
];

const formatCurrency = (value) =>
    Number(value ?? 0).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });

const formatPaymentDay = (value) => {
    const day = formatBrazilShortDate(value).split('/')[0] ?? '';

    return day && day !== '--' ? day : '--';
};

const buildPayrollPeriodForPaymentDay = (paymentDay, referenceDate = new Date()) => {
    const day = Number(paymentDay);

    if (!Number.isInteger(day) || day < 1 || day > 31) {
        return null;
    }

    const buildIsoDate = (year, monthIndex, monthDay) => {
        const month = String(monthIndex + 1).padStart(2, '0');
        const paddedDay = String(monthDay).padStart(2, '0');

        return `${year}-${month}-${paddedDay}`;
    };

    const daysInMonth = (year, monthIndex) => new Date(Date.UTC(year, monthIndex + 1, 0, 12)).getUTCDate();
    const currentYear = referenceDate.getFullYear();
    const currentMonthIndex = referenceDate.getMonth();
    const previousMonthIndex = currentMonthIndex - 1;
    const previousMonthYear = previousMonthIndex < 0 ? currentYear - 1 : currentYear;
    const normalizedPreviousMonthIndex = previousMonthIndex < 0 ? 11 : previousMonthIndex;

    const startDay = Math.min(day, daysInMonth(previousMonthYear, normalizedPreviousMonthIndex));
    const endYear = day === 1 && currentMonthIndex === 0 ? currentYear - 1 : currentYear;
    const endMonthIndex = day === 1 ? (currentMonthIndex - 1 + 12) % 12 : currentMonthIndex;
    const endDay = day === 1
        ? daysInMonth(endYear, endMonthIndex)
        : Math.min(day - 1, daysInMonth(currentYear, currentMonthIndex));

    return {
        startDate: isoToBrazilShortDateInput(buildIsoDate(previousMonthYear, normalizedPreviousMonthIndex, startDay)),
        endDate: isoToBrazilShortDateInput(buildIsoDate(endYear, endMonthIndex, endDay)),
    };
};

const normalizeDecimalInput = (value) =>
    String(value ?? '')
        .replace(/[^0-9,.-]/g, '')
        .replace(',', '.');

const normalizeWhatsappPhone = (value) => {
    const digits = String(value ?? '').replace(/\D/g, '');

    if (digits.length === 10 || digits.length === 11) {
        return `55${digits}`;
    }

    if (digits.length === 12 || digits.length === 13) {
        return digits;
    }

    return '';
};

const buildWhatsappSummaryMessage = (detail) => {
    const extraCredits = detail?.extra_credits_total ?? 0;
    const extraDiscounts = detail?.extra_discounts_total ?? 0;
    const extraCreditLines = (detail?.extra_credits ?? [])
        .map((credit) => `- ${credit.description || credit.type_label}: ${formatCurrency(credit.amount)}`)
        .join('\n');
    const extraDiscountLines = (detail?.extra_discounts ?? [])
        .map((credit) => `- ${credit.description || credit.type_label}: ${formatCurrency(credit.amount)}`)
        .join('\n');

    return [
        'Resumo do contra-cheque',
        `Funcionario: ${detail?.user_name ?? '---'}`,
        `Periodo: ${formatBrazilShortDate(detail?.start_date)} a ${formatBrazilShortDate(detail?.end_date)}`,
        `Salario base: ${formatCurrency(detail?.salary)}`,
        `Creditos extras: ${formatCurrency(extraCredits)}`,
        extraCreditLines ? `Creditos:\n${extraCreditLines}` : null,
        `Descontos extras: ${formatCurrency(extraDiscounts)}`,
        extraDiscountLines ? `Descontos:\n${extraDiscountLines}` : null,
        `Adiantamentos: ${formatCurrency(detail?.advances_total)}`,
        `Vales: ${formatCurrency(detail?.vales_total)}`,
        `Liquido a receber: ${formatCurrency(detail?.balance)}`,
    ]
        .filter(Boolean)
        .join('\n');
};

function DatePickerField({ label, value, isoValue, onChange, ariaLabel }) {
    return (
        <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
                {label}
            </label>
            <div className="relative mt-2">
                <div className="flex items-center rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm transition focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100">
                    <span className="pointer-events-none">{value || 'DD/MM/AA'}</span>
                    <span className="ml-auto pointer-events-none text-base text-gray-400 dark:text-gray-300">
                        <i className="bi bi-calendar3" aria-hidden="true" />
                    </span>
                </div>
                <input
                    type="date"
                    value={isoValue}
                    onChange={onChange}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    aria-label={ariaLabel}
                />
            </div>
        </div>
    );
}

function DangerActionButton({ children, disabled = false, onClick }) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className="inline-flex items-center justify-center rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
            {children}
        </button>
    );
}

export default function ContraCheque({
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
    selectedPaymentStatus = 'pending',
    selectedPaymentDay = null,
    unit = null,
    canManageActions = false,
    canDeleteRecords = false,
}) {
    const canManagePayrollActions = Boolean(canManageActions);
    const canDeletePayrollRecords = Boolean(canDeleteRecords);
    const { flash } = usePage().props;
    const { data, setData, get, processing } = useForm({
        start_date: isoToBrazilShortDateInput(startDate),
        end_date: isoToBrazilShortDateInput(endDate),
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
        payment_status: selectedPaymentStatus ?? 'pending',
        payment_day:
            selectedPaymentDay !== null && selectedPaymentDay !== undefined
                ? String(selectedPaymentDay)
                : 'all',
    });
    const [selectedCreditRow, setSelectedCreditRow] = useState(null);
    const [selectedPaymentRow, setSelectedPaymentRow] = useState(null);
    const [selectedSalaryRow, setSelectedSalaryRow] = useState(null);
    const [selectedValeRow, setSelectedValeRow] = useState(null);
    const [selectedAdvanceRow, setSelectedAdvanceRow] = useState(null);
    const [selectedExtraCreditRow, setSelectedExtraCreditRow] = useState(null);
    const [openActionMenuId, setOpenActionMenuId] = useState(null);
    const [activeDeleteKey, setActiveDeleteKey] = useState('');
    const [printError, setPrintError] = useState('');

    const creditForm = useForm({
        start_date: isoToBrazilShortDateInput(startDate),
        end_date: isoToBrazilShortDateInput(endDate),
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
        payment_status: selectedPaymentStatus ?? 'pending',
        payment_day:
            selectedPaymentDay !== null && selectedPaymentDay !== undefined
                ? String(selectedPaymentDay)
                : 'all',
        credit_type: 'primeiro_domingo',
        other_description: '',
        amount: '',
    });
    const paymentForm = useForm({
        start_date: isoToBrazilShortDateInput(startDate),
        end_date: isoToBrazilShortDateInput(endDate),
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
        payment_status: selectedPaymentStatus ?? 'pending',
        payment_day:
            selectedPaymentDay !== null && selectedPaymentDay !== undefined
                ? String(selectedPaymentDay)
                : 'all',
        payment_date: getBrazilTodayShortInputValue(),
    });
    const salaryForm = useForm({
        start_date: isoToBrazilShortDateInput(startDate),
        end_date: isoToBrazilShortDateInput(endDate),
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
        payment_status: selectedPaymentStatus ?? 'pending',
        payment_day:
            selectedPaymentDay !== null && selectedPaymentDay !== undefined
                ? String(selectedPaymentDay)
                : 'all',
        salary: '',
        pix_key: '',
        employment_unit_id: '',
    });

    const startDateIso = shortBrazilDateInputToIso(data.start_date);
    const endDateIso = shortBrazilDateInputToIso(data.end_date);
    const paymentDateIso = shortBrazilDateInputToIso(paymentForm.data.payment_date);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (!event.target.closest('[data-contra-cheque-menu]')) {
                setOpenActionMenuId(null);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);

        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const summaryCards = useMemo(
        () => [
            {
                key: 'employees',
                label: 'Colaboradores',
                value: Number(summary.employees_count ?? 0).toLocaleString('pt-BR'),
            },
            {
                key: 'salary',
                label: 'Salarios',
                value: formatCurrency(summary.salary_total),
            },
            {
                key: 'advances',
                label: 'Adiantamento',
                value: formatCurrency(summary.advances_total),
            },
            {
                key: 'vales',
                label: 'Vale',
                value: formatCurrency(summary.vales_total),
            },
            {
                key: 'credits',
                label: 'Creditos extras',
                value: formatCurrency(summary.extra_credits_total),
            },
            {
                key: 'discounts',
                label: 'Descontos extras',
                value: formatCurrency(summary.extra_discounts_total),
            },
            {
                key: 'balance',
                label: 'Saldo a receber',
                value: formatCurrency(summary.balance_total),
            },
        ],
        [summary],
    );

    const buildFilterPayload = (overrides = {}) => ({
        start_date: data.start_date || '',
        end_date: data.end_date || '',
        unit_id: data.unit_id,
        role: data.role,
        user_id: data.user_id,
        payment_status: data.payment_status,
        payment_day: data.payment_day,
        ...overrides,
    });

    const buildRowFilterPayload = (row, overrides = {}) => buildFilterPayload({
        start_date: isoToBrazilShortDateInput(row?.detail?.start_date ?? startDate ?? ''),
        end_date: isoToBrazilShortDateInput(row?.detail?.end_date ?? endDate ?? ''),
        ...overrides,
    });

    const closeAllMenus = () => setOpenActionMenuId(null);

    const handlePrint = (detail) => {
        setPrintError(
            printContraCheque(detail, 'Permita pop-ups para imprimir o contra-cheque.', {
                showDetails: true,
            }),
        );
    };

    const handlePrintPdf = (detail) => {
        setPrintError(
            printContraChequePdf(detail, 'Permita pop-ups para gerar o PDF do contra-cheque.'),
        );
    };

    const handleOpenWhatsapp = (detail) => {
        const phone = normalizeWhatsappPhone(detail?.phone);

        if (!phone) {
            setPrintError('Cadastre um telefone valido para enviar o resumo do contra-cheque por WhatsApp.');
            return;
        }

        const message = buildWhatsappSummaryMessage(detail);
        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
    };

    const handleSubmit = (event) => {
        event.preventDefault();

        get(route('settings.contra-cheque'), {
            preserveState: true,
            preserveScroll: true,
            replace: true,
            data: buildFilterPayload({
                start_date: data.start_date || undefined,
                end_date: data.end_date || undefined,
            }),
        });
    };

    const openCreditModal = (row) => {
        closeAllMenus();
        setSelectedCreditRow(row);
        creditForm.clearErrors();
        creditForm.setData({
            ...buildRowFilterPayload(row),
            credit_type: 'primeiro_domingo',
            other_description: '',
            amount: '',
        });
    };

    const closeCreditModal = () => {
        setSelectedCreditRow(null);
        creditForm.clearErrors();
    };

    const handleCreditSubmit = (event) => {
        event.preventDefault();

        if (!selectedCreditRow?.id) {
            return;
        }

        creditForm.post(route('settings.contra-cheque.creditos.store', { user: selectedCreditRow.id }), {
            preserveScroll: true,
            onSuccess: () => {
                closeCreditModal();
                creditForm.reset('credit_type', 'other_description', 'amount');
            },
        });
    };

    const openPaymentModal = (row) => {
        closeAllMenus();
        setSelectedPaymentRow(row);
        paymentForm.clearErrors();
        paymentForm.setData({
            ...buildRowFilterPayload(row),
            payment_date: getBrazilTodayShortInputValue(),
        });
    };

    const closePaymentModal = () => {
        setSelectedPaymentRow(null);
        paymentForm.clearErrors();
    };

    const handlePaymentSubmit = (event) => {
        event.preventDefault();

        if (!selectedPaymentRow?.id) {
            return;
        }

        paymentForm.post(route('settings.contra-cheque.payments.store', { user: selectedPaymentRow.id }), {
            preserveScroll: true,
            onSuccess: () => {
                closePaymentModal();
                paymentForm.setData('payment_date', getBrazilTodayShortInputValue());
            },
        });
    };

    const openSalaryModal = (row) => {
        closeAllMenus();
        setSelectedSalaryRow(row);
        salaryForm.clearErrors();
        salaryForm.setData({
            ...buildRowFilterPayload(row),
            salary: Number(row?.salary ?? 0).toFixed(2),
            pix_key: row?.pix_key ?? '',
            employment_unit_id: row?.employment_unit_id ? String(row.employment_unit_id) : '',
        });
    };

    const closeSalaryModal = () => {
        setSelectedSalaryRow(null);
        salaryForm.clearErrors();
    };

    const handleSalarySubmit = (event) => {
        event.preventDefault();

        if (!selectedSalaryRow?.id) {
            return;
        }

        salaryForm.patch(route('settings.contra-cheque.salary.update', { user: selectedSalaryRow.id }), {
            preserveScroll: true,
            onSuccess: () => closeSalaryModal(),
        });
    };

    const openValeModal = (row) => {
        closeAllMenus();
        setSelectedValeRow(row);
    };

    const closeValeModal = () => {
        setSelectedValeRow(null);
        setActiveDeleteKey('');
    };

    const handleDeleteVale = (vale) => {
        if (!selectedValeRow?.id || !vale?.sale_ids?.length) {
            return;
        }

        const deleteKey = `vale-${vale.receipt_id ?? vale.id}`;
        setActiveDeleteKey(deleteKey);

        router.delete(route('settings.contra-cheque.vales.destroy', { user: selectedValeRow.id }), {
            preserveScroll: true,
            data: {
                ...buildRowFilterPayload(selectedValeRow),
                receipt_id: vale.receipt_id,
                sale_ids: vale.sale_ids,
            },
            onSuccess: () => closeValeModal(),
            onFinish: () => setActiveDeleteKey(''),
        });
    };

    const openAdvanceModal = (row) => {
        closeAllMenus();
        setSelectedAdvanceRow(row);
    };

    const closeAdvanceModal = () => {
        setSelectedAdvanceRow(null);
        setActiveDeleteKey('');
    };

    const handleDeleteAdvance = (advance) => {
        if (!selectedAdvanceRow?.id || !advance?.id) {
            return;
        }

        const deleteKey = `advance-${advance.id}`;
        setActiveDeleteKey(deleteKey);

        router.delete(route('settings.contra-cheque.advances.destroy', {
            user: selectedAdvanceRow.id,
            salaryAdvance: advance.id,
        }), {
            preserveScroll: true,
            data: buildRowFilterPayload(selectedAdvanceRow),
            onSuccess: () => closeAdvanceModal(),
            onFinish: () => setActiveDeleteKey(''),
        });
    };

    const openExtraCreditModal = (row) => {
        closeAllMenus();
        setSelectedExtraCreditRow(row);
    };

    const closeExtraCreditModal = () => {
        setSelectedExtraCreditRow(null);
        setActiveDeleteKey('');
    };

    const handleDeleteExtraCredit = (credit) => {
        if (!selectedExtraCreditRow?.id || !credit?.id) {
            return;
        }

        const deleteKey = `credit-${credit.id}`;
        setActiveDeleteKey(deleteKey);

        router.delete(route('settings.contra-cheque.creditos.destroy', {
            user: selectedExtraCreditRow.id,
            contraChequeCredito: credit.id,
        }), {
            preserveScroll: true,
            data: buildRowFilterPayload(selectedExtraCreditRow),
            onSuccess: () => closeExtraCreditModal(),
            onFinish: () => setActiveDeleteKey(''),
        });
    };

    return (
        <AuthenticatedLayout
            header={
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">
                            Contra-Cheque
                        </h2>
                        <p className="text-sm text-gray-500 dark:text-gray-300">
                            Resumo do mes atual para colaboradores com salario informado. Unidade atual: {unit?.name ?? '---'}.
                        </p>
                    </div>
                    <Link
                        href={route('settings.payroll')}
                        className="inline-flex items-center justify-center rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 dark:border-gray-600 dark:text-gray-100 dark:hover:bg-gray-700"
                    >
                        Ir para Folha de Pagamento
                    </Link>
                </div>
            }
        >
            <Head title="Contra-Cheque" />

            <div className="py-8">
                <div className="mx-auto max-w-7xl space-y-6 px-4 sm:px-6 lg:px-8">
                    <AlertMessage message={flash} />

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
                            <DatePickerField
                                label="Inicio"
                                value={data.start_date}
                                isoValue={startDateIso}
                                onChange={(event) => setData('start_date', isoToBrazilShortDateInput(event.target.value))}
                                ariaLabel="Selecionar data inicial do periodo"
                            />
                            <DatePickerField
                                label="Fim"
                                value={data.end_date}
                                isoValue={endDateIso}
                                onChange={(event) => setData('end_date', isoToBrazilShortDateInput(event.target.value))}
                                ariaLabel="Selecionar data final do periodo"
                            />
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
                            <div>
                                <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                    Pagamento
                                </label>
                                <select
                                    value={data.payment_status}
                                    onChange={(event) => setData('payment_status', event.target.value)}
                                    className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                                >
                                    {PAYMENT_STATUS_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                    Dia do pagamento
                                </label>
                                <select
                                    value={data.payment_day}
                                    onChange={(event) => {
                                        const nextPaymentDay = event.target.value;
                                        const period = nextPaymentDay !== 'all'
                                            ? buildPayrollPeriodForPaymentDay(nextPaymentDay)
                                            : null;

                                        setData({
                                            ...data,
                                            payment_day: nextPaymentDay,
                                            payment_status: nextPaymentDay !== 'all' ? 'all' : data.payment_status,
                                            start_date: period?.startDate ?? data.start_date,
                                            end_date: period?.endDate ?? data.end_date,
                                        });
                                    }}
                                    className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                                >
                                    <option value="all">Todos</option>
                                    {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => (
                                        <option key={day} value={day}>
                                            Dia {day}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <PrimaryButton
                                type="submit"
                                disabled={processing}
                                className="px-4 py-2 normal-case tracking-normal"
                            >
                                Filtrar
                            </PrimaryButton>
                        </div>
                    </form>

                    <div className="rounded-2xl bg-white p-6 shadow dark:bg-gray-800">
                        <div className="flex flex-col gap-3 border-b border-gray-100 pb-4 md:flex-row md:items-end md:justify-between">
                            <div>
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                                    Periodo considerado
                                </h3>
                                <p className="text-sm text-gray-500 dark:text-gray-300">
                                    {formatBrazilShortDate(startDate)} a {formatBrazilShortDate(endDate)}
                                </p>
                            </div>
                            <span className="text-sm font-semibold text-gray-500 dark:text-gray-300">
                                {rows.length} colaborador(es)
                            </span>
                        </div>

                        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-7">
                            {summaryCards.map((card) => (
                                <div
                                    key={card.key}
                                    className="rounded-2xl border border-gray-200 bg-gray-50 p-5 dark:border-gray-700 dark:bg-gray-900"
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
                    </div>

                    {rows.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-10 text-center text-sm text-gray-500 shadow dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                            Nenhum colaborador com salario informado foi encontrado.
                        </div>
                    ) : (
                        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                            {rows.map((row) => (
                                <article
                                    key={row.id}
                                    className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800"
                                >
                                    <div className="flex flex-col gap-3 border-b border-gray-100 pb-4 dark:border-gray-700">
                                        <div className="flex items-start justify-between gap-3">
                                            {canManagePayrollActions ? (
                                                <div className="relative" data-contra-cheque-menu>
                                                    <button
                                                        type="button"
                                                        onClick={() => setOpenActionMenuId((current) => (current === row.id ? null : row.id))}
                                                        className="inline-flex items-center gap-2 rounded-xl px-2 py-1 text-left transition hover:bg-gray-50 dark:hover:bg-gray-700"
                                                    >
                                                        <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                                                            {row.name}
                                                        </span>
                                                        <i className="bi bi-three-dots-vertical text-sm text-gray-500 dark:text-gray-300" aria-hidden="true" />
                                                    </button>

                                                    {openActionMenuId === row.id && (
                                                        <div className="absolute left-0 z-20 mt-2 w-64 rounded-2xl border border-gray-200 bg-white p-2 shadow-xl dark:border-gray-700 dark:bg-gray-800">
                                                            <button
                                                                type="button"
                                                                onClick={() => openSalaryModal(row)}
                                                                className="flex w-full items-center rounded-xl px-3 py-2 text-left text-sm font-medium text-gray-700 transition hover:bg-gray-100 dark:text-gray-100 dark:hover:bg-gray-700"
                                                            >
                                                                Editar Salario
                                                            </button>
                                                            {canDeletePayrollRecords && (
                                                                <>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => openValeModal(row)}
                                                                        className="mt-1 flex w-full items-center rounded-xl px-3 py-2 text-left text-sm font-medium text-gray-700 transition hover:bg-gray-100 dark:text-gray-100 dark:hover:bg-gray-700"
                                                                    >
                                                                        Excluir Vales
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => openAdvanceModal(row)}
                                                                        className="mt-1 flex w-full items-center rounded-xl px-3 py-2 text-left text-sm font-medium text-gray-700 transition hover:bg-gray-100 dark:text-gray-100 dark:hover:bg-gray-700"
                                                                    >
                                                                        Excluir Adiantamentos
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => openExtraCreditModal(row)}
                                                                        className="mt-1 flex w-full items-center rounded-xl px-3 py-2 text-left text-sm font-medium text-gray-700 transition hover:bg-gray-100 dark:text-gray-100 dark:hover:bg-gray-700"
                                                                    >
                                                                        Excluir Lancamentos Extra
                                                                    </button>
                                                                </>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                                                    {row.name}
                                                </span>
                                            )}

                                            {row.payment_status === 'paid' ? (
                                                <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                                                    Dia {formatPaymentDay(row.payment_date)}
                                                </span>
                                            ) : canManagePayrollActions ? (
                                                <button
                                                    type="button"
                                                    onClick={() => openPaymentModal(row)}
                                                    className="inline-flex items-center justify-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 transition hover:bg-blue-100"
                                                >
                                                    Marcar pago
                                                </button>
                                            ) : (
                                                <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-semibold text-gray-600">
                                                    Pendente
                                                </span>
                                            )}
                                        </div>

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

                                    <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
                                        <div className="min-w-0 rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900">
                                            <p className="break-words text-[11px] font-semibold uppercase leading-4 tracking-[0.18em] text-gray-400">
                                                Salario
                                            </p>
                                            <p className="mt-2 break-words text-base font-semibold leading-6 text-gray-900 dark:text-gray-100">
                                                {formatCurrency(row.salary)}
                                            </p>
                                        </div>
                                        <div className="min-w-0 rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900">
                                            <p className="break-words text-[11px] font-semibold uppercase leading-4 tracking-[0.18em] text-gray-400">
                                                Vale em compras
                                            </p>
                                            <p className="mt-2 break-words text-base font-semibold leading-6 text-gray-900 dark:text-gray-100">
                                                {formatCurrency(row.vales_total)}
                                            </p>
                                        </div>
                                        <div className="min-w-0 rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900">
                                            <p className="break-words text-[11px] font-semibold uppercase leading-4 tracking-[0.18em] text-gray-400">
                                                Adiantamento
                                            </p>
                                            <p className="mt-2 break-words text-base font-semibold leading-6 text-gray-900 dark:text-gray-100">
                                                {formatCurrency(row.advances_total)}
                                            </p>
                                        </div>
                                        <div className="min-w-0 rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900">
                                            <p className="break-words text-[11px] font-semibold uppercase leading-4 tracking-[0.18em] text-gray-400">
                                                Creditos extras
                                            </p>
                                            <p className="mt-2 break-words text-base font-semibold leading-6 text-blue-600 dark:text-blue-300">
                                                {formatCurrency(row.extra_credits_total)}
                                            </p>
                                        </div>
                                        <div className="min-w-0 rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900">
                                            <p className="break-words text-[11px] font-semibold uppercase leading-4 tracking-[0.18em] text-gray-400">
                                                Descontos extras
                                            </p>
                                            <p className={`mt-2 break-words text-base font-semibold leading-6 ${row.extra_discounts_total > 0 ? 'text-red-600 dark:text-red-300' : 'text-gray-900 dark:text-gray-100'}`}>
                                                {formatCurrency(row.extra_discounts_total)}
                                            </p>
                                        </div>
                                        <div className="min-w-0 rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900">
                                            <p className="break-words text-[11px] font-semibold uppercase leading-4 tracking-[0.18em] text-gray-400">
                                                Saldo
                                            </p>
                                            <p className={`mt-2 break-words text-base font-semibold leading-6 ${row.balance < 0 ? 'text-red-600 dark:text-red-300' : 'text-green-600 dark:text-green-300'}`}>
                                                {formatCurrency(row.balance)}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
                                        <PrimaryButton
                                            type="button"
                                            onClick={() => handlePrint(row.detail)}
                                            className="min-w-0 justify-center rounded-2xl px-3 py-3 text-center text-sm font-semibold leading-5 normal-case tracking-normal"
                                        >
                                            Imprimir 80mm
                                        </PrimaryButton>
                                        <PrimaryButton
                                            type="button"
                                            onClick={() => handlePrintPdf(row.detail)}
                                            className="min-w-0 justify-center rounded-2xl px-3 py-3 text-center text-sm font-semibold leading-5 normal-case tracking-normal"
                                        >
                                            PDF
                                        </PrimaryButton>
                                        <PrimaryButton
                                            type="button"
                                            onClick={() => handleOpenWhatsapp(row.detail)}
                                            disabled={!normalizeWhatsappPhone(row.phone)}
                                            className="min-w-0 justify-center rounded-2xl px-3 py-3 text-center text-sm font-semibold leading-5 normal-case tracking-normal"
                                            aria-label={`Enviar resumo do contra-cheque de ${row.name} por WhatsApp`}
                                            title={normalizeWhatsappPhone(row.phone) ? 'Enviar resumo por WhatsApp' : 'Telefone nao cadastrado'}
                                        >
                                            WhatsApp
                                        </PrimaryButton>
                                        {canManagePayrollActions ? (
                                            <PrimaryButton
                                                type="button"
                                                onClick={() => openCreditModal(row)}
                                                className="min-w-0 justify-center rounded-2xl px-3 py-3 text-center text-lg font-semibold leading-5 normal-case tracking-normal"
                                                aria-label={`Adicionar lancamento ao contra-cheque de ${row.name}`}
                                                title={`Adicionar lancamento ao contra-cheque de ${row.name}`}
                                            >
                                                +
                                            </PrimaryButton>
                                        ) : (
                                            <div className="min-w-0 rounded-2xl border border-dashed border-gray-200 px-3 py-3 text-center text-xs font-semibold text-gray-500 lg:col-span-1">
                                                Consulta somente
                                            </div>
                                        )}
                                    </div>
                                </article>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {canManagePayrollActions && (
                <Modal show={Boolean(selectedSalaryRow)} onClose={closeSalaryModal} maxWidth="lg" tone="light">
                <form onSubmit={handleSalarySubmit}>
                    <div className="border-b border-gray-200 px-6 py-5">
                        <h3 className="text-lg font-semibold text-gray-900">
                            Editar salario
                        </h3>
                        <p className="mt-1 text-sm text-gray-600">
                            {selectedSalaryRow?.name ?? '---'} - Periodo {salaryForm.data.start_date || 'DD/MM/AA'} a {salaryForm.data.end_date || 'DD/MM/AA'}
                        </p>
                    </div>

                    <div className="space-y-5 px-6 py-5">
                        <div>
                            <label className="text-sm font-medium text-gray-700">
                                Novo salario
                            </label>
                            <input
                                type="text"
                                inputMode="decimal"
                                value={salaryForm.data.salary}
                                onChange={(event) => salaryForm.setData('salary', normalizeDecimalInput(event.target.value))}
                                className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-gray-900 shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                                placeholder="0,00"
                            />
                            <InputError message={salaryForm.errors.salary} className="mt-2" />
                        </div>

                        <div>
                            <label className="text-sm font-medium text-gray-700">
                                Chave Pix
                            </label>
                            <input
                                type="text"
                                value={salaryForm.data.pix_key}
                                onChange={(event) => salaryForm.setData('pix_key', event.target.value)}
                                className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-gray-900 shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                                placeholder="CPF, telefone, email ou chave aleatoria"
                            />
                            <InputError message={salaryForm.errors.pix_key} className="mt-2" />
                        </div>

                        <div>
                            <label className="text-sm font-medium text-gray-700">
                                Loja em que esta fichado
                            </label>
                            <select
                                value={salaryForm.data.employment_unit_id}
                                onChange={(event) => salaryForm.setData('employment_unit_id', event.target.value)}
                                className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-gray-900 shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                            >
                                <option value="">Selecione</option>
                                {filterUnits.map((filterUnit) => (
                                    <option key={`employment-unit-${filterUnit.id}`} value={filterUnit.id}>
                                        {filterUnit.name}
                                    </option>
                                ))}
                            </select>
                            <InputError message={salaryForm.errors.employment_unit_id} className="mt-2" />
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
                        <SecondaryButton type="button" onClick={closeSalaryModal} className="rounded-xl normal-case tracking-normal">
                            Cancelar
                        </SecondaryButton>
                        <PrimaryButton type="submit" disabled={salaryForm.processing} className="rounded-xl px-4 py-2 normal-case tracking-normal">
                            Salvar salario
                        </PrimaryButton>
                    </div>
                </form>
            </Modal>
            )}

            {canDeletePayrollRecords && (
                <Modal show={Boolean(selectedValeRow)} onClose={closeValeModal} maxWidth="lg" tone="light">
                <div>
                    <div className="border-b border-gray-200 px-6 py-5">
                        <h3 className="text-lg font-semibold text-gray-900">
                            Excluir vales
                        </h3>
                        <p className="mt-1 text-sm text-gray-600">
                            {selectedValeRow?.name ?? '---'} - Periodo {selectedValeRow ? formatBrazilShortDate(selectedValeRow.detail.start_date) : '--'} a {selectedValeRow ? formatBrazilShortDate(selectedValeRow.detail.end_date) : '--'}
                        </p>
                    </div>

                    <div className="max-h-[28rem] space-y-4 overflow-y-auto px-6 py-5">
                        {(selectedValeRow?.detail?.vales ?? []).length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500">
                                Nenhum vale encontrado para exclusao neste periodo.
                            </div>
                        ) : (
                            (selectedValeRow?.detail?.vales ?? []).map((vale, index) => (
                                <div
                                    key={`vale-${vale.receipt_id ?? vale.id ?? index}`}
                                    className="rounded-2xl border border-gray-200 p-4"
                                >
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                        <div className="space-y-1">
                                            <p className="text-sm font-semibold text-gray-900">
                                                Cupom #{vale.receipt_id ?? vale.id ?? '---'}
                                            </p>
                                            <p className="text-sm text-gray-600">
                                                {formatBrazilDateTime(vale.date_time)}
                                            </p>
                                            <p className="text-sm text-gray-600">
                                                Loja: {vale.unit_name || '---'}
                                            </p>
                                            <p className="text-sm text-gray-600">
                                                Itens: {vale.items_label || '--'}
                                            </p>
                                            <p className="text-sm font-semibold text-gray-900">
                                                Total: {formatCurrency(vale.total)}
                                            </p>
                                        </div>
                                        <DangerActionButton
                                            disabled={activeDeleteKey === `vale-${vale.receipt_id ?? vale.id}`}
                                            onClick={() => handleDeleteVale(vale)}
                                        >
                                            {activeDeleteKey === `vale-${vale.receipt_id ?? vale.id}` ? 'Excluindo...' : 'Excluir vale'}
                                        </DangerActionButton>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    <div className="flex justify-end border-t border-gray-200 px-6 py-4">
                        <SecondaryButton type="button" onClick={closeValeModal} className="rounded-xl normal-case tracking-normal">
                            Fechar
                        </SecondaryButton>
                    </div>
                </div>
            </Modal>
            )}

            {canDeletePayrollRecords && (
                <Modal show={Boolean(selectedAdvanceRow)} onClose={closeAdvanceModal} maxWidth="lg" tone="light">
                <div>
                    <div className="border-b border-gray-200 px-6 py-5">
                        <h3 className="text-lg font-semibold text-gray-900">
                            Excluir adiantamentos
                        </h3>
                        <p className="mt-1 text-sm text-gray-600">
                            {selectedAdvanceRow?.name ?? '---'} - Periodo {selectedAdvanceRow ? formatBrazilShortDate(selectedAdvanceRow.detail.start_date) : '--'} a {selectedAdvanceRow ? formatBrazilShortDate(selectedAdvanceRow.detail.end_date) : '--'}
                        </p>
                    </div>

                    <div className="max-h-[28rem] space-y-4 overflow-y-auto px-6 py-5">
                        {(selectedAdvanceRow?.detail?.advances ?? []).length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500">
                                Nenhum adiantamento encontrado para exclusao neste periodo.
                            </div>
                        ) : (
                            (selectedAdvanceRow?.detail?.advances ?? []).map((advance) => (
                                <div
                                    key={`advance-${advance.id}`}
                                    className="rounded-2xl border border-gray-200 p-4"
                                >
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                        <div className="space-y-1">
                                            <p className="text-sm font-semibold text-gray-900">
                                                {formatBrazilShortDate(advance.advance_date)}
                                            </p>
                                            <p className="text-sm text-gray-600">
                                                Loja: {advance.unit_name || '---'}
                                            </p>
                                            <p className="text-sm text-gray-600">
                                                Obs.: {advance.reason || '--'}
                                            </p>
                                            <p className="text-sm font-semibold text-gray-900">
                                                Valor: {formatCurrency(advance.amount)}
                                            </p>
                                        </div>
                                        <DangerActionButton
                                            disabled={activeDeleteKey === `advance-${advance.id}`}
                                            onClick={() => handleDeleteAdvance(advance)}
                                        >
                                            {activeDeleteKey === `advance-${advance.id}` ? 'Excluindo...' : 'Excluir adiantamento'}
                                        </DangerActionButton>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    <div className="flex justify-end border-t border-gray-200 px-6 py-4">
                        <SecondaryButton type="button" onClick={closeAdvanceModal} className="rounded-xl normal-case tracking-normal">
                            Fechar
                        </SecondaryButton>
                    </div>
                </div>
            </Modal>
            )}

            {canDeletePayrollRecords && (
                <Modal show={Boolean(selectedExtraCreditRow)} onClose={closeExtraCreditModal} maxWidth="lg" tone="light">
                <div>
                    <div className="border-b border-gray-200 px-6 py-5">
                        <h3 className="text-lg font-semibold text-gray-900">
                            Excluir lancamentos extra
                        </h3>
                        <p className="mt-1 text-sm text-gray-600">
                            {selectedExtraCreditRow?.name ?? '---'} - Periodo {selectedExtraCreditRow ? formatBrazilShortDate(selectedExtraCreditRow.detail.start_date) : '--'} a {selectedExtraCreditRow ? formatBrazilShortDate(selectedExtraCreditRow.detail.end_date) : '--'}
                        </p>
                    </div>

                    <div className="max-h-[28rem] space-y-4 overflow-y-auto px-6 py-5">
                        {[
                            ...(selectedExtraCreditRow?.detail?.extra_credits ?? []),
                            ...(selectedExtraCreditRow?.detail?.extra_discounts ?? []),
                        ].length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500">
                                Nenhum lancamento extra encontrado para exclusao neste periodo.
                            </div>
                        ) : (
                            [
                                ...(selectedExtraCreditRow?.detail?.extra_credits ?? []),
                                ...(selectedExtraCreditRow?.detail?.extra_discounts ?? []),
                            ].map((credit) => (
                                <div
                                    key={`credit-${credit.id}-${credit.type}`}
                                    className="rounded-2xl border border-gray-200 p-4"
                                >
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                        <div className="space-y-1">
                                            <p className="text-sm font-semibold text-gray-900">
                                                {credit.description || credit.type_label || 'Lancamento'}
                                            </p>
                                            <p className="text-sm text-gray-600">
                                                Tipo: {credit.type_label || '---'}
                                            </p>
                                            <p className={`text-sm font-semibold ${Number(credit.amount ?? 0) < 0 ? 'text-red-600' : 'text-blue-600'}`}>
                                                Valor: {formatCurrency(credit.amount)}
                                            </p>
                                        </div>
                                        <DangerActionButton
                                            disabled={activeDeleteKey === `credit-${credit.id}`}
                                            onClick={() => handleDeleteExtraCredit(credit)}
                                        >
                                            {activeDeleteKey === `credit-${credit.id}` ? 'Excluindo...' : 'Excluir lancamento'}
                                        </DangerActionButton>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    <div className="flex justify-end border-t border-gray-200 px-6 py-4">
                        <SecondaryButton type="button" onClick={closeExtraCreditModal} className="rounded-xl normal-case tracking-normal">
                            Fechar
                        </SecondaryButton>
                    </div>
                </div>
            </Modal>
            )}

            {canManagePayrollActions && (
                <Modal show={Boolean(selectedCreditRow)} onClose={closeCreditModal} maxWidth="lg" tone="light">
                <form onSubmit={handleCreditSubmit}>
                    <div className="border-b border-gray-200 px-6 py-5">
                        <h3 className="text-lg font-semibold text-gray-900">
                            Adicionar lancamento ao contra-cheque
                        </h3>
                        <p className="mt-1 text-sm text-gray-600">
                            {selectedCreditRow?.name ?? '---'} - Periodo {creditForm.data.start_date || 'DD/MM/AA'} a {creditForm.data.end_date || 'DD/MM/AA'}
                        </p>
                    </div>

                    <div className="space-y-5 px-6 py-5">
                        <div>
                            <label className="text-sm font-medium text-gray-700">
                                Tipo
                            </label>
                            <select
                                value={creditForm.data.credit_type}
                                onChange={(event) => creditForm.setData('credit_type', event.target.value)}
                                className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-gray-900 shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                            >
                                {EXTRA_CREDIT_TYPE_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                            <InputError message={creditForm.errors.credit_type} className="mt-2" />
                        </div>

                        {creditForm.data.credit_type === 'outros' && (
                            <div>
                                <label className="text-sm font-medium text-gray-700">
                                    Informe o tipo
                                </label>
                                <input
                                    type="text"
                                    value={creditForm.data.other_description}
                                    onChange={(event) => creditForm.setData('other_description', event.target.value)}
                                    className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-gray-900 shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                                    placeholder="Descreva o lancamento"
                                />
                                <InputError message={creditForm.errors.other_description} className="mt-2" />
                            </div>
                        )}

                        <div>
                            <label className="text-sm font-medium text-gray-700">
                                Valor do lancamento
                            </label>
                            <input
                                type="text"
                                inputMode="decimal"
                                value={creditForm.data.amount}
                                onChange={(event) => creditForm.setData('amount', normalizeDecimalInput(event.target.value))}
                                className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-gray-900 shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                                placeholder="0,00"
                            />
                            <InputError message={creditForm.errors.amount} className="mt-2" />
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
                        <SecondaryButton type="button" onClick={closeCreditModal} className="rounded-xl normal-case tracking-normal">
                            Cancelar
                        </SecondaryButton>
                        <PrimaryButton type="submit" disabled={creditForm.processing} className="rounded-xl px-4 py-2 normal-case tracking-normal">
                            Salvar lancamento
                        </PrimaryButton>
                    </div>
                </form>
            </Modal>
            )}

            {canManagePayrollActions && (
            <Modal show={Boolean(selectedPaymentRow)} onClose={closePaymentModal} maxWidth="lg" tone="light">
                <form onSubmit={handlePaymentSubmit}>
                    <div className="border-b border-gray-200 px-6 py-5">
                        <h3 className="text-lg font-semibold text-gray-900">
                            Registrar pagamento do contra-cheque
                        </h3>
                        <p className="mt-1 text-sm text-gray-600">
                            {selectedPaymentRow?.name ?? '---'} - Periodo {paymentForm.data.start_date || 'DD/MM/AA'} a {paymentForm.data.end_date || 'DD/MM/AA'}
                        </p>
                    </div>

                    <div className="space-y-5 px-6 py-5">
                        <DatePickerField
                            label="Data do pagamento"
                            value={paymentForm.data.payment_date}
                            isoValue={paymentDateIso}
                            onChange={(event) => paymentForm.setData('payment_date', isoToBrazilShortDateInput(event.target.value))}
                            ariaLabel="Selecionar data do pagamento"
                        />
                        <InputError message={paymentForm.errors.payment_date} className="mt-2" />
                    </div>

                    <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
                        <SecondaryButton type="button" onClick={closePaymentModal} className="rounded-xl normal-case tracking-normal">
                            Cancelar
                        </SecondaryButton>
                        <PrimaryButton type="submit" disabled={paymentForm.processing} className="rounded-xl px-4 py-2 normal-case tracking-normal">
                            Confirmar pagamento
                        </PrimaryButton>
                    </div>
                </form>
            </Modal>
            )}
        </AuthenticatedLayout>
    );
}
