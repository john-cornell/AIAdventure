# STORY STRUCTURE - World Generation & Story Types

## Overview
The AI Adventure game will feature different story types with specialized world generation phases to create immersive, structured experiences.

## Story Types & World Generation

### 1. Sci-Fi Stories
**World Generation Phase: Galaxy/Solar System Creation**

#### Galaxy Generation
- **Galaxy Type**: Spiral, Elliptical, Irregular, Dwarf
- **Star Systems**: Number of inhabited systems, distance between systems
- **Factions**: Space empires, corporations, independent colonies, alien civilizations
- **Technology Level**: FTL capabilities, weapon systems, communication networks
- **Resources**: Rare minerals, energy sources, habitable planets

#### Solar System Generation
- **Star Type**: Main sequence, red giant, white dwarf, neutron star
- **Planets**: Terrestrial, gas giants, ice worlds, asteroid belts
- **Habitable Zones**: Goldilocks zones, terraformed worlds, space stations
- **Space Infrastructure**: Spaceports, mining operations, research stations
- **Political Control**: Which faction controls the system

#### Planet Generation
- **Environment**: Desert, ocean, jungle, arctic, volcanic, artificial
- **Atmosphere**: Breathable, toxic, thin, dense, artificial
- **Population**: Native species, colonists, mixed populations
- **Technology**: Primitive, advanced, mixed, restricted
- **Resources**: Strategic importance, economic value, scientific interest

### 2. D&D Fantasy Stories
**World Generation Phase: World Map & Dungeon Creation**

#### World Map Generation
- **Continents**: Major landmasses, island chains, floating islands
- **Biomes**: Forests, mountains, deserts, tundras, swamps, oceans
- **Civilizations**: Kingdoms, empires, city-states, nomadic tribes
- **Races**: Distribution of fantasy races, cultural centers
- **Magic**: Ley lines, magical zones, dead magic areas
- **History**: Ancient ruins, legendary locations, forgotten realms

#### Dungeon Generation
- **Dungeon Type**: Cave system, ancient temple, castle ruins, underground city
- **Levels**: Number of floors, complexity, interconnectedness
- **Traps**: Mechanical, magical, environmental, social
- **Enemies**: Monsters, undead, constructs, intelligent beings
- **Treasure**: Artifacts, magical items, gold, information
- **Secrets**: Hidden passages, secret rooms, lore fragments

### 3. Modern/Contemporary Stories
**World Generation Phase: City/Region Creation**

#### Urban Environment
- **City Layout**: Districts, neighborhoods, landmarks, infrastructure
- **Population**: Demographics, social classes, cultural groups
- **Organizations**: Government, corporations, criminal groups, NGOs
- **Technology**: Current tech level, cutting-edge developments
- **History**: Recent events, ongoing conflicts, social issues

#### Rural/Regional Environment
- **Geography**: Mountains, forests, rivers, coastlines
- **Communities**: Small towns, villages, isolated settlements
- **Economy**: Agriculture, tourism, industry, natural resources
- **Culture**: Local traditions, festivals, customs, folklore

### 4. Post-Apocalyptic Stories
**World Generation Phase: Wasteland & Survivor Communities**

#### Wasteland Generation
- **Catastrophe Type**: Nuclear war, climate change, pandemic, alien invasion
- **Time Since Event**: Recent devastation vs. long-term adaptation
- **Environmental Hazards**: Radiation, toxic waste, extreme weather
- **Survivor Groups**: Factions, tribes, isolated individuals
- **Resources**: Scavenging opportunities, clean water, food sources

## World Generation Process

### Phase 1: Story Type Selection
1. Player chooses story type (Sci-Fi, D&D Fantasy, Modern, Post-Apocalyptic)
2. System generates appropriate world generation prompts
3. LLM creates initial world structure

### Phase 2: World Building
1. **Macro Level**: Galaxy/World/Region overview
2. **Meso Level**: Specific locations, civilizations, factions
3. **Micro Level**: Individual sites, NPCs, immediate environment

### Phase 3: Story Integration
1. World elements are integrated into the story context
2. Player choices can explore different aspects of the world
3. World evolves based on player actions

## Implementation Requirements

### Data Structures
```typescript
interface WorldStructure {
    type: 'sci-fi' | 'dnd-fantasy' | 'modern' | 'post-apocalyptic';
    macroLevel: MacroWorldData;
    mesoLevel: MesoWorldData;
    microLevel: MicroWorldData;
    generationPhase: 'complete' | 'partial' | 'minimal';
}

interface MacroWorldData {
    // Galaxy/World/Region level information
    name: string;
    description: string;
    majorFactions: Faction[];
    keyLocations: Location[];
    currentEvents: WorldEvent[];
}

interface MesoWorldData {
    // Specific area information
    currentArea: Area;
    nearbyAreas: Area[];
    localFactions: Faction[];
    availableResources: Resource[];
}

interface MicroWorldData {
    // Immediate environment
    currentLocation: Location;
    visibleNPCs: NPC[];
    availableActions: string[];
    immediateThreats: Threat[];
}
```

### LLM Prompts
- **World Generation Prompts**: Specialized prompts for each story type
- **Consistency Checks**: Ensure world elements remain consistent
- **Dynamic Updates**: Allow world to evolve based on story progression

### UI Elements
- **World Map**: Visual representation of the generated world
- **Location Browser**: Navigate between different areas
- **Faction Tracker**: Monitor relationships and conflicts
- **Resource Manager**: Track available resources and capabilities

## Benefits

1. **Immersive Experience**: Rich, detailed worlds that feel alive
2. **Consistent Storytelling**: LLM has structured world to work within
3. **Player Agency**: Multiple paths and choices within the world
4. **Replayability**: Different world generation creates unique experiences
5. **Scalability**: World can expand as story progresses

## Future Enhancements

- **Procedural Generation**: More sophisticated world creation algorithms
- **Player Customization**: Allow players to influence world generation
- **Dynamic Evolution**: Worlds that change based on player actions
- **Multiplayer Worlds**: Shared world experiences
- **Mod Support**: Community-created world generation rules
