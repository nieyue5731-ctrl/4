/**
 * @file block-data.js - Block data definitions and lookup tables
 * @description All block metadata and pre-computed TypedArray lookup tables
 */
'use strict';

// Block data registry
const BLOCK_DATA = {
    [BLOCK.AIR]: { name: 'Air', solid: false, transparent: true, light: 0, hardness: 0 },
    [BLOCK.DIRT]: { name: 'Dirt', solid: true, transparent: false, light: 0, hardness: 1, color: '#8B6914' },
    [BLOCK.GRASS]: { name: 'Grass', solid: true, transparent: false, light: 0, hardness: 1, color: '#4CAF50' },
    [BLOCK.STONE]: { name: 'Stone', solid: true, transparent: false, light: 0, hardness: 3, color: '#78909C' },
    [BLOCK.WOOD]: { name: 'Wood', solid: true, transparent: false, light: 0, hardness: 2, color: '#A1887F' },
    [BLOCK.LEAVES]: { name: 'Leaves', solid: false, transparent: true, light: 0, hardness: 0.5, color: '#66BB6A' },
    [BLOCK.SAND]: { name: 'Sand', solid: true, transparent: false, light: 0, hardness: 0.8, color: '#FFE082' },
    [BLOCK.SNOW]: { name: 'Snow', solid: true, transparent: false, light: 0, hardness: 0.5, color: '#ECEFF1' },
    [BLOCK.ICE]: { name: 'Ice', solid: true, transparent: true, light: 0, hardness: 1.5, color: '#81D4FA' },
    [BLOCK.MUD]: { name: 'Mud', solid: true, transparent: false, light: 0, hardness: 0.8, color: '#6D4C41' },
    [BLOCK.CLAY]: { name: 'Clay', solid: true, transparent: false, light: 0, hardness: 1.2, color: '#BCAAA4' },
    [BLOCK.LOG]: { name: 'Log', solid: true, transparent: false, light: 0, hardness: 2, color: '#5D4037' },
    [BLOCK.COPPER_ORE]: { name: 'Copper Ore', solid: true, transparent: false, light: 0, hardness: 4, color: '#FF7043' },
    [BLOCK.IRON_ORE]: { name: 'Iron Ore', solid: true, transparent: false, light: 0, hardness: 5, color: '#90A4AE' },
    [BLOCK.SILVER_ORE]: { name: 'Silver Ore', solid: true, transparent: false, light: 1, hardness: 5.5, color: '#CFD8DC' },
    [BLOCK.GOLD_ORE]: { name: 'Gold Ore', solid: true, transparent: false, light: 2, hardness: 6, color: '#FFD54F' },
    [BLOCK.DIAMOND_ORE]: { name: 'Diamond Ore', solid: true, transparent: false, light: 4, hardness: 8, color: '#4DD0E1' },
    [BLOCK.HELLSTONE]: { name: 'Hellstone', solid: true, transparent: false, light: 6, hardness: 10, color: '#FF5722' },
    [BLOCK.OBSIDIAN]: { name: 'Obsidian', solid: true, transparent: false, light: 0, hardness: 15, color: '#37474F' },
    [BLOCK.COBBLESTONE]: { name: 'Cobblestone', solid: true, transparent: false, light: 0, hardness: 3, color: '#78909C' },
    [BLOCK.MOSSY_STONE]: { name: 'Mossy Stone', solid: true, transparent: false, light: 0, hardness: 3, color: '#689F38' },
    [BLOCK.GRANITE]: { name: 'Granite', solid: true, transparent: false, light: 0, hardness: 4, color: '#A1887F' },
    [BLOCK.MARBLE]: { name: 'Marble', solid: true, transparent: false, light: 1, hardness: 4, color: '#FAFAFA' },
    [BLOCK.PLANKS]: { name: 'Planks', solid: true, transparent: false, light: 0, hardness: 2, color: '#BCAAA4' },
    [BLOCK.BRICK]: { name: 'Brick', solid: true, transparent: false, light: 0, hardness: 4, color: '#E57373' },
    [BLOCK.GLASS]: { name: 'Glass', solid: true, transparent: true, light: 0, hardness: 0.3, color: '#E1F5FE' },
    [BLOCK.TORCH]: { name: 'Torch', solid: false, transparent: true, light: 14, hardness: 0.1, color: '#FFEB3B' },
    [BLOCK.WATER]: { name: 'Water', solid: false, transparent: true, light: 0, hardness: 0, liquid: true, color: '#42A5F5' },
    [BLOCK.LAVA]: { name: 'Lava', solid: false, transparent: true, light: 15, hardness: 0, liquid: true, color: '#FF6D00' },
    [BLOCK.ASH]: { name: 'Ash', solid: true, transparent: false, light: 0, hardness: 0.8, color: '#455A64' },
    [BLOCK.BEDROCK]: { name: 'Bedrock', solid: true, transparent: false, light: 0, hardness: Infinity, color: '#263238' },
    [BLOCK.MUSHROOM]: { name: 'Mushroom', solid: false, transparent: true, light: 2, hardness: 0, color: '#EC407A' },
    [BLOCK.FLOWER_RED]: { name: 'Red Flower', solid: false, transparent: true, light: 0, hardness: 0, color: '#EF5350' },
    [BLOCK.FLOWER_YELLOW]: { name: 'Yellow Flower', solid: false, transparent: true, light: 0, hardness: 0, color: '#FFEE58' },
    [BLOCK.TALL_GRASS]: { name: 'Tall Grass', solid: false, transparent: true, light: 0, hardness: 0, color: '#9CCC65' },
    [BLOCK.CACTUS]: { name: 'Cactus', solid: true, transparent: false, light: 0, hardness: 1, color: '#7CB342' },
    [BLOCK.SNOW_GRASS]: { name: 'Snow Grass', solid: true, transparent: false, light: 0, hardness: 1, color: '#ECEFF1' },
    [BLOCK.JUNGLE_GRASS]: { name: 'Jungle Grass', solid: true, transparent: false, light: 0, hardness: 1, color: '#43A047' },
    [BLOCK.CRYSTAL]: { name: 'Crystal', solid: true, transparent: true, light: 8, hardness: 5, color: '#CE93D8' },
    [BLOCK.AMETHYST]: { name: 'Amethyst', solid: true, transparent: true, light: 6, hardness: 6, color: '#9C27B0' },
    [BLOCK.RUBY_ORE]: { name: 'Ruby Ore', solid: true, transparent: false, light: 3, hardness: 7, color: '#E91E63' },
    [BLOCK.EMERALD_ORE]: { name: 'Emerald Ore', solid: true, transparent: false, light: 3, hardness: 7, color: '#4CAF50' },
    [BLOCK.SAPPHIRE_ORE]: { name: 'Sapphire Ore', solid: true, transparent: false, light: 3, hardness: 7, color: '#2196F3' },
    [BLOCK.GLOWSTONE]: { name: 'Glowstone', solid: true, transparent: true, light: 12, hardness: 2, color: '#FFC107' },
    [BLOCK.MUSHROOM_GIANT]: { name: 'Giant Mushroom', solid: true, transparent: false, light: 3, hardness: 1, color: '#8E24AA' },
    [BLOCK.VINE]: { name: 'Vine', solid: false, transparent: true, light: 0, hardness: 0.1, color: '#2E7D32' },
    [BLOCK.CORAL]: { name: 'Coral', solid: true, transparent: false, light: 2, hardness: 1, color: '#FF7043' },
    [BLOCK.SANDSTONE]: { name: 'Sandstone', solid: true, transparent: false, light: 0, hardness: 2.5, color: '#D4A574' },
    [BLOCK.RED_SAND]: { name: 'Red Sand', solid: true, transparent: false, light: 0, hardness: 0.8, color: '#C75B39' },
    [BLOCK.GRAVEL]: { name: 'Gravel', solid: true, transparent: false, light: 0, hardness: 1, color: '#757575' },
    [BLOCK.LIMESTONE]: { name: 'Limestone', solid: true, transparent: false, light: 0, hardness: 2, color: '#E8DCC4' },
    [BLOCK.SLATE]: { name: 'Slate', solid: true, transparent: false, light: 0, hardness: 3, color: '#546E7A' },
    [BLOCK.BASALT]: { name: 'Basalt', solid: true, transparent: false, light: 0, hardness: 4, color: '#37474F' },
    [BLOCK.FROZEN_STONE]: { name: 'Frozen Stone', solid: true, transparent: true, light: 1, hardness: 3, color: '#B3E5FC' },
    [BLOCK.MOSS]: { name: 'Moss', solid: false, transparent: true, light: 0, hardness: 0.1, color: '#558B2F' },
    [BLOCK.SPIDER_WEB]: { name: 'Spider Web', solid: false, transparent: true, light: 0, hardness: 0.1, color: '#EEEEEE' },
    [BLOCK.BONE]: { name: 'Bone', solid: true, transparent: false, light: 0, hardness: 2, color: '#EFEBE9' },
    [BLOCK.TREASURE_CHEST]: { name: 'Treasure Chest', solid: true, transparent: false, light: 4, hardness: 3, color: '#8D6E63' },
    [BLOCK.LANTERN]: { name: 'Lantern', solid: false, transparent: true, light: 14, hardness: 0.5, color: '#FF9800' },
    [BLOCK.PINK_FLOWER]: { name: 'Pink Flower', solid: false, transparent: true, light: 0, hardness: 0, color: '#F48FB1' },
    [BLOCK.BLUE_FLOWER]: { name: 'Blue Flower', solid: false, transparent: true, light: 0, hardness: 0, color: '#64B5F6' },
    [BLOCK.SUNFLOWER]: { name: 'Sunflower', solid: false, transparent: true, light: 1, hardness: 0, color: '#FFEB3B' },
    [BLOCK.FERN]: { name: 'Fern', solid: false, transparent: true, light: 0, hardness: 0, color: '#66BB6A' },
    [BLOCK.BAMBOO]: { name: 'Bamboo', solid: true, transparent: false, light: 0, hardness: 1, color: '#7CB342' },
    [BLOCK.PALM_LOG]: { name: 'Palm Log', solid: true, transparent: false, light: 0, hardness: 2, color: '#A1887F' },
    [BLOCK.PALM_LEAVES]: { name: 'Palm Leaves', solid: false, transparent: true, light: 0, hardness: 0.3, color: '#8BC34A' },
    [BLOCK.CHERRY_LOG]: { name: 'Cherry Log', solid: true, transparent: false, light: 0, hardness: 2, color: '#795548' },
    [BLOCK.CHERRY_LEAVES]: { name: 'Cherry Leaves', solid: false, transparent: true, light: 1, hardness: 0.3, color: '#F8BBD9' },
    [BLOCK.PINE_LOG]: { name: 'Pine Log', solid: true, transparent: false, light: 0, hardness: 2, color: '#4E342E' },
    [BLOCK.PINE_LEAVES]: { name: 'Pine Leaves', solid: false, transparent: true, light: 0, hardness: 0.3, color: '#1B5E20' },
    [BLOCK.STALAGMITE]: { name: 'Stalagmite', solid: true, transparent: false, light: 0, hardness: 2, color: '#8D6E63' },
    [BLOCK.STALACTITE]: { name: 'Stalactite', solid: true, transparent: false, light: 0, hardness: 2, color: '#A1887F' },
    [BLOCK.UNDERGROUND_MUSHROOM]: { name: 'Underground Mushroom', solid: false, transparent: true, light: 5, hardness: 0, color: '#7E57C2' },
    [BLOCK.GLOWING_MOSS]: { name: 'Glowing Moss', solid: false, transparent: true, light: 8, hardness: 0.1, color: '#00E676' },
    [BLOCK.METEORITE]: { name: 'Meteorite', solid: true, transparent: false, light: 4, hardness: 12, color: '#8B4513' },
    [BLOCK.TITANIUM_ORE]: { name: 'Titanium Ore', solid: true, transparent: false, light: 2, hardness: 9, color: '#4A6670' },
    [BLOCK.COBALT_ORE]: { name: 'Cobalt Ore', solid: true, transparent: false, light: 2, hardness: 8, color: '#2E86AB' },
    [BLOCK.MYTHRIL_ORE]: { name: 'Mythril Ore', solid: true, transparent: false, light: 3, hardness: 9, color: '#66BB6A' },
    [BLOCK.ORICHALCUM_ORE]: { name: 'Orichalcum Ore', solid: true, transparent: false, light: 3, hardness: 9, color: '#FF69B4' },
    [BLOCK.ADAMANTITE_ORE]: { name: 'Adamantite Ore', solid: true, transparent: false, light: 4, hardness: 10, color: '#DC143C' },
    [BLOCK.CHLOROPHYTE_ORE]: { name: 'Chlorophyte Ore', solid: true, transparent: false, light: 5, hardness: 11, color: '#32CD32' },
    [BLOCK.LUMINITE_ORE]: { name: 'Luminite Ore', solid: true, transparent: false, light: 10, hardness: 15, color: '#00FFFF' },
    [BLOCK.CRIMSON_STONE]: { name: 'Crimson Stone', solid: true, transparent: false, light: 1, hardness: 4, color: '#8B0000' },
    [BLOCK.CORRUPTION_STONE]: { name: 'Corruption Stone', solid: true, transparent: false, light: 1, hardness: 4, color: '#4B0082' },
    [BLOCK.HALLOW_STONE]: { name: 'Hallow Stone', solid: true, transparent: false, light: 3, hardness: 4, color: '#FFD700' },
    [BLOCK.PEARLSTONE]: { name: 'Pearlstone', solid: true, transparent: false, light: 2, hardness: 4, color: '#FFF0F5' },
    [BLOCK.EBONSTONE]: { name: 'Ebonstone', solid: true, transparent: false, light: 0, hardness: 5, color: '#2F1B41' },
    [BLOCK.JUNGLE_TEMPLE_BRICK]: { name: 'Temple Brick', solid: true, transparent: false, light: 0, hardness: 8, color: '#4A7023' },
    [BLOCK.LIHZAHRD_BRICK]: { name: 'Lihzahrd Brick', solid: true, transparent: false, light: 1, hardness: 10, color: '#8B7355' },
    [BLOCK.DUNGEON_BRICK]: { name: 'Dungeon Brick', solid: true, transparent: false, light: 0, hardness: 6, color: '#4169E1' },
    [BLOCK.CLOUD]: { name: 'Cloud', solid: true, transparent: true, light: 0, hardness: 0.2, color: '#F5F5F5' },
    [BLOCK.RAIN_CLOUD]: { name: 'Rain Cloud', solid: true, transparent: true, light: 0, hardness: 0.2, color: '#708090' },
    [BLOCK.SNOW_CLOUD]: { name: 'Snow Cloud', solid: true, transparent: true, light: 0, hardness: 0.2, color: '#E0FFFF' },
    [BLOCK.LIVING_WOOD]: { name: 'Living Wood', solid: true, transparent: false, light: 1, hardness: 3, color: '#8B4513' },
    [BLOCK.LIVING_LEAF]: { name: 'Living Leaf', solid: false, transparent: true, light: 2, hardness: 0.3, color: '#228B22' },
    [BLOCK.MAHOGANY_LOG]: { name: 'Mahogany', solid: true, transparent: false, light: 0, hardness: 2.5, color: '#C04000' },
    [BLOCK.MAHOGANY_LEAVES]: { name: 'Mahogany Leaves', solid: false, transparent: true, light: 0, hardness: 0.3, color: '#006400' },
    [BLOCK.BOREAL_LOG]: { name: 'Boreal Log', solid: true, transparent: false, light: 0, hardness: 2, color: '#D2B48C' },
    [BLOCK.SHADEWOOD_LOG]: { name: 'Shadewood', solid: true, transparent: false, light: 0, hardness: 2, color: '#4A3B5C' },
    [BLOCK.PEARLWOOD_LOG]: { name: 'Pearlwood', solid: true, transparent: false, light: 1, hardness: 2, color: '#FFDEAD' },
    [BLOCK.HONEY_BLOCK]: { name: 'Honey Block', solid: true, transparent: true, light: 2, hardness: 0.5, color: '#FFB347' },
    [BLOCK.HIVE]: { name: 'Hive', solid: true, transparent: false, light: 1, hardness: 2, color: '#DAA520' },
    [BLOCK.BEE_NEST]: { name: 'Bee Nest', solid: true, transparent: false, light: 2, hardness: 1.5, color: '#F0E68C' },
    [BLOCK.SPIDER_NEST]: { name: 'Spider Nest', solid: true, transparent: false, light: 0, hardness: 2, color: '#2F2F2F' },
    [BLOCK.COBALT_BRICK]: { name: 'Cobalt Brick', solid: true, transparent: false, light: 1, hardness: 5, color: '#1E90FF' },
    [BLOCK.MYTHRIL_BRICK]: { name: 'Mythril Brick', solid: true, transparent: false, light: 1, hardness: 5, color: '#3CB371' },
    [BLOCK.GOLD_BRICK]: { name: 'Gold Brick', solid: true, transparent: false, light: 2, hardness: 5, color: '#FFD700' },
    [BLOCK.SILVER_BRICK]: { name: 'Silver Brick', solid: true, transparent: false, light: 1, hardness: 5, color: '#C0C0C0' },
    [BLOCK.COPPER_BRICK]: { name: 'Copper Brick', solid: true, transparent: false, light: 0, hardness: 4, color: '#B87333' },
    [BLOCK.PLATINUM_ORE]: { name: 'Platinum Ore', solid: true, transparent: false, light: 2, hardness: 7, color: '#E5E4E2' },
    [BLOCK.TUNGSTEN_ORE]: { name: 'Tungsten Ore', solid: true, transparent: false, light: 1, hardness: 6, color: '#5C5C5C' },
    [BLOCK.LEAD_ORE]: { name: 'Lead Ore', solid: true, transparent: false, light: 0, hardness: 5, color: '#3D3D3D' },
    [BLOCK.TIN_ORE]: { name: 'Tin Ore', solid: true, transparent: false, light: 0, hardness: 4, color: '#D3D3D3' },
    [BLOCK.METEORITE_BRICK]: { name: 'Meteorite Brick', solid: true, transparent: false, light: 3, hardness: 6, color: '#CD5C5C' },
    [BLOCK.HELLSTONE_BRICK]: { name: 'Hellstone Brick', solid: true, transparent: false, light: 5, hardness: 7, color: '#FF4500' },
    [BLOCK.LIFE_CRYSTAL]: { name: 'Life Crystal', solid: true, transparent: true, light: 10, hardness: 3, color: '#FF1493' },
    [BLOCK.MANA_CRYSTAL]: { name: 'Mana Crystal', solid: true, transparent: true, light: 10, hardness: 3, color: '#00BFFF' },
    [BLOCK.HEART_CRYSTAL]: { name: 'Heart Crystal', solid: true, transparent: true, light: 12, hardness: 4, color: '#FF69B4' },
    [BLOCK.ALTAR]: { name: 'Altar', solid: true, transparent: false, light: 5, hardness: 8, color: '#4B0082' },
    [BLOCK.DEMON_ALTAR]: { name: 'Demon Altar', solid: true, transparent: false, light: 6, hardness: 10, color: '#8B008B' },
    [BLOCK.CRIMSON_ALTAR]: { name: 'Crimson Altar', solid: true, transparent: false, light: 6, hardness: 10, color: '#DC143C' },
    [BLOCK.SUNPLATE]: { name: 'Sunplate', solid: true, transparent: false, light: 8, hardness: 4, color: '#FFD700' },
    [BLOCK.MOONPLATE]: { name: 'Moonplate', solid: true, transparent: false, light: 6, hardness: 4, color: '#C0C0C0' },
    [BLOCK.STARFALL]: { name: 'Starfall', solid: false, transparent: true, light: 10, hardness: 0, color: '#FFFF00' },
    [BLOCK.ROSE]: { name: 'Rose', solid: false, transparent: true, light: 0, hardness: 0, color: '#FF007F' },
    [BLOCK.TULIP]: { name: 'Tulip', solid: false, transparent: true, light: 0, hardness: 0, color: '#FF6347' },
    [BLOCK.ORCHID]: { name: 'Orchid', solid: false, transparent: true, light: 1, hardness: 0, color: '#DA70D6' },
    [BLOCK.LILY]: { name: 'Lily', solid: false, transparent: true, light: 0, hardness: 0, color: '#FFFAF0' },
    [BLOCK.SEAWEED]: { name: 'Seaweed', solid: false, transparent: true, light: 0, hardness: 0, color: '#2E8B57' },
    [BLOCK.KELP]: { name: 'Kelp', solid: false, transparent: true, light: 0, hardness: 0, color: '#556B2F' },
    [BLOCK.SEA_OATS]: { name: 'Sea Oats', solid: false, transparent: true, light: 0, hardness: 0, color: '#F4A460' },
    [BLOCK.PALM_TREE_TOP]: { name: 'Palm Top', solid: false, transparent: true, light: 0, hardness: 0.3, color: '#32CD32' },
    [BLOCK.GIANT_TREE_LOG]: { name: 'Giant Tree', solid: true, transparent: false, light: 0, hardness: 4, color: '#5D4037' },
    [BLOCK.HONEY_DRIP]: { name: 'Honey Drip', solid: false, transparent: true, light: 2, hardness: 0, color: '#FFB90F' },
    [BLOCK.SLIME_BLOCK]: { name: 'Slime Block', solid: true, transparent: true, light: 2, hardness: 1, color: '#00FF7F' },
    [BLOCK.GEL_BLOCK]: { name: 'Gel Block', solid: true, transparent: true, light: 1, hardness: 0.5, color: '#7FFFD4' },
    [BLOCK.RAINBOW_BRICK]: { name: 'Rainbow Brick', solid: true, transparent: false, light: 6, hardness: 4, color: '#FF69B4' },
    [BLOCK.CONFETTI_BLOCK]: { name: 'Confetti', solid: false, transparent: true, light: 0, hardness: 0, color: '#FFD700' },
    [BLOCK.PARTY_BLOCK]: { name: 'Party Block', solid: true, transparent: false, light: 4, hardness: 2, color: '#FF1493' },
    [BLOCK.PUMPKIN]: { name: 'Pumpkin', solid: true, transparent: false, light: 2, hardness: 1, color: '#FF7F00' },
    [BLOCK.HAY]: { name: 'Hay', solid: true, transparent: false, light: 0, hardness: 0.5, color: '#DAA520' },
    [BLOCK.SCARECROW]: { name: 'Scarecrow', solid: true, transparent: false, light: 0, hardness: 1, color: '#8B4513' },
    [BLOCK.GRAVESTONE]: { name: 'Gravestone', solid: true, transparent: false, light: 0, hardness: 3, color: '#696969' },
    [BLOCK.CROSS]: { name: 'Cross', solid: true, transparent: false, light: 0, hardness: 2, color: '#808080' },
    [BLOCK.SKULL_BLOCK]: { name: 'Skull Block', solid: true, transparent: false, light: 0, hardness: 2, color: '#FFFAF0' },
    [BLOCK.ROPE]: { name: 'Rope', solid: false, transparent: true, light: 0, hardness: 0.1, color: '#DEB887' },
    [BLOCK.CHAIN]: { name: 'Chain', solid: false, transparent: true, light: 0, hardness: 1, color: '#A9A9A9' },
    [BLOCK.WEB_ROPE]: { name: 'Web Rope', solid: false, transparent: true, light: 0, hardness: 0.1, color: '#F5F5F5' },
    [BLOCK.PLATFORMS_WOOD]: { name: 'Wood Platform', solid: false, transparent: true, light: 0, hardness: 0.5, color: '#DEB887' },
    [BLOCK.PLATFORMS_STONE]: { name: 'Stone Platform', solid: false, transparent: true, light: 0, hardness: 1, color: '#808080' },
    [BLOCK.PLATFORMS_METAL]: { name: 'Metal Platform', solid: false, transparent: true, light: 0, hardness: 1.5, color: '#C0C0C0' },
    [BLOCK.MUSHROOM_GRASS]: { name: 'Mushroom Grass', solid: true, transparent: false, light: 3, hardness: 1, color: '#4169E1' },
    [BLOCK.JUNGLE_SPORE]: { name: 'Jungle Spore', solid: false, transparent: true, light: 4, hardness: 0, color: '#00FF00' },
    [BLOCK.NATURE_SHRINE]: { name: 'Nature Shrine', solid: true, transparent: false, light: 8, hardness: 5, color: '#228B22' },
    [BLOCK.FIRE_BLOSSOM]: { name: 'Fire Blossom', solid: false, transparent: true, light: 6, hardness: 0, color: '#FF4500' },
    [BLOCK.MOONGLOW]: { name: 'Moonglow', solid: false, transparent: true, light: 5, hardness: 0, color: '#87CEEB' },
    [BLOCK.DAYBLOOM]: { name: 'Daybloom', solid: false, transparent: true, light: 3, hardness: 0, color: '#FFFF00' },
    [BLOCK.WATERLEAF]: { name: 'Waterleaf', solid: false, transparent: true, light: 2, hardness: 0, color: '#00CED1' },
    [BLOCK.DEATHWEED]: { name: 'Deathweed', solid: false, transparent: true, light: 1, hardness: 0, color: '#2F4F4F' },
    [BLOCK.BLINKROOT]: { name: 'Blinkroot', solid: false, transparent: true, light: 4, hardness: 0, color: '#ADFF2F' },
    [BLOCK.SHIVERTHORN]: { name: 'Shiverthorn', solid: false, transparent: true, light: 2, hardness: 0, color: '#E0FFFF' },
    [BLOCK.FIREBLOSSOM]: { name: 'Fireblossom', solid: false, transparent: true, light: 8, hardness: 0, color: '#FF6347' }
};

// Build optimized TypedArray lookup tables
const BLOCK_MAX_ID = 256;
const BLOCK_SOLID = new Uint8Array(BLOCK_MAX_ID);
const BLOCK_TRANSPARENT = new Uint8Array(BLOCK_MAX_ID);
const BLOCK_LIQUID = new Uint8Array(BLOCK_MAX_ID);
const BLOCK_LIGHT = new Uint8Array(BLOCK_MAX_ID);
const BLOCK_HARDNESS = new Float32Array(BLOCK_MAX_ID);
const BLOCK_COLOR = new Array(BLOCK_MAX_ID);
const SUN_DECAY = new Uint8Array(BLOCK_MAX_ID);
const BLOCK_COLOR_PACKED = new Uint32Array(BLOCK_MAX_ID);
const BLOCK_WALKABLE = new Uint8Array(BLOCK_MAX_ID);

(function buildBlockTables() {
    const FALLBACK_PACKED = (240 << 16) | (15 << 8) | 0;

    for (const k in BLOCK_DATA) {
        const id = Number(k);
        if (!Number.isFinite(id) || id < 0 || id >= BLOCK_MAX_ID) continue;
        const d = BLOCK_DATA[id];
        if (!d) continue;

        BLOCK_SOLID[id] = d.solid ? 1 : 0;
        BLOCK_TRANSPARENT[id] = d.transparent ? 1 : 0;
        BLOCK_LIQUID[id] = d.liquid ? 1 : 0;
        BLOCK_LIGHT[id] = d.light || 0;
        BLOCK_HARDNESS[id] = d.hardness || 0;
        BLOCK_COLOR[id] = d.color;

        if (d.solid && !d.transparent) SUN_DECAY[id] = 3;
        else if (d.transparent && id !== BLOCK.AIR) SUN_DECAY[id] = 1;
        else SUN_DECAY[id] = 0;

        if (typeof d.color === 'string' && d.color.length === 7) {
            const r = parseInt(d.color.slice(1, 3), 16);
            const g = parseInt(d.color.slice(3, 5), 16);
            const b = parseInt(d.color.slice(5, 7), 16);
            BLOCK_COLOR_PACKED[id] = (r << 16) | (g << 8) | b;
        } else {
            BLOCK_COLOR_PACKED[id] = FALLBACK_PACKED;
        }
    }

    for (let i = 0; i < BLOCK_MAX_ID; i++) {
        BLOCK_WALKABLE[i] = BLOCK_SOLID[i] ? 0 : 1;
    }
})();

// Build light LUT for renderer
const BLOCK_LIGHT_LUT = new Array(CONFIG.LIGHT_LEVELS + 1);
for (let i = 0; i <= CONFIG.LIGHT_LEVELS; i++) {
    const f = i / CONFIG.LIGHT_LEVELS;
    BLOCK_LIGHT_LUT[i] = f;
}
window.BLOCK_LIGHT_LUT = BLOCK_LIGHT_LUT;

// Exports
window.BLOCK_DATA = BLOCK_DATA;
window.BLOCK_MAX_ID = BLOCK_MAX_ID;
window.BLOCK_SOLID = BLOCK_SOLID;
window.BLOCK_TRANSPARENT = BLOCK_TRANSPARENT;
window.BLOCK_LIQUID = BLOCK_LIQUID;
window.BLOCK_LIGHT = BLOCK_LIGHT;
window.BLOCK_HARDNESS = BLOCK_HARDNESS;
window.BLOCK_COLOR = BLOCK_COLOR;
window.SUN_DECAY = SUN_DECAY;
window.BLOCK_COLOR_PACKED = BLOCK_COLOR_PACKED;
window.BLOCK_WALKABLE = BLOCK_WALKABLE;

window.TU = window.TU || {};
Object.assign(window.TU, {
    CONFIG, BLOCK, BLOCK_DATA, BLOCK_SOLID, BLOCK_LIQUID,
    BLOCK_TRANSPARENT, BLOCK_WALKABLE, BLOCK_MAX_ID, BLOCK_COLOR_PACKED, SUN_DECAY
});
