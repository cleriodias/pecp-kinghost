import { Head, Link, usePage } from '@inertiajs/react';
import axios from 'axios';
import { useEffect, useRef, useState } from 'react';

const numericRegex = /^\d+$/;
const BARCODE_MIN_LENGTH = 5;
const WEIGHTED_BARCODE_PREFIX = '2';
const WEIGHTED_BARCODE_LENGTH = 13;

const StepCard = ({ title, description, children }) => (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4">
            <h2 className="text-lg font-semibold text-gray-800">{title}</h2>
            {description && <p className="text-sm text-gray-600">{description}</p>}
        </div>
        {children}
    </div>
);

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

const normalizeComandaItem = (item) => {
    const price = Number(item?.price ?? 0);
    const productId = Number(item?.product_id ?? item?.id ?? 0);
    const lineId =
        String(item?.line_id ?? '').trim() || `product-${productId}-price-${price.toFixed(2)}`;

    return {
        ...item,
        id: lineId,
        line_id: lineId,
        product_id: productId,
        price,
        quantity: Number(item?.quantity ?? 0),
    };
};

export default function Terminal() {
    const pageProps = usePage().props;
    const { auth } = pageProps;
    const csrfToken = pageProps?.csrf_token ?? '';

    const [step, setStep] = useState(1);
    const [accessCode, setAccessCode] = useState('');
    const [accessUser, setAccessUser] = useState(null);
    const [accessError, setAccessError] = useState('');
    const [comanda, setComanda] = useState('');
    const [comandaItems, setComandaItems] = useState([]);
    const [comandaError, setComandaError] = useState('');
    const [comandaLoading, setComandaLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const [searchError, setSearchError] = useState('');
    const [removeModalOpen, setRemoveModalOpen] = useState(false);
    const [removeReason, setRemoveReason] = useState('');
    const [removeError, setRemoveError] = useState('');
    const [pendingRemovalItemId, setPendingRemovalItemId] = useState(null);
    const [removeProcessing, setRemoveProcessing] = useState(false);
    const searchDebounce = useRef(null);

    const accessRef = useRef(null);
    const comandaRef = useRef(null);
    const searchRef = useRef(null);

    useEffect(() => {
        if (step === 1 && accessRef.current) {
            accessRef.current.focus();
        } else if (step === 2 && comandaRef.current) {
            comandaRef.current.focus();
        } else if (step === 3 && searchRef.current) {
            searchRef.current.focus();
        }
    }, [step]);

    useEffect(() => {
        if (typeof window === 'undefined' || typeof route !== 'function') {
            return undefined;
        }

        let cancelled = false;

        const sendHeartbeat = () => {
            axios.post(route('online.heartbeat')).catch(() => {
                if (!cancelled) {
                    // Presenca nao deve interromper a operacao do terminal.
                }
            });
        };

        sendHeartbeat();
        const intervalId = window.setInterval(sendHeartbeat, 45000);

        return () => {
            cancelled = true;
            window.clearInterval(intervalId);
        };
    }, []);

    const goToStep = (targetStep) => {
        setStep(targetStep);
    };

    const handleAccessSubmit = async (e) => {
        e.preventDefault();
        if (!accessCode.trim()) {
            setAccessError('Informe o codigo de acesso.');
            return;
        }

        setAccessError('');

        try {
            const response = await fetch(route('lanchonete.terminal.access'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                    'X-CSRF-Token': csrfToken,
                },
                body: JSON.stringify({ cod_acesso: accessCode.trim() }),
            });

            if (!response.ok) {
                const data = await response.json().catch(() => null);

                if (response.status === 419) {
                    setAccessError('Sua sessao expirou. Recarregue a pagina e tente novamente.');
                } else {
                    setAccessError(data?.message ?? `Falha ao validar codigo (${response.status}).`);
                }
                setAccessUser(null);
                return;
            }

            const data = await response.json();
            setAccessUser(data);
            goToStep(2);
        } catch (err) {
            setAccessError('Falha ao validar codigo de acesso. Tente novamente.');
            setAccessUser(null);
        }
    };

    const handleComandaSubmit = (e) => {
        e.preventDefault();
        const codigo = comanda.trim();
        if (!codigo) {
            setComandaError('Informe o codigo da comanda.');
            return;
        }
        const numeric = Number(codigo);
        if (Number.isNaN(numeric) || numeric < 3000 || numeric > 3100) {
            setComandaError('Codigo da comanda deve estar entre 3000 e 3100.');
            return;
        }
        setComandaError('');
        setComandaLoading(true);
        fetch(route('sales.comandas.items', { codigo }))
            .then(async (resp) => {
                if (!resp.ok) {
                    const data = await resp.json().catch(() => ({}));
                    setComandaError(data?.message ?? 'Falha ao carregar comanda.');
                    setComandaItems([]);
                    return;
                }
                const data = await resp.json();
                setComandaItems(Array.isArray(data?.items) ? data.items.map(normalizeComandaItem) : []);
                goToStep(3);
            })
            .catch(() => {
                setComandaError('Falha ao carregar comanda.');
                setComandaItems([]);
            })
            .finally(() => setComandaLoading(false));
    };

    const handleFinalize = () => {
        setAccessCode('');
        setAccessUser(null);
        setAccessError('');
        setComanda('');
        setComandaItems([]);
        setComandaError('');
        setSearch('');
        setSuggestions([]);
        setSearchError('');
        goToStep(1);
        if (accessRef.current) {
            accessRef.current.focus();
        }
    };

    const syncComandaItems = async (codigo) => {
        try {
            const resp = await fetch(route('sales.comandas.items', { codigo }));
            if (!resp.ok) throw new Error();
            const data = await resp.json();
            setComandaItems(Array.isArray(data?.items) ? data.items.map(normalizeComandaItem) : []);
        } catch (err) {
            // silencioso: lista não atualizada
        }
    };

    const addItemFromProduct = async (product, { unitPrice = null, barcode = null } = {}) => {
        if (!product || !comanda) {
            setSearchError('Informe a comanda antes de adicionar itens.');
            return;
        }

        const id = Number(product.tb1_id ?? product.id);

        try {
            const resp = await fetch(route('sales.comandas.add-item', { codigo: comanda }), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrfToken,
                },
                body: JSON.stringify({
                    product_id: id,
                    quantity: 1,
                    ...(barcode ? { barcode } : {}),
                    ...(unitPrice !== null ? { unit_price: unitPrice } : {}),
                    access_user_id: accessUser?.id ?? auth?.user?.id,
                }),
            });

            if (!resp.ok) {
                const data = await resp.json().catch(() => ({}));
                setSearchError(data?.message ?? 'Falha ao adicionar item.');
                return;
            }

            const data = await resp.json();
            setComandaItems(Array.isArray(data?.items) ? data.items.map(normalizeComandaItem) : []);
            setSearch('');
            setSuggestions([]);
            setSearchError('');
            searchRef.current?.focus();
        } catch (err) {
            setSearchError('Falha ao adicionar item.');
        }
    };

    const fetchProductAndAdd = (term) => {
        const normalizedLookupTerm = String(term ?? '').trim();

        if (!normalizedLookupTerm) return;

        const weightedBarcodeData = parseWeightedBarcode(normalizedLookupTerm);
        const lookupIsBarcode = isBarcodeTerm(normalizedLookupTerm);
        setSearchLoading(true);
        setSearchError('');
        fetch(
            route('products.search', {
                q: weightedBarcodeData ? weightedBarcodeData.productId : normalizedLookupTerm,
            }),
            {
                headers: { Accept: 'application/json' },
            },
        )
            .then((resp) => {
                if (!resp.ok) throw new Error();
                return resp.json();
            })
            .then((data) => {
                const product = data.find((item) => {
                    if (weightedBarcodeData) {
                        return Number(item.tb1_id) === weightedBarcodeData.productId;
                    }

                    if (lookupIsBarcode) {
                        return String(item.tb1_codbar ?? '').trim() === normalizedLookupTerm;
                    }

                    return Number(item.tb1_id) === Number(normalizedLookupTerm);
                })
                    ?? data.find(
                        (item) =>
                            String(item.tb1_nome ?? '').toLowerCase() === normalizedLookupTerm.toLowerCase(),
                    )
                    ?? data[0];

                if (!product) {
                    setSearchError('Produto nao encontrado.');
                    return;
                }
                addItemFromProduct(product, {
                    unitPrice: weightedBarcodeData?.unitPrice ?? null,
                    barcode: weightedBarcodeData?.barcode ?? null,
                });
            })
            .catch(() => setSearchError('Falha ao buscar produto.'))
            .finally(() => setSearchLoading(false));
    };

    const handleSearchChange = (e) => {
        const term = e.target.value;
        setSearch(term);
        setSearchError('');
        setSuggestions([]);

        if (searchDebounce.current) {
            clearTimeout(searchDebounce.current);
        }

        if (!term || term.trim().length < 1) {
            return;
        }

        searchDebounce.current = setTimeout(() => {
            setSearchLoading(true);
            const trimmedTerm = term.trim();
            const weightedBarcodeData = parseWeightedBarcode(trimmedTerm);

            fetch(route('products.search', { q: weightedBarcodeData ? weightedBarcodeData.productId : trimmedTerm }), {
                headers: { Accept: 'application/json' },
            })
                .then((resp) => {
                    if (!resp.ok) throw new Error();
                    return resp.json();
                })
                .then((data) => {
                    setSuggestions(data || []);
                })
                .catch(() => setSearchError('Falha ao buscar produtos.'))
                .finally(() => setSearchLoading(false));
        }, 300);
    };

    const handleSearchSubmit = (e) => {
        e.preventDefault();
        if (!search.trim()) return;
        fetchProductAndAdd(search.trim());
    };

    const updateQuantity = async (id, quantity) => {
        if (!comanda) {
            setSearchError('Informe a comanda antes de ajustar itens.');
            return;
        }

        try {
            const resp = await fetch(
                route('sales.comandas.update-item', { codigo: comanda, productId: id }),
                {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-Token': csrfToken,
                    },
                    body: JSON.stringify({
                        quantity,
                        access_user_id: accessUser?.id ?? auth?.user?.id,
                        removal_reason: quantity === 0 ? removeReason.trim() : undefined,
                    }),
                },
            );
            if (!resp.ok) {
                const data = await resp.json().catch(() => ({}));
                const nextError = data?.errors?.removal_reason?.[0] ?? data?.message ?? 'Falha ao atualizar item.';
                if (quantity === 0) {
                    setRemoveError(nextError);
                } else {
                    setSearchError(nextError);
                }
                return;
            }
            const data = await resp.json();
            setComandaItems(Array.isArray(data?.items) ? data.items.map(normalizeComandaItem) : []);
            if (quantity === 0) {
                closeRemoveModal();
            }
        } catch (err) {
            if (quantity === 0) {
                setRemoveError('Falha ao remover item.');
            } else {
                setSearchError('Falha ao atualizar item.');
            }
        }
    };

    const incrementItem = (id) => {
        const current = comandaItems.find((item) => item.line_id === id);
        const next = (current?.quantity ?? 0) + 1;
        updateQuantity(id, next);
    };

    const decrementItem = (id) => {
        const current = comandaItems.find((item) => item.line_id === id);
        const next = Math.max(0, (current?.quantity ?? 0) - 1);
        if (next === 0) {
            openRemoveModal(id);
            return;
        }
        updateQuantity(id, next);
    };

    const removeItem = (id) => {
        openRemoveModal(id);
    };

    const openRemoveModal = (id) => {
        setPendingRemovalItemId(id);
        setRemoveReason('');
        setRemoveError('');
        setRemoveModalOpen(true);
    };

    const closeRemoveModal = () => {
        setPendingRemovalItemId(null);
        setRemoveReason('');
        setRemoveError('');
        setRemoveModalOpen(false);
        setRemoveProcessing(false);
    };

    const confirmRemoveItem = async () => {
        if (!pendingRemovalItemId) {
            return;
        }

        if (!removeReason.trim()) {
            setRemoveError('Informe o motivo da remocao do item.');
            return;
        }

        setRemoveProcessing(true);
        await updateQuantity(pendingRemovalItemId, 0);
        setRemoveProcessing(false);
    };

    return (
        <div className="min-h-screen bg-gray-50">
            <Head title="Terminal Lanchonete" />

            <header className="border-b border-gray-200 bg-white">
                <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-xl">
                            🍔
                        </div>
                        <div>
                            <p className="text-sm font-semibold text-amber-700">Lanchonete</p>
                            <p className="text-xs text-gray-500">
                                Unidade: {pageProps?.auth?.unit?.name ?? '---'}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <Link
                            href={route('products.index')}
                            className="inline-flex items-center gap-2 rounded-full border border-gray-200 px-3 py-1 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-100"
                        >
                            <i className="bi bi-box-seam" aria-hidden="true"></i>
                            Produtos
                        </Link>
                        <Link
                            href={route('reports.switch-unit')}
                            className="inline-flex items-center gap-2 rounded-full border border-gray-200 px-3 py-1 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-100"
                        >
                            <i className="bi bi-arrow-left-right" aria-hidden="true"></i>
                            Trocar
                        </Link>
                        <Link
                            href={route('online.index')}
                            className="inline-flex items-center gap-2 rounded-full border border-gray-200 px-3 py-1 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-100"
                        >
                            <i className="bi bi-broadcast-pin" aria-hidden="true"></i>
                            On-Line
                        </Link>
                        <div className="hidden sm:flex flex-col items-end">
                            <span className="text-sm font-semibold text-gray-800">
                                {accessUser?.name ?? auth?.user?.name}
                            </span>
                            <span className="text-xs text-gray-500">Perfil: Lanchonete</span>
                        </div>
                    </div>
                </div>
            </header>

            <main className="mx-auto max-w-5xl space-y-4 px-4 py-6">
                {step === 1 && (
                    <StepCard
                        title="1. Codigo de acesso"
                        description="Informe seu codigo de acesso antes de lancar itens."
                    >
                        <form onSubmit={handleAccessSubmit} className="space-y-3">
                            <input
                                ref={accessRef}
                                type="password"
                                inputMode="text"
                                placeholder="Digite o codigo de acesso"
                                value={accessCode}
                                onChange={(e) => setAccessCode(e.target.value.toUpperCase())}
                                maxLength={10}
                                className="w-full rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-lg font-semibold text-amber-800 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-200"
                            />
                            {accessUser && (
                                <p className="text-sm font-semibold text-green-700">
                                    Usuario: {accessUser.name} ({accessUser.cod_acesso})
                                </p>
                            )}
                            {accessError && (
                                <p className="text-sm font-semibold text-red-600">{accessError}</p>
                            )}
                            <div className="flex justify-end">
                                <button
                                    type="submit"
                                    className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-400"
                                >
                                    Avancar
                                </button>
                            </div>
                        </form>
                    </StepCard>
                )}

                {step === 2 && (
                    <StepCard
                        title="2. Codigo da comanda"
                        description="Informe o numero da comanda (3000-3100)."
                    >
                        <form onSubmit={handleComandaSubmit} className="space-y-3">
                            <input
                                ref={comandaRef}
                                type="number"
                                inputMode="numeric"
                                placeholder="Digite o codigo da comanda"
                                value={comanda}
                                onChange={(e) => setComanda(e.target.value)}
                                className="w-full rounded-lg border border-blue-300 bg-blue-50 px-4 py-3 text-lg font-semibold text-blue-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                            />
                            {comandaError && (
                                <p className="text-sm font-semibold text-red-600">{comandaError}</p>
                            )}
                            <div className="flex justify-between">
                                <button
                                    type="button"
                                    onClick={() => goToStep(1)}
                                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100"
                                >
                                    Voltar
                                </button>
                                <button
                                    type="submit"
                                    disabled={comandaLoading}
                                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
                                >
                                    {comandaLoading ? 'Carregando...' : 'Avancar'}
                                </button>
                            </div>
                        </form>
                    </StepCard>
                )}

                {step === 3 && (
                    <div className="space-y-4">
                        <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700">
                            Comanda atual: {comanda || '---'}
                        </div>
                        <StepCard
                            title="3. Buscar produto"
                            description="Busque pelo produto para adicionar aos itens da comanda."
                        >
                            <form onSubmit={handleSearchSubmit} className="space-y-3">
                                <input
                                    ref={searchRef}
                                    type="text"
                                    placeholder="Digite nome, codigo de barras ou ID do produto"
                                    value={search}
                                    onChange={handleSearchChange}
                                    className="w-full rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-lg font-semibold text-green-800 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-200"
                                />
                                {searchError && (
                                    <p className="text-sm font-semibold text-red-600">{searchError}</p>
                                )}
                                {suggestions.length > 0 && (
                                    <div className="rounded-lg border border-green-200 bg-white shadow-sm">
                                        <ul className="max-h-60 overflow-auto divide-y divide-gray-100">
                                            {suggestions.map((item) => (
                                                <li
                                                    key={`${item.tb1_id}-${Number(item.tb1_vlr_venda ?? 0).toFixed(2)}`}
                                                    className="flex cursor-pointer items-center justify-between px-4 py-2 text-sm hover:bg-green-50"
                                                    onClick={() => addItemFromProduct(item)}
                                                >
                                                    <div>
                                                        <p className="font-semibold text-gray-800">
                                                            {item.tb1_nome}
                                                        </p>
                                                        <p className="text-gray-500">
                                                            ID: {item.tb1_id} • R${' '}
                                                            {Number(item.tb1_vlr_venda ?? 0).toFixed(2)}
                                                        </p>
                                                    </div>
                                                    <span className="text-xs rounded-full bg-green-100 px-2 py-1 text-green-700">
                                                        Selecionar
                                                    </span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                                <div className="flex justify-end">
                                    <button
                                        type="submit"
                                        disabled={searchLoading}
                                        className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-400"
                                    >
                                        {searchLoading ? 'Buscando...' : 'Adicionar'}
                                    </button>
                                </div>
                            </form>
                        </StepCard>

                        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                            <div className="flex items-center justify-between">
                                <h3 className="text-base font-semibold text-gray-800">
                                    Itens adicionados {comanda ? `- Comanda ${comanda}` : ''}
                                </h3>
                                <button
                                    type="button"
                                    onClick={handleFinalize}
                                    className="rounded-lg bg-gray-800 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-400"
                                >
                                    Finalizar / Nova comanda
                                </button>
                            </div>
                            {comandaItems.length === 0 ? (
                                <p className="mt-2 text-sm text-gray-500">
                                    Nenhum item encontrado para esta comanda. (Adicione itens pela busca.)
                                </p>
                            ) : (
                                <ul className="mt-3 divide-y divide-gray-200">
                                    {comandaItems.map((item) => (
                                        <li key={item.line_id} className="flex items-center justify-between py-2 text-sm">
                                            <div>
                                                <p className="font-semibold text-gray-800">{item.name}</p>
                                                <p className="text-gray-500">
                                                    ID: {item.product_id} • R$ {Number(item.price).toFixed(2)}
                                                </p>
                                                {item.lanc_user_name && (
                                                    <p className="text-xs font-semibold text-gray-600">
                                                        {item.lanc_user_name}
                                                    </p>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => decrementItem(item.line_id)}
                                                    className="h-8 w-8 rounded-full border border-gray-300 text-gray-700 hover:bg-gray-100"
                                                >
                                                    -
                                                </button>
                                                <span className="w-10 text-center font-semibold text-gray-800">
                                                    {item.quantity}
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => incrementItem(item.line_id)}
                                                    className="h-8 w-8 rounded-full border border-gray-300 text-gray-700 hover:bg-gray-100"
                                                >
                                                    +
                                                </button>
                                                <span className="w-20 text-right font-semibold text-gray-700">
                                                    R$ {(Number(item.price) * Number(item.quantity)).toFixed(2)}
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => removeItem(item.line_id)}
                                                    className="text-xs font-semibold text-red-600 hover:text-red-700"
                                                >
                                                    Remover
                                                </button>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>
                )}
            </main>

            {removeModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
                    <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
                        <h3 className="text-lg font-semibold text-gray-900">
                            Confirmar remocao do item
                        </h3>
                        <p className="mt-2 text-sm text-gray-600">
                            Informe o motivo da remocao. Esta informacao sera enviada pelo bate-papo do sistema para os usuarios MASTER, gerentes da unidade e para o proprio executor.
                        </p>
                        <div className="mt-4">
                            <label htmlFor="remove_reason" className="text-sm font-medium text-gray-700">
                                Motivo da remocao
                            </label>
                            <textarea
                                id="remove_reason"
                                rows={4}
                                value={removeReason}
                                onChange={(event) => setRemoveReason(event.target.value)}
                                className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-2 text-gray-800 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-200"
                                placeholder="Descreva o motivo da remocao deste item"
                            />
                            {removeError && (
                                <p className="mt-2 text-sm font-semibold text-red-600">{removeError}</p>
                            )}
                        </div>
                        <div className="mt-6 flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={closeRemoveModal}
                                disabled={removeProcessing}
                                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={confirmRemoveItem}
                                disabled={removeProcessing}
                                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-red-700 disabled:opacity-50"
                            >
                                {removeProcessing ? 'Removendo...' : 'Confirmar remocao'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
