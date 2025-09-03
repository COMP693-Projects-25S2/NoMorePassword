const fs = require('fs');
const path = require('path');

class FileUtils {
    /**
     * Save JSON data to file
     * @param {string} filePath File path
     * @param {any} data Data to save
     * @returns {boolean} Whether save was successful
     */
    static saveJson(filePath, data) {
        try {
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
            return true;
        } catch (error) {
            console.error('Failed to save JSON:', error);
            return false;
        }
    }

    /**
     * Load JSON data from file
     * @param {string} filePath File path
     * @param {any} defaultValue Default value
     * @returns {any} Loaded data or default value
     */
    static loadJson(filePath, defaultValue = []) {
        try {
            if (fs.existsSync(filePath)) {
                const data = fs.readFileSync(filePath, 'utf8');
                return JSON.parse(data);
            }
        } catch (error) {
            console.error('Failed to load JSON:', error);
        }
        return defaultValue;
    }

    /**
     * Ensure directory exists
     * @param {string} dirPath Directory path
     */
    static ensureDir(dirPath) {
        try {
            if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath, { recursive: true });
            }
        } catch (error) {
            console.error('Failed to create directory:', error);
        }
    }

    /**
     * Get application root directory path
     * @returns {string} Application root directory path
     */
    static getAppRoot() {
        return path.join(__dirname, '../../../');
    }
}

module.exports = FileUtils;