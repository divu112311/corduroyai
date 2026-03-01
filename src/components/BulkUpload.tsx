import { useState, useRef, useCallback } from 'react';
import { Upload, FileSpreadsheet, Download, CheckCircle, AlertCircle, Clock, Filter, ArrowUpDown, Plus, X, FileText, File, Sparkles, StopCircle, Loader2 } from 'lucide-react';
import { BulkItemDetail } from './BulkItemDetail';
import { ExceptionReview } from './ExceptionReview';
import {
  classifyProduct,
  type FileMetadata,
} from '../lib/supabaseFunctions';
import { supabase } from '../lib/supabase';
import { getUserMetadata } from '../lib/userService';
import {
  createClassificationRun,
  saveProduct,
  saveClassificationResult,
  updateClassificationRunStatus,
  getBulkRunResults,
  checkDuplicateRun,
} from '../lib/classificationService';
import React from 'react';

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
  // Handle BOM
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
  // Fallback: first column = product_name if not detected
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
// Uses the detected column mapping to build a clean, natural-language product
// description — exactly like the working single-item flow.
// This avoids dumping raw key-value pairs (e.g. "Cost: 15.99") into the prompt.

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

  // If nothing was mapped, fall back to joining all non-empty values
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

interface BulkItem {
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

type SortField = 'name' | 'confidence' | 'status';
type SortDirection = 'asc' | 'desc';

interface BulkUploadProps {
  initialFile?: File | null;
  initialSupportingFiles?: File[];
  autoStart?: boolean;
  rerunProducts?: import('../lib/classificationService').RerunProduct[];
  rerunFileName?: string;
}

export function BulkUpload({ initialFile, initialSupportingFiles = [], autoStart = false, rerunProducts, rerunFileName }: BulkUploadProps = {}) {
  const [dragActive, setDragActive] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [items, setItems] = useState<BulkItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<BulkItem | null>(null);
  const [exceptionItem, setExceptionItem] = useState<BulkItem | null>(null);
  const [filterStatus, setFilterStatus] = useState<'all' | 'complete' | 'exception' | 'pending'>('all');
  const [sortField, setSortField] = useState<SortField>('status');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [showFilters, setShowFilters] = useState(false);
  const [supportingFiles, setSupportingFiles] = useState<File[]>(initialSupportingFiles);
  const [uploadedMainFile, setUploadedMainFile] = useState<File | null>(initialFile);
  const [progressCurrent, setProgressCurrent] = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fileMetadata, setFileMetadata] = useState<FileMetadata | null>(null);
  const cancelledRef = useRef(false);
  const runIdRef = useRef<number | null>(null);
  const classifiedCountRef = useRef(0);
  const BULK_RUN_KEY = 'corduroy_bulk_run';
  const [isResuming, setIsResuming] = useState<boolean>(() => {
    try {
      return !!localStorage.getItem('corduroy_bulk_run');
    } catch { return false; }
  });

  // Auto-start classification if initial file is provided or rerun products are ready
  React.useEffect(() => {
    if (rerunProducts && rerunProducts.length > 0 && items.length === 0 && !processing) {
      startRerunClassification();
    } else if (initialFile && autoStart && items.length === 0 && !processing) {
      startClassification();
    }
  }, [initialFile, autoStart, rerunProducts]);

  // Resume a bulk run from Supabase after page refresh
  React.useEffect(() => {
    const resumeBulkRun = async () => {
      const stored = localStorage.getItem(BULK_RUN_KEY);
      if (!stored || items.length > 0 || processing) {
        setIsResuming(false);
        return;
      }

      try {
        const { runId, totalItems } = JSON.parse(stored);
        const data = await getBulkRunResults(runId);

        if (!data || data.items.length === 0) {
          localStorage.removeItem(BULK_RUN_KEY);
          setIsResuming(false);
          return;
        }

        // If run is done, clear localStorage but still show results
        if (data.run.status === 'completed' || data.run.status === 'cancelled') {
          localStorage.removeItem(BULK_RUN_KEY);
        }

        runIdRef.current = runId;

        // Fetch user's confidence threshold for status determination
        const { data: { user } } = await supabase.auth.getUser();
        let threshold = 0.75;
        if (user) {
          try {
            const meta = await getUserMetadata(user.id);
            threshold = meta?.confidence_threshold ?? 0.75;
          } catch { /* use default */ }
        }

        // Hydrate BulkItem[] from Supabase data
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
  }, []);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleFile = (file: File) => {
    setUploadedMainFile(file);
    setErrorMessage(null);
  };

  const startClassification = async () => {
    const fileToUpload = uploadedMainFile || initialFile;
    if (!fileToUpload) return;

    setProcessing(true);
    setErrorMessage(null);
    setItems([]);
    setProgressCurrent(0);
    setProgressTotal(0);
    setFileMetadata(null);
    cancelledRef.current = false;
    classifiedCountRef.current = 0;

    // Validate file type
    const ext = fileToUpload.name.split('.').pop()?.toLowerCase();
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

    // Pre-fetch the user's confidence threshold ONCE before the loop.
    // This avoids N redundant getUserMetadata calls (one per item) and
    // prevents concurrent Supabase queries from causing failures.
    let confidenceThreshold = 0.75;
    try {
      const userMeta = await getUserMetadata(user.id);
      confidenceThreshold = userMeta?.confidence_threshold ?? 0.75;
    } catch (err) {
      console.warn('Could not fetch user confidence threshold, using default 0.75:', err);
    }

    // Parse CSV locally
    let text: string;
    try {
      text = await fileToUpload.text();
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

    // Detect column mapping
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

    // Duplicate file check — prevent re-classifying same file with same products
    try {
      const productNames = validProducts.map(row =>
        (colMap.product_name ? row[colMap.product_name] : '') || ''
      ).filter(n => n);
      const { isDuplicate } = await checkDuplicateRun(user.id, fileToUpload.name, productNames);
      if (isDuplicate) {
        setErrorMessage('This file has already been classified with the same products. Upload a different file or modify the contents.');
        setProcessing(false);
        return;
      }
    } catch (err) {
      console.warn('Duplicate check failed, continuing:', err);
    }

    // Create Supabase classification run for persistence
    let runId: number | null = null;
    try {
      runId = await createClassificationRun(user.id, 'bulk', {
        fileName: fileToUpload.name,
        totalItems: validProducts.length,
      });
      runIdRef.current = runId;
      // Store in localStorage for page refresh recovery
      localStorage.setItem(BULK_RUN_KEY, JSON.stringify({
        runId,
        fileName: fileToUpload.name,
        totalItems: validProducts.length,
        startedAt: new Date().toISOString(),
      }));
    } catch (err) {
      console.error('Failed to create classification run:', err);
      // Continue without persistence — classification still works
    }

    // Build initial items from valid products only
    const initialItems: BulkItem[] = validProducts.map((row, idx) => ({
      id: idx + 1,
      productName: (colMap.product_name ? row[colMap.product_name] : '') || `Row ${idx + 2}`,
      description: (colMap.description ? row[colMap.description] : '') || '',
      origin: (colMap.origin ? row[colMap.origin] : '') || '',
      materials: (colMap.materials ? row[colMap.materials] : '') || '',
      cost: (colMap.cost ? row[colMap.cost] : '') || '',
      status: 'pending' as const,
      // Store the complete extracted data for later use in approval flow
      extracted_data: {
        product_name: (colMap.product_name ? row[colMap.product_name] : '') || `Row ${idx + 2}`,
        product_description: (colMap.description ? row[colMap.description] : '') || '',
        country_of_origin: (colMap.origin ? row[colMap.origin] : '') || '',
        materials: (colMap.materials ? row[colMap.materials] : '') || '',
        unit_cost: (colMap.cost ? row[colMap.cost] : '') || '',
      }
    }));
    setItems(initialItems);

    // Classify each row using the working single-product pipeline.
    // Each call is fully STATELESS — a fresh messages array (system + user
    // prompt only) is sent per product. No prior conversation history or
    // tool_use blocks are replayed, which avoids duplicate ID errors.
    let completed = 0;

    const tasks = rows.map((row, idx) => async () => {
      if (cancelledRef.current) return;

      // Build a clean product description using detected column mapping,
      // mirroring what the single-item ClassificationView sends.
      const description = buildProductDescription(row, colMap);
      const productName = (colMap.product_name ? row[colMap.product_name] : '') || `Row ${idx + 2}`;
      const origin = colMap.origin ? row[colMap.origin] : '';
      const materials = colMap.materials ? row[colMap.materials] : '';
      const costStr = colMap.cost ? row[colMap.cost] : '';
      const parsedCost = costStr ? parseFloat(costStr) : NaN;
      const unitCost = !isNaN(parsedCost) ? parsedCost : undefined;

      if (!description.trim()) {
        completed++;
        setProgressCurrent(completed);
        // Save product to Supabase even if no description (so count is accurate)
        if (runIdRef.current) {
          try {
            await saveProduct(user.id, runIdRef.current, {
              product_name: productName,
              product_description: '',
              country_of_origin: origin || undefined,
              materials: materials || undefined,
              unit_cost: unitCost,
            });
          } catch (e) { console.error('Supabase save error:', e); }
        }
        setItems(prev => prev.map(item =>
          item.id === idx + 1
            ? { ...item, status: 'exception' as const, error: 'No product description available' }
            : item
        ));
        return;
      }

      try {
        // Each call is independent — pass pre-fetched threshold so
        // classifyProduct does NOT re-fetch user metadata per item.
        // classifyProduct returns null on failure, so wrap to throw for retry.
        const result = await retryWithBackoff(
          async () => {
            const res = await classifyProduct(description, user.id, confidenceThreshold);
            if (res === null) throw new Error('Classification returned null (edge function or backend error)');
            return res;
          },
          2,   // up to 2 retries
          1500, // 1.5s base delay with exponential backoff
        ).catch(() => null); // After retries exhausted, treat as null
        completed++;
        setProgressCurrent(completed);

        if (cancelledRef.current) return;

        // ── Compute item update from classification result ──────────
        let itemStatus: 'complete' | 'exception' = 'exception';
        let itemHts = '';
        let itemConfidence = 0;
        let itemTariff = '';
        let itemError = '';
        let itemQuestions: Array<{ question: string; options: string[] }> | null = null;
        // Raw values for Supabase persistence (0–1 scale)
        let rawConfidence = 0;
        let rawTariffRate: number | undefined;
        let topRuleForSave: any = null;

        if (!result) {
          itemError = 'Classification returned no result';
        } else if (result.type === 'clarify' || result.needs_clarification) {
          // Handle clarification needed
          itemQuestions = (result.clarifications || result.questions || []).map((c: any) => ({
            question: typeof c === 'string' ? c : c.question || c,
            options: typeof c === 'string' ? [] : c.options || [],
          }));
        } else if (result.type === 'exception') {
          // Handle explicit exception from backend (e.g. LOW_CONFIDENCE)
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
          // Extract matched rules — mirroring ClassificationView logic
          let matchedRules: any[] = [];
          if (result.type === 'answer' && result.matches) {
            if (Array.isArray(result.matches)) {
              matchedRules = result.matches;
            } else if (result.matches.matched_rules && Array.isArray(result.matches.matched_rules)) {
              matchedRules = result.matches.matched_rules;
            }
          } else if (result.candidates) {
            matchedRules = result.candidates;
          }

          // Sort by confidence descending (matching ClassificationView)
          const sortedMatches = [...matchedRules].sort((a: any, b: any) => {
            const aConf = a.confidence || a.score || 0;
            const bConf = b.confidence || b.score || 0;
            return bConf - aConf;
          });

          const topRule = sortedMatches[0];

          // Confidence cascade: try rule confidence, then similarity score,
          // then the response-level max_confidence. This matches the backend
          // pipeline where generate_rationale sets confidence on each rule.
          const rawConf = topRule
            ? (topRule.confidence || topRule.score || 0)
            : 0;
          const maxConf = rawConf > 0
            ? Math.round(rawConf * 100)
            : Math.round((result.max_confidence || 0) * 100);

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

        // ── Persist to Supabase ────────────────────────────────────
        let classificationResultId: number | undefined;
        if (runIdRef.current) {
          try {
            const productId = await saveProduct(user.id, runIdRef.current, {
              product_name: productName,
              product_description: description,
              country_of_origin: origin || undefined,
              materials: materials || undefined,
              unit_cost: unitCost,
            });
            // Save classification result — even for exceptions so Dashboard picks them up
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

        // ── Update React state ─────────────────────────────────────
        setItems(prev => prev.map(item => {
          if (item.id !== idx + 1) return item;
          return {
            ...item,
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
        console.error(`Error classifying row ${idx + 1}:`, errorMsg);
        // Save failed product to Supabase so count is accurate
        if (runIdRef.current) {
          try {
            await saveProduct(user.id, runIdRef.current, {
              product_name: productName,
              product_description: description,
              country_of_origin: origin || undefined,
              materials: materials || undefined,
              unit_cost: unitCost,
            });
          } catch (e) { console.error('Supabase save error:', e); }
        }
        setItems(prev => prev.map(item =>
          item.id === idx + 1
            ? { ...item, status: 'exception' as const, error: `Classification failed: ${errorMsg}` }
            : item
        ));
      }
    });

    // Process 2 at a time — each classification triggers 3+ LLM calls on the
    // backend (preprocess, rule engine, rationale), so lower concurrency
    // prevents rate-limit / timeout cascades that cause blanket failures.
    await runWithConcurrency(tasks, 2, () => cancelledRef.current);

    // Mark run as completed/cancelled/failed in Supabase and clear localStorage
    if (runIdRef.current) {
      try {
        let finalStatus: 'completed' | 'cancelled' | 'failed';
        if (cancelledRef.current) {
          finalStatus = 'cancelled';
        } else if (classifiedCountRef.current === 0) {
          finalStatus = 'failed';
        } else {
          finalStatus = 'completed';
        }
        await updateClassificationRunStatus(runIdRef.current, finalStatus);
      } catch (err) {
        console.error('Failed to update run status:', err);
      }
      localStorage.removeItem(BULK_RUN_KEY);
    }

    setProcessing(false);
  };

  // Rerun classification using products from a previous failed run
  const startRerunClassification = async () => {
    if (!rerunProducts || rerunProducts.length === 0) return;

    setProcessing(true);
    setErrorMessage(null);
    setItems([]);
    setProgressCurrent(0);
    setProgressTotal(rerunProducts.length);
    setFileMetadata(null);
    cancelledRef.current = false;
    classifiedCountRef.current = 0;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setErrorMessage('You must be logged in to classify products.');
      setProcessing(false);
      return;
    }

    // Pre-fetch the user's confidence threshold
    let confidenceThreshold = 0.75;
    try {
      const userMeta = await getUserMetadata(user.id);
      confidenceThreshold = userMeta?.confidence_threshold ?? 0.75;
    } catch (err) {
      console.warn('Could not fetch user confidence threshold, using default 0.75:', err);
    }

    // Create a NEW classification run (old failed run preserved as audit trail)
    let runId: number | null = null;
    try {
      runId = await createClassificationRun(user.id, 'bulk', {
        fileName: rerunFileName || 'Rerun',
        totalItems: rerunProducts.length,
      });
      runIdRef.current = runId;
      localStorage.setItem(BULK_RUN_KEY, JSON.stringify({
        runId,
        fileName: rerunFileName || 'Rerun',
        totalItems: rerunProducts.length,
        startedAt: new Date().toISOString(),
      }));
    } catch (err) {
      console.error('Failed to create rerun classification run:', err);
    }

    // Build initial items from rerun products
    const initialItems: BulkItem[] = rerunProducts.map((product, idx) => ({
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

    // Classify each product — same pipeline as CSV classification
    let completed = 0;

    const tasks = rerunProducts.map((product, idx) => async () => {
      if (cancelledRef.current) return;

      const description = [
        product.product_name,
        product.product_description,
        product.materials ? `Material: ${typeof product.materials === 'string' ? product.materials : ''}` : '',
        product.country_of_origin ? `Country of origin: ${product.country_of_origin}` : '',
      ].filter(Boolean).join('. ');

      if (!description.trim()) {
        completed++;
        setProgressCurrent(completed);
        if (runIdRef.current) {
          try {
            await saveProduct(user.id, runIdRef.current, {
              product_name: product.product_name,
              product_description: '',
              country_of_origin: product.country_of_origin || undefined,
              materials: product.materials || undefined,
              unit_cost: product.unit_cost,
            });
          } catch (e) { console.error('Supabase save error:', e); }
        }
        setItems(prev => prev.map(item =>
          item.id === idx + 1
            ? { ...item, status: 'exception' as const, error: 'No product description available' }
            : item
        ));
        return;
      }

      try {
        const result = await retryWithBackoff(
          async () => {
            const res = await classifyProduct(description, user.id, confidenceThreshold);
            if (res === null) throw new Error('Classification returned null');
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
        let rawConfidence = 0;
        let rawTariffRate: number | undefined;
        let topRuleForSave: any = null;

        if (!result) {
          itemError = 'Classification returned no result';
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
            else if (result.matches.matched_rules) matchedRules = result.matches.matched_rules;
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
        if (runIdRef.current) {
          try {
            const productId = await saveProduct(user.id, runIdRef.current, {
              product_name: product.product_name,
              product_description: description,
              country_of_origin: product.country_of_origin || undefined,
              materials: product.materials || undefined,
              unit_cost: product.unit_cost,
            });
            if (itemHts || rawConfidence > 0 || result) {
              await saveClassificationResult(productId, runIdRef.current, {
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

        setItems(prev => prev.map(item => {
          if (item.id !== idx + 1) return item;
          return { ...item, status: itemStatus, hts: itemHts, confidence: itemConfidence, tariff: itemTariff, error: itemError || undefined };
        }));
      } catch (err: any) {
        completed++;
        setProgressCurrent(completed);
        const errorMsg = err?.message || String(err);
        if (runIdRef.current) {
          try {
            await saveProduct(user.id, runIdRef.current, {
              product_name: product.product_name,
              product_description: description,
              country_of_origin: product.country_of_origin || undefined,
              materials: product.materials || undefined,
              unit_cost: product.unit_cost,
            });
          } catch (e) { console.error('Supabase save error:', e); }
        }
        setItems(prev => prev.map(item =>
          item.id === idx + 1
            ? { ...item, status: 'exception' as const, error: `Classification failed: ${errorMsg}` }
            : item
        ));
      }
    });

    await runWithConcurrency(tasks, 2, () => cancelledRef.current);

    // Mark run as completed/cancelled/failed
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
  };

  const handleCancelClassification = () => {
    cancelledRef.current = true;
    setProcessing(false);
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const filteredAndSortedItems = items
    .filter(item => filterStatus === 'all' || item.status === filterStatus)
    .sort((a, b) => {
      let comparison = 0;
      
      if (sortField === 'name') {
        comparison = a.productName.localeCompare(b.productName);
      } else if (sortField === 'confidence') {
        comparison = (a.confidence || 0) - (b.confidence || 0);
      } else if (sortField === 'status') {
        const statusOrder = { exception: 0, pending: 1, complete: 2 };
        comparison = statusOrder[a.status] - statusOrder[b.status];
      }
      
      return sortDirection === 'asc' ? comparison : -comparison;
    });

  const stats = {
    total: items.length,
    complete: items.filter(i => i.status === 'complete').length,
    exceptions: items.filter(i => i.status === 'exception').length,
    pending: items.filter(i => i.status === 'pending').length,
  };

  const handleViewItem = (item: BulkItem) => {
    if (item.status === 'exception') {
      setExceptionItem(item);
    } else {
      setSelectedItem(item);
    }
  };

  const handleSupportingFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setSupportingFiles([...supportingFiles, ...newFiles]);
    }
  };

  const removeSupportingFile = (index: number) => {
    setSupportingFiles(supportingFiles.filter((_, i) => i !== index));
  };

  const handleExportResults = () => {
    if (items.length === 0) {
      alert('No results to export');
      return;
    }

    // Create CSV content
    const headers = ['Product Name', 'Description', 'Status', 'HTS Code', 'Confidence (%)', 'Tariff', 'Origin', 'Materials', 'Cost'];
    const csvRows = [headers.join(',')];

    items.forEach(item => {
      const row = [
        `"${item.productName}"`,
        `"${item.description}"`,
        item.status,
        item.hts || 'N/A',
        item.confidence ? item.confidence.toString() : 'N/A',
        item.tariff || 'N/A',
        item.origin || 'N/A',
        item.materials || 'N/A',
        item.cost || 'N/A'
      ];
      csvRows.push(row.join(','));
    });

    const csvContent = csvRows.join('\n');
    
    // Create and trigger download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `bulk-classification-results-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getFileIcon = (fileName: string) => {
    const parts = fileName.split('.');
    const ext = parts.length > 0 && parts[parts.length - 1] ? parts[parts.length - 1].toLowerCase() : '';
    if (ext === 'pdf') return <FileText className="w-4 h-4 text-red-600" />;
    if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') return <FileText className="w-4 h-4 text-green-600" />;
    if (ext === 'doc' || ext === 'docx') return <FileText className="w-4 h-4 text-blue-600" />;
    return <File className="w-4 h-4 text-slate-600" />;
  };

  return (
    <div>
      <div className="max-w-7xl mx-auto">
        {/* Resume Loading State */}
        {isResuming && items.length === 0 && (
          <div className="bg-white rounded-xl p-12 border border-slate-200">
            <div className="text-center">
              <div className="bg-blue-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4">
                <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
              </div>
              <h3 className="text-slate-900 mb-2">Resuming Bulk Run...</h3>
              <p className="text-slate-600">Loading your previous classification results</p>
            </div>
          </div>
        )}

        {/* Upload Area */}
        {items.length === 0 && !isResuming && (
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            className={`bg-white rounded-xl p-12 border-2 border-dashed transition-all ${
              dragActive ? 'border-blue-500 bg-blue-50' : 'border-slate-300'
            } ${uploadedMainFile ? 'hidden' : ''}`}
          >
            <div className="text-center">
              <div className={`bg-slate-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 ${
                dragActive ? 'bg-blue-100' : ''
              }`}>
                {processing ? (
                  <div className="animate-spin w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full" />
                ) : (
                  <Upload className={`w-10 h-10 ${dragActive ? 'text-blue-600' : 'text-slate-400'}`} />
                )}
              </div>
              
              {processing ? (
                <div>
                  <h3 className="text-slate-900 mb-2">Processing File...</h3>
                  <p className="text-slate-600">AI is classifying your products</p>
                </div>
              ) : (
                <>
                  <h3 className="text-slate-900 mb-2">
                    {dragActive ? 'Drop file to upload' : 'Upload Product File'}
                  </h3>
                  <p className="text-slate-600 mb-4">
                    Drag and drop your CSV or Excel file here, or click to browse
                  </p>
                  <input
                    type="file"
                    id="file-upload"
                    accept=".csv,.xlsx,.xls"
                    onChange={handleFileInput}
                    className="hidden"
                  />
                  <label
                    htmlFor="file-upload"
                    className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors cursor-pointer"
                  >
                    <FileSpreadsheet className="w-5 h-5" />
                    Choose File
                  </label>
                  <p className="text-slate-500 text-sm mt-4">
                    Supports CSV, XLSX, and XLS formats (Max 10,000 rows)
                  </p>
                </>
              )}
            </div>
          </div>
        )}

        {/* File Ready for Classification */}
        {uploadedMainFile && !processing && items.length === 0 && (
          <div className="space-y-6">
            {/* Main File Card */}
            <div className="bg-white rounded-xl p-6 border-2 border-green-200 bg-green-50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="bg-green-100 p-3 rounded-lg">
                    <FileSpreadsheet className="w-8 h-8 text-green-600" />
                  </div>
                  <div>
                    <h4 className="text-slate-900">Ready to Classify</h4>
                    <p className="text-slate-600 text-sm">{uploadedMainFile.name}</p>
                    <p className="text-slate-500 text-xs mt-1">
                      {(uploadedMainFile.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setUploadedMainFile(null);
                    setSupportingFiles([]);
                  }}
                  className="px-4 py-2 text-slate-600 hover:text-slate-900 transition-colors"
                >
                  Choose Different File
                </button>
              </div>
            </div>

            {/* Supporting Documents */}
            <div className="bg-white rounded-xl p-6 border border-slate-200">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-slate-600" />
                  <div>
                    <h4 className="text-slate-900">Supporting Documents (Optional)</h4>
                    <p className="text-slate-600 text-sm">Specs, BOMs, datasheets to improve accuracy</p>
                  </div>
                </div>
                <label
                  htmlFor="supporting-files-upload-ready"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors cursor-pointer flex items-center gap-2 text-sm"
                >
                  <Plus className="w-4 h-4" />
                  Add Files
                </label>
                <input
                  id="supporting-files-upload-ready"
                  type="file"
                  multiple
                  accept=".pdf,.xlsx,.xls,.csv,.doc,.docx,.txt,.jpg,.jpeg,.png"
                  onChange={handleSupportingFileUpload}
                  className="hidden"
                />
              </div>

              {supportingFiles.length > 0 ? (
                <div className="space-y-2">
                  {supportingFiles.map((file, idx) => (
                    <div key={idx} className="flex items-center gap-3 p-3 bg-slate-50 rounded border border-slate-200">
                      {getFileIcon(file.name)}
                      <div className="flex-1 min-w-0">
                        <p className="text-slate-900 text-sm truncate">{file.name}</p>
                        <p className="text-slate-500 text-xs">
                          {(file.size / 1024).toFixed(1)} KB
                        </p>
                      </div>
                      <button
                        onClick={() => removeSupportingFile(idx)}
                        className="p-1 hover:bg-red-50 rounded transition-colors flex-shrink-0"
                      >
                        <X className="w-4 h-4 text-red-600" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 border-2 border-dashed border-slate-200 rounded-lg bg-slate-50">
                  <p className="text-slate-500 text-sm">
                    No supporting documents uploaded
                  </p>
                  <p className="text-slate-400 text-xs mt-1">
                    These documents help the AI better understand your products
                  </p>
                </div>
              )}
            </div>

            {/* Start Classification Button */}
            <div className="bg-white rounded-xl p-6 border border-slate-200">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-slate-900 mb-1">Ready to Start</h4>
                  <p className="text-slate-600 text-sm">
                    {supportingFiles.length > 0
                      ? `Main file + ${supportingFiles.length} supporting document${supportingFiles.length > 1 ? 's' : ''} ready`
                      : 'Main file ready for classification'}
                  </p>
                </div>
                <button
                  onClick={startClassification}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
                >
                  <CheckCircle className="w-5 h-5" />
                  Start Classification
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Processing State */}
        {processing && (
          <div className="bg-white rounded-xl p-12 border border-slate-200">
            <div className="text-center">
              <div className="bg-blue-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4">
                <div className="animate-spin w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full" />
              </div>
              <h3 className="text-slate-900 mb-2">Classifying Products...</h3>
              <p className="text-slate-600">
                {progressTotal > 0
                  ? `Processing ${progressCurrent} of ${progressTotal} products`
                  : 'Parsing file and extracting products...'}
              </p>
              {progressTotal > 0 && (
                <div className="mt-4 max-w-md mx-auto">
                  <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all duration-500 dynamic-bar"
                      style={{ '--bar-width': `${(progressCurrent / progressTotal) * 100}%` } as React.CSSProperties}
                    />
                  </div>
                  <p className="text-slate-500 text-sm mt-2">
                    {Math.round((progressCurrent / progressTotal) * 100)}% complete
                  </p>
                </div>
              )}
              <button
                onClick={handleCancelClassification}
                className="mt-4 px-4 py-2 text-red-600 border border-red-300 rounded-lg hover:bg-red-50 transition-colors flex items-center gap-2 mx-auto"
              >
                <StopCircle className="w-4 h-4" />
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Error Message */}
        {errorMessage && !processing && (
          <div className="bg-red-50 rounded-xl p-6 border border-red-200">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0" />
              <div>
                <h4 className="text-red-900">Classification Error</h4>
                <p className="text-red-700 text-sm">{errorMessage}</p>
              </div>
              <button
                onClick={() => setErrorMessage(null)}
                className="ml-auto text-red-600 hover:text-red-900"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* Results */}
        {items.length > 0 && (
          <div className="space-y-6">
            {/* AI Analysis Section - At Top of Results */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
              <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4 border-b border-blue-500">
                <div className="flex items-center gap-3">
                  <div className="bg-white/20 p-2 rounded-lg">
                    <Sparkles className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-white">AI Analysis</h3>
                    <p className="text-blue-100 text-sm">File insights & classification summary</p>
                  </div>
                </div>
              </div>

              <div className="p-4 max-h-64 overflow-y-auto">
                <div className="space-y-3">
                  {/* Main File Analysis */}
                  <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
                    <p className="text-blue-900 text-sm mb-1">
                      <strong>📄 Main File Detected:</strong>
                    </p>
                    <p className="text-blue-800 text-xs mb-1">
                      {uploadedMainFile && uploadedMainFile.name.endsWith('.pdf') ? 'PDF document' : uploadedMainFile && uploadedMainFile.name.endsWith('.csv') ? 'CSV file' : 'Excel spreadsheet'}
                      {` with ${progressTotal || items.length} product entries`}
                    </p>
                    <p className="text-blue-800 text-xs">
                      Found columns: <span className="font-medium">
                        {fileMetadata?.detected_columns && fileMetadata.detected_columns.length > 0
                          ? fileMetadata.detected_columns.join(', ')
                          : 'Detecting...'}
                      </span>
                    </p>
                    <p className="text-blue-700 text-xs mt-1">
                      {items.length > 0
                        ? `${items.length} product${items.length !== 1 ? 's' : ''} detected for classification.`
                        : 'Analyzing product data...'}
                    </p>
                  </div>

                  {/* Classification Summary */}
                  <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                    <p className="text-slate-900 text-sm mb-1">
                      <strong>✅ Classification Complete:</strong>
                    </p>
                    <ul className="space-y-1 text-slate-700 text-xs">
                      <li>• {stats.complete} products classified successfully</li>
                      <li>• {stats.exceptions} exceptions need review</li>
                      <li>• Average confidence: {Math.round(items.reduce((acc, i) => acc + (i.confidence || 0), 0) / items.length)}%</li>
                    </ul>
                  </div>

                  {/* Supporting Files */}
                  {supportingFiles.length > 0 && (
                    <div className="bg-green-50 rounded-lg p-3 border border-green-100">
                      <p className="text-green-900 text-sm mb-1">
                        <strong>📎 Supporting Documents ({supportingFiles.length}):</strong>
                      </p>
                      <ul className="space-y-1">
                        {supportingFiles.map((file, idx) => (
                          <li key={idx} className="text-green-800 text-xs flex items-start gap-2">
                            <span className="flex-shrink-0">•</span>
                            <span className="truncate">
                              {file.name} - {file.name.toLowerCase().includes('spec') || file.name.toLowerCase().includes('datasheet') ? 'Specifications' : file.name.toLowerCase().includes('bom') ? 'Bill of Materials' : 'Details'}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Suggestions */}
                  {stats.exceptions > 0 && (
                    <div className="bg-amber-50 rounded-lg p-3 border border-amber-200">
                      <p className="text-amber-900 text-sm mb-1">
                        <strong>💡 Suggestions:</strong>
                      </p>
                      <ul className="space-y-1 text-amber-800 text-xs">
                        <li className="flex items-start gap-2">
                          <span className="flex-shrink-0">•</span>
                          <span>Review {stats.exceptions} exception{stats.exceptions > 1 ? 's' : ''} for low confidence scores</span>
                        </li>
                        {supportingFiles.length === 0 && (
                          <li className="flex items-start gap-2">
                            <span className="flex-shrink-0">•</span>
                            <span>Adding spec sheets could improve accuracy</span>
                          </li>
                        )}
                        <li className="flex items-start gap-2">
                          <span className="flex-shrink-0">•</span>
                          <span>Click any row to view alternative HTS codes</span>
                        </li>
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Exception Review Prompt */}
            {stats.exceptions > 0 && (
              <div className="bg-gradient-to-r from-red-50 to-amber-50 rounded-xl p-5 border-2 border-red-200 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="bg-red-100 p-3 rounded-lg">
                      <AlertCircle className="w-6 h-6 text-red-600" />
                    </div>
                    <div>
                      <h3 className="text-red-900 mb-1">Action Required: {stats.exceptions} Exception{stats.exceptions > 1 ? 's' : ''} Need Review</h3>
                      <p className="text-red-700 text-sm">
                        Low confidence scores require your review before approval
                      </p>
                    </div>
                  </div>
                  <span className="text-red-700 font-medium whitespace-nowrap">Review Below ↓</span>
                </div>
              </div>
            )}

            {/* Stats Summary */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl p-4 border border-slate-200">
                <div className="text-slate-600 text-sm mb-1">Total Products</div>
                <div className="text-slate-900">{stats.total}</div>
              </div>
              <div className="bg-green-50 rounded-xl p-4 border border-green-200">
                <div className="text-green-700 text-sm mb-1">Completed</div>
                <div className="text-green-900">{stats.complete}</div>
              </div>
              <div className="bg-red-50 rounded-xl p-4 border border-red-200">
                <div className="text-red-700 text-sm mb-1">Exceptions</div>
                <div className="text-red-900">{stats.exceptions}</div>
              </div>
              <div className="bg-amber-50 rounded-xl p-4 border border-amber-200">
                <div className="text-amber-700 text-sm mb-1">Pending</div>
                <div className="text-amber-900">{stats.pending}</div>
              </div>
            </div>

            {/* Actions */}
            <div className="bg-white rounded-xl p-4 border border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button
                  onClick={handleExportResults}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Export Results
                </button>
                <button 
                  onClick={() => setShowFilters(!showFilters)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors flex items-center gap-2"
                >
                  <Filter className="w-4 h-4" />
                  Filters
                </button>
              </div>
              <button
                onClick={() => {
                  setItems([]);
                  setUploadedMainFile(null);
                  setSupportingFiles([]);
                  setFileMetadata(null);
                  localStorage.removeItem(BULK_RUN_KEY);
                  runIdRef.current = null;
                }}
                className="px-4 py-2 text-slate-600 hover:text-slate-900 transition-colors"
              >
                Upload New File
              </button>
            </div>

            {/* Filters */}
            {showFilters && (
              <div className="bg-white rounded-xl p-4 border border-slate-200">
                <div className="flex items-center gap-4">
                  <span className="text-slate-700">Filter by status:</span>
                  <button
                    onClick={() => setFilterStatus('all')}
                    className={`px-3 py-1 rounded-lg text-sm transition-colors ${
                      filterStatus === 'all' 
                        ? 'bg-blue-600 text-white' 
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    All ({stats.total})
                  </button>
                  <button
                    onClick={() => setFilterStatus('complete')}
                    className={`px-3 py-1 rounded-lg text-sm transition-colors ${
                      filterStatus === 'complete' 
                        ? 'bg-green-600 text-white' 
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    Complete ({stats.complete})
                  </button>
                  <button
                    onClick={() => setFilterStatus('exception')}
                    className={`px-3 py-1 rounded-lg text-sm transition-colors ${
                      filterStatus === 'exception' 
                        ? 'bg-red-600 text-white' 
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    Exceptions ({stats.exceptions})
                  </button>
                  <button
                    onClick={() => setFilterStatus('pending')}
                    className={`px-3 py-1 rounded-lg text-sm transition-colors ${
                      filterStatus === 'pending' 
                        ? 'bg-amber-600 text-white' 
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    Pending ({stats.pending})
                  </button>
                </div>
              </div>
            )}

            {/* Results Table */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-6 py-3 text-left">
                        <button
                          onClick={() => handleSort('status')}
                          className="flex items-center gap-2 text-slate-700 text-sm hover:text-slate-900"
                        >
                          Status
                          <ArrowUpDown className="w-4 h-4" />
                        </button>
                      </th>
                      <th className="px-6 py-3 text-left">
                        <button
                          onClick={() => handleSort('name')}
                          className="flex items-center gap-2 text-slate-700 text-sm hover:text-slate-900"
                        >
                          Product Name
                          <ArrowUpDown className="w-4 h-4" />
                        </button>
                      </th>
                      <th className="px-6 py-3 text-left text-slate-700 text-sm">Description</th>
                      <th className="px-6 py-3 text-left text-slate-700 text-sm">Origin</th>
                      <th className="px-6 py-3 text-left text-slate-700 text-sm">HTS Code</th>
                      <th className="px-6 py-3 text-left">
                        <button
                          onClick={() => handleSort('confidence')}
                          className="flex items-center gap-2 text-slate-700 text-sm hover:text-slate-900"
                        >
                          Confidence
                          <ArrowUpDown className="w-4 h-4" />
                        </button>
                      </th>
                      <th className="px-6 py-3 text-left text-slate-700 text-sm">Tariff</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredAndSortedItems.map((item) => (
                      <tr 
                        key={item.id} 
                        onClick={() => handleViewItem(item)}
                        className="hover:bg-slate-50 cursor-pointer transition-colors"
                      >
                        <td className="px-6 py-4">
                          {item.status === 'complete' && (
                            <div className="flex items-center gap-2 text-green-600">
                              <CheckCircle className="w-5 h-5" />
                              <span className="text-sm">Complete</span>
                            </div>
                          )}
                          {item.status === 'exception' && (
                            <div className="flex items-center gap-2 text-red-600">
                              <AlertCircle className="w-5 h-5" />
                              <div>
                                <span className="text-sm">Exception</span>
                                {item.error && (
                                  <p className="text-xs text-red-400 mt-0.5 max-w-[200px] truncate" title={item.error}>{item.error}</p>
                                )}
                              </div>
                            </div>
                          )}
                          {item.status === 'pending' && (
                            <div className="flex items-center gap-2 text-amber-600">
                              <Clock className="w-5 h-5" />
                              <span className="text-sm">Pending</span>
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 text-slate-900">{item.productName}</td>
                        <td className="px-6 py-4 text-slate-600 text-sm">{item.description}</td>
                        <td className="px-6 py-4 text-slate-900 text-sm">{item.origin}</td>
                        <td className="px-6 py-4 text-slate-900">{item.hts}</td>
                        <td className="px-6 py-4">
                          {item.confidence != null && item.confidence > 0 ? (
                            <div className="flex items-center gap-2">
                              <span className={`text-sm ${
                                item.confidence >= 90 ? 'text-green-600' :
                                item.confidence >= 75 ? 'text-amber-600' :
                                'text-red-600'
                              }`}>
                                {item.confidence}%
                              </span>
                              <div className="w-16 h-1.5 bg-slate-200 rounded-full">
                                <div
                                  className={`h-full rounded-full dynamic-bar ${
                                    item.confidence >= 90 ? 'bg-green-500' :
                                    item.confidence >= 75 ? 'bg-amber-500' :
                                    'bg-red-500'
                                  }`}
                                  style={{ '--bar-width': `${item.confidence}%` } as React.CSSProperties}
                                />
                              </div>
                            </div>
                          ) : (
                            <span className="text-sm text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-slate-900">{item.tariff}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {selectedItem && (
        <BulkItemDetail
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onSave={(updatedItem) => {
            setItems(items.map(i => i.id === updatedItem.id ? updatedItem : i));
            setSelectedItem(null);
          }}
          bulkRunId={0}
        />
      )}

      {exceptionItem && (
        <ExceptionReview
          product={{
            id: exceptionItem.id,
            productName: exceptionItem.productName,
            description: exceptionItem.description,
            hts: exceptionItem.hts || '',
            confidence: exceptionItem.confidence || 0,
            tariff: exceptionItem.tariff || '',
            origin: exceptionItem.origin || 'China',
            reason: 'Low confidence score - Multiple possible classifications detected'
          }}
          bulkRunId={undefined}
          bulkItemId={exceptionItem.bulkItemId || undefined}
          clarificationQuestions={exceptionItem.clarificationQuestions}
          onClose={() => setExceptionItem(null)}
          onApprove={(updatedProduct?: any) => {
            setItems(items.map(i => {
              if (i.id !== exceptionItem.id) return i;
              if (updatedProduct) {
                return {
                  ...i,
                  status: 'complete' as const,
                  hts: updatedProduct.hts || i.hts,
                  confidence: updatedProduct.confidence || i.confidence,
                  tariff: updatedProduct.tariff || i.tariff,
                };
              }
              return { ...i, status: 'complete' as const };
            }));
            setExceptionItem(null);
          }}
          onReject={() => {
            setExceptionItem(null);
          }}
        />
      )}
    </div>
  );
}