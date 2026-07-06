import Phaser from "phaser";
import {
  PLATFORMS,
  WORLD,
  type PlayerInput,
  type PlayerSnapshot,
  type ProjectileSnapshot,
  type RoomSnapshot,
} from "@arena/shared";

interface PlayerView {
  container: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Rectangle;
  head: Phaser.GameObjects.Arc;
  gun: Phaser.GameObjects.Rectangle;
  muzzle: Phaser.GameObjects.Arc;
  jetFlame: Phaser.GameObjects.Triangle;
  label: Phaser.GameObjects.Text;
  healthBack: Phaser.GameObjects.Rectangle;
  healthFill: Phaser.GameObjects.Rectangle;
  targetX: number;
  targetY: number;
}

export class ArenaScene extends Phaser.Scene {
  private snapshot: RoomSnapshot | null = null;
  private localPlayerId: string | null = null;
  private readonly playerViews = new Map<string, PlayerView>();
  private readonly projectileViews = new Map<number, Phaser.GameObjects.Arc>();
  private keys!: Record<"left" | "right" | "jetpack" | "reload", Phaser.Input.Keyboard.Key>;
  private timerText!: Phaser.GameObjects.Text;
  private scoreText!: Phaser.GameObjects.Text;
  private centerText!: Phaser.GameObjects.Text;
  private helpText!: Phaser.GameObjects.Text;
  private lastInputSentAt = 0;
  private sequence = 0;
  private lastAim = { x: 1, y: 0 };
  private lastAmmo = new Map<string, number>();

  constructor(private readonly sendInput: (input: PlayerInput) => void) {
    super("arena");
  }

  setNetworkState(snapshot: RoomSnapshot, localPlayerId: string | null): void {
    this.snapshot = snapshot;
    this.localPlayerId = localPlayerId;
  }

  create(): void {
    this.cameras.main.setBackgroundColor("#0b1b2a");
    this.drawBackdrop();
    this.drawPlatforms();

    this.keys = this.input.keyboard!.addKeys({
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
      jetpack: Phaser.Input.Keyboard.KeyCodes.SPACE,
      reload: Phaser.Input.Keyboard.KeyCodes.R,
    }) as typeof this.keys;

    this.timerText = this.add.text(WORLD.width / 2, 28, "05:00", textStyle(34)).setOrigin(0.5, 0).setDepth(20);
    this.scoreText = this.add.text(WORLD.width / 2, 76, "0  —  0", textStyle(25, "#bfd6e5")).setOrigin(0.5, 0).setDepth(20);
    this.centerText = this.add
      .text(WORLD.width / 2, WORLD.height / 2 - 40, "", textStyle(92, "#ffffff"))
      .setOrigin(0.5)
      .setDepth(20)
      .setShadow(0, 6, "#000000", 12, true, true);
    this.helpText = this.add
      .text(24, WORLD.height - 22, "Connect an Xbox controller · Keyboard fallback: A/D + Space + Mouse + R", textStyle(17, "#91a9b9"))
      .setOrigin(0, 1)
      .setDepth(20);

    this.input.mouse?.disableContextMenu();
  }

  update(time: number): void {
    if (!this.snapshot) return;
    this.renderSnapshot(this.snapshot);
    if (this.snapshot.phase === "playing" && time - this.lastInputSentAt >= 1000 / 30) {
      this.sendInput(this.readInput());
      this.lastInputSentAt = time;
    }
  }

  private readInput(): PlayerInput {
    const pads = navigator.getGamepads?.() ?? [];
    const gamepad = [...pads].find((pad) => pad?.connected && pad.mapping === "standard") ?? [...pads].find(Boolean);
    let moveX = 0;
    let jetpack = false;
    let firing = false;
    let reload = false;

    if (gamepad) {
      moveX = deadZone(gamepad.axes[0] ?? 0, 0.16);
      const aimX = deadZone(gamepad.axes[2] ?? 0, 0.2);
      const aimY = deadZone(gamepad.axes[3] ?? 0, 0.2);
      if (Math.hypot(aimX, aimY) > 0.2) this.lastAim = normalize(aimX, aimY);
      jetpack = gamepad.buttons[0]?.pressed ?? false;
      reload = gamepad.buttons[2]?.pressed ?? false;
      firing = (gamepad.buttons[7]?.value ?? 0) > 0.18;
      this.helpText.setText(`Xbox controller: ${gamepad.id.replace(/\s*\([^)]*\)/g, "").slice(0, 44)}`);
      this.helpText.setColor("#4de2c5");
    } else {
      moveX = (this.keys.left.isDown ? -1 : 0) + (this.keys.right.isDown ? 1 : 0);
      jetpack = this.keys.jetpack.isDown;
      reload = this.keys.reload.isDown;
      firing = this.input.activePointer.isDown;
      const local = this.snapshot?.players.find((player) => player.id === this.localPlayerId);
      if (local) {
        const pointer = this.input.activePointer;
        const deltaX = pointer.worldX - local.x;
        const deltaY = pointer.worldY - local.y;
        if (Math.hypot(deltaX, deltaY) > 5) this.lastAim = normalize(deltaX, deltaY);
      }
      this.helpText.setText("No Xbox controller · Keyboard fallback: A/D + Space + Mouse + R");
      this.helpText.setColor("#91a9b9");
    }

    return {
      sequence: ++this.sequence,
      moveX,
      jetpack,
      aimX: this.lastAim.x,
      aimY: this.lastAim.y,
      firing,
      reload,
    };
  }

  private renderSnapshot(snapshot: RoomSnapshot): void {
    const seconds = Math.max(0, Math.ceil(snapshot.remainingMs / 1000));
    this.timerText.setText(`${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`);
    const sorted = [...snapshot.players].sort((a, b) => a.slot - b.slot);
    this.scoreText.setText(sorted.map((player) => `${player.name}  ${player.kills}`).join("     —     "));

    if (snapshot.phase === "countdown") {
      this.centerText.setFontSize(92);
      this.centerText.setText(String(Math.max(1, Math.ceil(snapshot.countdownMs / 1000))));
    } else if (snapshot.phase === "playing") {
      this.centerText.setText("");
    } else {
      this.centerText.setText(snapshot.players.length < 2 ? "WAITING FOR RIVAL" : "");
      this.centerText.setFontSize(54);
    }

    for (const player of snapshot.players) this.renderPlayer(player);
    for (const [id, view] of this.playerViews) {
      if (!snapshot.players.some((player) => player.id === id)) {
        view.container.destroy(true);
        view.gun.destroy();
        view.muzzle.destroy();
        view.label.destroy();
        view.healthBack.destroy();
        view.healthFill.destroy();
        this.playerViews.delete(id);
      }
    }

    for (const projectile of snapshot.projectiles) this.renderProjectile(projectile);
    for (const [id, view] of this.projectileViews) {
      if (!snapshot.projectiles.some((projectile) => projectile.id === id)) {
        view.destroy();
        this.projectileViews.delete(id);
      }
    }
  }

  private renderPlayer(player: PlayerSnapshot): void {
    let view = this.playerViews.get(player.id);
    if (!view) {
      view = this.createPlayerView(player);
      this.playerViews.set(player.id, view);
    }

    view.targetX = player.x;
    view.targetY = player.y;
    const smoothing = player.id === this.localPlayerId ? 0.5 : 0.3;
    view.container.x = Phaser.Math.Linear(view.container.x, view.targetX, smoothing);
    view.container.y = Phaser.Math.Linear(view.container.y, view.targetY, smoothing);
    const x = view.container.x;
    const y = view.container.y;
    const angle = Math.atan2(player.aimY, player.aimX);
    view.gun.setPosition(x + player.aimX * 20, y - 4 + player.aimY * 10).setRotation(angle);
    view.muzzle.setPosition(x + player.aimX * 48, y - 4 + player.aimY * 28);
    view.label.setPosition(x, y - 57);
    view.healthBack.setPosition(x, y - 42);
    view.healthFill.setPosition(x - 27, y - 42).setDisplaySize(54 * (player.health / 100), 5);
    view.container.setVisible(player.alive);
    view.gun.setVisible(player.alive);
    view.label.setVisible(player.alive);
    view.healthBack.setVisible(player.alive);
    view.healthFill.setVisible(player.alive);
    view.jetFlame.setVisible(player.alive && player.vy < 40 && player.fuel < 99);
    view.container.setAlpha(player.invulnerableMs > 0 && Math.floor(player.invulnerableMs / 100) % 2 === 0 ? 0.35 : 1);

    const previousAmmo = this.lastAmmo.get(player.id) ?? player.ammo;
    view.muzzle.setVisible(player.alive && player.ammo < previousAmmo);
    this.lastAmmo.set(player.id, player.ammo);

    if (!player.alive) {
      view.label.setVisible(true).setText(`RESPAWN ${Math.ceil(player.respawnMs / 1000)}`).setPosition(player.x, player.y - 10);
    } else {
      view.label.setText(player.id === this.localPlayerId ? `${player.name} · YOU` : player.name);
    }
  }

  private createPlayerView(player: PlayerSnapshot): PlayerView {
    const color = player.slot === 0 ? 0x42d7e8 : 0xffa84a;
    const dark = player.slot === 0 ? 0x176d86 : 0xa95824;
    const jetFlame = this.add.triangle(-14, 31, -7, 0, 7, 0, 0, 32, 0xffc857).setOrigin(0.5, 0);
    const backpack = this.add.rectangle(-15, 6, 12, 31, dark).setStrokeStyle(2, 0x07111f);
    const body = this.add.rectangle(0, 7, 32, 39, color).setStrokeStyle(3, 0x07111f);
    const head = this.add.circle(2, -19, 13, 0xf1bd87).setStrokeStyle(3, 0x07111f);
    const visor = this.add.rectangle(7, -20, 13, 6, 0x102f45).setStrokeStyle(1, 0x6be4ef);
    const legLeft = this.add.rectangle(-9, 29, 10, 20, dark).setStrokeStyle(2, 0x07111f);
    const legRight = this.add.rectangle(9, 29, 10, 20, dark).setStrokeStyle(2, 0x07111f);
    const container = this.add.container(player.x, player.y, [jetFlame, backpack, legLeft, legRight, body, head, visor]).setDepth(8);
    const gun = this.add.rectangle(player.x, player.y, 52, 10, 0x233b4c).setOrigin(0.22, 0.5).setStrokeStyle(2, 0x07111f).setDepth(9);
    const muzzle = this.add.circle(player.x, player.y, 8, 0xffe479).setDepth(7).setVisible(false);
    const label = this.add.text(player.x, player.y - 57, player.name, textStyle(16)).setOrigin(0.5, 1).setDepth(12);
    const healthBack = this.add.rectangle(player.x, player.y - 42, 58, 9, 0x07111f).setDepth(11);
    const healthFill = this.add.rectangle(player.x - 27, player.y - 42, 54, 5, color).setOrigin(0, 0.5).setDepth(12);
    return { container, body, head, gun, muzzle, jetFlame, label, healthBack, healthFill, targetX: player.x, targetY: player.y };
  }

  private renderProjectile(projectile: ProjectileSnapshot): void {
    let view = this.projectileViews.get(projectile.id);
    if (!view) {
      view = this.add.circle(projectile.x, projectile.y, 4, 0xffe47a).setDepth(6);
      this.projectileViews.set(projectile.id, view);
    }
    view.setPosition(projectile.x, projectile.y);
  }

  private drawBackdrop(): void {
    const graphics = this.add.graphics();
    graphics.fillGradientStyle(0x102c45, 0x102c45, 0x081522, 0x081522, 1);
    graphics.fillRect(0, 0, WORLD.width, WORLD.height);
    graphics.fillStyle(0x173e54, 0.55);
    for (let x = -80; x < WORLD.width; x += 180) {
      const height = 130 + ((x * 17) % 180);
      graphics.fillRect(x, 822 - height, 130, height);
    }
    graphics.fillStyle(0x24556b, 0.28);
    graphics.fillCircle(1260, 145, 95);
    graphics.lineStyle(2, 0x79b3c9, 0.08);
    for (let y = 90; y < 820; y += 90) graphics.lineBetween(0, y, WORLD.width, y);
    graphics.setDepth(-10);
  }

  private drawPlatforms(): void {
    const graphics = this.add.graphics().setDepth(2);
    for (const platform of PLATFORMS) {
      graphics.fillStyle(platform.kind === "ground" ? 0x142d35 : 0x1c4450, 1);
      graphics.fillRoundedRect(platform.x, platform.y, platform.width, platform.height, platform.kind === "ground" ? 0 : 7);
      graphics.fillStyle(0x49d7c2, platform.kind === "ground" ? 0.5 : 0.82);
      graphics.fillRect(platform.x, platform.y, platform.width, 5);
      graphics.lineStyle(2, 0x07111f, 0.8);
      graphics.strokeRoundedRect(platform.x, platform.y, platform.width, platform.height, platform.kind === "ground" ? 0 : 7);
    }
  }
}

function deadZone(value: number, threshold: number): number {
  if (Math.abs(value) <= threshold) return 0;
  return Math.sign(value) * ((Math.abs(value) - threshold) / (1 - threshold));
}

function normalize(x: number, y: number): { x: number; y: number } {
  const length = Math.hypot(x, y) || 1;
  return { x: x / length, y: y / length };
}

function textStyle(fontSize: number, color = "#f7fbff"): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontFamily: '"Barlow Condensed", Impact, sans-serif',
    fontSize: `${fontSize}px`,
    fontStyle: "bold",
    color,
    stroke: "#07111f",
    strokeThickness: 5,
  };
}
