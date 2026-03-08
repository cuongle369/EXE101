from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


# ====== Group Schemas ======
class GroupCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, examples=["Đội Thu Hoạch A"])


class GroupJoin(BaseModel):
    invite_code: str = Field(..., min_length=6, max_length=6, examples=["HV9921"])


class GroupResponse(BaseModel):
    id: int
    name: str
    invite_code: str
    created_at: datetime
    member_count: int = 0
    task_count: int = 0

    model_config = {"from_attributes": True}


# ====== Member Schemas ======
class MemberCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, examples=["Nguyễn Văn A"])
    role: str = Field(default="member", pattern="^(leader|member)$")


class MemberResponse(BaseModel):
    id: int
    name: str
    role: str
    group_id: int
    created_at: datetime

    model_config = {"from_attributes": True}


# ====== Assignment Schemas ======
class AssignmentResponse(BaseModel):
    id: int
    member_id: int
    member_name: str = ""
    assigned_amount: str
    status: str = "pending"

    model_config = {"from_attributes": True}


class AssignmentStatusUpdate(BaseModel):
    status: str = Field(..., pattern="^(pending|progress|done)$")


# ====== Task Schemas ======
class TaskCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    quantity: Optional[str] = None
    quantity_number: Optional[float] = None
    unit: Optional[str] = None
    deadline: Optional[str] = None
    priority: str = Field(default="medium", pattern="^(high|medium|low)$")


class TaskStatusUpdate(BaseModel):
    status: str = Field(..., pattern="^(pending|progress|done)$")


class TaskUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    quantity: Optional[str] = None
    quantity_number: Optional[float] = None
    unit: Optional[str] = None
    deadline: Optional[str] = None
    priority: Optional[str] = Field(None, pattern="^(high|medium|low)$")
    member_ids: Optional[list[int]] = None


class TaskResponse(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    quantity: Optional[str] = None
    quantity_number: Optional[float] = None
    unit: Optional[str] = None
    deadline: Optional[str] = None
    priority: str = "medium"
    status: str
    group_id: int
    created_at: datetime
    assignments: list[AssignmentResponse] = []

    model_config = {"from_attributes": True}


# ====== AI Schemas ======
class AIParseRequest(BaseModel):
    text: str = Field(..., min_length=1, examples=["Thu hoạch 50 tấn cà phê trước ngày 30"])
    api_key: Optional[str] = Field(None, description="Gemini API key (optional, uses env var if not provided)")


class AIParseResponse(BaseModel):
    title: str = ""
    description: Optional[str] = None
    quantity: Optional[str] = None
    quantity_number: Optional[float] = None
    unit: Optional[str] = None
    deadline: Optional[str] = None
    priority: str = "medium"
    source: str = Field(default="regex", description="'gemini' or 'regex'")
    needs_clarification: bool = False


# ====== Distribution Schemas ======
class DistributionItem(BaseModel):
    member_id: int
    member_name: str
    assigned_amount: str


class TaskCreateWithDistribution(BaseModel):
    """Response after creating a task with auto-distribution."""
    task: TaskResponse
    distribution: list[DistributionItem]


# ====== Dashboard Schemas ======
class MemberPerformance(BaseModel):
    id: int
    name: str
    role: str
    completed_assignments: int = 0
    total_assignments: int = 0
    performance_percent: float = 0.0


class DashboardStats(BaseModel):
    group_name: str
    invite_code: str
    total_tasks: int
    in_progress: int
    completed: int
    pending: int
    completion_percent: float
    members: list[MemberPerformance]
    tasks: list[TaskResponse]


# ====== My Tasks (Member View) ======
class MyTaskItem(BaseModel):
    assignment_id: int
    task_id: int
    task_title: str
    task_description: Optional[str] = None
    assigned_amount: str
    assignment_status: str  # status of this member's assignment
    task_status: str  # overall task status
    deadline: Optional[str] = None
    priority: str = "medium"
