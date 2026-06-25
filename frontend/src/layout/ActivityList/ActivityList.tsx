import React, { useEffect, useState } from "react";
import { apiFetch } from "../../utils/api";
import List from "../../components/List/List";
import type { PlayerActivity } from "../../types";

export default function ActivityList() {
  const [activities, setActivities] = useState<PlayerActivity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<{ results: PlayerActivity[] } | PlayerActivity[]>(
      "/player-activities/"
    )
      .then((data) => {
        const results = Array.isArray(data)
          ? data
          : (data as { results: PlayerActivity[] }).results ?? [];
        setActivities(results);
        setLoading(false);
      })
      .catch((error) => {
        console.error("Error fetching activities:", error);
        setLoading(false);
      });
  }, []);

  if (loading) return <p>Loading activities...</p>;
  if (activities.length === 0) return <p>No activities yet.</p>;

  // Cast to satisfy List's generic constraint (requires [key: string]: unknown)
  type ActivityListItem = PlayerActivity & { [key: string]: unknown };
  const listItems = activities as ActivityListItem[];

  return (
    <>
      <h2>Your Activities</h2>
      <List
        items={listItems}
        renderItem={(activity) => (
          <div key={activity.id as number}>
            <p>
              {activity.name as string} -{" "}
              {new Date(activity.created_at as string).toLocaleString()}
            </p>
          </div>
        )}
      />
    </>
  );
}
