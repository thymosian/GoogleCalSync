// Utility functions for managing local storage with error handling

export const storage = {
  // Get a value from localStorage with error handling
  get<T>(key: string, defaultValue: T): T {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch {
      return defaultValue;
    }
  },

  // Set a value in localStorage with error handling
  set(key: string, value: any): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.warn(`Failed to save to localStorage:`, error);
    }
  },

  // Remove a value from localStorage
  remove(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.warn(`Failed to remove from localStorage:`, error);
    }
  },

  // Clear all app-related data
  clearAppData(): void {
    const keysToRemove = ['lastUser', 'rememberMe'];
    keysToRemove.forEach(key => this.remove(key));
  }
};

// Specific storage helpers for auth
export const authStorage = {
  getRememberMe(): boolean {
    return storage.get('rememberMe', true);
  },

  setRememberMe(value: boolean): void {
    storage.set('rememberMe', value);
  },

  getLastUser(): any {
    return storage.get('lastUser', null);
  },

  setLastUser(user: any): void {
    storage.set('lastUser', user);
  },

  clearAuth(): void {
    storage.remove('lastUser');
    storage.remove('rememberMe');
  }
};