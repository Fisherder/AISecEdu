import importlib.util
from pathlib import Path
from types import SimpleNamespace

import pytest


spec = importlib.util.spec_from_file_location("workspace_capacity", Path(__file__).resolve().parents[1] / "dojo_plugin/workspace_capacity.py")
capacity = importlib.util.module_from_spec(spec)
spec.loader.exec_module(capacity)


def test_full_demo_preserves_other_users_and_refuses_another_guest():
    with pytest.raises(capacity.WorkspaceCapacityError, match="正在使用"):
        capacity.check_workspace_capacity([SimpleNamespace(name="user_1")], "user_2", 1)


def test_existing_user_can_switch_experiments_without_consuming_another_slot():
    capacity.check_workspace_capacity([SimpleNamespace(name="user_1")], "user_1", 1)


def test_unlimited_production_and_empty_demo_can_start():
    capacity.check_workspace_capacity([SimpleNamespace(name="user_1")], "user_2", 0)
    capacity.check_workspace_capacity([], "user_2", 1)
