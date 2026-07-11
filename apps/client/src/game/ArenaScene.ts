import Phaser from "phaser";
import {
  BUSHES,
  GRENADE,
  MATCH,
  PLATFORMS,
  SOLID_COVER,
  WEAPONS,
  WORLD,
  type ExplosionSnapshot,
  type GrenadeSnapshot,
  type PickupSnapshot,
  type PlayerInput,
  type PlayerSnapshot,
  type ProjectileSnapshot,
  type RoomSnapshot,
} from "@doom-army/shared";

interface PlayerView {
  container: Phaser.GameObjects.Container;
  gun: Phaser.GameObjects.Rectangle;
  muzzle: Phaser.GameObjects.Arc;
  jetFlame: Phaser.GameObjects.Triangle;
  label: Phaser.GameObjects.Text;
  healthBack: Phaser.GameObjects.Rectangle;
  healthFill: Phaser.GameObjects.Rectangle;
  targetX: number;
  targetY: number;
  glow: Phaser.GameObjects.Arc;
}

type GameKeys = Record<"left" | "right" | "boost" | "drop" | "reload" | "grenade" | "dash", Phaser.Input.Keyboard.Key>;

export class ArenaScene extends Phaser.Scene {
  private snapshot: RoomSnapshot | null = null;
  private localPlayerId: string | null = null;
  private readonly playerViews = new Map<string, PlayerView>();
  private readonly projectileViews = new Map<number, Phaser.GameObjects.Arc>();
  private readonly grenadeViews = new Map<number, Phaser.GameObjects.Graphics>();
  private readonly pickupViews = new Map<number, Phaser.GameObjects.Graphics>();
  private readonly explosionViews = new Map<number, Phaser.GameObjects.Graphics>();
  private keys!: GameKeys;
  private timerText!: Phaser.GameObjects.Text;
  private scoreText!: Phaser.GameObjects.Text;
  private centerText!: Phaser.GameObjects.Text;
  private helpText!: Phaser.GameObjects.Text;
  private loadoutText!: Phaser.GameObjects.Text;
  private latencyText!: Phaser.GameObjects.Text;
  private killFeedText!: Phaser.GameObjects.Text;
  private damageFlash!: Phaser.GameObjects.Rectangle;
  private crosshair!: Phaser.GameObjects.Graphics;
  private lastInputSentAt = 0;
  private sequence = 0;
  private lastAim = { x: 1, y: 0 };
  private readonly lastAmmo = new Map<string, number>();
  private lastLocalAmmo: number | null = null;
  private lastLocalHealth: number | null = null;
  private readonly lastKills = new Map<string, number>();
  private killFeed: string[] = [];
  private lastRenderedServerTime = -1;
  private latencyMs: number | null = null;

  constructor(private readonly sendInput: (input: PlayerInput) => void) {
    super("arena");
  }

  setNetworkState(snapshot: RoomSnapshot, localPlayerId: string | null): void {
    this.snapshot = snapshot;
    this.localPlayerId = localPlayerId;
  }

  setLatencyMs(latencyMs: number | null): void {
    this.latencyMs = latencyMs;
  }

  preload(): void {
    this.load.image("skyline-arena", "/assets/skyline-arena-bg.jpg");
  }

  create(): void {
    this.cameras.main.setBackgroundColor("#07101d");
    this.drawBackdrop();
    this.drawPlatforms();
    this.drawCover();
    this.drawHudFrame();

    this.keys = this.input.keyboard!.addKeys(
      {
        left: Phaser.Input.Keyboard.KeyCodes.A,
        right: Phaser.Input.Keyboard.KeyCodes.D,
        boost: Phaser.Input.Keyboard.KeyCodes.W,
        drop: Phaser.Input.Keyboard.KeyCodes.S,
        reload: Phaser.Input.Keyboard.KeyCodes.R,
        grenade: Phaser.Input.Keyboard.KeyCodes.G,
        dash: Phaser.Input.Keyboard.KeyCodes.SHIFT,
      },
      false,
    ) as GameKeys;

    this.timerText = this.add.text(WORLD.width / 2, 25, "05:00", textStyle(38)).setOrigin(0.5, 0).setDepth(30);
    this.scoreText = this.add.text(WORLD.width / 2, 72, "0  —  0", textStyle(24, "#f0e1c3")).setOrigin(0.5, 0).setDepth(30);
    this.centerText = this.add
      .text(WORLD.width / 2, WORLD.height / 2 - 40, "", textStyle(92, "#fff8e7"))
      .setOrigin(0.5)
      .setDepth(30)
      .setShadow(0, 6, "#1c1712", 12, true, true);
    this.helpText = this.add
      .text(22, WORLD.height - 19, "LS move/aim/boost/drop · A fire · B grenade · X reload", textStyle(16, "#e4d6bb"))
      .setOrigin(0, 1)
      .setDepth(30);
    this.loadoutText = this.add.text(WORLD.width - 22, 22, "", textStyle(18, "#fff3cc")).setOrigin(1, 0).setDepth(30);
    this.latencyText = this.add.text(22, 22, "PING --", textStyle(18, "#fff3cc")).setOrigin(0, 0).setDepth(30);
    this.killFeedText = this.add.text(WORLD.width - 22, 92, "", textStyle(18, "#dcecff")).setOrigin(1, 0).setAlign("right").setDepth(30);
    this.damageFlash = this.add.rectangle(WORLD.width / 2, WORLD.height / 2, WORLD.width, WORLD.height, 0xff315f, 0).setDepth(40);
    this.crosshair = this.add.graphics().setDepth(35);
    this.crosshair.lineStyle(2, 0x5af0d0, 0.9).strokeCircle(0, 0, 12);
    this.crosshair.lineBetween(-20, 0, -8, 0).lineBetween(8, 0, 20, 0).lineBetween(0, -20, 0, -8).lineBetween(0, 8, 0, 20);

    this.input.mouse?.disableContextMenu();
  }

  update(time: number): void {
    if (!this.snapshot) return;
    this.crosshair.setPosition(this.input.activePointer.worldX, this.input.activePointer.worldY).setVisible(this.snapshot.phase === "playing");
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
    let boostY = 0;
    let firing = false;
    let reload = false;
    let grenade = false;
    let dash = false;

    if (gamepad) {
      const leftX = deadZone(gamepad.axes[0] ?? 0, 0.16);
      const leftY = deadZone(gamepad.axes[1] ?? 0, 0.18);
      const rightX = deadZone(gamepad.axes[2] ?? 0, 0.14);
      const rightY = deadZone(gamepad.axes[3] ?? 0, 0.14);
      moveX = leftX;
      if (Math.hypot(rightX, rightY) > 0.2) this.lastAim = normalize(rightX, rightY);
      boostY = leftY;
      reload = gamepad.buttons[2]?.pressed ?? false;
      grenade = gamepad.buttons[1]?.pressed ?? false;
      firing = (gamepad.buttons[7]?.value ?? 0) > 0.2 || (gamepad.buttons[0]?.pressed ?? false);
      dash = gamepad.buttons[4]?.pressed ?? false;
      this.helpText.setText("GAMEPAD  LS move/jet · RS aim · RT fire · LB dash · B grenade · X reload");
      this.helpText.setColor("#f0d79d");
    } else {
      moveX = (this.keys.left.isDown ? -1 : 0) + (this.keys.right.isDown ? 1 : 0);
      boostY = this.keys.boost.isDown ? -1 : this.keys.drop.isDown ? 1 : 0;
      reload = this.keys.reload.isDown;
      grenade = this.keys.grenade.isDown;
      dash = this.keys.dash.isDown;
      firing = this.input.activePointer.isDown;
      const local = this.snapshot?.players.find((player) => player.id === this.localPlayerId);
      if (local) {
        const pointer = this.input.activePointer;
        const deltaX = pointer.worldX - local.x;
        const deltaY = pointer.worldY - local.y;
        if (Math.hypot(deltaX, deltaY) > 5) this.lastAim = normalize(deltaX, deltaY);
      }
      this.helpText.setText("A/D move · W jet · S drop · MOUSE aim/fire · SHIFT dash · G grenade · R reload");
      this.helpText.setColor("#d8c8aa");
    }

    return {
      sequence: ++this.sequence,
      moveX,
      boostY,
      aimX: this.lastAim.x,
      aimY: this.lastAim.y,
      firing,
      reload,
      grenade,
      dash,
    };
  }

  private renderSnapshot(snapshot: RoomSnapshot): void {
    const freshNetworkFrame = snapshot.serverTime !== this.lastRenderedServerTime;
    if (freshNetworkFrame) {
      this.lastRenderedServerTime = snapshot.serverTime;
      const seconds = Math.max(0, Math.ceil(snapshot.remainingMs / 1000));
      this.timerText.setText(`${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`);
      const sorted = [...snapshot.players].sort((a, b) => a.slot - b.slot);
      this.scoreText.setText(sorted.map((player) => `${player.name}  ${player.kills}`).join("     —     "));
      this.latencyText.setText(this.latencyMs === null ? "PING --" : `PING ${Math.round(this.latencyMs)}ms`);
    }

    const local = snapshot.players.find((player) => player.id === this.localPlayerId);
    if (freshNetworkFrame) {
      this.loadoutText.setText(local ? `${WEAPONS[local.weapon].label}   ${local.ammo}/${local.reserveAmmo}   ◈ ${local.grenades}   JET ${Math.round(local.fuel)}%   DASH ${local.dashCooldownMs === 0 ? "READY" : (local.dashCooldownMs / 1000).toFixed(1)}` : "");
      this.updateKillFeed(snapshot);
      this.updateLocalHaptics(local, snapshot);
    }

    if (snapshot.phase === "countdown") {
      this.centerText.setFontSize(92).setText(String(Math.max(1, Math.ceil(snapshot.countdownMs / 1000))));
    } else if (snapshot.phase === "playing") {
      this.centerText.setText("");
    } else {
      this.centerText.setText(snapshot.players.length < MATCH.minPlayers ? "WAITING FOR PLAYERS" : "").setFontSize(54);
    }

    for (const player of snapshot.players) this.renderPlayer(player);
    if (freshNetworkFrame) {
      this.removeMissingPlayers(snapshot.players);
      for (const projectile of snapshot.projectiles) this.renderProjectile(projectile);
      this.removeMissingViews(this.projectileViews, snapshot.projectiles, (view) => view.destroy());
      for (const grenade of snapshot.grenades) this.renderGrenade(grenade);
      this.removeMissingViews(this.grenadeViews, snapshot.grenades, (view) => view.destroy());
      for (const pickup of snapshot.pickups) this.renderPickup(pickup);
      for (const explosion of snapshot.explosions) this.renderExplosion(explosion);
      this.removeMissingViews(this.explosionViews, snapshot.explosions, (view) => view.destroy());
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
    const smoothing = player.id === this.localPlayerId ? 0.52 : 0.32;
    view.container.x = Phaser.Math.Linear(view.container.x, view.targetX, smoothing);
    view.container.y = Phaser.Math.Linear(view.container.y, view.targetY, smoothing);
    const x = view.container.x;
    const y = view.container.y;
    const angle = Math.atan2(player.aimY, player.aimX);
    const weaponSize = player.weapon === "rail" ? { width: 70, height: 8, color: 0xff5d7d } : player.weapon === "scatter" ? { width: 58, height: 14, color: 0xffc857 } : { width: 54, height: 9, color: 0x5af0d0 };
    view.gun.setPosition(x + player.aimX * 20, y - 4 + player.aimY * 10).setRotation(angle).setDisplaySize(weaponSize.width, weaponSize.height).setFillStyle(weaponSize.color);
    view.muzzle.setPosition(x + player.aimX * 48, y - 4 + player.aimY * 28);
    view.label.setPosition(x, y - 57);
    view.healthBack.setPosition(x, y - 42);
    view.healthFill.setPosition(x - 27, y - 42).setDisplaySize(54 * (player.health / 100), 5);
    view.container.setVisible(player.alive);
    view.gun.setVisible(player.alive);
    view.label.setVisible(player.alive);
    view.healthBack.setVisible(player.alive);
    view.healthFill.setVisible(player.alive);
    view.jetFlame.setVisible(player.alive && player.vy < 90 && player.fuel < 99);
    view.container.setAlpha(player.invulnerableMs > 0 && Math.floor(player.invulnerableMs / 100) % 2 === 0 ? 0.35 : 1);
    view.container.setRotation(Phaser.Math.Clamp(player.vx / 5000, -0.07, 0.07));
    view.glow.setPosition(x, y + 28).setVisible(player.alive && player.vy < 90 && player.fuel < 99);

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
    const colors = [
      { body: 0x2ee6bb, dark: 0x126b64 },
      { body: 0xff5d7d, dark: 0x8e284b },
      { body: 0xffc857, dark: 0x90652d },
      { body: 0x9b7cff, dark: 0x51428f },
      { body: 0x45b7ff, dark: 0x205f91 },
    ];
    const { body: color, dark } = colors[player.slot] ?? colors[0];
    const glow = this.add.circle(player.x, player.y + 28, 21, 0x5af0d0, 0.17).setDepth(10);
    const jetFlame = this.add.triangle(-16, 29, -7, 0, 7, 0, 0, 38, 0x54f2d2).setOrigin(0.5, 0);
    const backpack = this.add.rectangle(-16, 5, 13, 33, 0x26364b).setStrokeStyle(2, 0x07101d);
    const tank = this.add.rectangle(-20, 5, 5, 24, color).setStrokeStyle(1, 0x07101d);
    const body = this.add.rectangle(0, 7, 34, 40, color).setStrokeStyle(3, 0x07101d);
    const vest = this.add.rectangle(1, 8, 24, 25, 0x1b3042).setStrokeStyle(2, 0x07101d);
    const belt = this.add.rectangle(1, 20, 29, 6, dark).setStrokeStyle(1, 0x07101d);
    const shoulder = this.add.rectangle(14, -1, 12, 10, color).setStrokeStyle(2, 0x07101d);
    const neck = this.add.rectangle(1, -10, 12, 8, dark);
    const head = this.add.circle(2, -21, 14, 0xd7a879).setStrokeStyle(3, 0x07101d);
    const helmet = this.add.arc(1, -24, 14, 185, 355, false, dark).setStrokeStyle(2, 0x07101d);
    const visor = this.add.rectangle(8, -21, 15, 7, 0x06121e).setStrokeStyle(1, color);
    const legLeft = this.add.rectangle(-9, 30, 11, 21, dark).setStrokeStyle(2, 0x07101d);
    const legRight = this.add.rectangle(9, 30, 11, 21, dark).setStrokeStyle(2, 0x07101d);
    const bootLeft = this.add.rectangle(-12, 40, 16, 7, 0x07101d);
    const bootRight = this.add.rectangle(12, 40, 16, 7, 0x07101d);
    const container = this.add.container(player.x, player.y, [jetFlame, backpack, tank, legLeft, legRight, bootLeft, bootRight, body, vest, belt, shoulder, neck, head, helmet, visor]).setDepth(12).setScale(1.08);
    const gun = this.add.rectangle(player.x, player.y, 54, 9, color).setOrigin(0.18, 0.5).setStrokeStyle(3, 0x07101d).setDepth(13);
    const muzzle = this.add.circle(player.x, player.y, 8, 0xffd36a).setDepth(11).setVisible(false);
    const label = this.add.text(player.x, player.y - 57, player.name, textStyle(16)).setOrigin(0.5, 1).setDepth(21);
    const healthBack = this.add.rectangle(player.x, player.y - 42, 58, 9, 0x29231d).setDepth(20);
    const healthFill = this.add.rectangle(player.x - 27, player.y - 42, 54, 5, color).setOrigin(0, 0.5).setDepth(21);
    return { container, gun, muzzle, jetFlame, glow, label, healthBack, healthFill, targetX: player.x, targetY: player.y };
  }

  private renderProjectile(projectile: ProjectileSnapshot): void {
    let view = this.projectileViews.get(projectile.id);
    if (!view) {
      const colors = { pulse: 0x5af0d0, scatter: 0xffc857, rail: 0xff5d7d };
      const radius = projectile.weapon === "rail" ? 6 : projectile.weapon === "scatter" ? 3 : 4;
      view = this.add.circle(projectile.x, projectile.y, radius, colors[projectile.weapon]).setDepth(10);
      this.projectileViews.set(projectile.id, view);
    }
    view.setPosition(projectile.x, projectile.y);
  }

  private renderGrenade(grenade: GrenadeSnapshot): void {
    let view = this.grenadeViews.get(grenade.id);
    if (!view) {
      view = this.add.graphics().setDepth(15);
      this.grenadeViews.set(grenade.id, view);
    }
    const pulse = grenade.fuseMs < 450 && Math.floor(grenade.fuseMs / 90) % 2 === 0 ? 1.25 : 1;
    const radius = 10 * pulse;
    view.clear();
    view.fillStyle(0x4c5740, 1).fillCircle(grenade.x, grenade.y, radius);
    view.lineStyle(3, 0x24291f, 1).strokeCircle(grenade.x, grenade.y, radius);
    view.fillStyle(0x2f332d, 1).fillRoundedRect(grenade.x - 4, grenade.y - radius - 5, 8, 6, 2);
    view.fillStyle(0xf0a74a, 1).fillCircle(grenade.x + 4, grenade.y - radius - 7, 3.5);
  }

  private renderPickup(pickup: PickupSnapshot): void {
    let view = this.pickupViews.get(pickup.id);
    if (!view) {
      view = this.add.graphics().setDepth(8);
      this.pickupViews.set(pickup.id, view);
    }
    view.setVisible(pickup.active);
    if (!pickup.active) return;

    const x = pickup.x;
    const y = pickup.y + Math.sin(this.time.now * 0.004 + pickup.id) * 5;
    view.clear();
    view.fillStyle(0x1c211c, 0.35).fillEllipse(x, y + 14, 36, 10);
    if (pickup.kind === "ammo") {
      view.fillStyle(0x8c6440, 1).fillRoundedRect(x - 16, y - 12, 32, 24, 4);
      view.lineStyle(3, 0x493522, 1).strokeRoundedRect(x - 16, y - 12, 32, 24, 4);
      view.fillStyle(0xb88a4e, 1).fillRect(x - 3, y - 12, 6, 24);
      view.fillStyle(0xd9b45c, 1).fillRoundedRect(x - 11, y - 8, 4, 14, 2).fillRoundedRect(x + 7, y - 8, 4, 14, 2);
    } else if (pickup.kind === "grenade") {
      view.fillStyle(0x596947, 1).fillCircle(x, y, 13);
      view.lineStyle(3, 0x2f3728, 1).strokeCircle(x, y, 13);
      view.fillStyle(0xb18a4a, 1).fillRect(x - 11, y, 22, 5);
      view.fillStyle(0x343a30, 1).fillRoundedRect(x - 5, y - 16, 10, 6, 2);
    } else if (pickup.kind === "health") {
      view.fillStyle(0x132d2a, 1).fillRoundedRect(x - 16, y - 16, 32, 32, 5);
      view.lineStyle(3, 0x5af0d0, 1).strokeRoundedRect(x - 16, y - 16, 32, 32, 5);
      view.fillStyle(0x5af0d0, 1).fillRect(x - 4, y - 11, 8, 22).fillRect(x - 11, y - 4, 22, 8);
    } else {
      const color = pickup.kind === "rail" ? 0xff5d7d : 0xffc857;
      view.fillStyle(0x101d2b, 1).fillRoundedRect(x - 28, y - 13, 56, 26, 4);
      view.lineStyle(2, color, 1).strokeRoundedRect(x - 28, y - 13, 56, 26, 4);
      if (pickup.kind === "rail") {
        view.fillStyle(color, 1).fillRect(x - 20, y - 3, 38, 5).fillRect(x + 13, y - 7, 10, 3);
        view.lineStyle(2, 0xddefff, 0.7).lineBetween(x - 16, y - 6, x + 11, y - 6);
      } else {
        view.fillStyle(color, 1).fillRoundedRect(x - 17, y - 7, 8, 16, 2).fillRoundedRect(x - 4, y - 7, 8, 16, 2).fillRoundedRect(x + 9, y - 7, 8, 16, 2);
      }
    }
  }

  private renderExplosion(explosion: ExplosionSnapshot): void {
    let view = this.explosionViews.get(explosion.id);
    if (!view) {
      view = this.add.graphics().setDepth(25);
      this.explosionViews.set(explosion.id, view);
    }
    const progress = Phaser.Math.Clamp(explosion.ageMs / 420, 0, 1);
    const radius = explosion.radius * (0.22 + progress * 0.78);
    view.clear();
    view.fillStyle(0xffcf62, (1 - progress) * 0.55).fillCircle(explosion.x, explosion.y, radius * 0.55);
    view.lineStyle(12 - progress * 8, 0xd76635, 1 - progress).strokeCircle(explosion.x, explosion.y, radius);
    view.lineStyle(5, 0x3c332b, (1 - progress) * 0.6).strokeCircle(explosion.x, explosion.y, radius * 0.78);
  }

  private removeMissingPlayers(players: PlayerSnapshot[]): void {
    for (const [id, view] of this.playerViews) {
      if (players.some((player) => player.id === id)) continue;
      view.container.destroy(true);
      view.gun.destroy();
      view.muzzle.destroy();
      view.glow.destroy();
      view.label.destroy();
      view.healthBack.destroy();
      view.healthFill.destroy();
      this.playerViews.delete(id);
    }
  }

  private removeMissingViews<T extends Phaser.GameObjects.GameObject, S extends { id: number }>(
    views: Map<number, T>,
    snapshots: S[],
    destroy: (view: T) => void,
  ): void {
    for (const [id, view] of views) {
      if (snapshots.some((snapshot) => snapshot.id === id)) continue;
      destroy(view);
      views.delete(id);
    }
  }

  private drawBackdrop(): void {
    this.add.image(WORLD.width / 2, WORLD.height / 2, "skyline-arena").setDisplaySize(WORLD.width, WORLD.height).setDepth(-22).setAlpha(0.72);
    const graphics = this.add.graphics().setDepth(-20);
    graphics.fillGradientStyle(0x030914, 0x030914, 0x07111d, 0x07111d, 0.08, 0.08, 0.48, 0.48).fillRect(0, 0, WORLD.width, WORLD.height);
    graphics.lineStyle(1, 0x4ce1c4, 0.08);
    for (let x = -300; x < 1900; x += 95) graphics.lineBetween(WORLD.width / 2, 510, x, 900);
    for (let y = 560; y < 900; y += 55) graphics.lineBetween(0, y, WORLD.width, y);
  }

  private drawPlatforms(): void {
    const graphics = this.add.graphics().setDepth(3);
    for (const platform of PLATFORMS) {
      graphics.fillStyle(0x302b25, 0.25).fillRoundedRect(platform.x + 7, platform.y + 9, platform.width, platform.height, 5);
      graphics.fillStyle(platform.kind === "ground" ? 0x111f2f : 0x1c3042, 1).fillRoundedRect(platform.x, platform.y, platform.width, platform.height, 5);
      graphics.fillStyle(0x46e4c2, 1).fillRect(platform.x, platform.y, platform.width, 6);
      graphics.fillStyle(0xa0ffec, 0.28).fillRect(platform.x, platform.y + 6, platform.width, 4);
      graphics.lineStyle(2, 0x3b6072, 0.75).strokeRoundedRect(platform.x, platform.y, platform.width, platform.height, 5);

      const blockWidth = platform.kind === "ground" ? 92 : 72;
      for (let x = platform.x + blockWidth; x < platform.x + platform.width; x += blockWidth) {
        graphics.lineBetween(x, platform.y + 11, x, platform.y + platform.height);
      }
      if (platform.kind === "platform") {
        graphics.fillStyle(0x07111c, 0.9).fillTriangle(platform.x + 16, platform.y + platform.height, platform.x + 44, platform.y + platform.height, platform.x + 30, platform.y + platform.height + 16);
        graphics.fillTriangle(platform.x + platform.width - 44, platform.y + platform.height, platform.x + platform.width - 16, platform.y + platform.height, platform.x + platform.width - 30, platform.y + platform.height + 16);
        graphics.fillStyle(0x5af0d0, 0.7).fillCircle(platform.x + 14, platform.y + 13, 2).fillCircle(platform.x + platform.width - 14, platform.y + 13, 2);
      }
      if (platform.height > 35) {
        const midY = platform.y + 39;
        graphics.lineBetween(platform.x, midY, platform.x + platform.width, midY);
        for (let x = platform.x + blockWidth / 2; x < platform.x + platform.width; x += blockWidth) {
          graphics.lineBetween(x, midY, x, platform.y + platform.height);
        }
      }
    }
  }

  private drawHudFrame(): void {
    const hud = this.add.graphics().setDepth(29);
    hud.fillStyle(0x030914, 0.62).fillRoundedRect(8, 8, 132, 43, 4);
    hud.lineStyle(1, 0x5af0d0, 0.24).strokeRoundedRect(8, 8, 132, 43, 4);
    hud.fillStyle(0x030914, 0.72).fillRoundedRect(WORLD.width / 2 - 250, 8, 500, 100, 4);
    hud.lineStyle(1, 0x5af0d0, 0.22).strokeRoundedRect(WORLD.width / 2 - 250, 8, 500, 100, 4);
    hud.fillStyle(0x030914, 0.62).fillRoundedRect(WORLD.width - 595, 8, 587, 43, 4);
    hud.lineStyle(1, 0x5af0d0, 0.24).strokeRoundedRect(WORLD.width - 595, 8, 587, 43, 4);
    hud.fillStyle(0x030914, 0.68).fillRect(0, WORLD.height - 38, WORLD.width, 38);
    hud.fillStyle(0x5af0d0, 0.3).fillRect(0, WORLD.height - 38, WORLD.width, 1);
  }

  private drawCover(): void {
    const rocks = this.add.graphics().setDepth(11);
    for (const rock of SOLID_COVER) {
      rocks.fillStyle(0x02070d, 0.45).fillEllipse(rock.x + rock.width / 2, rock.y + rock.height + 6, rock.width * 1.15, 14);
      rocks.fillStyle(0x142738, 1).fillRoundedRect(rock.x, rock.y, rock.width, rock.height, 5);
      rocks.lineStyle(3, 0x39596b, 1).strokeRoundedRect(rock.x, rock.y, rock.width, rock.height, 5);
      rocks.lineStyle(2, 0x5af0d0, 0.7).strokeRoundedRect(rock.x + 8, rock.y + 8, rock.width - 16, rock.height - 16, 2);
      rocks.lineStyle(3, 0x39596b, 1).lineBetween(rock.x + 10, rock.y + 10, rock.x + rock.width - 10, rock.y + rock.height - 10);
      rocks.lineBetween(rock.x + rock.width - 10, rock.y + 10, rock.x + 10, rock.y + rock.height - 10);
    }

    const bushes = this.add.graphics().setDepth(18);
    for (const bush of BUSHES) {
      const centerX = bush.x + bush.width / 2;
      const baseY = bush.y + bush.height;
      bushes.fillStyle(0x081520, 0.82).fillRect(bush.x, bush.y + 8, bush.width, bush.height - 8);
      bushes.lineStyle(2, 0x5af0d0, 0.38).strokeRect(bush.x, bush.y + 8, bush.width, bush.height - 8);
      bushes.fillStyle(0x5af0d0, 0.12).fillRect(bush.x + 8, bush.y + 16, bush.width - 16, 8);
      bushes.fillStyle(0xff5d7d, 0.32).fillRect(bush.x + 8, bush.y + 29, bush.width * 0.42, 5);
      bushes.lineStyle(3, 0x263e50, 1).lineBetween(centerX, baseY, centerX, baseY + 8);
    }
  }

  private updateLocalHaptics(local: PlayerSnapshot | undefined, snapshot: RoomSnapshot): void {
    if (!local) {
      this.lastLocalAmmo = null;
      this.lastLocalHealth = null;
      return;
    }

    if (local.alive && this.lastLocalAmmo !== null && local.ammo < this.lastLocalAmmo) {
      pulseGamepad(38, 0.12, 0.22);
    }

    if (this.lastLocalHealth !== null && local.health < this.lastLocalHealth) {
      const grenadeHit = snapshot.explosions.some((explosion) => Math.hypot(local.x - explosion.x, local.y - explosion.y) <= explosion.radius + 24);
      if (grenadeHit) pulseGamepad(260, 0.75, 1);
      this.cameras.main.shake(90, grenadeHit ? 0.012 : 0.005);
      this.damageFlash.setFillStyle(0xff315f, 0.18);
      this.tweens.killTweensOf(this.damageFlash);
      this.tweens.add({ targets: this.damageFlash, fillAlpha: 0, duration: 220 });
    }

    this.lastLocalAmmo = local.ammo;
    this.lastLocalHealth = local.health;
  }

  private updateKillFeed(snapshot: RoomSnapshot): void {
    for (const player of snapshot.players) {
      const previous = this.lastKills.get(player.id) ?? player.kills;
      if (player.kills > previous) {
        this.killFeed.unshift(`${player.name.toUpperCase()}  //  ELIMINATION`);
        this.killFeed = this.killFeed.slice(0, 4);
        this.time.delayedCall(3200, () => {
          this.killFeed.pop();
          this.killFeedText.setText(this.killFeed.join("\n"));
        });
      }
      this.lastKills.set(player.id, player.kills);
    }
    this.killFeedText.setText(this.killFeed.join("\n"));
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

function pulseGamepad(durationMs: number, weakMagnitude: number, strongMagnitude: number): void {
  const pads = navigator.getGamepads?.() ?? [];
  const gamepad = [...pads].find((pad) => pad?.connected && pad.mapping === "standard") ?? [...pads].find(Boolean);
  const haptics = gamepad as
    | (Gamepad & {
        vibrationActuator?: {
          playEffect?: (type: "dual-rumble", params: { duration: number; weakMagnitude: number; strongMagnitude: number }) => Promise<unknown>;
        };
        hapticActuators?: Array<{ pulse?: (value: number, duration: number) => Promise<unknown> }>;
      })
    | null
    | undefined;

  const actuator = haptics?.vibrationActuator;
  if (actuator?.playEffect) {
    void actuator.playEffect("dual-rumble", { duration: durationMs, weakMagnitude, strongMagnitude }).catch(() => undefined);
    return;
  }

  const legacyPulse = haptics?.hapticActuators?.[0]?.pulse;
  if (legacyPulse) void legacyPulse(Math.max(weakMagnitude, strongMagnitude), durationMs).catch(() => undefined);
}

function textStyle(fontSize: number, color = "#fff7e7"): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontFamily: '"Barlow Condensed", Impact, sans-serif',
    fontSize: `${fontSize}px`,
    fontStyle: "bold",
    color,
    stroke: "#2a251f",
    strokeThickness: 5,
  };
}
