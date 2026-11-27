"""Cloud Functions entry point.

Deployed with ``--source utrequests``; the sibling ``__init__.py`` is what lets
the relative imports work both deployed and locally.
"""

import functions_framework

from .api import handle_request
from .tracing import setup_tracing

setup_tracing()


@functions_framework.http
def setlister_api(request):
    return handle_request(request)
