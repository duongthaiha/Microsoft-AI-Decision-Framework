/**
 * OpenTelemetry + Azure Monitor initialisation.
 *
 * Call `initTelemetry()` BEFORE importing Express, Cosmos, fetch, or any SDK
 * that should be auto-instrumented.  In practice this means importing this
 * module at the very top of index.ts before other imports.
 *
 * When APPLICATIONINSIGHTS_CONNECTION_STRING is absent (local dev without App
 * Insights) `useAzureMonitor` is not called.  The OTel API remains available
 * in no-op mode so all metric/trace calls are safe but silent.
 *
 * Docs: https://learn.microsoft.com/azure/azure-monitor/app/opentelemetry-enable
 */

import { useAzureMonitor } from "@azure/monitor-opentelemetry";
import { metrics, trace } from "@opentelemetry/api";

let initialised = false;

/** Bootstrap Azure Monitor OTel distro.  Must run before other imports. */
export function initTelemetry(): void {
  if (initialised) return;
  initialised = true;

  const connStr = process.env.APPLICATIONINSIGHTS_CONNECTION_STRING;
  if (connStr) {
    useAzureMonitor({
      azureMonitorExporterOptions: { connectionString: connStr },
    });
  }
}

// ---------------------------------------------------------------------------
// Meter + Tracer — created lazily, reused across the process lifetime
// ---------------------------------------------------------------------------

const SERVICE_NAME = "advisor-agent";
const SERVICE_VERSION = "0.1.0";

export function getMeter() {
  return metrics.getMeter(SERVICE_NAME, SERVICE_VERSION);
}

export function getTracer() {
  return trace.getTracer(SERVICE_NAME, SERVICE_VERSION);
}

// ---------------------------------------------------------------------------
// Named instruments — created once per process, cached here
// ---------------------------------------------------------------------------

let _reasoningLatency: ReturnType<ReturnType<typeof getMeter>["createHistogram"]> | null = null;
let _tokenInput: ReturnType<ReturnType<typeof getMeter>["createCounter"]> | null = null;
let _tokenOutput: ReturnType<ReturnType<typeof getMeter>["createCounter"]> | null = null;

/** Histogram: end-to-end reasoning loop latency (ms). */
export function getReasoningLatencyHistogram() {
  _reasoningLatency ??= getMeter().createHistogram("reasoning.latency_ms", {
    description: "End-to-end latency of the advisor reasoning loop in milliseconds.",
    unit: "ms",
  });
  return _reasoningLatency;
}

/** Counter: prompt tokens sent to AOAI per reasoning call. */
export function getTokenInputCounter() {
  _tokenInput ??= getMeter().createCounter("reasoning.token.input", {
    description: "Prompt tokens sent to AOAI per reasoning call.",
    unit: "tokens",
  });
  return _tokenInput;
}

/** Counter: completion tokens received from AOAI per reasoning call. */
export function getTokenOutputCounter() {
  _tokenOutput ??= getMeter().createCounter("reasoning.token.output", {
    description: "Completion tokens received from AOAI per reasoning call.",
    unit: "tokens",
  });
  return _tokenOutput;
}
