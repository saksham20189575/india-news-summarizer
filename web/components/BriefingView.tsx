import type { Briefing, BriefingBullet } from "@/lib/types";
import { formatBriefingStamp, formatRelativeUpdated } from "@/lib/format";

function BulletBlock({ bullet }: { bullet: BriefingBullet }) {
  const headline = bullet.sources[0]?.title;
  const singleSource = bullet.sources.length === 1;

  return (
    <article className="briefing-entry">
      {headline ? <h4 className="entry-title">{headline}</h4> : null}
      <p className="entry-summary">{bullet.summary}</p>
      <div className="entry-sources">
        {bullet.sources.map((source, index) => {
          const label =
            singleSource && source.title === headline
              ? "Read full article"
              : source.title;
          return (
            <a
              key={`${source.url}-${index}`}
              className="source-link"
              href={source.url}
              rel="noreferrer"
              target="_blank"
            >
              <span className="source-icon" aria-hidden="true">
                link
              </span>
              {label}
            </a>
          );
        })}
      </div>
    </article>
  );
}

export function BriefingView({ data }: { data: Briefing }) {
  const stamp = formatBriefingStamp(data.generatedAt, data.timezone);
  const relative = formatRelativeUpdated(data.generatedAt);
  const failed = data.meta.failedSources ?? [];

  return (
    <>
      <header className="top-bar">
        <div className="top-bar-inner">
          <p className="brand-mark">Bharat Brief</p>
          <span className="updated-chip">{relative}</span>
        </div>
      </header>

      <main className="page">
        <section className="hero">
          <div className="hero-copy">
            <h1 className="display-title">Bharat Brief</h1>
            <p className="tagline">India’s hourly news briefing, summarized.</p>
          </div>
          <div className="hero-meta">
            <p className="stamp">{stamp}</p>
            <p className="refresh-note">Refreshes every hour</p>
          </div>
          {failed.length > 0 ? (
            <p className="partial-note">
              Partial source coverage this hour:{" "}
              {failed.map((f) => f.name).join(", ")} unavailable. Showing the
              latest briefing from sources that succeeded (
              {data.meta.sourcesSucceeded}/{data.meta.sourcesConfigured}).
            </p>
          ) : null}
        </section>

        <div className="briefing-list">
          {data.categories.map((category) => (
            <section key={category.category} className="category-block">
              <div className="category-label">
                <span className="category-dot" aria-hidden="true" />
                <h2>{category.category}</h2>
              </div>
              <div className="category-bullets">
                {category.bullets.map((bullet, index) => (
                  <BulletBlock
                    key={`${category.category}-${index}`}
                    bullet={bullet}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>

      <footer className="site-footer">
        <div className="footer-inner">
          <p className="footer-brand">Bharat Brief</p>
          <p className="footer-copy">
            Summaries are AI-generated from public Indian news sources. Full
            articles remain on the original sites.
          </p>
        </div>
      </footer>
    </>
  );
}

export function EmptyState({
  title,
  message,
  tone = "empty",
}: {
  title: string;
  message: string;
  tone?: "empty" | "error";
}) {
  return (
    <>
      <header className="top-bar">
        <div className="top-bar-inner">
          <p className="brand-mark">Bharat Brief</p>
        </div>
      </header>
      <main className="page">
        <section className="hero">
          <div className="hero-copy">
            <h1 className="display-title">Bharat Brief</h1>
            <p className="tagline">India’s hourly news briefing, summarized.</p>
          </div>
        </section>
        <div className={`status-panel ${tone}`} role="status">
          <h2>{title}</h2>
          <p>{message}</p>
        </div>
      </main>
      <footer className="site-footer">
        <div className="footer-inner">
          <p className="footer-brand">Bharat Brief</p>
          <p className="footer-copy">
            Summaries are AI-generated from public Indian news sources. Full
            articles remain on the original sites.
          </p>
        </div>
      </footer>
    </>
  );
}
