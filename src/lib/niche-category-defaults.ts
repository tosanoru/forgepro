/**
 * Formerly SEED_KEYWORDS, hardcoded directly in discover-channels/route.ts
 * — now used only as the initial seed for the nicheDiscoveryCategories
 * table (see seedNicheCategoriesIfEmpty below), which is the live source
 * of truth going forward. Editable at /admin → Niche Categories without a
 * redeploy.
 */
export const DEFAULT_NICHE_CATEGORIES: Record<string, string[]> = {
  finance: ["personal finance tips", "how to invest for beginners"],
  business: ["small business ideas", "side hustle ideas"],
  technology: ["tech explained", "gadget review"],
  "real estate": ["real estate investing", "how to buy your first home"],
  education: ["learn fast", "study tips"],
  "health & fitness": ["home workout", "healthy eating tips"],
  gaming: ["gaming highlights", "video game news"],
  entertainment: ["top 10 facts", "celebrity news"],
  "true crime": ["true crime stories", "unsolved mysteries"],
  motivation: ["daily motivation", "mindset shift"],
  "faceless facts / lists": ["did you know facts", "top 5 list"],
  science: ["science explained", "space facts"],
  history: ["history documentary", "ancient history explained"],
  "self improvement": ["self improvement tips", "how to build discipline"],
  productivity: ["productivity tips", "how to stop procrastinating"],
  travel: ["travel guide", "budget travel tips"],
  "food & cooking": ["easy recipes", "cooking hacks"],
  "diy & crafts": ["diy projects", "craft ideas"],
  parenting: ["parenting tips", "toddler activities"],
  "pets & animals": ["dog training tips", "animal facts"],
  "book summaries": ["book summary", "book review"],
  "movie & tv recaps": ["movie recap", "tv show explained"],
  "mythology & folklore": ["mythology explained", "folklore stories"],
  "space & astronomy": ["space exploration", "astronomy facts"],
  psychology: ["psychology facts", "human behavior explained"],
  "ai & automation": ["ai tools explained", "automate your business"],
};
