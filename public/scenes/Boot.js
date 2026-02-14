// Boot Scene - 预加载角色图片和室内素材
class BootScene extends Phaser.Scene {
    constructor() {
        super({ key: 'BootScene' });
    }

    preload() {
        this.load.image('char-awen', 'assets/characters/awen.png');
        this.load.image('char-dabao', 'assets/characters/dabao.png');
        this.load.image('char-tudou', 'assets/characters/tudou.png');
        this.load.spritesheet('interiors', 'assets/modern-interiors/Interiors_free_16x16.png', {
            frameWidth: 16, frameHeight: 16
        });
        this.load.spritesheet('fantasy', 'assets/fantasy/fantasy-interiors.png', {
            frameWidth: 16, frameHeight: 16
        });
        this.load.spritesheet('fantasy-floor', 'assets/fantasy/fantasy-floors.png', {
            frameWidth: 16, frameHeight: 16
        });
        this.load.image('floorswalls', 'assets/lrk/floorswalls_LRK.png');
        this.load.spritesheet('park', 'assets/fantasy/fantasy-park.png', {
            frameWidth: 16, frameHeight: 16
        });
    }

    create() {
        this.scene.start('HomeScene');
    }
}
