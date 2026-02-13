import { useState } from 'react';
import { Package, Upload, FileSpreadsheet, X, File, FileText, Plus, CheckCircle, Sparkles } from 'lucide-react';
import { ClassificationView } from './ClassificationView';
import { BulkUpload } from './BulkUpload';

type InputMode = 'manual' | 'file';

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

export function UnifiedClassification() {
  const [inputMode, setInputMode] = useState<InputMode>('manual');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [supportingFiles, setSupportingFiles] = useState<File[]>([]);
  const [bulkDescription, setBulkDescription] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [showBulkResults, setShowBulkResults] = useState(false);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    const files = Array.from(e.dataTransfer.files);
    const mainFile = files.find(f => 
      f.name.endsWith('.csv') || 
      f.name.endsWith('.xlsx') || 
      f.name.endsWith('.xls') ||
      f.name.endsWith('.pdf')
    );
    
    if (mainFile) {
      setUploadedFile(mainFile);
      setInputMode('file');
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files[0]) {
      setUploadedFile(files[0]);
      setInputMode('file');
    }
  };

  const handleSupportingFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      setSupportingFiles([...supportingFiles, ...Array.from(files)]);
    }
  };

  const removeSupportingFile = (index: number) => {
    setSupportingFiles(supportingFiles.filter((_, i) => i !== index));
  };

  const getFileIcon = (fileName: string) => {
    const parts = fileName.split('.');
    const ext = parts.length > 0 && parts[parts.length - 1] ? parts[parts.length - 1].toLowerCase() : '';
    if (ext === 'pdf') return <FileText className="w-4 h-4 text-red-600" />;
    if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') return <FileText className="w-4 h-4 text-green-600" />;
    if (ext === 'doc' || ext === 'docx') return <FileText className="w-4 h-4 text-blue-600" />;
    return <File className="w-4 h-4 text-slate-600" />;
  };

  const resetToManual = () => {
    setUploadedFile(null);
    setSupportingFiles([]);
    setBulkDescription('');
    setInputMode('manual');
    setShowBulkResults(false);
  };

  const startBulkClassification = () => {
    setShowBulkResults(true);
  };

  // Show bulk results if we're in file mode and user has started classification
  if (inputMode === 'file' && showBulkResults) {
    return (
      <div className="p-8">
        <div className="max-w-7xl mx-auto">
          <BulkUpload 
            initialFile={uploadedFile}
            initialSupportingFiles={supportingFiles}
            autoStart={true}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-slate-900 mb-2">Product Classification</h1>
          <p className="text-slate-600">Classify products with natural language or upload bulk files for AI-powered HS/HTS classification</p>
        </div>

        {/* Bulk Upload Button - Always Visible */}
        {!uploadedFile && (
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl p-6 mb-6 shadow-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="bg-white/20 p-3 rounded-lg">
                  <Upload className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-white mb-1">Need to classify multiple products?</h3>
                  <p className="text-blue-100 text-sm">Upload a CSV, Excel, or PDF file for bulk classification</p>
                </div>
              </div>
              <label className="px-6 py-3 bg-white text-blue-600 rounded-lg hover:bg-blue-50 transition-colors cursor-pointer inline-flex items-center gap-2 shadow-lg">
                <FileSpreadsheet className="w-5 h-5" />
                Upload File
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls,.pdf"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        )}

        {/* File Upload Mode */}
        {uploadedFile && !showBulkResults && (
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
                    <p className="text-slate-600 text-sm">{uploadedFile.name}</p>
                    <p className="text-slate-500 text-xs mt-1">
                      {(uploadedFile.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                </div>
                <button
                  onClick={resetToManual}
                  className="px-4 py-2 text-slate-600 hover:text-slate-900 transition-colors"
                >
                  Choose Different File
                </button>
              </div>
            </div>

            {/* Product Description */}
            <div className="bg-white rounded-xl p-6 border border-slate-200">
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="w-5 h-5 text-slate-600" />
                  <div>
                    <h4 className="text-slate-900">General Product Description (Optional)</h4>
                    <p className="text-slate-600 text-sm">Describe the products' intended use, materials, or function</p>
                  </div>
                </div>
              </div>
              <textarea
                value={bulkDescription}
                onChange={(e) => setBulkDescription(e.target.value)}
                placeholder="Example: These are consumer electronics products made primarily of ABS plastic and electronic components. They are intended for indoor/outdoor recreational use and feature wireless connectivity. Most items include rechargeable lithium batteries."
                rows={4}
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              />
              <p className="text-xs text-slate-500 mt-2">
                This general description will be applied to all products in your upload to improve classification accuracy
              </p>
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
                  htmlFor="supporting-files-upload"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors cursor-pointer flex items-center gap-2 text-sm"
                >
                  <Plus className="w-4 h-4" />
                  Add Files
                </label>
                <input
                  id="supporting-files-upload"
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
                    {bulkDescription && supportingFiles.length > 0
                      ? `Main file + description + ${supportingFiles.length} supporting document${supportingFiles.length > 1 ? 's' : ''} ready`
                      : bulkDescription
                      ? 'Main file + description ready for classification'
                      : supportingFiles.length > 0
                      ? `Main file + ${supportingFiles.length} supporting document${supportingFiles.length > 1 ? 's' : ''} ready`
                      : 'Main file ready for classification'}
                  </p>
                </div>
                <button
                  onClick={startBulkClassification}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
                >
                  <CheckCircle className="w-5 h-5" />
                  Start Classification
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Manual Entry Mode - Always Show When No File */}
        {!uploadedFile && (
          <ClassificationView />
        )}
      </div>
    </div>
  );
}