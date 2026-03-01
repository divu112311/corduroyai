import React, { createContext, useContext, useState, useRef, useCallback } from 'react';
import {
  classifyProduct,
  type FileMetadata,
} from './supabaseFunctions';
import { supabase } from './supabase';
import { getUserMetadata } from './userService';
import {
  createClassificationRun,
  saveProduct,
  saveClassificationResult,
  updateClassificationRunStatus,
  getBulkRunResults,
  checkDuplicateRun,
  type RerunProduct,
} from './classificationService';

// ── CSV parsing ──────────────────────────────────────────────────────────────

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else current += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { result.push(current.trim()); current = ''; }
      else current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const clean = text.replace(/^\uFEFF/, '');
  const lines = clean.split(/\r?\n/);
  if (lines.length < 2) return { headers: [], rows: [] };

  const headers = parseCSVLine(lines[0]);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseCSVLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = values[idx] || ''; });
    rows.push(row);
  }
  return { headers, rows };
}

// ── Column detection ─────────────────────────────────────────────────────────

const COLUMN_SYNONYMS: Record<string, string[]> = {
  product_name: ['product', 'product name', 'product_name', 'item', 'item name', 'name', 'sku', 'sku name', 'part', 'part name', 'article'],
  description:  ['description', 'desc', 'product description', 'details', 'product details', 'item description'],
  origin:       ['origin', 'country', 'country of origin', 'coo', 'source', 'made in', 'country_of_origin'],
  materials:    ['material', 'materials', 'fabric', 'composition', 'material composition', 'component'],
  cost:         ['cost', 'value', 'price', 'unit value', 'unit_value', 'unit cost', 'unit price', 'fob', 'declared value'],
};

function detectColumns(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  const lowerHeaders = headers.map(h => h.toLowerCase().trim());

  for (const [field, synonyms] of Object.entries(COLUMN_SYNONYMS)) {
    for (const syn of synonyms) {
      const idx = lowerHeaders.indexOf(syn);
      if (idx !== -1 && !Object.values(mapping).includes(headers[idx])) {
        mapping[field] = headers[idx];
        break;
      }
    }
  }
  if (!mapping.product_name && headers.length > 0) mapping.product_name = headers[0];
  if (!mapping.description && headers.length > 1 && !Object.values(mapping).includes(headers[1])) {
    mapping.description = headers[1];
  }
  return mapping;
}

// ── Concurrency helper ───────────────────────────────────────────────────────

async function runWithConcurrency(
  tasks: (() => Promise<void>)[],
  limit: number,
  shouldCancel: () => boolean,
): Promise<void> {
  let idx = 0;
  async function worker() {
    while (idx < tasks.length && !shouldCancel()) {
      const i = idx++;
      if (i < tasks.length) await tasks[i]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, () => worker()));
}

// ── Build product description from a CSV row ─────────────────────────────────

function buildProductDescription(
  row: Record<string, string>,
  colMap: Record<string, string>,
): string {
  const parts: string[] = [];
  const productName = colMap.product_name ? row[colMap.product_name] : '';
  const description = colMap.description ? row[colMap.description] : '';
  const origin = colMap.origin ? row[colMap.origin] : '';
  const materials = colMap.materials ? row[colMap.materials] : '';

  if (productName) parts.push(productName);
  if (description && description !== productName) parts.push(description);
  if (materials) parts.push(`Material: ${materials}`);
  if (origin) parts.push(`Country of origin: ${origin}`);

  if (parts.length === 0) {
    return Object.entries(row)
      .filter(([_, v]) => v && v.trim())
      .map(([_, v]) => v.trim())
      .join('. ');
  }
  return parts.join('. ');
}

// ── Retry helper with exponential backoff ─────────────────────────────────────

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 2,
  baseDelay: number = 1000,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, baseDelay * Math.pow(2, attempt)));
      }
    }
  }
  throw lastError;
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface BulkItem {
  id: number | string;
  productName: string;
  description: string;
  status: 'pending' | 'complete' | 'exception';
  hts?: string;
  confidence?: number;
  tariff?: string;
  origin?: string;
  materials?: string;
  cost?: string;
  bulkItemId?: string;
  clarificationQuestions?: Array<{ question: string; options: string[] }> | null;
  error?: string;
  extracted_data?: {
    product_name?: string;
    product_description?: string;
    country_of_origin?: string;
    materials?: string;
    unit_cost?: string;
    [key: string]: any;
  };
  classification_result_id?: string | number;
}

// ── Context ──────────────────────────────────────────────────────────────────

const BULK_RUN_KEY = 'corduroy_bulk_run';

interface BulkClassificationContextValue {
  // State
  items: BulkItem[];
  processing: boolean;
  progressCurrent: number;
  progressTotal: number;
  errorMessage: string | null;
  fileMetadata: FileMetadata | null;
  runId: number | null;
  fileName: string | null;

  // Actions
  startClassification: (file: File, supportingFiles?: File[]) => Promise<void>;
  startRerunClassification: (products: RerunProduct[], fileName: string) => Promise<void>;
  cancelClassification: () => void;
  clearState: () => void;
  setErrorMessage: (msg: string | null) => void;

  // For BulkUpload UI to update items (e.g., exception review approve)
  updateItem: (id: number | string, updates: Partial<BulkItem>) => void;
  updateItems: (updater: (prev: BulkItem[]) => BulkItem[]) => void;
}

const BulkClassificationContext = createContext<BulkClassificationContextValue | null>(null);

export function useBulkClassification() {
  const ctx = useContext(BulkClassificationContext);
  if (!ctx) throw new Error('useBulkClassification must be used within BulkClassificationProvider');
  return ctx;
}

export function BulkClassificationProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<BulkItem[]>([]);
  const [processing, setProcessing] = useState(false);
  const [progressCurrent, setProgressCurrent] = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fileMetadata, setFileMetadata] = useState<FileMetadata | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const cancelledRef = useRef(false);
  const runIdRef = useRef<number | null>(null);
  const classifiedCountRef = useRef(0);

  // ── Core classification task runner (shared between start and rerun) ──────

  const classifyItems = useCallback(async (
    user: { id: string },
    confidenceThreshold: number,
    taskItems: Array<{
      idx: number;
      productName: string;
      description: string;
      origin?: string;
      materials?: string;
      unitCost?: number;
    }>,
  ) => {
    let completed = 0;

    const tasks = taskItems.map((item) => async () => {
      if (cancelledRef.current) return;

      if (!item.description.trim()) {
        completed++;
        setProgressCurrent(completed);
        if (runIdRef.current) {
          try {
            await saveProduct(user.id, runIdRef.current, {
              product_name: item.productName,
              product_description: '',
              country_of_origin: item.origin || undefined,
              materials: item.materials || undefined,
              unit_cost: item.unitCost,
            });
          } catch (e) { console.error('Supabase save error:', e); }
        }
        setItems(prev => prev.map(i =>
          i.id === item.idx + 1
            ? { ...i, status: 'exception' as const, error: 'No product description available' }
            : i
        ));
        return;
      }

      try {
        const result = await retryWithBackoff(
          async () => {
            const res = await classifyProduct(item.description, user.id, confidenceThreshold);
            if (res === null) throw new Error('Classification returned null (edge function or backend error)');
            return res;
          },
          2, 1500,
        ).catch(() => null);

        completed++;
        setProgressCurrent(completed);
        if (cancelledRef.current) return;

        let itemStatus: 'complete' | 'exception' = 'exception';
        let itemHts = '';
        let itemConfidence = 0;
        let itemTariff = '';
        let itemError = '';
        let itemQuestions: Array<{ question: string; options: string[] }> | null = null;
        let rawConfidence = 0;
        let rawTariffRate: number | undefined;
        let topRuleForSave: any = null;

        if (!result) {
          itemError = 'Classification returned no result';
        } else if (result.type === 'clarify' || result.needs_clarification) {
          itemQuestions = (result.clarifications || result.questions || []).map((c: any) => ({
            question: typeof c === 'string' ? c : c.question || c,
            options: typeof c === 'string' ? [] : c.options || [],
          }));
        } else if (result.type === 'exception') {
          const exceptionData = result.data;
          const exceptionRules = exceptionData?.matched_rules || [];
          const topExRule = exceptionRules[0];
          itemHts = topExRule?.hts || '';
          itemConfidence = Math.round((result.confidence || 0) * 100);
          itemError = result.reason || 'Low confidence';
          rawConfidence = result.confidence || 0;
          rawTariffRate = topExRule?.tariff_rate;
          topRuleForSave = topExRule;
        } else {
          let matchedRules: any[] = [];
          if (result.type === 'answer' && result.matches) {
            if (Array.isArray(result.matches)) matchedRules = result.matches;
            else if (result.matches.matched_rules && Array.isArray(result.matches.matched_rules)) matchedRules = result.matches.matched_rules;
          } else if (result.candidates) {
            matchedRules = result.candidates;
          }

          const sortedMatches = [...matchedRules].sort((a: any, b: any) =>
            (b.confidence || b.score || 0) - (a.confidence || a.score || 0)
          );
          const topRule = sortedMatches[0];
          const rawConf = topRule ? (topRule.confidence || topRule.score || 0) : 0;
          const maxConf = rawConf > 0 ? Math.round(rawConf * 100) : Math.round((result.max_confidence || 0) * 100);

          if (!topRule || maxConf === 0) {
            itemError = 'No HTS match found or 0% confidence';
          } else {
            itemStatus = 'complete';
            classifiedCountRef.current++;
            itemHts = topRule.hts || '';
            itemConfidence = maxConf;
            itemTariff = topRule.tariff_rate != null ? `${(topRule.tariff_rate * 100).toFixed(1)}%` : '';
            rawConfidence = rawConf;
            rawTariffRate = topRule.tariff_rate;
            topRuleForSave = topRule;
          }
        }

        // Persist to Supabase
        let classificationResultId: number | undefined;
        if (runIdRef.current) {
          try {
            const productId = await saveProduct(user.id, runIdRef.current, {
              product_name: item.productName,
              product_description: item.description,
              country_of_origin: item.origin || undefined,
              materials: item.materials || undefined,
              unit_cost: item.unitCost,
            });
            if (itemHts || rawConfidence > 0 || result) {
              classificationResultId = await saveClassificationResult(productId, runIdRef.current, {
                hts_classification: itemHts || undefined,
                confidence: rawConfidence || undefined,
                tariff_rate: rawTariffRate,
                description: topRuleForSave?.description || result?.description,
                reasoning: result?.reasoning,
                cbp_rulings: result?.cbp_rulings,
                rule_verification: result?.rule_verification,
                rule_confidence: topRuleForSave?.rule_confidence,
                similarity_score: topRuleForSave?.similarity_score,
              });
            }
          } catch (e) {
            console.error('Supabase save error:', e);
          }
        }

        setItems(prev => prev.map(i => {
          if (i.id !== item.idx + 1) return i;
          return {
            ...i,
            status: itemStatus as 'complete' | 'exception',
            hts: itemHts,
            confidence: itemConfidence,
            tariff: itemTariff,
            error: itemError || undefined,
            clarificationQuestions: itemQuestions,
            classification_result_id: classificationResultId,
          };
        }));
      } catch (err: any) {
        completed++;
        setProgressCurrent(completed);
        const errorMsg = err?.message || String(err);
        console.error(`Error classifying item ${item.idx + 1}:`, errorMsg);
        if (runIdRef.current) {
          try {
            await saveProduct(user.id, runIdRef.current, {
              product_name: item.productName,
              product_description: item.description,
              country_of_origin: item.origin || undefined,
              materials: item.materials || undefined,
              unit_cost: item.unitCost,
            });
          } catch (e) { console.error('Supabase save error:', e); }
        }
        setItems(prev => prev.map(i =>
          i.id === item.idx + 1
            ? { ...i, status: 'exception' as const, error: `Classification failed: ${errorMsg}` }
            : i
        ));
      }
    });

    await runWithConcurrency(tasks, 2, () => cancelledRef.current);

    // Finalize run status
    if (runIdRef.current) {
      try {
        let finalStatus: 'completed' | 'cancelled' | 'failed';
        if (cancelledRef.current) finalStatus = 'cancelled';
        else if (classifiedCountRef.current === 0) finalStatus = 'failed';
        else finalStatus = 'completed';
        await updateClassificationRunStatus(runIdRef.current, finalStatus);
      } catch (err) {
        console.error('Failed to update run status:', err);
      }
      localStorage.removeItem(BULK_RUN_KEY);
    }

    setProcessing(false);
  }, []);

  // ── Start classification from CSV file ────────────────────────────────────

  const startClassification = useCallback(async (file: File, _supportingFiles?: File[]) => {
    setProcessing(true);
    setErrorMessage(null);
    setItems([]);
    setProgressCurrent(0);
    setProgressTotal(0);
    setFileMetadata(null);
    setFileName(file.name);
    cancelledRef.current = false;
    classifiedCountRef.current = 0;
    runIdRef.current = null;

    // Validate file type
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext !== 'csv') {
      setErrorMessage('Currently only CSV files are supported for bulk classification. XLSX support coming soon.');
      setProcessing(false);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setErrorMessage('You must be logged in to classify products.');
      setProcessing(false);
      return;
    }

    // Pre-fetch confidence threshold
    let confidenceThreshold = 0.75;
    try {
      const userMeta = await getUserMetadata(user.id);
      confidenceThreshold = userMeta?.confidence_threshold ?? 0.75;
    } catch (err) {
      console.warn('Could not fetch user confidence threshold, using default 0.75:', err);
    }

    // Parse CSV
    let text: string;
    try {
      text = await file.text();
    } catch {
      setErrorMessage('Failed to read file.');
      setProcessing(false);
      return;
    }

    const { headers, rows } = parseCSV(text);
    if (rows.length === 0) {
      setErrorMessage('No data rows found in the file. Make sure the first row contains headers.');
      setProcessing(false);
      return;
    }

    const colMap = detectColumns(headers);

    // Validate: file must have identifiable product data
    const validProducts = rows.filter(row => {
      const name = colMap.product_name ? (row[colMap.product_name] || '').trim() : '';
      return name.length > 0;
    });
    if (validProducts.length === 0) {
      setErrorMessage('No valid product records found in the file. Ensure the file has a column with product names.');
      setProcessing(false);
      return;
    }

    setFileMetadata({ detected_columns: headers, column_mapping: colMap, total_rows: validProducts.length });
    setProgressTotal(validProducts.length);

    // Duplicate file check
    try {
      const productNames = validProducts.map(row =>
        (colMap.product_name ? row[colMap.product_name] : '') || ''
      ).filter(n => n);
      const { isDuplicate } = await checkDuplicateRun(user.id, file.name, productNames);
      if (isDuplicate) {
        setErrorMessage('This file has already been classified with the same products. Upload a different file or modify the contents.');
        setProcessing(false);
        return;
      }
    } catch (err) {
      console.warn('Duplicate check failed, continuing:', err);
    }

    // Create run in Supabase
    try {
      const runId = await createClassificationRun(user.id, 'bulk', {
        fileName: file.name,
        totalItems: validProducts.length,
      });
      runIdRef.current = runId;
      localStorage.setItem(BULK_RUN_KEY, JSON.stringify({
        runId,
        fileName: file.name,
        totalItems: validProducts.length,
        startedAt: new Date().toISOString(),
      }));
    } catch (err) {
      console.error('Failed to create classification run:', err);
    }

    // Build initial items
    const initialItems: BulkItem[] = validProducts.map((row, idx) => ({
      id: idx + 1,
      productName: (colMap.product_name ? row[colMap.product_name] : '') || `Row ${idx + 2}`,
      description: (colMap.description ? row[colMap.description] : '') || '',
      origin: (colMap.origin ? row[colMap.origin] : '') || '',
      materials: (colMap.materials ? row[colMap.materials] : '') || '',
      cost: (colMap.cost ? row[colMap.cost] : '') || '',
      status: 'pending' as const,
      extracted_data: {
        product_name: (colMap.product_name ? row[colMap.product_name] : '') || `Row ${idx + 2}`,
        product_description: (colMap.description ? row[colMap.description] : '') || '',
        country_of_origin: (colMap.origin ? row[colMap.origin] : '') || '',
        materials: (colMap.materials ? row[colMap.materials] : '') || '',
        unit_cost: (colMap.cost ? row[colMap.cost] : '') || '',
      }
    }));
    setItems(initialItems);

    // Build task items for the classification runner
    const taskItems = validProducts.map((row, idx) => {
      const costStr = colMap.cost ? row[colMap.cost] : '';
      const parsedCost = costStr ? parseFloat(costStr) : NaN;
      return {
        idx,
        productName: (colMap.product_name ? row[colMap.product_name] : '') || `Row ${idx + 2}`,
        description: buildProductDescription(row, colMap),
        origin: colMap.origin ? row[colMap.origin] : undefined,
        materials: colMap.materials ? row[colMap.materials] : undefined,
        unitCost: !isNaN(parsedCost) ? parsedCost : undefined,
      };
    });

    await classifyItems(user, confidenceThreshold, taskItems);
  }, [classifyItems]);

  // ── Start rerun classification ────────────────────────────────────────────

  const startRerunClassification = useCallback(async (products: RerunProduct[], rerunFileName: string) => {
    if (products.length === 0) return;

    setProcessing(true);
    setErrorMessage(null);
    setItems([]);
    setProgressCurrent(0);
    setProgressTotal(products.length);
    setFileMetadata(null);
    setFileName(rerunFileName);
    cancelledRef.current = false;
    classifiedCountRef.current = 0;
    runIdRef.current = null;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setErrorMessage('You must be logged in to classify products.');
      setProcessing(false);
      return;
    }

    let confidenceThreshold = 0.75;
    try {
      const userMeta = await getUserMetadata(user.id);
      confidenceThreshold = userMeta?.confidence_threshold ?? 0.75;
    } catch (err) {
      console.warn('Could not fetch user confidence threshold, using default 0.75:', err);
    }

    // Create NEW run (old failed run preserved as audit trail)
    try {
      const runId = await createClassificationRun(user.id, 'bulk', {
        fileName: rerunFileName || 'Rerun',
        totalItems: products.length,
      });
      runIdRef.current = runId;
      localStorage.setItem(BULK_RUN_KEY, JSON.stringify({
        runId,
        fileName: rerunFileName || 'Rerun',
        totalItems: products.length,
        startedAt: new Date().toISOString(),
      }));
    } catch (err) {
      console.error('Failed to create rerun classification run:', err);
    }

    // Build initial items
    const initialItems: BulkItem[] = products.map((product, idx) => ({
      id: idx + 1,
      productName: product.product_name || `Item ${idx + 1}`,
      description: product.product_description || '',
      origin: product.country_of_origin || '',
      materials: typeof product.materials === 'string' ? product.materials : '',
      cost: product.unit_cost?.toString() || '',
      status: 'pending' as const,
      extracted_data: {
        product_name: product.product_name,
        product_description: product.product_description,
        country_of_origin: product.country_of_origin,
        materials: typeof product.materials === 'string' ? product.materials : '',
        unit_cost: product.unit_cost?.toString() || '',
      },
    }));
    setItems(initialItems);

    // Build task items
    const taskItems = products.map((product, idx) => ({
      idx,
      productName: product.product_name || `Item ${idx + 1}`,
      description: [
        product.product_name,
        product.product_description,
        product.materials ? `Material: ${typeof product.materials === 'string' ? product.materials : ''}` : '',
        product.country_of_origin ? `Country of origin: ${product.country_of_origin}` : '',
      ].filter(Boolean).join('. '),
      origin: product.country_of_origin || undefined,
      materials: typeof product.materials === 'string' ? product.materials : undefined,
      unitCost: product.unit_cost,
    }));

    await classifyItems(user, confidenceThreshold, taskItems);
  }, [classifyItems]);

  // ── Cancel classification ─────────────────────────────────────────────────

  const cancelClassification = useCallback(() => {
    cancelledRef.current = true;
    // Don't setProcessing(false) here — let the loop finish and clean up
  }, []);

  // ── Clear all state (after user dismisses results) ────────────────────────

  const clearState = useCallback(() => {
    setItems([]);
    setProcessing(false);
    setProgressCurrent(0);
    setProgressTotal(0);
    setErrorMessage(null);
    setFileMetadata(null);
    setFileName(null);
    runIdRef.current = null;
    cancelledRef.current = false;
    classifiedCountRef.current = 0;
    localStorage.removeItem(BULK_RUN_KEY);
  }, []);

  // ── Item update helpers ───────────────────────────────────────────────────

  const updateItem = useCallback((id: number | string, updates: Partial<BulkItem>) => {
    setItems(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
  }, []);

  const updateItems = useCallback((updater: (prev: BulkItem[]) => BulkItem[]) => {
    setItems(updater);
  }, []);

  // ── Resume from localStorage on mount ─────────────────────────────────────

  const [isResuming, setIsResuming] = React.useState(false);

  React.useEffect(() => {
    const resumeBulkRun = async () => {
      const stored = localStorage.getItem(BULK_RUN_KEY);
      if (!stored || items.length > 0 || processing) return;

      try {
        setIsResuming(true);
        const { runId, totalItems } = JSON.parse(stored);
        const data = await getBulkRunResults(runId);

        if (!data || data.items.length === 0) {
          localStorage.removeItem(BULK_RUN_KEY);
          setIsResuming(false);
          return;
        }

        // If run is done, clear localStorage
        if (data.run.status === 'completed' || data.run.status === 'cancelled' || data.run.status === 'failed') {
          localStorage.removeItem(BULK_RUN_KEY);
          if (data.run.status === 'failed') {
            setIsResuming(false);
            return;
          }
        }

        runIdRef.current = runId;

        const { data: { user } } = await supabase.auth.getUser();
        let threshold = 0.75;
        if (user) {
          try {
            const meta = await getUserMetadata(user.id);
            threshold = meta?.confidence_threshold ?? 0.75;
          } catch { /* use default */ }
        }

        const hydratedItems: BulkItem[] = data.items.map((item, idx) => {
          const rawConf = item.result?.confidence || 0;
          const conf = Math.round(rawConf * 100);
          const hasResult = !!item.result;
          return {
            id: item.product.id,
            productName: item.product.product_name || `Item ${idx + 1}`,
            description: item.product.product_description || '',
            origin: item.product.country_of_origin || '',
            materials: typeof item.product.materials === 'string' ? item.product.materials : '',
            cost: item.product.unit_cost?.toString() || '',
            status: hasResult ? (rawConf >= threshold ? 'complete' : 'exception') : 'exception',
            hts: item.result?.hts_classification || '',
            confidence: conf,
            tariff: item.result?.tariff_rate != null ? `${(item.result.tariff_rate * 100).toFixed(1)}%` : '',
            classification_result_id: item.result?.id,
            extracted_data: {
              product_name: item.product.product_name,
              product_description: item.product.product_description,
              country_of_origin: item.product.country_of_origin,
              materials: typeof item.product.materials === 'string' ? item.product.materials : '',
              unit_cost: item.product.unit_cost?.toString() || '',
            },
          };
        });

        setItems(hydratedItems);
        setProgressTotal(totalItems || hydratedItems.length);
        setProgressCurrent(hydratedItems.length);
      } catch (err) {
        console.error('Error resuming bulk run:', err);
        localStorage.removeItem(BULK_RUN_KEY);
      } finally {
        setIsResuming(false);
      }
    };

    resumeBulkRun();
  }, []); // Run once on mount

  const value: BulkClassificationContextValue = {
    items,
    processing,
    progressCurrent,
    progressTotal,
    errorMessage,
    fileMetadata,
    runId: runIdRef.current,
    fileName,
    startClassification,
    startRerunClassification,
    cancelClassification,
    clearState,
    setErrorMessage,
    updateItem,
    updateItems,
  };

  return (
    <BulkClassificationContext.Provider value={value}>
      {children}
    </BulkClassificationContext.Provider>
  );
}
