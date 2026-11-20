import { requireSupabase } from "../lib/supabase";

const QUIZ_MEDIA_BUCKET = "quiz-media";
const imageExtensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export async function uploadQuizImage(userId: string, quizId: string, file: File): Promise<string> {
  const extension = imageExtensions[file.type];
  if (!extension) throw new Error("Choose a JPG, PNG, or WebP image.");
  if (file.size > 5 * 1024 * 1024) throw new Error("Quiz images must be 5 MB or smaller.");

  const path = `${userId}/${quizId}/${crypto.randomUUID()}.${extension}`;
  const { error } = await requireSupabase().storage.from(QUIZ_MEDIA_BUCKET).upload(path, file, {
    cacheControl: "3600",
    contentType: file.type,
    upsert: false,
  });
  if (error) throw error;
  return path;
}

export async function getQuizMediaUrls(paths: Array<string | null | undefined>): Promise<Map<string, string>> {
  const uniquePaths = [...new Set(paths.filter((path): path is string => Boolean(path)))];
  if (!uniquePaths.length) return new Map();

  const { data, error } = await requireSupabase()
    .storage
    .from(QUIZ_MEDIA_BUCKET)
    .createSignedUrls(uniquePaths, 60 * 60);
  if (error) throw error;

  const urls = new Map<string, string>();
  for (const result of data) {
    if (!result.path || !result.signedUrl) {
      throw new Error(result.error ?? "Could not create a signed URL for a quiz image.");
    }
    urls.set(result.path, result.signedUrl);
  }
  return urls;
}
