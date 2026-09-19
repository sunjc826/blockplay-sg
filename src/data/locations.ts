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
] as const;

export type Location = (typeof locations)[number];
export type Mode = 'drive' | 'training' | 'explore';
