from app.llm.models import ModelCost, TokenCostBreakdown
from app.llm.enums import OllamaModel, OpenAIModel, GeminiModel, ClaudeModel

ModelKey = OllamaModel | OpenAIModel | GeminiModel | ClaudeModel

# Approximate INR / 1K text tokens.
# Actual Google pricing varies by context size and model revision.
MODEL_COSTS: dict[ModelKey, ModelCost] = {
    # Ollama
    OllamaModel.QWEN3_4B: ModelCost(0.0, 0.0),
    OllamaModel.QWEN3_8B: ModelCost(0.0, 0.0),
    OllamaModel.QWEN3_14B: ModelCost(0.0, 0.0),
    OllamaModel.QWEN3_30B: ModelCost(0.0, 0.0),
    OllamaModel.GEMMA3_1B: ModelCost(0.0, 0.0),
    OllamaModel.GEMMA3_4B: ModelCost(0.0, 0.0),
    OllamaModel.GEMMA3_12B: ModelCost(0.0, 0.0),
    OllamaModel.GEMMA3_27B: ModelCost(0.0, 0.0),
    OllamaModel.LLAMA3_2_1B: ModelCost(0.0, 0.0),
    OllamaModel.LLAMA3_2_3B: ModelCost(0.0, 0.0),
    OllamaModel.DEEPSEEK_R1_7B: ModelCost(0.0, 0.0),
    OllamaModel.DEEPSEEK_R1_8B: ModelCost(0.0, 0.0),
    OllamaModel.MISTRAL_7B: ModelCost(0.0, 0.0),
    # OpenAI
    OpenAIModel.GPT_5: ModelCost(0.11, 0.88),
    OpenAIModel.GPT_5_MINI: ModelCost(0.022, 0.176),
    OpenAIModel.GPT_5_NANO: ModelCost(0.0044, 0.035),
    OpenAIModel.GPT_4_1: ModelCost(0.176, 0.704),
    OpenAIModel.GPT_4_1_MINI: ModelCost(0.035, 0.141),
    OpenAIModel.GPT_4_1_NANO: ModelCost(0.009, 0.035),
    OpenAIModel.O4_MINI: ModelCost(0.097, 0.387),
    # Gemini
    GeminiModel.GEMINI_3_6_FLASH: ModelCost(0.026, 0.21),
    GeminiModel.GEMINI_3_5_FLASH: ModelCost(0.026, 0.21),
    GeminiModel.GEMINI_3_5_FLASH_LITE: ModelCost(0.009, 0.07),
    GeminiModel.GEMINI_3_1_FLASH_LITE: ModelCost(0.009, 0.07),
    GeminiModel.GEMINI_2_5_PRO: ModelCost(0.11, 0.88),
    GeminiModel.GEMINI_2_5_FLASH: ModelCost(0.026, 0.21),
    GeminiModel.GEMINI_2_5_FLASH_LITE: ModelCost(0.009, 0.07),
    GeminiModel.GEMINI_FLASH_LATEST: ModelCost(0.026, 0.21),
    GeminiModel.GEMINI_PRO_LATEST: ModelCost(0.11, 0.88),
    # Claude
    ClaudeModel.CLAUDE_FABLE_5: ModelCost(None, None),
    ClaudeModel.CLAUDE_OPUS_5: ModelCost(1.32, 6.60),
    ClaudeModel.CLAUDE_SONNET_5: ModelCost(0.264, 1.32),
    ClaudeModel.CLAUDE_OPUS_4_8: ModelCost(1.32, 6.60),
    ClaudeModel.CLAUDE_OPUS_4_7: ModelCost(1.32, 6.60),
    ClaudeModel.CLAUDE_OPUS_4_6: ModelCost(1.32, 6.60),
    ClaudeModel.CLAUDE_OPUS_4_5: ModelCost(1.32, 6.60),
    ClaudeModel.CLAUDE_OPUS_4_1: ModelCost(1.32, 6.60),
    ClaudeModel.CLAUDE_OPUS_4: ModelCost(1.32, 6.60),
    ClaudeModel.CLAUDE_SONNET_4_6: ModelCost(0.264, 1.32),
    ClaudeModel.CLAUDE_SONNET_4_5: ModelCost(0.264, 1.32),
    ClaudeModel.CLAUDE_SONNET_4_1: ModelCost(0.264, 1.32),
    ClaudeModel.CLAUDE_SONNET_4: ModelCost(0.264, 1.32),
    ClaudeModel.CLAUDE_HAIKU_4_5: ModelCost(0.07, 0.35),
    ClaudeModel.CLAUDE_SONNET_3_7: ModelCost(0.264, 1.32),
    ClaudeModel.CLAUDE_SONNET_3_5: ModelCost(0.264, 1.32),
    ClaudeModel.CLAUDE_HAIKU_3_5: ModelCost(0.07, 0.35),
    ClaudeModel.CLAUDE_OPUS_3: ModelCost(1.32, 6.60),
    ClaudeModel.CLAUDE_SONNET_3: ModelCost(0.264, 1.32),
    ClaudeModel.CLAUDE_HAIKU_3: ModelCost(0.022, 0.11),
}


def get_model_cost(model_key: ModelKey) -> ModelCost:
    if model_key is None:
        raise ValueError("model_key is required.")

    model_cost = MODEL_COSTS.get(model_key)
    if model_cost is None:
        raise ValueError(f"Unsupported model key: {model_key}")

    return model_cost


def calculate_token_cost(
    model_key: ModelKey,
    input_tokens: int,
    output_tokens: int,
) -> TokenCostBreakdown:
    if input_tokens < 0:
        raise ValueError("input_tokens must be greater than or equal to 0.")

    if output_tokens < 0:
        raise ValueError("output_tokens must be greater than or equal to 0.")

    model_cost = get_model_cost(model_key)

    input_token_cost = 0
    if model_cost.input_token_cost is not None:
        input_token_cost = (input_tokens / 1000) * model_cost.input_token_cost

    output_token_cost = 0
    if model_cost.output_token_cost is not None:
        output_token_cost = (output_tokens / 1000) * model_cost.output_token_cost

    total_cost = input_token_cost + output_token_cost

    return TokenCostBreakdown(
        input_token_cost=input_token_cost,
        output_token_cost=output_token_cost,
        total_cost=total_cost,
    )
