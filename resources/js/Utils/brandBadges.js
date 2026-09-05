const BADGE_BASE_CLASSNAME =
    'rounded-full border px-3 py-1 text-xs font-semibold transition dark:border-gray-600';

const UNIT_STYLE_MAP = {
    'SETOR 10': {
        backgroundColor: '#6d28d9',
        borderColor: '#5b21b6',
        color: '#ffffff',
    },
    'SETOR 1': {
        backgroundColor: '#0369a1',
        borderColor: '#075985',
        color: '#ffffff',
    },
    'BARRAGEM 1': {
        backgroundColor: '#047857',
        borderColor: '#065f46',
        color: '#ffffff',
    },
    default: {
        backgroundColor: '#475569',
        borderColor: '#334155',
        color: '#ffffff',
    },
};

const ROLE_STYLE_MAP = {
    MASTER: {
        backgroundColor: '#d97706',
        borderColor: '#b45309',
        color: '#ffffff',
    },
    GERENTE: {
        backgroundColor: '#2563eb',
        borderColor: '#1d4ed8',
        color: '#ffffff',
    },
    'SUB GERENTE': {
        backgroundColor: '#0891b2',
        borderColor: '#0e7490',
        color: '#ffffff',
    },
    CAIXA: {
        backgroundColor: '#4f46e5',
        borderColor: '#4338ca',
        color: '#ffffff',
    },
    LANCHONETE: {
        backgroundColor: '#e11d48',
        borderColor: '#be123c',
        color: '#ffffff',
    },
    FUNCIONARIO: {
        backgroundColor: '#475569',
        borderColor: '#334155',
        color: '#ffffff',
    },
    CLIENTE: {
        backgroundColor: '#65a30d',
        borderColor: '#4d7c0f',
        color: '#ffffff',
    },
    default: {
        backgroundColor: '#475569',
        borderColor: '#334155',
        color: '#ffffff',
    },
};

const normalizeKey = (value) =>
    String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[-_/]+/g, ' ')
        .trim()
        .replace(/\s+/g, ' ')
        .toUpperCase();

export const getUserNameBadgeClassName = () =>
    `${BADGE_BASE_CLASSNAME} border-slate-900 bg-slate-900 text-white hover:border-slate-800 hover:text-white`;

export const getUnitBadgeClassName = () =>
    `${BADGE_BASE_CLASSNAME} whitespace-nowrap hover:text-white`;

export const getRoleBadgeClassName = () =>
    `${BADGE_BASE_CLASSNAME} whitespace-nowrap hover:text-white`;

export const formatUnitBadgeLabel = (value) =>
    normalizeKey(value).replace(/\s+/g, '-') || 'SEM-LOJA';

export const formatRoleBadgeLabel = (value) => {
    const normalized = normalizeKey(value);

    if (normalized === 'LANCHONETE') {
        return 'LANCH';
    }

    if (normalized === 'SUB GERENTE') {
        return 'SUB-G';
    }

    return normalized || '---';
};

export const getUnitBadgeStyle = (value) =>
    UNIT_STYLE_MAP[normalizeKey(value)] ?? UNIT_STYLE_MAP.default;

export const getRoleBadgeStyle = (value) =>
    ROLE_STYLE_MAP[normalizeKey(value)] ?? ROLE_STYLE_MAP.default;
