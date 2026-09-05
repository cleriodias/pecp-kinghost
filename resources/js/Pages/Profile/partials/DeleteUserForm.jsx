import DangerButton from '@/Components/DangerButton';
import InputError from '@/Components/InputError';
import InputLabel from '@/Components/InputLabel';
import Modal from '@/Components/Modal';
import SecondaryButton from '@/Components/SecondaryButton';
import TextInput from '@/Components/TextInput';
import { useForm, usePage } from '@inertiajs/react';
import { useRef, useState } from 'react';

export default function DeleteUserForm({ className = '' }) {
    const { canDeleteAccount } = usePage().props;
    const [confirmingUserDeletion, setConfirmingUserDeletion] = useState(false);
    const passwordInput = useRef();

    const { data, setData, delete: destroy, processing, reset, errors, clearErrors } =
        useForm({
            password: '',
        });

    const confirmUserDeletion = () => {
        if (!canDeleteAccount) return;
        setConfirmingUserDeletion(true);
    };

    const deleteUser = (e) => {
        e.preventDefault();

        destroy(route('profile.destroy'), {
            preserveScroll: true,
            onSuccess: () => closeModal(),
            onError: () => passwordInput.current.focus(),
            onFinish: () => reset(),
        });
    };

    const closeModal = () => {
        setConfirmingUserDeletion(false);
        clearErrors();
        reset();
    };

    return (
        <section className={`space-y-6 ${className}`}>
            <header className="border-b border-gray-200 pb-4">
                <h2 className="text-xl font-semibold text-gray-800">Excluir conta</h2>
                <p className="mt-1 text-sm text-gray-600">
                    Ao excluir a conta, todos os dados serao removidos de forma permanente.
                </p>
            </header>

            {!canDeleteAccount && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                    Exclusao desabilitada enquanto houver lancamentos vinculados (vale, adiantamento, refeicao, descarte).
                </div>
            )}

            <DangerButton onClick={confirmUserDeletion} disabled={!canDeleteAccount}>
                Excluir conta
            </DangerButton>

            <Modal show={confirmingUserDeletion} onClose={closeModal}>
                <form onSubmit={deleteUser} className="p-6">
                    <h2 className="text-lg font-semibold text-gray-900">Tem certeza disso?</h2>
                    <p className="mt-1 text-sm text-gray-600">
                        Esta acao nao pode ser desfeita. Confirme sua senha para continuar.
                    </p>

                    <div className="mt-6">
                        <InputLabel htmlFor="password" value="Senha" className="sr-only" />

                        <TextInput
                            id="password"
                            type="password"
                            name="password"
                            ref={passwordInput}
                            value={data.password}
                            onChange={(e) => setData('password', e.target.value)}
                            className="mt-1 block w-full rounded-lg border border-gray-300 bg-white text-gray-900 focus:border-red-500 focus:ring-red-500"
                            autoFocus
                        />

                        <InputError message={errors.password} className="mt-2" />
                    </div>

                    <div className="mt-6 flex justify-end gap-3">
                        <SecondaryButton onClick={closeModal}>Cancelar</SecondaryButton>
                        <DangerButton disabled={processing}>Confirmar exclusao</DangerButton>
                    </div>
                </form>
            </Modal>
        </section>
    );
}
