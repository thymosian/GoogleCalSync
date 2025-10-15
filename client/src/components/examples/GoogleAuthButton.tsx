import { GoogleAuthButton } from '../GoogleAuthButton';
import { useState } from 'react';

export default function GoogleAuthButtonExample() {
  const [isLoading, setIsLoading] = useState(false);

  const handleSignIn = () => {
    setIsLoading(true);
    // Simulate OAuth flow
    setTimeout(() => {
      console.log('Google OAuth sign-in initiated');
      setIsLoading(false);
    }, 2000);
  };

  return (
    <GoogleAuthButton 
      onSignIn={handleSignIn}
      isLoading={isLoading}
    />
  );
}