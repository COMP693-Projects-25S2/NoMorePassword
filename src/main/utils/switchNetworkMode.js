#!/usr/bin/env node

/**
 * Network Mode Switcher for C-Client and B-Client
 * Allows easy switching between local and public IP testing modes
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..');
const C_CLIENT_CONFIG = path.join(PROJECT_ROOT, 'c-client', 'config.json');
const B_CLIENT_CONFIG = path.join(PROJECT_ROOT, 'discard-b', 'config.json');

function updateConfig(configPath, usePublicIp) {
    try {
        let config = {};

        // Load existing config if it exists
        if (fs.existsSync(configPath)) {
            const configData = fs.readFileSync(configPath, 'utf8');
            config = JSON.parse(configData);
        }

        // Ensure network section exists
        if (!config.network) {
            config.network = {};
        }

        // Update the use_public_ip setting
        config.network.use_public_ip = usePublicIp;

        // Write back to file
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

        const clientName = path.basename(path.dirname(configPath));
        const mode = usePublicIp ? 'PUBLIC IP' : 'LOCAL IP';
        console.log(`✅ ${clientName.toUpperCase()}: Switched to ${mode} mode`);

    } catch (error) {
        console.error(`❌ Error updating ${configPath}:`, error.message);
    }
}

function main() {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log(`
🌐 Network Mode Switcher for NMP System

Usage:
  node switchNetworkMode.js [local|public]

Examples:
  node switchNetworkMode.js local   # Switch to local IP testing
  node switchNetworkMode.js public  # Switch to public IP testing

Current configurations will be updated:
  - C-Client: src/main/c-client/config.json
  - B-Client: src/main/discard-b/config.json
        `);
        return;
    }

    const mode = args[0].toLowerCase();

    if (mode !== 'local' && mode !== 'public') {
        console.error('❌ Invalid mode. Use "local" or "public"');
        process.exit(1);
    }

    const usePublicIp = mode === 'public';

    console.log(`🔄 Switching to ${mode.toUpperCase()} IP mode...\n`);

    // Update both client configurations
    updateConfig(C_CLIENT_CONFIG, usePublicIp);
    updateConfig(B_CLIENT_CONFIG, usePublicIp);

    console.log(`\n🎉 Network mode switched to ${mode.toUpperCase()} IP successfully!`);
    console.log(`\n📋 Next steps:`);
    console.log(`   1. Restart C-Client and B-Client applications`);
    console.log(`   2. Test with appropriate URLs:`);
    if (usePublicIp) {
        console.log(`      - NSN: http://121.74.37.6:5000`);
        console.log(`      - Note: Ensure firewall allows port 5000`);
    } else {
        console.log(`      - NSN: http://localhost:5000 or http://127.0.0.1:5000`);
    }
}

if (require.main === module) {
    main();
}

module.exports = { updateConfig };
