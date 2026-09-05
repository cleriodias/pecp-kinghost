import AlertMessage from '@/Components/Alert/AlertMessage';
import PrimaryButton from '@/Components/Button/PrimaryButton';
import InputError from '@/Components/InputError';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { buildFiscalReceiptHtml, formatReceiptCurrency } from '@/Utils/receipt';
import { Head, Link, router, useForm, usePage } from '@inertiajs/react';
import { useEffect, useState } from 'react';

const STATUS_CLASS = {
    pendente_configuracao: 'border-amber-200 bg-amber-50 text-amber-800',
    erro_validacao: 'border-rose-200 bg-rose-50 text-rose-800',
    erro_transmissao: 'border-rose-200 bg-rose-50 text-rose-800',
    pendente_emissao: 'border-blue-200 bg-blue-50 text-blue-800',
    xml_assinado: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    emitida: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    cancelada: 'border-slate-200 bg-slate-100 text-slate-700',
};

const STATUS_LABEL = {
    pendente_configuracao: 'Pendente configuracao',
    erro_validacao: 'Erro de validacao',
    erro_transmissao: 'Erro de transmissao',
    pendente_emissao: 'Pendente emissao',
    xml_assinado: 'XML assinado',
    emitida: 'Emitida',
    cancelada: 'Cancelada',
};

const EMITTER_FIELDS = [
    ['tb26_razao_social', 'Razao social'],
    ['tb26_nome_fantasia', 'Nome fantasia'],
    ['tb26_ie', 'Inscricao estadual'],
    ['tb26_im', 'Inscricao municipal'],
    ['tb26_cnae', 'CNAE'],
    ['tb26_email', 'Email fiscal'],
    ['tb26_telefone', 'Telefone'],
    ['tb26_cep', 'CEP'],
    ['tb26_logradouro', 'Logradouro', 'xl:col-span-2'],
    ['tb26_numero', 'Numero'],
    ['tb26_complemento', 'Complemento'],
    ['tb26_bairro', 'Bairro'],
    ['tb26_codigo_municipio', 'Codigo municipio IBGE'],
    ['tb26_municipio', 'Municipio'],
    ['tb26_uf', 'UF'],
];

const buildFiscalFormData = (configuration = {}, selectedUnitId = null) => ({
    tb2_id: configuration?.tb2_id ?? selectedUnitId ?? '',
    tb26_emitir_nfe: Boolean(configuration?.tb26_emitir_nfe),
    tb26_emitir_nfce: Boolean(configuration?.tb26_emitir_nfce),
    tb26_geracao_automatica_ativa: configuration?.tb26_geracao_automatica_ativa ?? false,
    tb26_ambiente: configuration?.tb26_ambiente ?? 'homologacao',
    tb26_serie: configuration?.tb26_serie ?? '1',
    tb26_proximo_numero: configuration?.tb26_proximo_numero ?? 1,
    tb26_crt: configuration?.tb26_crt ?? '',
    tb26_csc_id: configuration?.tb26_csc_id ?? '',
    tb26_csc: configuration?.tb26_csc ?? '',
    tb26_certificado_tipo: configuration?.tb26_certificado_tipo ?? 'A1',
    tb26_certificado_nome: configuration?.tb26_certificado_nome ?? '',
    tb26_certificado_cnpj: configuration?.tb26_certificado_cnpj ?? '',
    tb26_certificado_arquivo_upload: null,
    tb26_certificado_senha: '',
    remover_certificado: false,
    tb26_razao_social: configuration?.tb26_razao_social ?? '',
    tb26_nome_fantasia: configuration?.tb26_nome_fantasia ?? '',
    tb26_ie: configuration?.tb26_ie ?? '',
    tb26_im: configuration?.tb26_im ?? '',
    tb26_cnae: configuration?.tb26_cnae ?? '',
    tb26_logradouro: configuration?.tb26_logradouro ?? '',
    tb26_numero: configuration?.tb26_numero ?? '',
    tb26_complemento: configuration?.tb26_complemento ?? '',
    tb26_bairro: configuration?.tb26_bairro ?? '',
    tb26_codigo_municipio: configuration?.tb26_codigo_municipio ?? '',
    tb26_municipio: configuration?.tb26_municipio ?? '',
    tb26_uf: configuration?.tb26_uf ?? '',
    tb26_cep: configuration?.tb26_cep ?? '',
    tb26_telefone: configuration?.tb26_telefone ?? '',
    tb26_email: configuration?.tb26_email ?? '',
});

const amountNeededTodayForDailyLimit = (store) => {
    const dailyLimit = Number(store?.tax_daily_limit ?? 0);

    if (dailyLimit <= 0) {
        return null;
    }

    const issuedTodayTotal = Number(store?.monthly_issued_today_total ?? 0);

    return Math.max(0, dailyLimit - issuedTodayTotal);
};

const badgeClassName = (status) =>
    `inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${
        STATUS_CLASS[status] ?? STATUS_CLASS.pendente_configuracao
    }`;

const inputClassName =
    'mt-2 block w-full rounded-2xl border border-gray-300 px-4 py-3 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100';

const fiscalSectionClassName = 'rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-gray-800';
const fiscalPanelClassName = 'rounded-[24px] border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-900/40';
const fiscalFieldClassName =
    'mt-2 block h-12 w-full rounded-[18px] border border-slate-200 bg-white px-4 text-sm text-slate-900 shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-600 dark:bg-gray-700 dark:text-gray-100';
const fiscalFileInputClassName =
    'mt-2 block w-full rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-600 dark:bg-gray-700 dark:text-gray-100 file:mr-4 file:rounded-full file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-blue-700 dark:file:bg-blue-500/10 dark:file:text-blue-200';

const FiscalSectionHeader = ({ title, description }) => (
    <div className="flex flex-col gap-1">
        <h3 className="text-[1.35rem] font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            {title}
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-300">
            {description}
        </p>
    </div>
);

const UnitCard = ({ unit }) => (
    <div className={`${fiscalSectionClassName} h-full`}>
        <div className="flex h-full flex-col gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-300">
                Unidade
            </p>
            <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                {unit?.name ?? 'Unidade'}
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-300">
                CNPJ base da unidade: {unit?.cnpj ?? '--'}
            </p>
            <div className="mt-auto rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-200">
                <p className="font-medium text-slate-700 dark:text-slate-100">Endereco cadastrado na unidade</p>
                <p className="mt-1 break-words">{unit?.endereco ?? '--'}</p>
            </div>
        </div>
    </div>
);

const CertificateSummaryCard = ({ unit, configuration, resolvedEndpoints }) => (
    <div className="h-full rounded-[28px] border border-blue-100 bg-blue-50 p-5 shadow-sm dark:border-blue-500/20 dark:bg-blue-500/10">
        <div className="flex h-full flex-col gap-2 text-sm text-blue-900 dark:text-blue-100">
            <p className="text-xs font-semibold uppercase tracking-[0.18em]">Associacao loja e certificado</p>
            <p>Loja: {unit?.name ?? '--'}</p>
            <p>CNPJ da loja: {unit?.cnpj ?? '--'}</p>
            <p>Nome do certificado: {configuration?.tb26_certificado_nome || '--'}</p>
            <p>CNPJ do certificado: {configuration?.tb26_certificado_cnpj || '--'}</p>
            <p>Validade do certificado: {configuration?.tb26_certificado_valido_ate || '--'}</p>
            <p>Arquivo vinculado: {configuration?.tb26_certificado_arquivo || '--'}</p>
            <p>Endpoint envio NFC-e: {resolvedEndpoints?.authorization || resolvedEndpoints?.error || '--'}</p>
            <p>WSDL autorizacao NFC-e: {resolvedEndpoints?.authorization_wsdl || '--'}</p>
        </div>
    </div>
);

const DiagnosticsCard = ({ diagnostics }) => {
    if (!diagnostics) {
        return null;
    }

    const statusClassName =
        diagnostics.password_decryptable === false
            ? 'text-rose-700 dark:text-rose-200'
            : diagnostics.password_decryptable === true
              ? 'text-emerald-700 dark:text-emerald-200'
              : 'text-amber-700 dark:text-amber-200';

    return (
        <div className="h-full rounded-[28px] border border-slate-200 bg-slate-50 p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900/40">
            <div className="flex h-full flex-col gap-2 text-sm text-slate-800 dark:text-slate-100">
                <p className="text-xs font-semibold uppercase tracking-[0.18em]">Diagnostico do ambiente</p>
                <p>Unidade selecionada: {diagnostics.selected_unit_id ?? '--'}</p>
                <p>Configuracao encontrada no banco: {diagnostics.configuration_found ? 'Sim' : 'Nao'}</p>
                <p>ID da configuracao fiscal: {diagnostics.configuration_id ?? '--'}</p>
                <p>Configuracao crua encontrada no banco: {diagnostics.raw_configuration_found ? 'Sim' : 'Nao'}</p>
                <p>ID cru da configuracao fiscal: {diagnostics.raw_configuration_id ?? '--'}</p>
                <p>Caminho salvo do certificado: {diagnostics.storage_path || '--'}</p>
                <p>Arquivo existe no storage deste ambiente: {diagnostics.storage_exists ? 'Sim' : 'Nao'}</p>
                <p>Arquivo existe no caminho legado deste ambiente: {diagnostics.legacy_storage_exists ? 'Sim' : 'Nao'}</p>
                <p>Senha criptografada presente no banco: {diagnostics.raw_password_present ? 'Sim' : 'Nao'}</p>
                <p>Senha compartilhada presente no banco: {diagnostics.shared_password_present ? 'Sim' : 'Nao'}</p>
                <p>Fonte da senha lida neste ambiente: {diagnostics.password_source || '--'}</p>
                <p className={statusClassName}>Leitura da senha neste ambiente: {diagnostics.password_status || '--'}</p>
                {diagnostics.loading_error ? (
                    <p className="text-rose-700 dark:text-rose-200">Falha de carregamento: {diagnostics.loading_error}</p>
                ) : null}
            </div>
        </div>
    );
};

const actionButtonClassName =
    'inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold';

const INVOICE_FILTER_BUTTONS = [
    { key: 'all', label: 'Todas' },
    { key: 'error', label: 'Erro' },
    { key: 'signed', label: 'Assinada' },
    { key: 'issued', label: 'Emitida' },
];

const TrashIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M10 11v6" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M14 11v6" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
);

const InvoiceTable = ({
    invoices = [],
    selectedUnitId,
    invoiceStatusFilter = 'error',
    onDeleteInvoice,
    onPrintFiscalReceipt,
    onRegenerateInvoice,
    regeneratingInvoiceIds = [],
}) => (
    <section className="rounded-2xl bg-white p-6 shadow dark:bg-gray-800">
        <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex flex-col gap-1">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        Ultimas notas preparadas
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-300">
                        As vendas finalizadas passam a gerar um registro fiscal para preparacao e validacao.
                    </p>
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
                        Exibindo as ultimas 20 notas do filtro selecionado.
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    {INVOICE_FILTER_BUTTONS.map((filterOption) => {
                        const isActive = invoiceStatusFilter === filterOption.key;

                        return (
                            <button
                                key={filterOption.key}
                                type="button"
                                onClick={() => router.get(route('settings.fiscal'), {
                                    unit_id: selectedUnitId,
                                    invoice_status: filterOption.key,
                                }, {
                                    preserveState: true,
                                    preserveScroll: true,
                                    replace: true,
                                })}
                                className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                                    isActive
                                        ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-500/10 dark:text-blue-200'
                                        : 'border-gray-200 bg-white text-gray-600 hover:border-blue-300 hover:text-blue-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-blue-500/50 dark:hover:text-blue-200'
                                }`}
                            >
                                {filterOption.label}
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>

        {invoices.length === 0 ? (
            <p className="mt-4 rounded-2xl border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-300">
                Ainda nao existem notas preparadas para esta unidade.
            </p>
        ) : (
            <div className="mt-4 overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-700">
                    <thead className="bg-gray-100 dark:bg-gray-900/60">
                        <tr>
                            <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">Venda</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">Modelo</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">Numero</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">Status</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">Mensagem</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">Criada em</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">Cupom</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">Regenerar</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">XML</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">Transmissao</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">Excluir</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {invoices.map((invoice) => (
                            <tr key={invoice.id}>
                                <td className="px-3 py-3 text-gray-800 dark:text-gray-100">#{invoice.payment_id}</td>
                                <td className="px-3 py-3 text-gray-700 dark:text-gray-200">{String(invoice.modelo ?? '').toUpperCase()}</td>
                                <td className="px-3 py-3 text-gray-700 dark:text-gray-200">
                                    {invoice.serie ? `${invoice.serie}/${invoice.numero ?? '--'}` : '--'}
                                </td>
                                <td className="px-3 py-3">
                                    <span className={badgeClassName(invoice.status)}>
                                        {STATUS_LABEL[invoice.status] ?? invoice.status}
                                    </span>
                                </td>
                                <td className="px-3 py-3 text-gray-700 dark:text-gray-200">{invoice.mensagem ?? '--'}</td>
                                <td className="px-3 py-3 text-gray-700 dark:text-gray-200">{invoice.criada_em ?? '--'}</td>
                                <td className="px-3 py-3 text-gray-700 dark:text-gray-200">
                                    {invoice.fiscal_receipt ? (
                                        <button
                                            type="button"
                                            onClick={() => onPrintFiscalReceipt(invoice.fiscal_receipt)}
                                            className={`${actionButtonClassName} border-slate-200 bg-slate-50 text-slate-700`}
                                        >
                                            {`Cupom ${formatReceiptCurrency(invoice.total)}`}
                                        </button>
                                    ) : (
                                        '--'
                                    )}
                                </td>
                                <td className="px-3 py-3 text-gray-700 dark:text-gray-200">
                                    {invoice.pode_regenerar ? (
                                        <button
                                            type="button"
                                            onClick={() => onRegenerateInvoice?.(invoice.id)}
                                            disabled={regeneratingInvoiceIds.includes(invoice.id)}
                                            className={`${actionButtonClassName} border-amber-200 bg-amber-50 text-amber-700 disabled:cursor-wait disabled:opacity-60`}
                                        >
                                            {regeneratingInvoiceIds.includes(invoice.id) ? 'Regenerando...' : 'Regenerar nota'}
                                        </button>
                                    ) : (
                                        '--'
                                    )}
                                </td>
                                <td className="px-3 py-3 text-gray-700 dark:text-gray-200">
                                    {invoice.xml_disponivel ? (
                                        <a
                                            href={route('settings.fiscal.invoices.xml', { notaFiscal: invoice.id })}
                                            className={`${actionButtonClassName} border-blue-200 bg-blue-50 text-blue-700`}
                                        >
                                            Baixar XML
                                        </a>
                                    ) : (
                                        '--'
                                    )}
                                </td>
                                <td className="px-3 py-3 text-gray-700 dark:text-gray-200">
                                    {invoice.status === 'xml_assinado' ? (
                                        <Link
                                            href={route('settings.fiscal.invoices.transmit', { notaFiscal: invoice.id })}
                                            method="post"
                                            as="button"
                                            className={`${actionButtonClassName} border-emerald-200 bg-emerald-50 text-emerald-700`}
                                        >
                                            Transmitir
                                        </Link>
                                    ) : (
                                        '--'
                                    )}
                                </td>
                                <td className="px-3 py-3 text-gray-700 dark:text-gray-200">
                                    {invoice.pode_excluir ? (
                                        <button
                                            type="button"
                                            onClick={() => onDeleteInvoice(invoice)}
                                            className={`${actionButtonClassName} border-rose-200 bg-rose-50 text-rose-700`}
                                            title={`Excluir nota preparada da venda ${invoice.payment_id}`}
                                            aria-label={`Excluir nota preparada da venda ${invoice.payment_id}`}
                                        >
                                            <TrashIcon />
                                        </button>
                                    ) : (
                                        '--'
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        )}
    </section>
);

const FiscalConfigFormSection = ({
    configuration = {},
    selectedUnitId = null,
    invoices = [],
    invoiceStatusFilter = 'error',
    canActivateFiscalGeneration = false,
}) => {
    const [printError, setPrintError] = useState('');
    const [regeneratingInvoiceIds, setRegeneratingInvoiceIds] = useState([]);
    const { data, setData, post, processing, errors } = useForm(buildFiscalFormData(configuration, selectedUnitId));
    const fiscalGenerationEnabled = Boolean(data.tb26_geracao_automatica_ativa);
    const reprocess = useForm({
        tb2_id: selectedUnitId ?? '',
    });

    useEffect(() => {
        reprocess.setData('tb2_id', selectedUnitId ?? '');
    }, [reprocess.setData, selectedUnitId]);

    const handleSubmit = (event) => {
        event.preventDefault();
        post(route('settings.fiscal.update'), {
            preserveScroll: true,
            forceFormData: true,
        });
    };

    const handleReprocess = () => {
        reprocess.setData('tb2_id', selectedUnitId ?? '');
        reprocess.post(route('settings.fiscal.reprocess'), {
            preserveScroll: true,
        });
    };

    const handleToggleFiscalGeneration = () => {
        if (!fiscalGenerationEnabled && !canActivateFiscalGeneration) {
            return;
        }

        setData('tb26_geracao_automatica_ativa', !fiscalGenerationEnabled);
    };

    const handlePrintFiscalReceipt = (receipt) => {
        setPrintError('');

        if (!receipt) {
            setPrintError('Nao foi possivel montar os dados do cupom fiscal desta nota.');
            return;
        }

        const printWindow = window.open('', '_blank', 'width=400,height=600');

        if (!printWindow) {
            setPrintError('Permita pop-ups para imprimir o cupom.');
            return;
        }

        printWindow.document.write(buildFiscalReceiptHtml(receipt));
        printWindow.document.close();
    };

    const handleDeleteInvoice = (invoice) => {
        if (!invoice?.id) {
            return;
        }

        const confirmed = window.confirm(
            `Excluir a nota preparada da venda #${invoice.payment_id}? Esta acao remove apenas notas que ainda nao foram transmitidas.`
        );

        if (!confirmed) {
            return;
        }

        router.delete(route('settings.fiscal.invoices.destroy', { notaFiscal: invoice.id }), {
            preserveScroll: true,
        });
    };

    const handleRegenerateInvoice = (invoiceId) => {
        if (!invoiceId || regeneratingInvoiceIds.includes(invoiceId)) {
            return;
        }

        setRegeneratingInvoiceIds((current) => [...current, invoiceId]);

        router.post(route('settings.fiscal.invoices.regenerate', {
            notaFiscal: invoiceId,
            unit_id: selectedUnitId,
            invoice_status: invoiceStatusFilter,
        }), {}, {
            preserveScroll: true,
            onFinish: () => {
                setRegeneratingInvoiceIds((current) => current.filter((id) => id !== invoiceId));
            },
        });
    };

    return (
        <>
            {printError && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
                    {printError}
                </div>
            )}

            <form
                onSubmit={handleSubmit}
                className={`${fiscalSectionClassName} space-y-8`}
            >
                <InputError message={errors.tb2_id} className="mt-2" />

                <section className="space-y-4">
                    <FiscalSectionHeader
                        title="Emissao e numeracao"
                        description="Defina tipo de nota, ambiente e sequencia fiscal da unidade."
                    />

                    <div className="grid gap-6 xl:grid-cols-[minmax(260px,0.8fr)_minmax(0,1fr)]">
                        <div className={`${fiscalPanelClassName} flex flex-col justify-center`}>
                            <div className="space-y-4">
                                <label className="flex items-center gap-3 text-sm font-medium text-slate-700 dark:text-slate-100">
                                    <input
                                        type="checkbox"
                                        checked={Boolean(data.tb26_emitir_nfe)}
                                        onChange={(event) => setData('tb26_emitir_nfe', event.target.checked)}
                                        className="h-5 w-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    Emitir NF-e
                                </label>
                                <label className="flex items-center gap-3 text-sm font-medium text-slate-700 dark:text-slate-100">
                                    <input
                                        type="checkbox"
                                        checked={Boolean(data.tb26_emitir_nfce)}
                                        onChange={(event) => setData('tb26_emitir_nfce', event.target.checked)}
                                        className="h-5 w-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    Emitir NFC-e
                                </label>
                            </div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_120px_160px]">
                            <div>
                                <label className="text-sm font-medium text-slate-700 dark:text-slate-200">CRT</label>
                                <select
                                    value={data.tb26_crt}
                                    onChange={(event) => setData('tb26_crt', event.target.value)}
                                    className={fiscalFieldClassName}
                                >
                                    <option value="">Selecione</option>
                                    <option value="1">1 - Simples Nacional</option>
                                    <option value="2">2 - Simples excesso sublimite</option>
                                    <option value="3">3 - Regime normal</option>
                                </select>
                                <InputError message={errors.tb26_crt} className="mt-2" />
                            </div>

                            <div>
                                <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Ambiente</label>
                                <select
                                    value={data.tb26_ambiente}
                                    onChange={(event) => setData('tb26_ambiente', event.target.value)}
                                    className={fiscalFieldClassName}
                                >
                                    <option value="homologacao">Homologacao</option>
                                    <option value="producao">Producao</option>
                                </select>
                                <InputError message={errors.tb26_ambiente} className="mt-2" />
                            </div>

                            <div>
                                <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Serie</label>
                                <input
                                    type="text"
                                    value={data.tb26_serie}
                                    onChange={(event) => setData('tb26_serie', event.target.value)}
                                    className={fiscalFieldClassName}
                                />
                                <InputError message={errors.tb26_serie} className="mt-2" />
                            </div>

                            <div>
                                <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Proximo numero</label>
                                <input
                                    type="number"
                                    min="1"
                                    value={data.tb26_proximo_numero}
                                    onChange={(event) => setData('tb26_proximo_numero', event.target.value)}
                                    className={fiscalFieldClassName}
                                />
                                <InputError message={errors.tb26_proximo_numero} className="mt-2" />
                            </div>
                        </div>
                    </div>
                </section>

                <section className="space-y-4">
                    <FiscalSectionHeader
                        title="Credenciais fiscais"
                        description="Configure CSC para NFC-e e o certificado digital da unidade."
                    />

                    <div className="grid gap-4 xl:grid-cols-5">
                        <div>
                            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">CSC ID</label>
                            <input
                                type="text"
                                value={data.tb26_csc_id}
                                onChange={(event) => setData('tb26_csc_id', event.target.value)}
                                className={fiscalFieldClassName}
                            />
                            <InputError message={errors.tb26_csc_id} className="mt-2" />
                        </div>

                        <div className="xl:col-span-2">
                            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">CSC</label>
                            <input
                                type="text"
                                value={data.tb26_csc}
                                onChange={(event) => setData('tb26_csc', event.target.value)}
                                className={fiscalFieldClassName}
                            />
                            <InputError message={errors.tb26_csc} className="mt-2" />
                        </div>

                        <div>
                            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Tipo de certificado</label>
                            <select
                                value={data.tb26_certificado_tipo}
                                onChange={(event) => setData('tb26_certificado_tipo', event.target.value)}
                                className={fiscalFieldClassName}
                            >
                                <option value="A1">A1</option>
                                <option value="A3">A3</option>
                            </select>
                            <InputError message={errors.tb26_certificado_tipo} className="mt-2" />
                        </div>

                        <div>
                            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Nome do certificado</label>
                            <input
                                type="text"
                                value={data.tb26_certificado_nome}
                                onChange={(event) => setData('tb26_certificado_nome', event.target.value)}
                                className={fiscalFieldClassName}
                            />
                            <InputError message={errors.tb26_certificado_nome} className="mt-2" />
                        </div>

                        <div>
                            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">CNPJ do certificado</label>
                            <input
                                type="text"
                                value={data.tb26_certificado_cnpj}
                                onChange={(event) => setData('tb26_certificado_cnpj', event.target.value)}
                                className={fiscalFieldClassName}
                                placeholder="Somente o certificado desta loja"
                            />
                            <InputError message={errors.tb26_certificado_cnpj} className="mt-2" />
                        </div>

                        <div>
                            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Senha do certificado</label>
                            <input
                                type="password"
                                value={data.tb26_certificado_senha}
                                onChange={(event) => setData('tb26_certificado_senha', event.target.value)}
                                className={fiscalFieldClassName}
                                placeholder={configuration?.has_certificate_password ? 'Ja cadastrada' : ''}
                            />
                            <InputError message={errors.tb26_certificado_senha} className="mt-2" />
                        </div>

                        <div className="xl:col-span-2">
                            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Arquivo do certificado</label>
                            <input
                                type="file"
                                accept=".pfx,.p12"
                                onChange={(event) => setData('tb26_certificado_arquivo_upload', event.target.files?.[0] ?? null)}
                                className={fiscalFileInputClassName}
                            />
                            <InputError message={errors.tb26_certificado_arquivo_upload} className="mt-2" />
                        </div>
                    </div>

                    <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,0.7fr)_minmax(0,1fr)]">
                        <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/40">
                            <div className="flex flex-col gap-2 text-sm text-slate-700 dark:text-slate-200">
                                <span>Arquivo atual: {configuration?.tb26_certificado_arquivo || 'Nenhum certificado enviado'}</span>
                                <label className="flex items-center gap-3">
                                    <input
                                        type="checkbox"
                                        checked={Boolean(data.remover_certificado)}
                                        onChange={(event) => setData('remover_certificado', event.target.checked)}
                                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    Remover certificado atual
                                </label>
                            </div>
                        </div>

                        <section className="rounded-[22px] border border-dashed border-blue-200 bg-blue-50/70 p-4 text-sm text-blue-900 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-100">
                            <p className="font-semibold">Reprocessamento fiscal</p>
                            <p className="mt-1">
                                Use este botao depois de corrigir certificado, CSC ou cadastro fiscal dos produtos.
                            </p>
                            <div className="mt-4">
                                <PrimaryButton
                                    type="button"
                                    onClick={handleReprocess}
                                    disabled={reprocess.processing}
                                    className="w-full justify-center px-5 py-3 text-sm font-semibold normal-case tracking-normal"
                                >
                                    Reprocessar notas pendentes
                                </PrimaryButton>
                            </div>
                        </section>

                        <div className={`${fiscalPanelClassName} flex flex-col justify-between`}>
                            <label className="flex items-start justify-between gap-4">
                                <div className="space-y-1">
                                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                        Geracao automatica de notas fiscais
                                    </p>
                                    <p className="text-sm text-slate-500 dark:text-slate-300">
                                        Desligue para concluir vendas sem preparar nota fiscal automaticamente nesta loja.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleToggleFiscalGeneration}
                                    disabled={!fiscalGenerationEnabled && !canActivateFiscalGeneration}
                                    title={
                                        !fiscalGenerationEnabled && !canActivateFiscalGeneration
                                            ? 'Somente o master pode ligar a geracao automatica'
                                            : undefined
                                    }
                                    className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition ${
                                        fiscalGenerationEnabled ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'
                                    } ${
                                        !fiscalGenerationEnabled && !canActivateFiscalGeneration
                                            ? 'cursor-not-allowed opacity-70'
                                            : ''
                                    }`}
                                    aria-pressed={fiscalGenerationEnabled}
                                >
                                    <span className="sr-only">Alternar geracao automatica de notas fiscais</span>
                                    <span
                                        className={`inline-block h-6 w-6 transform rounded-full bg-white transition ${
                                            fiscalGenerationEnabled ? 'translate-x-7' : 'translate-x-1'
                                        }`}
                                    />
                                </button>
                            </label>
                            <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                                Status atual: {fiscalGenerationEnabled ? 'Ativa' : 'Desligada'}
                            </p>
                            <InputError message={errors.tb26_geracao_automatica_ativa} className="mt-2" />
                        </div>
                    </div>
                </section>

                <section className="space-y-4">
                    <FiscalSectionHeader
                        title="Dados do emitente"
                        description="Esses dados alimentam o XML fiscal da unidade emitente."
                    />

                    <div className="grid gap-x-4 gap-y-5 md:grid-cols-2 xl:grid-cols-4">
                        {EMITTER_FIELDS.map(([field, label, extraClass]) => (
                            <div key={field} className={extraClass ?? ''}>
                                <label className="text-sm font-medium text-slate-700 dark:text-slate-200">{label}</label>
                                <input
                                    type="text"
                                    value={data[field]}
                                    onChange={(event) => setData(field, event.target.value)}
                                    className={fiscalFieldClassName}
                                />
                                <InputError message={errors[field]} className="mt-2" />
                            </div>
                        ))}
                    </div>
                </section>

                <div className="flex justify-end">
                    <PrimaryButton
                        type="submit"
                        disabled={processing}
                        className="px-6 py-3 text-sm font-semibold normal-case tracking-normal"
                    >
                        Salvar configuracao fiscal
                    </PrimaryButton>
                </div>
            </form>

            <InvoiceTable
                invoices={invoices}
                selectedUnitId={selectedUnitId}
                invoiceStatusFilter={invoiceStatusFilter}
                onDeleteInvoice={handleDeleteInvoice}
                onPrintFiscalReceipt={handlePrintFiscalReceipt}
                onRegenerateInvoice={handleRegenerateInvoice}
                regeneratingInvoiceIds={regeneratingInvoiceIds}
            />
        </>
    );
};

export default function FiscalConfig({
    auth,
    units = [],
    selectedUnitId = null,
    unit = null,
    configuration = {},
    resolvedEndpoints = null,
    configurationDiagnostics = null,
    invoices = [],
    fiscalUnavailableMessage = null,
    invoiceLoadWarning = null,
    invoiceStatusFilter = 'error',
    canActivateFiscalGeneration = false,
}) {
    const { flash = {} } = usePage().props;
    const isMaster = Number(auth?.user?.funcao) === 0;
    const selectedUnit = units.find((store) => Number(store.id) === Number(selectedUnitId)) ?? units[0] ?? null;
    const fiscalFormKey = JSON.stringify(buildFiscalFormData(configuration, selectedUnitId));

    const handleSelectUnit = (unitId) => {
        router.get(route('settings.fiscal'), {
            unit_id: unitId,
            invoice_status: invoiceStatusFilter,
        }, {
            preserveState: false,
            preserveScroll: true,
            replace: true,
        });
    };

    return (
        <AuthenticatedLayout
            user={auth.user}
            header={
                <div className="flex flex-col gap-1">
                    <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">Configuracao Fiscal</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-300">
                        Prepare a emissao de NF-e e NFC-e por unidade.
                    </p>
                </div>
            }
        >
            <Head title="Configuracao Fiscal" />
            <div className="py-8">
                <div className="mx-auto max-w-7xl space-y-6 px-4 sm:px-6 lg:px-8">
                    <AlertMessage message={flash} />

                    <section className="rounded-2xl bg-white p-6 shadow dark:bg-gray-800">
                        <div className="flex flex-col gap-3">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Unidade</h3>
                                    <p className="text-sm text-gray-500 dark:text-gray-300">
                                        {isMaster ? 'Selecione a loja pelos botoes abaixo.' : `Unidade atual: ${selectedUnit?.name ?? '--'}.`}
                                    </p>
                                </div>
                                <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-900/50">
                                    <span
                                        aria-current="page"
                                        className="inline-flex items-center rounded-full bg-white px-4 py-2 text-sm font-semibold text-blue-700 shadow-sm dark:bg-gray-800 dark:text-blue-200"
                                    >
                                        Configuracao fiscal
                                    </span>
                                    <Link
                                        href={route('settings.nfe', selectedUnitId ? { unit_id: selectedUnitId } : {})}
                                        className="inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50 dark:text-emerald-200 dark:hover:bg-emerald-500/10"
                                    >
                                        Resumo mensal
                                    </Link>
                                    <Link
                                        href={route('settings.nfe', selectedUnitId ? { unit_id: selectedUnitId } : {})}
                                        className="inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-50 dark:text-blue-200 dark:hover:bg-blue-500/10"
                                    >
                                        NFe
                                    </Link>
                                    <Link
                                        href={route('settings.fiscal.tax-limit', selectedUnitId ? { unit_id: selectedUnitId } : {})}
                                        className="inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold text-amber-700 transition hover:bg-amber-50 dark:text-amber-100 dark:hover:bg-amber-500/10"
                                    >
                                        Limite imposto
                                    </Link>
                                </div>
                            </div>
                            {isMaster ? (
                            <div className="flex flex-wrap gap-3">
                                {units.map((store) => {
                                    const isActive = Number(selectedUnitId) === Number(store.id);
                                    const generationEnabled = Boolean(store.fiscal_generation_enabled);
                                    const dailyAverage = Number(store.monthly_issued_daily_average ?? 0);
                                    const neededToday = amountNeededTodayForDailyLimit(store);

                                    return (
                                        <button
                                            key={store.id}
                                            type="button"
                                            onClick={() => handleSelectUnit(store.id)}
                                            className={`rounded-2xl border px-5 py-3 text-left text-sm font-semibold transition ${
                                                !generationEnabled
                                                    ? 'border-rose-300 bg-rose-50 text-rose-700 shadow-sm dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-100'
                                                    : isActive
                                                      ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-sm dark:border-blue-400 dark:bg-blue-500/10 dark:text-blue-200'
                                                      : 'border-gray-200 bg-white text-gray-700 hover:border-blue-300 hover:text-blue-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:border-blue-500/50 dark:hover:text-blue-200'
                                            }`}
                                        >
                                            <span className="flex items-center gap-2 leading-tight">
                                                <span
                                                    className={`h-2.5 w-2.5 rounded-full ${generationEnabled ? 'bg-emerald-500' : 'bg-rose-500'}`}
                                                    aria-hidden="true"
                                                />
                                                {store.name}
                                            </span>
                                            <span className="mt-1 block text-xs font-medium leading-tight opacity-80">
                                                Media diaria: {formatReceiptCurrency(dailyAverage)}
                                            </span>
                                            <span className="mt-1 block text-xs font-medium leading-tight opacity-80">
                                                Hoje para meta: {neededToday === null ? 'Sem limite diario' : formatReceiptCurrency(neededToday)}
                                            </span>
                                            <span className={`mt-1 block text-xs font-bold uppercase tracking-wide ${
                                                generationEnabled ? 'text-emerald-700 dark:text-emerald-100' : 'text-rose-700 dark:text-rose-100'
                                            }`}>
                                                {generationEnabled ? 'Ligada' : 'Desativado'}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                            ) : selectedUnit ? (
                                <div className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${
                                    selectedUnit.fiscal_generation_enabled
                                        ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-500/10 dark:text-blue-200'
                                        : 'border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-100'
                                }`}>
                                    <span className="flex items-center gap-2">
                                        <span
                                            className={`h-2.5 w-2.5 rounded-full ${selectedUnit.fiscal_generation_enabled ? 'bg-emerald-500' : 'bg-rose-500'}`}
                                            aria-hidden="true"
                                        />
                                        {selectedUnit.name}
                                    </span>
                                    <span className="mt-1 block text-xs font-medium opacity-80">
                                        Media diaria: {formatReceiptCurrency(selectedUnit.monthly_issued_daily_average ?? 0)}
                                    </span>
                                    <span className="mt-1 block text-xs font-medium opacity-80">
                                        Hoje para meta: {amountNeededTodayForDailyLimit(selectedUnit) === null
                                            ? 'Sem limite diario'
                                            : formatReceiptCurrency(amountNeededTodayForDailyLimit(selectedUnit))}
                                    </span>
                                    <span className={`mt-1 block text-xs font-bold uppercase tracking-wide ${
                                        selectedUnit.fiscal_generation_enabled ? 'text-emerald-700 dark:text-emerald-100' : 'text-rose-700 dark:text-rose-100'
                                    }`}>
                                        {selectedUnit.fiscal_generation_enabled ? 'Ligada' : 'Desativado'}
                                    </span>
                                </div>
                            ) : null}
                        </div>
                    </section>

                    {!selectedUnitId ? (
                        <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-10 text-center text-sm text-gray-500 shadow dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                            Selecione uma unidade para configurar a emissao fiscal.
                        </div>
                    ) : (
                        <>
                            {fiscalUnavailableMessage && (
                                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800 shadow dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
                                    {fiscalUnavailableMessage}
                                </div>
                            )}
                            {invoiceLoadWarning && (
                                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800 shadow dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
                                    {invoiceLoadWarning}
                                </div>
                            )}
                            <div className="grid gap-6 xl:grid-cols-[minmax(320px,0.9fr)_minmax(0,1.1fr)]">
                                <UnitCard unit={unit} />
                                <div className={`${fiscalSectionClassName} h-full`}>
                                    <div className="grid h-full gap-4 md:grid-cols-2">
                                        <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-700 dark:bg-slate-900/40">
                                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-300">
                                                Dados da unidade
                                            </p>
                                            <p className="mt-3 text-sm text-slate-700 dark:text-slate-100">
                                                <span className="font-semibold">Nome:</span> {unit?.name ?? '--'}
                                            </p>
                                            <p className="mt-2 text-sm text-slate-700 dark:text-slate-100">
                                                <span className="font-semibold">CNPJ:</span> {unit?.cnpj ?? '--'}
                                            </p>
                                        </div>
                                        <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-700 dark:bg-slate-900/40">
                                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-300">
                                                Endereco da unidade
                                            </p>
                                            <p className="mt-3 text-sm text-slate-700 dark:text-slate-100">
                                                {unit?.endereco ?? '--'}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="grid gap-6 xl:grid-cols-2">
                                <CertificateSummaryCard unit={unit} configuration={configuration} resolvedEndpoints={resolvedEndpoints} />
                                <DiagnosticsCard diagnostics={configurationDiagnostics} />
                            </div>

                            <FiscalConfigFormSection
                                key={fiscalFormKey}
                                configuration={configuration}
                                selectedUnitId={selectedUnitId}
                                invoices={invoices}
                                invoiceStatusFilter={invoiceStatusFilter}
                                canActivateFiscalGeneration={canActivateFiscalGeneration}
                            />
                        </>
                    )}
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
