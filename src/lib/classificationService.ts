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
  status: 'in_progress' | 'completed' | 'cancelled';
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
  runType: 'single' | 'bulk' = 'single'
): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('classification_runs')
      .insert({
        user_id: userId,
        status: 'in_progress',
        run_type: runType,
        conversations: [],
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
  status: 'in_progress' | 'completed' | 'cancelled'
): Promise<void> {
  try {
    const updateData: any = { status };
    
    if (status === 'completed') {
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
  approved: boolean
): Promise<void> {
  try {
    // Check if approval record already exists
    const { data: existing } = await supabase
      .from('user_product_classification_history')
      .select('id')
      .eq('product_id', productId)
      .eq('classification_result_id', classificationResultId)
      .single();

    if (existing) {
      // Update existing record
      const { error } = await supabase
        .from('user_product_classification_history')
        .update({
          approved: approved,
          approved_at: approved ? new Date().toISOString() : null,
        })
        .eq('id', existing.id);

      if (error) {
        console.error('Error updating classification approval:', error);
        throw error;
      }
    } else {
      // Insert new record
      const { error } = await supabase
        .from('user_product_classification_history')
        .insert({
          product_id: productId,
          classification_result_id: classificationResultId,
          approved: approved,
          approved_at: approved ? new Date().toISOString() : null,
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




