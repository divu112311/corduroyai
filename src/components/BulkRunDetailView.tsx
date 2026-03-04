import { useState, useEffect } from 'react';
import { ArrowLeft, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { getBulkRunResults, type BulkRunSummary } from '../lib/classificationService';
import { getUserMetadata } from '../lib/userService';
import { supabase } from '../lib/supabase';
import { BulkItemDetail } from './BulkItemDetail';

interface BulkRunDetailViewProps {
  run: BulkRunSummary;
  onClose: () => void;
}

interface DetailItem {
  productName: string;
  productDescription: string;
  htsCode: string;
  confidence: number; // 0-1
  aboveThreshold: boolean;
  productId: number;
  classificationResultId: number | null;
  origin: string;
  materials: string;
  cost: string;
}

export function BulkRunDetailView({ run, onClose }: BulkRunDetailViewProps) {
  const [items, setItems] = useState<DetailItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [threshold, setThreshold] = useState(0.8);
  const [selectedItem, setSelectedItem] = useState<DetailItem | null>(null);

  useEffect(() => {
    const loadDetails = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setError('Not logged in');
          setLoading(false);
          return;
        }

        // Fetch threshold and run results in parallel
        const [userMeta, runData] = await Promise.all([
          getUserMetadata(user.id),
          getBulkRunResults(run.id),
        ]);

        const userThreshold = userMeta?.confidence_threshold ?? 0.8;
        setThreshold(userThreshold);

        if (!runData) {
          setError('Could not load run details');
          setLoading(false);
          return;
        }

        const detailItems: DetailItem[] = runData.items.map(item => {
          const conf = item.result?.confidence ?? 0;
          return {
            productName: item.product.product_name,
            productDescription: item.product.product_description || '',
            htsCode: item.result?.hts_classification || '-',
            confidence: conf,
            aboveThreshold: conf >= userThreshold,
            productId: item.product.id,
            classificationResultId: item.result?.id ?? null,
            origin: item.product.country_of_origin || '',
            materials: typeof item.product.materials === 'string' ? item.product.materials : '',
            cost: item.product.unit_cost?.toString() || '',
          };
        });

        setItems(detailItems);
      } catch (err) {
        console.error('Error loading run details:', err);
        setError('Failed to load run details');
      } finally {
        setLoading(false);
      }
    };

    loadDetails();
  }, [run.id]);

  const aboveCount = items.filter(i => i.aboveThreshold).length;
  const belowCount = items.filter(i => !i.aboveThreshold).length;

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
      ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div>
      {/* Back button */}
      <button
        onClick={onClose}
        className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        <span className="text-sm">Back to Classification</span>
      </button>

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-slate-900 mb-2">{run.fileName}</h1>
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <span>{items.length} products</span>
          <span>&middot;</span>
          <span>{formatDate(run.created_at)}</span>
        </div>
      </div>

      {/* Summary bar */}
      {!loading && !error && items.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-6 flex items-center gap-6 text-sm">
          <span className="flex items-center gap-1.5 text-green-700">
            <CheckCircle className="w-4 h-4" />
            {aboveCount} above threshold
          </span>
          <span className="flex items-center gap-1.5 text-red-700">
            <AlertCircle className="w-4 h-4" />
            {belowCount} below threshold
          </span>
          <span className="text-slate-400 ml-auto">
            Threshold: {Math.round(threshold * 100)}%
          </span>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500 flex items-center justify-center gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          Loading results...
        </div>
      ) : error ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-red-600">{error}</div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500">No products found in this run</div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Table header */}
          <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 grid grid-cols-12 gap-4 text-xs text-slate-500 uppercase tracking-wider">
            <div className="col-span-5">Product</div>
            <div className="col-span-4">HTS Code</div>
            <div className="col-span-3 text-right">Confidence</div>
          </div>

          {/* Rows */}
          <div className="divide-y divide-slate-100">
            {items.map((item, idx) => (
              <div
                key={idx}
                onClick={() => setSelectedItem(item)}
                className={`px-6 py-3 grid grid-cols-12 gap-4 items-center border-l-4 cursor-pointer hover:bg-slate-50 transition-colors ${
                  item.aboveThreshold
                    ? 'border-l-green-500 bg-green-50/30'
                    : 'border-l-red-500 bg-red-50/30'
                }`}
              >
                <div className="col-span-5 text-slate-900 truncate text-sm">
                  {item.productName}
                </div>
                <div className="col-span-4 font-mono text-sm text-slate-700">
                  {item.htsCode}
                </div>
                <div className="col-span-3 text-right">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                    item.aboveThreshold
                      ? 'bg-green-100 text-green-700'
                      : 'bg-red-100 text-red-700'
                  }`}>
                    {Math.round(item.confidence * 100)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Product Detail Modal */}
      {selectedItem && (
        <BulkItemDetail
          item={{
            id: selectedItem.productId,
            productName: selectedItem.productName,
            description: selectedItem.productDescription,
            status: selectedItem.aboveThreshold ? 'complete' : 'exception',
            hts: selectedItem.htsCode !== '-' ? selectedItem.htsCode : undefined,
            confidence: Math.round(selectedItem.confidence * 100),
            origin: selectedItem.origin,
            materials: selectedItem.materials,
            cost: selectedItem.cost,
            classification_result_id: selectedItem.classificationResultId ?? undefined,
            extracted_data: {
              product_name: selectedItem.productName,
              product_description: selectedItem.productDescription,
              country_of_origin: selectedItem.origin,
              materials: selectedItem.materials,
              unit_cost: selectedItem.cost,
            },
          }}
          onClose={() => setSelectedItem(null)}
          onSave={() => setSelectedItem(null)}
          bulkRunId={run.id}
        />
      )}
    </div>
  );
}
