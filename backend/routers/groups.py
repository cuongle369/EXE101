from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import Group, Member, generate_invite_code
from schemas import GroupCreate, GroupJoin, GroupResponse, MemberCreate, MemberResponse

router = APIRouter(prefix="/api/groups", tags=["Groups"])


@router.post("", response_model=GroupResponse, status_code=201)
def create_group(data: GroupCreate, db: Session = Depends(get_db)):
    """Tạo nhóm mới với invite code tự động."""
    group = Group(
        name=data.name,
        invite_code=generate_invite_code(),
    )
    db.add(group)
    db.commit()
    db.refresh(group)

    return GroupResponse(
        id=group.id,
        name=group.name,
        invite_code=group.invite_code,
        created_at=group.created_at,
        member_count=0,
        task_count=0,
    )


@router.get("/{group_id}", response_model=GroupResponse)
def get_group(group_id: int, db: Session = Depends(get_db)):
    """Lấy thông tin nhóm theo ID."""
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Không tìm thấy nhóm")

    return GroupResponse(
        id=group.id,
        name=group.name,
        invite_code=group.invite_code,
        created_at=group.created_at,
        member_count=len(group.members),
        task_count=len(group.tasks),
    )


@router.post("/join", response_model=GroupResponse)
def join_group(data: GroupJoin, db: Session = Depends(get_db)):
    """Tham gia nhóm bằng invite code."""
    group = db.query(Group).filter(Group.invite_code == data.invite_code.upper()).first()
    if not group:
        raise HTTPException(status_code=404, detail="Mã mời không hợp lệ")

    return GroupResponse(
        id=group.id,
        name=group.name,
        invite_code=group.invite_code,
        created_at=group.created_at,
        member_count=len(group.members),
        task_count=len(group.tasks),
    )


# ====== Members ======

@router.get("/{group_id}/members", response_model=list[MemberResponse])
def list_members(group_id: int, db: Session = Depends(get_db)):
    """Danh sách thành viên trong nhóm."""
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Không tìm thấy nhóm")

    return group.members


@router.post("/{group_id}/members", response_model=MemberResponse, status_code=201)
def add_member(group_id: int, data: MemberCreate, db: Session = Depends(get_db)):
    """Thêm thành viên vào nhóm."""
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Không tìm thấy nhóm")

    # Check duplicate
    existing = (
        db.query(Member)
        .filter(Member.group_id == group_id, Member.name == data.name)
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="Thành viên đã tồn tại trong nhóm")

    member = Member(name=data.name, role=data.role, group_id=group_id)
    db.add(member)
    db.commit()
    db.refresh(member)
    return member


@router.delete("/{group_id}/members/{member_id}", status_code=204)
def remove_member(group_id: int, member_id: int, db: Session = Depends(get_db)):
    """Xóa thành viên khỏi nhóm."""
    member = db.query(Member).filter(Member.id == member_id, Member.group_id == group_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Không tìm thấy thành viên")

    db.delete(member)
    db.commit()
