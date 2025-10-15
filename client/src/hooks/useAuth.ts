import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authStorage } from '@/lib/storage';

interface User {
  id: string;
  name: string;
  email: string;
  picture?: string;
}

export function useAuth() {
  const queryClient = useQueryClient();

  // Check if user is authenticated
  const { data: user, isLoading: isChecking } = useQuery({
    queryKey: ['auth', 'user'],
    queryFn: async (): Promise<User | null> => {
      try {
        const response = await fetch('/api/auth/user', {
          credentials: 'include'
        });
        if (response.ok) {
          const data = await response.json();
          // Store user info locally for quick access
          authStorage.setLastUser(data.user);
          return data.user;
        }
        // Clear stored user info if not authenticated
        authStorage.clearAuth();
        return null;
      } catch (error) {
        authStorage.clearAuth();
        return null;
      }
    },
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Logout mutation
  const logoutMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include'
      });
      if (!response.ok) {
        throw new Error('Logout failed');
      }
    },
    onSuccess: () => {
      // Clear all stored user data
      authStorage.clearAuth();
      queryClient.setQueryData(['auth', 'user'], null);
      window.location.href = '/';
    }
  });

  const signInWithGoogle = () => {
    // Check if remember me preference is stored
    const remember = authStorage.getRememberMe();
    
    // Pass remember me preference as query parameter
    window.location.href = `/api/auth/google?remember=${remember}`;
  };

  const logout = () => {
    logoutMutation.mutate();
  };

  return {
    user,
    isAuthenticated: !!user,
    isChecking,
    signInWithGoogle,
    logout,
    isLoggingOut: logoutMutation.isPending,
    lastUser: authStorage.getLastUser()
  };
}