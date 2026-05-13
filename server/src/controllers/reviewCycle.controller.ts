import type { Request, Response, NextFunction } from "express";
import { ReviewCycleService } from "../services/reviewCycle.service.js";
import { ReviewCycleModel } from "../models/reviewCycle.model.js";
import { SelfReviewModel } from "../models/selfReview.model.js";
import { ManagerReviewModel } from "../models/managerReview.model.js";
import { ActionPlanModel } from "../models/actionPlan.model.js";
import { CheckInModel } from "../models/checkIn.model.js";
import { AppError } from "../utils/errors.util.js";
import { routeParamId } from "../utils/routeParams.util.js";
import type { QuestionResponse } from "../types/reviewCycle.types.js";
import mongoose from "mongoose";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import { getReviewCheckInFolder } from "../config/upload.config.js";
import { getSecureDocumentUrl } from "../config/cloudinary.js";
import { isDocumentPublicIdAllowed } from "../config/documentProxyAllowlist.js";

const service = new ReviewCycleService();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

export const uploadMiddleware = upload.array("documents", 10);

export async function getCycles(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const status = req.query.status as string | undefined;
    const userId = req.query.employeeId as string | undefined;
    const pastOnly = req.query.pastOnly === "true" || req.query.pastOnly === "1";
    const activeOnly = req.query.activeOnly === "true" || req.query.activeOnly === "1";
    const locationIdRaw = req.query.locationId;
    const locationId =
      typeof locationIdRaw === "string" && locationIdRaw.trim() !== "" ? locationIdRaw.trim() : undefined;
    const searchRaw = req.query.search;
    const employeeNameSearch =
      typeof searchRaw === "string" && searchRaw.trim() !== "" ? searchRaw.trim() : undefined;
    const actorUserId = req.user?.userId;
    const result = await service.getCycles({
      pastOnly,
      page,
      limit,
      ...(actorUserId != null && actorUserId !== "" ? { actorUserId } : {}),
      ...(userId != null && userId !== "" ? { userId } : {}),
      ...(status != null && status !== "" ? { status } : {}),
      ...(activeOnly && pastOnly === false ? { activeOnly: true } : {}),
      ...(locationId ? { locationId } : {}),
      ...(employeeNameSearch ? { employeeNameSearch } : {}),
    });
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

export async function getCycleSnapshot(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = routeParamId(req, "id");
    const data = await service.getCycleSnapshot(id, req.user?.userId);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function getCycleById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = routeParamId(req, "id");
    const cycle = await ReviewCycleModel.findById(id)
      .populate(
        "employeeId",
        "firstName lastName email phone role profileImagePublicId startDate homebaseData",
      )
      .populate("reviewedByManagerId", "firstName lastName email role")
      .populate("approvedByDirectorId", "firstName lastName email role")
      .lean();
    if (!cycle) throw new AppError("Cycle not found", 404);
    res.json({ success: true, data: cycle });
  } catch (err) { next(err); }
}

export async function getDashboard(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const actorUserId = req.user?.userId ?? null;
    const data = await service.getDashboardKPIs(actorUserId);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function submitSelfReview(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = routeParamId(req, "id");
    const result = await service.submitSelfReview(id, req.user!.userId, req.body.responses);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

/** Public (no auth): validate token and return questionnaire + metadata for self-review page. */
export async function getSelfReviewByToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = (req.query.token as string)?.trim();
    if (!token) {
      res.status(400).json({ success: false, message: "Token is required" });
      return;
    }
    const data = await service.getSelfReviewByToken(token);
    if (!data) {
      res.status(200).json({ success: false, valid: false, message: "This link is invalid or has expired." });
      return;
    }
    res.status(200).json({ success: true, data });
  } catch (err) { next(err); }
}

/** Public (no auth): submit self-review using token. */
export async function submitSelfReviewByToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { token, responses } = req.body as { token?: string; responses?: QuestionResponse[] };
    if (!token?.trim()) {
      res.status(400).json({ success: false, message: "Token is required" });
      return;
    }
    if (!Array.isArray(responses)) {
      res.status(400).json({ success: false, message: "Responses are required" });
      return;
    }
    await service.submitSelfReviewByToken(token.trim(), responses);
    res.status(200).json({ success: true, message: "Self-review submitted successfully." });
  } catch (err) { next(err); }
}

function safeInlineFilenameForAttachment(filename?: string, format?: string): string | null {
  const fn = filename?.trim() ?? "";
  if (fn && !fn.includes("/") && !fn.includes("\\") && /\.[^./\\]+$/i.test(fn)) return fn;
  const fmt = format?.trim().toLowerCase().replaceAll(/[^a-z0-9]/g, "") ?? "";
  if (fmt) return `document.${fmt}`;
  return null;
}

/** Public (no auth): stream a self-review questionnaire attachment when token + publicId are valid. */
export async function getSelfReviewDocumentByToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = typeof req.query.token === "string" ? req.query.token.trim() : "";
    const publicId = typeof req.query.publicId === "string" ? req.query.publicId.trim() : "";
    if (!token || !publicId) {
      res.status(400).json({ success: false, message: "token and publicId are required" });
      return;
    }
    const meta = await service.findSelfReviewAttachmentForToken(token, publicId);
    if (!meta) {
      res.status(404).json({ success: false, message: "Document not found" });
      return;
    }
    if (!isDocumentPublicIdAllowed(publicId)) {
      res.status(400).json({ success: false, message: "Invalid document" });
      return;
    }
    const cloudinaryUrl = getSecureDocumentUrl(publicId, meta.resourceType);
    const docResponse = await fetch(cloudinaryUrl);
    if (!docResponse.ok) {
      res.status(404).json({ success: false, message: "Document not found" });
      return;
    }
    const buffer = Buffer.from(await docResponse.arrayBuffer());
    const contentType = docResponse.headers.get("content-type") ?? "application/octet-stream";
    const safeFilename = safeInlineFilenameForAttachment(meta.filename, meta.format);
    const contentDisposition = safeFilename
      ? `inline; filename="${safeFilename.replaceAll('"', '\u005C"')}"`
      : (docResponse.headers.get("content-disposition") ?? "inline");
    res.set({
      "Content-Type": contentType,
      "Content-Length": buffer.length.toString(),
      "Cache-Control": "private, max-age=300",
      "Content-Disposition": contentDisposition,
    });
    res.send(buffer);
  } catch (err) {
    next(err);
  }
}

export async function getSelfReview(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = routeParamId(req, "id");
    const cycle = await ReviewCycleModel.findById(id).lean();
    if (!cycle) throw new AppError("Cycle not found", 404);

    const userId = req.user!.userId;
    const isEmployee = cycle.employeeId.toString() === userId;
    const isManager = cycle.reviewedByManagerId?.toString() === userId;
    const isDirector = cycle.approvedByDirectorId?.toString() === userId;

    // Manager can only see self-review after submitting their own review
    if (isManager && !cycle.managerReviewId) {
      throw new AppError("Complete your review first to view the self-review", 403);
    }

    if (!isEmployee && !isManager && !isDirector) {
      throw new AppError("Access denied", 403);
    }

    if (!mongoose.Types.ObjectId.isValid(id)) throw new AppError("Invalid id", 400);
    const oid = new mongoose.Types.ObjectId(id);
    const review = await SelfReviewModel.findOne({ reviewCycleId: oid }).lean();
    res.json({ success: true, data: review });
  } catch (err) { next(err); }
}

export async function completeManagerReview(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = routeParamId(req, "id");
    const result = await service.completeManagerReview(id, req.user!.userId, req.body.responses);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

export async function submitManagerReview(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = routeParamId(req, "id");
    const { responses } = req.body as { responses?: unknown };
    if (!Array.isArray(responses)) {
      throw new AppError("Request body must include a responses array", 400);
    }
    const result = await service.submitManagerReview(id, req.user!.userId, responses as QuestionResponse[]);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

export async function updateManagerReview(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = routeParamId(req, "id");
    const result = await service.updateManagerReview(id, req.user!.userId, req.body.responses);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

export async function getManagerReview(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = routeParamId(req, "id");
    if (!mongoose.Types.ObjectId.isValid(id)) throw new AppError("Invalid id", 400);
    const oid = new mongoose.Types.ObjectId(id);
    const review = await ManagerReviewModel.findOne({ reviewCycleId: oid }).lean();
    res.json({ success: true, data: review });
  } catch (err) { next(err); }
}

export async function approveReview(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = routeParamId(req, "id");
    const { comments, salaryIncrement: rawInc, salaryIncrementType } = req.body as {
      comments?: string;
      salaryIncrement?: unknown;
      salaryIncrementType?: unknown;
    };
    if (
      salaryIncrementType != null &&
      salaryIncrementType !== "percent" &&
      salaryIncrementType !== "fixed"
    ) {
      throw new AppError("salaryIncrementType must be 'percent' or 'fixed'", 400);
    }
    const inc =
      rawInc === undefined || rawInc === null || rawInc === ""
        ? undefined
        : Number(rawInc);
    if (inc !== undefined && (typeof inc !== "number" || Number.isNaN(inc))) {
      throw new AppError("Invalid salary increment", 400);
    }
    const result = await service.approveReview(
      id,
      req.user!.userId,
      comments,
      inc,
      salaryIncrementType as "percent" | "fixed" | undefined,
    );
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

export async function rejectReview(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = routeParamId(req, "id");
    if (!req.body.comments) throw new AppError("Comments are required for rejection", 400);
    const result = await service.rejectReview(id, req.user!.userId, req.body.comments);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

export async function createActionPlan(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = routeParamId(req, "id");
    const result = await service.createActionPlan(id, req.user!.userId, req.body.items);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

export async function getActionPlan(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = routeParamId(req, "id");
    if (!mongoose.Types.ObjectId.isValid(id)) throw new AppError("Invalid id", 400);
    const oid = new mongoose.Types.ObjectId(id);
    const plan = await ActionPlanModel.findOne({ reviewCycleId: oid }).lean();
    res.json({ success: true, data: plan });
  } catch (err) { next(err); }
}

export async function completeReview(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = routeParamId(req, "id");
    const result = await service.completeReview(id, req.user!.userId);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

export async function submitCheckIn(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = routeParamId(req, "id");
    const period = req.params.period as "30" | "60";
    if (period !== "30" && period !== "60") throw new AppError("Invalid period", 400);
    const result = await service.submitCheckIn(id, period, req.user!.userId, {
      responses: req.body.responses,
      managerComments: req.body.managerComments,
      actionPlanProgress: req.body.actionPlanProgress,
      actionItemProgress: req.body.actionItemProgress,
    });
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

export async function uploadCheckInDocument(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = routeParamId(req, "id");
    const period = req.params.period as "30" | "60";
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (files.length === 0) throw new AppError("No files uploaded", 400);

    if (!mongoose.Types.ObjectId.isValid(id)) throw new AppError("Invalid id", 400);
    const oid = new mongoose.Types.ObjectId(id);
    const checkIn = await CheckInModel.findOne({
      reviewCycleId: oid,
      period,
    });
    if (!checkIn) throw new AppError("Check-in not found. Submit check-in first.", 404);

    const employeeId = checkIn.employeeId.toString();
    const folder = getReviewCheckInFolder(employeeId, period);

    const toError = (e: unknown): Error => {
      if (e instanceof Error) return e;
      if (typeof e === "string") return new Error(e);
      try {
        return new Error(JSON.stringify(e));
      } catch {
        return new Error("Unknown error");
      }
    };

    const uploadOne = async (file: Express.Multer.File) =>
      new Promise<{
        secure_url: string;
        public_id: string;
        original_filename?: string;
        resource_type?: string;
        format?: string;
      }>((resolve, reject) => {
        const resourceType = file.mimetype.startsWith("image/") ? "image" : "raw";
        const stream = cloudinary.uploader.upload_stream(
          { folder, resource_type: resourceType, use_filename: true, unique_filename: true },
          (err, result) => {
            if (err) {
              reject(toError(err));
              return;
            }
            resolve(result as {
              secure_url: string;
              public_id: string;
              original_filename?: string;
              resource_type?: string;
              format?: string;
            });
          },
        );
        stream.end(file.buffer);
      });

    const uploaded = await Promise.all(files.map((file) => uploadOne(file)));
    const existing = checkIn.documents ?? [];
    const mapped = uploaded.map((u, idx) => {
      const fallbackFormat = files[idx]?.originalname.split(".").pop()?.toLowerCase();
      const filename = files[idx]?.originalname ?? u.original_filename;
      const format = u.format ?? fallbackFormat;
      return {
        publicId: u.public_id,
        ...(filename ? { filename } : {}),
        resourceType: files[idx]?.mimetype.startsWith("image/") ? "image" : "raw",
        ...(format ? { format } : {}),
      };
    });
    const updatedDocs = [...existing, ...mapped];
    checkIn.documents = updatedDocs;
    if (updatedDocs.length > 0) {
      checkIn.set("documentUrl", undefined);
      checkIn.documentPublicId = updatedDocs[0]!.publicId;
    }
    await checkIn.save();

    res.json({ success: true, data: checkIn });
  } catch (err) { next(err); }
}

export async function initializeCycles(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const count = await service.initializeCyclesForExistingEmployees();
    res.json({ success: true, data: { cyclesCreated: count } });
  } catch (err) { next(err); }
}

export async function startCycleForUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.body?.userId;
    if (typeof userId !== "string" || userId.trim() === "") {
      res.status(400).json({ success: false, message: "userId is required" });
      return;
    }
    const result = await service.startCycleForUser(userId.trim());
    if (result.started) {
      res.json({ success: true, data: { started: true } });
      return;
    }
    const msg = result.message ?? "Could not start review cycle";
    const status = msg.includes("already has an active") ? 409 : 400;
    res.status(status).json({ success: false, message: msg });
  } catch (err) { next(err); }
}
