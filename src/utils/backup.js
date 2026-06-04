/**
 * Backup and recovery utilities for settings persistence
 * Provides automatic backups, versioning, and recovery
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../bot.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../data');
const BACKUPS_DIR = path.resolve(DATA_DIR, 'backups');
const SETTINGS_FILE = path.resolve(DATA_DIR, 'settings.json');

/**
 * Initialize backup system
 */
export function initBackupSystem() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  
  if (!fs.existsSync(BACKUPS_DIR)) {
    fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  }
}

/**
 * Create automatic backup of settings
 * @returns {string} - Backup file path
 */
export function createBackup() {
  try {
    if (!fs.existsSync(SETTINGS_FILE)) {
      return null;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.resolve(BACKUPS_DIR, `settings-${timestamp}.json`);
    
    const settingsContent = fs.readFileSync(SETTINGS_FILE, 'utf8');
    fs.writeFileSync(backupFile, settingsContent, 'utf8');
    
    logger.info({ backupFile }, 'Settings backup created');
    return backupFile;
  } catch (err) {
    logger.error({ err }, 'Failed to create backup');
    return null;
  }
}

/**
 * List all available backups
 * @returns {array} - Array of backup file objects
 */
export function listBackups() {
  try {
    if (!fs.existsSync(BACKUPS_DIR)) {
      return [];
    }

    const files = fs.readdirSync(BACKUPS_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        const filePath = path.resolve(BACKUPS_DIR, f);
        const stat = fs.statSync(filePath);
        return {
          name: f,
          path: filePath,
          created: stat.birthtime,
          size: stat.size,
        };
      })
      .sort((a, b) => b.created - a.created);

    return files;
  } catch (err) {
    logger.error({ err }, 'Failed to list backups');
    return [];
  }
}

/**
 * Restore settings from a backup
 * @param {string} backupFile - Backup file path (or filename)
 * @returns {boolean} - Success status
 */
export function restoreBackup(backupFile) {
  try {
    // If only filename provided, look in backups directory
    const fullPath = backupFile.includes('/') || backupFile.includes('\\')
      ? backupFile
      : path.resolve(BACKUPS_DIR, backupFile);

    if (!fs.existsSync(fullPath)) {
      logger.warn({ backupFile }, 'Backup file not found');
      return false;
    }

    // Create backup of current settings before restore
    createBackup();

    // Restore from backup
    const backupContent = fs.readFileSync(fullPath, 'utf8');
    fs.writeFileSync(SETTINGS_FILE, backupContent, 'utf8');

    logger.info({ backupFile: fullPath }, 'Settings restored from backup');
    return true;
  } catch (err) {
    logger.error({ err, backupFile }, 'Failed to restore backup');
    return false;
  }
}

/**
 * Delete old backups (keep only N most recent)
 * @param {number} keepCount - Number of backups to keep
 * @returns {number} - Number of backups deleted
 */
export function cleanOldBackups(keepCount = 10) {
  try {
    const backups = listBackups();
    
    if (backups.length <= keepCount) {
      return 0;
    }

    const toDelete = backups.slice(keepCount);
    let deleted = 0;

    for (const backup of toDelete) {
      try {
        fs.unlinkSync(backup.path);
        deleted++;
      } catch (err) {
        logger.warn({ err, backup: backup.name }, 'Failed to delete old backup');
      }
    }

    if (deleted > 0) {
      logger.info({ deleted, total: backups.length }, 'Old backups cleaned');
    }

    return deleted;
  } catch (err) {
    logger.error({ err }, 'Failed to clean old backups');
    return 0;
  }
}

/**
 * Setup automatic backup scheduler
 * @param {number} intervalMinutes - Backup interval in minutes
 * @returns {NodeJS.Timer}
 */
export function setupAutoBackup(intervalMinutes = 60) {
  logger.info({ intervalMinutes }, 'Auto-backup enabled');

  // Create initial backup
  createBackup();

  // Schedule periodic backups
  const interval = setInterval(() => {
    createBackup();
    cleanOldBackups(10); // Keep last 10 backups
  }, intervalMinutes * 60 * 1000);

  return interval;
}

/**
 * Export settings to a portable format
 * @param {object} settings - Settings object to export
 * @returns {string} - JSON string
 */
export function exportSettings(settings) {
  return JSON.stringify(settings, null, 2);
}

/**
 * Validate backup integrity
 * @param {string} backupFile - Backup file path
 * @returns {boolean}
 */
export function validateBackupIntegrity(backupFile) {
  try {
    if (!fs.existsSync(backupFile)) {
      return false;
    }

    const content = fs.readFileSync(backupFile, 'utf8');
    const parsed = JSON.parse(content);

    // Check required fields
    const required = ['prefix', 'botName', 'ownerNumber', 'mode'];
    return required.every(key => key in parsed);
  } catch {
    return false;
  }
}

/**
 * Migration: upgrade settings from old format
 * @param {object} oldSettings - Old settings format
 * @returns {object} - Upgraded settings
 */
export function migrateSettings(oldSettings) {
  const defaults = {
    prefix: '.',
    botName: 'Yuzuki',
    ownerNumber: '',
    mode: 'public',
    antidelete: false,
    autoblock: false,
    gconly: false,
    owners: [],
    resellers: [],
    keys: [],
    cases: [],
    menuBgUrl: '',
    channelId: '',
    channelName: '',
  };

  // Merge old settings with defaults, preserving old data
  const migrated = { ...defaults, ...oldSettings };

  // Ensure arrays exist
  migrated.owners = Array.isArray(migrated.owners) ? migrated.owners : [];
  migrated.resellers = Array.isArray(migrated.resellers) ? migrated.resellers : [];
  migrated.keys = Array.isArray(migrated.keys) ? migrated.keys : [];
  migrated.cases = Array.isArray(migrated.cases) ? migrated.cases : [];

  logger.info({ version: migrated.schemaVersion }, 'Settings migrated');

  return migrated;
}

/**
 * Get backup statistics
 * @returns {object}
 */
export function getBackupStats() {
  const backups = listBackups();
  
  let totalSize = 0;
  for (const backup of backups) {
    totalSize += backup.size;
  }

  return {
    count: backups.length,
    totalSize: totalSize,
    totalSizeMB: (totalSize / 1024 / 1024).toFixed(2),
    oldest: backups.length > 0 ? backups[backups.length - 1].created : null,
    newest: backups.length > 0 ? backups[0].created : null,
  };
}
