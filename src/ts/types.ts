// Core game types
export interface LLMResponse {
    story: string;
    image_prompt: string;
    choices: string[];
    ambience_prompt: string;
    new_memories?: string[]; // Optional - not every story beat needs to create memories
    summary?: string; // Optional field for story summaries
}

export interface GameSession {
    id: string; // UUID for the game session
    title: string; // User-defined or auto-generated title
    createdAt: number; // Timestamp when session was created
    lastPlayedAt: number; // Timestamp when session was last accessed
    initialPrompt: string; // The prompt that started this session
    config?: Partial<GameConfig>; // Config snapshot for this session
}

export interface GameState {
    sessionId?: string; // Current session UUID
    currentState: 'MENU' | 'LOADING' | 'PLAYING' | 'ERROR';
    messageHistory: Message[];
    storyLog: StoryEntry[];
    actionLog: ActionEntry[];
    memories: string[];
    isMusicPlaying: boolean;
    contextTokenCount: number;
    contextLimit: number | null;
    error?: {
        classification: ErrorClassification;
        retriesLeft: number;
    };
}

export interface Message {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface StoryEntry {
    id: string; // UUID for the story entry
    story: string;
    image_prompt: string;
    choices: string[];
    ambience_prompt: string;
    new_memories?: string[]; // Optional - not every story beat needs to create memories
    timestamp: number;
    imageData?: string; // Base64 encoded image data
}

export interface ActionEntry {
    choice: string;
    timestamp: number;
    outcome?: 'Success' | 'Partial Success' | 'Failure' | 'Start';
}

// Configuration types
export interface OllamaConfig {
    url: string;
    model: string;
    options: {
        temperature: number;
        top_p: number;
        max_tokens: number;
        num_predict?: number;
    };
}

export interface LoraConfig {
    name: string;
    strength: number; // 0.0 to 1.0
    enabled: boolean;
    tags: string; // Comma-separated trigger words/tags to add to prompts
}

export interface TextualInversionConfig {
    name: string;
    enabled: boolean;
    trigger: string; // Main trigger word for the embedding
    tags: string; // Additional tags to add to prompts
}

export interface StableDiffusionConfig {
    url: string;
    basePath: string; // Path to Stable Diffusion WebUI installation
    model: string;
    options: {
        steps: number;
        cfg_scale: number;
        sampler_name: string;
        width: number;
        height: number;
    };
    faceRestoration: 'auto' | 'always' | 'never';
    loras: LoraConfig[];
    textualInversions: TextualInversionConfig[];
}



export interface LoggingConfig {
    level: 'error' | 'warn' | 'info' | 'debug';
    consoleOutput: boolean;
    maxEntries: number;
}

export interface DatabaseConfig {
    name: string;
    version: number;
    maxEntries: number;
    autoBackup: boolean;
    backupInterval: number; // in minutes
    saveStorySteps: boolean; // Whether to save individual story steps
    autoDeleteOldStories: boolean; // Whether to automatically delete old stories
    maxStoriesToKeep: number; // Maximum number of stories to keep
    storyRetentionDays: number; // How many days to keep stories
}

export interface GameConfig {
    ollama: OllamaConfig;
    stableDiffusion: StableDiffusionConfig;
    logging: LoggingConfig;
    database: DatabaseConfig;
    enableAudio: boolean;
    enableIcons: boolean;
    gameName?: string; // Optional game name for the current session
}

// API response types
export interface OllamaGenerateResponse {
    model: string;
    created_at: string;
    response: string;
    done: boolean;
    done_reason?: string;
    total_duration?: number;
    context?: number[];
    load_duration: number;
    prompt_eval_count: number;
    prompt_eval_duration: number;
    eval_count: number;
    eval_duration: number;
}

export interface OllamaModelsResponse {
    models: {
        name: string;
        modified_at: string;
        size: number;
    }[];
}

export interface SDGenerateResponse {
    images: string[];
    parameters: any;
    info: string;
}

export interface SDModelsResponse {
    title: string;
    model_name: string;
    hash: string;
    sha256: string;
    filename: string;
    config: string;
}

// Error types
export interface ErrorClassification {
    type: 'network' | 'not_found' | 'server_error' | 'parse_error' | 'validation_error' | 'unknown';
    userMessage: string;
    retryable: boolean;
    action: 'check_connection' | 'check_url' | 'retry' | 'none';
}

// UI types
export interface UIState {
    currentTab: 'story' | 'history';
    isLoading: boolean;
    showSettings: boolean;
    showError: boolean;
    errorMessage: string;
    connectionStatus: {
        ollama: 'unknown' | 'connected' | 'error' | 'loading';
        stableDiffusion: 'unknown' | 'connected' | 'error' | 'loading';
    };
}
