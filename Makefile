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
		'  make package  生成可复现源码归档与 SHA-256 校验文件'

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
