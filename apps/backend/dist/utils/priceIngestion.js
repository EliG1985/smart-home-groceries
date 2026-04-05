"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runPriceIngestion = void 0;
const supabaseClient_1 = require("./supabaseClient");
const BARCODE_PATTERN = /^\d{8,14}$/;
const normalizeString = (value) => {
    if (typeof value !== 'string') {
        return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
};
const normalizeNumber = (value) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    if (typeof value !== 'string') {
        return undefined;
    }
    const cleaned = value.replace(/[,_\s]/g, '').trim();
    if (!cleaned) {
        return undefined;
    }
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : undefined;
};
const slugify = (value) => value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'unknown';
const asIsoDate = (value, fallbackIso) => {
    const parsed = normalizeString(value);
    if (!parsed) {
        return fallbackIso;
    }
    const asDate = new Date(parsed);
    if (Number.isNaN(asDate.getTime())) {
        return fallbackIso;
    }
    return asDate.toISOString();
};
const readFirst = (row, keys) => {
    for (const key of keys) {
        if (key in row) {
            return row[key];
        }
    }
    return undefined;
};
const parseCsvLine = (line) => {
    const cells = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
        const char = line[i];
        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i += 1;
            }
            else {
                inQuotes = !inQuotes;
            }
            continue;
        }
        if (char === ',' && !inQuotes) {
            cells.push(current.trim());
            current = '';
            continue;
        }
        current += char;
    }
    cells.push(current.trim());
    return cells;
};
const parsePayloadToRecords = (rawText, sourceUrl) => {
    const trimmed = rawText.trim();
    if (!trimmed) {
        return [];
    }
    if (sourceUrl.toLowerCase().endsWith('.json') || trimmed.startsWith('{') || trimmed.startsWith('[')) {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
            return parsed.filter((entry) => entry && typeof entry === 'object');
        }
        if (parsed && typeof parsed === 'object' && Array.isArray(parsed.rows)) {
            return (parsed.rows ?? []).filter((entry) => entry && typeof entry === 'object');
        }
        return [];
    }
    // Fallback parser for CSV content (comma separated, first row = header).
    const lines = trimmed
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
    if (lines.length <= 1) {
        return [];
    }
    const headers = parseCsvLine(lines[0]).map((header) => header.trim());
    const records = [];
    for (const line of lines.slice(1)) {
        const cells = parseCsvLine(line);
        const row = {};
        headers.forEach((header, index) => {
            row[header] = cells[index] ?? '';
        });
        records.push(row);
    }
    return records;
};
const normalizeRecord = (raw, chainHint, defaultSnapshotAt) => {
    const chainIdFromFile = normalizeString(readFirst(raw, ['chain_id', 'chainId', 'chain', 'chain_code']));
    const chainName = normalizeString(readFirst(raw, ['chain_name', 'chainName', 'chain_label'])) ??
        chainIdFromFile ??
        chainHint;
    const chainId = chainIdFromFile ?? slugify(chainName || chainHint);
    const city = normalizeString(readFirst(raw, ['city', 'city_name', 'store_city'])) ?? '';
    const storeIdFromFile = normalizeString(readFirst(raw, ['store_id', 'storeId', 'branch_id', 'branchId']));
    const storeName = normalizeString(readFirst(raw, ['store_name', 'storeName', 'branch_name', 'branchName'])) ??
        storeIdFromFile ??
        'Unknown Store';
    const storeId = storeIdFromFile ?? slugify(`${chainId}-${city || 'unknown'}-${storeName}`);
    const barcode = normalizeString(readFirst(raw, ['barcode', 'item_code', 'barcode_id']));
    if (!barcode || !BARCODE_PATTERN.test(barcode)) {
        return undefined;
    }
    const productName = normalizeString(readFirst(raw, ['product_name', 'productName', 'item_name', 'description'])) ??
        barcode;
    const price = normalizeNumber(readFirst(raw, ['price', 'item_price', 'unit_price']));
    if (price === undefined || price < 0) {
        return undefined;
    }
    const promoText = normalizeString(readFirst(raw, ['promo_text', 'promoText', 'promotion']));
    const snapshotAt = asIsoDate(readFirst(raw, ['snapshot_at', 'snapshotAt', 'updated_at']), defaultSnapshotAt);
    return {
        chainId,
        chainName,
        storeId,
        storeName,
        city,
        barcode,
        productName,
        price,
        ...(promoText ? { promoText } : {}),
        snapshotAt,
    };
};
const chunkArray = (values, chunkSize) => {
    const chunks = [];
    for (let index = 0; index < values.length; index += chunkSize) {
        chunks.push(values.slice(index, index + chunkSize));
    }
    return chunks;
};
const createIngestionRun = async (sourceUrl, chainId) => {
    const { data, error } = await supabaseClient_1.supabase
        .from('ingestion_runs')
        .insert({ source_url: sourceUrl, chain_id: chainId, status: 'running' })
        .select('id')
        .single();
    if (error || !data?.id) {
        throw new Error(`Failed to create ingestion run: ${error?.message ?? 'missing run id'}`);
    }
    return String(data.id);
};
const failRun = async (runId, message) => {
    await supabaseClient_1.supabase
        .from('ingestion_runs')
        .update({
        status: 'failed',
        error_message: message,
        finished_at: new Date().toISOString(),
    })
        .eq('id', runId);
};
const completeRun = async (runId, rowsImported) => {
    const { error } = await supabaseClient_1.supabase
        .from('ingestion_runs')
        .update({
        status: 'success',
        rows_imported: rowsImported,
        finished_at: new Date().toISOString(),
    })
        .eq('id', runId);
    if (error) {
        throw new Error(`Failed to mark ingestion run successful: ${error.message}`);
    }
};
const runPriceIngestion = async (options) => {
    const sourceUrl = normalizeString(options.sourceUrl);
    if (!sourceUrl) {
        throw new Error('sourceUrl is required');
    }
    const chainIdHint = normalizeString(options.chainId) ?? 'all';
    const defaultSnapshotAt = asIsoDate(options.defaultSnapshotAt, new Date().toISOString());
    const response = await fetch(sourceUrl);
    if (!response.ok) {
        throw new Error(`Failed to fetch source file: HTTP ${response.status}`);
    }
    const rawText = await response.text();
    const records = parsePayloadToRecords(rawText, sourceUrl);
    const limitedRecords = options.maxRows && options.maxRows > 0 ? records.slice(0, options.maxRows) : records;
    const normalizedRows = limitedRecords
        .map((row) => normalizeRecord(row, chainIdHint, defaultSnapshotAt))
        .filter((row) => Boolean(row));
    const skippedRows = limitedRecords.length - normalizedRows.length;
    if (options.dryRun) {
        return {
            sourceUrl,
            chainId: chainIdHint,
            dryRun: true,
            fetchedRows: records.length,
            normalizedRows: normalizedRows.length,
            importedRows: 0,
            skippedRows,
        };
    }
    if (normalizedRows.length === 0) {
        throw new Error('No valid rows found in source payload. Nothing to import.');
    }
    const runId = await createIngestionRun(sourceUrl, chainIdHint);
    try {
        const chains = Array.from(new Map(normalizedRows.map((row) => [row.chainId, { chain_id: row.chainId, chain_name: row.chainName }])).values());
        const stores = Array.from(new Map(normalizedRows.map((row) => [
            row.storeId,
            {
                store_id: row.storeId,
                chain_id: row.chainId,
                store_name: row.storeName,
                city: row.city,
            },
        ])).values());
        const snapshots = normalizedRows.map((row) => ({
            run_id: runId,
            chain_id: row.chainId,
            store_id: row.storeId,
            barcode: row.barcode,
            product_name: row.productName,
            price: row.price,
            currency: 'ILS',
            promo_text: row.promoText ?? null,
            snapshot_at: row.snapshotAt,
        }));
        const { error: chainError } = await supabaseClient_1.supabase
            .from('chain_master')
            .upsert(chains, { onConflict: 'chain_id' });
        if (chainError) {
            throw new Error(`Failed to upsert chain_master: ${chainError.message}`);
        }
        const { error: storeError } = await supabaseClient_1.supabase
            .from('store_master')
            .upsert(stores, { onConflict: 'store_id' });
        if (storeError) {
            throw new Error(`Failed to upsert store_master: ${storeError.message}`);
        }
        for (const chunk of chunkArray(snapshots, 500)) {
            const { error: snapshotError } = await supabaseClient_1.supabase.from('price_snapshot').insert(chunk);
            if (snapshotError) {
                throw new Error(`Failed to insert price_snapshot rows: ${snapshotError.message}`);
            }
        }
        await completeRun(runId, snapshots.length);
        return {
            runId,
            sourceUrl,
            chainId: chainIdHint,
            dryRun: false,
            fetchedRows: records.length,
            normalizedRows: normalizedRows.length,
            importedRows: snapshots.length,
            skippedRows,
        };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown ingestion error';
        await failRun(runId, message);
        throw error;
    }
};
exports.runPriceIngestion = runPriceIngestion;
