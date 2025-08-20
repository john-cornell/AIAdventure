// Core game types
export interface LLMResponse {
    story: string;
    image_prompt: string;
    choices: string[];
    ambience_prompt: string;
    new_memories: string[];
}

export interface GameState {
    currentState: 'MENU' | 'LOADING' | 'PLAYING' | 'ERROR';
    messageHistory: Message[];
    storyLog: StoryEntry[];
    actionLog: ActionEntry[];
    memories: string[];
    isMusicPlaying: boolean;
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
    story: string;
    image_prompt: string;
    choices: string[];
    ambience_prompt: string;
    new_memories: string[];
    timestamp: number;
    imageData?: string; // Base64 encoded image data
}

export interface ActionEntry {
    choice: string;
    timestamp: number;
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

export interface StableDiffusionConfig {
    url: string;
    model: string;
    options: {
        steps: number;
        cfg_scale: number;
        sampler_name: string;
        width: number;
        height: number;
    };
}

export interface GameConfig {
    ollama: OllamaConfig;
    stableDiffusion: StableDiffusionConfig;
    enableAudio: boolean;
    enableIcons: boolean;
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
