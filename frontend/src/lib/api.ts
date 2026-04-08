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

async function buildApiError(response: Response, fallbackMessage: string): Promise<Error> {
  try {
    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const payload = await response.json();
      const error = typeof payload?.error === "string" ? payload.error : "";
      const details = typeof payload?.details === "string" ? payload.details : "";
      const message = [error, details].filter(Boolean).join(": ").trim();
      return new Error(message ? `${fallbackMessage}: ${message}` : fallbackMessage);
    }

    const text = (await response.text()).trim();
    return new Error(text ? `${fallbackMessage}: ${text}` : fallbackMessage);
  } catch {
    return new Error(fallbackMessage);
  }
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
    throw await buildApiError(response, "Failed to fetch products");
  }
  return response.json();
}

// Fetch BOM components for a product
export async function getProductBom(productId: number): Promise<BomResponse> {
  const response = await fetch(`/api/products/bom?id=${productId}`);
  if (!response.ok) {
    throw await buildApiError(response, "Failed to fetch BOM");
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
    throw await buildApiError(response, "Failed to send message");
  }
  return response.json();
}
