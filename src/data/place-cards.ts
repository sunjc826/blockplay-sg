/**
 * Notes about the real place behind each district, for the AI cast to talk about.
 * Keyed by the region id in src/game/regions.ts. These are conversation material,
 * not the learning catalog (src/data/singapore-guide.ts) and not a claim about what
 * the game's geometry models. Keep each fact something a local would recognise and
 * that is safe to say out loud on a caption.
 */
export interface PlaceCard {
  /** What it feels like to be there, in a sentence. */
  vibe: string;
  facts: readonly string[];
  /** Anything the cast should handle with care here. */
  care?: string;
}

export const PLACE_CARDS: Record<string, PlaceCard> = {
  'botanic-gardens': {
    vibe: 'A calm, green, 160-year-old garden where joggers, wedding shoots and tai chi groups share the lawns.',
    facts: [
      'The Singapore Botanic Gardens has been on this site since 1859 and became the country\'s first UNESCO World Heritage Site in 2015.',
      'The National Orchid Garden breeds orchid hybrids and names them after visiting heads of state and celebrities.',
      'Its early director Henry Ridley pushed rubber planting so hard he was nicknamed Mad Ridley; the seedlings raised here started Malaya\'s rubber industry.',
      'Entry to the gardens is free and the gates open at five in the morning.',
      'Swan Lake has real swans, and the Symphony Lake stage hosts free outdoor concerts.',
    ],
  },
  'pulau-ubin': {
    vibe: 'A rustic island off the north-east coast that still feels like 1960s kampong Singapore: bicycles, dirt tracks, wild boar.',
    facts: [
      'Pulau Ubin means Granite Island in Malay; its quarries supplied stone for buildings on the mainland and are now flooded lakes.',
      'You get there by bumboat from Changi Point, and the boat leaves only when it has enough passengers.',
      'Chek Jawa on the eastern tip is a wetland with a boardwalk over seagrass and mangrove.',
      'Visitors rent bicycles at the jetty; wild boar and hornbills are common sights.',
      'A handful of residents still live in wooden kampong houses on the island.',
    ],
  },
  'katong-joo-chiat': {
    vibe: 'Pastel Peranakan shophouses, old coffee shops and a serious food reputation in the east.',
    facts: [
      'Joo Chiat is named after Chew Joo Chiat, a landowner who owned much of the area in the early 1900s.',
      'The row of pastel terrace houses on Koon Seng Road is one of the most photographed streets in Singapore.',
      'Katong laksa is served with the noodles cut short so you can eat it with only a spoon, and stalls have argued for decades over who is the original.',
      'The neighbourhood is the heartland of Peranakan culture: kueh, beaded slippers and ornate tiles.',
    ],
  },
  'little-india': {
    vibe: 'Loud, colourful and fragrant: garland stalls, gold shops, banana-leaf restaurants along Serangoon Road.',
    facts: [
      'Mustafa Centre is a department store that is open twenty-four hours and sells nearly everything.',
      'Tekka Centre combines a wet market, a hawker centre and sari shops under one roof.',
      'Street names such as Buffalo Road and Kerbau Road recall the cattle trade that once ran here.',
      'Serangoon Road is covered in lights every year for Deepavali.',
      'Sri Veeramakaliamman Temple on Serangoon Road is one of the oldest Hindu temples in the country.',
    ],
  },
  'yishun': {
    vibe: 'An ordinary northern HDB town with an extraordinary reputation online for strange news.',
    facts: [
      'Yishun is the Mandarin form of Nee Soon, after Lim Nee Soon, the rubber and pineapple magnate who owned plantations here.',
      'Singaporeans joke that Yishun is cursed because so many odd news stories seem to come from it; residents are tired of hearing it.',
      'Chong Pang is the old heart of the town and known for its hawker food, especially nasi lemak.',
      'Lower Seletar Reservoir sits on its edge and Khoo Teck Puat Hospital overlooks Yishun Pond.',
    ],
  },
  'marina-bay': {
    vibe: 'The postcard skyline: glass towers, a hotel with a ship on top and a bay built entirely on reclaimed land.',
    facts: [
      'Everything around the bay stands on land reclaimed from the sea.',
      'Marina Bay Sands opened in 2010; its three towers carry a rooftop SkyPark with an infinity pool.',
      'Since the Marina Barrage was completed in 2008 the bay has been a freshwater reservoir, not the sea.',
      'The Formula 1 night race has run on the streets around the bay since 2008.',
      'The Merlion, half lion and half fish, spouts water into the bay and is always surrounded by tourists pretending to drink from it.',
      'Gardens by the Bay next door has the Supertrees, vertical gardens up to sixteen storeys tall.',
    ],
  },
  'raffles-place': {
    vibe: 'The financial district: bank towers, office workers in lanyards, and a lunchtime stampede.',
    facts: [
      'Raffles Place was once called Commercial Square and has been the business centre since the 1820s.',
      'The tallest towers here stop at about 280 metres because of a height limit for air traffic.',
      'Boat Quay on the Singapore River beside it was the old trading harbour; its shophouses are now bars and restaurants.',
      'Lau Pa Sat, the Victorian cast-iron market nearby, closes a street every evening for satay stalls.',
      'At lunchtime office workers reserve hawker tables with packets of tissue, a practice called chope.',
    ],
  },
  'queenstown': {
    vibe: 'Singapore\'s oldest satellite town: low old flats, void decks, long-running stalls and long-time residents.',
    facts: [
      'Queenstown was Singapore\'s first satellite town, named in 1953 to mark the coronation of Queen Elizabeth II.',
      'Many firsts for public housing estates happened here, including the first neighbourhood public library branch.',
      'Void decks, the open ground floors of HDB blocks, host everything from weddings to funerals to chess games.',
      'Old blocks here are steadily being replaced, and residents are nostalgic about each one.',
    ],
  },
  'chinatown': {
    vibe: 'Shophouses, temples of three religions on one street, lanterns overhead and a vast hawker centre.',
    facts: [
      'The old name Kreta Ayer means water cart, from the bullock carts that hauled water here.',
      'Sri Mariamman, the oldest Hindu temple in Singapore, stands in the middle of Chinatown.',
      'Chinatown Complex has the largest hawker centre in the country, with more than two hundred stalls.',
      'A soya sauce chicken stall from here was awarded a Michelin star in 2016, at a few dollars a plate.',
      'The streets are hung with lanterns for Chinese New Year and the Mid-Autumn Festival.',
    ],
  },
  'kampong-glam': {
    vibe: 'The historic Malay-Muslim quarter: a golden-domed mosque, textile shops and a lane of murals and cafes.',
    facts: [
      'The name comes from the gelam tree, whose bark and timber were used by boat builders.',
      'The base of Sultan Mosque\'s golden dome is ringed with glass bottle ends donated by poorer members of the community so that everyone contributed.',
      'Haji Lane is one of the narrowest streets in Singapore and is lined with murals and small boutiques.',
      'Arab Street is known for textiles, carpets and perfume shops.',
      'During Ramadan the streets around the mosque fill with a night food bazaar.',
    ],
    care: 'This is a religious and cultural centre. Jokes are about the cafes and the crowds, not the mosque or the faith.',
  },
  'jurong-lake': {
    vibe: 'Lakeside gardens and pagodas in the far west, next to an industrial town that was once swamp.',
    facts: [
      'The Chinese Garden and Japanese Garden sit on islands in Jurong Lake, with a seven-storey pagoda.',
      'Jurong was swamp and jungle until the 1960s, when it was turned into an industrial estate; critics at the time called the plan Goh\'s Folly, after the minister behind it.',
      'Jurong Lake Gardens is the first national garden in the heartlands.',
      'People from the east of the island say Jurong is so far it needs a passport.',
    ],
  },
  'changi': {
    vibe: 'The far east: an airport people visit for fun, a sleepy village, and a ferry jetty.',
    facts: [
      'Changi Airport is regularly voted among the best airports in the world, and locals go there to eat, study and shop.',
      'Jewel Changi has the Rain Vortex, a forty-metre indoor waterfall falling through the roof.',
      'Changi Village hawker centre is famous for nasi lemak, with long queues at rival stalls.',
      'Bumboats to Pulau Ubin leave from Changi Point Ferry Terminal.',
    ],
    care: 'Changi has a sombre Second World War history as a prisoner-of-war camp. Do not joke about that.',
  },
  'upper-thomson': {
    vibe: 'A long road of supper spots backed by reservoir forest and bold monkeys.',
    facts: [
      'Upper Thomson Road is known for late-night food, especially roti prata.',
      'MacRitchie Reservoir nearby has the TreeTop Walk, a suspension bridge through the forest canopy.',
      'Long-tailed macaques here are known for stealing plastic bags from hikers.',
      'Thomson Nature Park preserves the ruins of an old Hainanese village among the trees.',
    ],
  },
  'punggol': {
    vibe: 'The newest waterfront HDB town: young families, strollers, a man-made waterway and a small LRT loop.',
    facts: [
      'Punggol was pig farms and seafood restaurants before it became a new town.',
      'Punggol Waterway is a man-made river more than four kilometres long running through the estate.',
      'Most flats here are recent Build-To-Order flats, which couples wait years to receive.',
      'Coney Island, a rustic park reached by a bridge, lies just off Punggol.',
    ],
  },
  'harbourfront': {
    vibe: 'Mall, ferry terminal and cable cars at the southern harbour, with Sentosa across the water.',
    facts: [
      'VivoCity is the largest shopping mall in Singapore.',
      'Cable cars cross the harbour from Mount Faber through HarbourFront to Sentosa.',
      'Ferries leave from here for the Indonesian islands of Batam and Bintan.',
      'The area used to be the World Trade Centre and exhibition halls.',
    ],
  },
  'sentosa': {
    vibe: 'The resort island: theme parks, man-made beaches, old coastal guns and very expensive houses.',
    facts: [
      'Sentosa was called Pulau Blakang Mati, roughly island behind death, until it was renamed in 1972; Sentosa means peace and tranquillity.',
      'Fort Siloso at the western tip keeps the coastal guns built to defend the harbour.',
      'Siloso, Palawan and Tanjong beaches were built with imported sand.',
      'Sentosa Cove is the only place in Singapore where foreigners can buy landed houses, at prices to match.',
      'The island hosted the 2018 summit between the United States and North Korea.',
    ],
  },
  'geylang': {
    vibe: 'Rows of numbered lorongs, old shophouses and some of the best late-night food on the island.',
    facts: [
      'The side lanes off Geylang Road are numbered lorongs, and locals give directions by lorong number.',
      'Geylang is where people go at midnight for frog porridge, beef hor fun and durian.',
      'Durian stalls here open late, and the debate over the best variety is taken seriously.',
      'Geylang Serai at the eastern end is a centre of Malay culture, with a huge Hari Raya bazaar every year.',
    ],
    care: 'Geylang also has a red-light reputation that locals joke about. A knowing allusion is the limit; keep it PG.',
  },
  'tuas': {
    vibe: 'The industrial far west: shipyards, factories, lorries and a very long way from anywhere.',
    facts: [
      'Tuas is about as far west as you can go in Singapore; people say it feels like another country.',
      'The Tuas Second Link bridge crosses to Johor in Malaysia.',
      'Tuas Port is being built in phases to become the largest fully automated container terminal in the world.',
      'Much of Tuas is reclaimed land, and almost nobody lives there; people only commute in to work.',
    ],
  },
  'woodlands': {
    vibe: 'The northern gateway: a big HDB town at the end of the Causeway to Malaysia.',
    facts: [
      'The Causeway linking Woodlands to Johor Bahru opened in 1924 and is one of the busiest land crossings in the world.',
      'Traffic jams at Woodlands Checkpoint before long weekends are legendary.',
      'Singaporeans cross for cheaper groceries, food and car washes.',
      'Woodlands Waterfront has a long jetty facing Johor across the strait.',
    ],
  },
  'tampines': {
    vibe: 'A huge, self-sufficient eastern town with three malls at the MRT and a furniture store everyone has queued at.',
    facts: [
      'Tampines is named after the tempinis tree, an ironwood that once grew here.',
      'Three shopping malls stand side by side at Tampines MRT.',
      'The area was sand quarries before the town was built, and it won a United Nations habitat award in the 1990s.',
      'It was the first town with a dedicated cycling path network.',
      'Our Tampines Hub packs a stadium, pools, a library and a hawker centre into one building.',
    ],
  },
  'toa-payoh': {
    vibe: 'A classic heartland town, proud of being the original HDB town, with an iconic playground.',
    facts: [
      'Toa Payoh means big swamp in Hokkien, which is what it was.',
      'It was the first town planned and built entirely by the Housing and Development Board.',
      'The orange dragon playground at Lorong 6, built in 1979, is a national icon.',
      'Queen Elizabeth II visited a flat here in 1972, and visiting dignitaries were often brought to see the town.',
      'It housed the athletes\' village for the 1973 South East Asian Peninsular Games.',
    ],
  },
  'bukit-timah': {
    vibe: 'Rainforest hill, big houses, top schools and a former railway turned walking trail.',
    facts: [
      'Bukit Timah Hill is the highest natural point in Singapore at about 164 metres.',
      'The name means tin hill in Malay, though no tin was ever found there.',
      'Bukit Timah Nature Reserve is one of the few patches of primary rainforest left on the island.',
      'The old railway line to Malaysia ran through here and is now the Rail Corridor walking trail.',
      'The area is known for landed houses and a cluster of well-known schools.',
    ],
  },
  'bishan': {
    vibe: 'A neat central town with a river park and a family of famous otters.',
    facts: [
      'Bishan was built on a former Cantonese cemetery called Peck San Theng, from which it takes its name.',
      'Bishan-Ang Mo Kio Park replaced a concrete canal with a naturalised river.',
      'A family of smooth-coated otters known as the Bishan otters became national celebrities.',
      'Junction 8 beside the MRT is the mall every student in the area ends up at after school.',
    ],
  },
  'orchard': {
    vibe: 'The shopping street: malls end to end, tourists, and air-conditioning you can feel from the pavement.',
    facts: [
      'Orchard Road is named after the nutmeg and pepper plantations that lined it in the 1800s.',
      'It is a couple of kilometres of malls linked by underpasses, so you can cross it without going outdoors.',
      'Uncles with pushcarts sell blocks of ice cream sandwiched in a slice of rainbow bread.',
      'The street is lit up for Christmas every year, in a country with no winter.',
      'Flash floods at its lowest junction in 2010 and 2011 are still a local joke.',
    ],
  },
};

/** The district section of a cast system prompt. Unknown districts get a general note, never an invented one. */
export function renderPlaceCard(regionId: string, regionName: string): string {
  const card = PLACE_CARDS[regionId];
  if (!card) return `Where the player is: ${regionName}, a district of Singapore. You have no notes on it, so say only things about it you are certain of.`;
  return [
    `Where the player is: ${regionName}, Singapore. ${card.vibe}`,
    'Notes on the real place:',
    ...card.facts.map(fact => `- ${fact}`),
    ...(card.care ? [`Handle with care: ${card.care}`] : []),
  ].join('\n');
}
