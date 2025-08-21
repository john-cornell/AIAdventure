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
import { saveStorySummary, loadStorySummary } from './database.js';

// Game state
let gameState: GameState = {
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
    { name: 'choices', type: 'array' },
    { name: 'ambience_prompt', type: 'string' }
    // new_memories is optional - not every story beat needs to create memories
];

// System prompt for the game
const systemPrompt = `You are an expert storyteller creating an interactive adventure game. Generate responses in JSON format with the following structure:

{
  "story": "A vivid, engaging description of the current scene and what happens next",
  "image_prompt": "A detailed visual description for generating an image of this scene",
  "choices": ["Choice 1", "Choice 2", "Choice 3"],
  "ambience_prompt": "A brief description of the ambient sounds/music for this scene",
  "new_memories": ["Important memory 1", "Important memory 2"]
}

IMPORTANT: The user's action will sometimes be prefixed with an [Outcome: ...]. You MUST respect this outcome in your generated story.
- [Outcome: Success]: The user's action succeeds fully and as intended.
- [Outcome: Partial Success]: The user's action succeeds, but with an unexpected twist, complication, or partial result.
- [Outcome: Failure]: The user's action fails, possibly with a negative consequence.
- If there is no outcome prefix, treat the input as the story's starting point or a neutral narrative progression.

Keep the story engaging, descriptive, and responsive to player choices. The story should be immersive and allow for meaningful player agency.`;

// Context management settings
const CONTEXT_WARNING_THRESHOLD = 0.8; // 80% of context limit
const CONTEXT_SUMMARY_THRESHOLD = 0.85; // 85% of context limit

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
            'You are an expert story analyst who creates detailed, comprehensive summaries focusing on the most important narrative elements, character development, and plot progression. Always return a proper summary, never just list the steps.',
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
        
        // Create summary message
        const summaryMessage: Message = {
            role: 'system',
            content: `Story Summary: ${summary}\n\nContinue the adventure from this point, referencing the summary for context.`
        };
        
        // Keep only recent messages and add summary
        const recentMessages = gameState.messageHistory.slice(-5); // Keep last 5 messages
        gameState.messageHistory = [summaryMessage, ...recentMessages];
        
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
        const response = await callLocalLLMWithRetry(systemPrompt, gameState.messageHistory, jsonFields, retries);
        logInfo('Game', 'Received LLM response', response);
        
        if (response && response.story) {
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

            // Add new memories (initialize as empty array if missing)
            const newMemories = response.new_memories || [];
            if (newMemories.length > 0) {
                gameState.memories.push(...newMemories);
                // Keep only last 10 memories
                gameState.memories = gameState.memories.slice(-10);
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

    // Build enhanced choice with context
    let enhancedChoice = finalChoice;
    
    // Add memories context
    const memoriesContext = getMemoriesContext();
    if (memoriesContext) {
        enhancedChoice = `${memoriesContext} ${enhancedChoice}`;
        logDebug('Game', `Added memories context: ${memoriesContext}`);
    }
    
    // Add story summary context (only occasionally to avoid overwhelming the LLM)
    // Add it every 5th action or when the story is getting long
    const shouldAddSummary = gameState.actionLog.length % 5 === 0 || gameState.messageHistory.length > 20;
    if (shouldAddSummary) {
        const storySummaryContext = await getStorySummaryContext();
        if (storySummaryContext) {
            enhancedChoice = `${storySummaryContext} ${enhancedChoice}`;
            logInfo('Game', `Added story summary context (${storySummaryContext.length} chars)`);
            logDebug('Game', `Story summary content: ${storySummaryContext.substring(0, 200)}...`);
        } else {
            logDebug('Game', 'No story summary context available');
        }
    } else {
        logDebug('Game', 'Skipping story summary context to avoid LLM overload');
    }

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
    gameState = { ...gameState, ...updates };
    
    // Notify UI of state change
    if (typeof window !== 'undefined' && window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent('gameStateChanged', { detail: gameState }));
    }
}

/**
 * Export game state for saving
 */
export function exportGameState(): string {
    const exportData = {
        gameState: gameState,
        exportDate: new Date().toISOString(),
        version: '1.0.6'
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
 */
export function resetGame(): void {
    // Clear current session
    currentSession = null;

    gameState = {
        currentState: 'MENU',
        messageHistory: [],
        storyLog: [],
        actionLog: [],
        memories: [],
        isMusicPlaying: false,
        contextTokenCount: 0, // Reset context token count
        contextLimit: null // Reset context limit
    };

    logInfo('Game', 'Game reset to menu state');

    // Notify UI of state change
    if (typeof window !== 'undefined' && window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent('gameStateChanged', { detail: gameState }));
    }
}

/**
 * Get memories for LLM context
 */
export function getMemoriesContext(): string {
    if (gameState.memories.length === 0) {
        return '';
    }
    return `[Memories: ${gameState.memories.join(', ')}]`;
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
 * Add memory manually
 */
export function addMemory(memory: string): void {
    gameState.memories.push(memory);
    // Keep only last 10 memories
    gameState.memories = gameState.memories.slice(-10);
}

/**
 * Clear all memories
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
export function exportSessionData(): string {
    const exportData = {
        session: currentSession,
        gameState: gameState,
        exportDate: new Date().toISOString(),
        version: '1.0.6'
    };
    return JSON.stringify(exportData, null, 2);
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
