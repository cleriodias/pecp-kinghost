import { formatBrazilShortDate } from '@/Utils/date';
import { Head, Link } from '@inertiajs/react';

const formatCurrency = (value) =>
    Number(value ?? 0).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });

export default function ControlePagamentosImpressao({ paymentControls = [], generatedAt = null }) {
    const totalValor = paymentControls.reduce((sum, item) => sum + Number(item.valor_total ?? 0), 0);

    const handlePrint = () => {
        window.print();
    };

    return (
        <>
            <Head title="Impressão do Controle de Pagamentos" />

            <main className="min-h-screen bg-slate-100 px-4 py-6 text-slate-900 print:bg-white print:px-0 print:py-0">
                <div className="mx-auto max-w-7xl rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 print:rounded-none print:shadow-none print:ring-0">
                    <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 md:flex-row md:items-end md:justify-between print:hidden">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                                Controle pessoal
                            </p>
                            <h1 className="mt-2 text-2xl font-bold text-slate-900">
                                Impressão completa dos registros
                            </h1>
                            <p className="mt-2 max-w-3xl text-sm text-slate-600">
                                Esta tela lista todos os controles cadastrados no sistema, sem filtro por usuário.
                            </p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                            <Link
                                href={route('settings.payment-control')}
                                className="inline-flex items-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                            >
                                Voltar
                            </Link>
                            <button
                                type="button"
                                onClick={handlePrint}
                                className="inline-flex items-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
                            >
                                Imprimir
                            </button>
                        </div>
                    </div>

                    <div className="mt-6 grid gap-4 md:grid-cols-3 print:mt-0">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                                Total de registros
                            </p>
                            <p className="mt-2 text-2xl font-bold text-slate-900">
                                {paymentControls.length}
                            </p>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                                Soma dos valores
                            </p>
                            <p className="mt-2 text-2xl font-bold text-slate-900">
                                {formatCurrency(totalValor)}
                            </p>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                                Gerado em
                            </p>
                            <p className="mt-2 text-2xl font-bold text-slate-900">
                                {generatedAt ? formatBrazilShortDate(generatedAt) : '--'}
                            </p>
                        </div>
                    </div>

                    <div className="mt-6 overflow-x-auto">
                        <table className="min-w-full border-collapse text-sm">
                            <thead>
                                <tr className="border-b border-slate-200 bg-slate-50 text-left">
                                    <th className="px-3 py-3 font-semibold text-slate-700">Usuário</th>
                                    <th className="px-3 py-3 font-semibold text-slate-700">Descrição</th>
                                    <th className="px-3 py-3 font-semibold text-slate-700">Frequência</th>
                                    <th className="px-3 py-3 text-right font-semibold text-slate-700">Valor total</th>
                                    <th className="px-3 py-3 text-right font-semibold text-slate-700">Parcelas</th>
                                    <th className="px-3 py-3 text-right font-semibold text-slate-700">Valor/parcela</th>
                                    <th className="px-3 py-3 font-semibold text-slate-700">Início</th>
                                    <th className="px-3 py-3 font-semibold text-slate-700">Fim</th>
                                </tr>
                            </thead>
                            <tbody>
                                {paymentControls.length === 0 ? (
                                    <tr>
                                        <td colSpan="8" className="px-3 py-6 text-center text-slate-500">
                                            Nenhum registro encontrado.
                                        </td>
                                    </tr>
                                ) : (
                                    paymentControls.map((item) => {
                                        const frequencyExtra =
                                            item.frequencia === 'semanal'
                                                ? item.dia_semana_label
                                                : item.frequencia === 'mensal'
                                                  ? `Dia ${item.dia_mes}`
                                                  : 'A cada 14 dias';

                                        return (
                                            <tr key={item.id} className="border-b border-slate-100 align-top">
                                                <td className="px-3 py-3">
                                                    <span className="inline-flex rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-black">
                                                        {item.user_name || 'Sem usuario'}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-3 text-slate-800">
                                                    <div className="flex flex-col">
                                                        <span className="font-semibold">{item.descricao}</span>
                                                        <span className="text-xs text-slate-500">
                                                            ID {item.id}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-3 py-3 text-slate-700">
                                                    <div className="flex flex-col">
                                                        <span className="font-semibold">
                                                            {item.frequencia_label}
                                                        </span>
                                                        <span className="text-xs text-slate-500">
                                                            {frequencyExtra}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-3 py-3 text-right font-semibold text-slate-900">
                                                    {formatCurrency(item.valor_total)}
                                                </td>
                                                <td className="px-3 py-3 text-right text-slate-700">
                                                    {item.quantidade_parcelas}
                                                </td>
                                                <td className="px-3 py-3 text-right font-semibold text-slate-900">
                                                    {formatCurrency(item.valor_parcela)}
                                                </td>
                                                <td className="px-3 py-3 text-slate-700">
                                                    {formatBrazilShortDate(item.data_inicio)}
                                                </td>
                                                <td className="px-3 py-3 text-slate-700">
                                                    {formatBrazilShortDate(item.data_fim)}
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </main>
        </>
    );
}
