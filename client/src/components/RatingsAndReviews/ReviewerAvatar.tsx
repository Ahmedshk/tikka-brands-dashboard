import { useState } from 'react';
import { getReviewerInitial, normalizeGoogleProfilePhotoUrl } from '../../utils/ratingsAndReviewsHelpers';

export interface ReviewerAvatarProps {
  displayName: string;
  profilePhotoUrl?: string | null;
  className?: string;
}

export function ReviewerAvatar({
  displayName,
  profilePhotoUrl,
  className = 'w-10 h-10',
}: Readonly<ReviewerAvatarProps>) {
  const [imageFailed, setImageFailed] = useState(false);
  const src = normalizeGoogleProfilePhotoUrl(profilePhotoUrl);
  const showImage = Boolean(src) && !imageFailed;

  if (showImage && src) {
    return (
      <img
        src={src}
        alt=""
        referrerPolicy="no-referrer"
        loading="lazy"
        decoding="async"
        onError={() => setImageFailed(true)}
        className={`${className} rounded-full shrink-0 bg-gray-100 object-cover`}
      />
    );
  }

  return (
    <div
      className={`${className} rounded-full shrink-0 bg-gray-200 flex items-center justify-center text-sm font-semibold text-secondary`}
      aria-hidden
    >
      {getReviewerInitial(displayName)}
    </div>
  );
}
