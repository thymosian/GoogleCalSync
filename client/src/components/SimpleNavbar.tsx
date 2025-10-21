import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Settings, User, LogOut, Sun, Moon, Menu, X,
  ChevronDown
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useTheme } from './ThemeProvider';

interface SimpleNavbarProps {
  onToggleSidebar: () => void;
  isSidebarOpen: boolean;
  user?: {
    name: string;
    email: string;
    picture?: string;
  };
  onLogout?: () => void;
}

export function SimpleNavbar({
  onToggleSidebar,
  isSidebarOpen,
  user,
  onLogout
}: SimpleNavbarProps) {
  const { theme, setTheme } = useTheme();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setShowProfileMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <motion.nav
      initial={{ y: -100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.4, ease: [0.4, 0.0, 0.2, 1] }}
      className="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-lg border-b border-border/50"
    >
      <div className="px-6 py-4">
        <div className="flex items-center justify-between h-12">
          {/* Left Side - Logo and Sidebar Toggle */}
          <div className="flex items-center gap-4">
            {/* Sidebar Toggle */}
            <motion.button
              onClick={onToggleSidebar}
              className="p-2 text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-muted/50"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <AnimatePresence mode="wait">
                <motion.div
                  key={isSidebarOpen ? 'close' : 'menu'}
                  initial={{ scale: 0, rotate: -90 }}
                  animate={{ scale: 1, rotate: 0 }}
                  exit={{ scale: 0, rotate: 90 }}
                  transition={{ duration: 0.2 }}
                >
                  {isSidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                </motion.div>
              </AnimatePresence>
            </motion.button>

            {/* Logo */}
            <motion.div
              className="flex items-center"
              whileHover={{ scale: 1.02 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
            >
              <h1 className="font-display font-bold text-2xl text-foreground tracking-tight">
                CalAI
              </h1>
            </motion.div>
          </div>

          {/* Right Side - User Profile and Settings */}
          <div className="flex items-center gap-3">
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
              className="p-2 text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-muted/50"
              whileHover={{ scale: 1.05 }}
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
                  {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                </motion.div>
              </AnimatePresence>
            </motion.button>

            {/* User Profile Dropdown */}
            <div className="relative" ref={profileRef}>
              <motion.button
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Avatar className="h-8 w-8">
                  <AvatarImage src={user?.picture} />
                  <AvatarFallback className="bg-primary text-primary-foreground font-semibold text-sm">
                    {user?.name?.split(' ').map(n => n[0]).join('') || 'U'}
                  </AvatarFallback>
                </Avatar>
                <div className="text-left hidden sm:block">
                  <p className="text-sm font-medium text-foreground">
                    {user?.name || 'Guest User'}
                  </p>
                </div>
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
                    transition={{ type: "spring", bounce: 0.15, duration: 0.3 }}
                    className="absolute right-0 mt-3 w-56 bg-card/95 backdrop-blur-lg rounded-xl border border-border/20 py-2 z-50 shadow-lg"
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
                    ].map((item) => (
                      <button
                        key={item.label}
                        className="w-full flex items-center gap-3 px-4 py-3 text-sm text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
                      >
                        <item.icon className="h-4 w-4" />
                        {item.label}
                      </button>
                    ))}
                    <div className="border-t border-border/20 mt-2 pt-2">
                      <button
                        onClick={onLogout}
                        className="w-full flex items-center gap-3 px-4 py-3 text-sm text-destructive hover:bg-destructive/10 hover:text-destructive transition-colors"
                      >
                        <LogOut className="h-4 w-4" />
                        Sign Out
                      </button>
                    </div>
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