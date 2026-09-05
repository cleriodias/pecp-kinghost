import { formatBrazilDateTime } from '@/Utils/date';

export const RECEIPT_PAYMENT_LABELS = {
    dinheiro: 'Dinheiro',
    cartao_credito: 'Cartao credito',
    cartao_debito: 'Cartao debito',
    dinheiro_cartao_credito: 'Dinheiro + Cartao credito',
    dinheiro_cartao_debito: 'Dinheiro + Cartao debito',
    dinheiro_pix: 'Dinheiro + Pix',
    maquina: 'Maquina',
    vale: 'Vale',
    refeicao: 'Refeicao',
    faturar: 'Faturar',
};

const hasReceiptValue = (value) =>
    value !== null && value !== undefined && String(value).trim() !== '';

export const formatReceiptCurrency = (value) =>
    Number(value ?? 0).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });

export const formatReceiptDateTime = (value) => {
    if (!value) {
        return '--';
    }

    return formatBrazilDateTime(value);
};

export const resolveReceiptId = (receipt) => {
    const candidate = receipt?.id ?? receipt?.payment?.id ?? null;

    return hasReceiptValue(candidate) ? String(candidate).trim() : null;
};

export const resolveReceiptComanda = (receipt) => {
    if (hasReceiptValue(receipt?.comanda)) {
        return String(receipt.comanda).trim();
    }

    const items = Array.isArray(receipt?.items) ? receipt.items : [];
    const comandas = [...new Set(
        items
            .map((item) => item?.comanda)
            .filter(hasReceiptValue)
            .map((value) => String(value).trim()),
    )];

    return comandas.length > 0 ? comandas.join(', ') : null;
};

const escapeReceiptHtml = (value) =>
    String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');

const formatFiscalQuantity = (value) => {
    const numericValue = Number(value ?? 0);

    if (Number.isInteger(numericValue)) {
        return numericValue.toLocaleString('pt-BR');
    }

    return numericValue.toLocaleString('pt-BR', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 3,
    });
};

export const buildReceiptHtml = (receipt) => {
    const receiptId = resolveReceiptId(receipt);
    const receiptComanda = resolveReceiptComanda(receipt);
    const paymentLabel = RECEIPT_PAYMENT_LABELS[receipt?.tipo_pago] ?? receipt?.tipo_pago;
    const unitInfoHtml = `
        ${receipt?.unit_address ? `<p>Endereco: ${receipt.unit_address}</p>` : ''}
        ${receipt?.unit_cnpj ? `<p>CNPJ: ${receipt.unit_cnpj}</p>` : ''}
    `;

    const itemsHtml = (receipt?.items || [])
        .map(
            (item) => `
                <div class="items-row">
                    <span>${item.quantity}x ${item.product_name}</span>
                    <span>${formatReceiptCurrency(item.unit_price)}</span>
                </div>
                <div class="items-row items-row-subtotal">
                    <span>Subtotal</span>
                    <span>${formatReceiptCurrency(item.subtotal)}</span>
                </div>
            `,
        )
        .join('');

    const paymentHtml = receipt?.payment
        ? `
                ${paymentLabel ? `<p>Pagamento: ${paymentLabel}</p>` : ''}
                ${
                    receipt.payment.valor_pago !== null
                        ? `<p>Pago em dinheiro: ${formatReceiptCurrency(receipt.payment.valor_pago)}</p>`
                        : ''
                }
                <p>Troco: ${formatReceiptCurrency(receipt.payment.troco ?? 0)}</p>
                ${
                    Number(receipt.payment.dois_pgto ?? 0) > 0
                        ? `<p>${receipt?.tipo_pago === 'dinheiro_pix' ? 'Pix' : 'Cartao'} (compl.): ${formatReceiptCurrency(receipt.payment.dois_pgto)}</p>`
                        : ''
                }
            `
        : paymentLabel
            ? `<p>Pagamento: ${paymentLabel}</p>`
            : '';

    return `
        <!DOCTYPE html>
        <html>
            <head>
                <meta charset="utf-8" />
                <title>${receiptId ? `Cupom #${receiptId}` : 'Cupom'}</title>
                <style>
                    * { font-family: 'Courier New', monospace; box-sizing: border-box; }
                    body { width: 80mm; margin: 0 auto; padding: 12px; }
                    h1 { text-align: center; font-size: 16px; margin: 0 0 10px 0; }
                    p { font-size: 12px; margin: 4px 0; }
                    .divider { border-top: 1px dashed #000; margin: 10px 0; }
                    .items-row { display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 12px; }
                    .items-row-subtotal { font-style: italic; }
                    .total { font-size: 14px; font-weight: bold; text-align: right; margin-top: 10px; }
                </style>
            </head>
            <body>
                <h1>${receipt?.unit_name || 'Cupom'}</h1>
                ${unitInfoHtml}
                ${receiptId ? `<p>Cupom: #${receiptId}</p>` : ''}
                ${receiptComanda ? `<p>Comanda: #${receiptComanda}</p>` : ''}
                <p>Caixa: ${receipt?.cashier_name || '---'}</p>
                ${
                    receipt?.vale_user_name
                        ? `<p>Vale: ${receipt.vale_user_name}${
                              receipt.vale_type === 'refeicao' ? ' (Refeicao)' : ''
                          }</p>`
                        : ''
                }
                <p>Data: ${formatReceiptDateTime(receipt?.date_time)}</p>
                <div class="divider"></div>
                ${itemsHtml}
                <div class="divider"></div>
                ${paymentHtml}
                <div class="total">Total: ${formatReceiptCurrency(receipt?.total)}</div>
                <p style="text-align:center;margin-top:12px;">Obrigado pela preferencia</p>
            </body>
        </html>
    `;
};

export const buildFiscalReceiptHtml = (receipt) => {
    const title = escapeReceiptHtml(receipt?.title || 'DANFE NFC-e');
    const subtitle = escapeReceiptHtml(receipt?.subtitle || '');
    const consumerType = String(receipt?.consumer_type ?? 'balcao').trim();
    const emitterName = escapeReceiptHtml(receipt?.emitter_name || 'EMITENTE NAO INFORMADO');
    const emitterLegalName = receipt?.emitter_legal_name
        ? `<p class="muted">${escapeReceiptHtml(receipt.emitter_legal_name)}</p>`
        : '';
    const emitterDocument = receipt?.emitter_document
        ? `<p>CNPJ: ${escapeReceiptHtml(receipt.emitter_document)}</p>`
        : '';
    const emitterIe = receipt?.emitter_ie
        ? `<p>IE: ${escapeReceiptHtml(receipt.emitter_ie)}</p>`
        : '';
    const emitterAddress = receipt?.emitter_address
        ? `<p>${escapeReceiptHtml(receipt.emitter_address)}</p>`
        : '';
    const consumerDocument = receipt?.consumer_document
        ? `<p>Documento: ${escapeReceiptHtml(receipt.consumer_document)}</p>`
        : '';
    const consumerAddress = receipt?.consumer_address
        ? `<p>${escapeReceiptHtml(receipt.consumer_address)}</p>`
        : '';
    const consumerTypeLabel = consumerType === 'cupom_fiscal'
        ? 'Cupom Fiscal'
        : (consumerType === 'consumidor' ? 'NF Consumidor' : 'NF Balcao');
    const accessKey = receipt?.access_key ? escapeReceiptHtml(receipt.access_key) : '';
    const consultationUrl = receipt?.consulta_url ? escapeReceiptHtml(receipt.consulta_url) : '';
    const qrCodeData = String(receipt?.qr_code_data ?? '').trim();
    const qrCodeImageUrl = qrCodeData !== ''
        ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(qrCodeData)}`
        : '';
    const previewWarning = receipt?.is_preview
        ? `
            <div class="warning-box">
                <strong>Documento fiscal em preparo</strong>
                <span>Status: ${escapeReceiptHtml(receipt?.status || 'pendente')}</span>
                <span>${escapeReceiptHtml(receipt?.status_message || 'Ainda sem autorizacao definitiva da SEFAZ.')}</span>
            </div>
        `
        : '';
    const protocolBlock = receipt?.protocol
        ? `<p>Protocolo: ${escapeReceiptHtml(receipt.protocol)}</p>`
        : '';
    const receiptBlock = receipt?.receipt
        ? `<p>Recibo: ${escapeReceiptHtml(receipt.receipt)}</p>`
        : '';
    const itemsHtml = (receipt?.items || [])
        .map(
            (item) => `
                <div class="item-row">
                    <div class="item-name">${escapeReceiptHtml(item.product_name)}</div>
                    <div class="item-meta">
                        <span>${formatFiscalQuantity(item.quantity)} x ${formatReceiptCurrency(item.unit_price)}</span>
                        <strong>${formatReceiptCurrency(item.subtotal)}</strong>
                    </div>
                </div>
            `,
        )
        .join('');

    return `
        <!DOCTYPE html>
        <html>
            <head>
                <meta charset="utf-8" />
                <title>${title}</title>
                <style>
                    * { box-sizing: border-box; font-family: 'Courier New', monospace; }
                    html, body { margin: 0; padding: 0; background: #fff; color: #000; }
                    body { width: 80mm; margin: 0 auto; padding: 10px 8px 16px; }
                    h1 { margin: 0; font-size: 15px; text-align: center; font-weight: 700; }
                    h2 { margin: 0; font-size: 12px; text-align: center; font-weight: 700; }
                    p { margin: 2px 0; font-size: 11px; line-height: 1.35; word-break: break-word; }
                    .muted { font-size: 10px; }
                    .center { text-align: center; }
                    .divider { border-top: 1px dashed #000; margin: 8px 0; }
                    .section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; margin-bottom: 4px; }
                    .warning-box {
                        border: 1px dashed #000;
                        padding: 6px;
                        display: flex;
                        flex-direction: column;
                        gap: 2px;
                        font-size: 10px;
                        margin-bottom: 8px;
                    }
                    .item-row { padding: 4px 0; border-bottom: 1px dotted #bbb; }
                    .item-name { font-size: 11px; font-weight: 700; }
                    .item-meta {
                        display: flex;
                        justify-content: space-between;
                        gap: 8px;
                        font-size: 10px;
                        margin-top: 2px;
                    }
                    .summary-row {
                        display: flex;
                        justify-content: space-between;
                        gap: 8px;
                        font-size: 11px;
                        margin: 2px 0;
                    }
                    .summary-row.total { font-size: 14px; font-weight: 700; margin-top: 6px; }
                    .access-key {
                        font-size: 10px;
                        line-height: 1.4;
                        text-align: center;
                        word-break: break-all;
                    }
                    .qr-wrapper { display: flex; flex-direction: column; align-items: center; gap: 6px; }
                    .qr-wrapper img { width: 42mm; height: 42mm; object-fit: contain; }
                    .footer-note { font-size: 10px; text-align: center; margin-top: 10px; }
                </style>
            </head>
            <body>
                <div class="center">
                    <h1>${title}</h1>
                    ${subtitle ? `<h2>${subtitle}</h2>` : ''}
                </div>
                <div class="divider"></div>
                ${previewWarning}
                <div class="center">
                    <p><strong>${emitterName}</strong></p>
                    ${emitterLegalName}
                    ${emitterDocument}
                    ${emitterIe}
                    ${emitterAddress}
                </div>
                <div class="divider"></div>
                <p><strong>${escapeReceiptHtml(receipt?.model_label || 'NFC-e')}</strong> ${escapeReceiptHtml(receipt?.serie || '--')}/${escapeReceiptHtml(receipt?.number || '--')}</p>
                <p>Venda: #${escapeReceiptHtml(receipt?.payment_id || '--')}</p>
                <p>Ambiente: ${escapeReceiptHtml(receipt?.environment || '--')}</p>
                <p>Data: ${escapeReceiptHtml(formatReceiptDateTime(receipt?.issued_at))}</p>
                <p>Tipo: ${escapeReceiptHtml(consumerTypeLabel)}</p>
                <p>Consumidor: ${escapeReceiptHtml(receipt?.consumer_name || 'CONSUMIDOR NAO IDENTIFICADO')}</p>
                ${consumerDocument}
                ${consumerAddress}
                <div class="divider"></div>
                <div class="section-title">Itens</div>
                ${itemsHtml || '<p>Nenhum item fiscal disponivel para impressao.</p>'}
                <div class="divider"></div>
                <div class="summary-row"><span>Pagamento</span><strong>${escapeReceiptHtml(receipt?.payment_label || '--')}</strong></div>
                ${
                    receipt?.amount_paid !== null && receipt?.amount_paid !== undefined
                        ? `<div class="summary-row"><span>Valor pago</span><strong>${formatReceiptCurrency(receipt.amount_paid)}</strong></div>`
                        : ''
                }
                ${
                    Number(receipt?.additional_payment ?? 0) > 0
                        ? `<div class="summary-row"><span>Pagamento compl.</span><strong>${formatReceiptCurrency(receipt.additional_payment)}</strong></div>`
                        : ''
                }
                ${
                    Number(receipt?.change ?? 0) > 0
                        ? `<div class="summary-row"><span>Troco</span><strong>${formatReceiptCurrency(receipt.change)}</strong></div>`
                        : ''
                }
                <div class="summary-row total"><span>Total</span><strong>${formatReceiptCurrency(receipt?.total)}</strong></div>
                <div class="divider"></div>
                ${protocolBlock}
                ${receiptBlock}
                ${accessKey ? `<p class="section-title center">Chave de acesso</p><p class="access-key">${accessKey}</p>` : ''}
                ${
                    qrCodeImageUrl
                        ? `
                            <div class="divider"></div>
                            <div class="qr-wrapper">
                                <img id="qrCodeImage" src="${qrCodeImageUrl}" alt="QR Code NFC-e" />
                                <p class="center">Consulte pela chave ou QR Code</p>
                                ${consultationUrl ? `<p class="center muted">${consultationUrl}</p>` : ''}
                            </div>
                        `
                        : ''
                }
                <p class="footer-note">
                    ${receipt?.is_preview ? 'Previa fiscal gerada pelo sistema.' : 'Documento auxiliar para consulta do consumidor.'}
                </p>
                <script>
                    (function () {
                        const image = document.getElementById('qrCodeImage');
                        let printed = false;
                        const printNow = () => {
                            if (printed) {
                                return;
                            }
                            printed = true;
                            window.focus();
                            window.print();
                        };

                        if (image) {
                            image.addEventListener('load', () => window.setTimeout(printNow, 250), { once: true });
                            image.addEventListener('error', () => window.setTimeout(printNow, 250), { once: true });
                            window.setTimeout(printNow, 1800);
                            return;
                        }

                        window.setTimeout(printNow, 250);
                    }());
                </script>
            </body>
        </html>
    `;
};
