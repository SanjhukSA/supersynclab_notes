"""
Pydantic schemas for high-yield cheat sheets and active-recall quizzes.
"""

from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class CheatSheetResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    note_id: UUID | None = None
    title: str
    subject: str
    markdown: str
    source_note_titles: list[str] = Field(default_factory=list)


class QuizQuestion(BaseModel):
    question: str
    options: list[str] = Field(..., min_length=2, max_length=6)
    correct_index: int
    explanation: str
    page_reference: int | None = None
    source_note_title: str | None = None


class QuizResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    note_id: UUID | None = None
    note_title: str
    questions: list[QuizQuestion]
    source_note_titles: list[str] = Field(default_factory=list)


class SynthesisRequest(BaseModel):
    note_ids: list[UUID] | None = None
    folder_id: UUID | None = None
    title: str | None = None
