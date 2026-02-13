import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { ChevronRight, Clock, Package, CheckCircle, XCircle, Loader2 } from 'lucide-react';

interface ActivityItem {
  id: number;
  product: string;
  hts: string;
  confidence: string;
  time: string;
  status: string;
  runType: 'single' | 'bulk';
  runId: number;
  createdAt: string;
}

export function Activity() {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const loadActivities = async () => {
      try {
        setIsLoading(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setIsLoading(false);
          return;
        }

        // Get all completed classification runs
        const { data: runs, error: runsError } = await supabase
          .from('classification_runs')
          .select('id, created_at, status, run_type')
          .eq('user_id', user.id)
          .eq('status', 'completed')
          .order('created_at', { ascending: false });

        if (runsError || !runs || runs.length === 0) {
          setActivities([]);
          setIsLoading(false);
          return;
        }

        const runIds = runs.map(r => r.id);

        // OPTIMIZED: Get results first, then only fetch products we need
        const { data: allResults, error: resultsError } = await supabase
          .from('user_product_classification_results')
          .select('id, hts_classification, confidence, product_id, classified_at, classification_run_id')
          .in('classification_run_id', runIds)
          .order('classified_at', { ascending: false })
          .limit(500); // Limit to 500 most recent

        if (resultsError || !allResults || allResults.length === 0) {
          setActivities([]);
          setIsLoading(false);
          return;
        }

        // Get unique product IDs from results
        const productIds = [...new Set(allResults.map(r => r.product_id).filter(Boolean))] as number[];
        const resultIds = allResults.map(r => r.id);

        // Run remaining queries in parallel
        const [productsResponse, historyResponse] = await Promise.all([
          supabase
            .from('user_products')
            .select('id, product_name')
            .in('id', productIds)
            .eq('user_id', user.id),
          supabase
            .from('user_product_classification_history')
            .select('classification_result_id, approved')
            .in('classification_result_id', resultIds)
        ]);

        const products = productsResponse.data || [];
        if (products.length === 0) {
          setActivities([]);
          setIsLoading(false);
          return;
        }

        const productMap = new Map(products.map(p => [p.id, p]));

        // Create maps for quick lookup
        const runMap = new Map(runs.map(r => [r.id, r]));
        const allHistory = historyResponse.data || [];
        const approvedMap = new Map(
          allHistory
            .filter(h => h.approved === true)
            .map(h => [h.classification_result_id, true])
        );

        // Create activity items
        const activityItems: ActivityItem[] = allResults.map((result) => {
          const product = productMap.get(result.product_id);
          const run = runMap.get(result.classification_run_id);
          
          if (!product || !run) return null;

          const confidencePercent = Math.round(((result.confidence as number) || 0) * 100);
          const resultDate = new Date(result.classified_at || run.created_at);
          const now = new Date();
          const hoursAgo = Math.floor((now.getTime() - resultDate.getTime()) / (1000 * 60 * 60));
          
          let timeStr = '';
          if (hoursAgo < 1) {
            timeStr = 'Just now';
          } else if (hoursAgo < 24) {
            timeStr = `${hoursAgo} hour${hoursAgo > 1 ? 's' : ''} ago`;
          } else {
            const daysAgo = Math.floor(hoursAgo / 24);
            timeStr = `${daysAgo} day${daysAgo > 1 ? 's' : ''} ago`;
          }

          const isApproved = approvedMap.has(result.id);

          return {
            id: result.id,
            product: product.product_name || 'Unnamed Product',
            hts: (result.hts_classification as string) || 'N/A',
            confidence: `${confidencePercent}%`,
            time: timeStr,
            status: isApproved ? 'approved' : 'pending',
            runType: run.run_type as 'single' | 'bulk',
            runId: run.id,
            createdAt: run.created_at,
          };
        }).filter((item): item is ActivityItem => item !== null);

        // Sort by created_at (most recent first)
        activityItems.sort((a, b) => {
          const dateA = new Date(a.createdAt).getTime();
          const dateB = new Date(b.createdAt).getTime();
          return dateB - dateA;
        });

        setActivities(activityItems);
        setIsLoading(false);
      } catch (error) {
        console.error('Error loading activities:', error);
        setIsLoading(false);
      }
    };

    loadActivities();
  }, []);

  // Filter activities based on search query
  const filteredActivities = activities.filter(activity =>
    activity.product.toLowerCase().includes(searchQuery.toLowerCase()) ||
    activity.hts.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900 mb-2">All Activity</h1>
        <p className="text-slate-600">View all classification runs and activity</p>
      </div>

      {/* Search */}
      <div className="mb-6">
        <input
          type="text"
          placeholder="Search by product name or HTS code..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {/* Activity List */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        {isLoading ? (
          <div className="p-12 text-center">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
            <p className="text-slate-500">Loading activity...</p>
          </div>
        ) : filteredActivities.length === 0 ? (
          <div className="p-12 text-center">
            <Clock className="w-12 h-12 text-slate-400 mx-auto mb-4" />
            <p className="text-slate-500 text-lg mb-2">No activity found</p>
            <p className="text-slate-400 text-sm">
              {searchQuery ? 'Try adjusting your search query' : 'Start classifying products to see activity here'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {filteredActivities.map((activity) => (
              <div
                key={activity.id}
                className="flex items-center gap-4 p-4 hover:bg-slate-50 transition-colors group"
              >
                <div className="flex-shrink-0">
                  {activity.status === 'approved' ? (
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  ) : (
                    <Clock className="w-5 h-5 text-amber-600" />
                  )}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-slate-900 font-medium">{activity.product}</span>
                    <span className="px-2 py-0.5 text-xs rounded-full bg-slate-100 text-slate-600">
                      {activity.runType === 'bulk' ? 'Bulk' : 'Single'}
                    </span>
                  </div>
                  <div className="text-slate-600 text-sm">
                    HTS: <span className="font-mono">{activity.hts}</span> • Confidence: <span className="font-medium">{activity.confidence}</span>
                  </div>
                </div>

                <div className="flex items-center gap-4 flex-shrink-0">
                  <div className="text-right">
                    <div className="text-slate-900 text-sm font-medium">{activity.time}</div>
                    <div className="text-slate-500 text-xs">
                      {activity.status === 'approved' ? 'Approved' : 'Pending'}
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Summary */}
      {!isLoading && filteredActivities.length > 0 && (
        <div className="mt-6 text-center text-slate-500 text-sm">
          Showing {filteredActivities.length} of {activities.length} activity {activities.length === 1 ? 'item' : 'items'}
        </div>
      )}
    </div>
  );
}

