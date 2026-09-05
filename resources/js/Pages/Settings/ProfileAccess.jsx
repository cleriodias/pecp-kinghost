import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, usePage } from '@inertiajs/react';
import { useEffect, useState } from 'react';

const MENU_OPTIONS = [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'users', label: 'Usuarios' },
    { key: 'units', label: 'Unidades' },
    { key: 'products', label: 'Produtos' },
    { key: 'boletos', label: 'Boletos' },
    { key: 'support_tickets', label: 'Chamados' },
    { key: 'online_users', label: 'On-Line' },
    { key: 'cashier_close', label: 'Fechar Caixa' },
    { key: 'reports_control', label: 'Controle Financeiro' },
    { key: 'reports_cash', label: 'Fechamento de Caixa' },
    { key: 'reports_sales_today', label: 'Vendas Hoje' },
    { key: 'reports_sales_period', label: 'Vendas Periodo' },
    { key: 'reports_sales_detailed', label: 'Relatorio Detalhado' },
    { key: 'reports_lanchonete', label: 'Relatorio Lanchonete' },
    { key: 'reports_pdr_cache', label: 'PDR CACHE' },
    { key: 'reports_comandas_aberto', label: 'Comandas em Aberto' },
    { key: 'reports_vale', label: 'Relatorio Vales' },
    { key: 'reports_refeicao', label: 'Relatorio Refeicao' },
    { key: 'reports_faturar', label: 'Relatorio Faturar' },
    { key: 'reports_notas_fiscais_emitidas', label: 'Notas Fiscais Emitidas' },
    { key: 'reports_adiantamentos', label: 'Relatorio Adiantamentos' },
    { key: 'reports_fornecedores', label: 'Relatorio Fornecedores' },
    { key: 'supplier_disputes', label: 'Disputas Fornecedor' },
    { key: 'reports_gastos', label: 'Relatorio Gastos' },
    { key: 'reports_descarte', label: 'Relatorio Descarte' },
    { key: 'reports_descarte_consolidado', label: 'Discarte Consolidado' },
    { key: 'reports_hoje', label: 'Hoje' },
    { key: 'salary_advances', label: 'Adiantamento' },
    { key: 'expenses', label: 'Gastos' },
    { key: 'notices', label: 'Avisos' },
    { key: 'discard', label: 'Descarte' },
    { key: 'switch_unit', label: 'Trocar' },
    { key: 'settings', label: 'Ferramentas' },
    { key: 'lanchonete_terminal', label: 'Terminal Lanchonete' },
];

const ROLES = [
    { id: 0, label: 'MASTER' },
    { id: 1, label: 'GERENTE' },
    { id: 2, label: 'SUB-GERENTE' },
    { id: 3, label: 'CAIXA' },
    { id: 4, label: 'LANCHONETE' },
    { id: 5, label: 'FUNCIONARIO' },
    { id: 6, label: 'CLIENTE' },
];

const STORAGE_KEY = 'menuAccessConfig';
const normalizeMenuAccessConfig = (config) => {
    if (!config || typeof config !== 'object') {
        return config;
    }

    const allowedKeys = MENU_OPTIONS.map((item) => item.key);
    const normalized = { ...config };

    Object.entries(normalized).forEach(([role, value]) => {
        if (!Array.isArray(value)) {
            return;
        }

        const filtered = value.filter((key, index) => allowedKeys.includes(key) && value.indexOf(key) === index);
        const missingKeys = allowedKeys.filter((key) => !filtered.includes(key));
        normalized[role] = [...filtered, ...missingKeys];
    });

    return normalized;
};

export default function ProfileAccess() {
    const { auth } = usePage().props;
    const [selectedRole, setSelectedRole] = useState(0);
    const [config, setConfig] = useState({});

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return;
        }
        try {
            const parsed = JSON.parse(raw);
            const normalized = normalizeMenuAccessConfig(parsed ?? {});
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
            setConfig(normalized);
        } catch (err) {
            console.error('Failed to parse menuAccessConfig', err);
        }
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    }, [config]);

    const toggleMenu = (menuKey) => {
        setConfig((prev) => {
            const current = Array.isArray(prev[selectedRole]) ? prev[selectedRole] : [];
            const exists = current.includes(menuKey);
            const nextMenus = exists ? current.filter((k) => k !== menuKey) : [...current, menuKey];
            return { ...prev, [selectedRole]: nextMenus };
        });
    };

    const roleMenus = Array.isArray(config[selectedRole]) ? config[selectedRole] : [];

    return (
        <AuthenticatedLayout
            user={auth.user}
            header={
                <div className="flex flex-col gap-1">
                    <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">Farrammentas de Acesso</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-300">
                        Clique no perfil e habilite/desabilite itens do menu em tempo real.
                    </p>
                </div>
            }
        >
            <Head title="Acesso por Perfil" />
            <div className="py-8">
                <div className="mx-auto max-w-6xl space-y-6 px-4 sm:px-6 lg:px-8">
                    <div className="grid gap-4 lg:grid-cols-2">
                        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900">
                            <h3 className="text-sm font-semibold uppercase text-gray-600 dark:text-gray-300">Perfis</h3>
                            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                                {ROLES.map((role) => (
                                    <button
                                        key={role.id}
                                        type="button"
                                        onClick={() => setSelectedRole(role.id)}
                                        className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                                            selectedRole === role.id
                                                ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:border-indigo-400 dark:bg-indigo-900/30 dark:text-indigo-100'
                                                : 'border-gray-200 bg-white text-gray-700 hover:border-indigo-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200'
                                        }`}
                                    >
                                        {role.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900">
                            <h3 className="text-sm font-semibold uppercase text-gray-600 dark:text-gray-300">
                                Menu (perfil {ROLES.find((r) => r.id === selectedRole)?.label})
                            </h3>
                            <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                {MENU_OPTIONS.map((menu) => {
                                    const enabled = roleMenus.includes(menu.key);
                                    return (
                                        <button
                                            key={menu.key}
                                            type="button"
                                            onClick={() => toggleMenu(menu.key)}
                                            className={`flex items-center justify-between rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                                                enabled
                                                    ? 'border-emerald-400 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-900/20 dark:text-emerald-100'
                                                    : 'border-gray-200 bg-white text-gray-700 hover:border-indigo-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200'
                                            }`}
                                        >
                                            <span>{menu.label}</span>
                                            <span
                                                className={`text-xs font-semibold ${
                                                    enabled
                                                        ? 'text-emerald-600 dark:text-emerald-200'
                                                        : 'text-gray-400 dark:text-gray-400'
                                                }`}
                                            >
                                                {enabled ? 'Habilitado' : 'Desabilitado'}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                    <div className="rounded-2xl border border-gray-100 bg-white p-4 text-xs text-gray-500 shadow-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
                        As alteracoes sao salvas no navegador (localStorage) e aplicadas imediatamente ao menu.
                    </div>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
