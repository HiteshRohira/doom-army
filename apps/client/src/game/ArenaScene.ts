import Phaser from "phaser";
import {
  BUSHES,
  PLATFORMS,
  SOLID_COVER,
  WORLD,
  type ExplosionSnapshot,
  type GrenadeSnapshot,
  type PickupSnapshot,
  type PlayerInput,
  type PlayerSnapshot,
  type ProjectileSnapshot,
  type RoomSnapshot,
} from "@arena/shared";

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
}

type GameKeys = Record<"left" | "right" | "boost" | "drop" | "reload" | "grenade", Phaser.Input.Keyboard.Key>;

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
  private lastInputSentAt = 0;
  private sequence = 0;
  private lastAim = { x: 1, y: 0 };
  private readonly lastAmmo = new Map<string, number>();

  constructor(private readonly sendInput: (input: PlayerInput) => void) {
    super("arena");
  }

  setNetworkState(snapshot: RoomSnapshot, localPlayerId: string | null): void {
    this.snapshot = snapshot;
    this.localPlayerId = localPlayerId;
  }

  create(): void {
    this.cameras.main.setBackgroundColor("#7897a2");
    this.drawBackdrop();
    this.drawPlatforms();
    this.drawCover();

    this.keys = this.input.keyboard!.addKeys(
      {
        left: Phaser.Input.Keyboard.KeyCodes.A,
        right: Phaser.Input.Keyboard.KeyCodes.D,
        boost: Phaser.Input.Keyboard.KeyCodes.W,
        drop: Phaser.Input.Keyboard.KeyCodes.S,
        reload: Phaser.Input.Keyboard.KeyCodes.R,
        grenade: Phaser.Input.Keyboard.KeyCodes.G,
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
      .text(22, WORLD.height - 19, "LS move + aim · RS ↑ boost / ↓ drop · RT fire · RB grenade · X reload", textStyle(16, "#e4d6bb"))
      .setOrigin(0, 1)
      .setDepth(30);
    this.loadoutText = this.add.text(WORLD.width - 22, WORLD.height - 19, "", textStyle(18, "#fff3cc")).setOrigin(1, 1).setDepth(30);

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
    let boostY = 0;
    let firing = false;
    let reload = false;
    let grenade = false;

    if (gamepad) {
      const leftX = deadZone(gamepad.axes[0] ?? 0, 0.16);
      const leftY = deadZone(gamepad.axes[1] ?? 0, 0.18);
      moveX = leftX;
      if (Math.hypot(leftX, leftY) > 0.2) this.lastAim = normalize(leftX, leftY);
      boostY = deadZone(gamepad.axes[3] ?? 0, 0.18);
      reload = gamepad.buttons[2]?.pressed ?? false;
      grenade = gamepad.buttons[5]?.pressed ?? false;
      firing = (gamepad.buttons[7]?.value ?? 0) > 0.18;
      this.helpText.setText(`Xbox ready · LS move/aim · RS boost/drop · RT fire · RB grenade · X reload`);
      this.helpText.setColor("#f0d79d");
    } else {
      moveX = (this.keys.left.isDown ? -1 : 0) + (this.keys.right.isDown ? 1 : 0);
      boostY = this.keys.boost.isDown ? -1 : this.keys.drop.isDown ? 1 : 0;
      reload = this.keys.reload.isDown;
      grenade = this.keys.grenade.isDown;
      firing = this.input.activePointer.isDown;
      const local = this.snapshot?.players.find((player) => player.id === this.localPlayerId);
      if (local) {
        const pointer = this.input.activePointer;
        const deltaX = pointer.worldX - local.x;
        const deltaY = pointer.worldY - local.y;
        if (Math.hypot(deltaX, deltaY) > 5) this.lastAim = normalize(deltaX, deltaY);
      }
      this.helpText.setText("Keyboard: A/D move · W boost · S drop · mouse fire/aim · G grenade · R reload");
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
    };
  }

  private renderSnapshot(snapshot: RoomSnapshot): void {
    const seconds = Math.max(0, Math.ceil(snapshot.remainingMs / 1000));
    this.timerText.setText(`${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`);
    const sorted = [...snapshot.players].sort((a, b) => a.slot - b.slot);
    this.scoreText.setText(sorted.map((player) => `${player.name}  ${player.kills}`).join("     —     "));

    const local = snapshot.players.find((player) => player.id === this.localPlayerId);
    this.loadoutText.setText(local ? `AMMO ${local.ammo}/${local.reserveAmmo}   ◆ ${local.grenades}/2   FUEL ${Math.round(local.fuel)}%` : "");

    if (snapshot.phase === "countdown") {
      this.centerText.setFontSize(92).setText(String(Math.max(1, Math.ceil(snapshot.countdownMs / 1000))));
    } else if (snapshot.phase === "playing") {
      this.centerText.setText("");
    } else {
      this.centerText.setText(snapshot.players.length < 2 ? "WAITING FOR RIVAL" : "").setFontSize(54);
    }

    for (const player of snapshot.players) this.renderPlayer(player);
    this.removeMissingPlayers(snapshot.players);
    for (const projectile of snapshot.projectiles) this.renderProjectile(projectile);
    this.removeMissingViews(this.projectileViews, snapshot.projectiles, (view) => view.destroy());
    for (const grenade of snapshot.grenades) this.renderGrenade(grenade);
    this.removeMissingViews(this.grenadeViews, snapshot.grenades, (view) => view.destroy());
    for (const pickup of snapshot.pickups) this.renderPickup(pickup);
    for (const explosion of snapshot.explosions) this.renderExplosion(explosion);
    this.removeMissingViews(this.explosionViews, snapshot.explosions, (view) => view.destroy());
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
    view.jetFlame.setVisible(player.alive && player.vy < 90 && player.fuel < 99);
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
    const color = player.slot === 0 ? 0x497da3 : 0xb86743;
    const dark = player.slot === 0 ? 0x29495e : 0x6e3e2b;
    const jetFlame = this.add.triangle(-14, 31, -7, 0, 7, 0, 0, 32, 0xe8a84b).setOrigin(0.5, 0);
    const backpack = this.add.rectangle(-15, 6, 12, 31, 0x555b43).setStrokeStyle(2, 0x27231d);
    const body = this.add.rectangle(0, 7, 32, 39, color).setStrokeStyle(3, 0x27231d);
    const vest = this.add.rectangle(0, 8, 22, 24, 0x6a7054).setStrokeStyle(2, 0x3f4232);
    const head = this.add.circle(2, -19, 13, 0xd7a879).setStrokeStyle(3, 0x27231d);
    const visor = this.add.rectangle(7, -20, 13, 6, 0x253740).setStrokeStyle(1, 0xc9a95d);
    const legLeft = this.add.rectangle(-9, 29, 10, 20, dark).setStrokeStyle(2, 0x27231d);
    const legRight = this.add.rectangle(9, 29, 10, 20, dark).setStrokeStyle(2, 0x27231d);
    const container = this.add.container(player.x, player.y, [jetFlame, backpack, legLeft, legRight, body, vest, head, visor]).setDepth(12);
    const gun = this.add.rectangle(player.x, player.y, 52, 10, 0x3b3d3c).setOrigin(0.22, 0.5).setStrokeStyle(2, 0x201e1b).setDepth(13);
    const muzzle = this.add.circle(player.x, player.y, 8, 0xffd36a).setDepth(11).setVisible(false);
    const label = this.add.text(player.x, player.y - 57, player.name, textStyle(16)).setOrigin(0.5, 1).setDepth(21);
    const healthBack = this.add.rectangle(player.x, player.y - 42, 58, 9, 0x29231d).setDepth(20);
    const healthFill = this.add.rectangle(player.x - 27, player.y - 42, 54, 5, color).setOrigin(0, 0.5).setDepth(21);
    return { container, gun, muzzle, jetFlame, label, healthBack, healthFill, targetX: player.x, targetY: player.y };
  }

  private renderProjectile(projectile: ProjectileSnapshot): void {
    let view = this.projectileViews.get(projectile.id);
    if (!view) {
      view = this.add.circle(projectile.x, projectile.y, 4, 0xffd46c).setDepth(10);
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
    } else {
      view.fillStyle(0x596947, 1).fillCircle(x, y, 13);
      view.lineStyle(3, 0x2f3728, 1).strokeCircle(x, y, 13);
      view.fillStyle(0xb18a4a, 1).fillRect(x - 11, y, 22, 5);
      view.fillStyle(0x343a30, 1).fillRoundedRect(x - 5, y - 16, 10, 6, 2);
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
    const graphics = this.add.graphics().setDepth(-20);
    graphics.fillGradientStyle(0x6e91a2, 0x6e91a2, 0xc1b998, 0xc1b998, 1).fillRect(0, 0, WORLD.width, WORLD.height);
    graphics.fillStyle(0xe8d59d, 0.74).fillCircle(1280, 142, 88);
    graphics.fillStyle(0x6c7180, 0.5);
    graphics.fillTriangle(-100, 650, 380, 170, 760, 650);
    graphics.fillTriangle(420, 650, 930, 230, 1330, 650);
    graphics.fillTriangle(980, 650, 1430, 250, 1740, 650);
    graphics.fillStyle(0x536b65, 0.63);
    graphics.fillTriangle(-80, 760, 330, 430, 720, 760);
    graphics.fillTriangle(500, 760, 1030, 390, 1480, 760);
    graphics.fillTriangle(1160, 760, 1540, 460, 1740, 760);
    graphics.fillStyle(0xd3c7a4, 0.15);
    for (let x = 40; x < WORLD.width; x += 230) graphics.fillEllipse(x, 510 + (x % 3) * 42, 280, 80);
    graphics.lineStyle(2, 0x374a4d, 0.08);
    for (let y = 110; y < 820; y += 110) graphics.lineBetween(0, y, WORLD.width, y);
  }

  private drawPlatforms(): void {
    const graphics = this.add.graphics().setDepth(3);
    for (const platform of PLATFORMS) {
      graphics.fillStyle(0x302b25, 0.25).fillRoundedRect(platform.x + 7, platform.y + 9, platform.width, platform.height, 5);
      graphics.fillStyle(platform.kind === "ground" ? 0x4d493f : 0x666157, 1).fillRoundedRect(platform.x, platform.y, platform.width, platform.height, 5);
      graphics.fillStyle(platform.kind === "ground" ? 0x6d7745 : 0x7d824f, 1).fillRect(platform.x, platform.y, platform.width, 8);
      graphics.fillStyle(0xa69b7e, 0.45).fillRect(platform.x, platform.y + 8, platform.width, 3);
      graphics.lineStyle(2, 0x3a3731, 0.75).strokeRoundedRect(platform.x, platform.y, platform.width, platform.height, 5);

      const blockWidth = platform.kind === "ground" ? 92 : 72;
      for (let x = platform.x + blockWidth; x < platform.x + platform.width; x += blockWidth) {
        graphics.lineBetween(x, platform.y + 11, x, platform.y + platform.height);
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

  private drawCover(): void {
    const rocks = this.add.graphics().setDepth(11);
    for (const rock of SOLID_COVER) {
      rocks.fillStyle(0x38342e, 0.28).fillEllipse(rock.x + rock.width / 2, rock.y + rock.height + 7, rock.width * 1.1, 18);
      rocks.fillStyle(0x706c62, 1).fillRoundedRect(rock.x, rock.y + 9, rock.width, rock.height - 9, 18);
      rocks.fillStyle(0x8a8477, 1).fillTriangle(rock.x + 5, rock.y + 24, rock.x + rock.width * 0.36, rock.y, rock.x + rock.width * 0.58, rock.y + 30);
      rocks.fillStyle(0x5d5a52, 1).fillTriangle(rock.x + rock.width * 0.42, rock.y + 32, rock.x + rock.width * 0.72, rock.y + 4, rock.x + rock.width - 4, rock.y + 28);
      rocks.lineStyle(3, 0x46423c, 0.8).strokeRoundedRect(rock.x, rock.y + 9, rock.width, rock.height - 9, 18);
      rocks.lineStyle(2, 0xa9a18f, 0.35).lineBetween(rock.x + 18, rock.y + 23, rock.x + rock.width * 0.48, rock.y + 14);
    }

    const bushes = this.add.graphics().setDepth(18);
    for (const bush of BUSHES) {
      const centerX = bush.x + bush.width / 2;
      const baseY = bush.y + bush.height;
      bushes.lineStyle(5, 0x453d2b, 0.8);
      bushes.lineBetween(centerX, baseY, centerX - bush.width * 0.22, bush.y + 10);
      bushes.lineBetween(centerX, baseY, centerX + bush.width * 0.24, bush.y + 8);
      bushes.fillStyle(0x354b32, 1).fillEllipse(bush.x + bush.width * 0.25, bush.y + bush.height * 0.55, bush.width * 0.52, bush.height * 0.75);
      bushes.fillStyle(0x435e38, 1).fillEllipse(centerX, bush.y + bush.height * 0.43, bush.width * 0.58, bush.height * 0.9);
      bushes.fillStyle(0x526b40, 1).fillEllipse(bush.x + bush.width * 0.76, bush.y + bush.height * 0.58, bush.width * 0.5, bush.height * 0.72);
      bushes.fillStyle(0x7c8450, 0.55).fillCircle(bush.x + bush.width * 0.43, bush.y + bush.height * 0.27, 8);
      bushes.fillStyle(0x292f27, 0.22).fillEllipse(centerX, baseY, bush.width * 0.9, 12);
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
