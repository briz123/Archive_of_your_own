const demoTag = (id, name, tagType) => ({
  id,
  name,
  tag_type: tagType,
  is_canonical: true,
  aliases: [],
});

export const demoWorks = [
  {
    id: 1,
    title: "The Lighthouse Between Worlds",
    original_author: "M. Rowan",
    description:
      "A quiet keeper, a stranded traveler, and a light that shines across more than the sea.",
    language: "English",
    word_count: 18400,
    chapter_count: 6,
    rating: "Teen And Up Audiences",
    category: "F/M",
    completion_status: "Complete",
    published_at: "2026-10-12T00:00:00Z",
    created_at: "2026-10-28T12:00:00Z",
    updated_at: "2026-10-28T12:00:00Z",
    tags: [
      demoTag(1, "The Glass Coast", "fandom"),
      demoTag(2, "Iris Vale", "character"),
      demoTag(3, "Iris Vale / Orren Pike", "relationship"),
      demoTag(4, "Found Family", "additional"),
      demoTag(5, "Slow Burn", "additional"),
    ],
    warnings: [],
    files: [
      {
        id: 1,
        original_filename: "the-lighthouse-between-worlds.epub",
        file_format: "EPUB",
        file_size: 245760,
      },
    ],
  },
  {
    id: 2,
    title: "A Map of Small Wonders",
    original_author: "Juniper North",
    description:
      "Two cartographers retrace an old route and discover the places worth keeping were never on the map.",
    language: "English",
    word_count: 9200,
    chapter_count: 3,
    rating: "General Audiences",
    category: "Gen",
    completion_status: "Complete",
    published_at: "2026-10-20T00:00:00Z",
    created_at: "2026-10-26T12:00:00Z",
    updated_at: "2026-10-26T12:00:00Z",
    tags: [
      demoTag(1, "The Glass Coast", "fandom"),
      demoTag(7, "Tamsin Reed", "character"),
      demoTag(8, "Orren Pike", "character"),
      demoTag(9, "Adventure", "additional"),
      demoTag(10, "Mutual Pining", "additional"),
    ],
    warnings: [],
    files: [
      {
        id: 2,
        original_filename: "a-map-of-small-wonders.epub",
        file_format: "EPUB",
        file_size: 188416,
      },
    ],
  },
  {
    id: 3,
    title: "Tea at the Last Station",
    original_author: "A. Fern",
    description:
      "The last train is delayed. Luckily, the station tea room has one warm lamp and two open chairs.",
    language: "English",
    word_count: 4100,
    chapter_count: 1,
    rating: "General Audiences",
    category: "F/F",
    completion_status: "Complete",
    published_at: "2026-10-23T00:00:00Z",
    created_at: "2026-10-24T12:00:00Z",
    updated_at: "2026-10-24T12:00:00Z",
    tags: [
      demoTag(1, "The Glass Coast", "fandom"),
      demoTag(12, "Mara Fen", "character"),
      demoTag(13, "Mara Fen / Elian Moss", "relationship"),
      demoTag(14, "Meet Cute", "additional"),
      demoTag(15, "Coffee Shops", "additional"),
    ],
    warnings: [],
    files: [
      {
        id: 3,
        original_filename: "tea-at-the-last-station.epub",
        file_format: "EPUB",
        file_size: 102400,
      },
    ],
  },
];

export const demoFilterOptions = {
  advanced_search_enabled: false,
  fandoms: [{ id: 1, name: "The Glass Coast" }],
  tags: [],
  ratings: [],
  categories: [],
  warnings: [],
  completion_statuses: [],
  languages: [],
};
