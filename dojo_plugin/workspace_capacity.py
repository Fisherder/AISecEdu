class WorkspaceCapacityError(RuntimeError):
    pass


def check_workspace_capacity(containers, current_name, limit):
    if limit <= 0:
        return
    occupied = sum(container.name != current_name for container in containers)
    if occupied >= limit:
        raise WorkspaceCapacityError("演示环境正在使用中，请等待其他使用者停止实验后重试；已保存的作答不会丢失。")
