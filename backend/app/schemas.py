from typing import Literal
from pydantic import BaseModel, ConfigDict, Field

Technique = Literal['zero-shot', 'few-shot', 'role-based', 'structured-output', 'step-by-step']

class StrictModel(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra='forbid')

class Prompt(StrictModel):
    title: str = Field(min_length=1, max_length=120)
    prompt_text: str = Field(min_length=1, max_length=20000)
    technique: Technique = 'zero-shot'
    category: str = Field(default='General', min_length=1, max_length=80)

class Template(StrictModel):
    title: str = Field(min_length=1, max_length=120)
    template_text: str = Field(min_length=1, max_length=20000)
    technique: Technique = 'zero-shot'
    category: str = Field(default='General', min_length=1, max_length=80)

class RunRequest(StrictModel):
    model_name: str = Field(min_length=1, max_length=120)
    input_text: str = Field(default='', max_length=20000)

class Rating(StrictModel):
    relevance_rating: int = Field(ge=1, le=5, strict=True)
    clarity_rating: int = Field(ge=1, le=5, strict=True)
    completeness_rating: int = Field(ge=1, le=5, strict=True)
    feedback_note: str = Field(default='', max_length=4000)
