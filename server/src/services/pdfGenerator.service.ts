import PDFDocument from "@react-pdf/pdfkit";
import { logger } from "../utils/logger.util.js";

interface IncidentReportData {
  companyName: string;
  employeeName: string;
  employeeRole: string;
  managerName: string;
  incidentDate: string;
  appliedPolicies: {
    title: string;
    description: string;
    points: number;
    sectionName?: string;
  }[];
  isImmediateTermination: boolean;
  immediateTerminationPolicy?: { title: string; description: string };
  totalPoints: number;
  detailsOfIncident: string;
  supervisorCommitment: string;
  supervisorComments: string;
  positiveResults?: string;
  negativeConsequences?: string;
  guidelines: { pointThreshold: number; action: string }[];
}

type TableColumn = {
  label: string;
  width: number;
  align?: "left" | "center" | "right";
};
type PdfDoc = InstanceType<typeof PDFDocument>;

/** A4 content area (points) */
const PAGE_MARGIN = 48;
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;
const FOOTER_FROM_BOTTOM = 36;
const SAFE_BOTTOM = PAGE_HEIGHT - PAGE_MARGIN - FOOTER_FROM_BOTTOM;
const ACCENT = "#1e3a5f";
const TEXT_PRIMARY = "#1a202c";
const TEXT_SECONDARY = "#4a5568";
const TEXT_MUTED = "#718096";
const BORDER = "#e2e8f0";
const HEADER_ROW_BG = "#1e3a5f";
const STRIPE = "#f7fafc";
const PANEL_BG = "#f8fafc";
const RED_ALERT_BG = "#fff5f5";
const RED_ALERT_BORDER = "#fc8181";
const RED_ALERT_TEXT = "#742a2a";

export class PdfGeneratorService {
  async generateIncidentReport(data: IncidentReportData): Promise<Buffer> {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margin: PAGE_MARGIN,
        bufferPages: true,
        info: {
          Title: `PIP - ${data.employeeName}`,
          Author: data.companyName,
          Subject: "Performance improvement plan",
        },
      });

      const chunks: Uint8Array[] = [];
      doc.on("data", (chunk: Uint8Array) => chunks.push(chunk));

      this.renderReport(doc, data);
      this.applyFooters(doc, data.companyName);
      doc.end();

      return await new Promise<Buffer>((resolve, reject) => {
        doc.on("end", () => resolve(Buffer.concat(chunks)));
        doc.on("error", reject);
      });
    } catch (err) {
      logger.error("PDF generation failed", { err });
      throw err;
    }
  }

  private applyFooters(doc: PdfDoc, companyName: string): void {
    const range = doc.bufferedPageRange();
    const total = range.count;
    for (let i = 0; i < total; i++) {
      doc.switchToPage(range.start + i);
      // Keep footer inside bottom margin to avoid PDFKit auto-adding pages.
      const y = PAGE_HEIGHT - PAGE_MARGIN - 12;
      doc
        .save()
        .font("Helvetica")
        .fontSize(8)
        .fillColor(TEXT_MUTED)
        .text(
          `${companyName} · Confidential human resources document`,
          PAGE_MARGIN,
          y,
          { width: CONTENT_WIDTH * 0.62, align: "left" },
        )
        .text(`Page ${i + 1} of ${total}`, PAGE_MARGIN, y, {
          width: CONTENT_WIDTH,
          align: "right",
        })
        .restore();
    }
  }

  private pageBreakIfNeeded(doc: PdfDoc, neededHeight: number): void {
    if (doc.y + neededHeight > SAFE_BOTTOM) {
      doc.addPage();
      this.drawPageRibbon(doc);
    }
  }

  /** Thin brand bar on continuation pages */
  private drawPageRibbon(doc: PdfDoc): void {
    doc
      .save()
      .rect(PAGE_MARGIN, PAGE_MARGIN - 24, CONTENT_WIDTH, 3)
      .fill(ACCENT)
      .restore();
    doc.y = PAGE_MARGIN + 4;
  }

  private renderReport(doc: PdfDoc, data: IncidentReportData): void {
    this.drawDocumentHeader(doc, data);
    this.drawMetaForm(doc, data);

    if (data.isImmediateTermination && data.immediateTerminationPolicy) {
      this.pageBreakIfNeeded(doc, 72);
      this.drawImmediateTerminationBlock(doc, data.immediateTerminationPolicy);
    }

    this.pageBreakIfNeeded(doc, 80);
    this.drawSectionTitle(doc, "Applied policies", "Point assignments for this incident");
    this.drawTable(
      doc,
      [
        { label: "Policy", width: CONTENT_WIDTH * 0.36 },
        { label: "Description", width: CONTENT_WIDTH * 0.44 },
        { label: "Pts", width: CONTENT_WIDTH * 0.2, align: "center" },
      ],
      data.appliedPolicies.map((p) => [
        p.sectionName ? `${p.sectionName}: ${p.title}` : p.title,
        p.description || "—",
        String(p.points),
      ]),
      { stripe: true },
    );

    this.drawBodyPanel(doc, "Details of incident", data.detailsOfIncident);
    this.drawBodyPanel(doc, "Supervisor commitment", data.supervisorCommitment);
    this.drawBodyPanel(doc, "Supervisor comments", data.supervisorComments);

    if (data.positiveResults) {
      this.drawBodyPanel(doc, "Positive results", data.positiveResults);
    }
    if (data.negativeConsequences) {
      this.drawBodyPanel(doc, "Negative consequences", data.negativeConsequences);
    }

    this.pageBreakIfNeeded(doc, 80);
    this.drawSectionTitle(
      doc,
      "Discipline guidelines",
      "Reference — progressive discipline thresholds",
    );
    this.drawTable(
      doc,
      [
        { label: "Points threshold", width: CONTENT_WIDTH * 0.22, align: "center" },
        { label: "Required action", width: CONTENT_WIDTH * 0.78 },
      ],
      data.guidelines.map((g) => [String(g.pointThreshold), g.action]),
      { stripe: true },
    );

    this.pageBreakIfNeeded(doc, 100);
    this.drawSignatures(doc);
  }

  private drawDocumentHeader(doc: PdfDoc, data: IncidentReportData): void {
    const barHeight = 6;
    doc.save().rect(0, 0, PAGE_WIDTH, barHeight).fill(ACCENT).restore();

    const top = PAGE_MARGIN + 4;
    doc.y = top;

    doc.font("Helvetica-Bold").fontSize(22).fillColor(TEXT_PRIMARY);
    doc.text(data.companyName, PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH * 0.68 });

    doc.font("Helvetica").fontSize(9).fillColor(TEXT_MUTED);
    doc.text("HR · PIP", PAGE_MARGIN + CONTENT_WIDTH * 0.68, top + 4, {
      width: CONTENT_WIDTH * 0.32,
      align: "right",
    });

    doc.moveDown(0.35);
    doc.font("Helvetica-Bold").fontSize(15).fillColor(ACCENT);
    doc.text("Performance Improvement Plan (PIP)", PAGE_MARGIN, doc.y, {
      width: CONTENT_WIDTH,
    });

    doc.moveDown(0.15);
    doc.font("Helvetica").fontSize(10).fillColor(TEXT_SECONDARY);
    doc.text(
      "This document records the incident, applied policies, and acknowledgements. Signatures below confirm review.",
      PAGE_MARGIN,
      doc.y,
      { width: CONTENT_WIDTH, lineGap: 2 },
    );

    const pillY = doc.y + 6;
    const pillW = 118;
    const pillH = 22;
    doc
      .save()
      .roundedRect(PAGE_MARGIN, pillY, pillW, pillH, 3)
      .fillAndStroke("#edf2f7", BORDER)
      .restore();
    doc.font("Helvetica-Bold").fontSize(8).fillColor(TEXT_MUTED);
    doc.text("REPORT DATE", PAGE_MARGIN + 10, pillY + 5, { width: pillW - 20 });
    doc.font("Helvetica-Bold").fontSize(11).fillColor(TEXT_PRIMARY);
    doc.text(data.incidentDate, PAGE_MARGIN + 10, pillY + 13, { width: pillW - 20 });

    const pill2X = PAGE_MARGIN + pillW + 10;
    doc
      .save()
      .roundedRect(pill2X, pillY, 140, pillH, 3)
      .fillAndStroke("#edf2f7", BORDER)
      .restore();
    doc.font("Helvetica-Bold").fontSize(8).fillColor(TEXT_MUTED);
    doc.text("TOTAL POINTS (THIS INCIDENT)", pill2X + 10, pillY + 5, {
      width: 120,
    });
    doc.font("Helvetica-Bold").fontSize(11).fillColor(ACCENT);
    doc.text(String(data.totalPoints), pill2X + 10, pillY + 13, { width: 120 });

    doc.y = pillY + pillH + 18;
  }

  private drawMetaForm(doc: PdfDoc, data: IncidentReportData): void {
    this.drawSectionTitle(doc, "Parties & summary", "Employee and reporting manager");

    const pad = 14;
    const innerW = CONTENT_WIDTH - pad * 2;
    const labelW = innerW * 0.28;
    const valueW = innerW * 0.32;
    const rowH = 28;
    const rows: [string, string, string, string][] = [
      ["Employee name", data.employeeName, "Role", data.employeeRole],
      ["Reporting manager", data.managerName, "Incident points", String(data.totalPoints)],
    ];

    let blockH = pad * 2 + rows.length * rowH;
    this.pageBreakIfNeeded(doc, blockH + 8);

    const boxY = doc.y;
    doc
      .save()
      .roundedRect(PAGE_MARGIN, boxY, CONTENT_WIDTH, blockH, 4)
      .fillAndStroke("#ffffff", BORDER)
      .restore();

    let y = boxY + pad;
    rows.forEach(([l1, v1, l2, v2], idx) => {
      doc.font("Helvetica-Bold").fontSize(8).fillColor(TEXT_MUTED);
      doc.text(l1.toUpperCase(), PAGE_MARGIN + pad, y, { width: labelW });
      doc.font("Helvetica").fontSize(11).fillColor(TEXT_PRIMARY);
      doc.text(v1 || "—", PAGE_MARGIN + pad + labelW, y, { width: valueW - 8 });

      doc.font("Helvetica-Bold").fontSize(8).fillColor(TEXT_MUTED);
      doc.text(l2.toUpperCase(), PAGE_MARGIN + pad + labelW + valueW, y, {
        width: labelW,
      });
      doc.font("Helvetica").fontSize(11).fillColor(TEXT_PRIMARY);
      doc.text(v2 || "—", PAGE_MARGIN + pad + labelW + valueW + labelW, y, {
        width: valueW - 8,
      });

      y += rowH;
      if (idx < rows.length - 1) {
        doc
          .save()
          .strokeColor(BORDER)
          .lineWidth(0.5)
          .moveTo(PAGE_MARGIN + pad, y - 6)
          .lineTo(PAGE_MARGIN + CONTENT_WIDTH - pad, y - 6)
          .stroke()
          .restore();
      }
    });

    doc.y = boxY + blockH + 16;
  }

  private drawImmediateTerminationBlock(
    doc: PdfDoc,
    policy: { title: string; description: string },
  ): void {
    const pad = 12;
    const innerW = CONTENT_WIDTH - pad * 2 - 6;
    doc.font("Helvetica-Bold").fontSize(11);
    const titleH = doc.heightOfString(policy.title, { width: innerW, lineGap: 2 });
    doc.font("Helvetica").fontSize(10);
    const descH = doc.heightOfString(policy.description || "—", {
      width: innerW,
      lineGap: 2,
    });
    const blockHeight = Math.max(64, 18 + titleH + 6 + descH + pad * 2);

    this.pageBreakIfNeeded(doc, blockHeight + 12);

    const startY = doc.y;
    doc
      .save()
      .rect(PAGE_MARGIN, startY, 4, blockHeight)
      .fill("#c53030")
      .restore();

    doc
      .save()
      .roundedRect(PAGE_MARGIN + 4, startY, CONTENT_WIDTH - 4, blockHeight, 3)
      .fillAndStroke(RED_ALERT_BG, RED_ALERT_BORDER)
      .restore();

    const tx = PAGE_MARGIN + 4 + pad;
    const ty = startY + pad;
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#c53030");
    doc.text("IMMEDIATE TERMINATION POLICY APPLIED", tx, ty, { width: innerW });

    doc.font("Helvetica-Bold").fontSize(11).fillColor(RED_ALERT_TEXT);
    doc.text(policy.title, tx, ty + 14, { width: innerW, lineGap: 2 });

    doc.font("Helvetica").fontSize(10).fillColor(TEXT_SECONDARY);
    doc.text(policy.description || "—", tx, ty + 14 + titleH + 6, {
      width: innerW,
      lineGap: 2,
    });

    doc.y = startY + blockHeight + 14;
  }

  private drawSectionTitle(doc: PdfDoc, title: string, subtitle?: string): void {
    this.pageBreakIfNeeded(doc, subtitle ? 36 : 28);

    const y = doc.y + 6;
    doc.save().rect(PAGE_MARGIN, y + 2, 3, 14).fill(ACCENT).restore();

    doc.font("Helvetica-Bold").fontSize(12).fillColor(TEXT_PRIMARY);
    doc.text(title, PAGE_MARGIN + 10, y, { width: CONTENT_WIDTH - 12 });

    if (subtitle) {
      doc.font("Helvetica").fontSize(9).fillColor(TEXT_MUTED);
      doc.text(subtitle, PAGE_MARGIN + 10, y + 14, { width: CONTENT_WIDTH - 12 });
      doc.y = y + 30;
    } else {
      doc.y = y + 22;
    }
  }

  private drawBodyPanel(doc: PdfDoc, title: string, body: string): void {
    const pad = 12;
    const textW = CONTENT_WIDTH - pad * 2;
    const lines = body.split(/\r?\n/);
    let textH = 0;
    doc.font("Helvetica").fontSize(10).fillColor(TEXT_PRIMARY);
    for (const line of lines) {
      textH += doc.heightOfString(line || " ", { width: textW, lineGap: 3 });
    }
    const panelH = Math.max(36, textH + pad * 2 + 22);
    const sectionChrome = 36;

    this.pageBreakIfNeeded(doc, panelH + sectionChrome + 16);

    this.drawSectionTitle(doc, title);

    const top = doc.y;
    doc
      .save()
      .roundedRect(PAGE_MARGIN, top, CONTENT_WIDTH, panelH, 4)
      .fillAndStroke(PANEL_BG, BORDER)
      .restore();

    doc.font("Helvetica").fontSize(10).fillColor(TEXT_PRIMARY);
    let cy = top + pad + 2;
    for (const line of lines) {
      const h = doc.heightOfString(line || " ", { width: textW, lineGap: 3 });
      doc.text(line || " ", PAGE_MARGIN + pad, cy, {
        width: textW,
        lineGap: 3,
      });
      cy += h;
    }

    doc.y = top + panelH + 14;
  }

  private drawTable(
    doc: PdfDoc,
    columns: TableColumn[],
    rows: string[][],
    options?: { stripe?: boolean },
  ): void {
    const stripe = options?.stripe ?? false;
    const headerHeight = 26;
    const minRowHeight = 24;
    const headerTextY = 8;

    const drawHeader = () => {
      this.pageBreakIfNeeded(doc, headerHeight + 8);
      let x = PAGE_MARGIN;
      const y = doc.y;

      columns.forEach((col) => {
        doc
          .save()
          .fillColor(HEADER_ROW_BG)
          .rect(x, y, col.width, headerHeight)
          .fill()
          .restore();

        doc.font("Helvetica-Bold").fontSize(9).fillColor("#ffffff");
        doc.text(col.label.toUpperCase(), x + 8, y + headerTextY, {
          width: col.width - 16,
          align: col.align ?? "left",
        });
        x += col.width;
      });

      doc.y = y + headerHeight;
    };

    drawHeader();

    rows.forEach((row, rowIdx) => {
      const cellHeights = row.map((cell, idx) => {
        const width = (columns[idx]?.width ?? 100) - 16;
        doc.font("Helvetica").fontSize(10);
        return Math.ceil(doc.heightOfString(cell || "—", { width, lineGap: 2 })) + 14;
      });
      const rowHeight = Math.max(minRowHeight, ...cellHeights);

      if (doc.y + rowHeight > SAFE_BOTTOM) {
        doc.addPage();
        this.drawPageRibbon(doc);
        drawHeader();
      }

      let x = PAGE_MARGIN;
      const y = doc.y;
      const rowBg =
        stripe && rowIdx % 2 === 1 ? STRIPE : "#ffffff";

      row.forEach((value, idx) => {
        const col = columns[idx]!;

        doc.save().fillColor(rowBg).rect(x, y, col.width, rowHeight).fill();
        doc.strokeColor(BORDER).lineWidth(0.35).rect(x, y, col.width, rowHeight).stroke();
        doc.restore();

        doc.font("Helvetica").fontSize(10).fillColor(TEXT_PRIMARY);
        doc.text(value || "—", x + 8, y + 7, {
          width: col.width - 16,
          align: col.align ?? "left",
          lineGap: 2,
        });

        x += col.width;
      });

      doc.y = y + rowHeight;
    });

    doc.moveDown(0.8);
  }

  private drawSignatures(doc: PdfDoc): void {
    const sectionH = 120;
    if (doc.y + sectionH > SAFE_BOTTOM) {
      doc.addPage();
      this.drawPageRibbon(doc);
    }

    this.drawSectionTitle(doc, "Authorized signatures", "Electronic signing via Adobe Acrobat Sign");

    const boxY = doc.y;
    const boxH = 92;
    doc
      .save()
      .roundedRect(PAGE_MARGIN, boxY, CONTENT_WIDTH, boxH, 4)
      .fillAndStroke("#ffffff", BORDER)
      .restore();

    doc.font("Helvetica").fontSize(8).fillColor(TEXT_MUTED);
    doc.text(
      "By signing, each party acknowledges the accuracy of the information above and agrees to the terms of this performance improvement plan.",
      PAGE_MARGIN + 14,
      boxY + 12,
      { width: CONTENT_WIDTH - 28, lineGap: 2 },
    );

    const rowY = boxY + 40;
    const colW = (CONTENT_WIDTH - 28 - 40) / 2;
    const leftX = PAGE_MARGIN + 14;
    const rightX = leftX + colW + 40;

    doc.font("Helvetica-Bold").fontSize(9).fillColor(TEXT_SECONDARY);
    doc.text("Manager / supervisor signature", leftX, rowY, { width: colW });
    doc.text("Employee signature", rightX, rowY, { width: colW });

    doc.y = boxY + boxH + 8;
  }
}
