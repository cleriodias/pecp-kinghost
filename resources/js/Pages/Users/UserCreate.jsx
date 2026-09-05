import AlertMessage from "@/Components/Alert/AlertMessage";
import SuccessButton from "@/Components/Button/SuccessButton";
import AuthenticatedLayout from "@/Layouts/AuthenticatedLayout";
import { Head, Link, useForm, usePage } from "@inertiajs/react";

const roleOptions = [
    { value: 0, label: 'Master' },
    { value: 1, label: 'Gerente' },
    { value: 2, label: 'Sub-gerente' },
    { value: 3, label: 'Caixa' },
    { value: 4, label: 'Lanchonete' },
    { value: 5, label: 'Funcionario' },
    { value: 6, label: 'Cliente' },
];

const canRoleUseMultipleUnits = (role) => ['0', '1'].includes(String(role));
const companyEmailPattern = '^[^@\\s]+@paoecafepremium\\.com\\.br$';

const formatEmailInput = (value) => String(value ?? '').trim().toLocaleLowerCase('pt-BR');

const formatNameInput = (value) => {
    const sanitizedValue = value
        .replace(/[^A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF\s]/g, '')
        .replace(/\s+/g, ' ')
        .replace(/^\s+/, '');

    const words = sanitizedValue
        .split(' ')
        .filter(Boolean)
        .slice(0, 2);

    const formattedName = words
        .map((word) => word.charAt(0).toLocaleUpperCase('pt-BR') + word.slice(1).toLocaleLowerCase('pt-BR'))
        .join(' ');

    return formattedName.slice(0, 15);
};

const formatPhoneInput = (value) => {
    const digits = String(value ?? '').replace(/\D/g, '').slice(0, 11);

    if (digits.length <= 2) {
        return digits;
    }

    if (digits.length <= 7) {
        return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    }

    if (digits.length <= 10) {
        return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    }

    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
};

const paymentDayOptions = Array.from({ length: 31 }, (_, index) => index + 1);

export default function UserCreate({ auth, units = [] }) {
    const { flash } = usePage().props;
    const now = new Date();
    const generatedPassword = `${String(now.getHours()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;

    const initialRole = '4';
    const availableUnitIds = units
        .filter((unit) => Number(unit.tb2_id) !== 4)
        .map((unit) => String(unit.tb2_id));
    const initialUnits = canRoleUseMultipleUnits(initialRole)
        ? availableUnitIds
        : availableUnitIds.slice(0, 1);

    const { data, setData, post, processing, errors } = useForm({
        name: '',
        email: '@paoecafepremium.com.br',
        phone: '',
        password: generatedPassword,
        password_confirmation: generatedPassword,
        funcao: initialRole,
        payment_day: '',
        hr_ini: '00:00',
        hr_fim: '23:00',
        salario: '1518',
        vr_cred: '350',
        tb2_id: initialUnits,
    });

    const handleSubmit = (e) => {

        e.preventDefault();

        post(route('users.store'));
    }

    const selectedUnits = data.tb2_id ?? [];
    const allowsMultipleUnits = canRoleUseMultipleUnits(data.funcao);

    const handleRoleChange = (role) => {
        setData({
            ...data,
            funcao: role,
            tb2_id: canRoleUseMultipleUnits(role) ? selectedUnits : selectedUnits.slice(0, 1),
        });
    };

    const handleUnitToggle = (unitId) => {
        if (!allowsMultipleUnits) {
            setData('tb2_id', [unitId]);
            return;
        }

        if (selectedUnits.includes(unitId)) {
            setData('tb2_id', selectedUnits.filter((value) => value !== unitId));
        } else {
            setData('tb2_id', [...selectedUnits, unitId]);
        }
    };

    return (
        <AuthenticatedLayout
            user={auth.user}
            header={<h2 className="font-semibold text-xl text-gray-800 dark:text-gray-200 leading-tight">{'Usu\u00E1rios'}</h2>}
        >
            <Head title={'Usu\u00E1rio'} />

            <div className="py-4 max-w-7xl mx-auto sm:px-6 lg:px-8">
                <div className="overflow-hidden bg-white shadow-lg sm:rounded-lg dark:bg-gray-800">
                    <div className="flex justify-between items-center m-4">
                        <h3 className="text-lg">Cadastrar</h3>
                        <div className="flex space-x-4">
                            <Link
                                href={route('users.index')}
                                className="inline-flex items-center rounded-md border border-transparent bg-cyan-500 px-2 py-1 text-md tracking-widest text-white transition duration-150 ease-in-out hover:bg-cyan-600 focus:bg-cyan-600 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 active:bg-cyan-400 dark:bg-cyan-200 dark:text-cyan-800 dark:hover:bg-white dark:focus:bg-white dark:focus:ring-offset-cyan-900 dark:active:bg-cyan-400"
                                aria-label="Listar"
                                title="Listar"
                            >
                                <i className="bi bi-list text-lg" aria-hidden="true"></i>
                            </Link>
                        </div>
                    </div>

                    <div className="bg-gray-50 text-sm dark:bg-gray-700 p-4 rounded-lg shadow-m">
                        <AlertMessage message={flash} />
                        <form onSubmit={handleSubmit}>

                            <div className="mb-4 grid gap-4 md:grid-cols-3">
                                <div>
                                    <label htmlFor="name" className="block text-sm font-medium text-gray-700">Nome</label>
                                    <input
                                        id="name"
                                        type="text"
                                        placeholder={'Nome Sobrenome'}
                                        value={data.name}
                                        maxLength={15}
                                        onChange={(e) => setData('name', formatNameInput(e.target.value))}
                                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                    />
                                    {errors.name && <span className="text-red-600">{errors.name}</span>}
                                </div>

                                <div>
                                    <label htmlFor="email" className="block text-sm font-medium text-gray-700">E-mail</label>
                                    <input
                                        id="email"
                                        type="email"
                                        placeholder={'@paoecafepremium.com.br'}
                                        pattern={companyEmailPattern}
                                        title="Use um e-mail @paoecafepremium.com.br"
                                        autoCapitalize="none"
                                        value={data.email}
                                        onChange={(e) => setData('email', formatEmailInput(e.target.value))}
                                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                    />
                                    {errors.email && <span className="text-red-600">{errors.email}</span>}
                                </div>

                                <div>
                                    <label htmlFor="phone" className="block text-sm font-medium text-gray-700">Telefone</label>
                                    <input
                                        id="phone"
                                        type="text"
                                        inputMode="numeric"
                                        placeholder="(99) 99999-9999"
                                        value={data.phone}
                                        onChange={(e) => setData('phone', formatPhoneInput(e.target.value))}
                                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                    />
                                    {errors.phone && <span className="text-red-600">{errors.phone}</span>}
                                </div>
                            </div>

                            <div className="mb-4 grid gap-4 md:grid-cols-3">
                                <div>
                                    <p className="block text-sm font-medium text-gray-700">{'Fun\u00E7\u00E3o'}</p>
                                    <select
                                        id="funcao"
                                        value={data.funcao}
                                        onChange={(e) => handleRoleChange(e.target.value)}
                                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                    >
                                        {roleOptions.map((option) => (
                                            <option key={option.value} value={option.value}>
                                                {option.label}
                                            </option>
                                        ))}
                                    </select>
                                    {errors.funcao && <span className="text-red-600">{errors.funcao}</span>}
                                </div>

                                <div>
                                    <label htmlFor="payment_day" className="block text-sm font-medium text-gray-700">
                                        Dia do pagamento
                                    </label>
                                    <select
                                        id="payment_day"
                                        value={data.payment_day}
                                        onChange={(e) => setData('payment_day', e.target.value)}
                                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                    >
                                        <option value="">Selecione</option>
                                        {paymentDayOptions.map((day) => (
                                            <option key={day} value={day}>
                                                Dia {day}
                                            </option>
                                        ))}
                                    </select>
                                    {errors.payment_day && <span className="text-red-600">{errors.payment_day}</span>}
                                </div>

                                <div>
                                    <p className="block text-sm font-medium text-gray-700">Lojas</p>
                                    {units.length ? (
                                        <div className="mt-2 flex flex-nowrap items-center gap-4 overflow-x-auto pb-2">
                                            {units.map((unit) => {
                                                const unitId = String(unit.tb2_id);
                                                return (
                                                    <label key={unit.tb2_id} className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                                                        <input
                                                            type={allowsMultipleUnits ? 'checkbox' : 'radio'}
                                                            name="tb2_id"
                                                            value={unitId}
                                                            checked={selectedUnits.includes(unitId)}
                                                            onChange={() => handleUnitToggle(unitId)}
                                                            className={`${allowsMultipleUnits ? 'rounded' : ''} border-gray-300 text-indigo-600 shadow-sm focus:ring-indigo-500`}
                                                        />
                                                        <span>#{unit.tb2_id} - {unit.tb2_nome}</span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                                            Nenhuma unidade cadastrada. Cadastre ao menos uma unidade para prosseguir.
                                        </p>
                                    )}
                                    {errors.tb2_id && <span className="text-red-600">{errors.tb2_id}</span>}
                                </div>
                            </div>

                            <div className="mb-4 grid gap-4 md:grid-cols-4">
                                <div>
                                    <label htmlFor="hr_ini" className="block text-sm font-medium text-gray-700">{'In\u00EDcio da jornada'}</label>
                                    <input
                                        id="hr_ini"
                                        type="time"
                                        value={data.hr_ini}
                                        onChange={(e) => setData('hr_ini', e.target.value)}
                                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                    />
                                    {errors.hr_ini && <span className="text-red-600">{errors.hr_ini}</span>}
                                </div>
                                <div>
                                    <label htmlFor="hr_fim" className="block text-sm font-medium text-gray-700">Fim da jornada</label>
                                    <input
                                        id="hr_fim"
                                        type="time"
                                        value={data.hr_fim}
                                        onChange={(e) => setData('hr_fim', e.target.value)}
                                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                    />
                                    {errors.hr_fim && <span className="text-red-600">{errors.hr_fim}</span>}
                                </div>
                                <div>
                                    <label htmlFor="salario" className="block text-sm font-medium text-gray-700">{'Sal\u00E1rio (R$)'}</label>
                                    <input
                                        id="salario"
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={data.salario}
                                        onChange={(e) => setData('salario', e.target.value)}
                                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                    />
                                    {errors.salario && <span className="text-red-600">{errors.salario}</span>}
                                </div>
                                <div>
                                    <label htmlFor="vr_cred" className="block text-sm font-medium text-gray-700">{'Cr\u00E9dito refei\u00E7\u00E3o (R$)'}</label>
                                    <input
                                        id="vr_cred"
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={data.vr_cred}
                                        onChange={(e) => setData('vr_cred', e.target.value)}
                                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                    />
                                    {errors.vr_cred && <span className="text-red-600">{errors.vr_cred}</span>}
                                </div>
                            </div>

                            <div className="mb-4 grid grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor="password" className="block text-sm font-medium text-gray-700">Senha</label>
                                    <input
                                        id="password"
                                        type="password"
                                        autoComplete="password"
                                        placeholder={'Senha para o usu\u00E1rio acessar o sistema'}
                                        value={data.password}
                                        onChange={(e) => setData('password', e.target.value)}
                                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                    />
                                    {errors.password && <span className="text-red-600">{errors.password}</span>}
                                </div>

                                <div>
                                    <label htmlFor="password_confirmation" className="block text-sm font-medium text-gray-700">Confirma a Senha</label>
                                    <input
                                        id="password_confirmation"
                                        type="password"
                                        autoComplete="password_confirmation"
                                        placeholder="Confirmar a senha"
                                        value={data.password_confirmation}
                                        onChange={(e) => setData('password_confirmation', e.target.value)}
                                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                    />
                                    {errors.password_confirmation && <span className="text-red-600">{errors.password_confirmation}</span>}
                                </div>
                            </div>

                            <div className="flex justify-end">
                                <SuccessButton
                                    type="submit"
                                    disabled={processing}
                                    className="text-sm"
                                    aria-label="Cadastrar"
                                    title="Cadastrar"
                                >
                                    <i className="bi bi-plus-lg text-lg" aria-hidden="true"></i>
                                </SuccessButton>
                            </div>
                        </form>

                    </div>
                </div>
            </div>

        </AuthenticatedLayout>
    )
}
