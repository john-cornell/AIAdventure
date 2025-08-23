/**
 * Heuristic JSON Cleaner for LLM Responses
 * Handles common JSON formatting errors from AI models
 */

export interface CleanedJsonResult {
    success: boolean;
    json?: any;
    error?: string;
    cleaned?: string;
    originalIssues?: string[];
}

/**
 * Clean and parse potentially malformed JSON from LLM responses
 */
export function cleanAndParseJson(rawJson: string): CleanedJsonResult {
    const issues: string[] = [];
    let cleaned = rawJson.trim();

    // Step 1: Remove common prefixes/suffixes
    cleaned = removeCommonWrappers(cleaned, issues);

    // Step 2: Fix common JSON syntax issues
    cleaned = fixCommonJsonIssues(cleaned, issues);

    // Step 3: Fix trailing commas
    cleaned = fixTrailingCommas(cleaned, issues);

    // Step 4: Fix missing closing braces
    cleaned = fixMissingClosingBraces(cleaned, issues);

    // Step 5: Remove trailing characters
    cleaned = removeTrailingGarbage(cleaned, issues);

    // Try to parse the cleaned JSON
    try {
        const parsed = JSON.parse(cleaned);
        return {
            success: true,
            json: parsed,
            cleaned: cleaned,
            originalIssues: issues.length > 0 ? issues : undefined
        };
    } catch (error) {
        return {
            success: false,
            error: `Failed to parse even after cleaning: ${error}`,
            cleaned: cleaned,
            originalIssues: issues
        };
    }
}

/**
 * Remove common wrappers that LLMs sometimes add
 */
function removeCommonWrappers(json: string, issues: string[]): string {
    let cleaned = json;

    // Remove markdown code blocks
    if (cleaned.startsWith('```json') && cleaned.endsWith('```')) {
        cleaned = cleaned.slice(7, -3).trim();
        issues.push('Removed markdown json wrapper');
    } else if (cleaned.startsWith('```') && cleaned.endsWith('```')) {
        cleaned = cleaned.slice(3, -3).trim();
        issues.push('Removed markdown code wrapper');
    }

    // Remove common prefixes
    const prefixes = [
        'JSON:',
        'Response:',
        'Here is the JSON:',
        'The JSON response is:',
        'Here\'s the response:'
    ];

    for (const prefix of prefixes) {
        if (cleaned.toLowerCase().startsWith(prefix.toLowerCase())) {
            cleaned = cleaned.slice(prefix.length).trim();
            issues.push(`Removed prefix: ${prefix}`);
            break;
        }
    }

    return cleaned;
}

/**
 * Fix common JSON syntax issues
 */
function fixCommonJsonIssues(json: string, issues: string[]): string {
    let cleaned = json;
    let fixCount = 0;

    // Fix single quotes in JSON keys (convert to double quotes)
    cleaned = cleaned.replace(/'([^']+)':/g, (match, key) => {
        fixCount++;
        return `"${key}":`;
    });

    // Fix single quotes in JSON string values (convert to double quotes)
    cleaned = cleaned.replace(/:\s*'([^']+)'/g, (match, value) => {
        fixCount++;
        return `: "${value}"`;
    });

    // The main issue: the cleaner is adding \" at the start of values
    // Remove any \" that appears at the beginning of string values
    cleaned = cleaned.replace(/"\\"([^"]*?)"/g, (match, content) => {
        fixCount++;
        return `"${content}"`;
    });

    if (fixCount > 0) {
        issues.push(`Fixed ${fixCount} common JSON syntax issues`);
    }

    return cleaned;
}

/**
 * Fix mixed quote types (convert single quotes to double quotes where appropriate)
 */
function fixMixedQuotes(json: string, issues: string[]): string {
    let cleaned = json;
    let fixCount = 0;

    // Convert single quotes to double quotes for property names
    cleaned = cleaned.replace(/'([^']*)':/g, (match, key) => {
        fixCount++;
        return `"${key}":`;
    });

    // Convert single quotes to double quotes for string values (but be careful with apostrophes)
    cleaned = cleaned.replace(/:\s*'([^']*?)'/g, (match, value) => {
        // Don't convert if it contains unescaped double quotes
        if (value.includes('"') && !value.includes('\\"')) {
            return match; // Leave as single quotes
        }
        fixCount++;
        return `: "${value}"`;
    });

    // Convert single quotes in arrays
    cleaned = cleaned.replace(/\[\s*'([^']*?)'/g, (match, value) => {
        if (value.includes('"') && !value.includes('\\"')) {
            return match;
        }
        fixCount++;
        return `["${value}"`;
    });

    cleaned = cleaned.replace(/,\s*'([^']*?)'/g, (match, value) => {
        if (value.includes('"') && !value.includes('\\"')) {
            return match;
        }
        fixCount++;
        return `, "${value}"`;
    });

    if (fixCount > 0) {
        issues.push(`Fixed ${fixCount} mixed quote issues`);
    }

    return cleaned;
}

/**
 * Remove trailing commas that make JSON invalid
 */
function fixTrailingCommas(json: string, issues: string[]): string {
    let cleaned = json;
    let fixCount = 0;

    // Remove trailing commas before closing braces
    cleaned = cleaned.replace(/,(\s*})/g, (match, closing) => {
        fixCount++;
        return closing;
    });

    // Remove trailing commas before closing brackets
    cleaned = cleaned.replace(/,(\s*\])/g, (match, closing) => {
        fixCount++;
        return closing;
    });

    if (fixCount > 0) {
        issues.push(`Fixed ${fixCount} trailing comma issues`);
    }

    return cleaned;
}

/**
 * Add missing closing braces/brackets
 */
function fixMissingClosingBraces(json: string, issues: string[]): string {
    let cleaned = json;
    
    // Count opening and closing braces
    const openBraces = (cleaned.match(/{/g) || []).length;
    const closeBraces = (cleaned.match(/}/g) || []).length;
    const openBrackets = (cleaned.match(/\[/g) || []).length;
    const closeBrackets = (cleaned.match(/\]/g) || []).length;

    // Add missing closing braces
    if (openBraces > closeBraces) {
        const missing = openBraces - closeBraces;
        cleaned += '}' .repeat(missing);
        issues.push(`Added ${missing} missing closing brace(s)`);
    }

    // Add missing closing brackets
    if (openBrackets > closeBrackets) {
        const missing = openBrackets - closeBrackets;
        cleaned += ']'.repeat(missing);
        issues.push(`Added ${missing} missing closing bracket(s)`);
    }

    return cleaned;
}

/**
 * Remove trailing garbage characters after valid JSON
 */
function removeTrailingGarbage(json: string, issues: string[]): string {
    let cleaned = json;

    // Try to find the end of the JSON object
    let braceCount = 0;
    let inString = false;
    let escapeNext = false;
    let jsonEnd = -1;

    for (let i = 0; i < cleaned.length; i++) {
        const char = cleaned[i];

        if (escapeNext) {
            escapeNext = false;
            continue;
        }

        if (char === '\\') {
            escapeNext = true;
            continue;
        }

        if (char === '"' && !escapeNext) {
            inString = !inString;
            continue;
        }

        if (!inString) {
            if (char === '{') {
                braceCount++;
            } else if (char === '}') {
                braceCount--;
                if (braceCount === 0) {
                    jsonEnd = i;
                    break;
                }
            }
        }
    }

    if (jsonEnd > -1 && jsonEnd < cleaned.length - 1) {
        const garbage = cleaned.slice(jsonEnd + 1).trim();
        if (garbage.length > 0) {
            cleaned = cleaned.slice(0, jsonEnd + 1);
            issues.push(`Removed trailing garbage: "${garbage.slice(0, 50)}${garbage.length > 50 ? '...' : ''}"`);
        }
    }

    return cleaned;
}

/**
 * Validate that JSON contains required fields for LLM responses
 */
export function validateLLMResponse(json: any, requiredFields: string[]): { valid: boolean; missing: string[] } {
    if (!json || typeof json !== 'object') {
        return { valid: false, missing: requiredFields };
    }

    const missing = requiredFields.filter(field => !(field in json));
    return { valid: missing.length === 0, missing };
}

/**
 * Attempt to reconstruct missing fields with fallback values
 */
export function reconstructMissingFields(json: any, requiredFields: string[]): any {
    const reconstructed = { ...json };

    for (const field of requiredFields) {
        if (!(field in reconstructed)) {
            switch (field) {
                case 'story':
                    reconstructed.story = 'The story continues, but the details are unclear at this moment.';
                    break;
                case 'image_prompt':
                    reconstructed.image_prompt = 'A mysterious scene with unclear details, shadows and ambient lighting';
                    break;
                case 'choices':
                    reconstructed.choices = [
                        'Continue exploring',
                        'Investigate further',
                        'Take action',
                        'Proceed carefully'
                    ];
                    break;
                case 'new_memories':
                    reconstructed.new_memories = [];
                    break;
                default:
                    reconstructed[field] = null;
            }
        }
    }

    return reconstructed;
}
