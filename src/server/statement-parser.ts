// Bank statement parser — extracts normalized transactions from
// PDF text, Excel (XLSX/XLS) and CSV bank statements.
//
// Handles the standard Indian bank statement layout:
//   header block → summary strip → table header (Date | Value Date |
//   Transaction ID | Channel | Particulars | ... | Debit | Credit | Balance)
//   → transaction rows → totals rows
// Falls back to row-scanning heuristics for non-standard layouts.

export interface ParsedTransaction {
    date: string;          // YYYY-MM-DD (or '' if unparseable)
    description: string;   // "Merchant — note" (newlines collapsed)
    category: string;      // bank's own category label (may be '' for PDFs)
    type: 'expense' | 'income';
    amount: number;        // absolute value
    balance?: number;
}

export interface ParsedStatement {
    accountName?: string;
    accountNumber?: string;
    period?: string;
    transactions: ParsedTransaction[];
    raw?: string;
}

export type StatementParseError = { success: false; error: string };

type ParseResult = { success: true; data: ParsedStatement } | StatementParseError;

// --- helpers -----------------------------------------------------------

const normalizeDate = (v: unknown): string => {
    if (v === null || v === undefined || v === '') return '';
    if (v instanceof Date) {
        // cellDates can shift by a day due to TZ; use the local calendar date.
        const y = v.getFullYear();
        const m = String(v.getMonth() + 1).padStart(2, '0');
        const d = String(v.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
    const s = String(v).trim();
    // ISO already
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    // dd-MMM-yyyy / dd MMM yyyy / dd/mm/yyyy / dd-mm-yyyy
    const mdy = s.match(/^(\d{1,2})[\/\-.\s](\d{1,2})[\/\-.\s](\d{2,4})$/);
    if (mdy) {
        const [, a, b, y] = mdy;
        const year = y.length === 2 ? `20${y}` : y;
        // Ambiguous; assume DD-MM-YYYY (Indian convention)
        const month = b.length === 2 && Number(b) <= 12 ? b : a;
        const day = b.length === 2 && Number(b) <= 12 ? a : b;
        const dt = new Date(`${year}-${month}-${day}`);
        return isNaN(dt.getTime()) ? '' : `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
    const mon = s.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$/);
    if (mon) {
        const [, day, monthName, year] = mon;
        const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
        const mi = months.findIndex((m) => monthName.toLowerCase().startsWith(m));
        if (mi >= 0) {
            return `${year}-${String(mi + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }
    }
    const dt = new Date(s);
    if (!isNaN(dt.getTime())) {
        const y = dt.getFullYear();
        const m = String(dt.getMonth() + 1).padStart(2, '0');
        const d = String(dt.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
    return '';
};

const toNumber = (v: unknown): number | null => {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    let s = String(v).trim();
    // "₹1,84,320.92", "1,84,320.92", "1 84 320,92" (EU) — strip currency + commas
    const neg = s.startsWith('-') || /^\(.*\)$/.test(s);
    s = s.replace(/[^\d.,\-]/g, '').replace(/,/g, '').replace(/\.$/, '');
    if (!s) return null;
    const n = parseFloat(s);
    if (isNaN(n)) return null;
    return neg && n > 0 ? -n : n;
};

const cleanText = (v: unknown): string =>
    String(v ?? '').replace(/\s+/g, ' ').trim();

// --- table extraction ----------------------------------------------------

const HEADER_TOKENS = ['debit', 'credit', 'balance', 'particular', 'transaction', 'withdrawal', 'deposit', 'amount'];

const looksLikeHeader = (row: string[]): boolean => {
    const lower = row.map((c) => c.toLowerCase());
    // Must have a date-ish column AND money-ish columns (avoids summary rows
    // like "Opening Balance | ₹ 1,84,320.92 | Total Debit ...").
    const hasDate = lower.some((c) => /date|txn|transaction/.test(c));
    if (!hasDate) return false;
    const joined = lower.join('|');
    return HEADER_TOKENS.filter((t) => joined.includes(t)).length >= 3;
};

// Find the column layout given a header row (returns index or -1).
const findCols = (header: string[]): { date: number; desc: number; debit: number; credit: number; balance: number } => {
    const lower = header.map((c) => c.toLowerCase());
    const find = (tokens: string[]): number =>
        lower.findIndex((c) => tokens.some((t) => c.includes(t)));
    const date = find(['date', 'txn date', 'transaction date']);
    const desc = find(['particular', 'description', 'narrative', 'details', 'merchant', 'memo']);
    const debit = find(['debit', 'withdrawal', 'withdrawals', 'dr', 'amount out']);
    const credit = find(['credit', 'deposit', 'deposits', 'cr', 'amount in']);
    const balance = find(['balance', 'closing']);
    return { date, desc, debit, credit, balance };
};

const cell = (row: string[], i: number): string => (i >= 0 && i < row.length ? row[i] : '');

const parseTable = (headerIdx: number, rows: string[][]): ParsedTransaction[] => {
    const cols = findCols(rows[headerIdx]);
    const out: ParsedTransaction[] = [];
    let skipping = 0;

    for (let i = headerIdx + 1; i < rows.length; i++) {
        const row = rows[i];
        if (row.length === 0 || row.every((c) => !String(c).trim())) continue;

        const d = normalizeDate(cell(row, cols.date));
        const debit = cols.debit >= 0 ? toNumber(cell(row, cols.debit)) : null;
        const credit = cols.credit >= 0 ? toNumber(cell(row, cols.credit)) : null;
        const balance = cols.balance >= 0 ? toNumber(cell(row, cols.balance)) : null;

        // skip continuation/indent rows (no date, no amount)
        if (!d && debit === null && credit === null && balance === null) continue;

        // total/closing rows — skip, and don't let them reset the "skipping" window
        const joined = row.join(' ').toLowerCase();
        if (/(total|closing|opening|carried|brought|balance)/.test(joined) && debit === null && credit === null) {
            skipping = 3;
            continue;
        }
        if (skipping > 0) {
            skipping--;
            continue;
        }

        if (debit !== null && debit > 0) {
            out.push({ date: d, description: cleanText(cell(row, cols.desc)), category: '', type: 'expense', amount: Math.abs(debit), balance: balance ?? undefined });
        } else if (credit !== null && credit > 0) {
            out.push({ date: d, description: cleanText(cell(row, cols.desc)), category: '', type: 'income', amount: Math.abs(credit), balance: balance ?? undefined });
        } else if (d) {
            // no debit/credit columns found — fall back to single amount column
            const amt = row.map(toNumber).find((n): n is number => n !== null && n > 0);
            if (amt !== null && amt !== undefined) {
                out.push({ date: d, description: cleanText(cell(row, cols.desc)), category: '', type: 'expense', amount: amt, balance: undefined });
            }
        }
    }
    return out;
};

// --- PDF text scanning ---------------------------------------------------
//
// PDF text extraction produces wrapped fragments (column order lost). Most
// Indian bank PDFs still anchor each transaction with "dd Mmm yyyy ... txnid"
// on one line, followed by merchant/note lines and a line ending with the
// amount(s): "₹123.00 ₹177,897.92" (debit+balance) or "₹300.00" (credit).
// We accumulate lines until an amount line is found, then emit the record.

const TXN_ANCHOR = /^(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})\s+(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})\s+([A-Z]{2,6}\d{8,})/;
const AMOUNT_LINE = /(?:₹\s?[\d,]+\.\d{2})/g;

export const parseStatementPdfText = (text: string): ParseResult => {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

    const transactions: ParsedTransaction[] = [];
    let pending: ParsedTransaction | null = null;

    const finish = () => {
        if (pending && pending.description) {
            transactions.push(pending);
        }
        pending = null;
    };

    // Drop fragments that belong to the anchor row (txn-id tail, channel).
    const cleanFragment = (s: string): boolean =>
        !/^[A-Z]{2,6}\d{8,}$/.test(s) &&        // txn id tail
        !/^(UPI|NEFT|IMPS|RTGS|NETB|ATMC|POS)$/i.test(s) &&  // channel
        !/^\d{4,}$/.test(s);                    // stray numeric fragment

    for (const line of lines) {
        const m = line.match(TXN_ANCHOR);
        if (m) {
            finish();
            pending = { date: normalizeDate(m[1]), description: '', category: '', type: 'expense', amount: 0 };
            continue;
        }

        if (!pending) continue;

        // Amount line: ends the pending transaction. The LAST ₹ value is the
        // running balance; if two+ values, the FIRST is the txn amount.
        const amounts = line.match(AMOUNT_LINE);
        if (amounts && amounts.length > 0) {
            const nums = amounts.map((a) => parseFloat(a.replace(/[^\d.]/g, '')));
            pending.amount = nums[0] ?? 0;
            pending.balance = nums.length >= 2 ? nums[nums.length - 1] : undefined;
            pending.description = pending.description
                .split(' ')
                .filter(cleanFragment)
                .join(' ')
                .replace(/₹[\d,.]+/g, '')
                .trim();
            finish();
            continue;
        }

        const lower = line.toLowerCase();
        // Skip boilerplate / headers / totals / page markers / disclaimer.
        if (/(^| )(date|value date|transaction id|chnl|particulars|ref no|debit \(₹\)|credit \(₹\)|balance \(₹\)|totals|closing|opening|disclaimer|transactions may|in case|hdfc bank|statement of account|page \d+ of|-- \d+ of \d+ --)/.test(lower)) continue;
        // Split-anchor fragments: "000 NETB" / "4 UPI Vipin..." — the leading
        // digits + channel are leftovers of the anchor row.
        const frag = line.match(/^(\d{1,})\s+(UPI|NEFT|IMPS|RTGS|NETB|ATMC|POS)\s*(.*)$/i);
        if (frag) {
            const rest = frag[3].trim();
            if (rest) {
                pending.description = pending.description
                    ? `${pending.description} ${rest}`
                    : rest;
            }
            continue;
        }
        // A bare "000"-style digit tail from the split anchor.
        if (/^\d{2,}$/.test(line)) continue;
        pending.description = pending.description
            ? `${pending.description} ${line}`
            : line;
    }
    finish();

    if (transactions.length === 0) {
        return { success: false, error: 'No transactions found in statement. Is this a bank statement?' };
    }

    return { success: true, data: { transactions } };
};

export const parseStatementRows = (rows: string[][]): ParseResult => {
    const cleaned = rows
        .map((r) => (Array.isArray(r) ? r : [String(r)]).map((c) => (c === null || c === undefined ? '' : String(c))))
        .filter((r) => r.some((c) => c.trim() !== ''));

    if (cleaned.length === 0) return { success: false, error: 'Statement is empty' };

    const headerIdx = cleaned.findIndex(looksLikeHeader);
    let transactions: ParsedTransaction[] = [];
    if (headerIdx >= 0) {
        transactions = parseTable(headerIdx, cleaned);
    } else {
        // Raw fallback: every row with a date + amount is a transaction.
        transactions = cleaned
            .map((row): ParsedTransaction | null => {
                const d = normalizeDate(row[0] ?? '') || normalizeDate(row[1] ?? '');
                const amt = row.map(toNumber).find((n): n is number => n !== null && n > 0);
                if (!d || amt === undefined || amt === null) return null;
                return { date: d, description: cleanText(row.slice(1).join(' ')), category: '', type: 'expense', amount: amt };
            })
            .filter((t): t is ParsedTransaction => t !== null);
    }

    if (transactions.length === 0) {
        return { success: false, error: 'No transactions found in statement. Is this a bank statement?' };
    }

    // Account metadata from the header block.
    const headerBlock = cleaned.slice(0, Math.max(0, headerIdx)).join(' ');
    const acctNo = headerBlock.match(/account\s*(?:no|number)[:.\s]*([\d\s]{6,})/i)?.[1]?.replace(/\s+/g, '') || '';
    const acctName = headerBlock.match(/customer\s*:?\s*([A-Z][A-Z\s]{2,})/i)?.[1]?.trim() || '';
    const period = headerBlock.match(/period\s*:?\s*([\d\sA-Za-z\-–—]+?)(?:\||$)/i)?.[1]?.trim() || '';

    return {
        success: true,
        data: { accountName: acctName, accountNumber: acctNo, period, transactions },
    };
};

export const parseStatementText = (text: string): ParseResult =>
    parseStatementRows(text.split('\n').map((l) => [l]));

export const parseStatementCsv = (text: string): ParseResult =>
    parseStatementRows(
        text
            .trim()
            .split(/\r?\n/)
            .map((line) => {
                const cells: string[] = [];
                let cur = '';
                let inQ = false;
                for (let i = 0; i < line.length; i++) {
                    const ch = line[i];
                    if (ch === '"') {
                        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
                        else inQ = !inQ;
                    } else if (ch === ',' && !inQ) {
                        cells.push(cur); cur = '';
                    } else cur += ch;
                }
                cells.push(cur);
                return cells;
            })
    );
