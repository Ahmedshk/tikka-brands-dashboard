import type { Request, Response, NextFunction } from "express";
import { getAdobeSignService } from "../services/adobeSign.service.js";
import { DisciplinaryIncidentService } from "../services/disciplinaryIncident.service.js";
import { uploadToCloudinary } from "../config/cloudinary.js";
import { getDisciplinaryFolder } from "../config/upload.config.js";
import { NotificationService } from "../services/notification.service.js";
import { getIO } from "../config/socket.js";
import { logger } from "../utils/logger.util.js";
import { logWebhookReceived } from "../utils/webhookLog.util.js";
import type { SigningStatus } from "../types/disciplinary.types.js";
import { DisciplinaryIncidentModel } from "../models/disciplinaryIncident.model.js";

const incidentService = new DisciplinaryIncidentService();
const notificationService = new NotificationService();

/**
 * Webhooks created in the Acrobat Sign admin UI use this application id.
 * @see https://helpx.adobe.com/sign/developer/webhook/create.html
 */
const ADOBE_SIGN_WEB_UI_CLIENT_ID = "UB7E5BXCXY";

function readAdobeSignWebhookClientId(req: Request): string | null {
  const raw = req.get("X-AdobeSign-ClientId") ?? req.get("x-adobesign-clientid");
  const trimmed = raw?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

/** Optional: API application id when it matches webhook X-AdobeSign-ClientId (not the integration key). */
function isAllowedAdobeWebhookClientId(clientId: string): boolean {
  if (clientId === ADOBE_SIGN_WEB_UI_CLIENT_ID) return true;
  const fromEnv = process.env.ADOBE_SIGN_CLIENT_ID?.trim();
  if (fromEnv) {
    return clientId === fromEnv;
  }
  // Integration-key-only setups typically do not have an OAuth client id.
  // In that case, accept Adobe's provided verification client id and echo it back.
  return clientId.length > 0;
}

/**
 * Acrobat Sign verifies new webhooks with HTTPS GET and requires echoing the same
 * X-AdobeSign-ClientId on 2xx responses. POST notifications require the same echo.
 * @see https://helpx.adobe.com/sign/using/adobe-sign-webhooks-api.html
 */
export function handleAdobeSignWebhookVerification(
  req: Request,
  res: Response,
): void {
  const clientId = readAdobeSignWebhookClientId(req);
  logWebhookReceived("Adobe Sign", {
    stage: "verification",
    method: req.method,
    hasClientId: Boolean(clientId),
    ip: req.ip ?? null,
  });
  if (!clientId) {
    res.status(403).json({ message: "Missing X-AdobeSign-ClientId" });
    return;
  }
  if (!isAllowedAdobeWebhookClientId(clientId)) {
    res.status(403).json({ message: "Unrecognized X-AdobeSign-ClientId" });
    return;
  }
  res.setHeader("X-AdobeSign-ClientId", clientId);
  res.status(200).end();
}

function agreementIdFromWebhookBody(body: Record<string, unknown>): string | null {
  const top = body.agreementId ?? body.agreement_id;
  if (typeof top === "string" && top.length > 0) return top;
  const agreement = body.agreement as Record<string, unknown> | undefined;
  if (agreement && typeof agreement.id === "string") return agreement.id;
  return null;
}

function isAwaitingSignature(status: SigningStatus): boolean {
  return status === "pending_manager" || status === "pending_employee";
}

function emitDisciplinaryRealtimeUpdate(
  employeeId: string,
  incidentId: string,
  signingStatus: SigningStatus,
): void {
  try {
    const io = getIO();
    io.to(`disciplinary:employee:${employeeId}`).emit("disciplinary:incident-updated", {
      employeeId,
      incidentId,
      signingStatus,
    });
  } catch {
    // Socket.io may not be initialized in scripts/tests.
  }
}

async function finalizeFullySignedAgreement(agreementId: string): Promise<void> {
  const incident = await incidentService.findIncidentByAgreementId(agreementId);
  if (!incident) return;
  if (incident.signingStatus === "completed") return;
  if (!isAwaitingSignature(incident.signingStatus)) return;

  const incidentId = incident._id.toString();
  const employeeId = incident.employeeId.toString();
  const transitioned = await DisciplinaryIncidentModel.findOneAndUpdate(
    { _id: incidentId, signingStatus: { $in: ["pending_manager", "pending_employee"] } },
    { $set: { signingStatus: "completed", employeeSignedAt: new Date() } },
    { new: true },
  ).lean();
  if (!transitioned) {
    logger.info("Skipping duplicate fully-signed webhook event", { incidentId });
    return;
  }

  const adobeSignService = getAdobeSignService();
  const [signedPdf, auditTrail] = await Promise.all([
    adobeSignService.getSignedDocument(agreementId),
    adobeSignService.getAuditTrail(agreementId),
  ]);

  const folder = getDisciplinaryFolder(employeeId);

  const [signedUpload, auditUpload] = await Promise.all([
    uploadToCloudinary(
      { buffer: signedPdf, mimetype: "application/pdf" },
      folder,
      { resource_type: "raw", public_id: `signed_${incidentId}` },
    ),
    uploadToCloudinary(
      { buffer: auditTrail, mimetype: "application/pdf" },
      folder,
      { resource_type: "raw", public_id: `audit_${incidentId}` },
    ),
  ]);

  await incidentService.updateIncidentSigning(incidentId, {
    signedDocumentPublicId: signedUpload.public_id,
    auditTrailPublicId: auditUpload.public_id,
  });
  emitDisciplinaryRealtimeUpdate(employeeId, incidentId, "completed");

  const reportedBy = incident.reportedBy?.toString();
  if (reportedBy) {
    await notificationService.send({
      recipientId: reportedBy,
      type: "disciplinary_document_signed",
      title: "Document Fully Signed",
      message: `The disciplinary document for incident #${incidentId.slice(-6)} has been fully signed by all parties.`,
      data: { incidentId, employeeId, locationId: incident.locationId.toString() },
      channels: ["all"],
    });
  }

  logger.info("Agreement fully signed, documents uploaded", {
    incidentId,
    signedPublicId: signedUpload.public_id,
    auditPublicId: auditUpload.public_id,
  });
}

async function markSigningAborted(
  agreementId: string,
  nextStatus: "declined" | "cancelled" | "expired",
  adobeEvent: string,
): Promise<void> {
  const incident = await incidentService.findIncidentByAgreementId(agreementId);
  if (!incident) return;
  if (!isAwaitingSignature(incident.signingStatus)) return;

  const incidentId = incident._id.toString();
  const employeeId = incident.employeeId.toString();

  const transitioned = await DisciplinaryIncidentModel.findOneAndUpdate(
    { _id: incidentId, signingStatus: { $in: ["pending_manager", "pending_employee"] } },
    { $set: { signingStatus: nextStatus } },
    { new: true },
  ).lean();
  if (!transitioned) {
    logger.info("Skipping duplicate aborted-signing webhook event", {
      incidentId,
      nextStatus,
      adobeEvent,
    });
    return;
  }
  emitDisciplinaryRealtimeUpdate(employeeId, incidentId, nextStatus);

  const labels: Record<typeof nextStatus, string> = {
    declined: "rejected",
    cancelled: "canceled",
    expired: "expired",
  };

  const reportedBy = incident.reportedBy?.toString();
  if (reportedBy) {
    await notificationService.send({
      recipientId: reportedBy,
      type: "disciplinary_signing_aborted",
      title: "Disciplinary signing not completed",
      message: `The disciplinary document for incident #${incidentId.slice(-6)} was ${labels[nextStatus]} in Adobe Sign.`,
      data: {
        incidentId,
        employeeId,
        reason: nextStatus,
        adobeEvent,
        locationId: incident.locationId.toString(),
      },
      channels: ["all"],
    });
  }

  logger.info("Agreement signing aborted", {
    incidentId,
    nextStatus,
    adobeEvent,
  });
}

export async function handleAdobeSignWebhook(
  req: Request,
  res: Response,
  _next: NextFunction,
): Promise<void> {
  const clientId = readAdobeSignWebhookClientId(req);
  const rawEventEarly = (req.body as Record<string, unknown> | undefined)?.event;
  logWebhookReceived("Adobe Sign", {
    stage: "event",
    method: req.method,
    hasClientId: Boolean(clientId),
    event: typeof rawEventEarly === "string" ? rawEventEarly : null,
    agreementId: agreementIdFromWebhookBody(
      (req.body as Record<string, unknown> | undefined) ?? {},
    ),
    ip: req.ip ?? null,
  });
  if (!clientId) {
    res.status(403).json({ message: "Missing X-AdobeSign-ClientId" });
    return;
  }
  if (!isAllowedAdobeWebhookClientId(clientId)) {
    res.status(403).json({ message: "Unrecognized X-AdobeSign-ClientId" });
    return;
  }
  res.setHeader("X-AdobeSign-ClientId", clientId);

  try {
    const body = req.body as Record<string, unknown>;
    const rawEvent = body.event as string | undefined;
    const event =
      typeof rawEvent === "string" ? rawEvent.toUpperCase() : undefined;
    const agreementId = agreementIdFromWebhookBody(body);

    if (!agreementId) {
      res.status(200).json({ message: "No agreement id in payload, ignoring" });
      return;
    }

    const incident = await incidentService.findIncidentByAgreementId(agreementId);
    if (!incident) {
      logger.warn("Webhook received for unknown agreement", { agreementId });
      res.status(200).json({ message: "Unknown agreement" });
      return;
    }

    const incidentId = incident._id.toString();

    switch (event) {
      case "AGREEMENT_ACTION_COMPLETED": {
        const participantEmail =
          (body.participantUserEmail as string | undefined) ??
          (body.participantUserId as string | undefined);
        if (incident.signingStatus === "pending_manager") {
          await incidentService.handleManagerSignedDisciplinaryIncident(incident);
          emitDisciplinaryRealtimeUpdate(
            incident.employeeId.toString(),
            incidentId,
            "pending_employee",
          );
          logger.info("Manager signed; points applied, employee notified", {
            incidentId,
            participantEmail,
          });
        }
        break;
      }
      case "AGREEMENT_ALL_SIGNED":
      case "AGREEMENT_WORKFLOW_COMPLETED":
        await finalizeFullySignedAgreement(agreementId);
        break;
      case "AGREEMENT_RECALLED":
        await markSigningAborted(agreementId, "cancelled", event);
        break;
      case "AGREEMENT_EXPIRED":
        await markSigningAborted(agreementId, "expired", event);
        break;
      case "AGREEMENT_REJECTED":
        await markSigningAborted(agreementId, "declined", event);
        break;
      default:
        if (event) {
          logger.debug("Adobe Sign webhook ignored (unhandled event)", {
            agreementId,
            event,
          });
        }
        break;
    }

    res.status(200).json({ message: "ok" });
  } catch (err) {
    logger.error("Adobe Sign webhook error", { err });
    res.status(200).json({ message: "error handled" });
  }
}
