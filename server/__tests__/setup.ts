import { vi } from 'vitest';
import '@testing-library/jest-dom';

// Mock environment variables
process.env.GEMINI_API_KEY = 'test-key';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

// Mock fetch globally
Object.defineProperty(global, 'fetch', {
  writable: true,
  value: vi.fn(),
});

// Mock window.alert
window.alert = vi.fn();