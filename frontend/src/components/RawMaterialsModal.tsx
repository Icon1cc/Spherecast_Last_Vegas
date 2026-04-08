import { useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import { Product, RawMaterial } from "@/data/sampleData";

interface Props {
  product: Product;
  materials: RawMaterial[];
  onClose: () => void;
}

const RawMaterialsModal = ({ product, materials, onClose }: Props) => {
  const navigate = useNavigate();

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-foreground/50 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      <div className="relative bg-card rounded-lg shadow-2xl w-full max-w-[600px] mx-4 animate-scale-in">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-bold tracking-tight">
            {product.name} — Raw Materials
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-muted transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-3 font-semibold text-muted-foreground w-12">#</th>
                <th className="text-left py-2 px-3 font-semibold text-muted-foreground">Raw Material</th>
                <th className="text-center py-2 px-3 font-semibold text-muted-foreground w-28">Actions</th>
              </tr>
            </thead>
            <tbody>
              {materials.map((mat, idx) => (
                <tr
                  key={mat.id}
                  className={idx % 2 === 1 ? "bg-muted/50" : ""}
                >
                  <td className="py-2.5 px-3 text-muted-foreground">{idx + 1}</td>
                  <td className="py-2.5 px-3 font-medium">{mat.name}</td>
                  <td className="py-2.5 px-3 text-center">
                    <button
                      onClick={() => {
                        onClose();
                        navigate(
                          `/analysis/${product.id}/${mat.id}?product=${encodeURIComponent(product.name)}&material=${encodeURIComponent(mat.name)}`
                        );
                      }}
                      className="px-3 py-1 text-xs font-medium bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors hover-lift"
                    >
                      Analysis
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default RawMaterialsModal;
