import { AlertCircle, CheckCircle, TrendingUp, MessageSquare, Sparkles, ChevronRight, Package, X, ArrowLeft } from 'lucide-react';
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
  const [showAIAssistant, setShowAIAssistant] = useState(false);
  const [showAllReviewModal, setShowAllReviewModal] = useState(false);
  const [sortBy, setSortBy] = useState<'priority' | 'product'>('priority');
  const [filterBy, setFilterBy] = useState<'all' | 'lowConfidence' | 'missingDoc' | 'multipleHTS' | 'materialIssues'>('all');
  const [resolvedItems, setResolvedItems] = useState<any[]>([]);
  const [showSuccessNotification, setShowSuccessNotification] = useState(false);
  const [lastResolvedItem, setLastResolvedItem] = useState<any>(null);
  const [activeExceptions, setActiveExceptions] = useState<any[]>([]);
  const [isLoadingExceptions, setIsLoadingExceptions] = useState(true);
  const [aiMessages, setAiMessages] = useState<any[]>([]);
  const [aiInput, setAiInput] = useState('');
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

        // Update AI message based on exception count
        if (exceptions.length > 0) {
          setAiMessages([
            { role: 'assistant', text: `Hi! I noticed you have ${exceptions.length} exception${exceptions.length > 1 ? 's' : ''} requiring review. Would you like me to help you resolve them?` }
          ]);
        } else {
          setAiMessages([
            { role: 'assistant', text: "Hi! You're all caught up - no exceptions requiring review at the moment." }
          ]);
        }

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

  const handleSendMessage = () => {
    if (!aiInput.trim()) return;

    setAiMessages(prev => [...prev, { role: 'user', text: aiInput }]);

    // Generate contextual response based on current exceptions
    setTimeout(() => {
      const lowerInput = aiInput.toLowerCase();
      let responseText = '';

      if (activeExceptions.length > 0 && (lowerInput.includes('help') || lowerInput.includes('exception') || lowerInput.includes('review'))) {
        const topException = activeExceptions[0];
        responseText = `You have ${activeExceptions.length} exception${activeExceptions.length > 1 ? 's' : ''} to review. The highest priority is "${topException.product}" (HTS: ${topException.hts}). Click on it in the Actions Required section to start reviewing.`;
      } else if (lowerInput.includes('classify') || lowerInput.includes('product')) {
        responseText = `To classify a new product, go to the "Classify Product" section in the sidebar. You can enter product details and I'll suggest the best HTS code with confidence scoring.`;
      } else {
        responseText = `I can help you with:\n• Reviewing exceptions in your queue\n• Classifying new products\n• Understanding HTS codes and tariff rates\n\nWhat would you like to do?`;
      }

      setAiMessages(prev => [...prev, { role: 'assistant', text: responseText }]);
    }, 800);

    setAiInput('');
  };

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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 p-6">
      <div className="max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-2">
            <div className="flex-1 min-w-0">
              <h1 className="text-slate-900 mb-1">{getGreeting()} 👋</h1>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                <p className="text-slate-600">
                  You have {activeExceptions.length} item{activeExceptions.length !== 1 ? 's' : ''} requiring your attention
                </p>
                {resolvedItems.length > 0 && (
                  <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm flex items-center gap-1.5 w-fit">
                    <CheckCircle className="w-4 h-4" />
                    {resolvedItems.length} resolved today
                  </span>
                )}
              </div>
            </div>
            <div className="text-left sm:text-right flex-shrink-0">
              <div className="text-slate-600 text-sm whitespace-nowrap">{new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
              <div className="text-slate-500 text-sm whitespace-nowrap">
                {lastSyncTime ? `Last sync: ${lastSyncTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : 'Syncing...'}
              </div>
            </div>
          </div>
        </div>

        {loadError && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
            <span className="text-red-700 text-sm flex-1">{loadError}</span>
            <button
              onClick={() => window.location.reload()}
              className="px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm"
            >
              Retry
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6">
          {/* Main Content - Full Width */}
          <div className="space-y-6">
            {/* Quick Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {isLoadingStats ? (
                <div className="col-span-4 text-center text-slate-500 py-4">Loading stats...</div>
              ) : (
                stats.map((stat) => (
                  <div key={stat.label} className="bg-white rounded-xl p-4 lg:p-5 border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-3">
                      <div className={`${stat.bg} ${stat.color} p-2.5 rounded-lg`}>
                        <stat.icon className="w-5 h-5" />
                      </div>
                    </div>
                    <div className={`${stat.color} mb-1 text-2xl lg:text-3xl`}>{stat.value}</div>
                    <div className="text-slate-600 text-sm">{stat.label}</div>
                    <div className="text-slate-500 text-xs mt-1">{stat.subtext}</div>
                  </div>
                ))
              )}
            </div>

            {/* Actions Required */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="bg-gradient-to-r from-red-50 to-orange-50 px-6 py-4 border-b border-red-100">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-slate-900 mb-1">Actions Required</h2>
                    <p className="text-slate-600 text-sm">Review and resolve exceptions to keep imports moving</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1.5 bg-red-100 text-red-700 rounded-full text-sm">
                      {activeExceptions.length} urgent
                    </span>
                  </div>
                </div>
              </div>

              <div className="divide-y divide-slate-100">
                {isLoadingExceptions ? (
                  <div className="p-5 text-center text-slate-500">Loading exceptions...</div>
                ) : activeExceptions.length === 0 ? (
                  <div className="p-5 text-center text-slate-500">No exceptions requiring review</div>
                ) : (
                  <>
                    {activeExceptions
                      .filter(item => filterBy === 'all' || item.category === filterBy)
                      .sort((a, b) => {
                        if (sortBy === 'priority') {
                          const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
                          return (priorityOrder[a.priority] ?? 3) - (priorityOrder[b.priority] ?? 3);
                        } else if (sortBy === 'product') {
                          return a.product.localeCompare(b.product);
                        }
                        return 0;
                      })
                      .map((item) => (
                        <div 
                          key={item.id} 
                          className="p-5 hover:bg-slate-50 transition-colors cursor-pointer group"
                          onClick={() => setSelectedException(item)}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-2 mb-2">
                                <AlertCircle className={`w-5 h-5 flex-shrink-0 ${
                                  item.priority === 'high' ? 'text-red-600' : 
                                  item.priority === 'medium' ? 'text-amber-600' : 'text-blue-600'
                                }`} />
                                <span className="text-slate-900 truncate">{item.product}</span>
                                <span className={`px-2 py-0.5 rounded text-xs border flex-shrink-0 ${getPriorityColor(item.priority)}`}>
                                  {item.priority}
                                </span>
                              </div>
                              
                              <div className="ml-0 sm:ml-8 space-y-1">
                                <div className="text-sm text-slate-600">
                                  <span className="text-red-700">⚠ {item.reason}</span>
                                </div>
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
                                  <span className="whitespace-nowrap">SKU: {item.sku}</span>
                                  <span className="hidden sm:inline">•</span>
                                  <span className="whitespace-nowrap">HTS: {item.hts}</span>
                                  <span className="hidden sm:inline">•</span>
                                  <span className="whitespace-nowrap">Origin: {item.origin}</span>
                                  <span className="hidden sm:inline">•</span>
                                  <span className="whitespace-nowrap">Value: {item.value}</span>
                                </div>
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedException(item);
                                }}
                                className="hidden sm:block px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm opacity-0 group-hover:opacity-100"
                              >
                                Review Now
                              </button>
                              <ChevronRight className="w-5 h-5 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                          </div>
                        </div>
                      ))}
                  </>
                )}
              </div>

              <div className="px-6 py-4 bg-slate-50 border-t border-slate-200">
                <button 
                  onClick={() => setShowAllReviewModal(true)}
                  className="text-blue-600 hover:text-blue-700 text-sm flex items-center gap-2"
                >
                  View all exceptions
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Recent Activity */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100">
                <h3 className="text-slate-900">Recent Activity</h3>
              </div>
              <div className="divide-y divide-slate-100">
                {resolvedItems.length > 0 && (
                  <>
                    {resolvedItems.slice().reverse().map((item, idx) => (
                      <div 
                        key={`resolved-${idx}`} 
                        className="flex items-center gap-3 p-4 bg-green-50 border-l-4 border-green-500 cursor-pointer hover:bg-green-100 transition-colors group"
                        onClick={() => onNavigate('profile')}
                      >
                        <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-slate-900 text-sm truncate">{item.product}</div>
                          <div className="text-green-600 text-xs">Exception resolved • Classification approved</div>
                        </div>
                        <div className="text-slate-400 text-xs whitespace-nowrap">Just now</div>
                        <ChevronRight className="w-4 h-4 text-green-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    ))}
                  </>
                )}
                {isLoadingRecentActivity ? (
                  <div className="p-4 text-center text-slate-500">Loading recent activity...</div>
                ) : recentClassifications.length === 0 ? (
                  <div className="p-4 text-center text-slate-500">No recent activity</div>
                ) : (
                  recentClassifications.map((activity, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-3 p-4 hover:bg-slate-50 transition-colors cursor-pointer group"
                      onClick={() => {
                        // Open ExceptionReview with the activity's data
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
                            classification_trace: activity.classification_trace,
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
                      <div className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0"></div>
                      <div className="flex-1 min-w-0">
                        <div className="text-slate-900 text-sm">{activity.product}</div>
                        <div className="text-slate-500 text-xs">HTS: {activity.hts} • Confidence: {activity.confidence}</div>
                      </div>
                      <div className="text-slate-400 text-xs whitespace-nowrap">{activity.time}</div>
                      <ChevronRight className="w-4 h-4 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  ))
                )}
              </div>
              <div className="px-6 py-4 bg-slate-50 border-t border-slate-200">
                <button 
                  onClick={() => onNavigate('activity')}
                  className="text-blue-600 hover:text-blue-700 text-sm flex items-center gap-2"
                >
                  View all activity
                  <ChevronRight className="w-4 h-4" />
                </button>
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
            classification_trace: selectedException.classification_trace,
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

      {/* Floating AI Assistant */}
      {!showAIAssistant ? (
        <button
          onClick={() => setShowAIAssistant(true)}
          className="fixed bottom-6 right-6 bg-gradient-to-br from-indigo-500 to-purple-600 text-white p-4 rounded-full shadow-2xl hover:shadow-xl hover:scale-105 transition-all group"
        >
          <Sparkles className="w-6 h-6" />
          <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></div>
          <div className="absolute right-full mr-3 top-1/2 -translate-y-1/2 bg-slate-900 text-white px-3 py-2 rounded-lg text-sm whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            Need help? Ask me anything!
            <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 rotate-45 w-2 h-2 bg-slate-900"></div>
          </div>
        </button>
      ) : (
        <div className="fixed bottom-6 right-6 w-[400px] bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4">
          <div className="bg-white/10 backdrop-blur-sm px-5 py-4 flex items-center justify-between border-b border-white/20">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-lg relative">
                <Sparkles className="w-5 h-5 text-white" />
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></div>
              </div>
              <div>
                <h3 className="text-white">AI Assistant</h3>
                <p className="text-indigo-100 text-xs">Online • Ready to help</p>
              </div>
            </div>
            <button
              onClick={() => setShowAIAssistant(false)}
              className="text-white/70 hover:text-white transition-colors p-1 hover:bg-white/10 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-5 bg-white max-h-[500px] flex flex-col">
            <div className="space-y-4 mb-4 overflow-y-auto flex-1">
              {aiMessages.map((message, idx) => (
                <div
                  key={idx}
                  className={`flex gap-3 ${message.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
                >
                  {message.role === 'assistant' && (
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                      <Sparkles className="w-4 h-4 text-white" />
                    </div>
                  )}
                  <div
                    className={`rounded-2xl px-4 py-3 max-w-[85%] text-sm ${
                      message.role === 'user'
                        ? 'bg-blue-600 text-white rounded-tr-sm'
                        : 'bg-slate-100 text-slate-900 rounded-tl-sm'
                    }`}
                  >
                    {message.text}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-2 pt-3 border-t border-slate-200">
              <input
                type="text"
                value={aiInput}
                onChange={(e) => setAiInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder="Ask me anything..."
                className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                onClick={handleSendMessage}
                className="px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
              >
                <MessageSquare className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="px-5 py-3 bg-indigo-50 border-t border-indigo-100">
            <p className="text-indigo-700 text-xs">
              💡 Try: "Help me classify the smart watch" or "What documents do I need?"
            </p>
          </div>
        </div>
      )}
    </div>
  );
}