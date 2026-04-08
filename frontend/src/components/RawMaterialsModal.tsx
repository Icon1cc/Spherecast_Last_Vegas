import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { X, Loader2 } from "lucide-react";
import type { Product, BomComponent } from "@/lib/api";

interface RawMaterialsModalProps {
  product: Product;
  materials: BomComponent[];
  isLoading?: boolean;
  errorMessage?: string;
  onClose: () => void;
}

const RawMaterialsModal = ({
  product,
  materials,
  isLoading,
  errorMessage,
  onClose,
}: RawMaterialsModalProps) => {
  const navigate = useNavigate();

  const handleAnalysis = useCallback(
    (material: BomComponent) => {
      onClose();
      const params = new URLSearchParams({
        product: product.name,
        material: material.name,
      });
      navigate(`/analysis/${product.id}/${material.id}?${params.toString()}`);
    },
    [navigate, onClose, product.id, product.name]
  );

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div
        className="absolute inset-0 bg-foreground/50 backdrop-blur-sm animate-fade-in"
        onClick={handleBackdropClick}
        aria-hidden="true"
      />
      <div className="relative bg-card rounded-lg shadow-2xl w-full max-w-[600px] mx-4 animate-scale-in">
        <header className="flex items-center justify-between p-5 border-b">
          <h2 id="modal-title" className="text-lg font-bold tracking-tight">
            {product.name} — Raw Materials
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-muted transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </header>
        <div className="p-5">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              <span className="ml-2 text-muted-foreground">Loading materials...</span>
            </div>
          ) : errorMessage ? (
            <div className="text-center py-8 text-destructive">
              {errorMessage}
            </div>
          ) : materials.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No raw materials found for this product.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-3 font-semibold text-muted-foreground w-12">
                    #
                  </th>
                  <th className="text-left py-2 px-3 font-semibold text-muted-foreground">
                    Raw Material
                  </th>
                  <th className="text-center py-2 px-3 font-semibold text-muted-foreground w-28">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {materials.map((material, index) => (
                  <tr key={material.id} className={index % 2 === 1 ? "bg-muted/50" : ""}>
                    <td className="py-2.5 px-3 text-muted-foreground tabular-nums">
                      {index + 1}
                    </td>
                    <td className="py-2.5 px-3 font-medium">{material.name}</td>
                    <td className="py-2.5 px-3 text-center">
                      <button
                        onClick={() => handleAnalysis(material)}
                        className="px-3 py-1 text-xs font-medium bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors hover-lift"
                      >
                        Analysis
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default RawMaterialsModal;
