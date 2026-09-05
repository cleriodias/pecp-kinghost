import { formatBrazilDateTime, formatBrazilShortDate } from "@/Utils/date";

const formatCurrency = (value) =>
    Number(value ?? 0).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
    });

const escapeHtml = (value) =>
    String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

export const buildSalaryAdvancePrintHtml = (detail) => {
    const printedAt = formatBrazilDateTime(new Date());
    const periodLabel = `${formatBrazilShortDate(detail?.start_date)} a ${formatBrazilShortDate(detail?.end_date)}`;
    const rowsHtml = (detail?.records || [])
        .map(
            (record) => `
                <div class="record">
                    <div class="record-head">
                        <span>${escapeHtml(formatBrazilShortDate(record.advance_date))}</span>
                        <span>${escapeHtml(formatCurrency(record.amount))}</span>
                    </div>
                    <p>Loja: ${escapeHtml(record.unit_name || "---")}</p>
                    <p>Obs.: ${escapeHtml(record.reason || "--")}</p>
                </div>
            `,
        )
        .join("");

    return `
        <!DOCTYPE html>
        <html>
            <head>
                <meta charset="utf-8" />
                <title>Adiantamentos - ${escapeHtml(detail?.user_name || "---")}</title>
                <style>
                    * { font-family: "Courier New", monospace; box-sizing: border-box; }
                    body { width: 80mm; margin: 0 auto; padding: 12px; color: #111827; }
                    h1 { margin: 0; text-align: center; font-size: 16px; }
                    p { margin: 4px 0; font-size: 12px; }
                    .divider { border-top: 1px dashed #000; margin: 10px 0; }
                    .meta { text-align: center; }
                    .record { padding: 6px 0; border-bottom: 1px dashed #d1d5db; }
                    .record-head { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; font-weight: bold; }
                    .total { display: flex; justify-content: space-between; gap: 8px; font-size: 14px; font-weight: bold; }
                </style>
            </head>
            <body>
                <h1>Adiantamentos</h1>
                <p class="meta">Funcionario: ${escapeHtml(detail?.user_name || "---")}</p>
                <p class="meta">Periodo: ${escapeHtml(periodLabel)}</p>
                <p class="meta">Registros: ${escapeHtml(detail?.records_count ?? 0)}</p>
                <p class="meta">Impresso em: ${escapeHtml(printedAt)}</p>
                <div class="divider"></div>
                ${rowsHtml || "<p>Nenhum registro para imprimir.</p>"}
                <div class="divider"></div>
                <div class="total">
                    <span>Total</span>
                    <span>${escapeHtml(formatCurrency(detail?.total_amount))}</span>
                </div>
            </body>
        </html>
    `;
};

export const printSalaryAdvanceDetail = (detail, blockedMessage) => {
    const printWindow = window.open("", "_blank", "width=400,height=600");

    if (!printWindow) {
        return blockedMessage;
    }

    printWindow.document.write(buildSalaryAdvancePrintHtml(detail));
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    printWindow.close();

    return "";
};
