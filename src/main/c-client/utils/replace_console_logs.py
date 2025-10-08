#!/usr/bin/env python3
"""
批量替换C端console.log为logger调用的脚本
"""
import os
import re

def replace_console_logs_in_file(file_path, module_name):
    """替换文件中的console.log为logger调用"""
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # 保存原始内容
    original_content = content
    
    # 替换console.log语句
    patterns = [
        # 匹配 console.log('🔌 [WebSocket Client] ...')
        (r"console\.log\('🔌 \[WebSocket Client\] ([^']+)'\)", r"this.logger.info('\1')"),
        (r'console\.log\("🔌 \[WebSocket Client\] ([^"]+)"\)', r'this.logger.info("\1")'),
        
        # 匹配 console.log('✅ [WebSocket Client] ...')
        (r"console\.log\('✅ \[WebSocket Client\] ([^']+)'\)", r"this.logger.info('\1')"),
        (r'console\.log\("✅ \[WebSocket Client\] ([^"]+)"\)', r'this.logger.info("\1")'),
        
        # 匹配 console.log('❌ [WebSocket Client] ...')
        (r"console\.log\('❌ \[WebSocket Client\] ([^']+)'\)", r"this.logger.error('\1')"),
        (r'console\.log\("❌ \[WebSocket Client\] ([^"]+)"\)', r'this.logger.error("\1")'),
        
        # 匹配 console.log('⚠️ [WebSocket Client] ...')
        (r"console\.log\('⚠️ \[WebSocket Client\] ([^']+)'\)", r"this.logger.warn('\1')"),
        (r'console\.log\("⚠️ \[WebSocket Client\] ([^"]+)"\)', r'this.logger.warn("\1")'),
        
        # 匹配 console.log('🔍 [WebSocket Client] ...')
        (r"console\.log\('🔍 \[WebSocket Client\] ([^']+)'\)", r"this.logger.debug('\1')"),
        (r'console\.log\("🔍 \[WebSocket Client\] ([^"]+)"\)', r'this.logger.debug("\1")'),
        
        # 匹配其他emoji前缀
        (r"console\.log\('([🚀📤📥🆕🔓🧹🏁🔧ℹ️📍🔄⏳🎯🎉💾🔐🛡️⚡🌟🔒🔑🎪🎭🎨🎬🎲🎳🎸🎺🎻🎼🎵🎶🎷🎹]) \[WebSocket Client\] ([^']+)'\)", r"this.logger.info('\2')"),
        (r'console\.log\("([🚀📤📥🆕🔓🧹🏁🔧ℹ️📍🔄⏳🎯🎉💾🔐🛡️⚡🌟🔒🔑🎪🎭🎨🎬🎲🎳🎸🎺🎻🎼🎵🎶🎷🎹]) \[WebSocket Client\] ([^"]+)"\)', r'this.logger.info("\2")'),
        
        # 匹配其他模块的console.log
        (r"console\.log\('([🚀📤📥🆕🔓🧹🏁🔧ℹ️📍🔄⏳🎯🎉💾🔐🛡️⚡🌟🔒🔑🎪🎭🎨🎬🎲🎳🎸🎺🎻🎼🎵🎶🎷🎹]) \[NodeManager\] ([^']+)'\)", r"this.logger.info('\2')"),
        (r'console\.log\("([🚀📤📥🆕🔓🧹🏁🔧ℹ️📍🔄⏳🎯🎉💾🔐🛡️⚡🌟🔒🔑🎪🎭🎨🎬🎲🎳🎸🎺🎻🎼🎵🎶🎷🎹]) \[NodeManager\] ([^"]+)"\)', r'this.logger.info("\2")'),
        
        (r"console\.log\('([🚀📤📥🆕🔓🧹🏁🔧ℹ️📍🔄⏳🎯🎉💾🔐🛡️⚡🌟🔒🔑🎪🎭🎨🎬🎲🎳🎸🎺🎻🎼🎵🎶🎷🎹]) \[TabManager\] ([^']+)'\)", r"this.logger.info('\2')"),
        (r'console\.log\("([🚀📤📥🆕🔓🧹🏁🔧ℹ️📍🔄⏳🎯🎉💾🔐🛡️⚡🌟🔒🔑🎪🎭🎨🎬🎲🎳🎸🎺🎻🎼🎵🎶🎷🎹]) \[TabManager\] ([^"]+)"\)', r'this.logger.info("\2")'),
        
        (r"console\.log\('([🚀📤📥🆕🔓🧹🏁🔧ℹ️📍🔄⏳🎯🎉💾🔐🛡️⚡🌟🔒🔑🎪🎭🎨🎬🎲🎳🎸🎺🎻🎼🎵🎶🎷🎹]) \[ViewManager\] ([^']+)'\)", r"this.logger.info('\2')"),
        (r'console\.log\("([🚀📤📥🆕🔓🧹🏁🔧ℹ️📍🔄⏳🎯🎉💾🔐🛡️⚡🌟🔒🔑🎪🎭🎨🎬🎲🎳🎸🎺🎻🎼🎵🎶🎷🎹]) \[ViewManager\] ([^"]+)"\)', r'this.logger.info("\2")'),
        
        (r"console\.log\('([🚀📤📥🆕🔓🧹🏁🔧ℹ️📍🔄⏳🎯🎉💾🔐🛡️⚡🌟🔒🔑🎪🎭🎨🎬🎲🎳🎸🎺🎻🎼🎵🎶🎷🎹]) \[HistoryManager\] ([^']+)'\)", r"this.logger.info('\2')"),
        (r'console\.log\("([🚀📤📥🆕🔓🧹🏁🔧ℹ️📍🔄⏳🎯🎉💾🔐🛡️⚡🌟🔒🔑🎪🎭🎨🎬🎲🎳🎸🎺🎻🎼🎵🎶🎷🎹]) \[HistoryManager\] ([^"]+)"\)', r'this.logger.info("\2")'),
        
        (r"console\.log\('([🚀📤📥🆕🔓🧹🏁🔧ℹ️📍🔄⏳🎯🎉💾🔐🛡️⚡🌟🔒🔑🎪🎭🎨🎬🎲🎳🎸🎺🎻🎼🎵🎶🎷🎹]) \[IPC\] ([^']+)'\)", r"this.logger.info('\2')"),
        (r'console\.log\("([🚀📤📥🆕🔓🧹🏁🔧ℹ️📍🔄⏳🎯🎉💾🔐🛡️⚡🌟🔒🔑🎪🎭🎨🎬🎲🎳🎸🎺🎻🎼🎵🎶🎷🎹]) \[IPC\] ([^"]+)"\)', r'this.logger.info("\2")'),
    ]
    
    # 应用所有替换
    for pattern, replacement in patterns:
        content = re.sub(pattern, replacement, content)
    
    # 如果内容有变化，写回文件
    if content != original_content:
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"✅ 已处理文件: {file_path}")
        return True
    else:
        print(f"ℹ️ 文件无需处理: {file_path}")
        return False

def main():
    """主函数"""
    # 处理C端主要文件
    c_client_files = [
        ('websocket/cClientWebSocketClient.js', 'websocket'),
        ('nodeManager/nodeManager.js', 'nodemanager'),
        ('window/tabManager.js', 'tabmanager'),
        ('window/viewManager.js', 'viewmanager'),
        ('history/historyManager.js', 'history'),
        ('ipc/ipcHandlers.js', 'ipc'),
        ('main.js', 'app'),
    ]
    
    for file_path, module_name in c_client_files:
        full_path = os.path.join(os.path.dirname(__file__), '..', file_path)
        if os.path.exists(full_path):
            replace_console_logs_in_file(full_path, module_name)
        else:
            print(f"⚠️ 文件不存在: {full_path}")

if __name__ == '__main__':
    main()
