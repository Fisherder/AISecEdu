import logging

from flask import abort, g, request
from flask_restx import Namespace, Resource

from CTFd.models import Solves, db
from CTFd.plugins.challenges import get_chal_class
from CTFd.utils.decorators import authed_only, ratelimit
from CTFd.utils.user import get_current_user

from ...learning.assessment import assess_attempt
from ...learning.simulation import (
    SimulationError,
    current_simulation_run,
    mark_simulation_solved,
    perform_simulation_action,
    replay_simulation_run,
    simulation_run_challenge,
    simulation_run_view,
)
from ...models import LearningSimulationRuns


logger = logging.getLogger(__name__)
simulation_namespace = Namespace(
    "simulations",
    description="AISecEdu deterministic and agent-assisted simulation engine",
)


def _run_or_404(run_id):
    run = LearningSimulationRuns.query.get_or_404(run_id)
    challenge = simulation_run_challenge(run)
    user = get_current_user()
    if challenge is None:
        abort(404)
    if run.user_id != user.id and not challenge.dojo.is_admin(user):
        abort(403)
    return run


def _simulation_error(error):
    return {
        "success": False,
        "error": str(error),
        "code": error.code,
        **error.details,
    }, error.status


def _complete_if_ready(run):
    if run.status != "COMPLETED":
        return False
    challenge = simulation_run_challenge(run)
    if challenge is None:
        return False
    learner = run.attempt.user
    solve = Solves.query.filter_by(
        user_id=learner.id,
        challenge_id=challenge.challenge_id,
    ).first()
    if solve:
        attempt = mark_simulation_solved(run)
        assess_attempt(attempt, run_model=False)
        return True
    g.aisecedu_simulation_completion = run.id
    challenge_class = get_chal_class(challenge.challenge.type)
    challenge_class.solve(learner, None, challenge.challenge, request)
    return True


@simulation_namespace.route("/current")
class CurrentSimulation(Resource):
    @authed_only
    def get(self):
        run = current_simulation_run(get_current_user().id)
        if run is None:
            return {"success": True, "run": None}
        try:
            return {"success": True, "run": simulation_run_view(run)}
        except SimulationError as error:
            return _simulation_error(error)


@simulation_namespace.route("/<run_id>")
class SimulationDetail(Resource):
    @authed_only
    def get(self, run_id):
        run = _run_or_404(run_id)
        try:
            return {"success": True, "run": simulation_run_view(run)}
        except SimulationError as error:
            return _simulation_error(error)


@simulation_namespace.route("/<run_id>/actions")
class SimulationActions(Resource):
    @authed_only
    @ratelimit(method="POST", limit=90, interval=60)
    def post(self, run_id):
        run = _run_or_404(run_id)
        user = get_current_user()
        if run.user_id != user.id:
            abort(403)
        data = request.get_json(silent=True) or {}
        action_id = str(data.get("actionId") or "").strip()
        if not action_id:
            return {
                "success": False,
                "error": "缺少 actionId。",
                "code": "ACTION_REQUIRED",
            }, 400
        try:
            transition, event = perform_simulation_action(
                run,
                action_id=action_id,
                parameters=data.get("parameters") or {},
                expected_turn=data.get("expectedTurn"),
            )
            completed = _complete_if_ready(run)
            db.session.commit()
            return {
                "success": True,
                "accepted": transition["accepted"],
                "completed": completed,
                "eventSequence": event.sequence,
                "observation": transition["observation"],
                "run": simulation_run_view(run),
            }
        except SimulationError as error:
            db.session.rollback()
            return _simulation_error(error)
        except Exception:
            db.session.rollback()
            logger.exception("Simulation action failed for run %s", run_id)
            return {
                "success": False,
                "error": "模拟状态迁移失败，本回合未提交。",
                "code": "SIMULATION_TRANSITION_FAILED",
            }, 500


@simulation_namespace.route("/<run_id>/replay")
class SimulationReplay(Resource):
    @authed_only
    def get(self, run_id):
        run = _run_or_404(run_id)
        try:
            return {
                "success": True,
                "runId": run.id,
                "replay": replay_simulation_run(run),
            }
        except SimulationError as error:
            return _simulation_error(error)
