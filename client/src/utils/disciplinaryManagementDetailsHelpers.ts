import toast from "react-hot-toast";
import { disciplinaryManagementService } from "../services/disciplinaryManagement.service";
import type { IncidentHistoryItem } from "../types/disciplinaryManagement.types";

export async function startIncidentSigning(params: {
  employeeId: string | undefined;
  signingLoadingIncidentId: string | null;
  incident: IncidentHistoryItem;
  setSigningLoadingIncidentId: (id: string | null) => void;
  setSignIframeLoading: (loading: boolean) => void;
  setEmbedUrl: (url: string | null) => void;
  setSignModalOpen: (open: boolean) => void;
}) {
  const {
    employeeId,
    signingLoadingIncidentId,
    incident,
    setSigningLoadingIncidentId,
    setSignIframeLoading,
    setEmbedUrl,
    setSignModalOpen,
  } = params;

  if (!employeeId || signingLoadingIncidentId) return;
  if (incident.signingPhase !== "pending_manager") {
    toast.error("This incident is not waiting for manager signature.");
    return;
  }

  setSigningLoadingIncidentId(incident.id);
  setSignIframeLoading(true);
  try {
    const { embeddedSignUrl } = await disciplinaryManagementService.getEmbeddedSignUrl(incident.id);
    setEmbedUrl(embeddedSignUrl);
    setSignModalOpen(true);
  } catch {
    toast.error(
      "Could not start signing. Ensure Adobe Sign is configured, emails exist, and there is an incident awaiting your signature.",
    );
  } finally {
    setSigningLoadingIncidentId(null);
  }
}

export function downloadSignedIncidentDocument(incident: IncidentHistoryItem) {
  if (!incident.signedDocumentPublicId) {
    toast.error("Document is not available for download yet.");
    return;
  }
  const filename = incident.documentName;
  const qs = new URLSearchParams({
    publicId: incident.signedDocumentPublicId,
    resourceType: "raw",
    filename,
  });
  window.open(`/api/proxy/document?${qs.toString()}`, "_blank", "noopener,noreferrer");
}

export function downloadIncidentAuditTrail(incident: IncidentHistoryItem) {
  if (!incident.auditTrailPublicId) {
    toast.error("Audit trail is not available yet.");
    return;
  }
  const filename = `AuditTrail_${incident.documentName}`;
  const qs = new URLSearchParams({
    publicId: incident.auditTrailPublicId,
    resourceType: "raw",
    filename,
  });
  window.open(`/api/proxy/document?${qs.toString()}`, "_blank", "noopener,noreferrer");
}

