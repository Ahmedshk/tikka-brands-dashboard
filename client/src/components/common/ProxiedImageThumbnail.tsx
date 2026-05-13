import { useEffect, useRef, useState } from "react";
import { getDocumentImageBlobUrl } from "../../services/training.service";
import { DocumentTypeThumbnail } from "../modal/DocumentTypeThumbnail";

/**
 * Small square preview for a Cloudinary image fetched through the authenticated document proxy.
 */
export function ProxiedImageThumbnail({
  publicId,
  fallbackFormat = "png",
  className = "",
}: Readonly<{ publicId: string; fallbackFormat?: string; className?: string }>) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const blobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    let revoked = false;
    getDocumentImageBlobUrl(publicId)
      .then((url) => {
        if (revoked) {
          URL.revokeObjectURL(url);
          return;
        }

        blobUrlRef.current = url;
        setBlobUrl(url);
      })
      .catch(() => {
        if (revoked) return;
        setFailed(true);
      });
    return () => {
      revoked = true;
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
      setBlobUrl(null);
    };
  }, [publicId]);

  if (failed) {
    return <DocumentTypeThumbnail format={fallbackFormat} className={className} />;
  }
  if (!blobUrl) {
    return (
      <div
        className={`h-12 w-12 shrink-0 animate-pulse rounded border border-gray-200 bg-gray-200 ${className}`}
        aria-hidden
      />
    );
  }
  return (
    <div
      className={`h-12 w-12 shrink-0 overflow-hidden rounded border border-gray-200 bg-gray-100 ${className}`}
    >
      <img src={blobUrl} alt="" className="h-full w-full object-cover" />
    </div>
  );
}
