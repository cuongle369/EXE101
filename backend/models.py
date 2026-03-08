import random
import string
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from database import Base


def generate_invite_code() -> str:
    """Generate a 6-character alphanumeric invite code."""
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=6))


class Group(Base):
    __tablename__ = "groups"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    invite_code = Column(String(6), unique=True, index=True, default=generate_invite_code)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    members = relationship("Member", back_populates="group", cascade="all, delete-orphan")
    tasks = relationship("Task", back_populates="group", cascade="all, delete-orphan")


class Member(Base):
    __tablename__ = "members"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    role = Column(String(20), default="member")  # "leader" | "member"
    group_id = Column(Integer, ForeignKey("groups.id"), nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    group = relationship("Group", back_populates="members")
    assignments = relationship("Assignment", back_populates="member", cascade="all, delete-orphan")


class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    quantity = Column(String(50), nullable=True)  # e.g. "50 tấn"
    quantity_number = Column(Float, nullable=True)  # e.g. 50.0
    unit = Column(String(30), nullable=True)  # e.g. "tấn"
    deadline = Column(String(100), nullable=True)  # Free-form text
    priority = Column(String(20), default="medium")  # "high" | "medium" | "low"
    status = Column(String(20), default="pending")  # pending, progress, done
    group_id = Column(Integer, ForeignKey("groups.id"), nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    group = relationship("Group", back_populates="tasks")
    assignments = relationship("Assignment", back_populates="task", cascade="all, delete-orphan")


class Assignment(Base):
    __tablename__ = "assignments"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=False)
    member_id = Column(Integer, ForeignKey("members.id"), nullable=False)
    assigned_amount = Column(String(50), nullable=False)  # e.g. "16.67 tấn"
    status = Column(String(20), default="pending")  # "pending" | "progress" | "done"
    updated_at = Column(DateTime, nullable=True)

    task = relationship("Task", back_populates="assignments")
    member = relationship("Member", back_populates="assignments")
