from flask import request
from flask_restx import Namespace, Resource

from CTFd.models import db
from CTFd.utils.decorators import ratelimit
from CTFd.utils.user import get_current_user

from ...models import LearningAuditEvents
from ...product import (
    PRODUCT_CONTRACT_SCHEMAS,
    build_ui_bootstrap,
    error_envelope,
    resolve_resource,
    success_envelope,
)
from ...product.errors import ProductError
from ...utils.request_logging import get_trace_id
from ...product.telemetry import sanitize_event


ui_namespace = Namespace("ui", description="玄甲 product interface contracts")


def _request_id():
    return get_trace_id() or request.headers.get("X-Request-ID")


@ui_namespace.errorhandler(ProductError)
def handle_product_error(error):
    return error.as_envelope(_request_id()), error.status


@ui_namespace.route("/bootstrap")
class UIBootstrap(Resource):
    def get(self):
        view = str(request.args.get("view") or "full").strip().lower()
        return build_ui_bootstrap(
            get_current_user(),
            request.args.get("path") or request.path,
            request.args.get("mode"),
            _request_id(),
            include_scopes=view != "navigation",
            include_running=True,
        )


@ui_namespace.route("/resources/<string:resource_type>/resolve")
class UIResourceResolver(Resource):
    def get(self, resource_type):
        summary = resolve_resource(
            resource_type,
            request.args.get("id"),
            get_current_user(),
        )
        return success_envelope(summary.as_dict(), request_id=_request_id())


@ui_namespace.route("/contracts")
class UIContractCatalog(Resource):
    def get(self):
        return success_envelope(
            PRODUCT_CONTRACT_SCHEMAS,
            request_id=_request_id(),
            meta={"cacheability": "public-contract"},
        )


@ui_namespace.route("/telemetry")
class UIPrivacySafeTelemetry(Resource):
    @ratelimit(method="POST", limit=60, interval=60)
    def post(self):
        request_id = _request_id()
        try:
            event = sanitize_event(request.get_json(silent=True) or {})
        except (TypeError, ValueError) as error:
            return error_envelope(
                "TELEMETRY_EVENT_REJECTED",
                str(error),
                request_id=request_id,
                status=422,
            ), 422
        user = get_current_user()
        resource = event.get("resource") or {}
        audit = LearningAuditEvents(
            actor_id=user.id if user else None,
            action=f"product.telemetry.{event['name']}",
            resource_type=str(resource.get("type") or event.get("surface") or "product")[:48],
            resource_id=str(resource.get("idHash") or event.get("journeyId") or "anonymous")[:128],
            outcome="ALLOW",
            details=event,
        )
        db.session.add(audit)
        db.session.commit()
        return success_envelope(
            {"accepted": True, "event": event["name"]},
            request_id=request_id,
        )
