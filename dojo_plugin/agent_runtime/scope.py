from dataclasses import dataclass

from CTFd.models import Users

from ..models import DojoAdmins, Dojos, DojoUsers, SelfLearningWorkspaces


class ScopeError(ValueError):
    """Raised when a requested global-agent scope is not authorized."""


@dataclass(frozen=True)
class AccessScope:
    user_id: int
    role: str
    dojo_id: int | None = None
    module_index: int | None = None
    workspace_id: str | None = None
    capabilities: tuple[str, ...] = ()

    def as_dict(self):
        return {
            "user_id": self.user_id,
            "role": self.role,
            "dojo_id": self.dojo_id,
            "module_index": self.module_index,
            "workspace_id": self.workspace_id,
            "capabilities": list(self.capabilities),
        }


TEACHER_CAPABILITIES = (
    "agent:chat",
    "material:write",
    "candidate:write",
    "artifact:write",
    "session:control",
    "session:view",
    "challenge:propose",
)

STUDENT_CAPABILITIES = (
    "self-learning:chat",
    "self-learning:write",
    "artifact:personal",
    "evidence:append",
    "session:view",
)


def _is_platform_admin(user):
    return bool(user and getattr(user, "type", None) == "admin")


def dojo_for_user(user, dojo_id, *, teacher=False):
    if not user:
        raise ScopeError("Authentication required")
    try:
        internal_id = int(dojo_id)
    except (TypeError, ValueError):
        try:
            dojo = Dojos.from_id(str(dojo_id)).first()
        except (TypeError, ValueError):
            dojo = None
    else:
        dojo = Dojos.query.filter_by(dojo_id=internal_id).first()
    if dojo is None:
        raise ScopeError("Dojo not found")

    if teacher:
        allowed = _is_platform_admin(user) or DojoAdmins.query.filter_by(
            dojo_id=dojo.dojo_id,
            user_id=user.id,
        ).first() is not None
    else:
        allowed = (
            _is_platform_admin(user)
            or dojo.is_public_or_official
            or DojoUsers.query.filter_by(
                dojo_id=dojo.dojo_id,
                user_id=user.id,
            ).first()
            is not None
        )
    if not allowed:
        # Do not reveal whether a private course exists.
        raise ScopeError("Dojo not found")
    return dojo


def validate_module(dojo, module_index):
    if module_index is None:
        return None
    try:
        module_index = int(module_index)
    except (TypeError, ValueError):
        raise ScopeError("Invalid module scope") from None
    if not any(module.module_index == module_index for module in dojo.modules):
        raise ScopeError("Module not found")
    return module_index


def build_scope(user, *, role, dojo_id=None, module_index=None, workspace_id=None):
    role = str(role or "").lower()
    if role not in {"teacher", "student"}:
        raise ScopeError("Unsupported global-agent role")

    if role == "teacher" and dojo_id is None:
        is_teacher = _is_platform_admin(user) or DojoAdmins.query.filter_by(
            user_id=user.id
        ).first() is not None
        if not is_teacher:
            raise ScopeError("Teacher role required")

    dojo = None
    if dojo_id is not None:
        dojo = dojo_for_user(user, dojo_id, teacher=role == "teacher")
        module_index = validate_module(dojo, module_index)
        if module_index is not None and role == "student" and not _is_platform_admin(user):
            module = next(
                item for item in dojo.modules if item.module_index == module_index
            )
            if not module.visible():
                raise ScopeError("Module not found")
    elif module_index is not None:
        raise ScopeError("Module scope requires a dojo")

    if workspace_id is not None:
        if role != "student":
            raise ScopeError("Only student sessions may use a personal workspace")
        workspace = SelfLearningWorkspaces.query.filter_by(
            id=str(workspace_id),
            student_id=user.id,
        ).first()
        if workspace is None:
            raise ScopeError("Self-learning workspace not found")
        if dojo and workspace.dojo_id != dojo.dojo_id:
            raise ScopeError("Workspace course scope mismatch")
        if module_index is not None and workspace.module_index != module_index:
            raise ScopeError("Workspace module scope mismatch")
        dojo_id = workspace.dojo_id
        module_index = workspace.module_index
        workspace_id = workspace.id

    return AccessScope(
        user_id=user.id,
        role=role,
        dojo_id=(dojo.dojo_id if dojo else dojo_id),
        module_index=module_index,
        workspace_id=workspace_id,
        capabilities=TEACHER_CAPABILITIES if role == "teacher" else STUDENT_CAPABILITIES,
    )


def user_for_scope(scope):
    user_id = scope.get("user_id") if isinstance(scope, dict) else None
    user = Users.query.filter_by(id=user_id).first()
    if user is None:
        raise ScopeError("User no longer exists")
    # Re-evaluate permissions so removing a member invalidates an issued runtime
    # capability immediately instead of waiting for its short TTL.
    return user, build_scope(
        user,
        role=scope.get("role"),
        dojo_id=scope.get("dojo_id"),
        module_index=scope.get("module_index"),
        workspace_id=scope.get("workspace_id"),
    )


def assert_capability(scope, capability):
    if capability not in set(scope.capabilities):
        raise ScopeError("Capability not granted")


def owner_or_teacher(user, owner_id, dojo_id):
    if user.id == owner_id:
        return True
    if dojo_id is None:
        return False
    try:
        dojo_for_user(user, dojo_id, teacher=True)
        return True
    except ScopeError:
        return False
