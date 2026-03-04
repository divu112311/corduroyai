import { AlertCircle, CheckCircle, TrendingUp, ChevronRight, Package, X, ArrowLeft } from 'lucide-react';
import { useState, useEffect } from 'react';
import { ExceptionReview } from './ExceptionReview';
import { supabase } from '../lib/supabase';
import { getExceptions, getRecentActivity, getDashboardStats } from '../lib/dashboardService';
import { saveClassificationApproval } from '../lib/classificationService';

interface DashboardProps {
  onNavigate: (view: 'dashboard' | 'classify' | 'bulk' | 'profile' | 'activity') => void;
}

export function Dashboard({ onNavigate }: DashboardProps) {
  // Get time-appropriate greeting
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'Good morning';
    if (hour >= 12 && hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const [selectedException, setSelectedException] = useState<any>(null);
  const [showAllReviewModal, setShowAllReviewModal] = useState(false);
  const [sortBy, setSortBy] = useState<'priority' | 'product'>('priority');
  const [filterBy, setFilterBy] = useState<'all' | 'lowConfidence' | 'missingDoc' | 'multipleHTS' | 'materialIssues'>('all');
  const [resolvedItems, setResolvedItems] = useState<any[]>([]);
  const [showSuccessNotification, setShowSuccessNotification] = useState(false);
  const [lastResolvedItem, setLastResolvedItem] = useState<any>(null);
  const [activeExceptions, setActiveExceptions] = useState<any[]>([]);
  const [isLoadingExceptions, setIsLoadingExceptions] = useState(true);
  const [stats, setStats] = useState([
    { label: 'Exceptions', value: '0', subtext: 'Need Review', icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-50' },
    { label: 'Classified', value: '0', subtext: 'This Month', icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50' },
    { label: 'Product Profiles', value: '0', subtext: 'Total Saved', icon: Package, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Avg Confidence', value: '0%', subtext: 'Approved Products', icon: TrendingUp, color: 'text-purple-600', bg: 'bg-purple-50' },
  ]);
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

  // Load data from database on mount
  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        setIsLoadingExceptions(true);
        setIsLoadingRecentActivity(true);
        setIsLoadingStats(true);

        // Load all data in parallel for better performance
        const [dashboardStats, exceptions, recentActivity] = await Promise.all([
          getDashboardStats(user.id),
          getExceptions(user.id),
          getRecentActivity(user.id),
        ]);

        console.log('Loaded dashboard stats:', dashboardStats);
        setStats([
          { label: 'Exceptions', value: dashboardStats.exceptions.toString(), subtext: 'Need Review', icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-50' },
          { label: 'Classified', value: dashboardStats.classified.toLocaleString(), subtext: 'This Month', icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50' },
          { label: 'Product Profiles', value: dashboardStats.productProfiles.toLocaleString(), subtext: 'Total Saved', icon: Package, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Avg Confidence', value: dashboardStats.avgConfidence, subtext: 'Approved Products', icon: TrendingUp, color: 'text-purple-600', bg: 'bg-purple-50' },
        ]);

        setActiveExceptions(exceptions);

        setRecentClassifications(recentActivity);

        setIsLoadingExceptions(false);
        setIsLoadingRecentActivity(false);
        setIsLoadingStats(false);
        setLastSyncTime(new Date());
      } catch (error) {
        console.error('Error loading dashboard data:', error);
        setLoadError('Failed to load dashboard data. Please refresh the page to try again.');
        setIsLoadingExceptions(false);
        setIsLoadingRecentActivity(false);
        setIsLoadingStats(false);
      }
    };

    loadDashboardData();
  }, []);

  const [recentClassifications, setRecentClassifications] = useState<any[]>([]);
  const [isLoadingRecentActivity, setIsLoadingRecentActivity] = useState(true);

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'text-red-700 bg-red-100 border-red-200';
      case 'medium': return 'text-amber-700 bg-amber-100 border-amber-200';
      case 'low': return 'text-blue-700 bg-blue-100 border-blue-200';
      default: return 'text-slate-700 bg-slate-100 border-slate-200';
    }
  };

  const handleResolveException = async (exception: any) => {
    try {
      // Save approval to database
      if (exception.product_id && exception.classification_result_id) {
        await saveClassificationApproval(
          exception.product_id,
          exception.classification_result_id,
          true // approved = true
        );
      }

      // Update local state
      setResolvedItems(prev => [...prev, exception]);
      setLastResolvedItem(exception);
      setShowSuccessNotification(true);
      setActiveExceptions(prev => prev.filter(item => item.id !== exception.id));
      setSelectedException(null);
    } catch (error) {
      console.error('Error approving exception:', error);
      // Still update UI even if database save fails (user will see it again on refresh)
      setResolvedItems(prev => [...prev, exception]);
      setLastResolvedItem(exception);
      setShowSuccessNotification(true);
      setActiveExceptions(prev => prev.filter(item => item.id !== exception.id));
      setSelectedException(null);
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Page header */}
      <div className="flex-shrink-0 bg-white border-b border-slate-200 px-8 py-5">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">{getGreeting()}</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {activeExceptions.length > 0
                ? `${activeExceptions.length} item${activeExceptions.length !== 1 ? 's' : ''} need your attention`
                : 'Everything looks good — no open exceptions'}
              {resolvedItems.length > 0 && (
                <span className="ml-2 inline-flex items-center gap-1 text-emerald-600">
                  <CheckCircle className="w-3.5 h-3.5" />
                  {resolvedItems.length} resolved today
                </span>
              )}
            </p>
          </div>
          <div className="text-right flex-shrink-0">
            <div className="text-sm font-medium text-slate-700">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </div>
            <div className="text-xs text-slate-400 mt-0.5">
              {lastSyncTime ? `Synced ${lastSyncTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : 'Syncing...'}
            </div>
          </div>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-8">
          <div className="max-w-6xl mx-auto space-y-6">

            {loadError && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                <span className="text-red-700 text-sm flex-1">{loadError}</span>
                <button
                  onClick={() => window.location.reload()}
                  className="px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
                >
                  Retry
                </button>
              </div>
            )}

            {/* Stats row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {isLoadingStats ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="bg-white rounded-xl p-5 border border-slate-200 animate-pulse">
                    <div className="h-8 w-16 bg-slate-100 rounded mb-2" />
                    <div className="h-4 w-24 bg-slate-100 rounded" />
                  </div>
                ))
              ) : (
                stats.map((stat) => (
                  <div key={stat.label} className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between mb-3">
                      <div className={`${stat.bg} ${stat.color} p-2.5 rounded-lg`}>
                        <stat.icon className="w-4 h-4" />
                      </div>
                    </div>
                    <div className={`text-3xl font-bold tracking-tight mb-0.5 ${stat.color}`}>{stat.value}</div>
                    <div className="text-sm font-medium text-slate-700">{stat.label}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{stat.subtext}</div>
                  </div>
                ))
              )}
            </div>

            {/* Actions Required */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">Actions Required</h2>
                  <p className="text-xs text-slate-400 mt-0.5 uppercase tracking-wider font-medium">Exceptions needing review</p>
                </div>
                {activeExceptions.length > 0 && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-700 border border-red-200 rounded-full text-sm font-semibold">
                    <AlertCircle className="w-3.5 h-3.5" />
                    {activeExceptions.length} open
                  </span>
                )}
              </div>

              <div className="divide-y divide-slate-100">
                {isLoadingExceptions ? (
                  <div className="p-8 text-center">
                    <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-sm text-slate-500">Loading exceptions...</p>
                  </div>
                ) : activeExceptions.length === 0 ? (
                  <div className="p-10 text-center">
                    <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-3">
                      <CheckCircle className="w-6 h-6 text-emerald-500" />
                    </div>
                    <p className="text-sm font-medium text-slate-700">All clear — no exceptions</p>
                    <p className="text-xs text-slate-400 mt-1">Your classifications are in good shape</p>
                  </div>
                ) : (
                  <>
                    {(() => {
                      const filteredExceptions = activeExceptions
                        .filter(item => filterBy === 'all' || item.category === filterBy)
                        .sort((a, b) => {
                          if (sortBy === 'priority') {
                            const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
                            return (priorityOrder[a.priority] ?? 3) - (priorityOrder[b.priority] ?? 3);
                          } else if (sortBy === 'product') {
                            return a.product.localeCompare(b.product);
                          }
                          return 0;
                        });
                      const displayedExceptions = filteredExceptions.slice(0, 5);
                      const remainingCount = filteredExceptions.length - displayedExceptions.length;

                      return (
                        <>
                          {displayedExceptions.map((item) => (
                            <div
                              key={item.id}
                              className={`flex items-center gap-0 hover:bg-slate-50 transition-colors cursor-pointer group border-l-4 ${
                                item.priority === 'high' ? 'border-l-red-500' :
                                item.priority === 'medium' ? 'border-l-amber-400' : 'border-l-blue-400'
                              }`}
                              onClick={() => setSelectedException(item)}
                            >
                              <div className="flex-1 min-w-0 px-6 py-4">
                                <div className="flex items-center gap-2.5 mb-1.5">
                                  <span className="text-sm font-medium text-slate-900 truncate">{item.product}</span>
                                  <span className={`px-2 py-0.5 rounded-md text-xs font-semibold flex-shrink-0 ${getPriorityColor(item.priority)}`}>
                                    {item.priority}
                                  </span>
                                </div>
                                <p className="text-xs text-red-600 mb-1.5">⚠ {item.reason}</p>
                                <div className="flex items-center gap-3 text-xs text-slate-400">
                                  <span>SKU: {item.sku}</span>
                                  <span>·</span>
                                  <span className="font-mono">{item.hts}</span>
                                  <span>·</span>
                                  <span>{item.origin}</span>
                                </div>
                              </div>
                              <div className="pr-5 flex-shrink-0 flex items-center gap-2">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedException(item);
                                  }}
                                  className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-xs font-medium opacity-0 group-hover:opacity-100"
                                >
                                  Review
                                </button>
                                <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition-colors" />
                              </div>
                            </div>
                          ))}
                          {remainingCount > 0 && (
                            <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-100">
                              <button
                                onClick={() => setShowAllReviewModal(true)}
                                className="text-blue-600 hover:text-blue-700 text-sm font-medium flex items-center gap-1.5"
                              >
                                View {remainingCount} more exception{remainingCount > 1 ? 's' : ''}
                                <ChevronRight className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </>
                )}
              </div>
            </div>

            {/* Recent Activity */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">Recent Activity</h2>
                  <p className="text-xs text-slate-400 mt-0.5 uppercase tracking-wider font-medium">Latest classifications</p>
                </div>
                <button
                  onClick={() => onNavigate('activity')}
                  className="text-blue-600 hover:text-blue-700 text-sm font-medium flex items-center gap-1 transition-colors"
                >
                  View all <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              <div className="divide-y divide-slate-100">
                {resolvedItems.length > 0 && resolvedItems.slice().reverse().map((item, idx) => (
                  <div
                    key={`resolved-${idx}`}
                    className="flex items-center gap-4 px-6 py-4 bg-emerald-50/60 border-l-4 border-l-emerald-500 cursor-pointer hover:bg-emerald-50 transition-colors group"
                    onClick={() => onNavigate('profile')}
                  >
                    <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <CheckCircle className="w-4 h-4 text-emerald-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-900 truncate">{item.product}</div>
                      <div className="text-xs text-emerald-600">Exception resolved · Classification approved</div>
                    </div>
                    <div className="text-xs text-slate-400 whitespace-nowrap">Just now</div>
                    <ChevronRight className="w-4 h-4 text-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                ))}
                {isLoadingRecentActivity ? (
                  <div className="p-6 text-center text-sm text-slate-500">Loading activity...</div>
                ) : recentClassifications.length === 0 ? (
                  <div className="p-10 text-center">
                    <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
                      <Package className="w-6 h-6 text-slate-400" />
                    </div>
                    <p className="text-sm font-medium text-slate-700">No activity yet</p>
                    <p className="text-xs text-slate-400 mt-1">Classified products will appear here</p>
                  </div>
                ) : (
                  recentClassifications.map((activity, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-4 px-6 py-4 hover:bg-slate-50 transition-colors cursor-pointer group"
                      onClick={() => {
                        if (activity.classification_result_id) {
                          setSelectedException({
                            id: activity.classification_result_id,
                            product: activity.product,
                            description: activity.description || '',
                            hts: activity.hts,
                            confidence: activity.confidenceRaw || 0,
                            tariff_rate: activity.tariff_rate,
                            origin: activity.origin || 'Unknown',
                            reason: `Confidence: ${activity.confidence}`,
                            hts_description: activity.description,
                            reasoning: activity.reasoning,
                            chapter_code: activity.chapter_code,
                            chapter_title: activity.chapter_title,
                            section_code: activity.section_code,
                            section_title: activity.section_title,
                            cbp_rulings: activity.cbp_rulings,
                            rule_verification: activity.rule_verification,
                            alternate_classifications: activity.alternate_classifications,
                            product_id: activity.product_id,
                            classification_result_id: activity.classification_result_id,
                            classification_run_id: activity.classification_run_id,
                            status: activity.status,
                          });
                        } else {
                          onNavigate('activity');
                        }
                      }}
                    >
                      <div className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-900 truncate">{activity.product}</div>
                        <div className="text-xs text-slate-400">
                          <span className="font-mono">{activity.hts}</span>
                          <span className="mx-1.5">·</span>
                          <span>{activity.confidence} confidence</span>
                        </div>
                      </div>
                      <div className="text-xs text-slate-400 whitespace-nowrap">{activity.time}</div>
                      <ChevronRight className="w-4 h-4 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>
        </div>
      </div>

      {selectedException && (
        <ExceptionReview
          product={{
            id: selectedException.id,
            productName: selectedException.product,
            description: selectedException.description,
            hts: selectedException.hts,
            confidence: Math.round((selectedException.confidence || 0) * 100),
            tariff: selectedException.tariff_rate ? `${(selectedException.tariff_rate * 100).toFixed(1)}%` : 'N/A',
            origin: selectedException.origin,
            reason: selectedException.reason,
            // Extended classification data
            hts_description: selectedException.hts_description,
            reasoning: selectedException.reasoning,
            chapter_code: selectedException.chapter_code,
            chapter_title: selectedException.chapter_title,
            section_code: selectedException.section_code,
            section_title: selectedException.section_title,
            cbp_rulings: selectedException.cbp_rulings,
            rule_verification: selectedException.rule_verification,
            rule_confidence: selectedException.rule_confidence,
            alternate_classifications: selectedException.alternate_classifications,
            classification_run_id: selectedException.classification_run_id,
          }}
          readOnly={selectedException.status === 'approved'}
          onClose={() => setSelectedException(null)}
          onApprove={() => handleResolveException(selectedException)}
          onReject={() => setSelectedException(null)}
        />
      )}

      {/* All Items Needs Review Modal */}
      {showAllReviewModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-5xl w-full max-h-[85vh] flex flex-col shadow-2xl">
            {/* Modal Header */}
            <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setShowAllReviewModal(false)}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <ArrowLeft className="w-5 h-5 text-slate-600" />
                </button>
                <div>
                  <h2 className="text-slate-900">Items Needing Review</h2>
                  <p className="text-slate-600 text-sm">
                    {activeExceptions.filter(item => filterBy === 'all' || item.category === filterBy).length} item{activeExceptions.filter(item => filterBy === 'all' || item.category === filterBy).length !== 1 ? 's' : ''} requiring your attention
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setShowAllReviewModal(false)}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-slate-600" />
              </button>
            </div>

            {/* Filter and Sort Controls */}
            <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <span className="text-sm text-slate-600">Filter by:</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setFilterBy('all')}
                    className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                      filterBy === 'all' 
                        ? 'bg-blue-600 text-white' 
                        : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    All
                  </button>
                  <button
                    onClick={() => setFilterBy('lowConfidence')}
                    className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                      filterBy === 'lowConfidence' 
                        ? 'bg-red-600 text-white' 
                        : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    Low Confidence
                  </button>
                  <button
                    onClick={() => setFilterBy('missingDoc')}
                    className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                      filterBy === 'missingDoc' 
                        ? 'bg-amber-600 text-white' 
                        : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    Missing Docs
                  </button>
                  <button
                    onClick={() => setFilterBy('multipleHTS')}
                    className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                      filterBy === 'multipleHTS' 
                        ? 'bg-blue-600 text-white' 
                        : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    Multiple HTS
                  </button>
                  <button
                    onClick={() => setFilterBy('materialIssues')}
                    className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                      filterBy === 'materialIssues' 
                        ? 'bg-blue-600 text-white' 
                        : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    Material Issues
                  </button>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <span className="text-sm text-slate-600">Sort by:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as 'priority' | 'product')}
                  className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="priority">Priority</option>
                  <option value="product">Product Name</option>
                </select>
              </div>
            </div>

            {/* Modal Content - Scrollable */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="space-y-3">
                {activeExceptions
                  .filter(item => filterBy === 'all' || item.category === filterBy)
                  .sort((a, b) => {
                    if (sortBy === 'priority') {
                      const priorityOrder = { high: 0, medium: 1, low: 2 };
                      return priorityOrder[a.priority as keyof typeof priorityOrder] - priorityOrder[b.priority as keyof typeof priorityOrder];
                    } else if (sortBy === 'product') {
                      return a.product.localeCompare(b.product);
                    }
                    return 0;
                  })
                  .map((item) => (
                    <div 
                      key={item.id}
                      className="bg-white border border-slate-200 rounded-lg p-4 hover:border-blue-400 hover:shadow-md transition-all cursor-pointer group"
                      onClick={() => {
                        setShowAllReviewModal(false);
                        setSelectedException(item);
                      }}
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0 flex items-center gap-3">
                          <AlertCircle className={`w-5 h-5 flex-shrink-0 ${
                            item.priority === 'high' ? 'text-red-600' : 
                            item.priority === 'medium' ? 'text-amber-600' : 'text-blue-600'
                          }`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-slate-900 truncate">{item.product}</span>
                              <span className={`px-2 py-0.5 rounded text-xs border flex-shrink-0 ${getPriorityColor(item.priority)}`}>
                                {item.priority}
                              </span>
                            </div>
                            <div className="text-sm text-red-700 mb-1">{item.reason}</div>
                            <div className="flex items-center gap-3 text-xs text-slate-500">
                              <span>SKU: {item.sku}</span>
                              <span>•</span>
                              <span>HTS: {item.hts}</span>
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowAllReviewModal(false);
                              setSelectedException(item);
                            }}
                            className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm opacity-0 group-hover:opacity-100"
                          >
                            Review
                          </button>
                          <ChevronRight className="w-5 h-5 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </div>
                    </div>
                  ))}
                
                {activeExceptions.filter(item => filterBy === 'all' || item.category === filterBy).length === 0 && (
                  <div className="text-center py-12">
                    <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                    <h3 className="text-slate-900 mb-2">No items found</h3>
                    <p className="text-slate-600">Try adjusting your filters to see more items.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="text-sm text-slate-600">
                  Click any item to review and resolve
                </div>
                <button
                  onClick={() => setShowAllReviewModal(false)}
                  className="px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors text-sm"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showSuccessNotification && (
        <div className="fixed bottom-6 right-6 bg-green-500 text-white px-4 py-3 rounded shadow-lg flex items-center gap-2">
          <CheckCircle className="w-5 h-5" />
          <span>Resolved: {lastResolvedItem.product}</span>
          <button
            onClick={() => setShowSuccessNotification(false)}
            className="ml-4 text-white hover:text-gray-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

    </div>
  );
}