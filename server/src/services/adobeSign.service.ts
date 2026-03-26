import axios, { type AxiosInstance } from "axios";
import { logger } from "../utils/logger.util.js";

interface AdobeSignConfig {
  integrationKey: string;
  baseUri: string;
}

function getConfig(): AdobeSignConfig {
  const integrationKey = process.env.ADOBE_SIGN_INTEGRATION_KEY?.trim();
  const baseUri =
    process.env.ADOBE_SIGN_BASE_URI?.trim() ?? "https://api.na4.adobesign.com";

  if (!integrationKey) {
    throw new Error(
      "Adobe Sign credentials not configured. Set ADOBE_SIGN_INTEGRATION_KEY and ADOBE_SIGN_BASE_URI (your account API host, e.g. https://api.na4.adobesign.com — not secure.*).",
    );
  }

  return { integrationKey, baseUri };
}

export class AdobeSignService {
  private async getSigningUrlWithRetry(agreementId: string): Promise<{
    signingUrl: string;
    signingUrlSetInfos: unknown[];
  }> {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      try {
        return await this.getSigningUrl(agreementId);
      } catch (error_) {
        const status = axios.isAxiosError(error_)
          ? error_.response?.status
          : undefined;
        if (status !== 404 || attempt === 7) {
          throw error_;
        }
        await new Promise((resolve) => {
          setTimeout(resolve, 500 * (attempt + 1));
        });
      }
    }
    throw new Error("Adobe Sign did not return a signing URL");
  }

  private readonly config: AdobeSignConfig;
  private readonly api: AxiosInstance;

  constructor() {
    this.config = getConfig();
    this.api = axios.create({
      baseURL: `${this.config.baseUri.replace(/\/$/, "")}/api/rest/v6`,
    });
  }

  /**
   * Enterprise integration keys authenticate as Bearer tokens on REST v6.
   * Optional ADOBE_SIGN_CLIENT_ID adds X-AdobeSign-ClientId if your shard requires it.
   */
  private authHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.config.integrationKey}`,
    };
    const clientId = process.env.ADOBE_SIGN_CLIENT_ID?.trim();
    if (clientId) {
      headers["X-AdobeSign-ClientId"] = clientId;
    }
    return headers;
  }

  async uploadTransientDocument(
    pdfBuffer: Buffer,
    fileName: string,
  ): Promise<string> {
    const headers = this.authHeaders();
    const formData = new FormData();
    formData.append(
      "File",
      new Blob([new Uint8Array(pdfBuffer)], { type: "application/pdf" }),
      fileName,
    );

    const res = await this.api.post("/transientDocuments", formData, {
      headers: {
        ...headers,
        "Content-Type": "multipart/form-data",
      },
    });

    return res.data.transientDocumentId;
  }

  async createAgreement(
    transientDocId: string,
    managerEmail: string,
    employeeEmail: string,
    agreementName: string,
  ): Promise<string> {
    const headers = this.authHeaders();

    const res = await this.api.post(
      "/agreements",
      {
        fileInfos: [{ transientDocumentId: transientDocId }],
        name: agreementName,
        participantSetsInfo: [
          {
            memberInfos: [{ email: managerEmail }],
            name: "manager_signer",
            order: 1,
            role: "SIGNER",
          },
          {
            memberInfos: [{ email: employeeEmail }],
            name: "employee_signer",
            order: 2,
            role: "SIGNER",
          },
        ],
        formFieldGenerators: [
          {
            formFieldNamePrefix: "manager_signature",
            anchorTextInfo: {
              anchorText: "Manager / supervisor signature",
              anchoredFormFieldLocation: {
                offsetX: 0,
                offsetY: -20,
                width: 230,
                height: 14,
              },
            },
            formFieldDescription: {
              inputType: "SIGNATURE",
              contentType: "SIGNATURE",
              required: true,
            },
            participantSetName: "manager_signer",
          },
          {
            formFieldNamePrefix: "employee_signature",
            anchorTextInfo: {
              anchorText: "Employee signature",
              anchoredFormFieldLocation: {
                offsetX: 0,
                offsetY: -20,
                width: 230,
                height: 14,
              },
            },
            formFieldDescription: {
              inputType: "SIGNATURE",
              contentType: "SIGNATURE",
              required: true,
            },
            participantSetName: "employee_signer",
          },
        ],
        signatureType: "ESIGN",
        state: "IN_PROCESS",
      },
      { headers },
    );

    return res.data.id;
  }

  async getSigningUrl(
    agreementId: string,
  ): Promise<{ signingUrl: string; signingUrlSetInfos: unknown[] }> {
    const headers = this.authHeaders();
    const res = await this.api.get(
      `/agreements/${agreementId}/signingUrls`,
      { headers },
    );
    return res.data;
  }

  /**
   * Embedded signing URL for the current signer (manager when they are order 1).
   * Employee signing stays on Adobe’s email link flow.
   */
  async createEmbeddedSigningView(
    agreementId: string,
    _options: { returnUrl: string; frameParent?: string },
  ): Promise<string> {
    // For integration-key flows, signingUrls is the most reliable way to get
    // the current signer's interactive URL across shards/account configs.
    const signing = await this.getSigningUrlWithRetry(agreementId);
    const direct =
      (signing as unknown as { signingUrl?: string }).signingUrl ??
      (signing as unknown as { signingUrlSetInfos?: Array<{ signingUrls?: Array<{ esignUrl?: string; url?: string }> }> })
        .signingUrlSetInfos?.[0]?.signingUrls?.[0]?.esignUrl ??
      (signing as unknown as { signingUrlSetInfos?: Array<{ signingUrls?: Array<{ esignUrl?: string; url?: string }> }> })
        .signingUrlSetInfos?.[0]?.signingUrls?.[0]?.url;

    if (typeof direct === "string" && direct.length > 0) {
      return direct;
    }
    throw new Error("Adobe Sign did not return a signing URL");
  }

  async registerWebhook(agreementId: string, webhookUrl: string): Promise<string> {
    const headers = this.authHeaders();
    const webhookName = `disciplinary-${agreementId.slice(-20)}`;
    const eventVariants: string[][] = [
      [
        "AGREEMENT_PARTICIPANT_COMPLETED",
        "AGREEMENT_WORKFLOW_COMPLETED",
        "AGREEMENT_EXPIRED",
        "AGREEMENT_CANCELLED",
        "AGREEMENT_REJECTED",
      ],
      [
        // Compatibility fallback for shards still using older event enums.
        "AGREEMENT_ACTION_COMPLETED",
        "AGREEMENT_WORKFLOW_COMPLETED",
        "AGREEMENT_EXPIRED",
        "AGREEMENT_RECALLED",
        "AGREEMENT_REJECTED",
      ],
      [
        "AGREEMENT_PARTICIPANT_COMPLETED",
        "AGREEMENT_RECALLED",
        "AGREEMENT_EXPIRED",
        "AGREEMENT_REJECTED",
      ],
    ];

    const failures: Array<{
      status?: number;
      data?: unknown;
      events: string[];
    }> = [];

    for (const events of eventVariants) {
      const payload = {
        name: webhookName,
        scope: "RESOURCE",
        resourceType: "AGREEMENT",
        resourceId: agreementId,
        state: "ACTIVE",
        webhookSubscriptionEvents: events,
        webhookUrlInfo: { url: webhookUrl },
      };

      try {
        const res = await this.api.post("/webhooks", payload, { headers });
        return res.data.id;
      } catch (error_) {
        if (axios.isAxiosError(error_)) {
          const status = error_.response?.status;
          const data = error_.response?.data;
          failures.push({
            events,
            ...(status === undefined ? {} : { status }),
            ...(data === undefined ? {} : { data }),
          });
          continue;
        }
        throw error_;
      }
    }

    throw new Error(
      `Adobe webhook creation failed for all event variants: ${JSON.stringify(failures)}`,
    );
  }

  async getSignedDocument(agreementId: string): Promise<Buffer> {
    const headers = this.authHeaders();
    try {
      const docsRes = await this.api.get(
        `/agreements/${agreementId}/documents`,
        { headers },
      );
      const documents = (docsRes.data as {
        documents?: Array<{ id?: string; label?: string }>;
      }).documents ?? [];
      const primaryDocId =
        documents.find((d) => d.label === "AGREEMENT_DOCUMENT")?.id ??
        documents[0]?.id;

      if (typeof primaryDocId === "string" && primaryDocId.length > 0) {
        const primaryRes = await this.api.get(
          `/agreements/${agreementId}/documents/${primaryDocId}`,
          { headers, responseType: "arraybuffer" },
        );
        return Buffer.from(primaryRes.data);
      }
    } catch (error_) {
      if (axios.isAxiosError(error_)) {
        logger.warn("Primary signed document fetch failed; falling back to combinedDocument", {
          agreementId,
          status: error_.response?.status,
          response: error_.response?.data,
        });
      }
    }

    const combinedRes = await this.api.get(
      `/agreements/${agreementId}/combinedDocument`,
      { headers, responseType: "arraybuffer" },
    );
    return Buffer.from(combinedRes.data);
  }

  async getAuditTrail(agreementId: string): Promise<Buffer> {
    const headers = this.authHeaders();
    const res = await this.api.get(
      `/agreements/${agreementId}/auditTrail`,
      { headers, responseType: "arraybuffer" },
    );
    return Buffer.from(res.data);
  }
}

let _instance: AdobeSignService | null = null;

export function getAdobeSignService(): AdobeSignService {
  if (!_instance) {
    try {
      _instance = new AdobeSignService();
    } catch (err) {
      logger.warn("Adobe Sign service not available", {
        message: (err as Error).message,
      });
      throw err;
    }
  }
  return _instance;
}
