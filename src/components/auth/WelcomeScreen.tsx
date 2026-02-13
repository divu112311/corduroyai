import { CheckCircle, Sparkles, Package, FileText } from 'lucide-react';

interface WelcomeScreenProps {
  userName: string;
  company?: string;
  onGetStarted: () => void;
}

export function WelcomeScreen({ userName, company, onGetStarted }: WelcomeScreenProps) {
  const features = [
    {
      icon: Sparkles,
      title: 'AI-Powered Classification',
      description: '95% accuracy with automatic HTS code assignment',
    },
    {
      icon: Package,
      title: 'Product Profiles',
      description: 'Build reusable compliance records for all your products',
    },
    {
      icon: FileText,
      title: 'Exception-Driven Workflow',
      description: 'Only review what needs your attention',
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 flex items-center justify-center p-6">
      <div className="w-full max-w-3xl">
        {/* Success Icon */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-green-100 rounded-full mb-6">
            <CheckCircle className="w-10 h-10 text-green-600" />
          </div>
          <h1 className="text-slate-900 mb-3">Welcome to Corduroy AI, {userName}! 🎉</h1>
          <p className="text-slate-600 text-lg">
            Your account has been created successfully
          </p>
          {company && (
            <p className="text-slate-500 mt-2">
              Organization: <strong>{company}</strong>
            </p>
          )}
        </div>

        {/* Features Grid */}
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8 mb-6">
          <h2 className="text-slate-900 mb-6 text-center">What You Can Do</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {features.map((feature, idx) => (
              <div key={idx} className="text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-100 rounded-xl mb-4">
                  <feature.icon className="w-6 h-6 text-blue-600" />
                </div>
                <h3 className="text-slate-900 mb-2">{feature.title}</h3>
                <p className="text-slate-600 text-sm">{feature.description}</p>
              </div>
            ))}
          </div>

          {/* Quick Start Steps */}
          <div className="bg-blue-50 rounded-xl p-6 border border-blue-200">
            <h3 className="text-blue-900 mb-4">Quick Start Guide</h3>
            <ol className="space-y-3 text-sm">
              <li className="flex items-start gap-3">
                <span className="inline-flex items-center justify-center w-6 h-6 bg-blue-600 text-white rounded-full flex-shrink-0">1</span>
                <div>
                  <p className="text-blue-900"><strong>Classify your first product</strong></p>
                  <p className="text-blue-800">Enter product details or upload a CSV for bulk classification</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="inline-flex items-center justify-center w-6 h-6 bg-blue-600 text-white rounded-full flex-shrink-0">2</span>
                <div>
                  <p className="text-blue-900"><strong>Review exceptions</strong></p>
                  <p className="text-blue-800">Check items flagged for your attention on the dashboard</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="inline-flex items-center justify-center w-6 h-6 bg-blue-600 text-white rounded-full flex-shrink-0">3</span>
                <div>
                  <p className="text-blue-900"><strong>Build your product library</strong></p>
                  <p className="text-blue-800">Save classifications to create reusable compliance profiles</p>
                </div>
              </li>
            </ol>
          </div>
        </div>

        {/* Get Started Button */}
        <div className="text-center">
          <button
            onClick={onGetStarted}
            className="px-8 py-4 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors text-lg shadow-lg hover:shadow-xl"
          >
            Get Started →
          </button>
          <p className="text-slate-500 text-sm mt-4">
            You can access this information anytime from your dashboard
          </p>
        </div>
      </div>
    </div>
  );
}
