import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Calendar, CheckSquare, Settings, User, LogOut,
  Sun, Moon, Bell, Search, Plus, Bot, Sparkles, 
  ChevronDown, MessageCircle, Users
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { useTheme } from './ThemeProvider';

interface PremiumNavbarProps {
  activeTab: 'events' | 'tasks';
  onTabChange: (tab: 'events' | 'tasks') => void;
  onCreateEvent: () => void;
  onAIPrompt?: (prompt: string) => void;
  user?: {
    name: string;
    email: string;
    picture?: string;
  };
}

export function PremiumNavbar({
  activeTab,
  onTabChange,
  onCreateEvent,
  onAIPrompt,
  user
}: PremiumNavbarProps) {
  const { theme, setTheme } = useTheme();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showAIMenu, setShowAIMenu] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const aiRef = useRef<HTMLDivElement>(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setShowProfileMenu(false);
      }
      if (aiRef.current && !aiRef.current.contains(event.target as Node)) {
        setShowAIMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const aiPrompts = [
    { 
      text: "What's my schedule today?", 
      icon: Calendar,
      description: "View upcoming events and meetings"
    },
    { 
      text: "Schedule a team standup", 
      icon: Users,
      description: "Quick meeting setup with AI assistance"
    },
    { 
      text: "Find free time tomorrow", 
      icon: Search,
      description: "Check availability and suggest times"
    },
    { 
      text: "Create project timeline", 
      icon: CheckSquare,
      description: "Generate structured project schedule"
    }
  ];

  return (
    <motion.nav
      initial={{ y: -100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.4, 0.0, 0.2, 1] }}
      className="fixed top-0 left-0 right-0 z-50 glass-effect border-b border-border/50"
    >
      <div className="max-w-7xl mx-auto px-8 py-4">
        <div className="flex items-center justify-between h-12">
          {/* Logo & Brand */}
          <motion.div
            className="flex items-center gap-4"
            whileHover={{ scale: 1.01 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
          >
            <div className="w-11 h-11 muted-gradient-primary rounded-2xl flex items-center justify-center premium-shadow-subtle">
              <Bot className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="font-serif font-bold text-lg text-foreground tracking-tight">
                CalAI
              </h1>
              <p className="text-xs text-muted-foreground -mt-1 font-mono">
                Premium Calendar AI
              </p>
            </div>
          </motion.div>

          {/* Main Navigation Tabs */}
          <div className="flex items-center gap-2 bg-muted p-2 rounded-2xl border border-border/20">
            {[
              { id: 'events', label: 'Events', icon: Calendar },
              { id: 'tasks', label: 'Tasks', icon: CheckSquare },
            ].map((tab) => (
              <motion.button
                key={tab.id}
                onClick={() => onTabChange(tab.id as any)}
                className={`relative px-6 py-3 rounded-xl font-medium text-sm transition-all duration-300 ${
                  activeTab === tab.id
                    ? 'text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {activeTab === tab.id && (
                  <motion.div
                    layoutId="activeTab"
                    className="absolute inset-0 muted-gradient-primary rounded-xl"
                    transition={{ type: "spring", bounce: 0.15, duration: 0.6 }}
                  />
                )}
                <span className="relative flex items-center gap-2">
                  <tab.icon className="h-4 w-4" />
                  {tab.label}
                </span>
              </motion.button>
            ))}
          </div>

          {/* Right Side Actions */}
          <div className="flex items-center gap-4">
            {/* Search */}
            <motion.button
              className="p-3 text-muted-foreground hover:text-foreground transition-colors rounded-xl hover:bg-muted/50"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Search className="h-4 w-4" />
            </motion.button>

            {/* Notifications */}
            <motion.div
              className="relative"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Button
                variant="ghost"
                size="icon"
                className="relative p-3 text-muted-foreground hover:text-foreground rounded-xl"
              >
                <Bell className="h-4 w-4" />
                <Badge className="absolute -top-1 -right-1 h-5 w-5 p-0 text-xs bg-destructive hover:bg-destructive">
                  3
                </Badge>
              </Button>
            </motion.div>

            {/* Create Event Button */}
            <motion.button
              onClick={onCreateEvent}
              className="muted-gradient-primary text-primary-foreground px-6 py-3 rounded-xl font-semibold text-sm flex items-center gap-2 premium-shadow-subtle hover-lift-subtle btn-bounce"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Plus className="h-4 w-4" />
              Create Event
            </motion.button>

            {/* AI Assistant Dropdown */}
            <div className="relative" ref={aiRef}>
              <motion.button
                onClick={() => setShowAIMenu(!showAIMenu)}
                className="p-3 text-muted-foreground hover:text-accent-foreground transition-colors rounded-xl hover:bg-accent/20 hover-glow"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Bot className="h-4 w-4" />
              </motion.button>

              <AnimatePresence>
                {showAIMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: 15, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 15, scale: 0.95 }}
                    transition={{ type: "spring", bounce: 0.15, duration: 0.4 }}
                    className="absolute right-0 mt-3 w-80 glass-effect rounded-2xl border border-border/20 py-3 z-50 premium-shadow-elevated"
                  >
                    <div className="px-4 py-3 border-b border-border/20">
                      <div className="flex items-center gap-2 mb-1">
                        <Sparkles className="h-4 w-4 text-accent" />
                        <h3 className="font-semibold text-foreground">AI Quick Actions</h3>
                      </div>
                      <p className="text-xs text-muted-foreground">Choose a prompt to get started</p>
                    </div>
                    {aiPrompts.map((prompt, index) => (
                      <motion.button
                        key={prompt.text}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.08 }}
                        onClick={() => {
                          onAIPrompt?.(prompt.text);
                          setShowAIMenu(false);
                        }}
                        className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors group"
                      >
                        <div className="flex items-start gap-3">
                          <div className="p-2 rounded-lg bg-muted group-hover:bg-accent/20 transition-colors">
                            <prompt.icon className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground mb-1">{prompt.text}</p>
                            <p className="text-xs text-muted-foreground">{prompt.description}</p>
                          </div>
                        </div>
                      </motion.button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Theme Toggle */}
            <motion.button
              onClick={() => {
                if (theme === "light") {
                  setTheme("dark");
                } else if (theme === "dark") {
                  setTheme("system");
                } else {
                  setTheme("light");
                }
              }}
              className="p-3 text-muted-foreground hover:text-foreground transition-colors rounded-xl hover:bg-muted/50"
              whileHover={{ scale: 1.05, rotate: 180 }}
              whileTap={{ scale: 0.95 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={theme}
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  exit={{ scale: 0, rotate: 180 }}
                  transition={{ duration: 0.3 }}
                >
                  {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </motion.div>
              </AnimatePresence>
            </motion.button>

            {/* User Profile Dropdown */}
            <div className="relative" ref={profileRef}>
              <motion.button
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                className="flex items-center gap-3 p-2 rounded-xl hover:bg-muted/50 transition-colors"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Avatar className="h-9 w-9 ring-2 ring-border">
                  <AvatarImage src={user?.picture} />
                  <AvatarFallback className="bg-muted-gradient-primary text-primary-foreground font-semibold">
                    {user?.name?.split(' ').map(n => n[0]).join('') || 'U'}
                  </AvatarFallback>
                </Avatar>
                <ChevronDown className={`h-3 w-3 text-muted-foreground transition-transform duration-200 ${
                  showProfileMenu ? 'rotate-180' : ''
                }`} />
              </motion.button>

              <AnimatePresence>
                {showProfileMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: 15, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 15, scale: 0.95 }}
                    transition={{ type: "spring", bounce: 0.15, duration: 0.4 }}
                    className="absolute right-0 mt-3 w-64 glass-effect rounded-2xl border border-border/20 py-3 z-50 premium-shadow-elevated"
                  >
                    <div className="px-4 py-3 border-b border-border/20">
                      <p className="text-sm font-semibold text-foreground">
                        {user?.name || 'Guest User'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {user?.email || 'Not signed in'}
                      </p>
                    </div>
                    {[
                      { icon: User, label: 'Profile Settings' },
                      { icon: Settings, label: 'Preferences' },
                      { icon: MessageCircle, label: 'Feedback' },
                      { icon: LogOut, label: 'Sign Out', danger: true },
                    ].map((item) => (
                      <button
                        key={item.label}
                        className={`w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors ${
                          item.danger 
                            ? 'text-destructive hover:bg-destructive/10 hover:text-destructive' 
                            : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                        }`}
                      >
                        <item.icon className="h-4 w-4" />
                        {item.label}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </motion.nav>
  );
}