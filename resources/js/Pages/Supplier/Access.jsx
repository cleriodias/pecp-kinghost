import InputError from '@/Components/InputError';
import InputLabel from '@/Components/InputLabel';
import TextInput from '@/Components/TextInput';
import GuestLayout from '@/Layouts/GuestLayout';
import { Head, useForm } from '@inertiajs/react';

export default function Access() {
    const { data, setData, post, processing, errors } = useForm({
        access_code: '',
    });

    const handleSubmit = (event) => {
        event.preventDefault();
        post(route('supplier.authenticate'));
    };

    return (
        <GuestLayout>
            <Head title="Fornecedor" />
            <form onSubmit={handleSubmit}>
                <div>
                    <InputLabel htmlFor="access_code" value="Codigo de acesso" />
                    <TextInput
                        id="access_code"
                        type="text"
                        name="access_code"
                        value={data.access_code}
                        className="mt-1 block w-full"
                        maxLength={4}
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        isFocused={true}
                        onChange={(event) => setData('access_code', event.target.value)}
                        placeholder="Digite o codigo"
                    />
                    <InputError message={errors.access_code} className="mt-2" />
                </div>

                <div className="mt-6">
                    <button
                        type="submit"
                        disabled={processing}
                        className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-700 disabled:opacity-50"
                    >
                        Entrar
                    </button>
                </div>
            </form>
        </GuestLayout>
    );
}
