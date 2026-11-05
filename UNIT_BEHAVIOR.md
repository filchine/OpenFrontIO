# Unit & NPC Behavior Reference

This document describes the behavior of all unit types and NPC (Nation) AI in OpenFront.io.

## Unit Types

### Structures (Buildable on Land)

| Unit | Description | Key Behavior |
|------|-------------|--------------|
| **City** | Capital structure; produces gold & troops | Level increases gold/troop output; captures adjacent tiles; can be upgraded |
| **Port** | Builds naval units (Warship, Submarine); heals nearby naval units | Required for Warship/Submarine construction; heals naval units in range (passive + active when docked); level = max ships healing simultaneously |
| **Factory** | Produces troops over time | Troop production scales with level; captures adjacent tiles |
| **Defense Post** | Automatically attacks adjacent enemy tiles | Fires at enemy tiles in range; consumes troops from garrison |
| **SAM Launcher** | Shoots down incoming nukes | Intercepts Atom Bombs, Hydrogen Bombs, MIRVs, MIRV Warheads; can be upgraded for increased range |
| **Missile Silo** | Launches nukes (Atom Bomb, Hydrogen Bomb, MIRV) | Cooldown between launches; can be upgraded; MIRVs split into multiple warheads |
| **Factory** | Produces troops over time | Troop production scales with level; captures adjacent tiles |

### Naval Units (Built at Ports)

| Unit | Description | Key Behavior |
|------|-------------|--------------|
| **Warship** | Surface combat vessel | Patrols around a patrol tile; attacks Transport Ships, Trade Ships, and enemy Warships in range; retreats to Port to heal when damaged; can capture Trade Ships |
| **Submarine** | Stealth underwater vessel | **Submerges** when not in combat (invisible to Warships); surfaces to attack Transport Ships and Warships in range; hunts Trade Ships when surfaced; retreats to Port to heal when damaged; immune to Warship targeting while submerged |
| **Transport Ship** | Moves troops across water | Carries troops from tile to tile; vulnerable to Warship/Submarine attack; can be captured |
| **Trade Ship** | Generates gold by trading | Sails between friendly Ports; generates gold per trip; can be captured by Warships/Submarines; avoids pirates |

### Land Units

| Unit | Description | Key Behavior |
|------|-------------|--------------|
| **Train** | Moves troops on rail network | Engine + Carriages; follows rail network; can be upgraded |
| **Shell** | Projectile fired by Warships/Submarines | Travels to target; deals damage on impact |
| **SAM Missile** | Projectile fired by SAM Launchers | Intercepts incoming nukes |

### Nuclear Units

| Unit | Description | Key Behavior |
|------|-------------|--------------|
| **Atom Bomb** | Single-target nuke | Destroys units/structures in radius; can be intercepted by SAMs |
| **Hydrogen Bomb** | Large-area nuke | Wider destruction radius; longer cooldown |
| **MIRV** | Multiple Independently Targetable Reentry Vehicle | Splits into multiple MIRV Warheads mid-flight |
| **MIRV Warhead** | Individual warhead from MIRV | Each targets a separate tile |

---

## Submarine Deep Dive

### Submerging Mechanics
- **Submerged State**: Invisible to Warships (Warships cannot target submerged submarines)
- **Auto-submerge**: Submerges after being out of combat for a while, with no target, and cooldown ready
- **Surface to Attack**: Surfaces when:
  - Target (Transport Ship/Warship) enters attack range
  - Retreating to port for repairs
  - Docked at port
  - Hunting Trade Ship (must surface to capture)

### Combat Behavior
- **Priority Targets**: Transport Ships > Warships > Trade Ships
- **Attack Range**: Fires shells at targets in range
- **Cooldown**: Shell attack rate configurable; no reload needed vs Transport Ships
- **Veterancy**: Gains veterancy from kills; increases max health and damage

### Movement & Patrol
- **Patrol Tile**: Sets a patrol center; moves randomly within patrol range
- **Manual Override**: Player can set new patrol tile (disables auto-retreat temporarily)
- **Water Component**: Only moves within connected water body

### Healing & Retreat
- **Passive Healing**: Heals near friendly Ports (configurable range)
- **Active Healing (Docked)**: Faster healing when docked at Port; limited by Port level
- **Retreat Threshold**: Retreats to nearest Port when health below percentage threshold
- **Port Capacity**: Port level = max ships healing simultaneously

### Key Config Values
- `submarineTargettingRange` — Attack range
- `submarinePatrolRange` — Patrol area radius
- `submarineRetreatHealthPercent` — Health % to trigger retreat
- `submarinePassiveHealing` — HP/tick near Port
- `submarinePassiveHealingRange` — Distance for passive healing
- `submarinePortHealingBonusPerLevel` — Active healing bonus per Port level
- `submarineSubmergeCooldown` — Ticks before can submerge again
- `submarineDockingRange` — Distance to dock at Port

---

## Nation (NPC) Behavior

Nations are AI-controlled players that spawn on the map and act autonomously. They have different difficulty levels affecting their aggression and reaction speed.

### Difficulty Settings
| Difficulty | Attack Rate (ticks) | Notes |
|------------|---------------------|-------|
| Easy | 65-100 | Slower reactions; no warship tracking |
| Medium | 55-70 | Standard |
| Hard | 45-60 | Faster reactions; tracks enemy ships |
| Impossible | 30-50 | Very fast reactions; tracks enemy ships |

### Core Behaviors (per tick cycle)

1. **Structure Management** (`NationStructureBehavior`)
   - Builds Cities, Ports, Factories, Defense Posts, SAM Launchers, Missile Silos
   - Prioritizes Ports if none exist
   - Builds Missile Silos for nuclear capability
   - Upgrades structures when affordable

2. **Land Attacks** (`NationAttackBehavior`)
   - Attacks adjacent enemy tiles using troops
   - Reserves portion of troops for defense (`reserveRatio` ~30-40%)
   - Expands into free land (`expandRatio` ~10-20%)
   - Triggers attacks when troop advantage exceeds `triggerRatio` (~50-60%)

3. **Naval Warfare** (`NationWarshipBehavior`)
   - Spawns Warships at Ports
   - Tracks and retaliates against enemy ships (Hard+ difficulties)
   - Counters enemy warship infestations
   - Transports troops via Transport Ships for amphibious landings

4. **Nuclear Strategy** (`NationNukeBehavior`, `NationMIRVBehavior`)
   - Builds Missile Silos
   - Launches Atom Bombs, Hydrogen Bombs, MIRVs at high-value targets
   - Considers SAM coverage before launching
   - Follows up on strikes

5. **Diplomacy** (`NationAllianceBehavior`, `NationEmojiBehavior`)
   - Forms/alliance extensions with other Nations
   - Reacts to embargos (applies relation malus)
   - Sends emojis (casual/friendly/taunt)
   - On higher difficulties in Team games: embargoes all non-team players

6. **Embargo Management**
   - Tracks manual embargos against it
   - Applies relation penalties to embargoing players
   - On Hard/Impossible in Team mode: auto-embargoes non-team players

### Spawn Phase
- Nations without fixed spawn cell: random spawn via `SpawnExecution`
- Nations with fixed spawn cell: spawn near manifest position (±25 tiles)
- Re-spawns periodically during spawn phase to "hop" locations
- Team spawn areas respected in Team games

### Tutorial Mode
- Tutorial Nations only expand into free land
- No attacks, boats, alliances, or structures (except scripted)
- Collapse when player takes most of their territory
- Scripted Silo and Warship behaviors for onboarding

### Key Ratios (randomized per nation)
- `triggerRatio`: 0.50-0.60 — Troop advantage needed to attack
- `reserveRatio`: 0.30-0.40 — Troops kept in reserve
- `expandRatio`: 0.10-0.20 — Focus on free land vs enemy

---

## Build Menu Hotkeys (Default)

| Key | Unit | Notes |
|-----|------|-------|
| 1 | City | |
| 2 | Factory | |
| 3 | Port | |
| 4 | Defense Post | |
| 5 | Missile Silo | |
| 6 | SAM Launcher | |
| 7 | **Warship / Submarine** | **Tap to cycle: Warship → Submarine → None** |
| 8 | Atom Bomb | |
| 9 | Hydrogen Bomb | |
| 0 | MIRV | |

---

## Interaction Rules Summary

| Attacker \ Target | City | Port | Factory | Defense Post | SAM | Silo | Warship | Submarine | Transport | Trade Ship |
|-------------------|------|------|---------|--------------|-----|------|---------|-----------|-----------|------------|
| **Warship** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ (submerged) | ✓ | ✓ |
| **Submarine** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ (surfaced) | — | ✓ | ✓ (capture) |
| **Transport Ship** | ✓ (troops) | ✓ (troops) | ✓ (troops) | ✓ (troops) | ✓ (troops) | ✓ (troops) | ✗ | ✗ | — | — |
| **Nuke** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (surfaced) | ✓ | ✓ |
| **SAM** | — | — | — | — | — | — | — | — | — | — (nukes only) |

*✓ = can target/damage; ✗ = cannot target; — = N/A*

---

## Version History

- **Submarine added**: v0.35+ (stealth naval unit with submerge mechanics)
- **Nation Warship Behavior**: Tracks enemy ships on Hard/Impossible
- **Nation MIRV Behavior**: Considers MIRV strikes independently
- **Naval Build Hotkey Cycling**: Tap '7' to cycle Warship → Submarine → None