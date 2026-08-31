"""Internal rendering and execution boundary of the 玄甲 global agent.

The vendored renderer has no product identity, account system, course model, or
independent workflow. Authentication, ownership, orchestration, durable jobs,
and production truth all remain in 玄甲.
"""

from .auth import AgentRuntimeAuthError

__all__ = ["AgentRuntimeAuthError"]
