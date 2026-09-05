import PrimaryButton from '@/Components/Button/PrimaryButton';
import InputError from '@/Components/InputError';
import InputLabel from '@/Components/InputLabel';
import TextInput from '@/Components/TextInput';
import GuestLayout from '@/Layouts/GuestLayout';
import { Head, useForm } from '@inertiajs/react';

export default function ResetPassword({ token, username }) {
    const { data, setData, post, processing, errors, reset } = useForm({
        token,
        username: username || '',
        password: '',
        password_confirmation: '',
    });

    const submit = (e) => {
        e.preventDefault();

        post(route('password.store'), {
            onFinish: () => reset('password', 'password_confirmation'),
        });
    };

    return (
        <GuestLayout>
            <Head title="Nova Senha" />

            <form onSubmit={submit} className="mx-auto w-full max-w-md">
                <div>
                    <InputLabel htmlFor="username" value="Usuário" />

                    <div className="mt-1 flex overflow-hidden rounded-md border border-gray-300 bg-white shadow-sm focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 dark:border-gray-700 dark:bg-gray-900">
                        <TextInput
                            id="username"
                            type="text"
                            name="username"
                            placeholder="Usuário"
                            value={data.username}
                            className="block w-full border-0 shadow-none focus:border-0 focus:ring-0"
                            autoComplete="username"
                            onChange={(e) => setData('username', e.target.value)}
                        />

                        <span className="inline-flex items-center border-s border-gray-300 bg-gray-50 px-3 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                            @paoecafepremium.com.br
                        </span>
                    </div>

                    <InputError message={errors.username} className="mt-2" />
                </div>

                <div className="mt-4">
                    <InputLabel htmlFor="password" value="Senha" />

                    <TextInput
                        id="password"
                        type="password"
                        name="password"
                        placeholder="Digite a nova senha"
                        value={data.password}
                        className="mt-1 block w-full"
                        autoComplete="new-password"
                        isFocused={true}
                        onChange={(e) => setData('password', e.target.value)}
                    />

                    <InputError message={errors.password} className="mt-2" />
                </div>

                <div className="mt-4">
                    <InputLabel
                        htmlFor="password_confirmation"
                        value="Confirmar a Senha"
                    />

                    <TextInput
                        type="password"
                        id="password_confirmation"
                        name="password_confirmation"
                        placeholder="Confirmar a nova senha"
                        value={data.password_confirmation}
                        className="mt-1 block w-full"
                        autoComplete="new-password"
                        onChange={(e) =>
                            setData('password_confirmation', e.target.value)
                        }
                    />

                    <InputError
                        message={errors.password_confirmation}
                        className="mt-2"
                    />
                </div>

                <div className="mt-4 flex items-center justify-end">
                    <PrimaryButton className="ms-4" disabled={processing}>
                        Atualizar
                    </PrimaryButton>
                </div>
            </form>
        </GuestLayout>
    );
}
