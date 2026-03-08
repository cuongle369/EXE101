from fastapi import APIRouter

from schemas import AIParseRequest, AIParseResponse
from services.ai_service import parse_task

router = APIRouter(prefix="/api/ai", tags=["AI"])


@router.post("/parse", response_model=AIParseResponse)
async def parse_natural_language(data: AIParseRequest):
    """
    Parse ngôn ngữ tự nhiên thành cấu trúc task.

    Sử dụng Gemini API nếu có key, fallback sang regex parser.
    """
    parsed, source = await parse_task(data.text, data.api_key)

    return AIParseResponse(
        title=parsed.get("title", ""),
        description=parsed.get("description"),
        quantity=parsed.get("quantity"),
        quantity_number=parsed.get("quantity_number"),
        unit=parsed.get("unit"),
        deadline=parsed.get("deadline"),
        priority=parsed.get("priority", "medium"),
        source=source,
        needs_clarification=parsed.get("needs_clarification", False),
    )
