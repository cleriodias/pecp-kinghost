import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { formatBrazilDateTime } from '@/Utils/date';
import { buildFiscalReceiptHtml, buildReceiptHtml } from '@/Utils/receipt';
import AlertMessage from '@/Components/Alert/AlertMessage';
import axios from 'axios';
import { Head, router, useForm, usePage } from '@inertiajs/react';
import { useEffect, useMemo, useState } from 'react';

const PAYMENT_LABELS = {
    dinheiro: 'Dinheiro',
    maquina: 'Maquina',
    vale: 'Vale',
    refeicao: 'Refeicao',
    faturar: 'Faturar',
};

const formatCurrency = (value) =>
    Number(value ?? 0).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });

const formatDateTime = (value) => {
    if (!value) {
        return '--';
    }

    return formatBrazilDateTime(value);
};

const buildQrCodeImageUrl = (value) => {
    const normalized = String(value ?? '').trim();

    if (normalized === '') {
        return null;
    }

    return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(normalized)}`;
};

const resolveErrorMessage = (error, fallback) => {
    if (error?.response?.data?.errors) {
        const first = Object.values(error.response.data.errors).flat()[0];
        if (first) {
            return String(first);
        }
    }

    if (error?.response?.data?.message) {
        return String(error.response.data.message);
    }

    if (error?.message) {
        return String(error.message);
    }

    return fallback;
};

export default function Hoje({
    records = [],
    reportDate,
    unit,
    filters = {},
    canManageFiscal = false,
    canDeleteReceipts = false,
}) {
    const { flash } = usePage().props;
    const { data, setData, get, processing } = useForm({
        cupom: filters.cupom ?? '',
        comanda: filters.comanda ?? '',
        valor: filters.valor ?? '',
        hora: filters.hora ?? '',
        fiscal: filters.fiscal ?? '',
    });
    const [selectedReceipt, setSelectedReceipt] = useState(null);
    const [selectedFiscalReceipt, setSelectedFiscalReceipt] = useState(null);
    const [printError, setPrintError] = useState('');
    const [deleteError, setDeleteError] = useState('');
    const [deletingReceiptId, setDeletingReceiptId] = useState(null);
    const [fiscalActionStatuses, setFiscalActionStatuses] = useState({});
    const [showFiscalGenerateMode, setShowFiscalGenerateMode] = useState(filters.fiscal === 'gerar');

    const totalValue = useMemo(
        () => records.reduce((sum, record) => sum + Number(record.total ?? 0), 0),
        [records],
    );
    const fiscalQrCodeImageUrl = useMemo(
        () => buildQrCodeImageUrl(selectedFiscalReceipt?.qr_code_data),
        [selectedFiscalReceipt],
    );

    useEffect(() => {
        setShowFiscalGenerateMode(filters.fiscal === 'gerar');
    }, [filters.fiscal]);

    const handleSubmit = (event) => {
        event.preventDefault();

        const params = {};

        if (data.cupom) {
            params.cupom = data.cupom;
        }
        if (data.comanda) {
            params.comanda = data.comanda;
        }
        if (data.valor) {
            params.valor = data.valor;
        }
        if (data.hora) {
            params.hora = data.hora;
        }
        if (data.fiscal) {
            params.fiscal = data.fiscal;
        }

        setShowFiscalGenerateMode(data.fiscal === 'gerar');

        get(route('reports.hoje'), {
            preserveState: true,
            preserveScroll: true,
            replace: true,
            data: params,
        });
    };

    const handleClear = () => {
        setShowFiscalGenerateMode(false);
        setData({
            cupom: '',
            comanda: '',
            valor: '',
            hora: '',
            fiscal: '',
        });

        get(route('reports.hoje'), {
            preserveState: true,
            preserveScroll: true,
            replace: true,
        });
    };

    const handleShowFiscalGenerate = () => {
        setShowFiscalGenerateMode(true);
        setData({
            cupom: '',
            comanda: '',
            valor: '',
            hora: '',
            fiscal: 'gerar',
        });

        get(route('reports.hoje'), {
            preserveState: true,
            preserveScroll: true,
            replace: true,
            data: {
                fiscal: 'gerar',
            },
        });
    };

    const handlePrint = (receipt) => {
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

    const handlePrintFiscal = (receipt) => {
        setPrintError('');

        if (!receipt) {
            setPrintError('Esta venda ainda nao possui cupom fiscal gerado.');
            return;
        }

        const printWindow = window.open('', '_blank', 'width=420,height=680');

        if (!printWindow) {
            setPrintError('Permita pop-ups para abrir o cupom fiscal.');
            return;
        }

        printWindow.document.write(buildFiscalReceiptHtml(receipt));
        printWindow.document.close();
        printWindow.focus();
        printWindow.print();
        printWindow.close();
    };

    const handleDeleteReceipt = async (receiptId) => {
        if (!canDeleteReceipts || deletingReceiptId) {
            return;
        }

        const confirmed = window.confirm(`Deseja realmente excluir o cupom #${receiptId}?`);
        if (!confirmed) {
            return;
        }

        setDeleteError('');
        setDeletingReceiptId(receiptId);

        try {
            await axios.delete(route('reports.sales.today.destroy', receiptId));

            if (Number(selectedReceipt?.id ?? 0) === Number(receiptId)) {
                setSelectedReceipt(null);
            }

            router.reload({
                only: ['records', 'reportDate', 'unit', 'filters', 'canManageFiscal', 'canDeleteReceipts'],
                preserveScroll: true,
                preserveState: true,
            });
        } catch (error) {
            setDeleteError(resolveErrorMessage(error, 'Nao foi possivel excluir o cupom.'));
        } finally {
            setDeletingReceiptId(null);
        }
    };

    const runFiscalAction = async (routeName, paymentId) => {
        setFiscalActionStatuses((current) => ({
            ...current,
            [paymentId]: {
                status: 'processing',
                message: 'Transacao iniciada',
            },
        }));

        try {
            const response = await axios.post(
                route(routeName, { payment: paymentId }),
                {},
                {
                    headers: {
                        Accept: 'application/json',
                    },
                },
            );

            setFiscalActionStatuses((current) => ({
                ...current,
                [paymentId]: {
                    status: response.data?.message_type === 'error' ? 'error' : 'success',
                    message: response.data?.message ?? 'Transacao fiscal concluida.',
                },
            }));
        } catch (error) {
            setFiscalActionStatuses((current) => ({
                ...current,
                [paymentId]: {
                    status: 'error',
                    message: resolveErrorMessage(error, 'Nao foi possivel iniciar a transacao fiscal.'),
                },
            }));
        }
    };

    const headerContent = (
        <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
                <h2 className="text-xl font-semibold leading-tight text-gray-800 dark:text-gray-200">
                    Hoje
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-300">
                    Reimpressao de cupons do dia da loja atual.
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-300">
                    Loja: {unit?.name ?? '---'}.
                </p>
            </div>
            <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-indigo-700 shadow-sm dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-200">
                <p className="text-[10px] font-semibold uppercase tracking-wide">
                    Data
                </p>
                <p className="text-sm font-bold">{reportDate ?? '--'}</p>
            </div>
        </div>
    );

    return (
        <AuthenticatedLayout header={headerContent}>
            <Head title="Hoje" />

            <div className="py-12">
                <div className="mx-auto max-w-6xl space-y-6 px-4 sm:px-6 lg:px-8">
                    {printError && (
                        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200">
                            {printError}
                        </div>
                    )}

                    {deleteError && (
                        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200">
                            {deleteError}
                        </div>
                    )}

                    <AlertMessage message={flash ?? {}} />

                    <form
                        onSubmit={handleSubmit}
                        className="rounded-2xl bg-white p-6 shadow dark:bg-gray-800"
                    >
                        <div className="flex flex-wrap items-end gap-3">
                            <div>
                                <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                    Cupom
                                </label>
                                <input
                                    type="number"
                                    min="1"
                                    value={data.cupom}
                                    onChange={(event) => setData('cupom', event.target.value)}
                                    placeholder="Numero do cupom"
                                    className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                    Comanda
                                </label>
                                <input
                                    type="number"
                                    min="1"
                                    value={data.comanda}
                                    onChange={(event) => setData('comanda', event.target.value)}
                                    placeholder="Numero da comanda"
                                    className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                    Valor
                                </label>
                                <input
                                    type="text"
                                    value={data.valor}
                                    onChange={(event) => setData('valor', event.target.value)}
                                    placeholder="0,00"
                                    className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                    Hora
                                </label>
                                <input
                                    type="time"
                                    value={data.hora}
                                    onChange={(event) => setData('hora', event.target.value)}
                                    className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={processing}
                                className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-700 disabled:opacity-60"
                            >
                                Buscar
                            </button>
                            <button
                                type="button"
                                onClick={handleClear}
                                disabled={processing}
                                className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 disabled:opacity-60 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                            >
                                Limpar
                            </button>
                            {canManageFiscal && (
                                <button
                                    type="button"
                                    onClick={handleShowFiscalGenerate}
                                    disabled={processing}
                                    className={`rounded-xl px-4 py-2 text-sm font-semibold shadow transition disabled:opacity-60 ${
                                        showFiscalGenerateMode
                                            ? 'bg-emerald-700 text-white hover:bg-emerald-800'
                                            : 'bg-emerald-600 text-white hover:bg-emerald-700'
                                    }`}
                                >
                                    Mostrar Gerar fiscal
                                </button>
                            )}
                        </div>
                        <p className="mt-3 text-sm text-gray-500 dark:text-gray-300">
                            {showFiscalGenerateMode
                                ? 'Mostrando todas as vendas de hoje da loja atual que ainda podem gerar fiscal.'
                                : 'A busca considera sempre os cupons de hoje da loja atual e retorna no maximo 10 registros.'}
                        </p>
                    </form>

                    <div className="rounded-2xl bg-white p-6 shadow dark:bg-gray-800">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex flex-wrap items-center gap-3">
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                                    {showFiscalGenerateMode ? 'Vendas para gerar fiscal' : 'Resultado da busca'}
                                </h3>
                            </div>
                            <div className="flex flex-wrap items-center gap-3">
                                <span className="text-xs font-semibold text-gray-500 dark:text-gray-300">
                                    {records.length} registros
                                </span>
                                <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-indigo-700 shadow-sm dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-200">
                                    <p className="text-[10px] font-semibold uppercase tracking-wide">
                                        Total
                                    </p>
                                    <p className="text-sm font-bold">{formatCurrency(totalValue)}</p>
                                </div>
                            </div>
                        </div>

                        <div className="mt-4 overflow-x-auto">
                            {records.length === 0 ? (
                                <p className="rounded-xl border border-dashed border-gray-200 px-4 py-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-300">
                                    {showFiscalGenerateMode
                                        ? 'Nenhuma venda de hoje nesta loja esta aguardando Gerar fiscal.'
                                        : 'Nenhum cupom encontrado com os filtros informados para hoje nesta loja.'}
                                </p>
                            ) : (
                                <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-700">
                                    <thead className="bg-gray-100 dark:bg-gray-900/60">
                                        <tr>
                                            <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">
                                                ID
                                            </th>
                                            <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">
                                                Data
                                            </th>
                                            <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">
                                                Hora
                                            </th>
                                            <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">
                                                Comanda
                                            </th>
                                            <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-300">
                                                Valor
                                            </th>
                                            <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-300">
                                                Cupons
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                        {records.map((record) => {
                                            const fiscalActionStatus = fiscalActionStatuses[record.id];
                                            const fiscalActionIsProcessing = fiscalActionStatus?.status === 'processing';
                                            const fiscalActionSucceeded = fiscalActionStatus?.status === 'success';

                                            return (
                                            <tr key={record.id}>
                                                <td className="px-3 py-2 text-gray-800 dark:text-gray-100">
                                                    {canDeleteReceipts ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleDeleteReceipt(record.id)}
                                                            disabled={deletingReceiptId === record.id}
                                                            className="font-bold text-red-600 transition hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                                                        >
                                                            #{record.id}
                                                        </button>
                                                    ) : (
                                                        <span>#{record.id}</span>
                                                    )}
                                                </td>
                                                <td className="px-3 py-2 text-gray-700 dark:text-gray-200">
                                                    {record.date ?? '--'}
                                                </td>
                                                <td className="px-3 py-2 text-gray-700 dark:text-gray-200">
                                                    {record.time ?? '--'}
                                                </td>
                                                <td className="px-3 py-2 text-gray-700 dark:text-gray-200">
                                                    {record.comanda || '--'}
                                                </td>
                                                <td className="px-3 py-2 text-right font-semibold text-gray-900 dark:text-white">
                                                    {formatCurrency(record.total)}
                                                </td>
                                                <td className="px-3 py-2 text-right">
                                                    <div className="flex justify-end gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => setSelectedReceipt(record.receipt)}
                                                            className="rounded-xl bg-indigo-600 px-3 py-1 text-xs font-semibold text-white shadow hover:bg-indigo-700"
                                                        >
                                                            Nao Fiscal
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setSelectedFiscalReceipt(record.fiscal_receipt)}
                                                            disabled={!record.fiscal_receipt}
                                                            title={record.fiscal_receipt ? 'Abrir cupom fiscal' : 'Venda sem cupom fiscal gerado'}
                                                            className={`rounded-xl px-3 py-1 text-xs font-semibold text-white shadow ${
                                                                record.fiscal_receipt
                                                                    ? 'bg-emerald-600 hover:bg-emerald-700'
                                                                    : 'cursor-not-allowed bg-emerald-300 opacity-60'
                                                            }`}
                                                        >
                                                            Fiscal
                                                        </button>
                                                        {canManageFiscal && record.can_generate_fiscal && (
                                                            <button
                                                                type="button"
                                                                onClick={() => runFiscalAction(
                                                                    'reports.hoje.fiscal.generate-sign-missing',
                                                                    record.id,
                                                                )}
                                                                disabled={fiscalActionIsProcessing || fiscalActionSucceeded}
                                                                className="rounded-xl bg-emerald-600 px-3 py-1 text-xs font-semibold text-white shadow hover:bg-emerald-700 disabled:cursor-wait disabled:opacity-60"
                                                            >
                                                                {fiscalActionIsProcessing
                                                                    ? 'Transacao iniciada'
                                                                    : fiscalActionSucceeded
                                                                        ? 'Fiscal gerada'
                                                                        : 'Gerar fiscal'}
                                                            </button>
                                                        )}
                                                        {canManageFiscal && record.can_regenerate_fiscal && (
                                                            <button
                                                                type="button"
                                                                onClick={() => runFiscalAction(
                                                                    'reports.hoje.fiscal.regenerate-error',
                                                                    record.id,
                                                                )}
                                                                disabled={fiscalActionIsProcessing || fiscalActionSucceeded}
                                                                className="rounded-xl bg-amber-500 px-3 py-1 text-xs font-semibold text-white shadow hover:bg-amber-600 disabled:cursor-wait disabled:opacity-60"
                                                            >
                                                                {fiscalActionIsProcessing
                                                                    ? 'Transacao iniciada'
                                                                    : fiscalActionSucceeded
                                                                        ? 'Regenerada'
                                                                        : 'Regenerar erro'}
                                                            </button>
                                                        )}
                                                    </div>
                                                    {fiscalActionStatus?.message && (
                                                        <p className={`mt-2 text-xs font-semibold ${
                                                            fiscalActionStatus.status === 'error'
                                                                ? 'text-rose-600 dark:text-rose-300'
                                                                : 'text-emerald-600 dark:text-emerald-300'
                                                        }`}>
                                                            {fiscalActionStatus.message}
                                                        </p>
                                                    )}
                                                </td>
                                            </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {selectedReceipt && (
                <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-4 py-6">
                    <div className="flex max-h-[calc(100vh-3rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-900">
                        <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-6 py-4 dark:border-gray-700">
                            <div>
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                                    Cupom Nao Fiscal #{selectedReceipt.id}
                                </h3>
                                <p className="text-sm text-gray-500 dark:text-gray-300">
                                    {formatDateTime(selectedReceipt.date_time)}
                                </p>
                                <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                                    Loja: {selectedReceipt.unit_name ?? '---'}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setSelectedReceipt(null)}
                                className="text-sm font-semibold text-gray-500 hover:text-gray-800 dark:text-gray-300 dark:hover:text-white"
                            >
                                Fechar
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto px-6 py-4">
                            <div className="space-y-2 text-sm text-gray-700 dark:text-gray-200">
                                <p>
                                    <span className="font-medium">Pagamento:</span>{' '}
                                    {PAYMENT_LABELS[selectedReceipt.tipo_pago] ?? selectedReceipt.tipo_pago}
                                </p>
                                <p>
                                    <span className="font-medium">Caixa:</span> {selectedReceipt.cashier_name}
                                </p>
                                {selectedReceipt.vale_user_name && (
                                    <p>
                                        <span className="font-medium">Cliente Vale:</span> {selectedReceipt.vale_user_name}
                                        {selectedReceipt.vale_type === 'refeicao' && (
                                            <span className="ml-1 text-xs text-amber-600 dark:text-amber-200">
                                                (Refeicao)
                                            </span>
                                        )}
                                    </p>
                                )}
                                <p className="text-lg font-bold text-indigo-600">
                                    Total: {formatCurrency(selectedReceipt.total)}
                                </p>
                            </div>

                            <div className="mt-6 rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/40">
                                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                                    Itens
                                </h4>
                                <div className="mt-3 space-y-3 text-sm">
                                    {(selectedReceipt.items || []).map((item) => (
                                        <div
                                            key={item.id}
                                            className="flex items-center justify-between rounded-xl bg-white/80 px-3 py-2 shadow-sm dark:bg-gray-800/70"
                                        >
                                            <div>
                                                <p className="font-medium text-gray-900 dark:text-gray-100">
                                                    {item.quantity}x {item.product_name}
                                                </p>
                                                <p className="text-xs text-gray-500 dark:text-gray-300">
                                                    {formatCurrency(item.unit_price)} cada
                                                </p>
                                                {item.comanda && (
                                                    <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                                                        Comanda: {item.comanda}
                                                    </p>
                                                )}
                                            </div>
                                            <p className="font-semibold text-gray-900 dark:text-gray-100">
                                                {formatCurrency(item.subtotal)}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4 dark:border-gray-700">
                            <button
                                type="button"
                                onClick={() => setSelectedReceipt(null)}
                                className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
                            >
                                Fechar
                            </button>
                            <button
                                type="button"
                                onClick={() => handlePrint(selectedReceipt)}
                                className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-700"
                            >
                                Imprimir Nao Fiscal
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {selectedFiscalReceipt && (
                <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-4 py-6">
                    <div className="flex max-h-[calc(100vh-3rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-900">
                        <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-6 py-4 dark:border-gray-700">
                            <div>
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                                    {selectedFiscalReceipt.model_label ?? 'Documento Fiscal'}
                                </h3>
                                <p className="text-sm text-gray-500 dark:text-gray-300">
                                    {formatDateTime(selectedFiscalReceipt.issued_at)}
                                </p>
                                <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                                    Loja: {selectedFiscalReceipt.emitter_name ?? '---'}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setSelectedFiscalReceipt(null)}
                                className="text-sm font-semibold text-gray-500 hover:text-gray-800 dark:text-gray-300 dark:hover:text-white"
                            >
                                Fechar
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto px-6 py-4">
                            <div className="space-y-2 text-sm text-gray-700 dark:text-gray-200">
                                <p>
                                    <span className="font-medium">Tipo:</span>{' '}
                                    {selectedFiscalReceipt.consumer_type === 'cupom_fiscal'
                                        ? 'Cupom Fiscal'
                                        : selectedFiscalReceipt.consumer_type === 'consumidor'
                                            ? 'NF Consumidor'
                                            : 'NF Balcao'}
                                </p>
                                <p>
                                    <span className="font-medium">Pagamento:</span>{' '}
                                    {selectedFiscalReceipt.payment_label ?? '--'}
                                </p>
                                <p>
                                    <span className="font-medium">Numero:</span>{' '}
                                    {selectedFiscalReceipt.number ?? '--'}
                                </p>
                                <p>
                                    <span className="font-medium">Serie:</span>{' '}
                                    {selectedFiscalReceipt.serie ?? '--'}
                                </p>
                                <p>
                                    <span className="font-medium">Status:</span>{' '}
                                    {selectedFiscalReceipt.status ?? '--'}
                                </p>
                                {selectedFiscalReceipt.consumer_name && (
                                    <p>
                                        <span className="font-medium">Consumidor:</span>{' '}
                                        {selectedFiscalReceipt.consumer_name}
                                    </p>
                                )}
                                {selectedFiscalReceipt.consumer_document && (
                                    <p>
                                        <span className="font-medium">Documento:</span>{' '}
                                        {selectedFiscalReceipt.consumer_document}
                                    </p>
                                )}
                                {selectedFiscalReceipt.access_key && (
                                    <p className="break-all">
                                        <span className="font-medium">Chave:</span>{' '}
                                        {selectedFiscalReceipt.access_key}
                                    </p>
                                )}
                                <p className="text-lg font-bold text-emerald-600">
                                    Total: {formatCurrency(selectedFiscalReceipt.total)}
                                </p>
                            </div>

                            {selectedFiscalReceipt.is_preview && (
                                <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-400/40 dark:bg-amber-900/20 dark:text-amber-100">
                                    Documento fiscal em preparo. Status atual: {selectedFiscalReceipt.status_message || selectedFiscalReceipt.status || 'pendente'}.
                                </div>
                            )}

                            {(fiscalQrCodeImageUrl || selectedFiscalReceipt.consulta_url) && (
                                <div className="mt-6 rounded-2xl border border-gray-100 bg-gray-50 p-4 text-center dark:border-gray-700 dark:bg-gray-900/40">
                                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                                        QRCode / Consulta
                                    </h4>
                                    {fiscalQrCodeImageUrl && (
                                        <div className="mt-3 flex justify-center">
                                            <img
                                                src={fiscalQrCodeImageUrl}
                                                alt="QRCode da consulta fiscal"
                                                className="h-52 w-52 rounded-xl border border-gray-200 bg-white p-2 shadow-sm dark:border-gray-700"
                                            />
                                        </div>
                                    )}
                                    {selectedFiscalReceipt.consulta_url && (
                                        <a
                                            href={selectedFiscalReceipt.consulta_url}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="mt-3 inline-flex break-all text-xs font-semibold text-emerald-700 hover:text-emerald-800 dark:text-emerald-300 dark:hover:text-emerald-200"
                                        >
                                            {selectedFiscalReceipt.consulta_url}
                                        </a>
                                    )}
                                </div>
                            )}

                            <div className="mt-6 rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/40">
                                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                                    Itens
                                </h4>
                                <div className="mt-3 space-y-3 text-sm">
                                    {(selectedFiscalReceipt.items || []).map((item, index) => (
                                        <div
                                            key={item.id ?? `fiscal-item-${index}`}
                                            className="flex items-center justify-between rounded-xl bg-white/80 px-3 py-2 shadow-sm dark:bg-gray-800/70"
                                        >
                                            <div>
                                                <p className="font-medium text-gray-900 dark:text-gray-100">
                                                    {item.quantity}x {item.product_name}
                                                </p>
                                                <p className="text-xs text-gray-500 dark:text-gray-300">
                                                    {formatCurrency(item.unit_price)} cada
                                                </p>
                                            </div>
                                            <p className="font-semibold text-gray-900 dark:text-gray-100">
                                                {formatCurrency(item.subtotal)}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4 dark:border-gray-700">
                            <button
                                type="button"
                                onClick={() => setSelectedFiscalReceipt(null)}
                                className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
                            >
                                Fechar
                            </button>
                            <button
                                type="button"
                                onClick={() => handlePrintFiscal(selectedFiscalReceipt)}
                                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-700"
                            >
                                Imprimir Fiscal
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </AuthenticatedLayout>
    );
}
