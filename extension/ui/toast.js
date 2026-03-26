// ====================================================================================================
// HMToast: User Notification System
// ====================================================================================================

var HMToast = {
    container: null,
    queue: [],
    isInitialized: false,
    
    init: function() {
        if(this.isInitialized) return;
        
        // Create container
        this.container = document.createElement("div");
        this.container.id = "hm-toast-container";
        this.container.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 999999;
            pointer-events: none;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        `;
        
        document.body.appendChild(this.container);
        
        // Add CSS animations
        if(!document.getElementById("hm-toast-styles")) {
            var style = document.createElement('style');
            style.id = "hm-toast-styles";
            style.textContent = `
                @keyframes hmSlideIn {
                    from {
                        transform: translateX(400px);
                        opacity: 0;
                    }
                    to {
                        transform: translateX(0);
                        opacity: 1;
                    }
                }
                @keyframes hmSlideOut {
                    from {
                        transform: translateX(0);
                        opacity: 1;
                    }
                    to {
                        transform: translateX(400px);
                        opacity: 0;
                    }
                }
                .hm-toast {
                    pointer-events: auto;
                    cursor: pointer;
                }
                .hm-toast:hover {
                    opacity: 0.9;
                }
            `;
            document.head.appendChild(style);
        }
        
        this.isInitialized = true;
    },
    
    show: function(msg, type, duration) {
        this.init();
        
        var colors = {
            success: '#4caf50',
            error: '#f44336',
            warn: '#ff9800',
            info: '#2196f3'
        };
        
        var icons = {
            success: '✓',
            error: '✗',
            warn: '⚠',
            info: 'ℹ'
        };
        
        var toast = document.createElement("div");
        toast.className = `hm-toast hm-toast-${type}`;
        toast.style.cssText = `
            padding: 12px 20px;
            margin-bottom: 10px;
            border-radius: 6px;
            background: ${colors[type] || '#333'};
            color: #fff;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            animation: hmSlideIn 0.3s ease-out;
            font-size: 14px;
            max-width: 300px;
            word-wrap: break-word;
            display: flex;
            align-items: center;
            gap: 8px;
        `;
        
        toast.innerHTML = `
            <span style="font-size: 16px;">${icons[type] || ''}</span>
            <span>${msg}</span>
        `;
        
        // Click to dismiss
        toast.onclick = function() {
            toast.style.animation = 'hmSlideOut 0.3s ease-out';
            setTimeout(() => toast.remove(), 300);
        };
        
        this.container.appendChild(toast);
        
        // Auto-dismiss
        setTimeout(() => {
            if(toast.parentNode) {
                toast.style.animation = 'hmSlideOut 0.3s ease-out';
                setTimeout(() => toast.remove(), 300);
            }
        }, duration || 3000);
    },
    
    success: function(msg, duration) {
        this.show(msg, 'success', duration);
    },
    
    error: function(msg, duration) {
        this.show(msg, 'error', duration || 4000);
    },
    
    warn: function(msg, duration) {
        this.show(msg, 'warn', duration);
    },
    
    info: function(msg, duration) {
        this.show(msg, 'info', duration);
    },
    
    // Clear all toasts
    clearAll: function() {
        if(this.container) {
            this.container.innerHTML = '';
        }
    }
};

// Auto-initialize on first use
if(typeof HMLogger !== "undefined") {
    HMLogger.debug("Toast system ready");
}
