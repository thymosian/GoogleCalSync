import { google } from 'googleapis';
import { User } from '../shared/schema';
import { performanceMonitor } from './performanceMonitor';

// Scopes required for People API access
const PEOPLE_API_SCOPES = [
    'https://www.googleapis.com/auth/contacts.readonly',
    'https://www.googleapis.com/auth/directory.readonly'
];

/**
 * Interface for email validation results
 */
export interface EmailValidationResult {
    email: string;
    isValid: boolean;
    exists: boolean;
    firstName?: string;
    lastName?: string;
    profilePicture?: string;
    isGoogleUser: boolean;
}

/**
 * Interface for person information from Google People API
 */
export interface PersonInfo {
    email: string;
    firstName: string;
    lastName?: string;
    profilePicture?: string;
    isGoogleUser: boolean;
}

/**
 * AttendeeValidator class for real-time email validation using Google People API
 */
export class AttendeeValidator {
    private cache: Map<string, EmailValidationResult> = new Map();
    private cacheExpiry: Map<string, number> = new Map();
    private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
    private readonly MAX_CACHE_SIZE = 1000;

    // Performance metrics
    private cacheHits = 0;
    private cacheMisses = 0;
    private totalValidations = 0;
    private validationTimes: number[] = [];

    /**
     * Get Google People API client
     */
    private getPeopleClient(accessToken: string) {
        const oauth2Client = new google.auth.OAuth2();
        oauth2Client.setCredentials({ access_token: accessToken });
        return google.people({ version: 'v1', auth: oauth2Client });
    }

    /**
     * Validate email format using regex
     */
    private isValidEmailFormat(email: string): boolean {
        // More comprehensive email validation regex
        const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

        // Additional checks for common invalid patterns
        if (email.includes('..') || email.startsWith('.') || email.endsWith('.')) {
            return false;
        }

        return emailRegex.test(email);
    }

    /**
     * Check if cached result is still valid
     */
    private isCacheValid(email: string): boolean {
        const expiry = this.cacheExpiry.get(email);
        return expiry ? Date.now() < expiry : false;
    }

    /**
     * Store result in cache
     */
    private setCacheResult(email: string, result: EmailValidationResult): void {
        this.cache.set(email, result);
        this.cacheExpiry.set(email, Date.now() + this.CACHE_DURATION);
        this.optimizeCache();
    }

    /**
     * Get cached result if available and valid
     */
    private getCachedResult(email: string): EmailValidationResult | null {
        const startTime = Date.now();
        
        if (this.isCacheValid(email)) {
            this.cacheHits++;
            const result = this.cache.get(email) || null;
            
            // Record cache hit performance
            performanceMonitor.recordCacheMetrics('attendeeValidation', true, Date.now() - startTime);
            
            return result;
        }
        
        // Clean up expired cache entries
        this.cache.delete(email);
        this.cacheExpiry.delete(email);
        this.cacheMisses++;
        
        // Record cache miss performance
        performanceMonitor.recordCacheMetrics('attendeeValidation', false, Date.now() - startTime);
        
        return null;
    }

    /**
     * Optimize cache by removing least recently used entries when cache is full
     */
    private optimizeCache(): void {
        if (this.cache.size >= this.MAX_CACHE_SIZE) {
            // Remove oldest 20% of entries
            const entriesToRemove = Math.floor(this.MAX_CACHE_SIZE * 0.2);
            const sortedEntries = Array.from(this.cacheExpiry.entries())
                .sort(([, a], [, b]) => a - b)
                .slice(0, entriesToRemove);

            for (const [email] of sortedEntries) {
                this.cache.delete(email);
                this.cacheExpiry.delete(email);
            }
        }
    }
    /**
       * Validate a single email address in real-time
       */
    async validateEmail(email: string, user: User): Promise<EmailValidationResult> {
        const startTime = Date.now();
        this.totalValidations++;

        // Check cache first
        const cachedResult = this.getCachedResult(email);
        if (cachedResult) {
            this.validationTimes.push(Date.now() - startTime);
            return cachedResult;
        }

        // Basic format validation
        if (!this.isValidEmailFormat(email)) {
            const result: EmailValidationResult = {
                email,
                isValid: false,
                exists: false,
                isGoogleUser: false
            };
            this.setCacheResult(email, result);
            return result;
        }

        try {
            if (!user.accessToken) {
                throw new Error('User access token is missing');
            }

            const people = this.getPeopleClient(user.accessToken);

            // Try to search for the person by email
            const searchResponse = await people.people.searchContacts({
                query: email,
                readMask: 'names,emailAddresses,photos'
            });

            const results = searchResponse.data.results || [];

            // Look for exact email match
            const exactMatch = results.find(result =>
                result.person?.emailAddresses?.some(emailAddr =>
                    emailAddr.value?.toLowerCase() === email.toLowerCase()
                )
            );

            if (exactMatch && exactMatch.person) {
                const person = exactMatch.person;
                const primaryName = person.names?.[0];
                const primaryPhoto = person.photos?.[0];

                const result: EmailValidationResult = {
                    email,
                    isValid: true,
                    exists: true,
                    firstName: primaryName?.givenName || undefined,
                    lastName: primaryName?.familyName || undefined,
                    profilePicture: primaryPhoto?.url || undefined,
                    isGoogleUser: true
                };

                this.setCacheResult(email, result);
                return result;
            }

            // If not found in contacts, try to get person info directly
            try {
                const personResponse = await people.people.get({
                    resourceName: `people/${email}`,
                    personFields: 'names,emailAddresses,photos'
                });

                if (personResponse.data) {
                    const person = personResponse.data;
                    const primaryName = person.names?.[0];
                    const primaryPhoto = person.photos?.[0];

                    const result: EmailValidationResult = {
                        email,
                        isValid: true,
                        exists: true,
                        firstName: primaryName?.givenName || undefined,
                        lastName: primaryName?.familyName || undefined,
                        profilePicture: primaryPhoto?.url || undefined,
                        isGoogleUser: true
                    };

                    this.setCacheResult(email, result);
                    return result;
                }
            } catch (directLookupError) {
                // Direct lookup failed, but email format is valid
                console.log(`Direct lookup failed for ${email}:`, directLookupError);
            }

            // Email format is valid but person not found in Google
            const result: EmailValidationResult = {
                email,
                isValid: true,
                exists: false,
                isGoogleUser: false
            };

            this.setCacheResult(email, result);
            return result;

        } catch (error) {
            console.error('Error validating email:', error);

            // Return basic validation result on API error
            const result: EmailValidationResult = {
                email,
                isValid: this.isValidEmailFormat(email),
                exists: false,
                isGoogleUser: false
            };

            // Don't cache API errors, only cache successful results
            this.validationTimes.push(Date.now() - startTime);
            return result;
        } finally {
            // Always record validation time
            if (this.validationTimes.length === 0) {
                this.validationTimes.push(Date.now() - startTime);
            }
        }
    }

    /**
     * Get detailed person information from Google People API
     */
    async getPersonInfo(email: string, user: User): Promise<PersonInfo | null> {
        try {
            const validationResult = await this.validateEmail(email, user);

            if (!validationResult.exists || !validationResult.isGoogleUser) {
                return null;
            }

            return {
                email: validationResult.email,
                firstName: validationResult.firstName || '',
                lastName: validationResult.lastName,
                profilePicture: validationResult.profilePicture,
                isGoogleUser: validationResult.isGoogleUser
            };
        } catch (error) {
            console.error('Error getting person info:', error);
            return null;
        }
    }

    /**
     * Validate multiple email addresses in batch
     */
    async validateBatch(emails: string[], user: User): Promise<EmailValidationResult[]> {
        // Remove duplicates while preserving order
        const uniqueEmails = this.removeDuplicates(emails);

        // Process emails in parallel with a reasonable concurrency limit
        const BATCH_SIZE = 5;
        const results: EmailValidationResult[] = [];

        for (let i = 0; i < uniqueEmails.length; i += BATCH_SIZE) {
            const batch = uniqueEmails.slice(i, i + BATCH_SIZE);
            const batchPromises = batch.map(email => this.validateEmail(email, user));

            try {
                const batchResults = await Promise.all(batchPromises);
                results.push(...batchResults);
            } catch (error) {
                console.error('Error in batch validation:', error);
                // Add failed results for this batch
                const failedResults = batch.map(email => ({
                    email,
                    isValid: this.isValidEmailFormat(email),
                    exists: false,
                    isGoogleUser: false
                }));
                results.push(...failedResults);
            }
        }

        return results;
    }

    /**
     * Remove duplicate emails from a list
     */
    removeDuplicates(emails: string[]): string[] {
        const seen: { [key: string]: boolean } = {};
        return emails.filter(email => {
            const normalizedEmail = email.toLowerCase().trim();
            if (seen[normalizedEmail]) {
                return false;
            }
            seen[normalizedEmail] = true;
            return true;
        });
    }
    /**
        * Clear the validation cache
        */
    clearCache(): void {
        this.cache.clear();
        this.cacheExpiry.clear();
        // Reset performance metrics
        this.cacheHits = 0;
        this.cacheMisses = 0;
        this.totalValidations = 0;
        this.validationTimes = [];
    }

    /**
     * Get cache statistics for monitoring
     */
    getCacheStats(): {
        size: number;
        hitRate: number;
        totalValidations: number;
        averageValidationTime: number;
        cacheEfficiency: number;
    } {
        const hitRate = this.totalValidations > 0 ? this.cacheHits / this.totalValidations : 0;
        const averageValidationTime = this.validationTimes.length > 0
            ? this.validationTimes.reduce((sum, time) => sum + time, 0) / this.validationTimes.length
            : 0;
        const cacheEfficiency = this.totalValidations > 0
            ? (this.cacheHits / this.totalValidations) * 100
            : 0;

        return {
            size: this.cache.size,
            hitRate,
            totalValidations: this.totalValidations,
            averageValidationTime,
            cacheEfficiency
        };
    }

    /**
     * Get performance metrics for monitoring
     */
    getPerformanceMetrics(): {
        cacheStats: {
            size: number;
            hitRate: number;
            totalValidations: number;
            averageValidationTime: number;
            cacheEfficiency: number;
        };
        recentValidationTimes: number[];
        slowValidations: number;
        fastValidations: number;
    } {
        const recentValidationTimes = this.validationTimes.slice(-50); // Last 50 validations
        const slowValidations = this.validationTimes.filter(time => time > 2000).length;
        const fastValidations = this.validationTimes.filter(time => time <= 500).length;

        return {
            cacheStats: this.getCacheStats(),
            recentValidationTimes,
            slowValidations,
            fastValidations
        };
    }

    /**
     * Preload validation results for a batch of emails
     * Useful for warming up the cache before user interactions
     */
    async preloadValidation(emails: string[], user: User): Promise<void> {
        const uniqueEmails = this.removeDuplicates(emails);
        const uncachedEmails = uniqueEmails.filter(email => !this.isCacheValid(email));

        if (uncachedEmails.length > 0) {
            await this.validateBatch(uncachedEmails, user);
        }
    }

    /**
     * Get validation results for emails that are already cached
     * Returns null for emails not in cache
     */
    getCachedValidations(emails: string[]): (EmailValidationResult | null)[] {
        return emails.map(email => this.getCachedResult(email));
    }

    /**
     * Warm up cache with frequently used emails
     */
    async warmUpCache(emails: string[], user: User): Promise<void> {
        const uncachedEmails = emails.filter(email => !this.isCacheValid(email));

        if (uncachedEmails.length > 0) {
            // Validate in small batches to avoid overwhelming the API
            const WARM_UP_BATCH_SIZE = 3;
            for (let i = 0; i < uncachedEmails.length; i += WARM_UP_BATCH_SIZE) {
                const batch = uncachedEmails.slice(i, i + WARM_UP_BATCH_SIZE);
                await Promise.all(batch.map(email => this.validateEmail(email, user)));

                // Small delay between batches to be respectful to the API
                if (i + WARM_UP_BATCH_SIZE < uncachedEmails.length) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }
        }
    }
}

// Export singleton instance
export const attendeeValidator = new AttendeeValidator();