import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Bot, Shield, User } from "lucide-react";
import { useState, useEffect } from "react";
import { authStorage } from "@/lib/storage";

interface GoogleAuthButtonProps {
  onSignIn: () => void;
  isLoading?: boolean;
}

export function GoogleAuthButton({ onSignIn, isLoading = false }: GoogleAuthButtonProps) {
  const [rememberMe, setRememberMe] = useState(true);
  const [lastUser, setLastUser] = useState<any>(null);

  // Load preferences and last user from localStorage
  useEffect(() => {
    setRememberMe(authStorage.getRememberMe());
    setLastUser(authStorage.getLastUser());
  }, []);

  // Save remember me preference to localStorage
  const handleRememberMeChange = (checked: boolean) => {
    setRememberMe(checked);
    authStorage.setRememberMe(checked);
  };

  const handleSignIn = () => {
    // Store the remember me preference before signing in
    authStorage.setRememberMe(rememberMe);
    onSignIn();
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto p-3 bg-primary/10 rounded-xl w-fit">
            <Bot className="h-8 w-8 text-primary" />
          </div>
          <div>
            <CardTitle className="text-2xl">AI Calendar Assistant</CardTitle>
            <p className="text-muted-foreground mt-2">
              {lastUser ? `Welcome back, ${lastUser.name}` : 'Sign in to manage your calendar with AI'}
            </p>
          </div>

          {lastUser && (
            <div className="flex items-center justify-center gap-3 p-3 bg-muted/30 rounded-lg">
              <Avatar className="h-8 w-8">
                <AvatarImage src={lastUser.picture} alt={lastUser.name} />
                <AvatarFallback>
                  <User className="h-4 w-4" />
                </AvatarFallback>
              </Avatar>
              <div className="text-left">
                <p className="text-sm font-medium">{lastUser.name}</p>
                <p className="text-xs text-muted-foreground">{lastUser.email}</p>
              </div>
            </div>
          )}
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="space-y-4">
            <Button
              onClick={handleSignIn}
              disabled={isLoading}
              size="lg"
              className="w-full"
              data-testid="button-google-signin"
            >
              {isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2" />
                  Signing in...
                </>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" className="w-4 h-4 mr-2">
                    <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  Continue with Google
                </>
              )}
            </Button>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="remember-me"
                checked={rememberMe}
                onCheckedChange={handleRememberMeChange}
              />
              <label
                htmlFor="remember-me"
                className="text-sm text-muted-foreground cursor-pointer"
              >
                Keep me signed in for 30 days
              </label>
            </div>
          </div>

          <div className="text-center">
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Shield className="h-3 w-3" />
              Secure OAuth authentication
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              We only access your calendar with your permission
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}