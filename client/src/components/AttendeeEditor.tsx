import React, { useState, useEffect, useCallback } from 'react';
import { Plus, X, Loader2, CheckCircle, AlertCircle, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { AttendeeData } from '../../../shared/schema';

// Email validation utility
const validateEmailFormat = (email: string): boolean => {
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  return emailRegex.test(email);
};

// Validation result interface matching the server
interface EmailValidationResult {
  email: string;
  isValid: boolean;
  exists: boolean;
  firstName?: string;
  lastName?: string;
  profilePicture?: string;
  isGoogleUser: boolean;
}

export interface AttendeeEditorProps {
  attendees: AttendeeData[];
  onAttendeesChange: (attendees: AttendeeData[]) => void;
  onValidation?: (results: EmailValidationResult[]) => void;
  maxAttendees?: number;
  className?: string;
  disabled?: boolean;
}

export function AttendeeEditor({
  attendees,
  onAttendeesChange,
  onValidation,
  maxAttendees = 50,
  className,
  disabled = false
}: AttendeeEditorProps) {
  const [newEmail, setNewEmail] = useState('');
  const [validatingEmails, setValidatingEmails] = useState<Set<string>>(new Set());
  const [validationErrors, setValidationErrors] = useState<Map<string, string>>(new Map());
  const [globalError, setGlobalError] = useState<string>('');
  const [isAddingAttendee, setIsAddingAttendee] = useState(false);

  // Debounced validation function
  const validateEmailDebounced = useCallback(
    debounce(async (email: string) => {
      if (!validateEmailFormat(email)) {
        setValidationErrors(prev => new Map(prev.set(email, 'Invalid email format')));
        return;
      }

      setValidatingEmails(prev => new Set(prev.add(email)));
      setValidationErrors(prev => {
        const newMap = new Map(prev);
        newMap.delete(email);
        return newMap;
      });

      try {
        const response = await fetch('/api/attendees/validate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email }),
        });

        if (!response.ok) {
          throw new Error(`Validation failed: ${response.statusText}`);
        }

        const result: EmailValidationResult = await response.json();
        
        if (onValidation) {
          onValidation([result]);
        }

        // Update attendee data if it exists
        const existingIndex = attendees.findIndex(a => a.email.toLowerCase() === email.toLowerCase());
        if (existingIndex !== -1) {
          const updatedAttendees = [...attendees];
          updatedAttendees[existingIndex] = {
            ...updatedAttendees[existingIndex],
            firstName: result.firstName,
            lastName: result.lastName,
            profilePicture: result.profilePicture,
            isValidated: result.exists && result.isGoogleUser,
          };
          onAttendeesChange(updatedAttendees);
        }

      } catch (error) {
        console.error('Email validation error:', error);
        setValidationErrors(prev => new Map(prev.set(email, 'Validation failed. Please try again.')));
      } finally {
        setValidatingEmails(prev => {
          const newSet = new Set(prev);
          newSet.delete(email);
          return newSet;
        });
      }
    }, 500),
    [attendees, onAttendeesChange, onValidation]
  );

  // Real-time validation as user types
  useEffect(() => {
    if (newEmail.trim() && validateEmailFormat(newEmail.trim())) {
      validateEmailDebounced(newEmail.trim().toLowerCase());
    }
  }, [newEmail, validateEmailDebounced]);

  const addAttendee = async () => {
    const email = newEmail.trim().toLowerCase();
    
    if (!email) {
      setGlobalError('Please enter an email address');
      return;
    }

    if (!validateEmailFormat(email)) {
      setGlobalError('Please enter a valid email address');
      return;
    }

    // Check for duplicates
    if (attendees.some(a => a.email.toLowerCase() === email)) {
      setGlobalError('This attendee is already added');
      return;
    }

    if (attendees.length >= maxAttendees) {
      setGlobalError(`Maximum ${maxAttendees} attendees allowed`);
      return;
    }

    setIsAddingAttendee(true);
    setGlobalError('');

    try {
      // Validate the email
      const response = await fetch('/api/attendees/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        throw new Error(`Validation failed: ${response.statusText}`);
      }

      const result: EmailValidationResult = await response.json();

      const newAttendee: AttendeeData = {
        email,
        firstName: result.firstName,
        lastName: result.lastName,
        profilePicture: result.profilePicture,
        isValidated: result.exists && result.isGoogleUser,
        isRequired: true,
      };

      const updatedAttendees = [...attendees, newAttendee];
      onAttendeesChange(updatedAttendees);
      setNewEmail('');

      if (onValidation) {
        onValidation([result]);
      }

    } catch (error) {
      console.error('Error adding attendee:', error);
      setGlobalError('Failed to validate email. Please try again.');
    } finally {
      setIsAddingAttendee(false);
    }
  };

  const removeAttendee = (index: number) => {
    const updatedAttendees = attendees.filter((_, i) => i !== index);
    onAttendeesChange(updatedAttendees);
    setGlobalError('');
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addAttendee();
    }
  };

  const getAttendeeDisplayName = (attendee: AttendeeData): string => {
    if (attendee.firstName) {
      return attendee.lastName ? `${attendee.firstName} ${attendee.lastName}` : attendee.firstName;
    }
    return attendee.email;
  };

  const getAttendeeInitials = (attendee: AttendeeData): string => {
    if (attendee.firstName) {
      const firstInitial = attendee.firstName.charAt(0).toUpperCase();
      const lastInitial = attendee.lastName ? attendee.lastName.charAt(0).toUpperCase() : '';
      return firstInitial + lastInitial;
    }
    return attendee.email.charAt(0).toUpperCase();
  };

  return (
    <Card className={cn("w-full max-w-2xl", className)}>
      <CardHeader className="pb-4">
        <CardTitle className="text-lg flex items-center gap-2">
          <User className="h-5 w-5 text-blue-500" />
          Meeting Attendees
          <Badge variant="secondary" className="ml-auto">
            {attendees.length}/{maxAttendees}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add attendee input */}
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Input
              value={newEmail}
              onChange={(e) => {
                setNewEmail(e.target.value);
                setGlobalError('');
              }}
              onKeyDown={handleKeyPress}
              placeholder="Enter email address"
              disabled={disabled || isAddingAttendee}
              className={cn(
                "pr-8",
                validationErrors.has(newEmail.trim().toLowerCase()) && "border-destructive"
              )}
            />
            {validatingEmails.has(newEmail.trim().toLowerCase()) && (
              <Loader2 className="absolute right-2 top-1/2 transform -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>
          <Button
            onClick={addAttendee}
            disabled={
              disabled ||
              !newEmail.trim() ||
              isAddingAttendee ||
              validatingEmails.has(newEmail.trim().toLowerCase()) ||
              attendees.length >= maxAttendees
            }
            className="shrink-0"
          >
            {isAddingAttendee ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Add
          </Button>
        </div>

        {/* Validation error for current input */}
        {validationErrors.has(newEmail.trim().toLowerCase()) && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {validationErrors.get(newEmail.trim().toLowerCase())}
            </AlertDescription>
          </Alert>
        )}

        {/* Global error */}
        {globalError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{globalError}</AlertDescription>
          </Alert>
        )}

        {/* Attendees list */}
        {attendees.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">
              Added Attendees ({attendees.length})
            </h4>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {attendees.map((attendee, index) => (
                <div
                  key={`${attendee.email}-${index}`}
                  className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg border"
                >
                  <Avatar className="h-8 w-8">
                    {attendee.profilePicture ? (
                      <AvatarImage src={attendee.profilePicture} alt={getAttendeeDisplayName(attendee)} />
                    ) : null}
                    <AvatarFallback className="text-xs">
                      {getAttendeeInitials(attendee)}
                    </AvatarFallback>
                  </Avatar>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">
                        {getAttendeeDisplayName(attendee)}
                      </p>
                      {attendee.isValidated ? (
                        <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-yellow-600 shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {attendee.email}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {attendee.isValidated ? (
                      <Badge variant="default" className="text-xs bg-green-100 text-green-800">
                        Verified
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs">
                        Unverified
                      </Badge>
                    )}
                    
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeAttendee(index)}
                      disabled={disabled}
                      className="h-8 w-8 p-0 hover:bg-destructive/10 hover:text-destructive"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {attendees.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <User className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No attendees added yet</p>
            <p className="text-xs">Enter email addresses above to add attendees</p>
          </div>
        )}

        {/* Help text */}
        <div className="text-xs text-muted-foreground space-y-1">
          <p>• Email addresses will be validated in real-time</p>
          <p>• Verified attendees have their Google profile information loaded</p>
          <p>• Duplicate email addresses will be automatically prevented</p>
        </div>
      </CardContent>
    </Card>
  );
}

// Debounce utility function
function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}