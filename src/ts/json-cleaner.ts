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
 * Detect if the AI is summarizing instead of continuing the story
 */
export function detectSummarization(json: any): { isSummarizing: boolean; reason: string } {
    if (!json || !json.story) {
        return { isSummarizing: false, reason: 'No story content to analyze' };
    }
    
    const story = json.story.toLowerCase();
    
    // Common summarization indicators
    const summaryKeywords = [
        'initially', 'have grown', 'have acquired', 'have encountered', 'have discovered',
        'their camaraderie has', 'they\'ve acquired', 'they\'ve encountered', 'they\'ve discovered',
        'recently', 'since then', 'now', 'currently', 'despite the tension',
        'alex has', 'rachel has', 'they have', 'both have'
    ];
    
    // Check for repetitive past tense descriptions
    const pastTensePatterns = [
        /\bhave\s+\w+ed\b/g,  // "have discovered", "have encountered"
        /\bhas\s+\w+ed\b/g,   // "has activated", "has planted"
        /\bwere\s+\w+ing\b/g, // "were investigating", "were exploring"
        /\bwas\s+\w+ing\b/g   // "was approaching", "was activating"
    ];
    
    let summaryScore = 0;
    
    // Check for summary keywords
    summaryKeywords.forEach(keyword => {
        if (story.includes(keyword)) {
            summaryScore += 1;
        }
    });
    
    // Check for past tense patterns
    pastTensePatterns.forEach(pattern => {
        const matches = story.match(pattern);
        if (matches) {
            summaryScore += matches.length * 0.5;
        }
    });
    
    // Check for repetitive structure (multiple "have" statements)
    const haveCount = (story.match(/\bhave\b/g) || []).length;
    if (haveCount > 3) {
        summaryScore += haveCount - 2;
    }
    
    // Check for "currently" or "now" followed by past events
    if (story.includes('currently') || story.includes('now')) {
        const afterCurrent = story.split(/(?:currently|now)/)[1];
        if (afterCurrent && pastTensePatterns.some(pattern => pattern.test(afterCurrent))) {
            summaryScore += 2;
        }
    }
    
    const isSummarizing = summaryScore >= 3;
    const reason = isSummarizing 
        ? `Detected summarization (score: ${summaryScore.toFixed(1)}). Contains summary keywords, past tense patterns, and repetitive structure.`
        : `No summarization detected (score: ${summaryScore.toFixed(1)})`;
    
    return { isSummarizing, reason };
}

/**
 * Detect if the story response is too short or incomplete
 */
export function detectPoorStoryQuality(json: any): { isPoorQuality: boolean; reason: string; score: number } {
    if (!json || !json.story) {
        return { isPoorQuality: true, reason: 'No story content', score: 0 };
    }
    
    const story = json.story;
    let qualityScore = 0;
    const issues: string[] = [];
    
    // Check story length (too short = poor quality)
    if (story.length < 100) {
        qualityScore -= 3;
        issues.push(`Story too short (${story.length} chars, need 100+)`);
    } else if (story.length < 200) {
        qualityScore -= 1;
        issues.push(`Story somewhat short (${story.length} chars)`);
    } else if (story.length >= 300) {
        qualityScore += 2;
    }
    
    // Check for incomplete sentences (ending with incomplete words)
    const incompleteEndings = story.match(/\w+\s*$/);
    if (incompleteEndings && incompleteEndings[0].length < 5) {
        qualityScore -= 2;
        issues.push('Story ends with incomplete sentence');
    }
    
    // Check for abrupt endings (ending with dialogue or action)
    const abruptEndings = story.match(/(['"][^'"]*$|\.\.\.$|\w+\s*$)/);
    if (abruptEndings) {
        qualityScore -= 1;
        issues.push('Story has abrupt ending');
    }
    
    // Check for meaningful content (not just setup)
    const meaningfulContent = story.match(/\b(but|however|suddenly|then|next|meanwhile|finally|eventually)\b/gi);
    if (meaningfulContent && meaningfulContent.length >= 2) {
        qualityScore += 1;
    }
    
    // Check for action or dialogue (not just description)
    const hasAction = story.match(/\b(you|rachel|alex|mr\. thompson)\b/gi);
    const hasDialogue = story.match(/['"][^'"]*['"]/);
    if (hasAction && hasAction.length >= 2) {
        qualityScore += 1;
    }
    if (hasDialogue) {
        qualityScore += 1;
    }
    
    // Check for story progression (not just status update)
    const progressionWords = story.match(/\b(decide|choose|realize|notice|discover|find|see|hear|feel|think)\b/gi);
    if (progressionWords && progressionWords.length >= 2) {
        qualityScore += 1;
    }
    
    const isPoorQuality = qualityScore < 0;
    const reason = isPoorQuality 
        ? `Poor story quality (score: ${qualityScore}): ${issues.join(', ')}`
        : `Good story quality (score: ${qualityScore})`;
    
    return { isPoorQuality, reason, score: qualityScore };
}

/**
 * Ask LLM to confirm if story actually progressed
 */
export async function confirmStoryProgression(
    previousStep: string, 
    playerChoice: string, 
    newResponse: string
): Promise<{ confirmed: boolean; reason: string }> {
    try {
        const prompt = `Previous: "${previousStep}"
Choice: "${playerChoice}" 
New: "${newResponse}"

Did the story progress? Answer only: yes or no.`;

        // Import the LLM call function
        const { callLocalLLM } = await import('./ollama.js');
        
        // Call LLM for simple yes/no confirmation
        const response = await callLocalLLM(prompt, [], [
            { name: 'story', type: 'string' }
        ]);

        // Check for simple yes/no response
        if (response && response.story) {
            const answer = response.story.toLowerCase().trim();
            if (answer.includes('yes') || answer.includes('yay')) {
                return {
                    confirmed: true,
                    reason: 'LLM confirmed: Story progressed'
                };
            } else if (answer.includes('no') || answer.includes('nay')) {
                return {
                    confirmed: false,
                    reason: 'LLM confirmed: No story progression'
                };
            }
        }
        
        // Fallback if LLM response is unclear
        return {
            confirmed: true, // Default to allowing the story
            reason: 'LLM response unclear, defaulting to allow progression'
        };
    } catch (error) {
        console.error('Failed to confirm story progression with LLM:', error);
        // Fallback to allowing the story if confirmation fails
        return {
            confirmed: true,
            reason: 'LLM confirmation failed, defaulting to allow progression'
        };
    }
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
