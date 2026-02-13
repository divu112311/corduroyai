import { supabase } from './supabase';
import { getUserMetadata } from './userService';

/**
 * New unified classification function
 * Calls python-proxy with product_description, user_id, and confidence_threshold
 */
export async function classifyProduct(
  productDescription: string,
  userId: string,
  confidenceThreshold?: number
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
      threshold = userMetadata?.confidence_threshold || 0.75;
    }

    console.log('Invoking python-proxy edge function with:', {
      product_description: productDescription,
      user_id: userId,
      confidence_threshold: threshold,
    });

    const { data: response, error } = await supabase.functions.invoke('python-proxy', {
      body: {
        product_description: productDescription,
        user_id: userId,
        confidence_threshold: threshold,
      },
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


