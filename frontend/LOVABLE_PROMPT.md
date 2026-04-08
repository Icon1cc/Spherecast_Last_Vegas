# Lovable UI Build Prompt

## Project Overview

Build a modern, responsive web application for "Agnes" - an AI-powered raw material sourcing recommendation system for the dietary supplements industry. The app helps procurement teams identify substitution opportunities, check compliance, and optimize supplier relationships.

---

## Design Requirements

### Visual Style
- **Theme**: Professional, clean, modern SaaS aesthetic
- **Primary Color**: Deep blue (#1a365d) - conveys trust and professionalism
- **Accent Color**: Teal/cyan (#0d9488) - represents AI/intelligence
- **Background**: Light gray (#f8fafc) with white cards
- **Typography**: Inter or similar clean sans-serif font
- **Icons**: Lucide React icons

### Responsiveness
- **Mobile-first design**
- Breakpoints:
  - Mobile: < 640px (single column, collapsible menus)
  - Tablet: 640px - 1024px (two columns where appropriate)
  - Desktop: > 1024px (full sidebar + main content)
- Touch-friendly targets (min 44px)
- Responsive charts that resize gracefully

---

## Pages and Components

### 1. Dashboard Page (/)

**Purpose**: Overview of the entire system at a glance

**Layout**:
```
┌─────────────────────────────────────────────────────────────┐
│  Header: Agnes Logo | Search | User Avatar                  │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────┐                                               │
│  │ Sidebar  │  Main Content Area                            │
│  │          │  ┌─────────┬─────────┬─────────┬─────────┐   │
│  │ Dashboard│  │  BOMs   │ Raw Mat │Suppliers│ Pending │   │
│  │ BOMs     │  │   149   │   876   │   40    │ Reviews │   │
│  │ Analysis │  │         │         │         │    5    │   │
│  │ Reports  │  └─────────┴─────────┴─────────┴─────────┘   │
│  │ Settings │                                               │
│  │          │  ┌─────────────────┬─────────────────────┐   │
│  └──────────┘  │ Recent BOMs     │ Top Suppliers Chart │   │
│                │ (list with      │ (horizontal bar)    │   │
│                │  actions)       │                     │   │
│                └─────────────────┴─────────────────────┘   │
│                                                             │
│                ┌───────────────────────────────────────┐   │
│                │ Recent Recommendations (table)        │   │
│                └───────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

**Components**:
- Stat cards with icons (animated count-up on load)
- Recent BOMs list with company badges
- Top Suppliers horizontal bar chart
- Recent recommendations table with status badges

---

### 2. BOM List Page (/boms)

**Purpose**: Browse and search all Bills of Materials

**Features**:
- Search bar with filters (company, component count range)
- Grid or list toggle view
- Sortable columns (Company, SKU, Component Count)
- Click to view BOM detail

**Each BOM Card shows**:
- Product SKU
- Company name (with colored badge)
- Component count
- "Analyze" button

---

### 3. BOM Detail Page (/boms/:id)

**Purpose**: Deep dive into a single BOM

**Layout**:
```
┌─────────────────────────────────────────────────────────────┐
│  ← Back to BOMs    FG-iherb-10421 | NOW Foods               │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────┬───────────────────────────────┐   │
│  │ Component Breakdown │  Component List               │   │
│  │ (Pie/Donut Chart)   │  ┌─────────────────────────┐  │   │
│  │                     │  │ □ Vitamin D3            │  │   │
│  │ • Vitamins: 4       │  │   Suppliers: A, B       │  │   │
│  │ • Capsules: 1       │  │   Category: Vitamin     │  │   │
│  │ • Excipients: 2     │  ├─────────────────────────┤  │   │
│  │                     │  │ □ Gelatin Capsule       │  │   │
│  └─────────────────────┘  │   Suppliers: C          │  │   │
│                           │   Category: Capsule     │  │   │
│                           └─────────────────────────┘  │   │
│                                                            │
│  ┌────────────────────────────────────────────────────┐   │
│  │         [ Run Analysis ]  (Primary CTA Button)     │   │
│  └────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

**Components**:
- Donut chart showing component category breakdown
- Component list with checkboxes for selection
- Expandable component details
- "Run Analysis" CTA button

---

### 4. Analysis Results Page (/analysis/:id)

**Purpose**: Show substitution analysis results

**Layout**:
```
┌─────────────────────────────────────────────────────────────┐
│  Analysis Results for FG-iherb-10421                        │
│  Score: ████████░░ 78%          Status: ✓ Complete         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  📊 Summary                                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Identified 2 substitution opportunities...          │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  🔄 Recommended Changes                                     │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Vitamin D3 (Supplier A) → Vitamin D3 (Supplier B)   │   │
│  │ Confidence: ████████░░ 85%                          │   │
│  │ Rationale: Same active ingredient...                │   │
│  │ Evidence: [FDA GRAS] [Spec Sheet]                   │   │
│  │ ┌─────────┐ ┌─────────┐                             │   │
│  │ │ Approve │ │ Reject  │                             │   │
│  │ └─────────┘ └─────────┘                             │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ⚠️ Risks                        🔍 Needs Review           │
│  • Verify bioavailability...     • Pricing negotiation     │
│                                                             │
│  📋 Next Steps                                              │
│  □ Request COA from suppliers                              │
│  □ Conduct stability study                                 │
└─────────────────────────────────────────────────────────────┘
```

**Components**:
- Overall score with progress bar
- Summary card
- Recommendation cards with:
  - Before → After component names
  - Confidence progress bar (color-coded: green >80%, yellow 60-80%, red <60%)
  - Expandable rationale
  - Evidence link chips
  - Approve/Reject action buttons
- Collapsible sections for Risks, Needs Review, Next Steps
- Checklist for next steps

---

### 5. Suppliers Page (/suppliers)

**Purpose**: Browse suppliers and their coverage

**Features**:
- Supplier list with product count
- Click to expand and see which products
- Filter by category (vitamins, minerals, etc.)
- Horizontal bar chart of top suppliers

---

## API Integration

### Base URL
```
const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8000/api'
```

### Endpoints to integrate:

```typescript
// Dashboard stats
GET /api/dashboard/stats
Response: { total_companies, total_boms, total_raw_materials, total_suppliers, top_suppliers[] }

// List BOMs
GET /api/boms?company_id={id}&limit={n}
Response: BOMSummary[]

// BOM Detail
GET /api/boms/{id}
Response: BOMDetail

// Component categories (for chart)
GET /api/boms/{id}/components/categories
Response: { labels: string[], values: number[], total: number }

// Get recommendation
GET /api/recommendations/{bom_id}
Response: SourcingRecommendation

// List companies
GET /api/companies
Response: Company[]

// List suppliers
GET /api/suppliers
Response: Supplier[]
```

---

## State Management

Use React Query (TanStack Query) for:
- Caching API responses
- Loading states
- Error handling
- Optimistic updates

Example:
```typescript
const { data: boms, isLoading } = useQuery({
  queryKey: ['boms'],
  queryFn: () => fetch('/api/boms').then(r => r.json())
})
```

---

## Charts Library

Use **Recharts** for data visualization:

### Component Category Pie Chart
```tsx
<ResponsiveContainer width="100%" height={300}>
  <PieChart>
    <Pie
      data={categoryData}
      dataKey="value"
      nameKey="name"
      cx="50%"
      cy="50%"
      innerRadius={60}
      outerRadius={100}
      label
    />
    <Tooltip />
    <Legend />
  </PieChart>
</ResponsiveContainer>
```

### Supplier Bar Chart
```tsx
<ResponsiveContainer width="100%" height={200}>
  <BarChart data={suppliers} layout="vertical">
    <XAxis type="number" />
    <YAxis type="category" dataKey="name" width={100} />
    <Bar dataKey="product_count" fill="#0d9488" />
  </BarChart>
</ResponsiveContainer>
```

---

## Key UI Components to Build

### 1. ConfidenceBar
```tsx
interface ConfidenceBarProps {
  value: number; // 0-1
  showLabel?: boolean;
}
// Color: green if >0.8, yellow if >0.6, red otherwise
```

### 2. StatusBadge
```tsx
type Status = 'approved' | 'conditional' | 'rejected' | 'needs_review';
// Colors: green, yellow, red, blue
```

### 3. EvidenceChip
```tsx
// Clickable chip that opens link in new tab
// Icon based on evidence type (database, globe, lightbulb)
```

### 4. RecommendationCard
```tsx
// Full card for a substitution recommendation
// Expandable details
// Action buttons
```

### 5. ComponentList
```tsx
// Virtualized list for large BOMs
// Checkbox selection
// Category grouping
```

---

## Mobile Considerations

### Navigation
- Hamburger menu on mobile (< 768px)
- Bottom navigation bar for key actions
- Swipe gestures for cards where appropriate

### Tables
- Horizontal scroll on mobile
- Or convert to card list view

### Charts
- Simplify on mobile (hide legends, use tooltips)
- Stack vertically

---

## Accessibility

- ARIA labels on all interactive elements
- Keyboard navigation support
- Color contrast ratio 4.5:1 minimum
- Focus indicators
- Screen reader friendly tables

---

## Loading States

### Skeleton Loaders
- Use skeleton placeholders matching content shape
- Animate with subtle pulse

### Empty States
- Friendly illustrations
- Clear call-to-action

### Error States
- Retry button
- Helpful error messages

---

## Example Component Code

### Dashboard Stat Card
```tsx
import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp } from "lucide-react";

interface StatCardProps {
  title: string;
  value: number;
  icon: React.ReactNode;
  trend?: number;
}

export function StatCard({ title, value, icon, trend }: StatCardProps) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-3xl font-bold">{value.toLocaleString()}</p>
            {trend && (
              <p className="text-sm text-green-600 flex items-center gap-1">
                <TrendingUp className="h-4 w-4" />
                {trend}% from last month
              </p>
            )}
          </div>
          <div className="p-3 bg-primary/10 rounded-full">
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
```

---

## File Structure

```
frontend/
├── src/
│   ├── components/
│   │   ├── ui/              # shadcn/ui components
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx
│   │   │   ├── Header.tsx
│   │   │   └── MobileNav.tsx
│   │   ├── dashboard/
│   │   │   ├── StatCard.tsx
│   │   │   └── SupplierChart.tsx
│   │   ├── bom/
│   │   │   ├── BOMCard.tsx
│   │   │   ├── BOMList.tsx
│   │   │   ├── ComponentList.tsx
│   │   │   └── CategoryChart.tsx
│   │   └── analysis/
│   │       ├── RecommendationCard.tsx
│   │       ├── ConfidenceBar.tsx
│   │       ├── StatusBadge.tsx
│   │       └── EvidenceChip.tsx
│   ├── pages/
│   │   ├── Dashboard.tsx
│   │   ├── BOMList.tsx
│   │   ├── BOMDetail.tsx
│   │   ├── Analysis.tsx
│   │   └── Suppliers.tsx
│   ├── hooks/
│   │   ├── useBOMs.ts
│   │   ├── useRecommendation.ts
│   │   └── useDashboardStats.ts
│   ├── lib/
│   │   ├── api.ts
│   │   └── utils.ts
│   └── App.tsx
├── .env
└── package.json
```

---

## Quick Start Instructions for Lovable

1. Create new project with React + TypeScript template
2. Install dependencies: `shadcn/ui`, `recharts`, `@tanstack/react-query`, `lucide-react`
3. Set up routing with React Router
4. Create the layout components first (Sidebar, Header)
5. Build pages in order: Dashboard → BOM List → BOM Detail → Analysis
6. Connect to backend API (update REACT_APP_API_URL)

---

## Color Palette Reference

```css
:root {
  --primary: #1a365d;      /* Deep blue */
  --primary-light: #2d4a7c;
  --accent: #0d9488;       /* Teal */
  --accent-light: #14b8a6;
  --success: #22c55e;      /* Green */
  --warning: #f59e0b;      /* Amber */
  --error: #ef4444;        /* Red */
  --background: #f8fafc;
  --card: #ffffff;
  --text: #1e293b;
  --muted: #64748b;
  --border: #e2e8f0;
}
```

---

## Demo-Ready Features (Priority)

For hackathon demo, focus on:

1. **Dashboard** - Shows system overview with real stats
2. **BOM Detail** - Visualizes component breakdown
3. **Analysis Results** - The "wow" factor showing AI recommendations

These three pages demonstrate the core value proposition and can be demoed in sequence.
