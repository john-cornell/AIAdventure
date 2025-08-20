import { GameState, GameConfig, UIState, ErrorClassification } from './types.js';
import { loadConfig, saveConfig, updateConfig } from './config.js';
import { callLocalLLMWithRetry, getAvailableOllamaModels, testOllamaConnection as testOllama } from './ollama.js';
import { generateLocalImageWithRetry, getAvailableSDModels, testSDConnection as testSD } from './stable-diffusion.js';
import { startGame, updateGame, getGameState, resetGame } from './game.js';

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
export function initializeUI(): void {
    console.log('Initializing game UI...');
    
    // Get DOM references
    storyContent = document.getElementById('story-content') as HTMLElement;
    choicesContainer = document.getElementById('choices-container') as HTMLElement;
    historyContent = document.getElementById('history-content') as HTMLElement;
    
    // Create UI elements if they don't exist
    createUIElements();
    
    // Setup event listeners
    setupEventListeners();
    
    // Load configuration and test connections
    initializeConnections();
    
    // Show menu screen
    showMenuScreen();
    
    console.log('Game UI initialized');
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
        document.body.appendChild(loading);
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
}

/**
 * Create settings modal HTML
 */
function createSettingsModalHTML(): string {
    return `
        <div class="flex items-center justify-center min-h-screen p-4">
            <div class="bg-gray-900 border border-gray-700 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
                <div class="p-6 border-b border-gray-700">
                    <div class="flex justify-between items-center">
                        <h2 class="text-2xl font-bold text-white">Game Settings</h2>
                        <button id="close-settings" class="text-gray-400 hover:text-white text-2xl">&times;</button>
                    </div>
                </div>
                
                <div class="p-6 space-y-8">
                    <!-- Ollama Settings -->
                    <div id="ollama-settings">
                        <h3 class="text-lg font-semibold text-indigo-400 mb-4">Ollama LLM Settings</h3>
                        <div class="space-y-4">
                            <div>
                                <label class="block text-sm font-medium text-gray-300 mb-2">Ollama URL</label>
                                <input type="url" id="ollama-url" 
                                       class="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-2 text-white"
                                       placeholder="http://localhost:11434">
                            </div>
                            
                            <div>
                                <label class="block text-sm font-medium text-gray-300 mb-2">Model</label>
                                <select id="ollama-model" 
                                        class="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-2 text-white">
                                    <option value="">Loading models...</option>
                                </select>
                                <button id="refresh-ollama-models" 
                                        class="text-xs text-indigo-400 hover:text-indigo-300 mt-1">
                                    🔄 Refresh Models
                                </button>
                            </div>
                            
                            <div class="grid grid-cols-3 gap-4">
                                <div>
                                    <label class="block text-sm font-medium text-gray-300 mb-2">Temperature</label>
                                    <input type="range" id="llm-temperature" min="0" max="2" step="0.1" value="0.8"
                                           class="w-full">
                                    <span id="temp-value" class="text-xs text-gray-400">0.8</span>
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-300 mb-2">Top P</label>
                                    <input type="range" id="llm-top-p" min="0" max="1" step="0.1" value="0.9"
                                           class="w-full">
                                    <span id="top-p-value" class="text-xs text-gray-400">0.9</span>
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-300 mb-2">Max Tokens</label>
                                    <input type="number" id="llm-max-tokens" min="1" max="4096" value="1000"
                                           class="w-full bg-gray-800 border border-gray-600 rounded-lg px-2 py-1 text-white">
                                </div>
                            </div>
                            
                            <div class="flex items-center gap-4">
                                <button id="test-ollama" 
                                        class="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg">
                                    🔌 Test Connection
                                </button>
                                <div id="ollama-status" class="flex items-center gap-2">
                                    <div id="ollama-status-indicator" class="w-3 h-3 rounded-full bg-gray-500"></div>
                                    <span id="ollama-status-text" class="text-sm text-gray-400">Not tested</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Stable Diffusion Settings -->
                    <div id="sd-settings">
                        <h3 class="text-lg font-semibold text-green-400 mb-4">Stable Diffusion Settings</h3>
                        <div class="space-y-4">
                            <div>
                                <label class="block text-sm font-medium text-gray-300 mb-2">SD URL</label>
                                <input type="url" id="sd-url" 
                                       class="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-2 text-white"
                                       placeholder="http://127.0.0.1:7860">
                            </div>
                            
                            <div>
                                <label class="block text-sm font-medium text-gray-300 mb-2">Model</label>
                                <select id="sd-model" 
                                        class="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-2 text-white">
                                    <option value="">Loading models...</option>
                                </select>
                                <button id="refresh-sd-models" 
                                        class="text-xs text-green-400 hover:text-green-300 mt-1">
                                    🔄 Refresh Models
                                </button>
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
                            
                            <div class="flex items-center gap-4">
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
                    
                    <!-- Action Buttons -->
                    <div class="flex justify-end gap-4 pt-4 border-t border-gray-700">
                        <button id="reset-config" 
                                class="bg-gray-600 hover:bg-gray-500 text-white px-4 py-2 rounded-lg">
                            🔄 Reset to Defaults
                        </button>
                        <button id="save-config" 
                                class="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg">
                            💾 Save Settings
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
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
        
        if (target.id === 'save-config') {
            saveSettings();
        }
        
        if (target.id === 'reset-config') {
            resetSettings();
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
    
    // Settings form events
    setupSettingsEvents();
}

/**
 * Setup settings form event handlers
 */
function setupSettingsEvents(): void {
    // Ollama settings
    const ollamaUrl = document.getElementById('ollama-url') as HTMLInputElement;
    const ollamaModel = document.getElementById('ollama-model') as HTMLSelectElement;
    const refreshOllamaBtn = document.getElementById('refresh-ollama-models');
    const testOllamaBtn = document.getElementById('test-ollama');
    
    if (ollamaUrl) {
        ollamaUrl.addEventListener('change', () => {
            loadOllamaModels(ollamaUrl.value, ollamaModel);
            updateConnectionStatus('ollama', 'unknown');
        });
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
    const sdModel = document.getElementById('sd-model') as HTMLSelectElement;
    const refreshSDBtn = document.getElementById('refresh-sd-models');
    const testSDBtn = document.getElementById('test-sd');
    
    if (sdUrl) {
        sdUrl.addEventListener('change', () => {
            loadSDModels(sdUrl.value, sdModel);
            updateConnectionStatus('stableDiffusion', 'unknown');
        });
    }
    
    if (refreshSDBtn) {
        refreshSDBtn.addEventListener('click', () => {
            loadSDModels(sdUrl?.value || '', sdModel);
        });
    }
    
    if (testSDBtn) {
        testSDBtn.addEventListener('click', () => testSDConnection());
    }
    
    // Parameter sliders
    const tempSlider = document.getElementById('llm-temperature') as HTMLInputElement;
    const tempValue = document.getElementById('temp-value');
    if (tempSlider && tempValue) {
        tempSlider.addEventListener('input', () => {
            tempValue.textContent = tempSlider.value;
        });
    }
    
    const topPSlider = document.getElementById('llm-top-p') as HTMLInputElement;
    const topPValue = document.getElementById('top-p-value');
    if (topPSlider && topPValue) {
        topPSlider.addEventListener('input', () => {
            topPValue.textContent = topPSlider.value;
        });
    }
}

/**
 * Initialize connections and load settings
 */
async function initializeConnections(): Promise<void> {
    const config = loadConfig();
    
    // Load settings into UI
    loadSettingsIntoUI(config);
    
    // Test connections
    await testConnections();
}

/**
 * Load settings into UI elements
 */
function loadSettingsIntoUI(config: GameConfig): void {
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
    const sdModel = document.getElementById('sd-model') as HTMLSelectElement;
    const sdWidth = document.getElementById('sd-width') as HTMLInputElement;
    const sdHeight = document.getElementById('sd-height') as HTMLInputElement;
    const sdSteps = document.getElementById('sd-steps') as HTMLInputElement;
    const sdCfgScale = document.getElementById('sd-cfg-scale') as HTMLInputElement;
    const sdSampler = document.getElementById('sd-sampler') as HTMLSelectElement;
    
    if (sdUrl) sdUrl.value = config.stableDiffusion.url;
    if (sdWidth) sdWidth.value = config.stableDiffusion.options.width.toString();
    if (sdHeight) sdHeight.value = config.stableDiffusion.options.height.toString();
    if (sdSteps) sdSteps.value = config.stableDiffusion.options.steps.toString();
    if (sdCfgScale) sdCfgScale.value = config.stableDiffusion.options.cfg_scale.toString();
    if (sdSampler) sdSampler.value = config.stableDiffusion.options.sampler_name;
    
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
 * Test connections
 */
async function testConnections(): Promise<void> {
    const config = loadConfig();
    
    // Test Ollama
    try {
        const ollamaResult = await testOllama(config.ollama.url, config.ollama.model);
        updateConnectionStatus('ollama', ollamaResult.success ? 'connected' : 'error');
    } catch (error) {
        updateConnectionStatus('ollama', 'error');
    }
    
    // Test SD
    try {
        const sdResult = await testSD(config.stableDiffusion.url, config.stableDiffusion.model);
        updateConnectionStatus('stableDiffusion', sdResult.success ? 'connected' : 'error');
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
}

/**
 * Show settings modal
 */
function showSettingsModal(): void {
    if (settingsModal) {
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
    }
}

/**
 * Save settings from UI
 */
function saveSettings(): void {
    const config = loadConfig();
    
    // Get Ollama settings
    const ollamaUrl = (document.getElementById('ollama-url') as HTMLInputElement)?.value;
    const ollamaModel = (document.getElementById('ollama-model') as HTMLSelectElement)?.value;
    const tempSlider = (document.getElementById('llm-temperature') as HTMLInputElement)?.value;
    const topPSlider = (document.getElementById('llm-top-p') as HTMLInputElement)?.value;
    const maxTokens = (document.getElementById('llm-max-tokens') as HTMLInputElement)?.value;
    
    // Get SD settings
    const sdUrl = (document.getElementById('sd-url') as HTMLInputElement)?.value;
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
    if (sdModel) config.stableDiffusion.model = sdModel;
    if (sdWidth) config.stableDiffusion.options.width = parseInt(sdWidth);
    if (sdHeight) config.stableDiffusion.options.height = parseInt(sdHeight);
    if (sdSteps) config.stableDiffusion.options.steps = parseInt(sdSteps);
    if (sdCfgScale) config.stableDiffusion.options.cfg_scale = parseFloat(sdCfgScale);
    if (sdSampler) config.stableDiffusion.options.sampler_name = sdSampler;
    
    // Save config
    saveConfig(config);
    
    // Test connections
    testConnections();
    
    // Show success message
    showMessage('Settings saved successfully!', 'success');
}

/**
 * Reset settings to defaults
 */
function resetSettings(): void {
    if (confirm('Are you sure you want to reset all settings to defaults?')) {
        const config = loadConfig();
        // Reset to defaults (config.ts handles this)
        saveConfig(config);
        loadSettingsIntoUI(config);
        testConnections();
        showMessage('Settings reset to defaults!', 'success');
    }
}

/**
 * Test Ollama connection from settings
 */
async function testOllamaConnection(): Promise<void> {
    const url = (document.getElementById('ollama-url') as HTMLInputElement)?.value;
    const model = (document.getElementById('ollama-model') as HTMLSelectElement)?.value;
    
    if (!url || !model) {
        showMessage('Please enter URL and select model', 'error');
        return;
    }
    
    updateConnectionStatus('ollama', 'unknown');
    
    try {
        const result = await testOllama(url, model);
        if (result.success) {
            updateConnectionStatus('ollama', 'connected');
            showMessage('Ollama connection successful!', 'success');
        } else {
            updateConnectionStatus('ollama', 'error');
            showMessage(`Ollama connection failed: ${result.message}`, 'error');
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
    const model = (document.getElementById('sd-model') as HTMLSelectElement)?.value;
    
    if (!url) {
        showMessage('Please enter SD URL', 'error');
        return;
    }
    
    updateConnectionStatus('stableDiffusion', 'unknown');
    
    try {
        const result = await testSD(url, model || '');
        if (result.success) {
            updateConnectionStatus('stableDiffusion', 'connected');
            showMessage('Stable Diffusion connection successful!', 'success');
        } else {
            updateConnectionStatus('stableDiffusion', 'error');
            showMessage(`SD connection failed: ${result.message}`, 'error');
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
                
                <button id="import-button" 
                        class="bg-green-600 hover:bg-green-500 text-white font-bold py-3 px-8 rounded-lg text-lg transition-colors duration-300">
                    📁 Import Adventure
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
}

/**
 * Start new game
 */
async function startNewGame(prompt: string): Promise<void> {
    try {
        showLoadingState(true);
        await startGame(prompt);
        showGameScreen();
    } catch (error) {
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
            <div id="image-container" class="relative w-full h-72 sm:h-96 bg-gray-900">
                <img id="scene-image" src="" class="w-full h-full object-cover transition-opacity duration-1000 opacity-0" alt="Current game scene">
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
                               placeholder="Or, type your own action...">
                        <button type="submit" id="custom-action-button" 
                                class="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 px-6 rounded-lg transition-colors duration-300 flex items-center gap-2">
                            <span>📤</span> Send
                        </button>
                    </form>
                </div>
            </div>
        </div>
    `;
    
    // Update status indicators
    updateMenuStatusIndicators();
    
    // Add event listeners
    const exportBtn = document.getElementById('export-button');
    const resetBtn = document.getElementById('reset-button');
    const customActionForm = document.getElementById('custom-action-form') as HTMLFormElement;
    const customActionInput = document.getElementById('custom-action-input') as HTMLInputElement;
    
    if (exportBtn) {
        exportBtn.addEventListener('click', exportGame);
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
 * Update story display
 */
function updateStoryDisplay(): void {
    const gameState = getGameState();
    const storyContent = document.getElementById('story-content');
    const choicesContainer = document.getElementById('choices-container');
    const sceneImage = document.getElementById('scene-image') as HTMLImageElement;
    const loadingOverlay = document.getElementById('loading-overlay');
    
    if (!storyContent || !choicesContainer) return;
    
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
                sceneImage.src = entry.imageData;
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
        
        historyEntry.innerHTML = `
            <div class="flex justify-between items-start">
                <div>
                    <p class="text-gray-400 text-sm">${timestamp}</p>
                    <p class="text-white font-medium">${choice}</p>
                </div>
                <span class="text-gray-500 text-sm">#${index + 1}</span>
            </div>
        `;
        
        historyContent.appendChild(historyEntry);
    });
}

/**
 * Handle player choice
 */
async function handleChoice(choice: string): Promise<void> {
    try {
        showLoadingState(true);
        await updateGame(choice);
        updateStoryDisplay();
    } catch (error) {
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
 * Export game state
 */
function exportGame(): void {
    const gameState = getGameState();
    const dataStr = JSON.stringify(gameState, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    
    const link = document.createElement('a');
    link.href = URL.createObjectURL(dataBlob);
    link.download = `ai-adventure-${new Date().toISOString().split('T')[0]}.json`;
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
