"""An explicit offline simulator and a configurable Chat Completions adapter."""
import json
import os
import httpx
from fastapi import HTTPException

TECHNIQUES = {
    'zero-shot': 'Complete the task directly and clearly.',
    'few-shot': 'Use any input/output examples provided in the task to infer the requested pattern. If no examples are provided, state that limitation and complete the task directly.',
    'role-based': 'Adopt the role specified in the task. If none is given, act as a helpful subject-matter assistant.',
    'structured-output': 'Return valid JSON only, with the keys answer (string) and key_points (array of strings).',
    'step-by-step': 'Give a concise, numbered procedure or explanation that a user can follow. Provide useful steps without private internal reasoning.',
}

def models():
    configured = [m.strip() for m in (os.getenv('LLM_MODELS') or os.getenv('LLM_MODEL', '')).split(',') if m.strip()]
    if not os.getenv('LLM_API_KEY'):
        configured = []
    return ['demo-local'] + [m for m in configured if m != 'demo-local']

def render(prompt, input_text):
    return f"{TECHNIQUES[prompt['technique']]}\n\nTask:\n{prompt['prompt_text']}" + (f'\n\nContext / input:\n{input_text}' if input_text else '')

async def generate(prompt, model_name, input_text):
    if model_name not in models():
        raise HTTPException(422, 'Choose an available model. Configure LLM_API_KEY and LLM_MODEL on the server for live AI.')
    rendered = render(prompt, input_text)
    if model_name == 'demo-local':
        answer = ('DEMO SIMULATION — no AI model was called.\n\n'
                  f"Task received: {prompt['prompt_text']}\n\n"
                  f"Technique: {prompt['technique']}.\n"
                  'This deterministic preview verifies saving, history, comparison and ratings. '
                  'Select a configured live model to generate an actual answer.' +
                  (f'\n\nContext received: {input_text}' if input_text else ''))
        if prompt['technique'] == 'structured-output':
            answer = json.dumps({'answer': answer, 'key_points': ['Offline simulation', 'No model inference']}, indent=2)
        return answer, rendered, True
    base = os.getenv('LLM_BASE_URL', 'https://api.openai.com/v1').rstrip('/')
    try:
        async with httpx.AsyncClient(timeout=60, follow_redirects=False) as client:
            response = await client.post(base + '/chat/completions', headers={
                'Authorization': 'Bearer ' + os.environ['LLM_API_KEY']
            }, json={'model': model_name, 'messages': [{'role': 'user', 'content': rendered}]})
        if response.status_code == 429:
            raise HTTPException(429, 'The model provider is rate limiting requests or its quota is exhausted. Try again later.')
        if response.status_code in (401, 403):
            raise HTTPException(502, 'The model provider rejected server credentials. Check the backend API key and model access.')
        if response.is_error:
            raise HTTPException(502, 'The model provider could not complete this request. Check its model configuration and availability.')
        answer = response.json()['choices'][0]['message']['content']
        if not isinstance(answer, str) or not answer.strip():
            raise ValueError('Empty content')
        return answer, rendered, False
    except httpx.TimeoutException:
        raise HTTPException(504, 'The model provider timed out. Try again.') from None
    except httpx.RequestError:
        raise HTTPException(502, 'Could not connect to the model provider.') from None
    except (ValueError, KeyError, IndexError, TypeError):
        raise HTTPException(502, 'The model provider returned an unsupported or empty response.') from None
