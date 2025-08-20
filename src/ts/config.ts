import { GameConfig, OllamaConfig, StableDiffusionConfig } from './types.js';

// Default configuration
const defaultConfig: GameConfig = {
    ollama: {
        url: 'http://localhost:11434',
        model: 'gpt-oss:20b', // Using larger model for better quality
        options: {
            temperature: 0.7,
            top_p: 0.9,
            max_tokens: 1000,
            num_predict: 1000
        }
    },
    stableDiffusion: {
        url: 'http://127.0.0.1:7860',
        model: 'default',
        options: {
            width: 512,
            height: 512,
            steps: 20,
            cfg_scale: 7,
            sampler_name: 'Euler a'
        }
    },
    enableAudio: false,
    enableIcons: false
};

// Configuration storage key
const CONFIG_STORAGE_KEY = 'ai_adventure_config';

/**
 * Load configuration from localStorage or return defaults
 */
export function loadConfig(): GameConfig {
    try {
        const stored = localStorage.getItem(CONFIG_STORAGE_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            // Merge with defaults to ensure all fields exist
            return mergeConfig(defaultConfig, parsed);
        }
    } catch (error) {
        console.warn('Failed to load configuration from localStorage:', error);
    }
    return { ...defaultConfig };
}

/**
 * Save configuration to localStorage
 */
export function saveConfig(config: GameConfig): void {
    try {
        localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
    } catch (error) {
        console.error('Failed to save configuration to localStorage:', error);
    }
}

/**
 * Reset configuration to defaults
 */
export function resetConfig(): GameConfig {
    const config = { ...defaultConfig };
    saveConfig(config);
    return config;
}

/**
 * Update specific configuration section
 */
export function updateConfig<K extends keyof GameConfig>(
    section: K, 
    updates: Partial<GameConfig[K]>
): GameConfig {
    const config = loadConfig();
    (config[section] as any) = { ...(config[section] as any), ...updates };
    saveConfig(config);
    return config;
}

/**
 * Merge configurations, ensuring all required fields exist
 */
function mergeConfig(defaultConfig: GameConfig, userConfig: Partial<GameConfig>): GameConfig {
    return {
        ollama: { ...defaultConfig.ollama, ...userConfig.ollama },
        stableDiffusion: { ...defaultConfig.stableDiffusion, ...userConfig.stableDiffusion },
        enableAudio: userConfig.enableAudio ?? defaultConfig.enableAudio,
        enableIcons: userConfig.enableIcons ?? defaultConfig.enableIcons
    };
}

/**
 * Validate configuration
 */
export function validateConfig(config: GameConfig): { valid: boolean; errors: string[]; warnings: string[] } {
    const result = {
        valid: true,
        errors: [] as string[],
        warnings: [] as string[]
    };

    // Validate Ollama configuration
    if (!config.ollama.url) {
        result.errors.push('Ollama URL is required');
        result.valid = false;
    } else {
        try {
            new URL(config.ollama.url);
        } catch (error) {
            result.errors.push('Invalid Ollama URL format');
            result.valid = false;
        }
    }

    if (!config.ollama.model) {
        result.errors.push('Ollama model selection is required');
        result.valid = false;
    }

    // Validate Ollama options
    if (config.ollama.options.temperature < 0 || config.ollama.options.temperature > 2) {
        result.warnings.push('Ollama temperature should be between 0 and 2');
    }

    if (config.ollama.options.max_tokens < 1 || config.ollama.options.max_tokens > 4096) {
        result.warnings.push('Ollama max tokens should be between 1 and 4096');
    }

    // Validate Stable Diffusion configuration
    if (!config.stableDiffusion.url) {
        result.errors.push('Stable Diffusion URL is required');
        result.valid = false;
    } else {
        try {
            new URL(config.stableDiffusion.url);
        } catch (error) {
            result.errors.push('Invalid Stable Diffusion URL format');
            result.valid = false;
        }
    }

    if (!config.stableDiffusion.model) {
        result.errors.push('Stable Diffusion model selection is required');
        result.valid = false;
    }

    // Validate SD options
    if (config.stableDiffusion.options.steps < 1 || config.stableDiffusion.options.steps > 100) {
        result.warnings.push('SD steps should be between 1 and 100');
    }

    if (config.stableDiffusion.options.cfg_scale < 1 || config.stableDiffusion.options.cfg_scale > 20) {
        result.warnings.push('SD CFG scale should be between 1 and 20');
    }

    if (config.stableDiffusion.options.width < 64 || config.stableDiffusion.options.width > 2048) {
        result.warnings.push('SD width should be between 64 and 2048');
    }

    if (config.stableDiffusion.options.height < 64 || config.stableDiffusion.options.height > 2048) {
        result.warnings.push('SD height should be between 64 and 2048');
    }

    return result;
}

/**
 * Export configuration as JSON
 */
export function exportConfig(): string {
    const config = loadConfig();
    return JSON.stringify(config, null, 2);
}

/**
 * Import configuration from JSON
 */
export function importConfig(jsonString: string): { success: boolean; config?: GameConfig; error?: string } {
    try {
        const parsed = JSON.parse(jsonString);
        const validation = validateConfig(parsed);
        
        if (validation.valid) {
            const config = mergeConfig(defaultConfig, parsed);
            saveConfig(config);
            return { success: true, config };
        } else {
            return { 
                success: false, 
                error: `Configuration validation failed: ${validation.errors.join(', ')}` 
            };
        }
    } catch (error) {
        return { 
            success: false, 
            error: `Failed to parse configuration: ${error instanceof Error ? error.message : 'Unknown error'}` 
        };
    }
}

// Export default config for reference
export { defaultConfig };
