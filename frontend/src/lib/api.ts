// API client for SupplyWise backend

export interface Product {
  id: number;
  name: string;
  company: string;
  type?: string;
}

export interface ProductsResponse {
  products: Product[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface BomComponent {
  id: number;
  name: string;
  category: string;
}

export interface BomResponse {
  bomId?: number;
  components: BomComponent[];
}

export interface ChatResponse {
  response: string;
  timestamp: string;
}

// Fetch products with pagination and search
export async function getProducts(
  page = 1,
  limit = 20,
  search = ""
): Promise<ProductsResponse> {
  const params = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString(),
  });
  if (search) params.set("search", search);

  const response = await fetch(`/api/products?${params}`);
  if (!response.ok) {
    throw new Error("Failed to fetch products");
  }
  return response.json();
}

// Fetch BOM components for a product
export async function getProductBom(productId: number): Promise<BomResponse> {
  const response = await fetch(`/api/products/${productId}/bom`);
  if (!response.ok) {
    throw new Error("Failed to fetch BOM");
  }
  return response.json();
}

// Send chat message and get AI response
export async function sendChatMessage(
  message: string,
  history: Array<{ role: "user" | "assistant"; content: string }> = []
): Promise<ChatResponse> {
  const response = await fetch("/api/chat/message", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, history }),
  });

  if (!response.ok) {
    throw new Error("Failed to send message");
  }
  return response.json();
}
