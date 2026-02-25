import { supabase } from './supabase';
import { getUserMetadata } from './userService';

/**
 * New unified classification function
 * Calls python-proxy with product_description, user_id, and confidence_threshold
 */
export async function classifyProduct(
  productDescription: string,
  userId: string,
  confidenceThreshold?: number,
  clarificationContext?: {
    originalQuery: string;
    clarificationResponse: string;
  }
): Promise<{
  normalized?: string;
  attributes?: {
    material?: string;
    use?: string;
    [key: string]: any;
  };
  candidates?: Array<{
    hts: string;
    description: string;
    score: number;
  }>;
  matches?: Array<{
    hts: string;
    description: string;
    score: number;
    confidence?: number;
    rationale?: string;
  }> | {
    matched_rules?: Array<{
      hts: string;
      description: string;
      score: number;
      confidence?: number;
      rationale?: string;
    }>;
    attributes?: any;
    product?: string;
    type?: string;
  };
  max_confidence?: number;
  questions?: string[];
  clarifications?: string[];
  type?: string;
  needs_clarification?: boolean;
} | null> {
  try {
    // Get confidence threshold from user metadata if not provided
    let threshold = confidenceThreshold;
    if (threshold === undefined) {
      const userMetadata = await getUserMetadata(userId);
      threshold = userMetadata?.confidence_threshold ?? 0.75;
    }

    console.log('Invoking python-proxy edge function with:', {
      product_description: productDescription,
      user_id: userId,
      confidence_threshold: threshold,
    });

    const requestBody: Record<string, any> = {
      action: 'classify',
      product_description: productDescription,
      user_id: userId,
      confidence_threshold: threshold,
    };
    if (clarificationContext) {
      requestBody.is_clarification = true;
      requestBody.original_query = clarificationContext.originalQuery;
      requestBody.clarification_response = clarificationContext.clarificationResponse;
    }

    const { data: response, error } = await supabase.functions.invoke('python-dev', {
      body: requestBody,
    });

    console.log('Edge function response:', { data: response, error });

    if (error) {
      console.error('Supabase Edge Function error:', error);
      return null;
    }

    // Handle case where response might be a string that needs parsing
    let parsedResponse = response;
    if (typeof response === 'string') {
      try {
        parsedResponse = JSON.parse(response);
      } catch {
        return null;
      }
    }

    return parsedResponse;
  } catch (error: any) {
    console.error('Error calling python-proxy:', error);
    return null;
  }
}

/**
 * Generate a ruling/response for chat
 * (Kept for backward compatibility if still needed)
 */
export async function generateRuling(
  message: string,
  conversationHistory?: Array<{ role: string; content: string }>,
  productContext?: {
    name?: string;
    description?: string;
    hts?: string;
    origin?: string;
  }
): Promise<string | null> {
  // For now, return null as rulings endpoint may need separate implementation
  // This can be updated if rulings are still needed
  return null;
}

/**
 * @deprecated Use classifyProduct instead
 * Preprocess product data - kept for backward compatibility
 */
export async function preprocessProduct(data: any): Promise<any> {
  console.warn('preprocessProduct is deprecated, use classifyProduct instead');
  return null;
}

/**
 * @deprecated Use classifyProduct instead
 * Parse product information - kept for backward compatibility
 */
export async function parseProduct(data: any): Promise<any> {
  console.warn('parseProduct is deprecated, use classifyProduct instead');
  return null;
}

/**
 * @deprecated Use classifyProduct instead
 * Apply rules to product - kept for backward compatibility
 */
export async function applyRules(data: any): Promise<any> {
  console.warn('applyRules is deprecated, use classifyProduct instead');
  return null;
}


// ============================================================================
// Bulk Classification Functions
// ============================================================================

export interface BulkClassificationItem {
  id: string;
  row_number: number;
  extracted_data: {
    product_name?: string;
    description?: string;
    materials?: string;
    country_of_origin?: string;
    quantity?: string;
    unit_value?: string;
    [key: string]: any;
  };
  status: 'pending' | 'processing' | 'completed' | 'exception' | 'error';
  classification_result: any | null;
  error: string | null;
  clarification_questions: Array<{ question: string; options: string[] }> | null;
  clarification_answers: Record<string, string> | null;
}

export interface FileMetadata {
  detected_columns: string[];
  column_mapping: Record<string, string>;
  total_rows: number;
}

export interface BulkClassificationRun {
  run_id: string;
  user_id: string;
  file_name: string;
  file_type: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  total_items: number;
  progress_current: number;
  progress_total: number;
  results_summary: {
    completed: number;
    exceptions: number;
    errors: number;
  };
  items: BulkClassificationItem[];
  file_metadata?: FileMetadata;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

/**
 * Helper: parse a Supabase edge function response that may be a string or object.
 */
function parseEdgeFunctionResponse(response: any): any | null {
  if (response == null) return null;
  if (typeof response === 'string') {
    try {
      return JSON.parse(response);
    } catch {
      return null;
    }
  }
  return response;
}

/**
 * Start a bulk classification run by uploading a file.
 * Routes through the python-dev Supabase Edge Function with action='bulk-classify'.
 * The edge function forwards the file to the Python backend POST /bulk-classify.
 */
export async function startBulkClassification(
  file: File,
  userId: string,
  confidenceThreshold: number = 0.70,
): Promise<{ run_id: string; status: string; total_items: number; file_metadata?: FileMetadata } | null> {
  try {
    const formData = new FormData();
    formData.append('action', 'bulk-classify');
    formData.append('file', file);
    formData.append('user_id', userId);
    formData.append('confidence_threshold', confidenceThreshold.toString());

    console.log('Starting bulk classification via edge function:', {
      fileName: file.name,
      userId,
      confidenceThreshold,
    });

    const { data, error } = await supabase.functions.invoke('python-dev', {
      body: formData,
    });

    console.log('Bulk classification start response:', { data, error });

    if (error) {
      console.error('Edge function error (bulk-classify):', error);
      return null;
    }

    return parseEdgeFunctionResponse(data);
  } catch (err) {
    console.error('Error starting bulk classification:', err);
    return null;
  }
}

/**
 * Poll the status of a bulk classification run.
 * Routes through the python-dev Edge Function with action='bulk-classify-status'.
 * The edge function forwards to GET /bulk-classify/{run_id}.
 */
export async function getBulkClassificationStatus(
  runId: string,
): Promise<BulkClassificationRun | null> {
  try {
    const { data, error } = await supabase.functions.invoke('python-dev', {
      body: {
        action: 'bulk-classify-status',
        run_id: runId,
      },
    });

    if (error) {
      console.error('Edge function error (bulk-classify-status):', error);
      return null;
    }

    return parseEdgeFunctionResponse(data);
  } catch (err) {
    console.error('Error polling bulk classification status:', err);
    return null;
  }
}

/**
 * Submit clarification answers for a bulk classification exception item.
 * Routes through the python-dev Edge Function with action='bulk-classify-clarify'.
 * The edge function forwards to POST /bulk-classify/{run_id}/clarify.
 */
export async function clarifyBulkItem(
  runId: string,
  itemId: string,
  answers: Record<string, string>,
): Promise<any | null> {
  try {
    const { data, error } = await supabase.functions.invoke('python-dev', {
      body: {
        action: 'bulk-classify-clarify',
        run_id: runId,
        item_id: itemId,
        answers,
      },
    });

    if (error) {
      console.error('Edge function error (bulk-classify-clarify):', error);
      return null;
    }

    return parseEdgeFunctionResponse(data);
  } catch (err) {
    console.error('Error clarifying bulk item:', err);
    return null;
  }
}

/**
 * Cancel a running bulk classification.
 * Routes through the python-dev Edge Function with action='bulk-classify-cancel'.
 * The edge function forwards to DELETE /bulk-classify/{run_id}.
 */
export async function cancelBulkClassification(
  runId: string,
): Promise<boolean> {
  try {
    const { data, error } = await supabase.functions.invoke('python-dev', {
      body: {
        action: 'bulk-classify-cancel',
        run_id: runId,
      },
    });

    if (error) {
      console.error('Edge function error (bulk-classify-cancel):', error);
      return false;
    }

    const result = parseEdgeFunctionResponse(data);
    return result?.success === true;
  } catch (err) {
    console.error('Error cancelling bulk classification:', err);
    return false;
  }
}
