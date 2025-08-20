# Implementation Document: Local Ollama LLM Integration

## Overview

This document provides detailed implementation guidance for integrating local Ollama LLM services into the AI Adventure game, replacing the external `window.call_llm()` function with local API calls.

## API Reference

### Ollama API Endpoints

#### Base Configuration
- **Default URL**: `http://localhost:11434`
- **API Version**: v1
- **Content-Type**: `application/json`

#### Core Endpoints

##### 1. Generate Text
```
POST /api/generate
```

**Request Body:**
```json
{
  "model": "llama2",
  "messages": [
    {
      "role": "system",
      "content": "You are an expert storyteller..."
    },
    {
      "role": "user", 
      "content": "Begin a new adventure..."
    }
  ],
  "stream": false,
  "options": {
    "temperature": 0.8,
    "top_p": 0.9,
    "max_tokens": 1000,
    "num_predict": 1000
  }
}
```

**Response:**
```json
{
  "model": "llama2",
  "created_at": "2024-01-01T00:00:00.000Z",
  "response": "{\"story\": \"You find yourself...\", \"image_prompt\": \"...\", \"choices\": [...], \"ambience_prompt\": \"...\", \"new_memories\": [...]}",
  "done": true,
  "context": [...],
  "total_duration": 1234567890,
  "load_duration": 123456789,
  "prompt_eval_count": 50,
  "prompt_eval_duration": 123456789,
  "eval_count": 200,
  "eval_duration": 1234567890
}
```

##### 2. List Models
```
GET /api/tags
```

**Response:**
```json
{
  "models": [
    {
      "name": "llama2",
      "modified_at": "2024-01-01T00:00:00.000Z",
      "size": 1234567890
    },
    {
      "name": "mistral",
      "modified_at": "2024-01-01T00:00:00.000Z", 
      "size": 9876543210
    }
  ]
}
```

##### 3. Show Model Info
```
POST /api/show
```

**Request Body:**
```json
{
  "name": "llama2"
}
```

## Implementation Code

### 1. Core LLM Integration Functions

#### 1.1 Main LLM Call Function
```javascript
/**
 * Replace window.call_llm with local Ollama implementation
 * @param {string} systemPrompt - The system prompt for the LLM
 * @param {Array} messageHistory - Array of message objects with role and content
 * @param {Array} jsonFields - Expected JSON fields in response (for validation)
 * @returns {Promise<Object>} Parsed JSON response from LLM
 */
async function callLocalLLM(systemPrompt, messageHistory, jsonFields) {
    const config = loadConfig();
    const ollamaUrl = config.ollamaUrl || 'http://localhost:11434';
    const model = config.selectedOllamaModel || 'llama2';
    const options = config.llmOptions || {
        temperature: 0.8,
        top_p: 0.9,
        max_tokens: 1000
    };

    // Format messages for Ollama API
    const messages = [
        { role: 'system', content: systemPrompt },
        ...messageHistory
    ];

    try {
        const response = await fetch(`${ollamaUrl}/api/generate`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                model: model,
                messages: messages,
                stream: false,
                options: options
            })
        });

        if (!response.ok) {
            throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        
        if (!data.response) {
            throw new Error('No response received from Ollama');
        }

        // Parse JSON response from LLM
        let parsedResponse;
        try {
            parsedResponse = JSON.parse(data.response);
        } catch (parseError) {
            console.error('Failed to parse LLM response as JSON:', data.response);
            throw new Error('Invalid JSON response from LLM');
        }

        // Validate required fields
        const missingFields = jsonFields.filter(field => !parsedResponse[field.name]);
        if (missingFields.length > 0) {
            throw new Error(`Missing required fields: ${missingFields.map(f => f.name).join(', ')}`);
        }

        return parsedResponse;

    } catch (error) {
        console.error('Ollama API call failed:', error);
        throw error;
    }
}
```

#### 1.2 Model Discovery Function
```javascript
/**
 * Discover available Ollama models
 * @param {string} url - Ollama server URL (optional)
 * @returns {Promise<Array>} Array of available model names
 */
async function getAvailableOllamaModels(url = null) {
    const config = loadConfig();
    const ollamaUrl = url || config.ollamaUrl || 'http://localhost:11434';

    try {
        const response = await fetch(`${ollamaUrl}/api/tags`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch models: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        return data.models || [];

    } catch (error) {
        console.error('Failed to fetch Ollama models:', error);
        throw error;
    }
}
```

#### 1.3 Connection Test Function
```javascript
/**
 * Test Ollama connection and model availability
 * @param {string} url - Ollama server URL
 * @param {string} model - Model name to test
 * @returns {Promise<Object>} Test result with status and details
 */
async function testOllamaConnection(url, model) {
    const testResult = {
        success: false,
        message: '',
        details: {}
    };

    try {
        // Test 1: Check if server is reachable
        const modelsResponse = await fetch(`${url}/api/tags`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        });

        if (!modelsResponse.ok) {
            testResult.message = `Server unreachable: ${modelsResponse.status} ${modelsResponse.statusText}`;
            return testResult;
        }

        const modelsData = await modelsResponse.json();
        const availableModels = modelsData.models || [];
        
        // Test 2: Check if specified model exists
        const modelExists = availableModels.some(m => m.name === model);
        if (!modelExists) {
            testResult.message = `Model '${model}' not found. Available models: ${availableModels.map(m => m.name).join(', ')}`;
            testResult.details.availableModels = availableModels.map(m => m.name);
            return testResult;
        }

        // Test 3: Test actual generation with a simple prompt
        const testPrompt = "Respond with only: {\"test\": \"success\"}";
        const testResponse = await fetch(`${url}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: model,
                messages: [
                    { role: 'user', content: testPrompt }
                ],
                stream: false,
                options: {
                    temperature: 0.1,
                    max_tokens: 50
                }
            })
        });

        if (!testResponse.ok) {
            testResult.message = `Generation test failed: ${testResponse.status} ${testResponse.statusText}`;
            return testResult;
        }

        const testData = await testResponse.json();
        if (!testData.response) {
            testResult.message = 'Generation test failed: No response received';
            return testResult;
        }

        // Success
        testResult.success = true;
        testResult.message = `Connection successful! Model '${model}' is ready.`;
        testResult.details = {
            availableModels: availableModels.map(m => m.name),
            selectedModel: model,
            responseTime: testData.total_duration || 0
        };

    } catch (error) {
        testResult.message = `Connection test failed: ${error.message}`;
        console.error('Ollama connection test error:', error);
    }

    return testResult;
}
```

### 2. Configuration Integration

#### 2.1 Configuration Structure
```javascript
// Add to existing configuration structure
const defaultConfig = {
    // ... existing config ...
    ollamaUrl: 'http://localhost:11434',
    selectedOllamaModel: 'llama2',
    llmOptions: {
        temperature: 0.8,
        top_p: 0.9,
        max_tokens: 1000,
        num_predict: 1000
    }
};
```

#### 2.2 Configuration Validation
```javascript
/**
 * Validate Ollama configuration
 * @param {Object} config - Configuration object
 * @returns {Object} Validation result
 */
function validateOllamaConfig(config) {
    const result = {
        valid: true,
        errors: [],
        warnings: []
    };

    // Validate URL
    if (!config.ollamaUrl) {
        result.errors.push('Ollama URL is required');
        result.valid = false;
    } else {
        try {
            new URL(config.ollamaUrl);
        } catch (error) {
            result.errors.push('Invalid Ollama URL format');
            result.valid = false;
        }
    }

    // Validate model selection
    if (!config.selectedOllamaModel) {
        result.errors.push('Ollama model selection is required');
        result.valid = false;
    }

    // Validate LLM options
    if (config.llmOptions) {
        if (config.llmOptions.temperature < 0 || config.llmOptions.temperature > 2) {
            result.warnings.push('Temperature should be between 0 and 2');
        }
        if (config.llmOptions.max_tokens < 1 || config.llmOptions.max_tokens > 4096) {
            result.warnings.push('Max tokens should be between 1 and 4096');
        }
    }

    return result;
}
```

### 3. Error Handling and Retry Logic

#### 3.1 Enhanced Error Handling
```javascript
/**
 * Enhanced LLM call with retry logic and error handling
 * @param {string} systemPrompt - System prompt
 * @param {Array} messageHistory - Message history
 * @param {Array} jsonFields - Expected JSON fields
 * @param {number} maxRetries - Maximum retry attempts
 * @returns {Promise<Object>} LLM response
 */
async function callLocalLLMWithRetry(systemPrompt, messageHistory, jsonFields, maxRetries = 3) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await callLocalLLM(systemPrompt, messageHistory, jsonFields);
        } catch (error) {
            lastError = error;
            console.warn(`Ollama API attempt ${attempt} failed:`, error.message);
            
            if (attempt < maxRetries) {
                // Exponential backoff: wait 1s, 2s, 4s...
                const delay = Math.pow(2, attempt - 1) * 1000;
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    
    throw new Error(`Ollama API failed after ${maxRetries} attempts. Last error: ${lastError.message}`);
}
```

#### 3.2 Error Classification
```javascript
/**
 * Classify Ollama API errors for appropriate handling
 * @param {Error} error - The error object
 * @returns {Object} Error classification
 */
function classifyOllamaError(error) {
    const classification = {
        type: 'unknown',
        userMessage: 'An unexpected error occurred',
        retryable: false,
        action: 'none'
    };

    if (error.message.includes('fetch')) {
        classification.type = 'network';
        classification.userMessage = 'Cannot connect to Ollama server. Please check if Ollama is running.';
        classification.retryable = true;
        classification.action = 'check_connection';
    } else if (error.message.includes('404')) {
        classification.type = 'not_found';
        classification.userMessage = 'Ollama server not found. Please check the URL.';
        classification.retryable = false;
        classification.action = 'check_url';
    } else if (error.message.includes('500')) {
        classification.type = 'server_error';
        classification.userMessage = 'Ollama server error. Please try again.';
        classification.retryable = true;
        classification.action = 'retry';
    } else if (error.message.includes('Invalid JSON')) {
        classification.type = 'parse_error';
        classification.userMessage = 'Invalid response from LLM. Please try again.';
        classification.retryable = true;
        classification.action = 'retry';
    } else if (error.message.includes('Missing required fields')) {
        classification.type = 'validation_error';
        classification.userMessage = 'LLM response missing required information. Please try again.';
        classification.retryable = true;
        classification.action = 'retry';
    }

    return classification;
}
```

### 4. UI Integration

#### 4.1 Configuration UI Component
```javascript
/**
 * Create Ollama configuration section for settings modal
 * @returns {HTMLElement} Configuration section element
 */
function createOllamaConfigSection() {
    const section = document.createElement('div');
    section.className = 'mb-8';
    section.innerHTML = `
        <h4 class="text-lg font-semibold text-indigo-400 mb-4">Ollama LLM Settings</h4>
        <div class="space-y-4">
            <div>
                <label class="block text-sm font-medium text-gray-300 mb-2">Ollama URL</label>
                <input type="url" id="ollama-url" 
                       class="w-full bg-gray-900/50 border border-gray-600 rounded-lg px-4 py-2 text-white"
                       placeholder="http://localhost:11434">
                <p class="text-xs text-gray-500 mt-1">URL of your Ollama server</p>
            </div>
            
            <div>
                <label class="block text-sm font-medium text-gray-300 mb-2">Model</label>
                <select id="ollama-model" 
                        class="w-full bg-gray-900/50 border border-gray-600 rounded-lg px-4 py-2 text-white">
                    <option value="">Loading models...</option>
                </select>
                <button id="refresh-models" 
                        class="text-xs text-indigo-400 hover:text-indigo-300 mt-1">
                    <i class="fas fa-sync-alt mr-1"></i>Refresh Models
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
                           class="w-full bg-gray-900/50 border border-gray-600 rounded-lg px-2 py-1 text-white">
                </div>
            </div>
            
            <div class="flex items-center gap-4">
                <button id="test-ollama" 
                        class="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg">
                    <i class="fas fa-plug mr-2"></i>Test Connection
                </button>
                <div id="ollama-status" class="flex items-center gap-2">
                    <div id="ollama-status-indicator" class="w-3 h-3 rounded-full bg-gray-500"></div>
                    <span id="ollama-status-text" class="text-sm text-gray-400">Not tested</span>
                </div>
            </div>
        </div>
    `;

    // Add event listeners
    setupOllamaConfigEvents(section);
    
    return section;
}
```

#### 4.2 Event Handlers
```javascript
/**
 * Setup event handlers for Ollama configuration
 * @param {HTMLElement} section - Configuration section element
 */
function setupOllamaConfigEvents(section) {
    const urlInput = section.querySelector('#ollama-url');
    const modelSelect = section.querySelector('#ollama-model');
    const refreshBtn = section.querySelector('#refresh-models');
    const testBtn = section.querySelector('#test-ollama');
    const statusIndicator = section.querySelector('#ollama-status-indicator');
    const statusText = section.querySelector('#ollama-status-text');
    
    // Load current configuration
    const config = loadConfig();
    urlInput.value = config.ollamaUrl || 'http://localhost:11434';
    
    // Load models on initialization
    loadOllamaModels(urlInput.value, modelSelect, config.selectedOllamaModel);
    
    // URL change handler
    urlInput.addEventListener('change', async () => {
        const url = urlInput.value.trim();
        if (url) {
            await loadOllamaModels(url, modelSelect);
            updateOllamaStatus('unknown', 'URL changed');
        }
    });
    
    // Refresh models button
    refreshBtn.addEventListener('click', async () => {
        const url = urlInput.value.trim();
        if (url) {
            await loadOllamaModels(url, modelSelect);
        }
    });
    
    // Test connection button
    testBtn.addEventListener('click', async () => {
        const url = urlInput.value.trim();
        const model = modelSelect.value;
        
        if (!url || !model) {
            updateOllamaStatus('error', 'Please enter URL and select model');
            return;
        }
        
        updateOllamaStatus('loading', 'Testing connection...');
        
        try {
            const result = await testOllamaConnection(url, model);
            if (result.success) {
                updateOllamaStatus('success', result.message);
            } else {
                updateOllamaStatus('error', result.message);
            }
        } catch (error) {
            updateOllamaStatus('error', `Test failed: ${error.message}`);
        }
    });
    
    // Parameter change handlers
    const tempSlider = section.querySelector('#llm-temperature');
    const tempValue = section.querySelector('#temp-value');
    const topPSlider = section.querySelector('#llm-top-p');
    const topPValue = section.querySelector('#top-p-value');
    
    tempSlider.addEventListener('input', () => {
        tempValue.textContent = tempSlider.value;
    });
    
    topPSlider.addEventListener('input', () => {
        topPValue.textContent = topPSlider.value;
    });
}

/**
 * Update Ollama connection status display
 * @param {string} status - Status type (success, error, loading, unknown)
 * @param {string} message - Status message
 */
function updateOllamaStatus(status, message) {
    const indicator = document.getElementById('ollama-status-indicator');
    const text = document.getElementById('ollama-status-text');
    
    if (!indicator || !text) return;
    
    // Update indicator color
    indicator.className = 'w-3 h-3 rounded-full';
    switch (status) {
        case 'success':
            indicator.classList.add('bg-green-500');
            break;
        case 'error':
            indicator.classList.add('bg-red-500');
            break;
        case 'loading':
            indicator.classList.add('bg-yellow-500');
            break;
        default:
            indicator.classList.add('bg-gray-500');
    }
    
    text.textContent = message;
}
```

### 5. Integration with Existing Game Logic

#### 5.1 Replace Existing LLM Call
```javascript
// In the existing executeLLMCall function, replace:
// const response = await window.call_llm(systemPrompt, messageHistory, json_fields);

// With:
const response = await callLocalLLMWithRetry(systemPrompt, messageHistory, json_fields);
```

#### 5.2 Enhanced Error Handling in Game
```javascript
/**
 * Enhanced executeLLMCall with local Ollama integration
 */
async function executeLLMCall(retries = 3) {
    gameState = 'LOADING';
    
    // Disable UI elements during loading
    disableGameControls();
    updateUI();

    try {
        const response = await callLocalLLMWithRetry(systemPrompt, messageHistory, json_fields, retries);
        
        if (response && response.story) {
            const errorContainer = document.getElementById('error-container');
            if (errorContainer) errorContainer.remove();

            messageHistory.push({ role: 'assistant', content: JSON.stringify(response) });
            renderScene(response);
        } else {
            throw new Error("Invalid response from Ollama LLM.");
        }
        
    } catch (error) {
        console.error(`Ollama LLM call failed after ${retries} retries:`, error);
        
        const errorClassification = classifyOllamaError(error);
        handleOllamaError(errorClassification, retries);
        
    } finally {
        // Re-enable UI elements
        enableGameControls();
    }
}

/**
 * Handle Ollama-specific errors
 * @param {Object} errorClassification - Classified error information
 * @param {number} retriesLeft - Number of retries remaining
 */
function handleOllamaError(errorClassification, retriesLeft) {
    const lastUserMessage = messageHistory.pop();
    const lastActionLog = actionLog.pop();
    renderHistoryLog();

    if (lastUserMessage && lastUserMessage.role === 'user' && lastActionLog && storyContent.lastElementChild) {
        const lastAction = lastActionLog.choice;

        const existingError = document.getElementById('error-container');
        if (existingError) existingError.remove();

        const errorContainer = document.createElement('div');
        errorContainer.id = 'error-container';
        errorContainer.className = 'mt-4 p-4 bg-red-900/50 border border-red-700 rounded-lg text-center animate__animated animate__fadeIn';

        const errorMessage = document.createElement('p');
        errorMessage.className = 'text-yellow-300 mb-4';
        errorMessage.textContent = errorClassification.userMessage;

        const retryButton = document.createElement('button');
        retryButton.id = 'retry-action-button';
        retryButton.className = 'bg-yellow-600 hover:bg-yellow-500 text-white font-bold py-2 px-6 rounded-lg transition-colors duration-300';
        retryButton.textContent = 'Try Last Action Again';

        retryButton.onclick = () => {
            clickSound.play();
            errorContainer.remove();
            updateGame(lastAction);
        };

        errorContainer.appendChild(errorMessage);
        errorContainer.appendChild(retryButton);

        storyContent.lastElementChild.appendChild(errorContainer);
        storyContent.scrollTop = storyContent.scrollHeight;
    }

    gameState = 'PLAYING';
    updateUI();
}
```

## Testing and Validation

### 1. Unit Tests
```javascript
// Example test cases for Ollama integration
describe('Ollama LLM Integration', () => {
    test('should connect to Ollama server', async () => {
        const result = await testOllamaConnection('http://localhost:11434', 'llama2');
        expect(result.success).toBe(true);
    });
    
    test('should generate valid JSON response', async () => {
        const response = await callLocalLLM(
            'You are a test assistant. Respond with: {"test": "success"}',
            [{ role: 'user', content: 'Test message' }],
            [{ name: 'test', type: 'string' }]
        );
        expect(response.test).toBe('success');
    });
    
    test('should handle connection errors gracefully', async () => {
        await expect(
            callLocalLLM('test', [], [], 'http://invalid-url:9999')
        ).rejects.toThrow();
    });
});
```

### 2. Integration Tests
```javascript
// Test complete game flow with Ollama
describe('Game Integration with Ollama', () => {
    test('should start new game with Ollama', async () => {
        const initialPrompt = "Begin a new adventure in a forest";
        startGame(initialPrompt);
        
        // Wait for LLM response
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        expect(storyLog.length).toBeGreaterThan(0);
        expect(choicesContainer.children.length).toBeGreaterThan(0);
    });
});
```

## Performance Considerations

### 1. Response Time Optimization
- Use appropriate `max_tokens` settings
- Implement request caching for repeated prompts
- Consider streaming responses for long generations

### 2. Memory Management
- Clear old message history periodically
- Implement response size limits
- Monitor memory usage during long sessions

### 3. Connection Pooling
- Reuse HTTP connections where possible
- Implement connection timeouts
- Handle connection failures gracefully

## Security Considerations

### 1. Input Validation
- Sanitize all user inputs before sending to Ollama
- Validate JSON responses from LLM
- Implement rate limiting for API calls

### 2. Local Security
- Ensure Ollama server is properly secured
- Validate local URLs to prevent external calls
- Implement proper error handling to avoid information leakage

## Troubleshooting Guide

### Common Issues

1. **Connection Refused**
   - Check if Ollama is running: `ollama serve`
   - Verify port 11434 is not blocked
   - Check firewall settings

2. **Model Not Found**
   - Pull the model: `ollama pull llama2`
   - Check available models: `ollama list`
   - Verify model name spelling

3. **Slow Response Times**
   - Reduce `max_tokens` setting
   - Use smaller models for faster inference
   - Check system resources (CPU, RAM)

4. **Invalid JSON Response**
   - Adjust system prompt to request proper JSON format
   - Increase `temperature` for more creative responses
   - Implement response validation and retry logic

### Debug Mode
```javascript
// Enable debug logging
const DEBUG_MODE = true;

function debugLog(message, data = null) {
    if (DEBUG_MODE) {
        console.log(`[Ollama Debug] ${message}`, data);
    }
}
```

## Migration Checklist

- [ ] Install and configure Ollama server
- [ ] Pull required models (`ollama pull llama2`)
- [ ] Test Ollama API connectivity
- [ ] Replace `window.call_llm` calls with `callLocalLLM`
- [ ] Implement error handling and retry logic
- [ ] Add configuration UI for Ollama settings
- [ ] Test with various Ollama models
- [ ] Validate JSON response parsing
- [ ] Implement connection status monitoring
- [ ] Add comprehensive error messages
- [ ] Test performance and optimize settings
- [ ] Document setup and troubleshooting procedures
