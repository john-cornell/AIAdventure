import Dexie, { Table } from 'dexie';
import { GameConfig } from './types.js';
import { logger, logInfo, logDebug, logError } from './logger.js';
import { loadConfig as loadConfigFromSystem } from './config.js';

// Define the database schema
interface ConfigRecord {
    id?: number;
    label: string;
    config_json: string;
    created_at: Date;
    updated_at: Date;
}

interface StorySummaryRecord {
    id?: number;
    session_id: string;
    summary: string;
    step_count: number;
    last_story_entry_id: string;
    created_at: Date;
    updated_at: Date;
}

interface StoryStepRecord {
    id?: number;
    session_id: string;
    step_number: number;
    story_entry_id: string;
    choice: string;
    outcome: string;
    story_text: string;
    image_prompt: string;
    choices: string[];
    ambience_prompt: string;
    new_memories: string[];
    timestamp: number;
    image_data?: string;
}

// Extend Dexie to add our tables
class GameDatabase extends Dexie {
    configs!: Table<ConfigRecord>;
    storySummaries!: Table<StorySummaryRecord>;
    storySteps!: Table<StoryStepRecord>;

    constructor(dbName: string = 'AIAdventureDB') {
        super(dbName);
        
        this.version(1).stores({
            configs: '++id, label, created_at, updated_at'
        });
        
        this.version(2).stores({
            configs: '++id, label, created_at, updated_at',
            storySummaries: '++id, session_id, step_count, created_at, updated_at'
        });
        
        this.version(3).stores({
            configs: '++id, label, created_at, updated_at',
            storySummaries: '++id, session_id, step_count, created_at, updated_at',
            storySteps: '++id, session_id, step_number, story_entry_id, timestamp'
        });
    }
}

// Database instance (will be created with config)
let db: GameDatabase | null = null;

/**
 * Initialize the database
 */
export async function initializeDatabase(): Promise<void> {
    try {
        // Use default database name to avoid circular dependency
        const dbName = 'AIAdventureDB';
        db = new GameDatabase(dbName);
        
        logInfo('Database', `Database '${dbName}' initialized successfully (version 2)`);
        logDebug('Database', 'Database configuration:', {
            name: dbName,
            version: 2,
            maxEntries: 10000,
            autoBackup: true,
            backupInterval: 60
        });
    } catch (error) {
        logError('Database', 'Failed to initialize database', error);
        throw error;
    }
}

/**
 * Get database instance
 */
export function getDatabase(): GameDatabase {
    if (!db) {
        throw new Error('Database not initialized. Call initializeDatabase() first.');
    }
    return db;
}

/**
 * Save a configuration to the database
 */
export async function saveConfig(label: string, config: GameConfig): Promise<number> {
    try {
        const database = getDatabase();
        const configRecord: ConfigRecord = {
            label,
            config_json: JSON.stringify(config),
            created_at: new Date(),
            updated_at: new Date()
        };

        // Check if config already exists
        const existing = await database.configs.where('label').equals(label).first();
        
        if (existing) {
            // Update existing record
            await database.configs.update(existing.id!, {
                config_json: JSON.stringify(config),
                updated_at: new Date()
            });
            logInfo('Database', `Config '${label}' updated in database`);
            return existing.id!;
        } else {
            // Insert new record
            const id = await database.configs.add(configRecord);
            logInfo('Database', `Config '${label}' saved to database`);
            return id as number;
        }
        
    } catch (error) {
        logError('Database', `Failed to save config '${label}'`, error);
        throw error;
    }
}

/**
 * Load a configuration from the database by label
 */
export async function loadConfig(label: string): Promise<GameConfig | null> {
    try {
        const database = getDatabase();
        const record = await database.configs.where('label').equals(label).first();
        
        if (record) {
            const config = JSON.parse(record.config_json) as GameConfig;
            logInfo('Database', `Config '${label}' loaded from database`);
            return config;
        } else {
            logInfo('Database', `Config '${label}' not found in database`);
            return null;
        }
        
    } catch (error) {
        logError('Database', `Failed to load config '${label}'`, error);
        return null;
    }
}

/**
 * Get all configuration labels
 */
export async function getAllConfigLabels(): Promise<string[]> {
    try {
        const database = getDatabase();
        const records = await database.configs.toArray();
        const labels = records.map(record => record.label).sort();
        
        logInfo('Database', `Found ${labels.length} configs in database:`, labels);
        return labels;
        
    } catch (error) {
        logError('Database', 'Failed to get config labels', error);
        return [];
    }
}

/**
 * Delete a configuration from the database
 */
export async function deleteConfig(label: string): Promise<boolean> {
    try {
        const database = getDatabase();
        const record = await database.configs.where('label').equals(label).first();
        
        if (record) {
            await database.configs.delete(record.id!);
            logInfo('Database', `Config '${label}' deleted from database`);
            return true;
        } else {
            logInfo('Database', `Config '${label}' not found for deletion`);
            return false;
        }
        
    } catch (error) {
        logError('Database', `Failed to delete config '${label}'`, error);
        return false;
    }
}

/**
 * Check if a configuration exists
 */
export async function configExists(label: string): Promise<boolean> {
    try {
        const database = getDatabase();
        const record = await database.configs.where('label').equals(label).first();
        return !!record;
        
    } catch (error) {
        logError('Database', `Failed to check if config '${label}' exists`, error);
        return false;
    }
}

/**
 * Rename a configuration
 */
export async function renameConfig(oldLabel: string, newLabel: string): Promise<boolean> {
    try {
        const database = getDatabase();
        const record = await database.configs.where('label').equals(oldLabel).first();
        
        if (record) {
            await database.configs.update(record.id!, {
                label: newLabel,
                updated_at: new Date()
            });
            logInfo('Database', `Config '${oldLabel}' renamed to '${newLabel}'`);
            return true;
        } else {
            logInfo('Database', `Config '${oldLabel}' not found for renaming`);
            return false;
        }
        
    } catch (error) {
        logError('Database', `Failed to rename config '${oldLabel}' to '${newLabel}'`, error);
        return false;
    }
}

/**
 * Save or update a story summary
 */
export async function saveStorySummary(
    sessionId: string, 
    summary: string, 
    stepCount: number, 
    lastStoryEntryId: string
): Promise<number> {
    try {
        const database = getDatabase();
        const summaryRecord: StorySummaryRecord = {
            session_id: sessionId,
            summary,
            step_count: stepCount,
            last_story_entry_id: lastStoryEntryId,
            created_at: new Date(),
            updated_at: new Date()
        };

        // Check if summary already exists for this session
        const existing = await database.storySummaries.where('session_id').equals(sessionId).first();
        
        if (existing) {
            // Update existing record
            await database.storySummaries.update(existing.id!, {
                summary,
                step_count: stepCount,
                last_story_entry_id: lastStoryEntryId,
                updated_at: new Date()
            });
            logInfo('Database', `Story summary for session '${sessionId}' updated in database (step ${stepCount})`);
            logInfo('Database', `Summary length: ${summary.length} chars`);
            
            // Verbose logging with actual summary content
            logDebug('Database', `Story summary content for session '${sessionId}':`, {
                sessionId,
                stepCount,
                lastStoryEntryId,
                summaryLength: summary.length,
                summary: summary
            });
            
            return existing.id!;
        } else {
            // Insert new record
            const id = await database.storySummaries.add(summaryRecord);
            logInfo('Database', `Story summary for session '${sessionId}' saved to database (step ${stepCount})`);
            logInfo('Database', `Summary length: ${summary.length} chars`);
            
            // Verbose logging with actual summary content
            logDebug('Database', `Story summary content for session '${sessionId}':`, {
                sessionId,
                stepCount,
                lastStoryEntryId,
                summaryLength: summary.length,
                summary: summary
            });
            
            return id as number;
        }
        
    } catch (error) {
        logError('Database', `Failed to save story summary for session '${sessionId}'`, error);
        throw error;
    }
}

/**
 * Load a story summary from the database by session ID
 */
export async function loadStorySummary(sessionId: string): Promise<StorySummaryRecord | null> {
    try {
        const database = getDatabase();
        const record = await database.storySummaries.where('session_id').equals(sessionId).first();
        
        if (record) {
            logInfo('Database', `Story summary for session '${sessionId}' loaded from database (step ${record.step_count})`);
            logInfo('Database', `Summary length: ${record.summary.length} chars`);
            
            // Verbose logging with actual summary content
            logDebug('Database', `Loaded story summary content for session '${sessionId}':`, {
                sessionId,
                stepCount: record.step_count,
                lastStoryEntryId: record.last_story_entry_id,
                summaryLength: record.summary.length,
                summary: record.summary
            });
            
            return record;
        } else {
            logInfo('Database', `Story summary for session '${sessionId}' not found in database`);
            return null;
        }
        
    } catch (error) {
        logError('Database', `Failed to load story summary for session '${sessionId}'`, error);
        return null;
    }
}

/**
 * Get all story summary session IDs
 */
export async function getAllStorySummarySessions(): Promise<string[]> {
    try {
        const database = getDatabase();
        const records = await database.storySummaries.toArray();
        const sessionIds = records.map(record => record.session_id).sort();
        
        logInfo('Database', `Found ${sessionIds.length} story summaries in database`);
        return sessionIds;
        
    } catch (error) {
        logError('Database', 'Failed to get story summary sessions', error);
        return [];
    }
}

/**
 * Delete a story summary from the database
 */
export async function deleteStorySummary(sessionId: string): Promise<boolean> {
    try {
        const database = getDatabase();
        const record = await database.storySummaries.where('session_id').equals(sessionId).first();
        
        if (record) {
            await database.storySummaries.delete(record.id!);
            logInfo('Database', `Story summary for session '${sessionId}' deleted from database`);
            return true;
        } else {
            logInfo('Database', `Story summary for session '${sessionId}' not found for deletion`);
            return false;
        }
        
    } catch (error) {
        logError('Database', `Failed to delete story summary for session '${sessionId}'`, error);
        return false;
    }
}

/**
 * Get all database data for a specific game session
 */
export async function getGameSessionData(sessionId: string): Promise<{
    configs: ConfigRecord[];
    storySummaries: StorySummaryRecord[];
}> {
    try {
        const database = getDatabase();
        // Get all configs (since they're global)
        const configs = await database.configs.toArray();
        
        // Get story summaries for this session
        const storySummaries = await database.storySummaries.where('session_id').equals(sessionId).toArray();
        
        logInfo('Database', `Retrieved data for session ${sessionId}: ${configs.length} configs, ${storySummaries.length} story summaries`);
        
        return {
            configs,
            storySummaries
        };
    } catch (error) {
        logError('Database', `Failed to get data for session ${sessionId}`, error);
        throw error;
    }
}

/**
 * Get all database data (for debugging/overview)
 */
export async function getAllDatabaseData(): Promise<{
    configs: ConfigRecord[];
    storySummaries: StorySummaryRecord[];
}> {
    try {
        const database = getDatabase();
        const configs = await database.configs.toArray();
        const storySummaries = await database.storySummaries.toArray();
        
        logInfo('Database', `Retrieved all database data: ${configs.length} configs, ${storySummaries.length} story summaries`);
        
        return {
            configs,
            storySummaries
        };
    } catch (error) {
        logError('Database', 'Failed to get all database data', error);
        throw error;
    }
}

/**
 * Save a story step to the database
 */
export async function saveStoryStep(
    sessionId: string, 
    stepNumber: number, 
    storyEntryId: string,
    choice: string,
    outcome: string,
    storyText: string,
    imagePrompt: string,
    choices: string[],
    ambiencePrompt: string,
    newMemories: string[],
    timestamp: number,
    imageData?: string
): Promise<number> {
    try {
        const database = getDatabase();
        const stepRecord: StoryStepRecord = {
            session_id: sessionId,
            step_number: stepNumber,
            story_entry_id: storyEntryId,
            choice,
            outcome,
            story_text: storyText,
            image_prompt: imagePrompt,
            choices,
            ambience_prompt: ambiencePrompt,
            new_memories: newMemories,
            timestamp,
            image_data: imageData
        };

        const id = await database.storySteps.add(stepRecord);
        logInfo('Database', `Story step ${stepNumber} saved for session ${sessionId}`);
        return id as number;
        
    } catch (error) {
        logError('Database', `Failed to save story step ${stepNumber} for session ${sessionId}`, error);
        throw error;
    }
}

/**
 * Load all story steps for a session
 */
export async function loadStorySteps(sessionId: string): Promise<StoryStepRecord[]> {
    try {
        const database = getDatabase();
        const steps = await database.storySteps
            .where('session_id')
            .equals(sessionId)
            .toArray();
        
        // Sort by step number
        steps.sort((a, b) => a.step_number - b.step_number);
        
        logInfo('Database', `Loaded ${steps.length} story steps for session ${sessionId}`);
        return steps;
        
    } catch (error) {
        logError('Database', `Failed to load story steps for session ${sessionId}`, error);
        return [];
    }
}

/**
 * Delete all story steps for a session
 */
export async function deleteStorySteps(sessionId: string): Promise<boolean> {
    try {
        const database = getDatabase();
        const deletedCount = await database.storySteps
            .where('session_id')
            .equals(sessionId)
            .delete();
        
        logInfo('Database', `Deleted ${deletedCount} story steps for session ${sessionId}`);
        return deletedCount > 0;
        
    } catch (error) {
        logError('Database', `Failed to delete story steps for session ${sessionId}`, error);
        return false;
    }
}

/**
 * Get all sessions with story steps
 */
export async function getAllStoryStepSessions(): Promise<string[]> {
    try {
        const database = getDatabase();
        const records = await database.storySteps.toArray();
        const sessionIds = [...new Set(records.map(record => record.session_id))].sort();
        
        logInfo('Database', `Found ${sessionIds.length} sessions with story steps in database`);
        return sessionIds;
        
    } catch (error) {
        logError('Database', 'Failed to get story step sessions', error);
        return [];
    }
}

/**
 * Close the database connection
 */
export function closeDatabase(): void {
    if (db) {
        db.close();
        logInfo('Database', 'Database connection closed');
    }
}
