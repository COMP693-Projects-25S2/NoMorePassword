/**
 * Sync Notification Component
 * 显示同步数据接收提示
 */

class SyncNotification {
    constructor() {
        this.notification = null;
        this.timeoutId = null;
        this.createNotification();
    }

    /**
     * 创建通知组件
     */
    createNotification() {
        this.notification = document.createElement('div');
        this.notification.id = 'sync-notification';
        this.notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 16px 24px;
            border-radius: 12px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
            z-index: 10001;
            display: none;
            align-items: center;
            gap: 12px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 14px;
            font-weight: 500;
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.2);
            transform: translateX(100%);
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            max-width: 400px;
            word-wrap: break-word;
        `;

        // 图标
        const icon = document.createElement('div');
        icon.style.cssText = `
            font-size: 24px;
            animation: bounce 2s infinite;
        `;

        // 文本容器
        const textContainer = document.createElement('div');
        textContainer.style.cssText = `
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 4px;
        `;

        const title = document.createElement('div');
        title.id = 'sync-notification-title';
        title.style.cssText = `
            font-weight: 600;
            font-size: 15px;
        `;

        const message = document.createElement('div');
        message.id = 'sync-notification-message';
        message.style.cssText = `
            font-size: 13px;
            opacity: 0.9;
        `;

        textContainer.appendChild(title);
        textContainer.appendChild(message);

        this.notification.appendChild(icon);
        this.notification.appendChild(textContainer);

        // 添加到页面
        document.body.appendChild(this.notification);

        // 添加CSS动画
        this.addAnimations();
    }

    /**
     * 添加CSS动画
     */
    addAnimations() {
        const style = document.createElement('style');
        style.textContent = `
            @keyframes bounce {
                0%, 20%, 50%, 80%, 100% {
                    transform: translateY(0);
                }
                40% {
                    transform: translateY(-10px);
                }
                60% {
                    transform: translateY(-5px);
                }
            }

            @keyframes slideIn {
                from {
                    transform: translateX(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }

            @keyframes slideOut {
                from {
                    transform: translateX(0);
                    opacity: 1;
                }
                to {
                    transform: translateX(100%);
                    opacity: 0;
                }
            }

            .sync-notification-show {
                animation: slideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards;
            }

            .sync-notification-hide {
                animation: slideOut 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards;
            }
        `;
        document.head.appendChild(style);
    }

    /**
     * 显示同步接收通知
     * @param {string} username - 发送方用户名
     * @param {number} activitiesCount - 活动数量
     * @param {number} duration - 显示时长（毫秒），默认3000ms
     */
    show(username, activitiesCount = 0, duration = 3000) {
        // 清除之前的定时器
        if (this.timeoutId) {
            clearTimeout(this.timeoutId);
            this.timeoutId = null;
        }

        // 更新内容
        const icon = this.notification.querySelector('div');
        const title = document.getElementById('sync-notification-title');
        const message = document.getElementById('sync-notification-message');

        if (icon && title && message) {
            icon.textContent = '📥';
            title.textContent = 'Sync Data Received';

            if (activitiesCount > 0) {
                message.textContent = `Received sync data from ${username} (${activitiesCount} activities)`;
            } else {
                message.textContent = `Received sync data from ${username}`;
            }
        }

        // 显示通知
        this.notification.style.display = 'flex';
        this.notification.classList.remove('sync-notification-hide');
        this.notification.classList.add('sync-notification-show');

        // 设置自动隐藏
        this.timeoutId = setTimeout(() => {
            this.hide();
        }, duration);
    }

    /**
     * 显示同步发送通知
     * @param {number} activitiesCount - 活动数量
     * @param {number} duration - 显示时长（毫秒），默认2000ms
     */
    showSent(activitiesCount = 0, duration = 2000) {
        // 清除之前的定时器
        if (this.timeoutId) {
            clearTimeout(this.timeoutId);
            this.timeoutId = null;
        }

        // 更新内容
        const icon = this.notification.querySelector('div');
        const title = document.getElementById('sync-notification-title');
        const message = document.getElementById('sync-notification-message');

        if (icon && title && message) {
            icon.textContent = '📤';
            title.textContent = 'Sync Data Sent';

            if (activitiesCount > 0) {
                message.textContent = `Sent ${activitiesCount} activities to other clients`;
            } else {
                message.textContent = 'Sync data sent to other clients';
            }
        }

        // 显示通知
        this.notification.style.display = 'flex';
        this.notification.classList.remove('sync-notification-hide');
        this.notification.classList.add('sync-notification-show');

        // 设置自动隐藏
        this.timeoutId = setTimeout(() => {
            this.hide();
        }, duration);
    }

    /**
     * 显示错误通知
     * @param {string} errorMessage - 错误消息
     * @param {number} duration - 显示时长（毫秒），默认4000ms
     */
    showError(errorMessage, duration = 4000) {
        // 清除之前的定时器
        if (this.timeoutId) {
            clearTimeout(this.timeoutId);
            this.timeoutId = null;
        }

        // 更新内容和样式
        const icon = this.notification.querySelector('div');
        const title = document.getElementById('sync-notification-title');
        const message = document.getElementById('sync-notification-message');

        if (icon && title && message) {
            icon.textContent = '❌';
            title.textContent = 'Sync Error';
            message.textContent = errorMessage;
        }

        // 更改样式为错误样式
        this.notification.style.background = 'linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%)';

        // 显示通知
        this.notification.style.display = 'flex';
        this.notification.classList.remove('sync-notification-hide');
        this.notification.classList.add('sync-notification-show');

        // 设置自动隐藏
        this.timeoutId = setTimeout(() => {
            this.hide();
            // 恢复默认样式
            this.notification.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
        }, duration);
    }

    /**
     * 隐藏通知
     */
    hide() {
        if (this.notification) {
            this.notification.classList.remove('sync-notification-show');
            this.notification.classList.add('sync-notification-hide');

            setTimeout(() => {
                this.notification.style.display = 'none';
                this.notification.classList.remove('sync-notification-hide');
            }, 300);
        }

        if (this.timeoutId) {
            clearTimeout(this.timeoutId);
            this.timeoutId = null;
        }
    }

    /**
     * 手动点击关闭
     */
    addCloseOnClick() {
        this.notification.addEventListener('click', () => {
            this.hide();
        });
    }
}

// 全局实例
window.syncNotification = new SyncNotification();

module.exports = SyncNotification;
