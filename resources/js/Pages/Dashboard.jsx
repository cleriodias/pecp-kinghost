import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import Modal from '@/Components/Modal';
import { Head, Link, usePage, router } from '@inertiajs/react';
import {
    formatRoleBadgeLabel,
    formatUnitBadgeLabel,
    getRoleBadgeClassName,
    getRoleBadgeStyle,
    getUnitBadgeClassName,
    getUnitBadgeStyle,
} from '@/Utils/brandBadges';
import { formatBrazilDate, formatBrazilDateTime } from '@/Utils/date';
import { buildFiscalReceiptHtml, buildReceiptHtml, resolveReceiptComanda, resolveReceiptId } from '@/Utils/receipt';
import axios from 'axios';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const MIN_CHARACTERS = 3;
const numericRegex = /^\d+$/;
const BARCODE_MIN_LENGTH = 5;
const WEIGHTED_BARCODE_PREFIX = '2';
const WEIGHTED_BARCODE_LENGTH = 13;
const COMANDA_MIN_CODE = 3000;
const COMANDA_MAX_CODE = 3100;
const QUANTITY_HOLD_INITIAL_DELAY = 350;
const QUANTITY_HOLD_REPEAT_INTERVAL = 90;
const QUICK_LOOKUP_SYNC_INTERVAL_MS = 15000;
const paymentLabels = {
    maquina: 'Maquina',
    cartao_credito: 'Cartao credito',
    cartao_debito: 'Cartao debito',
    dinheiro: 'Dinheiro',
    dinheiro_cartao_credito: 'Dinheiro + Cartao credito',
    dinheiro_cartao_debito: 'Dinheiro + Cartao debito',
    dinheiro_pix: 'Dinheiro + Pix',
    pix: 'Pix',
    vale: 'Vale',
    faturar: 'Faturar',
    refeicao: 'Refeição',
};
const cardTypeOptions = [
    {
        value: 'cartao_credito',
        label: paymentLabels.cartao_credito,
        shortcutKey: 'F4',
        shortcutLabel: 'F4',
        classes: 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-200 text-white',
    },
    {
        value: 'cartao_debito',
        label: paymentLabels.cartao_debito,
        shortcutKey: 'F8',
        shortcutLabel: 'F8',
        classes: 'bg-sky-600 hover:bg-sky-700 focus:ring-sky-200 text-white',
    },
    {
        value: 'pix',
        label: paymentLabels.dinheiro_pix,
        shortcutLabel: 'Pix',
        classes: 'bg-cyan-600 hover:bg-cyan-700 focus:ring-cyan-200 text-white',
    },
];
const fiscalStatusLabels = {
    pendente_configuracao: 'Pendente configuracao',
    erro_validacao: 'Erro de validacao',
    pendente_emissao: 'Pendente emissao',
    xml_assinado: 'XML assinado',
    erro_transmissao: 'Erro de transmissao',
    emitida: 'Emitida',
    cancelada: 'Cancelada',
};
const paymentOptions = [
    {
        value: 'dinheiro',
        label: paymentLabels.dinheiro,
        shortcutKey: 'F2',
        shortcutLabel: 'F2',
        classes: 'bg-green-600 hover:bg-green-700 focus:ring-green-200 text-white',
    },
    {
        value: 'cartao_credito',
        label: paymentLabels.cartao_credito,
        shortcutKey: 'F4',
        shortcutLabel: 'F4',
        classes: 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-200 text-white',
    },
    {
        value: 'cartao_debito',
        label: paymentLabels.cartao_debito,
        shortcutKey: 'F8',
        shortcutLabel: 'F8',
        classes: 'bg-sky-600 hover:bg-sky-700 focus:ring-sky-200 text-white',
    },
    {
        value: 'pix',
        label: paymentLabels.pix,
        shortcutKey: 'F9',
        shortcutLabel: 'F9',
        classes: 'bg-cyan-600 hover:bg-cyan-700 focus:ring-cyan-200 text-white',
    },
    {
        value: 'vale',
        label: paymentLabels.vale,
        shortcutKey: 'F10',
        shortcutLabel: 'F10',
        classes: 'bg-amber-500 hover:bg-amber-600 focus:ring-amber-200 text-gray-900',
    },
    {
        value: 'faturar',
        label: paymentLabels.faturar,
        classes: 'bg-gray-900 hover:bg-gray-800 focus:ring-gray-200 text-white',
    },
];
const PAYMENT_SHORTCUTS = new Map([
    ['f2', 'dinheiro'],
    ['f4', 'cartao_credito'],
    ['f8', 'cartao_debito'],
    ['f9', 'pix'],
    ['f10', 'vale'],
]);
const faturarWarningText = [
    'Aviso sobre a utilização do pagamento “Faturar”',
    'A opção de pagamento “Faturar” deve ser utilizada exclusivamente em situações excepcionais, quando o cliente deixa o estabelecimento sem efetuar o pagamento devido. Ao selecionar esta opção, o utilizador reconhece que está a justificar a ausência do valor correspondente no caixa.',
    'É importante salientar que a utilização indevida ou recorrente deste tipo de pagamento poderá implicar consequências administrativas, incluindo a necessidade de apresentação de justificativas formais, auditorias internas e eventuais responsabilizações conforme as políticas da empresa.',
    'Antes de prosseguir, confirme que a situação se enquadra nos critérios definidos e que todas as alternativas de cobrança foram devidamente consideradas.',
    'Deseja continuar com o registo como “Faturar” ou prefere cancelar a operação?',
];

const createCartItemId = (productId, price) =>
    `product-${Number(productId ?? 0)}-price-${Number(price ?? 0).toFixed(2)}`;

const DEFAULT_FISCAL_CONSUMER_FORM = {
    type: 'cupom_fiscal',
    name: '',
    document: '',
    cep: '',
    street: '',
    number: '',
    complement: '',
    neighborhood: '',
    city: '',
    city_code: '',
    state: '',
};

const sanitizeDocumentDigits = (value) => String(value ?? '').replace(/\D/g, '');

const resolveFiscalConsumerType = (consumer) => {
    const explicitType = String(consumer?.type ?? consumer?.consumer_type ?? '').trim();
    const document = sanitizeDocumentDigits(
        consumer?.document ?? consumer?.consumer_document ?? consumer?.dest_document ?? '',
    );
    const name = String(consumer?.name ?? consumer?.consumer_name ?? '').trim();

    if (explicitType) {
        return explicitType;
    }

    if (!document) {
        return 'balcao';
    }

    return name ? 'consumidor' : 'cupom_fiscal';
};

const hasIdentifiedConsumer = (consumer) => resolveFiscalConsumerType(consumer) !== 'balcao';

const isFullConsumerFiscalType = (consumer) => resolveFiscalConsumerType(consumer) === 'consumidor';

const resolveFiscalConsumerLabel = (consumer) => {
    const type = resolveFiscalConsumerType(consumer);

    if (type === 'cupom_fiscal') {
        return 'Cupom Fiscal';
    }

    if (type === 'consumidor') {
        return 'NF Consumidor';
    }

    return 'NF Balcao';
};

const resolveFiscalReceiptItems = (receiptData) => {
    const fiscalItems = Array.isArray(receiptData?.fiscal?.items) ? receiptData.fiscal.items : [];

    if (fiscalItems.length > 0) {
        return fiscalItems;
    }

    return Array.isArray(receiptData?.items) ? receiptData.items : [];
};

const resolveComplementLabel = (paymentType) => {
    if (paymentType === 'dinheiro_pix') {
        return 'Pix';
    }

    return 'Cartao';
};

const buildConsumerFiscalForm = (consumer = null) => ({
    type: resolveFiscalConsumerType(consumer) === 'balcao'
        ? 'cupom_fiscal'
        : resolveFiscalConsumerType(consumer),
    name: String(consumer?.name ?? consumer?.consumer_name ?? '').trim(),
    document: String(consumer?.document ?? consumer?.consumer_document ?? consumer?.dest_document ?? '').trim(),
    cep: String(consumer?.cep ?? '').trim(),
    street: String(consumer?.street ?? consumer?.logradouro ?? '').trim(),
    number: String(consumer?.number ?? consumer?.numero ?? '').trim(),
    complement: String(consumer?.complement ?? consumer?.complemento ?? '').trim(),
    neighborhood: String(consumer?.neighborhood ?? consumer?.bairro ?? '').trim(),
    city: String(consumer?.city ?? consumer?.municipio ?? '').trim(),
    city_code: String(consumer?.city_code ?? consumer?.codigo_municipio ?? consumer?.dest_city_code ?? '').trim(),
    state: String(consumer?.state ?? consumer?.uf ?? '').trim(),
});

const resolveProductId = (item) => {
    const candidate = item?.productId ?? item?.product_id ?? item?.tb1_id ?? item?.id;
    const parsed = Number(candidate);

    return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeCartItem = (item) => {
    const productId = resolveProductId(item);
    const price = Number(item?.price ?? item?.unit_price ?? 0);
    const hasStructuredId =
        typeof item?.id === 'string' && item.id.startsWith('product-');

    return {
        ...item,
        id: hasStructuredId ? item.id : createCartItemId(productId, price),
        productId,
        price,
        quantity: Number(item?.quantity ?? 0),
        isWeighted: Boolean(item?.isWeighted ?? item?.is_weighted ?? false),
        barcode: item?.barcode ?? null,
        vrEligible: Boolean(
            item?.vrEligible ?? item?.vr_credit ?? item?.tb1_vr_credit ?? false,
        ),
    };
};

const ITEMS_STORAGE_KEY = 'dashboard.selectedItems';
const SAVED_CARTS_STORAGE_KEY = 'dashboard.savedCarts';

const formatCurrency = (value) => {
    const parsed = Number(value ?? 0);

    return parsed.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });
};

const resolveRefeicaoDailyLimit = (date = new Date()) => (date.getDay() === 0 ? 24 : 12);

const formatRefeicaoLimitLabel = (value) => `Limite R$${Number(value ?? 0).toFixed(0)}`;

const resolveRefeicaoValidation = (user, totalAmount, { includeBalanceMessage = true } = {}) => {
    const balance = Number(user?.refeicao_balance ?? user?.vr_cred ?? 0);
    const dailyLimit = Number(user?.refeicao_daily_limit ?? resolveRefeicaoDailyLimit());
    const dailyUsed = Number(user?.refeicao_daily_used ?? 0);
    const dailyRemaining = Math.max(
        0,
        Number(user?.refeicao_daily_remaining ?? dailyLimit - dailyUsed),
    );

    if (totalAmount > balance) {
        return {
            canProceed: false,
            reason: 'balance',
            balance,
            dailyLimit,
            dailyUsed,
            dailyRemaining,
            message: includeBalanceMessage
                ? `Saldo de refeicao insuficiente para ${user?.name ?? 'o colaborador'}. Disponivel: ${formatCurrency(balance)}.`
                : '',
        };
    }

    if (totalAmount > dailyRemaining) {
        if (dailyRemaining <= 0) {
            return {
                canProceed: false,
                reason: 'daily_limit',
                balance,
                dailyLimit,
                dailyUsed,
                dailyRemaining,
                message: formatRefeicaoLimitLabel(dailyLimit),
            };
        }

        return {
            canProceed: false,
            reason: 'daily_limit',
            balance,
            dailyLimit,
            dailyUsed,
            dailyRemaining,
            message: formatRefeicaoLimitLabel(dailyLimit),
        };
    }

    return {
        canProceed: true,
        reason: null,
        balance,
        dailyLimit,
        dailyUsed,
        dailyRemaining,
        message: '',
    };
};

const formatDateTime = (value) => formatBrazilDateTime(value ?? new Date());

const formatDate = (value) => {
    if (!value) {
        return '--';
    }

    return formatBrazilDate(value);
};

const isBarcodeTerm = (value) => {
    const term = String(value ?? '').trim();

    return numericRegex.test(term) && term.length >= BARCODE_MIN_LENGTH;
};

const parseWeightedBarcode = (value) => {
    const barcode = String(value ?? '').trim();

    if (
        !numericRegex.test(barcode) ||
        !barcode.startsWith(WEIGHTED_BARCODE_PREFIX) ||
        barcode.length !== WEIGHTED_BARCODE_LENGTH
    ) {
        return null;
    }

    const productId = Number.parseInt(barcode.slice(1, 5), 10);
    const encodedValue = barcode.slice(7, 12);
    const unitPrice = Number.parseInt(encodedValue, 10) / 100;

    if (!Number.isFinite(productId) || productId <= 0 || !Number.isFinite(unitPrice)) {
        return null;
    }

    return {
        barcode,
        productId,
        unitPrice,
    };
};

const resolveDirectProductLookup = (value) => {
    const term = String(value ?? '').trim();

    if (!numericRegex.test(term)) {
        return null;
    }

    const weightedBarcodeData = parseWeightedBarcode(term);

    if (weightedBarcodeData) {
        return {
            query: String(weightedBarcodeData.productId),
            cacheKey: `id:${weightedBarcodeData.productId}`,
            weightedBarcodeData,
        };
    }

    if (isBarcodeTerm(term)) {
        return {
            query: term,
            cacheKey: `barcode:${term}`,
            weightedBarcodeData: null,
        };
    }

    const productId = Number.parseInt(term, 10);

    if (!Number.isFinite(productId) || productId <= 0) {
        return null;
    }

    return {
        query: String(productId),
        cacheKey: `id:${productId}`,
        weightedBarcodeData: null,
    };
};

const resolveComandaCode = (value) => {
    const term = String(value ?? '').trim();

    if (!numericRegex.test(term)) {
        return null;
    }

    const code = Number.parseInt(term, 10);

    return code >= COMANDA_MIN_CODE && code <= COMANDA_MAX_CODE ? code : null;
};

const cacheDirectProductLookup = (cache, product) => {
    if (!cache || !product) {
        return;
    }

    const productId = Number(product.tb1_id);
    const productBarcode = String(product.tb1_codbar ?? '').trim();

    if (Number.isFinite(productId) && productId > 0) {
        cache.set(`id:${productId}`, product);
    }

    if (productBarcode !== '') {
        cache.set(`barcode:${productBarcode}`, product);
    }
};

export default function Dashboard({
    quickLookupProducts = [],
    quickLookupProductsVersion = 1,
    masterSwitchOptions = null,
    dashboardContraChequeSummary = null,
}) {
    const pageProps = usePage().props;
    const { auth } = pageProps;
    const effectiveRole = Number(auth?.user?.funcao ?? -1);
    const csrfTokenProp = pageProps?.csrf_token ?? '';
    const activeUnitName = auth?.unit?.name ?? '';
    const activeUnitAddress = auth?.unit?.address ?? auth?.unit?.tb2_endereco ?? '';
    const activeUnitCnpj = auth?.unit?.cnpj ?? auth?.unit?.tb2_cnpj ?? '';

    const [texto, setTexto] = useState('');
    const inputRef = useRef(null);
    const inputIdleTimeoutRef = useRef(null);
    const [suggestions, setSuggestions] = useState([]);
    const [hideSuggestions, setHideSuggestions] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [searchTrigger, setSearchTrigger] = useState(0);
    const [lastManualSearch, setLastManualSearch] = useState(false);
    const lastTriggerConsumed = useRef(0);
    const directProductLookupCache = useRef(new Map());
    const [quickLookupProductsState, setQuickLookupProductsState] = useState(() =>
        Array.isArray(quickLookupProducts) ? quickLookupProducts : [],
    );
    const [quickLookupVersion, setQuickLookupVersion] = useState(() => {
        const version = Number(quickLookupProductsVersion);

        return Number.isFinite(version) && version > 0 ? version : 1;
    });
    const quickLookupVersionRef = useRef(
        Number.isFinite(Number(quickLookupProductsVersion)) && Number(quickLookupProductsVersion) > 0
            ? Number(quickLookupProductsVersion)
            : 1,
    );

    const [items, setItems] = useState([]);
    const [addingItem, setAddingItem] = useState(false);
    const [saleLoading, setSaleLoading] = useState(false);
    const [saleError, setSaleError] = useState('');
    const [valePickerVisible, setValePickerVisible] = useState(false);
    const [valeSearchTerm, setValeSearchTerm] = useState('');
    const [valeResults, setValeResults] = useState([]);
    const [selectedValeType, setSelectedValeType] = useState('vale');
    const [valeLoading, setValeLoading] = useState(false);
    const [receiptData, setReceiptData] = useState(null);
    const [showReceipt, setShowReceipt] = useState(false);
    const [transmittingFiscal, setTransmittingFiscal] = useState(false);
    const [showConsumerFiscalModal, setShowConsumerFiscalModal] = useState(false);
    const [consumerFiscalLoading, setConsumerFiscalLoading] = useState(false);
    const [consumerFiscalErrors, setConsumerFiscalErrors] = useState({});
    const [consumerFiscalForm, setConsumerFiscalForm] = useState(DEFAULT_FISCAL_CONSUMER_FORM);
    const [cashInputVisible, setCashInputVisible] = useState(false);
    const [cashValue, setCashValue] = useState('');
    const [cashCardType, setCashCardType] = useState('');
    const [showFaturarWarning, setShowFaturarWarning] = useState(false);
    const cashInputRef = useRef(null);
    const [savedCarts, setSavedCarts] = useState([]);
    const [favoriteProducts, setFavoriteProducts] = useState([]);
    const [showChangeCard, setShowChangeCard] = useState(false);
    const [openComandasList, setOpenComandasList] = useState([]);
    const [showComandasButtons, setShowComandasButtons] = useState(false);
    const [comandaLoading, setComandaLoading] = useState(false);
    const [selectedComandaCode, setSelectedComandaCode] = useState(null);
    const [cashierRestrictions, setCashierRestrictions] = useState(null);
    const [cashierRestrictionsLoading, setCashierRestrictionsLoading] = useState(false);
    const [selectedMasterUnitId, setSelectedMasterUnitId] = useState(
        masterSwitchOptions?.currentUnitId ?? null,
    );
    const [selectedMasterRole, setSelectedMasterRole] = useState(null);
    const [masterSwitchSubmitting, setMasterSwitchSubmitting] = useState(false);
    const lastAutoOpenComandasKey = useRef('');
    const quantityHoldTimeoutRef = useRef(null);
    const quantityHoldIntervalRef = useRef(null);

    useEffect(() => {
        setQuickLookupProductsState(Array.isArray(quickLookupProducts) ? quickLookupProducts : []);

        const version = Number(quickLookupProductsVersion);
        const normalizedVersion = Number.isFinite(version) && version > 0 ? version : 1;

        setQuickLookupVersion(normalizedVersion);
        quickLookupVersionRef.current = normalizedVersion;
    }, [quickLookupProducts, quickLookupProductsVersion]);

    useEffect(() => {
        directProductLookupCache.current.clear();

        if (!Array.isArray(quickLookupProductsState) || quickLookupProductsState.length === 0) {
            return;
        }

        quickLookupProductsState.forEach((product) => {
            cacheDirectProductLookup(directProductLookupCache.current, product);
        });
    }, [quickLookupProductsState]);

    useEffect(() => {
        quickLookupVersionRef.current = quickLookupVersion;
    }, [quickLookupVersion]);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return undefined;
        }

        let isMounted = true;
        let isSyncing = false;

        const syncQuickLookupSnapshot = () => {
            if (isSyncing) {
                return;
            }

            isSyncing = true;

            fetch(route('products.quick-lookup.snapshot', { version: quickLookupVersionRef.current }), {
                headers: {
                    Accept: 'application/json',
                },
            })
                .then((response) => {
                    return response.json().then((data) => {
                        if (!response.ok) {
                            throw new Error(data?.message || 'Nao foi possivel sincronizar os produtos.');
                        }

                        return data;
                    });
                })
                .then((data) => {
                    if (!isMounted) {
                        return;
                    }

                    const nextVersion = Number(data?.version);

                    if (Number.isFinite(nextVersion) && nextVersion > 0) {
                        quickLookupVersionRef.current = nextVersion;
                        setQuickLookupVersion(nextVersion);
                    }

                    if (!data?.changed) {
                        return;
                    }

                    setQuickLookupProductsState(Array.isArray(data?.products) ? data.products : []);
                })
                .catch(() => {
                    // Mantem o cache atual quando a verificacao automatica falhar.
                })
                .finally(() => {
                    isSyncing = false;
                });
        };

        syncQuickLookupSnapshot();

        const intervalId = window.setInterval(syncQuickLookupSnapshot, QUICK_LOOKUP_SYNC_INTERVAL_MS);

        return () => {
            isMounted = false;
            window.clearInterval(intervalId);
        };
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        const storedItems = window.localStorage.getItem(ITEMS_STORAGE_KEY);

        if (!storedItems) {
            return;
        }

        try {
            const parsed = JSON.parse(storedItems);

            if (Array.isArray(parsed) && parsed.length > 0) {
                setItems(parsed.map((item) => normalizeCartItem(item)));
            }
        } catch (storageError) {
            console.error('Failed to parse stored sale items', storageError);
            window.localStorage.removeItem(ITEMS_STORAGE_KEY);
        }
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        if (items.length === 0) {
            window.localStorage.removeItem(ITEMS_STORAGE_KEY);
            return;
        }

        window.localStorage.setItem(ITEMS_STORAGE_KEY, JSON.stringify(items));
    }, [items]);

    const clearQuantityHold = useCallback(() => {
        if (typeof window === 'undefined') {
            return;
        }

        if (quantityHoldTimeoutRef.current !== null) {
            window.clearTimeout(quantityHoldTimeoutRef.current);
            quantityHoldTimeoutRef.current = null;
        }

        if (quantityHoldIntervalRef.current !== null) {
            window.clearInterval(quantityHoldIntervalRef.current);
            quantityHoldIntervalRef.current = null;
        }
    }, []);

    useEffect(() => () => clearQuantityHold(), [clearQuantityHold]);

    const totalAmount = useMemo(
        () => items.reduce((sum, item) => sum + item.quantity * item.price, 0),
        [items],
    );

    const numericCashValue = useMemo(() => {
        if (!cashValue) {
            return 0;
        }

        const normalized = String(cashValue).replace(',', '.');
        const parsed = Number(normalized);
        return Number.isNaN(parsed) ? 0 : parsed;
    }, [cashValue]);

    const cashChange = useMemo(() => {
        if (items.length === 0) {
            return 0;
        }

        return Math.max(0, numericCashValue - totalAmount);
    }, [items.length, numericCashValue, totalAmount]);

    const cashCardComplement = useMemo(() => {
        if (items.length === 0) {
            return 0;
        }

        return Math.max(0, totalAmount - numericCashValue);
    }, [items.length, numericCashValue, totalAmount]);
    const visiblePaymentOptions = useMemo(() => {
        if (cashInputVisible && cashCardComplement > 0) {
            // O complemento em dinheiro já oferece Pix no bloco de caixa.
            return paymentOptions.filter((option) => option.value !== 'pix');
        }

        return paymentOptions;
    }, [cashCardComplement, cashInputVisible]);
    const totalItems = useMemo(
        () => items.reduce((sum, item) => sum + (item.quantity ?? 0), 0),
        [items],
    );
    const isMaster = effectiveRole === 0;
    const isSubManager = effectiveRole === 2;
    const isCashier = effectiveRole === 3;
    const canLaunchSales = isCashier;
    const masterUnitOptions = useMemo(
        () => (Array.isArray(masterSwitchOptions?.units) ? masterSwitchOptions.units : []),
        [masterSwitchOptions],
    );
    const masterRoleOptions = useMemo(
        () => (Array.isArray(masterSwitchOptions?.roles) ? masterSwitchOptions.roles : []),
        [masterSwitchOptions],
    );
    const canQuickSwitch = Boolean(masterSwitchOptions);
    const currentMasterUnitName = masterSwitchOptions?.currentUnitName ?? activeUnitName ?? '---';
    const currentMasterRoleLabel = masterSwitchOptions?.currentRoleLabel ?? '---';
    const pendingComandas = useMemo(() => {
        const list = cashierRestrictions?.pending_comandas;
        if (!Array.isArray(list)) {
            return [];
        }

        return list
            .map((value) => Number(value))
            .filter((value) => !Number.isNaN(value));
    }, [cashierRestrictions]);
    const hasPendingComandas = pendingComandas.length > 0;
    const pendingClosureDate = cashierRestrictions?.pending_closure_date ?? null;
    const requiresClosure = Boolean(cashierRestrictions?.requires_closure);
    const isPendingComandaSelected =
        selectedComandaCode !== null && pendingComandas.includes(selectedComandaCode);
    const isSalesBlocked =
        isCashier &&
        ((hasPendingComandas && !isPendingComandaSelected) ||
            (requiresClosure && selectedComandaCode === null));
    const pendingComandasLabel = pendingComandas.join(', ');
    const closureBlockMessage = requiresClosure
        ? `Fechamento pendente${
              pendingClosureDate ? ` em ${formatDate(pendingClosureDate)}` : ''
          }. ${
              hasPendingComandas
                  ? 'Conclua o fechamento do caixa apos receber as pendencias.'
                  : 'Conclua o fechamento do caixa para continuar.'
          }`
        : '';
    const pendingComandaMessage = hasPendingComandas
        ? `Comanda${
              pendingComandas.length > 1 ? 's' : ''
          } pendente${
              pendingComandas.length > 1 ? 's' : ''
          } de dia anterior: ${pendingComandasLabel}. Receba apenas ${
              pendingComandas.length > 1 ? 'as comandas' : 'a comanda'
          } pendente${pendingComandas.length > 1 ? 's' : ''}.`
        : '';
    const blockedSaleMessage = useMemo(() => {
        if (requiresClosure && !hasPendingComandas) {
            return closureBlockMessage;
        }
        if (hasPendingComandas && !isPendingComandaSelected) {
            return pendingComandaMessage;
        }
        if (requiresClosure) {
            return closureBlockMessage;
        }
        return '';
    }, [
        closureBlockMessage,
        hasPendingComandas,
        isPendingComandaSelected,
        pendingComandaMessage,
        requiresClosure,
    ]);

    useEffect(() => {
        if (saleLoading || isSalesBlocked) {
            clearQuantityHold();
        }
    }, [clearQuantityHold, isSalesBlocked, saleLoading]);

    const visibleComandasList = useMemo(() => {
        if (!hasPendingComandas) {
            return openComandasList;
        }

        return openComandasList.filter((comanda) =>
            pendingComandas.includes(comanda.codigo),
        );
    }, [hasPendingComandas, openComandasList, pendingComandas]);
    const openComandasDisplayAmount = useMemo(
        () =>
            visibleComandasList.reduce(
                (sum, comanda) => sum + Number(comanda.total ?? 0),
                0,
            ),
        [visibleComandasList],
    );
    const openComandasDisplayCount = visibleComandasList.length;
    const shouldFocusComandas =
        isCashier &&
        (requiresClosure || hasPendingComandas) &&
        visibleComandasList.length > 0;
    const autoOpenComandasKey = `${requiresClosure ? '1' : '0'}-${pendingComandasLabel}-${openComandasDisplayCount}`;

    useEffect(() => {
        setSelectedMasterUnitId(masterSwitchOptions?.currentUnitId ?? null);
        setSelectedMasterRole(null);
        setMasterSwitchSubmitting(false);
    }, [masterSwitchOptions?.currentRole, masterSwitchOptions?.currentUnitId]);

    const submitMasterSwitch = useCallback(
        (unitId, role) => {
            const normalizedUnitId = Number(unitId);
            const normalizedRole = Number(role);

            if (
                !canQuickSwitch ||
                masterSwitchSubmitting ||
                Number.isNaN(normalizedUnitId) ||
                Number.isNaN(normalizedRole)
            ) {
                return;
            }

            setMasterSwitchSubmitting(true);

            router.post(
                route('reports.switch-unit.update'),
                {
                    unit_id: normalizedUnitId,
                    role: normalizedRole,
                },
                {
                    preserveScroll: true,
                    onFinish: () => {
                        setMasterSwitchSubmitting(false);
                    },
                },
            );
        },
        [canQuickSwitch, masterSwitchSubmitting],
    );

    const handleMasterUnitSelect = useCallback(
        (unitId) => {
            const normalizedUnitId = Number(unitId);

            if (Number.isNaN(normalizedUnitId) || masterSwitchSubmitting) {
                return;
            }

            setSelectedMasterUnitId(normalizedUnitId);

            if (selectedMasterRole !== null) {
                submitMasterSwitch(normalizedUnitId, selectedMasterRole);
            }
        },
        [masterSwitchSubmitting, selectedMasterRole, submitMasterSwitch],
    );

    const handleMasterRoleSelect = useCallback(
        (roleValue) => {
            const normalizedRole = Number(roleValue);

            if (Number.isNaN(normalizedRole) || masterSwitchSubmitting) {
                return;
            }

            setSelectedMasterRole(normalizedRole);

            if (selectedMasterUnitId !== null) {
                submitMasterSwitch(selectedMasterUnitId, normalizedRole);
            }
        },
        [masterSwitchSubmitting, selectedMasterUnitId, submitMasterSwitch],
    );

    const renderMasterSwitch = useCallback(
        (option, kind) => {
            const optionId = kind === 'unit' ? Number(option.id) : Number(option.value);
            const selected =
                kind === 'unit'
                    ? selectedMasterUnitId === optionId
                    : selectedMasterRole === optionId;
            const isCurrent = Boolean(option.active);
            const isInactiveUnit = kind === 'unit' && Number(option.status ?? 1) !== 1;
            const label = kind === 'unit' ? option.name : option.label;
            const switchStyle =
                kind === 'unit' ? getUnitBadgeStyle(label) : getRoleBadgeStyle(label);

            return (
                <button
                    key={`${kind}-${optionId}`}
                    type="button"
                    onClick={() =>
                        kind === 'unit'
                            ? handleMasterUnitSelect(optionId)
                            : handleMasterRoleSelect(optionId)
                    }
                    disabled={masterSwitchSubmitting}
                    className="flex items-center gap-3 rounded-2xl border border-transparent px-1 py-1 text-left transition hover:border-gray-200 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:border-gray-700"
                >
                    <span
                        className="relative inline-flex h-7 w-12 shrink-0 rounded-full border transition duration-200"
                        style={{
                            backgroundColor: selected ? switchStyle.backgroundColor : '#cbd5e1',
                            borderColor: selected ? switchStyle.borderColor : '#cbd5e1',
                        }}
                    >
                        <span
                            className={`pointer-events-none absolute top-[2px] h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${
                                selected ? 'translate-x-6' : 'translate-x-[2px]'
                            }`}
                        ></span>
                    </span>
                    <span className="flex items-center gap-2">
                        <span className="text-sm font-semibold uppercase tracking-wide text-gray-800 dark:text-gray-100">
                            {kind === 'unit'
                                ? formatUnitBadgeLabel(label)
                                : formatRoleBadgeLabel(label)}
                        </span>
                        {isCurrent && (
                            <span className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
                                Atual
                            </span>
                        )}
                        {isInactiveUnit && (
                            <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-600 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-100">
                                Inativa
                            </span>
                        )}
                    </span>
                </button>
            );
        },
        [
            handleMasterRoleSelect,
            handleMasterUnitSelect,
            masterSwitchSubmitting,
            selectedMasterRole,
            selectedMasterUnitId,
        ],
    );

    const hasVrRestrictions = useMemo(
        () => items.some((item) => !item.vrEligible),
        [items],
    );
    const canUseRefeicao = useMemo(
        () => items.length > 0 && !hasVrRestrictions,
        [items.length, hasVrRestrictions],
    );
    useEffect(() => {
        if (
            effectiveRole === 4 &&
            typeof route === 'function' &&
            route().has &&
            route().has('lanchonete.terminal') &&
            !route().current('lanchonete.terminal')
        ) {
            router.visit(route('lanchonete.terminal'));
            return;
        }
        inputRef.current?.focus();
    }, [effectiveRole]);
    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        const storedCarts = window.localStorage.getItem(SAVED_CARTS_STORAGE_KEY);

        if (!storedCarts) {
            return;
        }

        try {
            const parsed = JSON.parse(storedCarts);

            if (Array.isArray(parsed) && parsed.length > 0) {
                setSavedCarts(parsed);
            }
        } catch (storageError) {
            console.error('Failed to parse saved carts', storageError);
            window.localStorage.removeItem(SAVED_CARTS_STORAGE_KEY);
        }
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        if (savedCarts.length === 0) {
            window.localStorage.removeItem(SAVED_CARTS_STORAGE_KEY);
            return;
        }

        window.localStorage.setItem(
            SAVED_CARTS_STORAGE_KEY,
            JSON.stringify(savedCarts),
        );
    }, [savedCarts]);

    useEffect(() => {
        let isMounted = true;

        fetch(route('products.favorites'), {
            headers: {
                Accept: 'application/json',
            },
        })
            .then((response) => {
                if (!response.ok) {
                    throw new Error('Falha ao carregar favoritos');
                }

                return response.json();
            })
            .then((data) => {
                if (!isMounted) {
                    return;
                }

                setFavoriteProducts(
                    Array.isArray(data)
                        ? data.map((product) => ({
                              ...product,
                              tb1_vr_credit: Boolean(product.tb1_vr_credit),
                          }))
                        : [],
                );
            })
            .catch(() => {
                if (!isMounted) {
                    return;
                }

                setFavoriteProducts([]);
            });

        return () => {
            isMounted = false;
        };
    }, []);

    const refreshDashboardStatus = useCallback(
        async (signal) => {
            const response = await axios.get(route('sales.dashboard-status'), { signal });
            const data = response.data ?? {};
            const nextComandas = Array.isArray(data.comandas) ? data.comandas : [];

            setOpenComandasList(nextComandas);
            setCashierRestrictions(
                isCashier
                    ? {
                          requires_closure: Boolean(data.requires_closure),
                          pending_closure_date: data.pending_closure_date ?? null,
                          pending_comandas: Array.isArray(data.pending_comandas)
                              ? data.pending_comandas
                              : [],
                      }
                    : null,
            );

            return data;
        },
        [isCashier],
    );

    useEffect(() => {
        if (typeof window === 'undefined') {
            return undefined;
        }

        let isMounted = true;
        let currentController = null;

        const loadDashboardStatus = () => {
            currentController?.abort();

            const controller = new AbortController();
            currentController = controller;
            setCashierRestrictionsLoading(isCashier);

            refreshDashboardStatus(controller.signal)
                .catch((error) => {
                    if (axios.isCancel(error) || error?.code === 'ERR_CANCELED') {
                        return;
                    }

                    if (isMounted) {
                        setOpenComandasList([]);
                        if (isCashier) {
                            setCashierRestrictions(null);
                        }
                    }
                })
                .finally(() => {
                    if (isMounted && isCashier) {
                        setCashierRestrictionsLoading(false);
                    }
                });
        };

        loadDashboardStatus();

        const intervalId = window.setInterval(() => {
            loadDashboardStatus();
        }, 60000);

        return () => {
            isMounted = false;
            window.clearInterval(intervalId);
            currentController?.abort();
        };
    }, [isCashier, refreshDashboardStatus]);

    useEffect(() => {
        if (!shouldFocusComandas) {
            return;
        }
        if (autoOpenComandasKey !== lastAutoOpenComandasKey.current) {
            setShowComandasButtons(true);
            lastAutoOpenComandasKey.current = autoOpenComandasKey;
        }
    }, [autoOpenComandasKey, shouldFocusComandas]);

    useEffect(() => {
        const term = texto.trim();
        const isNumericTerm = numericRegex.test(term);
        const hasMinChars = term.length >= MIN_CHARACTERS;
        const forcedSearch = lastTriggerConsumed.current !== searchTrigger;

        if (term.length === 0) {
            setSuggestions([]);
            setError('');
            setLoading(false);
            setLastManualSearch(false);
            if (forcedSearch) {
                lastTriggerConsumed.current = searchTrigger;
            }
            return;
        }

        if (!isNumericTerm && !hasMinChars && !forcedSearch) {
            setSuggestions([]);
            setError('');
            setLoading(false);
            return;
        }

        if (forcedSearch) {
            lastTriggerConsumed.current = searchTrigger;
            setLastManualSearch(true);
        } else {
            setLastManualSearch(false);
        }

        let isCurrent = true;
        setLoading(true);
        setError('');

        // Numeric terms still use the search endpoint, but the backend resolves them by product ID only.
        const searchUrl = route('products.search', { q: term });

        fetch(searchUrl, {
            headers: {
                Accept: 'application/json',
            },
        })
            .then((response) => {
                if (!response.ok) {
                    throw new Error('Falha ao carregar produtos');
                }

                return response.json();
            })
            .then((data) => {
                if (!isCurrent) {
                    return;
                }

                setSuggestions(data);
            })
            .catch(() => {
                if (!isCurrent) {
                    return;
                }

                setError('Nao foi possivel buscar produtos.');
                setSuggestions([]);
            })
            .finally(() => {
                if (!isCurrent) {
                    return;
                }

                setLoading(false);
            });

        return () => {
            isCurrent = false;
        };
    }, [texto, searchTrigger]);

    useEffect(() => {
        if (!valePickerVisible) {
            setValeLoading(false);
            return;
        }

        const term = valeSearchTerm.trim();

        if (term.length < 2) {
            setValeResults([]);
            setValeLoading(false);
            return;
        }

        let isCurrent = true;
        setValeLoading(true);

        fetch(route('users.search', { q: term, scope: 'active_unit' }), {
            headers: {
                Accept: 'application/json',
            },
        })
            .then((response) => {
                if (!response.ok) {
                    throw new Error('Falha ao buscar usuarios');
                }

                return response.json();
            })
            .then((data) => {
                if (!isCurrent) {
                    return;
                }

                setValeResults(data);
            })
            .catch(() => {
                if (!isCurrent) {
                    return;
                }

                setValeResults([]);
            })
            .finally(() => {
                if (!isCurrent) {
                    return;
                }

                setValeLoading(false);
            });

        return () => {
            isCurrent = false;
        };
    }, [valePickerVisible, valeSearchTerm]);

    useEffect(() => {
        if (items.length === 0) {
            setCashInputVisible(false);
            setCashValue('');
            setCashCardType('');
            setShowChangeCard(false);
        }
    }, [items.length]);

    useEffect(() => {
        if (!canUseRefeicao && selectedValeType === 'refeicao') {
            setSelectedValeType('vale');
        }
    }, [canUseRefeicao, selectedValeType]);

    const addItemFromProduct = (
        product,
        { preserveInput = false, unitPrice = null, barcode = null, isWeighted = false } = {},
    ) => {
        if (!product) {
            return;
        }
        if (isSalesBlocked) {
            if (blockedSaleMessage) {
                setSaleError(blockedSaleMessage);
            }
            return;
        }

        setItems((previous) => {
            const productId = Number(product.tb1_id);
            const price = Number(unitPrice ?? product.tb1_vlr_venda ?? 0);
            const cartItemId = createCartItemId(productId, price);
            const existingIndex = previous.findIndex((item) => item.id === cartItemId);

            if (existingIndex !== -1) {
                const updated = [...previous];
                const existing = updated[existingIndex];

                updated[existingIndex] = {
                    ...existing,
                    quantity: existing.quantity + 1,
                    barcode: existing.barcode ?? barcode,
                };

                return updated;
            }

            return [
                ...previous,
                {
                    id: cartItemId,
                    productId,
                    name: product.tb1_nome,
                    price,
                    quantity: 1,
                    barcode,
                    isWeighted,
                    vrEligible: Boolean(product.tb1_vr_credit),
                },
            ];
        });

        setSuggestions([]);
        setSaleError('');
        if (preserveInput) {
            setHideSuggestions(true);
        } else {
            setTexto('');
            setHideSuggestions(false);
        }
        requestAnimationFrame(() => {
            inputRef.current?.focus();
        });
    };
    const handleSelect = (product) => {
        addItemFromProduct(product);
    };

    const incrementItemQuantity = useCallback((itemId) => {
        setItems((prevItems) =>
            prevItems.map((item) =>
                item.id === itemId
                    ? { ...item, quantity: item.quantity + 1 }
                    : item,
            ),
        );
    }, []);

    const decrementItemQuantity = useCallback((itemId) => {
        setItems((prevItems) =>
            prevItems
                .map((item) => {
                    if (item.id !== itemId) {
                        return item;
                    }

                    const nextQuantity = Math.max(item.quantity - 1, 0);
                    return { ...item, quantity: nextQuantity };
                })
                .filter((item) => item.quantity > 0),
        );
    }, []);

    const startQuantityHold = useCallback((itemId, action) => {
        if (saleLoading || isSalesBlocked || typeof window === 'undefined') {
            return;
        }

        clearQuantityHold();
        action(itemId);
        quantityHoldTimeoutRef.current = window.setTimeout(() => {
            quantityHoldIntervalRef.current = window.setInterval(() => {
                action(itemId);
            }, QUANTITY_HOLD_REPEAT_INTERVAL);
        }, QUANTITY_HOLD_INITIAL_DELAY);
    }, [clearQuantityHold, isSalesBlocked, saleLoading]);

    const startIncrementItemQuantityHold = useCallback((itemId) => {
        startQuantityHold(itemId, incrementItemQuantity);
    }, [incrementItemQuantity, startQuantityHold]);

    const startDecrementItemQuantityHold = useCallback((itemId) => {
        startQuantityHold(itemId, decrementItemQuantity);
    }, [decrementItemQuantity, startQuantityHold]);

    const handleIncrementButtonClick = useCallback((event, itemId) => {
        if (event.detail !== 0) {
            return;
        }

        incrementItemQuantity(itemId);
    }, [incrementItemQuantity]);

    const handleDecrementButtonClick = useCallback((event, itemId) => {
        if (event.detail !== 0) {
            return;
        }

        decrementItemQuantity(itemId);
    }, [decrementItemQuantity]);

    const removeItem = (itemId) => {
        setItems((prevItems) => prevItems.filter((item) => item.id !== itemId));
    };

    const fetchProductAndAdd = (lookupTerm) => {
        const lookupData = resolveDirectProductLookup(lookupTerm);

        if (!lookupData) {
            setSaleError('Informe um codigo de barras ou ID numerico.');
            return;
        }

        const { query, cacheKey, weightedBarcodeData } = lookupData;
        const cachedProduct = directProductLookupCache.current.get(cacheKey);

        if (cachedProduct) {
            clearInputIdleTimeout();
            addItemFromProduct(cachedProduct, {
                unitPrice: weightedBarcodeData?.unitPrice ?? null,
                barcode: weightedBarcodeData?.barcode ?? null,
                isWeighted: Boolean(weightedBarcodeData),
            });
            return;
        }

        setAddingItem(true);
        setSaleError('');

        fetch(route('products.quick-lookup', { q: query }), {
            headers: {
                Accept: 'application/json',
            },
        })
            .then((response) => {
                return response.json().then((data) => {
                    if (!response.ok) {
                        throw new Error(data?.message || 'Produto nao encontrado.');
                    }

                    return data;
                });
            })
            .then((product) => {
                cacheDirectProductLookup(directProductLookupCache.current, product);
                clearInputIdleTimeout();
                addItemFromProduct(product, {
                    unitPrice: weightedBarcodeData?.unitPrice ?? null,
                    barcode: weightedBarcodeData?.barcode ?? null,
                    isWeighted: Boolean(weightedBarcodeData),
                });
            })
            .catch((err) => {
                setSaleError(err.message || 'Nao foi possivel adicionar o produto.');
            })
            .finally(() => {
                setAddingItem(false);
            });
    };

    const trimmedText = texto.trim();
    const isNumericInput = numericRegex.test(trimmedText);
    const hasMinChars = trimmedText.length >= MIN_CHARACTERS;
    const showSuggestions =
        !hideSuggestions &&
        trimmedText.length > 0 &&
        (isNumericInput || hasMinChars || lastManualSearch) &&
        (!isNumericInput || suggestions.length > 0 || loading || error);

    const clearInputIdleTimeout = useCallback(() => {
        if (inputIdleTimeoutRef.current) {
            clearTimeout(inputIdleTimeoutRef.current);
            inputIdleTimeoutRef.current = null;
        }
    }, []);

    const scheduleInputReset = useCallback(
        (value) => {
            clearInputIdleTimeout();

            if (typeof window === 'undefined' || typeof document === 'undefined') {
                return;
            }

            const trimmedValue = String(value ?? '').trim();

            if (!trimmedValue) {
                return;
            }

            if (!numericRegex.test(trimmedValue)) {
                return;
            }

            inputIdleTimeoutRef.current = window.setTimeout(() => {
                if (!inputRef.current) {
                    return;
                }
                setTexto('');
                setLastManualSearch(false);
                setHideSuggestions(false);
                requestAnimationFrame(() => {
                    inputRef.current?.focus();
                });
            }, 2000);
        },
        [clearInputIdleTimeout],
    );

    useEffect(() => {
        return () => {
            clearInputIdleTimeout();
        };
    }, [clearInputIdleTimeout]);

    const handleInputChange = (event) => {
        const nextValue = event.target.value;
        setTexto(nextValue);
        setLastManualSearch(false);
        setHideSuggestions(false);
        scheduleInputReset(nextValue);
    };

    const handleKeyDown = (event) => {
        if (event.key !== 'Enter' || saleLoading || addingItem || comandaLoading) {
            return;
        }

        const term = texto.trim();
        const isNumericTerm = numericRegex.test(term);
        const hasMin = term.length >= MIN_CHARACTERS;

        if (!term) {
            return;
        }

        if (isNumericTerm) {
            event.preventDefault();
            const comandaCode = resolveComandaCode(term);

            if (comandaCode !== null) {
                handleLoadComandaItems(comandaCode);
                return;
            }

            fetchProductAndAdd(term);
            return;
        }

        if (!hasMin) {
            event.preventDefault();
            setSearchTrigger((prev) => prev + 1);
        }
    };

    const resetValePicker = () => {
        setValePickerVisible(false);
        setValeSearchTerm('');
        setValeResults([]);
        setValeLoading(false);
        setSelectedValeType('vale');
    };

    const handleCashValueChange = (event) => {
        setCashValue(event.target.value);
        setSaleError('');
    };

    const handleCashInputKeyDown = (event) => {
        if (event.key !== 'Enter') {
            return;
        }

        if (saleLoading) {
            return;
        }

        if (numericCashValue <= 0) {
            setSaleError('Informe o valor recebido em dinheiro para finalizar.');
            return;
        }

        if (cashCardComplement > 0 && !cashCardType) {
            setSaleError('Selecione se o restante sera no credito, no debito ou no Pix.');
            return;
        }

        finalizeSale('dinheiro', {
            cashAmount: numericCashValue,
            cardType: cashCardComplement > 0 ? cashCardType : null,
        });
    };

    const closeFaturarWarning = () => {
        setShowFaturarWarning(false);
    };

    const finalizeSale = (
        type,
        { valeUserId = null, valeType = null, cashAmount = null, cardType = null } = {},
    ) => {
        if (isSalesBlocked) {
            if (blockedSaleMessage) {
                setSaleError(blockedSaleMessage);
            }
            return;
        }
        if (items.length === 0) {
            setSaleError('Adicione pelo menos um item antes de finalizar.');
            return;
        }

        setSaleLoading(true);
        setSaleError('');
        const payload = {
            _token: csrfTokenProp,
            tipo_pago: type,
            vale_user_id: valeUserId,
            vale_type: type === 'vale' ? valeType : null,
            valor_pago: cashAmount,
            card_type: cardType,
        };

        if (selectedComandaCode !== null) {
            payload.comanda_codigo = selectedComandaCode;
            payload.items = items.map((item) => ({
                product_id: item.productId,
                quantity: item.quantity,
                barcode: item.barcode ?? null,
                unit_price: item.price,
            }));
        } else {
            payload.items = items.map((item) => ({
                product_id: item.productId,
                quantity: item.quantity,
                barcode: item.barcode ?? null,
            }));
        }

        axios
            .post(route('sales.store'), payload)
            .then((response) => {
                const data = response.data;
                const unitFromAuth = auth?.unit ?? {};
                const unitName =
                    data.sale.unit_name ?? unitFromAuth.name ?? '';
                const unitAddress =
                    data.sale.unit_address ??
                    unitFromAuth.address ??
                    unitFromAuth.tb2_endereco ??
                    '';
                const unitCnpj =
                    data.sale.unit_cnpj ??
                    unitFromAuth.cnpj ??
                    unitFromAuth.tb2_cnpj ??
                    '';
                setReceiptData({
                    ...data.sale,
                    unit_name: unitName,
                    unit_address: unitAddress,
                    unit_cnpj: unitCnpj,
                    payment_label: paymentLabels[data.sale.tipo_pago] ?? data.sale.tipo_pago,
                });
                setShowReceipt(true);
                resetValePicker();
                setCashInputVisible(false);
                setCashValue('');
                setCashCardType('');
                if (selectedComandaCode !== null) {
                    setSelectedComandaCode(null);
                    setItems([]);
                }
                refreshDashboardStatus().catch(() => {});
            })
            .catch((error) => {
                let message = 'Falha ao registrar a venda.';

                if (error.response?.data) {
                    const data = error.response.data;
                    if (data.message) {
                        message = data.message;
                    } else if (data.errors) {
                        const firstError = Object.values(data.errors).flat()[0];
                        if (firstError) {
                            message = firstError;
                        }
                    }
                } else if (error.message) {
                    message = error.message;
                }

                setSaleError(message);
            })
            .finally(() => {
                setSaleLoading(false);
            });
    };

    const proceedWithPayment = (type) => {
        if (saleLoading) {
            return;
        }
        if (isSalesBlocked) {
            if (blockedSaleMessage) {
                setSaleError(blockedSaleMessage);
            }
            return;
        }

        if (items.length === 0) {
            setSaleError('Adicione pelo menos um item antes de escolher o pagamento.');
            return;
        }

        if (type === 'vale') {
            setCashInputVisible(false);
            setCashValue('');
            setCashCardType('');
            setValePickerVisible(true);
            setValeSearchTerm('');
            setValeResults([]);
            setSelectedValeType('vale');
            setSaleError('');
            return;
        }

        if (type === 'dinheiro') {
            resetValePicker();
            setSaleError('');
            if (!cashInputVisible) {
                setCashInputVisible(true);
                setCashCardType('');
                setShowChangeCard(true);
                requestAnimationFrame(() => {
                    cashInputRef.current?.focus();
                });
                return;
            }

            if (numericCashValue <= 0) {
                setSaleError('Informe o valor recebido em dinheiro e pressione Enter.');
                cashInputRef.current?.focus();
                return;
            }

            if (cashCardComplement > 0 && !cashCardType) {
                setSaleError('Selecione se o restante sera no credito, no debito ou no Pix.');
                return;
            }

            finalizeSale('dinheiro', {
                cashAmount: numericCashValue,
                cardType: cashCardComplement > 0 ? cashCardType : null,
            });
            return;
        }

        resetValePicker();
        setCashInputVisible(false);
        setShowChangeCard(false);
        setCashValue('');
        setCashCardType('');
        finalizeSale(type);
    };

    const handlePaymentClick = (type) => {
        if (type === 'faturar') {
            if (saleLoading) {
                return;
            }
            if (isSalesBlocked) {
                if (blockedSaleMessage) {
                    setSaleError(blockedSaleMessage);
                }
                return;
            }
            if (items.length === 0) {
                setSaleError('Adicione pelo menos um item antes de escolher o pagamento.');
                return;
            }

            setSaleError('');
            setShowFaturarWarning(true);
            return;
        }

        proceedWithPayment(type);
    };

    const handleFaturarWarningChoice = (type) => {
        closeFaturarWarning();
        proceedWithPayment(type);
    };

    const handleLoadComandaItems = (codigo) => {
        clearInputIdleTimeout();
        if (isCashier && hasPendingComandas && !pendingComandas.includes(codigo)) {
            if (pendingComandaMessage) {
                setSaleError(pendingComandaMessage);
            }
            return;
        }
        setComandaLoading(true);
        axios
            .get(route('sales.comandas.items', { codigo }))
            .then((response) => {
                const data = response.data ?? {};
                const mapped = Array.isArray(data.items)
                    ? data.items.map((item) => ({
                          id: item.line_id ?? createCartItemId(item.product_id ?? item.id, item.price),
                          productId: Number(item.product_id ?? item.id ?? 0),
                          name: item.name,
                          price: Number(item.price ?? 0),
                          quantity: Number(item.quantity ?? 0),
                          barcode: item.barcode ?? null,
                          isWeighted: Boolean(item.is_weighted ?? false),
                          vrEligible: true,
                          lancUserName: item.lanc_user_name,
                      }))
                    : [];
                setItems(mapped);
                setSelectedComandaCode(codigo);
                setTexto('');
                setLastManualSearch(false);
                setHideSuggestions(false);
                setSuggestions([]);
                setSaleError('');
                setShowComandasButtons(false);
                refreshDashboardStatus().catch(() => {});
            })
            .catch(() => {
                setSaleError('Nao foi possivel carregar os itens da comanda.');
            })
            .finally(() => {
                setComandaLoading(false);
            });
    };

    const handleSelectValeUser = (user) => {
        if (selectedValeType === 'refeicao' && !canUseRefeicao) {
            setSaleError('Há itens que não podem ser pagos com VR Crédito.');
            return;
        }

        if (selectedValeType === 'refeicao') {
            const validation = resolveRefeicaoValidation(user, totalAmount);

            if (!validation.canProceed) {
                setSaleError(validation.message);
                return;
            }
        }

        finalizeSale('vale', { valeUserId: user.id, valeType: selectedValeType });
    };

    const handlePrintReceipt = () => {
        if (!receiptData) {
            return;
        }

        const printWindow = window.open('', '_blank', 'width=400,height=600');

        if (!printWindow) {
            setSaleError('Permita pop-ups para imprimir o cupom.');
            return;
        }

        const receiptUnitName =
            receiptData.unit_name || activeUnitName || 'Registro de venda';
        const receiptUnitAddress =
            receiptData.unit_address || activeUnitAddress;
        const receiptUnitCnpj = receiptData.unit_cnpj || activeUnitCnpj;
        printWindow.document.write(buildReceiptHtml({
            ...receiptData,
            unit_name: receiptUnitName,
            unit_address: receiptUnitAddress,
            unit_cnpj: receiptUnitCnpj,
        }));
        printWindow.document.close();
        printWindow.focus();
        printWindow.print();
        printWindow.close();
        resetAfterReceipt();
    };

    const handlePrintFiscalReceipt = () => {
        if (!receiptData?.fiscal) {
            return;
        }

        const printWindow = window.open('', '_blank', 'width=420,height=760');

        if (!printWindow) {
            setSaleError('Permita pop-ups para imprimir o cupom fiscal.');
            return;
        }

        const fiscalConsumer = receiptData.fiscal.consumer ?? null;
        const fiscalItems = resolveFiscalReceiptItems(receiptData);
        const fiscalConsumerType = resolveFiscalConsumerType(fiscalConsumer);
        const fiscalConsumerAddress = isFullConsumerFiscalType(fiscalConsumer)
            ? [
                fiscalConsumer?.street,
                fiscalConsumer?.number,
                fiscalConsumer?.complement,
                fiscalConsumer?.neighborhood,
                fiscalConsumer?.city,
                fiscalConsumer?.state,
                fiscalConsumer?.cep,
            ].filter(Boolean).join(', ')
            : null;
        const fiscalReceiptPayload = {
            title: 'DANFE NFC-e',
            subtitle: 'Documento Auxiliar da Nota Fiscal de Consumidor Eletronica',
            emitter_name: receiptData.unit_name || activeUnitName || 'EMITENTE NAO INFORMADO',
            emitter_legal_name: receiptData.unit_name || activeUnitName || null,
            emitter_document: receiptData.unit_cnpj || activeUnitCnpj || null,
            emitter_address: receiptData.unit_address || activeUnitAddress || null,
            payment_id: resolveReceiptId(receiptData),
            model_label: (receiptData.fiscal.modelo || 'NF').toUpperCase(),
            environment: receiptData.fiscal.ambiente === 'producao' ? 'Producao' : 'Homologacao',
            serie: receiptData.fiscal.serie || '--',
            number: receiptData.fiscal.numero || '--',
            status: receiptData.fiscal.status || '--',
            status_message: receiptData.fiscal.mensagem || null,
            issued_at: receiptData.fiscal.emitida_em || receiptData.date_time,
            consumer_type: fiscalConsumerType,
            consumer_name: fiscalConsumerType === 'cupom_fiscal'
                ? 'CPF INFORMADO'
                : (fiscalConsumer?.name || receiptData.fiscal.xml_debug?.dest_name || 'CONSUMIDOR NAO IDENTIFICADO'),
            consumer_document: fiscalConsumer?.document || receiptData.fiscal.xml_debug?.dest_document || null,
            consumer_address: fiscalConsumerAddress,
            payment_label: receiptData.payment_label || '--',
            total: receiptData.total,
            amount_paid: receiptData.payment?.valor_pago,
            change: receiptData.payment?.troco ?? 0,
            additional_payment: receiptData.payment?.dois_pgto ?? 0,
            access_key: receiptData.fiscal.chave_acesso || null,
            protocol: receiptData.fiscal.protocolo || null,
            receipt: receiptData.fiscal.recibo || null,
            consulta_url: null,
            qr_code_data: receiptData.fiscal.xml_debug?.qr_code_data || null,
            is_preview: receiptData.fiscal.status !== 'emitida',
            items: fiscalItems.map((item) => ({
                id: item.product_id ?? item.id ?? null,
                product_name: item.product_name,
                quantity: Number(item.quantity ?? 0),
                unit_price: Number(item.unit_price ?? 0),
                subtotal: Number(item.subtotal ?? 0),
            })),
        };

        printWindow.document.write(buildFiscalReceiptHtml(fiscalReceiptPayload));
        printWindow.document.close();
        printWindow.focus();
        printWindow.addEventListener('afterprint', () => {
            printWindow.close();
        }, { once: true });
    };

    const closeConsumerFiscalModal = () => {
        if (consumerFiscalLoading) {
            return;
        }

        setShowConsumerFiscalModal(false);
        setConsumerFiscalErrors({});
    };

    const handleOpenConsumerFiscalModal = () => {
        if (!receiptData?.fiscal?.id) {
            setSaleError('Nao foi encontrada nota fiscal para identificar o consumidor.');
            return;
        }

        setSaleError('');
        setConsumerFiscalErrors({});
        setConsumerFiscalForm(buildConsumerFiscalForm(receiptData.fiscal.consumer));
        setShowConsumerFiscalModal(true);
    };

    const handleConsumerFiscalFieldChange = (field, value) => {
        setConsumerFiscalForm((current) => {
            const normalizedValue = field === 'state' ? String(value ?? '').toUpperCase().slice(0, 2) : value;
            const next = {
                ...current,
                [field]: normalizedValue,
            };

            if (field === 'type' && normalizedValue === 'cupom_fiscal') {
                next.name = '';
                next.cep = '';
                next.street = '';
                next.number = '';
                next.complement = '';
                next.neighborhood = '';
                next.city = '';
                next.city_code = '';
                next.state = '';
            }

            return next;
        });

        setConsumerFiscalErrors((current) => {
            if (!current[field]) {
                return current;
            }

            const next = { ...current };
            delete next[field];

                return next;
        });
    };

    const handleSubmitConsumerFiscal = async (event) => {
        event.preventDefault();

        const fiscalId = Number(receiptData?.fiscal?.id ?? 0);

        if (!fiscalId || consumerFiscalLoading) {
            return;
        }

        setConsumerFiscalLoading(true);
        setConsumerFiscalErrors({});
        setSaleError('');

        try {
            const response = await axios.post(route('sales.fiscal.consumer', { notaFiscal: fiscalId }), {
                consumer: consumerFiscalForm,
            });
            const payload = response?.data ?? {};

            setReceiptData((current) => (
                current
                    ? {
                        ...current,
                        fiscal: payload.fiscal ?? current.fiscal,
                    }
                    : current
            ));
            setShowConsumerFiscalModal(false);
        } catch (error) {
            const backendErrors = error.response?.data?.errors ?? {};

            if (backendErrors && typeof backendErrors === 'object') {
                const normalizedErrors = {};

                Object.entries(backendErrors).forEach(([key, messages]) => {
                    const normalizedKey = key.startsWith('consumer.') ? key.slice('consumer.'.length) : key;
                    normalizedErrors[normalizedKey] = Array.isArray(messages) ? messages[0] : messages;
                });

                setConsumerFiscalErrors(normalizedErrors);
            }

            let message = `Nao foi possivel preparar ${consumerFiscalForm.type === 'cupom_fiscal' ? 'o cupom fiscal' : 'a NF Consumidor'}.`;

            if (error.response?.data?.message) {
                message = error.response.data.message;
            } else if (error.message) {
                message = error.message;
            }

            setSaleError(message);

            if (error.response?.data?.fiscal) {
                setReceiptData((current) => (
                    current
                        ? {
                            ...current,
                            fiscal: error.response.data.fiscal,
                        }
                        : current
                ));
            }
        } finally {
            setConsumerFiscalLoading(false);
        }
    };

    const handleTransmitFiscal = async () => {
        const fiscalId = Number(receiptData?.fiscal?.id ?? 0);

        if (! fiscalId || transmittingFiscal) {
            return;
        }

        setSaleError('');
        setTransmittingFiscal(true);

        try {
            const response = await axios.post(route('sales.fiscal.transmit', { notaFiscal: fiscalId }));
            const payload = response?.data ?? {};

            setReceiptData((current) => (
                current
                    ? {
                        ...current,
                        fiscal: payload.fiscal ?? current.fiscal,
                    }
                    : current
            ));
        } catch (error) {
            let message = 'Nao foi possivel transmitir a nota fiscal desta venda.';

            if (error.response?.data?.message) {
                message = error.response.data.message;
            } else if (error.message) {
                message = error.message;
            }

            setSaleError(message);

            if (error.response?.data?.fiscal) {
                setReceiptData((current) => (
                    current
                        ? {
                            ...current,
                            fiscal: error.response.data.fiscal,
                        }
                        : current
                ));
            }
        } finally {
            setTransmittingFiscal(false);
        }
    };

    const handleSignAndTransmitFiscal = async () => {
        const paymentId = Number(receiptData?.payment?.id ?? receiptData?.id ?? 0);

        if (! paymentId || transmittingFiscal) {
            return;
        }

        setSaleError('');
        setTransmittingFiscal(true);

        try {
            const response = await axios.post(route('sales.fiscal.sign-transmit-payment', { payment: paymentId }));
            const payload = response?.data ?? {};

            setReceiptData((current) => (
                current
                    ? {
                        ...current,
                        fiscal: payload.fiscal ?? current.fiscal,
                        can_manual_fiscal_transmit: false,
                    }
                    : current
            ));
        } catch (error) {
            let message = 'Nao foi possivel assinar e transmitir a nota fiscal desta venda.';

            if (error.response?.data?.message) {
                message = error.response.data.message;
            } else if (error.message) {
                message = error.message;
            }

            setSaleError(message);

            if (error.response?.data?.fiscal) {
                setReceiptData((current) => (
                    current
                        ? {
                            ...current,
                            fiscal: error.response.data.fiscal,
                            can_manual_fiscal_transmit: false,
                        }
                        : current
                ));
            }
        } finally {
            setTransmittingFiscal(false);
        }
    };

    const resetSaleState = () => {
        setTexto('');
        setSuggestions([]);
        setLastManualSearch(false);
        setItems([]);
        if (typeof window !== 'undefined') {
            window.localStorage.removeItem(ITEMS_STORAGE_KEY);
        }
        setSaleError('');
        resetValePicker();
        setCashInputVisible(false);
        setCashValue('');
        setCashCardType('');
        setHideSuggestions(false);
        requestAnimationFrame(() => {
            inputRef.current?.focus();
        });
    };

    const resetAfterReceipt = () => {
        resetSaleState();
        setReceiptData(null);
        setShowReceipt(false);
        setTransmittingFiscal(false);
        setShowConsumerFiscalModal(false);
        setConsumerFiscalLoading(false);
        setConsumerFiscalErrors({});
        setConsumerFiscalForm(DEFAULT_FISCAL_CONSUMER_FORM);
    };

    const handleCloseReceipt = () => {
        resetAfterReceipt();
    };

    useEffect(() => {
        if (!showReceipt || !receiptData || showConsumerFiscalModal || typeof window === 'undefined') {
            return undefined;
        }

        const handleReceiptShortcut = (event) => {
            if (event.defaultPrevented || event.isComposing) {
                return;
            }

            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                handleCloseReceipt();
                return;
            }

            if (event.key === 'Enter' && !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey) {
                event.preventDefault();
                event.stopPropagation();
                handlePrintReceipt();
            }
        };

        window.addEventListener('keydown', handleReceiptShortcut, true);

        return () => {
            window.removeEventListener('keydown', handleReceiptShortcut, true);
        };
    }, [showReceipt, receiptData, showConsumerFiscalModal, handleCloseReceipt, handlePrintReceipt]);

    useEffect(() => {
        if (
            showReceipt ||
            showConsumerFiscalModal ||
            showFaturarWarning ||
            valePickerVisible ||
            cashInputVisible ||
            typeof window === 'undefined'
        ) {
            return undefined;
        }

        const handlePaymentShortcut = (event) => {
            if (
                event.defaultPrevented ||
                event.repeat ||
                event.isComposing ||
                event.ctrlKey ||
                event.altKey ||
                event.metaKey ||
                event.shiftKey
            ) {
                return;
            }

            const paymentType = PAYMENT_SHORTCUTS.get(String(event.key ?? '').toLowerCase());

            if (!paymentType) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();
            handlePaymentClick(paymentType);
        };

        window.addEventListener('keydown', handlePaymentShortcut, true);

        return () => {
            window.removeEventListener('keydown', handlePaymentShortcut, true);
        };
    }, [
        showReceipt,
        showConsumerFiscalModal,
        showFaturarWarning,
        valePickerVisible,
        cashInputVisible,
        handlePaymentClick,
    ]);

    const handleSaveCart = () => {
        if (items.length === 0) {
            setSaleError('Nenhum item para guardar.');
            return;
        }

        const snapshot = items.map((item) => ({ ...item }));
        const cartId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

        setSavedCarts((prev) => [
            ...prev,
            {
                id: cartId,
                items: snapshot,
                total: totalAmount,
            },
        ]);

        resetSaleState();
    };

    const handleRestoreCart = (cartId) => {
        if (isSalesBlocked) {
            if (blockedSaleMessage) {
                setSaleError(blockedSaleMessage);
            }
            return;
        }
        const targetCart = savedCarts.find((cart) => cart.id === cartId);

        if (!targetCart) {
            return;
        }

        setSavedCarts((prev) => prev.filter((cart) => cart.id !== cartId));
        const sanitizedItems = targetCart.items.map((item) => normalizeCartItem(item));
        setItems(sanitizedItems);
        setSaleError('');
        setTexto('');
        setHideSuggestions(true);
        setCashInputVisible(false);
        setCashValue('');
        setCashCardType('');
        if (typeof window !== 'undefined') {
            window.localStorage.setItem(
                ITEMS_STORAGE_KEY,
                JSON.stringify(sanitizedItems),
            );
        }
        requestAnimationFrame(() => {
            inputRef.current?.focus();
        });
    };

    const handleFavoriteQuickAdd = (product) => {
        addItemFromProduct(product, { preserveInput: true });
    };

    const restrictedHeaderContent = (
        <div className="space-y-1">
            <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">
                Dashboard
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-300">
                Apenas o perfil CAIXA pode realizar lancamentos.
            </p>
        </div>
    );

    const contraChequeShortcutLink = {
        label: 'Contra-cheque',
        icon: 'bi-receipt-cutoff',
        href: route('settings.contra-cheque'),
        employeesCount: Number(dashboardContraChequeSummary?.employees_count ?? 0),
        pendingTotal: Number(dashboardContraChequeSummary?.pending_total ?? 0),
    };

    const subManagerShortcutLinks = [
        { label: 'Usuarios', icon: 'bi-people-fill', href: route('users.index') },
        { label: 'Vale', icon: 'bi-ticket-perforated', href: route('reports.vale') },
        { label: 'Adiantamento', icon: 'bi-wallet2', href: route('salary-advances.index') },
        { label: 'Descarte', icon: 'bi-recycle', href: route('products.discard') },
        contraChequeShortcutLink,
    ];

    const masterShortcutLinks = [
        { label: 'Usuarios', icon: 'bi-people-fill', href: route('users.index') },
        { label: 'Unidades', icon: 'bi-building', href: route('units.index') },
        { label: 'Relatorios', icon: 'bi-clipboard-data', href: route('reports.index') },
        contraChequeShortcutLink,
        { label: 'AnyDesck', icon: 'bi-pc-display', href: route('settings.anydesck') },
    ];

    const restrictedShortcutLinks = isSubManager
        ? subManagerShortcutLinks
        : (isMaster ? masterShortcutLinks : []);

    const restrictedShortcutRoleLabel = isSubManager ? 'SUB-GERENTE' : 'MASTER';

    const renderRestrictedShortcut = (link) => (
        <Link
            key={link.href}
            href={link.href}
            className="flex items-center gap-3 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-4 text-left shadow-sm transition hover:border-indigo-400 hover:bg-indigo-100 dark:border-indigo-500/30 dark:bg-indigo-900/20 dark:hover:bg-indigo-900/30"
        >
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-indigo-600 text-lg text-white shadow">
                <i className={link.icon} aria-hidden="true"></i>
            </span>
            <span className="min-w-0">
                <span className="block text-sm font-semibold text-indigo-900 dark:text-indigo-100">
                    {link.label}
                </span>
                {link.label === 'Contra-cheque' ? (
                    <span className="block text-xs font-semibold text-indigo-800 dark:text-indigo-100">
                       {link.employeesCount} {formatCurrency(link.pendingTotal)}
                    </span>
                ) : (
                    <span className="block text-xs text-indigo-700 dark:text-indigo-200">
                        Abrir
                    </span>
                )}
            </span>
        </Link>
    );

    const headerContent = (
        <div className="space-y-2">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:gap-4">
                <div className="flex-1 space-y-2">
                    <input
                        id="campo-dashboard"
                        type="text"
                        ref={inputRef}
                        value={texto}
                        onChange={handleInputChange}
                        onKeyDown={handleKeyDown}
                        placeholder="Digite nome, ID ou codigo de barras"
                        aria-label="Buscar produto"
                        autoComplete="off"
                        className="block w-full rounded-2xl border-2 border-indigo-300 bg-white px-4 py-4 text-xl text-gray-900 shadow focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-200 disabled:opacity-60 dark:bg-gray-700 dark:text-gray-100"
                        disabled={addingItem || saleLoading || isSalesBlocked}
                    />
                    {favoriteProducts.length > 0 && (
                        <div className="flex flex-nowrap gap-1 overflow-x-auto pb-0.5">
                            {favoriteProducts.map((product) => (
                                <button
                                    type="button"
                                    key={`favorite-${product.tb1_id}`}
                                    onClick={() => handleFavoriteQuickAdd(product)}
                                    disabled={addingItem || saleLoading || isSalesBlocked}
                                    className="shrink-0 whitespace-nowrap rounded-full border border-gray-200 px-2 py-0.5 text-[11px] font-semibold leading-4 text-gray-600 transition hover:border-indigo-400 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-200"
                                >
                                    {product.tb1_nome}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
                <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-end lg:w-auto lg:gap-2">
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-left shadow-sm dark:border-emerald-500/30 dark:bg-emerald-900/20">
                        <p className="text-xs font-semibold uppercase text-emerald-700 dark:text-emerald-200">Total</p>
                        <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-100">
                            {formatCurrency(totalAmount)}
                        </p>
                        <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-200">{totalItems} item(s)</p>
                    </div>
                    {showChangeCard && (
                        <div className="flex items-center justify-between rounded-2xl border border-blue-200 bg-blue-50 px-3 py-2 shadow-sm dark:border-blue-500/30 dark:bg-blue-900/20">
                            <div>
                                <p className="text-xs font-semibold uppercase text-blue-700 dark:text-blue-200">Troco</p>
                                <p className="text-2xl font-bold text-blue-700 dark:text-blue-100">
                                    {formatCurrency(cashChange)}
                                </p>
                            </div>
                            <i className="bi bi-wallet2 text-xl text-blue-500 dark:text-blue-200" aria-hidden="true"></i>
                        </div>
                    )}
                    <div className="flex items-center justify-between rounded-2xl border border-red-200 bg-red-50 px-3 py-2 shadow-sm dark:border-red-500/30 dark:bg-red-900/20">
                        <div>
                            <p className="text-xs font-semibold uppercase text-red-700 dark:text-red-200">Comandas</p>
                            <p className="text-xl font-bold text-red-600 dark:text-red-100">
                                {formatCurrency(openComandasDisplayAmount)}
                            </p>
                            <p className="text-[11px] font-semibold text-red-500 dark:text-red-200">
                                {openComandasDisplayCount} em aberto
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setShowComandasButtons((prev) => !prev)}
                            className="rounded-full border border-red-200 bg-white px-2 py-1 text-xs font-semibold text-red-600 transition hover:border-red-400 dark:border-red-500/40 dark:bg-red-800/40 dark:text-red-100"
                            title="Ver comandas"
                        >
                            <i className="bi bi-egg-fried text-base" aria-hidden="true"></i>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );

    if (!canLaunchSales) {
        return (
            <AuthenticatedLayout header={restrictedHeaderContent} headerClassName="py-1">
                <Head title="PECP" />

                <div className="pt-3 pb-8">
                    <div className="mx-auto max-w-7xl sm:px-6 lg:px-8">
                        <div className="overflow-hidden bg-white shadow-sm sm:rounded-lg dark:bg-gray-800">
                            <div className="p-6 text-gray-900 dark:text-gray-100">
                                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900 dark:border-amber-400/40 dark:bg-amber-900/20 dark:text-amber-100">
                                    <p className="font-semibold">
                                        Apenas o perfil CAIXA pode fazer lancamentos no Dashboard.
                                    </p>
                                    <p className="mt-1">
                                        Para registrar vendas, troque o perfil atual para CAIXA na tela de troca de funcao.
                                    </p>
                                </div>
                                {(canQuickSwitch || restrictedShortcutLinks.length > 0) && (
                                    <div className="mt-6 space-y-6">
                                        {canQuickSwitch && (
                                            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-5 dark:border-gray-700 dark:bg-gray-900/60">
                                                <div className="space-y-1">
                                                    <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                                                        Troca rapida de perfil
                                                    </h3>
                                                    <p className="text-sm text-gray-500 dark:text-gray-300">
                                                        Selecione uma unidade e uma funcao. Ao marcar uma de cada, a sessao e atualizada automaticamente.
                                                    </p>
                                                    <div className="flex flex-wrap items-center gap-2 pt-2">
                                                        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                                            Sessao atual
                                                        </span>
                                                        <span
                                                            className={getUnitBadgeClassName()}
                                                            style={getUnitBadgeStyle(currentMasterUnitName)}
                                                        >
                                                            {formatUnitBadgeLabel(currentMasterUnitName)}
                                                        </span>
                                                        <span
                                                            className={getRoleBadgeClassName()}
                                                            style={getRoleBadgeStyle(currentMasterRoleLabel)}
                                                        >
                                                            {formatRoleBadgeLabel(currentMasterRoleLabel)}
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="mt-6 grid gap-6 xl:grid-cols-2">
                                                    <div>
                                                        <h4 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
                                                            Unidades
                                                        </h4>
                                                        <div className="grid gap-3 sm:grid-cols-2">
                                                            {masterUnitOptions.map((unit) => renderMasterSwitch(unit, 'unit'))}
                                                        </div>
                                                    </div>

                                                    <div>
                                                        <h4 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
                                                            Funcao
                                                        </h4>
                                                        <div className="grid gap-3 sm:grid-cols-2">
                                                            {masterRoleOptions.map((role) => renderMasterSwitch(role, 'role'))}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {restrictedShortcutLinks.length > 0 && (
                                            <div>
                                            <div className="mb-3">
                                                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                                                    Acessos do perfil {restrictedShortcutRoleLabel}
                                                </h3>
                                                <p className="text-sm text-gray-500 dark:text-gray-300">
                                                    Utilize estes atalhos para as areas administrativas disponiveis no Dashboard.
                                                </p>
                                            </div>
                                            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                                                {restrictedShortcutLinks.map(renderRestrictedShortcut)}
                                            </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </AuthenticatedLayout>
        );
    }

    return (
        <AuthenticatedLayout header={headerContent} headerClassName="py-1">
            <Head title="PECP" />

            <div className="pt-3 pb-8">
                <div className="mx-auto max-w-7xl sm:px-6 lg:px-8">
                    <div className="overflow-hidden bg-white shadow-sm sm:rounded-lg dark:bg-gray-800">
                        <div className="p-6 text-gray-900 dark:text-gray-100">
                            <div className="space-y-6">
                                {isCashier && (requiresClosure || hasPendingComandas) && (
                                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-400/40 dark:bg-amber-900/20 dark:text-amber-100">
                                        <div className="flex flex-col gap-2">
                                            {requiresClosure && (
                                                <p className="font-semibold">{closureBlockMessage}</p>
                                            )}
                                            {hasPendingComandas && (
                                                <p className={requiresClosure ? '' : 'font-semibold'}>
                                                    {pendingComandaMessage}
                                                </p>
                                            )}
                                            {requiresClosure && (
                                                <div>
                                                    <Link
                                                        href={route('cashier.close')}
                                                        className="inline-flex items-center rounded-full bg-amber-600 px-4 py-1.5 text-xs font-semibold text-white shadow hover:bg-amber-700"
                                                    >
                                                        Fechar caixa
                                                    </Link>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                                {isCashier && cashierRestrictionsLoading && !cashierRestrictions && (
                                    <p className="text-xs text-gray-500 dark:text-gray-300">
                                        Verificando restricoes do caixa...
                                    </p>
                                )}
                                {saleError && (
                                    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-400/50 dark:bg-red-950/30 dark:text-red-200">
                                        {saleError}
                                    </div>
                                )}

                                {(saleLoading || addingItem) && (
                                    <p className="text-sm text-indigo-600 dark:text-indigo-300">
                                        {saleLoading ? 'Registrando pagamento...' : 'Adicionando produto...'}
                                    </p>
                                )}

                                {showSuggestions && (
                                    <div className="w-full max-w-3xl rounded-2xl border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900">
                                        {loading && (
                                            <p className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                                                Buscando produtos...
                                            </p>
                                        )}
                                        {!loading && error && (
                                            <p className="px-4 py-3 text-sm text-red-600 dark:text-red-400">
                                                {error}
                                            </p>
                                        )}
                                        {!loading && !error && suggestions.length === 0 && (
                                            <p className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                                                Nenhum produto encontrado.
                                            </p>
                                        )}
                                        {!loading && !error && suggestions.length > 0 && (
                                            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                                                {suggestions.map((product) => (
                                                    <li key={product.tb1_id}>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleSelect(product)}
                                                            className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-indigo-50 dark:hover:bg-indigo-900/30"
                                                        >
                                                            <div>
                                                                <p className="text-base font-semibold text-gray-800 dark:text-gray-100">
                                                                    {product.tb1_nome}
                                                                </p>
                                                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                                                    ID: {product.tb1_id}
                                                                </p>
                                                            </div>
                                                            <span className="text-sm font-medium text-indigo-600 dark:text-indigo-300">
                                                                {formatCurrency(product.tb1_vlr_venda)}
                                                            </span>
                                                        </button>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>
                                )}

                                <div className="rounded-2xl border border-gray-200 p-4 shadow-sm dark:border-gray-700">
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <div className="flex items-center gap-3">
                                            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
                                                Itens adicionados
                                            </h3>
                                            {selectedComandaCode && (
                                                <span className="rounded-full border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700">
                                                    Comanda: {selectedComandaCode}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-3">
                                            {selectedComandaCode && (
                                                <span className="rounded-full border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700">
                                                    Comanda: {selectedComandaCode}
                                                </span>
                                            )}
                                            <button
                                                type="button"
                                                onClick={handleSaveCart}
                                                disabled={items.length === 0}
                                                className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:border-indigo-400 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-200"
                                            >
                                                <i className="bi bi-download" aria-hidden="true"></i>
                                                Guardar lista
                                            </button>
                                            <span className="text-sm text-gray-500 dark:text-gray-300">
                                                {items.length} produto(s)
                                            </span>
                                        </div>
                                    </div>
                                    {items.length === 0 ? (
                                        <p className="mt-4 text-sm text-gray-600 dark:text-gray-300">
                                        </p>
                                    ) : (
                                        <div className="mt-4 overflow-x-auto">
                                            <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-700">
                                                <thead className="bg-gray-50 dark:bg-gray-900/40">
                                                    <tr>
                                                        <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">
                                                            Produto
                                                        </th>
                                                        <th className="px-3 py-2 text-center font-medium text-gray-600 dark:text-gray-300">
                                                            Qtd
                                                        </th>
                                                        <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-300">
                                                            Valor unit.
                                                        </th>
                                                        <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-300">
                                                            Subtotal
                                                        </th>
                                                        <th className="px-3 py-2 text-center font-medium text-gray-600 dark:text-gray-300">
                                                            Remover
                                                        </th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                                    {items.map((item) => (
                                                        <tr key={item.id}>
                                                            <td className="px-3 py-2">
                                                                <p className="font-medium text-gray-800 dark:text-gray-100">
                                                                    {item.name}
                                                                </p>
                                                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                                                    ID {item.productId}
                                                                </p>
                                                                {item.isWeighted && (
                                                                    <p className="text-xs font-semibold text-amber-600 dark:text-amber-300">
                                                                        Etiqueta de balanca
                                                                    </p>
                                                                )}
                                                                {item.lancUserName && (
                                                                    <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                                                                        {item.lancUserName}
                                                                    </p>
                                                                )}
                                                            </td>
                                                            <td className="px-3 py-2 text-center text-gray-800 dark:text-gray-100">
                                                                <div className="flex items-center justify-center gap-2">
                                                                    <button
                                                                        type="button"
                                                                        onClick={(event) => handleIncrementButtonClick(event, item.id)}
                                                                        onPointerDown={(event) => {
                                                                            if (event.button !== 0) {
                                                                                return;
                                                                            }

                                                                            event.preventDefault();
                                                                            startIncrementItemQuantityHold(item.id);
                                                                        }}
                                                                        onPointerUp={clearQuantityHold}
                                                                        onPointerLeave={clearQuantityHold}
                                                                        onPointerCancel={clearQuantityHold}
                                                                        className="text-indigo-600 transition hover:text-indigo-400 focus:outline-none disabled:opacity-50"
                                                                        disabled={saleLoading || isSalesBlocked}
                                                                        aria-label={`Adicionar uma unidade de ${item.name}`}
                                                                    >
                                                                        <i className="bi bi-plus-circle-fill text-lg" aria-hidden="true"></i>
                                                                    </button>
                                                                    <span className="text-base font-semibold">{item.quantity}</span>
                                                                    <button
                                                                        type="button"
                                                                        onClick={(event) => handleDecrementButtonClick(event, item.id)}
                                                                        onPointerDown={(event) => {
                                                                            if (event.button !== 0) {
                                                                                return;
                                                                            }

                                                                            event.preventDefault();
                                                                            startDecrementItemQuantityHold(item.id);
                                                                        }}
                                                                        onPointerUp={clearQuantityHold}
                                                                        onPointerLeave={clearQuantityHold}
                                                                        onPointerCancel={clearQuantityHold}
                                                                        className="text-red-500 transition hover:text-red-400 focus:outline-none disabled:opacity-50"
                                                                        disabled={saleLoading || isSalesBlocked}
                                                                        aria-label={`Remover uma unidade de ${item.name}`}
                                                                    >
                                                                        <i className="bi bi-dash-circle-fill text-lg" aria-hidden="true"></i>
                                                                    </button>
                                                                </div>
                                                            </td>
                                                            <td className="px-3 py-2 text-right text-gray-800 dark:text-gray-100">
                                                                {formatCurrency(item.price)}
                                                            </td>
                                                            <td className="px-3 py-2 text-right font-semibold text-gray-900 dark:text-gray-50">
                                                                {formatCurrency(item.quantity * item.price)}
                                                            </td>
                                                            <td className="px-3 py-2 text-center">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => removeItem(item.id)}
                                                                    className="text-red-600 transition hover:text-red-400 focus:outline-none disabled:opacity-50"
                                                                    disabled={saleLoading || isSalesBlocked}
                                                                >
                                                                    <i className="bi bi-trash-fill text-lg" aria-hidden="true"></i>
                                                                    <span className="sr-only">Remover {item.name}</span>
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                                <tfoot className="border-t border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/30">
                                                    <tr>
                                                        <td className="px-3 py-3"></td>
                                                        <td className="px-3 py-3 text-center text-base font-bold text-gray-800 dark:text-gray-100">
                                                            {totalItems}
                                                        </td>
                                                        <td className="px-3 py-3"></td>
                                                        <td className="px-3 py-3"></td>
                                                        <td className="px-3 py-3"></td>
                                                    </tr>
                                                </tfoot>
                                            </table>
                                        </div>
                                    )}
                                    <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-4 dark:border-gray-700">
                                        <p className="text-base font-semibold text-gray-700 dark:text-gray-200">
                                            Total
                                        </p>
                                        <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-300">
                                            {formatCurrency(totalAmount)}
                                        </p>
                                    </div>

                                    <div className="mt-6 border-t border-gray-100 pt-4 dark:border-gray-700">
                                        <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                        </p>
                                    </div>
                                    <div className="mt-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
                                        {visiblePaymentOptions.map((option) => (
                                            <button
                                                type="button"
                                                key={option.value}
                                                data-payment-type={option.value}
                                                onClick={() => handlePaymentClick(option.value)}
                                                disabled={saleLoading || items.length === 0 || isSalesBlocked}
                                                title={option.shortcutLabel ? `${option.label} (${option.shortcutLabel})` : option.label}
                                                className={`rounded-lg px-2 py-2 text-center text-sm font-semibold shadow focus:outline-none focus:ring-4 disabled:cursor-not-allowed disabled:opacity-60 ${option.classes}`}
                                            >
                                                {option.label}
                                            </button>
                                        ))}
                                    </div>

                                    {showComandasButtons && (
                                        <div
                                            className={`mt-3 flex flex-wrap gap-2 ${
                                                shouldFocusComandas
                                                    ? 'rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-400/40 dark:bg-amber-900/20'
                                                    : ''
                                            }`}
                                        >
                                            {shouldFocusComandas && (
                                                <span className="text-xs font-semibold text-amber-800 dark:text-amber-200">
                                                    Comandas abertas para recebimento:
                                                </span>
                                            )}
                                            {visibleComandasList.length === 0 ? (
                                                <span className="text-xs text-gray-500 dark:text-gray-300">
                                                    Nenhuma comanda em aberto.
                                                </span>
                                            ) : (
                                                visibleComandasList.map((comanda) => (
                                                    <button
                                                        type="button"
                                                        key={`comanda-${comanda.codigo}`}
                                                        onClick={() => handleLoadComandaItems(comanda.codigo)}
                                                        className="inline-flex items-center rounded-full border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 shadow-sm transition hover:border-indigo-400 hover:text-indigo-600 dark:border-gray-600 dark:text-gray-100"
                                                    >
                                                        {comanda.codigo}
                                                    </button>
                                                ))
                                            )}
                                            {comandaLoading && (
                                                <span className="text-xs text-gray-500 dark:text-gray-300">
                                                    Carregando itens da comanda...
                                                </span>
                                            )}
                                        </div>
                                    )}

                                    {savedCarts.length > 0 && (
                                        <div className="mt-6 border-t border-gray-100 pt-4 dark:border-gray-700">
                                            <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                                Pedidos guardados
                                            </p>
                                            <div className="mt-3 flex flex-wrap gap-2">
                                                {savedCarts.map((cart) => (
                                                    <button
                                                        type="button"
                                                        key={cart.id}
                                                        onClick={() => handleRestoreCart(cart.id)}
                                                        disabled={saleLoading || isSalesBlocked}
                                                        className="rounded-full border border-indigo-200 px-4 py-2 text-sm font-semibold text-indigo-700 shadow-sm transition hover:border-indigo-400 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-indigo-500 dark:text-indigo-200"
                                                    >
                                                        {formatCurrency(cart.total)}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {cashInputVisible && (
                                        <div className="mt-4 rounded-2xl border border-green-200 bg-green-50 shadow dark:border-green-500/40 dark:bg-green-900/20">
                                            <div className="grid gap-4 divide-y divide-green-200 p-4 sm:grid-cols-[1.15fr_0.85fr] sm:divide-y-0 sm:divide-x dark:divide-green-500/30">
                                                <div className="pr-0 sm:pr-2">
                                                    <label className="text-sm font-medium text-gray-700 dark:text-gray-100">
                                                        Valor recebido em dinheiro
                                                    </label>
                                                    <input
                                                        type="number"
                                                        ref={cashInputRef}
                                                        min="0"
                                                        step="0.01"
                                                        value={cashValue}
                                                        onChange={handleCashValueChange}
                                                        onKeyDown={handleCashInputKeyDown}
                                                        disabled={saleLoading}
                                                        className="mt-2 w-full rounded-xl border border-green-300 bg-white px-4 py-2 text-lg text-gray-900 focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-400 dark:border-green-500/40 dark:bg-gray-700 dark:text-gray-100"
                                                        placeholder="Ex.: 50.00"
                                                    />
                                                    {cashCardComplement > 0 && (
                                                        <div className="mt-2 space-y-2">
                                                            <p className="text-xs text-amber-700 dark:text-amber-200">
                                                                Restante no complemento: {formatCurrency(cashCardComplement)}
                                                            </p>
                                                            <div>
                                                                <p className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
                                                                    Tipo do restante
                                                                </p>
                                                                <div className="mt-2 flex flex-wrap gap-2">
                                                                    {cardTypeOptions.map((option) => {
                                                                        const isSelected = cashCardType === option.value;

                                                                        return (
                                                                            <button
                                                                                type="button"
                                                                                key={`cash-${option.value}`}
                                                                                data-payment-type={option.value}
                                                                                data-payment-context="cash-complement"
                                                                                onClick={() => {
                                                                                    setCashCardType(option.value);
                                                                                    setSaleError('');
                                                                                }}
                                                                                className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                                                                                    isSelected
                                                                                        ? 'border-indigo-600 bg-indigo-600 text-white'
                                                                                        : 'border-gray-300 bg-white text-gray-700 hover:border-indigo-400 hover:text-indigo-600 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200'
                                                                                }`}
                                                                            >
                                                                                {option.label}
                                                                            </button>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                    <p className="mt-2 text-xs text-gray-600 dark:text-gray-300">
                                                        Informe o valor recebido e pressione Enter para finalizar.
                                                    </p>
                                                </div>
                                                <div className="flex items-center justify-center pt-4 sm:pt-0 sm:pl-4">
                                                    <div className="text-center">
                                                        <p className="text-xs font-semibold uppercase tracking-wide text-green-700 dark:text-green-200">
                                                            Troco
                                                        </p>
                                                        <p className="mt-2 text-3xl font-bold text-green-700 dark:text-green-100">
                                                            {formatCurrency(cashChange)}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                </div>

                                {valePickerVisible && (
                                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow dark:border-amber-400/40 dark:bg-amber-900/20">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <h3 className="text-lg font-semibold text-amber-800 dark:text-amber-100">
                                                    Selecionar colaborador para vale
                                                </h3>
                                                <p className="text-sm text-amber-700 dark:text-amber-100">
                                                    Total atual: {formatCurrency(totalAmount)}
                                                </p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={resetValePicker}
                                                className="text-sm font-medium text-amber-700 underline hover:text-amber-900 dark:text-amber-200"
                                            >
                                                Cancelar
                                            </button>
                                        </div>
                                        <div className="mt-4 flex flex-wrap gap-3">
                                            <label
                                                className={`flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition ${
                                                    selectedValeType === 'vale'
                                                        ? 'border-amber-500 bg-white text-amber-800 dark:bg-gray-900'
                                                        : 'border-gray-200 bg-white/70 text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200'
                                                }`}
                                            >
                                                <input
                                                    type="radio"
                                                    name="vale-type"
                                                    value="vale"
                                                    checked={selectedValeType === 'vale'}
                                                    onChange={() => setSelectedValeType('vale')}
                                                className="h-4 w-4 text-amber-600 focus:ring-amber-500"
                                            />
                                            Vale
                                        </label>
                                        <label
                                                className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition ${
                                                    selectedValeType === 'refeicao'
                                                        ? 'border-amber-500 bg-white text-amber-800 dark:bg-gray-900'
                                                        : 'border-gray-200 bg-white/70 text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200'
                                                } ${!canUseRefeicao ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
                                            >
                                                <input
                                                    type="radio"
                                                    name="vale-type"
                                                    value="refeicao"
                                                    checked={selectedValeType === 'refeicao'}
                                                    onChange={() => setSelectedValeType('refeicao')}
                                                    disabled={!canUseRefeicao}
                                                    className="h-4 w-4 text-amber-600 focus:ring-amber-500"
                                                />
                                                Refeição
                                            </label>
                                        </div>
                                        <p className="mt-2 text-xs text-amber-800 dark:text-amber-100">
                                            {selectedValeType === 'refeicao'
                                                ? 'O saldo de Refeicao do colaborador sera utilizado; saldo insuficiente impede a venda.'
                                                : 'Utilize esta opção para lançar o valor no vale tradicional do colaborador.'}
                                        </p>
                                        {!canUseRefeicao && (
                                            <p className="mt-1 text-xs text-amber-700 dark:text-amber-200">
                                                Remova itens nao liberados para VR Credito para habilitar a opcao Refeicao.
                                            </p>
                                        )}
                                        <div className="mt-4">
                                            <label className="text-sm text-gray-700 dark:text-gray-200">
                                                Buscar usuarios
                                            </label>
                                            <input
                                                type="text"
                                                value={valeSearchTerm}
                                                onChange={(event) => setValeSearchTerm(event.target.value)}
                                                placeholder="Digite pelo menos 2 letras"
                                                className="mt-2 block w-full rounded-xl border border-gray-300 px-3 py-2 text-gray-800 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                                            />
                                        </div>
                                        <div className="mt-4">
                                            {valeLoading && (
                                                <p className="text-sm text-gray-600 dark:text-gray-200">Buscando usuarios...</p>
                                            )}
                                            {!valeLoading && valeResults.length === 0 && valeSearchTerm.trim().length >= 2 && (
                                                <p className="text-sm text-gray-600 dark:text-gray-200">
                                                    Nenhum usuario encontrado.
                                                </p>
                                            )}
                                            {!valeLoading && valeResults.length > 0 && (
                                                <ul className="divide-y divide-gray-200 rounded-xl border border-gray-200 bg-white dark:divide-gray-700 dark:border-gray-700 dark:bg-gray-800">
                                                    {valeResults.map((user) => {
                                                        const refeicaoValidation =
                                                            selectedValeType === 'refeicao'
                                                                ? resolveRefeicaoValidation(user, totalAmount, {
                                                                      includeBalanceMessage: false,
                                                                  })
                                                                : null;
                                                        const showBalanceWarning =
                                                            refeicaoValidation?.reason === 'balance';
                                                        const showDailyWarning =
                                                            refeicaoValidation?.reason === 'daily_limit';

                                                        return (
                                                            <li key={user.id}>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleSelectValeUser(user)}
                                                                    className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-gray-800 hover:bg-indigo-50 dark:text-gray-100 dark:hover:bg-indigo-900/30"
                                                                >
                                                                    <div>
                                                                        <p className="font-semibold">{user.name}</p>
                                                                        {selectedValeType === 'refeicao' &&
                                                                            showBalanceWarning && (
                                                                                <p className="text-xs text-amber-700 dark:text-amber-200">
                                                                                    Saldo: {formatCurrency(user.refeicao_balance ?? user.vr_cred ?? 0)}
                                                                                </p>
                                                                            )}
                                                                        {selectedValeType === 'refeicao' &&
                                                                            showDailyWarning && (
                                                                                <p className="text-xs text-amber-700 dark:text-amber-200">
                                                                                    {formatRefeicaoLimitLabel(user.refeicao_daily_limit)}
                                                                                </p>
                                                                            )}
                                                                    </div>
                                                                    <span className="text-xs text-gray-500 dark:text-gray-300">
                                                                        Selecionar
                                                                    </span>
                                                                </button>
                                                            </li>
                                                        );
                                                    })}
                                                </ul>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            {showFaturarWarning && (
                <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-4 py-6">
                    <div className="w-full max-w-3xl rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-900">
                        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
                            {faturarWarningText[0]}
                        </h3>
                        <div className="mt-4 space-y-4 text-sm leading-6 text-gray-700 dark:text-gray-200">
                            {faturarWarningText.slice(1).map((paragraph) => (
                                <p key={paragraph}>{paragraph}</p>
                            ))}
                        </div>
                        <div className="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                            <button
                                type="button"
                                onClick={() => handleFaturarWarningChoice('dinheiro')}
                                disabled={saleLoading}
                                className="rounded-xl bg-green-600 px-2 py-2 text-sm font-semibold text-white shadow hover:bg-green-700 disabled:opacity-60"
                            >
                                Dinheiro
                            </button>
                            <button
                                type="button"
                                onClick={() => handleFaturarWarningChoice('cartao_credito')}
                                disabled={saleLoading}
                                className="rounded-xl bg-blue-600 px-2 py-2 text-sm font-semibold text-white shadow hover:bg-blue-700 disabled:opacity-60"
                            >
                                Credito
                            </button>
                            <button
                                type="button"
                                onClick={() => handleFaturarWarningChoice('cartao_debito')}
                                disabled={saleLoading}
                                className="rounded-xl bg-sky-600 px-2 py-2 text-sm font-semibold text-white shadow hover:bg-sky-700 disabled:opacity-60"
                            >
                                Debito
                            </button>
                            <button
                                type="button"
                                onClick={() => handleFaturarWarningChoice('faturar')}
                                disabled={saleLoading}
                                className="rounded-xl bg-gray-900 px-2 py-2 text-sm font-semibold text-white shadow hover:bg-gray-800 disabled:opacity-60"
                            >
                                Faturar
                            </button>
                            <button
                                type="button"
                                onClick={closeFaturarWarning}
                                disabled={saleLoading}
                                className="rounded-xl border border-gray-300 px-2 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-60 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {showReceipt && receiptData && (
                <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-4 py-6">
                    <div className="flex max-h-[calc(100vh-3rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-900">
                        <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-700">
                            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
                                Cupom pronto para impressao
                            </h3>
                        </div>
                        <div className="flex-1 overflow-y-auto px-6 py-4">
                            <div className="space-y-2 text-sm text-gray-700 dark:text-gray-200">
                                {(receiptData.items || []).map((item) => (
                                    <div key={item.product_id} className="flex items-center justify-between">
                                        <div>
                                            <p className="font-medium">
                                                {item.quantity}x {item.product_name}
                                            </p>
                                            <p className="text-xs text-gray-500">
                                                {formatCurrency(item.unit_price)} cada
                                            </p>
                                        </div>
                                        <p className="font-semibold">{formatCurrency(item.subtotal)}</p>
                                    </div>
                                ))}
                                <p>
                                    <span className="font-medium">Pagamento:</span> {receiptData.payment_label}
                                </p>
                                {receiptData.payment?.valor_pago !== null && (
                                    <p>
                                        <span className="font-medium">Valor pago:</span>{' '}
                                        {formatCurrency(receiptData.payment.valor_pago)}
                                    </p>
                                )}
                                <p>
                                    <span className="font-medium">Troco:</span>{' '}
                                    {formatCurrency(receiptData.payment?.troco ?? 0)}
                                </p>
                                {receiptData.payment?.dois_pgto > 0 && (
                                    <p>
                                        <span className="font-medium">
                                            {resolveComplementLabel(receiptData.payment?.tipo_pagamento)} (compl.):
                                        </span>{' '}
                                        {formatCurrency(receiptData.payment.dois_pgto)}
                                    </p>
                                )}
                                {resolveReceiptId(receiptData) && (
                                    <p>
                                        <span className="font-medium">Cupom:</span> #
                                        {resolveReceiptId(receiptData)}
                                    </p>
                                )}
                                {resolveReceiptComanda(receiptData) && (
                                    <p>
                                        <span className="font-medium">Comanda:</span> #
                                        {resolveReceiptComanda(receiptData)}
                                    </p>
                                )}
                                <p>
                                    <span className="font-medium">Caixa:</span> {receiptData.cashier_name}
                                </p>
                                {receiptData.vale_user_name && (
                                    <p>
                                        <span className="font-medium">Cliente Vale:</span> {receiptData.vale_user_name}
                                        {receiptData.vale_type === 'refeicao' && (
                                            <span className="ml-1 text-xs text-amber-600 dark:text-amber-200">(Refeição)</span>
                                        )}
                                    </p>
                                )}
                                <p>
                                    <span className="font-medium">Data:</span> {formatDateTime(receiptData.date_time)}
                                </p>
                                {receiptData.fiscal && (
                                    <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-3 text-sm text-blue-900">
                                        <p>
                                            <span className="font-medium">Nota fiscal:</span>{' '}
                                            {(receiptData.fiscal.modelo || 'NF').toUpperCase()} {' '}
                                            {receiptData.fiscal.serie || '--'}/{receiptData.fiscal.numero || '--'}
                                        </p>
                                        <p>
                                            <span className="font-medium">Status:</span>{' '}
                                            {fiscalStatusLabels[receiptData.fiscal.status] ?? receiptData.fiscal.status ?? '--'}
                                        </p>
                                        {receiptData.fiscal.protocolo && (
                                            <p>
                                                <span className="font-medium">Protocolo:</span>{' '}
                                                {receiptData.fiscal.protocolo}
                                            </p>
                                        )}
                                        {receiptData.fiscal.recibo && (
                                            <p>
                                                <span className="font-medium">Recibo:</span>{' '}
                                                {receiptData.fiscal.recibo}
                                            </p>
                                        )}
                                        {receiptData.fiscal.mensagem && (
                                            <p className="text-xs leading-5 text-blue-800">
                                                {receiptData.fiscal.mensagem}
                                            </p>
                                        )}
                                        <p>
                                            <span className="font-medium">Tipo:</span>{' '}
                                            {resolveFiscalConsumerLabel(receiptData.fiscal.consumer)}
                                        </p>
                                        <p>
                                            <span className="font-medium">Consumidor:</span>{' '}
                                            {resolveFiscalConsumerType(receiptData.fiscal.consumer) === 'cupom_fiscal'
                                                ? 'CPF INFORMADO'
                                                : (receiptData.fiscal.consumer?.name || 'CONSUMIDOR NAO IDENTIFICADO')}
                                            {receiptData.fiscal.consumer?.document && (
                                                <span> ({receiptData.fiscal.consumer.document})</span>
                                            )}
                                        </p>
                                    </div>
                                )}
                                <p className="text-lg font-bold text-indigo-600">
                                    Total: {formatCurrency(receiptData.total)}
                                </p>
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4 dark:border-gray-700">
                            {receiptData.fiscal && !['emitida', 'cancelada'].includes(receiptData.fiscal.status) && (
                                <button
                                    type="button"
                                    className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-60"
                                    onClick={handleOpenConsumerFiscalModal}
                                    disabled={consumerFiscalLoading || transmittingFiscal}
                                >
                                    Identificacao fiscal
                                </button>
                            )}
                            {receiptData.fiscal && ['xml_assinado', 'erro_transmissao'].includes(receiptData.fiscal.status) && (
                                <button
                                    type="button"
                                    className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                                    onClick={handleTransmitFiscal}
                                    disabled={transmittingFiscal}
                                >
                                    {transmittingFiscal ? 'Transmitindo...' : 'Transmitir NF'}
                                </button>
                            )}
                            {!receiptData.fiscal && receiptData.can_manual_fiscal_transmit && (
                                <button
                                    type="button"
                                    className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                                    onClick={handleSignAndTransmitFiscal}
                                    disabled={transmittingFiscal}
                                >
                                    {transmittingFiscal ? 'Transmitindo...' : 'Assinar e Transmitir'}
                                </button>
                            )}
                            <button
                                type="button"
                                className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
                                onClick={handleCloseReceipt}
                            >
                                Fechar
                            </button>
                            {receiptData.fiscal?.status === 'emitida' && (
                                <button
                                    type="button"
                                    className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-sky-700"
                                    onClick={handlePrintFiscalReceipt}
                                >
                                    {resolveFiscalConsumerLabel(receiptData.fiscal.consumer)}
                                </button>
                            )}
                            <button
                                type="button"
                                className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-700"
                                onClick={handlePrintReceipt}
                            >
                                Imprimir
                            </button>
                        </div>
                    </div>
                </div>
            )}
            <Modal show={showConsumerFiscalModal} onClose={closeConsumerFiscalModal} maxWidth="2xl" tone="light">
                <form onSubmit={handleSubmitConsumerFiscal}>
                    <div className="border-b border-gray-200 px-6 py-4">
                        <h3 className="text-lg font-semibold text-gray-900">
                            Identificacao fiscal
                        </h3>
                        <p className="mt-1 text-sm text-gray-600">
                            Escolha entre cupom fiscal com CPF ou NF Consumidor completa e regenere a NFC-e com o destinatario correto.
                        </p>
                    </div>
                    <div className="grid gap-4 px-6 py-5 sm:grid-cols-2">
                        <div className="sm:col-span-2">
                            <label className="text-sm font-medium text-gray-700">Tipo fiscal</label>
                            <div className="mt-2 grid gap-3 sm:grid-cols-2">
                                <button
                                    type="button"
                                    onClick={() => handleConsumerFiscalFieldChange('type', 'cupom_fiscal')}
                                    className={`rounded-xl border px-4 py-3 text-left text-sm transition ${
                                        consumerFiscalForm.type === 'cupom_fiscal'
                                            ? 'border-cyan-500 bg-cyan-50 text-cyan-900'
                                            : 'border-gray-300 bg-white text-gray-700 hover:border-cyan-300'
                                    }`}
                                >
                                    <span className="block font-semibold">Cupom fiscal</span>
                                    <span className="mt-1 block text-xs">Informa somente o CPF do consumidor.</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleConsumerFiscalFieldChange('type', 'consumidor')}
                                    className={`rounded-xl border px-4 py-3 text-left text-sm transition ${
                                        consumerFiscalForm.type === 'consumidor'
                                            ? 'border-cyan-500 bg-cyan-50 text-cyan-900'
                                            : 'border-gray-300 bg-white text-gray-700 hover:border-cyan-300'
                                    }`}
                                >
                                    <span className="block font-semibold">NF Consumidor</span>
                                    <span className="mt-1 block text-xs">Informa nome e endereco fiscal completos.</span>
                                </button>
                            </div>
                            {consumerFiscalErrors.type && (
                                <p className="mt-1 text-xs text-red-600">{consumerFiscalErrors.type}</p>
                            )}
                        </div>
                        {consumerFiscalForm.type === 'consumidor' && (
                        <div className="sm:col-span-2">
                            <label className="text-sm font-medium text-gray-700">Nome ou razao social</label>
                            <input
                                type="text"
                                value={consumerFiscalForm.name}
                                onChange={(event) => handleConsumerFiscalFieldChange('name', event.target.value)}
                                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-200"
                                maxLength={60}
                                required
                            />
                            {consumerFiscalErrors.name && (
                                <p className="mt-1 text-xs text-red-600">{consumerFiscalErrors.name}</p>
                            )}
                        </div>
                        )}
                        <div>
                            <label className="text-sm font-medium text-gray-700">
                                {consumerFiscalForm.type === 'cupom_fiscal' ? 'CPF' : 'CPF ou CNPJ'}
                            </label>
                            <input
                                type="text"
                                value={consumerFiscalForm.document}
                                onChange={(event) => handleConsumerFiscalFieldChange('document', event.target.value)}
                                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-200"
                                maxLength={18}
                                required
                            />
                            {consumerFiscalErrors.document && (
                                <p className="mt-1 text-xs text-red-600">{consumerFiscalErrors.document}</p>
                            )}
                        </div>
                        {consumerFiscalForm.type === 'consumidor' && (
                        <>
                        <div>
                            <label className="text-sm font-medium text-gray-700">CEP</label>
                            <input
                                type="text"
                                value={consumerFiscalForm.cep}
                                onChange={(event) => handleConsumerFiscalFieldChange('cep', event.target.value)}
                                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-200"
                                maxLength={9}
                                required
                            />
                            {consumerFiscalErrors.cep && (
                                <p className="mt-1 text-xs text-red-600">{consumerFiscalErrors.cep}</p>
                            )}
                        </div>
                        <div className="sm:col-span-2">
                            <label className="text-sm font-medium text-gray-700">Logradouro</label>
                            <input
                                type="text"
                                value={consumerFiscalForm.street}
                                onChange={(event) => handleConsumerFiscalFieldChange('street', event.target.value)}
                                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-200"
                                maxLength={60}
                                required
                            />
                            {consumerFiscalErrors.street && (
                                <p className="mt-1 text-xs text-red-600">{consumerFiscalErrors.street}</p>
                            )}
                        </div>
                        <div>
                            <label className="text-sm font-medium text-gray-700">Numero</label>
                            <input
                                type="text"
                                value={consumerFiscalForm.number}
                                onChange={(event) => handleConsumerFiscalFieldChange('number', event.target.value)}
                                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-200"
                                maxLength={20}
                                required
                            />
                            {consumerFiscalErrors.number && (
                                <p className="mt-1 text-xs text-red-600">{consumerFiscalErrors.number}</p>
                            )}
                        </div>
                        <div>
                            <label className="text-sm font-medium text-gray-700">Complemento</label>
                            <input
                                type="text"
                                value={consumerFiscalForm.complement}
                                onChange={(event) => handleConsumerFiscalFieldChange('complement', event.target.value)}
                                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-200"
                                maxLength={60}
                            />
                            {consumerFiscalErrors.complement && (
                                <p className="mt-1 text-xs text-red-600">{consumerFiscalErrors.complement}</p>
                            )}
                        </div>
                        <div>
                            <label className="text-sm font-medium text-gray-700">Bairro</label>
                            <input
                                type="text"
                                value={consumerFiscalForm.neighborhood}
                                onChange={(event) => handleConsumerFiscalFieldChange('neighborhood', event.target.value)}
                                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-200"
                                maxLength={60}
                                required
                            />
                            {consumerFiscalErrors.neighborhood && (
                                <p className="mt-1 text-xs text-red-600">{consumerFiscalErrors.neighborhood}</p>
                            )}
                        </div>
                        <div>
                            <label className="text-sm font-medium text-gray-700">Municipio</label>
                            <input
                                type="text"
                                value={consumerFiscalForm.city}
                                onChange={(event) => handleConsumerFiscalFieldChange('city', event.target.value)}
                                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-200"
                                maxLength={60}
                                required
                            />
                            {consumerFiscalErrors.city && (
                                <p className="mt-1 text-xs text-red-600">{consumerFiscalErrors.city}</p>
                            )}
                        </div>
                        <div>
                            <label className="text-sm font-medium text-gray-700">Codigo municipio IBGE</label>
                            <input
                                type="text"
                                value={consumerFiscalForm.city_code}
                                onChange={(event) => handleConsumerFiscalFieldChange('city_code', event.target.value)}
                                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-200"
                                maxLength={7}
                                required
                            />
                            {consumerFiscalErrors.city_code && (
                                <p className="mt-1 text-xs text-red-600">{consumerFiscalErrors.city_code}</p>
                            )}
                        </div>
                        <div>
                            <label className="text-sm font-medium text-gray-700">UF</label>
                            <input
                                type="text"
                                value={consumerFiscalForm.state}
                                onChange={(event) => handleConsumerFiscalFieldChange('state', event.target.value)}
                                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm uppercase text-gray-900 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-200"
                                maxLength={2}
                                required
                            />
                            {consumerFiscalErrors.state && (
                                <p className="mt-1 text-xs text-red-600">{consumerFiscalErrors.state}</p>
                            )}
                        </div>
                        </>
                        )}
                    </div>
                    <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
                        <button
                            type="button"
                            className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
                            onClick={closeConsumerFiscalModal}
                            disabled={consumerFiscalLoading}
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={consumerFiscalLoading}
                        >
                            {consumerFiscalLoading
                                ? 'Gerando...'
                                : (consumerFiscalForm.type === 'cupom_fiscal' ? 'Salvar cupom fiscal' : 'Salvar NF Consumidor')}
                        </button>
                    </div>
                </form>
            </Modal>
        </AuthenticatedLayout>
    );
}
