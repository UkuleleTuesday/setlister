"""OpenTelemetry → Google Cloud Trace wiring.

The API runs as a gen2 Cloud Function (Cloud Run underneath), which already
emits a per-request trace. We nest custom spans for each pipeline stage under
it so the Cloud Trace waterfall shows where the milliseconds go.

Off-GCP (local dev, tests) this is a no-op: no exporter is installed, so the
default OpenTelemetry tracer records spans cheaply and never phones home.
Export is enabled only in the managed runtime (``K_SERVICE`` is set by Cloud
Run/Functions) or when ``ENABLE_CLOUD_TRACE`` is truthy.
"""

import os

from opentelemetry import trace

# Module-level tracer — usable immediately. Until ``setup_tracing`` installs a
# real provider, this resolves against the default (no-export) provider.
tracer = trace.get_tracer("setlister")

_provider = None


def _export_enabled() -> bool:
    if os.environ.get("ENABLE_CLOUD_TRACE", "").lower() in ("1", "true", "yes"):
        return True
    # K_SERVICE is set by Cloud Run / Cloud Functions gen2 at runtime.
    return bool(os.environ.get("K_SERVICE"))


def setup_tracing() -> None:
    """Install the Cloud Trace exporter once per instance (idempotent)."""
    global _provider
    if _provider is not None or not _export_enabled():
        return

    # Imported lazily so the exporter's transitive deps aren't required off-GCP.
    from opentelemetry.exporter.cloud_trace import CloudTraceSpanExporter
    from opentelemetry.propagate import set_global_textmap
    from opentelemetry.propagators.cloud_trace_propagator import (
        CloudTraceFormatPropagator,
    )
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanProcessor

    from .config import get_settings

    provider = TracerProvider()
    provider.add_span_processor(
        BatchSpanProcessor(
            CloudTraceSpanExporter(project_id=get_settings().gcp_project)
        )
    )
    trace.set_tracer_provider(provider)
    # Parse the incoming X-Cloud-Trace-Context header so our spans nest under
    # Cloud Run's auto request span.
    set_global_textmap(CloudTraceFormatPropagator())
    _provider = provider


def flush() -> None:
    """Force-flush pending spans.

    Cloud Functions can freeze the instance between invocations, so a lazy
    batch export may never ship — call this at the end of each request.
    """
    if _provider is not None:
        _provider.force_flush()
