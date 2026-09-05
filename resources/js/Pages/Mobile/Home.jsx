import MobileLayout from '@/Layouts/MobileLayout';
import { Head, Link, usePage } from '@inertiajs/react';

const shortcuts = [
    {
        key: 'sales-today',
        label: 'Vendas de hoje',
        description: 'Hoje, ontem e unidade.',
        icon: 'bi-calendar-day',
        href: route('mobile.reports.sales.today'),
    },
    {
        key: 'control',
        label: 'Controle',
        description: 'Forma de pagamento e periodo.',
        icon: 'bi-graph-up-arrow',
        href: route('mobile.reports.control'),
    },
    {
        key: 'sales-detailed',
        label: 'Detalhado',
        description: 'Data e unidade.',
        icon: 'bi-card-checklist',
        href: route('mobile.reports.sales.detailed'),
    },
    {
        key: 'cash-closure',
        label: 'Fechamento de caixa',
        description: 'Data e unidade.',
        icon: 'bi-clipboard-data',
        href: route('mobile.reports.cash.closure'),
    },
    {
        key: 'vale',
        label: 'Vale',
        description: 'Periodo, funcionario e lojas.',
        icon: 'bi-ticket-perforated',
        href: route('mobile.reports.vale'),
    },
    {
        key: 'contra-cheque',
        label: 'Contra-cheque',
        description: 'Inicio, fim e usuario.',
        icon: 'bi-receipt-cutoff',
        href: route('mobile.settings.contra-cheque'),
    },
];

export default function MobileHome() {
    const { auth } = usePage().props;
    const user = auth?.user ?? null;
    const unitName = auth?.unit?.name ?? '---';

    return (
        <MobileLayout
            title="Area mobile"
            subtitle="Acesso enxuto com apenas as telas informadas."
            backHref={route('dashboard')}
        >
            <Head title="Area mobile" />

            <section className="rounded-[1.75rem] bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.12)]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-slate-500">
                    {Number(user?.funcao ?? -1) === 0 ? 'Master' : 'Gestao'}
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-900">
                    {user?.name ?? '---'}
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                    Unidade atual: {unitName}
                </p>
            </section>

            <section className="mt-4 grid gap-3">
                {shortcuts.map((shortcut) => (
                    <Link
                        key={shortcut.key}
                        href={shortcut.href}
                        className="group flex items-center justify-between rounded-[1.5rem] border border-slate-200 bg-white px-4 py-4 shadow-sm transition hover:border-indigo-300 hover:shadow-md"
                    >
                        <div className="flex min-w-0 items-center gap-3">
                            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-700 group-hover:bg-indigo-100">
                                <i className={`bi ${shortcut.icon} text-xl`} aria-hidden="true" />
                            </div>
                            <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-slate-900">
                                    {shortcut.label}
                                </p>
                                <p className="truncate text-xs text-slate-500">{shortcut.description}</p>
                            </div>
                        </div>
                        <span className="shrink-0 text-xs font-semibold text-indigo-600">
                            Abrir
                        </span>
                    </Link>
                ))}
            </section>
        </MobileLayout>
    );
}
