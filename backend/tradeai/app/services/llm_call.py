import requests
from typing import Optional, Dict, Any
from app.secrets import get_secret


# ----------------------------
# Unified LLM caller
# ----------------------------

def call_llm(
    *,
    provider: str,            # "openai" | "becko" | "openrouter"
    model: str,
    prompt: str,
    system_prompt: Optional[str] = None,
    temperature: float = 0.2,
    max_tokens: int = 512,
) -> Dict[str, Any]:

    if provider == "openai":
        return _call_openai(
            model, prompt, system_prompt, temperature, max_tokens
        )

    if provider == "becko":
        return _call_becko(
            model, prompt, system_prompt, temperature, max_tokens
        )

    if provider == "openrouter":
        return _call_openrouter(
           model, prompt, system_prompt, temperature, max_tokens
        )

    raise ValueError(f"Unknown provider: {provider}")


# ----------------------------
# OpenAI
# ----------------------------

def _call_openai(
    model: str,
    prompt: str,
    system_prompt: Optional[str],
    temperature: float,
    max_tokens: int,
) -> Dict[str, Any]:
    from openai import OpenAI

    api_key = get_secret("OPENAI_API_KEY")
    client = OpenAI(api_key=api_key)

    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": prompt})

    resp = client.chat.completions.create(
        model=model,
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens,
    )

    return {
        "provider": "openai",
        "model": model,
        "text": resp.choices[0].message.content,
    }


# ----------------------------
# Becko
# ----------------------------

def _call_becko(
    model: str,
    prompt: str,
    system_prompt: Optional[str],
    temperature: float,
    max_tokens: int,
) -> Dict[str, Any]:

    api_key = get_secret("BECKO_API_KEY")
    api_url = get_secret("BECKO_API_URL")

    payload = {
        "model": model,
        "prompt": prompt,
        "system": system_prompt,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    resp = requests.post(api_url, json=payload, headers=headers, timeout=30)
    resp.raise_for_status()
    data = resp.json()

    return {
        "provider": "becko",
        "model": model,
        "text": data.get("output"),
    }


# ----------------------------
# OpenRouter
# ----------------------------

def _call_openrouter(
    model: str,
    prompt: str,
    system_prompt: Optional[str],
    temperature: float,
    max_tokens: int,
) -> Dict[str, Any]:

    api_key = get_secret("OPENROUTER_API_KEY")

    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": prompt})

    payload = {
        "model": model,  # e.g. "openai/gpt-4o-mini", "anthropic/claude-3.5-sonnet"
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        # optional but recommended by OpenRouter
        "HTTP-Referer": "https://your-domain.com",
        "X-Title": "Trade Compliance AI",
    }

    resp = requests.post(
        "https://openrouter.ai/api/v1/chat/completions",
        json=payload,
        headers=headers,
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()

    return {
        "provider": "openrouter",
        "model": model,
        "text": data["choices"][0]["message"]["content"],
    }


# ----------------------------
# Example usage
# ----------------------------

if __name__ == "__main__":
    result = call_llm(
        provider="openrouter",
        model="mistralai/mistral-7b-instruct",
        prompt="Classify live horses under HTS.",
        temperature=0.1,
        )

    print(result["text"])
