import { TileRef } from "@openfront/engine-api/game/GameMap";
import { UnitType } from "@openfront/engine-api/game/GameTypes";
import { zNum, zPlayerRef } from "@openfront/engine-lib/snapshot/SnapshotType";
import { z } from "zod";
import { Execution, Game, Player } from "../game/Game";
import { execSnapshotType } from "../snapshot/ExecutionSnapshot";
import type {
  ExecRecord,
  SnapshotReader,
  SnapshotWriter,
} from "../snapshot/SnapshotContext";

export class MoveSubmarineExecution implements Execution {
  constructor(
    private owner: Player,
    private unitIds: number[],
    private position: TileRef,
  ) {}

  init(mg: Game, _ticks: number): void {
    if (!mg.isValidRef(this.position)) {
      console.warn(`MoveSubmarineExecution: position ${this.position} not valid`);
      return;
    }
    // Get water component of new TargetTile for connectivity check
    const newPatrolTileWaterComponent = mg.getWaterComponent(this.position);
    // Cache submarine list and build a lookup map — avoids repeated iteration
    const submarineMap = new Map(
      this.owner.units(UnitType.Submarine).map((u) => [u.id(), u]),
    );
    // Deduplicate ids so each submarine is only moved once
    for (const unitId of new Set(this.unitIds)) {
      const submarine = submarineMap.get(unitId);
      if (!submarine) {
        console.warn(`MoveSubmarineExecution: submarine ${unitId} not found`);
        continue;
      }
      if (!submarine.isActive()) {
        console.warn(`MoveSubmarineExecution: submarine ${unitId} is not active`);
        continue;
      }
      // Do not update the submarine's patrolTile if it is in a different Water Component
      if (!mg.hasWaterComponent(submarine.tile(), newPatrolTileWaterComponent!)) {
        continue;
      }
      submarine.updateSubmarineState({
        patrolTile: this.position,
      });
      submarine.setTargetTile(undefined);
    }
  }

  tick(_ticks: number): void {}

  isActive(): boolean {
    return false;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }

  snapshot(w: SnapshotWriter): ExecRecord {
    return MoveSubmarineExecutionSnapshot.write({
      owner: w.player(this.owner),
      unitIds: [...this.unitIds],
      position: this.position,
    });
  }

  restoreSnapshot(s: MoveSubmarineState, r: SnapshotReader): void {
    this.owner = r.player(s.owner);
    this.unitIds = s.unitIds;
    this.position = s.position;
  }
}

// position is untrusted intent data (validated in init), so any number.
const MoveSubmarineStateSchema = z.object({
  owner: zPlayerRef(),
  unitIds: z.array(zNum()),
  position: zNum(),
});
type MoveSubmarineState = z.infer<typeof MoveSubmarineStateSchema>;

export const MoveSubmarineExecutionSnapshot = execSnapshotType({
  name: "MoveSubmarine",
  version: 1,
  schema: MoveSubmarineStateSchema,
  cls: () => MoveSubmarineExecution,
});