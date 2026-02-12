// ============================================
// UI Scene - HUD overlay helpers
// (Runs alongside HomeScene for panel interactions)
// ============================================

// This file provides utility functions used by game.js
// for emotion display, panel drag, and keyboard shortcuts.

// === Draggable Panels ===
(function initDraggablePanels() {
    document.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('.panel-header').forEach(header => {
            const panel = header.parentElement;
            let isDragging = false;
            let offsetX = 0, offsetY = 0;

            header.addEventListener('mousedown', (e) => {
                if (e.target.tagName === 'BUTTON') return;
                isDragging = true;
                const rect = panel.getBoundingClientRect();
                offsetX = e.clientX - rect.left;
                offsetY = e.clientY - rect.top;
                panel.style.transition = 'none';
            });

            document.addEventListener('mousemove', (e) => {
                if (!isDragging) return;
                panel.style.left = (e.clientX - offsetX) + 'px';
                panel.style.top = (e.clientY - offsetY) + 'px';
                panel.style.right = 'auto';
                panel.style.bottom = 'auto';
                panel.style.transform = 'none';
            });

            document.addEventListener('mouseup', () => {
                isDragging = false;
                panel.style.transition = '';
            });
        });
    });
})();

// === Emotion Display Helper ===
function updateEmotionDisplay(data) {
    if (!data) return;

    // Update emotion icons on character sprites
    const homeScene = game.scene.getScene('HomeScene');
    if (!homeScene) return;

    const awenChar = homeScene.characters && homeScene.characters['awen'];
    if (awenChar && awenChar.emotIcon) {
        // Pick dominant emotion color
        const emotionColors = {
            calm: 0x88aacc,
            happiness: 0x88cc88,
            excitement: 0xcccc44,
            sadness: 0x6688aa,
            nervousness: 0xaa88cc,
            irritation: 0xcc8844,
            heartache: 0xcc6688,
            anger: 0xcc4444
        };

        let maxVal = 0;
        let maxKey = 'calm';
        for (const [key, color] of Object.entries(emotionColors)) {
            if (data[key] && data[key] > maxVal) {
                maxVal = data[key];
                maxKey = key;
            }
        }
        awenChar.emotIcon.setFillStyle(emotionColors[maxKey]);
    }

    // If char panel is open for awen, update it
    const panel = document.getElementById('char-panel');
    const panelName = document.getElementById('panel-name');
    if (panel && !panel.classList.contains('hidden') && panelName && panelName.textContent === '阿文') {
        const emotionBars = document.getElementById('emotion-bars');
        const towardDisplay = document.getElementById('toward-display');
        if (emotionBars && homeScene.renderEmotionBars) {
            homeScene.renderEmotionBars(emotionBars, data);
        }
        if (towardDisplay) {
            towardDisplay.textContent = `态度: ${data.toward || '亲近'}`;
        }
    }
}

// === Keyboard Shortcuts ===
document.addEventListener('keydown', (e) => {
    // ESC to close panels
    if (e.key === 'Escape') {
        document.querySelectorAll('.panel:not(#chat-panel)').forEach(p => {
            p.classList.add('hidden');
        });
    }

    // Enter to focus chat input
    if (e.key === 'Enter' && document.activeElement.tagName !== 'INPUT') {
        const input = document.getElementById('chat-input');
        if (input) input.focus();
    }
});
