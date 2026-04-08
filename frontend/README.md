# SupplyWise AI - Frontend

AI-powered supply chain decision support application for CPG companies.

## Tech Stack

- **React 18** with TypeScript
- **Vite** for build tooling
- **Tailwind CSS** for styling
- **shadcn/ui** for UI components
- **Recharts** for data visualization
- **React Router** for navigation
- **React Query** for server state management

## Getting Started

### Prerequisites

- Node.js 18+ or Bun
- npm, yarn, or bun

### Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

The app will be available at `http://localhost:8080`.

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |
| `npm run lint` | Run ESLint |
| `npm run test` | Run tests |

## Project Structure

```
src/
├── components/
│   ├── ui/              # shadcn/ui components
│   ├── Header.tsx       # App header with navigation
│   ├── Footer.tsx       # App footer
│   ├── Layout.tsx       # Page layout wrapper
│   ├── ChatIcon.tsx     # Floating chat button
│   ├── ChatPanel.tsx    # Chat interface panel
│   └── RawMaterialsModal.tsx  # Product raw materials modal
├── pages/
│   ├── Index.tsx        # Dashboard page
│   ├── AnalysisPage.tsx # Material analysis page
│   └── NotFound.tsx     # 404 page
├── data/
│   └── sampleData.ts    # Sample data and types
├── hooks/               # Custom React hooks
├── lib/                 # Utility functions
├── App.tsx              # App entry with routing
└── main.tsx             # React entry point
```

## Features

- **Product Dashboard**: View all products with search and pagination
- **Raw Materials Modal**: View components for each product
- **Analysis Page**: AI-powered sourcing recommendations with:
  - Supplier comparison charts
  - Quality metrics radar chart
  - Adjustable parameter sliders
  - PDF export (placeholder)
  - History saving (placeholder)
- **Chat Panel**: Conversational interface with voice input placeholder

## Deployment

This project is deployed on Vercel. Push to main to trigger automatic deployment.
