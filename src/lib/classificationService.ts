import { supabase } from './supabase';

export interface ClarificationMessage {
  step: 'preprocess' | 'parse' | 'rules' | 'rulings';
  type: 'question' | 'user_response' | 'system';
  content: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface ClassificationRun {
  id?: number;
  user_id: string;
  status: 'in_progress' | 'completed' | 'cancelled' | 'failed';
  run_type: 'single' | 'bulk';
  conversations?: ClarificationMessage[];
  created_at?: string;
  completed_at?: string | null;
}

/**
 * Create a new classification run
 */
export async function createClassificationRun(
  userId: string,
  runType: 'single' | 'bulk' = 'single',
  metadata?: { fileName?: string; totalItems?: number }
): Promise<number> {
  try {
    // Store file metadata as the first conversation entry for bulk runs
    const initialConversations: ClarificationMessage[] = metadata
      ? [{
          step: 'preprocess',
          type: 'system',
          content: `Bulk classification started: ${metadata.fileName || 'unknown file'}`,
          timestamp: new Date().toISOString(),
          metadata,
        }]
      : [];

    const { data, error } = await supabase
      .from('classification_runs')
      .insert({
        user_id: userId,
        status: 'in_progress',
        run_type: runType,
        conversations: initialConversations,
      })
      .select('id')
      .single();

    if (error) {
      console.error('Error creating classification run:', error);
      throw error;
    }

    return data.id;
  } catch (error) {
    console.error('Error creating classification run:', error);
    throw error;
  }
}

/**
 * Add a clarification message to a classification run
 */
export async function addClarificationMessage(
  runId: number,
  message: ClarificationMessage
): Promise<void> {
  try {
    // Get current conversations
    const { data: run, error: fetchError } = await supabase
      .from('classification_runs')
      .select('conversations')
      .eq('id', runId)
      .single();

    if (fetchError) {
      console.error('Error fetching classification run:', fetchError);
      throw fetchError;
    }

    // Add new message to conversations array
    const currentConversations = (run.conversations as ClarificationMessage[]) || [];
    const updatedConversations = [...currentConversations, message];

    // Update the run with new conversations
    const { error: updateError } = await supabase
      .from('classification_runs')
      .update({ conversations: updatedConversations })
      .eq('id', runId);

    if (updateError) {
      console.error('Error updating conversations:', updateError);
      throw updateError;
    }
  } catch (error) {
    console.error('Error adding clarification message:', error);
    throw error;
  }
}

/**
 * Update classification run status
 */
export async function updateClassificationRunStatus(
  runId: number,
  status: 'in_progress' | 'completed' | 'cancelled' | 'failed'
): Promise<void> {
  try {
    const updateData: any = { status };

    if (status === 'completed' || status === 'failed') {
      updateData.completed_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from('classification_runs')
      .update(updateData)
      .eq('id', runId);

    if (error) {
      console.error('Error updating classification run status:', error);
      throw error;
    }
  } catch (error) {
    console.error('Error updating classification run status:', error);
    throw error;
  }
}

/**
 * Save product to database
 */
export async function saveProduct(
  userId: string,
  runId: number,
  productData: {
    product_name: string;
    product_description?: string;
    country_of_origin?: string;
    materials?: any; // JSONB
    unit_cost?: number;
    vendor?: string;
    sku?: string;
  }
): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('user_products')
      .insert({
        user_id: userId,
        classification_run_id: runId,
        ...productData,
      })
      .select('id')
      .single();

    if (error) {
      console.error('Error saving product:', error);
      throw error;
    }

    return data.id;
  } catch (error) {
    console.error('Error saving product:', error);
    throw error;
  }
}

/**
 * Save classification result to database
 */
export async function saveClassificationResult(
  productId: number,
  runId: number,
  resultData: {
    hts_classification?: string;
    alternate_classification?: string;
    tariff_rate?: number;
    confidence?: number;
    model_version?: string;
    unit_cost?: number;
    tariff_amount?: number;
    total_cost?: number;
    description?: string;
    reasoning?: string;
    chapter_code?: string;
    chapter_title?: string;
    section_code?: string;
    section_title?: string;
    cbp_rulings?: any;
    rule_verification?: any;
    rule_confidence?: number;
    similarity_score?: number;
    alternate_classifications?: any;
  }
): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('user_product_classification_results')
      .insert({
        product_id: productId,
        classification_run_id: runId,
        ...resultData,
      })
      .select('id')
      .single();

    if (error) {
      console.error('Error saving classification result:', error);
      throw error;
    }

    return data.id;
  } catch (error) {
    console.error('Error saving classification result:', error);
    throw error;
  }
}

/**
 * Save approval/rejection to classification history
 */
export async function saveClassificationApproval(
  productId: number,
  classificationResultId: number,
  approved: boolean,
  approvalReason?: string
): Promise<void> {
  try {
    const record: Record<string, any> = {
      approved: approved,
      approved_at: approved ? new Date().toISOString() : null,
    };
    if (approvalReason) {
      record.approval_reason = approvalReason;
    }

    // Check if approval record already exists
    const { data: existing } = await supabase
      .from('user_product_classification_history')
      .select('id')
      .eq('product_id', productId)
      .eq('classification_result_id', classificationResultId)
      .single();

    if (existing) {
      const { error } = await supabase
        .from('user_product_classification_history')
        .update(record)
        .eq('id', existing.id);

      if (error) {
        console.error('Error updating classification approval:', error);
        throw error;
      }
    } else {
      const { error } = await supabase
        .from('user_product_classification_history')
        .insert({
          product_id: productId,
          classification_result_id: classificationResultId,
          ...record,
        });

      if (error) {
        console.error('Error saving classification approval:', error);
        throw error;
      }
    }
  } catch (error) {
    console.error('Error saving classification approval:', error);
    throw error;
  }
}

/**
 * Get classification run with conversations
 */
export async function getClassificationRun(runId: number): Promise<ClassificationRun | null> {
  try {
    const { data, error } = await supabase
      .from('classification_runs')
      .select('*')
      .eq('id', runId)
      .single();

    if (error) {
      console.error('Error fetching classification run:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error fetching classification run:', error);
    return null;
  }
}

/**
 * Get all products and results for a bulk classification run.
 * Used to resume / hydrate BulkUpload state after a page refresh.
 */
export async function getBulkRunResults(runId: number): Promise<{
  run: ClassificationRun;
  items: Array<{
    product: {
      id: number;
      product_name: string;
      product_description?: string;
      country_of_origin?: string;
      materials?: any;
      unit_cost?: number;
      vendor?: string;
      sku?: string;
    };
    result: {
      id: number;
      hts_classification?: string;
      confidence?: number;
      tariff_rate?: number;
      description?: string;
      reasoning?: string;
      alternate_classifications?: any;
      cbp_rulings?: any;
      rule_verification?: any;
      rule_confidence?: number;
      similarity_score?: number;
    } | null;
  }>;
} | null> {
  try {
    // 1. Get the run itself
    const { data: run, error: runError } = await supabase
      .from('classification_runs')
      .select('*')
      .eq('id', runId)
      .single();

    if (runError || !run) {
      console.error('Error fetching bulk run:', runError);
      return null;
    }

    // 2. Get all products for this run
    const { data: products, error: prodError } = await supabase
      .from('user_products')
      .select('*')
      .eq('classification_run_id', runId)
      .order('id', { ascending: true });

    if (prodError) {
      console.error('Error fetching bulk run products:', prodError);
      return null;
    }

    if (!products || products.length === 0) {
      return { run, items: [] };
    }

    // 3. Get all classification results for these products in one query
    const productIds = products.map((p: any) => p.id);
    const { data: results, error: resError } = await supabase
      .from('user_product_classification_results')
      .select('*')
      .in('product_id', productIds)
      .eq('classification_run_id', runId);

    if (resError) {
      console.error('Error fetching bulk run results:', resError);
      return null;
    }

    // Build a map of product_id → result for fast lookup
    const resultMap = new Map<number, any>();
    (results || []).forEach((r: any) => {
      resultMap.set(r.product_id, r);
    });

    // 4. Combine products with their results
    const items = products.map((p: any) => ({
      product: {
        id: p.id,
        product_name: p.product_name,
        product_description: p.product_description,
        country_of_origin: p.country_of_origin,
        materials: p.materials,
        unit_cost: p.unit_cost,
        vendor: p.vendor,
        sku: p.sku,
      },
      result: resultMap.get(p.id) ? {
        id: resultMap.get(p.id).id,
        hts_classification: resultMap.get(p.id).hts_classification,
        confidence: resultMap.get(p.id).confidence,
        tariff_rate: resultMap.get(p.id).tariff_rate,
        description: resultMap.get(p.id).description,
        reasoning: resultMap.get(p.id).reasoning,
        alternate_classifications: resultMap.get(p.id).alternate_classifications,
        cbp_rulings: resultMap.get(p.id).cbp_rulings,
        rule_verification: resultMap.get(p.id).rule_verification,
        rule_confidence: resultMap.get(p.id).rule_confidence,
        similarity_score: resultMap.get(p.id).similarity_score,
      } : null,
    }));

    return { run, items };
  } catch (error) {
    console.error('Error fetching bulk run results:', error);
    return null;
  }
}

/**
 * Summary of a bulk classification run for the history list.
 */
export interface BulkRunSummary {
  id: number;
  status: 'in_progress' | 'completed' | 'cancelled' | 'failed';
  created_at: string;
  completed_at: string | null;
  fileName: string;
  totalProducts: number;
  classifiedCount: number;
  totalItems: number; // original CSV row count from metadata
}

/**
 * Product data needed for rerunning a failed classification run.
 */
export interface RerunProduct {
  product_name: string;
  product_description?: string;
  country_of_origin?: string;
  materials?: any;
  unit_cost?: number;
  vendor?: string;
  sku?: string;
}

/**
 * Get all bulk classification runs for a user (most recent first).
 * Returns summary info including product counts for the history UI.
 */
export async function getUserBulkRuns(userId: string): Promise<BulkRunSummary[]> {
  try {
    // 1. Get recent bulk runs
    const { data: runs, error: runError } = await supabase
      .from('classification_runs')
      .select('*')
      .eq('user_id', userId)
      .eq('run_type', 'bulk')
      .order('created_at', { ascending: false })
      .limit(10);

    if (runError || !runs || runs.length === 0) {
      return [];
    }

    const runIds = runs.map((r: any) => r.id);

    // 2. Get product counts per run
    const { data: products } = await supabase
      .from('user_products')
      .select('id, classification_run_id')
      .in('classification_run_id', runIds);

    // 3. Get result counts per run (items that have a classification result)
    const { data: results } = await supabase
      .from('user_product_classification_results')
      .select('id, classification_run_id')
      .in('classification_run_id', runIds);

    // Build count maps
    const productCountMap = new Map<number, number>();
    const resultCountMap = new Map<number, number>();

    (products || []).forEach((p: any) => {
      productCountMap.set(p.classification_run_id, (productCountMap.get(p.classification_run_id) || 0) + 1);
    });
    (results || []).forEach((r: any) => {
      resultCountMap.set(r.classification_run_id, (resultCountMap.get(r.classification_run_id) || 0) + 1);
    });

    // 4. Build summaries
    return runs.map((run: any) => {
      // Extract file name and totalItems from conversations metadata
      let fileName = 'Bulk Run';
      let totalItems = 0;
      const conversations = run.conversations as ClarificationMessage[] | null;
      if (conversations && conversations.length > 0) {
        const firstMsg = conversations[0];
        if (firstMsg.metadata?.fileName) {
          fileName = firstMsg.metadata.fileName;
        }
        if (firstMsg.metadata?.totalItems) {
          totalItems = firstMsg.metadata.totalItems;
        }
      }

      return {
        id: run.id,
        status: run.status,
        created_at: run.created_at,
        completed_at: run.completed_at,
        fileName,
        totalProducts: productCountMap.get(run.id) || 0,
        classifiedCount: resultCountMap.get(run.id) || 0,
        totalItems,
      };
    });
  } catch (error) {
    console.error('Error fetching user bulk runs:', error);
    return [];
  }
}

/**
 * Get products from a classification run for rerunning.
 */
export async function getRunProductsForRerun(runId: number): Promise<RerunProduct[]> {
  try {
    const { data, error } = await supabase
      .from('user_products')
      .select('product_name, product_description, country_of_origin, materials, unit_cost, vendor, sku')
      .eq('classification_run_id', runId)
      .order('id', { ascending: true });

    if (error) {
      console.error('Error fetching products for rerun:', error);
      return [];
    }

    return (data || []).map((p: any) => ({
      product_name: p.product_name,
      product_description: p.product_description || undefined,
      country_of_origin: p.country_of_origin || undefined,
      materials: p.materials || undefined,
      unit_cost: p.unit_cost || undefined,
      vendor: p.vendor || undefined,
      sku: p.sku || undefined,
    }));
  } catch (error) {
    console.error('Error fetching products for rerun:', error);
    return [];
  }
}

/**
 * Check if a user already has a successful run with the same file name and same products.
 * Prevents accidental duplicate classifications.
 */
export async function checkDuplicateRun(
  userId: string,
  fileName: string,
  productNames: string[]
): Promise<{ isDuplicate: boolean; existingRunId?: number }> {
  try {
    // 1. Get completed bulk runs for this user
    const { data: runs, error } = await supabase
      .from('classification_runs')
      .select('id, conversations')
      .eq('user_id', userId)
      .eq('run_type', 'bulk')
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(20);

    if (error || !runs || runs.length === 0) return { isDuplicate: false };

    // 2. Filter runs with matching file name
    const matchingRuns = runs.filter((run: any) => {
      const conversations = run.conversations as ClarificationMessage[] | null;
      if (!conversations || conversations.length === 0) return false;
      return conversations[0]?.metadata?.fileName === fileName;
    });

    if (matchingRuns.length === 0) return { isDuplicate: false };

    // 3. For each matching run, compare product names
    const sortedNewNames = [...productNames].sort().join('|');

    for (const run of matchingRuns) {
      const { data: products } = await supabase
        .from('user_products')
        .select('product_name')
        .eq('classification_run_id', run.id);

      if (!products) continue;

      const sortedExistingNames = products.map((p: any) => p.product_name).sort().join('|');
      if (sortedNewNames === sortedExistingNames) {
        return { isDuplicate: true, existingRunId: run.id };
      }
    }

    return { isDuplicate: false };
  } catch (error) {
    console.error('Error checking duplicate run:', error);
    return { isDuplicate: false }; // Don't block on errors
  }
}

