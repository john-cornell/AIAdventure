# AI Adventure Game 🎮

A local AI-powered text adventure game that uses Ollama for story generation and Stable Diffusion for scene visualization. Experience dynamic storytelling with AI-generated narratives and beautiful scene images.

## 🌟 Features

- **AI-Powered Storytelling**: Dynamic story generation using local LLMs via Ollama
- **Scene Visualization**: Beautiful AI-generated images for each story scene using Stable Diffusion
- **Local & Private**: Everything runs locally on your machine - no cloud dependencies
- **Persistent Game State**: Save and load your adventures
- **Multiple AI Models**: Support for various Ollama models and SD models
- **Real-time Settings**: Immediate configuration changes with auto-save
- **Database Management**: Built-in database viewer and configuration management

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
