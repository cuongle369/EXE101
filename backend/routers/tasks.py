from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import Assignment, Group, Member, Task
from schemas import (
    AssignmentResponse,
    AssignmentStatusUpdate,
    DashboardStats,
    DistributionItem,
    MemberPerformance,
    MyTaskItem,
    TaskCreate,
    TaskCreateWithDistribution,
    TaskResponse,
    TaskStatusUpdate,
    TaskUpdate,
)
from services.distribution import distribute_workload

router = APIRouter(tags=["Tasks"])


def _build_task_response(task: Task) -> TaskResponse:
    """Build TaskResponse including assignment details."""
    assignments = []
    for a in task.assignments:
        assignments.append(
            AssignmentResponse(
                id=a.id,
                member_id=a.member_id,
                member_name=a.member.name if a.member else "",
                assigned_amount=a.assigned_amount,
                status=a.status,
            )
        )
    return TaskResponse(
        id=task.id,
        title=task.title,
        description=task.description,
        quantity=task.quantity,
        quantity_number=task.quantity_number,
        unit=task.unit,
        deadline=task.deadline,
        priority=task.priority,
        status=task.status,
        group_id=task.group_id,
        created_at=task.created_at,
        assignments=assignments,
    )


# ====== Task CRUD ======

@router.get("/api/groups/{group_id}/tasks", response_model=list[TaskResponse])
def list_tasks(group_id: int, db: Session = Depends(get_db)):
    """Danh sách task của nhóm (mới nhất trước)."""
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Không tìm thấy nhóm")

    tasks = (
        db.query(Task)
        .filter(Task.group_id == group_id)
        .order_by(Task.created_at.desc())
        .all()
    )
    return [_build_task_response(t) for t in tasks]


@router.post(
    "/api/groups/{group_id}/tasks",
    response_model=TaskCreateWithDistribution,
    status_code=201,
)
def create_task(group_id: int, data: TaskCreate, db: Session = Depends(get_db)):
    """Tạo task mới và tự động phân bổ cho thành viên trong nhóm."""
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Không tìm thấy nhóm")

    # Create task
    task = Task(
        title=data.title,
        description=data.description,
        quantity=data.quantity,
        quantity_number=data.quantity_number,
        unit=data.unit,
        deadline=data.deadline,
        priority=data.priority,
        group_id=group_id,
    )
    db.add(task)
    db.flush()  # Get task.id

    # Auto-distribute workload
    members = group.members
    dist_results = distribute_workload(members, data.quantity_number, data.unit)

    distribution_items = []
    for dist in dist_results:
        assignment = Assignment(
            task_id=task.id,
            member_id=dist["member_id"],
            assigned_amount=dist["assigned_amount"],
        )
        db.add(assignment)
        distribution_items.append(
            DistributionItem(
                member_id=dist["member_id"],
                member_name=dist["member_name"],
                assigned_amount=dist["assigned_amount"],
            )
        )

    db.commit()
    db.refresh(task)

    return TaskCreateWithDistribution(
        task=_build_task_response(task),
        distribution=distribution_items,
    )


@router.get("/api/tasks/{task_id}", response_model=TaskResponse)
def get_task(task_id: int, db: Session = Depends(get_db)):
    """Chi tiết task với danh sách phân bổ."""
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Không tìm thấy task")

    return _build_task_response(task)


@router.patch("/api/tasks/{task_id}/status", response_model=TaskResponse)
def update_task_status(task_id: int, data: TaskStatusUpdate, db: Session = Depends(get_db)):
    """Cập nhật trạng thái task (pending / progress / done)."""
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Không tìm thấy task")

    task.status = data.status
    db.commit()
    db.refresh(task)
    return _build_task_response(task)


@router.api_route("/api/tasks/{task_id}", methods=["PATCH", "PUT"], response_model=TaskResponse)
def update_task(task_id: int, data: TaskUpdate, db: Session = Depends(get_db)):
    """Chỉnh sửa thông tin task (chỉ leader mới dùng)."""
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Không tìm thấy task")

    update_data = data.model_dump(exclude_unset=True)
    member_ids = update_data.pop("member_ids", None)

    for field, value in update_data.items():
        if value is not None:
            setattr(task, field, value)

    # Sync assignments if member_ids is provided
    if member_ids is not None:
        current_assignments = {a.member_id: a for a in task.assignments}
        new_ids = set(member_ids)
        
        # Remove unselected members
        for member_id, assignment in current_assignments.items():
            if member_id not in new_ids:
                db.delete(assignment)
                
        # Add new members
        for member_id in new_ids:
            if member_id not in current_assignments:
                new_assign = Assignment(
                    task_id=task.id,
                    member_id=member_id,
                    assigned_amount="Phần việc được giao",
                    status="pending"
                )
                db.add(new_assign)
                
        db.commit()
        db.refresh(task)
        
        # Redistribute workload if task has quantity
        if task.quantity_number and len(task.assignments) > 0:
            per_person = task.quantity_number / len(task.assignments)
            rounded = round(per_person, 2)
            unit_str = task.unit or ""
            amount_str = f"{rounded} {unit_str}".strip()
            
            for a in task.assignments:
                a.assigned_amount = amount_str
            db.commit()

    db.commit()
    db.refresh(task)
    return _build_task_response(task)


@router.delete("/api/tasks/{task_id}", status_code=204)
def delete_task(task_id: int, db: Session = Depends(get_db)):
    """Xóa task."""
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Không tìm thấy task")

    db.delete(task)
    db.commit()


# ====== Assignment Status ======

@router.patch("/api/assignments/{assignment_id}/status", response_model=AssignmentResponse)
def update_assignment_status(
    assignment_id: int,
    data: AssignmentStatusUpdate,
    db: Session = Depends(get_db),
):
    """Cập nhật trạng thái phần việc cá nhân (member tự báo tiến độ)."""
    assignment = db.query(Assignment).filter(Assignment.id == assignment_id).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Không tìm thấy phần việc")

    assignment.status = data.status
    assignment.updated_at = datetime.now(timezone.utc)
    db.commit()

    # Auto-update parent task status based on all assignments
    task = assignment.task
    if task and task.assignments:
        all_a = task.assignments
        done_count = sum(1 for a in all_a if a.status == "done")
        prog_count = sum(1 for a in all_a if a.status == "progress")
        if done_count == len(all_a):
            task.status = "done"
        elif done_count > 0 or prog_count > 0:
            task.status = "progress"
        else:
            task.status = "pending"
        db.commit()

    db.refresh(assignment)

    return AssignmentResponse(
        id=assignment.id,
        member_id=assignment.member_id,
        member_name=assignment.member.name if assignment.member else "",
        assigned_amount=assignment.assigned_amount,
        status=assignment.status,
    )


# ====== Dashboard (Leader View) ======

@router.get("/api/groups/{group_id}/dashboard", response_model=DashboardStats)
def get_dashboard(group_id: int, db: Session = Depends(get_db)):
    """Dashboard tổng quan cho Trưởng nhóm."""
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Không tìm thấy nhóm")

    tasks = db.query(Task).filter(Task.group_id == group_id).all()
    total = len(tasks)
    completed = sum(1 for t in tasks if t.status == "done")
    in_progress = sum(1 for t in tasks if t.status == "progress")
    pending = sum(1 for t in tasks if t.status == "pending")
    
    # Calculate progress ring percentage based on granular assignments
    all_assignments = [a for t in tasks for a in t.assignments]
    if all_assignments:
        done_assignments = sum(1 for a in all_assignments if a.status == "done")
        completion_pct = (done_assignments / len(all_assignments)) * 100
    else:
        completion_pct = (completed / total * 100) if total > 0 else 0.0

    # Member performance
    member_perfs = []
    for member in group.members:
        total_a = len(member.assignments)
        done_a = sum(1 for a in member.assignments if a.status == "done")
        perf_pct = (done_a / total_a * 100) if total_a > 0 else 0.0
        member_perfs.append(
            MemberPerformance(
                id=member.id,
                name=member.name,
                role=member.role,
                completed_assignments=done_a,
                total_assignments=total_a,
                performance_percent=round(perf_pct, 1),
            )
        )

    return DashboardStats(
        group_name=group.name,
        invite_code=group.invite_code,
        total_tasks=total,
        in_progress=in_progress,
        completed=completed,
        pending=pending,
        completion_percent=round(completion_pct, 1),
        members=member_perfs,
        tasks=[_build_task_response(t) for t in tasks],
    )


# ====== My Tasks (Member View) ======

@router.get(
    "/api/groups/{group_id}/members/{member_id}/tasks",
    response_model=list[MyTaskItem],
)
def get_member_tasks(group_id: int, member_id: int, db: Session = Depends(get_db)):
    """Danh sách phần việc được giao cho 1 member cụ thể."""
    member = db.query(Member).filter(
        Member.id == member_id, Member.group_id == group_id
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="Không tìm thấy thành viên")

    items = []
    for assignment in member.assignments:
        task = assignment.task
        items.append(
            MyTaskItem(
                assignment_id=assignment.id,
                task_id=task.id,
                task_title=task.title,
                task_description=task.description,
                assigned_amount=assignment.assigned_amount,
                assignment_status=assignment.status,
                task_status=task.status,
                deadline=task.deadline,
                priority=task.priority,
            )
        )

    return items
