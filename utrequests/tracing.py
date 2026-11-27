"""OpenTelemetry to Cloud Trace, nesting stage spans under Cloud Run's request span.

Off GCP no exporter is installed, so spans are cheap and never leave the process.
"""

import os

from opentelemetry import trace

# Usable before setup_tracing(): it resolves against the default no-export provider.
tracer = trace.get_tracer("setlister")

_provider = None


def _export_enabled() -> bool:
    if os.environ.get("ENABLE_CLOUD_TRACE", "").lower() in ("1", "true", "yes"):
        return True
    # K_SERVICE is set by Cloud Run / Cloud Functions gen2 at runtime.
    return bool(os.environ.get("K_SERVICE"))


def setup_tracing() -> None:
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
    # Reads X-Cloud-Trace-Context so our spans nest under Cloud Run's.
    set_global_textmap(CloudTraceFormatPropagator())
    _provider = provider


def flush() -> None:
    """Call per request: a frozen instance may never ship a lazy batch."""
    if _provider is not None:
        _provider.force_flush()
