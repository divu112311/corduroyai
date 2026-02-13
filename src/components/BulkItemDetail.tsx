import { useState } from 'react';
import { X, ArrowLeft, CheckCircle, AlertCircle, Edit, Save, MapPin, Package, DollarSign, Sparkles, ChevronDown, ChevronUp, MessageSquare, FileText, Calendar } from 'lucide-react';

interface AlternativeClassification {
  hts: string;
  confidence: number;
  description: string;
  tariff: string;
  reasoning?: string;
}

interface BulkItemDetailProps {
  item: {
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
  };
  onClose: () => void;
  onSave: (item: any) => void;
}

// Helper function to get HTS description
const getHTSDescription = (hts: string) => {
  // Map HTS codes to descriptions
  const descriptions: { [key: string]: string } = {
    '8517.62.0050': 'Machines for the reception, conversion and transmission or regeneration of voice, images or other data',
    '8518.22.0000': 'Multiple loudspeakers, mounted in the same enclosure',
    '8519.81.4040': 'Sound reproducing apparatus not incorporating a sound recording device',
    '6109.10.0012': 'T-shirts, singlets and other vests, knitted or crocheted, of cotton',
    '6109.90.1004': 'T-shirts, singlets, vests of textile materials',
    '6211.42.0010': 'Other garments, women\'s or girls\', of cotton',
    '9405.20.6000': 'Electric table, desk, bedside or floor-standing lamps',
    '9405.40.8000': 'Electric lamps and lighting fittings, other',
    '8513.10.2000': 'Portable electric lamps designed to function by their own source of energy',
    '7323.93.0000': 'Table, kitchen or other household articles of stainless steel',
    '9617.00.1000': 'Vacuum flasks and other vacuum vessels, complete',
    '7310.29.0050': 'Containers for compressed or liquified gas, of iron or steel',
    '9102.11.0000': 'Wrist watches, electrically operated, whether or not incorporating a stop watch facility',
    '8517.62.0020': 'Wearable wireless devices with communication functions',
    '9031.80.8000': 'Measuring or checking instruments, appliances and machines',
    '4419.90.9040': 'Tableware and kitchenware, of bamboo',
    '4421.99.9780': 'Other articles of wood',
    '4419.11.0000': 'Tableware and kitchenware, of bamboo, used for food contact',
    '6912.00.4810': 'Tableware, kitchenware, other household articles of ceramics',
    '6911.10.5200': 'Tableware, other household articles, of porcelain or china',
    '6912.00.3900': 'Ceramic tableware, other than of porcelain or china',
    '5515.11.0000': 'Mixed woven fabrics of polyester staple fibers with cotton',
    '5512.19.0040': 'Woven fabrics of synthetic staple fibers',
    '5516.12.0000': 'Woven fabrics containing 85% or more by weight of artificial staple fibers'
  };
  return descriptions[hts] || 'Product classification';
};

// Helper function to get alternatives for a product
const getAlternativesForProduct = (productName: string, origin?: string): AlternativeClassification[] => {
  const name = productName.toLowerCase();
  
  if (name.includes('speaker')) {
    return [
      { 
        hts: '8518.22.0000', 
        confidence: 82, 
        description: 'Multiple loudspeakers, mounted in the same enclosure',
        tariff: origin ? '4.9%' : 'Dependent on country of origin',
        reasoning: 'This classification applies if the bluetooth speaker contains multiple driver units (woofer, tweeter, etc.) mounted in the same housing. The emphasis is on the physical speaker configuration rather than wireless connectivity. This code is often used for home audio systems with multiple speaker drivers.'
      },
      { 
        hts: '8519.81.4040', 
        confidence: 71, 
        description: 'Sound reproducing apparatus not incorporating a sound recording device',
        tariff: origin ? '0% (Free)' : 'Dependent on country of origin',
        reasoning: 'This code applies to devices designed solely for sound reproduction without recording capability. If the bluetooth speaker lacks a microphone for recording or voice commands, and functions only as an audio playback device, this classification may be appropriate.'
      }
    ];
  } else if (name.includes('t-shirt') || name.includes('cotton')) {
    return [
      { 
        hts: '6109.90.1004', 
        confidence: 88, 
        description: 'T-shirts, singlets, vests of textile materials',
        tariff: origin ? '32%' : 'Dependent on country of origin',
        reasoning: 'This broader classification applies to T-shirts made of various textile materials. If the exact fiber composition is uncertain or if the garment contains blended materials that don\'t clearly fall under one category, this code provides a more general classification.'
      },
      { 
        hts: '6211.42.0010', 
        confidence: 75, 
        description: 'Other garments, women\'s or girls\', of cotton',
        tariff: origin ? '8.1%' : 'Dependent on country of origin',
        reasoning: 'This classification applies if the t-shirt is specifically designed for women or girls and is not knitted but woven. The construction method (knitted vs. woven) is critical - woven cotton garments fall under different HTS codes with different tariff rates.'
      }
    ];
  } else if (name.includes('lamp')) {
    return [
      { 
        hts: '9405.40.8000', 
        confidence: 85, 
        description: 'Electric lamps and lighting fittings, other',
        tariff: origin ? '3.9%' : 'Dependent on country of origin',
        reasoning: 'This is a catch-all category for electric lighting equipment that doesn\'t fit into more specific classifications. If the lamp has unique features or a non-standard design that makes it difficult to classify in standard categories, this code may be more appropriate.'
      },
      { 
        hts: '8513.10.2000', 
        confidence: 72, 
        description: 'Portable electric lamps designed to function by their own source of energy',
        tariff: origin ? '3.5%' : 'Dependent on country of origin',
        reasoning: 'If the desk lamp includes a rechargeable battery and can operate independently from AC power, it may qualify as a portable lamp. The USB charging feature and portability aspects could support this classification.'
      }
    ];
  } else if (name.includes('water bottle') || name.includes('bottle')) {
    return [
      { 
        hts: '9617.00.1000', 
        confidence: 86, 
        description: 'Vacuum flasks and other vacuum vessels, complete',
        tariff: origin ? '7%' : 'Dependent on country of origin',
        reasoning: 'If the water bottle features vacuum insulation technology (double-wall construction with vacuum between walls), this classification for vacuum flasks may be more appropriate. This code specifically covers vacuum-insulated vessels designed to maintain temperature.'
      },
      { 
        hts: '7310.29.0050', 
        confidence: 68, 
        description: 'Containers for compressed or liquified gas, of iron or steel',
        tariff: origin ? '0% (Free)' : 'Dependent on country of origin',
        reasoning: 'This classification could apply if the bottle is designed with pressure-handling capabilities or features that go beyond simple liquid storage. However, this is less likely for standard insulated water bottles.'
      }
    ];
  } else if (name.includes('watch')) {
    return [
      { 
        hts: '8517.62.0020', 
        confidence: 73, 
        description: 'Wearable wireless devices with communication functions',
        tariff: origin ? '0% (Free)' : 'Dependent on country of origin',
        reasoning: 'If the smartwatch\'s primary function is wireless communication (calls, messages, data transmission) rather than timekeeping, it may be classified as a telecommunications device. The presence of cellular connectivity or robust communication features would support this classification.'
      },
      { 
        hts: '9031.80.8000', 
        confidence: 64, 
        description: 'Measuring or checking instruments, appliances and machines',
        tariff: origin ? '1.7%' : 'Dependent on country of origin',
        reasoning: 'Given the health monitoring capabilities (heart rate, GPS tracking, fitness metrics), the device could be classified as a measuring instrument. If the primary marketed feature is health/fitness tracking rather than timekeeping, this classification may be considered.'
      }
    ];
  } else if (name.includes('fabric')) {
    return [
      { 
        hts: '5512.19.0040', 
        confidence: 78, 
        description: 'Woven fabrics of synthetic staple fibers',
        tariff: origin ? '14.9%' : 'Dependent on country of origin',
        reasoning: 'If the fabric construction is woven (not knitted) and the polyester content is significant, this classification for synthetic fiber fabrics may apply. The specific weave pattern and yarn type influence the final determination.'
      },
      { 
        hts: '5516.12.0000', 
        confidence: 69, 
        description: 'Woven fabrics containing 85% or more by weight of artificial staple fibers',
        tariff: origin ? '12%' : 'Dependent on country of origin',
        reasoning: 'This classification would apply if the fabric contains artificial (not synthetic) fibers in high proportion. The distinction between artificial fibers (cellulose-based like rayon) and synthetic fibers (petroleum-based like polyester) is critical for textile classification.'
      }
    ];
  } else if (name.includes('mug') || name.includes('ceramic')) {
    return [
      { 
        hts: '6911.10.5200', 
        confidence: 87, 
        description: 'Tableware, other household articles, of porcelain or china',
        tariff: origin ? '8%' : 'Dependent on country of origin',
        reasoning: 'If the mug is made of fine porcelain or china (rather than standard ceramic/earthenware), this classification applies. Porcelain is fired at higher temperatures and is more translucent and refined than regular ceramic.'
      },
      { 
        hts: '6912.00.3900', 
        confidence: 79, 
        description: 'Ceramic tableware, other than of porcelain or china',
        tariff: origin ? '4.5%' : 'Dependent on country of origin',
        reasoning: 'This code covers ceramic tableware that doesn\'t meet the definition of porcelain or china. Standard earthenware or stoneware mugs would fall under this classification, which typically has a lower tariff rate.'
      }
    ];
  } else if (name.includes('cutting board') || name.includes('bamboo')) {
    return [
      { 
        hts: '4421.99.9780', 
        confidence: 81, 
        description: 'Other articles of wood',
        tariff: origin ? '3.3%' : 'Dependent on country of origin',
        reasoning: 'This is a general classification for wooden articles not elsewhere specified. If the cutting board has additional features or combined materials that make it difficult to classify strictly as bamboo kitchenware, this broader wood products code may be appropriate.'
      },
      { 
        hts: '4419.11.0000', 
        confidence: 76, 
        description: 'Tableware and kitchenware, of bamboo, used for food contact',
        tariff: origin ? '3.2%' : 'Dependent on country of origin',
        reasoning: 'This more specific bamboo code applies to items intended for direct food contact. If the cutting board is marketed specifically for food preparation and has food-safe treatment, this classification emphasizes the food-contact aspect.'
      }
    ];
  }
  
  // Default alternatives
  return [
    { 
      hts: '9999.00.0000', 
      confidence: 70, 
      description: 'Alternative classification based on different interpretation',
      tariff: origin ? '5%' : 'Dependent on country of origin',
      reasoning: 'This alternative classification considers different factors or interpretations of the product characteristics that could lead to a different HTS code assignment.'
    }
  ];
};

// Helper function to get AI reasoning
const getAIReasoning = (productName: string, description: string) => {
  if (productName.toLowerCase().includes('speaker')) {
    return 'Based on the product description \"wireless bluetooth speaker,\" this item is classified as a telecommunications device. The primary function is receiving and converting wireless audio signals. Key classification factors: wireless connectivity (Bluetooth), audio transmission capability, and electronic amplification.';
  } else if (productName.toLowerCase().includes('t-shirt') || productName.toLowerCase().includes('cotton')) {
    return 'This garment is classified under knitted apparel based on its cotton composition and construction method. The classification depends on material content (100% cotton), garment type (T-shirt), and whether it is knitted or woven. Key factors: fiber content, gender neutrality, and manufacturing process.';
  } else if (productName.toLowerCase().includes('lamp')) {
    return 'This product is classified as electric lighting equipment. Primary considerations include: LED technology as the light source, desk/table mounting design, and adjustable features. The HTS code reflects the specific category for portable electric lamps with LED components.';
  } else if (productName.toLowerCase().includes('water bottle') || productName.toLowerCase().includes('bottle')) {
    return 'Classified as household articles of iron or steel based on material composition (stainless steel) and intended use (food/beverage storage). Key factors: insulated construction, capacity, and primary material. The vacuum insulation feature does not change the fundamental classification.';
  } else if (productName.toLowerCase().includes('watch')) {
    return 'This device is classified as a wristwatch with electronic display. Classification factors include: presence of health monitoring sensors, electronic movement, and wearable form factor. The \"smart\" functionality and connectivity features place it in a specific subcategory of electronic watches.';
  } else if (productName.toLowerCase().includes('fabric')) {
    return 'This textile material is classified based on fiber composition (60% cotton, 40% polyester blend). The classification follows the Chief Value rule - the constituent material that gives the fabric its essential character. Cotton-polyester blends are categorized by the predominant fiber content and weaving/knitting method.';
  } else if (productName.toLowerCase().includes('mug') || productName.toLowerCase().includes('ceramic')) {
    return 'Classified as ceramic tableware based on material (ceramic/porcelain) and intended use (beverage consumption). Key factors: ceramic construction, household/commercial use, and capacity. The dishwasher-safe feature is a quality attribute but does not affect HTS classification.';
  } else if (productName.toLowerCase().includes('cutting board') || productName.toLowerCase().includes('bamboo')) {
    return 'This item is classified under wood or bamboo household articles. Primary classification factors: bamboo as the principal material, intended use in food preparation, and manufacturing process. Bamboo is treated similarly to wood products in HTS classification despite being a grass species.';
  }
  return `This product is classified based on its primary function, material composition, and physical characteristics. The AI analyzed the product description \"${description}\" along with origin country data to determine the most appropriate HTS code.`;
};

export function BulkItemDetail({ item, onClose, onSave }: BulkItemDetailProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedItem, setEditedItem] = useState(item);
  
  // Initialize alternatives based on the product
  const initialAlternatives = getAlternativesForProduct(item.productName, item.origin);
  const initialReasoning = getAIReasoning(item.productName, item.description);
  
  const [currentClassification, setCurrentClassification] = useState({
    hts: item.hts || '',
    confidence: item.confidence || 0,
    tariff: item.tariff || '',
    reasoning: initialReasoning
  });
  const [alternatives, setAlternatives] = useState<AlternativeClassification[]>(initialAlternatives);

  const handleSave = () => {
    onSave(editedItem);
    setIsEditing(false);
  };

  const handleSelectAlternative = (alternative: AlternativeClassification) => {
    // Store the current classification as an alternative
    const currentAsAlternative: AlternativeClassification = {
      hts: currentClassification.hts,
      confidence: currentClassification.confidence,
      description: getHTSDescription(currentClassification.hts),
      tariff: currentClassification.tariff,
      reasoning: currentClassification.reasoning
    };

    // Filter out the selected alternative and add the current one
    const newAlternatives = alternatives.filter(alt => alt.hts !== alternative.hts);
    newAlternatives.unshift(currentAsAlternative);

    // Update the current classification with the selected alternative
    setCurrentClassification({
      hts: alternative.hts,
      confidence: alternative.confidence,
      tariff: alternative.tariff,
      reasoning: alternative.reasoning || ''
    });

    setAlternatives(newAlternatives);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-slate-200 p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button 
              onClick={onClose}
              className="p-2 hover:bg-white/50 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-slate-600" />
            </button>
            <div>
              <h2 className="text-slate-900">{item.productName}</h2>
              <p className="text-slate-600 text-sm">SKU: Not assigned</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-white/50 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-600" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Current Classification Card */}
          <div className="p-5 bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex-1">
                <div className="text-green-900 mb-3">Current Classification</div>
                <div className="text-green-800 text-xl mb-4">HTS Code: {currentClassification.hts}</div>
                
                <div className="space-y-1.5 text-sm mb-4">
                  <div className="flex items-start gap-2">
                    <span className="text-green-700 min-w-[70px]">Chapter</span>
                    <span className="text-green-800">85 — Electrical machinery and equipment</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-green-700 min-w-[70px]">Heading</span>
                    <span className="text-green-800">8517 — Telephone sets and other apparatus</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-green-700 min-w-[70px]">Subheading</span>
                    <span className="text-green-800">8517.62 — Machines for reception, conversion and transmission of voice, images or data</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 bg-green-100 rounded-lg">
                <CheckCircle className="w-5 h-5 text-green-700" />
                <span className="text-green-900">{currentClassification.confidence}% Confidence</span>
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm text-green-700">
              <Calendar className="w-4 h-4" />
              Last updated: {new Date().toLocaleDateString('en-US', { 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}
            </div>
          </div>

          {/* Product Information Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
              <div className="flex items-center gap-2 mb-2 text-slate-700">
                <Package className="w-5 h-5" />
                <span>Materials & Composition</span>
              </div>
              <p className="text-slate-900 text-sm">{item.materials || 'ABS Plastic, Lithium Battery, Electronic Components'}</p>
            </div>

            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
              <div className="flex items-center gap-2 mb-2 text-slate-700">
                <MapPin className="w-5 h-5" />
                <span>Country of Origin</span>
              </div>
              <p className="text-slate-900 text-sm">{item.origin || 'China'}</p>
            </div>

            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
              <div className="flex items-center gap-2 mb-2 text-slate-700">
                <DollarSign className="w-5 h-5" />
                <span>Unit Cost</span>
              </div>
              <p className="text-slate-900 text-sm">{item.cost || '$12.50'}</p>
            </div>

            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
              <div className="flex items-center gap-2 mb-2 text-slate-700">
                <FileText className="w-5 h-5" />
                <span>Vendor</span>
              </div>
              <p className="text-slate-900 text-sm">TechSupply Co.</p>
            </div>
          </div>

          {/* Trade Analysis */}
          <div>
            <h3 className="text-slate-900 mb-3">Trade Analysis</h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-200">
                <span className="text-blue-900 text-sm">Standard Tariff Rate (MFN)</span>
                <span className="text-blue-700">0% (Free)</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-200">
                <span className="text-blue-900 text-sm">USMCA Eligible</span>
                <span className="text-green-700 flex items-center gap-1">
                  <CheckCircle className="w-4 h-4" />
                  Qualified
                </span>
              </div>
              <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-200">
                <span className="text-blue-900 text-sm">Est. Cost Plus Tariff</span>
                <span className="text-blue-700">$14.20</span>
              </div>
            </div>
          </div>

          {/* AI Reasoning Section */}
          <div className="border-t border-slate-200 pt-6">
            <div className="border border-blue-200 rounded-xl overflow-hidden mb-6">
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-5 py-3 border-b border-blue-100">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-blue-600" />
                  <h3 className="text-blue-900">AI Reasoning</h3>
                </div>
              </div>
              <div className="p-5 bg-white">
                <p className="text-blue-800 text-sm mb-4">
                  {currentClassification.reasoning}
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button className="flex-1 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
                Approve & Save
              </button>
              <button className="px-6 py-3 border-2 border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 transition-colors flex items-center gap-2">
                <MessageSquare className="w-5 h-5" />
                Ask AI
              </button>
            </div>
          </div>

          {/* Alternative Classifications - Always Visible */}
          {alternatives.length > 0 && (
            <div className="border-t border-slate-200 pt-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="bg-amber-100 p-2 rounded-lg">
                  <AlertCircle className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h3 className="text-slate-900">Alternative Classifications</h3>
                  <p className="text-slate-600 text-sm">{alternatives.length} alternatives found</p>
                </div>
              </div>
              <div className="space-y-3">
                {alternatives.map((alt, index) => (
                  <div key={index} className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-slate-900">{alt.hts}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-slate-600 text-sm">Confidence: {alt.confidence}%</span>
                        <div className="w-20 h-2 bg-slate-200 rounded-full">
                          <div 
                            className="h-full bg-amber-500 rounded-full"
                            style={{ width: `${alt.confidence}%` }}
                          />
                        </div>
                      </div>
                    </div>
                    <p className="text-slate-700 text-sm mb-3">{alt.description}</p>
                    {alt.reasoning && (
                      <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                        <div className="flex items-start gap-2">
                          <Sparkles className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                          <p className="text-amber-900 text-xs leading-relaxed">{alt.reasoning}</p>
                        </div>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600 text-sm">Tariff: {alt.tariff}</span>
                      <button 
                        onClick={() => handleSelectAlternative(alt)}
                        className="px-3 py-1 border border-slate-300 text-slate-700 rounded-lg text-sm hover:bg-white transition-colors"
                      >
                        Select This Code
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}