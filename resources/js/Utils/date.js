export const BRAZIL_TIME_ZONE = 'America/Sao_Paulo';

const DATE_ONLY_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_TIME_REGEX = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/;

const BRAZIL_OFFSET_HOURS = 3;

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
    timeZone: BRAZIL_TIME_ZONE,
});

const shortDateFormatter = new Intl.DateTimeFormat('pt-BR', {
    timeZone: BRAZIL_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
});

const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
    timeZone: BRAZIL_TIME_ZONE,
    dateStyle: 'short',
    timeStyle: 'short',
});

const timeFormatter = new Intl.DateTimeFormat('pt-BR', {
    timeZone: BRAZIL_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
});

const todayInputFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: BRAZIL_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
});

const buildBrazilDate = (year, month, day, hour = 0, minute = 0, second = 0) =>
    new Date(Date.UTC(year, month - 1, day, hour + BRAZIL_OFFSET_HOURS, minute, second));

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

    const dateOnlyMatch = normalized.match(DATE_ONLY_REGEX);
    if (dateOnlyMatch) {
        return buildBrazilDate(
            Number(dateOnlyMatch[1]),
            Number(dateOnlyMatch[2]),
            Number(dateOnlyMatch[3]),
            12,
        );
    }

    const dateTimeMatch = normalized.match(DATE_TIME_REGEX);
    if (dateTimeMatch) {
        return buildBrazilDate(
            Number(dateTimeMatch[1]),
            Number(dateTimeMatch[2]),
            Number(dateTimeMatch[3]),
            Number(dateTimeMatch[4]),
            Number(dateTimeMatch[5]),
            Number(dateTimeMatch[6] ?? 0),
        );
    }

    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const formatBrazilDate = (value) => {
    const date = parseDateValue(value);

    if (!date) {
        return '--';
    }

    return dateFormatter.format(date);
};

export const formatBrazilShortDate = (value) => {
    const date = parseDateValue(value);

    if (!date) {
        return '--';
    }

    return shortDateFormatter.format(date);
};

export const formatBrazilDateTime = (value) => {
    const date = parseDateValue(value);

    if (!date) {
        return '--';
    }

    return dateTimeFormatter.format(date);
};

export const formatBrazilTime = (value) => {
    const date = parseDateValue(value);

    if (!date) {
        return '--';
    }

    return timeFormatter.format(date);
};

export const getBrazilTodayInputValue = () => todayInputFormatter.format(new Date());

export const getBrazilTodayShortInputValue = () =>
    formatBrazilShortDate(todayInputFormatter.format(new Date()));

export const normalizeBrazilShortDateInput = (value) => {
    const digits = String(value ?? '').replace(/\D/g, '').slice(0, 6);

    if (digits.length <= 2) {
        return digits;
    }

    if (digits.length <= 4) {
        return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    }

    return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 6)}`;
};

export const shortBrazilDateInputToIso = (value) => {
    const normalized = String(value ?? '').trim();

    if (!/^\d{2}\/\d{2}\/\d{2}$/.test(normalized)) {
        return '';
    }

    const [day, month, year] = normalized.split('/').map((part) => Number(part));
    const fullYear = 2000 + year;
    const candidate = new Date(Date.UTC(fullYear, month - 1, day, 12));

    if (
        Number.isNaN(candidate.getTime())
        || candidate.getUTCFullYear() !== fullYear
        || candidate.getUTCMonth() !== month - 1
        || candidate.getUTCDate() !== day
    ) {
        return '';
    }

    const isoMonth = String(month).padStart(2, '0');
    const isoDay = String(day).padStart(2, '0');

    return `${fullYear}-${isoMonth}-${isoDay}`;
};

export const isoToBrazilShortDateInput = (value) => {
    if (!value) {
        return '';
    }

    return formatBrazilShortDate(value);
};
