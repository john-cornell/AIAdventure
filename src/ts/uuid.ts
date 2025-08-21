/**
 * Simple UUID v4 generator for browser environments
 * Generates RFC 4122 compliant UUIDs without external dependencies
 */

/**
 * Generate a UUID v4 string
 * @returns A UUID v4 string (e.g., "123e4567-e89b-12d3-a456-426614174000")
 */
export function generateUUID(): string {
    // Use crypto.randomUUID if available (modern browsers)
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    
    // Fallback implementation for older browsers
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * Generate a short UUID for display purposes (first 8 characters)
 * @returns A short UUID string (e.g., "123e4567")
 */
export function generateShortUUID(): string {
    return generateUUID().substring(0, 8);
}

/**
 * Validate if a string is a valid UUID v4
 * @param uuid The string to validate
 * @returns True if the string is a valid UUID v4
 */
export function isValidUUID(uuid: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
}

/**
 * Generate a human-readable title from a prompt
 * @param prompt The initial prompt or story text
 * @param maxLength Maximum length of the title (default: 50)
 * @returns A truncated, cleaned title
 */
export function generateTitleFromPrompt(prompt: string, maxLength: number = 50): string {
    if (!prompt || prompt.trim().length === 0) {
        return `Adventure ${generateShortUUID()}`;
    }
    
    // Clean the prompt: remove extra spaces, newlines, and special characters
    let title = prompt
        .trim()
        .replace(/\s+/g, ' ') // Replace multiple spaces with single space
        .replace(/[^\w\s\-.,!?]/g, '') // Remove special characters except basic punctuation
        .trim();
    
    // Truncate if too long
    if (title.length > maxLength) {
        title = title.substring(0, maxLength - 3) + '...';
    }
    
    // If title is empty after cleaning, generate a default
    if (title.length === 0) {
        return `Adventure ${generateShortUUID()}`;
    }
    
    return title;
}
