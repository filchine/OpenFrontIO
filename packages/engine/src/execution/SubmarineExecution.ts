import { TileRef } from "@openfront/engine-api/game/GameMap";
import { UnitType } from "@openfront/engine-api/game/GameTypes";
import { PseudoRandom } from "@openfront/engine-lib/PseudoRandom";
import {
  zInt,
  zNum,
  zPlayerRef,
  zRandom,
  zRef,
  zTile,
} from "@openfront/engine-lib/snapshot/SnapshotType";
import { findMinimumBy } from "@openfront/engine-lib/Util";
import { z } from "zod";
import {
  Execution,
  Game,
  isUnit,
  OwnerComp,
  Unit,
  UnitParams,
} from "../game/Game";
import { WaterPathFinder } from "../pathfinding/PathFinder";
import { PathStatus } from "../pathfinding/types";
import { execSnapshotType } from "../snapshot/ExecutionSnapshot";
import {
  restoreWaterPathFinder,
  WaterPathFinderSchema,
  waterPathFinderState,
} from "../snapshot/PathfinderSnapshots";
import type {
  ExecRecord,
  SnapshotReader,
  SnapshotWriter,
} from "../snapshot/SnapshotContext";
import { ShellExecution } from "./ShellExecution";

export class SubmarineExecution implements Execution {
  private random: PseudoRandom;
  private submarine: Unit;
  private mg: Game;
  private pathfinder: WaterPathFinder;
  private lastShellAttack = 0;
  private alreadySentShell = new Set<Unit>();
  private lastManualMoveTickRetreatDisabled = 0;
  private lastObservedPatrolTile: TileRef | undefined;
  private activeHealingRemainder = 0;
  private lastEmittedCombat = false;

  constructor(
    private input: (UnitParams<UnitType.Submarine> & OwnerComp) | Unit,
  ) {}

  init(mg: Game, ticks: number): void {
    this.mg = mg;
    this.pathfinder = new WaterPathFinder(mg);
    this.random = new PseudoRandom(mg.ticks());
    if (isUnit(this.input)) {
      this.submarine = this.input;
    } else {
      const spawn = this.input.owner.canBuild(
        UnitType.Submarine,
        this.input.patrolTile,
      );
      if (spawn === false) {
        console.warn(
          `Failed to spawn submarine for ${this.input.owner.name()} at ${this.input.patrolTile}`,
        );
        return;
      }
      this.submarine = this.input.owner.buildUnit(
        UnitType.Submarine,
        spawn,
        this.input,
      );
    }
    this.lastObservedPatrolTile = this.submarine.submarineState().patrolTile;
  }

  tick(ticks: number): void {
    if (this.submarine.health() <= 0) {
      this.submarine.delete();
      return;
    }
    const isInCombat = this.submarine.submarineState().isInCombat ?? false;
    if (this.lastEmittedCombat && !isInCombat) {
      this.submarine.touch();
    }
    this.lastEmittedCombat = isInCombat;
    const healthBeforeHealing = this.submarine.health();

    this.healSubmarine();
    this.handleManualPatrolOverride();

    // A doomed side cannot repair its navy, so retreating to
    // a port only pulls a submarine out of the fight to idle there forever. Undock
    // or abort any retreat and keep patrolling until the side recovers.
    if (
      this.submarine.owner().inDoomsdayClock() &&
      this.submarine.submarineState().state !== "patrolling"
    ) {
      this.cancelRepairRetreat();
    }

    if (this.submarine.submarineState().state === "docked") {
      if (this.currentRetreatPort() === undefined) {
        this.cancelRepairRetreat();
      }
      if (this.isFullyHealed()) {
        this.cancelRepairRetreat();
      }
      if (this.submarine.submarineState().state === "docked") {
        return;
      }
    }

    if (this.handleRepairRetreat()) {
      return;
    }

    // Priority 1: Check if need to heal before doing anything else
    if (this.shouldStartRepairRetreat(healthBeforeHealing)) {
      this.startRepairRetreat();
      if (this.handleRepairRetreat()) {
        return;
      }
    }

    // Manage submerging/surfacing
    this.manageStealth();

    this.submarine.setTargetUnit(this.findTargetUnit());

    // Priority 1: Shoot transport ship if in range
    if (this.submarine.targetUnit()?.type() === UnitType.TransportShip) {
      this.shootTarget();
      this.patrol();
      return;
    }

    // Priority 2: Fight enemy warship if in range (only when surfaced)
    if (this.submarine.targetUnit()?.type() === UnitType.Warship) {
      if (!this.submarine.submarineState().isSubmerged) {
        this.shootTarget();
      }
      this.patrol();
      return;
    }

    // Priority 3: Hunt trade ship only if not healing and no enemy warship
    if (this.submarine.targetUnit()?.type() === UnitType.TradeShip) {
      this.huntDownTradeShip();
      return;
    }

    this.patrol();
  }

  private healSubmarine(): void {
    const owner = this.submarine.owner();
    // A doomed side (below the Doomsday Clock bar) cannot repair its navy, so the
    // decay in DoomsdayClockExecution actually sinks submarines instead of being
    // out-healed at a port. Inert when the mode is off: the mark is never set.
    if (owner.inDoomsdayClock()) return;
    const passiveHealing = this.mg.config().submarinePassiveHealing();
    const passiveHealingRange = this.mg.config().submarinePassiveHealingRange();
    const passiveHealingRangeSquared =
      passiveHealingRange * passiveHealingRange;
    const submarineTile = this.submarine.tile();

    let isNearPort = false;
    for (const port of owner.units(UnitType.Port)) {
      const distSquared = this.mg.euclideanDistSquared(
        submarineTile,
        port.tile(),
      );
      if (distSquared <= passiveHealingRangeSquared) {
        isNearPort = true;
        break;
      }
    }

    if (isNearPort) {
      this.submarine.modifyHealth(passiveHealing);
    }

    if (this.submarine.submarineState().state === "docked") {
      this.applyActiveDockedHealing();
    }
  }

  private isFullyHealed(): boolean {
    if (!this.submarine.hasHealth()) {
      return true;
    }
    return this.submarine.health() >= this.submarine.maxHealth();
  }

  private shouldStartRepairRetreat(
    healthBeforeHealing = this.submarine.health(),
  ): boolean {
    if (this.submarine.submarineState().state !== "patrolling") {
      return false;
    }
    // A doomed side cannot repair (see healSubmarine), so there is nothing to
    // retreat for; stay on patrol instead of idling at a port.
    if (this.submarine.owner().inDoomsdayClock()) {
      return false;
    }
    const manualMoveRetreatDisabledDuration = 50;
    if (
      this.mg.ticks() - this.lastManualMoveTickRetreatDisabled <
      manualMoveRetreatDisabledDuration
    ) {
      return false;
    }
    // Percentage of (veterancy-adjusted) max health, so a tougher veteran sub
    // retreats at the same relative health as a fresh one. Integer math.
    const retreatThreshold = Math.floor(
      (this.submarine.maxHealth() *
        this.mg.config().submarineRetreatHealthPercent()) /
        100,
    );
    if (healthBeforeHealing >= retreatThreshold) {
      return false;
    }
    const ports = this.submarine.owner().units(UnitType.Port);
    return ports.length > 0;
  }

  private findNearestPort(): TileRef | undefined {
    const ports = this.submarine.owner().units(UnitType.Port);
    if (ports.length === 0) {
      return undefined;
    }

    const submarineTile = this.submarine.tile();
    const submarineComponent = this.mg.getWaterComponent(submarineTile);
    if (submarineComponent === null) {
      return undefined;
    }

    const nearest = findMinimumBy(
      ports,
      (port) => this.mg.euclideanDistSquared(submarineTile, port.tile()),
      (port) => {
        const portComponent = this.mg.getWaterComponent(port.tile());
        return portComponent !== null && portComponent === submarineComponent;
      },
    );

    return nearest?.tile();
  }

  private findRetreatAggroTarget(): Unit | undefined {
    return this.findBestTarget([UnitType.TransportShip, UnitType.Warship]);
  }

  private findTargetUnit(): Unit | undefined {
    return this.findBestTarget(
      [UnitType.TransportShip, UnitType.Warship, UnitType.TradeShip],
      true,
    );
  }

  /**
   * Shared target selection: searches nearby units of given types,
   * filters common exclusions (self, friendly, docked, already-shelled),
   * picks best by type priority (lower index = higher priority) then distance.
   *
   * When `includeTradeShips` is true, applies trade-ship-specific filters
   * (safe from pirates, patrol range, water component, allied destination).
   */
  private findBestTarget(
    types: UnitType[],
    includeTradeShips = false,
  ): Unit | undefined {
    const mg = this.mg;
    const config = mg.config();
    const owner = this.submarine.owner();

    const ships = mg.nearbyUnits(
      this.submarine.tile(),
      config.submarineTargettingRange(),
      types,
    );

    // Trade-ship-specific state, lazily computed.
    let hasReachablePort: boolean | undefined;
    let patrolTile: number | undefined;
    let patrolRangeSquared: number | undefined;
    let submarineComponent: number | null | undefined = undefined;

    let bestUnit: Unit | undefined = undefined;
    let bestTypePriority = 0;
    let bestDistSquared = 0;

    for (const { unit, distSquared } of ships) {
      if (
        unit === this.submarine ||
        unit.owner() === owner ||
        !owner.canAttackPlayer(unit.owner(), true) ||
        this.alreadySentShell.has(unit) ||
        (unit.type() === UnitType.Warship &&
          unit.warshipState().state === "docked")
      ) {
        continue;
      }

      const type = unit.type();

      if (includeTradeShips && type === UnitType.TradeShip) {
        if (submarineComponent === undefined) {
          submarineComponent = mg.getWaterComponent(this.submarine.tile());
          hasReachablePort =
            submarineComponent !== null &&
            owner
              .units(UnitType.Port)
              .some(
                (port) =>
                  port.isActive() &&
                  !port.isMarkedForDeletion() &&
                  !port.isUnderConstruction() &&
                  mg.hasWaterComponent(port.tile(), submarineComponent!),
              );
          patrolTile = this.submarine.submarineState().patrolTile;
          patrolRangeSquared = config.submarinePatrolRange() ** 2;
        }
        if (
          !hasReachablePort ||
          patrolTile === undefined ||
          unit.isSafeFromPirates() ||
          unit.targetUnit()?.owner() === owner ||
          unit.targetUnit()?.owner().isFriendly(owner)
        ) {
          continue;
        }
        if (
          mg.euclideanDistSquared(patrolTile, unit.tile()) > patrolRangeSquared!
        ) {
          continue;
        }
      }

      const typePriority =
        type === UnitType.TransportShip ? 0 : type === UnitType.Warship ? 1 : 2;

      if (
        bestUnit === undefined ||
        typePriority < bestTypePriority ||
        (typePriority === bestTypePriority && distSquared < bestDistSquared)
      ) {
        bestUnit = unit;
        bestTypePriority = typePriority;
        bestDistSquared = distSquared;
      }
    }

    return bestUnit;
  }

  private startRepairRetreat(): void {
    const portTile = this.findNearestPort();
    if (portTile === undefined) {
      return;
    }
    this.submarine.updateSubmarineState({
      retreatPort: portTile,
      state: "retreating",
    });
    this.activeHealingRemainder = 0;
    this.submarine.setTargetUnit(undefined);
  }

  private cancelRepairRetreat(clearTargetTile = true): void {
    this.activeHealingRemainder = 0;
    this.submarine.updateSubmarineState({
      state: "patrolling",
      retreatPort: undefined,
    });
    if (clearTargetTile) {
      this.submarine.setTargetTile(undefined);
    }
  }

  private handleManualPatrolOverride(): void {
    const patrolTile = this.submarine.submarineState().patrolTile;
    if (
      this.lastObservedPatrolTile !== undefined &&
      patrolTile !== this.lastObservedPatrolTile
    ) {
      this.lastManualMoveTickRetreatDisabled = this.mg.ticks();
      if (this.submarine.submarineState().state !== "patrolling") {
        this.cancelRepairRetreat(false);
      }
    }
    this.lastObservedPatrolTile = patrolTile;
  }

  private handleRepairRetreat(): boolean {
    if (this.submarine.submarineState().state === "patrolling") {
      return false;
    }

    const retreatAggroTarget = this.findRetreatAggroTarget();
    if (retreatAggroTarget) {
      this.submarine.setTargetUnit(retreatAggroTarget);
      this.shootTarget();
      // Fall through — continue retreating toward port even while firing back.
    }

    if (!this.refreshRetreatPortTile()) {
      this.cancelRepairRetreat();
      return false;
    }

    // Only clear the target when there's no active aggro target this tick.
    if (!retreatAggroTarget) {
      this.submarine.setTargetUnit(undefined);
    }

    const retreatPortTile = this.submarine.submarineState().retreatPort;
    if (retreatPortTile === undefined) {
      return false;
    }

    const dockingRadius = this.mg.config().submarineDockingRange();
    const dockingRadiusSq = dockingRadius * dockingRadius;
    const distToPort = this.mg.euclideanDistSquared(
      this.submarine.tile(),
      retreatPortTile,
    );

    if (distToPort <= dockingRadiusSq) {
      // Check if the port has capacity available (excluding this submarine from capacity check)
      const port = this.submarine
        .owner()
        .units(UnitType.Port)
        .find((p) => p.tile() === retreatPortTile);
      if (port && !this.isPortFullOfHealing(port, this.submarine)) {
        // Port has capacity - dock here
        this.submarine.setTargetTile(undefined);
        this.submarine.updateSubmarineState({
          state: "docked",
        });
        return true;
      } else {
        // Port is full - wait near port, but leave if already fully healed
        if (this.isFullyHealed()) {
          this.cancelRepairRetreat();
          return false;
        }
        return true;
      }
    }

    this.submarine.setTargetTile(retreatPortTile);
    const result = this.pathfinder.next(this.submarine.tile(), retreatPortTile);
    switch (result.status) {
      case PathStatus.COMPLETE:
        this.submarine.move(result.node);
        if (result.node === retreatPortTile) {
          this.submarine.setTargetTile(undefined);
        }
        break;
      case PathStatus.NEXT:
        this.submarine.move(result.node);
        break;
      case PathStatus.NOT_FOUND: {
        const newPort = this.findNearestAvailablePortTile();
        this.submarine.updateSubmarineState({
          retreatPort: newPort,
        });
        if (newPort === undefined) {
          this.cancelRepairRetreat();
        }
        break;
      }
    }

    return true;
  }

  private refreshRetreatPortTile(): boolean {
    const ports = this.submarine.owner().units(UnitType.Port);
    if (ports.length === 0) {
      return false;
    }

    const currentRetreatPort = this.submarine.submarineState().retreatPort;

    // Check if current retreat port still exists
    const currentPortExists =
      currentRetreatPort !== undefined &&
      ports.some((port) => port.tile() === currentRetreatPort);

    if (!currentPortExists) {
      const newPort = this.findNearestAvailablePortTile();
      this.submarine.updateSubmarineState({
        retreatPort: newPort,
      });
      return newPort !== undefined;
    }

    // Check if current port is now full of healing (not counting arrived submarines)
    const currentPort = ports.find((p) => p.tile() === currentRetreatPort);
    if (currentPort && this.isPortFullOfHealing(currentPort)) {
      // Current port is at healing capacity, look for alternatives
      const alternativePort = this.findNearestAvailablePort();
      if (alternativePort) {
        this.submarine.updateSubmarineState({
          retreatPort: alternativePort,
        });
      }
      return this.submarine.submarineState().retreatPort !== undefined;
    }

    // Check if a significantly closer port is available
    const closerPort = this.findBetterPortTile();
    if (closerPort && closerPort !== currentRetreatPort) {
      this.submarine.updateSubmarineState({
        retreatPort: closerPort,
      });
      return true;
    }

    return true;
  }

  private isPortFullOfHealing(port: Unit, excludeShip?: Unit): boolean {
    const maxShipsHealing = port.level();
    return this.dockedShipsAtPort(port, excludeShip).length >= maxShipsHealing;
  }

  private dockedShipsAtPort(port: Unit, excludeShip?: Unit): Unit[] {
    const dockingRadius = this.mg.config().submarineDockingRange();
    const owner = this.submarine.owner();

    return this.mg
      .nearbyUnits(port.tile(), dockingRadius, [
        UnitType.Submarine,
        UnitType.Warship,
      ])
      .filter(({ unit: ship }) => {
        if (excludeShip && ship === excludeShip) return false;
        if (ship.owner() !== owner) return false;
        const state =
          ship.type() === UnitType.Submarine
            ? ship.submarineState().state
            : ship.warshipState().state;
        if (state === "patrolling") return false;
        if (ship.targetTile() !== undefined) return false;
        return true;
      })
      .map(({ unit }) => unit);
  }

  private applyActiveDockedHealing(): void {
    const dockedPort = this.currentRetreatPort();
    if (!dockedPort) {
      return;
    }

    const dockedShips = this.dockedShipsAtPort(dockedPort);
    if (!dockedShips.some((ship) => ship === this.submarine)) {
      return;
    }

    const healingPool =
      dockedPort.level() * this.mg.config().submarinePortHealingBonusPerLevel();
    if (healingPool <= 0 || dockedShips.length === 0) {
      return;
    }

    // Preserve fractional split healing over time with a per-ship remainder.
    const activeHealing = healingPool / dockedShips.length;
    this.activeHealingRemainder += activeHealing;
    const integerHealing = Math.floor(this.activeHealingRemainder);
    if (integerHealing <= 0) {
      return;
    }

    this.activeHealingRemainder -= integerHealing;
    this.submarine.modifyHealth(integerHealing);
  }

  private currentRetreatPort(): Unit | undefined {
    const retreatPort = this.submarine.submarineState().retreatPort;
    if (retreatPort === undefined) {
      return undefined;
    }

    return this.submarine
      .owner()
      .units(UnitType.Port)
      .find((port) => port.tile() === retreatPort);
  }

  private nearestAvailablePortTile(
    excludeShip?: Unit,
  ): { tile: TileRef; distSquared: number } | undefined {
    const ports = this.submarine.owner().units(UnitType.Port);
    const submarineTile = this.submarine.tile();
    const submarineComponent = this.mg.getWaterComponent(submarineTile);
    if (submarineComponent === null) {
      return undefined;
    }

    let bestTile: TileRef | undefined = undefined;
    let bestDistance = Infinity;

    for (const port of ports) {
      if (this.isPortFullOfHealing(port, excludeShip)) {
        continue;
      }

      const portTile = port.tile();
      if (!this.mg.hasWaterComponent(portTile, submarineComponent)) {
        continue;
      }

      const distance = this.mg.euclideanDistSquared(submarineTile, portTile);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestTile = portTile;
      }
    }

    return bestTile !== undefined
      ? { tile: bestTile, distSquared: bestDistance }
      : undefined;
  }

  private findNearestAvailablePort(): TileRef | undefined {
    return this.nearestAvailablePortTile()?.tile;
  }

  private findBetterPortTile(): TileRef | undefined {
    const result = this.nearestAvailablePortTile();
    if (!result) return undefined;

    let currentDistance = Infinity;
    const currentRetreatPort = this.submarine.submarineState().retreatPort;
    if (currentRetreatPort !== undefined) {
      currentDistance = this.mg.euclideanDistSquared(
        this.submarine.tile(),
        currentRetreatPort,
      );
    }

    if (
      result.distSquared <
      currentDistance * this.mg.config().submarinePortSwitchThreshold()
    ) {
      return result.tile;
    }
    return undefined;
  }

  private findNearestAvailablePortTile(): TileRef | undefined {
    return this.nearestAvailablePortTile(this.submarine)?.tile;
  }

  private manageStealth(): void {
    const state = this.submarine.submarineState();
    const config = this.mg.config();

    // Decrease submerge cooldown
    if (state.submergeCooldown > 0) {
      this.submarine.updateSubmarineState({
        submergeCooldown: state.submergeCooldown - 1,
      });
    }

    // If submerged, check if we should surface
    if (state.isSubmerged) {
      // Surface if we have a target in range (to shoot)
      const target = this.submarine.targetUnit();
      if (
        target &&
        (target.type() === UnitType.TransportShip ||
          target.type() === UnitType.Warship)
      ) {
        const distSquared = this.mg.euclideanDistSquared(
          this.submarine.tile(),
          target.tile(),
        );
        const attackRange = config.submarineTargettingRange();
        if (distSquared <= attackRange * attackRange) {
          this.submarine.updateSubmarineState({
            isSubmerged: false,
            submergeCooldown: config.submarineSubmergeCooldown(),
          });
        }
      }
      // Also surface if retreating or docked
      if (state.state !== "patrolling") {
        this.submarine.updateSubmarineState({
          isSubmerged: false,
          submergeCooldown: config.submarineSubmergeCooldown(),
        });
      }
    } else {
      // If surfaced, check if we should submerge
      // Submerge after being out of combat for a while, or when patrolling without target
      if (
        state.state === "patrolling" &&
        !state.isInCombat &&
        !this.submarine.targetUnit() &&
        state.submergeCooldown === 0
      ) {
        this.submarine.updateSubmarineState({
          isSubmerged: true,
        });
      }
    }
  }

  private shootTarget() {
    this.submarine.updateSubmarineState({ isInCombat: true });
    const shellAttackRate = this.mg.config().submarineShellAttackRate();
    if (this.mg.ticks() - this.lastShellAttack > shellAttackRate) {
      if (this.submarine.targetUnit()?.type() !== UnitType.TransportShip) {
        // Submarines don't need to reload when attacking transport ships.
        this.lastShellAttack = this.mg.ticks();
      }
      this.mg.addExecution(
        new ShellExecution(
          this.submarine.tile(),
          this.submarine.owner(),
          this.submarine,
          this.submarine.targetUnit()!,
        ),
      );
      if (!this.submarine.targetUnit()!.hasHealth()) {
        // Don't send multiple shells to target that can be oneshotted
        this.alreadySentShell.add(this.submarine.targetUnit()!);
        this.submarine.setTargetUnit(undefined);
        return;
      }
    }
  }

  private huntDownTradeShip() {
    this.submarine.updateSubmarineState({ isInCombat: true });
    // Surface to capture trade ship
    if (this.submarine.submarineState().isSubmerged) {
      this.submarine.updateSubmarineState({
        isSubmerged: false,
        submergeCooldown: this.mg.config().submarineSubmergeCooldown(),
      });
    }
    for (let i = 0; i < 2; i++) {
      const target = this.submarine.targetUnit()!;
      const targetTile = target.tile();
      const dist = this.mg.manhattanDist(this.submarine.tile(), targetTile);

      if (dist <= 5) {
        this.submarine.owner().captureUnit(target);
        this.submarine.recordTradeCapture();
        this.submarine.setTargetUnit(undefined);
        this.submarine.touch();
        return;
      }

      // When close, the minimap (2x scale) produces diagonal upscaled paths that
      // make it hard to converge. Use direct greedy movement instead.
      if (dist <= 20) {
        const nextTile = this.bestNeighborToward(targetTile);
        if (nextTile !== undefined) {
          this.submarine.move(nextTile);
          continue;
        }
      }

      const result = this.pathfinder.next(this.submarine.tile(), targetTile, 5);
      switch (result.status) {
        case PathStatus.COMPLETE:
          this.submarine.owner().captureUnit(target);
          this.submarine.recordTradeCapture();
          this.submarine.setTargetUnit(undefined);
          this.submarine.touch();
          return;
        case PathStatus.NEXT:
          this.submarine.move(result.node);
          break;
        case PathStatus.NOT_FOUND:
          console.log(`path not found to target`);
          break;
      }
    }
  }

  private bestNeighborToward(targetTile: TileRef): TileRef | undefined {
    const submarineTile = this.submarine.tile();
    let best: TileRef | undefined;
    let bestDist = this.mg.manhattanDist(submarineTile, targetTile);
    this.mg.forEachNeighbor(submarineTile, (neighbor) => {
      if (!this.mg.isWater(neighbor)) return;
      const d = this.mg.manhattanDist(neighbor, targetTile);
      if (d < bestDist) {
        bestDist = d;
        best = neighbor;
      }
    });
    return best;
  }

  private patrol() {
    if (this.submarine.targetTile() === undefined) {
      this.submarine.setTargetTile(this.randomTile());
      if (this.submarine.targetTile() === undefined) {
        return;
      }
    }

    const result = this.pathfinder.next(
      this.submarine.tile(),
      this.submarine.targetTile()!,
    );
    switch (result.status) {
      case PathStatus.COMPLETE:
        this.submarine.setTargetTile(undefined);
        this.submarine.move(result.node);
        break;
      case PathStatus.NEXT:
        this.submarine.move(result.node);
        break;
      case PathStatus.NOT_FOUND: {
        console.log(`path not found to target`);
        this.submarine.setTargetTile(undefined);
        break;
      }
    }
  }

  isActive(): boolean {
    return this.submarine?.isActive();
  }

  isDocked(): boolean {
    return (
      (this.submarine?.submarineState().state ?? "patrolling") === "docked"
    );
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }

  randomTile(allowShoreline: boolean = false): TileRef | undefined {
    let submarinePatrolRange = this.mg.config().submarinePatrolRange();
    const maxAttemptBeforeExpand: number = 500;
    let attempts: number = 0;
    let expandCount: number = 0;

    // Get submarine's water component for connectivity check
    const submarineComponent = this.mg.getWaterComponent(this.submarine.tile());

    const patrolTile = this.submarine.submarineState().patrolTile;
    // A non-integer or out-of-range patrolTile makes mg.x()/mg.y() return
    // undefined, so every candidate coordinate below is NaN, isValidCoord is
    // always false, and the loop's out-of-bounds `continue` (which does not
    // advance expandCount) spins forever, hanging the whole synchronous sim.
    // Bail out instead of trusting patrolTile is a valid tile.
    if (patrolTile === undefined || !this.mg.isValidRef(patrolTile)) {
      return undefined;
    }

    while (expandCount < 3) {
      const x =
        this.mg.x(patrolTile) +
        this.random.nextInt(
          -submarinePatrolRange / 2,
          submarinePatrolRange / 2,
        );
      const y =
        this.mg.y(patrolTile) +
        this.random.nextInt(
          -submarinePatrolRange / 2,
          submarinePatrolRange / 2,
        );
      if (!this.mg.isValidCoord(x, y)) {
        continue;
      }
      const tile = this.mg.ref(x, y);
      if (
        !this.mg.isWater(tile) ||
        (!allowShoreline && this.mg.isShoreline(tile))
      ) {
        attempts++;
        if (attempts === maxAttemptBeforeExpand) {
          expandCount++;
          attempts = 0;
          submarinePatrolRange =
            submarinePatrolRange + Math.floor(submarinePatrolRange / 2);
        }
        continue;
      }
      // Check water component connectivity
      if (
        submarineComponent !== null &&
        !this.mg.hasWaterComponent(tile, submarineComponent)
      ) {
        attempts++;
        if (attempts === maxAttemptBeforeExpand) {
          expandCount++;
          attempts = 0;
          submarinePatrolRange =
            submarinePatrolRange + Math.floor(submarinePatrolRange / 2);
        }
        continue;
      }
      return tile;
    }
    console.warn(
      `Failed to find random tile for submarine for ${this.submarine.owner().name()}`,
    );
    if (!allowShoreline) {
      // If we failed to find a tile on the ocean, try again but allow shoreline
      return this.randomTile(true);
    }
    return undefined;
  }

  snapshot(w: SnapshotWriter): ExecRecord {
    return SubmarineExecutionSnapshot.write({
      input: isUnit(this.input)
        ? { unit: w.unit(this.input) }
        : {
            owner: w.player(this.input.owner),
            patrolTile: this.input.patrolTile,
          },
      initialized: this.mg !== undefined,
      random: this.random === undefined ? null : w.random(this.random),
      submarine: this.submarine === undefined ? null : w.unit(this.submarine),
      pathfinder:
        this.pathfinder === undefined
          ? null
          : waterPathFinderState(this.pathfinder),
      lastShellAttack: this.lastShellAttack,
      alreadySentShell: [...this.alreadySentShell].map((u) => w.unit(u)),
      lastManualMoveTickRetreatDisabled: this.lastManualMoveTickRetreatDisabled,
      lastObservedPatrolTile: this.lastObservedPatrolTile,
      activeHealingRemainder: this.activeHealingRemainder,
      lastEmittedCombat: this.lastEmittedCombat,
    });
  }

  restoreSnapshot(s: SubmarineExecutionState, r: SnapshotReader): void {
    this.input =
      "unit" in s.input
        ? r.unit(s.input.unit)
        : { owner: r.player(s.input.owner), patrolTile: s.input.patrolTile };
    if (s.initialized) this.mg = r.game;
    if (s.random !== null) this.random = r.random(s.random);
    if (s.submarine !== null) this.submarine = r.unit(s.submarine);
    if (s.pathfinder !== null) {
      this.pathfinder = restoreWaterPathFinder(r.game, s.pathfinder);
    }
    this.lastShellAttack = s.lastShellAttack;
    this.alreadySentShell = new Set(s.alreadySentShell.map((i) => r.unit(i)));
    this.lastManualMoveTickRetreatDisabled =
      s.lastManualMoveTickRetreatDisabled;
    this.lastObservedPatrolTile = s.lastObservedPatrolTile;
    this.activeHealingRemainder = s.activeHealingRemainder;
    this.lastEmittedCombat = s.lastEmittedCombat;
  }
}

const SubmarineExecutionStateSchema = z.object({
  /** An existing submarine, or the params to build one in init(). */
  input: z.union([
    z.object({ unit: zRef() }),
    z.object({ owner: zPlayerRef(), patrolTile: zTile() }),
  ]),
  initialized: z.boolean(),
  random: zRandom().nullable(),
  /** Null before init() or when the spawn failed. */
  submarine: zRef().nullable(),
  pathfinder: WaterPathFinderSchema.nullable(),
  lastShellAttack: zInt(),
  /** In insertion order. */
  alreadySentShell: z.array(zRef()),
  lastManualMoveTickRetreatDisabled: zInt(),
  lastObservedPatrolTile: zTile().optional(),
  activeHealingRemainder: zNum(),
  lastEmittedCombat: z.boolean(),
});
type SubmarineExecutionState = z.infer<typeof SubmarineExecutionStateSchema>;

export const SubmarineExecutionSnapshot = execSnapshotType({
  name: "Submarine",
  version: 1,
  schema: SubmarineExecutionStateSchema,
  cls: () => SubmarineExecution,
});
