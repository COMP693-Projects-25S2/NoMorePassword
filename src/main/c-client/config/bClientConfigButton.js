const { ipcRenderer } = require('electron');

class BClientConfigButton {
    constructor() {
        this.button = null;
        this.isVisible = false;
    }

    createButton() {
        // Create configuration button
        this.button = document.createElement('button');
        this.button.id = 'b-client-config-btn';
        this.button.innerHTML = '⚙️ B-Client Config';
        this.button.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            z-index: 10000;
            background: #007AFF;
            color: white;
            border: none;
            border-radius: 6px;
            padding: 8px 16px;
            font-size: 12px;
            font-weight: 500;
            cursor: pointer;
            box-shadow: 0 2px 8px rgba(0,0,0,0.15);
            transition: all 0.2s ease;
        `;

        // Add hover effects
        this.button.addEventListener('mouseenter', () => {
            this.button.style.background = '#0056CC';
            this.button.style.transform = 'translateY(-1px)';
        });

        this.button.addEventListener('mouseleave', () => {
            this.button.style.background = '#007AFF';
            this.button.style.transform = 'translateY(0)';
        });

        // Add click handler
        this.button.addEventListener('click', () => {
            this.showConfigModal();
        });

        return this.button;
    }

    show() {
        if (!this.button) {
            this.createButton();
        }

        if (!this.isVisible) {
            document.body.appendChild(this.button);
            this.isVisible = true;
        }
    }

    hide() {
        if (this.button && this.isVisible) {
            document.body.removeChild(this.button);
            this.isVisible = false;
        }
    }

    async showConfigModal() {
        try {
            await ipcRenderer.invoke('show-b-client-config');
        } catch (error) {
            console.error('Error showing B-Client configuration:', error);
        }
    }

    // Method to add button to existing UI elements
    addToContainer(containerSelector) {
        const container = document.querySelector(containerSelector);
        if (container) {
            if (!this.button) {
                this.createButton();
            }
            container.appendChild(this.button);
            this.isVisible = true;
        }
    }

    // Method to add button to toolbar or header
    addToToolbar() {
        // Look for common toolbar/header selectors
        const selectors = [
            '.toolbar',
            '.header',
            '.nav',
            '.menu-bar',
            '[role="toolbar"]',
            '.app-header'
        ];

        for (const selector of selectors) {
            const container = document.querySelector(selector);
            if (container) {
                this.addToContainer(selector);
                return true;
            }
        }

        // If no toolbar found, add as floating button
        this.show();
        return false;
    }
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        const configButton = new BClientConfigButton();
        configButton.addToToolbar();
    });
} else {
    const configButton = new BClientConfigButton();
    configButton.addToToolbar();
}

module.exports = BClientConfigButton;
