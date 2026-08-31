from dojo_plugin.agent_runtime.model_router import is_complex_scene, route_model


def test_course_context_does_not_promote_simple_slide_deck():
    payload = {
        "artifactType": "slide-deck",
        "prompt": "为当前章节生成一份 SQL 注入防御课件，包含教学目标和讲解页",
        "courseContext": {
            "course": {
                "name": "信息安全",
                "modules": [{"name": "Web攻防基础"}],
            }
        },
        "conversation": [
            {"role": "assistant", "content": "也可以创建攻防场景演示实验。"}
        ],
    }

    assert not is_complex_scene("candidate.generate", payload=payload)
    assert route_model("candidate.generate", payload=payload)["route"] == (
        "teaching-default"
    )


def test_explicit_complex_artifacts_and_current_prompt_still_require_pro():
    for artifact_type in (
        "attack-defense-scene",
        "simulation",
        "debate",
        "vulnerable-lab",
    ):
        route = route_model(
            "candidate.generate",
            prompt="生成教学内容",
            payload={"artifactType": artifact_type},
        )
        assert route["route"] == "deepseek-v4-pro"
        assert route["required_model"]

    prompt_route = route_model(
        "agent.chat",
        prompt="请生成一个多智能体攻防联动处置推演",
        payload={"courseContext": {"course": {"name": "普通课程"}}},
    )
    assert prompt_route["route"] == "deepseek-v4-pro"
    assert prompt_route["required_model"]


def test_large_slide_deck_revision_does_not_promote_flash_to_pro():
    large_deck_revision = {
        "artifactType": "slide-deck",
        "instruction": "增加一页参数化查询前后对比，并保持总时长20分钟。",
        # Existing courseware may contain attack-defense wording and multiple
        # interactive steps.  They describe the already-rendered deck rather
        # than a request to turn this revision into a complex scenario.
        "prompt": "Web攻防基础的课件需要保持课堂节奏。",
        "currentContent": {
            "lesson": {
                "artifacts": [
                    {
                        "type": "slide",
                        "content": {
                            "scenes": [
                                {"title": "攻防案例"}
                                for _ in range(7)
                            ],
                        },
                    }
                ],
                "body": "x" * 120_000,
            }
        },
        "sourceMaterials": [
            {"content": "a" * 20_000},
            {"content": "b" * 20_000},
        ],
    }
    large_simulation_revision = {
        **large_deck_revision,
        "artifactType": "simulation",
    }

    assert not is_complex_scene("artifact.revise", payload=large_deck_revision)
    assert route_model("artifact.revise", payload=large_deck_revision)["route"] == (
        "teaching-default"
    )
    assert route_model("artifact.revise", payload=large_simulation_revision)[
        "route"
    ] == "deepseek-v4-pro"
