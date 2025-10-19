#!/usr/bin/env node

/**
 * Full-featured desktop build script for C-Client
 * This script creates a complete desktop application with better-sqlite3 encryption
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Starting full-featured C-Client desktop build...');

try {
    // Step 1: Clean previous builds
    console.log('🧹 Cleaning previous builds...');
    const distDir = 'dist-desktop-full-v2';
    if (fs.existsSync(distDir)) {
        try {
            fs.rmSync(distDir, { recursive: true, force: true });
        } catch (error) {
            console.log('⚠️ Some files may be in use, continuing...');
        }
    }

    // Step 2: Create dist directory
    fs.mkdirSync(distDir, { recursive: true });

    // Step 3: Copy C-Client files
    console.log('📁 Copying C-Client files...');
    const cClientDir = 'src/main/c-client';

    if (fs.existsSync(cClientDir)) {
        // Copy all files recursively
        function copyDir(src, dest) {
            const entries = fs.readdirSync(src, { withFileTypes: true });

            for (const entry of entries) {
                const srcPath = path.join(src, entry.name);
                const destPath = path.join(dest, entry.name);

                if (entry.isDirectory()) {
                    fs.mkdirSync(destPath, { recursive: true });
                    copyDir(srcPath, destPath);
                } else {
                    fs.copyFileSync(srcPath, destPath);
                }
            }
        }

        copyDir(cClientDir, distDir);
        console.log('✅ C-Client files copied successfully');
    }

    // Step 4: Copy shared files
    console.log('📁 Copying shared files...');
    const sharedDir = 'src/main/shared';
    const utilsDir = 'src/main/utils';

    if (fs.existsSync(sharedDir)) {
        const distSharedDir = path.join(distDir, 'shared');
        fs.mkdirSync(distSharedDir, { recursive: true });
        copyDir(sharedDir, distSharedDir);
    }

    if (fs.existsSync(utilsDir)) {
        const distUtilsDir = path.join(distDir, 'utils');
        fs.mkdirSync(distUtilsDir, { recursive: true });
        copyDir(utilsDir, distUtilsDir);
    }

    // Step 5: Create package.json with full dependencies
    const packageJson = {
        "name": "nmp-c-client-desktop-full",
        "version": "1.0.0",
        "main": "main.js",
        "description": "NMP C-Client Desktop Application (Full Features)",
        "author": "NMP Team",
        "license": "MIT",
        "scripts": {
            "start": "electron .",
            "build": "electron-builder",
            "dist": "electron-builder"
        },
        "dependencies": {
            "axios": "^1.6.0",
            "better-sqlite3": "^12.2.0",
            "cors": "^2.8.5",
            "express": "^4.18.2",
            "uuid": "^10.0.0",
            "ws": "^8.14.2"
        },
        "devDependencies": {
            "electron": "^37.3.1",
            "electron-builder": "^24.6.4"
        },
        "build": {
            "appId": "com.nmp.no-more-password",
            "productName": "No More Password",
            "directories": {
                "output": "dist"
            },
            "files": [
                "**/*",
                "!node_modules/**/*",
                "node_modules/**/*"
            ],
            "asarUnpack": [
                "node_modules/better-sqlite3/**/*",
                "node_modules/sqlite3/**/*"
            ],
            "win": {
                "target": "nsis",
                "icon": "assets/icon.ico"
            },
            "nsis": {
                "oneClick": false,
                "allowToChangeInstallationDirectory": true,
                "createDesktopShortcut": true,
                "createStartMenuShortcut": true,
                "language": "1033",
                "installerLanguages": ["en_US"],
                "displayLanguageSelector": false
            }
        }
    };

    fs.writeFileSync(path.join(distDir, 'package.json'), JSON.stringify(packageJson, null, 2));

    // Step 5.5: Fix module paths in main.js
    console.log('🔧 Fixing module paths...');
    const mainJsPath = path.join(distDir, 'main.js');
    if (fs.existsSync(mainJsPath)) {
        let mainJsContent = fs.readFileSync(mainJsPath, 'utf8');

        // Fix shared module paths
        mainJsContent = mainJsContent.replace(
            /require\('\.\.\/shared\//g,
            "require('./shared/"
        );

        // Fix utils module paths
        mainJsContent = mainJsContent.replace(
            /require\('\.\.\/utils\//g,
            "require('./utils/"
        );

        fs.writeFileSync(mainJsPath, mainJsContent);
        console.log('✅ Module paths fixed in main.js');
    }

    // Step 6: Install dependencies
    console.log('📦 Installing dependencies...');
    process.chdir(distDir);

    // Install dependencies with VS tools support
    execSync('npm install', { stdio: 'inherit' });

    console.log('✅ Dependencies installed successfully');

    // Step 7: Build the application
    console.log('🔨 Building desktop application...');
    execSync('npm run build', { stdio: 'inherit' });

    console.log('✅ Full-featured desktop build completed successfully!');
    console.log('📁 Output directory: dist-desktop-full-v2/dist/');
    console.log('🚀 Installer: dist-desktop-full-v2/dist/No More Password Setup 1.0.0.exe');
    console.log('🚀 Executable: dist-desktop-full-v2/dist/win-unpacked/No More Password.exe');

} catch (error) {
    console.error('❌ Build failed:', error.message);
    process.exit(1);
}
