import json
import os
import re
from typing import Optional

import httpx


async def parse_with_gemini(text: str, api_key: Optional[str] = None) -> dict:
    """Parse natural language task using Google Gemini API."""
    key = api_key or os.getenv("GEMINI_API_KEY", "")
    if not key:
        raise ValueError("No Gemini API key provided")

    prompt = (
        "Bạn là AI hỗ trợ người dùng tạo công việc. Phân tích câu sau và xuất ra JSON (chỉ JSON, không có code block wrapper).\n"
        "Luật đặc biệt: Khi người dùng giao một công việc LỚN cần quản lý THỜI GIAN/KHỐI LƯỢNG cụ thể (như báo cáo, thu hoạch định ngạch, tính bằng deadline quan trọng) mà KHÔNG HỀ đề cập tới 'hạn chót' (deadline) hoặc 'khối lượng/số lượng' (quantity).\n"
        "-> Trả về JSON với `\"needs_clarification\": true`, báo cho họ biết những thông số quan trọng còn thiếu thông qua trường `\"description\"` (VD: 'Bạn chưa cho thời gian hoàn thành hoặc số lượng công việc'). Để mặc định danh sách tham số khác là `null` hoặc chuỗi rỗng.\n"
        "-> Ngược lại (nếu có đủ, hoặc task nhỏ bình thường thì không cần khắt khe), trả về `\"needs_clarification\": false`.\n\n"
        "Cũng hãy xác định mức độ ưu tiên (priority) dựa trên ngữ cảnh: 'high' nếu gấp/quan trọng, 'low' nếu không quan trọng, 'medium' mặc định.\n\n"
        "{\n"
        '  "title": "tiêu đề ngắn gọn của công việc",\n'
        '  "quantity": "khối lượng/số lượng (VD: 50 tấn, 200 bao). Nếu thiếu thì trả về null",\n'
        '  "quantity_number": số (VD: 50, 200). Nếu thiếu thì trả về null,\n'
        '  "unit": "đơn vị (VD: tấn, bao). Nếu thiếu thì trả về null",\n'
        '  "deadline": "hạn chót (VD: ngày 30, thứ 6). Nếu thiếu thì trả về null",\n'
        '  "priority": "high hoặc medium hoặc low",\n'
        '  "description": "gợi ý, hoặc lời nhắn báo lại cho user (dùng khi needs_clarification=true)",\n'
        '  "needs_clarification": true hoặc false\n'
        "}\n\n"
        f'Câu của người dùng: "{text}"'
    )

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={key}"

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            url,
            json={
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {"temperature": 0.1},
            },
        )
        resp.raise_for_status()

    data = resp.json()
    response_text = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")

    # Extract JSON from response
    json_match = re.search(r"\{[\s\S]*\}", response_text)
    if not json_match:
        raise ValueError("Could not parse JSON from Gemini response")

    return json.loads(json_match.group())


def parse_with_regex(text: str) -> dict:
    """Fallback parser using regex patterns for Vietnamese task descriptions."""
    result = {
        "title": "",
        "quantity": None,
        "quantity_number": None,
        "unit": None,
        "deadline": None,
        "priority": "medium",
        "description": text,
    }

    # Extract quantity: "50 tấn", "200 bao", etc.
    qty_pattern = (
        r"(\d+[\.,]?\d*)\s*"
        r"(tấn|kg|bao|thùng|kiện|khu vực|cái|hộp|lô|pallet|container"
        r"|mét|m2|m3|lít|chai|lon|gói|bịch|chiếc|đơn hàng|đơn|suất|phần)"
    )
    qty_match = re.search(qty_pattern, text, re.IGNORECASE)
    if qty_match:
        result["quantity_number"] = float(qty_match.group(1).replace(",", "."))
        result["unit"] = qty_match.group(2)
        result["quantity"] = f"{qty_match.group(1)} {qty_match.group(2)}"

    # Extract deadline
    deadline_patterns = [
        r"trước\s+ngày\s+(\d{1,2}(?:\s*(?:tháng|th|\/)\s*\d{1,2})?)",
        r"hạn\s+(?:chót\s+)?(?:là\s+)?(?:ngày\s+)?(\d{1,2}(?:\s*(?:tháng|th|\/)\s*\d{1,2})?)",
        r"deadline\s*:?\s*(.+?)(?:\.|$)",
        r"(thứ\s+\d|thứ\s+hai|thứ\s+ba|thứ\s+tư|thứ\s+năm|thứ\s+sáu|thứ\s+bảy|chủ\s+nhật)",
        r"(?:trước|trong)\s+(cuối\s+tuần|cuối\s+tháng|hôm\s+nay|ngày\s+mai)",
    ]
    for pat in deadline_patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            result["deadline"] = m.group(1).strip()
            break

    # Detect priority from keywords
    if re.search(r"(gấp|khẩn|ưu tiên cao|quan trọng|ngay lập tức|cấp bách)", text, re.IGNORECASE):
        result["priority"] = "high"
    elif re.search(r"(không gấp|thong thả|khi nào rảnh|ưu tiên thấp)", text, re.IGNORECASE):
        result["priority"] = "low"

    # Generate title: remove deadline parts, trim
    title = text
    title = re.sub(r",?\s*trước\s+ngày.*", "", title, flags=re.IGNORECASE)
    title = re.sub(r",?\s*hạn\s+chót.*", "", title, flags=re.IGNORECASE)
    title = re.sub(r",?\s*deadline.*", "", title, flags=re.IGNORECASE)
    title = title.strip()
    if len(title) > 60:
        title = title[:60] + "..."
    result["title"] = title or text[:50]

    # Smart clarification logic:
    # - Has quantity but no deadline → ask for deadline (important for tracking)
    # - Has neither → ask for both
    # - Has deadline (with or without quantity) → pass through
    if not result["deadline"] and result["quantity_number"]:
        result["needs_clarification"] = True
        result["description"] = f"Bạn muốn '{result['title']}' hoàn thành trước khi nào? Hãy cho mình biết hạn chót nhé! (VD: trước ngày 30)"
    elif not result["deadline"] and not result["quantity_number"]:
        result["needs_clarification"] = True
        result["description"] = "Bạn chưa cung cấp Thời hạn (deadline) hoặc Khối lượng công việc. Hãy bổ sung thêm nhé!"
    else:
        result["needs_clarification"] = False

    return result


async def parse_task(text: str, api_key: str | None = None) -> tuple[dict, str]:
    """
    Parse task text, trying Gemini first then falling back to regex.
    Returns (parsed_data, source) where source is 'gemini' or 'regex'.
    """
    # Try Gemini first
    effective_key = api_key or os.getenv("GEMINI_API_KEY", "")
    if effective_key:
        try:
            result = await parse_with_gemini(text, effective_key)
            return result, "gemini"
        except Exception:
            pass  # Fall through to regex

    # Fallback to regex
    result = parse_with_regex(text)
    return result, "regex"
