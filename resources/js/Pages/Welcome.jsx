import React, { useState } from 'react';
import { Head, Link, useForm } from '@inertiajs/react';

export default function Welcome({ units = [], flash = {}, selectedUnitId = null }) {
    const currentYear = new Date().getFullYear();
    const appName = import.meta.env.VITE_APP_NAME || 'PeC';
    const loginHref = selectedUnitId ? route('login', { l: selectedUnitId }) : route('login');
    const {
        data,
        setData,
        post,
        processing,
        errors,
        reset,
        recentlySuccessful,
    } = useForm({
        name: '',
        phone: '',
    });
    const [showWhatsappForm, setShowWhatsappForm] = useState(false);

    const validUnits = units.filter((unit) => {
        const cepDigits = String(unit.tb2_cep || '').replace(/\D/g, '');
        return cepDigits.length === 8;
    });

    const successText =
        flash?.success ||
        (recentlySuccessful
            ? 'Cadastro recebido. Voce recebera informacoes de produtos feitos na hora.'
            : '');
    const showNewsletterForm = showWhatsappForm || Boolean(errors.name || errors.phone || successText);

    const getMapEmbedUrl = (value) => {
        if (!value) {
            return null;
        }

        try {
            const url = new URL(value);
            const host = url.hostname.replace(/^www\./, '');
            const isGoogleHost =
                host === 'google.com' || host.endsWith('.google.com') || host === 'maps.google.com';

            if (!isGoogleHost) {
                return null;
            }

            if (url.pathname.includes('/maps/embed') || url.searchParams.get('output') === 'embed') {
                return url.toString();
            }

            const query = url.searchParams.get('q') || url.searchParams.get('query');
            if (query) {
                return `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed`;
            }

            const placeMatch = url.pathname.match(/\/maps\/place\/([^/]+)/);
            if (placeMatch) {
                const place = placeMatch[1].replace(/\+/g, ' ');
                return `https://www.google.com/maps?q=${encodeURIComponent(place)}&output=embed`;
            }

            const searchMatch = url.pathname.match(/\/maps\/search\/([^/]+)/);
            if (searchMatch) {
                const search = searchMatch[1].replace(/\+/g, ' ');
                return `https://www.google.com/maps?q=${encodeURIComponent(search)}&output=embed`;
            }

            const coordsMatch = url.pathname.match(/\/maps\/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
            if (coordsMatch) {
                const coords = `${coordsMatch[1]},${coordsMatch[2]}`;
                return `https://www.google.com/maps?q=${encodeURIComponent(coords)}&output=embed`;
            }
        } catch (error) {
            return null;
        }

        return null;
    };

    const submitNewsletter = (event) => {
        event.preventDefault();
        post(route('newsletter.store'), {
            preserveScroll: true,
            onSuccess: () => {
                reset();
                setShowWhatsappForm(true);
            },
        });
    };

    return (
        <>
            <Head title="Bem-vindo">
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
                <link
                    href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;700&family=Space+Grotesk:wght@400;500;600&display=swap"
                    rel="stylesheet"
                />
                <link
                    rel="stylesheet"
                    href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css"
                />
            </Head>

            <div
                className="relative min-h-screen overflow-hidden bg-[var(--surface)] text-[var(--ink)]"
                style={{
                    fontFamily: "'Space Grotesk', sans-serif",
                    '--surface': '#fff7f2',
                    '--ink': '#0f172a',
                    '--accent': '#e11d48',
                    '--accent-strong': '#be123c',
                }}
            >
                <div className="pointer-events-none absolute -top-24 right-10 h-72 w-72 rounded-full bg-amber-300/40 blur-[120px]" />
                <div className="pointer-events-none absolute -bottom-20 left-0 h-96 w-96 rounded-full bg-rose-400/30 blur-[140px]" />
                <div className="pointer-events-none absolute inset-0 opacity-80 [background-image:radial-gradient(circle_at_top,#ffffff_0%,rgba(255,255,255,0)_60%)]" />

                <div className="relative">
                    <main className="mx-auto w-full max-w-6xl px-6 pb-16 pt-10 lg:pt-6">
                        <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr]">
                            <div>
                                <span
                                    className="reveal-up inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-rose-700 shadow-sm"
                                    style={{ animationDelay: '0.05s' }}
                                >
                                    PADARIA
                                </span>
                                <h1
                                    className="reveal-up mt-5 text-4xl font-semibold leading-tight text-slate-900 sm:text-5xl"
                                    style={{
                                        fontFamily: "'Playfair Display', serif",
                                        animationDelay: '0.12s',
                                    }}
                                >
                                    PÃO & CAFÉ.
                                </h1>
                                <p
                                    className="reveal-up mt-4 text-base text-slate-600 sm:text-lg"
                                    style={{ animationDelay: '0.2s' }}
                                >
                                    Qualidade, variedade e preço baixo, venha conferir.
                                </p>
                                <div className="reveal-up mt-6 flex flex-wrap gap-3" style={{ animationDelay: '0.28s' }}>
                                    <Link
                                        href={loginHref}
                                        className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-slate-900/20 transition hover:bg-slate-800"
                                    >
                                        Login
                                    </Link>
                                </div>

                                <div
                                    className="reveal-up mt-8 grid gap-4 sm:grid-cols-2"
                                    style={{ animationDelay: '0.36s' }}
                                >
                                    <div className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm">
                                        <div className="flex items-center gap-3">
                                            <button
                                                type="button"
                                                onClick={() => setShowWhatsappForm((prev) => !prev)}
                                                aria-expanded={showNewsletterForm}
                                                aria-controls="newsletter-form"
                                                aria-label="Abrir cadastro do WhatsApp"
                                                className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600 transition hover:bg-emerald-200"
                                            >
                                                <i className="bi bi-whatsapp text-lg" aria-hidden="true" />
                                            </button>
                                            <div>
                                                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-500">
                                                    PÃO QUENTINHO
                                                </p>
                                                <p className="mt-1 text-xs text-slate-500">WhatsApp.</p>
                                            </div>
                                        </div>
                                        <p className="mt-3 text-sm text-slate-600">
                                            Voce recebera informacoes de produtos feitos na hora.
                                        </p>
                                        {showNewsletterForm && (
                                            <form id="newsletter-form" className="mt-4 space-y-3" onSubmit={submitNewsletter}>
                                                <div>
                                                    <label className="text-xs font-semibold text-slate-600">Nome</label>
                                                    <input
                                                        type="text"
                                                        name="name"
                                                        value={data.name}
                                                        autoComplete="name"
                                                        placeholder="Digite seu nome"
                                                        onChange={(event) => setData('name', event.target.value)}
                                                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white/90 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-rose-300 focus:ring-2 focus:ring-rose-200"
                                                    />
                                                    {errors.name && (
                                                        <p className="mt-1 text-xs text-rose-600">{errors.name}</p>
                                                    )}
                                                </div>
                                                <div>
                                                    <label className="text-xs font-semibold text-slate-600">WhatsApp</label>
                                                    <input
                                                        type="tel"
                                                        name="phone"
                                                        value={data.phone}
                                                        autoComplete="tel"
                                                        inputMode="tel"
                                                        placeholder="(00) 00000-0000"
                                                        onChange={(event) => setData('phone', event.target.value)}
                                                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white/90 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-rose-300 focus:ring-2 focus:ring-rose-200"
                                                    />
                                                    {errors.phone && (
                                                        <p className="mt-1 text-xs text-rose-600">{errors.phone}</p>
                                                    )}
                                                </div>
                                                <button
                                                    type="submit"
                                                    disabled={processing}
                                                    className="inline-flex items-center justify-center rounded-full bg-emerald-500 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
                                                >
                                                    Quero receber
                                                </button>
                                                {successText && (
                                                    <p className="text-xs font-semibold text-emerald-600">{successText}</p>
                                                )}
                                            </form>
                                        )}
                                    </div>
                                    <div className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm">
                                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-500">
                                            CARTÃO FIDELIDADE
                                        </p>
                                        <p className="mt-2 text-sm text-slate-600">
                                            Aproveite nossas vantegns, toda compra gera um bonus.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="relative">
                                <div
                                    className="reveal-up rounded-3xl border border-white/70 bg-white/75 p-6 shadow-xl backdrop-blur"
                                    style={{ animationDelay: '0.2s' }}
                                >
                                    <div className="flex items-center justify-between">
                                        <p className="text-sm font-semibold text-slate-700">Nossas Unidades</p>
                                        <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-600">
                                            {validUnits.length} unidade{validUnits.length === 1 ? '' : 's'}
                                        </span>
                                    </div>
                                    <div className="mt-5 space-y-4">
                                        {validUnits.slice(0, 3).map((unit) => (
                                            <div
                                                key={unit.tb2_id}
                                                className="rounded-2xl border border-rose-100 bg-rose-50/60 p-4"
                                            >
                                                <p className="text-sm font-semibold text-slate-800">{unit.tb2_nome}</p>
                                                <p className="mt-1 text-xs text-slate-600">{unit.tb2_endereco}</p>
                                            </div>
                                        ))}
                                        {validUnits.length === 0 && (
                                            <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 p-4 text-sm text-slate-600">
                                                Nenhuma unidade cadastrada ainda. Cadastre para aparecer aqui.
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <section id="unidades" className="mt-3">
                            <div
                                className="reveal-up flex flex-wrap items-end justify-between gap-4"
                                style={{ animationDelay: '0.1s' }}
                            />

                            <div className="mt-2 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                                {validUnits.length ? (
                                    validUnits.map((unit, index) => {
                                        const mapEmbedUrl = getMapEmbedUrl(unit.tb2_localizacao);

                                        return (
                                            <div
                                                key={unit.tb2_id}
                                                className="reveal-up flex h-full flex-col rounded-3xl border border-white/70 bg-white/80 p-5 shadow-md transition hover:-translate-y-1 hover:shadow-lg"
                                                style={{ animationDelay: `${Math.min(index * 0.06, 0.3)}s` }}
                                            >
                                                <div className="flex items-start justify-between gap-4">
                                                    <h3 className="text-lg font-semibold text-slate-900">
                                                        {unit.tb2_nome}
                                                    </h3>
                                                    <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                                                        {unit.tb2_id}
                                                    </span>
                                                </div>
                                                {mapEmbedUrl && (
                                                    <div className="mt-4 overflow-hidden rounded-2xl border border-white/70 bg-white/70">
                                                        <iframe
                                                            title={`Mapa da unidade ${unit.tb2_nome}`}
                                                            src={mapEmbedUrl}
                                                            loading="lazy"
                                                            referrerPolicy="no-referrer-when-downgrade"
                                                            className="h-40 w-full"
                                                            style={{ border: 0 }}
                                                            allowFullScreen
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })
                                ) : (
                                    <div className="reveal-up col-span-full rounded-3xl border border-dashed border-rose-200 bg-white/80 p-10 text-center text-slate-600">
                                        <p className="text-base font-semibold text-slate-700">
                                            Nenhuma unidade cadastrada no momento.
                                        </p>
                                        <p className="mt-2 text-sm">
                                            Cadastre uma unidade para exibir informacoes aqui.
                                        </p>
                                        <Link
                                            href={loginHref}
                                            className="mt-6 inline-flex rounded-full border border-rose-200 bg-rose-50 px-5 py-2 text-sm font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-100"
                                        >
                                            Login
                                        </Link>
                                    </div>
                                )}
                            </div>
                        </section>
                    </main>

                    <footer className="border-t border-white/70 bg-white/70">
                        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-6 py-6 text-sm text-slate-500 sm:flex-row">
                            <p>
                                @ {currentYear} {appName}. Pão & Café Todos os direitos reservados.
                            </p>
                            <p className="text-xs uppercase tracking-[0.2em] text-rose-500">Bem-vindo</p>
                        </div>
                    </footer>
                </div>
            </div>
        </>
    );
}
