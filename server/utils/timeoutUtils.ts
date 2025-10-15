/**
 * Execute a promise with a timeout
 * @param promise The promise to execute
 * @param timeoutMs Timeout in milliseconds
 * @returns Promise that resolves with the result or rejects with timeout error
 */
export async function executeWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise((resolve, reject) => {
        // Set up timeout
        const timeoutId = setTimeout(() => {
            reject(new Error(`Operation timed out after ${timeoutMs}ms`));
        }, timeoutMs);

        // Execute the promise
        promise
            .then((result) => {
                clearTimeout(timeoutId);
                resolve(result);
            })
            .catch((error) => {
                clearTimeout(timeoutId);
                reject(error);
            });
    });
}

/**
 * Create a timeout promise that rejects after specified time
 * @param timeoutMs Timeout in milliseconds
 * @param message Optional timeout message
 * @returns Promise that rejects after timeout
 */
export function createTimeoutPromise(timeoutMs: number, message?: string): Promise<never> {
    return new Promise((_, reject) => {
        setTimeout(() => {
            reject(new Error(message || `Timeout after ${timeoutMs}ms`));
        }, timeoutMs);
    });
}

/**
 * Race a promise against a timeout
 * @param promise The promise to race
 * @param timeoutMs Timeout in milliseconds
 * @param message Optional timeout message
 * @returns Promise that resolves with result or rejects with timeout
 */
export async function raceWithTimeout<T>(
    promise: Promise<T>, 
    timeoutMs: number, 
    message?: string
): Promise<T> {
    return Promise.race([
        promise,
        createTimeoutPromise(timeoutMs, message)
    ]);
}