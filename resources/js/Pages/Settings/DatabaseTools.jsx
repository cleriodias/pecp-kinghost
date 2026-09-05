import AlertMessage from '@/Components/Alert/AlertMessage';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { formatBrazilDateTime } from '@/Utils/date';
import { Head, router, usePage } from '@inertiajs/react';
import { useState } from 'react';

const ACTIONS = [
    {
        key: 'migrate',
        label: 'Executar migrate',
        description: 'Aplica as migracoes pendentes no banco.',
        icon: 'bi-database',
        classes:
            'border-indigo-200 bg-indigo-50 text-indigo-800 hover:border-indigo-300 dark:border-indigo-500/40 dark:bg-indigo-900/20 dark:text-indigo-200',
        confirm: 'Executar migrate? Isso pode alterar o banco.',
    },
    {
        key: 'seed',
        label: 'Executar seeder',
        description: 'Executa os seeders registrados.',
        icon: 'bi-database',
        classes:
            'border-emerald-200 bg-emerald-50 text-emerald-800 hover:border-emerald-300 dark:border-emerald-500/40 dark:bg-emerald-900/20 dark:text-emerald-200',
        confirm: 'Executar seeder? Isso pode alterar o banco.',
    },
    {
        key: 'migrate-seed',
        label: 'Migrate + seeder',
        description: 'Roda migrate e depois seed.',
        icon: 'bi-arrow-repeat',
        classes:
            'border-amber-200 bg-amber-50 text-amber-900 hover:border-amber-300 dark:border-amber-500/40 dark:bg-amber-900/20 dark:text-amber-100',
        confirm: 'Executar migrate + seeder? Isso pode alterar o banco.',
    },
];

const ACTION_LABELS = {
    migrate: 'migrate',
    'migrate-single': 'migration individual',
    seed: 'seeder',
    'seed-single': 'seeder individual',
    'migrate-seed': 'migrate + seeder',
};

const formatDateTime = (value) => {
    if (!value) {
        return '--';
    }

    return formatBrazilDateTime(value);
};

const normalizeMigration = (migration) => {
    if (typeof migration === 'string') {
        return {
            name: migration,
            file: `${migration}.php`,
            label: migration,
        };
    }

    const name = migration?.name ?? migration?.file ?? '';

    return {
        ...migration,
        name,
        file: migration?.file ?? (name ? `${name}.php` : ''),
        label: migration?.label ?? name,
    };
};

export default function DatabaseTools({
    auth,
    artisanOutput,
    artisanErrorDetail,
    lastAction,
    environment,
    migrationStatus,
    seederStatus,
}) {
    const { flash } = usePage().props;
    const [pendingAction, setPendingAction] = useState(null);
    const [showMigrations, setShowMigrations] = useState(false);
    const [showSeeders, setShowSeeders] = useState(false);

    const handleAction = (action, payload = {}) => {
        if (pendingAction) {
            return;
        }

        if (!window.confirm(action.confirm)) {
            return;
        }

        router.post(
            route('settings.database.run'),
            { action: action.key, ...payload },
            {
                preserveScroll: true,
                onStart: () => setPendingAction(action.key),
                onFinish: () => setPendingAction(null),
            },
        );
    };

    const lastActionLabel = lastAction ? ACTION_LABELS[lastAction] ?? lastAction : null;
    const pendingMigrations = (migrationStatus?.pending ?? []).map(normalizeMigration);
    const pendingCount = migrationStatus?.pending_count ?? 0;
    const migrationsTotal = migrationStatus?.total ?? 0;
    const migrationsRan = migrationStatus?.ran ?? 0;
    const migrationsError = migrationStatus?.error;
    const seedersTotal = seederStatus?.total ?? 0;
    const seederPending = Boolean(seederStatus?.pending);
    const seederReason = seederStatus?.pending_reason;
    const seederLastRun = seederStatus?.last_run_at;
    const seeders = seederStatus?.files ?? [];

    const migrationsBadgeClasses =
        pendingCount > 0
            ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-200'
            : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200';
    const seederBadgeClasses = !seedersTotal
        ? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-200'
        : seederPending
          ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-200'
          : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200';

    const seederStatusText = () => {
        if (!seedersTotal) {
            return 'Nenhum seeder encontrado.';
        }
        if (seederReason === 'never') {
            return 'Nunca executado por esta tela.';
        }
        if (seederReason === 'changed') {
            return 'Arquivos alterados desde a ultima execucao.';
        }
        return 'Sem pendencias detectadas.';
    };

    const handleRunMigration = (migration) => {
        handleAction(
            {
                key: `migrate-single:${migration.name}`,
                confirm: `Executar somente ${migration.label ?? migration.name}? Isso pode alterar o banco.`,
            },
            {
                action: 'migrate-single',
                migration: migration.file ?? migration.name,
            },
        );
    };

    const handleRunSeeder = (seeder) => {
        handleAction(
            {
                key: `seed-single:${seeder.name}`,
                confirm: `Executar somente ${seeder.label ?? seeder.name}? Isso pode alterar o banco.`,
            },
            {
                action: 'seed-single',
                seeder: seeder.name,
            },
        );
    };

    return (
        <AuthenticatedLayout
            user={auth.user}
            header={
                <div className="flex flex-col gap-1">
                    <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">
                        Banco de dados
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-300">
                        Execute migrate e seeder direto do sistema.
                    </p>
                </div>
            }
        >
            <Head title="Banco de dados" />
            <div className="py-8">
                <div className="mx-auto max-w-5xl space-y-6 px-4 sm:px-6 lg:px-8">
                    <AlertMessage message={flash} />
                    {artisanErrorDetail && (
                        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-500/40 dark:bg-red-900/20 dark:text-red-200">
                            <p className="font-semibold">Erro tecnico</p>
                            <pre className="mt-2 whitespace-pre-wrap break-words text-xs">
                                {artisanErrorDetail}
                            </pre>
                        </div>
                    )}

                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-900/20 dark:text-amber-200">
                        <p className="font-semibold">Atencao</p>
                        <p className="mt-1">
                            Essas acoes alteram o banco e podem levar alguns minutos.
                        </p>
                        <p className="mt-1 text-xs text-amber-800 dark:text-amber-100">
                            Ambiente atual: {environment}
                        </p>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-2">
                        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <h3 className="text-sm font-semibold uppercase text-gray-600 dark:text-gray-300">
                                        Status das migrations
                                    </h3>
                                    <button
                                        type="button"
                                        onClick={() => setShowMigrations((current) => !current)}
                                        className="mt-1 inline-flex items-center gap-2 text-xs font-semibold text-blue-700 transition hover:text-blue-900 dark:text-blue-300 dark:hover:text-blue-100"
                                    >
                                        Total: {migrationsTotal} | Executadas: {migrationsRan}
                                        <i className={`bi ${showMigrations ? 'bi-chevron-up' : 'bi-chevron-down'}`} aria-hidden="true"></i>
                                    </button>
                                </div>
                                <span
                                    className={`rounded-full px-3 py-1 text-xs font-semibold ${migrationsBadgeClasses}`}
                                >
                                    {pendingCount} pendente{pendingCount === 1 ? '' : 's'}
                                </span>
                            </div>

                            {migrationsError ? (
                                <p className="mt-3 text-xs text-red-600 dark:text-red-300">
                                    {migrationsError}
                                </p>
                            ) : pendingCount > 0 ? (
                                <div className="mt-3">
                                    <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                                        Pendentes
                                    </p>
                                    {showMigrations ? (
                                        <div className="mt-3 space-y-2 rounded-xl border border-gray-100 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-800/60">
                                            {pendingMigrations.map((migration, index) => {
                                                const isMigrationBusy = pendingAction === `migrate-single:${migration.name}`;

                                                return (
                                                    <div key={migration.name || `migration-${index}`} className="flex flex-col gap-2 rounded-lg border border-white bg-white p-3 text-xs shadow-sm dark:border-gray-700 dark:bg-gray-900 sm:flex-row sm:items-center sm:justify-between">
                                                        <div className="min-w-0">
                                                            <p className="truncate font-semibold text-gray-700 dark:text-gray-100">
                                                                {migration.label || migration.name || migration.file || 'Migration pendente'}
                                                            </p>
                                                            <p className="truncate text-gray-500 dark:text-gray-300">
                                                                {migration.file || migration.name}
                                                            </p>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleRunMigration(migration)}
                                                            disabled={Boolean(pendingAction)}
                                                            className={`inline-flex items-center justify-center gap-2 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 font-semibold text-indigo-800 transition hover:border-indigo-300 disabled:cursor-not-allowed disabled:opacity-60 dark:border-indigo-500/40 dark:bg-indigo-900/20 dark:text-indigo-200 ${isMigrationBusy ? 'opacity-70' : ''}`}
                                                        >
                                                            <i className="bi bi-play-fill" aria-hidden="true"></i>
                                                            {isMigrationBusy ? 'Executando...' : 'Executar'}
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <p className="mt-2 text-xs text-gray-500 dark:text-gray-300">
                                            Clique no total para ver e executar uma migration especifica.
                                        </p>
                                    )}
                                </div>
                            ) : (
                                <p className="mt-3 text-xs text-gray-500 dark:text-gray-300">
                                    Nenhuma pendencia encontrada.
                                </p>
                            )}
                        </div>

                        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <h3 className="text-sm font-semibold uppercase text-gray-600 dark:text-gray-300">
                                        Status dos seeders
                                    </h3>
                                    <button
                                        type="button"
                                        onClick={() => setShowSeeders((current) => !current)}
                                        className="mt-1 inline-flex items-center gap-2 text-xs font-semibold text-blue-700 transition hover:text-blue-900 dark:text-blue-300 dark:hover:text-blue-100"
                                    >
                                        Seeders encontrados: {seedersTotal}
                                        <i className={`bi ${showSeeders ? 'bi-chevron-up' : 'bi-chevron-down'}`} aria-hidden="true"></i>
                                    </button>
                                </div>
                                <span
                                    className={`rounded-full px-3 py-1 text-xs font-semibold ${seederBadgeClasses}`}
                                >
                                    {seedersTotal === 0
                                        ? 'Sem seeders'
                                        : seederPending
                                          ? 'Pendente'
                                          : 'Ok'}
                                </span>
                            </div>

                            <p className="mt-3 text-xs text-gray-600 dark:text-gray-300">
                                {seederStatusText()}
                            </p>
                            {seedersTotal > 0 && (
                                <p className="mt-2 text-xs text-gray-500 dark:text-gray-300">
                                    Ultima execucao: {formatDateTime(seederLastRun)}
                                </p>
                            )}
                            <p className="mt-2 text-xs text-gray-500 dark:text-gray-300">
                                Pendencias de seeders consideram apenas execucoes registradas
                                aqui.
                            </p>
                            {showSeeders && (
                                <div className="mt-4 space-y-2 rounded-xl border border-gray-100 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-800/60">
                                    {seeders.length === 0 ? (
                                        <p className="text-xs text-gray-500 dark:text-gray-300">
                                            Nenhum arquivo de seeder encontrado.
                                        </p>
                                    ) : (
                                        seeders.map((seeder) => {
                                            const isSeederBusy = pendingAction === `seed-single:${seeder.name}`;

                                            return (
                                                <div key={seeder.name} className="flex flex-col gap-2 rounded-lg border border-white bg-white p-3 text-xs shadow-sm dark:border-gray-700 dark:bg-gray-900 sm:flex-row sm:items-center sm:justify-between">
                                                    <div className="min-w-0">
                                                        <p className="truncate font-semibold text-gray-700 dark:text-gray-100">
                                                            {seeder.label ?? seeder.name}
                                                        </p>
                                                        <p className="truncate text-gray-500 dark:text-gray-300">
                                                            {seeder.name}
                                                        </p>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRunSeeder(seeder)}
                                                        disabled={Boolean(pendingAction)}
                                                        className={`inline-flex items-center justify-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 font-semibold text-emerald-800 transition hover:border-emerald-300 disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-500/40 dark:bg-emerald-900/20 dark:text-emerald-200 ${isSeederBusy ? 'opacity-70' : ''}`}
                                                    >
                                                        <i className="bi bi-play-fill" aria-hidden="true"></i>
                                                        {isSeederBusy ? 'Executando...' : 'Executar'}
                                                    </button>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-3">
                        {ACTIONS.map((action) => {
                            const isBusy = pendingAction === action.key;
                            return (
                                <button
                                    key={action.key}
                                    type="button"
                                    onClick={() => handleAction(action)}
                                    disabled={Boolean(pendingAction)}
                                    className={`flex h-full flex-col gap-2 rounded-2xl border px-4 py-4 text-left text-sm font-semibold shadow-sm transition ${action.classes} ${pendingAction ? 'cursor-not-allowed opacity-70' : ''}`}
                                >
                                    <span className="inline-flex items-center gap-2 text-base font-semibold">
                                        <i className={`bi ${action.icon}`} aria-hidden="true"></i>
                                        {action.label}
                                    </span>
                                    <span className="text-xs font-normal text-gray-700/80 dark:text-gray-300">
                                        {action.description}
                                    </span>
                                    {isBusy && (
                                        <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                                            Executando...
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
                        <div className="flex flex-col gap-1">
                            <h3 className="text-sm font-semibold uppercase text-gray-600 dark:text-gray-300">
                                Saida do Artisan
                            </h3>
                            {lastActionLabel && (
                                <p className="text-xs text-gray-500 dark:text-gray-300">
                                    Ultima execucao: {lastActionLabel}
                                </p>
                            )}
                        </div>
                        <div className="mt-4">
                            {artisanOutput ? (
                                <pre className="whitespace-pre-wrap rounded-xl border border-gray-100 bg-gray-50 p-3 text-xs text-gray-700 dark:border-gray-800 dark:bg-gray-800/60 dark:text-gray-200">
                                    {artisanOutput}
                                </pre>
                            ) : (
                                <p className="text-xs text-gray-500 dark:text-gray-300">
                                    Nenhuma execucao registrada nesta sessao.
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
