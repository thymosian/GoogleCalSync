import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { storage } from "./storage";
import type { User } from "../shared/schema";

// Configure Google OAuth Strategy
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID!,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  callbackURL: "/api/auth/google/callback",
  passReqToCallback: true
}, async (req, accessToken, refreshToken, profile, done) => {
  try {
    const timestamp = new Date().toISOString();
    const sessionId = req.sessionID || 'unknown';

    console.log(`[${timestamp}] Google OAuth callback triggered for user: ${profile.displayName} (Session: ${sessionId})`);

    // Check if this is a duplicate callback (Google sometimes sends multiple requests)
    const lastCallbackTime = req.session.lastCallbackTime;
    const now = Date.now();

    if (lastCallbackTime && (now - lastCallbackTime) < 5000) { // Within 5 seconds
      console.log(`[${timestamp}] Duplicate OAuth callback detected, skipping (Session: ${sessionId})`);
      return done(null, req.user); // Return existing user if available
    }

    // Update last callback time
    req.session.lastCallbackTime = now;

    const googleId = profile.id;
    let user = await storage.getUserByGoogleId(googleId);

    if (user) {
      // Update tokens for existing user
      console.log(`[${timestamp}] Updating existing user tokens for: ${profile.displayName} (Session: ${sessionId})`);
      await storage.updateUserTokens(googleId, accessToken, refreshToken);
      user.accessToken = accessToken;
      user.refreshToken = refreshToken;
      return done(null, user);
    } else {
      // Create new user
      console.log(`[${timestamp}] Creating new user: ${profile.displayName} (Session: ${sessionId})`);
      const newUser = await storage.createUser({
        googleId,
        email: profile.emails?.[0]?.value || '',
        name: profile.displayName || '',
        picture: profile.photos?.[0]?.value,
        accessToken,
        refreshToken
      });
      console.log(`[${timestamp}] New user created: ${newUser.id} (Session: ${sessionId})`);
      return done(null, newUser);
    }
  } catch (error) {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] OAuth callback error:`, error);
    return done(error, undefined);
  }
}));

// Serialize user for session
passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

// Deserialize user from session
passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await storage.getUser(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});