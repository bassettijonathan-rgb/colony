/** What colonists can be good at. Levels run from 0 (useless) to 20 (master). */
export interface SkillDef {
  id: string;
  name: string;
  description: string;
}

export const SKILLS: readonly SkillDef[] = [
  { id: 'construction', name: 'Construction', description: 'Building walls, roofs and furniture.' },
  { id: 'mining', name: 'Mining', description: 'Digging through rock and ore.' },
  { id: 'growing', name: 'Growing', description: 'Sowing and harvesting crops.' },
  { id: 'cooking', name: 'Cooking', description: 'Making meals, and making native food safe to eat.' },
  { id: 'medicine', name: 'Medicine', description: 'Treating wounds and illness.' },
  { id: 'crafting', name: 'Crafting', description: 'Making tools, clothes and parts.' },
  { id: 'research', name: 'Research', description: 'Understanding Verity and recovering ship knowledge.' },
  { id: 'social', name: 'Social', description: 'Keeping the peace, leading, persuading.' },
  { id: 'shooting', name: 'Shooting', description: 'Fighting at range.' },
  { id: 'melee', name: 'Melee', description: 'Fighting up close.' },
];
