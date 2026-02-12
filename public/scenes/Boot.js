// Boot Scene - 预加载角色图片和室内素材
class BootScene extends Phaser.Scene {
    constructor() {
        super({ key: 'BootScene' });
    }

    preload() {
        this.load.image('char-awen', 'assets/characters/awen.png');
        this.load.image('char-dabao', 'assets/characters/dabao.png');
        this.load.spritesheet('interiors', 'assets/modern-interiors/Interiors_free_16x16.png', {
            frameWidth: 16, frameHeight: 16
        });
        this.load.image('floorswalls', 'assets/lrk/floorswalls_LRK.png');
    }

    create() {
        this.scene.start('HomeScene');
    }
}
