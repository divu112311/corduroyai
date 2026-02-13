import { X, Package, MapPin, DollarSign, FileText, Calendar, CheckCircle, AlertCircle, Download, ExternalLink } from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface ProductDetailsModalProps {
  product: any;
  onClose: () => void;
  onEdit?: () => void;
}

interface Document {
  id: number;
  document_type: string;
  file_name: string;
  file_type: string;
  file_url: string;
  uploaded_at: string;
}

export function ProductDetailsModal({ product, onClose, onEdit }: ProductDetailsModalProps) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoadingDocs, setIsLoadingDocs] = useState(true);

  useEffect(() => {
    const fetchDocuments = async () => {
      if (!product?.productId) {
        setIsLoadingDocs(false);
        return;
      }

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setIsLoadingDocs(false);
          return;
        }

        const { data: docs, error } = await supabase
          .from('user_product_documents')
          .select('id, document_type, file_name, file_type, file_url, uploaded_at')
          .eq('product_id', product.productId)
          .eq('user_id', user.id)
          .order('uploaded_at', { ascending: false });

        if (error) {
          console.error('Error fetching documents:', error);
          setDocuments([]);
        } else {
          setDocuments(docs || []);
        }
      } catch (error) {
        console.error('Error fetching documents:', error);
        setDocuments([]);
      } finally {
        setIsLoadingDocs(false);
      }
    };

    fetchDocuments();
  }, [product?.productId]);
  const handleExportPDF = () => {
    // Create a printable version of the classification reasoning
    window.print();
  };

  const handleViewHTSUS = () => {
    // Open HTSUS reference for the specific code
    const htsCode = product.hts.replace(/\./g, '');
    window.open(`https://hts.usitc.gov/?query=${htsCode}`, '_blank');
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-0 md:p-4">
      <div className="bg-white rounded-none md:rounded-xl w-full h-full md:max-w-4xl md:w-full md:max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-gradient-to-r from-blue-50 to-indigo-50">
          <div>
            <h2 className="text-slate-900">{product.name}</h2>
            <p className="text-slate-600 text-sm">SKU: {product.sku}</p>
            {product.description && (
              <p className="text-slate-500 text-xs mt-1">{product.description}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Classification Card */}
          <div className="mb-6 p-5 bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex-1">
                <div className="text-green-900 text-sm mb-2">Current Classification</div>
                <div className="text-green-800 text-lg mb-3 flex items-center gap-2">
                  <span>HTS Code: {product.hts}</span>
                </div>
                
                {/* HARDCODED: HTS Chapter/Heading/Subheading descriptions - No fields in DB for these descriptions */}
                {/* TODO: Fetch from hts_code_lookup table when created, or from hts_description field if added */}
                <div className="space-y-1 text-xs mb-3">
                  <div className="mb-2">
                    <span className="px-1 py-0.5 bg-red-100 text-red-600 text-[10px] rounded border border-red-300">HARDCODED</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-green-700 min-w-[60px]">Chapter</span>
                    <span className="text-green-800">
                      {product.hts.startsWith('85') && '85 — Electrical machinery and equipment'}
                      {product.hts.startsWith('61') && '61 — Articles of apparel, knitted or crocheted'}
                      {product.hts.startsWith('94') && '94 — Furniture; bedding, mattresses, cushions'}
                      {product.hts.startsWith('73') && '73 — Articles of iron or steel'}
                      {product.hts.startsWith('42') && '42 — Articles of leather; travel goods'}
                      {product.hts.startsWith('91') && '91 — Clocks and watches and parts thereof'}
                      {product.hts.startsWith('55') && '55 — Man-made staple fibers'}
                      {product.hts.startsWith('69') && '69 — Ceramic products'}
                      {product.hts.startsWith('95') && '95 — Toys, games and sports equipment'}
                      {product.hts.startsWith('44') && '44 — Wood and articles of wood'}
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-green-700 min-w-[60px]">Heading</span>
                    <span className="text-green-800">
                      {product.hts.startsWith('8518') && '8518 — Loudspeakers, headphones, microphones'}
                      {product.hts.startsWith('6109') && '6109 — T-shirts, singlets and other vests, knitted'}
                      {product.hts.startsWith('9405') && '9405 — Lamps and lighting fittings'}
                      {product.hts.startsWith('7323') && '7323 — Table, kitchen or other household articles of iron or steel'}
                      {product.hts.startsWith('4202') && '4202 — Trunks, suitcases, vanity cases, briefcases'}
                      {product.hts.startsWith('9102') && '9102 — Wrist watches, pocket watches and other watches'}
                      {product.hts.startsWith('5515') && '5515 — Other woven fabrics of synthetic staple fibers'}
                      {product.hts.startsWith('6912') && '6912 — Tableware, kitchenware, other household articles of ceramics'}
                      {product.hts.startsWith('9506') && '9506 — Articles and equipment for general physical exercise'}
                      {product.hts.startsWith('4421') && '4421 — Other articles of wood'}
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-green-700 min-w-[60px]">Subheading</span>
                    <span className="text-green-800">
                      {product.hts.startsWith('8518.22') && '8518.22 — Multiple loudspeakers, mounted in the same enclosure'}
                      {product.hts.startsWith('6109.10') && '6109.10 — Of cotton'}
                      {product.hts.startsWith('9405.20') && '9405.20 — Electric table, desk, bedside or floor-standing lamps'}
                      {product.hts.startsWith('7323.93') && '7323.93 — Of stainless steel'}
                      {product.hts.startsWith('4202.92') && '4202.92 — With outer surface of sheeting of plastic or of textile materials'}
                      {product.hts.startsWith('9102.11') && '9102.11 — With mechanical display only'}
                      {product.hts.startsWith('5515.11') && '5515.11 — Mixed mainly or solely with viscose rayon staple fibers'}
                      {product.hts.startsWith('6912.00') && '6912.00 — Tableware, kitchenware, other household articles'}
                      {product.hts.startsWith('9506.91') && '9506.91 — Articles and equipment for general physical exercise, gymnastics or athletics'}
                      {product.hts.startsWith('4421.99') && '4421.99 — Other'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 bg-green-100 rounded-lg">
                <CheckCircle className="w-5 h-5 text-green-700" />
                <span className="text-green-900">{product.confidence}% Confidence</span>
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm text-green-700">
              <Calendar className="w-4 h-4" />
              <span>Last updated: {new Date(product.lastUpdated).toLocaleDateString('en-US', { 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}</span>
            </div>
          </div>

          {/* Product Information Grid */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
              <div className="flex items-center gap-2 mb-2 text-slate-700">
                <Package className="w-5 h-5" />
                <span>Materials & Composition</span>
              </div>
              <p className="text-slate-900 text-sm">{product.materials}</p>
            </div>

            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
              <div className="flex items-center gap-2 mb-2 text-slate-700">
                <MapPin className="w-5 h-5" />
                <span>Country of Origin</span>
              </div>
              <p className="text-slate-900 text-sm">{product.origin}</p>
            </div>

            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
              <div className="flex items-center gap-2 mb-2 text-slate-700">
                <DollarSign className="w-5 h-5" />
                <span>Unit Cost</span>
              </div>
              <p className="text-slate-900 text-sm">{product.cost}</p>
            </div>

            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
              <div className="flex items-center gap-2 mb-2 text-slate-700">
                <FileText className="w-5 h-5" />
                <span>Vendor</span>
              </div>
              <p className="text-slate-900 text-sm">{product.vendor}</p>
            </div>
          </div>

          {/* Trade Analysis */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-slate-900">Trade Analysis</h3>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-200">
                <span className="text-blue-900 text-sm">Standard Tariff Rate (MFN)</span>
                <span className="text-blue-700 flex items-center gap-2">
                  {product.tariffRate !== null && product.tariffRate !== undefined
                    ? `${(product.tariffRate * 100).toFixed(2)}%`
                    : 'N/A'}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-200">
                <span className="text-blue-900 text-sm">Tariff Amount</span>
                <span className="text-blue-700 flex items-center gap-2">
                  {product.tariffAmount !== null && product.tariffAmount !== undefined
                    ? `$${product.tariffAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : 'N/A'}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-200">
                <span className="text-blue-900 text-sm">Total Cost (Unit Cost + Tariff)</span>
                <span className="text-blue-700 flex items-center gap-2">
                  {product.totalCost !== null && product.totalCost !== undefined
                    ? `$${product.totalCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : product.unitCost && product.tariffAmount
                    ? `$${(Number(product.unitCost) + Number(product.tariffAmount)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : 'N/A'}
                </span>
              </div>
              {product.alternateClassification && (
                <div className="flex items-center justify-between p-3 bg-amber-50 rounded-lg border border-amber-200">
                  <span className="text-amber-900 text-sm">Alternate Classification</span>
                  <span className="text-amber-700 flex items-center gap-2">
                    {product.alternateClassification}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Classification History */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-slate-900">Classification History</h3>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div>
                  <div className="text-slate-900 text-sm flex items-center gap-2">
                    <span>HTS {product.hts}</span>
                  </div>
                  {/* HARDCODED: "Classified by AI Agent" - No field in DB for classifier name/type */}
                  {/* TODO: Add classifier_type or classified_by field to user_product_classification_results */}
                  <div className="text-slate-600 text-xs flex items-center gap-2">
                    <span>Classified by AI Agent</span>
                    <span className="px-1 py-0.5 bg-red-100 text-red-600 text-[10px] rounded border border-red-300">HARDCODED</span>
                    <span className="text-slate-500">• Confidence: {product.confidence}%</span>
                  </div>
                </div>
                <div className="text-slate-600 text-sm flex items-center gap-2">
                  <span>{new Date(product.lastUpdated).toLocaleDateString()}</span>
                </div>
              </div>
            </div>
          </div>

          {/* HARDCODED: Full Classification Reasoning section - No fields in DB for classification reasoning text */}
          {/* Full Classification Reasoning - Always Visible */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="bg-gradient-to-r from-indigo-50 to-purple-50 px-5 py-3 border-b border-indigo-100">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-indigo-900">Classification Reasoning for Customs Validation</h3>
                <span className="px-1 py-0.5 bg-red-100 text-red-600 text-[10px] rounded border border-red-300">HARDCODED</span>
              </div>
              <p className="text-indigo-700 text-sm">Detailed justification for HTS {product.hts}</p>
            </div>
            
            <div className="p-5 space-y-5 bg-white">
              {/* HARDCODED: Classification Decision reasoning text - No field in DB */}
              {/* TODO: Fetch from reasoning or rationale field in user_product_classification_results */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-sm">1</div>
                  <h4 className="text-slate-900">Classification Decision</h4>
                  <span className="px-1 py-0.5 bg-red-100 text-red-600 text-[10px] rounded border border-red-300">HARDCODED</span>
                </div>
                <div className="ml-8 p-4 bg-slate-50 rounded-lg">
                  <p className="text-slate-700 text-sm mb-3">
                    <strong>HTS Code {product.hts}</strong> was selected based on the product's primary function, material composition, and physical characteristics.
                  </p>
                  <p className="text-slate-600 text-sm">
                    This classification aligns with the Harmonized Tariff Schedule of the United States (HTSUS) Chapter {product.hts.substring(0, 2)} which covers: 
                    {product.hts.startsWith('85') && ' Electrical machinery and equipment and parts thereof.'}
                    {product.hts.startsWith('61') && ' Articles of apparel and clothing accessories, knitted or crocheted.'}
                    {product.hts.startsWith('94') && ' Furniture; bedding, mattresses, cushions and similar stuffed furnishings; lamps and lighting fittings.'}
                    {product.hts.startsWith('73') && ' Articles of iron or steel.'}
                    {product.hts.startsWith('42') && ' Articles of leather; saddlery and harness; travel goods, handbags and similar containers.'}
                    {product.hts.startsWith('91') && ' Clocks and watches and parts thereof.'}
                    {product.hts.startsWith('55') && ' Man-made staple fibers.'}
                    {product.hts.startsWith('69') && ' Ceramic products.'}
                    {product.hts.startsWith('95') && ' Toys, games and sports equipment; parts and accessories thereof.'}
                    {product.hts.startsWith('44') && ' Wood and articles of wood; wood charcoal.'}
                  </p>
                </div>
              </div>

              {/* HARDCODED: GRI rules text - No field in DB for GRI rules applied */}
              {/* TODO: Fetch from gri_rules_applied field (JSONB) or reasoning field */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-sm">2</div>
                  <h4 className="text-slate-900">General Rules of Interpretation (GRI)</h4>
                  <span className="px-1 py-0.5 bg-red-100 text-red-600 text-[10px] rounded border border-red-300">HARDCODED</span>
                </div>
                <div className="ml-8 space-y-2">
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                    <div className="flex items-start gap-2">
                      <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-sm text-green-900"><strong>GRI 1:</strong> Classification determined by terms of the headings</p>
                        <p className="text-xs text-green-700 mt-1">Product description matches the heading terminology for HTS {product.hts}</p>
                      </div>
                    </div>
                  </div>
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                    <div className="flex items-start gap-2">
                      <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-sm text-green-900"><strong>GRI 3(a):</strong> Most specific description prevails</p>
                        <p className="text-xs text-green-700 mt-1">The selected subheading provides the most specific description of the product</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Material Composition Analysis - Uses product.materials from DB */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-sm">3</div>
                  <h4 className="text-slate-900">Material Composition Analysis</h4>
                </div>
                <div className="ml-8 p-4 bg-slate-50 rounded-lg">
                  <p className="text-slate-700 text-sm mb-2"><strong>Declared Materials:</strong> {product.materials}</p>
                  {/* HARDCODED: Material composition analysis text - No field in DB for analysis text */}
                  {/* TODO: Fetch from material_analysis field or reasoning field */}
                  <p className="text-slate-600 text-sm">
                    <span className="px-1 py-0.5 bg-red-100 text-red-600 text-[10px] rounded border border-red-300">HARDCODED</span>{' '}
                    Material composition has been verified to meet the requirements for classification under this HTS code. The predominant material determines the appropriate subheading according to Section Notes and Chapter Notes.
                  </p>
                </div>
              </div>

              {/* Country of Origin Impact - Uses product.origin from DB */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-sm">4</div>
                  <h4 className="text-slate-900">Country of Origin Impact</h4>
                </div>
                <div className="ml-8 p-4 bg-slate-50 rounded-lg">
                  <p className="text-slate-700 text-sm mb-2"><strong>Origin:</strong> {product.origin}</p>
                  {/* HARDCODED: Country of origin impact text and tariff rate info - No field in DB for this analysis */}
                  {/* TODO: Fetch from origin_analysis field or reasoning field */}
                  <p className="text-slate-600 text-sm mb-3">
                    <span className="px-1 py-0.5 bg-red-100 text-red-600 text-[10px] rounded border border-red-300">HARDCODED</span>{' '}
                    Country of origin affects duty rates and trade agreement eligibility. For products from {product.origin}, the following apply:
                  </p>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <div className="w-1.5 h-1.5 rounded-full bg-slate-400"></div>
                      <span className="text-slate-600">
                        MFN (Most Favored Nation) tariff rate: {product.tariffRate !== null && product.tariffRate !== undefined
                          ? `${(product.tariffRate * 100).toFixed(2)}%`
                          : 'N/A'}
                      </span>
                    </div>
                    {/* HARDCODED: "Special tariff programs may apply" - No field in DB for special tariff program info */}
                    {/* TODO: Fetch from special_tariff_programs field or trade_agreements field */}
                    <div className="flex items-center gap-2 text-sm">
                      <div className="w-1.5 h-1.5 rounded-full bg-slate-400"></div>
                      <span className="text-slate-600">Special tariff programs may apply</span>
                      <span className="px-1 py-0.5 bg-red-100 text-red-600 text-[10px] rounded border border-red-300">HARDCODED</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* HARDCODED: Alternative Classifications Considered - Uses alternate_classification from DB but reasoning text is hardcoded */}
              {/* TODO: Fetch from alternate_classifications field (JSONB array) with rejection reasons */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-sm">5</div>
                  <h4 className="text-slate-900">Alternative Classifications Considered</h4>
                  <span className="px-1 py-0.5 bg-red-100 text-red-600 text-[10px] rounded border border-red-300">HARDCODED</span>
                </div>
                <div className="ml-8 space-y-2">
                  {/* HARDCODED: Alternative classification reasoning - No field in DB for rejection reasons */}
                  {/* TODO: Use alternate_classifications field (JSONB array) with rejection reasons */}
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                    <p className="text-sm text-slate-700 mb-1"><strong>Alternative 1:</strong> HTS {product.hts.substring(0, 4)}.XX.XXXX</p>
                    <p className="text-xs text-slate-600">Rejected: Product characteristics do not match primary function requirements</p>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                    <p className="text-sm text-slate-700 mb-1"><strong>Alternative 2:</strong> HTS {product.hts.substring(0, 4)}.YY.YYYY</p>
                    <p className="text-xs text-slate-600">Rejected: Material composition falls outside this subheading's scope</p>
                  </div>
                </div>
              </div>

              {/* Supporting Documentation */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-sm">6</div>
                  <h4 className="text-slate-900">Supporting Documentation</h4>
                </div>
                <div className="ml-8 space-y-2">
                  {isLoadingDocs ? (
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                      <p className="text-sm text-slate-600">Loading documents...</p>
                    </div>
                  ) : documents.length > 0 ? (
                    documents.map((doc) => (
                      <div key={doc.id} className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm text-blue-900 font-medium">{doc.file_name}</p>
                            <p className="text-xs text-blue-700 mt-1">
                              {doc.document_type} • {new Date(doc.uploaded_at).toLocaleDateString()}
                            </p>
                          </div>
                          {doc.file_url && (
                            <a
                              href={doc.file_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="ml-2 p-2 text-blue-600 hover:text-blue-700 hover:bg-blue-100 rounded transition-colors"
                              title="View document"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                      <p className="text-sm text-slate-600">No documents uploaded for this product</p>
                    </div>
                  )}
                </div>
              </div>

              {/* HARDCODED: Compliance Notes text - No field in DB for compliance notes */}
              {/* TODO: Fetch from compliance_notes field or make configurable */}
              <div className="border-t border-slate-200 pt-4">
                <div className="mb-2">
                  <span className="px-1 py-0.5 bg-red-100 text-red-600 text-[10px] rounded border border-red-300">HARDCODED</span>
                </div>
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-amber-900 text-sm mb-1"><strong>Customs Validation Notes:</strong></p>
                      <p className="text-amber-800 text-sm">
                        This classification has been determined in accordance with the Harmonized Tariff Schedule of the United States (HTSUS) and General Rules of Interpretation. 
                        CBP retains final authority over classification decisions. This reasoning document can be presented to customs officials during entry review or audit.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Export Options */}
              <div className="flex gap-3 pt-2">
                <button className="flex-1 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors flex items-center justify-center gap-2 text-sm" onClick={handleExportPDF}>
                  <Download className="w-4 h-4" />
                  Export as PDF
                </button>
                <button className="flex-1 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors flex items-center justify-center gap-2 text-sm" onClick={handleViewHTSUS}>
                  <ExternalLink className="w-4 h-4" />
                  View HTSUS Reference
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-600 hover:text-slate-800 transition-colors"
          >
            Close
          </button>
          <div className="flex gap-3">
            <button className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-100 transition-colors" onClick={onEdit}>
              Edit Product
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}