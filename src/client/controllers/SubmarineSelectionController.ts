import { TileRef } from "@openfront/engine-api/game/GameMap";
import { Cell, UnitType } from "@openfront/engine-api/game/GameTypes";
import { EventBus } from "@openfront/shared/EventBus";
import { Controller } from "../Controller";
import {
  CloseViewEvent,
  MouseUpEvent,
  SelectAllSubmarinesEvent,
  TouchEvent,
  UnitSelectionEvent,
  SubmarineSelectionBoxCancelEvent,
  SubmarineSelectionBoxCompleteEvent,
  SubmarineSelectionBoxUpdateEvent,
} from "../InputHandler";
import { MapRenderer } from "../render/gl";
import { TransformHandler } from "../TransformHandler";
import { MoveSubmarineIntentEvent } from "../Transport";
import { GameView, UnitView } from "../view";

const SUBMARINE_SELECTION_RADIUS = 10;

/**
 * Controller for submarine selection state + click handling.
 *
 * Drawing for selection boxes (single + multi) lives in the WebGL
 * SelectionBoxPass (forwarded via UnitSelectionEvent from ClientGameRunner).
 * The drag-rectangle preview is a screen-space DOM overlay (dragRectEl) we
 * own here.
 *
 * This class does not render anything to canvas2D — it's purely a state +
 * click controller. The "Controller" pattern: main-thread analog of the
 * worker's Execution (init + tick + event subscriptions).
 */
export class SubmarineSelectionController implements Controller {
  // Currently selected single submarine (game-logic readers use this; the
  // visual is drawn by WebGL SelectionBoxPass).
  private selectedUnit: UnitView | null = null;
  // Currently multi-selected submarines (shift+drag submarine selection box).
  private multiSelectedSubmarines: UnitView[] = [];

  // Drag rectangle (shift+drag submarine selection box) — a screen-space DOM
  // overlay positioned via inline style.
  private dragRectEl: HTMLDivElement | null = null;

  constructor(
    private game: GameView,
    private eventBus: EventBus,
    private transformHandler: TransformHandler,
    private view: MapRenderer,
  ) {}

  tick() {
    // Prune any destroyed submarines from the multi-selection so callers
    // (move-submarine intent) don't try to act on dead units. The WebGL
    // SelectionBoxPass also drops them automatically.
    this.multiSelectedSubmarines = this.multiSelectedSubmarines.filter((u) =>
      u.isActive(),
    );
  }

  init() {
    this.eventBus.on(UnitSelectionEvent, (e) => this.onUnitSelection(e));

    this.ensureDragRectEl();
    this.eventBus.on(SubmarineSelectionBoxUpdateEvent, (e) => {
      this.updateDragRect(e.startX, e.startY, e.endX, e.endY);
    });
    const clearBox = () => this.hideDragRect();
    this.eventBus.on(SubmarineSelectionBoxCompleteEvent, clearBox);
    this.eventBus.on(SubmarineSelectionBoxCancelEvent, clearBox);
    this.eventBus.on(CloseViewEvent, clearBox);

    // Submarine select/move click flow.
    this.eventBus.on(MouseUpEvent, (e) => this.onMouseUp(e));
    this.eventBus.on(TouchEvent, (e) => this.onTouch(e));
    this.eventBus.on(SubmarineSelectionBoxCompleteEvent, (e) =>
      this.onSelectionBoxComplete(e),
    );
    this.eventBus.on(SelectAllSubmarinesEvent, () => this.onSelectAllSubmarines());
  }

  /**
   * Lazily create the shift+drag rectangle overlay. Screen-space DOM element,
   * pointer-events: none so it doesn't intercept the drag itself. z-index
   * sits above the WebGL/canvas2D map canvases but below HUD modals.
   */
  private ensureDragRectEl(): void {
    if (this.dragRectEl !== null) return;
    const el = document.createElement("div");
    el.id = "submarine-drag-rect";
    el.style.position = "fixed";
    el.style.pointerEvents = "none";
    el.style.display = "none";
    el.style.zIndex = "30";
    el.style.borderStyle = "dashed";
    el.style.borderWidth = "1px";
    el.style.boxSizing = "border-box";
    document.body.appendChild(el);
    this.dragRectEl = el;
  }

  private updateDragRect(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
  ): void {
    const el = this.dragRectEl;
    if (el === null) return;
    const x1 = Math.min(startX, endX);
    const y1 = Math.min(startY, endY);
    const w = Math.abs(endX - startX);
    const h = Math.abs(endY - startY);

    // Color from the local player's territory tint (matches the canvas2D look).
    const myPlayer = this.game.myPlayer();
    const base = myPlayer ? myPlayer.territoryColor().lighten(0.2) : null;
    const border = base
      ? base.alpha(0.85).toRgbString()
      : "rgba(100, 255, 150, 0.85)"; // Different color for submarines (greenish)
    const fill = base
      ? base.alpha(0.06).toRgbString()
      : "rgba(100, 255, 150, 0.06)";

    el.style.left = `${x1}px`;
    el.style.top = `${y1}px`;
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
    el.style.borderColor = border;
    el.style.backgroundColor = fill;
    el.style.display = "block";
  }

  private hideDragRect(): void {
    if (this.dragRectEl !== null) this.dragRectEl.style.display = "none";
  }

  /**
   * Find player-owned submarines near the given cell, sorted by distance.
   */
  private findSubmarinesNearCell(clickRef: TileRef): UnitView[] {
    const myPlayer = this.game.myPlayer();
    if (!myPlayer) return [];
    return this.game
      .units(UnitType.Submarine)
      .filter(
        (unit) =>
          unit.isActive() &&
          unit.owner() === myPlayer &&
          this.game.manhattanDist(unit.tile(), clickRef) <=
            SUBMARINE_SELECTION_RADIUS,
      )
      .sort(
        (a, b) =>
          this.game.manhattanDist(a.tile(), clickRef) -
          this.game.manhattanDist(b.tile(), clickRef),
      );
  }

  /**
   * Resolve a left-click in the world:
   *  - multi-selected submarines present + clicked water → move them all
   *  - single selected submarine + clicked water → move it, then deselect
   *  - otherwise → if there's a nearby submarine, select the closest one
   */
  private onMouseUp(
    event: MouseUpEvent,
    clickRef?: TileRef,
    nearbySubmarines?: UnitView[],
  ) {
    if (clickRef === undefined) {
      const cell = this.transformHandler.screenToWorldCoordinates(
        event.x,
        event.y,
      );
      if (!this.game.isValidCoord(cell.x, cell.y)) return;
      clickRef = this.game.ref(cell.x, cell.y);
    }
    if (!this.game.isWater(clickRef)) return;

    if (this.multiSelectedSubmarines.length > 0) {
      const myPlayer = this.game.myPlayer();
      const activeIds = this.multiSelectedSubmarines
        .filter((u) => u.isActive() && u.owner() === myPlayer)
        .map((u) => u.id());

      if (activeIds.length > 0) {
        this.eventBus.emit(new MoveSubmarineIntentEvent(activeIds, clickRef));
      }
      this.eventBus.emit(new UnitSelectionEvent(null, false));
      return;
    }

    if (this.selectedUnit) {
      this.eventBus.emit(
        new MoveSubmarineIntentEvent([this.selectedUnit.id()], clickRef),
      );
      this.eventBus.emit(new UnitSelectionEvent(this.selectedUnit, false));
      return;
    }

    nearbySubmarines ??= this.findSubmarinesNearCell(clickRef);
    if (nearbySubmarines.length > 0) {
      this.eventBus.emit(new UnitSelectionEvent(nearbySubmarines[0], true));
    }
  }

  /**
   * Touch handler mirroring mouse-up for submarine selection and movement.
   * Land/empty-water fallback to ContextMenuEvent is handled by WarshipSelectionController.
   */
  private onTouch(event: TouchEvent) {
    const cell = this.transformHandler.screenToWorldCoordinates(
      event.x,
      event.y,
    );
    if (!this.game.isValidCoord(cell.x, cell.y)) return;

    const clickRef = this.game.ref(cell.x, cell.y);
    if (
      this.game.inSpawnPhase() ||
      this.game.config().gameConfig().tutorial === true ||
      !this.game.isWater(clickRef)
    ) {
      return;
    }
    if (this.selectedUnit || this.multiSelectedSubmarines.length > 0) {
      this.onMouseUp(new MouseUpEvent(event.x, event.y), clickRef);
      return;
    }
    const nearbySubmarines = this.findSubmarinesNearCell(clickRef);
    if (nearbySubmarines.length > 0) {
      this.onMouseUp(
        new MouseUpEvent(event.x, event.y),
        clickRef,
        nearbySubmarines,
      );
    }
  }

  /**
   * Resolve a shift+drag selection box: gather all player-owned submarines
   * whose screen position falls inside the rectangle.
   */
  private onSelectionBoxComplete(event: SubmarineSelectionBoxCompleteEvent) {
    const x1 = Math.min(event.startX, event.endX);
    const y1 = Math.min(event.startY, event.endY);
    const x2 = Math.max(event.startX, event.endX);
    const y2 = Math.max(event.startY, event.endY);

    const myPlayer = this.game.myPlayer();
    if (!myPlayer) return;

    const selected = this.game.units(UnitType.Submarine).filter((unit) => {
      if (!unit.isActive() || unit.owner() !== myPlayer) return false;
      const screen = this.transformHandler.worldToScreenCoordinates(
        new Cell(this.game.x(unit.tile()), this.game.y(unit.tile())),
      );
      return (
        screen.x >= x1 && screen.x <= x2 && screen.y >= y1 && screen.y <= y2
      );
    });

    // Clear single selection if we got a box selection
    if (selected.length > 0 && this.selectedUnit) {
      this.eventBus.emit(new UnitSelectionEvent(this.selectedUnit, false));
    }
    this.eventBus.emit(new UnitSelectionEvent(null, true, selected));
  }

  private getAllSubmarines(): UnitView[] {
    const myPlayer = this.game.myPlayer();
    if (!myPlayer) return [];
    return this.game
      .units(UnitType.Submarine)
      .filter((u) => u.isActive() && u.owner() === myPlayer);
  }

  public selectedAllSubmarines(): boolean {
    const allSubmarines = this.getAllSubmarines();
    return (
      allSubmarines.length > 0 &&
      this.multiSelectedSubmarines.length === allSubmarines.length
    );
  }

  private onSelectAllSubmarines() {
    const allSubmarines = this.getAllSubmarines();
    if (allSubmarines.length === 0) return;

    if (this.selectedUnit) {
      this.eventBus.emit(new UnitSelectionEvent(this.selectedUnit, false));
    }
    this.eventBus.emit(
      new UnitSelectionEvent(null, !this.selectedAllSubmarines(), allSubmarines),
    );
  }

  /**
   * Handle the unit selection event (single or multi).
   * When event.units.length > 0 it's a multi-selection from box/select-all.
   * When event.unit is set it's a single submarine selection.
   * When event.isSelected is false it clears all selection state.
   */
  private onUnitSelection(event: UnitSelectionEvent) {
    const units = event.units ?? [];
    const isWarshipSelection =
      (units.length > 0 && units[0].type() !== UnitType.Submarine) ||
      (event.unit !== null && event.unit.type() !== UnitType.Submarine);

    if (isWarshipSelection) {
      this.multiSelectedSubmarines = [];
      this.selectedUnit = null;
      return;
    }

    this.multiSelectedSubmarines = [];
    this.selectedUnit = null;

    if (!event.isSelected) {
      this.view.setSelectedUnits([]);
      return;
    }

    if (units.length > 0) {
      this.multiSelectedSubmarines = units;
      this.view.setSelectedUnits(units.map((u) => u.id()));
    } else {
      this.selectedUnit = event.unit;
      this.view.setSelectedUnits(event.unit ? [event.unit.id()] : []);
    }
  }
}