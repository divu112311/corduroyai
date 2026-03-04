import { useState, useEffect } from 'react';
import { Plus, Search, MapPin, DollarSign, Package, FileText, Filter, X, ChevronDown, ExternalLink } from 'lucide-react';
import { AddProductModal } from './AddProductModal';
import { ProductDetailsModal } from './ProductDetailsModal';
import { supabase } from '../lib/supabase';
import { getProductProfiles } from '../lib/dashboardService';

interface Product {
  id: number;
  productId?: number; // Actual product_id for fetching documents
  name: string;
  description?: string; // Product description from DB
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
  tariffRate?: number | null;
  tariffAmount?: number | null;
  totalCost?: number | null;
  alternateClassification?: string | null;
  unitCost?: number | null;
  // Extended classification data
  reasoning?: string;
  chapterCode?: string;
  chapterTitle?: string;
  sectionCode?: string;
  sectionTitle?: string;
  cbpRulings?: any;
  ruleVerification?: any;
  ruleConfidence?: number;
  alternateClassifications?: any;
}

export function ProductProfile() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [isMobileView, setIsMobileView] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  
  // Filter states
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedVendors, setSelectedVendors] = useState<string[]>([]);
  const [selectedOrigins, setSelectedOrigins] = useState<string[]>([]);
  const [selectedDateRange, setSelectedDateRange] = useState<string>('all');
  const [selectedConfidence, setSelectedConfidence] = useState<string>('all');
  
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);

  // Load products from database on mount
  useEffect(() => {
    const loadProducts = async () => {
      try {
        setIsLoadingProducts(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setIsLoadingProducts(false);
          return;
        }

        const productProfiles = await getProductProfiles(user.id);
        setProducts(productProfiles);
        setIsLoadingProducts(false);
      } catch (error) {
        console.error('Error loading products:', error);
        setIsLoadingProducts(false);
      }
    };

    loadProducts();
  }, []);


  // Extract unique values for filters
  const categories = Array.from(new Set(products.map(p => p.category)));
  const vendors = Array.from(new Set(products.map(p => p.vendor)));
  const origins = Array.from(new Set(products.map(p => p.origin)));

  // Apply all filters
  const filteredProducts = products.filter(p => {
    // Search filter
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.hts.includes(searchQuery);
    
    // Category filter
    const matchesCategory = selectedCategories.length === 0 || selectedCategories.includes(p.category);
    
    // Vendor filter
    const matchesVendor = selectedVendors.length === 0 || selectedVendors.includes(p.vendor);
    
    // Origin filter
    const matchesOrigin = selectedOrigins.length === 0 || selectedOrigins.includes(p.origin);
    
    // Date range filter
    let matchesDate = true;
    if (selectedDateRange !== 'all') {
      const productDate = new Date(p.lastUpdated);
      const now = new Date();
      const daysDiff = Math.floor((now.getTime() - productDate.getTime()) / (1000 * 60 * 60 * 24));
      
      switch (selectedDateRange) {
        case '7':
          matchesDate = daysDiff <= 7;
          break;
        case '30':
          matchesDate = daysDiff <= 30;
          break;
        case '90':
          matchesDate = daysDiff <= 90;
          break;
      }
    }
    
    // Confidence filter
    let matchesConfidence = true;
    switch (selectedConfidence) {
      case 'high':
        matchesConfidence = p.confidence >= 95;
        break;
      case 'medium':
        matchesConfidence = p.confidence >= 85 && p.confidence < 95;
        break;
      case 'low':
        matchesConfidence = p.confidence < 85;
        break;
    }
    
    return matchesSearch && matchesCategory && matchesVendor && matchesOrigin && matchesDate && matchesConfidence;
  });

  const activeFilterCount = 
    selectedCategories.length + 
    selectedVendors.length + 
    selectedOrigins.length + 
    (selectedDateRange !== 'all' ? 1 : 0) + 
    (selectedConfidence !== 'all' ? 1 : 0);

  const toggleFilter = (filterArray: string[], value: string, setFilter: (arr: string[]) => void) => {
    if (filterArray.includes(value)) {
      setFilter(filterArray.filter(v => v !== value));
    } else {
      setFilter([...filterArray, value]);
    }
  };

  const clearAllFilters = () => {
    setSelectedCategories([]);
    setSelectedVendors([]);
    setSelectedOrigins([]);
    setSelectedDateRange('all');
    setSelectedConfidence('all');
  };

  const handleSaveProduct = (product: Product) => {
    if (editingProduct) {
      // Update existing product
      setProducts(products.map(p => p.id === product.id ? product : p));
      setSelectedProduct(product);
    } else {
      // Add new product
      setProducts([...products, product]);
      setSelectedProduct(product);
    }
    setShowAddModal(false);
    setEditingProduct(null);
  };

  const handleProductClick = (product: Product) => {
    setSelectedProduct(product);
    // On mobile/narrow screens, immediately open the details modal
    if (isMobileView) {
      setShowDetailsModal(true);
    }
  };

  useEffect(() => {
    const handleResize = () => {
      setIsMobileView(window.innerWidth < 1024);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Page header */}
      <div className="flex-shrink-0 bg-white border-b border-slate-200 px-8 py-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-lg font-semibold text-slate-900">Product Profile Library</h1>
              <p className="text-sm text-slate-400 mt-0.5">System of record for all classified products</p>
            </div>
            <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 text-xs font-semibold rounded-full border border-emerald-200">
              {products.length} profiles
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setEditingProduct(null); setShowAddModal(true); }}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm font-semibold shadow-sm"
            >
              <Plus className="w-4 h-4" />
              New Product
            </button>
          </div>
        </div>
      </div>

      {/* Search + filter bar */}
      <div className="flex-shrink-0 bg-white border-b border-slate-200 px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, SKU, or HTS code..."
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-slate-700 placeholder:text-slate-300"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${showFilters ? 'bg-slate-900 text-white border-slate-900' : 'text-slate-600 border-slate-200 hover:bg-slate-50'}`}
          >
            <Filter className="w-4 h-4" />
            Filters
            {activeFilterCount > 0 && (
              <span className="w-5 h-5 flex items-center justify-center bg-blue-600 text-white rounded-full text-xs">{activeFilterCount}</span>
            )}
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* Active filters as chips */}
        {activeFilterCount > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5 items-center">
            {selectedCategories.map(category => (
              <span key={category} className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-medium border border-blue-100">
                {category}
                <button onClick={() => toggleFilter(selectedCategories, category, setSelectedCategories)} className="hover:text-blue-900"><X className="w-3 h-3" /></button>
              </span>
            ))}
            {selectedVendors.map(vendor => (
              <span key={vendor} className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-medium border border-blue-100">
                {vendor}
                <button onClick={() => toggleFilter(selectedVendors, vendor, setSelectedVendors)} className="hover:text-blue-900"><X className="w-3 h-3" /></button>
              </span>
            ))}
            {selectedOrigins.map(origin => (
              <span key={origin} className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-medium border border-blue-100">
                {origin}
                <button onClick={() => toggleFilter(selectedOrigins, origin, setSelectedOrigins)} className="hover:text-blue-900"><X className="w-3 h-3" /></button>
              </span>
            ))}
            {selectedDateRange !== 'all' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-medium border border-blue-100">
                Last {selectedDateRange} days
                <button onClick={() => setSelectedDateRange('all')} className="hover:text-blue-900"><X className="w-3 h-3" /></button>
              </span>
            )}
            {selectedConfidence !== 'all' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-medium border border-blue-100">
                {selectedConfidence === 'high' ? 'High confidence' : selectedConfidence === 'medium' ? 'Medium confidence' : 'Low confidence'}
                <button onClick={() => setSelectedConfidence('all')} className="hover:text-blue-900"><X className="w-3 h-3" /></button>
              </span>
            )}
            <button onClick={clearAllFilters} className="text-xs text-slate-400 hover:text-slate-600 ml-1">Clear all</button>
          </div>
        )}

        {/* Expanded filter panel */}
        {showFilters && (
          <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 md:grid-cols-5 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Category</label>
              <div className="space-y-1 max-h-28 overflow-y-auto">
                {categories.map(category => (
                  <label key={category} className="flex items-center gap-2 cursor-pointer text-sm text-slate-600 hover:text-slate-900">
                    <input type="checkbox" checked={selectedCategories.includes(category)} onChange={() => toggleFilter(selectedCategories, category, setSelectedCategories)} className="rounded border-slate-300 text-blue-600 w-3.5 h-3.5" />
                    {category}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Vendor</label>
              <div className="space-y-1 max-h-28 overflow-y-auto">
                {vendors.map(vendor => (
                  <label key={vendor} className="flex items-center gap-2 cursor-pointer text-sm text-slate-600 hover:text-slate-900">
                    <input type="checkbox" checked={selectedVendors.includes(vendor)} onChange={() => toggleFilter(selectedVendors, vendor, setSelectedVendors)} className="rounded border-slate-300 text-blue-600 w-3.5 h-3.5" />
                    {vendor}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Origin</label>
              <div className="space-y-1 max-h-28 overflow-y-auto">
                {origins.map(origin => (
                  <label key={origin} className="flex items-center gap-2 cursor-pointer text-sm text-slate-600 hover:text-slate-900">
                    <input type="checkbox" checked={selectedOrigins.includes(origin)} onChange={() => toggleFilter(selectedOrigins, origin, setSelectedOrigins)} className="rounded border-slate-300 text-blue-600 w-3.5 h-3.5" />
                    {origin}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Updated</label>
              <select value={selectedDateRange} onChange={(e) => setSelectedDateRange(e.target.value)} className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700">
                <option value="all">All time</option>
                <option value="7">Last 7 days</option>
                <option value="30">Last 30 days</option>
                <option value="90">Last 90 days</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Confidence</label>
              <select value={selectedConfidence} onChange={(e) => setSelectedConfidence(e.target.value)} className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700">
                <option value="all">All levels</option>
                <option value="high">High (95%+)</option>
                <option value="medium">Medium (85-94%)</option>
                <option value="low">Low (&lt;85%)</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Main content area: table + detail drawer */}
      <div className="flex-1 overflow-hidden flex">
        {/* Product table */}
        <div className="flex-1 overflow-y-auto">
          {isLoadingProducts ? (
            <div className="flex items-center justify-center h-48">
              <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64">
              <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                <Package className="w-7 h-7 text-slate-300" />
              </div>
              <p className="text-base font-semibold text-slate-700">
                {products.length === 0 ? 'No products yet' : 'No products match your filters'}
              </p>
              <p className="text-sm text-slate-400 mt-1">
                {products.length === 0 ? 'Classify a product to see it here' : 'Try adjusting your search or filters'}
              </p>
              {products.length === 0 && (
                <button
                  onClick={() => { setEditingProduct(null); setShowAddModal(true); }}
                  className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  Add First Product
                </button>
              )}
            </div>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Product</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">HTS Code</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">Origin</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider hidden lg:table-cell">Vendor</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Confidence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredProducts.map((product) => (
                  <tr
                    key={product.id}
                    onClick={() => handleProductClick(product)}
                    className={`cursor-pointer transition-colors group ${
                      selectedProduct?.id === product.id
                        ? 'bg-blue-50 border-l-2 border-l-blue-600'
                        : 'hover:bg-slate-50 border-l-2 border-l-transparent'
                    }`}
                  >
                    <td className="px-6 py-3.5">
                      <div className="font-medium text-sm text-slate-900 truncate max-w-[200px]">{product.name}</div>
                      {product.sku && <div className="text-xs text-slate-400 mt-0.5">SKU: {product.sku}</div>}
                    </td>
                    <td className="px-6 py-3.5">
                      <span className="font-mono text-sm font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">{product.hts}</span>
                    </td>
                    <td className="px-6 py-3.5 hidden md:table-cell">
                      <span className="text-sm text-slate-600">{product.origin || '—'}</span>
                    </td>
                    <td className="px-6 py-3.5 hidden lg:table-cell">
                      <span className="text-sm text-slate-500 truncate max-w-[120px] block">{product.vendor || '—'}</span>
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                          product.confidence >= 90 ? 'bg-emerald-500' :
                          product.confidence >= 70 ? 'bg-amber-400' : 'bg-red-400'
                        }`} />
                        <span className={`text-sm font-semibold ${
                          product.confidence >= 90 ? 'text-emerald-700' :
                          product.confidence >= 70 ? 'text-amber-600' : 'text-red-600'
                        }`}>{product.confidence}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Detail drawer — slides in from right */}
        {selectedProduct && (
          <div className="w-[420px] flex-shrink-0 border-l border-slate-200 overflow-y-auto bg-white">
            {/* Drawer header */}
            <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-start justify-between z-10">
              <div className="min-w-0 flex-1 pr-3">
                <h3 className="text-base font-semibold text-slate-900 truncate">{selectedProduct.name}</h3>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {selectedProduct.sku && <span className="text-xs text-slate-400">SKU: {selectedProduct.sku}</span>}
                  <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                    selectedProduct.confidence >= 90 ? 'bg-emerald-50 text-emerald-700' :
                    selectedProduct.confidence >= 70 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'
                  }`}>
                    {selectedProduct.confidence}% confidence
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedProduct(null)}
                className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors flex-shrink-0"
              >
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* HTS hero card */}
              <div className="bg-slate-900 rounded-xl p-4">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">HTS Classification</p>
                <p className="font-mono text-3xl font-bold text-white tracking-tight">{selectedProduct.hts}</p>
                {selectedProduct.chapterCode && (
                  <div className="mt-2 space-y-0.5">
                    {selectedProduct.sectionCode && (
                      <p className="text-xs text-slate-400">Section {selectedProduct.sectionCode}{selectedProduct.sectionTitle ? ` — ${selectedProduct.sectionTitle}` : ''}</p>
                    )}
                    <p className="text-xs text-slate-400">Chapter {selectedProduct.chapterCode}{selectedProduct.chapterTitle ? ` — ${selectedProduct.chapterTitle}` : ''}</p>
                  </div>
                )}
                <p className="text-xs text-slate-500 mt-2">Updated {new Date(selectedProduct.lastUpdated).toLocaleDateString()}</p>
              </div>

              {/* Trade metrics */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-slate-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-slate-400 mb-1">Tariff Rate</p>
                  <p className="text-sm font-bold text-slate-800">
                    {selectedProduct.tariffRate != null ? `${(selectedProduct.tariffRate * 100).toFixed(1)}%` : 'N/A'}
                  </p>
                </div>
                <div className="bg-slate-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-slate-400 mb-1">Unit Cost</p>
                  <p className="text-sm font-bold text-slate-800">{selectedProduct.cost || 'N/A'}</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-slate-400 mb-1">Origin</p>
                  <p className="text-sm font-bold text-slate-800 truncate">{selectedProduct.origin || 'N/A'}</p>
                </div>
              </div>

              {/* Product info */}
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Product Details</p>
                <div className="space-y-2">
                  {selectedProduct.materials && (
                    <div className="flex items-start gap-2">
                      <Package className="w-3.5 h-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs text-slate-400">Materials</p>
                        <p className="text-sm text-slate-700">{selectedProduct.materials}</p>
                      </div>
                    </div>
                  )}
                  {selectedProduct.vendor && (
                    <div className="flex items-start gap-2">
                      <FileText className="w-3.5 h-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs text-slate-400">Vendor</p>
                        <p className="text-sm text-slate-700">{selectedProduct.vendor}</p>
                      </div>
                    </div>
                  )}
                  {selectedProduct.description && (
                    <div className="flex items-start gap-2">
                      <FileText className="w-3.5 h-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs text-slate-400">Description</p>
                        <p className="text-sm text-slate-600 leading-relaxed">{selectedProduct.description}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Alternate classifications */}
              {(selectedProduct.alternateClassifications?.length > 0 || selectedProduct.alternateClassification) && (
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Alternate Classifications</p>
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
                    {selectedProduct.alternateClassifications?.map((alt: any, idx: number) => (
                      <div key={idx} className="flex items-center justify-between">
                        <div>
                          <span className="font-mono text-sm font-semibold text-amber-800">{alt.hts}</span>
                          {alt.description && <p className="text-xs text-amber-700 mt-0.5">{alt.description}</p>}
                        </div>
                        <span className="text-xs font-semibold text-amber-600">{alt.confidence}%</span>
                      </div>
                    ))}
                    {!selectedProduct.alternateClassifications && selectedProduct.alternateClassification && (
                      <span className="font-mono text-sm font-semibold text-amber-800">{selectedProduct.alternateClassification}</span>
                    )}
                  </div>
                </div>
              )}

              {/* Rule verification */}
              {selectedProduct.ruleVerification && (
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Rule Verification</p>
                  <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                        selectedProduct.ruleVerification.status === 'verified' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {selectedProduct.ruleVerification.status}
                      </span>
                      {selectedProduct.ruleVerification.gri_applied?.map((gri: string, idx: number) => (
                        <span key={idx} className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs rounded-lg">{gri}</span>
                      ))}
                    </div>
                    {selectedProduct.ruleVerification.checks_passed?.map((check: string, idx: number) => (
                      <div key={idx} className="flex items-center gap-1.5 text-xs text-emerald-700 mb-0.5">
                        <span>✓</span>{check}
                      </div>
                    ))}
                    {selectedProduct.ruleVerification.checks_failed?.map((check: string, idx: number) => (
                      <div key={idx} className="flex items-center gap-1.5 text-xs text-red-600 mb-0.5">
                        <span>✗</span>{check}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* CBP Rulings */}
              {selectedProduct.cbpRulings && selectedProduct.cbpRulings.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">CBP Rulings ({selectedProduct.cbpRulings.length})</p>
                  <div className="space-y-2">
                    {selectedProduct.cbpRulings.map((ruling: any, idx: number) => (
                      <div key={idx} className="bg-blue-50 border border-blue-100 rounded-lg p-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-blue-900">{ruling.ruling_number}</span>
                              {ruling.ruling_date && <span className="text-xs text-blue-500">{new Date(ruling.ruling_date).toLocaleDateString()}</span>}
                            </div>
                            <p className="text-xs text-blue-700 mt-0.5 leading-relaxed">{ruling.subject}</p>
                          </div>
                          {ruling.url && (
                            <a href={ruling.url} target="_blank" rel="noopener noreferrer" className="ml-2 text-blue-500 hover:text-blue-700 flex-shrink-0">
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* View full details CTA */}
              <button
                onClick={() => setShowDetailsModal(true)}
                className="w-full py-2.5 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors text-sm font-medium flex items-center justify-center gap-2"
              >
                <FileText className="w-4 h-4" />
                View Full Details
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {showAddModal && (
        <AddProductModal
          onClose={() => { setShowAddModal(false); setEditingProduct(null); }}
          onSave={handleSaveProduct}
          editingProduct={editingProduct}
        />
      )}
      {showDetailsModal && selectedProduct && (
        <ProductDetailsModal
          product={selectedProduct}
          onClose={() => setShowDetailsModal(false)}
        />
      )}
    </div>
  );
}