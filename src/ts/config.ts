import { GameConfig, OllamaConfig, StableDiffusionConfig } from './types.js';
import { 
    initializeDatabase, 
    saveConfig as saveConfigToDB, 
    loadConfig as loadConfigFromDB, 
    getAllConfigLabels,
    configExists as configExistsInDB,
    renameConfig as renameConfigInDB,
    deleteConfig as deleteConfigFromDB
} from './database.js';

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
        basePath: 'C:\\AI\\stable-diffusion-webui-1.10.1', // Default SD WebUI path
        model: 'default',
        options: {
            width: 512,
            height: 512,
            steps: 20,
            cfg_scale: 7,
            sampler_name: 'Euler a'
        },
        faceRestoration: 'auto', // 'auto', 'always', 'never'
        loras: [
            // Example LORA configurations - you can add your own
            // { name: 'lcm_lora_sdxl', strength: 0.8, enabled: true, tags: 'lcm, fast generation' },
            // { name: 'detail_tweaker_lora', strength: 0.6, enabled: true, tags: 'detailed, high quality, sharp' },
            // { name: 'realistic_vision_v5', strength: 0.7, enabled: false, tags: 'realistic, photorealistic, natural' }
        ],
        textualInversions: [
            // Example Textual Inversion configurations - you can add your own
            // { name: 'bad_prompt_version2', enabled: true, trigger: 'bad_prompt_version2', tags: 'negative prompt' },
            // { name: 'EasyNegative', enabled: true, trigger: 'EasyNegative', tags: 'negative prompt, clean' },
            // { name: 'style_enhancement', enabled: false, trigger: 'style_enhancement', tags: 'artistic, enhanced' }
        ]
    },

    logging: {
        level: 'info',
        consoleOutput: true,
        maxEntries: 1000
    },
    database: {
        name: 'AIAdventureDB',
        version: 2,
        maxEntries: 10000,
        autoBackup: true,
        backupInterval: 60 // 1 hour
    },
    enableAudio: false,
    enableIcons: false,
    gameName: undefined // Will be set when game starts
};

// Current config label
let currentConfigLabel = 'default';

/**
 * Initialize the configuration system
 */
export async function initializeConfig(): Promise<void> {
    try {
        await initializeDatabase();
        
        // Ensure default config exists
        if (!(await configExistsInDB('default'))) {
            await saveConfigToDB('default', defaultConfig);
            console.log('✅ Default configuration created');
        }
        
        console.log('✅ Configuration system initialized');
    } catch (error) {
        console.error('❌ Failed to initialize configuration system:', error);
        throw error;
    }
}

/**
 * Load configuration from database or return defaults
 */
export async function loadConfig(label: string = 'default'): Promise<GameConfig> {
    try {
        const config = await loadConfigFromDB(label);
        if (config) {
            currentConfigLabel = label;
            // Merge with defaults to ensure all fields exist
            return mergeConfig(defaultConfig, config);
        }
    } catch (error) {
        console.warn(`Failed to load configuration '${label}' from database:`, error);
    }
    
    // Return default config if loading fails
    return { ...defaultConfig };
}

/**
 * Save configuration to database
 */
export async function saveConfig(config: GameConfig, label: string = 'default'): Promise<void> {
    try {
        await saveConfigToDB(label, config);
        currentConfigLabel = label;
        console.log(`✅ Configuration '${label}' saved to database`);
    } catch (error) {
        console.error(`Failed to save configuration '${label}' to database:`, error);
    }
}

/**
 * Get current config label
 */
export function getCurrentConfigLabel(): string {
    return currentConfigLabel;
}

/**
 * Get all available config labels
 */
export async function getAvailableConfigs(): Promise<string[]> {
    try {
        return await getAllConfigLabels();
    } catch (error) {
        console.error('Failed to get available configs:', error);
        return ['default'];
    }
}

/**
 * Rename a configuration
 */
export async function renameConfig(oldLabel: string, newLabel: string): Promise<boolean> {
    try {
        return await renameConfigInDB(oldLabel, newLabel);
    } catch (error) {
        console.error(`Failed to rename config '${oldLabel}' to '${newLabel}':`, error);
        return false;
    }
}

/**
 * Delete a configuration
 */
export async function deleteConfig(label: string): Promise<boolean> {
    try {
        return await deleteConfigFromDB(label);
    } catch (error) {
        console.error(`Failed to delete config '${label}':`, error);
        return false;
    }
}

/**
 * Check if a configuration exists
 */
export async function configExists(label: string): Promise<boolean> {
    try {
        return await configExistsInDB(label);
    } catch (error) {
        console.error(`Failed to check if config '${label}' exists:`, error);
        return false;
    }
}

/**
 * Reset configuration to defaults
 */
export async function resetConfig(label: string = 'default'): Promise<GameConfig> {
    const config = { ...defaultConfig };
    await saveConfig(config, label);
    return config;
}

/**
 * Update specific configuration section
 */
export async function updateConfig<K extends keyof GameConfig>(
    section: K, 
    updates: Partial<GameConfig[K]>,
    label: string = 'default'
): Promise<GameConfig> {
    const config = await loadConfig(label);
    (config[section] as any) = { ...(config[section] as any), ...updates };
    await saveConfig(config, label);
    return config;
}

/**
 * Merge configurations, ensuring all required fields exist
 */
function mergeConfig(defaultConfig: GameConfig, userConfig: Partial<GameConfig>): GameConfig {
    return {
        ollama: { ...defaultConfig.ollama, ...userConfig.ollama },
        stableDiffusion: { 
            ...defaultConfig.stableDiffusion, 
            ...userConfig.stableDiffusion,
            loras: userConfig.stableDiffusion?.loras ?? defaultConfig.stableDiffusion.loras,
            textualInversions: userConfig.stableDiffusion?.textualInversions ?? defaultConfig.stableDiffusion.textualInversions
        },

        logging: { ...defaultConfig.logging, ...userConfig.logging },
        database: { ...defaultConfig.database, ...userConfig.database },
        enableAudio: userConfig.enableAudio ?? defaultConfig.enableAudio,
        enableIcons: userConfig.enableIcons ?? defaultConfig.enableIcons,
        gameName: userConfig.gameName ?? defaultConfig.gameName
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

    // Validate base path (optional but should be a valid path if provided)
    if (config.stableDiffusion.basePath && config.stableDiffusion.basePath.trim() !== '') {
        // Basic path validation - check if it contains valid characters
        const invalidChars = /[<>:"|?*]/;
        if (invalidChars.test(config.stableDiffusion.basePath)) {
            result.warnings.push('Stable Diffusion base path contains invalid characters');
        }
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
export function importConfig(jsonString: string, label: string = 'default'): { success: boolean; config?: GameConfig; error?: string } {
    try {
        const parsed = JSON.parse(jsonString);
        const validation = validateConfig(parsed);
        
        if (validation.valid) {
            const config = mergeConfig(defaultConfig, parsed);
            saveConfig(config, label);
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
