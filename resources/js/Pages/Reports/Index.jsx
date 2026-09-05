import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, Link } from '@inertiajs/react';

const fallbackReports = [
    {
        key: 'control',
        label: 'Controle',
        description: 'Resumo financeiro mensal por unidade.',
        icon: 'bi-graph-up-arrow',
        route: 'reports.control',
    },
    {
        key: 'cash-closure',
        label: 'Fechamento de caixa',
        description: 'Detalhe de pagamentos e diferencas por caixa.',
        icon: 'bi-clipboard-data',
        route: 'reports.cash.closure',
    },
    {
        key: 'cash-discrepancies',
        label: 'Discrepancias de caixa',
        description: 'Fechamentos com diferencas entre sistema e fechamento.',
        icon: 'bi-exclamation-triangle',
        route: 'reports.cash.discrepancies',
    },
    {
        key: 'sales-today',
        label: 'Vendas hoje',
        description: 'Total do dia e formas de pagamento.',
        icon: 'bi-calendar-day',
        route: 'reports.sales.today',
    },
    {
        key: 'sales-period',
        label: 'Vendas periodo',
        description: 'Totais diarios no periodo selecionado.',
        icon: 'bi-calendar-range',
        route: 'reports.sales.period',
    },
    {
        key: 'sales-detailed',
        label: 'Relatorio detalhado',
        description: 'Itens vendidos com detalhes por venda.',
        icon: 'bi-card-checklist',
        route: 'reports.sales.detailed',
    },
    {
        key: 'lanchonete',
        label: 'Relatorio lanchonete',
        description: 'Comandas por dia e status na lanchonete.',
        icon: 'bi-cup-hot',
        route: 'reports.lanchonete',
    },
    {
        key: 'pdr-cache',
        label: 'PDR CACHE',
        description: 'Produtos carregados no cache de leitura rapida do Dashboard.',
        icon: 'bi-lightning-charge',
        route: 'reports.pdr-cache',
    },
    {
        key: 'comandas-aberto',
        label: 'Comandas em Aberto',
        description: 'Comandas abertas agrupadas por numero com filtros por periodo, loja e usuario.',
        icon: 'bi-journal-bookmark',
        route: 'reports.comandas-aberto',
    },
    {
        key: 'vales',
        label: 'Vales',
        description: 'Compras feitas no vale.',
        icon: 'bi-ticket-perforated',
        route: 'reports.vale',
    },
    {
        key: 'refeicao',
        label: 'Refeicao',
        description: 'Compras feitas na refeicao.',
        icon: 'bi-cup-straw',
        route: 'reports.refeicao',
    },
    {
        key: 'faturar',
        label: 'Faturar',
        description: 'Cupons com pagamento faturado por caixa e loja.',
        icon: 'bi-journal-text',
        route: 'reports.faturar',
    },
    {
        key: 'notas-fiscais-emitidas',
        label: 'Notas Fiscais Emitidas',
        description: 'Notas fiscais por loja, situacao e periodo.',
        icon: 'bi-receipt-cutoff',
        route: 'reports.notas-fiscais-emitidas',
    },
    {
        key: 'adiantamentos',
        label: 'Adiantamento',
        description: 'Adiantamentos realizados no periodo.',
        icon: 'bi-wallet2',
        route: 'reports.adiantamentos',
    },
    {
        key: 'fornecedores',
        label: 'Fornecedores',
        description: 'Fornecedores cadastrados.',
        icon: 'bi-truck',
        route: 'reports.fornecedores',
    },
    {
        key: 'gastos',
        label: 'Gastos',
        description: 'Gastos cadastrados no periodo.',
        icon: 'bi-receipt',
        route: 'reports.gastos',
    },
    {
        key: 'descarte',
        label: 'Descarte',
        description: 'Descartes registrados no periodo.',
        icon: 'bi-recycle',
        route: 'reports.descarte',
    },
    {
        key: 'descarte-consolidado',
        label: 'Discarte Consolidado',
        description: 'Agrupa descartes por item para destacar os produtos mais descartados no mes.',
        icon: 'bi-bar-chart-line',
        route: 'reports.descarte.consolidado',
    },
];

export default function ReportsIndex({ reports = [] }) {
    const items = Array.isArray(reports) && reports.length ? reports : fallbackReports;

    const headerContent = (
        <div>
            <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">
                Relatorios
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-300">
                Acesse apenas os relatorios disponiveis no sistema.
            </p>
        </div>
    );

    return (
        <AuthenticatedLayout header={headerContent}>
            <Head title="Relatorios" />

            <div className="py-8">
                <div className="mx-auto max-w-5xl space-y-6 px-4 sm:px-6 lg:px-8">
                    <div className="grid gap-4 sm:grid-cols-2">
                        {items.map((report) => (
                            <Link
                                key={report.key ?? report.route}
                                href={route(report.route)}
                                className="group flex items-start justify-between rounded-2xl border border-gray-200 bg-white px-4 py-4 shadow-sm transition hover:border-indigo-300 hover:shadow-md dark:border-gray-700 dark:bg-gray-900"
                            >
                                <div className="flex items-start gap-3">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 group-hover:bg-indigo-100">
                                        <i className={`bi ${report.icon} text-lg`} aria-hidden="true"></i>
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                                            {report.label}
                                        </p>
                                        <p className="text-xs text-gray-500 dark:text-gray-300">
                                            {report.description}
                                        </p>
                                    </div>
                                </div>
                                <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-300">
                                    Abrir
                                </span>
                            </Link>
                        ))}
                    </div>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
