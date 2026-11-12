import { useEffect, useState } from "react";
import { CircleUserRound } from "lucide-react";
import { getAvatarUrl } from "../services/profileService";

interface ProfileAvatarProps {
  path: string | null;
  name: string;
  size?: "small" | "large";
}

export function ProfileAvatar({ path, name, size = "large" }: ProfileAvatarProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setUrl(null);
    setError(null);
    if (path) {
      void getAvatarUrl(path).then((signedUrl) => {
        if (active) setUrl(signedUrl);
      }).catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "The profile image could not be loaded.");
      });
    }
    return () => {
      active = false;
    };
  }, [path]);

  const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  return (
    <span
      className={`profile-avatar profile-avatar-${size}`}
      role="img"
      aria-label={error ? `Profile image unavailable: ${error}` : `${name}'s profile picture`}
      title={error ?? undefined}
    >
      {url
        ? <img src={url} alt="" />
        : initials || <CircleUserRound aria-hidden="true" />}
    </span>
  );
}
