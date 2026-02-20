import { useState, useEffect } from 'react';
import { Plus, Search, MapPin, DollarSign, Package, FileText, Filter, X, ChevronDown, ExternalLink } from 'lucide-react';
import { AddProductModal } from './AddProductModal';
import { LLMAssistant } from './LLMAssistant';
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
  const [showAssistant, setShowAssistant] = useState(false);
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
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-slate-900 mb-2">Product Compliance Profiles</h1>
            <p className="text-slate-600">Manage product data, materials, origin, and vendor information</p>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setShowAssistant(!showAssistant)}
              className="px-4 py-2 border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 transition-colors"
            >
              Ask AI Assistant
            </button>
            <button 
              onClick={() => {
                setEditingProduct(null);
                setShowAddModal(true);
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Add Product
            </button>
          </div>
        </div>

        {/* Search and Filters Section */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6">
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Search */}
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search products by name, SKU, or HTS..."
                  className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Filter Toggle Button */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="px-4 py-2 border border-slate-300 rounded-lg text-sm hover:bg-slate-50 transition-colors flex items-center gap-2 whitespace-nowrap"
            >
              <Filter className="w-4 h-4 text-slate-600" />
              <span className="text-slate-700">Filters</span>
              {activeFilterCount > 0 && (
                <span className="px-2 py-0.5 bg-blue-600 text-white rounded-full text-xs">
                  {activeFilterCount}
                </span>
              )}
              <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {/* Expandable Filter Panel */}
          {showFilters && (
            <div className="mt-4 pt-4 border-t border-slate-200">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-slate-900 text-sm">Filter Products</h3>
                {activeFilterCount > 0 && (
                  <button
                    onClick={clearAllFilters}
                    className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                  >
                    <X className="w-3 h-3" />
                    Clear all
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                {/* Category Filter */}
                <div>
                  <label className="text-xs text-slate-600 mb-2 block">Category</label>
                  <div className="space-y-1.5 max-h-32 overflow-y-auto">
                    {categories.map(category => (
                      <label key={category} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedCategories.includes(category)}
                          onChange={() => toggleFilter(selectedCategories, category, setSelectedCategories)}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-slate-700">{category}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Vendor Filter */}
                <div>
                  <label className="text-xs text-slate-600 mb-2 block">Vendor</label>
                  <div className="space-y-1.5 max-h-32 overflow-y-auto">
                    {vendors.map(vendor => (
                      <label key={vendor} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedVendors.includes(vendor)}
                          onChange={() => toggleFilter(selectedVendors, vendor, setSelectedVendors)}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-slate-700">{vendor}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Origin Filter */}
                <div>
                  <label className="text-xs text-slate-600 mb-2 block">Country of Origin</label>
                  <div className="space-y-1.5 max-h-32 overflow-y-auto">
                    {origins.map(origin => (
                      <label key={origin} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedOrigins.includes(origin)}
                          onChange={() => toggleFilter(selectedOrigins, origin, setSelectedOrigins)}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-slate-700">{origin}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Date Range Filter */}
                <div>
                  <label className="text-xs text-slate-600 mb-2 block">Last Updated</label>
                  <select
                    value={selectedDateRange}
                    onChange={(e) => setSelectedDateRange(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">All time</option>
                    <option value="7">Last 7 days</option>
                    <option value="30">Last 30 days</option>
                    <option value="90">Last 90 days</option>
                  </select>
                </div>

                {/* Confidence Filter */}
                <div>
                  <label className="text-xs text-slate-600 mb-2 block">Confidence Level</label>
                  <select
                    value={selectedConfidence}
                    onChange={(e) => setSelectedConfidence(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">All levels</option>
                    <option value="high">High (95%+)</option>
                    <option value="medium">Medium (85-94%)</option>
                    <option value="low">Low (&lt;85%)</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Active Filter Pills */}
          {activeFilterCount > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {selectedCategories.map(category => (
                <span key={category} className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs flex items-center gap-1">
                  {category}
                  <button onClick={() => toggleFilter(selectedCategories, category, setSelectedCategories)} className="hover:text-blue-900">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              {selectedVendors.map(vendor => (
                <span key={vendor} className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs flex items-center gap-1">
                  {vendor}
                  <button onClick={() => toggleFilter(selectedVendors, vendor, setSelectedVendors)} className="hover:text-blue-900">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              {selectedOrigins.map(origin => (
                <span key={origin} className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs flex items-center gap-1">
                  {origin}
                  <button onClick={() => toggleFilter(selectedOrigins, origin, setSelectedOrigins)} className="hover:text-blue-900">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              {selectedDateRange !== 'all' && (
                <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs flex items-center gap-1">
                  Last {selectedDateRange} days
                  <button onClick={() => setSelectedDateRange('all')} className="hover:text-blue-900">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {selectedConfidence !== 'all' && (
                <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs flex items-center gap-1">
                  {selectedConfidence === 'high' ? 'High confidence' : selectedConfidence === 'medium' ? 'Medium confidence' : 'Low confidence'}
                  <button onClick={() => setSelectedConfidence('all')} className="hover:text-blue-900">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Product List */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="p-4 border-b border-slate-200 bg-slate-50">
                <div className="text-sm text-slate-700">
                  Showing {filteredProducts.length} of {products.length} products
                </div>
              </div>
              
              <div className="divide-y divide-slate-200 max-h-[600px] overflow-y-auto">
                {isLoadingProducts ? (
                  <div className="p-8 text-center text-slate-500">Loading products...</div>
                ) : filteredProducts.length === 0 ? (
                  <div className="p-8 text-center text-slate-500">No approved products found</div>
                ) : (
                  filteredProducts.map((product) => (
                    <button
                      key={product.id}
                      onClick={() => handleProductClick(product)}
                      className={`w-full p-4 text-left hover:bg-slate-50 transition-colors ${
                        selectedProduct?.id === product.id ? 'bg-blue-50 border-l-4 border-l-blue-600' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <span className="text-slate-900">{product.name}</span>
                        <span className={`px-2 py-0.5 rounded text-xs ${
                          product.confidence >= 95 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                          {product.confidence}%
                        </span>
                      </div>
                      <div className="text-slate-600 text-sm space-y-1">
                        <div>SKU: {product.sku}</div>
                        <div>HTS: {product.hts}</div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Product Details - Hidden on mobile, shown on desktop */}
          <div className="hidden lg:block lg:col-span-2">
            {selectedProduct ? (
              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <div className="flex items-start justify-between mb-6">
                  <div>
                    <h2 className="text-slate-900 mb-1">{selectedProduct.name}</h2>
                    <p className="text-slate-600">SKU: {selectedProduct.sku}</p>
                    {selectedProduct.description && (
                      <p className="text-slate-500 text-sm mt-1">{selectedProduct.description}</p>
                    )}
                  </div>
                </div>

                {/* Classification Info */}
                <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-green-900 text-sm">Current Classification</span>
                    <div className="flex items-center gap-2">
                      <span className="text-green-700 text-sm">Confidence:</span>
                      <span className="text-green-900">{selectedProduct.confidence}%</span>
                    </div>
                  </div>
                  <div className="text-green-800 text-lg mb-3">HTS Code: {selectedProduct.hts}</div>

                  {(selectedProduct.sectionCode || selectedProduct.chapterCode) && (
                    <div className="space-y-1 text-xs mb-3">
                      {selectedProduct.sectionCode && (
                        <div className="flex items-start gap-2">
                          <span className="text-green-700 min-w-[60px]">Section</span>
                          <span className="text-green-800">{selectedProduct.sectionCode}{selectedProduct.sectionTitle ? ` — ${selectedProduct.sectionTitle}` : ''}</span>
                        </div>
                      )}
                      {selectedProduct.chapterCode && (
                        <div className="flex items-start gap-2">
                          <span className="text-green-700 min-w-[60px]">Chapter</span>
                          <span className="text-green-800">{selectedProduct.chapterCode}{selectedProduct.chapterTitle ? ` — ${selectedProduct.chapterTitle}` : ''}</span>
                        </div>
                      )}
                      <div className="flex items-start gap-2">
                        <span className="text-green-700 min-w-[60px]">HTS Code</span>
                        <span className="text-green-800">{selectedProduct.hts}</span>
                      </div>
                    </div>
                  )}

                  <div className="text-green-700 text-sm">
                    Last updated: {new Date(selectedProduct.lastUpdated).toLocaleDateString()}
                  </div>
                </div>

                {/* CBP Rulings */}
                {selectedProduct.cbpRulings && selectedProduct.cbpRulings.length > 0 && (
                  <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <h3 className="text-blue-900 mb-3 flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      CBP Rulings ({selectedProduct.cbpRulings.length})
                    </h3>
                    <div className="space-y-2">
                      {selectedProduct.cbpRulings.map((ruling: any, idx: number) => (
                        <div key={idx} className="bg-white rounded-lg p-3 border border-blue-200">
                          <div className="flex items-start justify-between">
                            <div>
                              <span className="text-blue-900 text-sm font-medium">{ruling.ruling_number}</span>
                              {ruling.ruling_date && (
                                <span className="text-blue-600 text-xs ml-2">
                                  {new Date(ruling.ruling_date).toLocaleDateString()}
                                </span>
                              )}
                              <p className="text-blue-800 text-sm mt-1">{ruling.subject}</p>
                            </div>
                            {ruling.url && (
                              <a href={ruling.url} target="_blank" rel="noopener noreferrer" className="ml-2 text-blue-600 hover:text-blue-700">
                                <ExternalLink className="w-4 h-4" />
                              </a>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Rule Verification */}
                {selectedProduct.ruleVerification && (
                  <div className="mb-6 p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
                    <h3 className="text-indigo-900 mb-3 flex items-center gap-2">
                      Rule Verification
                      <span className={`px-2 py-0.5 rounded-full text-xs ${
                        selectedProduct.ruleVerification.status === 'verified'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}>
                        {selectedProduct.ruleVerification.status}
                      </span>
                    </h3>
                    {selectedProduct.ruleVerification.gri_applied?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {selectedProduct.ruleVerification.gri_applied.map((gri: string, idx: number) => (
                          <span key={idx} className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs rounded-lg border border-indigo-200">{gri}</span>
                        ))}
                      </div>
                    )}
                    {selectedProduct.ruleVerification.checks_passed?.length > 0 && (
                      <div className="mb-2">
                        {selectedProduct.ruleVerification.checks_passed.map((check: string, idx: number) => (
                          <div key={idx} className="flex items-center gap-2 text-sm text-green-700 mb-1">
                            <span className="w-3.5 h-3.5 flex-shrink-0 text-green-600">✓</span>
                            <span>{check}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {selectedProduct.ruleVerification.checks_failed?.length > 0 && (
                      <div className="mb-2">
                        {selectedProduct.ruleVerification.checks_failed.map((check: string, idx: number) => (
                          <div key={idx} className="flex items-center gap-2 text-sm text-red-700 mb-1">
                            <span className="w-3.5 h-3.5 flex-shrink-0 text-red-600">✗</span>
                            <span>{check}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Product Details Grid */}
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="p-4 bg-slate-50 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Package className="w-5 h-5 text-slate-600" />
                      <span className="text-slate-700">Materials</span>
                    </div>
                    <p className="text-slate-900 text-sm">{selectedProduct.materials}</p>
                  </div>

                  <div className="p-4 bg-slate-50 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <MapPin className="w-5 h-5 text-slate-600" />
                      <span className="text-slate-700">Country of Origin</span>
                    </div>
                    <p className="text-slate-900 text-sm">{selectedProduct.origin}</p>
                  </div>

                  <div className="p-4 bg-slate-50 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <DollarSign className="w-5 h-5 text-slate-600" />
                      <span className="text-slate-700">Unit Cost</span>
                    </div>
                    <p className="text-slate-900 text-sm">{selectedProduct.cost}</p>
                  </div>

                  <div className="p-4 bg-slate-50 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <FileText className="w-5 h-5 text-slate-600" />
                      <span className="text-slate-700">Vendor</span>
                    </div>
                    <p className="text-slate-900 text-sm">{selectedProduct.vendor}</p>
                  </div>
                </div>

                {/* Trade Analysis */}
                <div className="border-t border-slate-200 pt-6">
                  <h3 className="text-slate-900 mb-4">Trade Analysis</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                      <span className="text-blue-900">Standard Tariff Rate (MFN)</span>
                      <span className="text-blue-700">
                        {selectedProduct.tariffRate !== null && selectedProduct.tariffRate !== undefined
                          ? `${(selectedProduct.tariffRate * 100).toFixed(2)}%`
                          : 'N/A'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                      <span className="text-blue-900">Tariff Amount</span>
                      <span className="text-blue-700">
                        {selectedProduct.tariffAmount !== null && selectedProduct.tariffAmount !== undefined
                          ? `$${selectedProduct.tariffAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          : 'N/A'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                      <span className="text-blue-900">Total Cost (Unit Cost + Tariff)</span>
                      <span className="text-blue-700">
                        {selectedProduct.totalCost !== null && selectedProduct.totalCost !== undefined
                          ? `$${selectedProduct.totalCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          : selectedProduct.unitCost && selectedProduct.tariffAmount
                          ? `$${(Number(selectedProduct.unitCost) + Number(selectedProduct.tariffAmount)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          : 'N/A'}
                      </span>
                    </div>
                    {selectedProduct.alternateClassifications && selectedProduct.alternateClassifications.length > 0 ? (
                      <div className="p-3 bg-amber-50 rounded-lg">
                        <span className="text-amber-900 text-sm font-medium block mb-2">Alternate Classifications</span>
                        <div className="space-y-2">
                          {selectedProduct.alternateClassifications.map((alt: any, idx: number) => (
                            <div key={idx} className="flex items-center justify-between text-sm">
                              <div>
                                <span className="text-amber-800 font-mono">{alt.hts}</span>
                                <span className="text-amber-700 ml-2">{alt.description}</span>
                              </div>
                              <span className="text-amber-600 text-xs">{alt.confidence}%</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : selectedProduct.alternateClassification ? (
                      <div className="flex items-center justify-between p-3 bg-amber-50 rounded-lg">
                        <span className="text-amber-900">Alternate Classification</span>
                        <span className="text-amber-700">{selectedProduct.alternateClassification}</span>
                      </div>
                    ) : null}
                  </div>
                </div>

                {/* Compliance History */}
                <div className="border-t border-slate-200 pt-6 mt-6">
                  <h3 className="text-slate-900 mb-4">Classification History</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between p-3 bg-slate-50 rounded">
                      <div>
                        <div className="text-slate-900">HTS {selectedProduct.hts}</div>
                        <div className="text-slate-600">
                          Confidence: {selectedProduct.confidence}%
                        </div>
                      </div>
                      <div className="text-slate-600">{new Date(selectedProduct.lastUpdated).toLocaleDateString()}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowDetailsModal(true)}
                    className="w-full mt-4 px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <FileText className="w-5 h-5" />
                    View Full Details
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
                <div className="bg-slate-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Package className="w-8 h-8 text-slate-400" />
                </div>
                <h3 className="text-slate-900 mb-2">Select a Product</h3>
                <p className="text-slate-600">Choose a product from the list to view its compliance profile</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add/Edit Product Modal */}
      {showAddModal && (
        <AddProductModal
          onClose={() => {
            setShowAddModal(false);
            setEditingProduct(null);
          }}
          onSave={handleSaveProduct}
          editingProduct={editingProduct}
        />
      )}

      {/* AI Assistant */}
      {showAssistant && (
        <LLMAssistant
          productContext={selectedProduct ? {
            name: selectedProduct.name,
            description: `${selectedProduct.materials} from ${selectedProduct.origin}`,
            hts: selectedProduct.hts,
            origin: selectedProduct.origin
          } : undefined}
          onClose={() => setShowAssistant(false)}
        />
      )}

      {/* Product Details Modal */}
      {showDetailsModal && selectedProduct && (
        <ProductDetailsModal
          product={selectedProduct}
          onClose={() => setShowDetailsModal(false)}
        />
      )}
    </div>
  );
}