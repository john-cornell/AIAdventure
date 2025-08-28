import { 
    LLMResponse, 
    OllamaConfig, 
    OllamaGenerateResponse, 
    OllamaModelsResponse, 
    ErrorClassification,
    Message 
} from './types.js';
import { loadConfig } from './config.js';
import { logInfo, logDebug, logWarn, logError } from './logger.js';
import { cleanAndParseJson, validateLLMResponse, reconstructMissingFields } from './json-cleaner.js';

/**
 * Sanitize image data from content by replacing base64 data with placeholder
 */
function sanitizeImageData(content: string): string {
    // Replace base64 image data with placeholder
    return content.replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g, '[Image Data]');
}

/**
 * Replace window.call_llm with local Ollama implementation
 * @param systemPrompt - The system prompt for the LLM
 * @param messageHistory - Array of message objects with role and content
 * @param jsonFields - Expected JSON fields in response (for validation)
 * @returns Parsed JSON response from LLM
 */
export async function callLocalLLM(
    systemPrompt: string, 
    messageHistory: Message[], 
    jsonFields: Array<{ name: string; type: string }>
): Promise<LLMResponse> {
    const config = await loadConfig();
    const ollamaUrl = config.ollama.url;
    const model = config.ollama.model;
    const options = config.ollama.options;

    // Format messages for Ollama API - use prompt format for better compatibility
    const messages = [
        { role: 'system', content: systemPrompt },
        ...messageHistory
    ];
    
    // Convert messages to a single prompt string with stronger formatting instructions
    const prompt = messages.map(msg => `${msg.role === 'system' ? 'System: ' : 'User: '}${msg.content}`).join('\n\n') + '\n\nAssistant: RESPOND WITH ONLY A COMPLETE JSON OBJECT. NO OTHER TEXT. NO EXPLANATIONS. NO MARKDOWN. JUST THE JSON.';
    
    // Log the full prompt for debugging (verbose logging) - DEBUG level only
    logDebug('Ollama', 'Full prompt being sent to LLM:');
    logDebug('Ollama', '='.repeat(80));
    logDebug('Ollama', prompt);
    logDebug('Ollama', '='.repeat(80));

    // Enhanced logging for text export - log everything sent to LLM
    logInfo('LLM-Request', '=== LLM REQUEST START ===');
    logInfo('LLM-Request', `System Prompt: ${systemPrompt}`);
    logInfo('LLM-Request', `Message History: ${JSON.stringify(messageHistory, null, 2)}`);
    logInfo('LLM-Request', `Expected JSON Fields: ${JSON.stringify(jsonFields, null, 2)}`);
    logInfo('LLM-Request', `Full Prompt Sent: ${prompt}`);
    logInfo('LLM-Request', '=== LLM REQUEST END ===');

    try {
        logInfo('Ollama', `Making fetch request to: ${ollamaUrl}/api/generate`);
        
        // Create abort controller for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
            logWarn('Ollama', 'Request timeout after 60 seconds');
            controller.abort();
        }, 60000); // 60 second timeout
        
        const response = await fetch(`${ollamaUrl}/api/generate`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                model: model,
                prompt: prompt, // Use prompt instead of messages
                stream: false,
                options: options
            }),
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);

        console.log('📡 callLocalLLM: Response status:', response.status, response.statusText);
        if (!response.ok) {
            throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
        }

        const data: OllamaGenerateResponse = await response.json();
        console.log('📡 callLocalLLM: Raw response data:', data);
        
        // Enhanced logging for text export - log full response (sanitized)
        logInfo('LLM-Response', '=== LLM RESPONSE START ===');
        logInfo('LLM-Response', `Raw Response Data: ${sanitizeImageData(JSON.stringify(data, null, 2))}`);
        logInfo('LLM-Response', `Response Text: ${sanitizeImageData(data.response)}`);
        logInfo('LLM-Response', '=== LLM RESPONSE END ===');
        
        if (!data.response) {
            console.error('❌ callLocalLLM: No response field in data:', data);
            throw new Error('No response received from Ollama');
        }

        // Parse JSON response from LLM using robust cleaning
        logDebug('Ollama', 'Parsing JSON response...');
        let parsedResponse: LLMResponse;
        
        // Enhanced logging for text export - log processing steps
        logInfo('LLM-Processing', '=== LLM PROCESSING START ===');
        logInfo('LLM-Processing', `Starting JSON parsing and cleaning...`);
        
        const cleanResult = cleanAndParseJson(data.response);
        
        logInfo('LLM-Processing', `JSON Cleaning Result: ${sanitizeImageData(JSON.stringify(cleanResult, null, 2))}`);
        
        if (!cleanResult.success) {
            logError('LLM-Processing', `Failed to parse JSON response: ${cleanResult.error}`);
            logError('LLM-Processing', `Raw response: ${data.response}`);
            logError('LLM-Processing', `Cleaned attempt: ${cleanResult.cleaned}`);
            console.error('❌ callLocalLLM: Failed to parse JSON response:', cleanResult.error);
            console.error('❌ callLocalLLM: Raw response:', data.response);
            console.error('❌ callLocalLLM: Cleaned attempt:', cleanResult.cleaned);
            
            // Try to fix single quote issues by replacing with backticks
            try {
                const fixedResponse = data.response.replace(/'/g, '`');
                logInfo('LLM-Processing', `Attempting to fix single quotes by replacing with backticks...`);
                const fixedCleanResult = cleanAndParseJson(fixedResponse);
                
                if (fixedCleanResult.success) {
                    logInfo('LLM-Processing', `Successfully parsed JSON after fixing single quotes`);
                    parsedResponse = fixedCleanResult.json;
                } else {
                    throw new Error(`Invalid JSON response from LLM: ${cleanResult.error}`);
                }
            } catch (fixError) {
                throw new Error(`Invalid JSON response from LLM: ${cleanResult.error}`);
            }
        } else {
            parsedResponse = cleanResult.json;
        }
        
        parsedResponse = cleanResult.json;
        
        logInfo('LLM-Processing', `Successfully parsed JSON: ${sanitizeImageData(JSON.stringify(parsedResponse, null, 2))}`);
        
        // Log cleaning issues if any
        if (cleanResult.originalIssues && cleanResult.originalIssues.length > 0) {
            logWarn('Ollama', `JSON required cleaning: ${cleanResult.originalIssues.join(', ')}`);
            logInfo('LLM-Processing', `JSON Cleaning Issues: ${cleanResult.originalIssues.join(', ')}`);
        }
        
        logDebug('Ollama', 'Successfully parsed JSON:', parsedResponse);

        // Validate required fields using the utility function
        logDebug('Ollama', `Validating required fields: ${jsonFields.map(f => f.name)}`);
        logDebug('Ollama', `Parsed response keys: ${Object.keys(parsedResponse)}`);
        
        logInfo('LLM-Processing', `Validating required fields: ${jsonFields.map(f => f.name)}`);
        logInfo('LLM-Processing', `Parsed response keys: ${Object.keys(parsedResponse)}`);
        
        const requiredFieldNames = jsonFields.map(f => f.name);
        const validation = validateLLMResponse(parsedResponse, requiredFieldNames);
        
        logInfo('LLM-Processing', `Validation result: ${JSON.stringify(validation, null, 2)}`);
        
        if (!validation.valid) {
            logError('LLM-Processing', `Missing required fields: ${validation.missing}`);
            logError('LLM-Processing', `Full parsed response: ${JSON.stringify(parsedResponse, null, 2)}`);
            logError('LLM-Processing', `Raw LLM response: ${data.response}`);
            console.error('❌ callLocalLLM: Missing required fields:', validation.missing);
            console.error('❌ callLocalLLM: Full parsed response:', parsedResponse);
            console.error('❌ callLocalLLM: Raw LLM response:', data.response);
            
            // Attempt to reconstruct missing fields
            logWarn('Ollama', 'Attempting to reconstruct missing fields with fallbacks');
            logInfo('LLM-Processing', 'Attempting to reconstruct missing fields with fallbacks');
            parsedResponse = reconstructMissingFields(parsedResponse, requiredFieldNames);
            
            logInfo('Ollama', 'Reconstructed response with fallback values');
            logInfo('LLM-Processing', `Reconstructed response: ${JSON.stringify(parsedResponse, null, 2)}`);
        }

        // Validate choices array only if it's expected in the response
        const expectsChoices = jsonFields.some(field => field.name === 'choices');
        if (expectsChoices) {
            if (parsedResponse.choices && Array.isArray(parsedResponse.choices)) {
                if (parsedResponse.choices.length < 2) {
                    console.error('❌ callLocalLLM: Choices array has fewer than 2 elements (minimum required)');
                    console.error('❌ callLocalLLM: Choices received:', parsedResponse.choices);
                    throw new Error(`Invalid choices array. Expected at least 2 choices, got: ${parsedResponse.choices.length}`);
                } else if (parsedResponse.choices.length < 4) {
                    logWarn('Ollama', `Choices array has ${parsedResponse.choices.length} elements (fewer than preferred 4)`);
                    logDebug('Ollama', `Choices received: ${JSON.stringify(parsedResponse.choices)}`);
                    // Accept as is - don't automatically add choices, let LLM decide
                } else if (parsedResponse.choices.length > 6) {
                    console.warn('⚠️ callLocalLLM: Choices array has more than 6 elements, truncating to first 6');
                    parsedResponse.choices = parsedResponse.choices.slice(0, 6);
                } else {
                    console.log(`✅ callLocalLLM: Choices array has ${parsedResponse.choices.length} elements (acceptable)`);
                }
            } else {
                console.error('❌ callLocalLLM: Invalid choices array. Expected array with at least 2 elements.');
                console.error('❌ callLocalLLM: Choices received:', parsedResponse.choices);
                throw new Error(`Invalid choices array. Expected array with at least 2 elements, got: ${JSON.stringify(parsedResponse.choices)}`);
            }
        } else {
            // If choices is not expected, don't validate it
            console.log('📝 callLocalLLM: Choices validation skipped (not expected in this response)');
        }

        logInfo('LLM-Processing', '=== LLM PROCESSING END ===');
        console.log('✅ callLocalLLM: All validation passed, returning response');
        return parsedResponse;

    } catch (error) {
        console.error('Ollama API call failed:', error);
        throw error;
    }
}

/**
 * Discover available Ollama models
 * @param url - Ollama server URL (optional)
 * @returns Array of available model names
 */
export async function getAvailableOllamaModels(url?: string): Promise<string[]> {
    const config = await loadConfig();
    const ollamaUrl = url || config.ollama.url;

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

        const data: OllamaModelsResponse = await response.json();
        return data.models?.map(model => model.name) || [];

    } catch (error) {
        console.error('Failed to fetch Ollama models:', error);
        throw error;
    }
}

/**
 * Load and warm up a model for API use
 * @param url - Ollama server URL
 * @param model - Model name to load
 * @returns Success status
 */
async function loadModel(url: string, model: string): Promise<boolean> {
    try {
        // Send a simple request to load the model into memory
        const response = await fetch(`${url}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: model,
                prompt: "Hi",
                stream: false,
                options: {
                    temperature: 0.1,
                    num_predict: 10
                }
            })
        });

        if (!response.ok) {
            return false;
        }

        const data = await response.json();
        // Even if response is empty, the model is now loaded
        return data.done === true;
    } catch (error) {
        console.error('Model loading failed:', error);
        return false;
    }
}

/**
 * Test Ollama connection and model availability
 * @param url - Ollama server URL
 * @param model - Model name to test
 * @returns Test result with status and details
 */
export async function testOllamaConnection(url: string, model: string): Promise<{
    success: boolean;
    message: string;
    details: any;
}> {
    // Add timeout to prevent hanging
    const timeoutMs = 30000; // 30 second timeout
    const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Test timeout after 30 seconds')), timeoutMs);
    });
    
    const testPromise = testOllamaConnectionInternal(url, model);
    
    try {
        return await Promise.race([testPromise, timeoutPromise]) as any;
    } catch (error) {
        return {
            success: false,
            message: `Test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            details: {}
        };
    }
}

async function testOllamaConnectionInternal(url: string, model: string): Promise<{
    success: boolean;
    message: string;
    details: any;
}> {
    const testResult: {
        success: boolean;
        message: string;
        details: any;
    } = {
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

        const modelsData: OllamaModelsResponse = await modelsResponse.json();
        const availableModels = modelsData.models || [];
        
        // Test 2: Check if specified model exists
        const modelExists = availableModels.some(m => m.name === model);
        if (!modelExists) {
            testResult.message = `Model '${model}' not found. Available models: ${availableModels.map(m => m.name).join(', ')}`;
            testResult.details.availableModels = availableModels.map(m => m.name);
            return testResult;
        }

        // Test 3: Try with a smaller model first if the specified model fails
        const testModels = [model];
        
        // Try larger models first for better quality, then fall back to smaller ones
        const largerModels = availableModels
            .filter(m => m.name.includes('20b') || m.name.includes('13b') || m.name.includes('12b') || m.name.includes('gpt-oss'))
            .sort((a, b) => {
                // Sort by size - prefer larger models
                const aSize = a.name.includes('20b') ? 4 : a.name.includes('13b') ? 3 : a.name.includes('12b') ? 2 : 1;
                const bSize = b.name.includes('20b') ? 4 : b.name.includes('13b') ? 3 : b.name.includes('12b') ? 2 : 1;
                return bSize - aSize; // Reverse sort for larger first
            })
            .map(m => m.name);
        
        const smallerModels = availableModels
            .filter(m => m.name.includes('2b') || m.name.includes('phi') || m.name.includes('gemma2'))
            .sort((a, b) => {
                // Sort by size - prefer smaller models
                const aSize = a.name.includes('2b') ? 1 : a.name.includes('phi') ? 2 : 3;
                const bSize = b.name.includes('2b') ? 1 : b.name.includes('phi') ? 2 : 3;
                return aSize - bSize;
            })
            .map(m => m.name);
        
        // Add larger models first, then smaller ones as fallback
        if (largerModels.length > 0) {
            testModels.unshift(...largerModels);
        }
        if (smallerModels.length > 0) {
            testModels.push(...smallerModels);
        }

        let lastError = '';
        
        for (const testModel of testModels) {
            try {
                // Step 1: Load the model first (warm it up)
                const modelLoaded = await loadModel(url, testModel);
                if (!modelLoaded) {
                    lastError = `Failed to load model '${testModel}'`;
                    continue;
                }

                // Step 2: Wait a moment for the model to fully initialize
                await new Promise(resolve => setTimeout(resolve, 2000));

                // Step 3: Test actual generation with a simple prompt
                const testPrompt = "Hello! Please respond with a simple greeting.";
                const testResponse = await fetch(`${url}/api/generate`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: testModel,
                        prompt: testPrompt,
                        stream: false,
                        options: {
                            temperature: 0.1,
                            num_predict: 50,
                            top_p: 1.0,
                            top_k: 40
                        }
                    })
                });

                if (!testResponse.ok) {
                    lastError = `Generation test failed: ${testResponse.status} ${testResponse.statusText}`;
                    continue;
                }

                const testData: OllamaGenerateResponse = await testResponse.json();
                
                // Check if response indicates completion
                if (!testData.done) {
                    lastError = `Model '${testModel}' response incomplete. Done: ${testData.done}`;
                    continue;
                }
                
                // Check for empty response
                if (!testData.response || testData.response.trim() === '') {
                    lastError = `Model '${testModel}' returned empty response. Done reason: ${testData.done_reason}`;
                    continue;
                }

                // Success
                testResult.success = true;
                testResult.message = `Connection successful! Model '${testModel}' is ready.`;
                testResult.details = {
                    availableModels: availableModels.map(m => m.name),
                    selectedModel: testModel,
                    responseTime: testData.total_duration || 0,
                    response: testData.response.substring(0, 100)
                };
                return testResult;

            } catch (error) {
                lastError = `Model '${testModel}' test failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
                continue;
            }
        }

        // If we get here, all models failed
        testResult.message = `All tested models failed. Last error: ${lastError}`;
        testResult.details.availableModels = availableModels.map(m => m.name);
        testResult.details.testedModels = testModels;

    } catch (error) {
        testResult.message = `Connection test failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
        console.error('Ollama connection test error:', error);
    }

    return testResult;
}

/**
 * Enhanced LLM call with retry logic and error handling
 * @param systemPrompt - System prompt
 * @param messageHistory - Message history
 * @param jsonFields - Expected JSON fields
 * @param maxRetries - Maximum retry attempts
 * @returns LLM response
 */
export async function callLocalLLMWithRetry(
    systemPrompt: string, 
    messageHistory: Message[], 
    jsonFields: Array<{ name: string; type: string }>, 
    maxRetries: number = 3
): Promise<LLMResponse> {
    console.log('🔄 callLocalLLMWithRetry: Starting with', maxRetries, 'retries');
    let lastError: Error;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        console.log(`🔄 callLocalLLMWithRetry: Attempt ${attempt}/${maxRetries}`);
        try {
            console.log('📡 callLocalLLMWithRetry: Calling callLocalLLM...');
            const result = await callLocalLLM(systemPrompt, messageHistory, jsonFields);
            console.log('✅ callLocalLLMWithRetry: Success! Result:', result);
            return result;
        } catch (error) {
            lastError = error instanceof Error ? error : new Error('Unknown error');
            console.warn(`❌ callLocalLLMWithRetry: Attempt ${attempt} failed:`, lastError.message);
            
            if (attempt < maxRetries) {
                // Exponential backoff: wait 1s, 2s, 4s...
                const delay = Math.pow(2, attempt - 1) * 1000;
                console.log(`⏳ callLocalLLMWithRetry: Waiting ${delay}ms before retry...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    
    console.error(`💥 callLocalLLMWithRetry: All ${maxRetries} attempts failed. Last error:`, lastError!.message);
    throw new Error(`Ollama API failed after ${maxRetries} attempts. Last error: ${lastError!.message}`);
}

/**
 * Classify Ollama API errors for appropriate handling
 * @param error - The error object
 * @returns Error classification
 */
export function classifyOllamaError(error: Error): ErrorClassification {
    const classification: ErrorClassification = {
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
    } else if (error.message.includes('Invalid choices array')) {
        classification.type = 'validation_error';
        classification.userMessage = 'LLM response format issue. Please try again.';
        classification.retryable = true;
        classification.action = 'retry';
    }

    return classification;
}

/**
 * Get detailed model metadata including context limits
 * @param url - Ollama server URL (optional)
 * @param model - Model name to get info for
 * @returns Detailed model information
 */
export async function getModelMetadata(url?: string, model?: string): Promise<{
    name: string;
    context_length?: number;
    embedding_length?: number;
    parameters?: string;
    quantization_level?: string;
    format?: string;
    family?: string;
    parameter_size?: string;
    modified_at: string;
    size: number;
}> {
    const config = await loadConfig();
    const ollamaUrl = url || config.ollama.url;
    const modelName = model || config.ollama.model;

    try {
        const response = await fetch(`${ollamaUrl}/api/show`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                name: modelName
            })
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch model metadata: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        console.log('📋 Model metadata:', data);
        
        return {
            name: data.name || modelName,
            context_length: data.context_length,
            embedding_length: data.embedding_length,
            parameters: data.parameters,
            quantization_level: data.quantization_level,
            format: data.format,
            family: data.family,
            parameter_size: data.parameter_size,
            modified_at: data.modified_at,
            size: data.size
        };

    } catch (error) {
        console.error('Failed to fetch model metadata:', error);
        throw error;
    }
}

/**
 * Get context limit for a specific model
 * @param url - Ollama server URL (optional)
 * @param model - Model name (optional)
 * @returns Context limit in tokens, or null if unknown
 */
export async function getModelContextLimit(url?: string, model?: string): Promise<number | null> {
    try {
        const metadata = await getModelMetadata(url, model);
        return metadata.context_length || null;
    } catch (error) {
        console.warn('Could not determine context limit for model:', error);
        return null;
    }
}
