import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, Shield, Zap, Bot } from "lucide-react";
import { useState } from "react";

interface GoogleAuthButtonProps {
  onSignIn: () => void;
  isLoading?: boolean;
}

export function GoogleAuthButton({ onSignIn, isLoading = false }: GoogleAuthButtonProps) {
  const [hoveredFeature, setHoveredFeature] = useState<string | null>(null);

  const features = [
    {
      id: "calendar",
      icon: Calendar,
      title: "Calendar Integration",
      description: "Access and manage your Google Calendar events seamlessly"
    },
    {
      id: "ai",
      icon: Bot,
      title: "AI Assistant", 
      description: "Intelligent scheduling and meeting management with conversation"
    },
    {
      id: "automation",
      icon: Zap,
      title: "Smart Automation",
      description: "Automated agenda generation, transcripts, and action item tracking"
    },
    {
      id: "secure",
      icon: Shield,
      title: "Secure & Private",
      description: "Your data stays protected with industry-standard OAuth security"
    }
  ];

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-4xl w-full">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 mb-4">
            <div className="p-3 bg-primary/10 rounded-xl">
              <Bot className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-4xl font-bold tracking-tight">AI Calendar Assistant</h1>
          </div>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Transform your meeting management with AI-powered scheduling, 
            automated workflows, and intelligent insights.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 items-start">
          <Card className="hover-elevate">
            <CardHeader className="text-center pb-6">
              <CardTitle className="text-2xl mb-2">Get Started</CardTitle>
              <p className="text-muted-foreground">
                Connect your Google account to unlock powerful calendar management
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="p-6 bg-muted/30 rounded-lg text-center">
                <svg viewBox="0 0 24 24" className="w-8 h-8 mx-auto mb-3">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                <h3 className="font-semibold mb-2">Sign in with Google</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Secure OAuth authentication - we only access your calendar with your permission
                </p>
              </div>

              <Button 
                onClick={onSignIn}
                disabled={isLoading}
                size="lg"
                className="w-full"
                data-testid="button-google-signin"
              >
                {isLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" className="w-4 h-4 mr-2">
                      <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    Continue with Google
                  </>
                )}
              </Button>

              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <Shield className="h-3 w-3" />
                Your privacy is protected
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <h2 className="text-xl font-semibold mb-4">What you'll get:</h2>
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <Card 
                  key={feature.id}
                  className={`cursor-pointer transition-all hover-elevate ${
                    hoveredFeature === feature.id ? 'ring-2 ring-primary/20' : ''
                  }`}
                  onMouseEnter={() => setHoveredFeature(feature.id)}
                  onMouseLeave={() => setHoveredFeature(null)}
                  data-testid={`feature-card-${feature.id}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-primary/10 rounded-lg">
                        <Icon className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-medium mb-1">{feature.title}</h3>
                        <p className="text-sm text-muted-foreground">
                          {feature.description}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            
            <div className="pt-4">
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary" className="text-xs">Free to use</Badge>
                <Badge variant="secondary" className="text-xs">No credit card required</Badge>
                <Badge variant="secondary" className="text-xs">Instant setup</Badge>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}