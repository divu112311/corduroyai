import { useState } from 'react';
import { Upload, FileSpreadsheet, Download, CheckCircle, AlertCircle, Clock, Filter, ArrowUpDown, Plus, X, FileText, File, Sparkles } from 'lucide-react';
import { BulkItemDetail } from './BulkItemDetail';
import { ExceptionReview } from './ExceptionReview';
import React from 'react';

interface BulkItem {
  id: number;
  productName: string;
  description: string;
  status: 'pending' | 'complete' | 'exception';
  hts?: string;
  confidence?: number;
  tariff?: string;
  origin?: string;
  materials?: string;
  cost?: string;
}

type SortField = 'name' | 'confidence' | 'status';
type SortDirection = 'asc' | 'desc';

interface BulkUploadProps {
  initialFile?: File | null;
  initialSupportingFiles?: File[];
  autoStart?: boolean;
}

export function BulkUpload({ initialFile, initialSupportingFiles = [], autoStart = false }: BulkUploadProps = {}) {
  const [dragActive, setDragActive] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [items, setItems] = useState<BulkItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<BulkItem | null>(null);
  const [exceptionItem, setExceptionItem] = useState<BulkItem | null>(null);
  const [filterStatus, setFilterStatus] = useState<'all' | 'complete' | 'exception' | 'pending'>('all');
  const [sortField, setSortField] = useState<SortField>('status');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [showFilters, setShowFilters] = useState(false);
  const [supportingFiles, setSupportingFiles] = useState<File[]>(initialSupportingFiles);
  const [uploadedMainFile, setUploadedMainFile] = useState<File | null>(initialFile);
  const [aiChatOpen, setAiChatOpen] = useState(true);

  // Auto-start classification if initial file is provided
  React.useEffect(() => {
    if (initialFile && autoStart && items.length === 0 && !processing) {
      startClassification();
    }
  }, [initialFile, autoStart]);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleFile = (file: File) => {
    setUploadedMainFile(file);
  };

  const startClassification = () => {
    setProcessing(true);
    
    // Simulate file processing
    setTimeout(() => {
      const mockItems: BulkItem[] = [
        { id: 1, productName: 'Wireless Bluetooth Speaker', description: 'Portable speaker with rechargeable battery', status: 'complete', hts: '8517.62.0050', confidence: 96, tariff: '0%', origin: 'China', materials: 'ABS Plastic', cost: '$12.50' },
        { id: 2, productName: 'Organic Cotton T-Shirt', description: '100% organic cotton, crew neck', status: 'complete', hts: '6109.10.0012', confidence: 97, tariff: '16.5%', origin: 'India', materials: '100% Cotton', cost: '$4.25' },
        { id: 3, productName: 'Smart Watch with Health Monitor', description: 'Fitness tracking, heart rate, GPS', status: 'exception', hts: '9102.11.0000', confidence: 67, tariff: '9.8%', origin: 'China', materials: 'Electronics', cost: '$32.00' },
        { id: 4, productName: 'LED Desk Lamp', description: 'Adjustable brightness, USB charging', status: 'complete', hts: '9405.20.6000', confidence: 98, tariff: '3.9%', origin: 'Vietnam', materials: 'Aluminum', cost: '$8.75' },
        { id: 5, productName: 'Stainless Steel Water Bottle', description: 'Insulated, 32oz capacity', status: 'complete', hts: '7323.93.0000', confidence: 99, tariff: '0%', origin: 'South Korea', materials: 'Stainless Steel', cost: '$6.30' },
        { id: 6, productName: 'Cotton-Polyester Blend Fabric', description: '60% cotton, 40% polyester', status: 'exception', hts: '5515.11.0000', confidence: 72, tariff: '12%', origin: 'China', materials: 'Textile', cost: '$2.15' },
        { id: 7, productName: 'Ceramic Coffee Mug', description: 'Dishwasher safe, 12oz', status: 'complete', hts: '6912.00.4810', confidence: 95, tariff: '4.5%', origin: 'Mexico', materials: 'Ceramic', cost: '$1.80' },
        { id: 8, productName: 'Bamboo Cutting Board', description: 'Large size, with juice groove', status: 'complete', hts: '4419.90.9040', confidence: 94, tariff: '3.2%', origin: 'Vietnam', materials: 'Bamboo', cost: '$5.50' },
      ];
      
      setItems(mockItems);
      setProcessing(false);
    }, 2000);
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const filteredAndSortedItems = items
    .filter(item => filterStatus === 'all' || item.status === filterStatus)
    .sort((a, b) => {
      let comparison = 0;
      
      if (sortField === 'name') {
        comparison = a.productName.localeCompare(b.productName);
      } else if (sortField === 'confidence') {
        comparison = (a.confidence || 0) - (b.confidence || 0);
      } else if (sortField === 'status') {
        const statusOrder = { exception: 0, pending: 1, complete: 2 };
        comparison = statusOrder[a.status] - statusOrder[b.status];
      }
      
      return sortDirection === 'asc' ? comparison : -comparison;
    });

  const stats = {
    total: items.length,
    complete: items.filter(i => i.status === 'complete').length,
    exceptions: items.filter(i => i.status === 'exception').length,
    pending: items.filter(i => i.status === 'pending').length,
  };

  const handleViewItem = (item: BulkItem) => {
    if (item.status === 'exception') {
      setExceptionItem(item);
    } else {
      setSelectedItem(item);
    }
  };

  const handleSupportingFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setSupportingFiles([...supportingFiles, ...newFiles]);
    }
  };

  const removeSupportingFile = (index: number) => {
    setSupportingFiles(supportingFiles.filter((_, i) => i !== index));
  };

  const handleExportResults = () => {
    if (items.length === 0) {
      alert('No results to export');
      return;
    }

    // Create CSV content
    const headers = ['Product Name', 'Description', 'Status', 'HTS Code', 'Confidence (%)', 'Tariff', 'Origin', 'Materials', 'Cost'];
    const csvRows = [headers.join(',')];

    items.forEach(item => {
      const row = [
        `"${item.productName}"`,
        `"${item.description}"`,
        item.status,
        item.hts || 'N/A',
        item.confidence ? item.confidence.toString() : 'N/A',
        item.tariff || 'N/A',
        item.origin || 'N/A',
        item.materials || 'N/A',
        item.cost || 'N/A'
      ];
      csvRows.push(row.join(','));
    });

    const csvContent = csvRows.join('\n');
    
    // Create and trigger download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `bulk-classification-results-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getFileIcon = (fileName: string) => {
    const parts = fileName.split('.');
    const ext = parts.length > 0 && parts[parts.length - 1] ? parts[parts.length - 1].toLowerCase() : '';
    if (ext === 'pdf') return <FileText className="w-4 h-4 text-red-600" />;
    if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') return <FileText className="w-4 h-4 text-green-600" />;
    if (ext === 'doc' || ext === 'docx') return <FileText className="w-4 h-4 text-blue-600" />;
    return <File className="w-4 h-4 text-slate-600" />;
  };

  return (
    <div>
      <div className="max-w-7xl mx-auto">
        {/* Upload Area */}
        {items.length === 0 && (
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            className={`bg-white rounded-xl p-12 border-2 border-dashed transition-all ${
              dragActive ? 'border-blue-500 bg-blue-50' : 'border-slate-300'
            } ${uploadedMainFile ? 'hidden' : ''}`}
          >
            <div className="text-center">
              <div className={`bg-slate-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 ${
                dragActive ? 'bg-blue-100' : ''
              }`}>
                {processing ? (
                  <div className="animate-spin w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full" />
                ) : (
                  <Upload className={`w-10 h-10 ${dragActive ? 'text-blue-600' : 'text-slate-400'}`} />
                )}
              </div>
              
              {processing ? (
                <div>
                  <h3 className="text-slate-900 mb-2">Processing File...</h3>
                  <p className="text-slate-600">AI is classifying your products</p>
                </div>
              ) : (
                <>
                  <h3 className="text-slate-900 mb-2">
                    {dragActive ? 'Drop file to upload' : 'Upload Product File'}
                  </h3>
                  <p className="text-slate-600 mb-4">
                    Drag and drop your CSV or Excel file here, or click to browse
                  </p>
                  <input
                    type="file"
                    id="file-upload"
                    accept=".csv,.xlsx,.xls"
                    onChange={handleFileInput}
                    className="hidden"
                  />
                  <label
                    htmlFor="file-upload"
                    className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors cursor-pointer"
                  >
                    <FileSpreadsheet className="w-5 h-5" />
                    Choose File
                  </label>
                  <p className="text-slate-500 text-sm mt-4">
                    Supports CSV, XLSX, and XLS formats (Max 10,000 rows)
                  </p>
                </>
              )}
            </div>
          </div>
        )}

        {/* File Ready for Classification */}
        {uploadedMainFile && !processing && items.length === 0 && (
          <div className="space-y-6">
            {/* Main File Card */}
            <div className="bg-white rounded-xl p-6 border-2 border-green-200 bg-green-50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="bg-green-100 p-3 rounded-lg">
                    <FileSpreadsheet className="w-8 h-8 text-green-600" />
                  </div>
                  <div>
                    <h4 className="text-slate-900">Ready to Classify</h4>
                    <p className="text-slate-600 text-sm">{uploadedMainFile.name}</p>
                    <p className="text-slate-500 text-xs mt-1">
                      {(uploadedMainFile.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setUploadedMainFile(null);
                    setSupportingFiles([]);
                  }}
                  className="px-4 py-2 text-slate-600 hover:text-slate-900 transition-colors"
                >
                  Choose Different File
                </button>
              </div>
            </div>

            {/* Supporting Documents */}
            <div className="bg-white rounded-xl p-6 border border-slate-200">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-slate-600" />
                  <div>
                    <h4 className="text-slate-900">Supporting Documents (Optional)</h4>
                    <p className="text-slate-600 text-sm">Specs, BOMs, datasheets to improve accuracy</p>
                  </div>
                </div>
                <label
                  htmlFor="supporting-files-upload-ready"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors cursor-pointer flex items-center gap-2 text-sm"
                >
                  <Plus className="w-4 h-4" />
                  Add Files
                </label>
                <input
                  id="supporting-files-upload-ready"
                  type="file"
                  multiple
                  accept=".pdf,.xlsx,.xls,.csv,.doc,.docx,.txt,.jpg,.jpeg,.png"
                  onChange={handleSupportingFileUpload}
                  className="hidden"
                />
              </div>

              {supportingFiles.length > 0 ? (
                <div className="space-y-2">
                  {supportingFiles.map((file, idx) => (
                    <div key={idx} className="flex items-center gap-3 p-3 bg-slate-50 rounded border border-slate-200">
                      {getFileIcon(file.name)}
                      <div className="flex-1 min-w-0">
                        <p className="text-slate-900 text-sm truncate">{file.name}</p>
                        <p className="text-slate-500 text-xs">
                          {(file.size / 1024).toFixed(1)} KB
                        </p>
                      </div>
                      <button
                        onClick={() => removeSupportingFile(idx)}
                        className="p-1 hover:bg-red-50 rounded transition-colors flex-shrink-0"
                      >
                        <X className="w-4 h-4 text-red-600" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 border-2 border-dashed border-slate-200 rounded-lg bg-slate-50">
                  <p className="text-slate-500 text-sm">
                    No supporting documents uploaded
                  </p>
                  <p className="text-slate-400 text-xs mt-1">
                    These documents help the AI better understand your products
                  </p>
                </div>
              )}
            </div>

            {/* Start Classification Button */}
            <div className="bg-white rounded-xl p-6 border border-slate-200">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-slate-900 mb-1">Ready to Start</h4>
                  <p className="text-slate-600 text-sm">
                    {supportingFiles.length > 0
                      ? `Main file + ${supportingFiles.length} supporting document${supportingFiles.length > 1 ? 's' : ''} ready`
                      : 'Main file ready for classification'}
                  </p>
                </div>
                <button
                  onClick={startClassification}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
                >
                  <CheckCircle className="w-5 h-5" />
                  Start Classification
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Processing State */}
        {processing && items.length === 0 && (
          <div className="bg-white rounded-xl p-12 border border-slate-200">
            <div className="text-center">
              <div className="bg-blue-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4">
                <div className="animate-spin w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full" />
              </div>
              <h3 className="text-slate-900 mb-2">Processing File...</h3>
              <p className="text-slate-600">AI is classifying your products</p>
              {supportingFiles.length > 0 && (
                <p className="text-slate-500 text-sm mt-2">
                  Using {supportingFiles.length} supporting document{supportingFiles.length > 1 ? 's' : ''} for enhanced accuracy
                </p>
              )}
            </div>
          </div>
        )}

        {/* Results */}
        {items.length > 0 && (
          <div className="space-y-6">
            {/* AI Analysis Section - At Top of Results */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
              <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4 border-b border-blue-500">
                <div className="flex items-center gap-3">
                  <div className="bg-white/20 p-2 rounded-lg">
                    <Sparkles className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-white">AI Analysis</h3>
                    <p className="text-blue-100 text-sm">File insights & classification summary</p>
                  </div>
                </div>
              </div>

              <div className="p-4 max-h-64 overflow-y-auto">
                <div className="space-y-3">
                  {/* Main File Analysis */}
                  <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
                    <p className="text-blue-900 text-sm mb-1">
                      <strong>📄 Main File Detected:</strong>
                    </p>
                    <p className="text-blue-800 text-xs mb-1">
                      {uploadedMainFile && uploadedMainFile.name.endsWith('.pdf') ? 'PDF document' : uploadedMainFile && uploadedMainFile.name.endsWith('.csv') ? 'CSV file' : 'Excel spreadsheet'} 
                      {' with 8 product entries'}
                    </p>
                    <p className="text-blue-800 text-xs">
                      Found columns: <span className="font-medium">Product Name, Description, Country of Origin, Materials, Unit Cost</span>
                    </p>
                    <p className="text-blue-700 text-xs mt-1">
                      Products include electronics, textiles, and household items.
                    </p>
                  </div>

                  {/* Classification Summary */}
                  <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                    <p className="text-slate-900 text-sm mb-1">
                      <strong>✅ Classification Complete:</strong>
                    </p>
                    <ul className="space-y-1 text-slate-700 text-xs">
                      <li>• {stats.complete} products classified successfully</li>
                      <li>• {stats.exceptions} exceptions need review</li>
                      <li>• Average confidence: {Math.round(items.reduce((acc, i) => acc + (i.confidence || 0), 0) / items.length)}%</li>
                    </ul>
                  </div>

                  {/* Supporting Files */}
                  {supportingFiles.length > 0 && (
                    <div className="bg-green-50 rounded-lg p-3 border border-green-100">
                      <p className="text-green-900 text-sm mb-1">
                        <strong>📎 Supporting Documents ({supportingFiles.length}):</strong>
                      </p>
                      <ul className="space-y-1">
                        {supportingFiles.map((file, idx) => (
                          <li key={idx} className="text-green-800 text-xs flex items-start gap-2">
                            <span className="flex-shrink-0">•</span>
                            <span className="truncate">
                              {file.name} - {file.name.toLowerCase().includes('spec') || file.name.toLowerCase().includes('datasheet') ? 'Specifications' : file.name.toLowerCase().includes('bom') ? 'Bill of Materials' : 'Details'}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Suggestions */}
                  {stats.exceptions > 0 && (
                    <div className="bg-amber-50 rounded-lg p-3 border border-amber-200">
                      <p className="text-amber-900 text-sm mb-1">
                        <strong>💡 Suggestions:</strong>
                      </p>
                      <ul className="space-y-1 text-amber-800 text-xs">
                        <li className="flex items-start gap-2">
                          <span className="flex-shrink-0">•</span>
                          <span>Review {stats.exceptions} exception{stats.exceptions > 1 ? 's' : ''} for low confidence scores</span>
                        </li>
                        {supportingFiles.length === 0 && (
                          <li className="flex items-start gap-2">
                            <span className="flex-shrink-0">•</span>
                            <span>Adding spec sheets could improve accuracy</span>
                          </li>
                        )}
                        <li className="flex items-start gap-2">
                          <span className="flex-shrink-0">•</span>
                          <span>Click any row to view alternative HTS codes</span>
                        </li>
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Exception Review Prompt */}
            {stats.exceptions > 0 && (
              <div className="bg-gradient-to-r from-red-50 to-amber-50 rounded-xl p-5 border-2 border-red-200 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="bg-red-100 p-3 rounded-lg">
                      <AlertCircle className="w-6 h-6 text-red-600" />
                    </div>
                    <div>
                      <h3 className="text-red-900 mb-1">Action Required: {stats.exceptions} Exception{stats.exceptions > 1 ? 's' : ''} Need Review</h3>
                      <p className="text-red-700 text-sm">
                        Low confidence scores require your review before approval
                      </p>
                    </div>
                  </div>
                  <span className="text-red-700 font-medium whitespace-nowrap">Review Below ↓</span>
                </div>
              </div>
            )}

            {/* Stats Summary */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl p-4 border border-slate-200">
                <div className="text-slate-600 text-sm mb-1">Total Products</div>
                <div className="text-slate-900">{stats.total}</div>
              </div>
              <div className="bg-green-50 rounded-xl p-4 border border-green-200">
                <div className="text-green-700 text-sm mb-1">Completed</div>
                <div className="text-green-900">{stats.complete}</div>
              </div>
              <div className="bg-red-50 rounded-xl p-4 border border-red-200">
                <div className="text-red-700 text-sm mb-1">Exceptions</div>
                <div className="text-red-900">{stats.exceptions}</div>
              </div>
              <div className="bg-amber-50 rounded-xl p-4 border border-amber-200">
                <div className="text-amber-700 text-sm mb-1">Pending</div>
                <div className="text-amber-900">{stats.pending}</div>
              </div>
            </div>

            {/* Actions */}
            <div className="bg-white rounded-xl p-4 border border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button
                  onClick={handleExportResults}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Export Results
                </button>
                <button 
                  onClick={() => setShowFilters(!showFilters)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors flex items-center gap-2"
                >
                  <Filter className="w-4 h-4" />
                  Filters
                </button>
              </div>
              <button 
                onClick={() => {
                  setItems([]);
                  setUploadedMainFile(null);
                  setSupportingFiles([]);
                }}
                className="px-4 py-2 text-slate-600 hover:text-slate-900 transition-colors"
              >
                Upload New File
              </button>
            </div>

            {/* Filters */}
            {showFilters && (
              <div className="bg-white rounded-xl p-4 border border-slate-200">
                <div className="flex items-center gap-4">
                  <span className="text-slate-700">Filter by status:</span>
                  <button
                    onClick={() => setFilterStatus('all')}
                    className={`px-3 py-1 rounded-lg text-sm transition-colors ${
                      filterStatus === 'all' 
                        ? 'bg-blue-600 text-white' 
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    All ({stats.total})
                  </button>
                  <button
                    onClick={() => setFilterStatus('complete')}
                    className={`px-3 py-1 rounded-lg text-sm transition-colors ${
                      filterStatus === 'complete' 
                        ? 'bg-green-600 text-white' 
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    Complete ({stats.complete})
                  </button>
                  <button
                    onClick={() => setFilterStatus('exception')}
                    className={`px-3 py-1 rounded-lg text-sm transition-colors ${
                      filterStatus === 'exception' 
                        ? 'bg-red-600 text-white' 
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    Exceptions ({stats.exceptions})
                  </button>
                  <button
                    onClick={() => setFilterStatus('pending')}
                    className={`px-3 py-1 rounded-lg text-sm transition-colors ${
                      filterStatus === 'pending' 
                        ? 'bg-amber-600 text-white' 
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    Pending ({stats.pending})
                  </button>
                </div>
              </div>
            )}

            {/* Results Table */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-6 py-3 text-left">
                        <button
                          onClick={() => handleSort('status')}
                          className="flex items-center gap-2 text-slate-700 text-sm hover:text-slate-900"
                        >
                          Status
                          <ArrowUpDown className="w-4 h-4" />
                        </button>
                      </th>
                      <th className="px-6 py-3 text-left">
                        <button
                          onClick={() => handleSort('name')}
                          className="flex items-center gap-2 text-slate-700 text-sm hover:text-slate-900"
                        >
                          Product Name
                          <ArrowUpDown className="w-4 h-4" />
                        </button>
                      </th>
                      <th className="px-6 py-3 text-left text-slate-700 text-sm">Description</th>
                      <th className="px-6 py-3 text-left text-slate-700 text-sm">Origin</th>
                      <th className="px-6 py-3 text-left text-slate-700 text-sm">HTS Code</th>
                      <th className="px-6 py-3 text-left">
                        <button
                          onClick={() => handleSort('confidence')}
                          className="flex items-center gap-2 text-slate-700 text-sm hover:text-slate-900"
                        >
                          Confidence
                          <ArrowUpDown className="w-4 h-4" />
                        </button>
                      </th>
                      <th className="px-6 py-3 text-left text-slate-700 text-sm">Tariff</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredAndSortedItems.map((item) => (
                      <tr 
                        key={item.id} 
                        onClick={() => handleViewItem(item)}
                        className="hover:bg-slate-50 cursor-pointer transition-colors"
                      >
                        <td className="px-6 py-4">
                          {item.status === 'complete' && (
                            <div className="flex items-center gap-2 text-green-600">
                              <CheckCircle className="w-5 h-5" />
                              <span className="text-sm">Complete</span>
                            </div>
                          )}
                          {item.status === 'exception' && (
                            <div className="flex items-center gap-2 text-red-600">
                              <AlertCircle className="w-5 h-5" />
                              <span className="text-sm">Exception</span>
                            </div>
                          )}
                          {item.status === 'pending' && (
                            <div className="flex items-center gap-2 text-amber-600">
                              <Clock className="w-5 h-5" />
                              <span className="text-sm">Pending</span>
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 text-slate-900">{item.productName}</td>
                        <td className="px-6 py-4 text-slate-600 text-sm">{item.description}</td>
                        <td className="px-6 py-4 text-slate-900 text-sm">{item.origin}</td>
                        <td className="px-6 py-4 text-slate-900">{item.hts}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <span className={`text-sm ${
                              (item.confidence || 0) >= 90 ? 'text-green-600' : 
                              (item.confidence || 0) >= 75 ? 'text-amber-600' : 
                              'text-red-600'
                            }`}>
                              {item.confidence}%
                            </span>
                            <div className="w-16 h-1.5 bg-slate-200 rounded-full">
                              <div 
                                className={`h-full rounded-full ${
                                  (item.confidence || 0) >= 90 ? 'bg-green-500' : 
                                  (item.confidence || 0) >= 75 ? 'bg-amber-500' : 
                                  'bg-red-500'
                                }`}
                                style={{ width: `${item.confidence}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-slate-900">{item.tariff}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {selectedItem && (
        <BulkItemDetail
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onSave={(updatedItem) => {
            setItems(items.map(i => i.id === updatedItem.id ? updatedItem : i));
            setSelectedItem(null);
          }}
        />
      )}

      {exceptionItem && (
        <ExceptionReview
          product={{
            id: exceptionItem.id,
            productName: exceptionItem.productName,
            description: exceptionItem.description,
            hts: exceptionItem.hts || '',
            confidence: exceptionItem.confidence || 0,
            tariff: exceptionItem.tariff || '',
            origin: exceptionItem.origin || 'China',
            reason: 'Low confidence score - Multiple possible classifications detected'
          }}
          onClose={() => setExceptionItem(null)}
          onApprove={() => {
            setItems(items.map(i => 
              i.id === exceptionItem.id ? { ...i, status: 'complete' as const } : i
            ));
            setExceptionItem(null);
          }}
          onReject={() => {
            setExceptionItem(null);
          }}
        />
      )}
    </div>
  );
}