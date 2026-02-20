import { supabase } from './supabase';
import { getUserMetadata } from './userService';

export interface ExceptionItem {
  id: number;
  product: string;
  sku: string;
  reason: string;
  hts: string;
  status: string;
  origin: string;
  value: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  category: 'lowConfidence' | 'missingDoc' | 'multipleHTS' | 'materialIssues';
  product_id: number;
  classification_result_id: number;
  confidence: number;
  tariff_rate?: number;
  // Extended classification data
  hts_description?: string;
  reasoning?: string;
  chapter_code?: string;
  chapter_title?: string;
  section_code?: string;
  section_title?: string;
  cbp_rulings?: any;
  rule_verification?: any;
  rule_confidence?: number;
  classification_trace?: string;
  alternate_classifications?: any;
  classification_run_id?: number;
}

export interface RecentActivity {
  product: string;
  hts: string;
  confidence: string;
  time: string;
  status: string;
  classification_result_id?: number;
  product_id?: number;
  description?: string;
  origin?: string;
  tariff_rate?: number;
  reasoning?: string;
  chapter_code?: string;
  chapter_title?: string;
  section_code?: string;
  section_title?: string;
  cbp_rulings?: any;
  rule_verification?: any;
  alternate_classifications?: any;
  classification_trace?: string;
  confidenceRaw?: number;
  classification_run_id?: number;
}

/**
 * Fetch exceptions (products with confidence < threshold and not approved)
 * OPTIMIZED: Runs queries in parallel instead of sequentially
 */
export async function getExceptions(userId: string): Promise<ExceptionItem[]> {
  try {
    // Get user's confidence threshold
    const userMetadata = await getUserMetadata(userId);
    if (!userMetadata) {
      console.warn('getExceptions: No user metadata found for user:', userId);
      return [];
    }

    const threshold = userMetadata.confidence_threshold ?? 0.8;
    console.log('getExceptions: Using confidence threshold:', threshold);

    // OPTIMIZED: Get results with product data in fewer queries
    // First get product IDs for this user
    const { data: userProducts, error: productsError } = await supabase
      .from('user_products')
      .select('id')
      .eq('user_id', userId)
      .limit(1000); // Reasonable limit

    if (productsError) {
      console.error('getExceptions: Error fetching user products:', productsError);
      return [];
    }
    if (!userProducts || userProducts.length === 0) {
      console.log('getExceptions: No products found for user');
      return [];
    }

    const productIds = userProducts.map(p => p.id);

    // Get classification results for user's products (including extended fields)
    // Use .or() to catch both low-confidence AND null-confidence results
    const { data: allResults, error: resultsError } = await supabase
      .from('user_product_classification_results')
      .select('id, confidence, hts_classification, product_id, classification_run_id, classified_at, tariff_rate, description, reasoning, chapter_code, chapter_title, section_code, section_title, cbp_rulings, rule_verification, rule_confidence, classification_trace, alternate_classifications')
      .in('product_id', productIds)
      .or(`confidence.lt.${threshold},confidence.is.null`)
      .order('classified_at', { ascending: false })
      .limit(100); // Limit to 100 most recent exceptions

    if (resultsError) {
      console.error('getExceptions: Error fetching classification results:', resultsError);
      return [];
    }
    if (!allResults || allResults.length === 0) {
      console.log('getExceptions: No results found below threshold', threshold, 'for', productIds.length, 'products');
      return [];
    }

    console.log('getExceptions: Found', allResults.length, 'results below threshold', threshold);

    // Get approval history and products in parallel
    const resultIds = allResults.map(r => r.id);
    const [historyResponse, productsResponse] = await Promise.all([
      supabase
        .from('user_product_classification_history')
        .select('classification_result_id, approved')
        .in('classification_result_id', resultIds)
        .eq('approved', true),
      supabase
        .from('user_products')
        .select('id, product_name, product_description, country_of_origin, unit_cost')
        .in('id', productIds)
    ]);

    // Create a set of approved result IDs
    const approvedIds = new Set(
      (historyResponse.data || []).map(h => h.classification_result_id)
    );

    // Create product map
    const productMap = new Map((productsResponse.data || []).map(p => [p.id, p]));

    // Filter out approved results and map to ExceptionItem format
    const exceptions: ExceptionItem[] = allResults
      .filter(r => !approvedIds.has(r.id))
      .map((result: any) => {
        const product = productMap.get(result.product_id);
        if (!product) return null;
        
        const confidencePercent = Math.round((result.confidence || 0) * 100);
        
        // Determine priority based on confidence
        let priority: 'high' | 'medium' | 'low' = 'medium';
        if (result.confidence < threshold * 0.7) {
          priority = 'high';
        } else if (result.confidence < threshold * 0.85) {
          priority = 'medium';
        } else {
          priority = 'low';
        }

        // Format value
        const value = product.unit_cost
          ? `$${Number(product.unit_cost).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          : 'N/A';

        // Determine category from actual data instead of hardcoding
        let category: 'lowConfidence' | 'missingDoc' | 'multipleHTS' | 'materialIssues' = 'lowConfidence';
        const ruleVerification = result.rule_verification as any;
        const altClassifications = result.alternate_classifications as any[];

        if (altClassifications && altClassifications.length > 1) {
          // Multiple alternative HTS codes with close confidence scores
          const topAltConfidence = altClassifications[0]?.confidence || 0;
          if (topAltConfidence > 0 && (confidencePercent - topAltConfidence) < 15) {
            category = 'multipleHTS';
          }
        }
        if (ruleVerification?.missing_info && ruleVerification.missing_info.length > 0) {
          // Check if missing info relates to materials
          const missingStr = JSON.stringify(ruleVerification.missing_info).toLowerCase();
          if (missingStr.includes('material') || missingStr.includes('composition')) {
            category = 'materialIssues';
          } else {
            category = 'missingDoc';
          }
        }
        // If confidence is very low and no other specific category, keep lowConfidence

        // Build a more descriptive reason
        let reason = `Low confidence (${confidencePercent}%)`;
        if (ruleVerification?.missing_info && ruleVerification.missing_info.length > 0) {
          reason = ruleVerification.missing_info[0];
        } else if (ruleVerification?.checks_failed && ruleVerification.checks_failed.length > 0) {
          reason = ruleVerification.checks_failed[0];
        } else if (result.reasoning) {
          // Truncate reasoning for the summary
          const reasonText = result.reasoning as string;
          reason = reasonText.length > 100 ? reasonText.substring(0, 100) + '...' : reasonText;
        }

        return {
          id: result.id,
          product: product.product_name || 'Unnamed Product',
          sku: `PROD-${product.id}`,
          reason,
          hts: result.hts_classification || 'N/A',
          status: priority === 'high' ? 'urgent' : 'review',
          origin: product.country_of_origin || 'Unknown',
          value: value,
          description: product.product_description || '',
          priority: priority,
          category,
          product_id: product.id,
          classification_result_id: result.id,
          confidence: result.confidence,
          tariff_rate: result.tariff_rate,
          // Extended classification data
          hts_description: (result.description as string) || undefined,
          reasoning: (result.reasoning as string) || undefined,
          chapter_code: (result.chapter_code as string) || undefined,
          chapter_title: (result.chapter_title as string) || undefined,
          section_code: (result.section_code as string) || undefined,
          section_title: (result.section_title as string) || undefined,
          cbp_rulings: result.cbp_rulings || undefined,
          rule_verification: result.rule_verification || undefined,
          rule_confidence: (result.rule_confidence as number) || undefined,
          classification_trace: (result.classification_trace as string) || undefined,
          alternate_classifications: result.alternate_classifications || undefined,
          classification_run_id: (result.classification_run_id as number) || undefined,
        };
      })
      .filter((e): e is ExceptionItem => e !== null);

    return exceptions;
  } catch (error) {
    console.error('Error fetching exceptions:', error);
    return [];
  }
}

/**
 * Fetch recent classification runs (latest 3)
 * OPTIMIZED: Fixed N+1 query problem by fetching all data in parallel
 */
export async function getRecentActivity(userId: string): Promise<RecentActivity[]> {
  try {
    // OPTIMIZED: Get latest 3 classification runs with limit
    const { data: runs, error } = await supabase
      .from('classification_runs')
      .select('id, created_at, status, run_type')
      .eq('user_id', userId)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(3);

    if (error || !runs || runs.length === 0) {
      return [];
    }

    const runIds = runs.map(r => r.id);

    // Get all classification results for these runs in one query (including extended fields)
    const { data: allResults, error: resultsError } = await supabase
      .from('user_product_classification_results')
      .select('id, hts_classification, confidence, product_id, classification_run_id, tariff_rate, description, reasoning, chapter_code, chapter_title, section_code, section_title, cbp_rulings, rule_verification, alternate_classifications, classification_trace')
      .in('classification_run_id', runIds)
      .order('classified_at', { ascending: false });

    if (resultsError || !allResults || allResults.length === 0) {
      return [];
    }

    // Get unique product IDs
    const productIds = [...new Set(allResults.map(r => r.product_id).filter(Boolean))] as number[];

    // Get all products in one query
    const { data: products, error: productsError } = await supabase
      .from('user_products')
      .select('id, product_name, product_description, country_of_origin')
      .in('id', productIds)
      .eq('user_id', userId);

    if (productsError || !products) {
      return [];
    }

    // Create maps for quick lookup
    const productMap = new Map(products.map(p => [p.id, p]));
    const runMap = new Map(runs.map(r => [r.id, r]));
    
    // Group results by run_id and get first result for each run
    const resultsByRun = new Map<number, typeof allResults[0]>();
    for (const result of allResults) {
      if (!resultsByRun.has(result.classification_run_id)) {
        resultsByRun.set(result.classification_run_id, result);
      }
    }

    // Map to RecentActivity format
    const activities: RecentActivity[] = runs
      .map(run => {
        const result = resultsByRun.get(run.id);
        if (!result || !result.product_id) return null;

        const product = productMap.get(result.product_id);
        if (!product) return null;

        const confidencePercent = Math.round(((result.confidence as number) || 0) * 100);
        const runDate = new Date(run.created_at);
        const now = new Date();
        const hoursAgo = Math.floor((now.getTime() - runDate.getTime()) / (1000 * 60 * 60));
        
        let timeStr = '';
        if (hoursAgo < 1) {
          timeStr = 'Just now';
        } else if (hoursAgo < 24) {
          timeStr = `${hoursAgo} hour${hoursAgo > 1 ? 's' : ''} ago`;
        } else {
          const daysAgo = Math.floor(hoursAgo / 24);
          timeStr = `${daysAgo} day${daysAgo > 1 ? 's' : ''} ago`;
        }

        return {
          product: product.product_name || 'Unnamed Product',
          hts: (result.hts_classification as string) || 'N/A',
          confidence: `${confidencePercent}%`,
          time: timeStr,
          status: 'auto-approved',
          classification_result_id: result.id,
          product_id: result.product_id,
          description: (result.description as string) || product.product_description || '',
          origin: product.country_of_origin || 'Unknown',
          tariff_rate: (result.tariff_rate as number) || undefined,
          reasoning: (result.reasoning as string) || undefined,
          chapter_code: (result.chapter_code as string) || undefined,
          chapter_title: (result.chapter_title as string) || undefined,
          section_code: (result.section_code as string) || undefined,
          section_title: (result.section_title as string) || undefined,
          cbp_rulings: result.cbp_rulings || undefined,
          rule_verification: result.rule_verification || undefined,
          alternate_classifications: result.alternate_classifications || undefined,
          classification_trace: (result.classification_trace as string) || undefined,
          confidenceRaw: (result.confidence as number) || 0,
          classification_run_id: (result.classification_run_id as number) || undefined,
        };
      })
      .filter((a): a is RecentActivity => a !== null);

    return activities;
  } catch (error) {
    console.error('Error fetching recent activity:', error);
    return [];
  }
}

export interface DashboardStats {
  exceptions: number;
  classified: number;
  productProfiles: number;
  avgConfidence: string;
}

/**
 * Fetch dashboard statistics
 * OPTIMIZED: Runs queries in parallel and uses efficient counting
 */
export async function getDashboardStats(userId: string): Promise<DashboardStats> {
  try {
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

    // OPTIMIZED: Run all queries in parallel including user metadata
    const [
      userMetadataResponse,
      runsResponse,
      userProductsResponse,
      approvedHistoryResponse
    ] = await Promise.all([
      getUserMetadata(userId),
      // Get classification runs count for last month
      supabase
        .from('classification_runs')
        .select('id', { count: 'exact', head: false })
        .eq('user_id', userId)
        .eq('status', 'completed')
        .gte('created_at', oneMonthAgo.toISOString()),
      // Get user product IDs
      supabase
        .from('user_products')
        .select('id')
        .eq('user_id', userId),
      // Get all approved history
      supabase
        .from('user_product_classification_history')
        .select('classification_result_id')
        .eq('approved', true)
    ]);

    const userMetadata = userMetadataResponse;
    const threshold = userMetadata?.confidence_threshold ?? 0.8;
    const classifiedCount = runsResponse.count || 0;
    const userProductIds = new Set((userProductsResponse.data || []).map(p => p.id));
    const approvedResultIds = new Set((approvedHistoryResponse.data || []).map(h => h.classification_result_id));

    if (userProductIds.size === 0) {
      return {
        exceptions: 0,
        classified: classifiedCount,
        productProfiles: 0,
        avgConfidence: '0%',
      };
    }

    // Get approved results for user's products only
    // Guard against empty arrays which can cause Supabase query issues
    let userApprovedResults: any[] = [];
    if (approvedResultIds.size > 0 && userProductIds.size > 0) {
      const { data: approvedResults } = await supabase
        .from('user_product_classification_results')
        .select('id, confidence, product_id')
        .in('id', Array.from(approvedResultIds))
        .in('product_id', Array.from(userProductIds));
      userApprovedResults = (approvedResults || []).filter(r => userProductIds.has(r.product_id));
    }
    const productProfilesCount = userApprovedResults.length;
    const userApprovedResultIds = new Set(userApprovedResults.map(r => r.id));

    // Get exceptions: results with confidence < threshold (or null) and not approved
    const { data: exceptionResults } = await supabase
      .from('user_product_classification_results')
      .select('id')
      .in('product_id', Array.from(userProductIds))
      .or(`confidence.lt.${threshold},confidence.is.null`)
      .limit(1000); // Reasonable limit
    
    const exceptionsCount = (exceptionResults || []).filter(r => !userApprovedResultIds.has(r.id)).length;

    // Calculate average confidence for approved products
    let avgConfidence = '0%';
    if (userApprovedResults.length > 0) {
      const confidences = userApprovedResults
        .map((r: any) => r.confidence)
        .filter((c): c is number => c !== null && c !== undefined);
      
      if (confidences.length > 0) {
        const sum = confidences.reduce((acc, val) => acc + val, 0);
        const avg = (sum / confidences.length) * 100;
        avgConfidence = `${avg.toFixed(1)}%`;
      }
    }

    return {
      exceptions: exceptionsCount || 0,
      classified: classifiedCount,
      productProfiles: productProfilesCount,
      avgConfidence: avgConfidence,
    };
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    return {
      exceptions: 0,
      classified: 0,
      productProfiles: 0,
      avgConfidence: '0%',
    };
  }
}

export interface ProductProfile {
  id: number;
  name: string;
  sku: string;
  hts: string;
  materials: string;
  origin: string;
  cost: string;
  vendor: string;
  confidence: number;
  lastUpdated: string;
  category: string;
  // From database
  tariffRate: number | null;
  tariffAmount: number | null;
  totalCost: number | null;
  alternateClassification: string | null;
  unitCost: number | null;
}

/**
 * Fetch all approved product profiles for a user
 * Only returns products that have been approved and saved as profiles
 */
export async function getProductProfiles(userId: string): Promise<ProductProfile[]> {
  try {
    // OPTIMIZED: Get product profiles with limit
    const { data: profiles, error: profilesError } = await supabase
      .from('user_product_profiles')
      .select('id, product_id, classification_result_id, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(500); // Limit to 500 most recent profiles

    if (profilesError) {
      console.error('Error fetching product profiles:', profilesError);
      return [];
    }

    if (!profiles || profiles.length === 0) {
      return [];
    }

    // Get all classification result IDs from profiles
    const classificationResultIds = profiles
      .map(p => p.classification_result_id)
      .filter(Boolean) as number[];

    if (classificationResultIds.length === 0) {
      return [];
    }

    // Verify these results are approved
    const { data: approvedHistory, error: historyError } = await supabase
      .from('user_product_classification_history')
      .select('classification_result_id, approved')
      .in('classification_result_id', classificationResultIds)
      .eq('approved', true);

    if (historyError) {
      console.error('Error fetching approval history:', historyError);
      return [];
    }

    if (!approvedHistory || approvedHistory.length === 0) {
      return [];
    }

    // Create a set of approved result IDs
    const approvedResultIds = new Set(
      approvedHistory.map(h => h.classification_result_id)
    );

    // Filter profiles to only include approved ones
    const approvedProfiles = profiles.filter(p => 
      p.classification_result_id && approvedResultIds.has(p.classification_result_id)
    );

    if (approvedProfiles.length === 0) {
      return [];
    }

    // Get all product IDs
    const productIds = approvedProfiles.map(p => p.product_id).filter(Boolean) as number[];
    const resultIds = approvedProfiles.map(p => p.classification_result_id).filter(Boolean) as number[];

    // Fetch products and classification results in parallel
    const [productsResponse, resultsResponse] = await Promise.all([
      supabase
        .from('user_products')
        .select('id, product_name, product_description, country_of_origin, materials, vendor, unit_cost, updated_at')
        .in('id', productIds)
        .eq('user_id', userId),
      supabase
        .from('user_product_classification_results')
        .select('id, hts_classification, alternate_classification, confidence, classified_at, tariff_rate, tariff_amount, total_cost, unit_cost')
        .in('id', resultIds)
    ]);

    if (productsResponse.error) {
      console.error('Error fetching products:', productsResponse.error);
      return [];
    }

    if (resultsResponse.error) {
      console.error('Error fetching classification results:', resultsResponse.error);
      return [];
    }

    const products = productsResponse.data || [];
    const results = resultsResponse.data || [];

    // Create maps for quick lookup
    const productMap = new Map(products.map(p => [p.id, p]));
    const resultMap = new Map(results.map(r => [r.id, r]));

    // Map to ProductProfile format
    const productProfiles: ProductProfile[] = approvedProfiles
      .map(profile => {
        const product = productMap.get(profile.product_id);
        const result = resultMap.get(profile.classification_result_id || 0);

        if (!product || !result) {
          return null;
        }

        // Format materials (handle JSONB)
        let materialsStr = 'N/A';
        if (product.materials) {
          if (typeof product.materials === 'string') {
            materialsStr = product.materials;
          } else if (Array.isArray(product.materials)) {
            materialsStr = product.materials.join(', ');
          } else if (typeof product.materials === 'object') {
            materialsStr = JSON.stringify(product.materials);
          }
        }

        // Format cost - use unit_cost from product, fallback to result
        const unitCostValue = product.unit_cost || result.unit_cost || null;
        const cost = unitCostValue 
          ? `$${Number(unitCostValue).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          : 'N/A';

        // Calculate confidence as percentage
        const confidence = Math.round(((result.confidence as number) || 0) * 100);
        
        // Get tariff data from database
        const tariffRate = result.tariff_rate ? Number(result.tariff_rate) : null;
        const tariffAmount = result.tariff_amount ? Number(result.tariff_amount) : null;
        const totalCost = result.total_cost ? Number(result.total_cost) : null;
        const alternateClassification = result.alternate_classification || null;

        // Determine category from HTS code (simplified - can be enhanced)
        let category = 'Other';
        const hts = (result.hts_classification as string) || '';
        if (hts.startsWith('85')) category = 'Electrical';
        else if (hts.startsWith('61')) category = 'Apparel';
        else if (hts.startsWith('94')) category = 'Furniture';
        else if (hts.startsWith('73')) category = 'Metal Products';
        else if (hts.startsWith('42')) category = 'Leather Goods';
        else if (hts.startsWith('91')) category = 'Timepieces';
        else if (hts.startsWith('55')) category = 'Textiles';
        else if (hts.startsWith('69')) category = 'Ceramics';
        else if (hts.startsWith('95')) category = 'Toys & Games';
        else if (hts.startsWith('44')) category = 'Wood Products';

        // Use updated_at from profile, fallback to classified_at, then product updated_at
        const lastUpdated = profile.updated_at || result.classified_at || product.updated_at || new Date().toISOString();

        return {
          id: profile.id, // Use profile ID
          productId: product.id, // Add actual product_id for fetching documents
          name: product.product_name || 'Unnamed Product',
          description: product.product_description || '', // Add product description
          sku: `PROD-${product.id}`,
          hts: hts || 'N/A',
          materials: materialsStr,
          origin: product.country_of_origin || 'Unknown',
          cost: cost,
          vendor: product.vendor || 'N/A',
          confidence: confidence,
          lastUpdated: lastUpdated,
          category: category,
          // From database
          tariffRate: tariffRate,
          tariffAmount: tariffAmount,
          totalCost: totalCost,
          alternateClassification: alternateClassification,
          unitCost: unitCostValue,
        };
      })
      .filter((p): p is ProductProfile => p !== null);

    return productProfiles;
  } catch (error) {
    console.error('Error fetching product profiles:', error);
    return [];
  }
}

