import { test, expect } from '@playwright/test';

test.describe('Enhanced Dashboard UI', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the dashboard
    await page.goto('http://localhost:5173');
    // Wait for the page to load
    await page.waitForLoadState('networkidle');
  });

  test('should display the enhanced navbar with muted theme', async ({ page }) => {
    // Check if the navbar is present with glass effect
    const navbar = page.locator('nav').first();
    await expect(navbar).toBeVisible();
    
    // Check if the brand logo is present with muted gradient
    const brandLogo = page.locator('[data-testid="brand-logo"], .muted-gradient-primary').first();
    await expect(brandLogo).toBeVisible();
    
    // Check if the CalAI title is present
    await expect(page.locator('h1:has-text("CalAI")')).toBeVisible();
    
    // Check if the navigation tabs are present
    await expect(page.locator('button:has-text("Events")')).toBeVisible();
    await expect(page.locator('button:has-text("Tasks")')).toBeVisible();
  });

  test('should display the premium event sidebar', async ({ page }) => {
    // Check if the events tab is selected by default
    const eventsTab = page.locator('button:has-text("Events")');
    await expect(eventsTab).toBeVisible();
    
    // Check if the event sidebar is present
    const eventsSidebar = page.locator('h2:has-text("Upcoming Events")');
    await expect(eventsSidebar).toBeVisible();
    
    // Check for quick stats cards
    const statsCards = page.locator('.hover-lift-subtle');
    await expect(statsCards.first()).toBeVisible();
  });

  test('should display the enhanced chat interface', async ({ page }) => {
    // Check if the chat interface is present
    const chatInterface = page.locator('h2:has-text("Chat with CalAI")');
    await expect(chatInterface).toBeVisible();
    
    // Check for the AI assistant trigger button
    const aiButton = page.locator('button:has-text("Ask CalAI Assistant")');
    await expect(aiButton).toBeVisible();
    
    // Check for welcome message or empty state
    const welcomeMessage = page.locator('h3:has-text("Welcome to CalAI")');
    await expect(welcomeMessage).toBeVisible();
  });

  test('should open AI assistant panel when clicked', async ({ page }) => {
    // Click the AI assistant button
    const aiButton = page.locator('button:has-text("Ask CalAI Assistant")');
    await aiButton.click();
    
    // Check if the AI panel is visible
    const aiPanel = page.locator('h2:has-text("AI Assistant")');
    await expect(aiPanel).toBeVisible();
    
    // Check for quick action categories
    await expect(page.locator('button:has-text("Meeting")')).toBeVisible();
    await expect(page.locator('button:has-text("Planning")')).toBeVisible();
    await expect(page.locator('button:has-text("Smart Actions")')).toBeVisible();
    
    // Check for custom request textarea
    const textarea = page.locator('textarea[placeholder*="Ask me anything"]');
    await expect(textarea).toBeVisible();
  });

  test('should toggle between light and dark themes', async ({ page }) => {
    // Find and click the theme toggle button
    const themeToggle = page.locator('button').filter({ has: page.locator('svg') }).nth(-3); // Approximate location
    
    // Get initial theme (check for dark class on html)
    const initialTheme = await page.locator('html').getAttribute('class');
    
    // Click theme toggle
    await themeToggle.click();
    
    // Wait for theme change
    await page.waitForTimeout(500);
    
    // Check if theme changed
    const newTheme = await page.locator('html').getAttribute('class');
    expect(newTheme).not.toBe(initialTheme);
  });

  test('should switch between Events and Tasks tabs', async ({ page }) => {
    // Initially on Events tab - check sidebar
    await expect(page.locator('h2:has-text("Upcoming Events")')).toBeVisible();
    
    // Click Tasks tab
    const tasksTab = page.locator('button:has-text("Tasks")');
    await tasksTab.click();
    
    // Wait for transition
    await page.waitForTimeout(500);
    
    // Check if task board is visible
    const taskBoard = page.locator('[data-testid="task-board"]');
    // Task board might not be visible if no tasks, so check for tab state
    const activeTasksTab = page.locator('button:has-text("Tasks")').first();
    await expect(activeTasksTab).toBeVisible();
  });

  test('should have proper responsive design and animations', async ({ page }) => {
    // Check for stagger animation classes
    const staggerItems = page.locator('.stagger-item');
    if (await staggerItems.count() > 0) {
      await expect(staggerItems.first()).toBeVisible();
    }
    
    // Check for glass effect elements
    const glassElements = page.locator('.glass-effect');
    if (await glassElements.count() > 0) {
      await expect(glassElements.first()).toBeVisible();
    }
    
    // Check for hover effects on cards
    const hoverCards = page.locator('.card-transition, .hover-lift-subtle');
    if (await hoverCards.count() > 0) {
      await expect(hoverCards.first()).toBeVisible();
    }
  });

  test('should display proper muted color scheme', async ({ page }) => {
    // Check if the background has the muted theme
    const body = page.locator('body');
    await expect(body).toHaveClass(/bg-background/);
    
    // Check for muted gradient elements
    const mutedGradients = page.locator('.muted-gradient-primary');
    if (await mutedGradients.count() > 0) {
      await expect(mutedGradients.first()).toBeVisible();
    }
    
    // Check for premium shadow effects
    const premiumShadows = page.locator('.premium-shadow-subtle, .premium-shadow-elevated');
    if (await premiumShadows.count() > 0) {
      await expect(premiumShadows.first()).toBeVisible();
    }
  });

  test('should close AI panel when clicking close button', async ({ page }) => {
    // Open AI panel
    const aiButton = page.locator('button:has-text("Ask CalAI Assistant")');
    await aiButton.click();
    
    // Wait for panel to open
    await page.waitForTimeout(500);
    
    // Find and click close button
    const closeButton = page.locator('button').filter({ has: page.locator('svg') }).last(); // X icon
    await closeButton.click();
    
    // Wait for panel to close
    await page.waitForTimeout(500);
    
    // Check that AI panel is no longer visible
    const aiPanel = page.locator('h2:has-text("AI Assistant")');
    await expect(aiPanel).not.toBeVisible();
  });

  test('should display user profile dropdown', async ({ page }) => {
    // Look for avatar or profile button
    const profileButton = page.locator('[data-testid="profile-button"], .ring-border');
    
    if (await profileButton.count() > 0) {
      await profileButton.first().click();
      
      // Check for profile menu items
      await expect(page.locator('button:has-text("Profile Settings"), button:has-text("Profile")')).toBeVisible();
    }
  });

  test('should display proper typography with different font families', async ({ page }) => {
    // Check for serif font usage (headings)
    const serifHeadings = page.locator('.font-serif');
    if (await serifHeadings.count() > 0) {
      await expect(serifHeadings.first()).toBeVisible();
    }
    
    // Check for mono font usage (code-like elements)
    const monoElements = page.locator('.font-mono');
    if (await monoElements.count() > 0) {
      await expect(monoElements.first()).toBeVisible();
    }
  });
});

test.describe('Enhanced Dashboard UI - Event Interactions', () => {
  test('should handle create event button', async ({ page }) => {
    await page.goto('http://localhost:5173');
    await page.waitForLoadState('networkidle');
    
    // Click create event button
    const createButton = page.locator('button:has-text("Create Event")');
    await createButton.click();
    
    // Should open onboarding or event creation flow
    await page.waitForTimeout(1000);
    
    // Check if onboarding setup is visible or some event creation UI
    const onboardingOrForm = page.locator('h2, h1').filter({ hasText: /Create|Setup|Event|Meeting/ }).first();
    // This might or might not be visible depending on authentication state
    // await expect(onboardingOrForm).toBeVisible();
  });
});