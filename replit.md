# AI Calendar Assistant

## Overview

AI Calendar Assistant is a web application that integrates with Google Calendar to provide intelligent meeting management through conversational AI. The application combines calendar visualization, AI-powered scheduling assistance, and automated task management to streamline meeting workflows. Built with React on the frontend and Express.js on the backend, it features a modern UI using shadcn/ui components and Material Design principles.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript and Vite for build tooling
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with custom design system following Material Design principles
- **State Management**: TanStack Query for server state and local React state for UI
- **Routing**: Wouter for lightweight client-side routing
- **Theme System**: Custom theme provider supporting light/dark/system modes

### Backend Architecture
- **Runtime**: Node.js with Express.js web framework
- **Language**: TypeScript with ES modules
- **API Design**: RESTful API with `/api` prefix routing
- **Session Management**: Express sessions with PostgreSQL session store
- **Development**: Hot module replacement via Vite middleware in development

### Database Design
- **Primary Database**: PostgreSQL with Drizzle ORM
- **Schema Structure**:
  - Users table with Google OAuth integration (googleId, tokens, profile data)
  - Events table linking to Google Calendar events with AI enhancements
  - Tasks table for action items extracted from meetings
  - Chat messages table for conversational AI history
- **Migration System**: Drizzle Kit for schema migrations and database management

### Authentication & Authorization
- **OAuth Provider**: Google OAuth 2.0 for calendar access
- **Token Management**: Access and refresh tokens stored securely in database
- **Session Storage**: PostgreSQL-backed session management
- **Security**: HTTPS enforcement and secure cookie handling

### AI Integration Architecture
- **Chat Interface**: Conversational AI for natural language scheduling and queries
- **Features**: Event scheduling, agenda generation, meeting summaries, and task extraction
- **State Management**: React Query for chat message caching and optimistic updates

### Design System
- **Color Palette**: Material Design-inspired with deep blue primary, green secondary
- **Typography**: Inter font family with structured scale (H1: 30px, H2: 20px, Body: 14px)
- **Layout**: Three-column desktop layout (sidebar, main content, right panel) with responsive mobile design
- **Component Library**: Comprehensive UI components for calendar, chat, tasks, and authentication

## External Dependencies

### Google Services
- **Google Calendar API**: Full calendar read/write access for event management
- **Google OAuth 2.0**: User authentication and authorization
- **Google People API**: User profile information and avatar

### Database Services
- **Neon Database**: Serverless PostgreSQL hosting with connection pooling
- **Drizzle ORM**: Type-safe database operations and schema management

### Communication Services
- **SendGrid**: Email delivery for notifications and meeting invitations

### Frontend Libraries
- **Radix UI**: Unstyled, accessible component primitives
- **TanStack Query**: Server state management and caching
- **Tailwind CSS**: Utility-first CSS framework
- **React Hook Form**: Form state management and validation
- **date-fns**: Date manipulation and formatting

### Development Tools
- **Vite**: Fast build tool and development server
- **TypeScript**: Static type checking and enhanced developer experience
- **ESBuild**: Fast bundling for production builds
- **Replit Integration**: Development environment plugins for cartographer and dev banner