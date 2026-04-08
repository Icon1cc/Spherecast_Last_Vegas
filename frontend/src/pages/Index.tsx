import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Loader2, AlertCircle } from "lucide-react";
import Layout from "@/components/Layout";
import ChatIcon from "@/components/ChatIcon";
import ChatPanel from "@/components/ChatPanel";
import RawMaterialsModal from "@/components/RawMaterialsModal";
import { getProducts, getProductBom, type Product, type BomComponent } from "@/lib/api";

const ITEMS_PER_PAGE = 10;

const Dashboard = () => {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [chatOpen, setChatOpen] = useState(false);

  // Fetch products from API
  const {
    data: productsData,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["products", page, search],
    queryFn: () => getProducts(page, ITEMS_PER_PAGE, search),
    staleTime: 30000,
  });

  // Fetch BOM when product is selected
  const { data: bomData, isLoading: isBomLoading } = useQuery({
    queryKey: ["bom", selectedProduct?.id],
    queryFn: () => (selectedProduct ? getProductBom(selectedProduct.id) : null),
    enabled: !!selectedProduct,
  });

  const products = productsData?.products ?? [];
  const totalPages = productsData?.pagination.totalPages ?? 1;
  const total = productsData?.pagination.total ?? 0;

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    setPage(1);
  }, []);

  const handleProductSelect = useCallback((product: Product) => {
    setSelectedProduct(product);
  }, []);

  const handleCloseModal = useCallback(() => {
    setSelectedProduct(null);
  }, []);

  const handleOpenChat = useCallback(() => {
    setChatOpen(true);
  }, []);

  const handleCloseChat = useCallback(() => {
    setChatOpen(false);
  }, []);

  const isModalOpen = selectedProduct !== null;
  const showChatIcon = !isModalOpen && !chatOpen;

  const materials: BomComponent[] = bomData?.components ?? [];

  return (
    <Layout>
      <main className="max-w-5xl mx-auto px-4 py-8 animate-fade-in">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Product Dashboard</h1>
          {!isLoading && (
            <span className="text-sm text-muted-foreground">{total} products</span>
          )}
        </div>

        {/* Search Input */}
        <div className="relative mb-4">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search products or companies..."
            className="w-full pl-10 pr-4 py-2.5 text-sm bg-background border rounded-lg outline-none focus:ring-2 focus:ring-primary/30 transition-shadow"
            aria-label="Search products"
          />
        </div>

        {/* Error State */}
        {isError && (
          <div className="bg-destructive/10 text-destructive rounded-lg p-4 mb-4 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{error instanceof Error ? error.message : "Failed to load products"}</span>
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <span className="ml-2 text-muted-foreground">Loading products...</span>
          </div>
        )}

        {/* Products Table */}
        {!isLoading && (
          <div className="bg-card rounded-lg shadow-sm border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left py-3 px-4 font-semibold text-muted-foreground w-12">
                    #
                  </th>
                  <th className="text-left py-3 px-4 font-semibold text-muted-foreground">
                    Product Name
                  </th>
                  <th className="text-left py-3 px-4 font-semibold text-muted-foreground hidden sm:table-cell">
                    Company
                  </th>
                  <th className="text-center py-3 px-4 font-semibold text-muted-foreground w-24">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {products.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-12 text-center text-muted-foreground">
                      No products found.
                    </td>
                  </tr>
                ) : (
                  products.map((product, index) => {
                    const serialNumber = (page - 1) * ITEMS_PER_PAGE + index + 1;
                    const isOddRow = index % 2 === 1;

                    return (
                      <tr
                        key={product.id}
                        className={`border-b last:border-0 transition-colors hover:bg-muted/30 ${
                          isOddRow ? "bg-muted/20" : ""
                        }`}
                      >
                        <td className="py-3 px-4 text-muted-foreground tabular-nums">
                          {serialNumber}
                        </td>
                        <td className="py-3 px-4 font-medium">{product.name}</td>
                        <td className="py-3 px-4 text-muted-foreground hidden sm:table-cell">
                          {product.company}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <button
                            onClick={() => handleProductSelect(product)}
                            className="px-3 py-1 text-xs font-medium border rounded hover:bg-muted transition-colors hover-lift"
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <nav className="flex items-center justify-center gap-2 mt-4" aria-label="Pagination">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 text-sm border rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-muted"
            >
              Prev
            </button>
            <span className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1 text-sm border rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-muted"
            >
              Next
            </button>
          </nav>
        )}
      </main>

      {/* Raw Materials Modal */}
      {isModalOpen && (
        <RawMaterialsModal
          product={selectedProduct}
          materials={materials}
          isLoading={isBomLoading}
          onClose={handleCloseModal}
        />
      )}

      <ChatIcon onClick={handleOpenChat} visible={showChatIcon} />
      <ChatPanel open={chatOpen} onClose={handleCloseChat} />
    </Layout>
  );
};

export default Dashboard;
