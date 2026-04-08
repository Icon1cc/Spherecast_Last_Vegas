import { useState } from "react";
import { Search } from "lucide-react";
import Layout from "@/components/Layout";
import ChatIcon from "@/components/ChatIcon";
import ChatPanel from "@/components/ChatPanel";
import RawMaterialsModal from "@/components/RawMaterialsModal";
import { sampleProducts, getRawMaterials, Product } from "@/data/sampleData";

const ITEMS_PER_PAGE = 10;

const Dashboard = () => {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [chatOpen, setChatOpen] = useState(false);

  const filtered = sampleProducts.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.company.toLowerCase().includes(search.toLowerCase())
  );
  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const pageItems = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 py-8 animate-fade-in">
        <h1 className="text-2xl font-bold tracking-tight mb-6">Product Dashboard</h1>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search products or companies..."
            className="w-full pl-10 pr-4 py-2.5 text-sm bg-background border rounded-lg outline-none focus:ring-2 focus:ring-primary/30 transition-shadow"
          />
        </div>

        {/* Table */}
        <div className="bg-card rounded-lg shadow-sm border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left py-3 px-4 font-semibold text-muted-foreground w-12">#</th>
                <th className="text-left py-3 px-4 font-semibold text-muted-foreground">Product Name</th>
                <th className="text-left py-3 px-4 font-semibold text-muted-foreground hidden sm:table-cell">Company</th>
                <th className="text-center py-3 px-4 font-semibold text-muted-foreground w-24">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-muted-foreground">
                    No products found.
                  </td>
                </tr>
              ) : (
                pageItems.map((product, idx) => (
                  <tr
                    key={product.id}
                    className={`border-b last:border-0 transition-colors hover:bg-muted/30 ${
                      idx % 2 === 1 ? "bg-muted/20" : ""
                    }`}
                  >
                    <td className="py-3 px-4 text-muted-foreground">
                      {(page - 1) * ITEMS_PER_PAGE + idx + 1}
                    </td>
                    <td className="py-3 px-4 font-medium">{product.name}</td>
                    <td className="py-3 px-4 text-muted-foreground hidden sm:table-cell">{product.company}</td>
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => setSelectedProduct(product)}
                        className="px-3 py-1 text-xs font-medium border rounded hover:bg-muted transition-colors hover-lift"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-4">
            {Array.from({ length: totalPages }, (_, i) => (
              <button
                key={i}
                onClick={() => setPage(i + 1)}
                className={`w-8 h-8 rounded text-sm font-medium transition-colors ${
                  page === i + 1
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {i + 1}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {selectedProduct && (
        <RawMaterialsModal
          product={selectedProduct}
          materials={getRawMaterials(selectedProduct.id)}
          onClose={() => setSelectedProduct(null)}
        />
      )}

      <ChatIcon onClick={() => setChatOpen(true)} visible={!selectedProduct && !chatOpen} />
      <ChatPanel open={chatOpen} onClose={() => setChatOpen(false)} />
    </Layout>
  );
};

export default Dashboard;
