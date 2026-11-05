import {
  PlayerInfo,
  PlayerType,
  UnitType,
} from "@openfront/engine-api/game/GameTypes";
import { MoveSubmarineExecution } from "@openfront/engine/execution/MoveSubmarineExecution";
import { SubmarineExecution } from "@openfront/engine/execution/SubmarineExecution";
import { WarshipExecution } from "@openfront/engine/execution/WarshipExecution";
import { Game, Player } from "@openfront/engine/game/Game";
import { setup } from "./util/Setup";
import { executeTicks } from "./util/utils";

const coastX = 7;
let game: Game;
let player1: Player;
let player2: Player;

describe("Submarine", () => {
  beforeEach(async () => {
    game = await setup(
      "half_land_half_ocean",
      { infiniteGold: true, instantBuild: true },
      [
        new PlayerInfo("sub captain", PlayerType.Human, null, "player_1_id"),
        new PlayerInfo("enemy captain", PlayerType.Human, null, "player_2_id"),
      ],
    );

    player1 = game.player("player_1_id");
    player2 = game.player("player_2_id");

    executeTicks(game, 50);
  });

  test("Spawns submarine via ConstructionExecution without crashing PackedUnitUpdates", () => {
    player1.conquer(game.ref(coastX, 10));
    player1.buildUnit(UnitType.Port, game.ref(coastX, 10), {});
    game.executeNextTick();

    const waterTile = game.ref(coastX + 2, 10);
    const sub = player1.buildUnit(UnitType.Submarine, waterTile, {
      patrolTile: waterTile,
    });
    game.addExecution(new SubmarineExecution(sub));

    // Executes tick and packs unit updates into Float64Array
    game.executeNextTick();
    expect(sub.isActive()).toBe(true);
    expect(sub.submarineState().isSubmerged).toBe(true);
  });

  test("Warship does not target submerged enemy submarine", () => {
    const subTile = game.ref(coastX + 3, 10);
    const sub = player1.buildUnit(UnitType.Submarine, subTile, {
      patrolTile: subTile,
    });
    game.addExecution(new SubmarineExecution(sub));
    // Let the submarine submerge first
    game.executeNextTick();

    // Put warship far enough away that submarine stays submerged
    const warshipTile = game.ref(coastX + 8, 10);
    const warship = player2.buildUnit(UnitType.Warship, warshipTile, {
      patrolTile: warshipTile,
    });
    game.addExecution(new WarshipExecution(warship));

    executeTicks(game, 5);

    // The warship should never target a submerged submarine
    // (submarine may surface if it detects the warship in range to attack)
    expect(warship.targetUnit()).toBeUndefined();
  });

  test("MoveSubmarineExecution moves submarine to new patrol tile", () => {
    const startTile = game.ref(coastX + 2, 10);
    const targetTile = game.ref(coastX + 6, 10);
    const sub = player1.buildUnit(UnitType.Submarine, startTile, {
      patrolTile: startTile,
    });
    game.addExecution(new SubmarineExecution(sub));
    game.executeNextTick();

    game.addExecution(
      new MoveSubmarineExecution(player1, [sub.id()], targetTile),
    );
    executeTicks(game, 2);

    expect(sub.submarineState().patrolTile).toBe(targetTile);
  });
});