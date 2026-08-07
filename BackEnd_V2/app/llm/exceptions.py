# Typed exception hierarchy for the LLM module.
# Why:
# - Lets higher layers catch `LLMError` for all LLM failures, or catch specific
#   subclasses to map errors to precise HTTP status codes/messages.
# - Keeps provider-specific failures normalized behind app-level exception types.
class LLMError(Exception):
    """Base exception for all LLM module failures."""


class LLMConfigurationError(LLMError):
    """Raised when LLM module configuration is invalid or unsupported."""


class LLMProviderError(LLMError):
    """Raised when provider communication fails."""


class LLMRequestError(LLMError):
    """Raised when a provider response cannot satisfy request expectations."""


class LLMHealthCheckError(LLMError):
    """Raised when provider health checks fail."""
