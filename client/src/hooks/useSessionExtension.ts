import { useEffect } from 'react';
import { useAuth } from './useAuth';
import { authStorage } from '@/lib/storage';

export function useSessionExtension() {
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    if (!isAuthenticated) return;

    // Extend session every 30 minutes for active users
    const extendSession = async () => {
      try {
        const remember = authStorage.getRememberMe();

        await fetch('/api/auth/extend-session', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({ rememberMe: remember }),
        });
      } catch (error) {
        console.warn('Failed to extend session:', error);
      }
    };

    // Extend session immediately
    extendSession();

    // Set up interval to extend session every 30 minutes
    const interval = setInterval(extendSession, 30 * 60 * 1000);

    // Also extend session on user activity
    const handleActivity = () => {
      extendSession();
    };

    // Listen for user activity
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    let lastActivity = Date.now();

    const throttledActivity = () => {
      const now = Date.now();
      // Only extend if it's been more than 5 minutes since last extension
      if (now - lastActivity > 5 * 60 * 1000) {
        lastActivity = now;
        handleActivity();
      }
    };

    events.forEach(event => {
      document.addEventListener(event, throttledActivity, { passive: true });
    });

    return () => {
      clearInterval(interval);
      events.forEach(event => {
        document.removeEventListener(event, throttledActivity);
      });
    };
  }, [isAuthenticated]);
}