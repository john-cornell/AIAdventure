import { 
    GameState, 
    LLMResponse, 
    Message, 
    StoryEntry, 
    ActionEntry,
    ErrorClassification 
} from './types.js';
import { callLocalLLMWithRetry, classifyOllamaError } from './ollama.js';
import { generateLocalImageWithRetry } from './stable-diffusion.js';
import { loadConfig } from './config.js';

// Game state
let gameState: GameState = {
    currentState: 'MENU',
    messageHistory: [],
    storyLog: [],
    actionLog: [],
    memories: [],
    isMusicPlaying: false
};

// System prompt for the LLM
const systemPrompt = `You are an expert storyteller and game master for a dynamic, text-based adventure game. Your primary goal is to create a unique, unpredictable, and engaging story based on the user's input. Avoid common tropes like "chosen one" narratives or fetch quests for ancient relics unless the user specifically guides the story in that direction. Be creative and adaptive, embracing any genre or theme that emerges from the user's actions, from high fantasy and deep space sci-fi to slice-of-life mystery or surreal horror.

IMPORTANT: The user's action will sometimes be prefixed with an [Outcome: ...]. You MUST respect this outcome in your generated story.
- [Outcome: Success]: The user's action succeeds fully and as intended.
- [Outcome: Partial Success]: The user's action succeeds, but with an unexpected twist, complication, or partial result.
- [Outcome: Failure]: The user's action fails, possibly with a negative consequence.
- If there is no outcome prefix, treat the input as the story's starting point or a neutral narrative progression.

IMPORTANT: The user's input might also be prefixed with [Memories: ...]. These are key learnings or important plot points from the adventure; consider them in your narrative development.

You MUST ALWAYS respond with a JSON object containing five fields:
1. "story": A string containing the next part of the story narrative (2-4 sentences). Keep it concise and evocative.
2. "image_prompt": A short, descriptive string (5-10 words) for an AI image generator to create a visual for the scene. This should be in a style appropriate to the story's genre (e.g., 'epic fantasy painting', 'cinematic sci-fi concept art', 'gritty noir photograph').
3. "choices": An array of 3 to 4 short strings representing the actions the player can take next. If the story reaches a conclusion, provide a single choice: "Play Again?".
4. "ambience_prompt": A short, descriptive string for a loopable background sound that fits the scene's mood (e.g., 'eerie cave drips', 'futuristic city hum', 'gentle forest winds').
5. "new_memories": An array of 0-2 new strings (2-5 words each) representing important memories or lessons learned from the current scene. Only include truly significant takeaways. If no new memories are formed, provide an empty array [].
Do not include any other text or explanations outside of the JSON object. The story should be continuous and build upon previous events.`;

// Expected JSON fields for validation
const jsonFields = [
    { name: 'story', type: 'string' },
    { name: 'image_prompt', type: 'string' },
    { name: 'choices', type: 'array' },
    { name: 'ambience_prompt', type: 'string' },
    { name: 'new_memories', type: 'array' }
];

/**
 * Start a new game with the given prompt
 */
export function startGame(initialPrompt: string): void {
    gameState = {
        currentState: 'LOADING',
        messageHistory: [],
        storyLog: [],
        actionLog: [],
        memories: [],
        isMusicPlaying: false
    };

    // Add initial prompt to message history
    if (initialPrompt.trim()) {
        gameState.messageHistory.push({
            role: 'user',
            content: initialPrompt
        });
    }

    // Execute the first LLM call
    executeLLMCall();
}

/**
 * Execute LLM call to generate next story segment
 */
export async function executeLLMCall(retries: number = 3): Promise<void> {
    gameState.currentState = 'LOADING';
    
    // Notify UI of state change
    if (typeof window !== 'undefined' && window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent('gameStateChanged', { detail: gameState }));
    }

    try {
        const response = await callLocalLLMWithRetry(systemPrompt, gameState.messageHistory, jsonFields, retries);
        
        if (response && response.story) {
            // Add response to message history
            gameState.messageHistory.push({ 
                role: 'assistant', 
                content: JSON.stringify(response) 
            });

            // Create story entry
            const storyEntry: StoryEntry = {
                ...response,
                timestamp: Date.now()
            };

            gameState.storyLog.push(storyEntry);

            // Add new memories
            if (response.new_memories && response.new_memories.length > 0) {
                gameState.memories.push(...response.new_memories);
                // Keep only last 10 memories
                gameState.memories = gameState.memories.slice(-10);
            }

            // Generate image if Stable Diffusion is enabled
            if (response.image_prompt) {
                try {
                    const config = loadConfig();
                    if (config.stableDiffusion.url) {
                        const imageData = await generateLocalImageWithRetry(response.image_prompt);
                        storyEntry.imageData = imageData;
                    }
                } catch (imageError) {
                    console.warn('Failed to generate image:', imageError);
                    // Continue without image
                }
            }

            gameState.currentState = 'PLAYING';
        } else {
            throw new Error("Invalid response from Ollama LLM.");
        }
        
    } catch (error) {
        console.error(`Ollama LLM call failed after ${retries} retries:`, error);
        
        const errorClassification = classifyOllamaError(error instanceof Error ? error : new Error('Unknown error'));
        handleOllamaError(errorClassification, retries);
        
    } finally {
        // Notify UI of state change
        if (typeof window !== 'undefined' && window.dispatchEvent) {
            window.dispatchEvent(new CustomEvent('gameStateChanged', { detail: gameState }));
        }
    }
}

/**
 * Handle user choice selection
 */
export function updateGame(choice: string): void {
    if (gameState.currentState !== 'PLAYING') {
        console.warn('Cannot update game in current state:', gameState.currentState);
        return;
    }

    // Add user choice to message history
    gameState.messageHistory.push({
        role: 'user',
        content: choice
    });

    // Add to action log
    const actionEntry: ActionEntry = {
        choice: choice,
        timestamp: Date.now()
    };
    gameState.actionLog.push(actionEntry);

    // Execute next LLM call
    executeLLMCall();
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
export function retryLastAction(): void {
    if (gameState.actionLog.length > 0) {
        const lastAction = gameState.actionLog[gameState.actionLog.length - 1];
        gameState.currentState = 'PLAYING';
        gameState.error = undefined;
        updateGame(lastAction.choice);
    }
}

/**
 * Get current game state
 */
export function getGameState(): GameState {
    return { ...gameState };
}

/**
 * Export game state for saving
 */
export function exportGameState(): string {
    const exportData = {
        gameState: gameState,
        exportDate: new Date().toISOString(),
        version: '1.0.0'
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
    gameState = {
        currentState: 'MENU',
        messageHistory: [],
        storyLog: [],
        actionLog: [],
        memories: [],
        isMusicPlaying: false
    };

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
