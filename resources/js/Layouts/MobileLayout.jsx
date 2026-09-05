import { Link, usePage } from '@inertiajs/react';

export default function MobileLayout({ title, subtitle, children, backHref = route('mobile.home') }) {
    const { auth } = usePage().props;
    const user = auth?.user ?? null;
    const unitName = auth?.unit?.name ?? '---';

    return (
        <div className="min-h-screen bg-[linear-gradient(180deg,#07111f_0%,#0f172a_34%,#f8fafc_34%,#f8fafc_100%)] text-slate-900">
            <div className="mx-auto flex min-h-screen max-w-3xl flex-col">
                <header className="sticky top-0 z-20 border-b border-white/10 bg-slate-950/90 px-4 py-4 backdrop-blur">
                    <div className="flex items-center justify-between gap-3 text-white">
                        <Link
                            href={backHref}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white"
                            aria-label="Voltar"
                        >
                            <i className="bi bi-arrow-left" aria-hidden="true" />
                        </Link>
                        <div className="min-w-0 text-center">
                            <p className="truncate text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-300">
                                {user?.name ?? '---'} | {unitName}
                            </p>
                            <h1 className="truncate text-base font-semibold">{title}</h1>
                        </div>
                        <div className="h-10 w-10" />
                    </div>
                    {subtitle ? (
                        <p className="mt-3 text-center text-sm text-slate-300">{subtitle}</p>
                    ) : null}
                </header>

                <main className="flex-1 px-4 pb-8 pt-5 sm:px-6">
                    {children}
                </main>
            </div>
        </div>
    );
}
