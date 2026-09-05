import Modal from '@/Components/Modal';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { buildReceiptHtml } from '@/Utils/receipt';
import axios from 'axios';
import { Head, Link, router, usePage } from '@inertiajs/react';
import { useEffect, useMemo, useState } from 'react';

const paymentColumns = [
    { key: 'dinheiro', label: 'Dinheiro' },
    { key: 'maquina', label: 'Maquina' },
    { key: 'vale', label: 'Vale' },
    { key: 'refeicao', label: 'Refei\u00e7\u00e3o' },
    { key: 'faturar', label: 'Faturar' },
];

const formatCurrency = (value) =>
    Number(value ?? 0).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });

const formatQuantity = (value, decimals = 2) =>
    Number(value ?? 0).toLocaleString('pt-BR', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    });

const shortDateFormatter = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
});

const shortDateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
});

const ISO_DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_DATE_TIME_REGEX = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/;

const parseDateValue = (value) => {
    if (!value) {
        return null;
    }

    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value;
    }

    if (typeof value !== 'string') {
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    const normalized = value.trim();
    if (normalized === '') {
        return null;
    }

    const dateOnlyMatch = normalized.match(ISO_DATE_REGEX);
    if (dateOnlyMatch) {
        return new Date(
            Date.UTC(
                Number(dateOnlyMatch[1]),
                Number(dateOnlyMatch[2]) - 1,
                Number(dateOnlyMatch[3]),
                12,
                0,
                0,
            ),
        );
    }

    const dateTimeMatch = normalized.match(ISO_DATE_TIME_REGEX);
    if (dateTimeMatch) {
        return new Date(
            Date.UTC(
                Number(dateTimeMatch[1]),
                Number(dateTimeMatch[2]) - 1,
                Number(dateTimeMatch[3]),
                Number(dateTimeMatch[4]) + 3,
                Number(dateTimeMatch[5]),
                Number(dateTimeMatch[6] ?? 0),
            ),
        );
    }

    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatShortDate = (value) => {
    const date = parseDateValue(value);
    return date ? shortDateFormatter.format(date) : '--';
};

const formatDateTime = (value) => {
    const date = parseDateValue(value);
    return date ? shortDateTimeFormatter.format(date) : '--';
};

const differenceTone = (value) => {
    if (Math.abs(value ?? 0) < 0.005) {
        return 'text-gray-900 dark:text-gray-100';
    }
    return (value ?? 0) > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400';
};

const resolveConferenceCashBase = (record) =>
    Number(record?.conference_base_cash ?? record?.totals?.dinheiro ?? 0);

const resolveConferenceTotal = (record) =>
    Number(
        record?.conference_base_total ??
            resolveConferenceCashBase(record) + Number(record?.totals?.maquina ?? 0),
    );

const hexToRgb = (value) => {
    if (typeof value !== 'string') {
        return null;
    }

    const normalized = value.replace('#', '').trim();

    if (normalized.length !== 6) {
        return null;
    }

    const intValue = Number.parseInt(normalized, 16);

    if (Number.isNaN(intValue)) {
        return null;
    }

    return {
        r: (intValue >> 16) & 255,
        g: (intValue >> 8) & 255,
        b: intValue & 255,
    };
};

const getContrastingTextColor = (backgroundColor) => {
    const rgb = hexToRgb(backgroundColor);

    if (!rgb) {
        return '#ffffff';
    }

    const brightness = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;

    return brightness > 160 ? '#111827' : '#ffffff';
};

export default function CashClosure({
    records = [],
    dateValue = '',
    dateInputValue = '',
    filterUnits = [],
    selectedUnitId = null,
    selectedUnit = { name: 'Todas as unidades' },
    discardDetails = [],
    meta = {},
}) {
    const { auth } = usePage().props;
    const currentRole = Number(auth?.user?.funcao ?? -1);
    const isMaster = currentRole === 0;
    const canSubmitOkClosure = [0, 1].includes(currentRole);
    const selectedClosureDate = dateInputValue ?? '';
    const normalizedSelectedUnit = selectedUnitId ?? null;
    const [dateInput, setDateInput] = useState(dateInputValue ?? '');
    const [unitFilter, setUnitFilter] = useState(normalizedSelectedUnit);
    const [zeroCloseRowKey, setZeroCloseRowKey] = useState(null);
    const [okCloseRowKey, setOkCloseRowKey] = useState(null);
    const [reopenCloseRowKey, setReopenCloseRowKey] = useState(null);
    const [masterReviewModal, setMasterReviewModal] = useState({
        open: false,
        record: null,
        cashAmount: '',
        cardAmount: '',
        error: '',
        processing: false,
    });
    const [discardModal, setDiscardModal] = useState({
        open: false,
        cashierName: '',
        items: [],
        rowKey: null,
    });
    const [cardComplementModal, setCardComplementModal] = useState({
        open: false,
        cashierName: '',
        unitName: '',
        items: [],
        total: 0,
    });
    const [expenseModal, setExpenseModal] = useState({
        open: false,
        cashierName: '',
        unitName: '',
        items: [],
        total: 0,
    });
    const [selectedReceipt, setSelectedReceipt] = useState(null);
    const [printError, setPrintError] = useState('');

    useEffect(() => {
        setDateInput(dateInputValue ?? '');
    }, [dateInputValue]);

    useEffect(() => {
        setUnitFilter(normalizedSelectedUnit);
    }, [normalizedSelectedUnit]);

    const discardMap = useMemo(() => {
        const grouped = {};
        discardDetails.forEach((entry) => {
            const key = `${entry.user_id}-${entry.unit_id ?? 'none'}`;
            if (!grouped[key]) {
                grouped[key] = [];
            }

            grouped[key].push(entry);
        });

        return grouped;
    }, [discardDetails]);

    const totals = useMemo(() => {
        return paymentColumns.reduce(
            (acc, column) => ({
                ...acc,
                [column.key]: records.reduce(
                    (sum, record) => sum + (record.totals?.[column.key] ?? 0),
                    0,
                ),
            }),
            {},
        );
    }, [records]);

    const salesGrandTotal = useMemo(
        () => records.reduce((sum, record) => sum + (record.grand_total ?? 0), 0),
        [records],
    );

    const conferenceGrandTotal = useMemo(
        () =>
            records.reduce((sum, record) => sum + resolveConferenceTotal(record), 0),
        [records],
    );

    const unitOptions = useMemo(() => {
        const base = [{ id: null, name: 'Todas as unidades' }];
        if (!Array.isArray(filterUnits) || filterUnits.length === 0) {
            return base;
        }

        const mapped = filterUnits.map((unit) => ({
            id: unit.id ?? unit.tb2_id ?? null,
            name: unit.name ?? unit.tb2_nome ?? '---',
        }));

        return base.concat(mapped);
    }, [filterUnits]);

    const applyFilters = (dateValueParam, unitValueParam) => {
        const params = {};

        if (dateValueParam) {
            params.date = dateValueParam;
        }

        if (unitValueParam !== null && unitValueParam !== undefined) {
            params.unit_id = unitValueParam;
        }

        router.get(route('reports.cash.closure'), params, { preserveScroll: true });
    };

    const handleDateChange = (value) => {
        setDateInput(value);

        if (value === '') {
            applyFilters('', unitFilter);
            return;
        }

        applyFilters(value, unitFilter);
    };

    const handleUnitFilter = (optionId) => {
        const normalized = optionId ?? null;
        setUnitFilter(normalized);
        applyFilters(dateInput || '', normalized);
    };

    const openDiscardModal = (record) => {
        const rowKey = record.row_key ?? `${record.cashier_id}-${record.unit_id ?? 'none'}`;
        const items = discardMap[rowKey] ?? [];
        setDiscardModal({
            open: true,
            cashierName: record.cashier_name,
            items,
            rowKey,
        });
    };

    const closeDiscardModal = () => {
        setDiscardModal({
            open: false,
            cashierName: '',
            items: [],
            rowKey: null,
        });
    };

    const openCardComplementModal = (record) => {
        const smallCardComplements = record?.small_card_complements ?? {
            total: 0,
            items: [],
        };

        setCardComplementModal({
            open: true,
            cashierName: record?.cashier_name ?? '',
            unitName: record?.unit_name ?? '---',
            items: smallCardComplements.items ?? [],
            total: smallCardComplements.total ?? 0,
        });
    };

    const closeCardComplementModal = () => {
        setCardComplementModal({
            open: false,
            cashierName: '',
            unitName: '',
            items: [],
            total: 0,
        });
    };

    const openExpenseModal = (record) => {
        setExpenseModal({
            open: true,
            cashierName: record?.cashier_name ?? '',
            unitName: record?.unit_name ?? '---',
            items: record?.expense_details ?? [],
            total: Number(record?.expense_total ?? 0),
        });
    };

    const closeExpenseModal = () => {
        setExpenseModal({
            open: false,
            cashierName: '',
            unitName: '',
            items: [],
            total: 0,
        });
    };

    const openReceiptDetails = (receipt) => {
        if (!receipt) {
            return;
        }

        setPrintError('');
        setSelectedReceipt(receipt);
    };

    const closeReceiptDetails = () => {
        setSelectedReceipt(null);
        setPrintError('');
    };

    const handlePrintReceipt = (receipt) => {
        setPrintError('');

        const printWindow = window.open('', '_blank', 'width=400,height=600');

        if (!printWindow) {
            setPrintError('Permita pop-ups para imprimir o cupom.');
            return;
        }

        printWindow.document.write(buildReceiptHtml(receipt));
        printWindow.document.close();
        printWindow.focus();
        printWindow.print();
        printWindow.close();
    };

    const openMasterReviewModal = (record) => {
        const closure = record?.closure ?? null;

        if (!closure?.id) {
            return;
        }

        setMasterReviewModal({
            open: true,
            record,
            cashAmount: String(closure.cash_amount ?? 0),
            cardAmount: String(closure.card_amount ?? 0),
            error: '',
            processing: false,
        });
    };

    const closeMasterReviewModal = () => {
        setMasterReviewModal({
            open: false,
            record: null,
            cashAmount: '',
            cardAmount: '',
            error: '',
            processing: false,
        });
    };

    const discardModalTotals = useMemo(() => {
        const quantity = discardModal.items.reduce((sum, item) => sum + (item.quantity ?? 0), 0);
        const value = discardModal.items.reduce((sum, item) => sum + (item.value ?? 0), 0);

        return {
            quantity,
            value,
        };
    }, [discardModal.items]);

    const submitMasterReview = async (event) => {
        event.preventDefault();

        const closureId = masterReviewModal.record?.closure?.id;
        if (!closureId || masterReviewModal.processing) {
            return;
        }

        setMasterReviewModal((current) => ({
            ...current,
            processing: true,
            error: '',
        }));

        try {
            await axios.patch(route('reports.cash.closure.master-review', closureId), {
                cash_amount: masterReviewModal.cashAmount,
                card_amount: masterReviewModal.cardAmount,
            });

            closeMasterReviewModal();
            router.reload({
                only: ['records', 'dateValue', 'dateInputValue', 'filterUnits', 'selectedUnitId', 'selectedUnit', 'discardDetails', 'meta'],
                preserveScroll: true,
            });
        } catch (error) {
            let message = 'Nao foi possivel atualizar a conferencia do Master.';

            if (error.response?.data?.errors) {
                const firstError = Object.values(error.response.data.errors).flat()[0];
                if (firstError) {
                    message = String(firstError);
                }
            } else if (error.response?.data?.message) {
                message = String(error.response.data.message);
            }

            setMasterReviewModal((current) => ({
                ...current,
                processing: false,
                error: message,
            }));
        }
    };

    const submitZeroClosure = async (record) => {
        const rowKey = record?.row_key ?? `${record?.cashier_id}-${record?.unit_id ?? 'none'}`;
        const closureDate = dateInput || selectedClosureDate || '';

        if (!record?.cashier_id || !record?.unit_id || !closureDate || zeroCloseRowKey === rowKey) {
            return;
        }

        const confirmed = window.confirm(
            `Confirma o fechamento zerado do caixa ${record.cashier_name} em ${formatShortDate(closureDate)}?`,
        );

        if (!confirmed) {
            return;
        }

        setZeroCloseRowKey(rowKey);

        try {
            await axios.post(route('reports.cash.closure.zero-close'), {
                cashier_id: record.cashier_id,
                unit_id: record.unit_id,
                date: closureDate,
            });

            router.reload({
                only: ['records', 'dateValue', 'dateInputValue', 'filterUnits', 'selectedUnitId', 'selectedUnit', 'discardDetails', 'meta'],
                preserveScroll: true,
            });
        } catch (error) {
            let message = 'Nao foi possivel fechar o caixa com valores zerados.';

            if (error.response?.data?.errors) {
                const firstError = Object.values(error.response.data.errors).flat()[0];
                if (firstError) {
                    message = String(firstError);
                }
            } else if (error.response?.data?.message) {
                message = String(error.response.data.message);
            }

            window.alert(message);
        } finally {
            setZeroCloseRowKey(null);
        }
    };

    const submitOkClosure = async (record) => {
        const rowKey = record?.row_key ?? `${record?.cashier_id}-${record?.unit_id ?? 'none'}`;
        const closureDate = dateInput || selectedClosureDate || '';

        if (!record?.cashier_id || !record?.unit_id || !closureDate || okCloseRowKey === rowKey) {
            return;
        }

        const confirmed = window.confirm(
            `Confirma o fechamento OK do caixa ${record.cashier_name} em ${formatShortDate(closureDate)} com os valores do sistema?`,
        );

        if (!confirmed) {
            return;
        }

        setOkCloseRowKey(rowKey);

        try {
            await axios.post(route('reports.cash.closure.ok-close'), {
                cashier_id: record.cashier_id,
                unit_id: record.unit_id,
                date: closureDate,
            });

            router.reload({
                only: ['records', 'dateValue', 'dateInputValue', 'filterUnits', 'selectedUnitId', 'selectedUnit', 'discardDetails', 'meta'],
                preserveScroll: true,
            });
        } catch (error) {
            let message = 'Nao foi possivel fechar o caixa com os valores do sistema.';

            if (error.response?.data?.errors) {
                const firstError = Object.values(error.response.data.errors).flat()[0];
                if (firstError) {
                    message = String(firstError);
                }
            } else if (error.response?.data?.message) {
                message = String(error.response.data.message);
            }

            window.alert(message);
        } finally {
            setOkCloseRowKey(null);
        }
    };

    const reopenClosure = async (record) => {
        const closureId = record?.closure?.id;
        const rowKey = record?.row_key ?? `${record?.cashier_id}-${record?.unit_id ?? 'none'}`;
        const closureDate = formatShortDate(record?.closure?.closed_at);

        if (!closureId || reopenCloseRowKey === rowKey) {
            return;
        }

        const confirmed = window.confirm(
            `Confirma a reabertura do caixa ${record.cashier_name} em ${closureDate}?`,
        );

        if (!confirmed) {
            return;
        }

        setReopenCloseRowKey(rowKey);

        try {
            await axios.delete(route('reports.cash.closure.destroy', closureId));

            router.reload({
                only: ['records', 'dateValue', 'dateInputValue', 'filterUnits', 'selectedUnitId', 'selectedUnit', 'discardDetails', 'meta'],
                preserveScroll: true,
            });
        } catch (error) {
            let message = 'Nao foi possivel reabrir o caixa.';

            if (error.response?.data?.errors) {
                const firstError = Object.values(error.response.data.errors).flat()[0];
                if (firstError) {
                    message = String(firstError);
                }
            } else if (error.response?.data?.message) {
                message = String(error.response.data.message);
            }

            window.alert(message);
        } finally {
            setReopenCloseRowKey(null);
        }
    };

    const renderSystemAlignedCell = (label, value) => (
        <div className="space-y-1 text-right">
            <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
                <p className="font-semibold text-gray-900 dark:text-white">
                    {formatCurrency(value)}
                </p>
            </div>
            <div>
                <p className="text-xs text-transparent select-none">Fechamento</p>
                <p className="text-sm text-transparent select-none">{formatCurrency(0)}</p>
            </div>
            <div>
                <p className="text-xs text-transparent select-none">Diferença</p>
                <p className="text-sm font-semibold text-transparent select-none">
                    {formatCurrency(0)}
                </p>
            </div>
        </div>
    );

    const renderPaymentCell = (record, column, options = {}) => {
        const systemValue =
            column.key === 'dinheiro'
                ? resolveConferenceCashBase(record)
                : record.totals?.[column.key] ?? 0;

        if (!['dinheiro', 'maquina'].includes(column.key)) {
            return renderSystemAlignedCell('Sistema', systemValue);
        }

        const closure = record.closure ?? null;
        const closureValue =
            column.key === 'dinheiro'
                ? closure?.cash_amount ?? 0
                : closure?.card_amount ?? 0;
        const diffValue =
            column.key === 'dinheiro'
                ? closure?.differences?.cash ?? systemValue
                : closure?.differences?.card ?? systemValue;
        const diffClass = differenceTone(diffValue);
        const showCardComplementLink =
            column.key === 'maquina' &&
            options.showCardDifferenceLink &&
            Number(record?.small_card_complements?.total ?? 0) > 0;
        const showExpenseValue =
            column.key === 'dinheiro' && Number(record?.expense_total ?? 0) > 0;

        return (
            <div className="space-y-1 text-right">
                <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Sistema</p>
                    <p className="font-semibold text-gray-900 dark:text-white">
                        {formatCurrency(systemValue)}
                    </p>
                </div>
                <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Fechamento</p>
                    <p className="text-sm text-gray-700 dark:text-gray-200">
                        {formatCurrency(closureValue)}
                    </p>
                </div>
                <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Diferença</p>
                    <p className={`text-sm font-semibold ${diffClass}`}>
                        {formatCurrency(diffValue)}
                    </p>
                    {showExpenseValue && (
                        <button
                            type="button"
                            onClick={() => openExpenseModal(record)}
                            className="mt-1 inline-flex text-xs font-semibold text-amber-600 transition hover:text-amber-700 dark:text-amber-300 dark:hover:text-amber-200"
                        >
                            {formatCurrency(-Number(record?.expense_total ?? 0))}
                        </button>
                    )}
                    {showCardComplementLink && (
                        <button
                            type="button"
                            onClick={() => openCardComplementModal(record)}
                            className="mt-1 inline-flex text-xs font-semibold text-indigo-600 transition hover:text-indigo-800"
                        >
                            {formatCurrency(record?.small_card_complements?.total ?? 0)}
                        </button>
                    )}
                </div>
            </div>
        );
    };

    const renderConferenceCell = (record) => {
        const closure = record.closure ?? null;
        const systemTotal = resolveConferenceTotal(record);
        const closureTotal = closure?.total_amount ?? 0;
        const diffTotal = closure?.differences?.total ?? systemTotal;
        const diffClass = differenceTone(diffTotal);
        const openComandasTotal = Number(record?.open_comandas_total ?? 0);
        const openComandasCount = Number(record?.open_comandas_count ?? 0);

        return (
            <div className="space-y-1 text-right">
                <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Sistema caixa</p>
                    <p className="font-semibold text-gray-900 dark:text-white">
                        {formatCurrency(systemTotal)}
                    </p>
                </div>
                <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Fechamento</p>
                    <p className="text-sm text-gray-700 dark:text-gray-200">
                        {formatCurrency(closureTotal)}
                    </p>
                </div>
                <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Diferença</p>
                    <p className={`text-sm font-semibold ${diffClass}`}>
                        {formatCurrency(diffTotal)}
                    </p>
                </div>
                {openComandasTotal > 0 && (
                    <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                            Comandas abertas{openComandasCount > 0 ? ` (${openComandasCount})` : ''}
                        </p>
                        <p className="text-sm font-semibold text-amber-600 dark:text-amber-300">
                            {formatCurrency(openComandasTotal)}
                        </p>
                    </div>
                )}
            </div>
        );
    };

    const filterCard = (
        <div className="rounded-2xl bg-white p-6 shadow">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="flex-1">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
                        <input
                            id="closure-date"
                            type="date"
                            value={dateInput}
                            onChange={(event) => handleDateChange(event.target.value)}
                            className="mt-2 w-50 rounded-xl border border-gray-300 px-3 py-3 text-gray-800 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                        />
                        <div className="flex-1 lg:pl-4">
                            <div className="mt-3 flex flex-wrap gap-2">
                                {unitOptions.map((unit) => {
                                    const optionId = unit.id ?? null;
                                    const isActive = optionId === (unitFilter ?? null);

                                    return (
                                        <button
                                            type="button"
                                            key={`unit-filter-${optionId ?? 'all'}`}
                                            onClick={() => handleUnitFilter(optionId)}
                                            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                                                isActive
                                                    ? 'bg-indigo-600 text-white shadow'
                                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                            }`}
                                        >
                                            {unit.name}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
                <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-5 py-4 text-left shadow-sm xl:min-w-[190px]">
                    <p className="text-sm text-emerald-800">Base da conferencia</p>
                    <p className="text-2xl font-bold text-emerald-900">
                        {formatCurrency(conferenceGrandTotal)}
                    </p>
                    <p className="mt-1 text-xs text-emerald-700">
                        Somente dinheiro + cartao
                    </p>
                </div>
            </div>
        </div>
    );

    const summaryCard = (
        <div className="rounded-2xl bg-white p-6 shadow dark:bg-gray-800">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Resumo geral
            </h3>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
                {paymentColumns.map((column) => {
                    const columnMeta = meta?.[column.key] ?? {};
                    const backgroundColor = columnMeta.color ?? '#e5e7eb';
                    const textColor = getContrastingTextColor(backgroundColor);

                    return (
                        <div
                            key={column.key}
                            className="rounded-xl border p-4 text-center shadow-sm"
                            style={{
                                backgroundColor,
                                borderColor: backgroundColor,
                                color: textColor,
                            }}
                        >
                            <p className="text-sm font-semibold">{column.label}</p>
                            <p className="text-xl font-bold">
                                {formatCurrency(totals[column.key] ?? 0)}
                            </p>
                        </div>
                    );
                })}
                <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4 text-center dark:border-indigo-500/40 dark:bg-indigo-900/30">
                    <p className="text-sm text-indigo-800 dark:text-indigo-200">Total de vendas</p>
                    <p className="text-2xl font-bold text-indigo-900 dark:text-white">
                        {formatCurrency(salesGrandTotal)}
                    </p>
                </div>
            </div>
        </div>
    );

    const tableSection = (
        <div className="rounded-2xl bg-white p-6 shadow dark:bg-gray-800">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Totais por caixa ({selectedUnit?.name ?? 'Todas as unidades'}) - Data do fechamento: {formatShortDate(dateInputValue)}
            </h3>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-300">
                A diferenca do caixa considera somente dinheiro e cartao. Gastos do dia deduzem o dinheiro esperado no caixa. Vale, refeicao e faturar aparecem apenas como informativos de venda.
            </p>
            <div className="mt-4 overflow-x-auto">
                {records.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-gray-200 px-4 py-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-300">
                        Nenhum lan\u00e7amento encontrado para a data selecionada.
                    </p>
                ) : (
                    <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-700">
                        <thead className="bg-gray-50 text-gray-600 dark:bg-gray-900/60 dark:text-gray-300">
                            <tr>
                                <th className="px-3 py-2 text-left font-medium">Caixa</th>
                                <th className="px-3 py-2 text-left font-medium">Unidade</th>
                                <th className="px-3 py-2 text-left font-medium">Fechamento</th>
                                {paymentColumns.map((column) => (
                                    <th
                                        key={`header-${column.key}`}
                                        className="px-3 py-2 text-right font-medium"
                                    >
                                        {column.label}
                                    </th>
                                ))}
                                <th className="px-3 py-2 text-right font-medium">Total vendas</th>
                                <th className="px-3 py-2 text-right font-medium">Conferencia caixa</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                            {records.map((record) => {
                                const closure = record.closure ?? null;
                                const closed = closure?.closed;
                                const masterReviewed = Boolean(closure?.master_review?.reviewed);
                                const statusClass = closed
                                    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200'
                                    : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200';
                                const rowKey =
                                    record.row_key ??
                                    `${record.cashier_id}-${record.unit_id ?? 'none'}`;

                                return (
                                    <tr key={rowKey}>
                                        <td className="px-3 py-2 text-gray-800 dark:text-gray-100">
                                            <div className="flex flex-col items-start gap-2">
                                                <span>{record.cashier_name}</span>
                                                {!closed && record.unit_id ? (
                                                    <div className="flex flex-col items-start gap-2">
                                                        {isMaster ? (
                                                            <button
                                                                type="button"
                                                                onClick={() => submitZeroClosure(record)}
                                                                disabled={zeroCloseRowKey === rowKey}
                                                                className="inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-amber-500/50 dark:bg-amber-900/30 dark:text-amber-100"
                                                            >
                                                                {zeroCloseRowKey === rowKey ? 'Fechando...' : 'Fechar zerado'}
                                                            </button>
                                                        ) : null}
                                                        {canSubmitOkClosure ? (
                                                            <button
                                                                type="button"
                                                                onClick={() => submitOkClosure(record)}
                                                                disabled={okCloseRowKey === rowKey}
                                                                className="inline-flex items-center rounded-full border border-green-300 bg-green-50 px-3 py-1 text-xs font-semibold text-green-800 transition hover:bg-green-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-green-500/50 dark:bg-green-900/30 dark:text-green-100"
                                                            >
                                                                {okCloseRowKey === rowKey ? 'Fechando...' : 'Fechar OK'}
                                                            </button>
                                                        ) : null}
                                                    </div>
                                                ) : null}
                                            </div>
                                        </td>
                                        <td className="px-3 py-2 text-gray-600 dark:text-gray-300">
                                            {record.unit_name ?? '---'}
                                        </td>
                                        <td className="px-3 py-2 text-gray-700 dark:text-gray-200">
                                            <button
                                                type="button"
                                                onClick={() => openDiscardModal(record)}
                                                className={`mb-2 w-full rounded-full px-3 py-1 text-xs font-semibold transition ${
                                                    record.discard_alert?.exceeded
                                                        ? 'border border-amber-300 bg-amber-100 text-amber-900 hover:bg-amber-200 dark:border-amber-500/60 dark:bg-amber-900/40 dark:text-amber-100'
                                                        : record.discard_total > 0
                                                            ? 'bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-200'
                                                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300'
                                                }`}
                                            >
                                                <span className="flex items-center justify-between">
                                                    <span className="inline-flex items-center gap-2">
                                                        <span>Descarte</span>
                                                        {record.discard_alert?.exceeded && (
                                                            <i className="bi bi-exclamation-triangle-fill" aria-hidden="true"></i>
                                                        )}
                                                    </span>
                                                    <span>{formatCurrency(record.discard_total ?? 0)}</span>
                                                </span>
                                                <span className="mt-0.5 block text-[10px] font-normal text-gray-500 dark:text-gray-400">
                                                    Qtd: {formatQuantity(record.discard_quantity ?? 0, 3)}
                                                    {record.discard_alert?.exceeded && record.discard_alert?.percentage !== null
                                                        ? ` â€¢ ${Number(record.discard_alert.percentage).toLocaleString('pt-BR', {
                                                            minimumFractionDigits: 2,
                                                            maximumFractionDigits: 2,
                                                        })}%`
                                                        : ''}
                                                </span>
                                            </button>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${statusClass}`}>
                                                    {closed ? 'Fechado' : 'Pendente'}
                                                </span>
                                                {isMaster && closed && (
                                                    <button
                                                        type="button"
                                                        onClick={() => openMasterReviewModal(record)}
                                                        className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100"
                                                    >
                                                        Master Confere
                                                    </button>
                                                )}
                                                {isMaster && closed && (
                                                    <button
                                                        type="button"
                                                        onClick={() => reopenClosure(record)}
                                                        disabled={reopenCloseRowKey === rowKey}
                                                        className="inline-flex items-center rounded-full border border-red-300 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                                                    >
                                                        {reopenCloseRowKey === rowKey ? 'Reabrindo...' : 'Reabrir caixa'}
                                                    </button>
                                                )}
                                            </div>
                                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                                {closed ? formatDateTime(closure?.closed_at) : 'Sem registro'}
                                            </p>
                                            {masterReviewed && (
                                                <p className="mt-1 text-xs font-medium text-indigo-600 dark:text-indigo-300">
                                                    Conferido por {closure?.master_review?.checked_by_name ?? 'Master'} em{' '}
                                                    {formatDateTime(closure?.master_review?.checked_at)}
                                                </p>
                                            )}
                                        </td>
                                        {paymentColumns.map((column) => (
                                            <td
                                                key={`${record.cashier_id}-${column.key}`}
                                                className="px-3 py-2 text-right text-gray-700 dark:text-gray-200 align-top"
                                            >
                                                {renderPaymentCell(record, column, {
                                                    showCardDifferenceLink: true,
                                                })}
                                            </td>
                                        ))}
                                        <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-200 align-top">
                                            {renderSystemAlignedCell('Sistema', record.grand_total ?? 0)}
                                        </td>
                                        <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-200 align-top">
                                            {renderConferenceCell(record)}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );

    const discrepancyParams = {};
    if (dateInput) {
        discrepancyParams.date = dateInput;
    }
    if (unitFilter !== null && unitFilter !== undefined) {
        discrepancyParams.unit_id = unitFilter;
    }

    const headerContent = (
        <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
                <h2 className="text-xl font-semibold leading-tight text-gray-800 dark:text-gray-200">
                    Fechamento de CAIXA
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-300">
                    Totais de venda por atendente organizados por forma de pagamento. A conferencia do caixa usa somente dinheiro e cartao.
                </p>
            </div>
            <div className="flex items-center gap-2">
                <Link
                    href={route('reports.cash.discrepancies', discrepancyParams)}
                    className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 shadow-sm transition hover:bg-indigo-100 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-200"
                    aria-label="Atalho para fechamentos com discrepancia"
                >
                    <i className="bi bi-exclamation-triangle" aria-hidden="true"></i>
                    <span>Fechamentos com discrepancia</span>
                </Link>
            </div>
        </div>
    );

    return (
        <AuthenticatedLayout header={headerContent}>
            <Head title="Fechamento de CAIXA" />

            <div className="py-12">
                <div className="mx-auto max-w-7xl space-y-8 px-4 sm:px-6 lg:px-8">
                    {filterCard}
                    {summaryCard}
                    {tableSection}
                </div>
            </div>
            <Modal show={masterReviewModal.open} onClose={closeMasterReviewModal} maxWidth="lg" tone="light">
                <div className="bg-white p-6 text-gray-800">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <h3 className="text-lg font-semibold text-gray-900">
                                Master Confere
                            </h3>
                            <p className="text-sm text-gray-500">
                                Ajuste os valores informados no fechamento para a segunda conferencia.
                            </p>
                        </div>
                    </div>

                    {masterReviewModal.record && (
                        <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
                            <p>
                                <span className="font-semibold">Caixa:</span> {masterReviewModal.record.cashier_name}
                            </p>
                            <p>
                                <span className="font-semibold">Unidade:</span> {masterReviewModal.record.unit_name ?? '---'}
                            </p>
                            <p>
                                <span className="font-semibold">Fechamento original:</span>{' '}
                                Dinheiro {formatCurrency(masterReviewModal.record.closure?.original_cash_amount ?? 0)} Â·
                                Cartao {formatCurrency(masterReviewModal.record.closure?.original_card_amount ?? 0)}
                            </p>
                        </div>
                    )}

                    <form onSubmit={submitMasterReview} className="mt-6 space-y-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div>
                                <label className="text-sm font-medium text-gray-700">
                                    Dinheiro
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={masterReviewModal.cashAmount}
                                    onChange={(event) =>
                                        setMasterReviewModal((current) => ({
                                            ...current,
                                            cashAmount: event.target.value,
                                            error: '',
                                        }))
                                    }
                                    className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium text-gray-700">
                                    Cartao
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={masterReviewModal.cardAmount}
                                    onChange={(event) =>
                                        setMasterReviewModal((current) => ({
                                            ...current,
                                            cardAmount: event.target.value,
                                            error: '',
                                        }))
                                    }
                                    className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                                />
                            </div>
                        </div>

                        {masterReviewModal.error && (
                            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                                {masterReviewModal.error}
                            </div>
                        )}

                        <div className="flex justify-end gap-3 border-t border-gray-200 pt-4">
                            <button
                                type="button"
                                onClick={closeMasterReviewModal}
                                disabled={masterReviewModal.processing}
                                className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 disabled:opacity-60"
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                disabled={masterReviewModal.processing}
                                className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-700 disabled:opacity-60"
                            >
                                Salvar conferencia
                            </button>
                        </div>
                    </form>
                </div>
            </Modal>
            <Modal show={cardComplementModal.open} onClose={closeCardComplementModal} maxWidth="2xl" tone="light">
                <div className="bg-white p-6 text-gray-800">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <h3 className="text-lg font-semibold text-gray-900">
                                Compras com complemento em cartao menor que R$ 1,00
                            </h3>
                            <p className="text-sm text-gray-500">
                                Registros pagos em dinheiro com campo dois_pgto em cartao abaixo de R$ 1,00.
                            </p>
                            <p className="mt-1 text-xs text-gray-500">
                                Caixa: {cardComplementModal.cashierName || '---'} | Unidade: {cardComplementModal.unitName || '---'}
                            </p>
                        </div>
                        <div className="text-right text-sm">
                            <p className="font-semibold text-gray-700">
                                Total: {formatCurrency(cardComplementModal.total)}
                            </p>
                            <p className="text-gray-500">
                                Registros: {cardComplementModal.items.length}
                            </p>
                        </div>
                    </div>

                    {!cardComplementModal.items.length ? (
                        <p className="mt-6 text-sm text-gray-500">
                            Nenhuma compra com complemento em cartao abaixo de R$ 1,00 para este fechamento.
                        </p>
                    ) : (
                        <div className="mt-6 max-h-96 overflow-y-auto">
                            <table className="min-w-full divide-y divide-gray-200 text-sm">
                                <thead className="bg-gray-50 text-gray-600">
                                    <tr>
                                        <th className="px-3 py-2 text-left font-medium">Cupom</th>
                                        <th className="px-3 py-2 text-left font-medium">Comanda</th>
                                        <th className="px-3 py-2 text-left font-medium">Data/Hora</th>
                                        <th className="px-3 py-2 text-right font-medium">Total compra</th>
                                        <th className="px-3 py-2 text-right font-medium">Dinheiro</th>
                                        <th className="px-3 py-2 text-right font-medium">Cartao compl.</th>
                                        <th className="px-3 py-2 text-right font-medium">Cupom</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {cardComplementModal.items.map((item) => (
                                        <tr key={item.payment_id}>
                                            <td className="px-3 py-2 text-gray-800">
                                                #{item.payment_id}
                                            </td>
                                            <td className="px-3 py-2 text-gray-700">
                                                {item.comanda ?? '--'}
                                            </td>
                                            <td className="px-3 py-2 text-gray-600">
                                                {formatDateTime(item.created_at)}
                                            </td>
                                            <td className="px-3 py-2 text-right text-gray-700">
                                                {formatCurrency(item.sale_total)}
                                            </td>
                                            <td className="px-3 py-2 text-right text-gray-700">
                                                {formatCurrency(item.cash_paid ?? item.cash_amount)}
                                            </td>
                                            <td className="px-3 py-2 text-right font-semibold text-indigo-700">
                                                {formatCurrency(item.card_amount)}
                                            </td>
                                            <td className="px-3 py-2 text-right">
                                                {item.receipt ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => openReceiptDetails(item.receipt)}
                                                        className="rounded-full border border-indigo-200 px-3 py-1 text-xs font-semibold text-indigo-700 transition hover:border-indigo-300 hover:bg-indigo-50"
                                                    >
                                                        Detalhar cupom
                                                    </button>
                                                ) : (
                                                    <span className="text-xs text-gray-400">--</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </Modal>
            <Modal show={expenseModal.open} onClose={closeExpenseModal} maxWidth="2xl" tone="light">
                <div className="bg-white p-6 text-gray-800">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <h3 className="text-lg font-semibold text-gray-900">
                                Detalhe dos gastos
                            </h3>
                            <p className="text-sm text-gray-500">
                                Gastos deduzidos do dinheiro esperado no caixa para este fechamento.
                            </p>
                            <p className="mt-1 text-xs text-gray-500">
                                Caixa: {expenseModal.cashierName || '---'} | Unidade: {expenseModal.unitName || '---'}
                            </p>
                        </div>
                        <div className="text-right text-sm">
                            <p className="font-semibold text-gray-700">
                                Total: {formatCurrency(expenseModal.total)}
                            </p>
                            <p className="text-gray-500">
                                Registros: {expenseModal.items.length}
                            </p>
                        </div>
                    </div>

                    {!expenseModal.items.length ? (
                        <p className="mt-6 text-sm text-gray-500">
                            Nenhum gasto encontrado para este fechamento.
                        </p>
                    ) : (
                        <div className="mt-6 max-h-96 overflow-y-auto">
                            <table className="min-w-full divide-y divide-gray-200 text-sm">
                                <thead className="bg-gray-50 text-gray-600">
                                    <tr>
                                        <th className="px-3 py-2 text-left font-medium">Fornecedor</th>
                                        <th className="px-3 py-2 text-left font-medium">Data</th>
                                        <th className="px-3 py-2 text-right font-medium">Valor</th>
                                        <th className="px-3 py-2 text-left font-medium">Observacao</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {expenseModal.items.map((item) => (
                                        <tr key={item.id}>
                                            <td className="px-3 py-2 text-gray-800">
                                                {item.supplier}
                                            </td>
                                            <td className="px-3 py-2 text-gray-600">
                                                {formatShortDate(item.expense_date)}
                                            </td>
                                            <td className="px-3 py-2 text-right font-semibold text-amber-700">
                                                {formatCurrency(item.amount)}
                                            </td>
                                            <td className="px-3 py-2 text-gray-600">
                                                {item.notes ?? '--'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </Modal>
            <Modal show={Boolean(selectedReceipt)} onClose={closeReceiptDetails} maxWidth="lg" tone="light">
                <div className="bg-white p-6 text-gray-800">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <h3 className="text-lg font-semibold text-gray-900">
                                {selectedReceipt?.id ? `Cupom #${selectedReceipt.id}` : 'Cupom'}
                            </h3>
                            <p className="text-sm text-gray-500">
                                {formatDateTime(selectedReceipt?.date_time)}
                            </p>
                            {selectedReceipt?.comanda && (
                                <p className="text-xs font-semibold text-gray-600">
                                    Comanda: {selectedReceipt.comanda}
                                </p>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => handlePrintReceipt(selectedReceipt)}
                                disabled={!selectedReceipt}
                                className="rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white shadow transition hover:bg-indigo-700 disabled:opacity-60"
                            >
                                Imprimir
                            </button>
                            <button
                                type="button"
                                onClick={closeReceiptDetails}
                                className="rounded-xl border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-100"
                            >
                                Fechar
                            </button>
                        </div>
                    </div>

                    {printError && (
                        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                            {printError}
                        </div>
                    )}

                    {selectedReceipt && (
                        <>
                            <div className="mt-4 space-y-2 text-sm text-gray-700">
                                <p>
                                    <span className="font-medium">Pagamento:</span> {selectedReceipt.tipo_pago ?? '---'}
                                </p>
                                <p>
                                    <span className="font-medium">Total:</span> {formatCurrency(selectedReceipt.total)}
                                </p>
                                <p>
                                    <span className="font-medium">Caixa:</span> {selectedReceipt.cashier_name ?? '---'}
                                </p>
                                {selectedReceipt.payment?.valor_pago !== null && (
                                    <p>
                                        <span className="font-medium">Dinheiro pago:</span> {formatCurrency(selectedReceipt.payment.valor_pago)}
                                    </p>
                                )}
                                {Number(selectedReceipt.payment?.troco ?? 0) > 0 && (
                                    <p>
                                        <span className="font-medium">Troco:</span> {formatCurrency(selectedReceipt.payment.troco)}
                                    </p>
                                )}
                                {Number(selectedReceipt.payment?.dois_pgto ?? 0) > 0 && (
                                    <p>
                                        <span className="font-medium">
                                            {selectedReceipt.tipo_pago === 'dinheiro_pix' ? 'Pix' : 'Cartao'} (compl.):
                                        </span>{' '}
                                        {formatCurrency(selectedReceipt.payment.dois_pgto)}
                                    </p>
                                )}
                            </div>

                            <div className="mt-6 rounded-2xl border border-gray-100 bg-gray-50 p-4">
                                <h4 className="text-sm font-semibold text-gray-700">Itens</h4>
                                <div className="mt-3 space-y-3 text-sm">
                                    {(selectedReceipt.items ?? []).map((item) => (
                                        <div
                                            key={`${selectedReceipt.id ?? 'receipt'}-${item.id}`}
                                            className="flex items-center justify-between rounded-xl bg-white px-3 py-2 shadow-sm"
                                        >
                                            <div>
                                                <p className="font-medium text-gray-900">
                                                    {item.quantity}x {item.product_name}
                                                </p>
                                                <p className="text-xs text-gray-500">
                                                    {formatCurrency(item.unit_price)} cada
                                                </p>
                                            </div>
                                            <p className="font-semibold text-gray-900">
                                                {formatCurrency(item.subtotal)}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </Modal>
            <Modal show={discardModal.open} onClose={closeDiscardModal} maxWidth="xl" tone="light">
                <div className="bg-white p-6 text-gray-800">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <h3 className="text-lg font-semibold text-gray-900">
                                Descartes do dia {discardModal.cashierName ? `- ${discardModal.cashierName}` : ''}
                            </h3>
                            <p className="text-sm text-gray-500">
                                Totais calculados com base no valor registrado em cada discarte.
                            </p>
                        </div>
                        <div className="text-right text-sm">
                            <p className="font-semibold text-gray-700">
                                Valor: {formatCurrency(discardModalTotals.value)}
                            </p>
                            <p className="text-gray-500">
                                Quantidade: {formatQuantity(discardModalTotals.quantity, 3)}
                            </p>
                        </div>
                    </div>

                    {!discardModal.items.length ? (
                        <p className="mt-6 text-sm text-gray-500">Nenhum descarte registrado para este caixa.</p>
                    ) : (
                        <div className="mt-6 max-h-96 overflow-y-auto">
                            <table className="min-w-full divide-y divide-gray-200 text-sm">
                                <thead className="bg-gray-50 text-gray-600">
                                    <tr>
                                        <th className="px-3 py-2 text-left font-medium">Produto</th>
                                        <th className="px-3 py-2 text-left font-medium">Quantidade</th>
                                        <th className="px-3 py-2 text-left font-medium">Valor estimado</th>
                                        <th className="px-3 py-2 text-left font-medium">Data/Hora</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {discardModal.items.map((item) => (
                                        <tr key={item.id}>
                                            <td className="px-3 py-2 text-gray-800">
                                                {item.product?.name ?? 'Produto removido'}
                                            </td>
                                            <td className="px-3 py-2 text-gray-700">
                                                {formatQuantity(item.quantity, 3)}
                                            </td>
                                            <td className="px-3 py-2 text-gray-700">
                                                {formatCurrency(item.value ?? 0)}
                                            </td>
                                            <td className="px-3 py-2 text-gray-600">
                                                {formatDateTime(item.created_at)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </Modal>

        </AuthenticatedLayout>
    );
}
