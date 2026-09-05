const STATUS_META = {
    aberto: {
        label: 'Aberto',
        style: {
            backgroundColor: '#ed1c24',
            borderColor: '#ed1c24',
            color: '#ffffff',
        },
    },
    em_analise: {
        label: 'Em analise',
        style: {
            backgroundColor: '#2f75d6',
            borderColor: '#2f75d6',
            color: '#ffffff',
        },
    },
    aguardando_usuario: {
        label: 'Aguardando usuario',
        style: {
            backgroundColor: '#ff8c2a',
            borderColor: '#ff8c2a',
            color: '#ffffff',
        },
    },
    resolvido: {
        label: 'Resolvido',
        style: {
            backgroundColor: '#21b14b',
            borderColor: '#21b14b',
            color: '#ffffff',
        },
    },
    fechado: {
        label: 'Fechado',
        style: {
            backgroundColor: '#6b7280',
            borderColor: '#6b7280',
            color: '#ffffff',
        },
    },
};

export const SUPPORT_TICKET_MENU_STATUS_ORDER = [
    'aberto',
    'em_analise',
    'aguardando_usuario',
];

export const getSupportTicketStatusMeta = (status) =>
    STATUS_META[status] ?? STATUS_META.aberto;

export const getSupportTicketStatusStyle = (status) =>
    getSupportTicketStatusMeta(status).style;

export const buildSupportTicketMenuCounters = (summary) => {
    if (!summary?.can_view) {
        return [];
    }

    return SUPPORT_TICKET_MENU_STATUS_ORDER
        .map((status) => ({
            status,
            count: Number(summary?.counts?.[status] ?? 0),
            label: getSupportTicketStatusMeta(status).label,
        }))
        .filter((item) => item.count > 0);
};
