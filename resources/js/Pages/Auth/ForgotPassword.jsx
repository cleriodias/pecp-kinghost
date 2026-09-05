import PrimaryButton from '@/Components/Button/PrimaryButton';
import InputError from '@/Components/InputError';
import InputLabel from '@/Components/InputLabel';
import TextInput from '@/Components/TextInput';
import GuestLayout from '@/Layouts/GuestLayout';
import { Head, Link, useForm } from '@inertiajs/react';

export default function ForgotPassword({ status }) {
    const { data, setData, post, processing, errors } = useForm({
        username: '',
    });

    const submit = (e) => {
        e.preventDefault();

        post(route('password.email'));
    };

    return (
        <GuestLayout>
            <Head title="Esqueceu a senha" />

            <div className="mx-auto mb-4 w-full max-w-md text-sm text-gray-600 dark:text-gray-400">
                Esqueceu sua senha? Sem problemas. Informe seu usuário e enviaremos um e-mail com o link para redefinição.
            </div>

            {status && (
                <div className="mx-auto mb-4 w-full max-w-md text-sm font-medium text-green-600 dark:text-green-400">
                    {status}
                </div>
            )}

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
                            isFocused={true}
                            onChange={(e) => setData('username', e.target.value)}
                        />

                        <span className="inline-flex items-center border-s border-gray-300 bg-gray-50 px-3 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                            @paoecafepremium.com.br
                        </span>
                    </div>

                    <InputError message={errors.username} className="mt-2" />
                </div>

                <div className="mt-4 flex items-center justify-end">
                    <Link
                        href={route('login')}
                        className="no-underline rounded-md text-sm text-gray-600 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:text-gray-400 dark:hover:text-gray-100 dark:focus:ring-offset-gray-800"
                    >
                        Clique aqui para acessar
                    </Link>

                    <PrimaryButton className="ms-4" disabled={processing}>
                        Solicitar
                    </PrimaryButton>
                </div>
            </form>
        </GuestLayout>
    );
}
