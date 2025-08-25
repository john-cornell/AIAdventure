# AI Adventure Game 🎮

A local AI-powered text adventure game that uses Ollama for story generation and Stable Diffusion for scene visualization. Experience dynamic storytelling with AI-generated narratives and beautiful scene images.

**Current Version**: 1.0.51 (Latest)

**Latest Updates**:
- 🤖 **LLM Story Progression Confirmation**: Simple yes/no validation when poor story quality is suspected
- 📖 **Story Quality Validation**: Automatic detection and retry of poor quality, short, or incomplete story responses
- 📜 **Auto-Scroll Story**: Automatic smooth scrolling to show new story content as it appears
- 🚫 **Anti-Summarization**: Automatic detection and prevention of AI story summarization with intelligent retry
- ✏️ **Content Editing**: Edit story summaries and steps directly from the management interface
- 🧠 **Enhanced Memory System**: 20-memory limit with intelligent summarization
- 🗑️ **Memory Management**: Add, edit, and delete AI memories
- 📚 **Story Management**: Comprehensive session management with database persistence
- 🔄 **Smart Memory Summarization**: Old memories are automatically condensed to preserve context

## 🌟 Features

- **AI-Powered Storytelling**: Dynamic story generation using local LLMs via Ollama
- **Scene Visualization**: Beautiful AI-generated images for each story scene using Stable Diffusion
- **Local & Private**: Everything runs locally on your machine - no cloud dependencies
- **Persistent Game State**: Save and load your adventures with automatic database persistence
- **Multiple AI Models**: Support for various Ollama models and SD models
- **Real-time Settings**: Immediate configuration changes with auto-save
- **Advanced Database Management**: Built-in database viewer, configuration management, and data export/import
- **Story Management System**: Comprehensive session management with summaries, steps, and memories
- **Memory Management**: AI memory system with manual editing, summarization, and 20-memory limit
- **Content Editing**: Edit story summaries and steps directly from the management interface
- **Session Recovery**: Load any saved game session and continue from where you left off
- **Story Quality Validation**: Automatic detection and retry of poor quality, short, or incomplete story responses
- **Anti-Summarization Protection**: Automatic detection and prevention of AI story summarization with intelligent retry
- **Auto-Scroll Story**: Smooth automatic scrolling to keep new story content visible

## 🛠️ Prerequisites

### Required Software

1. **Node.js** (v18 or higher)
   - Download from [nodejs.org](https://nodejs.org/)
   - Verify installation: `node --version`

2. **pnpm** (Package Manager)
   - Install: `npm install -g pnpm`
   - Verify installation: `pnpm --version`

3. **Ollama** (Local LLM Server)
   - Download from [ollama.ai](https://ollama.ai/)
   - Install and start the service
   - Pull at least one model: `ollama pull llama2` (or any other model)

4. **Stable Diffusion WebUI** (Image Generation)
   - Clone from [github.com/AUTOMATIC1111/stable-diffusion-webui](https://github.com/AUTOMATIC1111/stable-diffusion-webui)
   - Install and run with API enabled: `--api` flag
   - Download at least one model (e.g., from [civitai.com](https://civitai.com/))

## 🚀 Quick Start

### 1. Clone the Repository
```bash
git clone <repository-url>
cd AIAdventure
```

### 2. Install Dependencies
```bash
pnpm install
```

### 3. Start Required Services

**Start Ollama:**
```bash
ollama serve
```

**Start Stable Diffusion WebUI:**
```bash
# Navigate to your SD WebUI directory
cd path/to/stable-diffusion-webui
start-webui-with-api.bat
```

Or manually with Python:
```bash
python launch.py --api --listen --port 7860
```

### 4. Build and Run the Game
```bash
# Build TypeScript and start development server
.\build-and-dev.ps1
```

Or manually:
```bash
# Build TypeScript
npx tsc

# Start development server
pnpm dev
```

### 5. Open the Game
Navigate to `http://localhost:8000` in your browser.

## 🎯 Gameplay

### Getting Started
1. **Configure Settings**: Click the settings button to configure Ollama and Stable Diffusion connections
2. **Start New Adventure**: Begin a new story or load a saved adventure
3. **Make Choices**: The AI will present you with story choices - click to continue
4. **Experience Scenes**: Each story moment is visualized with AI-generated images
5. **Save Progress**: Your adventure is automatically saved as you progress

### Game Features
- **Dynamic Storytelling**: Each choice affects the story direction
- **Scene Visualization**: Beautiful AI-generated images for each story moment
- **Memory System**: The AI remembers your previous choices and story context
- **Multiple Endings**: Different choices lead to different story outcomes
- **Export/Import**: Save and share your adventures

### Story Management System
- **Session Overview**: View all your saved game sessions with timestamps and step counts
- **Story Summaries**: Read AI-generated summaries of your adventures
- **Step-by-Step History**: Browse through every story step with choices and outcomes
- **Memory Management**: View, add, edit, and delete AI memories (20-memory limit with smart summarization)
- **Content Editing**: Edit story summaries and individual story steps directly
- **Session Recovery**: Load any saved session and continue playing
- **Data Export**: Backup your entire game database

## ⚙️ Configuration

### Ollama Settings
- **URL**: Default `http://localhost:11434`
- **Model**: Choose from your installed Ollama models
- **Temperature**: Controls creativity (0.0-2.0)
- **Top P**: Controls response diversity (0.0-1.0)
- **Max Tokens**: Maximum response length

### Stable Diffusion Settings
- **URL**: Default `http://127.0.0.1:7860`
- **Model**: Choose from your installed SD models
- **LORA Models**: Add custom LORA models for enhanced image generation
- **Textual Inversions**: Add embeddings for style control
- **Generation Parameters**: Width, height, steps, CFG scale, sampler

### Database Management
- **Configuration Profiles**: Save and switch between different settings
- **Story Summaries**: View and manage your adventure history
- **Export/Import**: Backup and restore your game data

### Memory Management
- **AI Memory System**: The AI maintains context through story memories
- **Memory Limit**: 20 memories with intelligent summarization when limit is exceeded
- **Manual Memory Addition**: Add custom memories during gameplay
- **Memory Editing**: View, edit, and delete individual memories
- **Smart Summarization**: Old memories are automatically summarized to preserve context
- **Session Persistence**: Memories are saved with each game session

## 🏗️ Project Structure

```
AIAdventure/
├── src/
│   ├── ts/                 # TypeScript source files
│   │   ├── config.ts       # Configuration management
│   │   ├── database.ts     # Database operations
│   │   ├── game.ts         # Core game logic
│   │   ├── ollama.ts       # Ollama API integration
│   │   ├── stable-diffusion.ts # SD API integration
│   │   ├── ui.ts           # User interface
│   │   └── types.ts        # TypeScript type definitions
│   └── js/                 # Generated JavaScript files (ignored by git)
├── index.html              # Main application entry point
├── package.json            # Project dependencies and scripts
├── tsconfig.json           # TypeScript configuration
├── build-and-dev.ps1       # PowerShell build script
└── README.md               # This file
```

## ✏️ Content Editing

### Story Summary Editor
- **Direct Editing**: Click the "✏️ Edit" button to modify story summaries
- **Real-time Updates**: Changes are saved immediately to the database
- **Session Persistence**: All edits are preserved across game sessions

### Story Step Editor
- **Step-by-Step Editing**: Edit individual story steps and their content
- **Database Integration**: All changes are automatically saved
- **Content Management**: Modify story text, choices, and outcomes

### Memory Editor
- **Memory Management**: View all AI memories in a dedicated tab
- **Manual Addition**: Add custom memories during gameplay
- **Smart Deletion**: Remove unwanted memories with database persistence
- **Context Preservation**: Memories are linked to specific story steps

## 🔧 Development

### Building the Project
```bash
# Build TypeScript only
.\build-and-dev.ps1 -BuildOnly

# Build and start development server
.\build-and-dev.ps1

# Build and start development server only
.\build-and-dev.ps1 -DevOnly
```

### Technology Stack
- **Frontend**: HTML5, CSS3 (Tailwind CSS), JavaScript (ES6+)
- **Backend**: TypeScript, Node.js
- **Database**: IndexedDB (Dexie.js)
- **AI Integration**: Ollama API, Stable Diffusion API
- **Build Tools**: TypeScript Compiler, pnpm

### Key Dependencies
- `dexie`: IndexedDB wrapper for database operations
- `typescript`: Type safety and modern JavaScript features
- `tailwindcss`: Utility-first CSS framework

### Database Schema
- **Story Summaries**: Session metadata, summaries, and timestamps
- **Story Steps**: Individual story entries with choices, outcomes, and memories
- **Configuration Profiles**: User settings and preferences
- **Memory System**: AI context memories linked to story steps

## 🐛 Troubleshooting

### Common Issues

**"Ollama connection failed"**
- Ensure Ollama is running: `ollama serve`
- Check the URL in settings (default: `http://localhost:11434`)
- Verify you have at least one model installed: `ollama list`

**"Stable Diffusion connection failed"**
- Ensure SD WebUI is running with API enabled: `--api` flag
- Check the URL in settings (default: `http://127.0.0.1:7860`)
- Verify you have at least one model loaded

**"Database not initialized"**
- Clear browser data and reload
- Check browser console for specific error messages
- Ensure IndexedDB is enabled in your browser

**"TypeScript compilation errors"**
- Run `pnpm install` to ensure all dependencies are installed
- Check `tsconfig.json` for proper configuration
- Verify TypeScript version: `npx tsc --version`

**"Memory editing not working"**
- Ensure you have a loaded game session (not just viewing in Story Management)
- Check that the game state is 'PLAYING' and has a session ID
- Verify database permissions in your browser

**"Story editing not saving"**
- Check browser console for database errors
- Ensure IndexedDB is enabled in your browser
- Try refreshing the page and editing again

### Performance Tips
- Use smaller/faster models for quicker responses
- Adjust SD generation parameters for faster image generation
- Close other resource-intensive applications
- Use SSD storage for better database performance

## 📝 License

This project is open source. See the LICENSE file for details.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit pull requests or open issues for bugs and feature requests.

## 📞 Support

If you encounter any issues or have questions:
1. Check the troubleshooting section above
2. Search existing issues on GitHub
3. Create a new issue with detailed information about your problem

---

**Happy Adventuring! 🗺️✨**
