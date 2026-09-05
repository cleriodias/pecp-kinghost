import AlertMessage from '@/Components/Alert/AlertMessage';
import PrimaryButton from '@/Components/Button/PrimaryButton';
import Modal from '@/Components/Modal';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import {
    formatBrazilDateTime,
    formatBrazilShortDate,
    getBrazilTodayShortInputValue,
    isoToBrazilShortDateInput,
    normalizeBrazilShortDateInput,
    shortBrazilDateInputToIso,
} from '@/Utils/date';
import { Head, router, useForm, usePage } from '@inertiajs/react';
import { useState } from 'react';

const WHATSAPP_NUMBER = '5561984524923';

const STATUS_LEGEND = [
    {
        key: 'paid',
        label: 'Pago',
        boxClass: 'border-emerald-200 bg-emerald-100 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-200',
    },
    {
        key: 'unpaid',
        label: 'Nao pago',
        boxClass: 'border-orange-200 bg-orange-100 text-orange-800 dark:border-orange-500/40 dark:bg-orange-500/15 dark:text-orange-200',
    },
    {
        key: 'due_today',
        label: 'Vence hoje',
        boxClass: 'border-red-200 bg-red-100 text-red-800 dark:border-red-500/40 dark:bg-red-500/15 dark:text-red-200',
    },
    {
        key: 'overdue',
        label: 'Atrasado',
        boxClass: 'border-pink-200 bg-pink-100 text-pink-800 dark:border-pink-500/40 dark:bg-pink-500/15 dark:text-pink-200',
    },
];

const formatCurrency = (value) =>
    Number(value ?? 0).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });

const formatDate = (value) => {
    if (!value) {
        return '--/--/--';
    }

    return formatBrazilShortDate(value);
};

const formatDateTime = (value) => {
    if (!value) {
        return '--/--/-- --:--';
    }

    return formatBrazilDateTime(value);
};

const onlyDigits = (value) => String(value ?? '').replace(/\D/g, '');
const hasBarcodeValue = (value) => onlyDigits(value).length > 0;

const BOLETO_BARCODE_LENGTH = 44;
const INTERLEAVED_2_OF_5_PATTERNS = {
    0: 'nnwwn',
    1: 'wnnnw',
    2: 'nwnnw',
    3: 'wwnnn',
    4: 'nnwnw',
    5: 'wnwnn',
    6: 'nwwnn',
    7: 'nnnww',
    8: 'wnnwn',
    9: 'nwnwn',
};

const buildInterleavedBarcodeSegments = (barcode) => {
    const digits = onlyDigits(barcode);

    if (digits.length !== BOLETO_BARCODE_LENGTH || digits.length % 2 !== 0) {
        return [];
    }

    const segments = [
        { type: 'bar', width: 1 },
        { type: 'space', width: 1 },
        { type: 'bar', width: 1 },
        { type: 'space', width: 1 },
    ];

    for (let index = 0; index < digits.length; index += 2) {
        const leftPattern = INTERLEAVED_2_OF_5_PATTERNS[digits[index]];
        const rightPattern = INTERLEAVED_2_OF_5_PATTERNS[digits[index + 1]];

        if (!leftPattern || !rightPattern) {
            return [];
        }

        for (let patternIndex = 0; patternIndex < 5; patternIndex += 1) {
            segments.push({
                type: 'bar',
                width: leftPattern[patternIndex] === 'w' ? 3 : 1,
            });
            segments.push({
                type: 'space',
                width: rightPattern[patternIndex] === 'w' ? 3 : 1,
            });
        }
    }

    segments.push(
        { type: 'bar', width: 3 },
        { type: 'space', width: 1 },
        { type: 'bar', width: 1 },
    );

    return segments;
};

function BoletoBarcode({ value, compact = false }) {
    const digits = onlyDigits(value);
    const segments = buildInterleavedBarcodeSegments(digits);

    if (!digits) {
        return (
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-300">
                Codigo de barras nao informado.
            </div>
        );
    }

    if (!segments.length) {
        return (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200">
                Nao foi possivel gerar a representacao em barras. O codigo precisa ter exatamente 44 digitos.
            </div>
        );
    }

    const totalUnits = segments.reduce((sum, segment) => sum + segment.width, 0);
    const containerClass = compact
        ? 'rounded-xl border border-gray-200 bg-white px-2 py-3 dark:border-gray-700 dark:bg-gray-950/60'
        : 'rounded-xl border border-gray-200 bg-white px-3 py-4 dark:border-gray-700 dark:bg-gray-950/60';
    const barcodeClass = compact
        ? 'flex h-20 w-full items-stretch overflow-hidden bg-white dark:bg-white'
        : 'flex h-24 w-full items-stretch overflow-hidden bg-white dark:bg-white';

    return (
        <div className={containerClass}>
            <div
                className={barcodeClass}
                role="img"
                aria-label={`Representacao em barras do codigo ${digits}`}
            >
                {segments.map((segment, index) => (
                    <span
                        key={`${segment.type}-${index}`}
                        aria-hidden="true"
                        className={segment.type === 'bar' ? 'h-full bg-black' : 'h-full bg-transparent'}
                        style={{ width: `${(segment.width / totalUnits) * 100}%` }}
                    />
                ))}
            </div>
        </div>
    );
}

const resolveIsoDate = (value) => {
    const normalized = String(value ?? '').trim();

    if (normalized.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(normalized)) {
        return normalized.slice(0, 10);
    }

    return shortBrazilDateInputToIso(normalized) || '';
};

const getBoletoVisualState = (boleto, todayIso) => {
    if (boleto?.is_paid) {
        return {
            key: 'paid',
            label: 'Pago',
            rowClass: 'bg-emerald-50/90 text-emerald-950 dark:bg-emerald-500/10 dark:text-emerald-50',
            badgeClass: 'border-emerald-200 bg-emerald-100 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-200',
        };
    }

    const dueDateIso = resolveIsoDate(boleto?.due_date);

    if (dueDateIso !== '' && dueDateIso < todayIso) {
        return {
            key: 'overdue',
            label: 'Atrasado',
            rowClass: 'bg-pink-50/90 text-pink-950 dark:bg-pink-500/10 dark:text-pink-50',
            badgeClass: 'border-pink-200 bg-pink-100 text-pink-800 dark:border-pink-500/40 dark:bg-pink-500/15 dark:text-pink-200',
        };
    }

    if (dueDateIso !== '' && dueDateIso === todayIso) {
        return {
            key: 'due_today',
            label: 'Vence hoje',
            rowClass: 'bg-red-50/90 text-red-950 dark:bg-red-500/10 dark:text-red-50',
            badgeClass: 'border-red-200 bg-red-100 text-red-800 dark:border-red-500/40 dark:bg-red-500/15 dark:text-red-200',
        };
    }

    return {
        key: 'unpaid',
        label: 'Nao pago',
        rowClass: 'bg-orange-50/90 text-orange-950 dark:bg-orange-500/10 dark:text-orange-50',
        badgeClass: 'border-orange-200 bg-orange-100 text-orange-800 dark:border-orange-500/40 dark:bg-orange-500/15 dark:text-orange-200',
    };
};

const getPaidByName = (boleto) => {
    if (boleto?.paid_by && typeof boleto.paid_by === 'object') {
        return boleto.paid_by.name ?? 'N/I';
    }

    if (boleto?.paidBy && typeof boleto.paidBy === 'object') {
        return boleto.paidBy.name ?? 'N/I';
    }

    return 'N/I';
};

const buildWhatsAppMessage = (boleto) => {
    const description = boleto?.description ?? '--';
    const amount = formatCurrency(boleto?.amount);
    const barcode = boleto?.barcode ?? '--';
    const digitableLine = boleto?.digitable_line ?? '--';
    const dueDate = formatDate(boleto?.due_date);

    return [
        'Segue os dados do boleto:',
        `Descricao: ${description}`,
        `Valor: ${amount}`,
        `Vencimento: ${dueDate}`,
        `Codigo de barras: ${barcode}`,
        `Linha digitavel: ${digitableLine}`,
    ].join('\n');
};

const buildWhatsAppLink = (boleto) =>
    `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(buildWhatsAppMessage(boleto))}`;

const escapeHtml = (value) =>
    String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

const renderBarcodeBarsSvg = (value) => {
    const digits = onlyDigits(value);
    const segments = buildInterleavedBarcodeSegments(digits);

    if (!digits) {
        return '<div class="barcode-fallback barcode-fallback-neutral">Codigo de barras nao informado.</div>';
    }

    if (!segments.length) {
        return '<div class="barcode-fallback">Codigo de barras invalido.</div>';
    }

    const totalUnits = segments.reduce((sum, segment) => sum + segment.width, 0);
    let cursor = 0;

    const rects = segments
        .map((segment) => {
            const currentX = cursor;
            cursor += segment.width;

            if (segment.type !== 'bar') {
                return '';
            }

            return `<rect x="${currentX}" y="0" width="${segment.width}" height="100" fill="#000000"></rect>`;
        })
        .join('');

    return `
        <div class="barcode-print-box">
            <svg
                class="barcode-print-svg"
                viewBox="0 0 ${totalUnits} 100"
                preserveAspectRatio="none"
                role="img"
                aria-label="Codigo de barras ${escapeHtml(digits)}"
                xmlns="http://www.w3.org/2000/svg"
            >
                ${rects}
            </svg>
            <div class="barcode-print-digits">${escapeHtml(digits)}</div>
        </div>
    `;
};

const buildBoletoBatchPrintHtml = (boletos) => `
    <!DOCTYPE html>
    <html lang="pt-BR">
        <head>
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <title>Codigos de barras dos boletos</title>
            <style>
                * {
                    box-sizing: border-box;
                }
                body {
                    margin: 0;
                    padding: 24px;
                    font-family: Arial, sans-serif;
                    color: #111827;
                    background: #ffffff;
                }
                h1 {
                    margin: 0 0 8px;
                    font-size: 22px;
                }
                .subtitle {
                    margin: 0 0 24px;
                    font-size: 13px;
                    color: #4b5563;
                }
                .list {
                    display: grid;
                    gap: 16px;
                }
                .item {
                    border: 1px solid #d1d5db;
                    border-radius: 12px;
                    padding: 16px;
                    page-break-inside: avoid;
                }
                .item-header {
                    display: flex;
                    justify-content: space-between;
                    gap: 16px;
                    margin-bottom: 12px;
                }
                .description {
                    font-size: 18px;
                    font-weight: 700;
                }
                .meta {
                    display: flex;
                    gap: 16px;
                    font-size: 13px;
                    color: #374151;
                    flex-wrap: wrap;
                }
                .barcode-print-box {
                    width: 100%;
                }
                .barcode-print-svg {
                    display: block;
                    width: 100%;
                    height: 96px;
                    background: #ffffff;
                    border: 1px solid #e5e7eb;
                    border-radius: 10px;
                }
                .barcode-print-digits {
                    margin-top: 10px;
                    font-size: 14px;
                    word-break: break-all;
                }
                .barcode-fallback {
                    border: 1px solid #fca5a5;
                    background: #fef2f2;
                    color: #b91c1c;
                    border-radius: 10px;
                    padding: 12px;
                    font-size: 12px;
                }
                .barcode-fallback-neutral {
                    border-color: #d1d5db;
                    background: #f9fafb;
                    color: #4b5563;
                }
                @media print {
                    body {
                        padding: 12px;
                    }
                }
            </style>
        </head>
        <body>
            <h1>Codigos de barras dos boletos</h1>
            <p class="subtitle">Resultado atual da pesquisa: ${boletos.length} boleto(s).</p>
            <div class="list">
                ${boletos
                    .map(
                        (boleto) => `
                            <section class="item">
                                <div class="item-header">
                                    <div class="description">${escapeHtml(boleto.description)}</div>
                                    <div class="meta">
                                        <span><strong>Vencimento:</strong> ${escapeHtml(formatDate(boleto.due_date))}</span>
                                        <span><strong>Valor:</strong> ${escapeHtml(formatCurrency(boleto.amount))}</span>
                                    </div>
                                </div>
                                ${renderBarcodeBarsSvg(boleto.barcode)}
                            </section>
                        `,
                    )
                    .join('')}
            </div>
        </body>
    </html>
`;

export default function BoletoIndex({
    activeUnit = null,
    filters = {},
    boletos = null,
    todayUserBoletos = [],
    canViewList = false,
    canManageList = false,
    filterUnits = [],
    listTotalAmount = 0,
    canCreateBoletos = false,
    canChooseCreateUnit = false,
    createUnits = [],
    createUnitId = null,
}) {
    const { flash } = usePage().props;
    const todayShort = getBrazilTodayShortInputValue();
    const todayIso = shortBrazilDateInputToIso(todayShort) || '';
    const defaultCreateUnitId =
        createUnitId !== null && createUnitId !== undefined
            ? String(createUnitId)
            : createUnits[0]?.id
              ? String(createUnits[0].id)
              : '';
    const hasActiveUnit = Boolean(activeUnit?.id);
    const canAccessCreateForm = Boolean(canCreateBoletos);
    const canAccessList = Boolean(canViewList);

    const {
        data,
        setData,
        post,
        put,
        processing,
        errors,
        reset,
        setError,
        clearErrors,
        transform,
    } = useForm({
        unit_id: defaultCreateUnitId,
        description: '',
        due_date: todayShort,
        amount: '',
        barcode: '',
        digitable_line: '',
    });

    const {
        data: filterData,
        setData: setFilterData,
        get,
        processing: filterProcessing,
    } = useForm({
        start_date: resolveIsoDate(filters.start_date ?? ''),
        end_date: resolveIsoDate(filters.end_date ?? ''),
        paid: filters.paid ?? 'unpaid',
        unit_id: filters.unit_id ?? 'all',
    });

    const [selectedBoleto, setSelectedBoleto] = useState(null);
    const [showDetails, setShowDetails] = useState(false);
    const [showBarcodeModal, setShowBarcodeModal] = useState(false);
    const [showBatchBarcodeModal, setShowBatchBarcodeModal] = useState(false);
    const [editingBoleto, setEditingBoleto] = useState(null);
    const [barcodeEnabled, setBarcodeEnabled] = useState(false);

    const buildFilterParams = () => ({
        start_date: resolveIsoDate(filterData.start_date) || undefined,
        end_date: resolveIsoDate(filterData.end_date) || undefined,
        paid: filterData.paid,
        unit_id: filterData.unit_id,
    });

    const resetCreateForm = (preservedUnitId = data.unit_id) => {
        clearErrors();
        setEditingBoleto(null);
        setBarcodeEnabled(false);
        reset();
        setData({
            unit_id: preservedUnitId,
            description: '',
            due_date: todayShort,
            amount: '',
            barcode: '',
            digitable_line: '',
        });
    };

    const handleBarcodeToggle = (enabled) => {
        setBarcodeEnabled(enabled);

        if (!enabled) {
            setData('barcode', '');
            clearErrors('barcode');
        }
    };

    const handleSubmit = (event) => {
        event.preventDefault();

        const dueDateIso = shortBrazilDateInputToIso(data.due_date);

        if (!dueDateIso) {
            setError('due_date', 'Informe a data no formato DD/MM/AA.');
            return;
        }

        clearErrors('due_date');
        const preservedUnitId = data.unit_id;
        const submitUrl = editingBoleto
            ? route('boletos.update', editingBoleto.id)
            : route('boletos.store');
        const submitAction = editingBoleto ? put : post;

        transform((formData) => ({
            ...formData,
            due_date: dueDateIso,
            barcode: barcodeEnabled ? onlyDigits(formData.barcode) : '',
            digitable_line: onlyDigits(formData.digitable_line),
        }));

        submitAction(submitUrl, {
            preserveScroll: true,
            onSuccess: () => {
                resetCreateForm(preservedUnitId);
            },
        });
    };

    const handleFilterSubmit = (event) => {
        event.preventDefault();
        get(route('boletos.index'), {
            preserveState: true,
            preserveScroll: true,
            replace: true,
            data: buildFilterParams(),
        });
    };

    const handlePay = (boletoId) => {
        if (!boletoId || !window.confirm('Confirma marcar este boleto como pago?')) {
            return;
        }

        router.put(route('boletos.pay', boletoId), {}, {
            preserveScroll: true,
        });
    };

    const handleEdit = (boleto) => {
        const normalizedBarcode = onlyDigits(boleto?.barcode);

        setEditingBoleto(boleto);
        setBarcodeEnabled(Boolean(normalizedBarcode));
        clearErrors();
        setData({
            unit_id:
                boleto?.unit_id !== null && boleto?.unit_id !== undefined
                    ? String(boleto.unit_id)
                    : defaultCreateUnitId,
            description: boleto?.description ?? '',
            due_date: isoToBrazilShortDateInput(boleto?.due_date ?? ''),
            amount: boleto?.amount !== null && boleto?.amount !== undefined ? String(boleto.amount) : '',
            barcode: normalizedBarcode,
            digitable_line: onlyDigits(boleto?.digitable_line),
        });

        if (typeof window !== 'undefined') {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    };

    const openDetails = (boleto) => {
        setSelectedBoleto(boleto);
        setShowDetails(true);
    };

    const closeDetails = () => {
        setShowDetails(false);
        setSelectedBoleto(null);
        setShowBarcodeModal(false);
    };

    const openBarcodeModal = () => {
        if (!hasBarcodeValue(selectedBoleto?.barcode)) {
            return;
        }

        setShowBarcodeModal(true);
    };

    const closeBarcodeModal = () => {
        setShowBarcodeModal(false);
    };

    const openBatchBarcodeModal = () => {
        setShowBatchBarcodeModal(true);
    };

    const closeBatchBarcodeModal = () => {
        setShowBatchBarcodeModal(false);
    };

    const visibleBoletos = Array.isArray(boletos?.data) ? boletos.data : [];
    const visibleTodayUserBoletos = Array.isArray(todayUserBoletos) ? todayUserBoletos : [];

    const handlePrintBatchBarcodes = () => {
        if (!visibleBoletos.length) {
            return;
        }

        const printWindow = window.open('', '_blank', 'width=1100,height=800');

        if (!printWindow) {
            window.alert('Nao foi possivel abrir a janela de impressao.');
            return;
        }

        printWindow.document.open();
        printWindow.document.write(buildBoletoBatchPrintHtml(visibleBoletos));
        printWindow.document.close();
        printWindow.focus();
        printWindow.print();
    };

    const canSubmitForm = canAccessCreateForm && (canChooseCreateUnit ? Boolean(data.unit_id) : hasActiveUnit);

    const headerContent = (
        <div>
            <h2 className="text-xl font-semibold leading-tight text-gray-800 dark:text-gray-200">
                Boletos
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-300">
                Cadastre, edite e acompanhe boletos com vencimento, valor, codigo de barras e linha digitavel.
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-300">
                Unidade ativa: <span className="font-semibold text-gray-700 dark:text-gray-200">{activeUnit?.name ?? '--'}</span>
            </p>
        </div>
    );

    return (
        <AuthenticatedLayout header={headerContent}>
            <Head title="Boletos" />

            <div className="py-12">
                <div className="mx-auto max-w-7xl space-y-6 px-4 sm:px-6 lg:px-8">
                    <AlertMessage message={flash} />

                    {!canAccessCreateForm && (
                        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 shadow dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
                            Seu perfil tem acesso apenas de consulta nesta tela.
                        </div>
                    )}

                    <div className="rounded-2xl bg-white p-6 shadow dark:bg-gray-800">
                        {!canSubmitForm && (
                            <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200">
                                {canChooseCreateUnit
                                    ? 'Nenhuma loja disponivel para cadastro. Selecione uma loja valida para continuar.'
                                    : 'Nenhuma unidade ativa definida. Selecione uma unidade para cadastrar boletos.'}
                            </p>
                        )}

                        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                                    {editingBoleto ? 'Editar boleto' : 'Cadastrar boleto'}
                                </h3>
                                <p className="text-sm text-gray-500 dark:text-gray-300">
                                    {editingBoleto
                                        ? `Atualizando o boleto #${editingBoleto.id}.`
                                        : 'Preencha os dados do boleto no formato DD/MM/AA e com os codigos apenas numericos.'}
                                </p>
                            </div>
                            {editingBoleto && (
                                <button
                                    type="button"
                                    onClick={() => resetCreateForm(data.unit_id)}
                                    className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-200 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                                >
                                    Cancelar edicao
                                </button>
                            )}
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div
                                className={`grid gap-4 ${
                                    canChooseCreateUnit
                                        ? 'lg:grid-cols-[minmax(0,1.1fr)_minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]'
                                        : 'lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]'
                                }`}
                            >
                                {canChooseCreateUnit && (
                                    <div>
                                        <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                            Loja
                                        </label>
                                        <select
                                            value={data.unit_id}
                                            onChange={(event) => setData('unit_id', event.target.value)}
                                            className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-gray-800 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                                            disabled={!createUnits.length}
                                        >
                                            {!createUnits.length ? (
                                                <option value="">Nenhuma loja disponivel</option>
                                            ) : (
                                                createUnits.map((unit) => (
                                                    <option key={unit.id} value={unit.id}>
                                                        {unit.name}
                                                    </option>
                                                ))
                                            )}
                                        </select>
                                    </div>
                                )}

                                <div>
                                    <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                        Descricao
                                    </label>
                                    <input
                                        type="text"
                                        value={data.description}
                                        onChange={(event) => setData('description', event.target.value)}
                                        className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-gray-800 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                                        disabled={!canSubmitForm}
                                    />
                                    {errors.description && (
                                        <p className="mt-1 text-sm text-red-600">{errors.description}</p>
                                    )}
                                </div>

                                <div>
                                    <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                        Vencimento
                                    </label>
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        value={data.due_date}
                                        onChange={(event) => setData('due_date', normalizeBrazilShortDateInput(event.target.value))}
                                        placeholder="DD/MM/AA"
                                        className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-gray-800 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                                        disabled={!canSubmitForm}
                                    />
                                    {errors.due_date && (
                                        <p className="mt-1 text-sm text-red-600">{errors.due_date}</p>
                                    )}
                                </div>

                                <div>
                                    <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                        Valor (R$)
                                    </label>
                                    <input
                                        type="number"
                                        min="0.01"
                                        step="0.01"
                                        value={data.amount}
                                        onChange={(event) => setData('amount', event.target.value)}
                                        className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-gray-800 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                                        disabled={!canSubmitForm}
                                    />
                                    {errors.amount && (
                                        <p className="mt-1 text-sm text-red-600">{errors.amount}</p>
                                    )}
                                </div>
                            </div>

                            <div className="grid gap-4 lg:grid-cols-2">
                                <div>
                                    <label className="mt-2 inline-flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                                        <input
                                            type="checkbox"
                                            checked={barcodeEnabled}
                                            onChange={(event) => handleBarcodeToggle(event.target.checked)}
                                            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                            disabled={!canSubmitForm}
                                        />
                                        Ativar preenchimento do codigo de barras
                                    </label>
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        value={data.barcode}
                                        onChange={(event) => setData('barcode', onlyDigits(event.target.value))}
                                        placeholder="44 digitos"
                                        className={`mt-2 w-full rounded-xl border px-3 py-2 text-gray-800 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:border-gray-600 dark:text-gray-100 ${
                                            barcodeEnabled
                                                ? 'border-gray-300 dark:bg-gray-700'
                                                : 'border-gray-200 bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                                        }`}
                                        disabled={!canSubmitForm || !barcodeEnabled}
                                    />
                                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                        Quando ativado, o sistema valida exatamente 44 digitos.
                                    </p>
                                    {errors.barcode && (
                                        <p className="mt-1 text-sm text-red-600">{errors.barcode}</p>
                                    )}
                                </div>

                                <div>
                                    <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                        Linha digitavel
                                    </label>
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        value={data.digitable_line}
                                        onChange={(event) => setData('digitable_line', onlyDigits(event.target.value))}
                                        placeholder="47 ou 48 digitos"
                                        className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-gray-800 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                                        disabled={!canSubmitForm}
                                    />
                                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                        O sistema valida 47 ou 48 digitos.
                                    </p>
                                    {errors.digitable_line && (
                                        <p className="mt-1 text-sm text-red-600">{errors.digitable_line}</p>
                                    )}
                                </div>
                            </div>

                            <div className="flex flex-wrap justify-end gap-3">
                                {editingBoleto && (
                                    <button
                                        type="button"
                                        onClick={() => resetCreateForm(data.unit_id)}
                                        className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-200 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                                    >
                                        Cancelar
                                    </button>
                                )}
                                <PrimaryButton
                                    type="submit"
                                    disabled={processing || !canSubmitForm}
                                    className="justify-center rounded-xl px-4 py-2 text-sm font-semibold normal-case tracking-normal disabled:cursor-not-allowed"
                                >
                                    {editingBoleto ? 'Atualizar boleto' : 'Salvar boleto'}
                                </PrimaryButton>
                            </div>
                        </form>
                    </div>

                    {canAccessList ? (
                        <>
                            <form
                                onSubmit={handleFilterSubmit}
                                className="rounded-2xl bg-white p-5 shadow dark:bg-gray-800"
                            >
                                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.9fr)_auto_auto]">
                                    <div>
                                        <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                            Loja
                                        </label>
                                        <select
                                            value={filterData.unit_id}
                                            onChange={(event) => setFilterData('unit_id', event.target.value)}
                                            className="mt-2 w-full rounded-2xl border border-gray-300 px-4 py-3 text-gray-800 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                                        >
                                            <option value="all">Todas</option>
                                            {filterUnits.map((unit) => (
                                                <option key={unit.id} value={unit.id}>
                                                    {unit.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    <div>
                                        <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                            Inicio
                                        </label>
                                        <input
                                            type="date"
                                            value={filterData.start_date}
                                            onChange={(event) => setFilterData('start_date', event.target.value)}
                                            className="mt-2 w-full rounded-2xl border border-gray-300 px-4 py-3 text-gray-800 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                                        />
                                    </div>

                                    <div>
                                        <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                            Fim
                                        </label>
                                        <input
                                            type="date"
                                            value={filterData.end_date}
                                            onChange={(event) => setFilterData('end_date', event.target.value)}
                                            className="mt-2 w-full rounded-2xl border border-gray-300 px-4 py-3 text-gray-800 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                                        />
                                    </div>

                                    <div>
                                        <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                            Status
                                        </label>
                                        <select
                                            value={filterData.paid}
                                            onChange={(event) => setFilterData('paid', event.target.value)}
                                            className="mt-2 w-full rounded-2xl border border-gray-300 px-4 py-3 text-gray-800 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                                        >
                                            <option value="unpaid">Nao pagos</option>
                                            <option value="paid">Pagos</option>
                                            <option value="all">Todos</option>
                                        </select>
                                    </div>

                                    <div className="rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-indigo-700 shadow-sm dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-200">
                                        <p className="text-[10px] font-semibold uppercase tracking-wide">
                                            Total da consulta
                                        </p>
                                        <p className="mt-1 text-lg font-bold">
                                            {formatCurrency(listTotalAmount)}
                                        </p>
                                    </div>

                                    <div className="flex items-end">
                                        <PrimaryButton
                                            type="submit"
                                            disabled={filterProcessing}
                                            className="w-full justify-center rounded-2xl px-5 py-3 text-sm font-semibold normal-case tracking-normal disabled:cursor-not-allowed"
                                        >
                                            Filtrar
                                        </PrimaryButton>
                                    </div>
                                </div>
                            </form>

                            <div className="rounded-2xl bg-white p-6 shadow dark:bg-gray-800">
                                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                                            Listagem de boletos
                                        </h3>
                                        <p className="text-sm text-gray-500 dark:text-gray-300">
                                            As cores indicam rapidamente a situacao de cada boleto.
                                        </p>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={openBatchBarcodeModal}
                                            disabled={!visibleBoletos.length}
                                            className="rounded-xl border border-indigo-300 px-4 py-2 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:cursor-not-allowed disabled:opacity-50 dark:border-indigo-500/60 dark:text-indigo-200 dark:hover:bg-indigo-900/30"
                                        >
                                            Ver codigos em lote
                                        </button>
                                        {STATUS_LEGEND.map((legend) => (
                                            <span
                                                key={legend.key}
                                                className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${legend.boxClass}`}
                                            >
                                                {legend.label}
                                            </span>
                                        ))}
                                    </div>
                                </div>

                                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                                    <span className="text-xs font-semibold text-gray-500 dark:text-gray-300">
                                        {boletos?.total ?? 0} registro(s)
                                    </span>
                                    <span className="text-xs font-semibold text-gray-500 dark:text-gray-300">
                                        Pagina {boletos?.current_page ?? 1} de {boletos?.last_page ?? 1}
                                    </span>
                                </div>

                                <div className="overflow-x-auto">
                                    {boletos?.data?.length ? (
                                        <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-700">
                                            <thead className="bg-gray-50 dark:bg-gray-900/40">
                                                <tr>
                                                    <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">
                                                        Descricao
                                                    </th>
                                                    <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">
                                                        Vencimento
                                                    </th>
                                                    <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-300">
                                                        Valor
                                                    </th>
                                                    <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">
                                                        Status
                                                    </th>
                                                    <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">
                                                        Usuario
                                                    </th>
                                                    <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">
                                                        Loja
                                                    </th>
                                                    <th className="px-3 py-2 text-center font-medium text-gray-600 dark:text-gray-300">
                                                        Acoes
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-white/60 dark:divide-gray-900/40">
                                                {boletos.data.map((boleto) => {
                                                    const visualState = getBoletoVisualState(boleto, todayIso);

                                                    return (
                                                        <tr
                                                            key={boleto.id}
                                                            className={`${visualState.rowClass} transition-colors`}
                                                        >
                                                            <td className="px-3 py-3 align-top">
                                                                <p className="font-semibold text-gray-900 dark:text-gray-100">
                                                                    {boleto.description}
                                                                </p>
                                                             </td>
                                                            <td className="px-3 py-3 align-top font-medium text-gray-700 dark:text-gray-200">
                                                                {formatDate(boleto.due_date)}
                                                            </td>
                                                            <td className="px-3 py-3 text-right align-top font-semibold text-gray-900 dark:text-white">
                                                                {formatCurrency(boleto.amount)}
                                                            </td>
                                                            <td className="px-3 py-3 align-top">
                                                                <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${visualState.badgeClass}`}>
                                                                    {visualState.label}
                                                                </span>
                                                            </td>
                                                            <td className="px-3 py-3 align-top text-gray-700 dark:text-gray-200">
                                                                {boleto.user?.name ?? '--'}
                                                            </td>
                                                            <td className="px-3 py-3 align-top text-gray-700 dark:text-gray-200">
                                                                {boleto.unit?.tb2_nome ?? '--'}
                                                            </td>
                                                            <td className="px-3 py-3 text-center align-top">
                                                                <div className="flex flex-wrap items-center justify-center gap-2">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => openDetails(boleto)}
                                                                        className="rounded-lg border border-sky-300 px-3 py-1 text-xs font-semibold text-sky-700 transition hover:bg-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-200 dark:border-sky-500/60 dark:text-sky-200 dark:hover:bg-sky-900/30"
                                                                    >
                                                                        Detalhes
                                                                    </button>
                                                                    <a
                                                                        href={buildWhatsAppLink(boleto)}
                                                                        target="_blank"
                                                                        rel="noreferrer"
                                                                        aria-label={`Enviar boleto ${boleto.description} por WhatsApp`}
                                                                        title="Enviar por WhatsApp"
                                                                        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-emerald-300 text-emerald-600 transition hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-200 dark:border-emerald-500/60 dark:text-emerald-300 dark:hover:bg-emerald-900/30"
                                                                    >
                                                                        <i className="bi bi-whatsapp text-base" aria-hidden="true"></i>
                                                                    </a>
                                                                    {canManageList && !boleto.is_paid && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handlePay(boleto.id)}
                                                                            className="rounded-lg border border-emerald-300 px-3 py-1 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-200 dark:border-emerald-500/60 dark:text-emerald-200 dark:hover:bg-emerald-900/30"
                                                                        >
                                                                            Dar baixa
                                                                        </button>
                                                                    )}
                                                                    {canManageList && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleEdit(boleto)}
                                                                            className="rounded-lg border border-amber-300 px-3 py-1 text-xs font-semibold text-amber-700 transition hover:bg-amber-50 focus:outline-none focus:ring-2 focus:ring-amber-200 dark:border-amber-500/60 dark:text-amber-200 dark:hover:bg-amber-900/30"
                                                                        >
                                                                            Editar
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    ) : (
                                        <p className="rounded-xl border border-dashed border-gray-200 px-4 py-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-300">
                                            Nenhum boleto encontrado para o filtro aplicado.
                                        </p>
                                    )}
                                </div>

                                {boletos?.links && (
                                    <div className="mt-4 flex flex-wrap items-center justify-center gap-1 text-xs">
                                        {boletos.links.map((link, index) => (
                                            <button
                                                key={`${link.label}-${index}`}
                                                type="button"
                                                disabled={!link.url}
                                                onClick={() =>
                                                    link.url &&
                                                    router.visit(link.url, {
                                                        preserveState: true,
                                                        preserveScroll: true,
                                                        replace: true,
                                                    })
                                                }
                                                className={`rounded-full border px-3 py-1 font-semibold transition ${
                                                    link.active
                                                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:border-indigo-500/70 dark:bg-indigo-900/30 dark:text-indigo-200'
                                                        : 'border-gray-200 bg-white text-gray-600 hover:border-indigo-300 hover:text-indigo-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200'
                                                }`}
                                            >
                                                <span dangerouslySetInnerHTML={{ __html: link.label }} />
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="rounded-2xl bg-white p-6 shadow dark:bg-gray-800">
                            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                                        Boletos gravados hoje
                                    </h3>
                                    <p className="text-sm text-gray-500 dark:text-gray-300">
                                        Aqui aparecem os boletos que voce cadastrou no dia corrente.
                                    </p>
                                </div>
                                <span className="text-xs font-semibold text-gray-500 dark:text-gray-300">
                                    {visibleTodayUserBoletos.length} registro(s)
                                </span>
                            </div>

                            <div className="overflow-x-auto">
                                {visibleTodayUserBoletos.length ? (
                                    <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-700">
                                        <thead className="bg-gray-50 dark:bg-gray-900/40">
                                            <tr>
                                                <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">
                                                    Descricao
                                                </th>
                                                <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">
                                                    Vencimento
                                                </th>
                                                <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-300">
                                                    Valor
                                                </th>
                                                <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">
                                                    Loja
                                                </th>
                                                <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">
                                                    Gravado em
                                                </th>
                                                <th className="px-3 py-2 text-center font-medium text-gray-600 dark:text-gray-300">
                                                    Acoes
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-white/60 dark:divide-gray-900/40">
                                            {visibleTodayUserBoletos.map((boleto) => {
                                                const visualState = getBoletoVisualState(boleto, todayIso);

                                                return (
                                                    <tr
                                                        key={boleto.id}
                                                        className={`${visualState.rowClass} transition-colors`}
                                                    >
                                                        <td className="px-3 py-3 align-top">
                                                            <p className="font-semibold text-gray-900 dark:text-gray-100">
                                                                {boleto.description}
                                                            </p>
                                                        </td>
                                                        <td className="px-3 py-3 align-top font-medium text-gray-700 dark:text-gray-200">
                                                            {formatDate(boleto.due_date)}
                                                        </td>
                                                        <td className="px-3 py-3 text-right align-top font-semibold text-gray-900 dark:text-white">
                                                            {formatCurrency(boleto.amount)}
                                                        </td>
                                                        <td className="px-3 py-3 align-top font-medium text-gray-700 dark:text-gray-200">
                                                            {boleto.unit?.tb2_nome ?? '--'}
                                                        </td>
                                                        <td className="px-3 py-3 align-top font-medium text-gray-700 dark:text-gray-200">
                                                            {formatDateTime(boleto.created_at)}
                                                        </td>
                                                        <td className="px-3 py-3">
                                                            <div className="flex justify-center">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => openDetails(boleto)}
                                                                    className="rounded-lg border border-indigo-300 px-3 py-1 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-indigo-500/60 dark:text-indigo-200 dark:hover:bg-indigo-900/30"
                                                                >
                                                                    Detalhes
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                ) : (
                                    <p className="rounded-xl border border-dashed border-gray-200 px-4 py-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-300">
                                        Nenhum boleto foi gravado por voce hoje.
                                    </p>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {selectedBoleto && (
                <Modal show={showDetails} onClose={closeDetails} maxWidth="xl" tone="light">
                    <div className="bg-white p-6 text-gray-900 dark:bg-gray-900 dark:text-gray-50">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <p className="text-xs uppercase tracking-wide text-indigo-600 dark:text-indigo-300">
                                    Boleto
                                </p>
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-50">
                                    {selectedBoleto.description}
                                </h3>
                                <p className="text-sm text-gray-500 dark:text-gray-300">
                                    #{selectedBoleto.id}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={closeDetails}
                                className="rounded-full border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                            >
                                Fechar
                            </button>
                        </div>

                        <div className="mt-6 grid gap-4 sm:grid-cols-2">
                            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-800/60">
                                <p className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                                    Valor
                                </p>
                                <p className="text-lg font-bold text-gray-900 dark:text-gray-50">
                                    {formatCurrency(selectedBoleto.amount)}
                                </p>
                            </div>
                            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-800/60">
                                <p className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                                    Vencimento
                                </p>
                                <p className="text-lg font-semibold text-gray-900 dark:text-gray-50">
                                    {formatDate(selectedBoleto.due_date)}
                                </p>
                            </div>
                            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-800/60">
                                <p className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                                    Status
                                </p>
                                <span className={`mt-2 inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${getBoletoVisualState(selectedBoleto, todayIso).badgeClass}`}>
                                    {getBoletoVisualState(selectedBoleto, todayIso).label}
                                </span>
                            </div>
                            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-800/60">
                                <p className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                                    Loja
                                </p>
                                <p className="text-sm font-semibold text-gray-900 dark:text-gray-50">
                                    {selectedBoleto.unit?.tb2_nome ?? '--'}
                                </p>
                            </div>
                            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-800/60">
                                <p className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                                    Criado por
                                </p>
                                <p className="text-sm font-semibold text-gray-900 dark:text-gray-50">
                                    {selectedBoleto.user?.name ?? '--'}
                                </p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                    {formatDateTime(selectedBoleto.created_at)}
                                </p>
                            </div>
                            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-800/60">
                                <p className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                                    Pagamento
                                </p>
                                {selectedBoleto.is_paid ? (
                                    <>
                                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-50">
                                            {getPaidByName(selectedBoleto)}
                                        </p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">
                                            {formatDateTime(selectedBoleto.paid_at)}
                                        </p>
                                    </>
                                ) : (
                                    <p className="text-sm text-gray-600 dark:text-gray-300">Nao pago</p>
                                )}
                            </div>
                        </div>

                        <div className="mt-6 grid gap-4">
                            <div className="rounded-xl border border-dashed border-gray-200 bg-white/60 p-4 dark:border-gray-800 dark:bg-gray-800/40">
                                <p className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                                    Codigo de barras
                                </p>
                                {hasBarcodeValue(selectedBoleto.barcode) ? (
                                    <button
                                        type="button"
                                        onClick={openBarcodeModal}
                                        className="mt-3 block w-full text-left focus:outline-none focus:ring-2 focus:ring-indigo-300"
                                    >
                                        <BoletoBarcode value={selectedBoleto.barcode} compact />
                                        <p className="mt-2 text-xs font-medium text-indigo-600 dark:text-indigo-300">
                                            Clique para ampliar o codigo de barras.
                                        </p>
                                    </button>
                                ) : (
                                    <div className="mt-3">
                                        <BoletoBarcode value={selectedBoleto.barcode} compact />
                                    </div>
                                )}
                                <p className="mt-2 select-all break-all text-sm text-gray-900 dark:text-gray-100">
                                    {hasBarcodeValue(selectedBoleto.barcode) ? selectedBoleto.barcode : 'Nao informado'}
                                </p>
                            </div>
                            <div className="rounded-xl border border-dashed border-gray-200 bg-white/60 p-4 dark:border-gray-800 dark:bg-gray-800/40">
                                <p className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                                    Linha digitavel
                                </p>
                                <p className="mt-2 select-all break-all text-sm text-gray-900 dark:text-gray-100">
                                    {selectedBoleto.digitable_line}
                                </p>
                            </div>
                        </div>
                    </div>
                </Modal>
            )}

            {selectedBoleto && (
                <Modal show={showBarcodeModal} onClose={closeBarcodeModal} maxWidth="2xl" tone="light">
                    <div className="bg-white p-6 text-gray-900 dark:bg-gray-900 dark:text-gray-50">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <p className="text-xs uppercase tracking-wide text-indigo-600 dark:text-indigo-300">
                                    Codigo de barras ampliado
                                </p>
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-50">
                                    {selectedBoleto.description}
                                </h3>
                                <p className="text-sm text-gray-500 dark:text-gray-300">
                                    #{selectedBoleto.id}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={closeBarcodeModal}
                                className="rounded-full border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                            >
                                Fechar
                            </button>
                        </div>

                        <div className="mt-6 rounded-xl border border-dashed border-gray-200 bg-white/60 p-4 dark:border-gray-800 dark:bg-gray-800/40">
                            <BoletoBarcode value={selectedBoleto.barcode} />
                            <p className="mt-3 select-all break-all text-sm text-gray-900 dark:text-gray-100">
                                {selectedBoleto.barcode}
                            </p>
                        </div>
                    </div>
                </Modal>
            )}

            <Modal show={showBatchBarcodeModal} onClose={closeBatchBarcodeModal} maxWidth="4xl" tone="light">
                <div className="bg-white p-6 text-gray-900 dark:bg-gray-900 dark:text-gray-50">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <p className="text-xs uppercase tracking-wide text-indigo-600 dark:text-indigo-300">
                                Codigos de barras
                            </p>
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-50">
                                Resultado atual da pesquisa
                            </h3>
                            <p className="text-sm text-gray-500 dark:text-gray-300">
                                {visibleBoletos.length} boleto(s) carregado(s) nesta pagina.
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center justify-end gap-2">
                            <button
                                type="button"
                                onClick={handlePrintBatchBarcodes}
                                disabled={!visibleBoletos.length}
                                className="rounded-xl border border-emerald-300 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-200 disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-500/60 dark:text-emerald-200 dark:hover:bg-emerald-900/30"
                            >
                                Imprimir
                            </button>
                            <button
                                type="button"
                                onClick={closeBatchBarcodeModal}
                                className="rounded-full border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                            >
                                Fechar
                            </button>
                        </div>
                    </div>

                    <div className="mt-6 max-h-[75vh] space-y-4 overflow-y-auto pr-1">
                        {visibleBoletos.length ? (
                            visibleBoletos.map((boleto) => (
                                <div
                                    key={`batch-barcode-${boleto.id}`}
                                    className="rounded-2xl border border-dashed border-gray-200 bg-white/70 p-4 dark:border-gray-800 dark:bg-gray-800/40"
                                >
                                    <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                                        <div>
                                            <p className="text-base font-semibold text-gray-900 dark:text-gray-50">
                                                {boleto.description}
                                            </p>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                                #{boleto.id}
                                            </p>
                                        </div>
                                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600 dark:text-gray-300">
                                            <span>Vencimento: {formatDate(boleto.due_date)}</span>
                                            <span>Valor: {formatCurrency(boleto.amount)}</span>
                                        </div>
                                    </div>

                                    <BoletoBarcode value={boleto.barcode} />
                                </div>
                            ))
                        ) : (
                            <p className="rounded-xl border border-dashed border-gray-200 px-4 py-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-300">
                                Nenhum boleto carregado para exibir.
                            </p>
                        )}
                    </div>
                </div>
            </Modal>
        </AuthenticatedLayout>
    );
}
