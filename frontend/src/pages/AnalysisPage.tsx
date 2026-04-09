import { useState, useMemo, useCallback, useEffect } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Download,
  Save,
  ChevronRight,
  DollarSign,
  Star,
  CheckCircle,
  Link2,
  Clock,
  Loader2,
  AlertCircle,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from "recharts";
import { toast } from "sonner";
import Layout from "@/components/Layout";
import ChatIcon from "@/components/ChatIcon";
import ChatPanel from "@/components/ChatPanel";
import { getComponentAnalysis, type AnalysisWeights, type AnalysisResponse } from "@/lib/api";

const SLIDER_CONFIG = [
  { key: "price", label: "Price Priority", icon: DollarSign },
  { key: "quality", label: "Quality Priority", icon: Star },
  { key: "compliance", label: "Compliance Priority", icon: CheckCircle },
  { key: "consolidation", label: "Supplier Consolidation", icon: Link2 },
  { key: "leadTime", label: "Lead Time Priority", icon: Clock },
] as const;

const DEFAULT_WEIGHTS: AnalysisWeights = {
  price: 5,
  quality: 5,
  compliance: 5,
  consolidation: 5,
  leadTime: 5,
};

const AnalysisPage = () => {
  const { productId, materialId } = useParams<{ productId: string; materialId: string }>();
  const [searchParams] = useSearchParams();
  const productName = searchParams.get("product") ?? "Product";
  const materialName = searchParams.get("material") ?? "Material";

  const [weights, setWeights] = useState<AnalysisWeights>(DEFAULT_WEIGHTS);
  const [chatOpen, setChatOpen] = useState(false);

  const componentId = parseInt(materialId || "0", 10);

  // Fetch analysis from real API
  const {
    data: analysis,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["analysis", componentId, weights],
    queryFn: () => getComponentAnalysis(componentId, weights),
    enabled: componentId > 0,
    staleTime: 30000,
  });

  // Weight keys for slider mapping
  const sliderKeys: (keyof AnalysisWeights)[] = useMemo(
    () => ["price", "quality", "compliance", "consolidation", "leadTime"],
    []
  );

  const sliderValues = useMemo(
    () => sliderKeys.map((key) => weights[key]),
    [weights, sliderKeys]
  );

  const barData = useMemo(() => {
    if (!analysis) return [];
    return [
      {
        name: analysis.recommendedSupplier.name,
        score: Math.round(analysis.recommendedSupplier.score * 100),
      },
      ...analysis.alternatives.map((alt) => ({
        name: alt.name,
        score: Math.round(alt.score * 100),
      })),
    ];
  }, [analysis]);

  const radarData = useMemo(() => {
    if (!analysis) return [];
    return [
      { metric: "Price", value: analysis.metrics.price },
      { metric: "Quality", value: analysis.metrics.quality },
      { metric: "Compliance", value: analysis.metrics.compliance },
      { metric: "Lead Time", value: analysis.metrics.leadTime },
      { metric: "Consolidation", value: analysis.metrics.consolidation },
    ];
  }, [analysis]);

  const updateSlider = useCallback((index: number, value: number) => {
    const keys: (keyof AnalysisWeights)[] = ["price", "quality", "compliance", "consolidation", "leadTime"];
    const key = keys[index];
    setWeights((prev) => ({
      ...prev,
      [key]: value,
    }));
  }, []);

  const handleUpdateAnalysis = useCallback(() => {
    refetch();
    toast.success("Analysis updated with new parameters");
  }, [refetch]);

  const handleDownloadPDF = useCallback(() => {
    toast.success("PDF download started");
  }, []);

  const handleSaveToHistory = useCallback(() => {
    toast.success("Saved to history");
  }, []);

  // Show error state
  if (isError) {
    return (
      <Layout>
        <div className="max-w-5xl mx-auto px-4 py-8">
          <div className="bg-destructive/10 text-destructive rounded-lg p-6 flex items-center gap-3">
            <AlertCircle className="w-6 h-6 shrink-0" />
            <div>
              <h2 className="font-semibold">Failed to load analysis</h2>
              <p className="text-sm mt-1">
                {error instanceof Error ? error.message : "An unexpected error occurred"}
              </p>
            </div>
          </div>
          <Link to="/" className="inline-block mt-4 text-primary hover:underline">
            &larr; Back to Dashboard
          </Link>
        </div>
        <ChatIcon onClick={() => setChatOpen(true)} visible={!chatOpen} />
        <ChatPanel open={chatOpen} onClose={() => setChatOpen(false)} />
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 py-8 animate-fade-in">
        {/* Breadcrumb Navigation */}
        <nav
          className="flex items-center gap-1 text-sm text-muted-foreground mb-6"
          aria-label="Breadcrumb"
        >
          <Link to="/" className="hover:text-foreground transition-colors">
            Dashboard
          </Link>
          <ChevronRight className="w-3 h-3" aria-hidden="true" />
          <span>{productName}</span>
          <ChevronRight className="w-3 h-3" aria-hidden="true" />
          <span className="text-foreground font-medium">{materialName}</span>
        </nav>

        <h1 className="text-2xl font-bold tracking-tight mb-8">
          Analysis: {analysis?.component?.name || materialName}
        </h1>

        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <span className="ml-2 text-muted-foreground">Loading analysis...</span>
          </div>
        )}

        {/* Analysis Content */}
        {analysis && (
          <>
            {/* Recommendation Card */}
            <section className="bg-card border rounded-lg shadow-sm p-6 mb-8">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
                Recommended Supplier
              </h2>
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
                <div>
                  <p className="text-xl font-bold">{analysis.recommendedSupplier.name}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {analysis.recommendedSupplier.reasoning}
                  </p>
                </div>
                <span className="shrink-0 inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-success/10 text-success">
                  {Math.round(analysis.recommendedSupplier.score * 100)}% confidence
                </span>
              </div>
              {analysis.alternatives.length > 0 && (
                <div className="border-t pt-4">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                    Alternative Suppliers ({analysis.supplierCount} total)
                  </h3>
                  <ul className="space-y-2">
                    {analysis.alternatives.map((alt) => (
                      <li key={alt.name} className="flex items-center justify-between text-sm">
                        <div>
                          <span className="font-medium">{alt.name}</span>
                          <span className="text-muted-foreground ml-2 hidden sm:inline">
                            — {alt.reasoning}
                          </span>
                        </div>
                        <span className="text-muted-foreground font-medium">
                          {Math.round(alt.score * 100)}%
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {analysis.supplierCount === 0 && (
                <p className="text-muted-foreground text-sm">
                  No suppliers found for this component in the database.
                </p>
              )}
            </section>

            {/* Charts Grid */}
            {barData.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <section className="bg-card border rounded-lg shadow-sm p-6">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
                    Supplier Comparison
                  </h3>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={barData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="score" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </section>

                <section className="bg-card border rounded-lg shadow-sm p-6">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
                    Quality Metrics
                  </h3>
                  <ResponsiveContainer width="100%" height={250}>
                    <RadarChart data={radarData}>
                      <PolarGrid stroke="hsl(var(--border))" />
                      <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11 }} />
                      <PolarRadiusAxis domain={[0, 10]} tick={{ fontSize: 10 }} />
                      <Radar
                        dataKey="value"
                        stroke="hsl(var(--primary))"
                        fill="hsl(var(--primary))"
                        fillOpacity={0.2}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </section>
              </div>
            )}
          </>
        )}

        {/* Parameter Sliders - Always visible */}
        <section className="bg-card border rounded-lg shadow-sm p-6 mb-8">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-6">
            Adjust Analysis Parameters
          </h3>
          <div className="space-y-5">
            {SLIDER_CONFIG.map(({ key, label, icon: Icon }, index) => (
              <div key={key} className="flex items-center gap-4">
                <Icon className="w-5 h-5 text-muted-foreground shrink-0" aria-hidden="true" />
                <label htmlFor={`slider-${key}`} className="text-sm font-medium w-44 shrink-0">
                  {label}
                </label>
                <input
                  id={`slider-${key}`}
                  type="range"
                  min={1}
                  max={10}
                  value={sliderValues[index]}
                  onChange={(e) => updateSlider(index, parseInt(e.target.value, 10))}
                  className="flex-1 h-2 accent-primary cursor-pointer"
                  aria-valuemin={1}
                  aria-valuemax={10}
                  aria-valuenow={sliderValues[index]}
                />
                <span className="text-sm font-bold w-8 text-right tabular-nums">
                  {sliderValues[index]}
                </span>
              </div>
            ))}
          </div>
          <button
            onClick={handleUpdateAnalysis}
            disabled={isLoading}
            className="mt-6 px-5 py-2.5 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors hover-lift disabled:opacity-50"
          >
            {isLoading ? "Updating..." : "Update Analysis"}
          </button>
        </section>

        {/* Action Buttons */}
        <div className="flex justify-end gap-3">
          <button
            onClick={handleDownloadPDF}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium border rounded-lg hover:bg-muted transition-colors hover-lift"
          >
            <Download className="w-4 h-4" aria-hidden="true" />
            Download PDF
          </button>
          <button
            onClick={handleSaveToHistory}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium border rounded-lg hover:bg-muted transition-colors hover-lift"
          >
            <Save className="w-4 h-4" aria-hidden="true" />
            Save to History
          </button>
        </div>
      </div>

      <ChatIcon onClick={() => setChatOpen(true)} visible={!chatOpen} />
      <ChatPanel open={chatOpen} onClose={() => setChatOpen(false)} />
    </Layout>
  );
};

export default AnalysisPage;
