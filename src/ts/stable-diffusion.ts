import { 
    StableDiffusionConfig, 
    SDGenerateResponse, 
    SDModelsResponse 
} from './types.js';
import { loadConfig } from './config.js';

/**
 * Generate images locally using Stable Diffusion
 * @param prompt - Image generation prompt
 * @param width - Image width (optional, uses config default)
 * @param height - Image height (optional, uses config default)
 * @returns Base64 encoded image data
 */
export async function generateLocalImage(
    prompt: string, 
    width?: number, 
    height?: number
): Promise<string> {
    const config = await loadConfig();
    const sdUrl = config.stableDiffusion.url;
    const model = config.stableDiffusion.model;
    const options = config.stableDiffusion.options;
    const loras = config.stableDiffusion.loras;
    const textualInversions = config.stableDiffusion.textualInversions;

    // Use provided dimensions or config defaults
    const imageWidth = width || options.width;
    const imageHeight = height || options.height;

    // Prepare LORA configurations
    const enabledLoras = loras.filter(lora => lora.enabled);
    const loraConfigs = enabledLoras.map(lora => ({
        name: lora.name,
        strength: lora.strength
    }));

    // Collect LORA tags
    const loraTags = enabledLoras
        .filter(lora => lora.tags && lora.tags.trim())
        .map(lora => lora.tags.trim())
        .join(', ');

    // Prepare Textual Inversion configurations
    const enabledTextualInversions = textualInversions.filter(ti => ti.enabled);
    
    // Separate positive and negative Textual Inversions
    const positiveTextualInversions = enabledTextualInversions.filter(ti => !ti.isNegative);
    const negativeTextualInversions = enabledTextualInversions.filter(ti => ti.isNegative);
    
    // Collect positive Textual Inversion tags and triggers
    const positiveTextualInversionTags = positiveTextualInversions
        .filter(ti => ti.tags && ti.tags.trim())
        .map(ti => ti.tags.trim())
        .join(', ');
    
    const positiveTextualInversionTriggers = positiveTextualInversions
        .filter(ti => ti.trigger && ti.trigger.trim())
        .map(ti => ti.trigger.trim())
        .join(', ');
    
    // Collect negative Textual Inversion tags and triggers
    const negativeTextualInversionTags = negativeTextualInversions
        .filter(ti => ti.tags && ti.tags.trim())
        .map(ti => ti.tags.trim())
        .join(', ');
    
    const negativeTextualInversionTriggers = negativeTextualInversions
        .filter(ti => ti.trigger && ti.trigger.trim())
        .map(ti => ti.trigger.trim())
        .join(', ');

    console.log('🎨 Using LORAs:', loraConfigs);
    console.log('🎨 LORA Tags:', loraTags);
    console.log('🎨 Using Textual Inversions:', enabledTextualInversions.map(ti => ti.name));
    console.log('🎨 Positive Textual Inversion Tags:', positiveTextualInversionTags);
    console.log('🎨 Positive Textual Inversion Triggers:', positiveTextualInversionTriggers);
    console.log('🎨 Negative Textual Inversion Tags:', negativeTextualInversionTags);
    console.log('🎨 Negative Textual Inversion Triggers:', negativeTextualInversionTriggers);

    // Enhanced positive prompt with LORA tags and positive Textual Inversion triggers/tags
    const baseEnhancement = `photorealistic, highly detailed, professional photography, 8k uhd, dslr, high quality, sharp focus, perfect lighting, cinematic lighting, masterpiece, best quality, ultra detailed`;
    
    // Combine positive enhancement tags
    const positiveEnhancementTags = [
        loraTags,
        positiveTextualInversionTags,
        positiveTextualInversionTriggers,
        baseEnhancement
    ].filter(Boolean).join(', ');
    
    const enhancedPrompt = positiveEnhancementTags 
        ? `${prompt}, ${positiveEnhancementTags}`
        : `${prompt}, ${baseEnhancement}`;
    
    // Enhanced negative prompt with negative Textual Inversion triggers/tags
    const baseNegativePrompt = "blurry, low quality, distorted, ugly, bad anatomy, watermark, text, signature, logo, oversaturated, overexposed, underexposed, low resolution, pixelated, jpeg artifacts, compression artifacts, noise, grain, out of focus, soft focus, motion blur, chromatic aberration, lens distortion, vignetting, amateur, cell phone, webcam, surveillance camera, poor quality, bad quality, terrible quality, worst quality, low effort, ai generated, artificial, fake, synthetic, computer generated, digital art, illustration, painting, drawing, sketch, cartoon, anime, manga, comic, graphic novel, stylized, artistic, abstract, surreal, dreamy, fantasy, magical, mystical, supernatural";
    
    // Combine negative enhancement tags
    const negativeEnhancementTags = [
        negativeTextualInversionTags,
        negativeTextualInversionTriggers
    ].filter(Boolean).join(', ');
    
    const negativePrompt = negativeEnhancementTags 
        ? `${baseNegativePrompt}, ${negativeEnhancementTags}`
        : baseNegativePrompt;

    // Log the complete prompt information
    console.log('🎨 === IMAGE GENERATION PROMPT ===');
    console.log('🎨 Original Prompt:', prompt);
    console.log('🎨 Enhanced Positive Prompt:', enhancedPrompt);
    console.log('🎨 Negative Prompt:', negativePrompt);
    console.log('🎨 Model:', model);
    console.log('🎨 Dimensions:', `${imageWidth}x${imageHeight}`);
    console.log('🎨 Steps:', options.steps);
    console.log('🎨 CFG Scale:', options.cfg_scale);
    console.log('🎨 Sampler:', options.sampler_name);
    console.log('🎨 LORAs:', loraConfigs);
    console.log('🎨 ================================');

    try {
        const response = await fetch(`${sdUrl}/sdapi/v1/txt2img`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                prompt: enhancedPrompt,
                negative_prompt: negativePrompt,
                steps: options.steps,
                cfg_scale: options.cfg_scale,
                width: imageWidth,
                height: imageHeight,
                sampler_name: options.sampler_name,
                batch_size: 1,
                // LORA configurations
                loras: loraConfigs
            })
        });

        if (!response.ok) {
            throw new Error(`Stable Diffusion API error: ${response.status} ${response.statusText}`);
        }

        const data: SDGenerateResponse = await response.json();
        
        if (!data.images || data.images.length === 0) {
            throw new Error('No image generated by Stable Diffusion');
        }

        // Return the first generated image
        return data.images[0];

    } catch (error) {
        console.error('Stable Diffusion API call failed:', error);
        throw error;
    }
}

/**
 * Discover available Stable Diffusion models
 * @param url - SD server URL (optional)
 * @returns Array of available model information
 */
export async function getAvailableSDModels(url?: string): Promise<SDModelsResponse[]> {
    const config = await loadConfig();
    const sdUrl = url || config.stableDiffusion.url;

    try {
        const response = await fetch(`${sdUrl}/sdapi/v1/sd-models`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch SD models: ${response.status} ${response.statusText}`);
        }

        const data: SDModelsResponse[] = await response.json();
        return data || [];

    } catch (error) {
        console.error('Failed to fetch Stable Diffusion models:', error);
        throw error;
    }
}

/**
 * Discover available LORA models
 * @param url - SD server URL (optional)
 * @returns Array of available LORA model names
 */
export async function getAvailableLoraModels(url?: string): Promise<string[]> {
    const config = await loadConfig();
    const sdUrl = url || config.stableDiffusion.url;

    try {
        // Try the LORA endpoint first (if available)
        const response = await fetch(`${sdUrl}/sdapi/v1/loras`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            }
        });

        if (response.ok) {
            const data = await response.json();
            if (Array.isArray(data)) {
                // If it's an array of strings, return them
                if (typeof data[0] === 'string') {
                    return data;
                }
                // If it's an array of objects, extract names
                if (data[0] && typeof data[0] === 'object') {
                    return data.map((lora: any) => lora.name || lora.title || lora.filename || '').filter(Boolean);
                }
            }
        }

        // Fallback: try to get LORAs from the extras API
        const extrasResponse = await fetch(`${sdUrl}/sdapi/v1/extra-single-image`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
                resize_mode: 0,
                show_extras_results: true,
                gfpgan_visibility: 0,
                codeformer_visibility: 0
            })
        });

        if (extrasResponse.ok) {
            // If extras API works, try to get LORA info from options
            const optionsResponse = await fetch(`${sdUrl}/sdapi/v1/options`, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (optionsResponse.ok) {
                const options = await optionsResponse.json();
                // Some SD WebUI versions store LORA info in options
                if (options.lora_models) {
                    return options.lora_models;
                }
            }
        }

        console.log('🔍 LORA discovery: No LORA endpoint found, returning empty list');
        return [];

    } catch (error) {
        console.warn('Failed to fetch LORA models:', error);
        return [];
    }
}

/**
 * Get available textual inversion embeddings from Stable Diffusion WebUI
 * @param url - SD server URL (optional)
 * @returns Array of available textual inversion embedding names
 */
export async function getAvailableTextualInversionModels(url?: string): Promise<string[]> {
    const config = await loadConfig();
    const sdUrl = url || config.stableDiffusion.url;

    try {
        // Try multiple possible endpoints for textual inversions
        const possibleEndpoints = [
            '/sdapi/v1/embeddings',
            '/sdapi/v1/textual-inversions',
            '/sdapi/v1/ti',
            '/sdapi/v1/embedding',
            '/sdapi/v1/textual-inversion'
        ];

        for (const endpoint of possibleEndpoints) {
            try {
                const response = await fetch(`${sdUrl}${endpoint}`, {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json'
                    }
                });

                if (response.ok) {
                    const data = await response.json();
                    console.log(`🔍 Textual Inversion endpoint ${endpoint} returned:`, data);
                    
                    if (Array.isArray(data)) {
                        // If it's an array of strings, return them
                        if (typeof data[0] === 'string') {
                            console.log(`✅ Found ${data.length} textual inversions from ${endpoint}`);
                            return data;
                        }
                        // If it's an array of objects, extract names
                        if (data[0] && typeof data[0] === 'object') {
                            const names = data.map((embedding: any) => embedding.name || embedding.title || embedding.filename || '').filter(Boolean);
                            console.log(`✅ Found ${names.length} textual inversions from ${endpoint}:`, names);
                            return names;
                        }
                    } else if (data && typeof data === 'object') {
                        // Handle object format like {loaded: {...}, skipped: {...}}
                        const allEmbeddings: string[] = [];
                        
                        // Extract from 'loaded' object
                        if (data.loaded && typeof data.loaded === 'object') {
                            const loadedNames = Object.keys(data.loaded);
                            allEmbeddings.push(...loadedNames);
                        }
                        
                        // Extract from 'skipped' object
                        if (data.skipped && typeof data.skipped === 'object') {
                            const skippedNames = Object.keys(data.skipped);
                            allEmbeddings.push(...skippedNames);
                        }
                        
                        if (allEmbeddings.length > 0) {
                            console.log(`✅ Found ${allEmbeddings.length} textual inversions from ${endpoint}:`, allEmbeddings);
                            return allEmbeddings;
                        }
                    }
                }
            } catch (endpointError) {
                console.log(`🔍 Endpoint ${endpoint} failed:`, endpointError);
                continue;
            }
        }

        // Fallback: try to get embeddings from the extras API
        const extrasResponse = await fetch(`${sdUrl}/sdapi/v1/extra-single-image`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
                resize_mode: 0,
                show_extras_results: true,
                gfpgan_visibility: 0,
                codeformer_visibility: 0
            })
        });

        if (extrasResponse.ok) {
            // If extras API works, try to get embedding info from options
            const optionsResponse = await fetch(`${sdUrl}/sdapi/v1/options`, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (optionsResponse.ok) {
                const options = await optionsResponse.json();
                // Some SD WebUI versions store embedding info in options
                if (options.embeddings) {
                    return options.embeddings;
                }
            }
        }

        // Final fallback: try filesystem discovery
        console.log('🔍 API endpoints failed, trying filesystem discovery...');
        const filesystemEmbeddings = await getTextualInversionModelsFromFilesystem();
        if (filesystemEmbeddings.length > 0) {
            console.log(`✅ Found ${filesystemEmbeddings.length} textual inversions from filesystem:`, filesystemEmbeddings);
            return filesystemEmbeddings;
        }

        console.log('🔍 Textual Inversion discovery: No embeddings found via API or filesystem, returning empty list');
        return [];

    } catch (error) {
        console.warn('Failed to fetch textual inversion models:', error);
        return [];
    }
}

/**
 * Test available SD API endpoints for debugging
 * @param url - SD server URL (optional)
 * @returns Object with available endpoints and their responses
 */
export async function testSDApiEndpoints(url?: string): Promise<{
    [endpoint: string]: { available: boolean; response?: any; error?: string }
}> {
    const config = await loadConfig();
    const sdUrl = url || config.stableDiffusion.url;
    
    const endpoints = [
        '/sdapi/v1/sd-models',
        '/sdapi/v1/loras',
        '/sdapi/v1/embeddings',
        '/sdapi/v1/textual-inversions',
        '/sdapi/v1/ti',
        '/sdapi/v1/embedding',
        '/sdapi/v1/textual-inversion',
        '/sdapi/v1/options'
    ];
    
    const results: { [endpoint: string]: { available: boolean; response?: any; error?: string } } = {};
    
    for (const endpoint of endpoints) {
        try {
            const response = await fetch(`${sdUrl}${endpoint}`, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                results[endpoint] = { available: true, response: data };
            } else {
                results[endpoint] = { available: false, error: `${response.status} ${response.statusText}` };
            }
        } catch (error) {
            results[endpoint] = { available: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
    }
    
    return results;
}

/**
 * Test Stable Diffusion connection and model availability
 * @param url - SD server URL
 * @param model - Model name to test
 * @returns Test result with status and details
 */
export async function testSDConnection(url: string, model: string): Promise<{
    success: boolean;
    message: string;
    details: any;
}> {
    // Add timeout to prevent hanging
    const timeoutMs = 30000; // 30 second timeout
    const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Test timeout after 30 seconds')), timeoutMs);
    });
    
    const testPromise = testSDConnectionInternal(url, model);
    
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

async function testSDConnectionInternal(url: string, model: string): Promise<{
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
        // Test 0: Check if server is reachable at all
        const healthResponse = await fetch(`${url}/`, {
            method: 'GET',
            headers: { 'Accept': 'text/html' }
        });

        if (!healthResponse.ok) {
            testResult.message = `Server unreachable: ${healthResponse.status} ${healthResponse.statusText}`;
            return testResult;
        }

        // Test 1: Check if API is enabled
        const modelsResponse = await fetch(`${url}/sdapi/v1/sd-models`, {
            method: 'GET',
            headers: { 
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });

        if (!modelsResponse.ok) {
            testResult.message = `Server unreachable: ${modelsResponse.status} ${modelsResponse.statusText}`;
            return testResult;
        }

        const modelsData: SDModelsResponse[] = await modelsResponse.json();
        const availableModels = modelsData || [];
        
        // Test 2: Check if specified model exists (if model name provided)
        if (model && model !== 'default') {
            const modelExists = availableModels.some(m => m.title === model || m.model_name === model);
            if (!modelExists) {
                testResult.message = `Model '${model}' not found. Available models: ${availableModels.map(m => m.title).join(', ')}`;
                testResult.details.availableModels = availableModels.map(m => m.title);
                return testResult;
            }
        }

        // Test 3: Check if txt2img endpoint is available (skip actual generation to avoid downloads)
        const endpointResponse = await fetch(`${url}/sdapi/v1/txt2img`, {
            method: 'OPTIONS',
            headers: { 'Content-Type': 'application/json' }
        });

        if (!endpointResponse.ok && endpointResponse.status !== 405) { // 405 is "Method Not Allowed" which is fine for OPTIONS
            testResult.message = `txt2img endpoint test failed: ${endpointResponse.status} ${endpointResponse.statusText}`;
            return testResult;
        }

        // Success
        testResult.success = true;
        testResult.message = `Connection successful! Stable Diffusion is ready.`;
        testResult.details = {
            availableModels: availableModels.map(m => m.title),
            selectedModel: model,
            endpointTested: 'txt2img'
        };

    } catch (error) {
        testResult.message = `Connection test failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
        console.error('Stable Diffusion connection test error:', error);
    }

    return testResult;
}

/**
 * Switch Stable Diffusion model
 * @param modelName - Name of the model to switch to
 * @returns Success status
 */
export async function switchSDModel(modelName: string): Promise<boolean> {
    const config = await loadConfig();
    const sdUrl = config.stableDiffusion.url;

    try {
        const response = await fetch(`${sdUrl}/sdapi/v1/options`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                sd_model_checkpoint: modelName
            })
        });

        if (!response.ok) {
            throw new Error(`Failed to switch model: ${response.status} ${response.statusText}`);
        }

        return true;

    } catch (error) {
        console.error('Failed to switch SD model:', error);
        throw error;
    }
}

/**
 * Get current Stable Diffusion model
 * @returns Current model information
 */
export async function getCurrentSDModel(): Promise<string> {
    const config = await loadConfig();
    const sdUrl = config.stableDiffusion.url;

    try {
        const response = await fetch(`${sdUrl}/sdapi/v1/options`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to get current model: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        return data.sd_model_checkpoint || 'unknown';

    } catch (error) {
        console.error('Failed to get current SD model:', error);
        throw error;
    }
}

/**
 * Enhanced image generation with retry logic
 * @param prompt - Image generation prompt
 * @param width - Image width
 * @param height - Image height
 * @param maxRetries - Maximum retry attempts
 * @returns Base64 encoded image data
 */
export async function generateLocalImageWithRetry(
    prompt: string, 
    width?: number, 
    height?: number, 
    maxRetries: number = 3
): Promise<string> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await generateLocalImage(prompt, width, height);
        } catch (error) {
            lastError = error instanceof Error ? error : new Error('Unknown error');
            console.warn(`SD generation attempt ${attempt} failed:`, lastError.message);
            
            if (attempt < maxRetries) {
                // Exponential backoff: wait 2s, 4s, 8s...
                const delay = Math.pow(2, attempt) * 1000;
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    
    throw new Error(`SD generation failed after ${maxRetries} attempts. Last error: ${lastError!.message}`);
}

/**
 * Generate images with face restoration
 * @param prompt - Image generation prompt
 * @param width - Image width (optional, uses config default)
 * @param height - Image height (optional, uses config default)
 * @param enableFaceRestoration - Whether to enable face restoration
 * @returns Base64 encoded image data
 */
export async function generateLocalImageWithFaceRestoration(
    prompt: string, 
    width?: number, 
    height?: number,
    enableFaceRestoration: boolean = true
): Promise<string> {
    const config = await loadConfig();
    const sdUrl = config.stableDiffusion.url;
    const model = config.stableDiffusion.model;
    const options = config.stableDiffusion.options;
    const loras = config.stableDiffusion.loras;

    // Use provided dimensions or config defaults
    const imageWidth = width || options.width;
    const imageHeight = height || options.height;

    // Prepare LORA configurations
    const enabledLoras = loras.filter(lora => lora.enabled);
    const loraConfigs = enabledLoras.map(lora => ({
        name: lora.name,
        strength: lora.strength
    }));

    // Collect LORA tags
    const loraTags = enabledLoras
        .filter(lora => lora.tags && lora.tags.trim())
        .map(lora => lora.tags.trim())
        .join(', ');

    // Prepare Textual Inversion configurations for face restoration
    const textualInversions = config.stableDiffusion.textualInversions;
    const enabledTextualInversions = textualInversions.filter(ti => ti.enabled);
    
    // Separate positive and negative Textual Inversions
    const positiveTextualInversions = enabledTextualInversions.filter(ti => !ti.isNegative);
    const negativeTextualInversions = enabledTextualInversions.filter(ti => ti.isNegative);
    
    // Collect positive Textual Inversion tags and triggers
    const positiveTextualInversionTags = positiveTextualInversions
        .filter(ti => ti.tags && ti.tags.trim())
        .map(ti => ti.tags.trim())
        .join(', ');
    
    const positiveTextualInversionTriggers = positiveTextualInversions
        .filter(ti => ti.trigger && ti.trigger.trim())
        .map(ti => ti.trigger.trim())
        .join(', ');
    
    // Collect negative Textual Inversion tags and triggers
    const negativeTextualInversionTags = negativeTextualInversions
        .filter(ti => ti.tags && ti.tags.trim())
        .map(ti => ti.tags.trim())
        .join(', ');
    
    const negativeTextualInversionTriggers = negativeTextualInversions
        .filter(ti => ti.trigger && ti.trigger.trim())
        .map(ti => ti.trigger.trim())
        .join(', ');

    console.log('🎨 Using LORAs with face restoration:', loraConfigs);
    console.log('🎨 LORA Tags:', loraTags);
    console.log('🎨 Positive Textual Inversion Tags:', positiveTextualInversionTags);
    console.log('🎨 Positive Textual Inversion Triggers:', positiveTextualInversionTriggers);
    console.log('🎨 Negative Textual Inversion Tags:', negativeTextualInversionTags);
    console.log('🎨 Negative Textual Inversion Triggers:', negativeTextualInversionTriggers);

    // Enhanced positive prompt for face restoration with LORA tags and positive Textual Inversions
    const baseEnhancement = `photorealistic, highly detailed, professional photography, 8k uhd, dslr, high quality, sharp focus, perfect lighting, cinematic lighting, masterpiece, best quality, ultra detailed`;
    
    // Combine positive enhancement tags
    const positiveEnhancementTags = [
        loraTags,
        positiveTextualInversionTags,
        positiveTextualInversionTriggers,
        baseEnhancement
    ].filter(Boolean).join(', ');
    
    const enhancedPrompt = positiveEnhancementTags 
        ? `${prompt}, ${positiveEnhancementTags}`
        : `${prompt}, ${baseEnhancement}`;
    
    // Enhanced negative prompt for face restoration with negative Textual Inversions
    const baseNegativePrompt = "blurry, low quality, distorted, ugly, bad anatomy, deformed face, bad face, ugly face, disfigured face, watermark, text, signature, logo, oversaturated, overexposed, underexposed, low resolution, pixelated, jpeg artifacts, compression artifacts, noise, grain, out of focus, soft focus, motion blur, chromatic aberration, lens distortion, vignetting, amateur, cell phone, webcam, surveillance camera, poor quality, bad quality, terrible quality, worst quality, low effort, ai generated, artificial, fake, synthetic, computer generated, digital art, illustration, painting, drawing, sketch, cartoon, anime, manga, comic, graphic novel, stylized, artistic, abstract, surreal, dreamy, fantasy, magical, mystical, supernatural";
    
    // Combine negative enhancement tags
    const negativeEnhancementTags = [
        negativeTextualInversionTags,
        negativeTextualInversionTriggers
    ].filter(Boolean).join(', ');
    
    const negativePrompt = negativeEnhancementTags 
        ? `${baseNegativePrompt}, ${negativeEnhancementTags}`
        : baseNegativePrompt;

    // Log the complete prompt information for face restoration
    console.log('🎨 === FACE RESTORATION IMAGE GENERATION PROMPT ===');
    console.log('🎨 Original Prompt:', prompt);
    console.log('🎨 Enhanced Positive Prompt:', enhancedPrompt);
    console.log('🎨 Negative Prompt:', negativePrompt);
    console.log('🎨 Model:', model);
    console.log('🎨 Dimensions:', `${imageWidth}x${imageHeight}`);
    console.log('🎨 Steps:', options.steps);
    console.log('🎨 CFG Scale:', options.cfg_scale);
    console.log('🎨 Sampler:', options.sampler_name);
    console.log('🎨 LORAs:', loraConfigs);
    console.log('🎨 Face Restoration:', enableFaceRestoration);
    console.log('🎨 Face Restoration Model: CodeFormer');
    console.log('🎨 ================================================');

    try {
        const response = await fetch(`${sdUrl}/sdapi/v1/txt2img`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                prompt: enhancedPrompt,
                negative_prompt: negativePrompt,
                steps: options.steps,
                cfg_scale: options.cfg_scale,
                width: imageWidth,
                height: imageHeight,
                sampler_name: options.sampler_name,
                batch_size: 1,
                // LORA configurations
                loras: loraConfigs,
                // Face restoration settings
                restore_faces: enableFaceRestoration,
                face_restoration_model: "CodeFormer", // or "GFPGAN"
                face_restoration_visibility: 1.0,
                // Additional quality improvements
                enable_hr: false,
                denoising_strength: 0.7,
                firstphase_width: 0,
                firstphase_height: 0,
                hr_scale: 2.0,
                hr_upscaler: "Latent",
                hr_second_pass_steps: 20,
                hr_resize_x: 0,
                hr_resize_y: 0
            })
        });

        if (!response.ok) {
            throw new Error(`Stable Diffusion API error: ${response.status} ${response.statusText}`);
        }

        const data: SDGenerateResponse = await response.json();
        
        if (!data.images || data.images.length === 0) {
            throw new Error('No image generated by Stable Diffusion');
        }

        // Return the first generated image
        return data.images[0];

    } catch (error) {
        console.error('Stable Diffusion API call failed:', error);
        throw error;
    }
}

/**
 * Apply face restoration to an existing image
 * @param imageData - Base64 encoded image data
 * @param faceRestorationModel - Face restoration model to use
 * @returns Base64 encoded restored image data
 */
export async function applyFaceRestoration(
    imageData: string,
    faceRestorationModel: 'CodeFormer' | 'GFPGAN' = 'CodeFormer'
): Promise<string> {
    const config = await loadConfig();
    const sdUrl = config.stableDiffusion.url;

    try {
        const response = await fetch(`${sdUrl}/sdapi/v1/extra-single-image`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                image: imageData,
                resize_mode: 0,
                show_extras_results: true,
                gfpgan_visibility: faceRestorationModel === 'GFPGAN' ? 1.0 : 0.0,
                codeformer_visibility: faceRestorationModel === 'CodeFormer' ? 1.0 : 0.0,
                codeformer_weight: 0.8,
                upscaling_resize: 2,
                upscaling_resize_w: 512,
                upscaling_resize_h: 512,
                upscaling_crop: true,
                upscaler_1: "None",
                upscaler_2: "None",
                extras_upscaler_2_visibility: 0,
                upscale_first: false
            })
        });

        if (!response.ok) {
            throw new Error(`Face restoration API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        
        if (!data.image) {
            throw new Error('No restored image received');
        }

        return data.image;

    } catch (error) {
        console.error('Face restoration failed:', error);
        throw error;
    }
}

/**
 * Get available face restoration models
 * @returns Array of available face restoration models
 */
export async function getAvailableFaceRestorationModels(): Promise<string[]> {
    // These are the standard face restoration models in SD WebUI
    return ['CodeFormer', 'GFPGAN'];
}

/**
 * Check if face restoration is available
 * @returns Whether face restoration is supported
 */
export async function isFaceRestorationAvailable(): Promise<boolean> {
    try {
        const config = await loadConfig();
        const sdUrl = config.stableDiffusion.url;
        
        console.log('🔍 Testing face restoration availability at:', sdUrl);
        
        // Test if the extra-single-image endpoint is available
        const response = await fetch(`${sdUrl}/sdapi/v1/extra-single-image`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', // 1x1 pixel
                resize_mode: 0,
                show_extras_results: true,
                gfpgan_visibility: 0,
                codeformer_visibility: 0
            })
        });
        
        const isAvailable = response.ok;
        console.log('🔍 Face restoration test result:', isAvailable, 'Status:', response.status);
        
        return isAvailable;
    } catch (error) {
        console.warn('Face restoration not available:', error);
        return false;
    }
}

// ============================================================================
// FILESYSTEM QUERY FUNCTIONS (Node.js environment only)
// These functions can access SD files directly using the basePath configuration
// ============================================================================

/**
 * Get SD installation information from filesystem
 * @returns SD installation details or null if not available
 */
export async function getSDInstallationInfo(): Promise<{
    basePath: string;
    modelsPath: string;
    lorasPath: string;
    scriptsPath: string;
    configPath: string;
    exists: boolean;
} | null> {
    // Only available in Node.js environment
    if (typeof window !== 'undefined') {
        console.warn('getSDInstallationInfo: Only available in Node.js environment');
        return null;
    }

    try {
        const config = await loadConfig();
        const basePath = config.stableDiffusion.basePath;
        
        if (!basePath) {
            console.warn('No SD base path configured');
            return null;
        }

        // Dynamic imports for Node.js modules
        const fs = await import('fs');
        const path = await import('path');

        const modelsPath = path.join(basePath, 'models', 'Stable-diffusion');
        const lorasPath = path.join(basePath, 'models', 'Lora');
        const scriptsPath = path.join(basePath, 'scripts');
        const configPath = path.join(basePath, 'configs');

        const exists = fs.existsSync(basePath);

        return {
            basePath,
            modelsPath,
            lorasPath,
            scriptsPath,
            configPath,
            exists
        };
    } catch (error) {
        console.error('Failed to get SD installation info:', error);
        return null;
    }
}

/**
 * Get available SD models from filesystem
 * @returns Array of model filenames
 */
export async function getSDModelsFromFilesystem(): Promise<string[]> {
    const info = await getSDInstallationInfo();
    if (!info || !info.exists) {
        return [];
    }

    try {
        const fs = await import('fs');
        const path = await import('path');

        if (!fs.existsSync(info.modelsPath)) {
            console.warn('SD models directory not found:', info.modelsPath);
            return [];
        }

        const files = fs.readdirSync(info.modelsPath);
        const modelFiles = files.filter(file => 
            file.endsWith('.safetensors') || 
            file.endsWith('.ckpt') || 
            file.endsWith('.pt')
        );

        console.log(`📁 Found ${modelFiles.length} SD models in filesystem:`, modelFiles);
        return modelFiles;
    } catch (error) {
        console.error('Failed to read SD models from filesystem:', error);
        return [];
    }
}

/**
 * Get available LORA models from filesystem
 * @returns Array of LORA filenames
 */
export async function getLoraModelsFromFilesystem(): Promise<string[]> {
    const info = await getSDInstallationInfo();
    if (!info || !info.exists) {
        return [];
    }

    try {
        const fs = await import('fs');
        const path = await import('path');

        if (!fs.existsSync(info.lorasPath)) {
            console.warn('SD LORA directory not found:', info.lorasPath);
            return [];
        }

        const files = fs.readdirSync(info.lorasPath);
        const loraFiles = files.filter(file => 
            file.endsWith('.safetensors') || 
            file.endsWith('.pt')
        );

        console.log(`📁 Found ${loraFiles.length} LORA models in filesystem:`, loraFiles);
        return loraFiles;
    } catch (error) {
        console.error('Failed to read LORA models from filesystem:', error);
        return [];
    }
}

/**
 * Get available textual inversion embeddings from filesystem
 * @returns Array of textual inversion embedding filenames
 */
export async function getTextualInversionModelsFromFilesystem(): Promise<string[]> {
    const info = await getSDInstallationInfo();
    if (!info || !info.exists) {
        return [];
    }

    try {
        const fs = await import('fs');
        const path = await import('path');

        // Textual inversions are typically stored in the embeddings folder
        const embeddingsPath = path.join(info.basePath, 'embeddings');
        
        if (!fs.existsSync(embeddingsPath)) {
            console.warn('SD embeddings directory not found:', embeddingsPath);
            return [];
        }

        const files = fs.readdirSync(embeddingsPath);
        const embeddingFiles = files.filter(file => 
            file.endsWith('.safetensors') || 
            file.endsWith('.pt') ||
            file.endsWith('.bin')
        );

        console.log(`📁 Found ${embeddingFiles.length} textual inversion embeddings in filesystem:`, embeddingFiles);
        return embeddingFiles;
    } catch (error) {
        console.error('Failed to read textual inversion models from filesystem:', error);
        return [];
    }
}

/**
 * Check if a specific model exists in SD installation
 * @param modelName - Name of the model to check
 * @returns Whether the model exists
 */
export async function checkSDModelExists(modelName: string): Promise<boolean> {
    const info = await getSDInstallationInfo();
    if (!info || !info.exists) {
        return false;
    }

    try {
        const fs = await import('fs');
        const path = await import('path');

        const modelPath = path.join(info.modelsPath, modelName);
        return fs.existsSync(modelPath);
    } catch (error) {
        console.error('Failed to check model existence:', error);
        return false;
    }
}

/**
 * Get SD WebUI version from filesystem
 * @returns SD WebUI version or null if not found
 */
export async function getSDWebUIVersion(): Promise<string | null> {
    const info = await getSDInstallationInfo();
    if (!info || !info.exists) {
        return null;
    }

    try {
        const fs = await import('fs');
        const path = await import('path');

        // Check for version in various possible locations
        const possiblePaths = [
            path.join(info.basePath, 'version.txt'),
            path.join(info.basePath, 'webui.py'),
            path.join(info.basePath, 'launch.py')
        ];

        for (const filePath of possiblePaths) {
            if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, 'utf8');
                
                // Try to extract version from content
                const versionMatch = content.match(/version\s*[=:]\s*['"]([^'"]+)['"]/i);
                if (versionMatch) {
                    return versionMatch[1];
                }
            }
        }

        return null;
    } catch (error) {
        console.error('Failed to get SD WebUI version:', error);
        return null;
    }
}

/**
 * Get SD configuration from filesystem
 * @returns SD configuration object or null if not found
 */
export async function getSDConfigFromFilesystem(): Promise<any | null> {
    const info = await getSDInstallationInfo();
    if (!info || !info.exists) {
        return null;
    }

    try {
        const fs = await import('fs');
        const path = await import('path');

        const configPath = path.join(info.basePath, 'config.json');
        if (fs.existsSync(configPath)) {
            const content = fs.readFileSync(configPath, 'utf8');
            return JSON.parse(content);
        }

        return null;
    } catch (error) {
        console.error('Failed to get SD config from filesystem:', error);
        return null;
    }
}
