import { useState, useMemo } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Download, Save, ChevronRight } from "lucide-react";
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
import Layout from "@/components/Layout";
import ChatIcon from "@/components/ChatIcon";
import ChatPanel from "@/components/ChatPanel";
import { generateAnalysis } from "@/data/sampleData";
import { toast } from "sonner";

const sliderLabels = [
  { label: "Price Priority", icon: "💰" },
  { label: "Quality Priority", icon: "⭐" },
  { label: "Compliance Priority", icon: "✓" },
  { label: "Supplier Consolidation", icon: "🔗" },
  { label: "Lead Time Priority", icon: "⏱️" },
];

const AnalysisPage = () => {
  const [searchParams] = useSearchParams();
  const productName = searchParams.get("product") || "Product";
  const materialName = searchParams.get("material") || "Material";

  const [sliders, setSliders] = useState([5, 5, 5, 5, 5]);
  const [chatOpen, setChatOpen] = useState(false);

  const analysis = useMemo(() => generateAnalysis(sliders), [sliders]);

  const barData = [
    { name: analysis.recommendedSupplier.name, score: +(analysis.recommendedSupplier.score * 100).toFixed(0) },
    ...analysis.alternatives.map((a) => ({
      name: a.name,
      score: +(a.score * 100).toFixed(0),
    })),
  ];

  const radarData = [
    { metric: "Price", value: analysis.metrics.price },
    { metric: "Quality", value: analysis.metrics.quality },
    { metric: "Compliance", value: analysis.metrics.compliance },
    { metric: "Lead Time", value: analysis.metrics.leadTime },
    { metric: "Consolidation", value: analysis.metrics.consolidation },
  ];

  const updateSlider = (index: number, value: number) => {
    setSliders((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 py-8 animate-fade-in">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1 text-sm text-muted-foreground mb-6">
          <Link to="/" className="hover:text-foreground transition-colors">Dashboard</Link>
          <ChevronRight className="w-3 h-3" />
          <span>{productName}</span>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground font-medium">{materialName}</span>
        </nav>

        <h1 className="text-2xl font-bold tracking-tight mb-8">
          Analysis: {materialName}
        </h1>

        {/* Recommendation Card */}
        <div className="bg-card border rounded-lg shadow-sm p-6 mb-8">
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
              {(analysis.recommendedSupplier.score * 100).toFixed(0)}% confidence
            </span>
          </div>
          <div className="border-t pt-4">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Alternative Suppliers
            </h3>
            <div className="space-y-2">
              {analysis.alternatives.map((alt) => (
                <div key={alt.name} className="flex items-center justify-between text-sm">
                  <div>
                    <span className="font-medium">{alt.name}</span>
                    <span className="text-muted-foreground ml-2 hidden sm:inline">— {alt.reasoning}</span>
                  </div>
                  <span className="text-muted-foreground font-medium">
                    {(alt.score * 100).toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="bg-card border rounded-lg shadow-sm p-6">
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
          </div>
          <div className="bg-card border rounded-lg shadow-sm p-6">
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
          </div>
        </div>

        {/* Sliders */}
        <div className="bg-card border rounded-lg shadow-sm p-6 mb-8">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-6">
            Adjust Analysis Parameters
          </h3>
          <div className="space-y-5">
            {sliderLabels.map((s, i) => (
              <div key={s.label} className="flex items-center gap-4">
                <span className="text-lg w-6 text-center">{s.icon}</span>
                <span className="text-sm font-medium w-44 shrink-0">{s.label}</span>
                <input
                  type="range"
                  min={1}
                  max={10}
                  value={sliders[i]}
                  onChange={(e) => updateSlider(i, parseInt(e.target.value))}
                  className="flex-1 h-2 accent-primary cursor-pointer"
                />
                <span className="text-sm font-bold w-8 text-right tabular-nums">
                  {sliders[i]}
                </span>
              </div>
            ))}
          </div>
          <button
            onClick={() => toast.success("Analysis updated with new parameters")}
            className="mt-6 px-5 py-2.5 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors hover-lift"
          >
            Update Analysis
          </button>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button
            onClick={() => toast.success("PDF download started")}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium border rounded-lg hover:bg-muted transition-colors hover-lift"
          >
            <Download className="w-4 h-4" /> Download PDF
          </button>
          <button
            onClick={() => toast.success("Saved to history")}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium border rounded-lg hover:bg-muted transition-colors hover-lift"
          >
            <Save className="w-4 h-4" /> Save to History
          </button>
        </div>
      </div>

      <ChatIcon onClick={() => setChatOpen(true)} visible={!chatOpen} />
      <ChatPanel open={chatOpen} onClose={() => setChatOpen(false)} />
    </Layout>
  );
};

export default AnalysisPage;
