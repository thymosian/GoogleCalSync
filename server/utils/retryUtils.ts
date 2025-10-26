/**
 * Utility functions for retry logic with exponential backoff
 */

/**
 * Retry an operation with exponential backoff and jitter
 * @param operation The async operation to retry
 * @param maxRetries Maximum number of retry attempts
 * @param initialDelay Initial delay in milliseconds
 * @param maxDelay Maximum delay in milliseconds
 * @returns Promise that resolves to the operation result
 */
export async function retryWithExponentialBackoff<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    initialDelay: number = 1000,
    maxDelay: number = 30000
): Promise<T> {
    let retryCount = 0;
    let delay = initialDelay;

    while (retryCount < maxRetries) {
        try {
            return await operation();
        } catch (error) {
            retryCount++;
            if (retryCount >= maxRetries) {
                throw error;
            }

            console.log(`API call failed, retrying (${retryCount}/${maxRetries}) in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));

            // Exponential backoff with jitter
            delay = Math.min(delay * 2 * (0.9 + Math.random() * 0.2), maxDelay);
        }
    }

    // This should never be reached, but just in case
    throw new Error('Retry logic failed unexpectedly');
}

/**
 * Check if an error is retryable (e.g., 503, 429, network errors)
 * @param error The error to check
 * @returns True if the error is retryable
 */
export function isRetryableError(error: any): boolean {
    if (!error) return false;

    // Check for HTTP status codes that indicate temporary issues
    const status = error.status || error.code;
    if (typeof status === 'number') {
        return status === 429 || status === 503 || status >= 500;
    }

    // Check for network-related errors
    const message = error.message?.toLowerCase() || '';
    return message.includes('network') ||
           message.includes('timeout') ||
           message.includes('connection') ||
           message.includes('overloaded') ||
           message.includes('rate limit');
}