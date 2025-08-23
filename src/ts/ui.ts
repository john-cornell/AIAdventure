import { GameState, GameConfig, UIState, ErrorClassification, LoraConfig, TextualInversionConfig } from './types.js';
import { 
    loadConfig, 
    saveConfig, 
    updateConfig, 
    initializeConfig, 
    getCurrentConfigLabel, 
    getAvailableConfigs,
    renameConfig,
    deleteConfig,
    configExists
} from './config.js';
import { getGameSessionData, getAllDatabaseData, deleteStorySummary as deleteStorySummaryFromDatabase } from './database.js';
import { callLocalLLMWithRetry, getAvailableOllamaModels, testOllamaConnection as testOllama } from './ollama.js';
import { generateLocalImageWithRetry, getAvailableSDModels, getAvailableLoraModels, getAvailableTextualInversionModels, testSDConnection as testSD } from './stable-diffusion.js';
import { startGame, updateGame, getGameState, resetGame, updateGameState, autoSummarizeSteps } from './game.js';

// UI Utility Constants - Eliminates duplicate CSS classes
const UI_CLASSES = {
    // Input fields
    input: "w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-2 text-white",
    inputSmall: "w-full bg-gray-800 border border-gray-600 rounded-lg px-2 py-1 text-white",
    inputFlex: "flex-1 bg-gray-800 border border-gray-600 rounded-lg px-4 py-2 text-white",
    
    // Labels
    label: "block text-sm font-medium text-gray-300 mb-2",
    
    // Help text
    helpText: "text-xs text-gray-400 mt-1",
    
    // Buttons
    button: (color: string, size: 'sm' | 'md' | 'lg' = 'md') => {
        const padding = size === 'sm' ? 'px-3 py-1' : size === 'lg' ? 'px-6 py-2' : 'px-4 py-2';
        const textSize = size === 'sm' ? 'text-sm' : '';
        return `bg-${color}-600 hover:bg-${color}-500 text-white ${padding} rounded-lg ${textSize}`;
    },
    
    // Modal containers
    modal: (maxWidth: string, height: string = 'max-h-[95vh]') => 
        `bg-gray-900 border border-gray-700 rounded-lg ${maxWidth} w-full ${height} flex flex-col`,
    
    // Tab buttons
    tabButton: (isActive: boolean = false) => 
        `tab-button py-2 px-1 border-b-2 ${isActive ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-gray-400 hover:text-gray-300'} font-medium`,
    
    // Data containers
    dataContainer: "text-sm text-gray-300 font-mono bg-gray-900 p-4 rounded border border-gray-600 max-h-96 overflow-y-auto",
    
    // Section containers
    sectionContainer: "p-4 bg-gray-800 rounded-lg border border-gray-600",
    
    // Close buttons
    closeButton: "text-gray-400 hover:text-white text-2xl"
};

// UI Component Builders - Eliminates duplicate HTML patterns
const UI_COMPONENTS = {
    // Create modal header with title and close button
    modalHeader: (title: string, closeButtonId: string, showActions: boolean = false, actions?: string): string => `
        <div class="p-6 border-b border-gray-700">
            <div class="flex justify-between items-center">
                <div class="flex items-center gap-4">
                    <h2 class="text-2xl font-bold text-white">${title}</h2>
                    ${showActions && actions ? actions : ''}
                </div>
                <button id="${closeButtonId}" class="${UI_CLASSES.closeButton}">&times;</button>
            </div>
        </div>
    `,
    
    // Create tab navigation
    tabNavigation: (tabs: Array<{id: string, label: string, icon: string, isActive?: boolean}>): string => `
        <div class="border-b border-gray-700 mb-6 px-6">
            <nav class="flex space-x-8">
                ${tabs.map(tab => `
                    <button id="${tab.id}" class="${UI_CLASSES.tabButton(tab.isActive)}">
                        ${tab.icon} ${tab.label}
                    </button>
                `).join('')}
            </nav>
        </div>
    `,
    
    // Create form field with label, input, and help text
    formField: (label: string, inputType: string, inputId: string, helpText?: string, inputClass?: string, additionalProps?: string): string => `
        <div>
            <label class="${UI_CLASSES.label}">${label}</label>
            <input type="${inputType}" id="${inputId}" 
                   class="${inputClass || UI_CLASSES.input}" ${additionalProps || ''}>
            ${helpText ? `<div class="${UI_CLASSES.helpText}">${helpText}</div>` : ''}
        </div>
    `,
    
    // Create select field with label and help text
    selectField: (label: string, selectId: string, options: Array<{value: string, label: string}>, helpText?: string): string => `
        <div>
            <label class="${UI_CLASSES.label}">${label}</label>
            <select id="${selectId}" class="${UI_CLASSES.input}">
                ${options.map(option => `<option value="${option.value}">${option.value}</option>`).join('')}
            </select>
            ${helpText ? `<div class="${UI_CLASSES.helpText}">${helpText}</div>` : ''}
        </div>
    `,
    
    // Create button with consistent styling
    button: (id: string, text: string, color: string, size: 'sm' | 'md' | 'lg' = 'md', additionalClasses?: string): string => `
        <button id="${id}" class="${UI_CLASSES.button(color, size)} ${additionalClasses || ''}">
            ${text}
        </button>
    `,
    
    // Create action button group
    buttonGroup: (buttons: Array<{id: string, text: string, color: string, icon?: string}>): string => `
        <div class="flex gap-2 flex-wrap">
            ${buttons.map(btn => `
                <button id="${btn.id}" class="${UI_CLASSES.button(btn.color)}">
                    ${btn.icon || ''} ${btn.text}
                </button>
            `).join('')}
        </div>
    `
};

// UI Helper Functions - Eliminates duplicate logic
const UI_HELPERS = {
    // Standardized error handling
    handleError: async (context: string, error: any, logError: Function): Promise<void> => {
        logError(context, `Error: ${error.message || error}`, error);
    },
    
    // Create loading state
    setLoading: (isLoading: boolean): void => {
        const loadingIndicator = document.getElementById('loading-indicator');
        if (loadingIndicator) {
            loadingIndicator.classList.toggle('hidden', !isLoading);
        }
    },
    
    // Show/hide modal
    toggleModal: (modalId: string, show: boolean): void => {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.toggle('hidden', !show);
        }
    }
};

// Connection Tester Class - Eliminates duplicate connection testing functions
class ConnectionTester {
    static async testAllConnections(): Promise<{ ollama: string, stableDiffusion: string }> {
        const { logInfo, logError } = await import('./logger.js');
        const results = {
            ollama: 'unknown' as string,
            stableDiffusion: 'unknown' as string
        };
        
        try {
            logInfo('ConnectionTester', 'Testing all connections...');
            
            // Test Ollama connection
            try {
                const ollamaResult = await this.testOllamaConnection();
                results.ollama = ollamaResult.status;
                logInfo('ConnectionTester', `Ollama connection test: ${ollamaResult.status}`);
            } catch (error: any) {
                results.ollama = 'error';
                logError('ConnectionTester', 'Ollama connection test failed', error);
            }
            
            // Test Stable Diffusion connection
            try {
                const sdResult = await this.testSDConnection();
                results.stableDiffusion = sdResult.status;
                logInfo('ConnectionTester', `SD connection test: ${sdResult.status}`);
            } catch (error: any) {
                results.stableDiffusion = 'error';
                logError('ConnectionTester', 'SD connection test failed', error);
            }
            
            logInfo('ConnectionTester', 'All connection tests completed');
            return results;
            
        } catch (error: any) {
            logError('ConnectionTester', 'Connection testing failed', error);
            return results;
        }
    }
    
    static async testOllamaConnection(): Promise<{ status: string, message?: string }> {
        try {
            const { testOllamaConnection } = await import('./ollama.js');
            const config = await this.getCurrentConfig();
            const result = await testOllamaConnection(config.ollama.url, config.ollama.model);
            return { status: result.success ? 'connected' : 'error', message: result.message };
        } catch (error: any) {
            return { status: 'error', message: error.message || 'Connection failed' };
        }
    }
    
    static async testSDConnection(): Promise<{ status: string, message?: string }> {
        try {
            const { testSDConnection } = await import('./stable-diffusion.js');
            const config = await this.getCurrentConfig();
            const result = await testSDConnection(config.stableDiffusion.url, config.stableDiffusion.model);
            return { status: result.success ? 'connected' : 'error', message: result.message };
        } catch (error: any) {
            return { status: 'error', message: error.message || 'Connection failed' };
        }
    }
    
    private static async getCurrentConfig(): Promise<any> {
        const { loadConfig } = await import('./config.js');
        return await loadConfig();
    }
}

// UI State Management
let uiState: UIState = {
    isLoading: false,
    currentTab: 'story',
    showSettings: false,
    showError: false,
    errorMessage: '',
    connectionStatus: {
        ollama: 'unknown',
        stableDiffusion: 'unknown'
    }
};

// Store original settings when modal opens
let originalSettings: GameConfig | null = null;

// DOM Element References
let storyContent: HTMLElement;
let choicesContainer: HTMLElement;
let historyContent: HTMLElement;
let settingsModal: HTMLElement;
let loadingIndicator: HTMLElement;
let errorContainer: HTMLElement;

/**
 * Initialize the game UI
 */
export async function initializeUI(): Promise<void> {
    const { logInfo, logError, logger } = await import('./logger.js');
    logInfo('UI', 'Initializing game UI...');
    
    // Initialize configuration system first
    try {
        await initializeConfig();
        logInfo('UI', 'Configuration system initialized successfully');
    } catch (error) {
        logError('UI', 'Failed to initialize configuration system', error);
        throw error;
    }
    
    // Initialize logger with configuration
    try {
        const config = await loadConfig();
        logger.setConfig({
            level: config.logging.level,
            consoleOutput: config.logging.consoleOutput,
            maxEntries: config.logging.maxEntries
        });
        logInfo('UI', 'Logger initialized with configuration');
    } catch (error) {
        logError('UI', 'Failed to initialize logger configuration', error);
    }
    
    // Get DOM references
    storyContent = document.getElementById('story-content') as HTMLElement;
    choicesContainer = document.getElementById('choices-container') as HTMLElement;
    historyContent = document.getElementById('history-content') as HTMLElement;
    
    // Create UI elements if they don't exist
    createUIElements();
    
    // Setup event listeners
    setupEventListeners();
    
    // Load configuration and test connections
    await initializeConnections();
    
    // Show menu screen
    showMenuScreen();
    
    logInfo('UI', 'Game UI initialized successfully');
}

/**
 * Create necessary UI elements
 */
function createUIElements(): void {
    // Create settings modal
    if (!document.getElementById('settings-modal')) {
        const modal = document.createElement('div');
        modal.id = 'settings-modal';
        modal.className = 'fixed inset-0 bg-black/50 hidden z-50';
        modal.innerHTML = createSettingsModalHTML();
        document.body.appendChild(modal);
        settingsModal = modal;
    }
    
    // Create database overlay modal
    if (!document.getElementById('database-overlay-modal')) {
        const modal = document.createElement('div');
        modal.id = 'database-overlay-modal';
        modal.className = 'fixed inset-0 bg-black/50 hidden z-50';
        modal.innerHTML = createDatabaseOverlayHTML();
        document.body.appendChild(modal);
    }
    
    // Create loading indicator
    if (!document.getElementById('loading-indicator')) {
        const loading = document.createElement('div');
        loading.id = 'loading-indicator';
        loading.className = 'fixed inset-0 bg-black/50 hidden z-40 flex items-center justify-center';
        loading.innerHTML = `
            <div class="bg-gray-800 p-6 rounded-lg text-center">
                <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mx-auto mb-4"></div>
                <p class="text-white">Generating your adventure...</p>
            </div>
        `;
        loadingIndicator = loading;
    }
    
    // Create error container
    if (!document.getElementById('error-container')) {
        const error = document.createElement('div');
        error.id = 'error-container';
        error.className = 'hidden';
        document.body.appendChild(error);
        errorContainer = error;
    }
    
    // Create logging configuration overlay
    if (!document.getElementById('logging-config-overlay')) {
        const overlay = document.createElement('div');
        overlay.id = 'logging-config-overlay';
        overlay.className = 'fixed inset-0 bg-black/50 hidden z-50 flex items-center justify-center p-4';
        overlay.innerHTML = createLoggingConfigHTML();
        document.body.appendChild(overlay);
    }
    
    // Ensure logger UI element is connected when logging panel is available
    setTimeout(() => {
        const logsDisplay = document.getElementById('logs-display');
        if (logsDisplay) {
            import('./logger.js').then(({ logger }) => {
                logger.setUIElement(logsDisplay);
            });
        }
    }, 100); // Small delay to ensure DOM is ready
}

/**
 * Create logging configuration overlay HTML
 */
function createLoggingConfigHTML(): string {
    return `
        <div class="${UI_CLASSES.modal('max-w-2xl', 'max-h-[90vh]')} overflow-y-auto">
            ${UI_COMPONENTS.modalHeader('📝 Logging Configuration', 'close-logging-config')}
            
            <div class="p-6">
                <div class="space-y-6">
                    ${UI_COMPONENTS.selectField(
                        'Log Level',
                        'log-level',
                        [
                            {value: 'error', label: 'Error (minimal)'},
                            {value: 'warn', label: 'Warning'},
                            {value: 'info', label: 'Info (default)'},
                            {value: 'debug', label: 'Debug (verbose)'}
                        ],
                        'Controls the verbosity of log messages'
                    )}
                    
                    <div>
                        <label class="${UI_CLASSES.label}">Output Settings</label>
                        <div class="space-y-2">
                            <label class="flex items-center gap-2 text-sm text-gray-300">
                                <input type="checkbox" id="log-console" class="rounded" checked>
                                Console Output
                            </label>
                        </div>
                        <div class="${UI_CLASSES.helpText}">
                            Show logs in the browser console
                        </div>
                    </div>
                    
                    ${UI_COMPONENTS.formField(
                        'Max Log Entries',
                        'number',
                        'log-max-entries',
                        'Maximum number of log entries to keep in memory',
                        undefined,
                        'min="100" max="10000" value="1000"'
                    )}
                    
                    <div class="flex items-center gap-4">
                        ${UI_COMPONENTS.button('test-logging', '📝 Test Logging', 'yellow')}
                        ${UI_COMPONENTS.button('clear-logs', '🗑️ Clear Logs', 'gray')}
                    </div>
                    
                    <div class="pt-4 border-t border-gray-700">
                        <div class="flex justify-between items-center">
                            <div class="flex gap-4">
                                ${UI_COMPONENTS.button('discard-logging-changes', '<span>✕</span> Discard Changes', 'red', 'md', 'flex items-center gap-2')}
                                ${UI_COMPONENTS.button('reset-logging-defaults', '<span>🔄</span> Reset to Defaults', 'gray', 'md', 'flex items-center gap-2')}
                            </div>
                            <div class="flex gap-4">
                                ${UI_COMPONENTS.button('cancel-logging-config', 'Cancel', 'gray')}
                                ${UI_COMPONENTS.button('save-logging-config', '💾 Save Settings', 'indigo')}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Create settings modal HTML
 */
function createSettingsModalHTML(): string {
    const actionButtons = `
        <div class="flex gap-2">
            ${UI_COMPONENTS.button('discard-changes', '<span>✕</span> Discard', 'red', 'sm', 'flex items-center gap-1')}
            ${UI_COMPONENTS.button('reset-config', '<span>🔄</span> Reset', 'gray', 'sm', 'flex items-center gap-1')}
        </div>
    `;

    const tabs = [
        {id: 'tab-config', label: 'Configuration', icon: '⚙️', isActive: true},
        {id: 'tab-ollama', label: 'Ollama LLM', icon: '🤖', isActive: false},
        {id: 'tab-sd', label: 'Stable Diffusion', icon: '🎨', isActive: false}
    ];

    return `
        <div class="flex items-center justify-center min-h-screen p-4">
            <div class="${UI_CLASSES.modal('max-w-4xl')}">
                ${UI_COMPONENTS.modalHeader('Game Settings', 'close-settings', true, actionButtons)}
                
                <!-- Tab Navigation -->
                ${UI_COMPONENTS.tabNavigation(tabs)}
                
                <!-- Tab Content -->
                <div class="px-6 space-y-8 overflow-y-auto flex-1">
                    <!-- Configuration Management Tab -->
                    <div id="tab-content-config" class="tab-content active">
                        <div id="config-management" class="${UI_CLASSES.sectionContainer}">
                            <div class="flex justify-between items-center mb-4">
                                <h3 class="text-lg font-semibold text-white">Configuration Management</h3>
                                ${UI_COMPONENTS.button('save-config-now', '💾 Save Configuration Now', 'indigo', 'lg', 'font-semibold flex items-center gap-2')}
                            </div>
                            
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                <div>
                                    ${UI_COMPONENTS.selectField(
                                        'Current Configuration',
                                        'config-selector',
                                        [{value: 'default', label: 'default'}]
                                    )}
                                </div>
                                <div>
                                    <label class="${UI_CLASSES.label}">Configuration Name</label>
                                    <div class="flex gap-2">
                                        <input type="text" id="config-name" 
                                               placeholder="Enter config name" 
                                               class="${UI_CLASSES.inputFlex}">
                                        ${UI_COMPONENTS.button('rename-config', 'Rename', 'blue')}
                                    </div>
                                </div>
                            </div>
                            
                            ${UI_COMPONENTS.buttonGroup([
                                {id: 'new-config', text: '➕ New Config', color: 'green'},
                                {id: 'delete-config', text: '🗑️ Delete Config', color: 'red'},
                                {id: 'export-config', text: '📤 Export', color: 'purple'},
                                {id: 'import-config', text: '📥 Import', color: 'orange'}
                            ])}
                            
                            <div class="mt-6 pt-6 border-t border-gray-700">
                                <h4 class="text-md font-semibold text-gray-300 mb-3">Logging Configuration</h4>
                                <p class="text-sm text-gray-400 mb-4">Configure logging levels, output settings, and test the logging system.</p>
                                ${UI_COMPONENTS.buttonGroup([
                                    {id: 'logging-config-button', text: '⚙️ Configure Logging', color: 'yellow'},
                                    {id: 'database-viewer-button', text: '🗄️ Database Viewer', color: 'purple'},
                                    {id: 'database-config-button', text: '⚙️ Database Config', color: 'blue'}
                                ])}
                            </div>
                            
                            <div id="database-config-section" class="mt-6 pt-6 border-t border-gray-700" style="display: none;">
                                <h4 class="text-md font-semibold text-gray-300 mb-3">Database Configuration</h4>
                                <p class="text-sm text-gray-400 mb-4">Configure database settings, backup options, and test the database system.</p>
                                <div class="space-y-4">
                                    ${UI_COMPONENTS.formField(
                                        'Database Name',
                                        'text',
                                        'database-name',
                                        'Name of the IndexedDB database',
                                        undefined,
                                        'placeholder="AIAdventureDB"'
                                    )}
                                    
                                    ${UI_COMPONENTS.formField(
                                        'Database Version',
                                        'number',
                                        'database-version',
                                        'Current database schema version',
                                        undefined,
                                        'min="1" max="10" value="2"'
                                    )}
                                    
                                    ${UI_COMPONENTS.formField(
                                        'Max Entries',
                                        'number',
                                        'database-max-entries',
                                        'Maximum number of entries to keep in memory',
                                        undefined,
                                        'min="100" max="100000" value="10000"'
                                    )}
                                    
                                    <div class="flex items-center">
                                        <input type="checkbox" id="database-auto-backup" 
                                               class="w-4 h-4 text-purple-600 bg-gray-800 border-gray-600 rounded focus:ring-purple-500">
                                        <label for="database-auto-backup" class="ml-2 text-sm text-gray-300">
                                            Enable Auto Backup
                                        </label>
                                    </div>
                                    
                                    ${UI_COMPONENTS.formField(
                                        'Backup Interval (minutes)',
                                        'number',
                                        'database-backup-interval',
                                        'How often to automatically backup database (5-1440 minutes)',
                                        undefined,
                                        'min="5" max="1440" value="60"'
                                    )}
                                    
                                    ${UI_COMPONENTS.buttonGroup([
                                        {id: 'test-database', text: '🗄️ Test Database', color: 'purple'},
                                        {id: 'backup-database', text: '💾 Backup Now', color: 'green'}
                                    ])}
                                    
                                    <div id="database-status" class="flex items-center gap-2">
                                        <div id="database-status-indicator" class="w-3 h-3 rounded-full bg-gray-500"></div>
                                        <span id="database-status-text" class="text-sm text-gray-400">Not tested</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Ollama Settings Tab -->
                    <div id="tab-content-ollama" class="tab-content hidden">
                        <div id="ollama-settings" class="${UI_CLASSES.sectionContainer}">
                            <h3 class="text-lg font-semibold text-indigo-400 mb-4">Ollama LLM Settings</h3>
                            <div class="space-y-4">
                                ${UI_COMPONENTS.formField(
                                    'Ollama URL',
                                    'url',
                                    'ollama-url',
                                    undefined,
                                    undefined,
                                    'placeholder="http://localhost:11434"'
                                )}
                                
                                <div>
                                    ${UI_COMPONENTS.selectField(
                                        'Model',
                                        'ollama-model',
                                        [{value: '', label: 'Loading models...'}]
                                    )}
                                    <button id="refresh-ollama-models" 
                                            class="text-xs text-indigo-400 hover:text-indigo-300 mt-1">
                                        🔄 Refresh Models
                                    </button>
                                </div>
                            
                            <div class="grid grid-cols-3 gap-4">
                                <div>
                                    <label class="${UI_CLASSES.label}">Temperature</label>
                                    <input type="range" id="llm-temperature" min="0" max="2" step="0.1" value="0.8"
                                           class="w-full">
                                    <span id="temp-value" class="text-xs text-gray-400">0.8</span>
                                </div>
                                <div>
                                    <label class="${UI_CLASSES.label}">Top P</label>
                                    <input type="range" id="llm-top-p" min="0" max="1" step="0.1" value="0.9"
                                           class="w-full">
                                    <span id="top-p-value" class="text-xs text-gray-400">0.9</span>
                                </div>
                                <div>
                                    ${UI_COMPONENTS.formField(
                                        'Max Tokens',
                                        'number',
                                        'llm-max-tokens',
                                        undefined,
                                        UI_CLASSES.inputSmall,
                                        'min="1" max="4096" value="1000"'
                                    )}
                                </div>
                            </div>
                            
                            <div class="flex items-center gap-6">
                                ${UI_COMPONENTS.button('test-ollama', '🔌 Test Connection', 'blue')}
                                <div id="ollama-status" class="flex items-center gap-2">
                                    <div id="ollama-status-indicator" class="w-3 h-3 rounded-full bg-gray-500"></div>
                                    <span id="ollama-status-text" class="text-sm text-gray-400">Not tested</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    </div>
                    
                    <!-- Stable Diffusion Settings Tab -->
                    <div id="tab-content-sd" class="tab-content hidden">
                        <div id="sd-settings" class="${UI_CLASSES.sectionContainer}">
                            <h3 class="text-lg font-semibold text-green-400 mb-4">Stable Diffusion Settings</h3>
                            <div class="space-y-4">
                                ${UI_COMPONENTS.formField(
                                    'SD URL',
                                    'url',
                                    'sd-url',
                                    undefined,
                                    undefined,
                                    'placeholder="http://127.0.0.1:7860"'
                                )}
                                
                                ${UI_COMPONENTS.formField(
                                    'Base Path',
                                    'text',
                                    'sd-base-path',
                                    'Path to your Stable Diffusion WebUI installation directory',
                                    undefined,
                                    'placeholder="C:\\\\AI\\\\stable-diffusion-webui-1.10.1"'
                                )}
                                
                                <div>
                                    ${UI_COMPONENTS.selectField(
                                        'Model',
                                        'sd-model',
                                        [{value: '', label: 'Loading models...'}]
                                    )}
                                    <button id="refresh-sd-models" 
                                            class="text-xs text-green-400 hover:text-green-300 mt-1">
                                        🔄 Refresh Models
                                    </button>
                                </div>
                                
                                ${UI_COMPONENTS.selectField(
                                    'Face Restoration',
                                    'sd-face-restoration',
                                    [
                                        {value: 'auto', label: 'Auto (detect if available)'},
                                        {value: 'always', label: 'Always (when available)'},
                                        {value: 'never', label: 'Never (standard generation)'}
                                    ]
                                )}
                            
                            <div class="border border-gray-600 rounded-lg">
                                <button type="button" 
                                        id="lora-section-toggle"
                                        class="w-full px-4 py-3 text-left bg-gray-700 hover:bg-gray-600 rounded-t-lg flex items-center justify-between">
                                    <span class="font-medium text-gray-200">🎨 LORA Models</span>
                                    <span id="lora-section-icon" class="text-gray-400">▶</span>
                                </button>
                                <div id="lora-section" class="p-4 bg-gray-800 rounded-b-lg" style="display: none;">
                                    <div id="lora-container" class="space-y-3">
                                        <!-- LORA entries will be added here dynamically -->
                                    </div>
                                    <button id="add-lora" 
                                            class="mt-2 bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded text-sm">
                                        ➕ Add LORA
                                    </button>
                                    <div class="text-xs text-gray-400 mt-1">
                                        Add LORA models to enhance image generation. Set strength from 0.0 to 1.0.
                                    </div>
                                </div>
                            </div>
                            
                            <div>
                            <div class="border border-gray-600 rounded-lg">
                                <button type="button" 
                                        id="textual-inversion-section-toggle"
                                        class="w-full px-4 py-3 text-left bg-gray-700 hover:bg-gray-600 rounded-t-lg flex items-center justify-between">
                                    <span class="font-medium text-gray-200">🔤 Textual Inversion (Embeddings)</span>
                                    <span id="textual-inversion-section-icon" class="text-gray-400">▶</span>
                                </button>
                                <div id="textual-inversion-section" class="p-4 bg-gray-800 rounded-b-lg" style="display: none;">
                                    <div id="textual-inversion-container" class="space-y-3">
                                        <!-- Textual Inversion entries will be added here dynamically -->
                                    </div>
                                    <button id="add-textual-inversion" 
                                            class="mt-2 bg-purple-600 hover:bg-purple-500 text-white px-3 py-1 rounded text-sm">
                                        ➕ Add Textual Inversion
                                    </button>
                                    <div class="text-xs text-gray-400 mt-1">
                                        Add textual inversion embeddings to control style and content using trigger words.
                                    </div>
                                </div>
                            </div>
                            
                            <div class="grid grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-sm font-medium text-gray-300 mb-2">Width</label>
                                    <input type="number" id="sd-width" min="256" max="1024" value="512"
                                           class="w-full bg-gray-800 border border-gray-600 rounded-lg px-2 py-1 text-white">
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-300 mb-2">Height</label>
                                    <input type="number" id="sd-height" min="256" max="1024" value="512"
                                           class="w-full bg-gray-800 border border-gray-600 rounded-lg px-2 py-1 text-white">
                                </div>
                            </div>
                            
                            <div class="grid grid-cols-3 gap-4">
                                <div>
                                    <label class="block text-sm font-medium text-gray-300 mb-2">Steps</label>
                                    <input type="number" id="sd-steps" min="1" max="100" value="20"
                                           class="w-full bg-gray-800 border border-gray-600 rounded-lg px-2 py-1 text-white">
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-300 mb-2">CFG Scale</label>
                                    <input type="number" id="sd-cfg-scale" min="1" max="20" step="0.5" value="7"
                                           class="w-full bg-gray-800 border border-gray-600 rounded-lg px-2 py-1 text-white">
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-300 mb-2">Sampler</label>
                                    <select id="sd-sampler" 
                                            class="w-full bg-gray-800 border border-gray-600 rounded-lg px-2 py-1 text-white">
                                        <option value="Euler a">Euler a</option>
                                        <option value="DPM++ 2M Karras">DPM++ 2M Karras</option>
                                        <option value="DDIM">DDIM</option>
                                        <option value="Euler">Euler</option>
                                    </select>
                                </div>
                            </div>
                            
                            <div class="flex items-center gap-6">
                                <button id="test-sd" 
                                        class="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg">
                                    🖼️ Test Connection
                                </button>
                                <div id="sd-status" class="flex items-center gap-2">
                                    <div id="sd-status-indicator" class="w-3 h-3 rounded-full bg-gray-500"></div>
                                    <span id="sd-status-text" class="text-sm text-gray-400">Not tested</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Create story management overlay HTML
 */
function createStoryManagementOverlayHTML(): string {
    return `
        <div class="flex items-center justify-center min-h-screen p-4">
            <div class="bg-gray-900 border border-gray-700 rounded-lg max-w-6xl w-full max-h-[95vh] flex flex-col">
                <div class="p-6 border-b border-gray-700">
                    <div class="flex justify-between items-center">
                        <h2 class="text-2xl font-bold text-white">Story Management</h2>
                        <button id="close-story-management-overlay" class="text-gray-400 hover:text-white text-2xl">&times;</button>
                    </div>
                </div>
                
                <!-- Tab Navigation -->
                <div class="border-b border-gray-700 mb-6 px-6">
                    <nav class="flex space-x-8">
                        <button id="story-tab-management" class="story-tab-button active py-2 px-1 border-b-2 border-indigo-500 text-indigo-400 font-medium">
                            📚 Story Management
                        </button>
                        <button id="story-tab-summary" class="story-tab-button py-2 px-1 border-b-2 border-transparent text-gray-400 hover:text-gray-300 font-medium">
                            📝 Story Summary
                        </button>
                    </nav>
                </div>
                
                <!-- Tab Content -->
                <div class="px-6 space-y-8 overflow-y-auto flex-1">
                    <!-- Story Management Tab -->
                    <div id="story-tab-content-management" class="story-tab-content active">
                        <div class="p-4 bg-gray-800 rounded-lg border border-gray-600">
                            <div class="flex justify-between items-center mb-4">
                                <h3 class="text-lg font-semibold text-white">Story Management</h3>
                            </div>
                            
                            <!-- Session Selector -->
                            <div class="mb-4">
                                <label class="block text-sm font-medium text-gray-300 mb-2">Select Session:</label>
                                <select id="story-session-selector" class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white">
                                    <option value="">Loading sessions...</option>
                                </select>
                            </div>
                            
                            <!-- Action Buttons -->
                            <div class="mb-4 flex gap-2 flex-wrap">
                                <button id="load-story-from-session" class="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg">
                                    🎮 Load Story
                                </button>
                                <button id="delete-session-data" class="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-lg">
                                    🗑️ Delete Session Data
                                </button>
                            </div>
                            
                            <!-- Summary and Steps Display -->
                            <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                <!-- Summary Section -->
                                <div class="bg-gray-900 rounded-lg border border-gray-600 p-4">
                                    <h4 class="text-md font-semibold text-white mb-3 flex items-center justify-between">
                                        <span>📋 Story Summary</span>
                                        <button id="delete-summary" class="bg-red-600 hover:bg-red-500 text-white px-2 py-1 rounded text-xs">
                                            🗑️ Delete
                                        </button>
                                    </h4>
                                    <div id="story-summary-container" class="text-sm text-gray-300 max-h-64 overflow-y-auto">
                                        <span class="text-gray-500">Select a session to view summary...</span>
                                    </div>
                                </div>
                                
                                <!-- Steps Section -->
                                <div class="bg-gray-900 rounded-lg border border-gray-600 p-4">
                                    <h4 class="text-md font-semibold text-white mb-3 flex items-center justify-between">
                                        <span>📝 Story Steps</span>
                                        <button id="delete-steps" class="bg-red-600 hover:bg-red-500 text-white px-2 py-1 rounded text-xs">
                                            🗑️ Delete
                                        </button>
                                    </h4>
                                    <div id="story-steps-container" class="text-sm text-gray-300 max-h-64 overflow-y-auto">
                                        <span class="text-gray-500">Select a session to view steps...</span>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Session Info -->
                            <div id="session-info" class="mt-4 p-3 bg-gray-700 rounded-lg border border-gray-600 hidden">
                                <h4 class="text-md font-semibold text-white mb-2">Session Information</h4>
                                <div id="session-details" class="text-sm text-gray-300"></div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Story Summary Tab -->
                    <div id="story-tab-content-summary" class="story-tab-content hidden">
                        <div class="p-4 bg-gray-800 rounded-lg border border-gray-600">
                            <div class="flex justify-between items-center mb-4">
                                <h3 class="text-lg font-semibold text-white">Story Summaries</h3>
                                <div class="flex gap-2">
                                    <button id="import-story-summary" class="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg">
                                        📁 Import Story
                                    </button>
                                </div>
                            </div>
                            
                            <div id="story-summary-display" class="text-sm text-gray-300 font-mono bg-gray-900 p-4 rounded border border-gray-600 max-h-96 overflow-y-auto">
                                Loading story summaries...
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Footer -->
                <div class="p-6 border-t border-gray-700">
                    <div class="flex justify-between items-center">
                        <div class="text-sm text-gray-400">
                            <span id="story-management-status">Ready</span>
                        </div>
                        <div class="flex gap-2">
                            <button id="refresh-story-data" 
                                    class="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg">
                                🔄 Refresh Data
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Create database overlay HTML
 */
function createDatabaseOverlayHTML(): string {
    return `
        <div class="flex items-center justify-center min-h-screen p-4">
            <div class="bg-gray-900 border border-gray-700 rounded-lg max-w-6xl w-full max-h-[95vh] flex flex-col">
                <div class="p-6 border-b border-gray-700">
                    <div class="flex justify-between items-center">
                        <h2 class="text-2xl font-bold text-white">Database Viewer</h2>
                        <button id="close-database-overlay" class="text-gray-400 hover:text-white text-2xl">&times;</button>
                    </div>
                </div>
                
                <!-- Tab Navigation -->
                <div class="border-b border-gray-700 mb-6 px-6">
                    <nav class="flex space-x-8">
                        <button id="db-tab-configs" class="db-tab-button active py-2 px-1 border-b-2 border-indigo-500 text-indigo-400 font-medium">
                            ⚙️ Configurations
                        </button>
                        <button id="db-tab-summaries" class="db-tab-button py-2 px-1 border-b-2 border-transparent text-gray-400 hover:text-gray-300 font-medium">
                            📝 Story Summaries
                        </button>
                        <button id="db-tab-current-game" class="db-tab-button py-2 px-1 border-b-2 border-transparent text-gray-400 hover:text-gray-300 font-medium">
                            🎮 Current Game
                        </button>
                        <button id="db-tab-story-management" class="db-tab-button py-2 px-1 border-b-2 border-transparent text-gray-400 hover:text-gray-300 font-medium">
                            📚 Story Management
                        </button>
                    </nav>
                </div>
                
                <!-- Tab Content -->
                <div class="px-6 space-y-8 overflow-y-auto flex-1">
                    <!-- Configurations Tab -->
                    <div id="db-tab-content-configs" class="db-tab-content active">
                        <div class="p-4 bg-gray-800 rounded-lg border border-gray-600">
                            <h3 class="text-lg font-semibold text-white mb-4">Configuration Records</h3>
                            <div id="configs-data" class="text-sm text-gray-300 font-mono bg-gray-900 p-4 rounded border border-gray-600 max-h-96 overflow-y-auto">
                                Loading configurations...
                            </div>
                        </div>
                    </div>
                    
                    <!-- Story Summaries Tab -->
                    <div id="db-tab-content-summaries" class="db-tab-content hidden">
                        <div class="p-4 bg-gray-800 rounded-lg border border-gray-600">
                            <h3 class="text-lg font-semibold text-white mb-4">Story Summaries</h3>
                            <div id="summaries-data" class="text-sm text-gray-300 font-mono bg-gray-900 p-4 rounded border border-gray-600 max-h-96 overflow-y-auto">
                                Loading story summaries...
                            </div>
                        </div>
                    </div>
                    
                    <!-- Current Game Tab -->
                    <div id="db-tab-content-current-game" class="db-tab-content hidden">
                        <div class="p-4 bg-gray-800 rounded-lg border border-gray-600">
                            <h3 class="text-lg font-semibold text-white mb-4">Current Game Data</h3>
                            <div id="current-game-data" class="text-sm text-gray-300 font-mono bg-gray-900 p-4 rounded border border-gray-600 max-h-96 overflow-y-auto">
                                Loading current game data...
                            </div>
                        </div>
                    </div>
                    
                    <!-- Story Management Tab -->
                    <div id="db-tab-content-story-management" class="db-tab-content hidden">
                        <div class="p-4 bg-gray-800 rounded-lg border border-gray-600">
                            <div class="flex justify-between items-center mb-4">
                                <h3 class="text-lg font-semibold text-white">Story Management</h3>
                                <button id="delete-all-stories" class="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-lg">
                                    🗑️ Delete All Stories
                                </button>
                            </div>
                            
                            <!-- Session Selector -->
                            <div class="mb-4">
                                <label class="block text-sm font-medium text-gray-300 mb-2">Select Session:</label>
                                <select id="story-session-selector-db" class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white">
                                    <option value="">Loading sessions...</option>
                                </select>
                            </div>
                            
                            <!-- Action Buttons -->
                            <div class="mb-4 flex gap-2 flex-wrap">
                                <button id="load-story-from-session-db" class="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg">
                                    🎮 Load Story
                                </button>
                                <button id="delete-session-data" class="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-lg">
                                    🗑️ Delete Session Data
                                </button>
                            </div>
                            
                            <!-- Summary and Steps Display -->
                            <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                <!-- Summary Section -->
                                <div class="bg-gray-900 rounded-lg border border-gray-600 p-4">
                                    <h4 class="text-md font-semibold text-white mb-3 flex items-center justify-between">
                                        <span>📋 Story Summary</span>
                                        <button id="delete-summary-db" class="bg-red-600 hover:bg-red-500 text-white px-2 py-1 rounded text-xs">
                                            🗑️ Delete
                                        </button>
                                    </h4>
                                    <div id="story-summary-container-db" class="text-sm text-gray-300 max-h-64 overflow-y-auto">
                                        <span class="text-gray-500">Select a session to view summary...</span>
                                    </div>
                                </div>
                                
                                <!-- Steps Section -->
                                <div class="bg-gray-900 rounded-lg border border-gray-600 p-4">
                                    <h4 class="text-md font-semibold text-white mb-3 flex items-center justify-between">
                                        <span>📝 Story Steps</span>
                                        <button id="delete-steps-db" class="bg-red-600 hover:bg-red-500 text-white px-2 py-1 rounded text-xs">
                                            🗑️ Delete
                                        </button>
                                    </h4>
                                    <div id="story-steps-container-db" class="text-sm text-gray-300 max-h-64 overflow-y-auto">
                                        <span class="text-gray-500">Select a session to view steps...</span>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Session Info -->
                            <div id="session-info" class="mt-4 p-3 bg-gray-700 rounded-lg border border-gray-600 hidden">
                                <h4 class="text-md font-semibold text-white mb-2">Session Information</h4>
                                <div id="session-details" class="text-sm text-gray-300"></div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Footer -->
                <div class="p-6 border-t border-gray-700">
                    <div class="flex justify-between items-center">
                        <div class="text-sm text-gray-400">
                            <span id="db-status">Ready</span>
                        </div>
                        <div class="flex gap-2">
                            <button id="refresh-db-data" 
                                    class="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg">
                                🔄 Refresh Data
                            </button>
                            <button id="export-db-data" 
                                    class="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg">
                                📤 Export JSON
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Switch settings modal tabs
 */
function switchSettingsTab(tabId: string): void {
    console.log('🔄 Switching to tab:', tabId);
    
    // Hide all tab contents more aggressively
    const tabContents = document.querySelectorAll('.tab-content');
    tabContents.forEach(content => {
        content.classList.add('hidden');
        content.classList.remove('active');
        (content as HTMLElement).style.display = 'none'; // Force hide
    });
    

    
    // Remove active class from all tab buttons
    const tabButtons = document.querySelectorAll('.tab-button');
    tabButtons.forEach(button => {
        button.classList.remove('active', 'border-indigo-500', 'text-indigo-400');
        button.classList.add('border-transparent', 'text-gray-400');
    });
    
    // Show selected tab content
    const tabName = tabId.replace('tab-', '');
    const targetContent = document.getElementById(`tab-content-${tabName}`);
    console.log('🔍 Looking for tab content with ID:', `tab-content-${tabName}`);
    console.log('🎯 Target content element:', targetContent);
    
    if (targetContent) {
        targetContent.classList.remove('hidden');
        targetContent.classList.add('active');
        (targetContent as HTMLElement).style.display = 'block'; // Force show
        console.log('✅ Tab content shown:', targetContent.id);
        

    } else {
        console.error('❌ Target content not found for tab:', tabId);
    }
    
    // Activate selected tab button
    const targetButton = document.getElementById(tabId);
    if (targetButton) {
        targetButton.classList.add('active', 'border-indigo-500', 'text-indigo-400');
        targetButton.classList.remove('border-transparent', 'text-gray-400');
    }
}

/**
 * Setup event listeners
 */
function setupEventListeners(): void {
    // Settings modal events
    document.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        
        if (target.id === 'settings-button' || target.closest('#settings-button')) {
            showSettingsModal();
        }
        
        if (target.id === 'close-settings' || target.closest('#close-settings')) {
            hideSettingsModal();
        }
        
        if (target.id === 'discard-changes') {
            discardSettingsChanges();
        }
        
        if (target.id === 'reset-config') {
            resetSettings();
        }
        
        if (target.id === 'cancel-settings') {
            hideSettingsModal();
        }
    });
    
    // Tab switching
    document.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target.classList.contains('tab-button')) {
            const tab = target.dataset.tab;
            if (tab && (tab === 'story' || tab === 'history')) {
                switchTab(tab as 'story' | 'history');
            }
        }
    });
    
    // Settings modal tab switching
    document.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target.id === 'tab-config' || target.id === 'tab-ollama' || target.id === 'tab-sd') {
            switchSettingsTab(target.id);
        }
    });
    
    // Logging configuration overlay
    document.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        
        if (target.id === 'logging-config-button' || target.closest('#logging-config-button')) {
            showLoggingConfigOverlay();
        }
        
        if (target.id === 'database-viewer-button' || target.closest('#database-viewer-button')) {
            showDatabaseOverlay();
        }
        
        if (target.id === 'database-config-button' || target.closest('#database-config-button')) {
            toggleDatabaseConfig();
        }
        
        if (target.id === 'close-logging-config' || target.closest('#close-logging-config')) {
            hideLoggingConfigOverlay();
        }
        
        if (target.id === 'cancel-logging-config') {
            hideLoggingConfigOverlay();
        }
        
        if (target.id === 'save-logging-config') {
            saveLoggingConfig();
        }
    });
    
    // Database overlay events
    document.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        
        if (target.id === 'close-database-overlay' || target.closest('#close-database-overlay')) {
            hideDatabaseOverlay();
        }
        
        if (target.id === 'refresh-db-data') {
            refreshDatabaseData();
        }
        
        if (target.id === 'export-db-data') {
            exportDatabaseData();
        }
        
        if (target.id === 'test-database') {
            testDatabase();
        }
        
        if (target.id === 'backup-database') {
            backupDatabase();
        }
    });
    
    // Database overlay tab switching
    document.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target.id === 'db-tab-configs' || target.id === 'db-tab-summaries' || target.id === 'db-tab-current-game' || target.id === 'db-tab-story-management') {
            switchDatabaseTab(target.id);
        }
    });
    
    // Choice buttons
    document.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target.classList.contains('choice-button')) {
            const choice = target.textContent?.trim();
            if (choice) {
                handleChoice(choice);
            }
        }
    });
    
    // Image click to expand
    document.addEventListener('click', (e) => {
        const target = e.target as HTMLImageElement;
        if (target.id === 'scene-image' && target.src) {
            openImageFullscreen(target.src);
        }
    });
    
    // Settings form events
    setupSettingsEvents();
    
    // Listen for game state changes
    window.addEventListener('gameStateChanged', (event: Event) => {
        const customEvent = event as CustomEvent;
        const gameState = customEvent.detail;
        updateStoryDisplay();
    });
}

/**
 * Setup settings form event handlers
 */
function setupSettingsEvents(): void {
    // Ollama settings
    const ollamaUrl = document.getElementById('ollama-url') as HTMLInputElement;
    const ollamaModel = document.getElementById('ollama-model') as HTMLSelectElement;
    const tempSliderSetup = document.getElementById('llm-temperature') as HTMLInputElement;
    const topPSliderSetup = document.getElementById('llm-top-p') as HTMLInputElement;
    const maxTokens = document.getElementById('llm-max-tokens') as HTMLInputElement;
    const refreshOllamaBtn = document.getElementById('refresh-ollama-models');
    const testOllamaBtn = document.getElementById('test-ollama');
    
    if (ollamaUrl) {
        ollamaUrl.addEventListener('change', () => {
            loadOllamaModels(ollamaUrl.value, ollamaModel);
            updateConnectionStatus('ollama', 'unknown');
            saveSettingsImmediately();
        });
    }
    
    if (ollamaModel) {
        ollamaModel.addEventListener('change', () => saveSettingsImmediately());
    }
    
    if (tempSliderSetup) {
        tempSliderSetup.addEventListener('input', () => {
            updateSliderDisplay('temp-value', tempSliderSetup.value);
            saveSettingsImmediately();
        });
    }
    
    if (topPSliderSetup) {
        topPSliderSetup.addEventListener('input', () => {
            updateSliderDisplay('top-p-value', topPSliderSetup.value);
            saveSettingsImmediately();
        });
    }
    
    if (maxTokens) {
        maxTokens.addEventListener('change', () => saveSettingsImmediately());
    }
    
    if (refreshOllamaBtn) {
        refreshOllamaBtn.addEventListener('click', () => {
            loadOllamaModels(ollamaUrl?.value || '', ollamaModel);
        });
    }
    
    if (testOllamaBtn) {
        testOllamaBtn.addEventListener('click', () => testOllamaConnection());
    }
    
    // SD settings
    const sdUrl = document.getElementById('sd-url') as HTMLInputElement;
    const sdBasePath = document.getElementById('sd-base-path') as HTMLInputElement;
    const sdModel = document.getElementById('sd-model') as HTMLSelectElement;
    const sdWidth = document.getElementById('sd-width') as HTMLInputElement;
    const sdHeight = document.getElementById('sd-height') as HTMLInputElement;
    const sdSteps = document.getElementById('sd-steps') as HTMLInputElement;
    const sdCfgScale = document.getElementById('sd-cfg-scale') as HTMLInputElement;
    const sdSampler = document.getElementById('sd-sampler') as HTMLSelectElement;
    const sdFaceRestoration = document.getElementById('sd-face-restoration') as HTMLSelectElement;
    const refreshSDBtn = document.getElementById('refresh-sd-models');
    const testSDBtn = document.getElementById('test-sd');
    
    if (sdUrl) {
        sdUrl.addEventListener('change', () => {
            loadSDModels(sdUrl.value, sdModel);
            updateConnectionStatus('stableDiffusion', 'unknown');
            saveSettingsImmediately();
        });
    }
    
    if (sdBasePath) {
        sdBasePath.addEventListener('change', () => saveSettingsImmediately());
    }
    
    if (sdModel) {
        sdModel.addEventListener('change', () => saveSettingsImmediately());
    }
    
    if (sdWidth) {
        sdWidth.addEventListener('change', () => saveSettingsImmediately());
    }
    
    if (sdHeight) {
        sdHeight.addEventListener('change', () => saveSettingsImmediately());
    }
    
    if (sdSteps) {
        sdSteps.addEventListener('change', () => saveSettingsImmediately());
    }
    
    if (sdCfgScale) {
        sdCfgScale.addEventListener('change', () => saveSettingsImmediately());
    }
    
    if (sdSampler) {
        sdSampler.addEventListener('change', () => saveSettingsImmediately());
    }
    
    if (sdFaceRestoration) {
        sdFaceRestoration.addEventListener('change', () => saveSettingsImmediately());
    }
    
    if (refreshSDBtn) {
        refreshSDBtn.addEventListener('click', () => {
            loadSDModels(sdUrl?.value || '', sdModel);
        });
    }
    
    if (testSDBtn) {
        testSDBtn.addEventListener('click', () => testSDConnection());
    }
    

    
    // LORA settings
    const addLoraBtn = document.getElementById('add-lora');
    if (addLoraBtn) {
        addLoraBtn.addEventListener('click', () => {
            const container = document.getElementById('lora-container');
            if (container) {
                const newLora: LoraConfig = {
                    name: '',
                    strength: 0.8,
                    enabled: true,
                    tags: ''
                };
                const loraElement = createLoraElement(newLora, container.children.length);
                container.appendChild(loraElement);
                saveSettingsImmediately(); // Save when new LORA is added
            }
        });
    }
    
        // Textual Inversion settings
    const addTextualInversionBtn = document.getElementById('add-textual-inversion');
    if (addTextualInversionBtn) {
        addTextualInversionBtn.addEventListener('click', () => {
            const container = document.getElementById('textual-inversion-container');
            if (container) {
                const newTextualInversion: TextualInversionConfig = {
                    name: '',
                    enabled: true,
                    trigger: '',
                    tags: '',
                    isNegative: false
                };
                const textualInversionElement = createTextualInversionElement(newTextualInversion, container.children.length);
                container.appendChild(textualInversionElement);
                saveSettingsImmediately(); // Save when new Textual Inversion is added
            }
        });
    }

    // Collapsible section toggles
    const loraToggle = document.getElementById('lora-section-toggle');
    if (loraToggle) {
        loraToggle.addEventListener('click', () => toggleSection('lora-section'));
    }

    const textualInversionToggle = document.getElementById('textual-inversion-section-toggle');
    if (textualInversionToggle) {
        textualInversionToggle.addEventListener('click', () => toggleSection('textual-inversion-section'));
    }
    
    // Config management
    const configSelector = document.getElementById('config-selector');
    if (configSelector) {
        configSelector.addEventListener('change', async (e) => {
            const target = e.target as HTMLSelectElement;
            const selectedConfig = target.value;
            if (selectedConfig) {
                const config = await loadConfig(selectedConfig);
                loadSettingsIntoUI(config);
                showMessage(`Switched to configuration: ${selectedConfig}`, 'success');
            }
        });
    }
    
    const renameConfigBtn = document.getElementById('rename-config');
    if (renameConfigBtn) {
        renameConfigBtn.addEventListener('click', async () => {
            const configName = document.getElementById('config-name') as HTMLInputElement;
            const newName = configName.value.trim();
            const currentName = getCurrentConfigLabel();
            
            if (!newName) {
                showMessage('Please enter a configuration name', 'error');
                return;
            }
            
            if (newName === currentName) {
                showMessage('New name must be different from current name', 'error');
                return;
            }
            
            if (await renameConfig(currentName, newName)) {
                loadConfigSelector();
                configName.value = newName;
                showMessage(`Configuration renamed from '${currentName}' to '${newName}'`, 'success');
            } else {
                showMessage('Failed to rename configuration', 'error');
            }
        });
    }
    
    const saveConfigNowBtn = document.getElementById('save-config-now') as HTMLButtonElement;
    if (saveConfigNowBtn) {
        saveConfigNowBtn.addEventListener('click', async () => {
            saveConfigNowBtn.disabled = true;
            saveConfigNowBtn.textContent = '💾 Saving...';
            
            try {
                const success = await saveSettingsImmediately();
                if (success) {
                    showMessage('Configuration saved successfully!', 'success');
                } else {
                    showMessage('Failed to save configuration', 'error');
                }
            } catch (error) {
                console.error('Error saving configuration:', error);
                showMessage('Error saving configuration', 'error');
            } finally {
                saveConfigNowBtn.disabled = false;
                saveConfigNowBtn.innerHTML = '💾 Save Configuration Now';
            }
        });
    }
    
    const newConfigBtn = document.getElementById('new-config');
    if (newConfigBtn) {
        newConfigBtn.addEventListener('click', async () => {
            const configName = prompt('Enter name for new configuration:');
            if (configName && configName.trim()) {
                const trimmedName = configName.trim();
                if (await configExists(trimmedName)) {
                    showMessage('Configuration with this name already exists', 'error');
                    return;
                }
                
                // Create new config with current settings
                const currentConfig = await loadConfig(getCurrentConfigLabel());
                await saveConfig(currentConfig, trimmedName);
                
                loadConfigSelector();
                showMessage(`New configuration '${trimmedName}' created`, 'success');
            }
        });
    }
    
    const deleteConfigBtn = document.getElementById('delete-config');
    if (deleteConfigBtn) {
        deleteConfigBtn.addEventListener('click', async () => {
            const currentName = getCurrentConfigLabel();
            if (currentName === 'default') {
                showMessage('Cannot delete the default configuration', 'error');
                return;
            }
            
            if (confirm(`Are you sure you want to delete configuration '${currentName}'?`)) {
                if (await deleteConfig(currentName)) {
                    // Switch to default config
                    const defaultConfig = await loadConfig('default');
                    loadSettingsIntoUI(defaultConfig);
                    loadConfigSelector();
                    showMessage(`Configuration '${currentName}' deleted`, 'success');
                } else {
                    showMessage('Failed to delete configuration', 'error');
                }
            }
        });
    }
    
    const exportConfigBtn = document.getElementById('export-config');
    if (exportConfigBtn) {
        exportConfigBtn.addEventListener('click', async () => {
            const currentConfig = await loadConfig(getCurrentConfigLabel());
            const configJson = JSON.stringify(currentConfig, null, 2);
            const blob = new Blob([configJson], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${getCurrentConfigLabel()}_config.json`;
            a.click();
            URL.revokeObjectURL(url);
            showMessage('Configuration exported successfully', 'success');
        });
    }
    
    const importConfigBtn = document.getElementById('import-config');
    if (importConfigBtn) {
        importConfigBtn.addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.onchange = (e) => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = async (e) => {
                        try {
                            const configJson = e.target?.result as string;
                            const config = JSON.parse(configJson);
                            const configName = prompt('Enter name for imported configuration:', 'imported_config');
                            
                            if (configName && configName.trim()) {
                                const trimmedName = configName.trim();
                                if (await configExists(trimmedName)) {
                                    showMessage('Configuration with this name already exists', 'error');
                                    return;
                                }
                                
                                await saveConfig(config, trimmedName);
                                await loadConfigSelector();
                                showMessage(`Configuration '${trimmedName}' imported successfully`, 'success');
                            }
                        } catch (error) {
                            showMessage('Failed to import configuration: Invalid JSON', 'error');
                        }
                    };
                    reader.readAsText(file);
                }
            };
            input.click();
        });
    }
    
    // Parameter sliders
    const tempSliderLoad = document.getElementById('llm-temperature') as HTMLInputElement;
    const tempValue = document.getElementById('temp-value');
    if (tempSliderLoad && tempValue) {
        tempSliderLoad.addEventListener('input', () => {
            tempValue.textContent = tempSliderLoad.value;
        });
    }
    
    const topPSliderLoad = document.getElementById('llm-top-p') as HTMLInputElement;
    const topPValue = document.getElementById('top-p-value');
    if (topPSliderLoad && topPValue) {
        topPSliderLoad.addEventListener('input', () => {
            topPValue.textContent = topPSliderLoad.value;
        });
    }
    
    // Setup logging overlay events
    setupLoggingOverlayEvents();
}

/**
 * Setup logging overlay event handlers
 */
function setupLoggingOverlayEvents(): void {
    // Add event listeners for logging overlay buttons
    document.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        
        if (target.id === 'test-logging') {
            import('./logger.js').then(({ logInfo, logWarn, logError, logDebug }) => {
                logInfo('UI', 'Testing logging configuration...');
                logWarn('UI', 'This is a warning test');
                logError('UI', 'This is an error test');
                logDebug('UI', 'This is a debug test');
                showMessage('Logging test completed - check console for details', 'success');
            });
        }
        
        if (target.id === 'clear-logs') {
            import('./logger.js').then(({ logger }) => {
                logger.clear();
                showMessage('Logs cleared successfully', 'success');
            });
        }
        
        if (target.id === 'discard-logging-changes') {
            hideLoggingConfigOverlay();
            showMessage('Changes discarded', 'success');
        }
        
        if (target.id === 'reset-logging-defaults') {
            resetLoggingToDefaults();
        }
    });
}

/**
 * Initialize connections and load settings
 */
async function initializeConnections(): Promise<void> {
    const config = await loadConfig();
    
    // Load settings into UI
    loadSettingsIntoUI(config);
    
    // Test connections
    await testConnections();
}

/**
 * Load settings into UI elements
 */
function loadSettingsIntoUI(config: GameConfig): void {
    // Load config selector
    loadConfigSelector();
    
    // Load config name field
    const configName = document.getElementById('config-name') as HTMLInputElement;
    if (configName) {
        configName.value = getCurrentConfigLabel();
    }
    // Ollama settings
    const ollamaUrl = document.getElementById('ollama-url') as HTMLInputElement;
    const ollamaModel = document.getElementById('ollama-model') as HTMLSelectElement;
    const tempSlider = document.getElementById('llm-temperature') as HTMLInputElement;
    const tempValue = document.getElementById('temp-value');
    const topPSlider = document.getElementById('llm-top-p') as HTMLInputElement;
    const topPValue = document.getElementById('top-p-value');
    const maxTokens = document.getElementById('llm-max-tokens') as HTMLInputElement;
    
    if (ollamaUrl) ollamaUrl.value = config.ollama.url;
    if (tempSlider) {
        tempSlider.value = config.ollama.options.temperature.toString();
        if (tempValue) tempValue.textContent = tempSlider.value;
    }
    if (topPSlider) {
        topPSlider.value = config.ollama.options.top_p.toString();
        if (topPValue) topPValue.textContent = topPSlider.value;
    }
    if (maxTokens && config.ollama.options.num_predict) maxTokens.value = config.ollama.options.num_predict.toString();
    
    // SD settings
    const sdUrl = document.getElementById('sd-url') as HTMLInputElement;
    const sdBasePath = document.getElementById('sd-base-path') as HTMLInputElement;
    const sdModel = document.getElementById('sd-model') as HTMLSelectElement;
    const sdWidth = document.getElementById('sd-width') as HTMLInputElement;
    const sdHeight = document.getElementById('sd-height') as HTMLInputElement;
    const sdSteps = document.getElementById('sd-steps') as HTMLInputElement;
    const sdCfgScale = document.getElementById('sd-cfg-scale') as HTMLInputElement;
    const sdSampler = document.getElementById('sd-sampler') as HTMLSelectElement;
    
    if (sdUrl) sdUrl.value = config.stableDiffusion.url;
    if (sdBasePath) sdBasePath.value = config.stableDiffusion.basePath;
    if (sdWidth) sdWidth.value = config.stableDiffusion.options.width.toString();
    if (sdHeight) sdHeight.value = config.stableDiffusion.options.height.toString();
    if (sdSteps) sdSteps.value = config.stableDiffusion.options.steps.toString();
    if (sdCfgScale) sdCfgScale.value = config.stableDiffusion.options.cfg_scale.toString();
    if (sdSampler) sdSampler.value = config.stableDiffusion.options.sampler_name;
    
    // Load face restoration setting
    const sdFaceRestoration = document.getElementById('sd-face-restoration') as HTMLSelectElement;
    if (sdFaceRestoration) sdFaceRestoration.value = config.stableDiffusion.faceRestoration;
    
    // Load LORA settings
    loadLoraSettings(config.stableDiffusion.loras);
    
    // Load Textual Inversion settings
    loadTextualInversionSettings(config.stableDiffusion.textualInversions);
    
    // Load models
    loadOllamaModels(config.ollama.url, ollamaModel, config.ollama.model);
    loadSDModels(config.stableDiffusion.url, sdModel, config.stableDiffusion.model);
}

/**
 * Load Ollama models into dropdown
 */
async function loadOllamaModels(url: string, select: HTMLSelectElement, selectedModel?: string): Promise<void> {
    if (!select) return;
    
    select.innerHTML = '<option value="">Loading models...</option>';
    
    try {
        const models = await getAvailableOllamaModels(url);
        select.innerHTML = '';
        
        models.forEach(model => {
            const option = document.createElement('option');
            option.value = model;
            option.textContent = model;
            if (selectedModel && model === selectedModel) {
                option.selected = true;
            }
            select.appendChild(option);
        });
    } catch (error) {
        select.innerHTML = '<option value="">Error loading models</option>';
        console.error('Failed to load Ollama models:', error);
    }
}

/**
 * Load SD models into dropdown
 */
async function loadSDModels(url: string, select: HTMLSelectElement, selectedModel?: string): Promise<void> {
    if (!select) return;
    
    select.innerHTML = '<option value="">Loading models...</option>';
    
    try {
        const models = await getAvailableSDModels(url);
        select.innerHTML = '';
        
        models.forEach(model => {
            const option = document.createElement('option');
            option.value = model.title;
            option.textContent = model.title;
            if (selectedModel && model.title === selectedModel) {
                option.selected = true;
            }
            select.appendChild(option);
        });
    } catch (error) {
        select.innerHTML = '<option value="">Error loading models</option>';
        console.error('Failed to load SD models:', error);
    }
}

/**
 * Load LORA settings into UI
 */
function loadLoraSettings(loras: LoraConfig[]): void {
    const container = document.getElementById('lora-container');
    if (!container) return;
    
    container.innerHTML = '';
    
    loras.forEach((lora, index) => {
        const loraElement = createLoraElement(lora, index);
        container.appendChild(loraElement);
    });
}

/**
 * Create a LORA configuration element
 */
function createLoraElement(lora: LoraConfig, index: number): HTMLElement {
    const div = document.createElement('div');
    div.className = 'space-y-2 p-3 bg-gray-700 rounded border border-gray-600';
    div.innerHTML = `
        <div class="flex items-center gap-2">
            <select class="lora-name flex-1 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white text-sm">
                <option value="">Select LORA model...</option>
            </select>
            <input type="number" 
                   class="lora-strength w-20 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white text-sm" 
                   min="0" max="1" step="0.1" 
                   value="${lora.strength}"
                   title="LORA strength (0.0 to 1.0)">
            <label class="flex items-center gap-1 text-sm text-gray-300">
                <input type="checkbox" 
                       class="lora-enabled" 
                       ${lora.enabled ? 'checked' : ''}>
                Enabled
            </label>
            <button class="remove-lora bg-red-600 hover:bg-red-500 text-white px-2 py-1 rounded text-xs">
                ❌
            </button>
        </div>
        <div class="flex items-center gap-2">
            <label class="text-xs text-gray-400 w-12">Tags:</label>
            <input type="text" 
                   class="lora-tags flex-1 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white text-xs" 
                   placeholder="trigger words, style tags, quality modifiers"
                   value="${lora.tags || ''}"
                   title="Comma-separated tags to add to image prompts when this LORA is enabled">
        </div>
    `;
    
    // Add event listeners
    const removeBtn = div.querySelector('.remove-lora') as HTMLButtonElement;
    if (removeBtn) {
        removeBtn.onclick = () => {
            div.remove();
            saveSettingsImmediately(); // Save when LORA is removed
        };
    }
    
    // Add change event listeners for automatic saving
    const nameSelect = div.querySelector('.lora-name') as HTMLSelectElement;
    const strengthInput = div.querySelector('.lora-strength') as HTMLInputElement;
    const enabledInput = div.querySelector('.lora-enabled') as HTMLInputElement;
    const tagsInput = div.querySelector('.lora-tags') as HTMLInputElement;
    
    if (nameSelect) {
        nameSelect.addEventListener('change', () => saveSettingsImmediately());
    }
    if (strengthInput) {
        strengthInput.addEventListener('change', () => saveSettingsImmediately());
    }
    if (enabledInput) {
        enabledInput.addEventListener('change', () => saveSettingsImmediately());
    }
    if (tagsInput) {
        tagsInput.addEventListener('change', () => saveSettingsImmediately());
    }
    
    // Load LORA models into the dropdown
    loadLoraModelsIntoDropdown(nameSelect, lora.name);
    
    return div;
}

/**
 * Toggle collapsible sections
 */
function toggleSection(sectionId: string): void {
    const section = document.getElementById(sectionId);
    const icon = document.getElementById(`${sectionId}-icon`);
    
    if (section && icon) {
        const isHidden = section.style.display === 'none';
        section.style.display = isHidden ? 'block' : 'none';
        icon.textContent = isHidden ? '▼' : '▶';
    }
}

/**
 * Create a Textual Inversion configuration element
 */
function createTextualInversionElement(textualInversion: TextualInversionConfig, index: number): HTMLElement {
    const div = document.createElement('div');
    div.className = 'space-y-2 p-3 bg-gray-700 rounded border border-gray-600';
    div.innerHTML = `
        <div class="flex items-center gap-2">
            <select class="textual-inversion-name flex-1 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white text-sm">
                <option value="">Select textual inversion embedding...</option>
            </select>
            <input type="text" 
                   class="textual-inversion-trigger w-32 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white text-sm" 
                   placeholder="Trigger word"
                   value="${textualInversion.trigger}"
                   title="Main trigger word for the embedding">
            <label class="flex items-center gap-1 text-sm text-gray-300">
                <input type="checkbox" 
                       class="textual-inversion-enabled" 
                       ${textualInversion.enabled ? 'checked' : ''}>
                Enabled
            </label>
            <button class="remove-textual-inversion bg-red-600 hover:bg-red-500 text-white px-2 py-1 rounded text-xs">
                ❌
            </button>
        </div>
        <div class="flex items-center gap-2">
            <label class="text-xs text-gray-400 w-12">Tags:</label>
            <input type="text" 
                   class="textual-inversion-tags flex-1 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white text-xs" 
                   placeholder="additional tags, style modifiers"
                   value="${textualInversion.tags || ''}"
                   title="Additional tags to add to image prompts when this embedding is enabled">
        </div>
        <div class="flex items-center gap-2">
            <label class="flex items-center gap-1 text-xs text-gray-300">
                <input type="checkbox" 
                       class="textual-inversion-negative" 
                       ${textualInversion.isNegative ? 'checked' : ''}>
                Add to Negative Prompt
            </label>
        </div>
    `;
    
    // Add event listeners
    const removeBtn = div.querySelector('.remove-textual-inversion') as HTMLButtonElement;
    if (removeBtn) {
        removeBtn.onclick = () => {
            div.remove();
            saveSettingsImmediately(); // Save when Textual Inversion is removed
        };
    }
    
    // Add change event listeners for automatic saving
    const nameSelect = div.querySelector('.textual-inversion-name') as HTMLSelectElement;
    const triggerInput = div.querySelector('.textual-inversion-trigger') as HTMLInputElement;
    const enabledInput = div.querySelector('.textual-inversion-enabled') as HTMLInputElement;
    const tagsInput = div.querySelector('.textual-inversion-tags') as HTMLInputElement;
    const negativeInput = div.querySelector('.textual-inversion-negative') as HTMLInputElement;
    
    if (nameSelect) {
        nameSelect.addEventListener('change', () => saveSettingsImmediately());
    }
    if (triggerInput) {
        triggerInput.addEventListener('change', () => saveSettingsImmediately());
    }
    if (enabledInput) {
        enabledInput.addEventListener('change', () => saveSettingsImmediately());
    }
    if (tagsInput) {
        tagsInput.addEventListener('change', () => saveSettingsImmediately());
    }
    if (negativeInput) {
        negativeInput.addEventListener('change', () => saveSettingsImmediately());
    }
    
    // Load textual inversion models into the dropdown
    loadTextualInversionModelsIntoDropdown(nameSelect, textualInversion.name);
    
    return div;
}

/**
 * Load configuration selector dropdown
 */
async function loadConfigSelector(): Promise<void> {
    const selector = document.getElementById('config-selector') as HTMLSelectElement;
    if (!selector) return;
    
    try {
        const configs = await getAvailableConfigs();
        const currentConfig = getCurrentConfigLabel();
        
        selector.innerHTML = '';
        
        configs.forEach((configLabel: string) => {
            const option = document.createElement('option');
            option.value = configLabel;
            option.textContent = configLabel;
            if (configLabel === currentConfig) {
                option.selected = true;
            }
            selector.appendChild(option);
        });
        
        console.log('✅ Loaded', configs.length, 'configurations into selector');
    } catch (error) {
        console.error('Failed to load config selector:', error);
        // Fallback to default
        selector.innerHTML = '<option value="default" selected>default</option>';
    }
}

/**
 * Load LORA models into a dropdown
 */
async function loadLoraModelsIntoDropdown(select: HTMLSelectElement, selectedLora?: string): Promise<void> {
    if (!select) return;
    
    try {
        const config = await loadConfig();
        const loraModels = await getAvailableLoraModels(config.stableDiffusion.url);
        
        // Clear existing options except the first one
        const firstOption = select.querySelector('option');
        select.innerHTML = '';
        if (firstOption) select.appendChild(firstOption);
        
        // Add LORA models
        loraModels.forEach((loraName: string) => {
            const option = document.createElement('option');
            option.value = loraName;
            option.textContent = loraName;
            if (selectedLora && loraName === selectedLora) {
                option.selected = true;
            }
            select.appendChild(option);
        });
        
        console.log('🎨 Loaded', loraModels.length, 'LORA models into dropdown');
    } catch (error) {
        console.warn('Failed to load LORA models:', error);
        // Add some common LORA names as fallback
        const fallbackLoras = [
            'lcm_lora_sdxl',
            'detail_tweaker_lora',
            'realistic_vision_v5',
            'photorealistic_lora',
            'quality_lora'
        ];
        
        fallbackLoras.forEach(loraName => {
            const option = document.createElement('option');
            option.value = loraName;
            option.textContent = loraName;
            if (selectedLora && loraName === selectedLora) {
                option.selected = true;
            }
            select.appendChild(option);
        });
    }
}

/**
 * Get LORA settings from UI
 */
function getLoraSettings(): LoraConfig[] {
    const container = document.getElementById('lora-container');
    if (!container) return [];
    
    const loras: LoraConfig[] = [];
    const loraDivs = container.querySelectorAll('.space-y-2.p-3.bg-gray-700.rounded.border.border-gray-600');
    
    loraDivs.forEach((loraDiv) => {
        const nameSelect = loraDiv.querySelector('.lora-name') as HTMLSelectElement;
        const strengthInput = loraDiv.querySelector('.lora-strength') as HTMLInputElement;
        const enabledInput = loraDiv.querySelector('.lora-enabled') as HTMLInputElement;
        const tagsInput = loraDiv.querySelector('.lora-tags') as HTMLInputElement;
        
        if (nameSelect && nameSelect.value.trim()) {
            loras.push({
                name: nameSelect.value.trim(),
                strength: parseFloat(strengthInput?.value || '0.8') || 0.8,
                enabled: enabledInput?.checked || false,
                tags: tagsInput?.value?.trim() || ''
            });
        }
    });
    
    return loras;
}

/**
 * Load Textual Inversion settings into UI
 */
function loadTextualInversionSettings(textualInversions: TextualInversionConfig[]): void {
    const container = document.getElementById('textual-inversion-container');
    if (!container) return;
    
    container.innerHTML = '';
    
    textualInversions.forEach((textualInversion, index) => {
        const textualInversionElement = createTextualInversionElement(textualInversion, index);
        container.appendChild(textualInversionElement);
    });
}

/**
 * Load textual inversion models into a dropdown
 */
async function loadTextualInversionModelsIntoDropdown(select: HTMLSelectElement, selectedEmbedding?: string): Promise<void> {
    if (!select) return;
    
    try {
        const config = await loadConfig();
        const embeddingModels = await getAvailableTextualInversionModels(config.stableDiffusion.url);
        
        // Clear existing options except the first one
        const firstOption = select.querySelector('option');
        select.innerHTML = '';
        if (firstOption) select.appendChild(firstOption);
        
        // Add textual inversion models
        embeddingModels.forEach((embeddingName: string) => {
            const option = document.createElement('option');
            option.value = embeddingName;
            option.textContent = embeddingName;
            if (selectedEmbedding && embeddingName === selectedEmbedding) {
                option.selected = true;
            }
            select.appendChild(option);
        });
        
        console.log('🔤 Loaded', embeddingModels.length, 'textual inversion models into dropdown');
    } catch (error) {
        console.warn('Failed to load textual inversion models:', error);
        // Add some common textual inversion names as fallback
        const fallbackEmbeddings = [
            'bad_prompt_version2',
            'EasyNegative',
            'style_enhancement',
            'quality_booster',
            'negative_prompt'
        ];
        
        fallbackEmbeddings.forEach(embeddingName => {
            const option = document.createElement('option');
            option.value = embeddingName;
            option.textContent = embeddingName;
            if (selectedEmbedding && embeddingName === selectedEmbedding) {
                option.selected = true;
            }
            select.appendChild(option);
        });
    }
}

/**
 * Get Textual Inversion settings from UI
 */
function getTextualInversionSettings(): TextualInversionConfig[] {
    const container = document.getElementById('textual-inversion-container');
    if (!container) return [];
    
    const textualInversions: TextualInversionConfig[] = [];
    const textualInversionDivs = container.querySelectorAll('.space-y-2.p-3.bg-gray-700.rounded.border.border-gray-600');
    
    textualInversionDivs.forEach((textualInversionDiv) => {
        const nameSelect = textualInversionDiv.querySelector('.textual-inversion-name') as HTMLSelectElement;
        const triggerInput = textualInversionDiv.querySelector('.textual-inversion-trigger') as HTMLInputElement;
        const enabledInput = textualInversionDiv.querySelector('.textual-inversion-enabled') as HTMLInputElement;
        const tagsInput = textualInversionDiv.querySelector('.textual-inversion-tags') as HTMLInputElement;
        const negativeInput = textualInversionDiv.querySelector('.textual-inversion-negative') as HTMLInputElement;
        
        if (nameSelect && nameSelect.value.trim()) {
            textualInversions.push({
                name: nameSelect.value.trim(),
                trigger: triggerInput?.value?.trim() || nameSelect.value.trim(),
                enabled: enabledInput?.checked || false,
                tags: tagsInput?.value?.trim() || '',
                isNegative: negativeInput?.checked || false
            });
        }
    });
    
    return textualInversions;
}

/**
 * Test connections
 */
async function testConnections(): Promise<void> {
    const config = await loadConfig();
    
    // Test Ollama with simple health check
    try {
        const response = await fetch(`${config.ollama.url}/api/tags`);
        updateConnectionStatus('ollama', response.ok ? 'connected' : 'error');
    } catch (error) {
        updateConnectionStatus('ollama', 'error');
    }
    
    // Test SD with simple health check
    try {
        const response = await fetch(`${config.stableDiffusion.url}/sdapi/v1/sd-models`);
        updateConnectionStatus('stableDiffusion', response.ok ? 'connected' : 'error');
    } catch (error) {
        updateConnectionStatus('stableDiffusion', 'error');
    }
}

/**
 * Update connection status display
 */
function updateConnectionStatus(service: 'ollama' | 'stableDiffusion', status: 'connected' | 'error' | 'unknown'): void {
    uiState.connectionStatus[service] = status;
    
    // Update status indicators in settings
    const indicator = document.getElementById(`${service}-status-indicator`);
    const text = document.getElementById(`${service}-status-text`);
    
    if (indicator && text) {
        indicator.className = 'w-3 h-3 rounded-full';
        switch (status) {
            case 'connected':
                indicator.classList.add('bg-green-500');
                text.textContent = 'Connected';
                break;
            case 'error':
                indicator.classList.add('bg-red-500');
                text.textContent = 'Connection failed';
                break;
            default:
                indicator.classList.add('bg-gray-500');
                text.textContent = 'Not tested';
        }
    }
    
    // Update menu status indicators
    updateMenuStatusIndicators();
}

/**
 * Update menu status indicators
 */
function updateMenuStatusIndicators(): void {
    const ollamaIndicator = document.getElementById('menu-ollama-status');
    const sdIndicator = document.getElementById('menu-sd-status');
    
    if (ollamaIndicator) {
        ollamaIndicator.className = `w-3 h-3 rounded-full ${uiState.connectionStatus.ollama === 'connected' ? 'bg-green-500' : 'bg-red-500'}`;
    }
    
    if (sdIndicator) {
        sdIndicator.className = `w-3 h-3 rounded-full ${uiState.connectionStatus.stableDiffusion === 'connected' ? 'bg-green-500' : 'bg-red-500'}`;
    }
    
    // Update context usage indicator
    updateContextUsageIndicator();
}

/**
 * Update context usage indicator
 */
function updateContextUsageIndicator(): void {
    const indicator = document.getElementById('context-usage-indicator') as HTMLElement;
    const text = document.getElementById('context-usage-text') as HTMLElement;
    
    if (!indicator || !text) return;
    
    const gameState = getGameState();
    if (!gameState.contextLimit) {
        indicator.className = 'w-3 h-3 rounded-full bg-gray-500';
        text.textContent = 'Context';
        return;
    }
    
    const usagePercent = (gameState.contextTokenCount / gameState.contextLimit) * 100;
    
    if (usagePercent >= 85) {
        indicator.className = 'w-3 h-3 rounded-full bg-red-500 animate-pulse';
        text.textContent = `Context ${usagePercent.toFixed(0)}%`;
    } else if (usagePercent >= 80) {
        indicator.className = 'w-3 h-3 rounded-full bg-yellow-500';
        text.textContent = `Context ${usagePercent.toFixed(0)}%`;
    } else if (usagePercent >= 60) {
        indicator.className = 'w-3 h-3 rounded-full bg-blue-500';
        text.textContent = `Context ${usagePercent.toFixed(0)}%`;
    } else {
        indicator.className = 'w-3 h-3 rounded-full bg-green-500';
        text.textContent = `Context ${usagePercent.toFixed(0)}%`;
    }
}

/**
 * Show settings modal
 */
async function showSettingsModal(): Promise<void> {
    if (settingsModal) {
        // Store original settings before loading current ones
        originalSettings = await loadConfig();
        
        // Load current settings into UI
        loadSettingsIntoUI(originalSettings);
        
        settingsModal.classList.remove('hidden');
        uiState.showSettings = true;
    }
}

/**
 * Hide settings modal
 */
function hideSettingsModal(): void {
    if (settingsModal) {
        settingsModal.classList.add('hidden');
        uiState.showSettings = false;
        // Clear original settings when modal is closed
        originalSettings = null;
    }
}

/**
 * Show logging configuration overlay
 */
function showLoggingConfigOverlay(): void {
    const overlay = document.getElementById('logging-config-overlay');
    if (overlay) {
        overlay.classList.remove('hidden');
        // Load current logging settings
        loadLoggingSettingsIntoOverlay();
    }
}

/**
 * Hide logging configuration overlay
 */
function hideLoggingConfigOverlay(): void {
    const overlay = document.getElementById('logging-config-overlay');
    if (overlay) {
        overlay.classList.add('hidden');
    }
}

/**
 * Load logging settings into the overlay
 */
async function loadLoggingSettingsIntoOverlay(): Promise<void> {
    const config = await loadConfig();
    
    const logLevel = document.getElementById('log-level') as HTMLSelectElement;
    const logConsole = document.getElementById('log-console') as HTMLInputElement;
    const logMaxEntries = document.getElementById('log-max-entries') as HTMLInputElement;
    
    if (logLevel) logLevel.value = config.logging.level;
    if (logConsole) logConsole.checked = config.logging.consoleOutput;
    if (logMaxEntries) logMaxEntries.value = config.logging.maxEntries.toString();
}

/**
 * Save logging configuration
 */
async function saveLoggingConfig(): Promise<void> {
    try {
        const config = await loadConfig();
        
        // Get logging settings from overlay
        const logLevel = (document.getElementById('log-level') as HTMLSelectElement)?.value;
        const logConsole = (document.getElementById('log-console') as HTMLInputElement)?.checked;
        const logMaxEntries = (document.getElementById('log-max-entries') as HTMLInputElement)?.value;
        
        if (logLevel) config.logging.level = logLevel as 'error' | 'warn' | 'info' | 'debug';
        if (logConsole !== undefined) config.logging.consoleOutput = logConsole;
        if (logMaxEntries) config.logging.maxEntries = parseInt(logMaxEntries);
        
        // Update logger configuration immediately
        const { logger } = await import('./logger.js');
        logger.setConfig({
            level: config.logging.level,
            consoleOutput: config.logging.consoleOutput,
            maxEntries: config.logging.maxEntries
        });
        
        // Save configuration
        await saveConfig(config);
        
        // Update UI to reflect changes
        await loadLoggingSettingsIntoOverlay();
        
        hideLoggingConfigOverlay();
        showMessage('Logging configuration saved and applied!', 'success');
    } catch (error) {
        showMessage(`Failed to save logging configuration: ${error}`, 'error');
    }
}

/**
 * Reset logging configuration to defaults
 */
async function resetLoggingToDefaults(): Promise<void> {
    try {
        const config = await loadConfig();
        
        // Reset to default values
        config.logging.level = 'info';
        config.logging.consoleOutput = true;
        config.logging.maxEntries = 1000;
        
        // Update logger configuration immediately
        const { logger } = await import('./logger.js');
        logger.setConfig({
            level: config.logging.level,
            consoleOutput: config.logging.consoleOutput,
            maxEntries: config.logging.maxEntries
        });
        
        // Update UI to reflect defaults
        await loadLoggingSettingsIntoOverlay();
        
        // Save configuration
        await saveConfig(config);
        
        showMessage('Logging configuration reset to defaults and applied!', 'success');
    } catch (error) {
        showMessage(`Failed to reset logging configuration: ${error}`, 'error');
    }
}

/**
 * Save settings from UI (legacy function, now called by immediate save)
 */
async function saveSettings(): Promise<void> {
    const currentLabel = getCurrentConfigLabel();
    const config = await loadConfig(currentLabel);
    
    // Get Ollama settings
    const ollamaUrl = (document.getElementById('ollama-url') as HTMLInputElement)?.value;
    const ollamaModel = (document.getElementById('ollama-model') as HTMLSelectElement)?.value;
    const tempSlider = (document.getElementById('llm-temperature') as HTMLInputElement)?.value;
    const topPSlider = (document.getElementById('llm-top-p') as HTMLInputElement)?.value;
    const maxTokens = (document.getElementById('llm-max-tokens') as HTMLInputElement)?.value;
    
    // Get SD settings
    const sdUrl = (document.getElementById('sd-url') as HTMLInputElement)?.value;
    const sdBasePath = (document.getElementById('sd-base-path') as HTMLInputElement)?.value;
    const sdModel = (document.getElementById('sd-model') as HTMLSelectElement)?.value;
    const sdWidth = (document.getElementById('sd-width') as HTMLInputElement)?.value;
    const sdHeight = (document.getElementById('sd-height') as HTMLInputElement)?.value;
    const sdSteps = (document.getElementById('sd-steps') as HTMLInputElement)?.value;
    const sdCfgScale = (document.getElementById('sd-cfg-scale') as HTMLInputElement)?.value;
    const sdSampler = (document.getElementById('sd-sampler') as HTMLSelectElement)?.value;
    
    // Update config
    if (ollamaUrl) config.ollama.url = ollamaUrl;
    if (ollamaModel) config.ollama.model = ollamaModel;
    if (tempSlider) config.ollama.options.temperature = parseFloat(tempSlider);
    if (topPSlider) config.ollama.options.top_p = parseFloat(topPSlider);
    if (maxTokens) config.ollama.options.num_predict = parseInt(maxTokens);
    
    if (sdUrl) config.stableDiffusion.url = sdUrl;
    if (sdBasePath) config.stableDiffusion.basePath = sdBasePath;
    if (sdModel) config.stableDiffusion.model = sdModel;
    if (sdWidth) config.stableDiffusion.options.width = parseInt(sdWidth);
    if (sdHeight) config.stableDiffusion.options.height = parseInt(sdHeight);
    if (sdSteps) config.stableDiffusion.options.steps = parseInt(sdSteps);
    if (sdCfgScale) config.stableDiffusion.options.cfg_scale = parseFloat(sdCfgScale);
    if (sdSampler) config.stableDiffusion.options.sampler_name = sdSampler;
    
    // Save face restoration setting
    const sdFaceRestoration = (document.getElementById('sd-face-restoration') as HTMLSelectElement)?.value;
    if (sdFaceRestoration) config.stableDiffusion.faceRestoration = sdFaceRestoration as 'auto' | 'always' | 'never';
    
    // Save LORA settings
    config.stableDiffusion.loras = getLoraSettings();
    
    // Save Textual Inversion settings
    config.stableDiffusion.textualInversions = getTextualInversionSettings();
    
    // Save config
    await saveConfig(config, currentLabel);
    
    // Test connections
    await testConnections();
    
    // Show success message
    showMessage('Settings saved successfully!', 'success');
}

/**
 * Save settings immediately when changes are made
 */
async function saveSettingsImmediately(): Promise<boolean> {
    try {
        const currentLabel = getCurrentConfigLabel();
        const config = await loadConfig(currentLabel);
        
        // Get Ollama settings
        const ollamaUrl = (document.getElementById('ollama-url') as HTMLInputElement)?.value;
        const ollamaModel = (document.getElementById('ollama-model') as HTMLSelectElement)?.value;
        const tempSlider = (document.getElementById('llm-temperature') as HTMLInputElement)?.value;
        const topPSlider = (document.getElementById('llm-top-p') as HTMLInputElement)?.value;
        const maxTokens = (document.getElementById('llm-max-tokens') as HTMLInputElement)?.value;
        
        // Get SD settings
        const sdUrl = (document.getElementById('sd-url') as HTMLInputElement)?.value;
        const sdBasePath = (document.getElementById('sd-base-path') as HTMLInputElement)?.value;
        const sdModel = (document.getElementById('sd-model') as HTMLSelectElement)?.value;
        const sdWidth = (document.getElementById('sd-width') as HTMLInputElement)?.value;
        const sdHeight = (document.getElementById('sd-height') as HTMLInputElement)?.value;
        const sdSteps = (document.getElementById('sd-steps') as HTMLInputElement)?.value;
        const sdCfgScale = (document.getElementById('sd-cfg-scale') as HTMLInputElement)?.value;
        const sdSampler = (document.getElementById('sd-sampler') as HTMLSelectElement)?.value;
        
        // Update config
        if (ollamaUrl) config.ollama.url = ollamaUrl;
        if (ollamaModel) config.ollama.model = ollamaModel;
        if (tempSlider) config.ollama.options.temperature = parseFloat(tempSlider);
        if (topPSlider) config.ollama.options.top_p = parseFloat(topPSlider);
        if (maxTokens) config.ollama.options.num_predict = parseInt(maxTokens);
        
        if (sdUrl) config.stableDiffusion.url = sdUrl;
        if (sdBasePath) config.stableDiffusion.basePath = sdBasePath;
        if (sdModel) config.stableDiffusion.model = sdModel;
        if (sdWidth) config.stableDiffusion.options.width = parseInt(sdWidth);
        if (sdHeight) config.stableDiffusion.options.height = parseInt(sdHeight);
        if (sdSteps) config.stableDiffusion.options.steps = parseInt(sdSteps);
        if (sdCfgScale) config.stableDiffusion.options.cfg_scale = parseFloat(sdCfgScale);
        if (sdSampler) config.stableDiffusion.options.sampler_name = sdSampler;
        
        // Save face restoration setting
        const sdFaceRestoration = (document.getElementById('sd-face-restoration') as HTMLSelectElement)?.value;
        if (sdFaceRestoration) config.stableDiffusion.faceRestoration = sdFaceRestoration as 'auto' | 'always' | 'never';
        
        // Save LORA settings
        config.stableDiffusion.loras = getLoraSettings();
        
        // Save Textual Inversion settings
        config.stableDiffusion.textualInversions = getTextualInversionSettings();
        
        // Save config
        await saveConfig(config, currentLabel);
        
        // Update the original settings to current saved state so discard works correctly
        originalSettings = { ...config };
        
        return true;
        
    } catch (error) {
        console.error('Failed to save settings immediately:', error);
        showMessage('Failed to save settings automatically', 'error');
        return false;
    }
}

/**
 * Update slider display value
 */
function updateSliderDisplay(elementId: string, value: string): void {
    const display = document.getElementById(elementId);
    if (display) {
        display.textContent = value;
    }
}

/**
 * Reset settings to defaults
 */
async function resetSettings(): Promise<void> {
    if (confirm('Are you sure you want to reset all settings to defaults?')) {
        const config = await loadConfig();
        // Reset to defaults (config.ts handles this)
        await saveConfig(config);
        loadSettingsIntoUI(config);
        await testConnections();
        showMessage('Settings reset to defaults!', 'success');
    }
}

/**
 * Discard changes and restore original settings
 */
async function discardSettingsChanges(): Promise<void> {
    if (originalSettings) {
        loadSettingsIntoUI(originalSettings);
        showMessage('Changes discarded, original settings restored!', 'success');
    } else {
        // If no original settings stored, just reload from config
        const config = await loadConfig();
        loadSettingsIntoUI(config);
        showMessage('Settings reloaded from saved configuration!', 'success');
    }
}

/**
 * Test Ollama connection from settings
 */
async function testOllamaConnection(): Promise<void> {
    const url = (document.getElementById('ollama-url') as HTMLInputElement)?.value;
    const model = (document.getElementById('ollama-model') as HTMLSelectElement)?.value;
    
    if (!url) {
        showMessage('Please enter URL', 'error');
        return;
    }
    
    updateConnectionStatus('ollama', 'unknown');
    
    try {
        // Simple health check like the main game
        const response = await fetch(`${url}/api/tags`);
        if (response.ok) {
            updateConnectionStatus('ollama', 'connected');
            showMessage('Ollama connection successful!', 'success');
        } else {
            updateConnectionStatus('ollama', 'error');
            showMessage(`Ollama connection failed: ${response.status} ${response.statusText}`, 'error');
        }
    } catch (error) {
        updateConnectionStatus('ollama', 'error');
        showMessage(`Ollama test failed: ${error}`, 'error');
    }
}

/**
 * Test SD connection from settings
 */
async function testSDConnection(): Promise<void> {
    const url = (document.getElementById('sd-url') as HTMLInputElement)?.value;
    
    if (!url) {
        showMessage('Please enter SD URL', 'error');
        return;
    }
    
    updateConnectionStatus('stableDiffusion', 'unknown');
    
    try {
        // Simple health check like the main game
        const response = await fetch(`${url}/sdapi/v1/sd-models`);
        if (response.ok) {
            updateConnectionStatus('stableDiffusion', 'connected');
            showMessage('Stable Diffusion connection successful!', 'success');
        } else {
            updateConnectionStatus('stableDiffusion', 'error');
            showMessage(`SD connection failed: ${response.status} ${response.statusText}`, 'error');
        }
    } catch (error) {
        updateConnectionStatus('stableDiffusion', 'error');
        showMessage(`SD test failed: ${error}`, 'error');
    }
}

/**
 * Show menu screen
 */
function showMenuScreen(): void {
    const gameContainer = document.getElementById('game-container');
    if (!gameContainer) return;
    
    gameContainer.innerHTML = `
        <div class="text-center space-y-8">
            <h1 class="text-4xl font-bold text-white mb-8">AI Adventure Game</h1>
            
            <div class="space-y-4">
                <button id="new-game-button" 
                        class="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 px-8 rounded-lg text-lg transition-colors duration-300">
                    🎮 Start New Adventure
                </button>
                
                <button id="settings-button" 
                        class="bg-gray-600 hover:bg-gray-500 text-white font-bold py-3 px-8 rounded-lg text-lg transition-colors duration-300">
                    ⚙️ Settings
                </button>
                
                <button id="story-management-button" 
                        class="bg-green-600 hover:bg-green-500 text-white font-bold py-3 px-8 rounded-lg text-lg transition-colors duration-300">
                    📚 Story Management
                </button>
            </div>
            
            <div class="mt-8 p-4 bg-gray-800 rounded-lg">
                <h3 class="text-lg font-semibold text-white mb-4">Connection Status</h3>
                <div class="flex justify-center gap-8">
                    <div class="flex items-center gap-2">
                        <div id="menu-ollama-status" class="w-3 h-3 rounded-full bg-gray-500"></div>
                        <span class="text-gray-300">Ollama LLM</span>
                    </div>
                    <div class="flex items-center gap-2">
                        <div id="menu-sd-status" class="w-3 h-3 rounded-full bg-gray-500"></div>
                        <span class="text-gray-300">Stable Diffusion</span>
                    </div>
                </div>

            </div>
        </div>
    `;
    
    // Update status indicators
    updateMenuStatusIndicators();
    
    // Add event listeners
    const newGameBtn = document.getElementById('new-game-button');
    if (newGameBtn) {
        newGameBtn.addEventListener('click', () => {
            const adventurePrompt = prompt('Enter your adventure prompt (or leave blank for random):');
            if (adventurePrompt !== null) {
                startNewGame(adventurePrompt);
            }
        });
    }
    
    // Add story management button event listener
    const storyManagementBtn = document.getElementById('story-management-button');
    if (storyManagementBtn) {
        storyManagementBtn.addEventListener('click', () => {
            showStoryManagementOverlay();
        });
    }
}

/**
 * Start new game
 */
async function startNewGame(prompt: string): Promise<void> {
    const { logInfo, logError } = await import('./logger.js');
    logInfo('UI', `Starting new game with prompt: ${prompt || 'random'}`);
    
    showLoadingState(true);
    try {
        await startGame(prompt);
        showGameScreen();
        logInfo('UI', 'New game started successfully');
    } catch (error: any) {
        logError('UI', 'Failed to start game', error);
        showError(`Failed to start game: ${error}`);
    } finally {
        showLoadingState(false);
    }
}

/**
 * Show game screen
 */
function showGameScreen(): void {
    const gameContainer = document.getElementById('game-container');
    if (!gameContainer) return;
    
    gameContainer.innerHTML = `
        <div class="w-full max-w-3xl bg-gray-800/50 backdrop-blur-sm rounded-2xl shadow-2xl shadow-indigo-500/20 overflow-hidden border border-gray-700">
            <!-- Image Container -->
            <div id="image-container" class="relative w-full h-72 sm:h-96 bg-gray-900 overflow-hidden rounded-t-2xl">
                <img id="scene-image" src="" class="w-full h-full object-contain transition-opacity duration-1000 opacity-0 cursor-pointer hover:scale-105 transition-transform duration-300" alt="Current game scene" title="Click to view full size">
                <div id="loading-overlay" class="absolute inset-0 bg-black/70 flex flex-col items-center justify-center z-10">
                    <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-400"></div>
                    <p class="mt-4 text-lg text-gray-300">The world is materializing...</p>
                </div>
            </div>
            
            <div class="p-6 sm:p-8">
                <!-- Game Controls -->
                <div class="flex justify-between items-center mb-4">
                    <div class="flex items-center gap-3">
                        <button id="settings-button" 
                                class="w-10 h-10 bg-gray-800/50 rounded-full hover:bg-gray-700/70 transition-colors flex items-center justify-center text-gray-400 hover:text-white">
                            ⚙️
                        </button>
                        <button id="export-button" 
                                class="w-10 h-10 bg-gray-800/50 rounded-full hover:bg-gray-700/70 transition-colors flex items-center justify-center text-gray-400 hover:text-white">
                            💾
                        </button>
                        <button id="reset-button" 
                                class="w-10 h-10 bg-gray-800/50 rounded-full hover:bg-gray-700/70 transition-colors flex items-center justify-center text-gray-400 hover:text-white">
                            🔄
                        </button>
                        <button id="auto-summarize-button" 
                                class="w-10 h-10 bg-gray-800/50 rounded-full hover:bg-gray-700/70 transition-colors flex items-center justify-center text-gray-400 hover:text-white"
                                title="Auto-summarize steps and continue from summary">
                            📋
                        </button>
                        <button id="toggle-logs-button" 
                                class="w-10 h-10 bg-gray-800/50 rounded-full hover:bg-gray-700/70 transition-colors flex items-center justify-center text-gray-400 hover:text-white">
                            📝
                        </button>

                    </div>
                    <div class="flex items-center gap-4">
                        <div class="flex items-center gap-2">
                            <div id="menu-ollama-status" class="w-3 h-3 rounded-full bg-gray-500"></div>
                            <span class="text-gray-400 text-sm">Ollama</span>
                        </div>
                        <div class="flex items-center gap-2">
                            <div id="menu-sd-status" class="w-3 h-3 rounded-full bg-gray-500"></div>
                            <span class="text-gray-400 text-sm">SD</span>
                        </div>
                        <div class="flex items-center gap-2">
                            <div id="context-usage-indicator" class="w-3 h-3 rounded-full bg-gray-500"></div>
                            <span id="context-usage-text" class="text-gray-400 text-sm">Context</span>
                        </div>
                    </div>
                </div>
                
                <!-- Tabs -->
                <div class="flex border-b border-gray-700 mb-4">
                    <button class="tab-button py-2 px-4 text-indigo-400 border-b-2 border-indigo-400 font-semibold transition-colors" data-tab="story">
                        Story
                    </button>
                    <button class="tab-button py-2 px-4 text-gray-500 hover:text-gray-300 font-semibold transition-colors" data-tab="history">
                        History
                    </button>
                </div>
                
                <!-- Content Area -->
                <div id="story-content" class="space-y-4 text-lg text-gray-300 leading-relaxed mb-6 max-h-[250px] overflow-y-auto p-4 bg-black/20 rounded-lg border border-gray-700 scroll-smooth">
                    <!-- Story content will be populated here -->
                </div>
                
                <div id="history-content" class="hidden space-y-3 text-sm text-gray-400 leading-relaxed mb-6 max-h-[250px] overflow-y-auto p-4 bg-black/20 rounded-lg border border-gray-700 scroll-smooth">
                    <!-- History content will be populated here -->
                </div>
                
                <div id="choices-container" class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                    <!-- Choices will be populated here -->
                </div>
                
                <div class="mt-6 pt-6 border-t border-gray-700/50">
                    <form id="custom-action-form" class="flex gap-4">
                        <input type="text" id="custom-action-input" 
                               class="flex-grow bg-gray-900/50 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all" 
                               placeholder="Or, type your own action..."
                               autocomplete="off">
                        <button type="submit" id="custom-action-button" 
                                class="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 px-6 rounded-lg transition-colors duration-300 flex items-center gap-2">
                            <span>📤</span> Send
                        </button>
                    </form>
                </div>
                
                <!-- Logging Panel -->
                <div id="logging-panel" class="hidden mt-6 pt-6 border-t border-gray-700/50">
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="text-lg font-semibold text-white">📝 Live Logs</h3>
                        <div class="flex gap-2">
                            <button id="clear-logs-button" 
                                    class="bg-red-600 hover:bg-red-500 text-white px-3 py-1 rounded text-sm">
                                🗑️ Clear
                            </button>
                            <button id="close-logs-button" 
                                    class="bg-gray-600 hover:bg-gray-500 text-white px-3 py-1 rounded text-sm">
                                ✕ Close
                            </button>
                        </div>
                    </div>
                    <div id="logs-display" class="bg-black/30 rounded-lg p-4 max-h-64 overflow-y-auto border border-gray-600">
                        <div class="text-gray-500 text-sm">No logs yet...</div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Update status indicators
    updateMenuStatusIndicators();
    
    // Add event listeners
    const exportBtn = document.getElementById('export-button');
    const resetBtn = document.getElementById('reset-button');
    const autoSummarizeBtn = document.getElementById('auto-summarize-button');
    const customActionForm = document.getElementById('custom-action-form') as HTMLFormElement;
    const customActionInput = document.getElementById('custom-action-input') as HTMLInputElement;
    
    if (exportBtn) {
        exportBtn.addEventListener('click', () => exportGame());
    }
    
    if (autoSummarizeBtn) {
        autoSummarizeBtn.addEventListener('click', async () => {
            if (confirm('This will summarize all current story steps and continue from the summary. The original steps will be saved to the database. Continue?')) {
                (autoSummarizeBtn as HTMLButtonElement).disabled = true;
                autoSummarizeBtn.textContent = '⏳';
                autoSummarizeBtn.title = 'Summarizing...';
                
                try {
                    const result = await autoSummarizeSteps();
                    if (result.success) {
                        showMessage('Story steps summarized successfully! Continuing from summary...', 'success');
                        updateStoryDisplay();
                    } else {
                        showMessage(`Failed to summarize: ${result.error}`, 'error');
                    }
                } catch (error) {
                    showMessage(`Error during summarization: ${error}`, 'error');
                } finally {
                    (autoSummarizeBtn as HTMLButtonElement).disabled = false;
                    autoSummarizeBtn.textContent = '📋';
                    autoSummarizeBtn.title = 'Auto-summarize steps and continue from summary';
                }
            }
        });
    }
    
    // Logging panel event handlers
    const toggleLogsBtn = document.getElementById('toggle-logs-button');
    const closeLogsBtn = document.getElementById('close-logs-button');
    const clearLogsBtn = document.getElementById('clear-logs-button');
    const logsDisplay = document.getElementById('logs-display');
    
    if (toggleLogsBtn) {
        toggleLogsBtn.addEventListener('click', () => {
            const loggingPanel = document.getElementById('logging-panel');
            if (loggingPanel) {
                loggingPanel.classList.toggle('hidden');
                if (!loggingPanel.classList.contains('hidden')) {
                    // Connect logger to UI element and ensure it's always connected
                    import('./logger.js').then(({ logger }) => {
                        logger.setUIElement(logsDisplay);
                        // Refresh the display to show current logs
                        logger.getEntries(); // This will trigger updateUI
                    });
                }
            }
        });
    }
    
    if (closeLogsBtn) {
        closeLogsBtn.addEventListener('click', () => {
            const loggingPanel = document.getElementById('logging-panel');
            if (loggingPanel) {
                loggingPanel.classList.add('hidden');
            }
        });
    }
    
    if (clearLogsBtn) {
        clearLogsBtn.addEventListener('click', () => {
            import('./logger.js').then(({ logger }) => {
                logger.clear();
            });
        });
    }
    
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            if (confirm('Are you sure you want to reset the game?')) {
                resetGame();
                showMenuScreen();
            }
        });
    }
    
    if (customActionForm) {
        customActionForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const action = customActionInput.value.trim();
            if (action) {
                handleChoice(action);
                customActionInput.value = '';
            }
        });
    }
    
    // Show initial story
    updateStoryDisplay();
}

/**
 * Switch between tabs
 */
function switchTab(tabName: 'story' | 'history'): void {
    uiState.currentTab = tabName;
    
    // Update tab buttons
    const tabButtons = document.querySelectorAll('.tab-button');
    tabButtons.forEach(btn => {
        btn.classList.remove('bg-indigo-600', 'text-white');
        btn.classList.add('bg-gray-700', 'text-gray-300');
    });
    
    const activeButton = document.querySelector(`[data-tab="${tabName}"]`);
    if (activeButton) {
        activeButton.classList.remove('bg-gray-700', 'text-gray-300');
        activeButton.classList.add('bg-indigo-600', 'text-white');
    }
    
    // Show/hide content
    const storyContent = document.getElementById('story-content');
    const historyContent = document.getElementById('history-content');
    
    if (storyContent && historyContent) {
        if (tabName === 'story') {
            storyContent.classList.remove('hidden');
            historyContent.classList.add('hidden');
        } else {
            storyContent.classList.add('hidden');
            historyContent.classList.remove('hidden');
        }
    }
    
    // Update content based on tab
    if (tabName === 'story') {
        updateStoryDisplay();
    } else if (tabName === 'history') {
        updateHistoryDisplay();
    }
}

/**
 * Update auto-summarize button state based on game state
 */
function updateAutoSummarizeButtonState(gameState: GameState): void {
    const autoSummarizeBtn = document.getElementById('auto-summarize-button') as HTMLButtonElement;
    if (!autoSummarizeBtn) return;
    
    // Enable button only when game is playing and there are at least 2 story steps
    const canSummarize = gameState.currentState === 'PLAYING' && gameState.storyLog.length >= 2;
    
    autoSummarizeBtn.disabled = !canSummarize;
    autoSummarizeBtn.style.opacity = canSummarize ? '1' : '0.5';
    autoSummarizeBtn.title = canSummarize 
        ? 'Auto-summarize steps and continue from summary' 
        : 'Need at least 2 story steps to summarize';
}

/**
 * Update story display
 */
function updateStoryDisplay(): void {
    const gameState = getGameState();
    const storyContent = document.getElementById('story-content');
    const choicesContainer = document.getElementById('choices-container');
    const sceneImage = document.getElementById('scene-image') as HTMLImageElement;
    const loadingOverlay = document.getElementById('loading-overlay');
    
    console.log('🔄 updateStoryDisplay called');
    console.log('🔄 Game state:', gameState.currentState);
    console.log('🔄 Story log length:', gameState.storyLog?.length || 0);
    
    if (!storyContent || !choicesContainer) {
        console.error('❌ Missing story content or choices container');
        return;
    }
    
    // Update auto-summarize button state
    updateAutoSummarizeButtonState(gameState);
    
    // Clear previous content
    storyContent.innerHTML = '';
    choicesContainer.innerHTML = '';
    
    // Show loading if game is loading
    if (gameState.currentState === 'LOADING') {
        if (loadingOverlay) loadingOverlay.classList.remove('hidden');
        return;
    } else {
        if (loadingOverlay) loadingOverlay.classList.add('hidden');
    }
    
    // Display story entries
    gameState.storyLog.forEach((entry, index) => {
        // Add story text
        const storyParagraph = document.createElement('p');
        storyParagraph.className = 'text-gray-300 leading-relaxed';
        storyParagraph.textContent = entry.story;
        storyContent.appendChild(storyParagraph);
        
        // Show image for the latest entry
        if (index === gameState.storyLog.length - 1 && entry.imageData) {
            if (sceneImage) {
                // Ensure base64 image data has proper data URL prefix
                const imageSrc = entry.imageData.startsWith('data:') 
                    ? entry.imageData 
                    : `data:image/png;base64,${entry.imageData}`;
                sceneImage.src = imageSrc;
                sceneImage.classList.remove('opacity-0');
                sceneImage.classList.add('opacity-100');
            }
        }
        
        // Add choices for the latest entry
        if (index === gameState.storyLog.length - 1 && entry.choices.length > 0) {
            entry.choices.forEach(choice => {
                const choiceBtn = document.createElement('button');
                choiceBtn.className = 'choice-button bg-gray-700 hover:bg-gray-600 text-white p-4 rounded-lg transition-colors duration-300 text-left font-medium';
                choiceBtn.textContent = choice;
                choicesContainer.appendChild(choiceBtn);
            });
        }
    });
    
    // Scroll to bottom
    storyContent.scrollTop = storyContent.scrollHeight;
}

/**
 * Update history display
 */
function updateHistoryDisplay(): void {
    const gameState = getGameState();
    const historyContent = document.getElementById('history-content');
    
    if (!historyContent) return;
    
    historyContent.innerHTML = '';
    
    // Display action history
    gameState.actionLog.forEach((action, index) => {
        const historyEntry = document.createElement('div');
        historyEntry.className = 'bg-gray-800 rounded-lg p-4 mb-4';
        
        const timestamp = new Date(action.timestamp).toLocaleString();
        const choice = action.choice;
        
        // Determine outcome color and text
        let outcomeColor = 'text-gray-400';
        let outcomeText = action.outcome || 'Start';
        
        if (action.outcome === 'Success') outcomeColor = 'text-green-400';
        if (action.outcome === 'Partial Success') outcomeColor = 'text-yellow-400';
        if (action.outcome === 'Failure') outcomeColor = 'text-red-400';
        if (!action.outcome) outcomeColor = 'text-indigo-400';
        
        historyEntry.innerHTML = `
            <div class="flex justify-between items-start">
                <div class="flex-grow">
                    <p class="text-gray-400 text-sm">${timestamp}</p>
                    <p class="text-white font-medium">${choice}</p>
                </div>
                <div class="flex flex-col items-end">
                    <span class="text-gray-500 text-sm">#${index + 1}</span>
                    <span class="font-bold ${outcomeColor}">${outcomeText}</span>
                </div>
            </div>
        `;
        
        historyContent.appendChild(historyEntry);
    });
}

/**
 * Handle player choice
 */
async function handleChoice(choice: string): Promise<void> {
    const { logInfo, logError } = await import('./logger.js');
    logInfo('UI', `Processing player choice: ${choice}`);
    
    showLoadingState(true);
    try {
        await updateGame(choice);
        updateStoryDisplay();
        logInfo('UI', 'Choice processed successfully');
    } catch (error: any) {
        logError('UI', 'Failed to process choice', error);
        showError(`Failed to process choice: ${error}`);
    } finally {
        showLoadingState(false);
    }
}

/**
 * Show loading state
 */
function showLoadingState(show: boolean): void {
    uiState.isLoading = show;
    
    if (loadingIndicator) {
        if (show) {
            loadingIndicator.classList.remove('hidden');
        } else {
            loadingIndicator.classList.add('hidden');
        }
    }
    
    // Disable/enable choice buttons
    const choiceButtons = document.querySelectorAll('.choice-button');
    choiceButtons.forEach(btn => {
        (btn as HTMLButtonElement).disabled = show;
        if (show) {
            btn.classList.add('opacity-50', 'cursor-not-allowed');
        } else {
            btn.classList.remove('opacity-50', 'cursor-not-allowed');
        }
    });
}

/**
 * Show error message
 */
function showError(message: string): void {
    uiState.showError = true;
    uiState.errorMessage = message;
    
    if (errorContainer) {
        errorContainer.className = 'fixed top-4 right-4 bg-red-900 border border-red-700 text-white p-4 rounded-lg z-50 max-w-md';
        errorContainer.innerHTML = `
            <div class="flex justify-between items-start">
                <div>
                    <h4 class="font-semibold mb-2">Error</h4>
                    <p>${message}</p>
                </div>
                <button onclick="this.parentElement.parentElement.remove()" class="text-red-300 hover:text-white ml-4">&times;</button>
            </div>
        `;
        errorContainer.classList.remove('hidden');
        
        // Auto-hide after 5 seconds
        setTimeout(() => {
            errorContainer.classList.add('hidden');
        }, 5000);
    }
}

/**
 * Open image in fullscreen modal
 */
function openImageFullscreen(imageSrc: string): void {
    // Create modal overlay
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/90 flex items-center justify-center z-50 cursor-pointer';
    modal.id = 'image-modal';
    
    // Create image element
    const img = document.createElement('img');
    img.src = imageSrc;
    img.className = 'max-w-full max-h-full object-contain';
    img.alt = 'Full size image';
    
    // Add close button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'absolute top-4 right-4 text-white text-2xl hover:text-gray-300 transition-colors';
    closeBtn.innerHTML = '&times;';
    closeBtn.onclick = (e) => {
        e.stopPropagation();
        modal.remove();
    };
    
    // Close on background click
    modal.onclick = () => modal.remove();
    
    // Prevent image click from closing modal
    img.onclick = (e) => e.stopPropagation();
    
    modal.appendChild(img);
    modal.appendChild(closeBtn);
    document.body.appendChild(modal);
    
    // Close on Escape key
    const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            modal.remove();
            document.removeEventListener('keydown', handleEscape);
        }
    };
    document.addEventListener('keydown', handleEscape);
}

/**
 * Show message (success/error)
 */
function showMessage(message: string, type: 'success' | 'error'): void {
    const messageContainer = document.createElement('div');
    messageContainer.className = `fixed top-4 right-4 p-4 rounded-lg z-50 max-w-md ${
        type === 'success' ? 'bg-green-900 border border-green-700 text-white' : 'bg-red-900 border border-red-700 text-white'
    }`;
    
    messageContainer.innerHTML = `
        <div class="flex justify-between items-start">
            <div>
                <h4 class="font-semibold mb-2">${type === 'success' ? 'Success' : 'Error'}</h4>
                <p>${message}</p>
            </div>
            <button onclick="this.parentElement.parentElement.remove()" class="text-gray-300 hover:text-white ml-4">&times;</button>
        </div>
    `;
    
    document.body.appendChild(messageContainer);
    
    // Auto-hide after 3 seconds
    setTimeout(() => {
        messageContainer.remove();
    }, 3000);
}

/**
 * Import game state from file
 */
function importGame(data: any): void {
    try {
        // Validate the imported data
        if (!data.messageHistory || !data.storyLog) {
            throw new Error('Invalid adventure file format');
        }
        
        // Reset current game state
        resetGame();
        
        // Import the data using updateGameState to properly modify the game state
        updateGameState({
            messageHistory: data.messageHistory || [],
            storyLog: data.storyLog || [],
            actionLog: data.actionLog || [],
            memories: data.memories || [],
            currentState: 'PLAYING'
        });
        
        console.log('📥 Imported game state:', getGameState());
        console.log('📥 Story log entries:', getGameState().storyLog.length);
        
        // Switch to game screen
        showGameScreen();
        
        // Update the UI to show the imported content
        updateStoryDisplay();
        
        showMessage('Adventure imported successfully!', 'success');
        
    } catch (error) {
        console.error('Import failed:', error);
        showMessage('Failed to import adventure: ' + (error as Error).message, 'error');
    }
}

/**
 * Export game state
 */
async function exportGame(): Promise<void> {
    const gameState = getGameState();
    const config = await loadConfig();
    const gameName = config.gameName || `ai-adventure-${new Date().toISOString().split('T')[0]}`;
    
    const dataStr = JSON.stringify(gameState, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    
    const link = document.createElement('a');
    link.href = URL.createObjectURL(dataBlob);
    link.download = `${gameName}.json`;
    link.click();
    
    showMessage('Game exported successfully!', 'success');
}

/**
 * Get current UI state
 */
export function getUIState(): UIState {
    return { ...uiState };
}

/**
 * Update UI state
 */
export function updateUIState(newState: Partial<UIState>): void {
    uiState = { ...uiState, ...newState };
}

/**
 * Story Management Overlay Functions
 */

/**
 * Show story management overlay
 */
function showStoryManagementOverlay(): void {
    const overlay = document.createElement('div');
    overlay.id = 'story-management-overlay';
    overlay.className = 'fixed inset-0 bg-black/50 z-50';
    overlay.innerHTML = createStoryManagementOverlayHTML();
    
    document.body.appendChild(overlay);
    
    // Setup event listeners after DOM is rendered
    setTimeout(() => {
        setupStoryManagementOverlayEventListeners();
    }, 100);
    
    // Load initial data
    loadStoryManagementData();
}

/**
 * Hide story management overlay
 */
function hideStoryManagementOverlay(): void {
    const overlay = document.getElementById('story-management-overlay');
    if (overlay) {
        overlay.remove();
    }
}

/**
 * Switch story management overlay tabs
 */
function switchStoryManagementTab(tabId: string): void {
    // Hide all tab contents
    const tabContents = document.querySelectorAll('.story-tab-content');
    tabContents.forEach(content => {
        content.classList.add('hidden');
        content.classList.remove('active');
    });
    
    // Remove active class from all tab buttons
    const tabButtons = document.querySelectorAll('.story-tab-button');
    tabButtons.forEach(button => {
        button.classList.remove('active', 'border-indigo-500', 'text-indigo-400');
        button.classList.add('border-transparent', 'text-gray-400');
    });
    
    // Show selected tab content
    const tabName = tabId.replace('story-tab-', '');
    const targetContent = document.getElementById(`story-tab-content-${tabName}`);
    if (targetContent) {
        targetContent.classList.remove('hidden');
        targetContent.classList.add('active');
    }
    
    // Activate selected tab button
    const targetButton = document.getElementById(tabId);
    if (targetButton) {
        targetButton.classList.add('active', 'border-indigo-500', 'text-indigo-400');
        targetButton.classList.remove('border-transparent', 'text-gray-400');
    }
}

/**
 * Load story management data
 */
async function loadStoryManagementData(): Promise<void> {
    try {
        console.log('loadStoryManagementData: Starting...');
        const statusElement = document.getElementById('story-management-status');
        if (statusElement) {
            statusElement.textContent = 'Loading...';
        }
        
        console.log('loadStoryManagementData: Calling getAllDatabaseData...');
        const allData = await getAllDatabaseData();
        console.log('loadStoryManagementData: Received data:', allData);
        
        // Update story management tab
        updateStoryManagementTab(allData);
        
        // Update story summary tab
        updateStorySummaryTab(allData);
        
        // Update status
        if (statusElement) {
            statusElement.textContent = 'Ready';
        }
        
    } catch (error) {
        console.error('Failed to load story management data:', error);
        showMessage('Failed to load story management data', 'error');
        
        const statusElement = document.getElementById('story-management-status');
        if (statusElement) {
            statusElement.textContent = 'Error';
        }
    }
}

/**
 * Update story management tab
 */
function updateStoryManagementTab(allData: any): void {
    console.log('updateStoryManagementTab called with data:', allData);
    console.log('Data type check:', typeof allData, Array.isArray(allData));
    console.log('storySummaries type:', typeof allData.storySummaries, Array.isArray(allData.storySummaries));
    console.log('storySummaries length:', allData.storySummaries?.length);
    console.log('storySummaries content:', allData.storySummaries);
    
    // Populate session selector
    const sessionSelector = document.getElementById('story-session-selector');
    if (sessionSelector) {
        console.log('Session selector found, storySummaries:', allData.storySummaries);
        
        if (allData.storySummaries && allData.storySummaries.length > 0) {
            console.log('Processing story summaries...');
            
            // Group summaries by session and get the most recent one for each
            const sessionMap = new Map();
            allData.storySummaries.forEach((summary: any, index: number) => {
                console.log(`Processing summary ${index}:`, summary);
                if (!sessionMap.has(summary.session_id) || 
                    new Date(summary.updated_at) > new Date(sessionMap.get(summary.session_id).updated_at)) {
                    sessionMap.set(summary.session_id, summary);
                }
            });
            
            const uniqueSessions = Array.from(sessionMap.values()).sort((a: any, b: any) => 
                new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
            );
            
            console.log('Unique sessions found:', uniqueSessions.length);
            console.log('Unique sessions:', uniqueSessions);
            
            const optionsHTML = uniqueSessions.map((summary: any) => {
                const date = new Date(summary.updated_at).toLocaleDateString();
                const time = new Date(summary.updated_at).toLocaleTimeString();
                const stepCount = summary.step_count || 0;
                return `<option value="${summary.session_id}">${date} ${time} (${stepCount} steps)</option>`;
            }).join('');
            
            console.log('Generated options HTML:', optionsHTML);
            
            const finalHTML = '<option value="">Select a session...</option>' + optionsHTML;
            console.log('Final HTML to insert:', finalHTML);
            sessionSelector.innerHTML = finalHTML;
            console.log('Session selector updated successfully');
            console.log('Session selector innerHTML after update:', sessionSelector.innerHTML);
            console.log('Session selector value after update:', (sessionSelector as HTMLSelectElement).value);
            console.log('Session selector options length after update:', (sessionSelector as HTMLSelectElement).options.length);
            
            // Auto-select and load the first session
            if (uniqueSessions.length > 0) {
                const firstSessionId = uniqueSessions[0].session_id;
                console.log('Auto-selecting first session:', firstSessionId);
                (sessionSelector as HTMLSelectElement).value = firstSessionId;
                
                // Trigger the change event to auto-load the data
                setTimeout(() => {
                    console.log('Auto-loading first session data...');
                    loadSessionData(firstSessionId);
                }, 200);
            }
            
            // Check if something overwrites our update
            setTimeout(() => {
                console.log('Session selector innerHTML after 100ms delay:', sessionSelector.innerHTML);
                console.log('Session selector options length after 100ms delay:', (sessionSelector as HTMLSelectElement).options.length);
            }, 100);
        } else {
            console.log('No story summaries found - condition failed');
            console.log('allData.storySummaries exists:', !!allData.storySummaries);
            console.log('allData.storySummaries length:', allData.storySummaries?.length);
            sessionSelector.innerHTML = '<option value="">No sessions available</option>';
        }
    } else {
        console.log('Session selector not found');
    }
}

/**
 * Update story summary tab
 */
function updateStorySummaryTab(allData: any): void {
    const summaryContainer = document.getElementById('story-summary-display');
    if (summaryContainer) {
        if (allData.storySummaries.length === 0) {
            summaryContainer.innerHTML = '<span class="text-gray-500">No story summaries found</span>';
        } else {
            summaryContainer.innerHTML = formatSummaryData(allData.storySummaries, true);
        }
    }
}

/**
 * Setup story management overlay event listeners
 */
function setupStoryManagementOverlayEventListeners(): void {
    console.log('🔧 setupStoryManagementOverlayEventListeners called');
    console.log('🔧 Current time:', new Date().toLocaleTimeString());
    // Close button
    const closeBtn = document.getElementById('close-story-management-overlay');
    if (closeBtn) {
        closeBtn.addEventListener('click', hideStoryManagementOverlay);
    }
    
    // Tab switching
    const tabButtons = document.querySelectorAll('.story-tab-button');
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabId = button.id;
            switchStoryManagementTab(tabId);
        });
    });
    
    // Session selector change - automatically load session data when selected
    const sessionSelector = document.getElementById('story-session-selector');
    if (sessionSelector) {
        console.log('Session selector found, adding change event listener');
        sessionSelector.addEventListener('change', (e) => {
            const target = e.target as HTMLSelectElement;
            const sessionId = target.value;
            console.log('Session selector changed to:', sessionId);
            if (sessionId) {
                console.log('Auto-loading session data...');
                loadSessionData(sessionId);
            } else {
                console.log('No session selected, clearing displays');
                // Clear displays when no session is selected
                const summaryContainer = document.getElementById('story-summary-container');
                const stepsContainer = document.getElementById('story-steps-container');
                if (summaryContainer) summaryContainer.innerHTML = '<span class="text-gray-500">Select a session to view summary...</span>';
                if (stepsContainer) stepsContainer.innerHTML = '<span class="text-gray-500">Select a session to view steps...</span>';
            }
        });
    } else {
        console.log('Session selector NOT found for change event!');
    }
    
    // Delete session data button
    const deleteSessionBtn = document.getElementById('delete-session-data');
    if (deleteSessionBtn) {
        deleteSessionBtn.addEventListener('click', () => {
            const sessionSelector = document.getElementById('story-session-selector') as HTMLSelectElement;
            const sessionId = sessionSelector.value;
            if (sessionId) {
                deleteSessionData(sessionId);
            } else {
                showMessage('Please select a session first', 'error');
            }
        });
    }
    

    
    // Import story button in summary tab
    const importStorySummaryBtn = document.getElementById('import-story-summary');
    if (importStorySummaryBtn) {
        importStorySummaryBtn.addEventListener('click', () => {
            importStoryFromFile();
        });
    }
    
    // Refresh data button
    const refreshBtn = document.getElementById('refresh-story-data');
    if (refreshBtn) {
        console.log('Refresh button found, adding event listener');
        refreshBtn.addEventListener('click', () => {
            console.log('Refresh button clicked!');
            loadStoryManagementData();
        });
    } else {
        console.log('Refresh button NOT found!');
    }
    
    // Refresh button in database overlay (if it exists)
    const refreshDbBtn = document.getElementById('refresh-db-data');
    if (refreshDbBtn) {
        refreshDbBtn.addEventListener('click', () => {
            loadStoryManagementData();
        });
    }
    
    // Load story from session button
    const loadStoryBtn = document.getElementById('load-story-from-session');
    console.log('🔍 Looking for Load Story button with ID: load-story-from-session');
    console.log('🎯 Load Story button element found:', !!loadStoryBtn);
    console.log('🎯 Load Story button details:', loadStoryBtn);
    
    if (loadStoryBtn) {
        console.log('✅ Load Story button found, adding event listener');
        loadStoryBtn.addEventListener('click', (event) => {
            console.log('🎮 LOAD STORY BUTTON CLICKED!');
            console.log('🎮 Click event:', event);
            console.log('🎮 Button element:', event.target);
            
            console.log('🔍 Looking for session selector with ID: story-session-selector');
            const sessionSelector = document.getElementById('story-session-selector') as HTMLSelectElement;
            console.log('🎯 Session selector found:', !!sessionSelector);
            console.log('🎯 Session selector element:', sessionSelector);
            
            if (sessionSelector) {
                const sessionId = sessionSelector.value;
                console.log('🎯 Selected session ID:', sessionId);
                console.log('🎯 Session selector value type:', typeof sessionId);
                console.log('🎯 Session selector all options:', Array.from(sessionSelector.options).map(opt => ({ value: opt.value, text: opt.text })));
                
                if (sessionId && sessionId.trim() !== '') {
                    console.log('✅ Session ID is valid, calling loadGameFromSummary...');
                    console.log('🔍 Checking if loadGameFromSummary exists on window:', typeof (window as any).loadGameFromSummary);
                    
                    try {
                        (window as any).loadGameFromSummary(sessionId);
                        console.log('✅ loadGameFromSummary called successfully');
                    } catch (error) {
                        console.error('❌ Error calling loadGameFromSummary:', error);
                        showMessage('Error loading game: ' + (error as Error).message, 'error');
                    }
                } else {
                    console.log('❌ No session selected or empty session ID');
                    showMessage('Please select a session first', 'error');
                }
            } else {
                console.error('❌ Session selector not found!');
                showMessage('Session selector not found', 'error');
            }
        });
        console.log('✅ Event listener added to Load Story button');
    } else {
        console.error('❌ Load Story button NOT found!');
        console.log('🔍 Available buttons with "load" in ID:');
        const allButtons = document.querySelectorAll('button[id*="load"]');
        allButtons.forEach(btn => console.log('  -', btn.id, btn));
    }
    
    // Delete summary button
    const deleteSummaryBtn = document.getElementById('delete-summary');
    if (deleteSummaryBtn) {
        deleteSummaryBtn.addEventListener('click', () => {
            const sessionSelector = document.getElementById('story-session-selector') as HTMLSelectElement;
            const sessionId = sessionSelector.value;
            if (sessionId) {
                deleteSessionData(sessionId);
            } else {
                showMessage('Please select a session first', 'error');
            }
        });
    }
    
    // Delete steps button
    const deleteStepsBtn = document.getElementById('delete-steps');
    if (deleteStepsBtn) {
        deleteStepsBtn.addEventListener('click', () => {
            const sessionSelector = document.getElementById('story-session-selector') as HTMLSelectElement;
            const sessionId = sessionSelector.value;
            if (sessionId) {
                deleteSessionData(sessionId);
            } else {
                showMessage('Please select a session first', 'error');
            }
        });
    }
}

/**
 * Load session data
 */
async function loadSessionData(sessionId: string): Promise<void> {
    try {
        console.log('loadSessionData called with sessionId:', sessionId);
        const sessionData = await getGameSessionData(sessionId);
        console.log('getGameSessionData returned:', sessionData);
        
        // Update summary display
        const summaryContainer = document.getElementById('story-summary-container');
        console.log('summaryContainer found:', !!summaryContainer);
        console.log('sessionData.storySummaries:', sessionData.storySummaries);
        console.log('Looking for sessionId:', sessionId);
        if (summaryContainer) {
            const summary = sessionData.storySummaries.find((s: any) => s.session_id === sessionId);
            console.log('summary found:', summary);
            console.log('summary.session_id:', summary?.session_id);
            console.log('summary.summary:', summary?.summary);
            if (summary) {
                summaryContainer.innerHTML = `<div class="text-gray-300">${summary.summary}</div>`;
                console.log('Summary content updated');
            } else {
                summaryContainer.innerHTML = '<span class="text-gray-500">No summary found for this session</span>';
                console.log('No summary found for session');
            }
        }
        
        // Update steps display
        const stepsContainer = document.getElementById('story-steps-container');
        if (stepsContainer) {
            // For now, show placeholder - you can expand this to show actual steps
            stepsContainer.innerHTML = '<span class="text-gray-500">Story steps display coming soon...</span>';
        }
        
        // Show session info
        const sessionInfo = document.getElementById('session-info');
        if (sessionInfo) {
            sessionInfo.classList.remove('hidden');
            const sessionDetails = document.getElementById('session-details');
            if (sessionDetails) {
                sessionDetails.innerHTML = `
                    <div class="text-gray-300">
                        <div><strong>Session ID:</strong> ${sessionId}</div>
                        <div><strong>Summary:</strong> ${sessionData.storySummaries.length > 0 ? 'Yes' : 'No'}</div>
                        <div><strong>Steps:</strong> ${sessionData.storySummaries.length > 0 ? sessionData.storySummaries[0].step_count || 0 : 0}</div>
                    </div>
                `;
            }
        }
        
    } catch (error) {
        console.error('Error loading session data:', error);
        showMessage('Failed to load session data: ' + (error as Error).message, 'error');
    }
}

/**
 * Load game from session
 */
async function loadGameFromSession(sessionId: string): Promise<void> {
                    try {
                    await (window as any).loadGameFromSummary(sessionId);
                } catch (error) {
        console.error('Failed to load game from session:', error);
        showMessage('Failed to load game from session', 'error');
    }
}

/**
 * Load game from a story summary session
 */
// Make function globally accessible
(window as any).loadGameFromSummary = async function(sessionId: string): Promise<void> {
    console.log('🚀 loadGameFromSummary called with sessionId:', sessionId);
    try {
        console.log('📦 Importing database module...');
        // Get the story steps for this session
        const { loadStorySteps } = await import('./database.js');
        console.log('✅ Database module imported successfully');
        
        console.log('🔍 Loading story steps for session:', sessionId);
        const storySteps = await loadStorySteps(sessionId);
        console.log('📊 Story steps loaded:', storySteps.length, 'steps');
        console.log('📊 Story steps data:', storySteps);
        
        if (storySteps.length === 0) {
            console.log('❌ No story steps found for session');
            showMessage('No story steps found for this session', 'error');
            return;
        }
        
        console.log('🔄 Sorting steps by step number...');
        // Sort steps by step number to ensure correct order
        storySteps.sort((a, b) => a.step_number - b.step_number);
        console.log('✅ Steps sorted successfully');
        
        console.log('🔧 Reconstructing game state from story steps...');
        // Reconstruct the game state from story steps
        const reconstructedGameState = {
            messageHistory: [],
            storyLog: storySteps.map(step => ({
                id: step.story_entry_id,
                story: step.story_text,
                imagePrompt: step.image_prompt,
                choices: step.choices,
                timestamp: step.timestamp
            })),
            actionLog: storySteps.map(step => ({
                choice: step.choice,
                outcome: step.outcome,
                timestamp: step.timestamp
            })),
            memories: storySteps.flatMap(step => step.new_memories),
            currentState: 'PLAYING'
        };
        console.log('✅ Game state reconstructed:', reconstructedGameState);
        
        console.log('🔄 Resetting current game state...');
        // Reset current game state
        resetGame();
        console.log('✅ Game reset completed');
        
        console.log('📥 Importing reconstructed game data...');
        // Import the reconstructed data
        importGame(reconstructedGameState);
        console.log('✅ Game data imported successfully');
        
        console.log('🚪 Closing story management overlay...');
        // Close the overlay and show success message
        hideStoryManagementOverlay();
        console.log('✅ Overlay closed');
        showMessage('Game loaded successfully from session!', 'success');
        
    } catch (error) {
        console.error('❌ CRITICAL ERROR in loadGameFromSummary:', error);
        console.error('❌ Error type:', typeof error);
        console.error('❌ Error message:', (error as Error).message);
        console.error('❌ Error stack:', (error as Error).stack);
        showMessage('Failed to load game from summary: ' + (error as Error).message, 'error');
    }
}

/**
 * Delete session data
 */
async function deleteSessionData(sessionId: string): Promise<void> {
    if (confirm(`Are you sure you want to delete all data for session ${sessionId}?`)) {
        try {
            await deleteStorySummaryFromDatabase(sessionId);
            showMessage('Session data deleted successfully', 'success');
            
            // Clear the current session display
            const summaryContainer = document.getElementById('story-summary-container');
            if (summaryContainer) {
                summaryContainer.innerHTML = '<span class="text-gray-500">Select a session to view summary...</span>';
            }
            
            const stepsContainer = document.getElementById('story-steps-container');
            if (stepsContainer) {
                stepsContainer.innerHTML = '<span class="text-gray-500">Select a session to view steps...</span>';
            }
            
            const sessionInfo = document.getElementById('session-info');
            if (sessionInfo) {
                sessionInfo.classList.add('hidden');
            }
            
            // Reset session selector
            const sessionSelector = document.getElementById('story-session-selector') as HTMLSelectElement;
            if (sessionSelector) {
                sessionSelector.value = '';
            }
            
            // Refresh all data
            await loadStoryManagementData();
        } catch (error) {
            console.error('Failed to delete session data:', error);
            showMessage('Failed to delete session data', 'error');
        }
    }
}

/**
 * Import story from file
 */
function importStoryFromFile(): void {
    // Create a hidden file input
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json,application/json';
    fileInput.style.display = 'none';
    
    fileInput.addEventListener('change', (event) => {
        const target = event.target as HTMLInputElement;
        const file = target.files?.[0];
        if (!file) return;
        
        if (!file.name.endsWith('.json') && file.type !== 'application/json') {
            showMessage('Invalid file type. Please select a .json adventure file.', 'error');
            return;
        }
        
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target?.result as string);
                if (data.messageHistory && data.storyLog) {
                    importGame(data);
                    hideStoryManagementOverlay();
                    showMessage('Adventure imported successfully!', 'success');
                } else {
                    throw new Error('Invalid adventure file format. Required data is missing.');
                }
            } catch (error) {
                console.error('Error parsing adventure file:', error);
                showMessage('Could not read the adventure file. It might be corrupted or in the wrong format.', 'error');
            }
        };
        
        reader.onerror = () => {
            showMessage('There was an error reading the selected file.', 'error');
        };
        
        reader.readAsText(file);
    });
    
    document.body.appendChild(fileInput);
    fileInput.click();
    document.body.removeChild(fileInput);
}

/**
 * Database Overlay Functions
 */

/**
 * Show database overlay
 */
function showDatabaseOverlay(): void {
    const modal = document.getElementById('database-overlay-modal');
    if (modal) {
        modal.classList.remove('hidden');
        refreshDatabaseData();
        setupStoryManagementHandlers();
    }
}

/**
 * Hide database overlay
 */
function hideDatabaseOverlay(): void {
    const modal = document.getElementById('database-overlay-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

/**
 * Switch database overlay tabs
 */
function switchDatabaseTab(tabId: string): void {
    // Hide all tab contents
    const tabContents = document.querySelectorAll('.db-tab-content');
    tabContents.forEach(content => {
        content.classList.add('hidden');
        content.classList.remove('active');
    });
    
    // Remove active class from all tab buttons
    const tabButtons = document.querySelectorAll('.db-tab-button');
    tabButtons.forEach(button => {
        button.classList.remove('active', 'border-indigo-500', 'text-indigo-400');
        button.classList.add('border-transparent', 'text-gray-400');
    });
    
    // Show selected tab content
    const tabName = tabId.replace('db-tab-', '');
    const targetContent = document.getElementById(`db-tab-content-${tabName}`);
    if (targetContent) {
        targetContent.classList.remove('hidden');
        targetContent.classList.add('active');
    }
    
    // Activate selected tab button
    const targetButton = document.getElementById(tabId);
    if (targetButton) {
        targetButton.classList.add('active', 'border-indigo-500', 'text-indigo-400');
        targetButton.classList.remove('border-transparent', 'text-gray-400');
    }
}

/**
 * Refresh database data
 */
async function refreshDatabaseData(): Promise<void> {
    const statusElement = document.getElementById('db-status');
    if (statusElement) {
        statusElement.textContent = 'Loading...';
    }
    
    try {
        const allData = await getAllDatabaseData();
        
        // Update configs tab
        const configsElement = document.getElementById('configs-data');
        if (configsElement) {
            configsElement.innerHTML = formatConfigData(allData.configs);
        }
        
        // Update summaries tab - show current session summaries or all summaries with delete options
        const summariesElement = document.getElementById('summaries-data');
        if (summariesElement) {
            const gameState = getGameState();
            if (gameState.sessionId) {
                // Get only current session summaries
                const currentSessionSummaries = allData.storySummaries.filter(
                    summary => summary.session_id === gameState.sessionId
                );
                summariesElement.innerHTML = formatSummaryData(currentSessionSummaries, false);
            } else {
                // Show all summaries with delete buttons when no active session
                summariesElement.innerHTML = formatSummaryData(allData.storySummaries, true);
            }
        }
        
        // Update current game tab
        const currentGameElement = document.getElementById('current-game-data');
        if (currentGameElement) {
            const gameState = getGameState();
            if (gameState.sessionId) {
                const gameData = await getGameSessionData(gameState.sessionId);
                currentGameElement.innerHTML = formatCurrentGameData(gameData, gameState);
            } else {
                currentGameElement.innerHTML = '<span class="text-gray-500">No active game session</span>';
            }
        }
        
        // Update story management tab - load story sessions
        await loadStorySessions();
        
        if (statusElement) {
            statusElement.textContent = 'Data loaded successfully';
        }
        
    } catch (error) {
        console.error('Failed to refresh database data:', error);
        if (statusElement) {
            statusElement.textContent = 'Error loading data';
        }
    }
}

/**
 * Export database data as JSON
 */
function exportDatabaseData(): void {
    getAllDatabaseData().then(allData => {
        const dataStr = JSON.stringify(allData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        link.download = `ai-adventure-database-${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        
        showMessage('Database exported successfully!', 'success');
    }).catch(error => {
        console.error('Failed to export database data:', error);
        showMessage('Failed to export database data', 'error');
    });
}

/**
 * Delete a story summary
 */
async function deleteStorySummary(sessionId: string): Promise<void> {
    if (!confirm(`Are you sure you want to delete the story summary for session ${sessionId}? This action cannot be undone.`)) {
        return;
    }
    
    try {
        const success = await deleteStorySummaryFromDatabase(sessionId);
        if (success) {
            // Refresh the database data to update the display
            await refreshDatabaseData();
            showMessage(`Story summary for session ${sessionId} deleted successfully`, 'success');
        } else {
            showMessage(`Failed to delete story summary for session ${sessionId}`, 'error');
        }
    } catch (error) {
        console.error('Error deleting story summary:', error);
        showMessage('Error deleting story summary', 'error');
    }
}

// Make deleteStorySummary available globally for onclick handlers
declare global {
    interface Window {
        deleteStorySummary: (sessionId: string) => Promise<void>;
    }
}
window.deleteStorySummary = deleteStorySummary;

/**
 * Format configuration data for display
 */
function formatConfigData(configs: any[]): string {
    if (configs.length === 0) {
        return '<span class="text-gray-500">No configurations found</span>';
    }
    
    return configs.map(config => `
        <div class="mb-4 p-3 bg-gray-800 rounded border border-gray-600">
            <div class="font-semibold text-blue-400">ID: ${config.id}</div>
            <div class="text-green-400">Label: ${config.label}</div>
            <div class="text-yellow-400">Created: ${new Date(config.created_at).toLocaleString()}</div>
            <div class="text-yellow-400">Updated: ${new Date(config.updated_at).toLocaleString()}</div>
            <div class="mt-2 text-xs text-gray-400">
                <details>
                    <summary class="cursor-pointer hover:text-gray-300">View Config JSON</summary>
                    <pre class="mt-2 p-2 bg-gray-900 rounded overflow-x-auto">${JSON.stringify(JSON.parse(config.config_json), null, 2)}</pre>
                </details>
            </div>
        </div>
    `).join('');
}

/**
 * Format story summary data for display
 */
function formatSummaryData(summaries: any[], showDeleteButtons: boolean = false): string {
    if (summaries.length === 0) {
        return '<span class="text-gray-500">No story summaries found</span>';
    }
    
    return summaries.map(summary => `
        <div class="mb-4 p-3 bg-gray-800 rounded border border-gray-600">
            <div class="font-semibold text-blue-400">ID: ${summary.id}</div>
            <div class="text-green-400">Session ID: ${summary.session_id}</div>
            <div class="text-yellow-400">Step Count: ${summary.step_count}</div>
            <div class="text-yellow-400">Created: ${new Date(summary.created_at).toLocaleString()}</div>
            <div class="text-yellow-400">Updated: ${new Date(summary.updated_at).toLocaleString()}</div>
            <div class="mt-2 text-xs text-gray-400">
                <details>
                    <summary class="cursor-pointer hover:text-gray-300">View Summary Content</summary>
                    <div class="mt-2 p-2 bg-gray-900 rounded max-h-32 overflow-y-auto">${summary.summary}</div>
                </details>
            </div>
            <div class="mt-2 flex gap-2">
                <button onclick="loadGameFromSummary('${summary.session_id}')" 
                        class="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded text-xs">
                    🎮 Load Game
                </button>
            ${showDeleteButtons ? `
                    <button onclick="deleteStorySummary('${summary.session_id}')" 
                            class="bg-red-600 hover:bg-red-500 text-white px-3 py-1 rounded text-xs">
                        🗑️ Delete Summary
                    </button>
            ` : ''}
            </div>
        </div>
    `).join('');
}

/**
 * Format current game data for display
 */
function formatCurrentGameData(gameData: any, gameState: any): string {
    return `
        <div class="mb-4 p-3 bg-gray-800 rounded border border-gray-600">
            <div class="font-semibold text-blue-400">Current Session ID: ${gameState.sessionId}</div>
            <div class="text-green-400">Story Log Entries: ${gameState.storyLog.length}</div>
            <div class="text-green-400">Message History: ${gameState.messageHistory.length}</div>
            <div class="text-green-400">Action Log: ${gameState.actionLog.length}</div>
            <div class="text-green-400">Memories: ${gameState.memories.length}</div>
        </div>
        
        <div class="mb-4 p-3 bg-gray-800 rounded border border-gray-600">
            <div class="font-semibold text-blue-400">Session Story Summaries</div>
            ${formatSummaryData(gameData.storySummaries)}
        </div>
        
        <div class="mb-4 p-3 bg-gray-800 rounded border border-gray-600">
            <div class="font-semibold text-blue-400">Available Configurations</div>
            ${formatConfigData(gameData.configs)}
        </div>
    `;
}

/**
 * Format story steps data for display
 */
function formatStoryStepsData(steps: any[], showDeleteButtons: boolean = false): string {
    if (steps.length === 0) {
        return '<span class="text-gray-500">No story steps found</span>';
    }
    
    return steps.map(step => `
        <div class="mb-4 p-3 bg-gray-800 rounded border border-gray-600">
            <div class="font-semibold text-blue-400">Step ${step.step_number}</div>
            <div class="text-green-400">Choice: ${step.choice}</div>
            <div class="text-yellow-400">Outcome: ${step.outcome}</div>
            <div class="text-yellow-400">Timestamp: ${new Date(step.timestamp).toLocaleString()}</div>
            <div class="mt-2 text-xs text-gray-400">
                <details>
                    <summary class="cursor-pointer hover:text-gray-300">View Story Content</summary>
                    <div class="mt-2 p-2 bg-gray-900 rounded max-h-32 overflow-y-auto">
                        <div class="mb-2"><strong>Story:</strong> ${step.story_text}</div>
                        <div class="mb-2"><strong>Image Prompt:</strong> ${step.image_prompt}</div>
                        <div class="mb-2"><strong>Choices:</strong> ${step.choices.join(', ')}</div>
                        <div class="mb-2"><strong>New Memories:</strong> ${step.new_memories.join(', ')}</div>
                    </div>
                </details>
            </div>
        </div>
    `).join('');
}

/**
 * Load and display story steps for a session
 */
async function loadAndDisplayStorySteps(sessionId: string): Promise<void> {
    try {
        const { loadStorySteps } = await import('./database.js');
        const steps = await loadStorySteps(sessionId);
        
        const stepsContainer = document.getElementById('story-steps-container');
        if (stepsContainer) {
            stepsContainer.innerHTML = formatStoryStepsData(steps, true);
        }
    } catch (error) {
        console.error('Error loading story steps:', error);
        showMessage('Error loading story steps', 'error');
    }
}

/**
 * Delete story steps for a session
 */
async function deleteStorySteps(sessionId: string): Promise<void> {
    try {
        const { deleteStorySteps } = await import('./database.js');
        const success = await deleteStorySteps(sessionId);
        
        if (success) {
            showMessage(`Story steps for session ${sessionId} deleted successfully`, 'success');
            refreshDatabaseData();
        } else {
            showMessage(`Failed to delete story steps for session ${sessionId}`, 'error');
        }
    } catch (error) {
        console.error('Error deleting story steps:', error);
        showMessage('Error deleting story steps', 'error');
    }
}

/**
 * Load game from database by session ID
 */
async function loadGameFromDatabase(sessionId: string): Promise<void> {
    try {
        showMessage('Loading game from database...', 'success');
        
        // Get story steps for this session
        const { loadStorySteps } = await import('./database.js');
        const storySteps = await loadStorySteps(sessionId);
        
        if (storySteps.length === 0) {
            showMessage('No story steps found for this session', 'error');
            return;
        }
        
        // Sort steps by step number
        storySteps.sort((a, b) => a.step_number - b.step_number);
        
        // Reconstruct game state from story steps
        const messageHistory: any[] = [];
        const storyLog: any[] = [];
        const actionLog: any[] = [];
        const memories: string[] = [];
        
        // Process each story step
        storySteps.forEach(step => {
            // Add story entry to story log
            const storyEntry = {
                id: step.story_entry_id,
                story: step.story_text,
                image_prompt: step.image_prompt,
                choices: step.choices,
    
                timestamp: step.timestamp
            };
            storyLog.push(storyEntry);
            
            // Add action to action log
            const actionEntry = {
                choice: step.choice,
                timestamp: step.timestamp,
                outcome: step.outcome
            };
            actionLog.push(actionEntry);
            
            // Add memories
            if (step.new_memories && step.new_memories.length > 0) {
                memories.push(...step.new_memories);
            }
        });
        
        // Create a reconstructed game session
        const reconstructedSession = {
            id: sessionId,
            title: `Reconstructed Session ${sessionId}`,
            createdAt: storySteps[0]?.timestamp || Date.now(),
            lastPlayedAt: storySteps[storySteps.length - 1]?.timestamp || Date.now(),
            initialPrompt: 'Game loaded from database',
            config: await loadConfig()
        };
        
        // Import the reconstructed game state
        const { importSessionData } = await import('./game.js');
        const importData = {
            session: reconstructedSession,
            gameState: {
                sessionId: sessionId,
                currentState: 'PLAYING',
                messageHistory: messageHistory,
                storyLog: storyLog,
                actionLog: actionLog,
                memories: memories,
                isMusicPlaying: false,
                contextTokenCount: 0,
                contextLimit: null
            }
        };
        
        const result = importSessionData(JSON.stringify(importData));
        
        if (result.success) {
            // Close database overlay
            hideDatabaseOverlay();
            
            // Switch to game screen
            showGameScreen();
            
            // Update the UI to show the loaded content
            updateStoryDisplay();
            
            showMessage(`Game loaded successfully! Session: ${sessionId}`, 'success');
        } else {
            showMessage(`Failed to load game: ${result.error}`, 'error');
        }
        
    } catch (error) {
        console.error('Error loading game from database:', error);
        showMessage('Error loading game from database', 'error');
    }
}

/**
 * Load story sessions into the selector
 */
async function loadStorySessions(): Promise<void> {
    try {
        const { getAllStoryStepSessions } = await import('./database.js');
        const sessions = await getAllStoryStepSessions();
        
        const selector = document.getElementById('story-session-selector') as HTMLSelectElement;
        if (selector) {
            selector.innerHTML = '<option value="">Select a session...</option>';
            sessions.forEach(sessionId => {
                const option = document.createElement('option');
                option.value = sessionId;
                option.textContent = sessionId;
                selector.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Error loading story sessions:', error);
        showMessage('Error loading story sessions', 'error');
    }
}

/**
 * Setup story management event handlers
 */
function setupStoryManagementHandlers(): void {
    // Load story from session button
    const loadStoryButton = document.getElementById('load-story-from-session');
    if (loadStoryButton) {
        loadStoryButton.addEventListener('click', async () => {
            const selector = document.getElementById('story-session-selector') as HTMLSelectElement;
            const sessionId = selector?.value;
            
            if (sessionId) {
                (window as any).loadGameFromSummary(sessionId);
            } else {
                showMessage('Please select a session first', 'error');
            }
        });
    }
    
    // Delete session data button
    const deleteSessionButton = document.getElementById('delete-session-data');
    if (deleteSessionButton) {
        deleteSessionButton.addEventListener('click', async () => {
            const selector = document.getElementById('story-session-selector') as HTMLSelectElement;
            const sessionId = selector?.value;
            
            if (sessionId) {
                if (confirm(`Are you sure you want to delete ALL data for session ${sessionId}? This will delete both summary and steps. This action cannot be undone.`)) {
                    await deleteAllSessionData(sessionId);
                    // Clear displays
                    const summaryContainer = document.getElementById('story-summary-container');
                    const stepsContainer = document.getElementById('story-steps-container');
                    const sessionInfo = document.getElementById('session-info');
                    
                    if (summaryContainer) summaryContainer.innerHTML = '<span class="text-gray-500">Summary deleted...</span>';
                    if (stepsContainer) stepsContainer.innerHTML = '<span class="text-gray-500">Steps deleted...</span>';
                    if (sessionInfo) sessionInfo.classList.add('hidden');
                    
                    // Refresh session list
                    await loadStorySessions();
                }
            } else {
                showMessage('Please select a session first', 'error');
            }
        });
    }
    
    // Delete summary button
    const deleteSummaryButton = document.getElementById('delete-summary');
    if (deleteSummaryButton) {
        deleteSummaryButton.addEventListener('click', async () => {
            const selector = document.getElementById('story-session-selector') as HTMLSelectElement;
            const sessionId = selector?.value;
            
            if (sessionId) {
                if (confirm(`Are you sure you want to delete the summary for session ${sessionId}? This action cannot be undone.`)) {
                    await deleteStorySummary(sessionId);
                    const summaryContainer = document.getElementById('story-summary-container');
                    if (summaryContainer) {
                        summaryContainer.innerHTML = '<span class="text-gray-500">Summary deleted...</span>';
                    }
                }
            } else {
                showMessage('Please select a session first', 'error');
            }
        });
    }
    
    // Delete steps button
    const deleteStepsButton = document.getElementById('delete-steps');
    if (deleteStepsButton) {
        deleteStepsButton.addEventListener('click', async () => {
            const selector = document.getElementById('story-session-selector') as HTMLSelectElement;
            const sessionId = selector?.value;
            
            if (sessionId) {
                if (confirm(`Are you sure you want to delete all story steps for session ${sessionId}? This action cannot be undone.`)) {
                    await deleteStorySteps(sessionId);
                    const stepsContainer = document.getElementById('story-steps-container');
                    if (stepsContainer) {
                        stepsContainer.innerHTML = '<span class="text-gray-500">Steps deleted...</span>';
                    }
                }
            } else {
                showMessage('Please select a session first', 'error');
            }
        });
    }
    
    // Delete all stories button
    const deleteAllButton = document.getElementById('delete-all-stories');
    if (deleteAllButton) {
        deleteAllButton.addEventListener('click', async () => {
            if (confirm('Are you sure you want to delete ALL stories from the database? This will delete all summaries and steps. This action cannot be undone.')) {
                await deleteAllStories();
                // Clear displays
                const summaryContainer = document.getElementById('story-summary-container');
                const stepsContainer = document.getElementById('story-steps-container');
                const sessionInfo = document.getElementById('session-info');
                
                if (summaryContainer) summaryContainer.innerHTML = '<span class="text-gray-500">All stories deleted...</span>';
                if (stepsContainer) stepsContainer.innerHTML = '<span class="text-gray-500">All stories deleted...</span>';
                if (sessionInfo) sessionInfo.classList.add('hidden');
                
                // Refresh session list
                await loadStorySessions();
                showMessage('All stories deleted successfully', 'success');
            }
        });
    }
    
    // Session selector change event
    const sessionSelector = document.getElementById('story-session-selector') as HTMLSelectElement;
    if (sessionSelector) {
        sessionSelector.addEventListener('change', async () => {
            const sessionId = sessionSelector.value;
            if (sessionId) {
                await loadAndDisplaySummaryAndSteps(sessionId);
            } else {
                // Clear displays when no session selected
                const summaryContainer = document.getElementById('story-summary-container');
                const stepsContainer = document.getElementById('story-steps-container');
                const sessionInfo = document.getElementById('session-info');
                
                if (summaryContainer) summaryContainer.innerHTML = '<span class="text-gray-500">Select a session to view summary...</span>';
                if (stepsContainer) stepsContainer.innerHTML = '<span class="text-gray-500">Select a session to view steps...</span>';
                if (sessionInfo) sessionInfo.classList.add('hidden');
            }
        });
    }
}

/**
 * Load and display both summary and steps for a session
 */
async function loadAndDisplaySummaryAndSteps(sessionId: string): Promise<void> {
    try {
        // Load summary
        const { loadStorySummary } = await import('./database.js');
        const summary = await loadStorySummary(sessionId);
        const summaryContainer = document.getElementById('story-summary-container');
        
        if (summaryContainer) {
            if (summary) {
                summaryContainer.innerHTML = `
                    <div class="space-y-2">
                        <div class="text-white font-semibold">Summary:</div>
                        <div class="text-gray-300">${summary.summary}</div>
                        <div class="text-xs text-gray-500 mt-2">
                            Created: ${new Date(summary.created_at).toLocaleString()}
                        </div>
                    </div>
                `;
            } else {
                summaryContainer.innerHTML = '<span class="text-gray-500">No summary found for this session</span>';
            }
        }
        
        // Load steps
        const { loadStorySteps } = await import('./database.js');
        const steps = await loadStorySteps(sessionId);
        const stepsContainer = document.getElementById('story-steps-container');
        
        if (stepsContainer) {
            if (steps.length > 0) {
                const stepsHtml = steps.map(step => `
                    <div class="border-b border-gray-700 pb-2 mb-2">
                        <div class="text-white font-semibold">Step ${step.step_number}</div>
                        <div class="text-gray-300 text-xs">${new Date(step.timestamp).toLocaleString()}</div>
                        <div class="text-gray-300 mt-1">${step.story_text}</div>
                        ${step.choice ? `<div class="text-blue-300 text-xs mt-1">Choice: ${step.choice}</div>` : ''}
                    </div>
                `).join('');
                
                stepsContainer.innerHTML = `
                    <div class="space-y-2">
                        <div class="text-white font-semibold mb-2">Story Steps (${steps.length}):</div>
                        ${stepsHtml}
                    </div>
                `;
            } else {
                stepsContainer.innerHTML = '<span class="text-gray-500">No story steps found for this session</span>';
            }
        }
        
        // Show session info
        const sessionInfo = document.getElementById('session-info');
        const sessionDetails = document.getElementById('session-details');
        if (sessionInfo && sessionDetails) {
            sessionDetails.innerHTML = `
                <div class="grid grid-cols-2 gap-4 text-sm">
                    <div><span class="text-gray-400">Session ID:</span> ${sessionId}</div>
                    <div><span class="text-gray-400">Summary:</span> ${summary ? 'Yes' : 'No'}</div>
                    <div><span class="text-gray-400">Steps:</span> ${steps.length}</div>
                    <div><span class="text-gray-400">Last Updated:</span> ${steps.length > 0 ? new Date(steps[steps.length - 1].timestamp).toLocaleString() : 'N/A'}</div>
                </div>
            `;
            sessionInfo.classList.remove('hidden');
        }
        
    } catch (error) {
        console.error('Error loading summary and steps:', error);
        showMessage('Error loading session data', 'error');
    }
}

/**
 * Delete all data for a session (summary and steps)
 */
async function deleteAllSessionData(sessionId: string): Promise<void> {
    try {
        const { deleteStorySummary, deleteStorySteps } = await import('./database.js');
        
        // Delete summary
        await deleteStorySummary(sessionId);
        
        // Delete steps
        await deleteStorySteps(sessionId);
        
        showMessage(`All data for session ${sessionId} deleted successfully`, 'success');
        
    } catch (error) {
        console.error('Error deleting session data:', error);
        showMessage('Error deleting session data', 'error');
    }
}

/**
 * Delete all stories from the database
 */
async function deleteAllStories(): Promise<void> {
    try {
        const { getAllStoryStepSessions, getAllStorySummarySessions, deleteStorySummary, deleteStorySteps } = await import('./database.js');
        
        // Get all sessions
        const stepSessions = await getAllStoryStepSessions();
        const summarySessions = await getAllStorySummarySessions();
        
        // Delete all summaries
        for (const sessionId of summarySessions) {
            await deleteStorySummary(sessionId);
        }
        
        // Delete all steps
        for (const sessionId of stepSessions) {
            await deleteStorySteps(sessionId);
        }
        
        showMessage(`Deleted ${summarySessions.length} summaries and ${stepSessions.length} step sessions`, 'success');
        
    } catch (error) {
        console.error('Error deleting all stories:', error);
        showMessage('Error deleting all stories', 'error');
    }
}

/**
 * Toggle database configuration section visibility
 */
function toggleDatabaseConfig(): void {
    const configSection = document.getElementById('database-config-section');
    if (configSection) {
        const isVisible = configSection.style.display !== 'none';
        configSection.style.display = isVisible ? 'none' : 'block';
        
        // Update button text
        const button = document.getElementById('database-config-button');
        if (button) {
            button.textContent = isVisible ? '⚙️ Database Config' : '⚙️ Hide Database Config';
        }
    }
}

/**
 * Test database connection and functionality
 */
async function testDatabase(): Promise<void> {
    const statusIndicator = document.getElementById('database-status-indicator');
    const statusText = document.getElementById('database-status-text');
    
    if (statusIndicator && statusText) {
        statusIndicator.className = 'w-3 h-3 rounded-full bg-yellow-500';
        statusText.textContent = 'Testing...';
        
        try {
            // Test database operations
            const config = await loadConfig();
            const allData = await getAllDatabaseData();
            
            statusIndicator.className = 'w-3 h-3 rounded-full bg-green-500';
            statusText.textContent = `Connected - ${allData.configs.length} configs, ${allData.storySummaries.length} summaries`;
            
            showMessage('Database test successful!', 'success');
        } catch (error) {
            statusIndicator.className = 'w-3 h-3 rounded-full bg-red-500';
            statusText.textContent = 'Connection failed';
            
            console.error('Database test failed:', error);
            showMessage('Database test failed', 'error');
        }
    }
}

/**
 * Create a manual database backup
 */
async function backupDatabase(): Promise<void> {
    try {
        const allData = await getAllDatabaseData();
        const dataStr = JSON.stringify(allData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        link.download = `ai-adventure-backup-${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        
        showMessage('Database backup created successfully!', 'success');
    } catch (error) {
        console.error('Failed to create database backup:', error);
        showMessage('Failed to create database backup', 'error');
    }
}
