---
description: Repository Information Overview
alwaysApply: true
---

# GoogleCalSync Information

## Summary
GoogleCalSync is a web application that integrates with Google Calendar to help users manage meetings and events. It features a conversational interface powered by AI (Gemini and Mistral) to schedule meetings, manage attendees, generate agendas, and synchronize with Google Calendar.

## Structure
- **client/**: React frontend application with TypeScript
- **server/**: Express.js backend server with TypeScript
- **shared/**: Common types and schemas shared between client and server
- **migrations/**: Database migration files for PostgreSQL
- **scripts/**: Utility scripts for database and environment management
- **docs/**: Documentation for various features and workflows
- **dist/**: Compiled output for production deployment

## Language & Runtime
**Language**: TypeScript/JavaScript
**Version**: ES2020 target with ESNext module system
**Build System**: Vite for frontend, esbuild for backend
**Package Manager**: npm

## Dependencies
**Main Dependencies**:
- **Frontend**: React 18, React Query, Radix UI components, TailwindCSS
- **Backend**: Express 4, Passport (Google OAuth), Drizzle ORM
- **Database**: PostgreSQL with Drizzle ORM
- **AI Services**: Google Gemini API, Mistral AI API
- **API Integration**: Google Calendar API, Gmail API
- **Validation**: Zod for schema validation

**Development Dependencies**:
- TypeScript 5.6
- Vitest for testing
- Nodemon for development
- Drizzle Kit for database migrations

## Build & Installation
```bash
# Install dependencies
npm install

# Development mode
npm run dev
# or with file watching
npm run dev:watch

# Build for production
npm run build

# Start production server
npm run start

# Run tests
npm run test
# or with UI
npm run test:ui
```

## Database
**Type**: PostgreSQL
**ORM**: Drizzle ORM
**Schema**: Defined in shared/schema.ts
**Migrations**: 
```bash
# Generate migrations
npm run db:push

# Apply migrations
npm run db:migrate
```

## Testing
**Framework**: Vitest with JSDOM
**Test Location**: `server/__tests__/` and `client/src/__tests__/`
**Naming Convention**: `*.test.ts` and `*.test.tsx`
**Configuration**: vitest.config.ts
**Run Command**:
```bash
npm run test
# or for CI environments
npm run test:run
```
**targetFramework**: Vitest

## Authentication
**Method**: OAuth 2.0 with Google
**Implementation**: Passport.js with passport-google-oauth20
**Required Scopes**: Google Calendar API, Gmail API
**Session Management**: Express session with PostgreSQL session store

## Environment Configuration
**Required Variables**:
- SESSION_SECRET: For secure session management
- DATABASE_URL: PostgreSQL connection string
- GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET: For OAuth
- GEMINI_API_KEY: For Google Gemini AI integration
- MISTRAL_API_KEY: For Mistral AI integration

**Configuration File**: .env (based on .env.example template)