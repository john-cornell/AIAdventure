export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

export interface LogEntry {
    timestamp: Date;
    level: LogLevel;
    component: string;
    message: string;
    data?: any;
}

export interface LoggerConfig {
    level: LogLevel;
    consoleOutput: boolean;
    maxEntries: number;
}

class Logger {
    private config: LoggerConfig = {
        level: 'info',
        consoleOutput: true,
        maxEntries: 1000
    };
    
    private entries: LogEntry[] = [];
    private uiElement: HTMLElement | null = null;
    
    constructor(config?: Partial<LoggerConfig>) {
        if (config) {
            this.config = { ...this.config, ...config };
        }
    }
    
    setConfig(config: Partial<LoggerConfig>): void {
        this.config = { ...this.config, ...config };
    }
    
    setUIElement(element: HTMLElement | null): void {
        this.uiElement = element;
    }
    
    private shouldLog(level: LogLevel): boolean {
        const levels: LogLevel[] = ['error', 'warn', 'info', 'debug'];
        const configLevelIndex = levels.indexOf(this.config.level);
        const messageLevelIndex = levels.indexOf(level);
        return messageLevelIndex <= configLevelIndex;
    }
    
    private addEntry(level: LogLevel, component: string, message: string, data?: any): void {
        const entry: LogEntry = {
            timestamp: new Date(),
            level,
            component,
            message,
            data
        };
        
        this.entries.push(entry);
        
        // Keep only the most recent entries
        if (this.entries.length > this.config.maxEntries) {
            this.entries = this.entries.slice(-this.config.maxEntries);
        }
        
        // Console output
        if (this.config.consoleOutput && this.shouldLog(level)) {
            const timestamp = entry.timestamp.toLocaleTimeString();
            const prefix = `[${timestamp}] [${level.toUpperCase()}] [${component}]`;
            
            switch (level) {
                case 'error':
                    console.error(prefix, message, data || '');
                    break;
                case 'warn':
                    console.warn(prefix, message, data || '');
                    break;
                case 'info':
                    console.info(prefix, message, data || '');
                    break;
                case 'debug':
                    console.log(prefix, message, data || '');
                    break;
            }
        }
        
        // Update UI if element exists
        this.updateUI();
    }
    
    private updateUI(): void {
        if (!this.uiElement) return;
        
        const recentEntries = this.entries.slice(-50); // Show last 50 entries
        const levelColors = {
            error: 'text-red-400',
            warn: 'text-yellow-400', 
            info: 'text-blue-400',
            debug: 'text-gray-400'
        };
        
        this.uiElement.innerHTML = recentEntries.map(entry => {
            const timestamp = entry.timestamp.toLocaleTimeString();
            const colorClass = levelColors[entry.level];
            const dataStr = entry.data ? ` ${JSON.stringify(entry.data)}` : '';
            
            return `
                <div class="text-xs font-mono ${colorClass}">
                    [${timestamp}] [${entry.level.toUpperCase()}] [${entry.component}] ${entry.message}${dataStr}
                </div>
            `;
        }).join('');
        
        // Auto-scroll to bottom
        this.uiElement.scrollTop = this.uiElement.scrollHeight;
    }
    
    error(component: string, message: string, data?: any): void {
        this.addEntry('error', component, message, data);
    }
    
    warn(component: string, message: string, data?: any): void {
        this.addEntry('warn', component, message, data);
    }
    
    info(component: string, message: string, data?: any): void {
        this.addEntry('info', component, message, data);
    }
    
    debug(component: string, message: string, data?: any): void {
        this.addEntry('debug', component, message, data);
    }
    
    getEntries(): LogEntry[] {
        return [...this.entries];
    }
    
    clear(): void {
        this.entries = [];
        this.updateUI();
    }
    
    getStats(): { total: number; byLevel: Record<LogLevel, number> } {
        const byLevel: Record<LogLevel, number> = {
            error: 0,
            warn: 0,
            info: 0,
            debug: 0
        };
        
        this.entries.forEach(entry => {
            byLevel[entry.level]++;
        });
        
        return {
            total: this.entries.length,
            byLevel
        };
    }

    /**
     * Export all logs to a formatted text file
     * @param includeDebug - Whether to include debug level logs
     * @returns Formatted text string with all logs
     */
    exportToText(includeDebug: boolean = false): string {
        const filteredEntries = includeDebug 
            ? this.entries 
            : this.entries.filter(entry => entry.level !== 'debug');
        
        const lines: string[] = [];
        lines.push('='.repeat(80));
        lines.push('AI ADVENTURE GAME - LOG EXPORT');
        lines.push('='.repeat(80));
        lines.push(`Export Date: ${new Date().toISOString()}`);
        lines.push(`Total Log Entries: ${this.entries.length}`);
        lines.push(`Filtered Entries: ${filteredEntries.length}`);
        lines.push('');
        
        const stats = this.getStats();
        lines.push('LOG STATISTICS:');
        lines.push(`- Errors: ${stats.byLevel.error}`);
        lines.push(`- Warnings: ${stats.byLevel.warn}`);
        lines.push(`- Info: ${stats.byLevel.info}`);
        lines.push(`- Debug: ${stats.byLevel.debug}`);
        lines.push('');
        lines.push('='.repeat(80));
        lines.push('DETAILED LOG ENTRIES:');
        lines.push('='.repeat(80));
        lines.push('');
        
        filteredEntries.forEach((entry, index) => {
            const timestamp = entry.timestamp.toISOString();
            const level = entry.level.toUpperCase().padEnd(5);
            const component = entry.component.padEnd(15);
            const dataStr = entry.data ? `\n    Data: ${JSON.stringify(entry.data, null, 2)}` : '';
            
            lines.push(`[${index + 1}] ${timestamp} [${level}] [${component}] ${entry.message}${dataStr}`);
            lines.push('');
        });
        
        return lines.join('\n');
    }

    /**
     * Download logs as a text file
     * @param includeDebug - Whether to include debug level logs
     */
    downloadLogs(includeDebug: boolean = false): void {
        const logText = this.exportToText(includeDebug);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `ai-adventure-logs-${timestamp}.txt`;
        
        const blob = new Blob([logText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}

// Create a singleton instance
export const logger = new Logger();

// Export convenience functions
export const logError = (component: string, message: string, data?: any) => logger.error(component, message, data);
export const logWarn = (component: string, message: string, data?: any) => logger.warn(component, message, data);
export const logInfo = (component: string, message: string, data?: any) => logger.info(component, message, data);
export const logDebug = (component: string, message: string, data?: any) => logger.debug(component, message, data);

// Export logger instance and utility functions
export const exportLogsToText = (includeDebug: boolean = false) => logger.exportToText(includeDebug);
export const downloadLogs = (includeDebug: boolean = false) => logger.downloadLogs(includeDebug);

// Expose to window for UI access
if (typeof window !== 'undefined') {
    (window as any).downloadLogs = downloadLogs;
    (window as any).exportLogsToText = exportLogsToText;
    
    // Add text log download function
    (window as any).downloadTextLogs = async (sessionId: string) => {
        try {
            const { exportTextLogsAsText } = await import('./database.js');
            const logText = await exportTextLogsAsText(sessionId);
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `ai-adventure-text-logs-${sessionId}-${timestamp}.txt`;
            
            const blob = new Blob([logText], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            return true;
        } catch (error) {
            console.error('Failed to download text logs:', error);
            return false;
        }
    };
}
