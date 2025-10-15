import { expect, afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';

// Extend Vitest's expect with jest-dom matchers
expect.extend(matchers);

// Cleanup after each test case
afterEach(() => {
  cleanup();
});

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock window.scrollTo
Object.defineProperty(window, 'scrollTo', {
  writable: true,
  value: vi.fn(),
});

// Mock HTMLElement.scrollIntoView
Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
  writable: true,
  value: vi.fn(),
});

// Mock clipboard API
Object.defineProperty(navigator, 'clipboard', {
  writable: true,
  value: {
    writeText: vi.fn().mockResolvedValue(undefined),
    readText: vi.fn().mockResolvedValue(''),
  },
});

// Mock URL.createObjectURL
Object.defineProperty(URL, 'createObjectURL', {
  writable: true,
  value: vi.fn().mockReturnValue('mock-object-url'),
});

Object.defineProperty(URL, 'revokeObjectURL', {
  writable: true,
  value: vi.fn(),
});

// Mock fetch for API calls
global.fetch = vi.fn();

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  // Uncomment to ignore specific console methods
  // log: vi.fn(),
  // warn: vi.fn(),
  // error: vi.fn(),
};

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn(),
};

Object.defineProperty(window, 'localStorage', {
  writable: true,
  value: localStorageMock,
});

// Mock sessionStorage
const sessionStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn(),
};

Object.defineProperty(window, 'sessionStorage', {
  writable: true,
  value: sessionStorageMock,
});

// Mock File and FileReader for file upload tests
global.File = class MockFile {
  name: string;
  size: number;
  type: string;
  lastModified: number;

  constructor(bits: BlobPart[], filename: string, options: FilePropertyBag = {}) {
    this.name = filename;
    this.size = bits.reduce((acc, bit) => {
      if (typeof bit === 'string') {
        return acc + bit.length;
      } else if (bit instanceof ArrayBuffer) {
        return acc + bit.byteLength;
      } else if ('size' in bit) {
        return acc + (bit as Blob).size;
      }
      return acc;
    }, 0);
    this.type = options.type || '';
    this.lastModified = options.lastModified || Date.now();
  }
} as any;

global.FileReader = class MockFileReader implements FileReader {
  result: string | ArrayBuffer | null = null;
  error: DOMException | null = null;
  readyState: 0 | 1 | 2 = 0;
  onload: ((this: FileReader, ev: ProgressEvent<FileReader>) => any) | null = null;
  onerror: ((this: FileReader, ev: ProgressEvent<FileReader>) => any) | null = null;
  onloadend: ((this: FileReader, ev: ProgressEvent<FileReader>) => any) | null = null;
  onabort: ((this: FileReader, ev: ProgressEvent<FileReader>) => any) | null = null;
  onloadstart: ((this: FileReader, ev: ProgressEvent<FileReader>) => any) | null = null;
  onprogress: ((this: FileReader, ev: ProgressEvent<FileReader>) => any) | null = null;

  static readonly EMPTY = 0;
  static readonly LOADING = 1;
  static readonly DONE = 2;

  readonly EMPTY = 0;
  readonly LOADING = 1;
  readonly DONE = 2;

  readAsText(_file: Blob) {
    this.readyState = 2 as const;
    this.result = 'mock file content';
    if (this.onload) {
      this.onload.call(this as any, {} as ProgressEvent<FileReader>);
    }
  }

  readAsDataURL(_file: Blob) {
    this.readyState = 2 as const;
    this.result = 'data:text/plain;base64,bW9jayBmaWxlIGNvbnRlbnQ=';
    if (this.onload) {
      this.onload.call(this as any, {} as ProgressEvent<FileReader>);
    }
  }

  readAsArrayBuffer(_file: Blob) {
    this.readyState = 2 as const;
    this.result = new ArrayBuffer(8);
    if (this.onload) {
      this.onload.call(this as any, {} as ProgressEvent<FileReader>);
    }
  }

  readAsBinaryString(_file: Blob) {
    this.readyState = 2 as const;
    this.result = 'mock binary string';
    if (this.onload) {
      this.onload.call(this as any, {} as ProgressEvent<FileReader>);
    }
  }

  abort() {
    this.readyState = 2 as const;
  }

  addEventListener() {}
  removeEventListener() {}
  dispatchEvent() { return true; }
} as any;

// Mock DOMRect for getBoundingClientRect
global.DOMRect = class MockDOMRect {
  bottom: number = 0;
  height: number = 0;
  left: number = 0;
  right: number = 0;
  top: number = 0;
  width: number = 0;
  x: number = 0;
  y: number = 0;

  constructor(x = 0, y = 0, width = 0, height = 0) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.left = x;
    this.top = y;
    this.right = x + width;
    this.bottom = y + height;
  }

  toJSON() {
    return JSON.stringify(this);
  }
} as any;

// Mock getBoundingClientRect
Element.prototype.getBoundingClientRect = vi.fn(() => new DOMRect());

// Mock getComputedStyle
window.getComputedStyle = vi.fn().mockReturnValue({
  getPropertyValue: vi.fn().mockReturnValue(''),
});

// Mock requestAnimationFrame
global.requestAnimationFrame = vi.fn().mockImplementation((cb) => {
  return setTimeout(cb, 16);
});

global.cancelAnimationFrame = vi.fn().mockImplementation((id) => {
  clearTimeout(id);
});

// Mock performance.now
Object.defineProperty(window, 'performance', {
  writable: true,
  value: {
    now: vi.fn().mockReturnValue(Date.now()),
    mark: vi.fn(),
    measure: vi.fn(),
    getEntriesByName: vi.fn().mockReturnValue([]),
    getEntriesByType: vi.fn().mockReturnValue([]),
  },
});

// Mock crypto for UUID generation
Object.defineProperty(window, 'crypto', {
  writable: true,
  value: {
    randomUUID: vi.fn().mockReturnValue('mock-uuid-1234-5678-9012'),
    getRandomValues: vi.fn().mockImplementation((arr) => {
      for (let i = 0; i < arr.length; i++) {
        arr[i] = Math.floor(Math.random() * 256);
      }
      return arr;
    }),
  },
});

// Mock MutationObserver
global.MutationObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  disconnect: vi.fn(),
  takeRecords: vi.fn().mockReturnValue([]),
}));

// Mock document.createRange for text selection
document.createRange = vi.fn().mockImplementation(() => ({
  setStart: vi.fn(),
  setEnd: vi.fn(),
  selectNodeContents: vi.fn(),
  deleteContents: vi.fn(),
  insertNode: vi.fn(),
  cloneContents: vi.fn(),
  collapse: vi.fn(),
  commonAncestorContainer: document.body,
  startContainer: document.body,
  endContainer: document.body,
  startOffset: 0,
  endOffset: 0,
  collapsed: false,
}));

// Mock Selection API
Object.defineProperty(window, 'getSelection', {
  writable: true,
  value: vi.fn().mockReturnValue({
    removeAllRanges: vi.fn(),
    addRange: vi.fn(),
    toString: vi.fn().mockReturnValue(''),
    rangeCount: 0,
  }),
});

// Mock HTMLCanvasElement methods for chart/canvas components
HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
  fillRect: vi.fn(),
  clearRect: vi.fn(),
  getImageData: vi.fn().mockReturnValue({ data: new Uint8ClampedArray(4) }),
  putImageData: vi.fn(),
  createImageData: vi.fn().mockReturnValue({ data: new Uint8ClampedArray(4) }),
  setTransform: vi.fn(),
  drawImage: vi.fn(),
  save: vi.fn(),
  fillText: vi.fn(),
  restore: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  closePath: vi.fn(),
  stroke: vi.fn(),
  translate: vi.fn(),
  scale: vi.fn(),
  rotate: vi.fn(),
  arc: vi.fn(),
  fill: vi.fn(),
  measureText: vi.fn().mockReturnValue({ width: 0 }),
  transform: vi.fn(),
  rect: vi.fn(),
  clip: vi.fn(),
});

// Mock HTMLMediaElement methods for audio/video components
Object.defineProperty(HTMLMediaElement.prototype, 'play', {
  writable: true,
  value: vi.fn().mockResolvedValue(undefined),
});

Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
  writable: true,
  value: vi.fn(),
});

Object.defineProperty(HTMLMediaElement.prototype, 'load', {
  writable: true,
  value: vi.fn(),
});

// Mock focus and blur methods
HTMLElement.prototype.focus = vi.fn();
HTMLElement.prototype.blur = vi.fn();

// Mock scrollIntoView
HTMLElement.prototype.scrollIntoView = vi.fn();

// Mock dataset property
Object.defineProperty(HTMLElement.prototype, 'dataset', {
  writable: true,
  value: {},
});

// Mock offsetHeight, offsetWidth, etc.
Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
  configurable: true,
  value: 100,
});

Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
  configurable: true,
  value: 100,
});

Object.defineProperty(HTMLElement.prototype, 'offsetTop', {
  configurable: true,
  value: 0,
});

Object.defineProperty(HTMLElement.prototype, 'offsetLeft', {
  configurable: true,
  value: 0,
});

// Mock clientHeight, clientWidth
Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
  configurable: true,
  value: 100,
});

Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
  configurable: true,
  value: 100,
});

// Mock scrollHeight, scrollWidth
Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
  configurable: true,
  value: 100,
});

Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
  configurable: true,
  value: 100,
});

// Mock scrollTop, scrollLeft
Object.defineProperty(HTMLElement.prototype, 'scrollTop', {
  configurable: true,
  value: 0,
  writable: true,
});

Object.defineProperty(HTMLElement.prototype, 'scrollLeft', {
  configurable: true,
  value: 0,
  writable: true,
});

// Export common test utilities
export const mockFetch = (response: any, ok = true) => {
  (global.fetch as any).mockResolvedValueOnce({
    ok,
    json: async () => response,
    text: async () => JSON.stringify(response),
    status: ok ? 200 : 400,
    statusText: ok ? 'OK' : 'Bad Request',
  });
};

export const mockFetchError = (error: Error) => {
  (global.fetch as any).mockRejectedValueOnce(error);
};

export const clearAllMocks = () => {
  vi.clearAllMocks();
  localStorageMock.getItem.mockClear();
  localStorageMock.setItem.mockClear();
  localStorageMock.removeItem.mockClear();
  localStorageMock.clear.mockClear();
  sessionStorageMock.getItem.mockClear();
  sessionStorageMock.setItem.mockClear();
  sessionStorageMock.removeItem.mockClear();
  sessionStorageMock.clear.mockClear();
};