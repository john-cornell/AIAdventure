# AI Adventure Game - Local AI Integration Specification

## Project Overview

Rewrite the current `fromsimtheory.html` file to use local AI services instead of cloud-based APIs. The game will use Ollama for LLM inference and local Stable Diffusion for image generation, with a comprehensive configuration system for model management.

## Current Architecture Analysis

### External Dependencies
1. **LLM**: Uses `window.call_llm()` function (external API)
2. **Image Generation**: Uses `https://cdn.simulationtheory.ai/gasset/?asset=img&prompt=...`
3. **Audio**: Uses `https://cdn.simulationtheory.ai/gasset/?asset=sound&prompt=...` (Dont use in port)
4. **Icons**: Uses `https://cdn.simulationtheory.ai/gasset/?asset=sprite&prompt=...` Use standard emojis and other standard icons

### Core Functionality
- Text-based adventure game with AI-generated story progression
- Image generation for each scene
- Background music/ambience generation
- Memory system for story continuity
- Export/import functionality
- Tabbed interface (Story/History)

## Functional Requirements

### 1. Local Ollama LLM Integration

#### 1.1 API Integration
- **Base URL**: `http://localhost:11434` (default Ollama port)
- **Generate Endpoint**: `POST /api/generate`
- **Models List**: `GET /api/tags`

#### 1.2 Required Functions
```javascript
// Replace window.call_llm with local implementation
async function callLocalLLM(systemPrompt, messageHistory, jsonFields)

// Discover available Ollama models
async function getAvailableOllamaModels()

// Test Ollama connection
async function testOllamaConnection(url, model)
```

#### 1.3 Message Formatting
- Format system prompt and message history for Ollama API
- Handle JSON response parsing
- Implement proper error handling for malformed responses

#### 1.4 Model Support
- Support for multiple Ollama models (llama2, mistral, codellama, etc.)
- Dynamic model discovery from Ollama API
- Model switching capability during gameplay

### 2. Local Stable Diffusion Integration

#### 2.1 API Integration
- **Base URL**: `http://localhost:7860` (default ComfyUI/Automatic1111 port)
- **Text-to-Image**: `POST /sdapi/v1/txt2img` (Automatic1111)
- **Models List**: `GET /sdapi/v1/sd-models` (Automatic1111)

#### 2.2 Required Functions
```javascript
// Generate images locally
async function generateLocalImage(prompt, width = 800, height = 600)

// Discover available SD models
async function getAvailableSDModels()

// Test SD connection
async function testSDConnection(url, model)
```

#### 2.3 Image Generation Parameters
- Configurable image dimensions (width/height)
- Adjustable generation parameters (steps, cfg_scale, sampler)
- Negative prompt handling
- Base64 image response processing

#### 2.4 Model Support
- Support for multiple Stable Diffusion models
- Dynamic model discovery from SD API
- Model switching capability

### 3. Configuration System

#### 3.1 Configuration Structure
```javascript
const defaultConfig = {
    ollamaUrl: 'http://localhost:11434',
    selectedOllamaModel: 'llama2',
    stableDiffusionUrl: 'http://localhost:7860',
    selectedSDModel: 'default',
    imageWidth: 800,
    imageHeight: 600,
    enableAudio: false,
    enableIcons: false,
    llmOptions: {
        temperature: 0.8,
        top_p: 0.9,
        max_tokens: 1000
    },
    sdOptions: {
        steps: 20,
        cfg_scale: 7,
        sampler_name: "DPM++ 2M Karras"
    }
};
```

#### 3.2 Configuration Persistence
- Local storage integration for configuration
- Configuration validation before saving
- Default configuration fallback
- Configuration export/import functionality

#### 3.3 Configuration UI Requirements
- **Ollama Settings Section**:
  - URL input field with validation
  - Model dropdown (populated from API)
  - Test connection button with status feedback
  - Connection status indicator

- **Stable Diffusion Settings Section**:
  - URL input field with validation
  - Model dropdown (populated from API)
  - Image dimensions settings (width/height)
  - Generation parameters (steps, cfg_scale, sampler)
  - Test connection button with status feedback
  - Connection status indicator

- **General Settings Section**:
  - Enable/disable audio generation toggle
  - Enable/disable icon generation toggle
  - LLM generation parameters
  - SD generation parameters

### 4. User Interface Requirements

#### 4.1 Menu Screen Updates
- Add "Settings" button next to "Import Adventure"
- Add connection status indicators for both services
- Add model information display
- Add configuration validation before game start

#### 4.2 Game Controls Updates
- Add configuration button to game controls
- Add connection status indicators
- Add model switching capability during gameplay
- Add service health monitoring

#### 4.3 Configuration Modal
- Modal-based configuration interface
- Tabbed or sectioned layout for different services
- Real-time connection testing
- Configuration validation feedback
- Save/Reset/Close functionality

#### 4.4 Error Handling UI
- User-friendly error messages
- Connection failure notifications
- Service unavailable fallbacks
- Retry mechanism UI

### 5. Error Handling & Fallbacks

#### 5.1 Connection Error Handling
- Graceful degradation when services are unavailable
- Retry mechanisms with exponential backoff
- User-friendly error messages
- Fallback to text-only mode if image generation fails

#### 5.2 Configuration Validation
- Validate URLs before saving
- Test connections before allowing game start
- Provide helpful error messages for common issues
- Configuration integrity checks

#### 5.3 Service Health Monitoring
- Periodic connection checks
- Service status indicators
- Automatic reconnection attempts
- Health status reporting

### 6. Performance Requirements

#### 6.1 Response Times
- LLM response: < 30 seconds for typical responses
- Image generation: < 60 seconds for 800x600 images
- Configuration loading: < 2 seconds
- Model discovery: < 5 seconds

#### 6.2 Caching
- Image caching for generated scenes
- Configuration caching
- Model list caching with refresh capability

#### 6.3 Resource Management
- Memory usage optimization
- Image loading optimization
- Connection pooling
- Request queuing for multiple operations

### 7. Security Requirements

#### 7.1 Local Service Security
- Validate local service URLs
- Prevent external service calls
- Sanitize user inputs
- Secure configuration storage

#### 7.2 Data Privacy
- All processing done locally
- No external data transmission
- Local storage encryption (optional)
- Configuration data protection

## Non-Functional Requirements

### 8. Compatibility Requirements

#### 8.1 Browser Compatibility
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

#### 8.2 Local Service Compatibility
- Ollama 0.1.0+
- Automatic1111 WebUI or ComfyUI
- Local network access
- CORS configuration support

### 9. Usability Requirements

#### 9.1 User Experience
- Intuitive configuration interface
- Clear error messages
- Helpful setup guidance
- Responsive design

#### 9.2 Accessibility
- Keyboard navigation support
- Screen reader compatibility
- High contrast mode support
- Font size adjustment

### 10. Maintainability Requirements

#### 10.1 Code Organization
- Modular architecture
- Clear separation of concerns
- Comprehensive error handling
- Well-documented code

#### 10.2 Extensibility
- Plugin architecture for additional models
- Configuration system extensibility
- Service integration framework
- Customization points

## Implementation Phases

### Phase 1: Core Infrastructure (Week 1-2)
1. Add configuration system
2. Implement local storage
3. Create configuration UI
4. Add connection testing framework
5. Implement configuration validation

### Phase 2: Ollama Integration (Week 3-4)
1. Replace `window.call_llm` with local implementation
2. Add model discovery functionality
3. Implement comprehensive error handling
4. Test with various Ollama models
5. Add model switching capability

### Phase 3: Stable Diffusion Integration (Week 5-6)
1. Replace image generation URLs
2. Add SD model discovery
3. Implement image generation pipeline
4. Add image caching system
5. Test with different SD implementations

### Phase 4: Polish & Optimization (Week 7-8)
1. Add connection status indicators
2. Implement retry mechanisms
3. Add comprehensive configuration validation
4. Performance optimization
5. User experience improvements

## Testing Requirements

### 11. Testing Strategy

#### 11.1 Unit Testing
- Configuration system tests
- API integration tests
- Error handling tests
- Local storage tests

#### 11.2 Integration Testing
- Ollama service integration
- Stable Diffusion service integration
- Configuration persistence
- Error recovery scenarios

#### 11.3 User Acceptance Testing
- Configuration workflow testing
- Gameplay with local services
- Error scenario handling
- Performance testing

#### 11.4 Compatibility Testing
- Multiple browser testing
- Different Ollama model testing
- Different SD implementation testing
- Network condition testing

## Documentation Requirements

### 12. User Documentation

#### 12.1 Setup Guides
- Ollama installation and setup guide
- Stable Diffusion installation and setup guide
- Configuration troubleshooting guide
- Model recommendations and compatibility

#### 12.2 User Manual
- Configuration interface guide
- Gameplay with local services
- Troubleshooting common issues
- Performance optimization tips

### 13. Developer Documentation

#### 13.1 Technical Documentation
- API integration details
- Configuration system architecture
- Error handling patterns
- Extension points for additional models

#### 13.2 Code Documentation
- Function documentation
- Configuration schema documentation
- Error code documentation
- Integration examples

## Success Criteria

### 14. Functional Success Criteria
- [ ] Game successfully uses local Ollama for LLM inference
- [ ] Game successfully uses local Stable Diffusion for image generation
- [ ] Configuration system allows model selection and customization
- [ ] All existing game features work with local services
- [ ] Error handling provides graceful degradation

### 14.2 Performance Success Criteria
- [ ] LLM responses within 30 seconds
- [ ] Image generation within 60 seconds
- [ ] Configuration loading within 2 seconds
- [ ] Smooth gameplay experience maintained

### 14.3 User Experience Success Criteria
- [ ] Intuitive configuration interface
- [ ] Clear error messages and guidance
- [ ] Seamless transition from cloud to local services
- [ ] Positive user feedback on local performance

## Risk Assessment

### 15. Technical Risks
- **Local service availability**: Mitigation through comprehensive error handling
- **Performance degradation**: Mitigation through optimization and caching
- **Model compatibility**: Mitigation through testing and fallback options
- **Browser compatibility**: Mitigation through progressive enhancement

### 15.2 User Experience Risks
- **Complex setup process**: Mitigation through clear documentation and guided setup
- **Performance expectations**: Mitigation through realistic performance targets
- **Error handling confusion**: Mitigation through user-friendly error messages

## Future Enhancements

### 16. Potential Extensions
- Support for additional local AI services
- Advanced configuration options
- Custom model integration
- Performance monitoring and analytics
- Community model sharing
- Advanced caching strategies
- Multi-service load balancing
- Offline mode capabilities
