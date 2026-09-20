export const locations = [
  {
    id: 'marina-bay', name: 'Marina Bay', subtitle: 'The postcard route', district: 'DOWNTOWN',
    description: 'Palm-lined paths, a skyline you know, and more bay to explore. Walk or drive a growing, reference-informed low-poly Marina Bay.',
    lat: 1.2867, lng: 103.8545, heading: 110, color: '#9bb9cc', block: 18,
    tags: ['Waterfront', 'City skyline'],
    viewpoints: [
      { label: 'Bay streets', lat: 1.2867, lng: 103.8545, heading: 110 },
      { label: 'Another angle', lat: 1.2852, lng: 103.8530, heading: 45 },
      { label: 'Along the bay', lat: 1.2885, lng: 103.8550, heading: 135 },
    ],
  },
  {
    id: 'raffles-place', name: 'Raffles Place', subtitle: 'Between towers and the river', district: 'CITY CORE',
    description: 'Explore a low-poly business district of glass towers, shaded plazas and riverfront streets. An authored, compressed game world informed by street-level references.',
    lat: 1.2840, lng: 103.8510, heading: 0, color: '#879caa', block: 1,
    tags: ['City plaza', 'Riverfront streets'],
    viewpoints: [
      { label: 'Raffles Place plaza', lat: 1.2840, lng: 103.8510, heading: 0 },
      { label: 'Battery Road', lat: 1.2853, lng: 103.8520, heading: 180 },
      { label: 'Boat Quay', lat: 1.2863, lng: 103.8495, heading: 90 },
    ],
  },
  {
    id: 'queenstown', name: 'Queenstown', subtitle: 'A different kind of royalty', district: 'SOUTHWEST',
    description: 'A walkable, driveable take on Queenstown: familiar estate blocks, sheltered paths and neighborhood stops. An authored low-poly region, not a surveyed map.',
    lat: 1.2942, lng: 103.8060, heading: 60, color: '#8eaaa0', block: 53,
    tags: ['Heritage estate', 'Green corridors'],
    viewpoints: [
      { label: 'Estate streets', lat: 1.2942, lng: 103.8060, heading: 60 },
      { label: 'Around the block', lat: 1.2959, lng: 103.8046, heading: 180 },
      { label: 'A little further', lat: 1.2928, lng: 103.8075, heading: 0 },
    ],
  },
  {
    id: 'chinatown', name: 'Chinatown', subtitle: 'Lanes, lanterns and temples', district: 'CENTRAL',
    description: 'Shophouse terraces, a covered market lane and two temples, as an authored low-poly world. Compressed for play, not surveyed.',
    lat: 1.2829, lng: 103.8446, heading: 30, color: '#c58d6d', block: 5,
    tags: ['Shophouse streets', 'Market lanes'],
    viewpoints: [
      { label: 'Pagoda Street', lat: 1.2843, lng: 103.8443, heading: 240 },
      { label: 'South Bridge Road', lat: 1.2822, lng: 103.8450, heading: 30 },
      { label: 'Kreta Ayer', lat: 1.2812, lng: 103.8425, heading: 120 },
    ],
  },
  {
    id: 'kampong-glam', name: 'Kampong Glam', subtitle: 'A dome above the shophouses', district: 'ROCHOR',
    description: 'A domed mosque closing a palm-lined mall, painted lanes and textile streets, as an authored low-poly quarter. Compressed for play, not surveyed.',
    lat: 1.3020, lng: 103.8590, heading: 350, color: '#d5b45e', block: 3,
    tags: ['Heritage quarter', 'Painted lanes'],
    viewpoints: [
      { label: 'Bussorah Street', lat: 1.3020, lng: 103.8590, heading: 350 },
      { label: 'Arab Street', lat: 1.3010, lng: 103.8597, heading: 60 },
      { label: 'Kandahar Street', lat: 1.3029, lng: 103.8604, heading: 200 },
    ],
  },
  {
    id: 'jurong-lake', name: 'Jurong Lake', subtitle: 'A pagoda across the water', district: 'WEST',
    description: 'A garden lake with a tiered pagoda on a causeway island, a boardwalk shore and the mall cluster beyond. An authored low-poly world, compressed for play.',
    lat: 1.3396, lng: 103.7297, heading: 270, color: '#7fb0bd', block: 2,
    tags: ['Garden lake', 'Mall cluster'],
    viewpoints: [
      { label: 'Lakeside', lat: 1.3396, lng: 103.7297, heading: 270 },
      { label: 'Chinese Garden', lat: 1.3411, lng: 103.7302, heading: 180 },
      { label: 'Jurong East', lat: 1.3331, lng: 103.7423, heading: 90 },
    ],
  },
  {
    id: 'changi', name: 'Changi', subtitle: 'Under the glass and rain', district: 'EAST',
    description: 'A glazed dome with water falling through its oculus, a terminal frontage under a departure viaduct, a control tower and an apron. Authored and compressed for play.',
    lat: 1.3601, lng: 103.9896, heading: 200, color: '#8fb7c4', block: 1,
    tags: ['Glazed dome', 'Apron views'],
    viewpoints: [
      { label: 'Jewel', lat: 1.3601, lng: 103.9896, heading: 200 },
      { label: 'Terminal 3', lat: 1.3560, lng: 103.9865, heading: 20 },
      { label: 'Changi Beach', lat: 1.3900, lng: 103.9880, heading: 90 },
    ],
  },
  {
    id: 'upper-thomson', name: 'Upper Thomson', subtitle: 'Kopi, then the forest', district: 'NORTH-CENTRAL',
    description: 'A low-rise eating strip under zinc awnings, with a reservoir causeway, a pile boardwalk and a suspension bridge through the canopy behind it. Authored and compressed for play.',
    lat: 1.3540, lng: 103.8340, heading: 200, color: '#8fae8a', block: 2,
    tags: ['Eating strip', 'Reservoir forest'],
    viewpoints: [
      { label: 'Thomson shops', lat: 1.3540, lng: 103.8340, heading: 200 },
      { label: 'Reservoir edge', lat: 1.3480, lng: 103.8230, heading: 90 },
      { label: 'Springleaf', lat: 1.3970, lng: 103.8180, heading: 0 },
    ],
  },
  {
    id: 'punggol', name: 'Punggol', subtitle: 'A town built around water', district: 'NORTH-EAST',
    description: 'A planted waterway with promenades on both banks and an arched crossing, precinct slabs on void decks, an elevated light rail and a jetty into a sheltered bay. Authored and compressed for play.',
    lat: 1.4050, lng: 103.9020, heading: 20, color: '#7fa8c4', block: 1,
    tags: ['Waterway', 'Waterfront town'],
    viewpoints: [
      { label: 'Waterway', lat: 1.4050, lng: 103.9020, heading: 20 },
      { label: 'Punggol Point', lat: 1.4170, lng: 103.9070, heading: 340 },
      { label: 'Town centre', lat: 1.4052, lng: 103.9022, heading: 200 },
    ],
  },
  {
    id: 'harbourfront', name: 'HarbourFront', subtitle: 'Where the island leaves', district: 'SOUTH',
    description: 'A stepped waterfront mall with a rooftop deck, a cruise hall with a liner alongside, container gantries down the wharf and a cable line crossing overhead. Authored and compressed for play.',
    lat: 1.2653, lng: 103.8220, heading: 160, color: '#7f9db0', block: 1,
    tags: ['Cruise quay', 'Cable line'],
    viewpoints: [
      { label: 'HarbourFront quay', lat: 1.2653, lng: 103.8220, heading: 160 },
      { label: 'Mount Faber', lat: 1.2713, lng: 103.8170, heading: 200 },
      { label: 'Keppel wharf', lat: 1.2685, lng: 103.8330, heading: 90 },
    ],
  },
  {
    id: 'sentosa', name: 'Sentosa', subtitle: 'One boardwalk across', district: 'ISLAND',
    description: 'A boardwalk landing across the strait, a monorail down the spine, a resort podium and hotel pair, a headland battery and the beach strip beyond. Authored and compressed for play.',
    lat: 1.2494, lng: 103.8303, heading: 180, color: '#e0c489', block: 1,
    tags: ['Resort island', 'Beach strip'],
    viewpoints: [
      { label: 'Boardwalk', lat: 1.2600, lng: 103.8210, heading: 180 },
      { label: 'Siloso', lat: 1.2570, lng: 103.8100, heading: 90 },
      { label: 'Imbiah', lat: 1.2540, lng: 103.8180, heading: 0 },
    ],
  },
  {
    id: 'geylang', name: 'Geylang', subtitle: 'Down the numbered lanes', district: 'EAST-CENTRAL',
    description: 'Ornate shophouse terraces down close-set numbered lorongs, a market hall under a steep gabled roof, a mosque and a temple on the main road, and a canal bridged at every lane. Authored and compressed for play.',
    lat: 1.3140, lng: 103.8870, heading: 70, color: '#c2a06a', block: 17,
    tags: ['Lorong grid', 'Shophouse terraces'],
    viewpoints: [
      { label: 'Geylang Road', lat: 1.3140, lng: 103.8870, heading: 70 },
      { label: 'Geylang Serai', lat: 1.3170, lng: 103.8980, heading: 200 },
      { label: 'A lorong', lat: 1.3125, lng: 103.8845, heading: 340 },
    ],
  },
  {
    id: 'orchard', name: 'Orchard Road', subtitle: 'The shopping belt', district: 'CENTRAL',
    description: 'A planted median under rain trees, a faceted glass mall at the junction and a peranakan side lane. An authored low-poly boulevard, compressed for play.',
    lat: 1.3040, lng: 103.8320, heading: 90, color: '#c9a9b8', block: 2,
    tags: ['Shopping belt', 'Rain trees'],
    viewpoints: [
      { label: 'Orchard junction', lat: 1.3040, lng: 103.8320, heading: 90 },
      { label: 'Somerset', lat: 1.3006, lng: 103.8389, heading: 270 },
      { label: 'Emerald Hill', lat: 1.3021, lng: 103.8375, heading: 0 },
    ],
  },
] as const;

export type Location = (typeof locations)[number];
export type Mode = 'drive' | 'training' | 'explore';
