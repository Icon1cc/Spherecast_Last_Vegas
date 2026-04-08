# Lovable Prompt - SupplyWise AI

## Design System

### Colors
- **Primary Background**: White (#FFFFFF)
- **Header/Footer**: Black (#000000)
- **Primary Accent**: Blue (#3B82F6)
- **Secondary Accent**: Gray (#6B7280)
- **Success**: Green (#10B981)
- **Warning**: Amber (#F59E0B)
- **Error**: Red (#EF4444)
- **Text Primary**: Black (#111827)
- **Text Secondary**: Gray (#6B7280)
- **Border**: Light Gray (#E5E7EB)

### Typography
- **Font Family**: Inter (sans-serif)
- **Headings**: Bold, tracking-tight
- **Body**: Regular, 16px base

### Design Principles
- Minimalist and clean
- Professional enterprise feel
- High contrast for readability
- Consistent spacing (8px grid)

---

## Lovable Prompt

```
Create a professional supply chain management dashboard called "SupplyWise AI" with the following specifications:

## Overall Layout

Create a minimalist, professional web application with:
- Fixed header (black background, white text)
- Fixed footer (black background, white text)
- Main content area with white background
- Floating chat icon (bottom right corner)

## Header Component

Design a header with:
- Left side: Logo placeholder (gray circle with "SW" text) + "SupplyWise AI" text
- Right side: Navigation links - "About Us", "Contact", "Profile"
- Black background (#000000)
- White text
- Height: 64px
- Logo is clickable and navigates to home page
- Subtle hover effects on navigation items

## Footer Component

Design a footer with:
- Copyright text: "© {currentYear} SupplyWise AI. All rights reserved." where currentYear dynamically updates
- Links: "About Us", "Privacy Policy", "Terms of Service", "Contact"
- Black background (#000000)
- White text
- Height: 48px
- Links have subtle hover underline effect

## Page 1: Dashboard (Home Page)

Create a dashboard showing products:
- Page title: "Product Dashboard"
- Clean data table with columns:
  - Column 1: "#" (Serial Number, starting from 1)
  - Column 2: "Product Name" (left aligned)
  - Column 3: "Company" (left aligned)
  - Column 4: "Actions" (centered)
- Each row has a "View" button in the Actions column
- Table has alternating row colors (white and light gray)
- Table has rounded corners and subtle shadow
- Pagination at the bottom (10 items per page)
- Search bar above the table to filter products
- Clean, minimalist styling

## Page 2: Raw Materials Modal

When user clicks "View" on a product, show a modal:
- Modal title: "{Product Name} - Raw Materials"
- Close button (X) in top right corner
- Data table inside modal:
  - Column 1: "#" (Serial Number)
  - Column 2: "Raw Material" (ingredient name)
  - Column 3: "Actions"
- Each row has an "Analysis" button (blue, primary style)
- Modal has white background with rounded corners
- Dark overlay behind modal
- Modal is centered on screen
- Modal width: 600px max
- Chat icon should NOT appear when modal is open

## Page 3: Analysis Report Page

When user clicks "Analysis", navigate to a new page:
- Breadcrumb: "Dashboard > {Product Name} > {Raw Material}"
- Page title: "Analysis: {Raw Material Name}"

### Section 1: Sourcing Recommendation Card
- Card with white background, subtle shadow
- Title: "Recommended Supplier"
- Show:
  - Supplier name (large, bold)
  - Confidence score (percentage with colored badge)
  - Reasoning text (paragraph)
- List of alternative suppliers with scores

### Section 2: Charts Row
Create a row with two charts:
- Chart 1: Bar chart showing "Supplier Comparison" (suppliers on x-axis, scores on y-axis)
- Chart 2: Radar chart showing "Quality Metrics" (price, quality, compliance, lead time, consolidation)
- Use Chart.js or Recharts
- Clean, minimal chart styling

### Section 3: Parameter Sliders (Gamified)
Card titled "Adjust Analysis Parameters":
- 5 sliders, each with:
  - Label on left
  - Slider in middle (1-10 scale)
  - Current value on right
- Sliders:
  1. "Price Priority" (💰 icon)
  2. "Quality Priority" (⭐ icon)
  3. "Compliance Priority" (✓ icon)
  4. "Supplier Consolidation" (🔗 icon)
  5. "Lead Time Priority" (⏱️ icon)
- Sliders have colored fill (blue gradient)
- "Update Analysis" button below sliders (primary blue button)
- When button clicked, the recommendation section updates

### Section 4: Actions Row
- "Download PDF" button (secondary style, with download icon)
- "Save to History" button (secondary style, with save icon)
- Buttons aligned to the right

## Chat Icon Component

Create a floating chat icon:
- Fixed position: bottom-right corner (24px from edges)
- Circular button, 56px diameter
- Blue background (#3B82F6)
- White chat bubble icon inside
- Subtle shadow
- Hover: slightly larger (scale 1.1)
- Click: opens chat panel
- Z-index: high (above all content)
- Hidden when modal is open

## Chat Panel Component

When chat icon is clicked, show a slide-in panel:
- Slides in from the RIGHT side
- Width: 400px
- Full height
- White background
- Shadow on left edge

### Panel Header
- Title: "SupplyWise Assistant"
- Close button (X)
- Black background, white text

### Chat History Sidebar
- Left portion (120px width)
- List of previous chat sessions
- Each item shows: date + topic preview
- Click to load that conversation
- "New Chat" button at bottom
- Light gray background

### Conversation Area
- Main chat area
- Messages styled as bubbles:
  - User messages: right-aligned, blue background
  - AI messages: left-aligned, gray background
- AI avatar: small "SW" circle
- Timestamps below messages

### Input Area
- Fixed at bottom of panel
- Voice button (🎤 microphone icon) on left
- Text input field in middle
- Send button (➤ arrow) on right
- Voice button toggles between "Start Voice" and "Listening..."
- When voice is active, show animated sound wave indicator

## Responsive Design

- Desktop: Full layout as described
- Tablet: Chat panel becomes full-width overlay
- Mobile:
  - Table becomes card-based list
  - Chat panel is full screen
  - Sliders stack vertically

## Animations

- Modal: fade in + scale up
- Chat panel: slide in from right (300ms ease)
- Sliders: smooth value transitions
- Buttons: subtle hover lift effect
- Page transitions: fade

## Additional Components Needed

1. Loading spinner (for API calls)
2. Toast notifications (for success/error messages)
3. Confirmation dialogs
4. Empty states (when no data)
5. Error states (when API fails)

## State Management

- Products list from API
- Selected product for modal
- Current analysis data
- Slider values (default all to 5)
- Chat messages array
- Chat sessions list
- Voice recording state

Generate this complete application with all pages, components, and interactions. Use TypeScript and modern React patterns. Make it production-ready with proper error handling and loading states.
```

---

## Component-Specific Prompts

### If you need to generate components separately:

#### Header Prompt
```
Create a React header component with black background. Left side has a logo placeholder (gray circle with "SW") and "SupplyWise AI" text. Right side has navigation links: About Us, Contact, Profile. The logo should be clickable and navigate to home. Use white text, 64px height, and subtle hover effects on links.
```

#### Footer Prompt
```
Create a React footer component with black background and white text. Show copyright "© {currentYear} SupplyWise AI. All rights reserved." where the year updates automatically. Include links for About Us, Privacy Policy, Terms of Service, Contact. Use 48px height with centered content.
```

#### Product Table Prompt
```
Create a data table component showing products with columns: Serial Number (#), Product Name, Company, and Actions. Include a "View" button in each row's Actions column. Add alternating row colors, search/filter functionality, and pagination (10 per page). Style with rounded corners and subtle shadow.
```

#### Analysis Sliders Prompt
```
Create a gamified parameter adjustment component with 5 sliders (1-10 scale): Price Priority, Quality Priority, Compliance Priority, Supplier Consolidation, Lead Time Priority. Each slider has an icon, label, visual slider with blue gradient fill, and current value display. Include an "Update Analysis" button that triggers a callback with all current values.
```

#### Chat Panel Prompt
```
Create a slide-in chat panel from the right side. Width 400px, full height. Include: header with title and close button, sidebar showing chat history/sessions, main conversation area with message bubbles (user=blue/right, ai=gray/left), and input area with voice button (microphone), text field, and send button. The voice button should toggle recording state and show an animated indicator when active.
```

---

## Sample Data for Development

```javascript
// Sample products for testing
const sampleProducts = [
  { id: 1, name: "NOW Foods Vitamin D3", company: "NOW Foods", componentCount: 4 },
  { id: 2, name: "Animal Omega", company: "Animal", componentCount: 13 },
  { id: 3, name: "Ultima Replenisher", company: "Ultima Replenisher", componentCount: 14 },
  { id: 4, name: "New Chapter Multivitamin", company: "New Chapter", componentCount: 17 },
  { id: 5, name: "Solgar B-Complex", company: "Solgar", componentCount: 8 },
];

// Sample raw materials for modal
const sampleRawMaterials = [
  { id: 506, name: "Glycerin", category: "Excipient" },
  { id: 509, name: "Safflower Oil", category: "Oil" },
  { id: 511, name: "Bovine Gelatin Capsule", category: "Capsule" },
  { id: 512, name: "Vitamin D3 Cholecalciferol", category: "Vitamin" },
];

// Sample analysis result
const sampleAnalysis = {
  recommendedSupplier: {
    name: "Prinova USA",
    score: 0.92,
    reasoning: "Best combination of competitive pricing, consistent quality certifications, and existing supplier relationship. Ships from domestic warehouse with 5-day lead time."
  },
  alternatives: [
    { name: "PureBulk", score: 0.85, reasoning: "Good backup option, slightly higher price" },
    { name: "Jost Chemical", score: 0.78, reasoning: "Premium quality, longer lead time" },
  ],
  metrics: {
    price: 8,
    quality: 9,
    compliance: 10,
    leadTime: 7,
    consolidation: 6
  }
};

// Sample chat messages
const sampleMessages = [
  { role: "assistant", content: "Hi! I'm your SupplyWise assistant. How can I help you today?" },
  { role: "user", content: "Show me analysis for Vitamin D3" },
  { role: "assistant", content: "I found Vitamin D3 Cholecalciferol in the NOW Foods product. The recommended supplier is Prinova USA with a 92% confidence score..." },
];
```

---

## Vercel Deployment Notes

When deploying to Vercel:

1. **Environment Variables**: Add all variables from `.env` to Vercel project settings
2. **Postgres**: Use Vercel Postgres (automatically configured)
3. **Build Command**: `npm run build`
4. **Output Directory**: `.next`
5. **Node Version**: 18.x or higher
6. **Region**: Choose region closest to users

---

## Testing Checklist

- [ ] Header logo navigates to home
- [ ] Footer copyright shows current year
- [ ] Product table loads and paginates
- [ ] Search filters products correctly
- [ ] View button opens modal
- [ ] Modal shows raw materials
- [ ] Analysis button navigates to analysis page
- [ ] Charts render with data
- [ ] Sliders adjust and persist values
- [ ] Update Analysis recalculates recommendations
- [ ] Download PDF generates file
- [ ] Save to History creates chat session
- [ ] Chat icon appears on all pages except modal
- [ ] Chat panel slides in/out smoothly
- [ ] Chat messages send and display
- [ ] Voice button activates ElevenLabs
- [ ] Voice conversation works two-way
- [ ] Chat history loads previous sessions
- [ ] All pages are responsive
