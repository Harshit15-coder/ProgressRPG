import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchAnnouncements,
  fetchAnnouncementUnreadCount,
  markAnnouncementRead,
  markAllAnnouncementsRead,
} from "../api/announcements";

export const ANNOUNCEMENTS_QUERY_KEY = ["announcements"] as const;
export const ANNOUNCEMENT_UNREAD_QUERY_KEY = ["announcements", "unreadCount"] as const;

export function useAnnouncements(enabled: boolean = true) {
  return useQuery({
    queryKey: ANNOUNCEMENTS_QUERY_KEY,
    queryFn: fetchAnnouncements,
    enabled,
  });
}

export function useAnnouncementUnreadCount() {
  return useQuery({
    queryKey: ANNOUNCEMENT_UNREAD_QUERY_KEY,
    queryFn: fetchAnnouncementUnreadCount,
  });
}

export function useMarkAnnouncementRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: markAnnouncementRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ANNOUNCEMENTS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ANNOUNCEMENT_UNREAD_QUERY_KEY });
    },
  });
}

export function useMarkAllAnnouncementsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: markAllAnnouncementsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ANNOUNCEMENTS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ANNOUNCEMENT_UNREAD_QUERY_KEY });
    },
  });
}
