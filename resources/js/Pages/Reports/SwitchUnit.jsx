import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import {
    formatRoleBadgeLabel,
    formatUnitBadgeLabel,
    getRoleBadgeClassName,
    getRoleBadgeStyle,
    getUnitBadgeClassName,
    getUnitBadgeStyle,
} from '@/Utils/brandBadges';
import { Head, router } from '@inertiajs/react';
import { useCallback, useMemo, useState } from 'react';

export default function SwitchUnit({
    units = [],
    roles = [],
    currentUnitId,
    currentRoleLabel,
    originalRoleLabel,
}) {
    const [selectedUnitId, setSelectedUnitId] = useState(currentUnitId ?? null);
    const [selectedRole, setSelectedRole] = useState(null);
    const [submitting, setSubmitting] = useState(false);

    const currentUnitName = useMemo(
        () => units.find((unit) => unit.id === Number(currentUnitId))?.name ?? '---',
        [currentUnitId, units],
    );

    const submitSelection = useCallback((unitId, role) => {
        const normalizedUnitId = Number(unitId);
        const normalizedRole = Number(role);

        if (
            submitting ||
            Number.isNaN(normalizedUnitId) ||
            Number.isNaN(normalizedRole)
        ) {
            return;
        }

        setSubmitting(true);

        router.post(
            route('reports.switch-unit.update'),
            {
                unit_id: normalizedUnitId,
                role: normalizedRole,
            },
            {
                preserveScroll: true,
                onFinish: () => setSubmitting(false),
            },
        );
    }, [submitting]);

    const handleUnitSelect = useCallback((unitId) => {
        const normalizedUnitId = Number(unitId);

        if (submitting || Number.isNaN(normalizedUnitId)) {
            return;
        }

        setSelectedUnitId(normalizedUnitId);

        if (selectedRole !== null) {
            submitSelection(normalizedUnitId, selectedRole);
        }
    }, [selectedRole, submitSelection, submitting]);

    const handleRoleSelect = useCallback((roleValue) => {
        const normalizedRole = Number(roleValue);

        if (submitting || Number.isNaN(normalizedRole)) {
            return;
        }

        setSelectedRole(normalizedRole);

        if (selectedUnitId !== null) {
            submitSelection(selectedUnitId, normalizedRole);
        }
    }, [selectedUnitId, submitSelection, submitting]);

    const renderSwitch = useCallback((option, kind) => {
        const optionId = kind === 'unit' ? Number(option.id) : Number(option.value);
        const selected = kind === 'unit'
            ? selectedUnitId === optionId
            : selectedRole === optionId;
        const isCurrent = Boolean(option.active);
        const isInactiveUnit = kind === 'unit' && Number(option.status ?? 1) !== 1;
        const label = kind === 'unit' ? option.name : option.label;
        const switchStyle = kind === 'unit' ? getUnitBadgeStyle(label) : getRoleBadgeStyle(label);

        return (
            <button
                key={`${kind}-${optionId}`}
                type="button"
                onClick={() => (kind === 'unit' ? handleUnitSelect(optionId) : handleRoleSelect(optionId))}
                disabled={submitting}
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
                        {kind === 'unit' ? formatUnitBadgeLabel(label) : formatRoleBadgeLabel(label)}
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
    }, [handleRoleSelect, handleUnitSelect, selectedRole, selectedUnitId, submitting]);

    const headerContent = (
        <div>
            <h2 className="text-xl font-semibold leading-tight text-gray-800 dark:text-gray-200">
                Trocar
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-300">
                Unidade atual: {currentUnitName} | Funcao atual: {currentRoleLabel ?? '---'} | Funcao de origem: {originalRoleLabel ?? '---'}
            </p>
        </div>
    );

    return (
        <AuthenticatedLayout header={headerContent}>
            <Head title="Trocar" />

            <div className="py-12">
                <div className="mx-auto max-w-6xl space-y-6 px-4 sm:px-6 lg:px-8">
                    <div className="rounded-2xl border border-slate-200 bg-white px-6 py-6 shadow dark:border-gray-700 dark:bg-gray-800">
                        <div className="space-y-1">
                            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                                Troca rapida
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
                                    style={getUnitBadgeStyle(currentUnitName)}
                                >
                                    {formatUnitBadgeLabel(currentUnitName)}
                                </span>
                                <span
                                    className={getRoleBadgeClassName()}
                                    style={getRoleBadgeStyle(currentRoleLabel)}
                                >
                                    {formatRoleBadgeLabel(currentRoleLabel)}
                                </span>
                            </div>
                        </div>

                        <div className="mt-6 grid gap-6 xl:grid-cols-2">
                            <div>
                                <h4 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
                                    Unidades
                                </h4>
                                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-2">
                                    {units.map((unit) => renderSwitch(unit, 'unit'))}
                                </div>
                            </div>

                            <div>
                                <h4 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
                                    Funcao
                                </h4>
                                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-2">
                                    {roles.map((role) => renderSwitch(role, 'role'))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
