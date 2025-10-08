#!/usr/bin/env python3
"""
批量转换C端console.log为logger调用
"""
import os
import re

def convert_console_logs_to_logger(file_path, module_name):
    """将console.log转换为logger调用"""
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    original_content = content
    
    # 定义转换规则
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
        
        # 匹配 console.log('🆔 [WebSocket Client] ...')
        (r"console\.log\('🆔 \[WebSocket Client\] ([^']+)'\)", r"this.logger.info('\1')"),
        (r'console\.log\("🆔 \[WebSocket Client\] ([^"]+)"\)', r'this.logger.info("\1")'),
        
        # 匹配 console.log('👤 [WebSocket Client] ...')
        (r"console\.log\('👤 \[WebSocket Client\] ([^']+)'\)", r"this.logger.debug('\1')"),
        (r'console\.log\("👤 \[WebSocket Client\] ([^"]+)"\)', r'this.logger.debug("\1")'),
        
        # 匹配 console.log('📋 [WebSocket Client] ...')
        (r"console\.log\('📋 \[WebSocket Client\] ([^']+)'\)", r"this.logger.debug('\1')"),
        (r'console\.log\("📋 \[WebSocket Client\] ([^"]+)"\)', r'this.logger.debug("\1")'),
        
        # 匹配 console.log('📤 [WebSocket Client] ...')
        (r"console\.log\('📤 \[WebSocket Client\] ([^']+)'\)", r"this.logger.info('\1')"),
        (r'console\.log\("📤 \[WebSocket Client\] ([^"]+)"\)', r'this.logger.info("\1")'),
        
        # 匹配 console.log('🔄 [WebSocket Client] ...')
        (r"console\.log\('🔄 \[WebSocket Client\] ([^']+)'\)", r"this.logger.info('\1')"),
        (r'console\.log\("🔄 \[WebSocket Client\] ([^"]+)"\)', r'this.logger.info("\1")'),
        
        # 匹配 console.log('🔌 [WebSocket Client] ...')
        (r"console\.log\('🔌 \[WebSocket Client\] ([^']+)'\)", r"this.logger.info('\1')"),
        (r'console\.log\("🔌 \[WebSocket Client\] ([^"]+)"\)', r'this.logger.info("\1")'),
        
        # 匹配 console.log('⏳ [WebSocket Client] ...')
        (r"console\.log\('⏳ \[WebSocket Client\] ([^']+)'\)", r"this.logger.info('\1')"),
        (r'console\.log\("⏳ \[WebSocket Client\] ([^"]+)"\)', r'this.logger.info("\1")'),
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
            convert_console_logs_to_logger(full_path, module_name)
        else:
            print(f"⚠️ 文件不存在: {full_path}")

if __name__ == '__main__':
    main()
