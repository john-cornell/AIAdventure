import { 
    LLMResponse, 
    StoryEntry, 
    ActionEntry, 
    GameState, 
    GameSession,
    Message,
    ErrorClassification 
} from './types.js';
import { callLocalLLMWithRetry, classifyOllamaError, getModelContextLimit } from './ollama.js';
import { generateLocalImageWithRetry, generateLocalImageWithFaceRestoration, isFaceRestorationAvailable } from './stable-diffusion.js';
import { loadConfig, saveConfig } from './config.js';
import { logInfo, logWarn, logError, logDebug } from './logger.js';
import { generateUUID, generateTitleFromPrompt } from './uuid.js';
import { saveStorySummary, loadStorySummary, saveStoryStep } from './database.js';

/**
 * Get package version from package.json
 */
async function getPackageVersion(): Promise<string> {
    try {
        const response = await fetch('./package.json');
        const packageData = await response.json();
        return packageData.version || '1.0.0';
    } catch (error) {
        console.warn('⚠️ Could not load version from package.json:', error);
        return '1.0.0';
    }
}

// Game state
let gameState: GameState = {
    sessionId: undefined, // Initialize sessionId as undefined
    currentState: 'MENU',
    storyLog: [],
    messageHistory: [],
    actionLog: [],
    memories: [],
    isMusicPlaying: false,
    contextTokenCount: 0,
    contextLimit: null
};

// Current game session
let currentSession: GameSession | null = null;

// Expected JSON fields in LLM response
const jsonFields = [
    { name: 'story', type: 'string' },
    { name: 'image_prompt', type: 'string' },
    { name: 'choices', type: 'array' }
    // new_memories is optional - not every story beat needs to create memories
];

// Simplified fallback prompt for when the main prompt fails
const fallbackPrompt = `You are a storyteller. The user's command drives the story.

Respond with ONLY a JSON object containing:
{
  "story": "Show the user's action happening and what happens next",
  "image_prompt": "A visual description of the user's action",
  "choices": ["Choice 1", "Choice 2", "Choice 3", "Choice 4"],
  "new_memories": []
}

IMPORTANT: 
- Provide at least 2 choices (prefer 4). 
- Show the user's action happening in the story. 
- Use double quotes for all strings, escape quotes with \"
- 🚨 NEVER use character names in choices unless they have been explicitly introduced in the story
- 🚨 If a character hasn't been named yet, refer to them by their role/description (e.g., "the merchant", "the guard")
- NO OTHER TEXT. JUST THE JSON.`;

// System prompt for the game
const systemPrompt = `You are an expert storyteller creating an interactive adventure game. 

🚨 CRITICAL: You MUST return a COMPLETE JSON object with ALL required fields. NO EXCEPTIONS.
🚨 CRITICAL: Your job is to CONTINUE THE STORY, not summarize it. NEVER create summaries, NEVER editorialize, NEVER describe what happened. ONLY advance the plot with NEW events.

REQUIRED JSON RESPONSE FORMAT:
{
  "story": "A vivid, engaging description of the current scene and what happens next",
  "image_prompt": "A detailed visual description for generating an image of this scene", 
  "choices": ["Choice 1", "Choice 2", "Choice 3", "Choice 4"],
  "new_memories": ["Important memory 1", "Important memory 2"]
}

🚨 VALIDATION RULES:
- You MUST include ALL 3 required fields: story, image_prompt, choices
- choices MUST be an array with AT LEAST 2 choices (strongly prefer 4 choices)
- new_memories is optional - only include if there are SALIENT STORY POINTS worth remembering
- Return ONLY the JSON object, no other text
- NO markdown formatting, NO code blocks, NO explanations
- Use double quotes for all strings, escape quotes inside strings with \"
- STRONGLY PREFERRED: Always provide exactly 4 choices for best player experience

GAME INSTRUCTIONS:
🚨 CRITICAL: The user's command/action is the PRIMARY driver of what happens next
🚨 CRITICAL: ALWAYS respond directly to what the user wants to do
🚨 CRITICAL: The story should show the user's action happening and its immediate consequences

1. The user's command/action is the PRIMARY driver of what happens next
2. ALWAYS respond directly to what the user wants to do
3. The user's action will sometimes be prefixed with an [Outcome: ...]. 
   You MUST respect this outcome in your generated story.
   - [Outcome: Success]: The user's action succeeds fully and as intended.
   - [Outcome: Partial Success]: The user's action succeeds, but with an unexpected twist, complication, or partial result.
   - [Outcome: Failure]: The user's action fails, possibly with a negative consequence.
   - If there is no outcome prefix, treat the input as the story's starting point or a neutral narrative progression.

4. Use the provided context (summary, recent steps, memories) to inform your response, but the user's command takes priority
5. Keep the story engaging, descriptive, and responsive to player choices
6. The story should be immersive and allow for meaningful player agency
7. ALWAYS show the user's action happening in the story - don't just describe the scene

IMAGE PROMPT GUIDELINES:
- The image_prompt MUST capture the SPECIFIC ACTION the user commanded
- Focus on the moment of action, not just the scene
- Include dynamic elements that show the action happening
- Describe the character performing the action clearly
- Show the immediate consequences or results of the action
- Use action verbs and descriptive language that conveys movement
- If the user's action involves interaction with objects/people, show that interaction
- Make the image feel like a snapshot of the action in progress

CHOICE GUIDELINES:
- STRONGLY PREFERRED: Provide exactly 4 unique, meaningful choices for the best experience
- MINIMUM REQUIRED: At least 2 choices must be provided
- Each choice should represent a different course of action
- Choices should be specific and actionable
- Avoid repetitive or similar choices
- If you can only think of 2-3 choices, that's acceptable, but 4 is strongly preferred
- 🚨 CRITICAL: NEVER use character names in choices unless they have been explicitly introduced in the story
- 🚨 CRITICAL: If a character hasn't been named or introduced yet, refer to them by their role/description (e.g., "the merchant", "the guard", "the old woman")
- 🚨 CRITICAL: Only use names for characters that the player has actually met and learned the name of through story interaction

MEMORY GUIDELINES:
- Only create memories for SALIENT STORY POINTS that matter for narrative continuity
- Focus on: plot developments, character revelations, important discoveries, relationship changes, world-building details
- Examples of good memories: "The dragon revealed its true name", "Found the ancient map", "The village elder trusts us now", "The castle has a secret passage", "The merchant mentioned a prophecy"
- Examples of bad memories: "Walked down the hallway", "Opened a door", "Saw some trees", "The room was dusty", "It was dark"
- Memories should help the story remember what's important for future plot development, not every detail

EXAMPLES OF COMPLETE RESPONSES:

User: "I attack the dragon"
{
  "story": "With a fierce battle cry, you charge toward the massive dragon, your sword gleaming in the firelight. The beast rears back, its scales glinting like polished obsidian, and prepares to meet your assault with claws and flame.",
  "image_prompt": "A warrior in mid-swing, sword raised high, charging toward a massive dragon with scales glinting in firelight, action shot with dynamic movement, dramatic lighting",
  "choices": ["Continue the attack with full force", "Attempt to dodge and find a weak spot", "Call for backup from allies", "Try to negotiate or reason with the dragon"],

  "new_memories": ["The dragon's scales are incredibly tough", "The beast seems to respect courage in battle"]
}

User: "I search the room"
{
  "story": "You carefully examine the dimly lit chamber, your eyes scanning every corner and shadow. The flickering torchlight reveals ancient stone walls covered in mysterious runes, and scattered across the floor are various objects that might hold secrets or value.",
  "image_prompt": "A character crouching down, hands searching through scattered objects, torchlight illuminating dusty corners, focused investigative action, detailed environment",
  "choices": ["Examine the runes on the walls", "Search through the scattered objects", "Check for hidden doors or passages", "Investigate the source of the torchlight"],
  "new_memories": ["Ancient runes cover the walls", "The chamber appears to be a forgotten temple"]
}

🚨 FINAL REMINDER: 
- Return ONLY a complete JSON object with ALL required fields
- The user's command drives the story forward
- ALWAYS show the user's action happening in the story
- STRONGLY PREFERRED: Provide 4 choices, but minimum 2 choices required
- Make the story respond directly to what the user wants to do
- 🚨 NEVER use character names in choices unless they have been explicitly introduced in the story
- 🚨 NEVER create story summaries - only continue the narrative with new events and choices
🚨 ALWAYS provide 3-4 meaningful choices that advance the plot
- 🚨 ALWAYS advance the plot with the user's action, never editorialize or summarize`;

// Context management settings
const CONTEXT_WARNING_THRESHOLD = 0.8; // 80% of context limit
const CONTEXT_SUMMARY_THRESHOLD = 0.85; // 85% of context limit

// Repetition detection settings
const MAX_REPEATED_STEPS = 2; // Maximum number of repeated steps before summarizing
const MAX_REPEATED_CHOICES = 2; // Maximum number of repeated choice patterns

/**
 * Initialize context management
 */
async function initializeContextManagement(): Promise<void> {
    try {
        const contextLimit = await getModelContextLimit();
        if (contextLimit) {
            gameState.contextLimit = contextLimit;
            logInfo('Game', `Context management initialized. Limit: ${contextLimit.toLocaleString()} tokens`);
        } else {
            console.warn('⚠️ Could not determine context limit, using default monitoring');
        }
    } catch (error) {
        console.warn('⚠️ Context limit detection failed:', error);
    }
}

/**
 * Detect repetitive story steps
 */
function detectRepetitiveSteps(): boolean {
    if (gameState.storyLog.length < 3) return false;
    
    // Check last 3 story entries for repetition
    const recentSteps = gameState.storyLog.slice(-3);
    const stepTexts = recentSteps.map(step => step.story.toLowerCase().trim());
    
    // Check if any step text is repeated more than MAX_REPEATED_STEPS times
    const textCounts = new Map<string, number>();
    stepTexts.forEach(text => {
        textCounts.set(text, (textCounts.get(text) || 0) + 1);
    });
    
    for (const [text, count] of textCounts) {
        if (count > MAX_REPEATED_STEPS) {
            logWarn('Game', `Detected ${count} repeated story steps: "${text.substring(0, 100)}..."`);
            return true;
        }
    }
    
    return false;
}

/**
 * Detect repetitive choice patterns
 */
function detectRepetitiveChoices(): boolean {
    if (gameState.storyLog.length < 3) return false;
    
    // Check last 3 story entries for repetitive choices
    const recentSteps = gameState.storyLog.slice(-3);
    const choicePatterns = recentSteps.map(step => 
        step.choices.sort().join('|').toLowerCase()
    );
    
    // Check if choice patterns are repeated
    const patternCounts = new Map<string, number>();
    choicePatterns.forEach(pattern => {
        patternCounts.set(pattern, (patternCounts.get(pattern) || 0) + 1);
    });
    
    for (const [pattern, count] of patternCounts) {
        if (count > MAX_REPEATED_CHOICES) {
            logWarn('Game', `Detected ${count} repeated choice patterns`);
            return true;
        }
    }
    
    // Also check for repetitive player actions
    if (gameState.actionLog.length >= 3) {
        const recentActions = gameState.actionLog.slice(-3);
        const actionTexts = recentActions.map(action => action.choice.toLowerCase().trim());
        
        const actionCounts = new Map<string, number>();
        actionTexts.forEach(action => {
            actionCounts.set(action, (actionCounts.get(action) || 0) + 1);
        });
        
        for (const [action, count] of actionCounts) {
            if (count > MAX_REPEATED_STEPS) {
                logWarn('Game', `Detected ${count} repeated player actions: "${action}"`);
                return true;
            }
        }
    }
    
    return false;
}

/**
 * Check if we should summarize due to repetition
 */
function shouldSummarizeDueToRepetition(): boolean {
    return detectRepetitiveSteps() || detectRepetitiveChoices();
}

/**
 * Create a repetition-aware system prompt
 */
function getRepetitionAwareSystemPrompt(): string {
    const basePrompt = systemPrompt;
    
    if (shouldSummarizeDueToRepetition()) {
        return `${basePrompt}

REPETITION DETECTED - BREAK THE LOOP:
1. Summarize the recent events briefly
2. Introduce a significant change or new direction
3. Provide fresh, different choices
4. Move the story forward in a meaningful way
5. RESPOND DIRECTLY TO THE USER'S COMMAND with new developments

Avoid repeating similar scenarios or choices. The user's command should drive the story in a new direction.`;
    }
    
    return basePrompt;
}

/**
 * Create a summary of recent events when repetition is detected
 */
function createRepetitionSummary(): string {
    if (gameState.storyLog.length < 3) return '';
    
    const recentSteps = gameState.storyLog.slice(-3);
    const summary = recentSteps.map((step, index) => 
        `Step ${gameState.storyLog.length - 2 + index}: ${step.story.substring(0, 100)}...`
    ).join('\n');
    
    return `Recent events summary:\n${summary}\n\nTime to move the story forward with new developments.`;
}

/**
 * Estimate token count for a string (rough approximation)
 */
function estimateTokenCount(text: string): number {
    // Rough approximation: 1 token ≈ 4 characters for English text
    return Math.ceil(text.length / 4);
}

/**
 * Calculate current context usage
 */
function calculateContextUsage(): number {
    if (!gameState.contextLimit) return 0;
    
    // Count tokens in message history
    const messageTokens = gameState.messageHistory.reduce((total, msg) => {
        return total + estimateTokenCount(msg.content);
    }, 0);
    
    // Count tokens in system prompt
    const systemTokens = estimateTokenCount(systemPrompt);
    
    const totalTokens = messageTokens + systemTokens;
    gameState.contextTokenCount = totalTokens;
    
    return totalTokens / gameState.contextLimit;
}

/**
 * Check if context summarization is needed
 */
function shouldSummarizeContext(): boolean {
    if (!gameState.contextLimit) return false;
    
    const usageRatio = calculateContextUsage();
    return usageRatio >= CONTEXT_SUMMARY_THRESHOLD;
}

/**
 * Check if context warning should be shown
 */
function shouldWarnAboutContext(): boolean {
    if (!gameState.contextLimit) return false;
    
    const usageRatio = calculateContextUsage();
    return usageRatio >= CONTEXT_WARNING_THRESHOLD;
}

/**
 * Create a detailed summary of the story so far, focusing on important details
 */
async function createStorySummary(previousSummary?: string): Promise<string> {
    if (gameState.storyLog.length === 0) return '';
    
    logInfo('Game', `Creating story summary for ${gameState.storyLog.length} story entries`);
    logDebug('Game', 'Story summary creation details:', {
        storyLogLength: gameState.storyLog.length,
        hasPreviousSummary: !!previousSummary,
        previousSummaryLength: previousSummary?.length || 0
    });
    
    // Build the prompt with previous summary context
    let summaryPrompt = `Create a comprehensive summary of this adventure story, focusing on the MOST IMPORTANT details:

CRITICAL ELEMENTS TO INCLUDE:
- Character names, roles, and key traits
- Major plot developments and turning points
- Important locations and their significance
- Key decisions made by the player and their consequences
- Mysteries, secrets, or unresolved plot threads
- Character relationships and dynamics
- Items, abilities, or resources acquired
- Current situation and immediate context

IMPORTANT: Create a CONCISE but COMPREHENSIVE summary. Do NOT just list the steps. Synthesize the information into a coherent narrative summary.`;

    // Add previous summary context if available
    if (previousSummary) {
        summaryPrompt += `\n\nPREVIOUS SUMMARY FOR REFERENCE:
${previousSummary}

Please create a fresh, comprehensive summary that incorporates the established context from the previous summary while adding new developments from the recent story entries.`;
    }

    summaryPrompt += `\n\nStory entries to analyze:
${gameState.storyLog.map((entry, index) => 
    `STEP ${index + 1}: ${entry.story}`
).join('\n\n')}

Create a detailed summary that captures all essential narrative elements, character development, and plot progression. Focus on what matters most for continuing the story coherently.

RESPONSE FORMAT: Return ONLY a JSON object with a "story" field containing the summary text. Example:
{
  "story": "Your detailed summary here..."
}`;

    try {
        logDebug('Game', 'Calling LLM for story summary with prompt length:', summaryPrompt.length);
        
        const response = await callLocalLLMWithRetry(
            'You are an expert story analyst. Create detailed summaries focusing on narrative elements, character development, and plot progression. Return ONLY a JSON object with a "story" field containing the summary.',
            [{ role: 'user', content: summaryPrompt }],
            [{ name: 'story', type: 'string' }],
            2 // Increased retries for summary
        );
        
        logDebug('Game', 'LLM response received:', { 
            hasResponse: !!response, 
            hasStory: !!response?.story,
            storyLength: response?.story?.length || 0
        });
        
        if (!response || !response.story) {
            throw new Error('LLM returned empty or invalid response for story summary');
        }
        
        const summary = response.story.trim();
        if (summary.length < 50) {
            throw new Error(`LLM returned summary too short (${summary.length} chars): "${summary}"`);
        }
        
        logInfo('Game', `Story summary created successfully (${summary.length} chars)`);
        logDebug('Game', 'Story summary content:', { 
            summary: summary.substring(0, 200) + (summary.length > 200 ? '...' : ''),
            hadPreviousSummary: !!previousSummary 
        });
        return summary;
        
    } catch (error) {
        logError('Game', 'Failed to create story summary via LLM', error);
        logError('Game', 'Story summary error details:', {
            errorMessage: error instanceof Error ? error.message : 'Unknown error',
            errorStack: error instanceof Error ? error.stack : undefined,
            storyLogLength: gameState.storyLog.length,
            promptLength: summaryPrompt.length
        });
        
        // Improved fallback: create a better summary manually
        return createManualStorySummary(previousSummary);
    }
}

/**
 * Create a manual story summary when LLM fails
 */
function createManualStorySummary(previousSummary?: string): string {
    logInfo('Game', 'Creating manual story summary as fallback');
    
    try {
        // Extract key information from story entries
        const storyEntries = gameState.storyLog;
        const currentEntry = storyEntries[storyEntries.length - 1];
        
        // Create a basic summary focusing on the current situation
        let summary = '';
        
        if (previousSummary) {
            summary += `Building upon the previous events, `;
        }
        
        // Extract location and situation from current entry
        const currentStory = currentEntry.story.toLowerCase();
        let location = 'an unknown location';
        let situation = 'continuing the adventure';
        
        // Try to identify location and situation
        if (currentStory.includes('brothel') || currentStory.includes('establishment')) {
            location = 'a mysterious brothel';
            situation = 'exploring the establishment';
        } else if (currentStory.includes('room') || currentStory.includes('door')) {
            location = 'a fantastical room';
            situation = 'discovering new wonders';
        } else if (currentStory.includes('goddess') || currentStory.includes('lunar')) {
            location = 'a moonlit chamber';
            situation = 'encountering mystical beings';
        }
        
        // Create a narrative summary
        summary += `The adventure continues in ${location}. ${situation}. `;
        
        // Add progression information
        if (storyEntries.length > 1) {
            summary += `The story has progressed through ${storyEntries.length} significant steps, `;
            summary += `with the most recent developments focusing on the current situation. `;
        }
        
        // Add character information if available
        if (currentStory.includes('woman') || currentStory.includes('goddess')) {
            summary += `A mysterious figure has been encountered, adding to the intrigue of the adventure. `;
        }
        
        summary += `The journey continues with new discoveries and challenges ahead.`;
        
        logInfo('Game', `Manual story summary created (${summary.length} chars)`);
        logDebug('Game', 'Manual story summary content:', { summary });
        return summary;
        
    } catch (error) {
        logError('Game', 'Failed to create manual story summary', error);
        
        // Ultimate fallback: just return a basic message
        return `Story in progress with ${gameState.storyLog.length} completed steps. The adventure continues with new developments and discoveries.`;
    }
}

/**
 * Perform context cleanup and summarization
 */
async function performContextCleanup(): Promise<void> {
    logInfo('Game', 'Performing context cleanup...');

    try {
        // Load previous summary for context
        let previousSummary: string | undefined;
        if (gameState.sessionId) {
            try {
                const previousSummaryRecord = await loadStorySummary(gameState.sessionId);
                if (previousSummaryRecord) {
                    previousSummary = previousSummaryRecord.summary;
                    logDebug('Game', `Loaded previous summary (${previousSummary.length} chars) for cleanup context`);
                }
            } catch (error) {
                logWarn('Game', 'Failed to load previous summary for cleanup context', error);
            }
        }
        
        // Create story summary with previous context
        const summary = await createStorySummary(previousSummary);
        
        // Create context message - DO NOT use "summary" language
        const contextMessage: Message = {
            role: 'system',
            content: `Previous Story Context: ${summary}\n\n🚨 CRITICAL INSTRUCTIONS:\n- DO NOT create a summary\n- DO NOT editorialize about the story\n- DO NOT describe what happened\n- ONLY continue the adventure with NEW events, actions, and choices\n- The user will choose their next action\n- ADVANCE THE PLOT with something NEW`
        };
        
        // Keep only recent messages and add context
        const recentMessages = gameState.messageHistory.slice(-5); // Keep last 5 messages
        gameState.messageHistory = [contextMessage, ...recentMessages];
        
        // Keep only recent story entries (last 3)
        gameState.storyLog = gameState.storyLog.slice(-3);
        
        // Recalculate context usage
        calculateContextUsage();
        
        logInfo('Game', 'Context cleanup completed');
        logInfo('Game', `New context usage: ${((gameState.contextTokenCount / (gameState.contextLimit || 1)) * 100).toFixed(1)}%`);
        
    } catch (error) {
        console.error('❌ Context cleanup failed:', error);
        // Fallback: just clear old messages
        gameState.messageHistory = gameState.messageHistory.slice(-3);
    }
}

/**
 * Start a new game with the given prompt
 */
export async function startGame(initialPrompt: string): Promise<void> {
    // Create a new game session
    const sessionId = generateUUID();
    const sessionTitle = generateTitleFromPrompt(initialPrompt);
    const config = await loadConfig();
    
    // Set game name to AIAdventure_(sessionId) if not already set
    if (!config.gameName) {
        config.gameName = `AIAdventure_${sessionId}`;
        await saveConfig(config);
    }
    
    currentSession = {
        id: sessionId,
        title: sessionTitle,
        createdAt: Date.now(),
        lastPlayedAt: Date.now(),
        initialPrompt: initialPrompt,
        config: config // Snapshot current config
    };

    gameState = {
        sessionId: sessionId,
        currentState: 'LOADING',
        messageHistory: [],
        storyLog: [],
        actionLog: [],
        memories: [],
        isMusicPlaying: false,
        contextTokenCount: 0, // Reset context token count
        contextLimit: null // Reset context limit
    };

    logInfo('Game', `Started new game session: ${sessionTitle} (${sessionId})`);

    // Add initial prompt to message history
    if (initialPrompt.trim()) {
        gameState.messageHistory.push({
            role: 'user',
            content: initialPrompt
        });
    }

    // Initialize context management
    await initializeContextManagement();

    // Create initial story summary
    try {
        logDebug('Game', `Creating initial story summary for session ${sessionId}`);
        const initialSummary = `New adventure started with prompt: "${initialPrompt}". The story begins here...`;
        await saveStorySummary(sessionId, initialSummary, 0, 'initial');
        logInfo('Game', `Initial story summary saved to database for session ${sessionId}`);
    } catch (error) {
        logError('Game', 'Failed to save initial story summary to database', error);
        // Don't fail the game for summary save errors
    }

    // Execute the first LLM call and wait for it
    await executeLLMCall();
}

/**
 * Execute LLM call to generate next story segment
 */
export async function executeLLMCall(retries: number = 3): Promise<void> {
    logInfo('Game', 'Starting LLM call...');
    gameState.currentState = 'LOADING';
    
    // Notify UI of state change
    if (typeof window !== 'undefined' && window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent('gameStateChanged', { detail: gameState }));
    }

    // Check context usage before making the call
    const contextUsage = calculateContextUsage();
    if (shouldSummarizeContext()) {
        logWarn('Game', 'Context usage high, performing cleanup...');
        await performContextCleanup();
    } else if (shouldWarnAboutContext()) {
        logWarn('Game', `Context usage at ${(contextUsage * 100).toFixed(1)}% - approaching limit`);
    }

    try {
        logDebug('Game', 'Calling callLocalLLMWithRetry...');
        
        // Check for repetition and get appropriate system prompt
        const repetitionDetected = shouldSummarizeDueToRepetition();
        const currentSystemPrompt = getRepetitionAwareSystemPrompt();
        
        if (repetitionDetected) {
            logWarn('Game', 'Repetition detected - using enhanced system prompt to break the loop');
        }
        
        let response = await callLocalLLMWithRetry(currentSystemPrompt, gameState.messageHistory, jsonFields, retries);
        logInfo('Game', 'Received LLM response', response);
        
        // Fallback mechanism for incomplete responses
        if (response && response.story) {
            // Ensure all required fields are present
            if (!response.image_prompt) {
                logWarn('Game', 'Missing image_prompt in response, generating fallback');
                response.image_prompt = `A scene showing: ${response.story.substring(0, 100)}...`;
            }
            
            // 🚨 CRITICAL: DO NOT CHANGE THIS LOGIC - We've fixed this bug multiple times!
            // The LLM can return 2-4 choices. Only generate fallbacks if < 2 choices.
            // Previous bug: Using !== 4 rejected valid 3-choice responses
            if (!response.choices || !Array.isArray(response.choices) || response.choices.length < 2) {
                logWarn('Game', 'Invalid or missing choices in response, generating fallback choices');
                response.choices = [
                    "Continue exploring",
                    "Investigate further", 
                    "Take action",
                    "Proceed carefully"
                ];
            } else if (response.choices.length < 4) {
                logWarn('Game', `LLM provided ${response.choices.length} choices (prefer 4, but ${response.choices.length} is acceptable)`);
            }
            

            
            if (!response.new_memories) {
                response.new_memories = [];
            }
            // Add response to message history
            gameState.messageHistory.push({ 
                role: 'assistant', 
                content: JSON.stringify(response) 
            });

            // Create story entry with UUID
            const storyEntry: StoryEntry = {
                id: generateUUID(),
                ...response,
                timestamp: Date.now()
            };

            logInfo('Game', `Created story entry: ${storyEntry.id}`);

            gameState.storyLog.push(storyEntry);

            // Add new salient story points (initialize as empty array if missing)
            const newMemories = response.new_memories || [];
            if (newMemories.length > 0) {
                gameState.memories.push(...newMemories);
                // Keep only last 10 salient story points
                gameState.memories = gameState.memories.slice(-10);
            }

            // Save story step to database
            console.log('🔍 Database save check:', {
                hasSessionId: !!gameState.sessionId,
                sessionId: gameState.sessionId,
                actionLogLength: gameState.actionLog.length,
                storyLogLength: gameState.storyLog.length
            });
            
            if (gameState.sessionId && gameState.actionLog.length > 0) {
                try {
                    console.log('📡 Loading database config...');
                    const config = await loadConfig();
                    console.log('📡 Database config loaded:', {
                        saveStorySteps: config.database.saveStorySteps,
                        databaseEnabled: !!config.database
                    });
                    
                    if (config.database.saveStorySteps) {
                        const lastAction = gameState.actionLog[gameState.actionLog.length - 1];
                        // CRITICAL FIX: stepNumber should be the current step number (1-based)
                        // Since we just added the story entry, this is the correct step number
                        const stepNumber = gameState.storyLog.length;
                        
                        console.log('💾 Preparing to save story step:', {
                            sessionId: gameState.sessionId,
                            stepNumber,
                            storyEntryId: storyEntry.id,
                            choice: lastAction.choice,
                            outcome: lastAction.outcome,
                            storyLength: response.story.length,
                            imagePromptLength: response.image_prompt.length,
                            choicesCount: response.choices.length,
                            memoriesCount: newMemories.length,
                            timestamp: storyEntry.timestamp
                        });
                        
                        logInfo('Game', `Saving story step ${stepNumber} to database for session ${gameState.sessionId}`);
                        logDebug('Game', `Step details: choice="${lastAction.choice}", outcome="${lastAction.outcome}"`);
                        
                        console.log('💾 Calling saveStoryStep...');
                        await saveStoryStep(
                            gameState.sessionId,
                            stepNumber,
                            storyEntry.id,
                            lastAction.choice,
                            lastAction.outcome || 'Unknown',
                            response.story,
                            response.image_prompt,
                            response.choices,
                            newMemories,
                            storyEntry.timestamp,
                            storyEntry.imageData
                        );
                        console.log('✅ saveStoryStep completed successfully!');
                        logInfo('Game', `✅ Story step ${stepNumber} saved to database for session ${gameState.sessionId}`);
                        
                        // Verify the save by trying to load it back
                        try {
                            const { loadStorySteps } = await import('./database.js');
                            const savedSteps = await loadStorySteps(gameState.sessionId);
                            console.log('🔍 Verification: loaded steps from database:', savedSteps.length);
                            console.log('🔍 Latest saved step:', savedSteps[savedSteps.length - 1]);
                        } catch (verifyError) {
                            console.error('❌ Failed to verify save:', verifyError);
                        }
                        
                    } else {
                        console.warn('⚠️ Database saving is DISABLED in config (saveStorySteps: false)');
                        logWarn('Game', 'Database saving is disabled in config (saveStorySteps: false)');
                    }
                } catch (error) {
                    console.error('❌ CRITICAL DATABASE ERROR:', error);
                    console.error('❌ Error type:', (error as Error).constructor.name);
                    console.error('❌ Error message:', (error as Error).message);
                    console.error('❌ Error stack:', (error as Error).stack);
                    logError('Game', 'Failed to save story step to database', error);
                    // Show user-friendly error message
                    console.error('❌ Database Error: Failed to save story step. Your progress may not be saved.');
                    console.error('❌ Error details:', error);
                    // Don't fail the game for step save errors, but log them clearly
                }
            } else {
                console.warn('⚠️ Cannot save story step to database:');
                if (!gameState.sessionId) {
                    console.warn('  - No session ID');
                    logWarn('Game', 'Cannot save story step: no session ID');
                }
                if (gameState.actionLog.length === 0) {
                    console.warn('  - No action in action log');
                    logWarn('Game', 'Cannot save story step: no action in action log');
                }
            }

            // Update story summary in database
            if (gameState.sessionId) {
                try {
                    logDebug('Game', `Creating story summary for session ${gameState.sessionId} (step ${gameState.storyLog.length})`);
                    
                    // Load previous summary from database
                    let previousSummary: string | undefined;
                    try {
                        const previousSummaryRecord = await loadStorySummary(gameState.sessionId);
                        if (previousSummaryRecord) {
                            previousSummary = previousSummaryRecord.summary;
                            logDebug('Game', `Loaded previous summary (${previousSummary.length} chars) for context`);
                        }
                    } catch (error) {
                        logWarn('Game', 'Failed to load previous summary for context', error);
                        // Continue without previous summary
                    }
                    
                    const summary = await createStorySummary(previousSummary);
                    logInfo('Game', `Story summary created (${summary.length} chars)`);
                    
                    await saveStorySummary(
                        gameState.sessionId,
                        summary,
                        gameState.storyLog.length,
                        storyEntry.id
                    );
                    logInfo('Game', `Story summary saved to database for session ${gameState.sessionId}`);
                } catch (error) {
                    logError('Game', 'Failed to save story summary to database', error);
                    // Don't fail the game for summary save errors
                }
            }

            // Show story immediately
            gameState.currentState = 'PLAYING';
            
            // Notify UI to update with story content
            if (typeof window !== 'undefined' && window.dispatchEvent) {
                window.dispatchEvent(new CustomEvent('gameStateChanged', { detail: gameState }));
            }

            // Generate image asynchronously (don't wait for it)
            if (response.image_prompt) {
                generateImageAsync(response.image_prompt, storyEntry);
            }
        } else {
            throw new Error("Invalid response from Ollama LLM.");
        }
        
    } catch (error) {
        console.error(`❌ executeLLMCall: Ollama LLM call failed after ${retries} retries:`, error);
        
        // Try fallback prompt if this was a validation error
        if (error instanceof Error && error.message.includes('Missing required fields')) {
            logWarn('Game', 'Attempting fallback with simplified prompt...');
            try {
                const fallbackResponse = await callLocalLLMWithRetry(fallbackPrompt, gameState.messageHistory, jsonFields, 1);
                if (fallbackResponse && fallbackResponse.story) {
                    logInfo('Game', 'Fallback prompt succeeded, continuing with game');
                    
                    // Use the fallback response
                    let response = fallbackResponse;
                    
                    // Apply the same fallback mechanism
                    if (!response.image_prompt) {
                        response.image_prompt = `A scene showing: ${response.story.substring(0, 100)}...`;
                    }
                    
                    // 🚨 CRITICAL: DO NOT CHANGE THIS LOGIC - Same bug as above!
                    // The LLM can return 2-4 choices. Only generate fallbacks if < 2 choices.
                    if (!response.choices || !Array.isArray(response.choices) || response.choices.length < 2) {
                        response.choices = [
                            "Continue exploring",
                            "Investigate further", 
                            "Take action",
                            "Proceed carefully"
                        ];
                    } else if (response.choices.length < 4) {
                        logWarn('Game', `Fallback response: LLM provided ${response.choices.length} choices (prefer 4, but ${response.choices.length} is acceptable)`);
                    }
                    
                    
                    
                    if (!response.new_memories) {
                        response.new_memories = [];
                    }
                    
                    // Continue with the fallback response
                    // Add response to message history
                    gameState.messageHistory.push({ 
                        role: 'assistant', 
                        content: JSON.stringify(response) 
                    });

                    // Create story entry with UUID
                    const storyEntry: StoryEntry = {
                        id: generateUUID(),
                        ...response,
                        timestamp: Date.now()
                    };

                    gameState.storyLog.push(storyEntry);

                    // Add new salient story points
                    const newMemories = response.new_memories || [];
                    if (newMemories.length > 0) {
                        gameState.memories.push(...newMemories);
                        gameState.memories = gameState.memories.slice(-10);
                    }

                    // Save story step to database
                    if (gameState.sessionId && gameState.actionLog.length > 0) {
                        try {
                            const config = await loadConfig();
                            if (config.database.saveStorySteps) {
                                const lastAction = gameState.actionLog[gameState.actionLog.length - 1];
                                const stepNumber = gameState.storyLog.length;
                                
                                await saveStoryStep(
                                    gameState.sessionId,
                                    stepNumber,
                                    storyEntry.id,
                                    lastAction.choice,
                                    lastAction.outcome || 'Unknown',
                                    response.story,
                                    response.image_prompt,
                                    response.choices,
                                    newMemories,
                                    storyEntry.timestamp,
                                    storyEntry.imageData
                                );
                            }
                        } catch (error) {
                            logError('Game', 'Failed to save story step to database', error);
                        }
                    }

                    // Show story immediately
                    gameState.currentState = 'PLAYING';
                    
                    // Notify UI to update with story content
                    if (typeof window !== 'undefined' && window.dispatchEvent) {
                        window.dispatchEvent(new CustomEvent('gameStateChanged', { detail: gameState }));
                    }

                    // Generate image asynchronously
                    if (response.image_prompt) {
                        generateImageAsync(response.image_prompt, storyEntry);
                    }
                    
                    return; // Success with fallback
                }
            } catch (fallbackError) {
                logError('Game', 'Fallback prompt also failed', fallbackError);
            }
        }
        
        const errorClassification = classifyOllamaError(error instanceof Error ? error : new Error('Unknown error'));
        logError('Game', 'Error classification', errorClassification);
        handleOllamaError(errorClassification, retries);
        
    } finally {
        // Notify UI of state change
        if (typeof window !== 'undefined' && window.dispatchEvent) {
            window.dispatchEvent(new CustomEvent('gameStateChanged', { detail: gameState }));
        }
    }
}

/**
 * Analyze choice for risk level
 */
function analyzeRiskLevel(choice: string): number {
    const riskyKeywords = [
        'attack', 'fight', 'kill', 'destroy', 'explode', 'burn', 'poison', 'curse',
        'steal', 'rob', 'break', 'smash', 'jump', 'climb', 'swim', 'dive',
        'run', 'escape', 'sneak', 'spy', 'lie', 'cheat', 'betray', 'sacrifice',
        'dangerous', 'risky', 'foolish', 'reckless', 'desperate', 'suicidal'
    ];
    
    const choiceLower = choice.toLowerCase();
    let riskScore = 0;
    
    riskyKeywords.forEach(keyword => {
        if (choiceLower.includes(keyword)) {
            riskScore += 1;
        }
    });
    
    // Normalize risk score (0-1 scale)
    return Math.min(riskScore / 3, 1);
}

/**
 * Determine the outcome of a player action
 */
function determineOutcome(choice: string): 'Success' | 'Partial Success' | 'Failure' {
    const riskLevel = analyzeRiskLevel(choice);
    const baseRoll = Math.random();
    
    // Adjust roll based on risk level
    // Higher risk = higher chance of failure
    const adjustedRoll = baseRoll + (riskLevel * 0.3);
    
    if (adjustedRoll < 0.15) return 'Failure';
    if (adjustedRoll < 0.50) return 'Partial Success';
    return 'Success';
}

/**
 * Handle user choice selection
 */
export async function updateGame(choice: string): Promise<void> {
    if (gameState.currentState !== 'PLAYING') {
        console.warn('Cannot update game in current state:', gameState.currentState);
        return;
    }

    // Update session last played time
    if (currentSession) {
        currentSession.lastPlayedAt = Date.now();
    }

    // Determine outcome for this action
    const outcome = determineOutcome(choice);
    let finalChoice = choice;
    
    // Add outcome prefix to the choice (only for actions after the first one)
    if (gameState.messageHistory.length > 0) {
        finalChoice = `[Outcome: ${outcome}] ${choice}`;
    }
    
    // Add repetition summary if detected
    if (shouldSummarizeDueToRepetition()) {
        const repetitionSummary = createRepetitionSummary();
        finalChoice = `${finalChoice}\n\n[Repetition Detected: ${repetitionSummary}]`;
        logInfo('Game', 'Added repetition summary to user choice');
    }

    // Build enhanced choice with context in priority order
    let enhancedChoice = '';
    
    // 0. INITIAL PROMPT CONTEXT (only for first call when starting new game)
    if (gameState.storyLog.length === 0 && currentSession?.initialPrompt) {
        enhancedChoice = `INITIAL STORY PROMPT: ${currentSession.initialPrompt}\n\n`;
        logInfo('Game', `Added initial prompt context: ${currentSession.initialPrompt}`);
    }
    
    // 1. STORY SUMMARY FIRST (always include for context)
    const storySummaryContext = await getStorySummaryContext();
    if (storySummaryContext) {
        enhancedChoice += `${storySummaryContext}\n\n`;
        logInfo('Game', `Added story summary context (${storySummaryContext.length} chars)`);
        logDebug('Game', `Story summary content: ${storySummaryContext.substring(0, 200)}...`);
    } else {
        logDebug('Game', 'No story summary context available');
    }
    
    // 2. RECENT STORY STEPS (last 2-3 steps for immediate context)
    if (gameState.storyLog.length > 0) {
        const recentSteps = gameState.storyLog.slice(-2);
        const stepsContext = recentSteps.map((step, index) => 
            `Step ${gameState.storyLog.length - 1 + index}: ${step.story.substring(0, 150)}...`
        ).join('\n');
        
        enhancedChoice += `Recent Story Steps:\n${stepsContext}\n\n`;
        logDebug('Game', `Added recent steps context (${stepsContext.length} chars)`);
    }
    
    // 3. MEMORIES CONTEXT
    const memoriesContext = getMemoriesContext();
    if (memoriesContext) {
        enhancedChoice += `${memoriesContext}\n\n`;
        logDebug('Game', `Added memories context: ${memoriesContext}`);
    }
    
    // 4. USER COMMAND AT THE END (with strong emphasis)
    enhancedChoice += `RESPOND TO THE USER'S ACTION: ${finalChoice}\n\nIMPORTANT: The user's action/choice is the primary driver for what happens next.`;

    // Add user choice to message history
    gameState.messageHistory.push({
        role: 'user',
        content: enhancedChoice
    });

    // Add to action log with outcome
    const actionEntry: ActionEntry = {
        choice: choice,
        timestamp: Date.now(),
        outcome: outcome
    };
    gameState.actionLog.push(actionEntry);

    // Execute next LLM call
    executeLLMCall();
}

/**
 * Generate image asynchronously without blocking the UI
 */
async function generateImageAsync(imagePrompt: string, storyEntry: StoryEntry): Promise<void> {
    try {
        const config = await loadConfig();
        if (config.stableDiffusion.url) {
            logInfo('Game', 'Generating image asynchronously...');
            
            // Check face restoration setting and availability
            const faceRestorationSetting = config.stableDiffusion.faceRestoration;
            const faceRestorationAvailable = await isFaceRestorationAvailable();
            
            logDebug('Game', '=== IMAGE GENERATION REQUEST ===');
            logDebug('Game', 'Original Story Prompt', imagePrompt);
            logDebug('Game', 'Face restoration debug', {
                setting: faceRestorationSetting,
                available: faceRestorationAvailable
            });
            
            let imageData: string;
            if (faceRestorationSetting === 'always' && !faceRestorationAvailable) {
                logWarn('Game', 'Face restoration set to "always" but not available, falling back to standard generation...');
                imageData = await generateLocalImageWithRetry(imagePrompt);
            } else if (faceRestorationSetting === 'never') {
                logInfo('Game', 'Face restoration disabled, using standard generation...');
                imageData = await generateLocalImageWithRetry(imagePrompt);
            } else if (faceRestorationSetting === 'always' && faceRestorationAvailable) {
                logInfo('Game', 'Using face restoration (always enabled)...');
                imageData = await generateLocalImageWithFaceRestoration(imagePrompt);
            } else if (faceRestorationSetting === 'auto' && faceRestorationAvailable) {
                logInfo('Game', 'Using face restoration (auto-detected)...');
                imageData = await generateLocalImageWithFaceRestoration(imagePrompt);
            } else {
                logInfo('Game', 'Face restoration not available, using standard generation...');
                imageData = await generateLocalImageWithRetry(imagePrompt);
            }
            
            storyEntry.imageData = imageData;
            
            // Notify UI that image is ready
            if (typeof window !== 'undefined' && window.dispatchEvent) {
                window.dispatchEvent(new CustomEvent('gameStateChanged', { detail: gameState }));
            }
            logInfo('Game', 'Image generated successfully');
        }
    } catch (imageError) {
        console.warn('❌ Failed to generate image:', imageError);
        // Continue without image - story is already shown
    }
}

/**
 * Handle Ollama-specific errors
 */
function handleOllamaError(errorClassification: ErrorClassification, retriesLeft: number): void {
    // Remove last user message and action if this was a failed attempt
    if (gameState.messageHistory.length > 0 && gameState.messageHistory[gameState.messageHistory.length - 1].role === 'user') {
        gameState.messageHistory.pop();
    }
    if (gameState.actionLog.length > 0) {
        gameState.actionLog.pop();
    }

    // Set error state
    gameState.currentState = 'ERROR';
    gameState.error = {
        classification: errorClassification,
        retriesLeft: retriesLeft
    };

    // Notify UI of error
    if (typeof window !== 'undefined' && window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent('gameError', { 
            detail: { 
                error: errorClassification, 
                retriesLeft: retriesLeft 
            } 
        }));
        
        // Also notify UI of state change since action log was modified
        window.dispatchEvent(new CustomEvent('gameStateChanged', { detail: gameState }));
    }
}

/**
 * Retry the last action
 */
export async function retryLastAction(): Promise<void> {
    if (gameState.actionLog.length > 0) {
        const lastAction = gameState.actionLog[gameState.actionLog.length - 1];
        gameState.currentState = 'PLAYING';
        gameState.error = undefined;
        await updateGame(lastAction.choice);
    }
}

/**
 * Get current game state
 */
export function getGameState(): GameState {
    return { ...gameState };
}

/**
 * Update game state directly
 */
export function updateGameState(updates: Partial<GameState>): void {
    console.log('🔍 updateGameState called with updates:', updates);
    console.log('🔍 Current gameState before update:', gameState);
    gameState = { ...gameState, ...updates };
    console.log('🔍 New gameState after update:', gameState);
    
    // Notify UI of state change
    if (typeof window !== 'undefined' && window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent('gameStateChanged', { detail: gameState }));
    }
}

/**
 * Export game state for saving
 */
export async function exportGameState(): Promise<string> {
    const exportData = {
        gameState: gameState,
        exportDate: new Date().toISOString(),
        version: await getPackageVersion()
    };
    return JSON.stringify(exportData, null, 2);
}

/**
 * Import game state from saved data
 */
export function importGameState(jsonString: string): { success: boolean; error?: string } {
    try {
        const importData = JSON.parse(jsonString);
        
        if (!importData.gameState) {
            return { success: false, error: 'Invalid game state format' };
        }

        // Validate imported state
        const importedState = importData.gameState as GameState;
        if (!importedState.messageHistory || !importedState.storyLog || !importedState.actionLog) {
            return { success: false, error: 'Missing required game state fields' };
        }

        // Handle legacy data that doesn't have outcomes
        if (importedState.actionLog && importedState.actionLog.length > 0) {
            importedState.actionLog.forEach((action, index) => {
                if (!action.outcome) {
                    // For legacy data, assign outcomes based on position
                    if (index === 0) {
                        action.outcome = 'Start';
                    } else {
                        // Randomly assign outcomes for legacy actions
                        const roll = Math.random();
                        if (roll < 0.15) action.outcome = 'Failure';
                        else if (roll < 0.50) action.outcome = 'Partial Success';
                        else action.outcome = 'Success';
                    }
                }
            });
        }

        gameState = importedState;
        gameState.currentState = 'PLAYING'; // Reset to playing state

        // Notify UI of state change
        if (typeof window !== 'undefined' && window.dispatchEvent) {
            window.dispatchEvent(new CustomEvent('gameStateChanged', { detail: gameState }));
        }

        return { success: true };

    } catch (error) {
        return { 
            success: false, 
            error: `Failed to import game state: ${error instanceof Error ? error.message : 'Unknown error'}` 
        };
    }
}

/**
 * Reset game to menu state
 * @param preserveSessionId - Whether to preserve the current session ID (useful for reloading games)
 */
export function resetGame(preserveSessionId: boolean = false): void {
    // Store current session ID if we need to preserve it
    const currentSessionId = preserveSessionId ? gameState.sessionId : undefined;
    console.log('🔍 resetGame called with preserveSessionId:', preserveSessionId);
    console.log('🔍 Current session ID before reset:', gameState.sessionId);
    console.log('🔍 Session ID to preserve:', currentSessionId);
    
    // Clear current session (unless preserving session ID)
    if (!preserveSessionId) {
        currentSession = null;
    }

    gameState = {
        sessionId: currentSessionId, // Preserve or clear session ID based on parameter
        currentState: 'MENU',
        messageHistory: [],
        storyLog: [],
        actionLog: [],
        memories: [],
        isMusicPlaying: false,
        contextTokenCount: 0, // Reset context token count
        contextLimit: null // Reset context limit
    };

    console.log('🔍 New gameState after reset:', gameState);
    logInfo('Game', `Game reset to menu state${preserveSessionId ? ' (session ID preserved)' : ''}`);

    // Notify UI of state change
    if (typeof window !== 'undefined' && window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent('gameStateChanged', { detail: gameState }));
    }
}

/**
 * Get salient story points for LLM context
 */
export async function getMemoriesContext(): Promise<string> {
    const config = await loadConfig();
    
    // Check if memories are enabled and should be included in context
    if (!config.memories.enabled || !config.memories.includeInContext) {
        return '';
    }
    
    if (gameState.memories.length === 0) {
        return '';
    }
    
    // Limit memories based on config
    const maxMemories = config.memories.maxMemories;
    const memoriesToInclude = gameState.memories.slice(-maxMemories);
    
    // Add importance indicator based on config
    const importancePrefix = config.memories.memoryImportance === 'high' ? 'IMPORTANT STORY POINTS: ' : 
                           config.memories.memoryImportance === 'medium' ? 'Key Story Points: ' : 'Story Context: ';
    
    return `[${importancePrefix}${memoriesToInclude.join(', ')}]`;
}

/**
 * Get story summary for LLM context
 */
export async function getStorySummaryContext(): Promise<string> {
    if (!gameState.sessionId) {
        logDebug('Game', 'No session ID available for story summary');
        return '';
    }
    
    logDebug('Game', `Loading story summary for session: ${gameState.sessionId}`);
    
    try {
        const summaryRecord = await loadStorySummary(gameState.sessionId);
        if (summaryRecord && summaryRecord.summary) {
            logInfo('Game', `Loaded story summary from database (${summaryRecord.summary.length} chars)`);
            logDebug('Game', `Summary preview: ${summaryRecord.summary.substring(0, 100)}...`);
            return `[Story Summary: ${summaryRecord.summary}]`;
        } else {
            logDebug('Game', 'No story summary found in database');
        }
    } catch (error) {
        logError('Game', 'Failed to load story summary from database', error);
    }
    
    return '';
}

/**
 * Add salient story point manually
 */
export function addMemory(memory: string): void {
    gameState.memories.push(memory);
    // Keep only last 10 salient story points
    gameState.memories = gameState.memories.slice(-10);
}

/**
 * Clear all salient story points
 */
export function clearMemories(): void {
    gameState.memories = [];
}

/**
 * Toggle music state
 */
export function toggleMusic(): void {
    gameState.isMusicPlaying = !gameState.isMusicPlaying;
    
    // Notify UI of state change
    if (typeof window !== 'undefined' && window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent('gameStateChanged', { detail: gameState }));
    }
}

/**
 * Get current game session
 */
export function getCurrentSession(): GameSession | null {
    return currentSession ? { ...currentSession } : null;
}

/**
 * Update current session title
 */
export function updateSessionTitle(newTitle: string): void {
    if (currentSession) {
        currentSession.title = newTitle;
        currentSession.lastPlayedAt = Date.now();
        logInfo('Game', `Updated session title: ${newTitle}`);
    }
}

/**
 * Generate session export data including all session info and game state
 */
export async function exportSessionData(): Promise<string> {
    const exportData = {
        session: currentSession,
        gameState: gameState,
        exportDate: new Date().toISOString(),
        version: await getPackageVersion()
    };
    return JSON.stringify(exportData, null, 2);
}

/**
 * Auto-summarize steps and continue from summary
 */
export async function autoSummarizeSteps(): Promise<{ success: boolean; error?: string }> {
    try {
        if (gameState.currentState !== 'PLAYING') {
            return { success: false, error: 'Game must be in playing state to summarize' };
        }

        if (gameState.storyLog.length < 2) {
            return { success: false, error: 'Need at least 2 story steps to summarize' };
        }

        logInfo('Game', 'Starting auto-summarize steps process...');

        // Create a comprehensive summary of all current steps
        const summary = await createStorySummary();
        
        if (!summary) {
            return { success: false, error: 'Failed to create story summary' };
        }

        // Save the current story steps to database before clearing
        if (gameState.sessionId) {
            try {
                // Save all current steps to database
                for (let i = 0; i < gameState.storyLog.length; i++) {
                    const step = gameState.storyLog[i];
                    const action = gameState.actionLog[i] || { choice: 'Unknown', outcome: 'Unknown' };
                    
                    await saveStoryStep(
                        gameState.sessionId!,
                        i + 1,
                        step.id,
                        action.choice,
                        action.outcome || 'Unknown',
                        step.story,
                        step.image_prompt,
                        step.choices,

                        step.new_memories || [],
                        step.timestamp,
                        step.imageData
                    );
                }
                logInfo('Game', `Saved ${gameState.storyLog.length} story steps to database before summarization`);
            } catch (error) {
                logError('Game', 'Failed to save story steps to database during summarization', error);
                // Continue anyway - the steps are still in memory
            }
        }

        // Create a new story entry with the summary as "STEP 1: Summary"
        const summaryEntry: StoryEntry = {
            id: generateUUID(),
            story: `STEP 1: Summary\n\n${summary}\n\nThe adventure continues from this summarized state.`,
            image_prompt: 'A mystical scene representing the summarized journey so far, with elements from the story visible in the background',
            choices: [
                "Continue the adventure",
                "Explore new possibilities", 
                "Investigate further",
                "Take a different approach"
            ],

            timestamp: Date.now()
        };

        // Clear the old story log and replace with the summary entry
        gameState.storyLog = [summaryEntry];
        
        // Clear action log since we're starting fresh from summary
        gameState.actionLog = [];
        
        // Clear message history but keep the summary as context
        gameState.messageHistory = [
            {
                role: 'system',
                content: `Story Summary: ${summary}\n\nContinue the adventure from this summarized state.`
            }
        ];

        // Update story summary in database
        if (gameState.sessionId) {
            try {
                await saveStorySummary(
                    gameState.sessionId,
                    summary,
                    1, // Now we have 1 step (the summary)
                    summaryEntry.id
                );
                logInfo('Game', 'Updated story summary in database after auto-summarization');
            } catch (error) {
                logError('Game', 'Failed to update story summary in database', error);
            }
        }

        // Set game state to playing
        gameState.currentState = 'PLAYING';

        // Notify UI of state change
        if (typeof window !== 'undefined' && window.dispatchEvent) {
            window.dispatchEvent(new CustomEvent('gameStateChanged', { detail: gameState }));
        }

        logInfo('Game', 'Auto-summarize steps completed successfully');
        return { success: true };

    } catch (error) {
        logError('Game', 'Auto-summarize steps failed', error);
        return { 
            success: false, 
            error: `Auto-summarize failed: ${error instanceof Error ? error.message : 'Unknown error'}` 
        };
    }
}

/**
 * Import session data and restore both session and game state
 */
export function importSessionData(jsonString: string): { success: boolean; error?: string } {
    try {
        const importData = JSON.parse(jsonString);
        
        if (!importData.session || !importData.gameState) {
            return { success: false, error: 'Invalid session data format' };
        }

        // Validate imported data
        const importedSession = importData.session as GameSession;
        const importedState = importData.gameState as GameState;
        
        if (!importedSession.id || !importedState.messageHistory || !importedState.storyLog) {
            return { success: false, error: 'Missing required session or game state fields' };
        }

        // Restore session and game state
        currentSession = importedSession;
        gameState = importedState;
        gameState.currentState = 'PLAYING'; // Reset to playing state

        logInfo('Game', `Imported session: ${currentSession.title} (${currentSession.id})`);

        // Notify UI of state change
        if (typeof window !== 'undefined' && window.dispatchEvent) {
            window.dispatchEvent(new CustomEvent('gameStateChanged', { detail: gameState }));
        }

        return { success: true };

    } catch (error) {
        return { 
            success: false, 
            error: `Failed to import session data: ${error instanceof Error ? error.message : 'Unknown error'}` 
        };
    }
}
