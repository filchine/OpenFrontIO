import { assetUrl } from "@openfront/shared/AssetUrls";

const warshipIcon = assetUrl("images/BattleshipIconWhite.svg");
const cityIcon = assetUrl("images/CityIconWhite.svg");
const factoryIcon = assetUrl("images/FactoryIconWhite.svg");
const goldCoinIcon = assetUrl("images/GoldCoinIcon.svg");
const mirvIcon = assetUrl("images/MIRVIcon.svg");
const missileSiloIcon = assetUrl("images/MissileSiloIconWhite.svg");
const hydrogenBombIcon = assetUrl("images/MushroomCloudIconWhite.svg");
const atomBombIcon = assetUrl("images/NukeIconWhite.svg");
const portIcon = assetUrl("images/PortIcon.svg");
const samlauncherIcon = assetUrl("images/SamLauncherIconWhite.svg");
const shieldIcon = assetUrl("images/ShieldIconWhite.svg");
const submarineIcon = assetUrl("images/BattleshipIconWhite.svg");

export interface BuildItemDisplay {
  unitType: PlayerBuildableUnitType;
  icon: string;
  description?: string;
  key?: string;
  countable?: boolean;
}

const buildTable: BuildItemDisplay[][] = [
  [
    {
      unitType: UnitType.AtomBomb,
      icon: atomBombIcon,
      description: "build_menu.desc.atom_bomb",
      key: "unit_type.atom_bomb",
      countable: false,
    },
    {
      unitType: UnitType.MIRV,
      icon: mirvIcon,
      description: "build_menu.desc.mirv",
      key: "unit_type.mirv",
      countable: false,
    },
    {
      unitType: UnitType.HydrogenBomb,
      icon: hydrogenBombIcon,
      description: "build_menu.desc.hydrogen_bomb",
      key: "unit_type.hydrogen_bomb",
      countable: false,
    },
    {
      unitType: UnitType.Warship,
      icon: warshipIcon,
      description: "build_menu.desc.warship",
      key: "unit_type.warship",
      countable: true,
    },
    {
      unitType: UnitType.Submarine,
      icon: submarineIcon,
      description: "build_menu.desc.submarine",
      key: "unit_type.submarine",
      countable: true,
    },
    {
      unitType: UnitType.Port,
      icon: portIcon,
      description: "build_menu.desc.port",
      key: "unit_type.port",
      countable: true,
    },
    {
      unitType: UnitType.MissileSilo,
      icon: missileSiloIcon,
      description: "build_menu.desc.missile_silo",
      key: "unit_type.missile_silo",
      countable: true,
    },
    {
      unitType: UnitType.SAMLauncher,
      icon: samlauncherIcon,
      description: "build_menu.desc.sam_launcher",
      key: "unit_type.sam_launcher",
      countable: true,
    },
    {
      unitType: UnitType.DefensePost,
      icon: shieldIcon,
      description: "build_menu.desc.defense_post",
      key: "unit_type.defense_post",
      countable: true,
    },
    {
      unitType: UnitType.City,
      icon: cityIcon,
      description: "build_menu.desc.city",
      key: "unit_type.city",
      countable: true,
    },
    {
      unitType: UnitType.Factory,
      icon: factoryIcon,
      description: "build_menu.desc.factory",
      key: "unit_type.factory",
      countable: true,
    },
  ],
];

export const flattenedBuildTable = buildTable.flat();

@customElement("build-menu")
export class BuildMenu extends LitElement implements Controller {
  public game: GameView;
  public eventBus: EventBus;
  public uiState: UIState;
  private clickedTile: TileRef;
  public playerBuildables: BuildableUnit[] | null = null;
  private filteredBuildTable: BuildItemDisplay[][] = buildTable;
