def _fields(value, names):
    if not isinstance(value, dict):
        return {}
    return {
        name: value[name] for name in names.split()
        if name in value and (value[name] is None or type(value[name]) in (str, int, float, bool))
    }


def _items(value, field, project):
    rows = value.get(field) if isinstance(value, dict) else None
    return [project(row) for row in rows[:200] if isinstance(row, dict)] if isinstance(rows, list) else []


def _module(value):
    return {
        **_fields(value, "index id name description showChallenges showScoreboard"),
        "challenges": _items(value, "challenges", lambda row: _fields(row, "id challengeId name required exerciseMode")),
    }


def _course(value):
    return {
        **_fields(value, "referenceId name description access official repositoryBacked showScoreboard moduleCount"),
        "modules": _items(value, "modules", _module),
    }


def _strings(value, field, limit=200):
    rows = value.get(field) if isinstance(value, dict) else None
    return [row for row in rows[:limit] if isinstance(row, str)] if isinstance(rows, list) else []


def _status_counts(value):
    statuses = ("ACTIVE", "ARCHIVED", "CANCELED", "COMPLETED", "DRAFT", "FAILED", "PUBLISHED",
                "QUEUED", "READY", "REVIEW", "RUNNING", "SUCCEEDED", "VALIDATED")
    return {key: count for key, count in _fields(value, " ".join(statuses)).items() if type(count) is int}


def _catalog(value, item_fields):
    source = value if isinstance(value, dict) else {}
    return {
        "statusCounts": _status_counts(source.get("statusCounts")),
        "recent": _items(source, "recent", lambda row: _fields(row, item_fields)),
    }


def _material(value):
    return {
        **_fields(value, "id materialId title name filename status analysisStatus revision revisionId sha256"),
        "chapterCandidates": _items(value, "chapterCandidates", lambda row: _fields(row, "index title description")),
    }


def teacher_platform_facts(value):
    facts = value if isinstance(value, dict) else {}
    result = {
        **_fields(facts, "generationCollection"),
        "scope": _fields(facts.get("scope"), "moduleIndex phase"),
        "course": _course(facts["course"]) if isinstance(facts.get("course"), dict) else None,
        "availableCourses": _items(facts, "availableCourses", _course),
        "pendingAttachments": _items(facts, "pendingAttachments", _material),
        "verifiedProgress": {
            key: count for key, count in _fields(
                facts.get("verifiedProgress"), "challengeCount requiredChallengeCount studentCount verifiedCompleteCount",
            ).items() if type(count) is int
        },
        "selectedLearningPattern": _fields(facts.get("selectedLearningPattern"), "id title name description"),
        "learningPatterns": _items(facts, "learningPatterns", lambda row: _fields(row, "id title name description")),
        "runtimeEnvironments": _items(facts, "runtimeEnvironments", lambda row: _fields(row, "id name family default")),
    }
    if result["course"] is not None:
        module = facts["course"].get("selectedModule")
        result["course"]["selectedModule"] = _module(module) if isinstance(module, dict) else None
    materials = facts.get("materials") or {}
    result["materials"] = {
        "statusCounts": _status_counts(materials.get("statusCounts")) if isinstance(materials, dict) else {},
        "recent": _items(materials, "recent", _material),
    }
    artifact_fields = "id title type artifactType status revision currentRevision created updated currentConversation publishedChallengeId"
    result["artifacts"] = _catalog(facts.get("artifacts"), artifact_fields)
    result["artifacts"]["currentConversation"] = _items(
        facts.get("artifacts"), "currentConversation", lambda row: _fields(row, artifact_fields),
    )
    result["assignments"] = _catalog(facts.get("assignments"), "id title kind status moduleIndex itemCount")
    result["candidateSets"] = _catalog(facts.get("candidateSets"), "id status kind")
    result["jobs"] = _catalog(facts.get("jobs"), "id kind status stage progress")
    result["classrooms"] = _catalog(facts.get("classrooms"), "id title status moduleIndex")
    result["pendingApprovals"] = _items(facts, "pendingApprovals", lambda row: _fields(row, "id type riskLevel targetType"))
    native = facts.get("nativeAuthoring")
    result["nativeAuthoring"] = {
        "recentDrafts": _items(native, "recentDrafts", lambda row: _fields(row, "id title status moduleIndex validationStatus publishedChallengeId runtimeEnvironment")),
        "recentJobs": _items(native, "recentJobs", lambda row: _fields(row, "id draftId kind status stage progress")),
    }
    return result


def _material_coverage(value):
    return {
        **_fields(value, "policy required expectedMaterialCount includedMaterialCount complete chunkCount totalCharacters"),
        "incomplete": _items(value, "incomplete", lambda row: _fields(row, "id title status analysisStatus reason")),
        "materialIds": _strings(value, "materialIds"),
        "revisionIds": _strings(value, "revisionIds"),
    }


def _source_material(value):
    return {
        **_material(value),
        "coverage": _material_coverage(value.get("coverage")),
        "analysis": _fields(value.get("analysis"), "title abstract summary"),
        "excerpts": _items(value, "excerpts", lambda row: {
            **_fields(row, "ordinal content"),
            "sourceLocator": _fields(row.get("sourceLocator"), "page slide section start end line"),
        }),
    }


def _observation(value):
    result = _fields(value, "tool status")
    observed = value.get("observation")
    if isinstance(observed, dict):
        result["observation"] = _fields(observed, "status state")
        if isinstance(observed.get("course"), dict):
            result["observation"]["course"] = _course(observed["course"])
        if isinstance(observed.get("module"), dict):
            result["observation"]["module"] = _module(observed["module"])
    return result


def teacher_model_payload(payload):
    original = payload.get("context")
    context = original if isinstance(original, dict) else {}
    loop = context.get("agentLoop")
    provenance = context.get("requestProvenance")
    question = context.get("questionReply")
    approved_plan = context.get("approvedPlan")
    projected = {
        **_fields(payload, "prompt executionMode phase generationMode generationReason allowDegraded"),
        "constraints": _fields(payload.get("constraints"), "runtimeEnvironment exerciseMode language difficulty durationMinutes audience pageCount"),
        "context": {
            "thread": _fields(context.get("thread"), "moduleIndex phase"),
            "platformFacts": teacher_platform_facts(context.get("platformFacts")),
            "conversation": _items(context, "conversation", lambda row: _fields(row, "id role origin sourceRef content")),
            "requestProvenance": {
                **_fields(provenance, "version currentMessageId"),
                "sources": _items(provenance, "sources", lambda row: {
                    **_fields(row, "ref kind authorship messageId sourceMessageId sourceJobId optionId title content originalRequest selected selectionMessageId"),
                    "intentDecision": _fields(row.get("intentDecision"), "version intent executionMode"),
                }),
            },
            "agentLoop": {
                **_fields(loop, "depth maxDepth sourceMessageId"),
                "trace": _items(loop, "trace", _observation),
            },
            "steering": _fields(context.get("steering"), "originalRequest instruction mode"),
            "questionReply": {
                **_fields(question, "originalRequest round"),
                "intentDecision": _fields(question.get("intentDecision"), "version intent executionMode"),
                "answers": _items(question, "answers", lambda row: _fields(row, "question answer")),
            } if isinstance(question, dict) else None,
            "approvedPlan": _fields(approved_plan, "messageId answer") or None,
            "priorIntentDecision": _fields(context.get("priorIntentDecision"), "version intent executionMode"),
        },
    }
    if "sourceRefs" in payload:
        projected["sourceRefs"] = _items(payload, "sourceRefs", lambda row: _fields(row, "type id revisionId sha256"))
    if "sourceMaterials" in payload:
        projected["sourceMaterials"] = _items(payload, "sourceMaterials", _source_material)
    if "materialContext" in payload:
        projected["materialContext"] = _material_coverage(payload["materialContext"])
    dossier = payload.get("materialDossier")
    if isinstance(dossier, dict):
        projected["materialDossier"] = {
            "coverage": _material_coverage(dossier.get("coverage")),
            "materials": _items(dossier, "materials", _source_material),
        }
    refinement = payload.get("generationRefinement")
    if isinstance(refinement, dict):
        projected["generationRefinement"] = _fields(
            refinement, "version originalRequest sourceMessageId rootSourceMessageId round targetTool artifactType",
        )
        projected["generationRefinement"]["feedback"] = _strings(refinement, "feedback", 100)
        projected["generationRefinement"]["previousOptions"] = _items(
            refinement, "previousOptions", lambda row: _fields(row, "title description"),
        )
    return projected
