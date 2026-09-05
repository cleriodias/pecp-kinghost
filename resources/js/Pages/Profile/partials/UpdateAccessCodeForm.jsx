import InputError from '@/Components/InputError';
import InputLabel from '@/Components/InputLabel';
import PrimaryButton from '@/Components/Button/PrimaryButton';
import TextInput from '@/Components/TextInput';
import { Transition } from '@headlessui/react';
import { useForm } from '@inertiajs/react';
import { useRef } from 'react';

export default function UpdateAccessCodeForm({ className = '' }) {
    const accessCodeInput = useRef();
    const accessCodeConfirmationInput = useRef();

    const {
        data,
        setData,
        errors,
        put,
        reset,
        processing,
        recentlySuccessful,
    } = useForm({
        cod_acesso: '',
        cod_acesso_confirmation: '',
    });

    const updateAccessCode = (e) => {
        e.preventDefault();

        put(route('profile.access-code.update'), {
            preserveScroll: true,
            onSuccess: () => reset(),
            onError: (formErrors) => {
                if (formErrors.cod_acesso) {
                    reset('cod_acesso');
                    accessCodeInput.current.focus();
                }

                if (formErrors.cod_acesso_confirmation) {
                    reset('cod_acesso_confirmation');
                    accessCodeConfirmationInput.current.focus();
                }
            },
        });
    };

    return (
        <section className={`space-y-6 ${className}`}>
            <header className="border-b border-gray-200 pb-4">
                <h2 className="text-xl font-semibold text-gray-800">Alterar codigo de acesso</h2>

                <p className="mt-1 text-sm text-gray-600">
                    Defina um novo codigo numerico com exatamente 4 digitos.
                </p>
            </header>

            <form onSubmit={updateAccessCode} className="mt-4 space-y-3">
                <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:gap-3">
                    <div className="flex-1">
                        <InputLabel htmlFor="cod_acesso" value="Novo codigo" />
                        <TextInput
                            id="cod_acesso"
                            ref={accessCodeInput}
                            value={data.cod_acesso}
                            onChange={(e) => setData('cod_acesso', e.target.value)}
                            type="password"
                            inputMode="numeric"
                            maxLength={4}
                            className="mt-1 block w-full rounded-lg border border-gray-300 bg-white text-gray-900 focus:border-blue-500 focus:ring-blue-500"
                            autoComplete="new-password"
                        />
                        <InputError message={errors.cod_acesso} className="mt-1" />
                    </div>
                    <div className="flex-1">
                        <InputLabel htmlFor="cod_acesso_confirmation" value="Confirmar codigo" />
                        <TextInput
                            id="cod_acesso_confirmation"
                            ref={accessCodeConfirmationInput}
                            value={data.cod_acesso_confirmation}
                            onChange={(e) => setData('cod_acesso_confirmation', e.target.value)}
                            type="password"
                            inputMode="numeric"
                            maxLength={4}
                            className="mt-1 block w-full rounded-lg border border-gray-300 bg-white text-gray-900 focus:border-blue-500 focus:ring-blue-500"
                            autoComplete="new-password"
                        />
                        <InputError message={errors.cod_acesso_confirmation} className="mt-1" />
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
