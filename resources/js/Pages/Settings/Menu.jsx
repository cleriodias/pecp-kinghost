import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head } from '@inertiajs/react';

const hasRoute = (name) => typeof route === 'function' && route().has && route().has(name);
const routeTo = (name) => (hasRoute(name) ? route(name) : null);

const SECTIONS = [
    {
        title: 'Principais',
        items: [
            { label: 'Dashboard', icon: 'bi-speedometer2', href: routeTo('dashboard') },
            { label: 'Produtos', icon: 'bi-box-seam', href: routeTo('products.index') },
            { label: 'Boletos', icon: 'bi-card-text', href: routeTo('boletos.index') },
            { label: 'Chamados', icon: 'bi-camera-video', href: routeTo('support.tickets.index') },
            { label: 'On-Line', icon: 'bi-broadcast-pin', href: routeTo('online.index') },
            { label: 'Gastos', icon: 'bi-receipt', href: routeTo('expenses.index') },
            { label: 'Fechar Caixa', icon: 'bi-cash-stack', href: routeTo('cashier.close') },
            { label: 'Lanchonete', icon: 'bi-egg-fried', href: routeTo('lanchonete.terminal') },
        ],
    },
    {
        title: 'Cadastros',
        items: [
            { label: 'Usuarios', icon: 'bi-people-fill', href: routeTo('users.index') },
            { label: 'Unidades', icon: 'bi-building', href: routeTo('units.index') },
            { label: 'Fornecedores', icon: 'bi-truck', href: routeTo('settings.suppliers') },
            { label: 'AnyDesck', icon: 'bi-pc-display', href: routeTo('settings.anydesck') },
        ],
    },
    {
        title: 'Relatorios',
        items: [
            { label: 'Relatorios', icon: 'bi-clipboard-data', href: routeTo('reports.index') },
            { label: 'Controle Financeiro', icon: 'bi-graph-up-arrow', href: routeTo('reports.control') },
            { label: 'Fechamento de Caixa', icon: 'bi-clipboard-data', href: routeTo('reports.cash.closure') },
            { label: 'Discrepancias de Caixa', icon: 'bi-exclamation-triangle', href: routeTo('reports.cash.discrepancies') },
            { label: 'Vendas Hoje', icon: 'bi-calendar-day', href: routeTo('reports.sales.today') },
            { label: 'Vendas Periodo', icon: 'bi-calendar-range', href: routeTo('reports.sales.period') },
            { label: 'Relatorio Detalhado', icon: 'bi-card-checklist', href: routeTo('reports.sales.detailed') },
            { label: 'Relatorio Lanchonete', icon: 'bi-cup-hot', href: routeTo('reports.lanchonete') },
            { label: 'Comandas em Aberto', icon: 'bi-journal-bookmark', href: routeTo('reports.comandas-aberto') },
            { label: 'PDR CACHE', icon: 'bi-lightning-charge', href: routeTo('reports.pdr-cache') },
            { label: 'Relatorio Vales', icon: 'bi-ticket-perforated', href: routeTo('reports.vale') },
            { label: 'Relatorio Refeicao', icon: 'bi-cup-straw', href: routeTo('reports.refeicao') },
            { label: 'Relatorio Faturar', icon: 'bi-journal-text', href: routeTo('reports.faturar') },
            { label: 'Relatorio Adiantamentos', icon: 'bi-wallet2', href: routeTo('reports.adiantamentos') },
            { label: 'Relatorio Fornecedores', icon: 'bi-truck', href: routeTo('reports.fornecedores') },
            { label: 'Relatorio Gastos', icon: 'bi-receipt', href: routeTo('reports.gastos') },
            { label: 'Relatorio Descarte', icon: 'bi-recycle', href: routeTo('reports.descarte') },
            { label: 'Discarte Consolidado', icon: 'bi-bar-chart-line', href: routeTo('reports.descarte.consolidado') },
        ],
    },
    {
        title: 'Ferramentas',
        items: [
            { label: 'Farrammentas', icon: 'bi-gear', href: routeTo('settings.config') },
            { label: 'Avisos', icon: 'bi-megaphone', href: routeTo('settings.notices') },
            { label: 'Permissoes de Menu', icon: 'bi-gear', href: routeTo('settings.profile-access') },
            { label: 'Organizar Menu', icon: 'bi-list-ol', href: routeTo('settings.menu-order') },
            { label: 'Trocar', icon: 'bi-arrow-left-right', href: routeTo('reports.switch-unit') },
            { label: 'Disputa de Vendas', icon: 'bi-hammer', href: routeTo('settings.sales-disputes') },
            { label: 'Disputas Fornecedor', icon: 'bi-hammer', href: routeTo('supplier.disputes') },
            { label: 'Configuracao do Discarte', icon: 'bi-percent', href: routeTo('settings.discard-config') },
            { label: 'Controle de Pagamentos', icon: 'bi-cash-coin', href: routeTo('settings.payment-control') },
            { label: 'NFe', icon: 'bi-file-earmark-text', href: routeTo('settings.nfe') },
            { label: 'Contra-Cheque', icon: 'bi-receipt-cutoff', href: routeTo('settings.contra-cheque') },
            { label: 'Folha de Pagamento', icon: 'bi-receipt', href: routeTo('settings.payroll') },
            { label: 'Adiantamentos', icon: 'bi-wallet2', href: routeTo('salary-advances.index') },
            { label: 'Hoje', icon: 'bi-receipt-cutoff', href: routeTo('reports.hoje') },
            { label: 'Descarte', icon: 'bi-recycle', href: routeTo('products.discard') },
            { label: 'Perfil', icon: 'bi-person-circle', href: routeTo('profile.edit') },
        ],
    },
];

export default function Menu({ auth }) {
    const role = Number(auth?.user?.funcao ?? -1);
    const isMaster = role === 0;

    const visibleSections = SECTIONS.map((section) => ({
        ...section,
        items: section.items.filter((item) => {
            if (!item.href) {
                return false;
            }

            if (
                !isMaster
                && ['Avisos', 'Fornecedores', 'AnyDesck', 'Disputa de Vendas'].includes(item.label)
            ) {
                return false;
            }

            return true;
        }),
    })).filter((section) => section.items.length > 0);

    return (
        <AuthenticatedLayout
            header={
                <div className="flex flex-col gap-1">
                    <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">
                        Menu do Sistema
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-300">
                        Acesse todas as opcoes do sistema em um unico lugar.
                    </p>
                </div>
            }
        >
            <Head title="Menu do Sistema" />
            <div className="py-8">
                <div className="mx-auto max-w-6xl space-y-6 px-4 sm:px-6 lg:px-8">
                    {visibleSections.map((section) => (
                        <div key={section.title} className="space-y-3">
                            <h3 className="text-sm font-semibold uppercase text-gray-600 dark:text-gray-300">
                                {section.title}
                            </h3>
                            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                {section.items.map((item) => (
                                    <a
                                        key={`${section.title}-${item.label}`}
                                        href={item.href}
                                        className="flex items-center justify-between rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm transition hover:border-indigo-300 hover:shadow-md dark:border-gray-700 dark:bg-gray-900"
                                    >
                                        <div className="flex items-center gap-3">
                                            <i className={`bi ${item.icon} text-xl text-indigo-500`} aria-hidden="true"></i>
                                            <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                                                {item.label}
                                            </span>
                                        </div>
                                        <span className="text-xs font-medium text-indigo-600 dark:text-indigo-300">
                                            Abrir
                                        </span>
                                    </a>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
