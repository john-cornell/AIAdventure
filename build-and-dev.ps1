# AI Adventure Build and Dev Script
# This script builds the TypeScript project and starts the development server

param(
    [switch]$BuildOnly,
    [switch]$DevOnly,
    [switch]$Verbose
)

function Write-Info {
    param([string]$Message)
    Write-Host $Message -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Message)
    Write-Host $Message -ForegroundColor Green
}

function Write-Warning {
    param([string]$Message)
    Write-Host $Message -ForegroundColor Yellow
}

function Write-Error {
    param([string]$Message)
    Write-Host $Message -ForegroundColor Red
}

function Test-Prerequisites {
    Write-Info "Checking prerequisites..."
    
    # Check if Node.js is installed
    try {
        $nodeVersion = & node --version 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Success "Node.js found: $nodeVersion"
        } else {
            Write-Error "Node.js not found. Please install Node.js first."
            return $false
        }
    } catch {
        Write-Error "Node.js not found. Please install Node.js first."
        return $false
    }
    
    # Check if pnpm is installed
    try {
        $pnpmVersion = & pnpm --version 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Success "pnpm found: $pnpmVersion"
        } else {
            Write-Warning "pnpm not found. Installing pnpm..."
            & npm install -g pnpm
            if ($LASTEXITCODE -ne 0) {
                Write-Error "Failed to install pnpm"
                return $false
            }
        }
    } catch {
        Write-Warning "pnpm not found. Installing pnpm..."
        & npm install -g pnpm
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Failed to install pnpm"
            return $false
        }
    }
    
    # Check if TypeScript is available
    try {
        $tscVersion = & npx tsc --version 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Success "TypeScript found: $tscVersion"
        } else {
            Write-Warning "TypeScript not found. Installing TypeScript..."
            & pnpm install typescript
            if ($LASTEXITCODE -ne 0) {
                Write-Error "Failed to install TypeScript"
                return $false
            }
        }
    } catch {
        Write-Warning "TypeScript not found. Installing TypeScript..."
        & pnpm install typescript
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Failed to install TypeScript"
            return $false
        }
    }
    
    return $true
}

function Build-TypeScript {
    Write-Info "Building TypeScript project..."
    Write-Info "Running: npx tsc"
    
    if ($Verbose) {
        Write-Info "Verbose mode enabled - showing detailed output"
    }
    
    # Run TypeScript compilation directly (no background job needed)
    try {
        if ($Verbose) {
            $output = & npx tsc 2>&1
            $exitCode = $LASTEXITCODE
            if ($output) {
                Write-Info "TypeScript output:"
                $output | ForEach-Object { Write-Info "  $_" }
            }
        } else {
            & npx tsc
            $exitCode = $LASTEXITCODE
        }
        
        Write-Info "TypeScript compilation completed with exit code: $exitCode"
        
        if ($exitCode -eq 0) {
            Write-Success "TypeScript compilation successful!"
            return 0
        } else {
            Write-Error "TypeScript compilation failed with error code $exitCode"
            Write-Error "Please fix the compilation errors before running the dev server."
            Write-Info ""
            Write-Info "Common issues:"
            Write-Info "- Missing tsconfig.json file"
            Write-Info "- TypeScript compilation errors"
            Write-Info "- Missing dependencies"
            Write-Info "- Circular imports"
            Write-Info "- File permission issues"
            return $exitCode
        }
    } catch {
        Write-Error "Error running TypeScript compilation: $($_.Exception.Message)"
        return -1
    }
}

function Start-DevServer {
    Write-Info "Starting development server..."
    Write-Info "Running: pnpm dev"
    
    try {
        & pnpm dev
    } catch {
        Write-Error "Failed to start development server: $($_.Exception.Message)"
        return $false
    }
    
    return $true
}

# Main execution
try {
    Write-Info "=== AI Adventure Build and Dev Script ==="
    Write-Info "Current directory: $(Get-Location)"
    
    # Check prerequisites
    if (-not (Test-Prerequisites)) {
        Write-Error "Prerequisites check failed. Exiting."
        exit 1
    }
    
    # Determine what to do based on parameters
    if ($DevOnly) {
        Write-Info "Dev-only mode: Skipping build, starting dev server..."
        Start-DevServer
    } elseif ($BuildOnly) {
        Write-Info "Build-only mode: Building TypeScript project..."
        $result = Build-TypeScript
        if ($result -eq 0) {
            Write-Success "Build completed successfully!"
        } else {
            Write-Error "Build failed!"
            exit $result
        }
    } else {
        # Full build and dev
        $buildResult = Build-TypeScript
        if ($buildResult -eq 0) {
            Write-Success "Build successful! Starting dev server..."
            Start-DevServer
        } else {
            Write-Error "Build failed! Not starting dev server."
            Write-Info "Press Enter to continue..."
            Read-Host
            exit $buildResult
        }
    }
    
} catch {
    Write-Error "Unexpected error: $($_.Exception.Message)"
    Write-Error "Stack trace: $($_.ScriptStackTrace)"
    Write-Info "Press Enter to continue..."
    Read-Host
    exit 1
}
