import json


def _entry(identifier, name, category, description, source="fixture"):
    return {
        "id": identifier,
        "source": source,
        "repository": f"https://example.test/{source}",
        "sourceUrl": f"https://example.test/{source}/{identifier}",
        "sourcePath": identifier,
        "license": "MIT",
        "popularity": 1000,
        "name": name,
        "description": description,
        "category": category,
        "difficulty": 2,
        "tags": [category.lower()],
        "files": ["README.md", "Dockerfile", "challenge.c"],
        "fileCount": 3,
        "hasContainer": True,
        "catalogComplete": True,
        "sourceAvailableLocally": True,
    }


def test_external_corpus_search_returns_ranked_attributed_evidence(
    tmp_path,
    monkeypatch,
):
    from CTFd.plugins.dojo_plugin.learning import challenge_corpus

    entries = [
        _entry(
            "stack-overflow",
            "Classic stack buffer overflow",
            "PWN",
            "Overwrite the saved return address and capture a dynamic flag.",
        ),
        _entry(
            "rsa-oracle",
            "RSA oracle",
            "CRYPTO",
            "Recover a plaintext by interacting with an RSA oracle.",
        ),
    ]
    catalog = tmp_path / "catalog.jsonl"
    catalog.write_text(
        "".join(json.dumps(item) + "\n" for item in entries),
        encoding="utf-8",
    )
    source = tmp_path / "sources" / "fixture" / "stack-overflow"
    source.mkdir(parents=True)
    (source / "README.md").write_text(
        "Study stack frames and overwrite the saved return address. flag{redact-me}",
        encoding="utf-8",
    )
    (source / "challenge.c").write_text(
        "int main(void) { char buffer[32]; return buffer[0]; }",
        encoding="utf-8",
    )
    monkeypatch.setenv("DOJO_CTF_CORPUS_DIR", str(tmp_path))
    challenge_corpus.reset_cache()

    results = challenge_corpus.search_corpus(
        "生成一道经典栈溢出 buffer overflow CTF 实践题",
        "PWN",
        limit=4,
    )

    assert results[0]["name"] == "Classic stack buffer overflow"
    assert results[0]["origin"] == "EXTERNAL_CORPUS"
    assert results[0]["reusable"] is False
    assert results[0]["inspirationOnly"] is True
    assert results[0]["sourceEvidence"]["license"] == "MIT"
    assert results[0]["sourceEvidence"]["hasContainer"] is True
    assert results[0]["materialEvidence"]
    assert "flag{redact-me}" not in json.dumps(results[0]["materialEvidence"])
    assert "[REDACTED_FLAG]" in json.dumps(results[0]["materialEvidence"])
    assert challenge_corpus.corpus_summary()["totalChallenges"] == 2


def test_external_evidence_cannot_be_selected_as_a_native_reuse(monkeypatch):
    from CTFd.plugins.dojo_plugin.learning import authoring

    candidate = {
        "challengeId": "corpus:fixture:stack-overflow",
        "referenceId": "corpus:fixture:stack-overflow",
        "name": "Classic stack buffer overflow",
        "category": "PWN",
        "difficulty": 2,
        "exerciseMode": "CONTAINER",
        "score": 99,
        "origin": "EXTERNAL_CORPUS",
        "reusable": False,
        "sourceEvidence": {"license": "MIT"},
    }
    monkeypatch.setattr(
        authoring,
        "model_json",
        lambda *_args, **_kwargs: {
            "strategy": "L2",
            "selectedChallengeId": candidate["challengeId"],
            "reason": "高度相关",
        },
    )

    level, ordered, decision = authoring._select_authoring_strategy(
        "生成一道栈溢出题",
        {},
        [candidate],
    )

    assert level == "L3"
    assert ordered == [candidate]
    assert decision["selectedChallengeId"] is None
    assert decision["externalEvidenceCount"] == 1


def test_custom_authoring_repair_uses_patch_contract_and_rebuild_layers(
    monkeypatch,
):
    from CTFd.plugins.dojo_plugin.learning import authoring

    review = {
        "verdict": "BLOCK",
        "findings": [
            {
                "id": "runtime",
                "status": "OPEN",
                "severity": "HIGH",
                "stage": "RUNTIME",
            }
        ],
    }

    def advance(spec, marker, mode):
        updated = {**spec, marker: True}
        return updated, {"provider": "MODEL", "mode": mode}

    monkeypatch.setattr(
        authoring,
        "_model_repair",
        lambda *_args: advance(_args[4], "patched", "EXACT_PATCH"),
    )
    monkeypatch.setattr(
        authoring,
        "_model_contract_closure_repair",
        lambda *_args: advance(_args[4], "contractClosed", "CONTRACT_CLOSURE"),
    )
    monkeypatch.setattr(
        authoring,
        "_model_coherence_rebuild",
        lambda *_args: advance(_args[4], "rebuilt", "COHERENCE_REBUILD"),
    )
    monkeypatch.setattr(
        authoring,
        "_model_preflight_review",
        lambda *_args, **_kwargs: (review, {"provider": "MODEL"}),
    )
    monkeypatch.setattr(
        authoring,
        "_needs_artifact_closure_repair",
        lambda *_args: False,
    )
    monkeypatch.setattr(
        authoring,
        "_needs_contract_closure_repair",
        lambda *_args: False,
    )

    spec, _review, stage, _post_review = authoring._repair_until_clear(
        "生成可用的 CTF 实践题",
        {},
        "L3",
        [],
        {
            "mode": "GENERATE_CUSTOM",
            "exerciseMode": "CONTAINER",
            "starterFiles": [],
        },
        review,
        max_cycles=3,
    )

    assert [cycle["mode"] for cycle in stage["cycles"]] == [
        "EXACT_PATCH",
        "CONTRACT_CLOSURE",
        "COHERENCE_REBUILD",
    ]
    assert spec["patched"] is True
    assert spec["contractClosed"] is True
    assert spec["rebuilt"] is True
