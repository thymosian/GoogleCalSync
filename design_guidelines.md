# Design Guidelines: AI-Powered Google Calendar Management App

## Design Approach
**Design System Approach**: Following Material Design principles for this productivity-focused application with rich data displays and complex workflows. The system emphasizes clarity, consistency, and accessibility while supporting both light and dark modes.

## Core Design Elements

### Color Palette
**Primary Colors:**
- Light mode: 219 94% 19% (deep blue)
- Dark mode: 219 91% 85% (light blue)

**Secondary Colors:**
- Light mode: 142 76% 36% (green for success states)
- Dark mode: 142 69% 70% (softer green)

**Background Colors:**
- Light mode: 0 0% 98% (warm white)
- Dark mode: 222 47% 11% (dark blue-gray)

**Surface Colors:**
- Light cards: 0 0% 100% (pure white)
- Dark cards: 215 28% 17% (dark blue-gray)

### Typography
**Primary Font**: Inter (Google Fonts)
- Headers: 600-700 weight
- Body text: 400-500 weight
- Code/data: 400 weight (mono fallback)

**Font Scale:**
- H1: text-3xl (30px)
- H2: text-xl (20px)
- Body: text-sm (14px)
- Caption: text-xs (12px)

### Layout System
**Spacing Units**: Tailwind units of 2, 4, 6, and 8
- Component padding: p-4, p-6
- Section margins: m-4, m-8
- Element spacing: gap-2, gap-4

**Grid Structure:**
- Three-column layout: Sidebar (320px), Main content (flex-1), Right panel (280px)
- Mobile: Single column with collapsible sidebar

## Component Library

### Navigation & Layout
- **Top Bar**: Google profile avatar, app title, dark mode toggle
- **Calendar Sidebar**: Scrollable event list with time indicators, delete buttons
- **Main Chat Area**: Message bubbles with timestamp, typing indicators

### Interactive Elements
- **Quick Action Buttons**: Rounded corners (rounded-lg), subtle shadows
- **Event Cards**: Elevated appearance with hover states
- **Task Boards**: Kanban-style columns with drag-and-drop visual feedback

### Data Display
- **Meeting Transcripts**: Code block styling with syntax highlighting
- **Action Plans**: Structured lists with progress indicators
- **Calendar Events**: Time-based visual hierarchy with color coding

### Form Elements
- **Input Fields**: Consistent border radius (rounded-md), focus states
- **Buttons**: Primary (filled), Secondary (outlined), Ghost (text-only)
- **Dropdowns**: Material Design elevation with smooth animations

## Dark Mode Implementation
- System preference detection on first visit
- Persistent theme storage in localStorage
- Smooth transitions between themes (transition-colors duration-200)
- Consistent contrast ratios (4.5:1 minimum for text)
- Form inputs maintain dark styling with proper contrast

## Animations
**Minimal and Purposeful:**
- Theme transitions: 200ms ease
- Hover states: 150ms ease
- Loading states: Subtle pulse animations
- No unnecessary scroll animations or complex transitions

## Accessibility Features
- Semantic HTML structure throughout
- Keyboard navigation support for all interactive elements
- Screen reader friendly labels and descriptions
- Color-independent status indicators (icons + colors)
- Consistent focus indicators across all themes

This design system creates a professional, productivity-focused interface that balances the complexity of calendar management with the conversational nature of AI interaction, while maintaining exceptional usability across light and dark modes.