// Type definitions
export interface Product {
  id: number;
  name: string;
  company: string;
  componentCount: number;
}

export interface RawMaterial {
  id: number;
  name: string;
  category: string;
}

export interface Supplier {
  name: string;
  score: number;
  reasoning: string;
}

export interface AnalysisMetrics {
  price: number;
  quality: number;
  compliance: number;
  leadTime: number;
  consolidation: number;
}

export interface AnalysisResult {
  recommendedSupplier: Supplier;
  alternatives: Supplier[];
  metrics: AnalysisMetrics;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export interface ChatSession {
  id: string;
  title: string;
  date: Date;
  messages: ChatMessage[];
}

// Sample data
export const sampleProducts: Product[] = [
  { id: 1, name: "NOW Foods Vitamin D3", company: "NOW Foods", componentCount: 4 },
  { id: 2, name: "Animal Omega", company: "Animal", componentCount: 13 },
  { id: 3, name: "Ultima Replenisher", company: "Ultima Replenisher", componentCount: 14 },
  { id: 4, name: "New Chapter Multivitamin", company: "New Chapter", componentCount: 17 },
  { id: 5, name: "Solgar B-Complex", company: "Solgar", componentCount: 8 },
  { id: 6, name: "Garden of Life Probiotics", company: "Garden of Life", componentCount: 12 },
  { id: 7, name: "Nordic Naturals Fish Oil", company: "Nordic Naturals", componentCount: 6 },
  { id: 8, name: "Nature Made CoQ10", company: "Nature Made", componentCount: 5 },
  { id: 9, name: "Thorne Magnesium", company: "Thorne", componentCount: 3 },
  { id: 10, name: "Life Extension NAC", company: "Life Extension", componentCount: 7 },
  { id: 11, name: "Jarrow Formulas Zinc", company: "Jarrow Formulas", componentCount: 4 },
  { id: 12, name: "Pure Encapsulations Iron", company: "Pure Encapsulations", componentCount: 5 },
  { id: 13, name: "MegaFood Turmeric", company: "MegaFood", componentCount: 9 },
  { id: 14, name: "BlueBonnet Calcium", company: "BlueBonnet", componentCount: 6 },
  { id: 15, name: "Country Life Biotin", company: "Country Life", componentCount: 4 },
];

const rawMaterialsByProduct: Record<number, RawMaterial[]> = {
  1: [
    { id: 506, name: "Glycerin", category: "Excipient" },
    { id: 509, name: "Safflower Oil", category: "Oil" },
    { id: 511, name: "Bovine Gelatin Capsule", category: "Capsule" },
    { id: 512, name: "Vitamin D3 Cholecalciferol", category: "Vitamin" },
  ],
  2: [
    { id: 201, name: "Fish Oil Concentrate", category: "Oil" },
    { id: 202, name: "Flaxseed Oil", category: "Oil" },
    { id: 203, name: "Lecithin", category: "Emulsifier" },
    { id: 204, name: "Gelatin Capsule", category: "Capsule" },
    { id: 205, name: "Vitamin E (d-Alpha Tocopherol)", category: "Vitamin" },
  ],
  3: [
    { id: 301, name: "Citric Acid", category: "Acid" },
    { id: 302, name: "Magnesium Citrate", category: "Mineral" },
    { id: 303, name: "Potassium Chloride", category: "Mineral" },
    { id: 304, name: "Sodium Chloride", category: "Mineral" },
  ],
};

const defaultRawMaterials: RawMaterial[] = [
  { id: 901, name: "Microcrystalline Cellulose", category: "Excipient" },
  { id: 902, name: "Magnesium Stearate", category: "Lubricant" },
  { id: 903, name: "Silicon Dioxide", category: "Anti-caking" },
];

export function getRawMaterials(productId: number): RawMaterial[] {
  return rawMaterialsByProduct[productId] ?? defaultRawMaterials;
}

export function generateAnalysis(sliders: number[]): AnalysisResult {
  const [price, quality, compliance, consolidation, leadTime] = sliders;
  const totalWeight = price + quality + compliance + consolidation + leadTime;
  const normalizedScore = 0.7 + (totalWeight / 50) * 0.25;
  const baseScore = Math.min(normalizedScore, 0.99);

  const estimatedLeadTime = Math.max(3, 10 - leadTime);

  return {
    recommendedSupplier: {
      name: "Prinova USA",
      score: Math.round(baseScore * 100) / 100,
      reasoning: `Best combination of competitive pricing (weight: ${price}/10), consistent quality certifications (weight: ${quality}/10), and compliance standards (weight: ${compliance}/10). Ships from domestic warehouse with ${estimatedLeadTime}-day lead time.`,
    },
    alternatives: [
      {
        name: "PureBulk",
        score: Math.round((baseScore - 0.07) * 100) / 100,
        reasoning: "Good backup option, slightly higher price but excellent quality track record.",
      },
      {
        name: "Jost Chemical",
        score: Math.round((baseScore - 0.14) * 100) / 100,
        reasoning: "Premium quality supplier, longer lead time but best-in-class compliance.",
      },
      {
        name: "BASF Nutrition",
        score: Math.round((baseScore - 0.2) * 100) / 100,
        reasoning: "Large scale supplier with competitive bulk pricing.",
      },
    ],
    metrics: { price, quality, compliance, leadTime, consolidation },
  };
}

export const sampleChatSessions: ChatSession[] = [
  {
    id: "session-1",
    title: "Vitamin D3 Analysis",
    date: new Date(2026, 3, 7),
    messages: [
      {
        id: "msg-1",
        role: "assistant",
        content: "Hi! I'm your SupplyWise assistant. How can I help you today?",
        timestamp: new Date(2026, 3, 7, 10, 0),
      },
      {
        id: "msg-2",
        role: "user",
        content: "Show me analysis for Vitamin D3",
        timestamp: new Date(2026, 3, 7, 10, 1),
      },
      {
        id: "msg-3",
        role: "assistant",
        content:
          "I found Vitamin D3 Cholecalciferol in the NOW Foods product. The recommended supplier is Prinova USA with a 92% confidence score. They offer the best combination of pricing and quality.",
        timestamp: new Date(2026, 3, 7, 10, 1),
      },
    ],
  },
  {
    id: "session-2",
    title: "Supplier Comparison",
    date: new Date(2026, 3, 5),
    messages: [
      {
        id: "msg-4",
        role: "assistant",
        content: "Hi! I'm your SupplyWise assistant. How can I help you today?",
        timestamp: new Date(2026, 3, 5, 14, 0),
      },
      {
        id: "msg-5",
        role: "user",
        content: "Compare suppliers for Fish Oil",
        timestamp: new Date(2026, 3, 5, 14, 1),
      },
      {
        id: "msg-6",
        role: "assistant",
        content:
          "Here's a comparison of Fish Oil suppliers: Nordic Naturals leads with 95% quality score, followed by Carlson Labs at 90%.",
        timestamp: new Date(2026, 3, 5, 14, 1),
      },
    ],
  },
];
