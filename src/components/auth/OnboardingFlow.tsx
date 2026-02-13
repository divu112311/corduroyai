import { useState } from 'react';
import { Package, Upload, FileText, Sparkles, CheckCircle, ArrowRight, LayoutDashboard, AlertTriangle } from 'lucide-react';
import logo from '../../assets/8dffc9a46764dc298d3dc392fb46f27f3eb8c7e5.png';

interface OnboardingFlowProps {
  userName: string;
  company?: string;
  onComplete: () => void;
}

export function OnboardingFlow({ userName, company, onComplete }: OnboardingFlowProps) {
  const [currentStep, setCurrentStep] = useState(0);

  const steps = [
    {
      title: 'Welcome to Corduroy AI',
      subtitle: `Hi ${userName}! Let's get you started with automated trade compliance`,
      icon: Sparkles,
      content: (
        <div className="space-y-6">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
            <h3 className="text-blue-900 mb-3">What is Corduroy AI?</h3>
            <p className="text-blue-800 mb-4">
              Corduroy AI automates HS/HTS classification for importers and manufacturers with 95% accuracy. 
              Our AI does the heavy lifting so you only deal with exceptions.
            </p>
            <div className="space-y-2">
              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-blue-900"><strong>AI-powered classification</strong></p>
                  <p className="text-blue-800 text-sm">Automatic HTS code assignment with confidence scoring</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-blue-900"><strong>Exception-driven workflow</strong></p>
                  <p className="text-blue-800 text-sm">Only review items that need your attention</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-blue-900"><strong>Build once, reuse forever</strong></p>
                  <p className="text-blue-800 text-sm">Create product profiles for consistent compliance</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      ),
    },
    {
      title: 'Classify New Products',
      subtitle: 'Single product classification with AI-powered accuracy',
      icon: Package,
      content: (
        <div className="space-y-6">
          <div className="bg-white border-2 border-slate-200 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <Package className="w-5 h-5 text-blue-600" />
              </div>
              <h3 className="text-slate-900">How it works:</h3>
            </div>
            
            <div className="space-y-4">
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center">
                  1
                </div>
                <div>
                  <p className="text-slate-900 mb-1"><strong>Enter product details</strong></p>
                  <p className="text-slate-600 text-sm">Describe your product, add materials, country of origin, and costs</p>
                </div>
              </div>
              
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center">
                  2
                </div>
                <div>
                  <p className="text-slate-900 mb-1"><strong>AI analyzes & classifies</strong></p>
                  <p className="text-slate-600 text-sm">Our AI determines the correct HTS code with confidence scoring</p>
                </div>
              </div>
              
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center">
                  3
                </div>
                <div>
                  <p className="text-slate-900 mb-1"><strong>Review & save</strong></p>
                  <p className="text-slate-600 text-sm">Approve the classification and save it as a product profile</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Sparkles className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-green-900 text-sm">
                  <strong>Pro tip:</strong> The more details you provide, the more accurate the classification will be!
                </p>
              </div>
            </div>
          </div>
        </div>
      ),
    },
    {
      title: 'Bulk Upload',
      subtitle: 'Process hundreds of products at once via CSV or Excel',
      icon: Upload,
      content: (
        <div className="space-y-6">
          <div className="bg-white border-2 border-slate-200 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                <Upload className="w-5 h-5 text-purple-600" />
              </div>
              <h3 className="text-slate-900">Bulk classification workflow:</h3>
            </div>
            
            <div className="space-y-4">
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-purple-600 text-white rounded-full flex items-center justify-center">
                  1
                </div>
                <div>
                  <p className="text-slate-900 mb-1"><strong>Upload your file</strong></p>
                  <p className="text-slate-600 text-sm">Drop a CSV or Excel file with your product list</p>
                </div>
              </div>
              
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-purple-600 text-white rounded-full flex items-center justify-center">
                  2
                </div>
                <div>
                  <p className="text-slate-900 mb-1"><strong>AI processes all products</strong></p>
                  <p className="text-slate-600 text-sm">Watch real-time progress as each item is classified</p>
                </div>
              </div>
              
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-purple-600 text-white rounded-full flex items-center justify-center">
                  3
                </div>
                <div>
                  <p className="text-slate-900 mb-1"><strong>Review exceptions only</strong></p>
                  <p className="text-slate-600 text-sm">High-confidence items are auto-approved, you only review flagged items</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-amber-900 text-sm">
                  <strong>Required columns:</strong> Product Name, Description, Country of Origin
                </p>
              </div>
            </div>
          </div>
        </div>
      ),
    },
    {
      title: 'Product Profiles',
      subtitle: 'Your compliance library - build once, reuse forever',
      icon: FileText,
      content: (
        <div className="space-y-6">
          <div className="bg-white border-2 border-slate-200 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <FileText className="w-5 h-5 text-green-600" />
              </div>
              <h3 className="text-slate-900">Manage your product library:</h3>
            </div>
            
            <div className="space-y-4">
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-green-600 text-white rounded-full flex items-center justify-center">
                  1
                </div>
                <div>
                  <p className="text-slate-900 mb-1"><strong>View all classified products</strong></p>
                  <p className="text-slate-600 text-sm">Search, filter, and sort your entire product catalog</p>
                </div>
              </div>
              
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-green-600 text-white rounded-full flex items-center justify-center">
                  2
                </div>
                <div>
                  <p className="text-slate-900 mb-1"><strong>Track compliance details</strong></p>
                  <p className="text-slate-600 text-sm">Materials, origin, costs, vendors, and HTS codes in one place</p>
                </div>
              </div>
              
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-green-600 text-white rounded-full flex items-center justify-center">
                  3
                </div>
                <div>
                  <p className="text-slate-900 mb-1"><strong>Reuse for future imports</strong></p>
                  <p className="text-slate-600 text-sm">Reference saved profiles for consistent, compliant classifications</p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-center">
              <p className="text-2xl mb-1">🔍</p>
              <p className="text-slate-900 text-sm"><strong>Advanced filters</strong></p>
              <p className="text-slate-600 text-xs">By vendor, origin, category</p>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-center">
              <p className="text-2xl mb-1">📊</p>
              <p className="text-slate-900 text-sm"><strong>Confidence scores</strong></p>
              <p className="text-slate-600 text-xs">Track AI accuracy</p>
            </div>
          </div>
        </div>
      ),
    },
    {
      title: 'Exception-Driven Dashboard',
      subtitle: 'Focus on what matters - let AI handle the rest',
      icon: LayoutDashboard,
      content: (
        <div className="space-y-6">
          <div className="bg-white border-2 border-slate-200 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                <LayoutDashboard className="w-5 h-5 text-orange-600" />
              </div>
              <h3 className="text-slate-900">Your command center:</h3>
            </div>
            
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-green-900"><strong>High Confidence (95%+)</strong></p>
                  <CheckCircle className="w-5 h-5 text-green-600" />
                </div>
                <p className="text-green-800 text-sm">Auto-approved and ready to use</p>
              </div>
              
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-amber-900"><strong>Medium Confidence (80-94%)</strong></p>
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                </div>
                <p className="text-amber-800 text-sm">Quick review recommended</p>
              </div>
              
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-red-900"><strong>Low Confidence (&lt;80%)</strong></p>
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                </div>
                <p className="text-red-800 text-sm">Needs your expert review</p>
              </div>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Sparkles className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-blue-900 text-sm">
                  <strong>The Corduroy Promise:</strong> You only deal with exceptions. Everything else is automated.
                </p>
              </div>
            </div>
          </div>
        </div>
      ),
    },
    {
      title: "You're All Set!",
      subtitle: 'Ready to start automating your trade compliance',
      icon: CheckCircle,
      content: (
        <div className="space-y-6">
          <div className="text-center py-8">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-green-100 rounded-full mb-6">
              <CheckCircle className="w-10 h-10 text-green-600" />
            </div>
            <h3 className="text-slate-900 mb-3">You're ready to go!</h3>
            <p className="text-slate-600 max-w-md mx-auto mb-8">
              You now know how to classify products, process bulk uploads, manage product profiles, 
              and use the exception-driven dashboard.
            </p>
          </div>

          <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-xl p-6">
            <h3 className="text-slate-900 mb-4">Quick Start Suggestions:</h3>
            <div className="space-y-3">
              <div className="bg-white rounded-lg p-4 shadow-sm">
                <p className="text-slate-900 mb-1"><strong>1. Try a single classification</strong></p>
                <p className="text-slate-600 text-sm">Click "Classify Product" to classify your first item</p>
              </div>
              <div className="bg-white rounded-lg p-4 shadow-sm">
                <p className="text-slate-900 mb-1"><strong>2. Upload a CSV file</strong></p>
                <p className="text-slate-600 text-sm">Process multiple products at once with bulk upload</p>
              </div>
              <div className="bg-white rounded-lg p-4 shadow-sm">
                <p className="text-slate-900 mb-1"><strong>3. Explore the dashboard</strong></p>
                <p className="text-slate-600 text-sm">See real-time progress and review exceptions</p>
              </div>
            </div>
          </div>

          <div className="text-center">
            <p className="text-slate-500 text-sm">
              Need help? Contact support at <a href="mailto:support@usecorduroy.com" className="text-blue-600 hover:text-blue-700">support@usecorduroy.com</a>
            </p>
          </div>
        </div>
      ),
    },
  ];

  const currentStepData = steps[currentStep];
  const isLastStep = currentStep === steps.length - 1;

  const handleNext = () => {
    if (isLastStep) {
      onComplete();
    } else {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = () => {
    onComplete();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 flex items-center justify-center p-6">
      <div className="w-full max-w-3xl">
        {/* Logo */}
        <div className="text-center mb-8">
          <img src={logo} alt="Corduroy AI" className="h-10 mx-auto mb-6" />
        </div>

        {/* Main Card */}
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
          {/* Progress Bar */}
          <div className="bg-slate-50 px-8 py-4 border-b border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-slate-600">
                Step {currentStep + 1} of {steps.length}
              </p>
              <button
                onClick={handleSkip}
                className="text-sm text-slate-500 hover:text-slate-700"
              >
                Skip tutorial
              </button>
            </div>
            <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-600 transition-all duration-300"
                style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
              />
            </div>
          </div>

          {/* Content */}
          <div className="p-8">
            {/* Header */}
            <div className="flex items-start gap-4 mb-6">
              <div className="flex-shrink-0 w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                <currentStepData.icon className="w-6 h-6 text-blue-600" />
              </div>
              <div className="flex-1">
                <h2 className="text-slate-900 mb-1">{currentStepData.title}</h2>
                <p className="text-slate-600">{currentStepData.subtitle}</p>
              </div>
            </div>

            {/* Step Content */}
            <div className="mb-8">{currentStepData.content}</div>

            {/* Navigation Buttons */}
            <div className="flex items-center justify-between gap-4">
              <button
                onClick={handlePrevious}
                disabled={currentStep === 0}
                className="px-6 py-3 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>

              <div className="flex gap-2">
                {steps.map((_, idx) => (
                  <div
                    key={idx}
                    className={`w-2 h-2 rounded-full transition-colors ${
                      idx === currentStep
                        ? 'bg-blue-600'
                        : idx < currentStep
                        ? 'bg-blue-300'
                        : 'bg-slate-200'
                    }`}
                  />
                ))}
              </div>

              <button
                onClick={handleNext}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
              >
                {isLastStep ? (
                  <>
                    Go to Dashboard
                    <CheckCircle className="w-5 h-5" />
                  </>
                ) : (
                  <>
                    Next
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Helper Text */}
        <div className="text-center mt-6">
          <p className="text-slate-500 text-sm">
            You can always access help and documentation from the dashboard
          </p>
        </div>
      </div>
    </div>
  );
}
