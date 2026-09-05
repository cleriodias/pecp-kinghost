import InputError from '@/Components/InputError';
import InputLabel from '@/Components/InputLabel';
import PrimaryButton from '@/Components/Button/PrimaryButton';
import TextInput from '@/Components/TextInput';
import { Transition } from '@headlessui/react';
import { useForm, usePage } from '@inertiajs/react';

const roleLabels = {
    0: 'MASTER',
    1: 'GERENTE',
    2: 'SUB-GERENTE',
    3: 'CAIXA',
    4: 'LANCHONETE',
    5: 'FUNCIONARIO',
    6: 'CLIENTE',
};

export default function UpdateProfileInformationForm({ className = '' }) {
    const user = usePage().props.auth.user;
    const units =
        (Array.isArray(user.units) && user.units.length > 0
            ? user.units.map((u) => u.tb2_nome ?? u.name ?? u.tb2_id)
            : user.tb2_id
            ? [user.tb2_id]
            : []) || [];

    const { data, setData, patch, errors, processing, recentlySuccessful } =
        useForm({
            name: user.name,
            email: user.email,
        });

    const submit = (e) => {
        e.preventDefault();
        patch(route('profile.update'));
    };

    return (
        <section className={`space-y-4 ${className}`}>
            <header className="border-b border-gray-200 pb-3">
                <h2 className="text-xl font-semibold text-gray-800">Informacoes do perfil</h2>
                <p className="mt-1 text-sm text-gray-600">Dados de identificacao e acesso.</p>
            </header>

            <form onSubmit={submit} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                        <InputLabel htmlFor="name" value="Nome" />
                        <TextInput
                            id="name"
                            className="mt-2 block w-full rounded-lg border border-gray-300 bg-gray-50 text-gray-700"
                            value={data.name}
                            readOnly
                        />
                        <InputError className="mt-2" message={errors.name} />
                    </div>
                    <div>
                        <InputLabel htmlFor="email" value="Email" />
                        <TextInput
                            id="email"
                            type="email"
                            className="mt-2 block w-full rounded-lg border border-gray-300 bg-white text-gray-900 focus:border-indigo-500 focus:ring-indigo-500"
                            value={data.email}
                            onChange={(e) => setData('email', e.target.value)}
                            autoComplete="username"
                            required
                        />
                        <InputError className="mt-2" message={errors.email} />
                    </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                        <p className="text-xs font-semibold uppercase text-gray-500">Funcao</p>
                        <p className="text-base font-semibold text-gray-800">
                            {roleLabels[user.funcao] ?? user.funcao ?? '---'}
                        </p>
                    </div>
                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                        <p className="text-xs font-semibold uppercase text-gray-500">Unidades</p>
                        {units.length === 0 ? (
                            <p className="text-base font-semibold text-gray-600">Nenhuma unidade vinculada.</p>
                        ) : (
                            <ul className="mt-1 space-y-1 text-base font-semibold text-gray-800">
                                {units.map((u) => (
                                    <li key={u}>{u}</li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-4 pt-2">
                    <PrimaryButton disabled={processing}>Salvar</PrimaryButton>
                    <Transition
                        show={recentlySuccessful}
                        enter="transition ease-in-out"
                        enterFrom="opacity-0"
                        leave="transition ease-in-out"
                        leaveTo="opacity-0"
                    >
                        <p className="text-sm text-gray-600">Salvo.</p>
                    </Transition>
                </div>
            </form>
        </section>
    );
}
