import type {
  AnnouncementListResponse,
  AnnouncementReadMutationResponse,
  AnnouncementUnreadCountResponse,
} from "../types";
import { apiFetch } from "../utils/api";

export const fetchAnnouncements = async (): Promise<AnnouncementListResponse> => {
  return apiFetch<AnnouncementListResponse>("/me/announcements/");
};

export const fetchAnnouncementUnreadCount = async (): Promise<AnnouncementUnreadCountResponse> => {
  return apiFetch<AnnouncementUnreadCountResponse>("/me/announcements_unread_count/");
};

export const markAnnouncementRead = async (
  announcementId: number,
): Promise<AnnouncementReadMutationResponse> => {
  return apiFetch<AnnouncementReadMutationResponse>("/me/mark_announcement_read/", {
    method: "POST",
    body: JSON.stringify({ announcement_id: announcementId }),
  });
};

export const markAllAnnouncementsRead = async (): Promise<AnnouncementReadMutationResponse> => {
  return apiFetch<AnnouncementReadMutationResponse>("/me/mark_all_announcements_read/", {
    method: "POST",
  });
};
