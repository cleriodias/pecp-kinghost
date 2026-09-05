import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, router } from '@inertiajs/react';
import { useState } from 'react';

export default function SwitchRole({ roles }) {
    const [submitting, setSubmitting] = useState(null);

    const handleSelect = (roleValue) => {
        setSubmitting(roleValue);
        router.post(
            route('reports.switch-role.update'),
            { role: roleValue },
            {
                preserveScroll: true,
                onFinish: () => setSubmitting(null),
            },
        );
    };

    const headerContent = (
        <div>
            <h2 className="text-xl font-semibold leading-tight text-gray-800 dark:text-gray-200">
                Trocar funcao
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-300">
                Selecione a funcao temporaria para operar no sistema. Apenas MASTER pode trocar.
            </p>
        </div>
    );

    return (
        <AuthenticatedLayout header={headerContent}>
            <Head title="Trocar funcao" />

            <div className="py-12">
                <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
                    <div className="rounded-2xl bg-white p-6 shadow dark:bg-gray-800">
                        <div className="grid gap-4 sm:grid-cols-2">
                            {roles.map((role) => (
                                <button
                                    key={role.value}
                                    type="button"
                                    disabled={role.active || submitting === role.value}
                                    onClick={() => handleSelect(role.value)}
                                    className={`rounded-2xl border px-4 py-3 text-left text-lg font-semibold shadow transition ${
                                        role.active
                                            ? 'border-green-400 bg-green-50 text-green-700 dark:border-green-500/60 dark:bg-green-900/20 dark:text-green-200'
                                            : 'border-gray-200 bg-white text-gray-800 hover:border-indigo-500 hover:text-indigo-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:hover:border-indigo-400'
                                    } ${submitting ? 'cursor-not-allowed opacity-70' : ''}`}
                                >
                                    {role.label}
                                    {role.active && (
                                        <span className="ml-2 text-xs font-normal text-green-600 dark:text-green-300">
                                            (Atual)
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
