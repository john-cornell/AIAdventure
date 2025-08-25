# AI Adventure - Architecture Documentation

## 🎯 Entry Point & Core Architecture

### Main Entry Point: `index.html`
The application starts at `index.html` in the root directory. This is a single-page application (SPA) that loads all game functionality through ES6 modules.

**Entry Flow:**
1. **HTML loads** → Sets up UI container and loading state
2. **Module script loads** → Imports `./src/js/ui.js` (compiled from TypeScript)
3. **DOMContentLoaded event** → Calls `initializeUI()` function
4. **UI initialization** → Sets up the entire game interface

### Core Architecture Flow

```
index.html (Entry Point)
    ↓
src/js/ui.js (Main UI Controller)
    ↓
src/js/game.js (Game Logic)
    ↓
src/js/ollama.js (LLM Integration)
src/js/stable-diffusion.js (Image Generation)
src/js/database.js (Data Persistence)
src/js/config.js (Configuration Management)
```

## 📁 Module Structure

### Core Modules (TypeScript source in `src/ts/`, compiled to `src/js/`)

| Module | Purpose | Key Functions |
|--------|---------|---------------|
| [`src/ts/ui.ts`](src/ts/ui.ts) | **Main UI Controller** (5,819 lines) | Handles all user interface, modal management, form handling |
| [`src/ts/game.ts`](src/ts/game.ts) | **Game Logic** | Story progression, state management, LLM interaction |
| [`src/ts/ollama.ts`](src/ts/ollama.ts) | **LLM Integration** | Communicates with Ollama API, model management |
| [`src/ts/stable-diffusion.js`](src/ts/stable-diffusion.js) | **Image Generation** | Stable Diffusion API integration, image processing |
| [`src/ts/database.ts`](src/ts/database.ts) | **Data Persistence** | IndexedDB storage, session management |
| [`src/ts/config.ts`](src/ts/config.ts) | **Configuration** | Settings management, config profiles |
| [`src/ts/types.ts`](src/ts/types.ts) | **Type Definitions** | TypeScript interfaces, data structures |
| [`src/ts/logger.ts`](src/ts/logger.ts) | **Logging** | Debug logging, error tracking |
| [`src/ts/uuid.ts`](src/ts/uuid.ts) | **Utilities** | UUID generation, title generation |

### Build System Files

| File | Purpose |
|------|---------|
| [`package.json`](package.json) | Project configuration, dependencies, scripts |
| [`tsconfig.json`](tsconfig.json) | TypeScript compilation settings |
| [`build-and-dev.ps1`](build-and-dev.ps1) | PowerShell build script |

## 🔄 Data Flow Architecture

### Game State Management
- **Global State**: Managed in `game.ts` with `GameState` interface
- **Session Data**: Stored in IndexedDB via `database.ts`
- **Configuration**: Managed by `config.ts` with profile support
- **UI State**: Handled by `ui.ts` with reactive updates

### Story Progression Pipeline
```
User Input → UI Handler → Game Logic → LLM Request → Story Generation → Image Generation → State Update → UI Update
```

### Data Persistence
- **Story Summaries**: Saved to IndexedDB
- **Game Sessions**: Persistent across browser sessions
- **Configuration Profiles**: Multiple configs supported
- **Image Cache**: Generated images stored locally

## 🗄️ Database Architecture

### IndexedDB Schema (Dexie.js)
The application uses IndexedDB with Dexie.js for data persistence:

#### Tables:
1. **`configs`** - Configuration profiles
   - `id` (auto-increment)
   - `label` (config name)
   - `config_json` (serialized GameConfig)
   - `created_at`, `updated_at` (timestamps)

2. **`storySummaries`** - Game session summaries
   - `id` (auto-increment)
   - `session_id` (UUID)
   - `summary` (story summary text)
   - `step_count` (number of story steps)
   - `last_story_entry_id` (UUID of last entry)
   - `created_at`, `updated_at` (timestamps)

3. **`storySteps`** - Individual story progression steps
   - `id` (auto-increment)
   - `session_id` (UUID)
   - `step_number` (sequential step number)
   - `story_entry_id` (UUID)
   - `choice` (user's choice)
   - `outcome` (result of choice)
   - `story_text` (story content)
   - `image_prompt` (image generation prompt)
   - `choices` (available choices array)
   - `ambience_prompt` (atmospheric prompt)
   - `new_memories` (memories array)
   - `timestamp` (Unix timestamp)
   - `image_data` (base64 image, optional)

### Database Versioning
- **Version 1**: Basic configs table
- **Version 2**: Added storySummaries table
- **Version 3**: Added storySteps table for detailed progression tracking

## ⚙️ Configuration System

### Default Configuration Structure
The system uses a comprehensive `GameConfig` interface with nested configurations:

#### Core Config Sections:
1. **`ollama`** - LLM Configuration
   - URL, model selection
   - Temperature, top_p, max_tokens
   - Model-specific options

2. **`stableDiffusion`** - Image Generation
   - WebUI URL and base path
   - Model selection and generation parameters
   - LoRA and Textual Inversion support
   - Face restoration settings

3. **`logging`** - Debug and Logging
   - Log levels (error, warn, info, debug)
   - Console output settings
   - Maximum log entries

4. **`database`** - Data Management
   - Database name and version
   - Auto-backup settings
   - Story retention policies
   - Cleanup automation

5. **`memories`** - Memory System
   - Memory retention and cleanup
   - Context inclusion settings
   - Memory type categorization
   - Importance weighting

### Configuration Profiles
- **Multiple Profiles**: Support for different game configurations
- **Profile Management**: Save, load, rename, delete profiles
- **Default Profile**: Auto-created on first run
- **Session Snapshots**: Config state saved with game sessions

## 🛠 Development Workflow

### Build Process
1. Edit TypeScript files in `src/ts/`
2. Run `npm run build` or `npm run watch` to compile to `src/js/`
3. HTML loads the compiled JavaScript modules

### Version Management
- **Current Version**: 1.0.51 (from `package.json`)
- **Version Display**: Shown in bottom-right corner of UI
- **Auto-loading**: Version loaded from `package.json` during initialization

### Dependencies
- **Frontend**: TailwindCSS, Dexie (IndexedDB)
- **Backend**: Ollama (LLM), Stable Diffusion (Image Generation)
- **Development**: TypeScript, Node.js

## 🎮 Game Features

### Core Functionality
- **Interactive Storytelling**: LLM-driven narrative generation
- **Image Generation**: AI-generated scene illustrations
- **Choice-based Gameplay**: Multiple story branches
- **Session Persistence**: Save/load game progress
- **Configuration Profiles**: Multiple game settings

### Technical Features
- **Modular Architecture**: Clean separation of concerns
- **Type Safety**: Full TypeScript implementation
- **Error Handling**: Comprehensive error classification
- **Retry Logic**: Robust API communication
- **Responsive UI**: Modern, accessible interface

## 🧠 Game Logic Architecture

### Story Progression System
The game uses a sophisticated story progression system with several key components:

#### LLM Prompt Engineering
- **System Prompt**: 200+ lines of detailed instructions for consistent story generation
- **JSON Response Format**: Structured responses with story, image_prompt, choices, and memories
- **Outcome System**: Support for Success/Partial Success/Failure outcomes
- **Memory Integration**: Contextual memory system for story continuity

#### Context Management
- **Token Counting**: Automatic context limit detection and management
- **Context Thresholds**: 
  - Warning at 80% of context limit
  - Summary trigger at 85% of context limit
- **Auto-Summarization**: Automatic story summarization when context is full
- **Repetition Detection**: Prevents story loops and repetitive patterns

#### Story State Management
```typescript
interface GameState {
    sessionId?: string;
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
```

### UI Architecture

#### Dynamic UI Generation
The UI is built dynamically with several key components:

1. **Modal System**: Settings, database, logging configuration overlays
2. **Loading States**: Animated loading indicators with progress feedback
3. **Error Handling**: Comprehensive error display and recovery
4. **Tab System**: Story and history views with smooth transitions
5. **Form Management**: Dynamic form generation for configuration

#### UI Component Patterns
```typescript
// Utility constants for consistent styling
const UI_CLASSES = {
    input: "w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-2 text-white",
    button: (color: string, size: 'sm' | 'md' | 'lg' = 'md') => { /* ... */ },
    modal: (maxWidth: string, height: string = 'max-h-[95vh]') => { /* ... */ }
};

// Component builders for reusable UI patterns
const UI_COMPONENTS = {
    modalHeader: (title: string, closeButtonId: string) => { /* ... */ },
    tabNavigation: (tabs: Array<{id: string, label: string, icon: string}>) => { /* ... */ },
    formField: (label: string, inputType: string, inputId: string) => { /* ... */ }
};
```

### Error Classification System
The application uses a sophisticated error classification system:

```typescript
interface ErrorClassification {
    type: 'network' | 'not_found' | 'server_error' | 'parse_error' | 'validation_error' | 'unknown';
    userMessage: string;
    retryable: boolean;
    action: 'check_connection' | 'check_url' | 'retry' | 'none';
}
```

#### Error Handling Strategy
- **Network Errors**: Connection issues with Ollama/Stable Diffusion
- **Parse Errors**: JSON parsing failures from LLM responses
- **Validation Errors**: Invalid configuration or data
- **Retry Logic**: Automatic retry with exponential backoff
- **User Feedback**: Clear error messages with actionable guidance

## 🔧 Configuration & Setup

### Required Services
- **Ollama**: Running on `localhost:11434`
- **Stable Diffusion**: Running on `localhost:7860`
- **Web Browser**: ES6 module support required

### Optional Features
- **Face Restoration**: Enhanced image processing
- **LoRA Models**: Custom model integration
- **Textual Inversion**: Advanced prompt engineering

---

*Last Updated: Version 1.0.51*
*Documentation covers the complete architecture and data flow of the AI Adventure game system.*
