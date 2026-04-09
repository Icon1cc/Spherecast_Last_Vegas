import { useState, useMemo, useCallback } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Download,
  Save,
  ChevronRight,
  DollarSign,
  ShieldCheck,
  Award,
  AlertTriangle,
  Beaker,
  Loader2,
  AlertCircle,
  CheckCircle,
  XCircle,
  HelpCircle,
  ExternalLink,
  FileText,
  BookOpen,
  ShoppingCart,
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
import { getComponentAnalysis, getSubstitutionCandidates, type AnalysisWeights, type AnalysisResponse, type SubstitutionResponse, type SubstitutionTier1 } from "@/lib/api";

const SLIDER_CONFIG = [
  { key: "price",        label: "Price / Cost",            icon: DollarSign,   tooltip: "Favour lower-cost suppliers and ingredients" },
  { key: "regulatory",  label: "Regulatory Compliance",   icon: ShieldCheck,  tooltip: "Weight EU/US market permit status" },
  { key: "certFit",     label: "Certification Fit",        icon: Award,        tooltip: "Vegan, halal, kosher, non-GMO, organic match" },
  { key: "supplyRisk",  label: "Supply Risk",              icon: AlertTriangle,tooltip: "Single-manufacturer, patent-lock, geographic diversity" },
  { key: "functionalFit", label: "Functional Fit",         icon: Beaker,       tooltip: "Same functional role and bioequivalence" },
] as const;

const DEFAULT_WEIGHTS: AnalysisWeights = {
  price: 5,
  regulatory: 5,
  certFit: 5,
  supplyRisk: 5,
  functionalFit: 5,
};

function ComplianceBadge({ value }: { value: string | null | undefined }) {
  if (!value || value === "unknown") return <span className="text-muted-foreground text-xs">—</span>;
  if (value === "yes" || value === "permitted" || value === "certified" || value === "compliant")
    return <span className="inline-flex items-center gap-1 text-xs text-green-600"><CheckCircle className="w-3 h-3" />{value}</span>;
  if (value === "no" || value === "banned" || value === "non_compliant")
    return <span className="inline-flex items-center gap-1 text-xs text-red-500"><XCircle className="w-3 h-3" />{value}</span>;
  return <span className="inline-flex items-center gap-1 text-xs text-yellow-600"><HelpCircle className="w-3 h-3" />{value}</span>;
}

function ExternalLinkButton({ href, label, icon: Icon }: { href: string | null | undefined; label: string; icon: React.ElementType }) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded border border-border hover:bg-muted transition-colors"
    >
      <Icon className="w-3 h-3" />
      {label}
    </a>
  );
}

function wrapXAxisLabel(text: string, maxCharsPerLine = 14, maxLines = 3): string[] {
  const normalized = text.trim();
  if (!normalized) return [MISSING_INFO_TEXT];

  const words = normalized.split(/\s+/);
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (candidate.length <= maxCharsPerLine) {
      currentLine = candidate;
      continue;
    }

    if (currentLine) lines.push(currentLine);
    currentLine = word;

    if (lines.length >= maxLines - 1) break;
  }

  if (currentLine && lines.length < maxLines) {
    lines.push(currentLine);
  }

  if (lines.length === 0) return [normalized];
  if (words.join(" ").length > lines.join(" ").length && lines.length === maxLines) {
    lines[maxLines - 1] = `${lines[maxLines - 1]}...`;
  }

  return lines;
}

function SupplierAxisTick({
  x = 0,
  y = 0,
  payload,
}: {
  x?: number;
  y?: number;
  payload?: { value?: string };
}) {
  const labelLines = wrapXAxisLabel(String(payload?.value ?? ""));

  return (
    <g transform={`translate(${x},${y})`}>
      <text
        x={0}
        y={10}
        textAnchor="middle"
        fill="hsl(var(--muted-foreground))"
        fontSize={11}
      >
        {labelLines.map((line, index) => (
          <tspan key={`${line}-${index}`} x={0} dy={index === 0 ? 0 : 12}>
            {line}
          </tspan>
        ))}
      </text>
    </g>
  );
}

const AnalysisPage = () => {
  const { productId, materialId } = useParams<{ productId: string; materialId: string }>();
  const [searchParams] = useSearchParams();
  const productName = searchParams.get("product") ?? "Product";
  const materialName = searchParams.get("material") ?? "Material";

  const [weights, setWeights] = useState<AnalysisWeights>(DEFAULT_WEIGHTS);
  const [chatOpen, setChatOpen] = useState(false);
  const [chosenSubstitute, setChosenSubstitute] = useState<{ name: string; tier: number } | null>(null);
  const [expandedRefs, setExpandedRefs] = useState(false);

  const componentId = parseInt(materialId || "0", 10);

  // Fetch supplier analysis from real API
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

  // Fetch substitution candidates (separate query, weights passed for AI ranking)
  const {
    data: substitution,
    isLoading: subLoading,
    isError: subError,
    error: subErrorMsg,
  } = useQuery<SubstitutionResponse>({
    queryKey: ["substitution", componentId, weights],
    queryFn: () => getSubstitutionCandidates(componentId, weights),
    enabled: componentId > 0,
    staleTime: 60000,
    retry: 1,
  });

  // Weight keys for slider mapping
  const sliderKeys: (keyof AnalysisWeights)[] = useMemo(
    () => ["price", "regulatory", "certFit", "supplyRisk", "functionalFit"],
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
      { metric: "Price",        value: analysis.metrics.price },
      { metric: "Regulatory",   value: analysis.metrics.regulatory },
      { metric: "Cert Fit",     value: analysis.metrics.certFit },
      { metric: "Supply Risk",  value: analysis.metrics.supplyRisk },
      { metric: "Funct. Fit",   value: analysis.metrics.functionalFit },
    ];
  }, [analysis]);

  const updateSlider = useCallback((index: number, value: number) => {
    const keys: (keyof AnalysisWeights)[] = ["price", "regulatory", "certFit", "supplyRisk", "functionalFit"];
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

  const handleChooseSubstitute = useCallback((name: string, tier: number) => {
    setChosenSubstitute({ name, tier });
    toast.success(`Substitute selected: ${name}`);
  }, []);

  const handleDownloadPDF = useCallback(() => {
    toast.success("PDF download started");
  }, []);

  const handleSaveToHistory = useCallback(() => {
    toast.success("Saved to history");
  }, []);

  const allRefs = useMemo(() => {
    if (!substitution?.tier1) return [];
    return substitution.tier1.flatMap(r => r.refs ?? []);
  }, [substitution]);

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
                      <XAxis
                        dataKey="name"
                        interval={0}
                        minTickGap={0}
                        height={64}
                        tickMargin={8}
                        tick={<SupplierAxisTick />}
                      />
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

        {/* Chosen substitute banner */}
        {chosenSubstitute && (
          <div className="flex items-center gap-3 bg-green-50 border border-green-200 text-green-800 rounded-lg px-4 py-3 mb-6 text-sm font-medium">
            <CheckCircle className="w-4 h-4 shrink-0" />
            <span>Selected substitute (Tier {chosenSubstitute.tier}): <strong>{chosenSubstitute.name}</strong></span>
            <button
              onClick={() => setChosenSubstitute(null)}
              className="ml-auto text-green-600 hover:text-green-800 text-xs underline"
            >
              Clear
            </button>
          </div>
        )}

        {/* Substitution Candidates */}
        {subError && (
          <div className="flex items-center gap-3 bg-destructive/10 text-destructive rounded-lg px-4 py-3 mb-6 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>Substitution API error: {subErrorMsg instanceof Error ? subErrorMsg.message : "Unknown error"}</span>
          </div>
        )}

        {subLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading substitution candidates...
          </div>
        )}

        {substitution && (
          <section className="mb-8 space-y-6">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Substitution Candidates
            </h2>

            {/* Compliance Profile */}
            {substitution.complianceProfile && substitution.component.cas_number && (
              <div className="bg-muted/40 rounded-lg p-4 space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  <div><span className="text-muted-foreground text-xs block mb-1">Vegan</span><ComplianceBadge value={substitution.complianceProfile.vegan_status} /></div>
                  <div><span className="text-muted-foreground text-xs block mb-1">Halal</span><ComplianceBadge value={substitution.complianceProfile.halal_status} /></div>
                  <div><span className="text-muted-foreground text-xs block mb-1">Non-GMO</span><ComplianceBadge value={substitution.complianceProfile.non_gmo_status} /></div>
                  <div><span className="text-muted-foreground text-xs block mb-1">Organic</span><ComplianceBadge value={substitution.complianceProfile.organic_status} /></div>
                  <div><span className="text-muted-foreground text-xs block mb-1">EU Market</span><ComplianceBadge value={substitution.complianceProfile.market_ban_eu} /></div>
                  <div><span className="text-muted-foreground text-xs block mb-1">US Market</span><ComplianceBadge value={substitution.complianceProfile.market_ban_us} /></div>
                  <div><span className="text-muted-foreground text-xs block mb-1">Kosher</span><ComplianceBadge value={substitution.complianceProfile.kosher_status} /></div>
                  <div><span className="text-muted-foreground text-xs block mb-1">Patent Lock</span><ComplianceBadge value={substitution.complianceProfile.patent_lock === "yes" ? "no" : substitution.complianceProfile.patent_lock === "no" ? "yes" : substitution.complianceProfile.patent_lock} /></div>
                </div>
                {substitution.complianceProfile.label_form_claim && (
                  <p className="text-xs text-muted-foreground border-t pt-2">
                    <span className="font-medium text-foreground">Label claim: </span>
                    {substitution.complianceProfile.label_form_claim}
                  </p>
                )}
                {Array.isArray(substitution.complianceProfile.allergen_flags) && substitution.complianceProfile.allergen_flags.length > 0 && (
                  <div className="flex flex-wrap gap-1 border-t pt-2">
                    <span className="text-xs text-muted-foreground mr-1">Allergens:</span>
                    {substitution.complianceProfile.allergen_flags.map((flag) => (
                      <span key={flag} className="inline-block px-2 py-0.5 text-xs rounded-full bg-orange-100 text-orange-700 font-medium">{flag}</span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {!substitution.component.cas_number && (
              <p className="text-sm text-muted-foreground italic">
                No enrichment data yet for this ingredient — run the Agnes enrichment loop to enable substitution analysis.
              </p>
            )}

            {/* Tier 1 */}
            {substitution.tier1.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                  Tier 1 — Same Molecule, Alternative Suppliers
                </h3>
                {/* Static rationale — TODO: replace with per-row Gemini reasoning comparing price, certs, supply risk across suppliers */}
                <p className="text-xs text-muted-foreground mb-2">
                  Identical active compound
                  {substitution.component.cas_number ? ` (CAS ${substitution.component.cas_number})` : ""}
                  {substitution.component.canonical_name ? ` · ${substitution.component.canonical_name}` : ""}.
                  Drop-in replacement — no reformulation or label change required.
                </p>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left px-4 py-2 font-medium">Supplier</th>
                        <th className="text-left px-4 py-2 font-medium hidden md:table-cell">Country</th>
                        <th className="text-left px-4 py-2 font-medium">Price/unit</th>
                        <th className="text-left px-4 py-2 font-medium hidden sm:table-cell">Links</th>
                        <th className="text-left px-4 py-2 font-medium">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {substitution.tier1.map((r: SubstitutionTier1, i: number) => {
                        const isChosen = chosenSubstitute?.name === r.supplier_name && chosenSubstitute?.tier === 1;
                        return (
                          <tr key={r.supplier_id} className={i % 2 === 0 ? "" : "bg-muted/20"}>
                            <td className="px-4 py-2">
                              <div className="font-medium">{r.supplier_name}</div>
                              {r.certifications && Object.keys(r.certifications).length > 0 && (
                                <div className="text-xs text-muted-foreground mt-0.5">
                                  {Object.entries(r.certifications).map(([k, v]) => `${k}: ${v}`).join(" · ")}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-2 text-muted-foreground hidden md:table-cell">
                              {r.country ?? "—"}{r.region ? `, ${r.region}` : ""}
                            </td>
                            <td className="px-4 py-2">
                              {r.price_per_unit != null
                                ? <span className="font-medium">{r.price_currency ?? "$"}{r.price_per_unit}{r.price_unit ? `/${r.price_unit}` : "/unit"}</span>
                                : <span className="text-muted-foreground">—</span>}
                              {r.price_moq && <div className="text-xs text-muted-foreground">MOQ: {r.price_moq}</div>}
                            </td>
                            <td className="px-4 py-2 hidden sm:table-cell">
                              <div className="flex flex-wrap gap-1">
                                <ExternalLinkButton href={r.sup_url} label="Website" icon={ExternalLink} />
                                <ExternalLinkButton href={r.product_page_url} label="Product" icon={ShoppingCart} />
                                <ExternalLinkButton href={r.spec_sheet_url} label="Spec Sheet" icon={FileText} />
                              </div>
                            </td>
                            <td className="px-4 py-2">
                              <button
                                onClick={() => handleChooseSubstitute(r.supplier_name, 1)}
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                                  isChosen
                                    ? "bg-green-100 text-green-700 ring-1 ring-green-400"
                                    : "bg-primary/10 text-primary hover:bg-primary/20"
                                }`}
                              >
                                {isChosen ? <CheckCircle className="w-3 h-3" /> : <ShoppingCart className="w-3 h-3" />}
                                {isChosen ? "Selected" : "Choose"}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Sources / Refs */}
                {allRefs.length > 0 && (
                  <div className="mt-3 border rounded-lg overflow-hidden">
                    <button
                      onClick={() => setExpandedRefs(v => !v)}
                      className="w-full flex items-center gap-2 px-4 py-2.5 bg-muted/30 hover:bg-muted/50 transition-colors text-sm font-medium text-left"
                    >
                      <BookOpen className="w-3.5 h-3.5 text-muted-foreground" />
                      Sources ({allRefs.length})
                      <span className="ml-auto text-muted-foreground text-xs">{expandedRefs ? "▲" : "▼"}</span>
                    </button>
                    {expandedRefs && (
                      <ul className="divide-y divide-border">
                        {allRefs.map((ref, i) => (
                          <li key={i} className="px-4 py-2 text-xs flex items-start gap-2">
                            <ExternalLink className="w-3 h-3 mt-0.5 shrink-0 text-muted-foreground" />
                            <a
                              href={ref.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline break-all"
                            >
                              {ref.note || ref.url}
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Tier 2 */}
            {substitution.tier2.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                  Tier 2 — Same Function, Compliance-Compatible
                </h3>
                {/* Static rationale — TODO: replace with Gemini-generated per-row reasoning evaluating bioequivalence, label impact, cost delta */}
                <p className="text-xs text-muted-foreground mb-2">
                  Different molecule, same functional role
                  {substitution.component.functional_role ? ` (${substitution.component.functional_role})` : ""}.
                  Each candidate matches the compliance profile of the current ingredient — verify bioequivalence and dosage before switching.
                </p>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left px-4 py-2 font-medium">Ingredient</th>
                        <th className="text-left px-4 py-2 font-medium hidden sm:table-cell">CAS</th>
                        <th className="text-left px-4 py-2 font-medium">Supplier</th>
                        <th className="text-left px-4 py-2 font-medium hidden md:table-cell">Country</th>
                        <th className="text-left px-4 py-2 font-medium">Vegan</th>
                        <th className="text-left px-4 py-2 font-medium">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {substitution.tier2.map((r, i) => {
                        const isChosen = chosenSubstitute?.name === r.canonical_name && chosenSubstitute?.tier === 2;
                        return (
                          <tr key={`${r.cas_number}-${r.supplier_id}`} className={i % 2 === 0 ? "" : "bg-muted/20"}>
                            <td className="px-4 py-2 font-medium">{r.canonical_name}</td>
                            <td className="px-4 py-2 text-muted-foreground text-xs hidden sm:table-cell font-mono">{r.cas_number}</td>
                            <td className="px-4 py-2">{r.supplier_name}</td>
                            <td className="px-4 py-2 text-muted-foreground hidden md:table-cell">{r.country ?? "—"}</td>
                            <td className="px-4 py-2"><ComplianceBadge value={r.vegan_status} /></td>
                            <td className="px-4 py-2">
                              <button
                                onClick={() => handleChooseSubstitute(r.canonical_name, 2)}
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                                  isChosen
                                    ? "bg-green-100 text-green-700 ring-1 ring-green-400"
                                    : "bg-primary/10 text-primary hover:bg-primary/20"
                                }`}
                              >
                                {isChosen ? <CheckCircle className="w-3 h-3" /> : <ShoppingCart className="w-3 h-3" />}
                                {isChosen ? "Selected" : "Choose"}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* AI Recommendation Reasoning Trace */}
            {substitution.aiRecommendation && (
              <div className="bg-card border rounded-lg shadow-sm p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                    AI Recommendation
                  </h3>
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-primary/10 text-primary">
                    Tier {substitution.aiRecommendation.tier} · {Math.round(substitution.aiRecommendation.confidence * 100)}% confidence
                  </span>
                </div>
                <div className="flex items-start justify-between gap-4 mb-5">
                  <p className="text-lg font-bold">{substitution.aiRecommendation.recommendation}</p>
                  <button
                    onClick={() => handleChooseSubstitute(substitution.aiRecommendation!.recommendation, substitution.aiRecommendation!.tier)}
                    className={`shrink-0 inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                      chosenSubstitute?.name === substitution.aiRecommendation.recommendation
                        ? "bg-green-100 text-green-700 ring-1 ring-green-400"
                        : "bg-primary text-primary-foreground hover:bg-primary/90"
                    }`}
                  >
                    {chosenSubstitute?.name === substitution.aiRecommendation.recommendation
                      ? <><CheckCircle className="w-4 h-4" /> Selected</>
                      : <><ShoppingCart className="w-4 h-4" /> Choose as Substitute</>}
                  </button>
                </div>
                <div className="space-y-3 border-t pt-4">
                  {[
                    { label: "Functional Equivalence", key: "functional_equivalence" as const },
                    { label: "Compliance Fit",         key: "compliance_fit" as const },
                    { label: "Supply Risk",            key: "supply_risk" as const },
                    { label: "Cost Impact",            key: "cost_impact" as const },
                  ].map(({ label, key }) => {
                    const text = substitution.aiRecommendation!.reasoning[key];
                    if (!text) return null;
                    return (
                      <div key={key} className="flex gap-3 text-sm">
                        <span className="font-semibold text-muted-foreground w-44 shrink-0">{label}</span>
                        <span>{text}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
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
