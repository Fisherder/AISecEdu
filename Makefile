SHELL := /usr/bin/env bash

.DEFAULT_GOAL := help

.PHONY: help audit doctor check build up deploy verify test package

help:
	@printf '%s\n' \
		'玄甲项目命令' \
		'' \
		'  make audit    检查仓库边界、敏感文件、Compose 与脚本语法' \
		'  make doctor   检查部署主机的 Docker 与 KVM 前置条件' \
		'  make check    运行提交前的快速静态检查与契约测试' \
		'  make build    构建固定上游提交的外层镜像' \
		'  make up       使用本机配置启动已构建镜像' \
		'  make deploy   构建并启动完整平台' \
		'  make verify   验证已启动平台的服务、路由与模型边界' \
		'  make test     运行完整 Python 测试集' \
		'  make package  生成可复现源码归档与 SHA-256 校验文件' \
		'  make generation-dev      连接完整 AISecEdu 开发环境' \
		'  make generation-check    验证生成、浏览器和发布合同' \
		'  make generation-release  构建固定版本生成镜像包' \
		'  make generation-promote  展示版本应用计划（APPLY=1 执行）' \
		'  make generation-rollback 展示回滚计划（APPLY=1 执行）'

audit:
	@./ops/repository-audit.sh

doctor: audit
	@command -v git >/dev/null
	@command -v docker >/dev/null
	@docker info >/dev/null
	@docker compose version >/dev/null
	@test -c /dev/kvm || { printf '%s\n' 'ERROR: /dev/kvm 不可用，无法启动 Kata 题目环境。' >&2; exit 1; }
	@printf '%s\n' '部署前置条件检查通过。'

check: audit
	@python3 -m compileall -q dojo_plugin ops
	@python3 -m pytest -q \
		test/test_product_contracts.py \
		test/test_ui_readability.py \
		test/test_artifact_preview_ui.py \
		test/test_high_concurrency_verifier.py

build:
	@./ops/build-outer-local.sh

up:
	@./ops/run-local.sh

deploy: doctor build up

verify:
	@./ops/verify-local.sh

test:
	@python3 -m pytest -q test

package:
	@./ops/package-release.sh

.PHONY: generation-dev generation-check generation-release generation-export generation-promote generation-rollback

generation-dev:
	@./ops/staging/connect.sh

generation-check:
	@cd services/agent-runtime && node node_modules/vitest/vitest.mjs run tests/lib/teaching-demo/generation.test.ts tests/unit/generation-failure.test.ts tests/unit/cinematic-model-policy.test.ts tests/integration/cinematic-model-policy-route.test.ts tests/unit/teacher-direct-generation.test.ts tests/ai/provider-transport-journal.test.ts tests/unit/durable-model-events.test.ts
	@GENERATION_REQUIRE_BROWSER=1 node --test services/courseware-inspector/test/teaching-demo.test.mjs
	@python3 -m unittest discover -s test -p test_generation_release_unit.py

generation-release:
	@test -n "$(RELEASE)" || { echo 'Set RELEASE to a new release bundle directory'; exit 1; }
	@python3 ops/generation-release.py build "$(RELEASE)"

generation-promote:
	@test -n "$(RELEASE)" || { echo 'Set RELEASE to the reviewed release bundle directory'; exit 1; }
	@python3 ops/generation-release.py deploy "$(RELEASE)" --container "$(or $(CONTAINER),aisecedu-development)" $(if $(filter 1,$(APPLY)),--apply,)

generation-rollback:
	@python3 ops/generation-release.py rollback --container "$(or $(CONTAINER),aisecedu-development)" $(if $(filter 1,$(APPLY)),--apply,)

generation-export:
	@test -n "$(RELEASE)" || { echo 'Set RELEASE to a new release bundle directory'; exit 1; }
	@python3 ops/generation-release.py export "$(RELEASE)" --container "$(or $(CONTAINER),aisecedu-development)"
