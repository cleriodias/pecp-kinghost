import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, usePage } from '@inertiajs/react';
import { useEffect, useState } from 'react';

const MENU_KEYS = [
    'dashboard',
    'users',
    'units',
    'products',
    'support_tickets',
    'reports_control',
    'reports_cash',
    'cashier_close',
    'reports_hoje',
    'discard',
    'expenses',
    'boletos',
    'reports_sales_today',
    'reports_lanchonete',
    'reports_pdr_cache',
    'reports_sales_period',
    'reports_descarte_consolidado',
    'reports_sales_detailed',
    'salary_advances',
    'notices',
    'reports_comandas_aberto',
    'reports_vale',
    'reports_refeicao',
    'reports_faturar',
    'reports_notas_fiscais_emitidas',
    'reports_adiantamentos',
    'reports_fornecedores',
    'supplier_disputes',
    'reports_gastos',
    'reports_descarte',
    'switch_unit',
    'settings',
    'lanchonete_terminal',
];

const LABELS = {
    dashboard: 'Dashboard',
    users: 'Usuarios',
    units: 'Unidades',
    products: 'Produtos',
    boletos: 'Boletos',
    support_tickets: 'Chamados',
    expenses: 'Gastos',
    notices: 'Avisos',
    cashier_close: 'Fechar Caixa',
    reports_control: 'Controle Financeiro',
    reports_cash: 'Fechamento de Caixa',
    reports_sales_today: 'Vendas Hoje',
    reports_sales_period: 'Vendas Periodo',
    reports_sales_detailed: 'Relatorio Detalhado',
    reports_lanchonete: 'Relatorio Lanchonete',
    reports_pdr_cache: 'PDR CACHE',
    reports_comandas_aberto: 'Comandas em Aberto',
    reports_vale: 'Relatorio Vales',
    reports_refeicao: 'Relatorio Refeicao',
    reports_faturar: 'Relatorio Faturar',
    reports_notas_fiscais_emitidas: 'Notas Fiscais Emitidas',
    reports_adiantamentos: 'Relatorio Adiantamentos',
    reports_fornecedores: 'Relatorio Fornecedores',
    supplier_disputes: 'Disputas Fornecedor',
    reports_gastos: 'Relatorio Gastos',
    reports_descarte: 'Relatorio Descarte',
    reports_descarte_consolidado: 'Discarte Consolidado',
    reports_hoje: 'Hoje',
    salary_advances: 'Adiantamento',
    discard: 'Descarte',
    switch_unit: 'Trocar',
    settings: 'Ferramentas',
    lanchonete_terminal: 'Terminal Lanchonete',
};

const STORAGE_KEY = 'menuOrderConfig';
const MENU_ORDER_PRIORITY = [
    'dashboard',
    'products',
    'support_tickets',
    'reports_control',
    'reports_cash',
    'cashier_close',
    'lanchonete_terminal',
    'reports_hoje',
    'discard',
    'expenses',
    'boletos',
    'reports_sales_today',
    'reports_lanchonete',
    'reports_pdr_cache',
    'reports_sales_period',
    'reports_descarte_consolidado',
    'reports_sales_detailed',
    'settings',
];

const normalizeMenuOrder = (order) => {
    const source = Array.isArray(order) ? order : [];
    const uniqueKeys = source.filter((key, index) => MENU_KEYS.includes(key) && source.indexOf(key) === index);
    const merged = [...uniqueKeys, ...MENU_KEYS.filter((key) => !uniqueKeys.includes(key))];
    const priorityMap = MENU_ORDER_PRIORITY.reduce((acc, key, index) => {
        acc[key] = index;
        return acc;
    }, {});

    return [...merged].sort((left, right) => {
        const leftPriority =
            priorityMap[left] !== undefined ? priorityMap[left] : 1000 + merged.indexOf(left);
        const rightPriority =
            priorityMap[right] !== undefined ? priorityMap[right] : 1000 + merged.indexOf(right);

        return leftPriority - rightPriority;
    });
};

export default function MenuOrder() {
    const { auth } = usePage().props;
    const [order, setOrder] = useState(() => normalizeMenuOrder(MENU_KEYS));

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw) {
            try {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    const normalized = normalizeMenuOrder(parsed);
                    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
                    setOrder(normalized);
                }
            } catch (err) {
                console.error('Failed to parse menuOrderConfig', err);
            }
        }
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(order));
    }, [order]);

    const moveItem = (index, direction) => {
        setOrder((prev) => {
            const next = [...prev];
            const target = index + direction;
            if (target < 0 || target >= next.length) {
                return prev;
            }
            const temp = next[index];
            next[index] = next[target];
            next[target] = temp;
            return next;
        });
    };

    return (
        <AuthenticatedLayout
            user={auth.user}
            header={
                <div className="flex flex-col gap-1">
                    <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">
                        Organizar Menu
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-300">
                        Arraste ou use as setas para definir a ordem dos itens. Mudancas sao salvas no navegador.
                    </p>
                </div>
            }
        >
            <Head title="Organizar Menu" />
            <div className="py-8">
                <div className="mx-auto max-w-4xl space-y-4 px-4 sm:px-6 lg:px-8">
                    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900">
                        <div className="grid grid-cols-1 gap-2">
                            {order.map((key, index) => (
                                <div
                                    key={key}
                                    className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                                >
                                    <span>{LABELS[key] ?? key}</span>
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => moveItem(index, -1)}
                                            className="rounded-full border border-gray-300 px-2 py-1 text-xs font-semibold text-gray-600 transition hover:border-indigo-400 hover:text-indigo-600 disabled:opacity-40 dark:border-gray-600 dark:text-gray-200"
                                            disabled={index === 0}
                                        >
                                            ^
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => moveItem(index, 1)}
                                            className="rounded-full border border-gray-300 px-2 py-1 text-xs font-semibold text-gray-600 transition hover:border-indigo-400 hover:text-indigo-600 disabled:opacity-40 dark:border-gray-600 dark:text-gray-200"
                                            disabled={index === order.length - 1}
                                        >
                                            v
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="rounded-2xl border border-gray-100 bg-white p-4 text-xs text-gray-500 shadow-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
                        A ordem aplicada afeta o menu superior e o dropdown (apos atualizar a pagina).
                    </div>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
