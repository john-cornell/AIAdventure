# STORY PLAN - Structured Narrative Planning

## Overview
The Story Plan system provides the LLM with a structured narrative framework to guide the story toward specific goals while maintaining player agency and story coherence.

## Story Plan Components

### 1. Core Story Elements
- **Main Goal**: The primary objective the story is working toward
- **Story Arc**: The overall narrative structure (Hero's Journey, Mystery, Quest, etc.)
- **Key Plot Points**: Major story beats that must occur
- **Character Arcs**: How characters will develop throughout the story
- **Themes**: Central ideas and messages the story explores

### 2. Story Plan Structure
```
STORY PLAN: [Story Title]
├── MAIN GOAL: [Primary objective]
├── STORY ARC: [Narrative structure type]
├── ACT 1: [Setup & Introduction]
│   ├── Opening: [How the story begins]
│   ├── Inciting Incident: [What sets the story in motion]
│   └── First Plot Point: [Major turning point]
├── ACT 2: [Development & Conflict]
│   ├── Rising Action: [Building tension and complications]
│   ├── Midpoint: [Major revelation or change]
│   └── Crisis: [Lowest point for the protagonist]
├── ACT 3: [Resolution & Conclusion]
│   ├── Climax: [Final confrontation or resolution]
│   ├── Falling Action: [Wrapping up loose ends]
│   └── Resolution: [How the story concludes]
└── KEY THEMES: [Central ideas to explore]
```

## Story Plan Types

### 1. Hero's Journey
- **Call to Adventure**: Player receives the quest
- **Crossing the Threshold**: Entering the unknown world
- **Tests & Allies**: Overcoming challenges, meeting helpers
- **Approach to Inmost Cave**: Preparing for the final challenge
- **Ordeal**: The ultimate test
- **Reward**: Gaining what was sought
- **Return**: Bringing the reward back to the ordinary world

### 2. Mystery/Investigation
- **Discovery**: The mystery is revealed
- **Investigation**: Gathering clues and information
- **Red Herrings**: False leads and misdirection
- **Breakthrough**: Key revelation that changes everything
- **Resolution**: Solving the mystery
- **Justice**: Consequences and closure

### 3. Quest/Adventure
- **Quest Given**: The mission is assigned
- **Journey Begins**: Setting out on the adventure
- **Obstacles**: Challenges that must be overcome
- **Allies & Enemies**: Meeting friends and foes
- **Final Challenge**: The ultimate obstacle
- **Quest Completion**: Achieving the goal

### 4. Survival/Horror
- **Normalcy**: Life before the threat
- **Threat Emerges**: The danger appears
- **Survival Mode**: Adapting to the new reality
- **Escalation**: The threat becomes more dangerous
- **Final Confrontation**: Face the threat directly
- **Resolution**: Survive or succumb

## Implementation in the Game

### 1. Story Plan Creation
```typescript
interface StoryPlan {
    id: string;
    title: string;
    type: 'hero-journey' | 'mystery' | 'quest' | 'survival' | 'custom';
    mainGoal: string;
    storyArc: StoryArc;
    acts: StoryAct[];
    keyThemes: string[];
    currentAct: number;
    currentPlotPoint: number;
    completedPlotPoints: string[];
    estimatedLength: 'short' | 'medium' | 'long';
    flexibility: 'strict' | 'moderate' | 'flexible';
}

interface StoryArc {
    name: string;
    description: string;
    plotPoints: PlotPoint[];
    characterArcs: CharacterArc[];
}

interface StoryAct {
    actNumber: number;
    name: string;
    description: string;
    plotPoints: PlotPoint[];
    requiredElements: string[];
    optionalElements: string[];
}

interface PlotPoint {
    id: string;
    name: string;
    description: string;
    required: boolean;
    completed: boolean;
    triggers: string[];
    consequences: string[];
}
```

### 2. LLM Integration
The LLM receives the story plan as part of the system prompt:

```
STORY PLAN CONTEXT:
- Main Goal: [Goal description]
- Current Act: [Act number and name]
- Next Plot Point: [What should happen next]
- Story Direction: [How to guide the story toward the goal]
- Flexibility: [How strictly to follow the plan]

INSTRUCTIONS:
- Use the story plan to guide narrative direction
- Ensure each story beat moves toward the main goal
- Maintain story coherence while allowing player agency
- Adapt the plan based on player choices when possible
- Signal when major plot points are completed
```

### 3. Dynamic Plan Adaptation
- **Player Choice Integration**: Modify the plan based on player decisions
- **Branching Paths**: Create alternative routes to the same goal
- **Plan Evolution**: Update the plan as the story progresses
- **Flexibility Levels**: Some plans are more rigid than others

## Story Plan Examples

### Example 1: Sci-Fi Hero's Journey
```
STORY PLAN: "Escape from Andromeda Station"
├── MAIN GOAL: Escape the station before it's destroyed
├── STORY ARC: Hero's Journey
├── ACT 1: The Call to Adventure
│   ├── Opening: Player wakes up on a space station
│   ├── Inciting Incident: Station is under attack
│   └── First Plot Point: Learn the station will be destroyed in 2 hours
├── ACT 2: The Journey
│   ├── Rising Action: Navigate through dangerous areas
│   ├── Midpoint: Discover the attack is from within
│   └── Crisis: Trapped in a section that's being vented
├── ACT 3: The Return
│   ├── Climax: Confront the saboteur
│   ├── Falling Action: Escape in the escape pod
│   └── Resolution: Watch the station explode from safety
└── KEY THEMES: Trust, survival, betrayal, resourcefulness
```

### Example 2: D&D Fantasy Quest
```
STORY PLAN: "The Lost Crown of Eldoria"
├── MAIN GOAL: Recover the stolen crown and restore the kingdom
├── STORY ARC: Quest Adventure
├── ACT 1: The Quest Begins
│   ├── Opening: Kingdom in chaos after crown theft
│   ├── Inciting Incident: Player is chosen for the quest
│   └── First Plot Point: Learn the crown is in the Dark Forest
├── ACT 2: The Journey
│   ├── Rising Action: Travel through dangerous lands
│   ├── Midpoint: Discover the thief is a former ally
│   └── Crisis: Betrayed and captured by the thief
├── ACT 3: The Resolution
│   ├── Climax: Final battle for the crown
│   ├── Falling Action: Return the crown to the kingdom
│   └── Resolution: Kingdom restored, player honored
└── KEY THEMES: Loyalty, redemption, leadership, sacrifice
```

## Benefits of Story Planning

### 1. For the LLM
- **Clear Direction**: Knows where the story should go
- **Consistent Pacing**: Maintains proper story rhythm
- **Character Development**: Ensures meaningful character arcs
- **Theme Integration**: Weaves themes throughout the narrative
- **Conflict Management**: Balances challenges and resolutions

### 2. For the Player
- **Engaging Experience**: Stories feel purposeful and complete
- **Satisfying Conclusions**: Stories reach meaningful endings
- **Character Growth**: See characters develop over time
- **Thematic Depth**: Experience stories with deeper meaning
- **Replayability**: Different paths to the same goal

### 3. For the Game System
- **Quality Control**: Ensures stories meet minimum standards
- **Consistency**: Maintains narrative coherence
- **Scalability**: Can handle stories of varying lengths
- **Adaptability**: Plans can evolve based on player choices
- **Monitoring**: Track story progress and completion

## Future Enhancements

- **AI-Generated Plans**: LLM creates story plans based on player preferences
- **Player Customization**: Players can modify or create their own plans
- **Plan Templates**: Pre-built plans for common story types
- **Multi-Plan Stories**: Complex stories with multiple intersecting plans
- **Plan Analytics**: Track which plans work best for different players
- **Community Plans**: Share and rate story plans created by the community
