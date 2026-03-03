import { useState } from 'react';
import { Sparkles, Target, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';

export interface IntendedUseAnswers {
  primaryUse: string;
  salesChannel: string;
  industrySector: string;
  productStage: string;
  certifications: string;
}

interface IntendedUseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (answers: IntendedUseAnswers) => void;
  productName?: string;
  mode: 'single' | 'bulk';
}

const EMPTY_ANSWERS: IntendedUseAnswers = {
  primaryUse: '',
  salesChannel: '',
  industrySector: '',
  productStage: '',
  certifications: 'None',
};

export function buildIntendedUseText(a: IntendedUseAnswers): string {
  if (!a.primaryUse) return '';
  const parts = [
    `Intended use: ${a.primaryUse}`,
    `Sales channel: ${a.salesChannel}`,
    `Industry: ${a.industrySector}`,
    `Product stage: ${a.productStage}`,
  ];
  if (a.certifications && a.certifications !== 'None') {
    parts.push(`Certifications/restrictions: ${a.certifications}`);
  }
  return parts.join('. ');
}

interface PillOption {
  value: string;
  label: string;
}

function PillGroup({
  options,
  selected,
  onSelect,
}: {
  options: PillOption[];
  selected: string;
  onSelect: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onSelect(opt.value)}
          className={
            selected === opt.value
              ? 'px-4 py-2 rounded-full border border-blue-500 bg-blue-50 text-sm text-blue-700 font-medium transition-all cursor-pointer'
              : 'px-4 py-2 rounded-full border border-slate-200 bg-white text-sm text-slate-600 hover:border-blue-300 hover:text-blue-600 transition-all cursor-pointer'
          }
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

const PRIMARY_USE_OPTIONS: PillOption[] = [
  { value: 'Consumer/Retail', label: 'Consumer / Retail' },
  { value: 'Commercial/Industrial', label: 'Commercial / Industrial' },
  { value: 'Medical', label: 'Medical' },
  { value: 'Agricultural', label: 'Agricultural' },
  { value: 'Government/Defense', label: 'Government / Defense' },
];

const SALES_CHANNEL_OPTIONS: PillOption[] = [
  { value: 'Direct to consumer', label: 'Direct to consumer' },
  { value: 'B2B wholesale', label: 'B2B wholesale' },
  { value: 'Internal use only', label: 'Internal / own use' },
  { value: 'Resale component', label: 'Used as a component in another product' },
];

const INDUSTRY_OPTIONS: PillOption[] = [
  { value: 'Electronics', label: 'Electronics' },
  { value: 'Apparel/Textiles', label: 'Apparel & Textiles' },
  { value: 'Machinery', label: 'Machinery & Equipment' },
  { value: 'Food & Beverage', label: 'Food & Beverage' },
  { value: 'Automotive', label: 'Automotive' },
  { value: 'Healthcare', label: 'Healthcare' },
  { value: 'Other', label: 'Other' },
];

const PRODUCT_STAGE_OPTIONS: PillOption[] = [
  { value: 'Finished good', label: 'Finished good' },
  { value: 'Semi-finished', label: 'Semi-finished' },
  { value: 'Raw material', label: 'Raw material' },
  { value: 'Component part', label: 'Component / part' },
];

const CERTIFICATION_OPTIONS: PillOption[] = [
  { value: 'None', label: 'None' },
  { value: 'Food contact', label: 'Food contact' },
  { value: 'Medical device', label: 'Medical device' },
  { value: 'Hazmat', label: 'Hazmat / Dangerous goods' },
  { value: 'Electrical safety', label: 'Electrical safety (UL/CE)' },
];

export function IntendedUseModal({
  isOpen,
  onClose,
  onConfirm,
  productName,
  mode,
}: IntendedUseModalProps) {
  const [answers, setAnswers] = useState<IntendedUseAnswers>(EMPTY_ANSWERS);

  const isValid =
    answers.primaryUse !== '' &&
    answers.salesChannel !== '' &&
    answers.industrySector !== '' &&
    answers.productStage !== '';

  const handleSet = (field: keyof IntendedUseAnswers, value: string) => {
    setAnswers((prev) => ({ ...prev, [field]: value }));
  };

  const handleConfirm = () => {
    if (!isValid) return;
    onConfirm(answers);
    setAnswers(EMPTY_ANSWERS);
  };

  const handleSkip = () => {
    onConfirm(EMPTY_ANSWERS);
    setAnswers(EMPTY_ANSWERS);
  };

  const handleClose = () => {
    setAnswers(EMPTY_ANSWERS);
    onClose();
  };

  const contextLabel = mode === 'bulk'
    ? (productName ? `"${productName}"` : 'this batch')
    : (productName ? `"${productName}"` : 'this product');

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <DialogContent className="sm:max-w-2xl p-0 overflow-hidden gap-0">
        {/* Header strip */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-5 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-white/20 p-2 rounded-lg">
              <Target className="w-5 h-5 text-white" />
            </div>
            <div>
              <DialogHeader>
                <DialogTitle className="text-white text-lg font-semibold leading-tight">
                  A few quick questions
                </DialogTitle>
              </DialogHeader>
              <p className="text-blue-100 text-sm mt-0.5">
                These help us classify {contextLabel} more accurately
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="text-blue-200 hover:text-white transition-colors mt-0.5"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-6 max-h-[60vh] overflow-y-auto">
          {/* Q1 */}
          <div>
            <p className="text-sm font-medium text-slate-800">
              1. What is the primary intended use?
              <span className="text-red-500 ml-1">*</span>
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              How will the end user ultimately use this product?
            </p>
            <PillGroup
              options={PRIMARY_USE_OPTIONS}
              selected={answers.primaryUse}
              onSelect={(v) => handleSet('primaryUse', v)}
            />
          </div>

          {/* Q2 */}
          <div>
            <p className="text-sm font-medium text-slate-800">
              2. How will this be distributed?
              <span className="text-red-500 ml-1">*</span>
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              Who is the immediate buyer or recipient?
            </p>
            <PillGroup
              options={SALES_CHANNEL_OPTIONS}
              selected={answers.salesChannel}
              onSelect={(v) => handleSet('salesChannel', v)}
            />
          </div>

          {/* Q3 */}
          <div>
            <p className="text-sm font-medium text-slate-800">
              3. What industry is this product for?
              <span className="text-red-500 ml-1">*</span>
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              Select the industry that best fits the end-use application
            </p>
            <PillGroup
              options={INDUSTRY_OPTIONS}
              selected={answers.industrySector}
              onSelect={(v) => handleSet('industrySector', v)}
            />
          </div>

          {/* Q4 */}
          <div>
            <p className="text-sm font-medium text-slate-800">
              4. What stage is the product at?
              <span className="text-red-500 ml-1">*</span>
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              Is this a complete product or will it be further processed?
            </p>
            <PillGroup
              options={PRODUCT_STAGE_OPTIONS}
              selected={answers.productStage}
              onSelect={(v) => handleSet('productStage', v)}
            />
          </div>

          {/* Q5 */}
          <div>
            <p className="text-sm font-medium text-slate-800">
              5. Any special certifications or restrictions?
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              Select any applicable safety standards or trade restrictions
            </p>
            <PillGroup
              options={CERTIFICATION_OPTIONS}
              selected={answers.certifications}
              onSelect={(v) => handleSet('certifications', v)}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleSkip}
            className="px-4 py-2 text-slate-600 hover:text-slate-800 text-sm transition-colors"
          >
            Skip &amp; Classify
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!isValid}
            className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-2 text-sm font-medium shadow-sm"
          >
            <Sparkles className="w-4 h-4" />
            Run Classification
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
