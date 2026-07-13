"""Cloud Functions entry point.

Deployed with ``gcloud functions deploy --source utrequests --entry-point
setlister_api``: functions-framework loads this file as ``main`` with the
package directory as its search path (the ``__init__.py`` sibling makes it a
package root), so the relative import works both deployed and locally.
"""

import functions_framework

from .api import handle_request
from .tracing import setup_tracing

# Per-instance init: install the Cloud Trace exporter (no-op off-GCP).
setup_tracing()


@functions_framework.http
def setlister_api(request):
    return handle_request(request)
