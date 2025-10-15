import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ThemeProvider";
import { GoogleAuthButton } from "@/components/GoogleAuthButton";
import Dashboard from "@/pages/Dashboard";
import NotFound from "@/pages/not-found";
import { useAuth } from "@/hooks/useAuth";
import { useSessionExtension } from "@/hooks/useSessionExtension";

function Router() {
  const { isAuthenticated, isChecking, signInWithGoogle } = useAuth();
  
  // Automatically extend sessions for active users
  useSessionExtension();

  if (isChecking) {
    // Show last user info while checking authentication
    const lastUser = (() => {
      try {
        const saved = localStorage.getItem('lastUser');
        return saved ? JSON.parse(saved) : null;
      } catch {
        return null;
      }
    })();

    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          {lastUser && (
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden">
                {lastUser.picture ? (
                  <img 
                    src={lastUser.picture} 
                    alt={lastUser.name}
                    className="h-8 w-8 rounded-full object-cover"
                  />
                ) : (
                  <div className="h-8 w-8 rounded-full bg-primary/20" />
                )}
              </div>
              <span className="text-sm text-muted-foreground">
                Signing in {lastUser.name}...
              </span>
            </div>
          )}
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <GoogleAuthButton 
        onSignIn={signInWithGoogle} 
        isLoading={false}
      />
    );
  }

  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ThemeProvider defaultTheme="system">
          <Toaster />
          <Router />
        </ThemeProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
