import { useState, useCallback } from "react";
import { Search } from "lucide-react";
import Layout from "@/components/Layout";
import ChatIcon from "@/components/ChatIcon";
import ChatPanel from "@/components/ChatPanel";
import RawMaterialsModal from "@/components/RawMaterialsModal";
import { sampleProducts, getRawMaterials } from "@/data/sampleData";
import type { Product } from "@/data/sampleData";

const ITEMS_PER_PAGE = 10;

const Dashboard = () => {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [chatOpen, setChatOpen] = useState(false);

  const filteredProducts = sampleProducts.filter(
    (product) =>
      product.name.toLowerCase().includes(search.toLowerCase()) ||
      product.company.toLowerCase().includes(search.toLowerCase())
  );

  const totalPages = Math.ceil(filteredProducts.length / ITEMS_PER_PAGE);
  const paginatedProducts = filteredProducts.slice(
    (page - 1) * ITEMS_PER_PAGE,
    page * ITEMS_PER_PAGE
  );

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

  return (
    <Layout>
      <main className="max-w-5xl mx-auto px-4 py-8 animate-fade-in">
        <h1 className="text-2xl font-bold tracking-tight mb-6">Product Dashboard</h1>

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

        {/* Products Table */}
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
              {paginatedProducts.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-muted-foreground">
                    No products found.
                  </td>
                </tr>
              ) : (
                paginatedProducts.map((product, index) => {
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

        {/* Pagination */}
        {totalPages > 1 && (
          <nav className="flex items-center justify-center gap-2 mt-4" aria-label="Pagination">
            {Array.from({ length: totalPages }, (_, i) => {
              const pageNumber = i + 1;
              const isActive = page === pageNumber;

              return (
                <button
                  key={pageNumber}
                  onClick={() => setPage(pageNumber)}
                  className={`w-8 h-8 rounded text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                  aria-current={isActive ? "page" : undefined}
                  aria-label={`Page ${pageNumber}`}
                >
                  {pageNumber}
                </button>
              );
            })}
          </nav>
        )}
      </main>

      {/* Raw Materials Modal */}
      {isModalOpen && (
        <RawMaterialsModal
          product={selectedProduct}
          materials={getRawMaterials(selectedProduct.id)}
          onClose={handleCloseModal}
        />
      )}

      <ChatIcon onClick={handleOpenChat} visible={showChatIcon} />
      <ChatPanel open={chatOpen} onClose={handleCloseChat} />
    </Layout>
  );
};

export default Dashboard;
