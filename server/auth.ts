import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { storage } from "./storage";
import type { User } from "../shared/schema";

// Configure Google OAuth Strategy
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID!,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  callbackURL: "/api/auth/google/callback"
}, async (accessToken, refreshToken, profile, done) => {
  try {
    console.log('Google OAuth callback triggered for user:', profile.displayName);
    const googleId = profile.id;
    let user = await storage.getUserByGoogleId(googleId);
    
    if (user) {
      // Update tokens for existing user
      console.log('Updating existing user tokens');
      await storage.updateUserTokens(googleId, accessToken, refreshToken);
      user.accessToken = accessToken;
      user.refreshToken = refreshToken;
      return done(null, user);
    } else {
      // Create new user
      console.log('Creating new user');
      const newUser = await storage.createUser({
        googleId,
        email: profile.emails?.[0]?.value || '',
        name: profile.displayName || '',
        picture: profile.photos?.[0]?.value,
        accessToken,
        refreshToken
      });
      console.log('New user created:', newUser.id);
      return done(null, newUser);
    }
  } catch (error) {
    console.error('OAuth callback error:', error);
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