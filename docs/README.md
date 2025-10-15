# Documentation

This folder contains documentation for the Google Calendar Sync application.

## Table of Contents

- [Meeting Creation Workflow](meeting-creation-workflow.md) - Detailed documentation of the AI-powered meeting creation process

## Overview

The Google Calendar Sync application provides an intelligent AI assistant for managing your calendar and scheduling meetings. The enhanced meeting creation workflow guides users through a natural conversation process to create meetings with minimal effort.

## Key Features

1. **Natural Language Processing** - Detect meeting intent from conversational text
2. **Interactive UI Components** - Specialized chat sections for different meeting creation steps
3. **Email Verification** - Real-time validation of attendee email addresses
4. **AI-Generated Titles** - Intelligent meeting title suggestions based on context
5. **Google Meet Integration** - Optional video conferencing link inclusion
6. **Meeting Review** - Final confirmation before creation

## Technical Architecture

The application uses:
- React frontend with TypeScript
- Express backend with TypeScript
- Google Gemini AI for natural language processing
- Google Calendar API for calendar operations
- PostgreSQL database for data storage
- Drizzle ORM for database operations