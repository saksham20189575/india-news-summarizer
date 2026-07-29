export type BriefingSource = {
  title: string;
  url: string;
};

export type BriefingBullet = {
  summary: string;
  sources: BriefingSource[];
};

export type BriefingCategory = {
  category: string;
  bullets: BriefingBullet[];
};

export type Briefing = {
  schemaVersion: 1;
  runId: string;
  generatedAt: string;
  timezone: string;
  title: string;
  status: "ok";
  meta: {
    sourcesConfigured: number;
    sourcesSucceeded: number;
    articleCount: number;
    failedSources: Array<{ id: string; name: string; error: string }>;
  };
  categories: BriefingCategory[];
};
