import { BriefingView, EmptyState } from "@/components/BriefingView";
import { fetchLatestSummary } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const result = await fetchLatestSummary();

  if (!result.ok) {
    if (result.status === 404) {
      return (
        <EmptyState
          title="No summary yet"
          message="The hourly briefing has not been published. Check back soon, or run npm run seed in web/ for local development."
          tone="empty"
        />
      );
    }

    return (
      <EmptyState
        title="Temporarily unavailable"
        message={result.message}
        tone="error"
      />
    );
  }

  return <BriefingView data={result.data} />;
}
