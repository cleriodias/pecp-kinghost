import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import InputError from '@/Components/InputError';
import { formatBrazilDate, formatBrazilDateTime } from '@/Utils/date';
import { Head, useForm } from '@inertiajs/react';

const formatCurrency = (value) =>
    Number(value ?? 0).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });

const formatDateTime = (value) => {
    if (!value) {
        return '--';
    }

    return formatBrazilDateTime(value);
};

const formatDate = (value) => {
    if (!value) {
        return '--';
    }

    return formatBrazilDate(value);
};

export default function CashierClose({ activeUnit, todayClosure, lastClosure, pendingClosureDate, hasOpenComandas }) {
    const { data, setData, post, processing, errors } = useForm({
        cash_amount: '',
        card_amount: '',
        closure_date: pendingClosureDate ?? '',
        confirm_pending: false,
        open_comandas_observation: '',
    });

    const hasClosedToday = Boolean(todayClosure);
    const hasPendingClosure = Boolean(pendingClosureDate);
    const canSubmitPendingClosure = hasPendingClosure || !hasClosedToday;
    const pendingLabel = formatDate(pendingClosureDate);

    const handleSubmit = (event) => {
        event.preventDefault();
        if (!canSubmitPendingClosure) {
            return;
        }

        post(route('cashier.close.store'));
    };

    const headerContent = (
        <div>
            <h2 className="text-xl font-semibold leading-tight text-gray-800 dark:text-gray-200">
                Fechar CX
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-300">
                Informe os valores recebidos em dinheiro e cartão para encerrar o caixa do dia. Ao confirmar,
                seu acesso ficará bloqueado até o próximo dia.
            </p>
        </div>
    );

    return (
        <AuthenticatedLayout header={headerContent}>
            <Head title="Fechar CX" />

            <div className="py-12">
                <div className="mx-auto max-w-3xl space-y-8 px-4 sm:px-6 lg:px-8">
                    <div className="rounded-2xl bg-white p-6 shadow dark:bg-gray-800">
                        <div className="flex flex-col gap-1">
                            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-gray-400">
                                Unidade
                            </p>
                            <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                                {activeUnit?.name ?? 'Unidade não definida'}
                            </p>
                        </div>
                        {hasClosedToday && !hasPendingClosure ? (
                            <div className="mt-6 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-900 dark:border-green-400/50 dark:bg-green-900/10 dark:text-green-200">
                                <p className="font-semibold">
                                    Caixa já fechado em {formatDateTime(todayClosure.closed_at)}.
                                </p>
                                <p className="mt-1">
                                    Valores registrados: {formatCurrency(todayClosure.cash_amount)} em dinheiro e{' '}
                                    {formatCurrency(todayClosure.card_amount)} no cartão.
                                </p>
                                <p className="mt-1 text-xs text-green-800 dark:text-green-300">
                                    Novo acesso liberado apenas amanhã.
                                </p>
                            </div>
                        ) : (
                            <form onSubmit={handleSubmit} className="mt-6 space-y-6">
                                {hasClosedToday && hasPendingClosure && (
                                    <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-400/50 dark:bg-blue-900/10 dark:text-blue-100">
                                        <p className="font-semibold">
                                            Existe um fechamento registrado hoje em {formatDateTime(todayClosure.closed_at)}.
                                        </p>
                                        <p className="mt-1">
                                            Mesmo assim, ainda existe um fechamento pendente de {pendingLabel} que pode ser concluído abaixo.
                                        </p>
                                    </div>
                                )}

                                {hasPendingClosure && (
                                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-400/50 dark:bg-amber-900/10 dark:text-amber-100">
                                        <p className="font-semibold">
                                            Fechamento pendente do dia {pendingLabel}.
                                        </p>
                                        <p className="mt-1">
                                            Confirme para fechar o caixa pendente.
                                        </p>
                                        <label className="mt-3 flex items-center gap-2 text-sm text-amber-900 dark:text-amber-100">
                                            <input
                                                type="checkbox"
                                                checked={data.confirm_pending}
                                                onChange={(event) => setData('confirm_pending', event.target.checked)}
                                                className="h-4 w-4 text-amber-600 focus:ring-amber-500"
                                            />
                                            Confirmo fechar o caixa pendente.
                                        </label>
                                        <InputError message={errors.confirm_pending} className="mt-2" />
                                    </div>
                                )}

                                {hasOpenComandas && (
                                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-400/50 dark:bg-amber-900/10 dark:text-amber-100">
                                        <p className="font-semibold">
                                            Existem comandas da lanchonete em aberto.
                                        </p>
                                        <p className="mt-1">
                                            O caixa pode ser fechado com esta pendencia, mas a observacao com o motivo passa a ser obrigatoria.
                                        </p>
                                        <div className="mt-3">
                                            <label
                                                htmlFor="open_comandas_observation"
                                                className="text-sm font-medium text-amber-900 dark:text-amber-100"
                                            >
                                                Observacao da pendencia
                                            </label>
                                            <textarea
                                                id="open_comandas_observation"
                                                value={data.open_comandas_observation}
                                                onChange={(event) => setData('open_comandas_observation', event.target.value)}
                                                rows={4}
                                                className="mt-1 w-full rounded-xl border border-amber-300 bg-white px-4 py-2 text-gray-800 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-200 dark:border-amber-500/60 dark:bg-gray-800 dark:text-gray-100"
                                                placeholder="Descreva por que o caixa esta sendo fechado com comanda em aberto"
                                            />
                                            <InputError message={errors.open_comandas_observation} className="mt-2" />
                                        </div>
                                    </div>
                                )}
                                <div>
                                    <label htmlFor="cash_amount" className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                        Total em dinheiro
                                    </label>
                                    <input
                                        id="cash_amount"
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={data.cash_amount}
                                        onChange={(event) => setData('cash_amount', event.target.value)}
                                        className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-2 text-gray-800 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                                        placeholder="Informe o valor contado em dinheiro"
                                    />
                                    <InputError message={errors.cash_amount} className="mt-2" />
                                </div>

                                <div>
                                    <label htmlFor="card_amount" className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                        Total em cartão
                                    </label>
                                    <input
                                        id="card_amount"
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={data.card_amount}
                                        onChange={(event) => setData('card_amount', event.target.value)}
                                        className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-2 text-gray-800 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                                        placeholder="Informe o total processado nas máquinas"
                                    />
                                    <InputError message={errors.card_amount} className="mt-2" />
                                </div>

                                <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-600 dark:bg-gray-900/40 dark:text-gray-300">
                                    <p className="font-semibold text-gray-800 dark:text-gray-100">
                                        Atenção
                                    </p>
                                    <p className="mt-1">
                                        Após confirmar o fechamento você será desconectado automaticamente e só poderá acessar o sistema novamente amanhã.
                                    </p>
                                </div>

                                <div className="flex justify-end">
                                    <button
                                        type="submit"
                                        disabled={processing || (hasPendingClosure && !data.confirm_pending)}
                                        className="rounded-xl bg-indigo-600 px-6 py-2 text-sm font-semibold text-white shadow transition hover:bg-indigo-700 disabled:opacity-50"
                                    >
                                        Confirmar fechamento
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>

                    {lastClosure && (
                        <div className="rounded-2xl bg-white p-6 shadow dark:bg-gray-800">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                                Último fechamento registrado
                            </h3>
                            <p className="text-sm text-gray-500 dark:text-gray-300">
                                {formatDateTime(lastClosure.closed_at)} · {lastClosure.unit_name ?? activeUnit?.name ?? '---'}
                            </p>
                            <div className="mt-4 grid gap-4 sm:grid-cols-2">
                                <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 text-center dark:border-gray-700 dark:bg-gray-900/40">
                                    <p className="text-sm text-gray-600 dark:text-gray-300">Dinheiro</p>
                                    <p className="text-xl font-bold text-gray-900 dark:text-white">
                                        {formatCurrency(lastClosure.cash_amount)}
                                    </p>
                                </div>
                                <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 text-center dark:border-gray-700 dark:bg-gray-900/40">
                                    <p className="text-sm text-gray-600 dark:text-gray-300">Cartão</p>
                                    <p className="text-xl font-bold text-gray-900 dark:text-white">
                                        {formatCurrency(lastClosure.card_amount)}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
