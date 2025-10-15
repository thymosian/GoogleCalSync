import { ThemeProvider } from '../ThemeProvider';
import { ThemeToggle } from '../ThemeToggle';

export default function ThemeToggleExample() {
  return (
    <ThemeProvider>
      <div className="p-4 space-y-4">
        <h3 className="text-lg font-semibold">Theme Toggle</h3>
        <p className="text-sm text-muted-foreground">
          Click to cycle through light → dark → system theme
        </p>
        <ThemeToggle />
      </div>
    </ThemeProvider>
  );
}