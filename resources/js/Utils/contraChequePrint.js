import { formatBrazilDateTime, formatBrazilShortDate } from '@/Utils/date';

const formatCurrency = (value) =>
    Number(value ?? 0).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });

const escapeHtml = (value) =>
    String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

export const buildContraChequeHtml = (detail, options = {}) => {
    const { showDetails = true, format = 'receipt' } = options;
    const printedAt = formatBrazilDateTime(new Date());
    const companyUnit = detail?.company_unit ?? {};
    const unitLabel = companyUnit?.name || (detail?.unit_names ?? []).join(' / ') || '---';
    const companyAddress = companyUnit?.address || '---';
    const companyPhone = companyUnit?.phone || '---';
    const companyCnpj = companyUnit?.cnpj || '---';
    const periodLabel = `${formatBrazilShortDate(detail?.start_date)} a ${formatBrazilShortDate(detail?.end_date)}`;
    const hasExplicitDiscounts = Array.isArray(detail?.extra_discounts)
        || detail?.extra_discounts_total !== undefined;
    const extraCredits = hasExplicitDiscounts
        ? (detail?.extra_credits ?? []).map((credit) => ({
            ...credit,
            amount: Number(credit?.amount ?? 0),
        }))
        : (detail?.extra_credits ?? [])
            .filter((credit) => Number(credit?.amount ?? 0) >= 0)
            .map((credit) => ({
                ...credit,
                amount: Number(credit?.amount ?? 0),
            }));
    const extraDiscounts = hasExplicitDiscounts
        ? (detail?.extra_discounts ?? []).map((credit) => ({
            ...credit,
            amount: Math.abs(Number(credit?.amount ?? 0)),
        }))
        : (detail?.extra_credits ?? [])
            .filter((credit) => Number(credit?.amount ?? 0) < 0)
            .map((credit) => ({
                ...credit,
                amount: Math.abs(Number(credit?.amount ?? 0)),
            }));
    const extraCreditsTotal = detail?.extra_credits_total ?? extraCredits.reduce((total, credit) => total + Number(credit?.amount ?? 0), 0);
    const extraDiscountsTotal = detail?.extra_discounts_total ?? extraDiscounts.reduce((total, credit) => total + Number(credit?.amount ?? 0), 0);
    const advances = detail?.advances ?? [];
    const vales = detail?.vales ?? [];

    const advancesHtml = advances
        .map(
            (advance) => `
                <div class="record">
                    <div class="record-head">
                        <span>${escapeHtml(formatBrazilShortDate(advance.advance_date))}</span>
                        <span>${escapeHtml(formatCurrency(advance.amount))}</span>
                    </div>
                    <div>Loja: ${escapeHtml(advance.unit_name || '---')}</div>
                    <div>Obs.: ${escapeHtml(advance.reason || '--')}</div>
                </div>
            `,
        )
        .join('');

    const valesHtml = vales
        .map(
            (vale) => `
                <div class="record">
                    <div class="record-head">
                        <span>Cupom #${escapeHtml(vale.id)}</span>
                        <span>${escapeHtml(formatCurrency(vale.total))}</span>
                    </div>
                    <div>${escapeHtml(formatBrazilDateTime(vale.date_time))}</div>
                    <div>Loja: ${escapeHtml(vale.unit_name || '---')}</div>
                    <div>Itens: ${escapeHtml(vale.items_label || '--')}</div>
                </div>
            `,
        )
        .join('');

    const extraCreditsHtml = extraCredits
        .map(
            (credit) => `
                <div class="record">
                    <div class="record-head">
                        <span>${escapeHtml(credit.description || credit.type_label || 'Credito extra')}</span>
                        <span>${escapeHtml(formatCurrency(credit.amount))}</span>
                    </div>
                </div>
            `,
        )
        .join('');

    const extraDiscountsHtml = extraDiscounts
        .map(
            (credit) => `
                <div class="record">
                    <div class="record-head">
                        <span>${escapeHtml(credit.description || credit.type_label || 'Desconto extra')}</span>
                        <span>${escapeHtml(formatCurrency(credit.amount))}</span>
                    </div>
                </div>
            `,
        )
        .join('');

    const extraCreditsSummaryHtml = extraCredits
        .map(
            (credit) => `
                <div class="summary-row">
                    <span>${escapeHtml(credit.description || credit.type_label || 'Credito extra')}</span>
                    <span>${escapeHtml(formatCurrency(credit.amount))}</span>
                </div>
            `,
        )
        .join('');

    const extraDiscountsSummaryHtml = extraDiscounts
        .map(
            (credit) => `
                <div class="summary-row">
                    <span>${escapeHtml(credit.description || credit.type_label || 'Desconto extra')}</span>
                    <span>${escapeHtml(formatCurrency(credit.amount))}</span>
                </div>
            `,
        )
        .join('');

    const detailsHtml = showDetails
        ? `
            <div class="divider"></div>
            <div class="section-title">Adiantamentos</div>
            ${advancesHtml || '<p class="empty">Nenhum adiantamento no periodo.</p>'}
            <div class="divider"></div>
            <div class="section-title">Vale em compras</div>
            ${valesHtml || '<p class="empty">Nenhum vale no periodo.</p>'}
            ${extraCreditsHtml
                ? `
                    <div class="divider"></div>
                    <div class="section-title">Lancamentos extras</div>
                    ${extraCreditsHtml}
                `
                : ''}
            ${extraDiscountsHtml
                ? `
                    <div class="divider"></div>
                    <div class="section-title">Descontos extras</div>
                    ${extraDiscountsHtml}
                `
                : ''}
        `
        : '';

    const unitHtml = `
        <p class="meta">Empresa: ${escapeHtml(unitLabel)}</p>
        <p class="meta">CNPJ: ${escapeHtml(companyCnpj)}</p>
        <p class="meta">Fone: ${escapeHtml(companyPhone)}</p>
    `;

    if (format === 'traditional') {
        const earningRows = [
            {
                code: '001',
                description: 'Salario Base',
                reference: '1,00',
                amount: Number(detail?.salary ?? 0),
            },
            ...extraCredits.map((credit, index) => ({
                code: String(100 + index + 1),
                description: credit.description || credit.type_label || 'Credito extra',
                reference: '1,00',
                amount: Number(credit.amount ?? 0),
            })),
        ];

        const deductionRows = [
            ...advances.map((advance, index) => ({
                code: String(200 + index + 1),
                description: `Adiantamento ${formatBrazilShortDate(advance.advance_date)}`,
                reference: '1,00',
                amount: Number(advance.amount ?? 0),
            })),
            ...vales.map((vale, index) => ({
                code: String(300 + index + 1),
                description: `Vale em compras #${vale.id}`,
                reference: String(Number(vale.items_count ?? 0) || 1),
                amount: Number(vale.total ?? 0),
            })),
            ...extraDiscounts.map((credit, index) => ({
                code: String(400 + index + 1),
                description: credit.description || credit.type_label || 'Desconto',
                reference: '1,00',
                amount: Number(credit.amount ?? 0),
            })),
        ];

        const maxRows = Math.max(earningRows.length, deductionRows.length, 1);
        const tableRowsHtml = Array.from({ length: maxRows }, (_, index) => {
            const earning = earningRows[index];
            const deduction = deductionRows[index];

            return `
                <tr>
                    <td>${escapeHtml(earning?.code ?? '')}</td>
                    <td>${escapeHtml(earning?.description ?? '')}</td>
                    <td class="align-right">${escapeHtml(earning?.reference ?? '')}</td>
                    <td class="align-right">${earning ? escapeHtml(formatCurrency(earning.amount)) : ''}</td>
                    <td>${escapeHtml(deduction?.code ?? '')}</td>
                    <td>${escapeHtml(deduction?.description ?? '')}</td>
                    <td class="align-right">${escapeHtml(deduction?.reference ?? '')}</td>
                    <td class="align-right">${deduction ? escapeHtml(formatCurrency(deduction.amount)) : ''}</td>
                </tr>
            `;
        }).join('');

        const totalEarnings = Number(detail?.salary ?? 0)
            + extraCredits.reduce((total, credit) => total + Number(credit.amount ?? 0), 0);
        const totalDeductions = Number(detail?.advances_total ?? 0)
            + Number(detail?.vales_total ?? 0)
            + extraDiscounts.reduce((total, credit) => total + Number(credit.amount ?? 0), 0);

        return `
            <!DOCTYPE html>
            <html>
                <head>
                    <meta charset="utf-8" />
                    <title>Contra-Cheque PDF - ${escapeHtml(detail?.user_name || '---')}</title>
                    <style>
                        * { box-sizing: border-box; font-family: Arial, Helvetica, sans-serif; }
                        @page { size: A4 portrait; margin: 12mm; }
                        body { margin: 0; padding: 0; background: #f3f4f6; color: #111827; }
                        .page { width: 210mm; min-height: 297mm; margin: 0 auto; background: #ffffff; padding: 12mm; }
                        .title { text-align: center; margin-bottom: 12px; }
                        .title h1 { margin: 0; font-size: 22px; letter-spacing: 0.04em; }
                        .title p { margin: 4px 0 0; font-size: 12px; color: #4b5563; }
                        .company-box, .employee-box, .summary-box { border: 1px solid #111827; margin-bottom: 12px; }
                        .section-header { padding: 8px 10px; font-size: 12px; font-weight: 700; text-transform: uppercase; background: #e5e7eb; border-bottom: 1px solid #111827; }
                        .company-grid, .employee-grid, .summary-grid { display: grid; gap: 0; }
                        .company-grid { grid-template-columns: 2fr 1fr 1fr; }
                        .employee-grid { grid-template-columns: 1.6fr 0.8fr 1fr 0.8fr; }
                        .summary-grid { grid-template-columns: repeat(3, 1fr); }
                        .cell { padding: 8px 10px; border-right: 1px solid #111827; border-bottom: 1px solid #111827; min-height: 54px; }
                        .company-grid .cell:nth-child(3n),
                        .employee-grid .cell:nth-child(4n),
                        .summary-grid .cell:nth-child(3n) { border-right: 0; }
                        .label { display: block; font-size: 10px; font-weight: 700; text-transform: uppercase; color: #4b5563; margin-bottom: 4px; }
                        .value { display: block; font-size: 13px; font-weight: 600; }
                        table { width: 100%; border-collapse: collapse; }
                        th, td { border: 1px solid #111827; padding: 7px 8px; font-size: 12px; }
                        thead th { background: #e5e7eb; text-transform: uppercase; font-size: 10px; letter-spacing: 0.04em; }
                        .subhead th { background: #f9fafb; font-size: 10px; }
                        .align-right { text-align: right; }
                        .totals { margin-top: 12px; border: 1px solid #111827; }
                        .totals-row { display: grid; grid-template-columns: 1fr 1fr 1fr; }
                        .totals-row + .totals-row { border-top: 1px solid #111827; }
                        .totals-cell { padding: 10px 12px; border-right: 1px solid #111827; }
                        .totals-cell:last-child { border-right: 0; }
                        .signature-area { margin-top: 32px; display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
                        .signature-box { padding-top: 24px; border-top: 1px solid #111827; text-align: center; font-size: 12px; }
                        @media print {
                            body { background: #ffffff; }
                            .page { margin: 0; width: auto; min-height: auto; padding: 0; }
                        }
                    </style>
                </head>
                <body>
                    <div class="page">
                        <div class="title">
                            <h1>Contra-Cheque</h1>
                            <p>Demonstrativo de pagamento</p>
                        </div>

                        <div class="company-box">
                            <div class="section-header">Empresa e Competencia</div>
                            <div class="company-grid">
                                <div class="cell">
                                    <span class="label">Empresa / Loja</span>
                                    <span class="value">${escapeHtml(unitLabel)}</span>
                                    <span>${escapeHtml(`CNPJ: ${companyCnpj}`)}</span>
                                </div>
                                <div class="cell">
                                    <span class="label">Endereco / Fone</span>
                                    <span class="value">${escapeHtml(companyAddress)}</span>
                                    <span>${escapeHtml(companyPhone)}</span>
                                </div>
                                <div class="cell">
                                    <span class="label">Competencia / Emissao</span>
                                    <span class="value">${escapeHtml(periodLabel)}</span>
                                    <span>${escapeHtml(printedAt)}</span>
                                </div>
                            </div>
                        </div>

                        <div class="employee-box">
                            <div class="section-header">Identificacao do Colaborador</div>
                            <div class="employee-grid">
                                <div class="cell">
                                    <span class="label">Nome</span>
                                    <span class="value">${escapeHtml(detail?.user_name || '---')}</span>
                                </div>
                                <div class="cell">
                                    <span class="label">Codigo</span>
                                    <span class="value">${escapeHtml(String(detail?.user_id ?? '---'))}</span>
                                </div>
                                <div class="cell">
                                    <span class="label">Funcao</span>
                                    <span class="value">${escapeHtml(detail?.role_label || '---')}</span>
                                </div>
                                <div class="cell">
                                    <span class="label">Salario Base</span>
                                    <span class="value">${escapeHtml(formatCurrency(detail?.salary))}</span>
                                </div>
                            </div>
                        </div>

                        <table>
                            <thead>
                                <tr>
                                    <th colspan="4">Proventos</th>
                                    <th colspan="4">Descontos</th>
                                </tr>
                                <tr class="subhead">
                                    <th>Cod.</th>
                                    <th>Descricao</th>
                                    <th>Ref.</th>
                                    <th>Valor</th>
                                    <th>Cod.</th>
                                    <th>Descricao</th>
                                    <th>Ref.</th>
                                    <th>Valor</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${tableRowsHtml}
                            </tbody>
                        </table>

                        <div class="totals">
                            <div class="totals-row">
                                <div class="totals-cell">
                                    <span class="label">Total de Proventos</span>
                                    <span class="value">${escapeHtml(formatCurrency(totalEarnings))}</span>
                                </div>
                                <div class="totals-cell">
                                    <span class="label">Total de Descontos</span>
                                    <span class="value">${escapeHtml(formatCurrency(totalDeductions))}</span>
                                </div>
                                <div class="totals-cell">
                                    <span class="label">Liquido a Receber</span>
                                    <span class="value">${escapeHtml(formatCurrency(detail?.balance))}</span>
                                </div>
                            </div>
                        </div>

                        <div class="signature-area">
                            <div class="signature-box">Assinatura do colaborador</div>
                            <div class="signature-box">Assinatura do responsavel</div>
                        </div>
                    </div>
                </body>
            </html>
        `;
    }

    return `
        <!DOCTYPE html>
        <html>
            <head>
                <meta charset="utf-8" />
                <title>Contra-Cheque - ${escapeHtml(detail?.user_name || '---')}</title>
                <style>
                    * { box-sizing: border-box; font-family: 'Courier New', monospace; }
                    body { width: 80mm; margin: 0 auto; padding: 10px; color: #111827; }
                    h1, h2 { margin: 0; text-align: center; }
                    h1 { font-size: 16px; }
                    h2 { font-size: 12px; margin-top: 2px; }
                    p, div { font-size: 11px; line-height: 1.35; }
                    .divider { border-top: 1px dashed #000; margin: 8px 0; }
                    .meta { text-align: center; margin: 2px 0; }
                    .summary-row, .record-head { display: flex; justify-content: space-between; gap: 8px; }
                    .summary-row { font-weight: bold; margin: 3px 0; }
                    .record { padding: 5px 0; border-bottom: 1px dashed #d1d5db; }
                    .record-head { font-weight: bold; }
                    .section-title { font-size: 12px; font-weight: bold; text-transform: uppercase; margin: 6px 0; }
                    .empty { text-align: center; padding: 6px 0; }
                </style>
            </head>
            <body>
                <h1>Contra-Cheque</h1>
                <h2>${escapeHtml(detail?.user_name || '---')}</h2>
                <p class="meta">Funcao: ${escapeHtml(detail?.role_label || '---')}</p>
                <p class="meta">Periodo: ${escapeHtml(periodLabel)}</p>
                ${unitHtml}
                <p class="meta">Impresso em: ${escapeHtml(printedAt)}</p>
                <div class="divider"></div>
                <div class="summary-row"><span>Salario</span><span>${escapeHtml(formatCurrency(detail?.salary))}</span></div>
                <div class="summary-row"><span>Creditos extras</span><span>${escapeHtml(formatCurrency(extraCreditsTotal))}</span></div>
                ${extraCreditsSummaryHtml}
                <div class="summary-row"><span>Descontos extras</span><span>${escapeHtml(formatCurrency(extraDiscountsTotal))}</span></div>
                ${extraDiscountsSummaryHtml}
                <div class="summary-row"><span>Adiantamento</span><span>${escapeHtml(formatCurrency(detail?.advances_total))}</span></div>
                <div class="summary-row"><span>Vale em compras</span><span>${escapeHtml(formatCurrency(detail?.vales_total))}</span></div>
                <div class="summary-row"><span>Saldo a receber</span><span>${escapeHtml(formatCurrency(detail?.balance))}</span></div>
                ${detailsHtml}
            </body>
        </html>
    `;
};

export const printContraCheque = (detail, blockedMessage, options = {}) => {
    const isTraditional = options.format === 'traditional';
    const printWindow = window.open(
        '',
        '_blank',
        isTraditional ? 'width=1024,height=900' : 'width=420,height=720',
    );

    if (!printWindow) {
        return blockedMessage;
    }

    printWindow.document.write(buildContraChequeHtml(detail, options));
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    printWindow.close();

    return '';
};

export const printContraChequePdf = (detail, blockedMessage, options = {}) =>
    printContraCheque(detail, blockedMessage, {
        ...options,
        format: 'traditional',
        showDetails: true,
    });
