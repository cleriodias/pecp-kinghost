import AlertMessage from '@/Components/Alert/AlertMessage';
import PrimaryButton from '@/Components/Button/PrimaryButton';
import InputError from '@/Components/InputError';
import Modal from '@/Components/Modal';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import {
    formatBrazilShortDate,
    getBrazilTodayShortInputValue,
    isoToBrazilShortDateInput,
    shortBrazilDateInputToIso,
} from '@/Utils/date';
import { Head, Link, router, useForm, usePage } from '@inertiajs/react';
import { useState } from 'react';

const WEEKDAY_OPTIONS = [
    { value: '1', label: 'Segunda-feira' },
    { value: '2', label: 'Terca-feira' },
    { value: '3', label: 'Quarta-feira' },
    { value: '4', label: 'Quinta-feira' },
    { value: '5', label: 'Sexta-feira' },
    { value: '6', label: 'Sabado' },
    { value: '0', label: 'Domingo' },
];

const FREQUENCY_OPTIONS = [
    { value: 'semanal', label: 'Semanal' },
    { value: 'quinzenal', label: 'Quinzenal' },
    { value: 'mensal', label: 'Mensal' },
];

const formatCurrency = (value) =>
    Number(value ?? 0).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });

const toNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const addMonthsClamped = (date, targetDay) => {
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    const nextMonthFirstDay = new Date(Date.UTC(year, month + 1, 1, 12));
    const nextYear = nextMonthFirstDay.getUTCFullYear();
    const nextMonth = nextMonthFirstDay.getUTCMonth();
    const lastDay = new Date(Date.UTC(nextYear, nextMonth + 1, 0, 12)).getUTCDate();
    const safeDay = Math.min(targetDay, lastDay);

    return new Date(Date.UTC(nextYear, nextMonth, safeDay, 12));
};

const calculateEndDatePreview = (frequency, startDateIso, installments, weekday, monthDay) => {
    if (!startDateIso || installments <= 0) {
        return '';
    }

    const startDate = new Date(`${startDateIso}T12:00:00Z`);

    if (Number.isNaN(startDate.getTime())) {
        return '';
    }

    if (frequency === 'semanal') {
        if (weekday === '') {
            return '';
        }

        if (startDate.getUTCDay() !== Number(weekday)) {
            return '';
        }

        const result = new Date(startDate);
        result.setUTCDate(result.getUTCDate() + (installments - 1) * 7);
        return result.toISOString().slice(0, 10);
    }

    if (frequency === 'quinzenal') {
        const result = new Date(startDate);
        result.setUTCDate(result.getUTCDate() + (installments - 1) * 14);
        return result.toISOString().slice(0, 10);
    }

    if (monthDay === '') {
        return '';
    }

    if (startDate.getUTCDate() !== Number(monthDay)) {
        return '';
    }

    let result = new Date(startDate);
    for (let index = 1; index < installments; index += 1) {
        result = addMonthsClamped(result, Number(monthDay));
    }

    return result.toISOString().slice(0, 10);
};

const getFrequencyHint = (frequency) => {
    if (frequency === 'semanal') {
        return 'A data de inicio precisa cair no mesmo dia da semana selecionado.';
    }

    if (frequency === 'quinzenal') {
        return 'A data de inicio sera usada como a primeira parcela, repetindo a cada 14 dias.';
    }

    return 'A data de inicio precisa usar o mesmo dia do mes informado.';
};

const TIMELINE_STATUS_STYLES = {
    vencido: 'border-red-200 bg-red-50 text-red-700',
    por_vencer: 'border-amber-200 bg-amber-50 text-amber-700',
    nao_venceu: 'border-emerald-200 bg-emerald-50 text-emerald-700',
};

export default function ControlePagamentos({ paymentControls = [], timelineReferenceDate = null }) {
    const { flash } = usePage().props;
    const [selectedTimeline, setSelectedTimeline] = useState(null);
    const { data, setData, post, processing, errors, reset } = useForm({
        descricao: '',
        frequencia: 'semanal',
        dia_semana: '1',
        dia_mes: '',
        valor_total: '',
        quantidade_parcelas: '1',
        data_inicio: getBrazilTodayShortInputValue(),
    });

    const installments = Math.max(1, parseInt(data.quantidade_parcelas || '1', 10) || 1);
    const totalAmount = toNumber(data.valor_total);
    const installmentAmount = installments > 0 ? totalAmount / installments : 0;
    const startDateIso = shortBrazilDateInputToIso(data.data_inicio);
    const calculatedEndDate = calculateEndDatePreview(
        data.frequencia,
        startDateIso,
        installments,
        data.dia_semana,
        data.dia_mes,
    );

    const handleSubmit = (event) => {
        event.preventDefault();

        post(route('settings.payment-control.store'), {
            preserveScroll: true,
            onSuccess: () => {
                reset('descricao', 'valor_total', 'quantidade_parcelas');
                setData((current) => ({
                    ...current,
                    frequencia: 'semanal',
                    dia_semana: '1',
                    dia_mes: '',
                    data_inicio: getBrazilTodayShortInputValue(),
                }));
            },
        });
    };

    const handleDelete = (id) => {
        if (!id) {
            return;
        }

        if (!window.confirm('Confirma excluir este controle de pagamento?')) {
            return;
        }

        router.delete(route('settings.payment-control.destroy', id), {
            preserveScroll: true,
        });
    };

    const closeTimelineModal = () => setSelectedTimeline(null);

    return (
            <AuthenticatedLayout
            header={
                <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                    <div className="flex flex-col gap-1">
                        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">
                            Controle de Pagamentos
                        </h2>
                        <p className="text-sm text-gray-500 dark:text-gray-300">
                            Cadastre recorrencias de pagamento com parcelas, valor unitario e data fim calculada. Cada usuario ve e gerencia apenas os proprios controles.
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <Link
                            href={route('settings.payment-control.print-all')}
                            className="inline-flex items-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600"
                        >
                            Imprimir todos
                        </Link>
                    </div>
                </div>
            }
        >
            <Head title="Controle de Pagamentos" />

            <div className="py-8">
                <div className="mx-auto max-w-7xl space-y-6 px-4 sm:px-6 lg:px-8">
                    <AlertMessage message={flash} />

                    <form
                        onSubmit={handleSubmit}
                        className="rounded-[28px] bg-white p-6 shadow dark:bg-gray-800"
                    >
                        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.75fr)_minmax(320px,0.85fr)]">
                            <div className="space-y-5">
                                <div>
                                    <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                        Descricao
                                    </label>
                                    <input
                                        type="text"
                                        value={data.descricao}
                                        onChange={(event) => setData('descricao', event.target.value)}
                                        className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-gray-900 shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                                        placeholder="Ex.: Pagamento de fornecedor, aluguel, servico mensal"
                                    />
                                    <InputError message={errors.descricao} className="mt-2" />
                                </div>

                                <div className="grid gap-4 md:grid-cols-3">
                                    <div>
                                        <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                            Frequencia
                                        </label>
                                        <select
                                            value={data.frequencia}
                                            onChange={(event) => {
                                                const nextFrequency = event.target.value;
                                                setData((current) => ({
                                                    ...current,
                                                    frequencia: nextFrequency,
                                                    dia_semana:
                                                        nextFrequency === 'semanal'
                                                            ? (current.dia_semana || '1')
                                                            : '',
                                                    dia_mes: nextFrequency === 'mensal' ? current.dia_mes : '',
                                                }));
                                            }}
                                            className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-gray-900 shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                                        >
                                            {FREQUENCY_OPTIONS.map((option) => (
                                                <option key={option.value} value={option.value}>
                                                    {option.label}
                                                </option>
                                            ))}
                                        </select>
                                        <InputError message={errors.frequencia} className="mt-2" />
                                    </div>

                                    <div>
                                        <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                            Data inicio
                                        </label>
                                        <div className="relative mt-2">
                                            <div className="flex items-center rounded-2xl border border-slate-300 bg-white px-4 py-3 shadow-sm transition focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-200 dark:border-gray-600 dark:bg-gray-700">
                                                <span className="pointer-events-none text-sm text-gray-900 dark:text-gray-100">
                                                    {data.data_inicio || 'DD/MM/AA'}
                                                </span>
                                                <span className="ml-auto pointer-events-none text-base text-gray-400 dark:text-gray-300">
                                                    <i className="bi bi-calendar3" aria-hidden="true" />
                                                </span>
                                            </div>
                                            <input
                                                type="date"
                                                value={startDateIso}
                                                onChange={(event) =>
                                                    setData('data_inicio', isoToBrazilShortDateInput(event.target.value))
                                                }
                                                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                                                aria-label="Selecionar data de inicio"
                                            />
                                        </div>
                                        <InputError message={errors.data_inicio} className="mt-2" />
                                    </div>

                                    {data.frequencia === 'semanal' ? (
                                        <div>
                                            <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                                Dia da semana
                                            </label>
                                            <select
                                                value={data.dia_semana}
                                                onChange={(event) => setData('dia_semana', event.target.value)}
                                                className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-gray-900 shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                                            >
                                                {WEEKDAY_OPTIONS.map((option) => (
                                                    <option key={option.value} value={option.value}>
                                                        {option.label}
                                                    </option>
                                                ))}
                                            </select>
                                            <InputError message={errors.dia_semana} className="mt-2" />
                                        </div>
                                    ) : (
                                        <div>
                                            <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                                Dia da semana
                                            </label>
                                            <input
                                                type="text"
                                                value="Nao se aplica"
                                                disabled
                                                className="mt-2 w-full rounded-2xl border border-gray-200 bg-gray-100 px-4 py-3 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400"
                                            />
                                        </div>
                                    )}
                                </div>

                                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1.35fr)]">
                                    {data.frequencia === 'mensal' ? (
                                        <div>
                                            <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                                Dia do mes
                                            </label>
                                            <input
                                                type="number"
                                                min="1"
                                                max="31"
                                                value={data.dia_mes}
                                                onChange={(event) => setData('dia_mes', event.target.value)}
                                                className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-gray-900 shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                                                placeholder="Ex.: 5"
                                            />
                                            <InputError message={errors.dia_mes} className="mt-2" />
                                        </div>
                                    ) : (
                                        <div>
                                            <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                                Dia do mes
                                            </label>
                                            <input
                                                type="text"
                                                value="Nao se aplica"
                                                disabled
                                                className="mt-2 w-full rounded-2xl border border-gray-200 bg-gray-100 px-4 py-3 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400"
                                            />
                                        </div>
                                    )}

                                    <div>
                                        <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                            Valor total
                                        </label>
                                        <input
                                            type="number"
                                            min="0.01"
                                            step="0.01"
                                            value={data.valor_total}
                                            onChange={(event) => setData('valor_total', event.target.value)}
                                            className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-gray-900 shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                                            placeholder="0,00"
                                        />
                                        <InputError message={errors.valor_total} className="mt-2" />
                                    </div>

                                    <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(136px,0.95fr)]">
                                        <div>
                                            <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                                Parcelas
                                            </label>
                                            <input
                                                type="number"
                                                min="1"
                                                step="1"
                                                value={data.quantidade_parcelas}
                                                onChange={(event) => setData('quantidade_parcelas', event.target.value)}
                                                className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-gray-900 shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                                                placeholder="1"
                                            />
                                            <InputError message={errors.quantidade_parcelas} className="mt-2" />
                                        </div>

                                        <div className="flex items-end">
                                            <PrimaryButton
                                                type="submit"
                                                disabled={processing}
                                                className="w-full justify-center rounded-2xl px-5 py-3 text-sm font-semibold normal-case tracking-normal shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
                                            >
                                                Salvar
                                            </PrimaryButton>
                                        </div>
                                    </div>
                                </div>

                                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-300">
                                    {getFrequencyHint(data.frequencia)}
                                </div>
                            </div>

                            <div className="rounded-[28px] border border-slate-200 bg-slate-50/80 p-5 dark:border-gray-700 dark:bg-gray-900/40">
                                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500 dark:text-gray-300">
                                    Resumo calculado
                                </p>

                                <div className="mt-5 space-y-4">
                                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-gray-300">
                                            Valor por parcela
                                        </p>
                                        <p className="mt-3 text-[1.85rem] font-bold leading-none text-gray-900 dark:text-gray-100">
                                            {formatCurrency(installmentAmount)}
                                        </p>
                                    </div>

                                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-gray-300">
                                            Data inicio
                                        </p>
                                        <p className="mt-3 text-xl font-semibold text-gray-900 dark:text-gray-100">
                                            {data.data_inicio || '--'}
                                        </p>
                                    </div>

                                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-gray-300">
                                            Data fim calculada
                                        </p>
                                        <p className="mt-3 text-xl font-semibold text-gray-900 dark:text-gray-100">
                                            {calculatedEndDate ? formatBrazilShortDate(calculatedEndDate) : '--'}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-4 text-sm text-blue-800 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-100">
                            A data fim so aparece quando a combinacao de frequencia, data inicial e dia informado estiver coerente.
                        </div>
                    </form>

                    <div className="rounded-2xl bg-white p-6 shadow dark:bg-gray-800">
                        <div className="flex flex-col gap-1 border-b border-gray-100 pb-4 dark:border-gray-700">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                                Controles cadastrados
                            </h3>
                            <p className="text-sm text-gray-500 dark:text-gray-300">
                                Consulte apenas os controles de pagamento cadastrados por voce.
                            </p>
                        </div>

                        {paymentControls.length === 0 ? (
                            <p className="mt-4 text-sm text-gray-500 dark:text-gray-300">
                                Nenhum controle de pagamento cadastrado.
                            </p>
                        ) : (
                            <div className="mt-4 overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-700">
                                    <thead className="bg-gray-50 dark:bg-gray-900/40">
                                        <tr>
                                            <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">
                                                Descricao
                                            </th>
                                            <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">
                                                Frequencia
                                            </th>
                                            <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-300">
                                                Valor
                                            </th>
                                            <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-300">
                                                Parcelas
                                            </th>
                                            <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-300">
                                                Valor/parcela
                                            </th>
                                            <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">
                                                Inicio
                                            </th>
                                            <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">
                                                Fim
                                            </th>
                                            <th className="px-3 py-2 text-center font-medium text-gray-600 dark:text-gray-300">
                                                Acao
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                        {paymentControls.map((item) => {
                                            const frequencyExtra =
                                                item.frequencia === 'semanal'
                                                    ? item.dia_semana_label
                                                    : item.frequencia === 'mensal'
                                                      ? `Dia ${item.dia_mes}`
                                                      : 'A cada 14 dias';

                                            return (
                                                <tr key={item.id}>
                                                    <td className="px-3 py-2 text-gray-700 dark:text-gray-200">
                                                        {item.descricao}
                                                    </td>
                                                    <td className="px-3 py-2 text-gray-700 dark:text-gray-200">
                                                        <div className="flex flex-col">
                                                            <span className="font-semibold">
                                                                {item.frequencia_label}
                                                            </span>
                                                            <span className="text-xs text-gray-500 dark:text-gray-400">
                                                                {frequencyExtra}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="px-3 py-2 text-right font-semibold text-gray-900 dark:text-gray-100">
                                                        {formatCurrency(item.valor_total)}
                                                    </td>
                                                    <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-200">
                                                        {item.quantidade_parcelas}
                                                    </td>
                                                    <td className="px-3 py-2 text-right font-semibold text-gray-900 dark:text-gray-100">
                                                        {formatCurrency(item.valor_parcela)}
                                                    </td>
                                                    <td className="px-3 py-2 text-gray-700 dark:text-gray-200">
                                                        {formatBrazilShortDate(item.data_inicio)}
                                                    </td>
                                                    <td className="px-3 py-2 text-gray-700 dark:text-gray-200">
                                                        {formatBrazilShortDate(item.data_fim)}
                                                    </td>
                                                    <td className="px-3 py-2 text-center">
                                                        <div className="flex items-center justify-center gap-2">
                                                            <button
                                                                type="button"
                                                                onClick={() => setSelectedTimeline(item)}
                                                                className="rounded-lg border border-indigo-200 px-3 py-1 text-xs font-semibold text-indigo-600 transition hover:bg-indigo-50 dark:border-indigo-500/60 dark:text-indigo-300 dark:hover:bg-indigo-500/10"
                                                            >
                                                                Cronologia
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleDelete(item.id)}
                                                                className="rounded-lg border border-red-200 px-3 py-1 text-xs font-semibold text-red-600 transition hover:bg-red-50 dark:border-red-500/60 dark:text-red-300 dark:hover:bg-red-500/10"
                                                            >
                                                                Excluir
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <Modal show={Boolean(selectedTimeline)} onClose={closeTimelineModal} maxWidth="2xl" tone="light">
                <div className="bg-white p-6 text-gray-900">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <h3 className="text-lg font-semibold">
                                Cronologia dos pagamentos
                            </h3>
                            <p className="mt-1 text-sm text-gray-500">
                                Referencia de classificacao: {timelineReferenceDate ? formatBrazilShortDate(timelineReferenceDate) : '--'}.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={closeTimelineModal}
                            className="text-sm font-semibold text-gray-500 transition hover:text-gray-800"
                        >
                            Fechar
                        </button>
                    </div>

                    {selectedTimeline && (
                        <>
                            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                                    <p className="text-xs font-bold uppercase tracking-[0.25em] text-gray-400">
                                        Descricao
                                    </p>
                                    <p className="mt-2 text-base font-semibold text-gray-900">
                                        {selectedTimeline.descricao}
                                    </p>
                                </div>
                                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                                    <p className="text-xs font-bold uppercase tracking-[0.25em] text-gray-400">
                                        Total de parcelas
                                    </p>
                                    <p className="mt-2 text-base font-semibold text-gray-900">
                                        {selectedTimeline.timeline?.summary?.total_parcelas ?? 0}
                                    </p>
                                </div>
                                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                                    <p className="text-xs font-bold uppercase tracking-[0.25em] text-gray-400">
                                        Valor por parcela
                                    </p>
                                    <p className="mt-2 text-base font-semibold text-gray-900">
                                        {formatCurrency(selectedTimeline.valor_parcela)}
                                    </p>
                                </div>
                                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                                    <p className="text-xs font-bold uppercase tracking-[0.25em] text-gray-400">
                                        Periodo
                                    </p>
                                    <p className="mt-2 text-base font-semibold text-gray-900">
                                        {formatBrazilShortDate(selectedTimeline.data_inicio)} a {formatBrazilShortDate(selectedTimeline.data_fim)}
                                    </p>
                                </div>
                            </div>

                            <div className="mt-4 grid gap-3 sm:grid-cols-3">
                                <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
                                    <p className="text-xs font-bold uppercase tracking-[0.25em] text-red-500">
                                        Vencidas
                                    </p>
                                    <p className="mt-2 text-2xl font-bold text-red-700">
                                        {selectedTimeline.timeline?.summary?.vencido ?? 0}
                                    </p>
                                </div>
                                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                                    <p className="text-xs font-bold uppercase tracking-[0.25em] text-amber-500">
                                        Por vencer
                                    </p>
                                    <p className="mt-2 text-2xl font-bold text-amber-700">
                                        {selectedTimeline.timeline?.summary?.por_vencer ?? 0}
                                    </p>
                                </div>
                                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                                    <p className="text-xs font-bold uppercase tracking-[0.25em] text-emerald-500">
                                        Nao venceram
                                    </p>
                                    <p className="mt-2 text-2xl font-bold text-emerald-700">
                                        {selectedTimeline.timeline?.summary?.nao_venceu ?? 0}
                                    </p>
                                </div>
                            </div>

                            <div className="mt-6 max-h-[28rem] overflow-y-auto">
                                <table className="min-w-full divide-y divide-gray-200 text-sm">
                                    <thead className="bg-gray-100">
                                        <tr>
                                            <th className="px-3 py-2 text-left font-medium text-gray-600">
                                                Parcela
                                            </th>
                                            <th className="px-3 py-2 text-left font-medium text-gray-600">
                                                Vencimento
                                            </th>
                                            <th className="px-3 py-2 text-right font-medium text-gray-600">
                                                Valor
                                            </th>
                                            <th className="px-3 py-2 text-center font-medium text-gray-600">
                                                Status
                                            </th>
                                            <th className="px-3 py-2 text-right font-medium text-gray-600">
                                                Dias
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {(selectedTimeline.timeline?.records ?? []).map((record) => (
                                            <tr key={`${selectedTimeline.id}-${record.numero}`}>
                                                <td className="px-3 py-2 text-gray-700">
                                                    {record.numero}
                                                </td>
                                                <td className="px-3 py-2 text-gray-700">
                                                    {formatBrazilShortDate(record.data_vencimento)}
                                                </td>
                                                <td className="px-3 py-2 text-right font-semibold text-gray-900">
                                                    {formatCurrency(record.valor)}
                                                </td>
                                                <td className="px-3 py-2 text-center">
                                                    <span
                                                        className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${TIMELINE_STATUS_STYLES[record.status] ?? 'border-gray-200 bg-gray-50 text-gray-700'}`}
                                                    >
                                                        {record.status_label}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-2 text-right text-gray-700">
                                                    {record.dias_para_vencer}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <div className="mt-6 flex justify-end">
                                <button
                                    type="button"
                                    onClick={closeTimelineModal}
                                    className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100"
                                >
                                    Fechar
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </Modal>
        </AuthenticatedLayout>
    );
}
