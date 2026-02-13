# chapter_mapping.py - HTS Chapter to Material/Function Mapping

# HTS has 99 chapters organized into 22 sections
# This mapping provides materials and functions for each chapter

CHAPTER_MAPPING = {
    # Section I: Live Animals; Animal Products (Chapters 1-5)
    "01": {
        "section": "I",
        "section_title": "Live Animals; Animal Products",
        "materials": ["animal", "livestock"],
        "functions": ["breeding", "farming", "racing", "riding", "show", "slaughter"],
        "synonyms": ["equine", "bovine", "swine", "poultry", "fauna"]
    },
    "02": {
        "section": "I",
        "section_title": "Live Animals; Animal Products",
        "materials": ["meat", "beef", "pork", "poultry", "lamb", "veal"],
        "functions": ["food", "consumption", "edible"],
        "synonyms": ["flesh", "carcass", "offal"]
    },
    "03": {
        "section": "I",
        "section_title": "Live Animals; Animal Products",
        "materials": ["fish", "seafood", "crustacean", "shellfish", "mollusc"],
        "functions": ["food", "consumption", "edible", "aquaculture"],
        "synonyms": ["salmon", "tuna", "shrimp", "lobster", "crab", "oyster"]
    },
    "04": {
        "section": "I",
        "section_title": "Live Animals; Animal Products",
        "materials": ["dairy", "milk", "egg", "honey"],
        "functions": ["food", "consumption", "edible"],
        "synonyms": ["cheese", "butter", "yogurt", "cream"]
    },
    "05": {
        "section": "I",
        "section_title": "Live Animals; Animal Products",
        "materials": ["bone", "horn", "ivory", "feather", "hair", "gut"],
        "functions": ["industrial", "ornamental"],
        "synonyms": ["animal product", "byproduct"]
    },

    # Section II: Vegetable Products (Chapters 6-14)
    "06": {
        "section": "II",
        "section_title": "Vegetable Products",
        "materials": ["plant", "flower", "bulb", "foliage"],
        "functions": ["ornamental", "gardening", "landscaping"],
        "synonyms": ["flora", "botanical", "nursery stock"]
    },
    "07": {
        "section": "II",
        "section_title": "Vegetable Products",
        "materials": ["vegetable", "legume", "tuber", "root"],
        "functions": ["food", "consumption", "edible"],
        "synonyms": ["potato", "tomato", "onion", "carrot", "bean", "pea"]
    },
    "08": {
        "section": "II",
        "section_title": "Vegetable Products",
        "materials": ["fruit", "nut", "citrus", "melon"],
        "functions": ["food", "consumption", "edible"],
        "synonyms": ["apple", "orange", "banana", "grape", "berry", "almond"]
    },
    "09": {
        "section": "II",
        "section_title": "Vegetable Products",
        "materials": ["coffee", "tea", "spice", "mate"],
        "functions": ["food", "beverage", "flavoring"],
        "synonyms": ["pepper", "cinnamon", "vanilla", "ginger"]
    },
    "10": {
        "section": "II",
        "section_title": "Vegetable Products",
        "materials": ["cereal", "grain", "wheat", "rice", "corn", "barley", "oat"],
        "functions": ["food", "consumption", "edible", "feed"],
        "synonyms": ["maize", "sorghum", "millet"]
    },
    "11": {
        "section": "II",
        "section_title": "Vegetable Products",
        "materials": ["flour", "starch", "malt", "gluten"],
        "functions": ["food", "baking", "brewing"],
        "synonyms": ["meal", "powder"]
    },
    "12": {
        "section": "II",
        "section_title": "Vegetable Products",
        "materials": ["seed", "oil seed", "plant"],
        "functions": ["planting", "oil extraction", "industrial"],
        "synonyms": ["soybean", "sunflower", "rapeseed", "flaxseed"]
    },
    "13": {
        "section": "II",
        "section_title": "Vegetable Products",
        "materials": ["resin", "gum", "sap", "extract"],
        "functions": ["industrial", "pharmaceutical", "flavoring"],
        "synonyms": ["lac", "pectin", "mucilage"]
    },
    "14": {
        "section": "II",
        "section_title": "Vegetable Products",
        "materials": ["straw", "bamboo", "rattan", "reed", "willow"],
        "functions": ["plaiting", "weaving", "craft"],
        "synonyms": ["vegetable plaiting material"]
    },

    # Section III: Fats and Oils (Chapter 15)
    "15": {
        "section": "III",
        "section_title": "Animal or Vegetable Fats and Oils",
        "materials": ["oil", "fat", "wax", "grease"],
        "functions": ["cooking", "industrial", "lubricant"],
        "synonyms": ["olive oil", "palm oil", "lard", "tallow", "margarine"]
    },

    # Section IV: Prepared Foodstuffs (Chapters 16-24)
    "16": {
        "section": "IV",
        "section_title": "Prepared Foodstuffs",
        "materials": ["meat preparation", "fish preparation"],
        "functions": ["food", "preserved", "canned"],
        "synonyms": ["sausage", "canned fish", "prepared meat"]
    },
    "17": {
        "section": "IV",
        "section_title": "Prepared Foodstuffs",
        "materials": ["sugar", "confectionery"],
        "functions": ["food", "sweetener"],
        "synonyms": ["candy", "chocolate", "molasses", "syrup"]
    },
    "18": {
        "section": "IV",
        "section_title": "Prepared Foodstuffs",
        "materials": ["cocoa", "chocolate"],
        "functions": ["food", "confectionery"],
        "synonyms": ["cacao", "chocolate product"]
    },
    "19": {
        "section": "IV",
        "section_title": "Prepared Foodstuffs",
        "materials": ["cereal preparation", "flour preparation", "pastry"],
        "functions": ["food", "baked goods"],
        "synonyms": ["bread", "pasta", "noodle", "biscuit", "cake"]
    },
    "20": {
        "section": "IV",
        "section_title": "Prepared Foodstuffs",
        "materials": ["vegetable preparation", "fruit preparation"],
        "functions": ["food", "preserved", "canned", "frozen"],
        "synonyms": ["jam", "jelly", "pickle", "juice"]
    },
    "21": {
        "section": "IV",
        "section_title": "Prepared Foodstuffs",
        "materials": ["food preparation", "sauce", "condiment"],
        "functions": ["food", "flavoring"],
        "synonyms": ["soup", "sauce", "seasoning", "yeast"]
    },
    "22": {
        "section": "IV",
        "section_title": "Prepared Foodstuffs",
        "materials": ["beverage", "alcohol", "wine", "beer", "spirits"],
        "functions": ["drink", "consumption"],
        "synonyms": ["water", "juice", "soft drink", "liquor"]
    },
    "23": {
        "section": "IV",
        "section_title": "Prepared Foodstuffs",
        "materials": ["animal feed", "residue"],
        "functions": ["feed", "industrial byproduct"],
        "synonyms": ["fodder", "pet food", "bran"]
    },
    "24": {
        "section": "IV",
        "section_title": "Prepared Foodstuffs",
        "materials": ["tobacco", "cigarette"],
        "functions": ["smoking", "consumption"],
        "synonyms": ["cigar", "snuff"]
    },

    # Section V: Mineral Products (Chapters 25-27)
    "25": {
        "section": "V",
        "section_title": "Mineral Products",
        "materials": ["salt", "ite", "calcium", "cement", "stone", "sand", "gravel"],
        "functions": ["construction", "industrial", "chemical"],
        "synonyms": ["earth", "mineral", "chalk", "limestone", "gypsum", "slate"]
    },
    "26": {
        "section": "V",
        "section_title": "Mineral Products",
        "materials": ["ore", "slag", "ash"],
        "functions": ["mining", "metallurgical", "industrial"],
        "synonyms": ["iron ore", "copper ore", "mineral concentrate"]
    },
    "27": {
        "section": "V",
        "section_title": "Mineral Products",
        "materials": ["oil", "petroleum", "coal", "gas", "bitumen"],
        "functions": ["fuel", "energy", "industrial"],
        "synonyms": ["crude oil", "gasoline", "diesel", "natural gas"]
    },

    # Section VI: Chemical Products (Chapters 28-38)
    "28": {
        "section": "VI",
        "section_title": "Products of the Chemical or Allied Industries",
        "materials": ["inorganic chemical", "compound", "element"],
        "functions": ["industrial", "chemical processing"],
        "synonyms": ["acid", "oxide", "salt", "radioactive"]
    },
    "29": {
        "section": "VI",
        "section_title": "Products of the Chemical or Allied Industries",
        "materials": ["organic chemical", "compound"],
        "functions": ["industrial", "pharmaceutical", "chemical processing"],
        "synonyms": ["hydrocarbon", "alcohol", "ester", "amine"]
    },
    "30": {
        "section": "VI",
        "section_title": "Products of the Chemical or Allied Industries",
        "materials": ["pharmaceutical", "medicament", "drug"],
        "functions": ["medical", "therapeutic", "healthcare"],
        "synonyms": ["medicine", "vaccine", "dosage", "bandage"]
    },
    "31": {
        "section": "VI",
        "section_title": "Products of the Chemical or Allied Industries",
        "materials": ["fertilizer"],
        "functions": ["agricultural", "farming"],
        "synonyms": ["nitrogen", "phosphate", "potash"]
    },
    "32": {
        "section": "VI",
        "section_title": "Products of the Chemical or Allied Industries",
        "materials": ["dye", "pigment", "paint", "ink", "tanning extract"],
        "functions": ["coloring", "coating", "tanning"],
        "synonyms": ["varnish", "lacquer", "colorant"]
    },
    "33": {
        "section": "VI",
        "section_title": "Products of the Chemical or Allied Industries",
        "materials": ["essential oil", "perfume", "cosmetic"],
        "functions": ["personal care", "fragrance", "beauty"],
        "synonyms": ["soap", "shampoo", "lotion", "makeup"]
    },
    "34": {
        "section": "VI",
        "section_title": "Products of the Chemical or Allied Industries",
        "materials": ["soap", "wax", "polish", "candle"],
        "functions": ["cleaning", "lubricating", "polishing"],
        "synonyms": ["detergent", "surfactant"]
    },
    "35": {
        "section": "VI",
        "section_title": "Products of the Chemical or Allied Industries",
        "materials": ["protein", "glue", "enzyme"],
        "functions": ["adhesive", "industrial"],
        "synonyms": ["gelatin", "casein", "albumin"]
    },
    "36": {
        "section": "VI",
        "section_title": "Products of the Chemical or Allied Industries",
        "materials": ["explosive", "pyrotechnic", "match"],
        "functions": ["explosive", "ignition"],
        "synonyms": ["firework", "fuse", "propellant"]
    },
    "37": {
        "section": "VI",
        "section_title": "Products of the Chemical or Allied Industries",
        "materials": ["photographic material", "film"],
        "functions": ["photography", "imaging"],
        "synonyms": ["photo paper", "sensitized", "cinematographic"]
    },
    "38": {
        "section": "VI",
        "section_title": "Products of the Chemical or Allied Industries",
        "materials": ["chemical product", "miscellaneous chemical"],
        "functions": ["industrial", "chemical processing"],
        "synonyms": ["insecticide", "herbicide", "solvent", "antifreeze"]
    },

    # Section VII: Plastics and Rubber (Chapters 39-40)
    "39": {
        "section": "VII",
        "section_title": "Plastics and Articles Thereof; Rubber and Articles Thereof",
        "materials": ["plastic", "polymer", "resin"],
        "functions": ["packaging", "manufacturing", "construction"],
        "synonyms": ["polyethylene", "PVC", "polypropylene", "nylon", "acrylic"]
    },
    "40": {
        "section": "VII",
        "section_title": "Plastics and Articles Thereof; Rubber and Articles Thereof",
        "materials": ["rubber", "latex"],
        "functions": ["manufacturing", "automotive", "industrial"],
        "synonyms": ["tire", "tube", "gasket", "vulcanized"]
    },

    # Section VIII: Raw Hides, Leather, Furskins (Chapters 41-43)
    "41": {
        "section": "VIII",
        "section_title": "Raw Hides and Skins, Leather, Furskins and Articles Thereof",
        "materials": ["leather", "hide", "skin"],
        "functions": ["tanning", "manufacturing"],
        "synonyms": ["rawhide", "tanned", "chamois"]
    },
    "42": {
        "section": "VIII",
        "section_title": "Raw Hides and Skins, Leather, Furskins and Articles Thereof",
        "materials": ["leather article", "luggage", "handbag"],
        "functions": ["fashion", "travel", "accessory"],
        "synonyms": ["bag", "wallet", "belt", "saddlery"]
    },
    "43": {
        "section": "VIII",
        "section_title": "Raw Hides and Skins, Leather, Furskins and Articles Thereof",
        "materials": ["fur", "furskin"],
        "functions": ["fashion", "apparel"],
        "synonyms": ["pelt", "fur garment"]
    },

    # Section IX: Wood and Articles of Wood (Chapters 44-46)
    "44": {
        "section": "IX",
        "section_title": "Wood and Articles of Wood; Wood Charcoal; Cork and Articles of Cork",
        "materials": ["wood", "timber", "lumber"],
        "functions": ["construction", "furniture", "manufacturing"],
        "synonyms": ["plywood", "veneer", "particleboard", "hardwood", "softwood"]
    },
    "45": {
        "section": "IX",
        "section_title": "Wood and Articles of Wood; Wood Charcoal; Cork and Articles of Cork",
        "materials": ["cork"],
        "functions": ["packaging", "insulation", "sealing"],
        "synonyms": ["stopper", "cork article"]
    },
    "46": {
        "section": "IX",
        "section_title": "Wood and Articles of Wood; Wood Charcoal; Cork and Articles of Cork",
        "materials": ["straw", "basketware", "wickerwork"],
        "functions": ["craft", "household"],
        "synonyms": ["basket", "mat", "plaited"]
    },

    # Section X: Pulp of Wood, Paper (Chapters 47-49)
    "47": {
        "section": "X",
        "section_title": "Pulp of Wood or Other Fibrous Cellulosic Material; Recovered Paper",
        "materials": ["pulp", "cellulose"],
        "functions": ["paper manufacturing"],
        "synonyms": ["wood pulp", "waste paper"]
    },
    "48": {
        "section": "X",
        "section_title": "Pulp of Wood or Other Fibrous Cellulosic Material; Recovered Paper",
        "materials": ["paper", "paperboard", "cardboard"],
        "functions": ["printing", "packaging", "writing"],
        "synonyms": ["newsprint", "kraft", "carton", "tissue"]
    },
    "49": {
        "section": "X",
        "section_title": "Pulp of Wood or Other Fibrous Cellulosic Material; Recovered Paper",
        "materials": ["printed material", "book", "newspaper"],
        "functions": ["publishing", "printing", "communication"],
        "synonyms": ["magazine", "catalog", "map", "postcard"]
    },

    # Section XI: Textiles and Textile Articles (Chapters 50-63)
    "50": {
        "section": "XI",
        "section_title": "Textiles and Textile Articles",
        "materials": ["silk"],
        "functions": ["apparel", "fashion", "textile"],
        "synonyms": ["silkworm", "raw silk", "silk yarn"]
    },
    "51": {
        "section": "XI",
        "section_title": "Textiles and Textile Articles",
        "materials": ["wool", "animal hair"],
        "functions": ["apparel", "fashion", "textile"],
        "synonyms": ["cashmere", "mohair", "alpaca", "worsted"]
    },
    "52": {
        "section": "XI",
        "section_title": "Textiles and Textile Articles",
        "materials": ["cotton"],
        "functions": ["apparel", "fashion", "textile"],
        "synonyms": ["cotton yarn", "cotton fabric", "denim"]
    },
    "53": {
        "section": "XI",
        "section_title": "Textiles and Textile Articles",
        "materials": ["vegetable fiber", "flax", "hemp", "jute"],
        "functions": ["textile", "industrial"],
        "synonyms": ["linen", "ramie", "sisal"]
    },
    "54": {
        "section": "XI",
        "section_title": "Textiles and Textile Articles",
        "materials": ["synthetic filament", "artificial filament", "polyester", "nylon"],
        "functions": ["apparel", "fashion", "textile"],
        "synonyms": ["manmade fiber", "rayon", "viscose"]
    },
    "55": {
        "section": "XI",
        "section_title": "Textiles and Textile Articles",
        "materials": ["synthetic staple fiber", "artificial staple fiber"],
        "functions": ["apparel", "fashion", "textile"],
        "synonyms": ["acrylic", "polyester staple"]
    },
    "56": {
        "section": "XI",
        "section_title": "Textiles and Textile Articles",
        "materials": ["wadding", "felt", "nonwoven", "twine", "rope"],
        "functions": ["industrial", "textile"],
        "synonyms": ["cordage", "netting"]
    },
    "57": {
        "section": "XI",
        "section_title": "Textiles and Textile Articles",
        "materials": ["carpet", "rug", "floor covering"],
        "functions": ["home furnishing", "flooring"],
        "synonyms": ["mat", "textile floor covering"]
    },
    "58": {
        "section": "XI",
        "section_title": "Textiles and Textile Articles",
        "materials": ["woven fabric", "tapestry", "lace", "embroidery"],
        "functions": ["textile", "fashion", "decoration"],
        "synonyms": ["velvet", "chenille", "ribbon"]
    },
    "59": {
        "section": "XI",
        "section_title": "Textiles and Textile Articles",
        "materials": ["impregnated textile", "coated textile", "laminated textile"],
        "functions": ["industrial", "technical textile"],
        "synonyms": ["rubberized", "plastic coated", "textile wall covering"]
    },
    "60": {
        "section": "XI",
        "section_title": "Textiles and Textile Articles",
        "materials": ["knitted fabric", "crocheted fabric"],
        "functions": ["apparel", "fashion", "textile"],
        "synonyms": ["jersey", "knit"]
    },
    "61": {
        "section": "XI",
        "section_title": "Textiles and Textile Articles",
        "materials": ["knitted apparel", "crocheted apparel"],
        "functions": ["clothing", "fashion", "apparel"],
        "synonyms": ["t-shirt", "sweater", "pullover", "cardigan", "underwear"]
    },
    "62": {
        "section": "XI",
        "section_title": "Textiles and Textile Articles",
        "materials": ["woven apparel", "not knitted apparel"],
        "functions": ["clothing", "fashion", "apparel"],
        "synonyms": ["shirt", "blouse", "suit", "dress", "trousers", "coat"]
    },
    "63": {
        "section": "XI",
        "section_title": "Textiles and Textile Articles",
        "materials": ["made up textile", "worn clothing", "rag"],
        "functions": ["household", "textile article"],
        "synonyms": ["blanket", "bedding", "curtain", "towel", "bag"]
    },

    # Section XII: Footwear, Headgear (Chapters 64-67)
    "64": {
        "section": "XII",
        "section_title": "Footwear, Headgear, Umbrellas, Sun Umbrellas",
        "materials": ["footwear", "shoe", "boot"],
        "functions": ["apparel", "fashion", "protection"],
        "synonyms": ["sneaker", "sandal", "slipper", "sole", "upper"]
    },
    "65": {
        "section": "XII",
        "section_title": "Footwear, Headgear, Umbrellas, Sun Umbrellas",
        "materials": ["headgear", "hat", "cap"],
        "functions": ["apparel", "fashion", "protection"],
        "synonyms": ["helmet", "headwear"]
    },
    "66": {
        "section": "XII",
        "section_title": "Footwear, Headgear, Umbrellas, Sun Umbrellas",
        "materials": ["umbrella", "walking stick", "cane"],
        "functions": ["accessory", "protection"],
        "synonyms": ["parasol", "sun umbrella"]
    },
    "67": {
        "section": "XII",
        "section_title": "Footwear, Headgear, Umbrellas, Sun Umbrellas",
        "materials": ["feather article", "artificial flower"],
        "functions": ["decoration", "ornamental"],
        "synonyms": ["wig", "human hair article"]
    },

    # Section XIII: Stone, Ceramic, Glass (Chapters 68-70)
    "68": {
        "section": "XIII",
        "section_title": "Articles of Stone, Plaster, Cement, Asbestos, Mica",
        "materials": ["stone", "concrete", "cement", "asbestos", "mica", "plaster"],
        "functions": ["construction", "building"],
        "synonyms": ["granite", "marble", "slate", "tile"]
    },
    "69": {
        "section": "XIII",
        "section_title": "Articles of Stone, Plaster, Cement, Asbestos, Mica",
        "materials": ["ceramic", "porcelain", "china", "earthenware"],
        "functions": ["household", "construction", "tableware"],
        "synonyms": ["tile", "brick", "pottery", "sanitary ware"]
    },
    "70": {
        "section": "XIII",
        "section_title": "Articles of Stone, Plaster, Cement, Asbestos, Mica",
        "materials": ["glass", "glassware"],
        "functions": ["household", "construction", "optical"],
        "synonyms": ["mirror", "bottle", "fiber glass", "safety glass"]
    },

    # Section XIV: Precious Stones, Metals, Jewelry (Chapter 71)
    "71": {
        "section": "XIV",
        "section_title": "Natural or Cultured Pearls, Precious or Semi-Precious Stones, Precious Metals",
        "materials": ["pearl", "precious stone", "gold", "silver", "platinum", "jewelry"],
        "functions": ["jewelry", "ornamental", "investment"],
        "synonyms": ["diamond", "ruby", "sapphire", "emerald", "gem", "coin"]
    },

    # Section XV: Base Metals (Chapters 72-83)
    "72": {
        "section": "XV",
        "section_title": "Base Metals and Articles of Base Metal",
        "materials": ["iron", "steel"],
        "functions": ["construction", "manufacturing", "industrial"],
        "synonyms": ["pig iron", "stainless steel", "alloy steel", "flat rolled"]
    },
    "73": {
        "section": "XV",
        "section_title": "Base Metals and Articles of Base Metal",
        "materials": ["iron article", "steel article"],
        "functions": ["construction", "manufacturing", "household"],
        "synonyms": ["pipe", "tube", "fitting", "structure", "container"]
    },
    "74": {
        "section": "XV",
        "section_title": "Base Metals and Articles of Base Metal",
        "materials": ["copper"],
        "functions": ["electrical", "construction", "manufacturing"],
        "synonyms": ["copper alloy", "brass", "bronze", "copper wire"]
    },
    "75": {
        "section": "XV",
        "section_title": "Base Metals and Articles of Base Metal",
        "materials": ["nickel"],
        "functions": ["manufacturing", "industrial"],
        "synonyms": ["nickel alloy"]
    },
    "76": {
        "section": "XV",
        "section_title": "Base Metals and Articles of Base Metal",
        "materials": ["aluminum"],
        "functions": ["packaging", "construction", "manufacturing"],
        "synonyms": ["aluminium", "aluminum alloy", "foil"]
    },
    "78": {
        "section": "XV",
        "section_title": "Base Metals and Articles of Base Metal",
        "materials": ["lead"],
        "functions": ["industrial", "manufacturing"],
        "synonyms": ["lead alloy"]
    },
    "79": {
        "section": "XV",
        "section_title": "Base Metals and Articles of Base Metal",
        "materials": ["zinc"],
        "functions": ["industrial", "manufacturing", "galvanizing"],
        "synonyms": ["zinc alloy"]
    },
    "80": {
        "section": "XV",
        "section_title": "Base Metals and Articles of Base Metal",
        "materials": ["tin"],
        "functions": ["packaging", "manufacturing"],
        "synonyms": ["tin alloy", "tinplate"]
    },
    "81": {
        "section": "XV",
        "section_title": "Base Metals and Articles of Base Metal",
        "materials": ["other base metal", "tungsten", "molybdenum", "tantalum"],
        "functions": ["industrial", "manufacturing"],
        "synonyms": ["magnesium", "cobalt", "titanium", "zirconium"]
    },
    "82": {
        "section": "XV",
        "section_title": "Base Metals and Articles of Base Metal",
        "materials": ["tool", "cutlery", "base metal"],
        "functions": ["cutting", "hand tool", "household"],
        "synonyms": ["knife", "scissor", "blade", "saw", "file", "plier"]
    },
    "83": {
        "section": "XV",
        "section_title": "Base Metals and Articles of Base Metal",
        "materials": ["base metal article", "miscellaneous metal"],
        "functions": ["hardware", "household", "construction"],
        "synonyms": ["lock", "clasp", "hook", "bell", "frame", "fitting"]
    },

    # Section XVI: Machinery and Mechanical Appliances (Chapters 84-85)
    "84": {
        "section": "XVI",
        "section_title": "Machinery and Mechanical Appliances; Electrical Equipment",
        "materials": ["machinery", "mechanical appliance", "engine", "pump"],
        "functions": ["industrial", "manufacturing", "processing"],
        "synonyms": ["boiler", "turbine", "motor", "compressor", "refrigerator", "computer", "printer"]
    },
    "85": {
        "section": "XVI",
        "section_title": "Machinery and Mechanical Appliances; Electrical Equipment",
        "materials": ["electrical equipment", "electronic", "semiconductor"],
        "functions": ["electrical", "electronic", "communication"],
        "synonyms": ["transformer", "generator", "battery", "cable", "television", "telephone", "circuit"]
    },

    # Section XVII: Vehicles (Chapters 86-89)
    "86": {
        "section": "XVII",
        "section_title": "Vehicles, Aircraft, Vessels and Associated Transport Equipment",
        "materials": ["railway", "locomotive", "tramway"],
        "functions": ["transportation", "rail"],
        "synonyms": ["train", "railway car", "track"]
    },
    "87": {
        "section": "XVII",
        "section_title": "Vehicles, Aircraft, Vessels and Associated Transport Equipment",
        "materials": ["vehicle", "automobile", "motorcycle", "bicycle"],
        "functions": ["transportation", "automotive"],
        "synonyms": ["car", "truck", "bus", "trailer", "parts", "accessories"]
    },
    "88": {
        "section": "XVII",
        "section_title": "Vehicles, Aircraft, Vessels and Associated Transport Equipment",
        "materials": ["aircraft", "spacecraft"],
        "functions": ["transportation", "aviation", "aerospace"],
        "synonyms": ["airplane", "helicopter", "drone", "satellite"]
    },
    "89": {
        "section": "XVII",
        "section_title": "Vehicles, Aircraft, Vessels and Associated Transport Equipment",
        "materials": ["ship", "boat", "vessel"],
        "functions": ["transportation", "marine", "maritime"],
        "synonyms": ["yacht", "tanker", "cargo ship", "floating structure"]
    },

    # Section XVIII: Optical, Photographic, Medical Instruments (Chapters 90-92)
    "90": {
        "section": "XVIII",
        "section_title": "Optical, Photographic, Cinematographic, Measuring, Checking, Precision Instruments",
        "materials": ["optical instrument", "medical instrument", "measuring instrument"],
        "functions": ["measurement", "medical", "scientific"],
        "synonyms": ["lens", "microscope", "telescope", "thermometer", "x-ray", "prosthesis"]
    },
    "91": {
        "section": "XVIII",
        "section_title": "Optical, Photographic, Cinematographic, Measuring, Checking, Precision Instruments",
        "materials": ["clock", "watch"],
        "functions": ["timekeeping"],
        "synonyms": ["wristwatch", "stopwatch", "timer"]
    },
    "92": {
        "section": "XVIII",
        "section_title": "Optical, Photographic, Cinematographic, Measuring, Checking, Precision Instruments",
        "materials": ["musical instrument"],
        "functions": ["music", "entertainment"],
        "synonyms": ["piano", "guitar", "violin", "drum", "wind instrument"]
    },

    # Section XIX: Arms and Ammunition (Chapter 93)
    "93": {
        "section": "XIX",
        "section_title": "Arms and Ammunition; Parts and Accessories Thereof",
        "materials": ["weapon", "firearm", "ammunition"],
        "functions": ["defense", "hunting", "sporting"],
        "synonyms": ["gun", "rifle", "pistol", "sword", "cartridge"]
    },

    # Section XX: Miscellaneous Manufactured Articles (Chapters 94-96)
    "94": {
        "section": "XX",
        "section_title": "Miscellaneous Manufactured Articles",
        "materials": ["furniture", "bedding", "mattress", "lamp"],
        "functions": ["household", "furnishing", "lighting"],
        "synonyms": ["chair", "table", "bed", "cabinet", "prefabricated building"]
    },
    "95": {
        "section": "XX",
        "section_title": "Miscellaneous Manufactured Articles",
        "materials": ["toy", "game", "sport equipment"],
        "functions": ["recreation", "entertainment", "sport"],
        "synonyms": ["doll", "puzzle", "video game", "golf", "tennis", "fishing"]
    },
    "96": {
        "section": "XX",
        "section_title": "Miscellaneous Manufactured Articles",
        "materials": ["miscellaneous manufactured", "brush", "button", "pen"],
        "functions": ["personal use", "household"],
        "synonyms": ["zipper", "lighter", "comb", "pencil", "stamp"]
    },

    # Section XXI: Works of Art (Chapter 97)
    "97": {
        "section": "XXI",
        "section_title": "Works of Art, Collectors' Pieces and Antiques",
        "materials": ["artwork", "painting", "sculpture", "antique"],
        "functions": ["art", "collection", "decoration"],
        "synonyms": ["original art", "print", "statue", "collectors item"]
    },

    # Section XXII: Special Classification Provisions (Chapter 98-99)
    "98": {
        "section": "XXII",
        "section_title": "Special Classification Provisions",
        "materials": ["special import"],
        "functions": ["special provision"],
        "synonyms": ["personal effect", "return goods"]
    },
    "99": {
        "section": "XXII",
        "section_title": "Special Classification Provisions",
        "materials": ["temporary import", "special provision"],
        "functions": ["temporary", "special"],
        "synonyms": ["quota", "trade agreement"]
    },
}


def get_chapter_info(hts_code: str) -> dict:
    """
    Get chapter mapping info for an HTS code.

    Args:
        hts_code: HTS code (e.g., "6109.10.00.10" or "61")

    Returns:
        Dictionary with section, materials, functions, synonyms
    """
    # Extract chapter (first 2 digits)
    chapter = hts_code[:2].zfill(2)

    if chapter in CHAPTER_MAPPING:
        return CHAPTER_MAPPING[chapter]

    # Return empty defaults if chapter not found
    return {
        "section": "",
        "section_title": "",
        "materials": [],
        "functions": [],
        "synonyms": []
    }
