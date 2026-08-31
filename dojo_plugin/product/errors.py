from .contracts import error_envelope


class ProductError(Exception):
    def __init__(
        self,
        code,
        message,
        *,
        status=400,
        field_errors=None,
        retryable=False,
        recovery=None,
    ):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status
        self.field_errors = field_errors or []
        self.retryable = retryable
        self.recovery = recovery

    def as_envelope(self, request_id=None):
        return error_envelope(
            self.code,
            self.message,
            request_id=request_id,
            status=self.status,
            field_errors=self.field_errors,
            retryable=self.retryable,
            recovery=self.recovery,
        )
