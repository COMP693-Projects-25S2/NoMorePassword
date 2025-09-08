#!/usr/bin/env node

/**
 * NoMorePassword 项目初始化脚本
 * 用于检查和初始化项目环境
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🚀 NoMorePassword 项目初始化开始...\n');

// 检查 Node.js 版本
function checkNodeVersion() {
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);

    console.log(`📋 检查 Node.js 版本: ${nodeVersion}`);

    if (majorVersion < 16) {
        console.warn('⚠️  警告: 推荐使用 Node.js v16 或更高版本');
    } else {
        console.log('✅ Node.js 版本检查通过');
    }
    console.log('');
}

// 检查依赖安装
function checkDependencies() {
    console.log('📦 检查项目依赖...');

    const packageJsonPath = path.join(__dirname, 'package.json');
    const nodeModulesPath = path.join(__dirname, 'node_modules');

    if (!fs.existsSync(packageJsonPath)) {
        console.error('❌ 未找到 package.json 文件');
        process.exit(1);
    }

    if (!fs.existsSync(nodeModulesPath)) {
        console.log('📥 依赖未安装，正在安装...');
        try {
            execSync('npm install', { stdio: 'inherit' });
            console.log('✅ 依赖安装完成');
        } catch (error) {
            console.error('❌ 依赖安装失败:', error.message);
            process.exit(1);
        }
    } else {
        console.log('✅ 依赖已安装');
    }
    console.log('');
}

// 修复 Electron 原生模块问题
function fixElectronModules() {
    console.log('🔧 检查并修复 Electron 原生模块...');

    try {
        // 检查是否存在 better-sqlite3
        const betterSqlite3Path = path.join(__dirname, 'node_modules', 'better-sqlite3');
        if (fs.existsSync(betterSqlite3Path)) {
            console.log('🔄 重新编译 better-sqlite3 模块...');
            execSync('npx electron-rebuild', { stdio: 'inherit' });
            console.log('✅ Electron 原生模块修复完成');
        } else {
            console.log('ℹ️  未检测到需要重新编译的原生模块');
        }
    } catch (error) {
        console.warn('⚠️  修复原生模块时出现警告:', error.message);
        console.log('💡 如果应用启动失败，请手动运行: npx electron-rebuild');
    }
    console.log('');
}

// 检查数据库文件
function checkDatabase() {
    console.log('🗄️  检查数据库文件...');

    const dbPaths = [
        'src/main/sqlite/secure.db',
        'src/main/b-client/sqlite/b_client_secure.db'
    ];

    let allExist = true;
    dbPaths.forEach(dbPath => {
        const fullPath = path.join(__dirname, dbPath);
        if (fs.existsSync(fullPath)) {
            console.log(`✅ ${dbPath} 存在`);
        } else {
            console.log(`⚠️  ${dbPath} 不存在 (将在首次运行时创建)`);
            allExist = false;
        }
    });

    if (allExist) {
        console.log('✅ 所有数据库文件检查完成');
    } else {
        console.log('ℹ️  部分数据库文件将在首次运行时自动创建');
    }
    console.log('');
}

// 显示使用说明
function showUsage() {
    console.log('🎯 使用说明:');
    console.log('');
    console.log('启动应用:');
    console.log('  npm start                 # 启动 C-Client (默认)');
    console.log('  npm run start:c-client    # 启动 C-Client');
    console.log('  npm run start:b-client    # 启动 B-Client');
    console.log('');
    console.log('开发模式:');
    console.log('  npm run dev               # 开发模式启动');
    console.log('  npm run dev:c-client      # C-Client 开发模式');
    console.log('  npm run dev:b-client      # B-Client 开发模式');
    console.log('');
    console.log('其他命令:');
    console.log('  npm run build             # 构建应用');
    console.log('  npm run clean             # 清理构建文件');
    console.log('  npm run audit:fix         # 修复安全漏洞');
    console.log('');
    console.log('📖 更多信息请查看 README.md');
    console.log('');
}

// 主函数
function main() {
    try {
        checkNodeVersion();
        checkDependencies();
        fixElectronModules();
        checkDatabase();
        showUsage();

        console.log('🎉 项目初始化完成！');
        console.log('💡 提示: 运行 "npm start" 启动应用');

    } catch (error) {
        console.error('❌ 初始化失败:', error.message);
        process.exit(1);
    }
}

// 运行初始化
main();
