import InputError from '@/Components/InputError';
import InputLabel from '@/Components/InputLabel';
import PrimaryButton from '@/Components/Button/PrimaryButton';
import TextInput from '@/Components/TextInput';
import { Transition } from '@headlessui/react';
import { useForm } from '@inertiajs/react';
import { useRef } from 'react';

export default function UpdatePasswordForm({ className = '' }) {
    const passwordInput = useRef();
    const currentPasswordInput = useRef();

    const {
        data,
        setData,
        errors,
        put,
        reset,
        processing,
        recentlySuccessful,
    } = useForm({
        current_password: '',
        password: '',
        password_confirmation: '',
    });

    const updatePassword = (e) => {
        e.preventDefault();

        put(route('password.update'), {
            preserveScroll: true,
            onSuccess: () => reset(),
            onError: (formErrors) => {
                if (formErrors.password) {
                    reset('password', 'password_confirmation');
                    passwordInput.current.focus();
                }

                if (formErrors.current_password) {
                    reset('current_password');
                    currentPasswordInput.current.focus();
                }
            },
        });
    };

    return (
        <section className={`space-y-6 ${className}`}>
            <header className="border-b border-gray-200 pb-4">
                <h2 className="text-xl font-semibold text-gray-800">Atualizar senha</h2>

                <p className="mt-1 text-sm text-gray-600">
                    Use uma senha longa e segura para proteger sua conta.
                </p>
            </header>

            <form onSubmit={updatePassword} className="mt-4 space-y-3">
                <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:gap-3">
                    <div className="flex-1">
                        <InputLabel htmlFor="current_password" value="Senha atual" />
                        <TextInput
                            id="current_password"
                            ref={currentPasswordInput}
                            value={data.current_password}
                            onChange={(e) => setData('current_password', e.target.value)}
                            type="password"
                            className="mt-1 block w-full rounded-lg border border-gray-300 bg-white text-gray-900 focus:border-blue-500 focus:ring-blue-500"
                            autoComplete="current-password"
                        />
                        <InputError message={errors.current_password} className="mt-1" />
                    </div>
                    <div className="flex-1">
                        <InputLabel htmlFor="password" value="Nova senha" />
                        <TextInput
                            id="password"
                            ref={passwordInput}
                            value={data.password}
                            onChange={(e) => setData('password', e.target.value)}
                            type="password"
                            className="mt-1 block w-full rounded-lg border border-gray-300 bg-white text-gray-900 focus:border-blue-500 focus:ring-blue-500"
                            autoComplete="new-password"
                        />
                        <InputError message={errors.password} className="mt-1" />
                    </div>
                    <div className="flex-1">
                        <InputLabel htmlFor="password_confirmation" value="Confirmar senha" />
                        <TextInput
                            id="password_confirmation"
                            value={data.password_confirmation}
                            onChange={(e) => setData('password_confirmation', e.target.value)}
                            type="password"
                            className="mt-1 block w-full rounded-lg border border-gray-300 bg-white text-gray-900 focus:border-blue-500 focus:ring-blue-500"
                            autoComplete="new-password"
                        />
                        <InputError message={errors.password_confirmation} className="mt-1" />
                    </div>
                    <div className="flex items-end">
                        <PrimaryButton disabled={processing}>Salvar</PrimaryButton>
                    </div>
                </div>

                <Transition
                    show={recentlySuccessful}
                    enter="transition ease-in-out"
                    enterFrom="opacity-0"
                    leave="transition ease-in-out"
                    leaveTo="opacity-0"
                >
                    <p className="text-sm text-gray-600">Salvo.</p>
                </Transition>
            </form>
        </section>
    );
}
