import AlertMessage from '@/Components/Alert/AlertMessage';
import PrimaryButton from '@/Components/Button/PrimaryButton';
import InputError from '@/Components/InputError';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, Link, router, useForm, usePage } from '@inertiajs/react';

const currency = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
});

const fieldClassName =
    'mt-2 block h-12 w-full rounded-[18px] border border-slate-200 bg-white px-4 text-sm text-slate-900 shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-600 dark:bg-gray-700 dark:text-gray-100';

const toInputValue = (value) => {
    if (value === null || value === undefined || value === '') {
        return '';
    }

    return String(value).replace('.', ',');
};

const normalizeDecimalInput = (value) => String(value ?? '').replace(',', '.');

const amountNeededTodayForDailyLimit = (store) => {
    const dailyLimit = Number(store?.tax_daily_limit ?? 0);

    if (dailyLimit <= 0) {
        return null;
    }

    const issuedTodayTotal = Number(store?.monthly_issued_today_total ?? 0);

    return Math.max(0, dailyLimit - issuedTodayTotal);
};

const buildFormData = (configuration = {}, selectedUnitId = null) => ({
    tb2_id: configuration?.tb2_id ?? selectedUnitId ?? '',
    tb26_limite_imposto_ativo: Boolean(configuration?.tb26_limite_imposto_ativo),
    tb26_limite_imposto_diario: toInputValue(configuration?.tb26_limite_imposto_diario),
    tb26_limite_imposto_mensal: toInputValue(configuration?.tb26_limite_imposto_mensal),
    tb26_limite_valor_compra: toInputValue(configuration?.tb26_limite_valor_compra),
});

const SummaryBox = ({ title, data }) => {
    const percentage = data?.percentage ?? 0;
    const exceeded = Boolean(data?.exceeded);

    return (
        <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-gray-800">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-300">
                        {title}
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
                        {currency.format(Number(data?.total ?? 0))}
                    </p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${exceeded ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                    {exceeded ? 'Limite atingido' : 'Dentro do limite'}
                </span>
            </div>
            <div className="mt-4 space-y-2 text-sm text-slate-600 dark:text-slate-300">
                <p>Limite: {data?.limit ? currency.format(Number(data.limit)) : 'Sem limite'}</p>
                <p>Restante: {data?.remaining !== null && data?.remaining !== undefined ? currency.format(Number(data.remaining)) : 'Sem limite'}</p>
                {data?.limit ? (
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                        <div
                            className={`h-full rounded-full ${exceeded ? 'bg-rose-500' : 'bg-blue-600'}`}
                            style={{ width: `${Math.min(100, Number(percentage))}%` }}
                        />
                    </div>
                ) : null}
            </div>
        </div>
    );
};

export default function FiscalTaxLimit({
    auth,
    units = [],
    selectedUnitId = null,
    unit = null,
    configuration = {},
    summary = {},
    fiscalUnavailableMessage = null,
}) {
    const { flash = {} } = usePage().props;
    const isMaster = Number(auth?.user?.funcao) === 0;
    const selectedUnit = units.find((store) => Number(store.id) === Number(selectedUnitId)) ?? units[0] ?? null;
    const { data, setData, post, processing, errors, transform } = useForm(buildFormData(configuration, selectedUnitId));
    const blockedBy = configuration?.tb26_limite_imposto_bloqueado_por;

    const handleSelectUnit = (unitId) => {
        router.get(route('settings.fiscal.tax-limit'), { unit_id: unitId }, {
            preserveState: false,
            preserveScroll: true,
        });
    };

    const handleSubmit = (event) => {
        event.preventDefault();

        transform((formData) => ({
            ...formData,
            tb26_limite_imposto_diario: normalizeDecimalInput(formData.tb26_limite_imposto_diario),
            tb26_limite_imposto_mensal: normalizeDecimalInput(formData.tb26_limite_imposto_mensal),
            tb26_limite_valor_compra: normalizeDecimalInput(formData.tb26_limite_valor_compra),
        }));

        post(route('settings.fiscal.tax-limit.update'), {
            preserveScroll: true,
        });
    };

    return (
        <AuthenticatedLayout
            user={auth.user}
            header={
                <div className="flex flex-col gap-1">
                    <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">
                        Configuracao Limite Imposto
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-300">
                        Controle limites de emissao fiscal por dia, mes e valor de compra.
                    </p>
                </div>
            }
        >
            <Head title="Configuracao Limite Imposto" />

            <div className="py-8">
                <div className="mx-auto max-w-7xl space-y-6 px-4 sm:px-6 lg:px-8">
                    <AlertMessage message={flash} />

                    <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-gray-800">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-300">
                                    Lojas
                                </p>
                                <h3 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
                                    {isMaster ? 'Selecione a unidade' : (selectedUnit?.name ?? 'Unidade atual')}
                                </h3>
                            </div>
                            <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-900/50">
                                <Link
                                    href={route('settings.fiscal', selectedUnitId ? { unit_id: selectedUnitId } : {})}
                                    className="inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-50 dark:text-blue-200 dark:hover:bg-blue-500/10"
                                >
                                    Configuracao fiscal
                                </Link>
                                <Link
                                    href={route('settings.nfe', selectedUnitId ? { unit_id: selectedUnitId } : {})}
                                    className="inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50 dark:text-emerald-200 dark:hover:bg-emerald-500/10"
                                >
                                    Resumo mensal
                                </Link>
                                <Link
                                    href={route('settings.nfe', selectedUnitId ? { unit_id: selectedUnitId } : {})}
                                    className="inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-50 dark:text-blue-200 dark:hover:bg-blue-500/10"
                                >
                                    NFe
                                </Link>
                                <span
                                    aria-current="page"
                                    className="inline-flex items-center rounded-full bg-white px-4 py-2 text-sm font-semibold text-amber-700 shadow-sm dark:bg-gray-800 dark:text-amber-100"
                                >
                                    Limite imposto
                                </span>
                            </div>
                        </div>

                        {isMaster ? (
                        <div className="mt-5 flex flex-wrap gap-3">
                            {units.map((store) => {
                                const active = Number(store.id) === Number(selectedUnitId);
                                const generationEnabled = Boolean(store.fiscal_generation_enabled);
                                const dailyAverage = Number(store.monthly_issued_daily_average ?? 0);
                                const neededToday = amountNeededTodayForDailyLimit(store);

                                return (
                                    <button
                                        key={store.id}
                                        type="button"
                                        onClick={() => handleSelectUnit(store.id)}
                                        className={`rounded-2xl border px-5 py-3 text-left text-sm font-semibold transition ${
                                            !generationEnabled
                                                ? 'border-rose-300 bg-rose-50 text-rose-700 shadow-sm dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-100'
                                                : active
                                                  ? 'border-blue-600 bg-blue-50 text-blue-700 shadow-sm dark:border-blue-400 dark:bg-blue-500/10 dark:text-blue-200'
                                                  : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-blue-300 hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
                                        }`}
                                    >
                                        <span className="flex items-center gap-2">
                                            <span
                                                className={`h-2.5 w-2.5 rounded-full ${generationEnabled ? 'bg-emerald-500' : 'bg-rose-500'}`}
                                                aria-hidden="true"
                                            />
                                            {store.name}
                                        </span>
                                        <span className="mt-1 block text-xs font-medium opacity-80">
                                            Media diaria: {currency.format(dailyAverage)}
                                        </span>
                                        <span className="mt-1 block text-xs font-medium opacity-80">
                                            Hoje para meta: {neededToday === null ? 'Sem limite diario' : currency.format(neededToday)}
                                        </span>
                                        <span className={`mt-1 block text-xs font-bold uppercase tracking-wide ${
                                            generationEnabled ? 'text-emerald-700 dark:text-emerald-100' : 'text-rose-700 dark:text-rose-100'
                                        }`}>
                                            {generationEnabled ? 'Ligada' : 'Desativado'}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                        ) : selectedUnit ? (
                            <div className={`mt-5 rounded-2xl border px-4 py-3 text-sm font-semibold ${
                                selectedUnit.fiscal_generation_enabled
                                    ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-500/10 dark:text-blue-200'
                                    : 'border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-100'
                            }`}>
                                <span className="flex items-center gap-2">
                                    <span
                                        className={`h-2.5 w-2.5 rounded-full ${selectedUnit.fiscal_generation_enabled ? 'bg-emerald-500' : 'bg-rose-500'}`}
                                        aria-hidden="true"
                                    />
                                    {selectedUnit.name}
                                </span>
                                <span className="mt-1 block text-xs font-medium opacity-80">
                                    Media diaria: {currency.format(Number(selectedUnit.monthly_issued_daily_average ?? 0))}
                                </span>
                                <span className="mt-1 block text-xs font-medium opacity-80">
                                    Hoje para meta: {amountNeededTodayForDailyLimit(selectedUnit) === null
                                        ? 'Sem limite diario'
                                        : currency.format(amountNeededTodayForDailyLimit(selectedUnit))}
                                </span>
                                <span className={`mt-1 block text-xs font-bold uppercase tracking-wide ${
                                    selectedUnit.fiscal_generation_enabled ? 'text-emerald-700 dark:text-emerald-100' : 'text-rose-700 dark:text-rose-100'
                                }`}>
                                    {selectedUnit.fiscal_generation_enabled ? 'Ligada' : 'Desativado'}
                                </span>
                            </div>
                        ) : null}
                    </section>

                    {!selectedUnitId ? (
                        <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-10 text-center text-sm text-gray-500 shadow dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                            Selecione uma unidade para configurar o limite de imposto.
                        </div>
                    ) : (
                        <>
                            {fiscalUnavailableMessage && (
                                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800 shadow dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
                                    {fiscalUnavailableMessage}
                                </div>
                            )}

                            {blockedBy && (
                                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm font-semibold text-amber-800 shadow dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
                                    Bloqueada por limite {blockedBy}
                                    {configuration?.tb26_limite_imposto_bloqueado_em
                                        ? ` em ${configuration.tb26_limite_imposto_bloqueado_em}.`
                                        : '.'}
                                </div>
                            )}

                            <section className="grid gap-5 lg:grid-cols-2">
                                <SummaryBox title="Emitido hoje" data={summary?.daily} />
                                <SummaryBox title="Emitido no mes" data={summary?.monthly} />
                            </section>

                            <form
                                onSubmit={handleSubmit}
                                className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-gray-800"
                            >
                                <input type="hidden" value={data.tb2_id} />

                                <div className="flex flex-wrap items-start justify-between gap-4">
                                    <div>
                                        <h3 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
                                            Regras de bloqueio
                                        </h3>
                                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-300">
                                            Ao atingir limite diario ou mensal, a geracao automatica da loja e desligada.
                                        </p>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => setData('tb26_limite_imposto_ativo', !Boolean(data.tb26_limite_imposto_ativo))}
                                        className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition ${
                                            data.tb26_limite_imposto_ativo ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'
                                        }`}
                                        aria-pressed={Boolean(data.tb26_limite_imposto_ativo)}
                                    >
                                        <span className="sr-only">Alternar controle de limite de imposto</span>
                                        <span
                                            className={`inline-block h-6 w-6 transform rounded-full bg-white transition ${
                                                data.tb26_limite_imposto_ativo ? 'translate-x-7' : 'translate-x-1'
                                            }`}
                                        />
                                    </button>
                                </div>

                                <InputError message={errors.tb26_limite_imposto_ativo} className="mt-2" />

                                <div className="mt-6 grid gap-5 md:grid-cols-3">
                                    <div>
                                        <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                                            Limite diario
                                        </label>
                                        <input
                                            type="text"
                                            inputMode="decimal"
                                            value={data.tb26_limite_imposto_diario}
                                            onChange={(event) => setData('tb26_limite_imposto_diario', event.target.value)}
                                            className={fieldClassName}
                                            placeholder="Ex.: 1500,00"
                                        />
                                        <InputError message={errors.tb26_limite_imposto_diario} className="mt-2" />
                                    </div>

                                    <div>
                                        <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                                            Limite mensal
                                        </label>
                                        <input
                                            type="text"
                                            inputMode="decimal"
                                            value={data.tb26_limite_imposto_mensal}
                                            onChange={(event) => setData('tb26_limite_imposto_mensal', event.target.value)}
                                            className={fieldClassName}
                                            placeholder="Ex.: 30000,00"
                                        />
                                        <InputError message={errors.tb26_limite_imposto_mensal} className="mt-2" />
                                    </div>

                                    <div>
                                        <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                                            Limite por compra
                                        </label>
                                        <input
                                            type="text"
                                            inputMode="decimal"
                                            value={data.tb26_limite_valor_compra}
                                            onChange={(event) => setData('tb26_limite_valor_compra', event.target.value)}
                                            className={fieldClassName}
                                            placeholder="Ex.: 500,00"
                                        />
                                        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                                            Vendas acima deste valor nao geram nota automaticamente.
                                        </p>
                                        <InputError message={errors.tb26_limite_valor_compra} className="mt-2" />
                                    </div>
                                </div>

                                <div className="mt-6 flex justify-end">
                                    <PrimaryButton disabled={processing || Boolean(fiscalUnavailableMessage)}>
                                        Salvar limite de imposto
                                    </PrimaryButton>
                                </div>
                            </form>
                        </>
                    )}
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
