import Checkbox from '@/Components/Checkbox';
import InputError from '@/Components/InputError';
import InputLabel from '@/Components/InputLabel';
import TextInput from '@/Components/TextInput';
import GuestLayout from '@/Layouts/GuestLayout';
import { Head, useForm } from '@inertiajs/react';
import { useEffect, useRef } from 'react';

export default function Login({ status, canResetPassword, units = [], selectedUnitId = null }) {
    const { data, setData, post, processing, errors, reset } = useForm({
        username: '',
        password: '',
        remember: false,
        unit_id: selectedUnitId ? String(selectedUnitId) : '',
    });
    const formRef = useRef(null);

    useEffect(() => {
        if (selectedUnitId) {
            setData('unit_id', String(selectedUnitId));
        }
    }, [selectedUnitId]);

    const handleSubmit = (event) => {
        event.preventDefault();

        post(route('login'), {
            onFinish: () => reset('password'),
        });
    };

    const handleUnitSelect = (unitId) => {
        setData('unit_id', String(unitId));

        if (data.username && data.password) {
            window.requestAnimationFrame(() => {
                formRef.current?.requestSubmit?.();
            });
        }
    };

    return (
        <GuestLayout>
            <Head title="Login" />

            {status && (
                <div className="mb-4 text-sm font-medium text-green-600">
                    {status}
                </div>
            )}

            <form ref={formRef} onSubmit={handleSubmit} className="space-y-5">
                <div>
                    <InputLabel htmlFor="username" value="Usuário" />
                    <div className="mt-2 flex overflow-hidden rounded-xl border border-slate-300 bg-[#e9eff9] focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-500">
                        <TextInput
                            id="username"
                            type="text"
                            name="username"
                            placeholder="Usuário"
                            value={data.username}
                            className="block w-full border-0 bg-transparent px-4 py-3 shadow-none focus:border-0 focus:ring-0"
                            autoComplete="username"
                            isFocused={true}
                            onChange={(e) => setData('username', e.target.value)}
                        />
                        <span className="inline-flex items-center border-s border-slate-300 bg-[#eef2fb] px-4 text-sm text-slate-900">
                            @paoecafepremium.com.br
                        </span>
                    </div>
                    <InputError message={errors.username} className="mt-2" />
                </div>

                <div>
                    <InputLabel htmlFor="password" value="Senha" />
                    <TextInput
                        id="password"
                        type="password"
                        name="password"
                        placeholder="Senha"
                        value={data.password}
                        className="mt-2 block w-full rounded-xl border-slate-300 bg-[#e9eff9] px-4 py-3 focus:border-blue-600 focus:ring-blue-500"
                        autoComplete="current-password"
                        onChange={(e) => setData('password', e.target.value)}
                    />
                    <InputError message={errors.password} className="mt-2" />
                </div>

                <div className="flex items-center justify-between gap-4">
                    <label className="flex items-center">
                        <Checkbox
                            name="remember"
                            checked={data.remember}
                            onChange={(e) => setData('remember', e.target.checked)}
                        />
                        <span className="ms-2 text-sm text-slate-700">Lembrar</span>
                    </label>

                    {canResetPassword && (
                        <a
                            href={route('password.request')}
                            className="text-sm text-slate-700 no-underline hover:text-slate-900"
                        >
                            Esqueceu a senha?
                        </a>
                    )}
                </div>

                <div className="pt-2">
                    <p className="text-sm font-medium text-slate-700">Escolha a unidade</p>

                    {units.length ? (
                        <div className="mt-4 grid gap-3 sm:grid-cols-3">
                            {units.map((unit) => {
                                const isSelected = String(data.unit_id) === String(unit.tb2_id);

                                return (
                                    <button
                                        type="button"
                                        key={unit.tb2_id}
                                        disabled={processing}
                                        onClick={() => handleUnitSelect(unit.tb2_id)}
                                        className={`rounded-xl border px-4 py-3 text-sm font-semibold uppercase tracking-[0.02em] transition duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 ${
                                            isSelected
                                                ? 'border-blue-600 bg-blue-600 text-white shadow-md'
                                                : 'border-blue-600 bg-white text-blue-700 hover:bg-blue-50'
                                        }`}
                                    >
                                        {unit.tb2_nome}
                                    </button>
                                );
                            })}
                        </div>
                    ) : (
                        <p className="mt-3 text-sm text-slate-600">
                            Nenhuma unidade cadastrada.
                        </p>
                    )}

                    <InputError message={errors.unit_id} className="mt-2" />
                </div>
            </form>
        </GuestLayout>
    );
}
