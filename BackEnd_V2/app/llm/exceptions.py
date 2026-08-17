from app.core.exceptions import AppError


# Typed exception hierarchy for the LLM module.
# Why:
# - Lets higher layers catch `LLMError` for all LLM failures, or catch specific
#   subclasses to map errors to precise HTTP status codes/messages.
# - Keeps provider-specific failures normalized behind app-level exception types.
class LLMError(AppError):
    """Base exception for all LLM module failures."""

    status_code = 500
    detail = "LLM operation failed."


class LLMConfigurationError(LLMError):
    """Raised when LLM module configuration is invalid or unsupported."""
    status_code = 500
    detail = "LLM module is misconfigured or unsupported."


class LLMProviderError(LLMError):
    """Raised when provider communication fails."""


class LLMRequestError(LLMError):
    """Raised when a provider response cannot satisfy request expectations."""
    status_code = 502
    detail = "LLM provider failed to process the request."


class LLMHealthCheckError(LLMError):
    """Raised when provider health checks fail."""


class LLMUnknownToolError(LLMError):
    """Raised when the LLM requests a tool that is not registered."""
    status_code = 400
    detail = "Requested tool is not available."
