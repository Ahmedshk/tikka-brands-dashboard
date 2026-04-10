import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";

const PREFIX = "[AlertsEval]";

function resolveLogPath(): string {
  const env = process.env.ALERT_EVAL_LOG_FILE?.trim();
  if (env && env.length > 0) {
    return isAbsolute(env) ? env : join(process.cwd(), env);
  }
  return join(process.cwd(), "logs", "alerts-eval.log");
}

let dirEnsured = false;

function serializeData(data: unknown): string {
  if (data instanceof Error) {
    return data.stack ?? data.message;
  }
  if (typeof data === "object" && data !== null) {
    return JSON.stringify(data);
  }
  return String(data);
}

function appendLine(label: string, data?: unknown): void {
  try {
    const path = resolveLogPath();
    if (!dirEnsured) {
      mkdirSync(dirname(path), { recursive: true });
      dirEnsured = true;
    }
    const ts = new Date().toISOString();
    const suffix = data === undefined ? "" : ` ${serializeData(data)}`;
    appendFileSync(path, `${ts} ${PREFIX} ${label}${suffix}\n`, "utf8");
  } catch (err) {
    console.error(`${PREFIX} failed to write log file`, err);
  }
}

/** Mirrors [AlertsEval] traces to stdout and a file (default logs/alerts-eval.log). */
export function alertEvalLog(label: string, data?: unknown): void {
  if (data === undefined) {
    console.log(PREFIX, label);
  } else {
    console.log(PREFIX, label, data);
  }
  appendLine(label, data);
}
